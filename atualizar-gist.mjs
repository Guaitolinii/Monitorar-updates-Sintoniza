import { writeFileSync } from 'node:fs';

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const GITHUB_TOKEN = process.env.GIST_TOKEN;
const GIST_ID = process.env.GIST_ID;
const NOME_ARQUIVO = 'filmes_vidlink.m3u';
const QUANTIDADE_PAGINAS = 100; // 100 páginas x 20 filmes = 2.000 filmes populares

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

async function gerarM3U() {
  const mapaGeneros = await obterGeneros();
  const hoje = new Date().toISOString().split('T')[0];
  let conteudoM3u = '#EXTM3U\n\n';

  console.log(`Buscando 2.000 filmes no TMDB (lançados até ${hoje})...`);

  const idsAdicionados = new Set();
  let total = 0;

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
  }

  console.log(`Total compilado: ${total} filmes.`);
  return conteudoM3u;
}

async function atualizarGist(m3uTexto) {
  const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'Sintoniza-Gist-Updater'
    },
    body: JSON.stringify({
      description: 'Lista de 2.000 filmes populares TMDB via Vidlink para Sintoniza (Atualizada diariamente)',
      files: {
        [NOME_ARQUIVO]: {
          content: m3uTexto
        }
      }
    })
  });

  if (!res.ok) {
    throw new Error(`Erro ao atualizar Gist: ${await res.text()}`);
  }

  console.log('✅ Gist atualizado com sucesso!');
}

async function main() {
  const m3u = await gerarM3U();
  await atualizarGist(m3u);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
