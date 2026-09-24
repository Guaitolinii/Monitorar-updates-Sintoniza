import http.server
import socketserver
import urllib.request
import json
import os
import sys
import webbrowser
from datetime import datetime

PORT = 5050
DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(DIR, "iptv_dados.json")
DATA_JS = os.path.join(DIR, "data.js")

BASE_API = "http://dbonline.tech-cdn.top/player_api.php?username=ke-vin-0928392083&password=PZjF6XATTZ"

def sync_with_server():
    print("[*] Sincronizando com o servidor IPTV...")
    headers = {'User-Agent': 'Mozilla/5.0'}
    
    # 1. Filmes
    print("[*] Baixando lista de filmes...")
    req_m = urllib.request.Request(f"{BASE_API}&action=get_vod_streams", headers=headers)
    with urllib.request.urlopen(req_m, timeout=30) as r:
        raw_m = json.loads(r.read().decode('utf-8', errors='ignore'))
    
    raw_m.sort(key=lambda x: int(x.get('added') or 0), reverse=True)
    movies = []
    for m in raw_m[:100]:
        ts = int(m.get('added') or 0)
        dt_str = datetime.fromtimestamp(ts).strftime('%d/%m/%Y %H:%M') if ts else 'Desconhecida'
        movies.append({
            'id': m.get('stream_id'),
            'name': m.get('name'),
            'added_ts': ts,
            'added_date': dt_str,
            'rating': m.get('rating'),
            'poster': m.get('stream_icon'),
            'genre': m.get('genre'),
            'release_date': m.get('release_date'),
            'plot': m.get('plot'),
            'duration': m.get('episode_run_time')
        })

    # 2. Séries
    print("[*] Baixando lista de séries...")
    req_s = urllib.request.Request(f"{BASE_API}&action=get_series", headers=headers)
    with urllib.request.urlopen(req_s, timeout=30) as r:
        raw_s = json.loads(r.read().decode('utf-8', errors='ignore'))

    raw_s.sort(key=lambda x: int(x.get('last_modified') or 0), reverse=True)
    series = []
    for s in raw_s[:100]:
        ts = int(s.get('last_modified') or 0)
        dt_str = datetime.fromtimestamp(ts).strftime('%d/%m/%Y %H:%M') if ts else 'Desconhecida'
        series.append({
            'id': s.get('series_id'),
            'name': s.get('name'),
            'added_ts': ts,
            'added_date': dt_str,
            'rating': s.get('rating'),
            'poster': s.get('cover'),
            'genre': s.get('genre'),
            'release_date': s.get('releaseDate'),
            'plot': s.get('plot')
        })

    result = {
        'last_updated': datetime.now().strftime('%d/%m/%Y %H:%M:%S'),
        'total_movies_server': len(raw_m),
        'total_series_server': len(raw_s),
        'movies': movies,
        'series': series
    }

    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    with open(DATA_JS, 'w', encoding='utf-8') as f:
        f.write('window.IPTV_INITIAL_DATA = ' + json.dumps(result, ensure_ascii=False) + ';')

    print(f"[+] Sincronizado com sucesso! {len(movies)} filmes e {len(series)} séries atualizados.")
    return result

class IPTVHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        if self.path == '/api/refresh':
            try:
                data = sync_with_server()
                payload = json.dumps({'success': True, 'data': data}).encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Content-Length', str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
            except Exception as e:
                err_payload = json.dumps({'success': False, 'error': str(e)}).encode('utf-8')
                self.send_response(500)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Content-Length', str(len(err_payload)))
                self.end_headers()
                self.wfile.write(err_payload)
            return

        if self.path == '/api/data':
            if os.path.exists(DATA_FILE):
                with open(DATA_FILE, 'rb') as f:
                    content = f.read()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Content-Length', str(len(content)))
                self.end_headers()
                self.wfile.write(content)
                return

        return super().do_GET()

def run():
    # Se o arquivo não existir, gera a primeira vez
    if not os.path.exists(DATA_FILE):
        try:
            sync_with_server()
        except Exception as e:
            print(f"[!] Aviso: Primeira sincronização falhou: {e}")

    server_address = ('', PORT)
    with socketserver.TCPServer(server_address, IPTVHandler) as httpd:
        url = f"http://localhost:{PORT}"
        print(f"\n========================================================")
        print(f"  Painel IPTV - Últimos Lançamentos (Filmes e Séries)")
        print(f"  Servidor ativo em: {url}")
        print(f"  Pressione Ctrl+C para encerrar o servidor.")
        print(f"========================================================\n")
        try:
            webbrowser.open(url)
        except Exception:
            pass
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServidor finalizado.")

if __name__ == '__main__':
    run()
