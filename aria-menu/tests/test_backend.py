"""Backend tests: run a real server against a temporary database.

Run from the aria-menu folder:  python3 -m unittest discover -s tests -v
Standard library only.
"""
import http.client
import json
import os
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PASSWORD = 'owner-pass-123'


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


class Client:
    def __init__(self, port):
        self.port = port
        self.cookie = None
        self.csrf = None

    def request(self, method, path, body=None, raw=None, headers=None, use_session=True):
        conn = http.client.HTTPConnection('127.0.0.1', self.port, timeout=20)
        head = dict(headers or {})
        if use_session and self.cookie:
            head['Cookie'] = f'menu_session={self.cookie}'
        data = raw
        if body is not None:
            data = json.dumps(body).encode('utf-8')
            head.setdefault('Content-Type', 'application/json')
        conn.request(method, path, body=data, headers=head)
        response = conn.getresponse()
        payload = response.read()
        set_cookie = response.getheader('Set-Cookie')
        conn.close()
        try:
            parsed = json.loads(payload.decode('utf-8'))
        except (ValueError, UnicodeDecodeError):
            parsed = payload
        return response.status, parsed, set_cookie, response

    def login(self, username, password):
        status, payload, set_cookie, _ = self.request(
            'POST', '/api/auth/login', {'username': username, 'password': password}, use_session=False)
        if status == 200:
            self.cookie = set_cookie.split(';')[0].split('=', 1)[1]
            self.csrf = payload['csrfToken']
        return status, payload, set_cookie

    def write(self, method, path, body=None):
        status, payload, set_cookie, _ = self.request(method, path, body, headers={'X-CSRF-Token': self.csrf or ''})
        return status, payload, set_cookie


class BackendTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.db = str(Path(cls.tmp.name) / 'test.db')
        cls.port = free_port()
        env = dict(os.environ)

        def run(*args, stdin=None):
            result = subprocess.run([sys.executable, 'server.py', '--db', cls.db, *args], cwd=ROOT,
                                    input=stdin, capture_output=True, text=True, env=env, timeout=120)
            if result.returncode != 0:
                raise AssertionError(result.stderr or result.stdout)
            return result.stdout

        run('init')
        run('add-restaurant', '--slug', 'cafe-nila', '--name', 'کافه نیلا', '--english', 'Nila Cafe', '--theme', 'autumn')
        run('add-user', '--restaurant', 'aria', '--username', 'aria.owner', '--password-stdin', stdin=PASSWORD + '\n')
        run('add-user', '--restaurant', 'bahar', '--username', 'bahar.owner', '--password-stdin', stdin=PASSWORD + '\n')
        run('add-user', '--restaurant', 'cafe-nila', '--username', 'nila.owner', '--password-stdin', stdin=PASSWORD + '\n')
        run('add-user', '--restaurant', 'aria', '--username', 'throttle.user', '--password-stdin', stdin=PASSWORD + '\n')
        cls.server = subprocess.Popen(
            [sys.executable, 'server.py', '--db', cls.db, '--port', str(cls.port)],
            cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        deadline = time.time() + 20
        while time.time() < deadline:
            try:
                socket.create_connection(('127.0.0.1', cls.port), timeout=0.5).close()
                break
            except OSError:
                time.sleep(0.1)
        else:
            raise AssertionError('server did not start')

    @classmethod
    def tearDownClass(cls):
        cls.server.terminate()
        cls.server.wait(timeout=10)
        cls.tmp.cleanup()

    def client(self):
        return Client(self.port)

    def logged_in(self, username):
        client = self.client()
        status, _, _ = client.login(username, PASSWORD)
        self.assertEqual(status, 200)
        return client

    def public_menu(self, slug):
        status, payload, _, _ = self.client().request('GET', f'/api/restaurants/{slug}/menu', use_session=False)
        self.assertEqual(status, 200)
        return payload

    def disable_date_rules(self, slug, username=None):
        """Turn off the date rules so the restaurant's default theme is what the public page shows."""
        owner = self.logged_in(username or f'{slug}.owner')
        for key in ('spring', 'summer', 'autumn', 'winter', 'nowruz', 'valentine', 'yalda', 'halloween'):
            status, payload, _ = owner.write('PUT', f'/api/admin/{slug}/schedule/{key}', {'enabled': False})
            self.assertEqual(status, 200, payload)

    def admin_view(self, client, slug):
        status, payload, _, _ = client.request('GET', f'/api/admin/{slug}')
        self.assertEqual(status, 200, payload)
        return payload

    # ----- public -----------------------------------------------------------------

    def test_seeded_menus_are_served_from_database(self):
        aria = self.public_menu('aria')
        bahar = self.public_menu('bahar')
        self.assertEqual((len(aria['categories']), len(aria['items'])), (5, 12))
        self.assertEqual((len(bahar['categories']), len(bahar['items'])), (5, 10))
        self.assertEqual(self.admin_view(self.logged_in('aria.owner'), 'aria')['restaurant']['defaultTheme'], 'winter')
        self.assertEqual(self.admin_view(self.logged_in('bahar.owner'), 'bahar')['restaurant']['defaultTheme'], 'default')
        self.assertEqual(set(aria['restaurant']), {'slug', 'name', 'englishName', 'mark', 'headline', 'note',
                                                    'description', 'footer', 'welcomeMessage', 'theme'})
        self.assertEqual(set(aria['items'][0]), {'id', 'name', 'category', 'description', 'ingredients',
                                                  'allergens', 'price', 'icon', 'label'})

    def test_public_menu_for_unknown_or_invalid_slug_is_404(self):
        for slug in ('nope', 'Aria', 'admin', '..'):
            status, payload, _, _ = self.client().request('GET', f'/api/restaurants/{slug}/menu', use_session=False)
            self.assertEqual(status, 404, slug)
            self.assertIn('error', payload)

    def test_public_pages_and_routes(self):
        expectations = {
            '/aria': 200, '/aria/': 200, '/bahar': 200, '/cafe-nila': 200,
            '/nope': 404, '/admin': 404, '/admin/nope': 404, '/admin/aria': 200, '/admin/aria/': 200,
            '/api': 404, '/data/aria.json': 404, '/server.py': 404, '/backend/store.py': 404,
            '/tests/test_backend.py': 404, '/..%2fserver.py': 404, '/menu.db': 404,
        }
        for path, expected in expectations.items():
            status, _, _, _ = self.client().request('GET', path, use_session=False)
            self.assertEqual(status, expected, path)
        status, _, _, response = self.client().request('GET', '/', use_session=False)
        self.assertEqual(status, 302)
        self.assertEqual(response.getheader('Location'), '/aria')

    def test_public_menu_never_contains_hidden_items(self):
        owner = self.logged_in('aria.owner')
        view = self.admin_view(owner, 'aria')
        target = view['items'][0]
        status, _, _ = owner.write('PUT', f"/api/admin/aria/items/{target['id']}", {**target, 'visible': False})
        self.assertEqual(status, 200)
        public_ids = {item['id'] for item in self.public_menu('aria')['items']}
        self.assertNotIn(target['id'], public_ids)
        owner.write('PUT', f"/api/admin/aria/items/{target['id']}", {**target, 'visible': True})
        self.assertIn(target['id'], {item['id'] for item in self.public_menu('aria')['items']})

    # ----- authentication -----------------------------------------------------------

    def test_admin_api_requires_login(self):
        status, payload, _, _ = self.client().request('GET', '/api/admin/aria')
        self.assertEqual(status, 401)
        self.assertIn('error', payload)
        status, _, _, _ = self.client().request('GET', '/api/auth/me')
        self.assertEqual(status, 401)

    def test_login_failures_are_generic(self):
        for username, password in (('aria.owner', 'wrong-password-1'), ('nobody-here', PASSWORD), ('', '')):
            status, payload, set_cookie = Client(self.port).login(username, password)
            self.assertEqual(status, 401)
            self.assertIsNone(set_cookie)
            self.assertEqual(payload['error'], 'نام کاربری یا رمز عبور اشتباه است.')

    def test_login_sets_strict_http_only_cookie_and_csrf_token(self):
        client = self.client()
        status, payload, set_cookie = client.login('aria.owner', PASSWORD)
        self.assertEqual(status, 200)
        self.assertIn('HttpOnly', set_cookie)
        self.assertIn('SameSite=Strict', set_cookie)
        self.assertIn('Path=/', set_cookie)
        self.assertEqual(payload['user'], {'username': 'aria.owner', 'restaurantSlug': 'aria'})
        self.assertTrue(payload['csrfToken'])

    def test_session_and_passwords_are_stored_hashed(self):
        client = self.logged_in('nila.owner')
        conn = sqlite3.connect(self.db)
        try:
            stored = conn.execute("SELECT password_hash FROM users WHERE username='nila.owner'").fetchone()[0]
            digests = [row[0] for row in conn.execute('SELECT token_hash FROM sessions')]
        finally:
            conn.close()
        self.assertTrue(stored.startswith('pbkdf2_sha256$'))
        self.assertNotIn(PASSWORD, stored)
        self.assertNotIn(client.cookie, digests)

    def test_logout_invalidates_session(self):
        client = self.logged_in('bahar.owner')
        old_cookie = client.cookie
        status, _, _ = client.write('POST', '/api/auth/logout')
        self.assertEqual(status, 200)
        status, _, _, _ = client.request('GET', '/api/admin/bahar')
        self.assertEqual(status, 401)
        replay = Client(self.port)
        replay.cookie = old_cookie
        status, _, _, _ = replay.request('GET', '/api/admin/bahar')
        self.assertEqual(status, 401)

    def test_forged_session_cookie_is_rejected(self):
        client = self.client()
        client.cookie = 'not-a-real-token'
        status, _, _, _ = client.request('GET', '/api/admin/aria')
        self.assertEqual(status, 401)

    def test_login_is_throttled_after_repeated_failures(self):
        for _ in range(5):
            status, _, _ = Client(self.port).login('throttle.user', 'wrong-password-1')
            self.assertEqual(status, 401)
        status, payload, _ = Client(self.port).login('throttle.user', PASSWORD)
        self.assertEqual(status, 429)
        self.assertIn('error', payload)

    # ----- authorization and isolation ------------------------------------------------

    def test_owner_cannot_read_or_write_another_restaurant(self):
        aria = self.logged_in('aria.owner')
        status, _, _, _ = aria.request('GET', '/api/admin/bahar')
        self.assertEqual(status, 403)
        status, _, _ = aria.write('PUT', '/api/admin/bahar/profile', {'name': 'hacked'})
        self.assertEqual(status, 403)
        status, _, _ = aria.write('PUT', '/api/admin/bahar/theme', {'theme': 'winter'})
        self.assertEqual(status, 403)
        status, _, _ = aria.write('POST', '/api/admin/cafe-nila/categories', {'name': 'x', 'icon': 'bowl'})
        self.assertEqual(status, 403)
        self.assertEqual(self.public_menu('bahar')['restaurant']['name'], 'رستوران بهار')
        self.disable_date_rules('bahar')
        self.assertEqual(self.public_menu('bahar')['restaurant']['theme'], 'default')

    def test_csrf_token_is_required_for_writes(self):
        owner = self.logged_in('nila.owner')
        body = {'name': 'کافه نیلای جدید'}
        status, payload, _, _ = owner.request('PUT', '/api/admin/cafe-nila/profile', body)
        self.assertEqual(status, 403)
        status, _, _, _ = owner.request('PUT', '/api/admin/cafe-nila/profile', body,
                                        headers={'X-CSRF-Token': 'wrong'})
        self.assertEqual(status, 403)
        status, _, _, _ = owner.request('PUT', '/api/admin/cafe-nila/profile', body,
                                        headers={'X-CSRF-Token': owner.csrf})
        self.assertEqual(status, 200)

    def test_profile_changes_do_not_leak_to_other_restaurants(self):
        before = self.public_menu('bahar')
        owner = self.logged_in('aria.owner')
        status, _, _ = owner.write('PUT', '/api/admin/aria/profile', {
            'name': 'آریا نو', 'headline': 'عنوان تازه', 'mark': 'ا'})
        self.assertEqual(status, 200)
        self.assertEqual(self.public_menu('aria')['restaurant']['name'], 'آریا نو')
        self.assertEqual(self.public_menu('bahar'), before)
        status, _, _ = owner.write('PUT', '/api/admin/aria/profile', {
            'name': 'رستوران آریا', 'headline': 'طعم اصیل، حالِ خوب.', 'mark': 'آ'})
        self.assertEqual(status, 200)

    def test_theme_is_saved_per_restaurant(self):
        owner = self.logged_in('aria.owner')
        status, _, _ = owner.write('PUT', '/api/admin/aria/theme', {'theme': 'winter'})
        self.assertEqual(status, 200)
        self.assertEqual(self.public_menu('aria')['restaurant']['theme'], 'winter')
        self.disable_date_rules('bahar')
        self.assertEqual(self.public_menu('bahar')['restaurant']['theme'], 'default')
        self.disable_date_rules('cafe-nila', 'nila.owner')
        self.assertEqual(self.public_menu('cafe-nila')['restaurant']['theme'], 'autumn')
        status, _, _ = owner.write('PUT', '/api/admin/aria/theme', {'theme': 'summer'})
        self.assertEqual(status, 200)
        status, payload, _ = owner.write('PUT', '/api/admin/aria/theme', {'theme': '<script>'})
        self.assertEqual(status, 400)

    def test_item_ids_cannot_cross_restaurants(self):
        aria = self.logged_in('aria.owner')
        bahar_items = self.admin_view(self.logged_in('bahar.owner'), 'bahar')['items']
        foreign = bahar_items[0]
        status, _, _ = aria.write('PUT', f"/api/admin/aria/items/{foreign['id']}", {**foreign, 'name': 'x'})
        self.assertEqual(status, 404)
        status, _, _ = aria.write('DELETE', f"/api/admin/aria/items/{foreign['id']}")
        self.assertEqual(status, 404)
        status, _, _ = aria.write('POST', '/api/admin/aria/items', {
            'name': 'غذای غلط', 'category': bahar_items[0]['category'], 'price': 1000, 'icon': 'bowl'})
        self.assertEqual(status, 400)
        self.assertEqual(len(self.public_menu('bahar')['items']), 10)

    # ----- owner operations ---------------------------------------------------------

    def test_item_create_update_delete(self):
        owner = self.logged_in('aria.owner')
        before = len(self.public_menu('aria')['items'])
        status, _, _ = owner.write('POST', '/api/admin/aria/items', {
            'name': 'سوپ جو', 'category': 'starters', 'price': 95000, 'icon': 'bowl',
            'allergens': ['گندم (گلوتن)'], 'label': 'تازه', 'description': 'سوپ گرم', 'ingredients': 'جو، هویج',
            'visible': True, 'position': 0})
        self.assertEqual(status, 201)
        view = self.admin_view(owner, 'aria')
        created = next(item for item in view['items'] if item['name'] == 'سوپ جو')
        self.assertEqual(created['price'], 95000)
        self.assertEqual(created['allergens'], ['گندم (گلوتن)'])
        self.assertEqual(len(self.public_menu('aria')['items']), before + 1)
        status, _, _ = owner.write('PUT', f"/api/admin/aria/items/{created['id']}", {**created, 'price': 99000})
        self.assertEqual(status, 200)
        public = next(item for item in self.public_menu('aria')['items'] if item['id'] == created['id'])
        self.assertEqual(public['price'], 99000)
        status, _, _ = owner.write('DELETE', f"/api/admin/aria/items/{created['id']}")
        self.assertEqual(status, 200)
        self.assertEqual(len(self.public_menu('aria')['items']), before)

    def test_category_create_update_and_delete_rules(self):
        owner = self.logged_in('nila.owner')
        status, _, _ = owner.write('POST', '/api/admin/cafe-nila/categories', {'name': 'قهوه', 'icon': 'glass', 'position': 0})
        self.assertEqual(status, 201)
        view = self.admin_view(owner, 'cafe-nila')
        category = next(c for c in view['categories'] if c['name'] == 'قهوه')
        status, _, _ = owner.write('PUT', f"/api/admin/cafe-nila/categories/{category['id']}",
                                   {'name': 'قهوهٔ ویژه', 'icon': 'glass', 'position': 1})
        self.assertEqual(status, 200)
        status, _, _ = owner.write('POST', '/api/admin/cafe-nila/items', {
            'name': 'اسپرسو', 'category': category['id'], 'price': 60000, 'icon': 'glass'})
        self.assertEqual(status, 201)
        status, payload, _ = owner.write('DELETE', f"/api/admin/cafe-nila/categories/{category['id']}")
        self.assertEqual(status, 409)
        self.assertIn('غذا', payload['error'])
        item = next(i for i in self.admin_view(owner, 'cafe-nila')['items'] if i['name'] == 'اسپرسو')
        status, _, _ = owner.write('DELETE', f"/api/admin/cafe-nila/items/{item['id']}")
        self.assertEqual(status, 200)
        status, _, _ = owner.write('DELETE', f"/api/admin/cafe-nila/categories/{category['id']}")
        self.assertEqual(status, 200)
        self.assertEqual(self.public_menu('aria')['restaurant']['name'], 'رستوران آریا')

    def test_invalid_input_is_rejected(self):
        owner = self.logged_in('aria.owner')
        cases = [
            ('PUT', '/api/admin/aria/profile', {'name': ''}),
            ('PUT', '/api/admin/aria/profile', {'name': 'x' * 81}),
            ('POST', '/api/admin/aria/items', {'name': 'a', 'category': 'starters', 'price': -5, 'icon': 'bowl'}),
            ('POST', '/api/admin/aria/items', {'name': 'a', 'category': 'starters', 'price': 'abc', 'icon': 'bowl'}),
            ('POST', '/api/admin/aria/items', {'name': 'a', 'category': 'starters', 'price': True, 'icon': 'bowl'}),
            ('POST', '/api/admin/aria/items', {'name': 'a', 'category': 'starters', 'price': 10, 'icon': 'skull'}),
            ('POST', '/api/admin/aria/items', {'name': 'a', 'category': 'starters', 'price': 10, 'icon': 'bowl',
                                               'allergens': 'شیر'}),
            ('POST', '/api/admin/aria/items', {'name': 'a', 'category': 'starters', 'price': 10, 'icon': 'bowl',
                                               'visible': 'yes'}),
            ('POST', '/api/admin/aria/items', {'name': 'a', 'category': 'missing', 'price': 10, 'icon': 'bowl'}),
            ('POST', '/api/admin/aria/categories', {'name': '', 'icon': 'bowl'}),
        ]
        for method, path, body in cases:
            status, payload, _ = owner.write(method, path, body)
            self.assertEqual(status, 400, (path, body, payload))
            self.assertIn('error', payload)

    def test_malformed_and_oversized_bodies_are_rejected(self):
        owner = self.logged_in('aria.owner')
        status, _, _, _ = owner.request('PUT', '/api/admin/aria/profile', raw=b'{not json',
                                        headers={'X-CSRF-Token': owner.csrf, 'Content-Type': 'application/json'})
        self.assertEqual(status, 400)
        status, _, _, _ = owner.request('PUT', '/api/admin/aria/profile', raw=b'[1,2,3]',
                                        headers={'X-CSRF-Token': owner.csrf, 'Content-Type': 'application/json'})
        self.assertEqual(status, 400)
        big = json.dumps({'name': 'x' * (70 * 1024)}).encode('utf-8')
        status, _, _, _ = owner.request('PUT', '/api/admin/aria/profile', raw=big,
                                        headers={'X-CSRF-Token': owner.csrf, 'Content-Type': 'application/json'})
        self.assertEqual(status, 413)

    def test_cafe_nila_has_its_own_identity_and_theme(self):
        menu = self.public_menu('cafe-nila')
        self.assertEqual(menu['restaurant']['name'], 'کافه نیلا')
        self.assertEqual(menu['restaurant']['englishName'], 'Nila Cafe')
        self.assertEqual(menu['restaurant']['theme'], 'autumn')
        self.assertEqual(menu['items'], [])


if __name__ == '__main__':
    unittest.main()
