"""Development-only static server. One shared document, explicit menu routes.
Run: python server.py --port 3000
No database, authentication, writes, accounts, billing or production security.
"""
import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
STATIC = {'/atmosphere-art.js', '/atmosphere-effects.js', '/atmosphere.css', '/winter-art.js', '/winter-effects.js', '/winter.css', '/seasonal-art.js', '/seasonal.css', '/themes.js', '/themes.css', '/styles.css', '/app.js', '/menu-data.js', '/assets/Vazirmatn.woff2',
          '/assets/OFL.txt', '/data/aria.json', '/data/bahar.json'}
NOT_FOUND = '''<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>منو پیدا نشد</title><link rel="stylesheet" href="/styles.css">
<main class="wrap empty"><h1>منو پیدا نشد</h1><p>این آدرس به رستوران آزمایشی تعلق ندارد.</p>
<p><a href="/aria">منوی آریا</a> · <a href="/bahar">منوی بهار</a></p></main></html>'''

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    def send_head(self):
        path = urlsplit(self.path).path
        if path in ('/', '/index.html'):
            self.send_response(302)
            self.send_header('Location', '/aria?theme=summer')
            self.send_header('Content-Length', '0')
            self.end_headers()
            return None
        if path in ('/aria', '/aria/', '/bahar', '/bahar/'):
            self.path = '/index.html'
            return super().send_head()
        if path in STATIC:
            self.path = path
            return super().send_head()
        body = NOT_FOUND.encode('utf-8')
        self.send_response(404)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)
        return None

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=3000)
    args = parser.parse_args()
    print(f'Demo menus: /aria and /bahar (port {args.port})', flush=True)
    ThreadingHTTPServer(('0.0.0.0', args.port), Handler).serve_forever()
