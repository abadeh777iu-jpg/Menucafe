"""Menu Cafe server: public menus, owner panels and a JSON API. Standard library only.

Run:
  python3 server.py [--port 3000]            serve (default command)
  python3 server.py init                      create the database and import demo seeds
  python3 server.py add-restaurant --slug x --name "نام" [--english "Name"] [--theme default]
  python3 server.py add-user --restaurant x --username owner [--password-stdin]
  python3 server.py set-password --username owner [--password-stdin]

Environment:
  MENU_DB                 path to the SQLite file (default: data/menu.db)
  MENU_COOKIE_SECURE=1    mark the session cookie Secure (use behind HTTPS)

Development-grade: plain HTTP server, no rate limiting beyond login throttling, no
TLS, no deployment hardening. See README for what a production deployment still needs.
"""
import argparse
import getpass
import hmac
import json
import os
import re
import sys
import time
from contextlib import closing
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from shutil import copyfileobj
from urllib.parse import parse_qs, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parent))

from backend import security, store  # noqa: E402
from backend.store import ApiError  # noqa: E402

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / 'data'
DEFAULT_DB = Path(os.environ.get('MENU_DB') or DATA_DIR / 'menu.db')
COOKIE_NAME = 'menu_session'
COOKIE_SECURE = os.environ.get('MENU_COOKIE_SECURE') == '1'
MAX_BODY_BYTES = 64 * 1024

STATIC = {
    '/atmosphere-art.js', '/atmosphere-effects.js', '/atmosphere.css', '/winter-art.js', '/winter-effects.js',
    '/winter.css', '/seasonal-art.js', '/seasonal.css', '/themes.js', '/themes.css', '/styles.css', '/app.js',
    '/menu-data.js', '/welcome.js', '/welcome.css', '/lively.js', '/lively.css',
    '/assets/Vazirmatn.woff2', '/assets/OFL.txt',
}
PAGE_FILES = {'/admin.html', '/admin.js', '/admin.css'}
RESTAURANT_PAGE = re.compile(r'^/(?P<slug>[a-z0-9][a-z0-9-]{1,39})/?$')
ADMIN_PAGE = re.compile(r'^/admin/(?P<slug>[a-z0-9][a-z0-9-]{1,39})/?$')
PREVIEW_PAGE = re.compile(r'^/admin/(?P<slug>[a-z0-9][a-z0-9-]{1,39})/preview/?$')
API_MENU = re.compile(r'^/api/restaurants/(?P<slug>[a-z0-9][a-z0-9-]{1,39})/menu$')

NOT_FOUND = '''<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>منو پیدا نشد</title><link rel="stylesheet" href="/styles.css">
<main class="wrap empty"><h1>منو پیدا نشد</h1><p>این آدرس به هیچ رستورانی تعلق ندارد.</p>
<p><a href="/aria">منوی آریا</a> · <a href="/bahar">منوی بهار</a></p></main></html>'''

_throttle = security.LoginThrottle()


def _checked_new_password(value):
    new = value if isinstance(value, str) else ''
    if len(new) < security.PASSWORD_MIN_LENGTH:
        raise ApiError(f'رمز عبور باید حداقل {security.PASSWORD_MIN_LENGTH} نویسه باشد.')
    if len(new) > security.PASSWORD_MAX_LENGTH:
        raise ApiError('رمز عبور بیش از حد طولانی است.')
    return new


def _json_bytes(payload):
    return json.dumps(payload, ensure_ascii=False).encode('utf-8')


class Handler(SimpleHTTPRequestHandler):
    server_version = 'MenuCafe/2'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    def do_GET(self):
        self._dispatch('GET')

    def do_HEAD(self):
        self._dispatch('HEAD')

    def do_POST(self):
        self._dispatch('POST')

    def do_PUT(self):
        self._dispatch('PUT')

    def do_DELETE(self):
        self._dispatch('DELETE')

    # ----- dispatch -----------------------------------------------------------

    def _dispatch(self, method):
        path = urlsplit(self.path).path
        try:
            if path.startswith('/api/'):
                self._api(method, path)
            elif method not in ('GET', 'HEAD'):
                self._send(405, b'', 'text/plain; charset=utf-8')
            else:
                self._page(method, path)
        except ApiError as error:
            self._json(error.status, {'error': error.message})
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _page(self, method, path):
        if path in ('/', '/index.html'):
            self.send_response(302)
            self.send_header('Location', '/aria')
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        if path in STATIC or path in PAGE_FILES:
            self.path = path
            return self._serve_file(method)
        match = PREVIEW_PAGE.match(path)
        if match:
            return self._preview(match.group('slug'))
        match = ADMIN_PAGE.match(path)
        if match:
            with closing(store.connect(self.server.db_path)) as conn:
                if store.restaurant_exists(conn, match.group('slug')):
                    self.path = '/admin.html'
                    return self._serve_file(method)
            return self._not_found()
        match = RESTAURANT_PAGE.match(path)
        if match and match.group('slug') not in store.RESERVED_SLUGS:
            with closing(store.connect(self.server.db_path)) as conn:
                if store.restaurant_exists(conn, match.group('slug')):
                    self.path = '/index.html'
                    return self._serve_file(method)
        return self._not_found()

    def _preview(self, slug):
        """Owner-only preview of the public menu with a chosen theme. The theme is injected into
        this response only; the public page never reads it from the URL."""
        query = parse_qs(urlsplit(self.path).query)
        theme = (query.get('theme') or [''])[0]
        with closing(store.connect(self.server.db_path)) as conn:
            session = self._session_row(conn)
        if session is None or session['restaurant_slug'] != slug:
            return self._send(302, b'', 'text/plain; charset=utf-8',
                              [('Location', f'/admin/{slug}')])
        if theme not in store.THEME_IDS:
            raise ApiError('تم انتخاب‌شده معتبر نیست.')
        html = (ROOT / 'index.html').read_text(encoding='utf-8')
        marker = ('<script>window.MENU_PREVIEW_SLUG="' + slug + '";'
                  'window.MENU_PREVIEW_THEME="' + theme + '";</script>')
        html = html.replace('</head>', marker + '</head>', 1)
        self._send(200, html.encode('utf-8'), 'text/html; charset=utf-8',
                   [('Cache-Control', 'no-store'), ('X-Robots-Tag', 'noindex, nofollow')])

    def _serve_file(self, method):
        if method == 'HEAD':
            return super().do_HEAD()
        return super().do_GET()

    def _not_found(self):
        self._send(404, NOT_FOUND.encode('utf-8'), 'text/html; charset=utf-8')

    # ----- API ----------------------------------------------------------------

    def _api(self, method, path):
        match = API_MENU.match(path)
        if match:
            if method != 'GET':
                raise ApiError('روش درخواست پشتیبانی نمی‌شود.', 405)
            with closing(store.connect(self.server.db_path)) as conn:
                menu = store.public_menu(conn, match.group('slug'))
            if menu is None:
                raise ApiError('رستوران پیدا نشد.', 404)
            return self._json(200, menu)

        parts = path.strip('/').split('/')
        if parts == ['api', 'auth', 'me'] and method == 'GET':
            return self._auth_me()
        if parts == ['api', 'auth', 'login'] and method == 'POST':
            return self._login()
        if parts == ['api', 'auth', 'logout'] and method == 'POST':
            return self._logout()
        if len(parts) >= 3 and parts[:2] == ['api', 'admin']:
            return self._admin_api(method, parts[2:])
        raise ApiError('آدرس پیدا نشد.', 404)

    def _cookie(self, name):
        for part in (self.headers.get('Cookie') or '').split(';'):
            key, _, value = part.strip().partition('=')
            if key == name:
                return value
        return None

    def _body(self):
        try:
            length = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            raise ApiError('درخواست نامعتبر است.')
        if length > MAX_BODY_BYTES:
            # Drain a bounded amount first so the client receives this reply instead of a reset.
            remaining = min(length, 2 * 1024 * 1024)
            while remaining > 0:
                chunk = self.rfile.read(min(remaining, 65536))
                if not chunk:
                    break
                remaining -= len(chunk)
            raise ApiError('حجم درخواست بیش از حد مجاز است.', 413)
        raw = self.rfile.read(length) if length else b''
        if not raw:
            return {}
        try:
            data = json.loads(raw.decode('utf-8'))
        except (UnicodeDecodeError, ValueError):
            raise ApiError('داده‌های ارسالی معتبر نیستند.')
        if not isinstance(data, dict):
            raise ApiError('داده‌های ارسالی معتبر نیستند.')
        return data

    def _session_row(self, conn):
        token = self._cookie(COOKIE_NAME)
        if not token:
            return None
        return store.find_session(conn, security.token_digest(token))

    def _require(self, conn, slug=None, csrf=False):
        session = self._session_row(conn)
        if session is None:
            raise ApiError('برای ادامه باید وارد شوید.', 401)
        if csrf:
            sent = self.headers.get('X-CSRF-Token') or ''
            if not hmac.compare_digest(sent, session['csrf_token']):
                raise ApiError('نشست فرم معتبر نیست؛ صفحه را دوباره بارگذاری کنید.', 403)
        if slug is not None and session['restaurant_slug'] != slug:
            raise ApiError('این حساب به این رستوران دسترسی ندارد.', 403)
        return session

    def _auth_me(self):
        with closing(store.connect(self.server.db_path)) as conn:
            session = self._require(conn)
        return self._json(200, {
            'user': {'username': session['username'], 'restaurantSlug': session['restaurant_slug']},
            'csrfToken': session['csrf_token'],
        })

    def _login(self):
        data = self._body()
        username = str(data.get('username') or '').strip().lower()
        password = str(data.get('password') or '')
        if not username or not password or len(password) > security.PASSWORD_MAX_LENGTH:
            raise ApiError('نام کاربری یا رمز عبور اشتباه است.', 401)
        key = (self.client_address[0], username)
        if _throttle.blocked(key):
            raise ApiError('تعداد تلاش‌ها زیاد است؛ چند دقیقه بعد دوباره امتحان کنید.', 429)
        with closing(store.connect(self.server.db_path)) as conn:
            user = store.user_by_username(conn, username)
            stored = user['password_hash'] if user else security.dummy_hash()
            valid = security.verify_password(password, stored)
            if user is None or not valid:
                _throttle.record_failure(key)
                raise ApiError('نام کاربری یا رمز عبور اشتباه است.', 401)
            _throttle.reset(key)
            token = security.new_token()
            csrf = security.new_token()
            expires = int(time.time()) + security.SESSION_TTL_SECONDS
            store.create_session(conn, security.token_digest(token), user['id'], csrf, expires)
        cookie = f'{COOKIE_NAME}={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={security.SESSION_TTL_SECONDS}'
        if COOKIE_SECURE:
            cookie += '; Secure'
        return self._json(200, {
            'user': {'username': username, 'restaurantSlug': user['restaurant_slug']},
            'csrfToken': csrf,
        }, extra_headers=[('Set-Cookie', cookie)])

    def _logout(self):
        with closing(store.connect(self.server.db_path)) as conn:
            self._require(conn, csrf=True)
            token = self._cookie(COOKIE_NAME)
            store.delete_session(conn, security.token_digest(token))
        cookie = f'{COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'
        if COOKIE_SECURE:
            cookie += '; Secure'
        return self._json(200, {'ok': True}, extra_headers=[('Set-Cookie', cookie)])

    def _admin_api(self, method, rest):
        slug = rest[0]
        if not RESTAURANT_PAGE.match('/' + slug) or slug in store.RESERVED_SLUGS:
            raise ApiError('رستوران پیدا نشد.', 404)
        tail = rest[1:]
        writes = method in ('POST', 'PUT', 'DELETE')
        with closing(store.connect(self.server.db_path)) as conn:
            session = self._require(conn, slug=slug, csrf=writes)
            if method == 'GET' and not tail:
                return self._json(200, store.admin_view(conn, slug))
            if tail == ['profile'] and method == 'PUT':
                store.update_profile(conn, slug, self._body())
                return self._json(200, store.admin_view(conn, slug))
            if tail == ['theme'] and method == 'PUT':
                body = self._body()
                if 'theme' not in body:
                    raise ApiError('تم انتخاب‌شده معتبر نیست.')
                store.set_manual_theme(conn, slug, body['theme'])
                return self._json(200, store.admin_view(conn, slug))
            if tail == ['default-theme'] and method == 'PUT':
                store.set_default_theme(conn, slug, self._body().get('theme'))
                return self._json(200, store.admin_view(conn, slug))
            if len(tail) == 2 and tail[0] == 'schedule' and method == 'PUT':
                store.update_rule(conn, slug, tail[1], self._body())
                return self._json(200, store.admin_view(conn, slug))
            if tail == ['account', 'password'] and method == 'POST':
                self._change_password(conn, session, slug)
                return self._json(200, store.admin_view(conn, slug))
            if tail == ['categories'] and method == 'POST':
                store.save_category(conn, slug, self._body())
                return self._json(201, store.admin_view(conn, slug))
            if tail == ['categories', 'order'] and method == 'PUT':
                store.reorder_categories(conn, slug, self._body().get('order'))
                return self._json(200, store.admin_view(conn, slug))
            if len(tail) == 2 and tail[0] == 'categories':
                category_id = tail[1]
                if method == 'PUT':
                    store.save_category(conn, slug, self._body(), category_id)
                    return self._json(200, store.admin_view(conn, slug))
                if method == 'DELETE':
                    store.delete_category(conn, slug, category_id)
                    return self._json(200, store.admin_view(conn, slug))
            if tail == ['items'] and method == 'POST':
                store.save_item(conn, slug, self._body())
                return self._json(201, store.admin_view(conn, slug))
            if len(tail) == 2 and tail[0] == 'items' and tail[1].isdigit():
                item_id = int(tail[1])
                if method == 'PUT':
                    store.save_item(conn, slug, self._body(), item_id)
                    return self._json(200, store.admin_view(conn, slug))
                if method == 'DELETE':
                    store.delete_item(conn, slug, item_id)
                    return self._json(200, store.admin_view(conn, slug))
            if tail == ['users'] and method == 'POST':
                body = self._body()
                password = _checked_new_password(body.get('password'))
                store.add_user(conn, slug, body.get('username'), security.hash_password(password))
                return self._json(201, store.admin_view(conn, slug))
            if len(tail) == 2 and tail[0] == 'users' and tail[1].isdigit() and method == 'DELETE':
                store.delete_user(conn, slug, int(tail[1]), session['user_id'])
                return self._json(200, store.admin_view(conn, slug))
            if len(tail) == 3 and tail[0] == 'users' and tail[1].isdigit() and tail[2] == 'password' \
                    and method == 'POST':
                user_id = int(tail[1])
                body = self._body()
                if user_id == session['user_id']:
                    raise ApiError('برای تغییر رمز خودتان از بخش «حساب کاربری» استفاده کنید.', 400)
                password = _checked_new_password(body.get('password'))
                store.reset_user_password(conn, slug, user_id, session['user_id'], security.hash_password(password))
                return self._json(200, store.admin_view(conn, slug))
        raise ApiError('آدرس پیدا نشد.', 404)

    def _change_password(self, conn, session, slug):
        body = self._body()
        current = str(body.get('currentPassword') or '')
        new = str(body.get('newPassword') or '')
        key = (self.client_address[0], 'password:' + session['username'])
        if _throttle.blocked(key):
            raise ApiError('تعداد تلاش‌ها زیاد است؛ چند دقیقه بعد دوباره امتحان کنید.', 429)
        stored = store.user_password_hash(conn, session['user_id']) or security.dummy_hash()
        if not security.verify_password(current, stored):
            _throttle.record_failure(key)
            raise ApiError('رمز عبور فعلی درست نیست.', 403)
        if len(new) < security.PASSWORD_MIN_LENGTH:
            raise ApiError(f'رمز عبور تازه باید حداقل {security.PASSWORD_MIN_LENGTH} نویسه باشد.')
        if len(new) > security.PASSWORD_MAX_LENGTH:
            raise ApiError('رمز عبور تازه بیش از حد طولانی است.')
        if new == current:
            raise ApiError('رمز عبور تازه باید با رمز فعلی متفاوت باشد.')
        _throttle.reset(key)
        store.change_password(conn, session['user_id'], security.hash_password(new),
                              security.token_digest(self._cookie(COOKIE_NAME)))

    # ----- responses ------------------------------------------------------------

    def _json(self, status, payload, extra_headers=()):
        self._send(status, _json_bytes(payload), 'application/json; charset=utf-8', extra_headers)

    def _send(self, status, body, content_type, extra_headers=()):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        for name, value in extra_headers:
            self.send_header(name, value)
        self.end_headers()
        if self.command != 'HEAD' and body:
            self.wfile.write(body)

    def log_message(self, format, *args):  # keep the console quiet during tests
        if os.environ.get('MENU_LOG') == '1':
            super().log_message(format, *args)


def _read_password(from_stdin):
    if from_stdin:
        password = sys.stdin.readline().rstrip('\r\n')
    else:
        password = getpass.getpass('رمز عبور: ')
        if password != getpass.getpass('تکرار رمز عبور: '):
            raise SystemExit('رمزها یکی نیستند.')
    if len(password) < security.PASSWORD_MIN_LENGTH or len(password) > security.PASSWORD_MAX_LENGTH:
        raise SystemExit(f'رمز عبور باید بین {security.PASSWORD_MIN_LENGTH} و {security.PASSWORD_MAX_LENGTH} نویسه باشد.')
    return password


def _open_db(path):
    store.init_db(path, DATA_DIR)
    return path


def main(argv=None):
    parser = argparse.ArgumentParser(description='Menu Cafe server and admin tools.')
    parser.add_argument('--db', default=str(DEFAULT_DB), help='SQLite database path')
    parser.add_argument('--port', type=int, default=3000)
    commands = parser.add_subparsers(dest='command')
    commands.add_parser('serve', help='run the HTTP server (default)')
    commands.add_parser('init', help='create the database and import demo seeds')
    add_restaurant = commands.add_parser('add-restaurant', help='create a restaurant')
    add_restaurant.add_argument('--slug', required=True)
    add_restaurant.add_argument('--name', required=True)
    add_restaurant.add_argument('--english', default='')
    add_restaurant.add_argument('--theme', default='default')
    add_user = commands.add_parser('add-user', help='create an owner account for one restaurant')
    add_user.add_argument('--restaurant', required=True)
    add_user.add_argument('--username', required=True)
    add_user.add_argument('--password-stdin', action='store_true')
    set_password = commands.add_parser('set-password', help='change an owner password')
    set_password.add_argument('--username', required=True)
    set_password.add_argument('--password-stdin', action='store_true')
    args = parser.parse_args(argv)

    db_path = _open_db(args.db)
    command = args.command or 'serve'
    try:
        if command == 'init':
            print(f'database ready: {db_path}')
        elif command == 'add-restaurant':
            with closing(store.connect(db_path)) as conn:
                slug = store.create_restaurant(conn, args.slug, args.name, args.english, args.theme)
            print(f'restaurant created: /{slug}  (panel: /admin/{slug})')
        elif command == 'add-user':
            password = _read_password(args.password_stdin)
            with closing(store.connect(db_path)) as conn:
                store.create_user(conn, args.username, args.restaurant, security.hash_password(password))
            print(f'owner created: {args.username.lower()} for {args.restaurant}')
        elif command == 'set-password':
            password = _read_password(args.password_stdin)
            with closing(store.connect(db_path)) as conn:
                store.set_password(conn, args.username, security.hash_password(password))
            print(f'password updated: {args.username.lower()}')
        elif command == 'serve':
            server = ThreadingHTTPServer(('0.0.0.0', args.port), Handler)
            server.db_path = db_path
            print(f'Menu Cafe on port {args.port} (database: {db_path})', flush=True)
            server.serve_forever()
    except ApiError as error:
        raise SystemExit(error.message)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
