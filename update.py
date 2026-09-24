import urllib.request
import json
import os
import sys
from datetime import datetime, timezone, timedelta

# Fuso horário do Brasil (UTC-3)
TZ_BR = timezone(timedelta(hours=-3))

BASE_API = "http://dbonline.tech-cdn.top/player_api.php?username=ke-vin-0928392083&password=PZjF6XATTZ"
DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(DIR, "iptv_dados.json")
DATA_JS = os.path.join(DIR, "data.js")

def fetch_json(action):
    url = f"{BASE_API}&action={action}"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    for attempt in range(1, 4):
        try:
            with urllib.request.urlopen(req, timeout=35) as resp:
                raw = resp.read().decode('utf-8', errors='ignore')
                return json.loads(raw)
        except Exception as e:
            print(f"[!] Tentativa {attempt} falhou para {action}: {e}")
            if attempt == 3:
                raise
    return []

def run():
    now_br = datetime.now(TZ_BR)
    print(f"[*] Iniciando sincronização em: {now_br.strftime('%d/%m/%Y %H:%M:%S')} (Horário de Brasília)")

    # 1. Carregar dados anteriores se existirem (para detectar o que é novo)
    old_movie_ids = set()
    old_series_ids = set()
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                old_data = json.load(f)
                old_movie_ids = {m.get("id") for m in old_data.get("movies", [])}
                old_series_ids = {s.get("id") for s in old_data.get("series", [])}
        except Exception:
            pass

    # 2. Buscar Filmes
    print("[*] Baixando lista completa de filmes...")
    raw_movies = fetch_json("get_vod_streams")
    print(f"[+] Total de filmes no servidor: {len(raw_movies)}")
    raw_movies.sort(key=lambda x: int(x.get("added") or 0), reverse=True)

    movies = []
    new_movies_count = 0
    for m in raw_movies[:100]:
        stream_id = m.get("stream_id")
        ts = int(m.get("added") or 0)
        dt_str = datetime.fromtimestamp(ts, TZ_BR).strftime('%d/%m/%Y %H:%M') if ts else 'Desconhecida'
        is_recent_server = bool(old_movie_ids and stream_id not in old_movie_ids)
        if is_recent_server:
            new_movies_count += 1

        movies.append({
            "id": stream_id,
            "name": m.get("name"),
            "added_ts": ts,
            "added_date": dt_str,
            "rating": m.get("rating"),
            "poster": m.get("stream_icon"),
            "genre": m.get("genre"),
            "release_date": m.get("release_date"),
            "plot": m.get("plot"),
            "duration": m.get("episode_run_time"),
            "is_new": is_recent_server
        })

    # 3. Buscar Séries
    print("[*] Baixando lista completa de séries...")
    raw_series = fetch_json("get_series")
    print(f"[+] Total de séries no servidor: {len(raw_series)}")
    raw_series.sort(key=lambda x: int(x.get("last_modified") or 0), reverse=True)

    series = []
    new_series_count = 0
    for s in raw_series[:100]:
        series_id = s.get("series_id")
        ts = int(s.get("last_modified") or 0)
        dt_str = datetime.fromtimestamp(ts, TZ_BR).strftime('%d/%m/%Y %H:%M') if ts else 'Desconhecida'
        is_recent_server = bool(old_series_ids and series_id not in old_series_ids)
        if is_recent_server:
            new_series_count += 1

        series.append({
            "id": series_id,
            "name": s.get("name"),
            "added_ts": ts,
            "added_date": dt_str,
            "rating": s.get("rating"),
            "poster": s.get("cover"),
            "genre": s.get("genre"),
            "release_date": s.get("releaseDate"),
            "plot": s.get("plot"),
            "is_new": is_recent_server
        })

    result = {
        "last_sync": now_br.strftime('%d/%m/%Y %H:%M:%S'),
        "last_sync_iso": now_br.isoformat(),
        "total_movies_server": len(raw_movies),
        "total_series_server": len(raw_series),
        "new_movies_detected": new_movies_count,
        "new_series_detected": new_series_count,
        "movies": movies,
        "series": series
    }

    # Salva JSON e JS
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    with open(DATA_JS, "w", encoding="utf-8") as f:
        f.write("window.IPTV_INITIAL_DATA = " + json.dumps(result, ensure_ascii=False) + ";\n")

    print(f"\n[OK] Dados atualizados com sucesso!")
    print(f"    - Última sincronização: {result['last_sync']}")
    print(f"    - Novos filmes detectados nesta checagem: {new_movies_count}")
    print(f"    - Novas séries detectadas nesta checagem: {new_series_count}")

if __name__ == "__main__":
    run()
