-- Schema for the Menu Cafe Worker. Same tables as backend/store.py, plus login_throttle.
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
CREATE INDEX IF NOT EXISTS sessions_by_user ON sessions(user_id);
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
CREATE TABLE IF NOT EXISTS login_throttle (
  key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
