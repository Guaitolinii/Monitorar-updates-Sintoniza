import { writeFileSync } from 'node:fs';

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const GITHUB_TOKEN = process.env.GIST_TOKEN;
const GIST_ID = process.env.GIST_ID;
const NOME_ARQUIVO = 'filmes_listalegendados.m3u'; // lista legada: conteúdo mantido como está
const NOME_ARQUIVO_NOVO = 'filmes_legendados_sintoniza.m3u'; // lista nova (streams diretos)
const NOME_ARQUIVO_CACHE = 'sintoniza_probe.json'; // cache de sondagens de formato
const PROXY_URL = (process.env.PROXY_URL || '').replace(/\/+$/, '');
const QUANTIDADE_PAGINAS = 100; // 100 páginas x 20 filmes = 2.000 filmes populares
const CONCORRENCIA = 8;
const PROBE_TTL_MS = 25 * 24 * 60 * 60 * 1000; // re-sonda títulos com mais de 25 dias

const CABECALHOS_API = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  'Origin': 'https://vidlink.pro',
  'Referer': 'https://vidlink.pro/',
  'Accept': 'application/json,*/*'
};

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function obterGeneros() {
  try {
    const res = await fetch(`https://api.themoviedb.org/3/genre/movie/list?api_key=${TMDB_API_KEY}&language=pt-BR`);
    const data = await res.json();
    const mapa = {};
    for (const g of data.genres || []) {
      mapa[g.id] = g.name;
    }
    return mapa;
  } catch (e) {
    return {};
  }
}

async function obterFilmes() {
  const hoje = new Date().toISOString().split('T')[0];
  console.log(`Buscando 2.000 filmes no TMDB (lançados até ${hoje})...`);
  const filmes = [];
  const idsAdicionados = new Set();

  for (let pagina = 1; pagina <= QUANTIDADE_PAGINAS; pagina++) {
    const url = new URL('https://api.themoviedb.org/3/discover/movie');
    url.search = new URLSearchParams({
      api_key: TMDB_API_KEY,
      language: 'pt-BR',
      sort_by: 'popularity.desc',
      include_adult: 'false',
      'primary_release_date.lte': hoje,
      'with_release_type': '4|5',
      'vote_count.gte': '50',
      page: String(pagina)
    }).toString();

    const res = await fetch(url);
    if (!res.ok) continue;

    const data = await res.json();
    for (const filme of data.results || []) {
      if (idsAdicionados.has(filme.id)) continue;
      idsAdicionados.add(filme.id);
      filmes.push(filme);
    }
  }

  console.log(`Total compilado: ${filmes.length} filmes.`);
  return { filmes, hoje };
}

// ── Lista legada (geração inalterada) ───────────────────────────────────────
function montarM3ULegado(filmes, mapaGeneros) {
  let conteudoM3u = '#EXTM3U\n\n';
  let total = 0;

  for (const filme of filmes) {
    const poster = filme.poster_path ? `https://image.tmdb.org/t/p/w500${filme.poster_path}` : '';
    const ano = filme.release_date ? ` (${filme.release_date.split('-')[0]})` : '';
    const titulo = `${filme.title}${ano}`;
    const generoId = filme.genre_ids?.[0];
    const categoria = generoId && mapaGeneros[generoId] ? mapaGeneros[generoId] : 'Filmes';
    const linkVidlink = `https://vidlink.pro/movie/${filme.id}`;

    conteudoM3u += `#EXTINF:-1 tvg-id="${filme.id}" tvg-name="${filme.title.replace(/"/g, '')}" tvg-logo="${poster}" group-title="${categoria}", ${titulo}\n`;
    conteudoM3u += `${linkVidlink}\n\n`;
    total++;
  }

  console.log(`Lista legada: ${total} entradas.`);
  return conteudoM3u;
}

// ── Sondagem de formato (decide a extensão do link .m3u8 ou .mp4) ───────────
async function sondarUmFilme(tmdbId) {
  const resEnc = await fetch(`https://enc-dec.app/api/enc-vidlink?text=${tmdbId}`, {
    headers: { 'User-Agent': CABECALHOS_API['User-Agent'] }
  });
  if (!resEnc.ok) throw new Error(`enc ${resEnc.status}`);
  const enc = await resEnc.json();
  if (!enc || !enc.result) throw new Error('enc sem resultado');

  const resApi = await fetch(`https://vidlink.pro/api/b/movie/${encodeURIComponent(enc.result)}?multiLang=1`, {
    headers: CABECALHOS_API
  });
  if (!resApi.ok) throw new Error(`api ${resApi.status}`);
  const data = await resApi.json();

  const stream = data && data.stream;
  if (!stream) throw new Error('sem stream');

  const temPlaylista = (Array.isArray(stream.playlists) && stream.playlists.length > 0)
    || (typeof stream.playlist === 'string' && stream.playlist.length > 0);
  if (temPlaylista) return 'm3u8';

  const temArquivo = (Array.isArray(stream.files) && stream.files.length > 0)
    || (stream.qualities && typeof stream.qualities === 'object' && !Array.isArray(stream.qualities) && Object.keys(stream.qualities).length > 0);
  if (temArquivo) return 'mp4';

  throw new Error('formato desconhecido');
}

async function sondarComRetry(tmdbId) {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      return await sondarUmFilme(tmdbId);
    } catch (e) {
      if (tentativa === 2) throw e;
      await dormir(1500 * (tentativa + 1) + Math.floor(Math.random() * 500));
    }
  }
  return null; // inacessível
}

function lerCacheProbe(json) {
  try {
    const obj = JSON.parse(json);
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) return obj;
  } catch (e) { /* cache corrompido: recomeça do zero */ }
  return {};
}

// Pool de concorrência simples: portas de busca, sem dependência externa
async function processarEmLote(itens, fn, concorrencia) {
  const resultados = new Array(itens.length);
  let indice = 0;
  async function porta() {
    while (indice < itens.length) {
      const meu = indice++;
      try {
        resultados[meu] = await fn(itens[meu]);
      } catch (e) {
        resultados[meu] = null;
      }
      await dormir(30 + Math.floor(Math.random() * 80)); // respiro anti-429
    }
  }
  const portas = [];
  for (let i = 0; i < concorrencia; i++) portas.push(porta());
  await Promise.all(portas);
  return resultados;
}

// ── Lista nova com player nativo (sem menção ao provedor no arquivo) ────────
async function montarM3UNovo(filmes, mapaGeneros) {
  const cacheBruto = await lerGistCache();
  const cache = lerCacheProbe(cacheBruto);
  const agora = Date.now();

  const faltam = [];
  for (const filme of filmes) {
    const e = cache[String(filme.id)];
    if (!e || !e.e || !e.t || agora - e.t > PROBE_TTL_MS) faltam.push(filme);
  }
  console.log(`Cache: ${filmes.length - faltam.length} reutilizados, ${faltam.length} a sondar.`);

  const sondagens = await processarEmLote(faltam, async (filme) => {
    try {
      const ext = await sondarComRetry(filme.id);
      return { filme, ext, erro: !ext };
    } catch {
      return { filme, ext: null, erro: true };
    }
  }, CONCORRENCIA);

  for (const s of sondagens) {
    if (!s) continue;
    cache[String(s.filme.id)] = {
      e: s.ext || 'mp4', // erro cai em .mp4 (formato dominante) e é re-sondado amanhã
      t: agora,
      ...(s.erro ? { r: 1 } : {})
    };
  }

  let conteudoM3u = '#EXTM3U\n\n';
  let total = 0;

  for (const filme of filmes) {
    const e = cache[String(filme.id)];
    if (!e) continue;
    const ext = e.e || 'mp4';
    const poster = filme.poster_path ? `https://image.tmdb.org/t/p/w500${filme.poster_path}` : '';
    const ano = filme.release_date ? ` (${filme.release_date.split('-')[0]})` : '';
    const titulo = `${filme.title}${ano}`;
    const generoId = filme.genre_ids?.[0];
    const categoria = generoId && mapaGeneros[generoId] ? mapaGeneros[generoId] : 'Filmes';

    conteudoM3u += `#EXTINF:-1 tvg-id="${filme.id}" tvg-name="${filme.title.replace(/"/g, '')}" tvg-logo="${poster}" group-title="${categoria}", ${titulo}\n`;
    conteudoM3u += `#EXTVLCOPT:sub-file=${PROXY_URL}/subtitles/${filme.id}.vtt\n`;
    conteudoM3u += `${PROXY_URL}/movie/${filme.id}.${ext}\n\n`;
    total++;
  }

  console.log(`Lista nova: ${total} entradas.`);
  return { conteudoM3u, cache: JSON.stringify(cache) };
}

// Lê o arquivo de cache do Gist (arquivo público, token só acelera os limites)
async function lerGistCache() {
  const cab = { 'User-Agent': 'Sintoniza-Gist-Updater' };
  try {
    const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      headers: GITHUB_TOKEN ? { ...cab, 'Authorization': `Bearer ${GITHUB_TOKEN}` } : cab
    });
    if (!res.ok) return '';
    const data = await res.json();
    return data?.files?.[NOME_ARQUIVO_CACHE]?.content || '';
  } catch (e) {
    return '';
  }
}

async function atualizarGist(m3uLegado, novaLista) {
  const body = {
    description: 'Listas de filmes populares TMDB para Sintoniza (atualizadas diariamente)',
    files: {
      [NOME_ARQUIVO]: { content: m3uLegado }
    }
  };
  if (novaLista) {
    body.files[NOME_ARQUIVO_NOVO] = { content: novaLista.conteudoM3u };
    body.files[NOME_ARQUIVO_CACHE] = { content: novaLista.cache };
  }

  const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'Sintoniza-Gist-Updater'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    throw new Error(`Erro ao atualizar Gist: ${await res.text()}`);
  }

  console.log('✅ Gist atualizado com sucesso!');
}

async function main() {
  if (!PROXY_URL) {
    console.warn('⚠️ PROXY_URL ausente: só a lista legada será atualizada.');
  }
  const { filmes } = await obterFilmes();
  const mapaGeneros = await obterGeneros();
  const m3uLegado = montarM3ULegado(filmes, mapaGeneros);
  const novaLista = PROXY_URL ? await montarM3UNovo(filmes, mapaGeneros) : null;
  await atualizarGist(m3uLegado, novaLista);
  // cópia local para depuração no runner
  writeFileSync('lista_legada.m3u', m3uLegado);
  if (novaLista) writeFileSync('lista_nova.m3u', novaLista.conteudoM3u);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
