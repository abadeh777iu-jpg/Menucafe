-- Super-admin accounts (the seller's panel) and restaurant licence keys (the manager's sign-in).
-- A licence gets one hidden row in users (license_id set) so its sessions use the same checks as owner sessions.
CREATE TABLE IF NOT EXISTS super_admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS super_sessions (
  token_hash TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES super_admins(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS licenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_slug TEXT NOT NULL REFERENCES restaurants(slug) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT '',
  key_hash TEXT NOT NULL UNIQUE,
  key_hint TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS licenses_by_restaurant ON licenses(restaurant_slug);
ALTER TABLE users ADD COLUMN license_id INTEGER REFERENCES licenses(id) ON DELETE CASCADE;
