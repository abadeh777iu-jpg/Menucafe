"""SQLite storage for multi-restaurant menus, owner accounts and sessions.

Every menu row carries its restaurant slug and every write is scoped to the slug
checked by the caller, so one restaurant's data cannot be reached through another's URL.
Standard library only.
"""
import json
import os
import re
import secrets
import sqlite3
import time
from pathlib import Path

from . import jalali, schedule

# Keep in sync with themes.js. Names are shown in the owner panel only.
THEMES = (
    ('default', 'پیش‌فرض', 'زیتونی و آرام'),
    ('nowruz', 'نوروز و بهار', 'سفرهٔ نو، شکوفهٔ نو'),
    ('yalda', 'شب یلدا', 'انار، هندوانه و خاطره'),
    ('winter', 'زمستان', 'برف، نور و آرامش'),
    ('summer', 'تابستان', 'آفتاب و نسیم دریا'),
    ('valentine', 'ولنتاین', 'رز و نور گرم'),
    ('halloween', 'هالووین', 'ماه، مه و فانوس'),
    ('autumn', 'پاییز', 'برگ و دارچین'),
    ('spring', 'بهار', 'شکوفه و سبزهٔ تازه'),
)
THEME_IDS = frozenset(theme[0] for theme in THEMES)

# Keep in sync with the icon paths in app.js.
ICONS = (
    ('bowl', 'کاسه'), ('plate', 'بشقاب'), ('rice', 'برنج'), ('glass', 'لیوان'),
    ('cake', 'کیک'), ('leaf', 'برگ'), ('kebab', 'کباب'), ('icecream', 'بستنی'),
)
ICON_IDS = frozenset(icon[0] for icon in ICONS)

RESERVED_SLUGS = frozenset({'admin', 'api', 'assets', 'data', 'static', 'index'})
SLUG_RE = re.compile(r'^[a-z0-9][a-z0-9-]{1,39}$')
USERNAME_RE = re.compile(r'^[a-z0-9_.-]{3,40}$')
CATEGORY_ID_RE = re.compile(r'^[a-z0-9][a-z0-9-]{0,39}$')
MAX_PRICE = 1_000_000_000

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS restaurants (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  english_name TEXT NOT NULL DEFAULT '',
  mark TEXT NOT NULL DEFAULT '',
  headline TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  footer TEXT NOT NULL DEFAULT '',
  theme TEXT NOT NULL DEFAULT 'default',
  manual_theme TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS categories (
  restaurant_slug TEXT NOT NULL REFERENCES restaurants(slug) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (restaurant_slug, id)
);
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_slug TEXT NOT NULL REFERENCES restaurants(slug) ON DELETE CASCADE,
  category_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  ingredients TEXT NOT NULL DEFAULT '',
  allergens TEXT NOT NULL DEFAULT '[]',
  price INTEGER NOT NULL,
  icon TEXT NOT NULL,
  label TEXT,
  visible INTEGER NOT NULL DEFAULT 1,
  position INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (restaurant_slug, category_id)
    REFERENCES categories(restaurant_slug, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS items_by_restaurant ON items(restaurant_slug, position, id);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  restaurant_slug TEXT NOT NULL REFERENCES restaurants(slug) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS theme_rules (
  restaurant_slug TEXT NOT NULL REFERENCES restaurants(slug) ON DELETE CASCADE,
  key TEXT NOT NULL,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  theme TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  calendar TEXT NOT NULL,
  start_month INTEGER NOT NULL,
  start_day INTEGER NOT NULL,
  end_month INTEGER NOT NULL,
  end_day INTEGER NOT NULL,
  priority INTEGER NOT NULL DEFAULT 50,
  timezone TEXT NOT NULL DEFAULT 'Asia/Tehran',
  position INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (restaurant_slug, key)
);
"""


class ApiError(Exception):
    """An error that is safe to show to the client (message in Persian)."""

    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


def connect(path):
    conn = sqlite3.connect(str(path), timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    return conn


def now():
    return int(time.time())


# ----- validation -------------------------------------------------------------

_CONTROL_RE = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]')


def clean_text(value, label, min_len, max_len, multiline=False):
    if value is None:
        value = ''
    if not isinstance(value, str):
        raise ApiError(f'{label} باید متن باشد.')
    text = _CONTROL_RE.sub('', value)
    if not multiline:
        text = re.sub(r'[\r\n\t]+', ' ', text)
    text = text.strip()
    if len(text) < min_len:
        raise ApiError(f'{label} نمی‌تواند خالی باشد.' if min_len else f'{label} معتبر نیست.')
    if len(text) > max_len:
        raise ApiError(f'{label} نباید بیشتر از {max_len} نویسه باشد.')
    return text


def clean_int(value, label, low, high):
    if isinstance(value, bool):
        raise ApiError(f'{label} باید عدد باشد.')
    if isinstance(value, str) and value.strip().isdigit():
        value = int(value.strip())
    if not isinstance(value, int):
        raise ApiError(f'{label} باید عدد صحیح باشد.')
    if value < low or value > high:
        raise ApiError(f'{label} باید بین {low} و {high} باشد.')
    return value


def clean_bool(value, label):
    if not isinstance(value, bool):
        raise ApiError(f'{label} باید درست یا نادرست باشد.')
    return value


def clean_theme(value):
    if value not in THEME_IDS:
        raise ApiError('تم انتخاب‌شده معتبر نیست.')
    return value


def clean_icon(value, label='آیکن'):
    if value not in ICON_IDS:
        raise ApiError(f'{label} انتخاب‌شده معتبر نیست.')
    return value


def clean_allergens(value):
    if value is None or value == '':
        return []
    if not isinstance(value, list):
        raise ApiError('حساسیت‌زاها باید فهرست باشند.')
    if len(value) > 20:
        raise ApiError('حداکثر ۲۰ مورد حساسیت‌زا می‌توان ثبت کرد.')
    return [clean_text(entry, 'حساسیت‌زا', 1, 40) for entry in value]


def clean_slug(value):
    if not isinstance(value, str) or not SLUG_RE.match(value) or value in RESERVED_SLUGS:
        raise ApiError('آدرس رستوران باید فقط شامل حروف لاتین کوچک، عدد و خط تیره باشد و بین ۲ تا ۴۰ نویسه باشد.')
    return value


def json_list(raw):
    try:
        value = json.loads(raw or '[]')
    except (TypeError, ValueError):
        return []
    return value if isinstance(value, list) else []


# ----- schema and seeding -----------------------------------------------------

def init_db(path, seed_dir):
    """Create tables and, on first run only, import the demo JSON files in seed_dir."""
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    conn = connect(path)
    try:
        conn.executescript(SCHEMA)
        migrate(conn)
        already = conn.execute("SELECT 1 FROM meta WHERE key='seeded'").fetchone()
        if not already:
            with conn:
                for seed_file in sorted(Path(seed_dir).glob('*.json')):
                    seed_restaurant(conn, json.loads(seed_file.read_text(encoding='utf-8')))
                conn.execute("INSERT INTO meta(key, value) VALUES('seeded', '1')")
        with conn:
            for row in conn.execute('SELECT slug FROM restaurants').fetchall():
                ensure_rules(conn, row['slug'])
    finally:
        conn.close()


def migrate(conn):
    """Add columns introduced after the first release. Safe to run more than once."""
    with conn:
        columns = {row['name'] for row in conn.execute('PRAGMA table_info(categories)')}
        if 'enabled' not in columns:
            conn.execute('ALTER TABLE categories ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1')
        columns = {row['name'] for row in conn.execute('PRAGMA table_info(restaurants)')}
        if 'manual_theme' not in columns:
            conn.execute('ALTER TABLE restaurants ADD COLUMN manual_theme TEXT')


def ensure_rules(conn, slug):
    """Create the default schedule rules for a restaurant (disabled). Existing rules are kept."""
    stamp = now()
    for position, (key, kind, theme, label, calendar, start, end, priority) in enumerate(schedule.DEFAULT_RULES):
        conn.execute(
            'INSERT OR IGNORE INTO theme_rules (restaurant_slug, key, kind, label, theme, enabled, calendar,'
            ' start_month, start_day, end_month, end_day, priority, timezone, position, updated_at)'
            ' VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            (slug, key, kind, label, theme, calendar, start[0], start[1], end[0], end[1], priority,
             schedule.TIMEZONE_NAME, position, stamp),
        )


def seed_restaurant(conn, data):
    info = data['restaurant']
    slug = clean_slug(info['slug'])
    theme = clean_theme(info.get('theme', 'default'))
    stamp = now()
    conn.execute(
        'INSERT INTO restaurants (slug, name, english_name, mark, headline, note, description, footer, theme, created_at, updated_at)'
        ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        (slug, info['name'], info.get('englishName', ''), info.get('mark', ''), info.get('headline', ''),
         info.get('note', ''), info.get('description', ''), info.get('footer', ''), theme, stamp, stamp),
    )
    for position, category in enumerate(data['categories']):
        conn.execute(
            'INSERT INTO categories (restaurant_slug, id, name, icon, position) VALUES (?, ?, ?, ?, ?)',
            (slug, category['id'], category['name'], clean_icon(category['icon']), position),
        )
    for position, item in enumerate(data['items']):
        conn.execute(
            'INSERT INTO items (restaurant_slug, category_id, name, description, ingredients, allergens, price, icon, label, visible, position)'
            ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
            (slug, item['category'], item['name'], item.get('description', ''), item.get('ingredients', ''),
             json.dumps(item.get('allergens') or [], ensure_ascii=False), int(item['price']),
             clean_icon(item['icon']), item.get('label') or None, position),
        )


def create_restaurant(conn, slug, name, english_name='', theme='default'):
    slug = clean_slug(slug)
    name = clean_text(name, 'نام رستوران', 1, 80)
    english_name = clean_text(english_name, 'نام لاتین', 0, 80)
    theme = clean_theme(theme)
    if conn.execute('SELECT 1 FROM restaurants WHERE slug=?', (slug,)).fetchone():
        raise ApiError('رستورانی با این آدرس وجود دارد.', 409)
    stamp = now()
    with conn:
        conn.execute(
            'INSERT INTO restaurants (slug, name, english_name, mark, headline, note, description, footer, theme, created_at, updated_at)'
            ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            (slug, name, english_name, name[:1], name, '', '', '', theme, stamp, stamp),
        )
        ensure_rules(conn, slug)
    return slug


def create_user(conn, username, restaurant_slug, password_hash):
    username = clean_username(username)
    if not conn.execute('SELECT 1 FROM restaurants WHERE slug=?', (restaurant_slug,)).fetchone():
        raise ApiError('رستوران پیدا نشد.', 404)
    if conn.execute('SELECT 1 FROM users WHERE username=?', (username,)).fetchone():
        raise ApiError('این نام کاربری قبلاً ثبت شده است.', 409)
    with conn:
        conn.execute(
            'INSERT INTO users (username, password_hash, restaurant_slug, created_at) VALUES (?, ?, ?, ?)',
            (username, password_hash, restaurant_slug, now()),
        )


def set_password(conn, username, password_hash):
    username = clean_username(username)
    with conn:
        cursor = conn.execute('UPDATE users SET password_hash=? WHERE username=?', (password_hash, username))
    if cursor.rowcount != 1:
        raise ApiError('کاربری با این نام پیدا نشد.', 404)


def clean_username(value):
    if not isinstance(value, str) or not USERNAME_RE.match(value.strip().lower()):
        raise ApiError('نام کاربری باید ۳ تا ۴۰ نویسه از حروف لاتین، عدد، نقطه، خط تیره یا زیرخط باشد.')
    return value.strip().lower()


# ----- public reads ------------------------------------------------------------

def restaurant_exists(conn, slug):
    return conn.execute('SELECT 1 FROM restaurants WHERE slug=?', (slug,)).fetchone() is not None


def public_menu(conn, slug, now=None):
    row = conn.execute('SELECT * FROM restaurants WHERE slug=?', (slug,)).fetchone()
    if row is None:
        return None
    categories = conn.execute(
        'SELECT id, name, icon FROM categories WHERE restaurant_slug=? AND enabled=1 ORDER BY position, id',
        (slug,)).fetchall()
    items = conn.execute(
        'SELECT i.* FROM items i JOIN categories c ON c.restaurant_slug = i.restaurant_slug AND c.id = i.category_id'
        ' WHERE i.restaurant_slug=? AND i.visible=1 AND c.enabled=1 ORDER BY i.position, i.id', (slug,)).fetchall()
    active = resolve_theme(conn, slug, now)
    return {
        'restaurant': {
            'slug': row['slug'], 'name': row['name'], 'englishName': row['english_name'], 'mark': row['mark'],
            'headline': row['headline'], 'note': row['note'], 'description': row['description'],
            'footer': row['footer'], 'theme': active['theme'],
        },
        'categories': [{'id': c['id'], 'name': c['name'], 'icon': c['icon']} for c in categories],
        'items': [
            {
                'id': i['id'], 'name': i['name'], 'category': i['category_id'], 'description': i['description'],
                'ingredients': i['ingredients'], 'allergens': json_list(i['allergens']) or None,
                'price': i['price'], 'icon': i['icon'], 'label': i['label'] or None,
            }
            for i in items
        ],
    }


def rules_for(conn, slug):
    rows = conn.execute('SELECT * FROM theme_rules WHERE restaurant_slug=? ORDER BY position, key', (slug,)).fetchall()
    return [dict(row) for row in rows]


def _moment(now):
    return now or schedule.tehran_now(os.environ.get('MENU_TEST_NOW') or None)


def resolve_theme(conn, slug, now=None):
    row = conn.execute('SELECT theme, manual_theme FROM restaurants WHERE slug=?', (slug,)).fetchone()
    if row is None:
        raise ApiError('رستوران پیدا نشد.', 404)
    return schedule.resolve(_moment(now), rules_for(conn, slug), row['theme'], row['manual_theme'])



# ----- owner reads and writes ---------------------------------------------------

def admin_view(conn, slug, now=None):
    row = conn.execute('SELECT * FROM restaurants WHERE slug=?', (slug,)).fetchone()
    if row is None:
        raise ApiError('رستوران پیدا نشد.', 404)
    categories = conn.execute(
        'SELECT id, name, icon, position, enabled FROM categories WHERE restaurant_slug=? ORDER BY position, id',
        (slug,)).fetchall()
    items = conn.execute(
        'SELECT * FROM items WHERE restaurant_slug=? ORDER BY position, id', (slug,)).fetchall()
    rules = rules_for(conn, slug)
    moment = _moment(now)
    resolution = schedule.resolve(moment, rules, row['theme'], row['manual_theme'])
    today = schedule.today_views(moment)
    theme_names = {theme[0]: theme[1] for theme in THEMES}
    return {
        'restaurant': {
            'slug': row['slug'], 'name': row['name'], 'englishName': row['english_name'], 'mark': row['mark'],
            'headline': row['headline'], 'note': row['note'], 'description': row['description'],
            'footer': row['footer'], 'theme': row['theme'], 'defaultTheme': row['theme'],
            'manualTheme': row['manual_theme'],
        },
        'categories': [
            {'id': c['id'], 'name': c['name'], 'icon': c['icon'], 'position': c['position'],
             'enabled': bool(c['enabled'])}
            for c in categories
        ],
        'items': [
            {
                'id': i['id'], 'category': i['category_id'], 'name': i['name'], 'description': i['description'],
                'ingredients': i['ingredients'], 'allergens': json_list(i['allergens']), 'price': i['price'],
                'icon': i['icon'], 'label': i['label'] or '', 'visible': bool(i['visible']), 'position': i['position'],
            }
            for i in items
        ],
        'themes': [{'id': t[0], 'name': t[1], 'hint': t[2]} for t in THEMES],
        'icons': [{'id': i[0], 'name': i[1]} for i in ICONS],
        'activeTheme': {
            'theme': resolution['theme'], 'themeName': theme_names.get(resolution['theme'], resolution['theme']),
            'source': resolution['source'], 'rule': resolution['rule'], 'conflict': resolution['conflict'],
        },
        'schedule': {
            'timezone': schedule.TIMEZONE_NAME,
            'today': {'gregorian': today['gregorianText'], 'jalali': today['jalaliText'], 'time': today['time']},
            'rules': [
                {
                    'key': r['key'], 'kind': r['kind'], 'label': r['label'], 'theme': r['theme'],
                    'themeName': theme_names.get(r['theme'], r['theme']), 'enabled': bool(r['enabled']),
                    'calendar': r['calendar'], 'startMonth': r['start_month'], 'startDay': r['start_day'],
                    'endMonth': r['end_month'], 'endDay': r['end_day'], 'priority': r['priority'],
                    'timezone': r['timezone'], 'window': schedule.describe_window(r),
                    'matchesToday': schedule.rule_is_active(r, today),
                }
                for r in rules
            ],
        },
    }



PROFILE_LIMITS = {
    'name': ('نام رستوران', 1, 80, False),
    'englishName': ('نام لاتین', 0, 80, False),
    'mark': ('نشان (حرف لوگو)', 1, 4, False),
    'headline': ('عنوان اصلی', 1, 120, False),
    'note': ('متن کوتاه بالای منو', 0, 160, False),
    'description': ('توضیحات', 0, 400, True),
    'footer': ('متن پایین صفحه', 0, 160, False),
}
PROFILE_COLUMNS = {
    'name': 'name', 'englishName': 'english_name', 'mark': 'mark', 'headline': 'headline',
    'note': 'note', 'description': 'description', 'footer': 'footer',
}


def update_profile(conn, slug, payload):
    row = conn.execute('SELECT * FROM restaurants WHERE slug=?', (slug,)).fetchone()
    if row is None:
        raise ApiError('رستوران پیدا نشد.', 404)
    values = {}
    for key, (label, low, high, multiline) in PROFILE_LIMITS.items():
        current = row[PROFILE_COLUMNS[key]]
        raw = payload[key] if key in payload else current
        values[PROFILE_COLUMNS[key]] = clean_text(raw, label, low, high, multiline)
    assignments = ', '.join(f'{column}=?' for column in values)
    with conn:
        conn.execute(f'UPDATE restaurants SET {assignments}, updated_at=? WHERE slug=?',
                     (*values.values(), now(), slug))


def set_manual_theme(conn, slug, theme):
    """Set the manager's override, or clear it when theme is None (back to the schedule)."""
    theme = None if theme is None else clean_theme(theme)
    with conn:
        cursor = conn.execute('UPDATE restaurants SET manual_theme=?, updated_at=? WHERE slug=?',
                              (theme, now(), slug))
    if cursor.rowcount != 1:
        raise ApiError('رستوران پیدا نشد.', 404)


def set_default_theme(conn, slug, theme):
    theme = clean_theme(theme)
    with conn:
        cursor = conn.execute('UPDATE restaurants SET theme=?, updated_at=? WHERE slug=?', (theme, now(), slug))
    if cursor.rowcount != 1:
        raise ApiError('رستوران پیدا نشد.', 404)



def _category_row(conn, slug, category_id):
    row = conn.execute('SELECT * FROM categories WHERE restaurant_slug=? AND id=?', (slug, category_id)).fetchone()
    if row is None:
        raise ApiError('دسته‌بندی پیدا نشد.', 404)
    return row


def save_category(conn, slug, payload, category_id=None):
    if category_id is None:
        if not conn.execute('SELECT 1 FROM restaurants WHERE slug=?', (slug,)).fetchone():
            raise ApiError('رستوران پیدا نشد.', 404)
        name = clean_text(payload.get('name'), 'نام دسته‌بندی', 1, 40)
        icon = clean_icon(payload.get('icon', 'bowl'))
        enabled = int(clean_bool(payload.get('enabled', True), 'وضعیت دسته‌بندی'))
        last = conn.execute('SELECT COALESCE(MAX(position), -1) FROM categories WHERE restaurant_slug=?',
                            (slug,)).fetchone()[0]
        position = clean_int(payload.get('position', last + 1), 'ترتیب', 0, 9999)
        new_id = None
        for _ in range(5):
            candidate = 'cat-' + secrets.token_hex(4)
            if not conn.execute('SELECT 1 FROM categories WHERE restaurant_slug=? AND id=?',
                                (slug, candidate)).fetchone():
                new_id = candidate
                break
        if new_id is None:
            raise ApiError('ساخت شناسه دسته‌بندی ناموفق بود؛ دوباره تلاش کنید.', 500)
        with conn:
            conn.execute(
                'INSERT INTO categories (restaurant_slug, id, name, icon, position, enabled) VALUES (?, ?, ?, ?, ?, ?)',
                (slug, new_id, name, icon, position, enabled))
        return new_id
    row = _category_row(conn, slug, category_id)
    name = clean_text(payload['name'] if 'name' in payload else row['name'], 'نام دسته‌بندی', 1, 40)
    icon = clean_icon(payload['icon'] if 'icon' in payload else row['icon'])
    position = clean_int(payload['position'] if 'position' in payload else row['position'], 'ترتیب', 0, 9999)
    enabled = int(clean_bool(payload['enabled'] if 'enabled' in payload else bool(row['enabled']),
                             'وضعیت دسته‌بندی'))
    with conn:
        conn.execute('UPDATE categories SET name=?, icon=?, position=?, enabled=? WHERE restaurant_slug=? AND id=?',
                     (name, icon, position, enabled, slug, category_id))
    return category_id



def delete_category(conn, slug, category_id):
    _category_row(conn, slug, category_id)
    count = conn.execute('SELECT COUNT(*) FROM items WHERE restaurant_slug=? AND category_id=?',
                         (slug, category_id)).fetchone()[0]
    if count:
        raise ApiError('این دسته‌بندی غذا دارد. ابتدا غذاهای آن را جابه‌جا یا حذف کنید.', 409)
    with conn:
        conn.execute('DELETE FROM categories WHERE restaurant_slug=? AND id=?', (slug, category_id))


def _item_row(conn, slug, item_id):
    row = conn.execute('SELECT * FROM items WHERE restaurant_slug=? AND id=?', (slug, item_id)).fetchone()
    if row is None:
        raise ApiError('غذا پیدا نشد.', 404)
    return row


def save_item(conn, slug, payload, item_id=None):
    if item_id is None:
        if not conn.execute('SELECT 1 FROM restaurants WHERE slug=?', (slug,)).fetchone():
            raise ApiError('رستوران پیدا نشد.', 404)
        base = {}
        for required in ('name', 'category', 'price'):
            if required not in payload:
                raise ApiError('نام، دسته‌بندی و قیمت الزامی هستند.')
        last = conn.execute('SELECT COALESCE(MAX(position), -1) FROM items WHERE restaurant_slug=?', (slug,)).fetchone()[0]
        base['position'] = last + 1
        base['visible'] = 1
        base['icon'] = 'bowl'
        base['allergens'] = '[]'
        base['description'] = ''
        base['ingredients'] = ''
        base['label'] = None
    else:
        base = dict(_item_row(conn, slug, item_id))
        base['visible'] = int(bool(base['visible']))
        base['allergens'] = json.dumps(json_list(base['allergens']), ensure_ascii=False)

    def pick(key, default):
        return payload[key] if key in payload else default

    category_id = pick('category', base.get('category_id'))
    if not isinstance(category_id, str) or not conn.execute(
            'SELECT 1 FROM categories WHERE restaurant_slug=? AND id=?', (slug, category_id)).fetchone():
        raise ApiError('دسته‌بندی انتخاب‌شده معتبر نیست.')
    name = clean_text(pick('name', base.get('name')), 'نام غذا', 1, 80)
    description = clean_text(pick('description', base.get('description')), 'توضیحات', 0, 400, multiline=True)
    ingredients = clean_text(pick('ingredients', base.get('ingredients')), 'ترکیبات', 0, 400, multiline=True)
    allergens = json.dumps(clean_allergens(pick('allergens', json_list(base.get('allergens')))), ensure_ascii=False)
    price = parse_price(pick('price', base.get('price')))
    icon = clean_icon(pick('icon', base.get('icon')))
    label = clean_text(pick('label', base.get('label') or ''), 'برچسب', 0, 30) or None
    visible = int(clean_bool(pick('visible', bool(base.get('visible'))), 'وضعیت نمایش'))
    position = clean_int(pick('position', base.get('position', 0)), 'ترتیب', 0, 99999)

    with conn:
        if item_id is None:
            cursor = conn.execute(
                'INSERT INTO items (restaurant_slug, category_id, name, description, ingredients, allergens, price, icon, label, visible, position)'
                ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                (slug, category_id, name, description, ingredients, allergens, price, icon, label, visible, position))
            return cursor.lastrowid
        conn.execute(
            'UPDATE items SET category_id=?, name=?, description=?, ingredients=?, allergens=?, price=?, icon=?,'
            ' label=?, visible=?, position=? WHERE restaurant_slug=? AND id=?',
            (category_id, name, description, ingredients, allergens, price, icon, label, visible, position, slug, item_id))
        return item_id


def delete_item(conn, slug, item_id):
    _item_row(conn, slug, item_id)
    with conn:
        conn.execute('DELETE FROM items WHERE restaurant_slug=? AND id=?', (slug, item_id))


def reorder_categories(conn, slug, order):
    """Set the display order of all categories in one step. `order` must list every category once."""
    if not isinstance(order, list) or not all(isinstance(entry, str) for entry in order):
        raise ApiError('ترتیب دسته‌بندی‌ها معتبر نیست.')
    current = [row['id'] for row in conn.execute('SELECT id FROM categories WHERE restaurant_slug=?', (slug,))]
    if len(set(order)) != len(order) or sorted(current) != sorted(order):
        raise ApiError('فهرست دسته‌بندی‌ها تغییر کرده است؛ صفحه را دوباره بارگذاری کنید.', 409)
    with conn:
        for position, category_id in enumerate(order):
            conn.execute('UPDATE categories SET position=? WHERE restaurant_slug=? AND id=?',
                         (position, slug, category_id))


_DIGIT_MAP = str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789')
_PRICE_NOISE_RE = re.compile('[\s\u200c\u200e\u200f\u202a-\u202e\u066c\u060c,\u2066-\u2069]')


def parse_price(value):
    """Toman price as an integer. Accepts 145000, '145000', '۱۴۵٬۰۰۰' and '145,000'.
    Refuses negative values, decimals and empty input."""
    if isinstance(value, bool):
        raise ApiError('قیمت باید عدد باشد.')
    if isinstance(value, int):
        text = str(value)
    elif isinstance(value, str):
        text = value
    else:
        raise ApiError('قیمت باید عدد باشد.')
    text = _PRICE_NOISE_RE.sub('', text.translate(_DIGIT_MAP)).strip()
    if not text:
        raise ApiError('قیمت الزامی است.')
    if text[0] in '-\u2212\u2013':
        raise ApiError('قیمت نمی‌تواند منفی باشد.')
    if not re.fullmatch(r'[0-9]+', text):
        raise ApiError('قیمت فقط باید شامل رقم باشد (بدون اعشار).')
    amount = int(text)
    if amount > MAX_PRICE:
        raise ApiError('قیمت از حد مجاز بیشتر است.')
    return amount


def update_rule(conn, slug, key, payload):
    row = conn.execute('SELECT * FROM theme_rules WHERE restaurant_slug=? AND key=?', (slug, key)).fetchone()
    if row is None:
        raise ApiError('برنامهٔ تم پیدا نشد.', 404)
    enabled = int(clean_bool(payload.get('enabled', bool(row['enabled'])), 'وضعیت برنامه'))
    calendar = payload.get('calendar', row['calendar'])
    theme = clean_theme(payload.get('theme', row['theme']))
    priority = clean_int(payload.get('priority', row['priority']), 'اولویت', *schedule.PRIORITY_RANGE)
    start_month = clean_int(payload.get('startMonth', row['start_month']), 'ماه شروع', 1, 12)
    start_day = clean_int(payload.get('startDay', row['start_day']), 'روز شروع', 1, 31)
    end_month = clean_int(payload.get('endMonth', row['end_month']), 'ماه پایان', 1, 12)
    end_day = clean_int(payload.get('endDay', row['end_day']), 'روز پایان', 1, 31)
    start_month, start_day, end_month, end_day = schedule.validate_window(
        calendar, start_month, start_day, end_month, end_day)
    with conn:
        conn.execute(
            'UPDATE theme_rules SET enabled=?, calendar=?, theme=?, priority=?, start_month=?, start_day=?,'
            ' end_month=?, end_day=?, updated_at=? WHERE restaurant_slug=? AND key=?',
            (enabled, calendar, theme, priority, start_month, start_day, end_month, end_day, now(), slug, key))


def user_password_hash(conn, user_id):
    row = conn.execute('SELECT password_hash FROM users WHERE id=?', (user_id,)).fetchone()
    return row['password_hash'] if row else None


def change_password(conn, user_id, new_hash, keep_digest):
    """Store the new hash and end every other session of this user; the current session stays."""
    with conn:
        conn.execute('UPDATE users SET password_hash=? WHERE id=?', (new_hash, user_id))
        conn.execute('DELETE FROM sessions WHERE user_id=? AND token_hash<>?', (user_id, keep_digest))


# ----- sessions ----------------------------------------------------------------

def user_by_username(conn, username):
    return conn.execute('SELECT * FROM users WHERE username=?', (username,)).fetchone()


def create_session(conn, digest, user_id, csrf_token, expires_at):
    with conn:
        conn.execute('DELETE FROM sessions WHERE expires_at <= ?', (now(),))
        conn.execute('INSERT INTO sessions (token_hash, user_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)',
                     (digest, user_id, csrf_token, expires_at))


def find_session(conn, digest):
    return conn.execute(
        'SELECT s.csrf_token, u.id AS user_id, u.username, u.restaurant_slug'
        ' FROM sessions s JOIN users u ON u.id = s.user_id'
        ' WHERE s.token_hash=? AND s.expires_at > ?',
        (digest, now())).fetchone()


def delete_session(conn, digest):
    with conn:
        conn.execute('DELETE FROM sessions WHERE token_hash=?', (digest,))
