// D1 (SQLite) storage for menus, owner accounts, sessions and theme rules.
// Port of backend/store.py. Every query is scoped to a restaurant slug so one restaurant's
// data cannot be reached through another's URL. Multi-row writes use db.batch(), which is atomic.
import { ApiError } from './errors.js';
import * as schedule from './schedule.js';
import { codePointLength } from './security.js';

// Keep in sync with themes.js. Names are shown in the owner panel only.
export const THEMES = [
  ['default', 'پیش‌فرض', 'زیتونی و آرام'],
  ['nowruz', 'نوروز و بهار', 'سفرهٔ نو، شکوفهٔ نو'],
  ['yalda', 'شب یلدا', 'انار، هندوانه و خاطره'],
  ['winter', 'زمستان', 'برف، نور و آرامش'],
  ['summer', 'تابستان', 'آفتاب و نسیم دریا'],
  ['valentine', 'ولنتاین', 'رز و نور گرم'],
  ['halloween', 'هالووین', 'ماه، مه و فانوس'],
  ['autumn', 'پاییز', 'برگ و دارچین'],
  ['spring', 'بهار', 'شکوفه و سبزهٔ تازه'],
];
export const THEME_IDS = new Set(THEMES.map((theme) => theme[0]));

// Keep in sync with the icon paths in app.js.
export const ICONS = [
  ['bowl', 'کاسه'], ['plate', 'بشقاب'], ['rice', 'برنج'], ['glass', 'لیوان'],
  ['cake', 'کیک'], ['leaf', 'برگ'], ['kebab', 'کباب'], ['icecream', 'بستنی'],
];
export const ICON_IDS = new Set(ICONS.map((icon) => icon[0]));

export const RESERVED_SLUGS = new Set(['admin', 'api', 'assets', 'data', 'static', 'index']);
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
const USERNAME_RE = /^[a-z0-9_.-]{3,40}$/;
const MAX_PRICE = 1000000000;
const CONTROL_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;
const DIGIT_MAP = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};
const PRICE_NOISE_RE = /[\s\u200c\u200e\u200f\u202a-\u202e\u066c\u060c,\u2066-\u2069]/g;

export const now = () => Math.floor(Date.now() / 1000);
const hasKey = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const pick = (object, key, fallback) => (hasKey(object, key) ? object[key] : fallback);

// ----- database helpers ----------------------------------------------------------

async function all(db, sql, ...args) {
  return (await db.prepare(sql).bind(...args).all()).results;
}

async function one(db, sql, ...args) {
  return db.prepare(sql).bind(...args).first();
}

const stmt = (db, sql, ...args) => db.prepare(sql).bind(...args);

// ----- validation ----------------------------------------------------------------

export function cleanText(value, label, minLen, maxLen, multiline = false) {
  if (value === null || value === undefined) value = '';
  if (typeof value !== 'string') throw new ApiError(`${label} باید متن باشد.`);
  let text = value.replace(CONTROL_RE, '');
  if (!multiline) text = text.replace(/[\r\n\t]+/g, ' ');
  text = text.trim();
  const length = codePointLength(text);
  if (length < minLen) {
    throw new ApiError(minLen ? `${label} نمی‌تواند خالی باشد.` : `${label} معتبر نیست.`);
  }
  if (length > maxLen) throw new ApiError(`${label} نباید بیشتر از ${maxLen} نویسه باشد.`);
  return text;
}

export function cleanInt(value, label, low, high) {
  let number = value;
  if (typeof number === 'string' && /^\s*[0-9]+\s*$/.test(number)) number = Number(number.trim());
  if (typeof number !== 'number' || !Number.isInteger(number)) {
    throw new ApiError(`${label} باید عدد صحیح باشد.`);
  }
  if (number < low || number > high) throw new ApiError(`${label} باید بین ${low} و ${high} باشد.`);
  return number;
}

export function cleanBool(value, label) {
  if (typeof value !== 'boolean') throw new ApiError(`${label} باید درست یا نادرست باشد.`);
  return value;
}

export function cleanTheme(value) {
  if (!THEME_IDS.has(value)) throw new ApiError('تم انتخاب‌شده معتبر نیست.');
  return value;
}

export function cleanIcon(value, label = 'آیکن') {
  if (!ICON_IDS.has(value)) throw new ApiError(`${label} انتخاب‌شده معتبر نیست.`);
  return value;
}

export function cleanAllergens(value) {
  if (value === null || value === undefined || value === '') return [];
  if (!Array.isArray(value)) throw new ApiError('حساسیت‌زاها باید فهرست باشند.');
  if (value.length > 20) throw new ApiError('حداکثر ۲۰ مورد حساسیت‌زا می‌توان ثبت کرد.');
  return value.map((entry) => cleanText(entry, 'حساسیت‌زا', 1, 40));
}

export function cleanSlug(value) {
  if (typeof value !== 'string' || !SLUG_RE.test(value) || RESERVED_SLUGS.has(value)) {
    throw new ApiError('آدرس رستوران باید فقط شامل حروف لاتین کوچک، عدد و خط تیره باشد و بین ۲ تا ۴۰ نویسه باشد.');
  }
  return value;
}

export function cleanUsername(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!USERNAME_RE.test(normalized)) {
    throw new ApiError('نام کاربری باید ۳ تا ۴۰ نویسه از حروف لاتین، عدد، نقطه، خط تیره یا زیرخط باشد.');
  }
  return normalized;
}

export function jsonList(raw) {
  try {
    const value = JSON.parse(raw || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function parsePrice(value) {
  if (typeof value === 'boolean') throw new ApiError('قیمت باید عدد باشد.');
  let text;
  if (typeof value === 'number' && Number.isInteger(value)) text = String(value);
  else if (typeof value === 'string') text = value;
  else throw new ApiError('قیمت باید عدد باشد.');
  text = text.replace(/[۰-۹٠-٩]/g, (digit) => DIGIT_MAP[digit]).replace(PRICE_NOISE_RE, '').trim();
  if (!text) throw new ApiError('قیمت الزامی است.');
  if (text[0] === '-' || text[0] === '\u2212' || text[0] === '\u2013') {
    throw new ApiError('قیمت نمی‌تواند منفی باشد.');
  }
  if (!/^[0-9]+$/.test(text)) throw new ApiError('قیمت فقط باید شامل رقم باشد (بدون اعشار).');
  const amount = Number(text);
  if (amount > MAX_PRICE) throw new ApiError('قیمت از حد مجاز بیشتر است.');
  return amount;
}

// ----- schema-level helpers ----------------------------------------------------------

export async function restaurantExists(db, slug) {
  return (await one(db, 'SELECT 1 AS ok FROM restaurants WHERE slug=?', slug)) !== null;
}

export async function rulesFor(db, slug) {
  return all(db, 'SELECT * FROM theme_rules WHERE restaurant_slug=? ORDER BY position, key', slug);
}

export async function resolveTheme(db, slug, moment) {
  const row = await one(db, 'SELECT theme, manual_theme FROM restaurants WHERE slug=?', slug);
  if (!row) throw new ApiError('رستوران پیدا نشد.', 404);
  return schedule.resolve(moment, await rulesFor(db, slug), row.theme, row.manual_theme);
}

// ----- public reads ------------------------------------------------------------------

export async function publicMenu(db, slug, moment) {
  const row = await one(db, 'SELECT * FROM restaurants WHERE slug=?', slug);
  if (!row) return null;
  const categories = await all(db,
    'SELECT id, name, icon FROM categories WHERE restaurant_slug=? AND enabled=1 ORDER BY position, id', slug);
  const items = await all(db,
    'SELECT i.* FROM items i JOIN categories c ON c.restaurant_slug = i.restaurant_slug AND c.id = i.category_id'
    + ' WHERE i.restaurant_slug=? AND i.visible=1 AND c.enabled=1 ORDER BY i.position, i.id', slug);
  const active = await resolveTheme(db, slug, moment);
  return {
    restaurant: {
      slug: row.slug, name: row.name, englishName: row.english_name, mark: row.mark,
      headline: row.headline, note: row.note, description: row.description,
      footer: row.footer, theme: active.theme,
    },
    categories: categories.map((c) => ({ id: c.id, name: c.name, icon: c.icon })),
    items: items.map((i) => ({
      id: i.id, name: i.name, category: i.category_id, description: i.description,
      ingredients: i.ingredients, allergens: jsonList(i.allergens).length ? jsonList(i.allergens) : null,
      price: i.price, icon: i.icon, label: i.label || null,
    })),
  };
}

// ----- owner reads -------------------------------------------------------------------

export async function listUsers(db, slug) {
  const rows = await all(db, 'SELECT id, username, created_at FROM users WHERE restaurant_slug=? ORDER BY id', slug);
  return rows.map((r) => ({ id: r.id, username: r.username, createdAt: r.created_at }));
}

export async function adminView(db, slug, moment) {
  const row = await one(db, 'SELECT * FROM restaurants WHERE slug=?', slug);
  if (!row) throw new ApiError('رستوران پیدا نشد.', 404);
  const categories = await all(db,
    'SELECT id, name, icon, position, enabled FROM categories WHERE restaurant_slug=? ORDER BY position, id', slug);
  const items = await all(db, 'SELECT * FROM items WHERE restaurant_slug=? ORDER BY position, id', slug);
  const users = await listUsers(db, slug);
  const rules = await rulesFor(db, slug);
  const resolution = schedule.resolve(moment, rules, row.theme, row.manual_theme);
  const today = schedule.todayViews(moment);
  const themeNames = Object.fromEntries(THEMES.map((theme) => [theme[0], theme[1]]));
  return {
    restaurant: {
      slug: row.slug, name: row.name, englishName: row.english_name, mark: row.mark,
      headline: row.headline, note: row.note, description: row.description,
      footer: row.footer, theme: row.theme, defaultTheme: row.theme, manualTheme: row.manual_theme,
    },
    categories: categories.map((c) => ({
      id: c.id, name: c.name, icon: c.icon, position: c.position, enabled: !!c.enabled,
    })),
    items: items.map((i) => ({
      id: i.id, category: i.category_id, name: i.name, description: i.description,
      ingredients: i.ingredients, allergens: jsonList(i.allergens), price: i.price,
      icon: i.icon, label: i.label || '', visible: !!i.visible, position: i.position,
    })),
    users,
    themes: THEMES.map((t) => ({ id: t[0], name: t[1], hint: t[2] })),
    icons: ICONS.map((i) => ({ id: i[0], name: i[1] })),
    activeTheme: {
      theme: resolution.theme,
      themeName: themeNames[resolution.theme] || resolution.theme,
      source: resolution.source,
      rule: resolution.rule,
      conflict: resolution.conflict,
    },
    schedule: {
      timezone: schedule.TIMEZONE_NAME,
      today: { gregorian: today.gregorianText, jalali: today.jalaliText, time: today.time },
      rules: rules.map((r) => ({
        key: r.key, kind: r.kind, label: r.label, theme: r.theme,
        themeName: themeNames[r.theme] || r.theme, enabled: !!r.enabled,
        calendar: r.calendar, startMonth: r.start_month, startDay: r.start_day,
        endMonth: r.end_month, endDay: r.end_day, priority: r.priority,
        timezone: r.timezone, window: schedule.describeWindow(r),
        matchesToday: schedule.ruleIsActive(r, today),
      })),
    },
  };
}

// ----- profile and theme --------------------------------------------------------------

const PROFILE_LIMITS = {
  name: ['نام رستوران', 1, 80, false],
  englishName: ['نام لاتین', 0, 80, false],
  mark: ['نشان (حرف لوگو)', 1, 4, false],
  headline: ['عنوان اصلی', 1, 120, false],
  note: ['متن کوتاه بالای منو', 0, 160, false],
  description: ['توضیحات', 0, 400, true],
  footer: ['متن پایین صفحه', 0, 160, false],
};
const PROFILE_COLUMNS = {
  name: 'name', englishName: 'english_name', mark: 'mark', headline: 'headline',
  note: 'note', description: 'description', footer: 'footer',
};

export async function updateProfile(db, slug, payload) {
  const row = await one(db, 'SELECT * FROM restaurants WHERE slug=?', slug);
  if (!row) throw new ApiError('رستوران پیدا نشد.', 404);
  const values = {};
  for (const [key, [label, low, high, multiline]] of Object.entries(PROFILE_LIMITS)) {
    const column = PROFILE_COLUMNS[key];
    const raw = pick(payload, key, row[column]);
    values[column] = cleanText(raw, label, low, high, multiline);
  }
  const assignments = Object.keys(values).map((column) => `${column}=?`).join(', ');
  await db.prepare(`UPDATE restaurants SET ${assignments}, updated_at=? WHERE slug=?`)
    .bind(...Object.values(values), now(), slug).run();
}

export async function setManualTheme(db, slug, theme) {
  const value = theme === null ? null : cleanTheme(theme);
  const result = await run(db, 'UPDATE restaurants SET manual_theme=?, updated_at=? WHERE slug=?', value, now(), slug);
  if (result.meta.changes !== 1) throw new ApiError('رستوران پیدا نشد.', 404);
}

export async function setDefaultTheme(db, slug, theme) {
  const value = cleanTheme(theme);
  const result = await run(db, 'UPDATE restaurants SET theme=?, updated_at=? WHERE slug=?', value, now(), slug);
  if (result.meta.changes !== 1) throw new ApiError('رستوران پیدا نشد.', 404);
}

async function run(db, sql, ...args) {
  return db.prepare(sql).bind(...args).run();
}

// ----- categories ---------------------------------------------------------------------

async function categoryRow(db, slug, categoryId) {
  const row = await one(db, 'SELECT * FROM categories WHERE restaurant_slug=? AND id=?', slug, categoryId);
  if (!row) throw new ApiError('دسته‌بندی پیدا نشد.', 404);
  return row;
}

export async function saveCategory(db, slug, payload, categoryId = null) {
  if (categoryId === null) {
    if (!(await restaurantExists(db, slug))) throw new ApiError('رستوران پیدا نشد.', 404);
    const name = cleanText(pick(payload, 'name', null), 'نام دسته‌بندی', 1, 40);
    const icon = cleanIcon(pick(payload, 'icon', 'bowl'));
    const enabled = cleanBool(pick(payload, 'enabled', true), 'وضعیت دسته‌بندی') ? 1 : 0;
    const last = (await one(db,
      'SELECT COALESCE(MAX(position), -1) AS last FROM categories WHERE restaurant_slug=?', slug)).last;
    const position = cleanInt(pick(payload, 'position', last + 1), 'ترتیب', 0, 9999);
    let newId = null;
    for (let attempt = 0; attempt < 5 && newId === null; attempt += 1) {
      const candidate = `cat-${[...crypto.getRandomValues(new Uint8Array(4))]
        .map((b) => b.toString(16).padStart(2, '0')).join('')}`;
      if (!(await one(db, 'SELECT 1 AS ok FROM categories WHERE restaurant_slug=? AND id=?', slug, candidate))) {
        newId = candidate;
      }
    }
    if (newId === null) throw new ApiError('ساخت شناسه دسته‌بندی ناموفق بود؛ دوباره تلاش کنید.', 500);
    await run(db,
      'INSERT INTO categories (restaurant_slug, id, name, icon, position, enabled) VALUES (?, ?, ?, ?, ?, ?)',
      slug, newId, name, icon, position, enabled);
    return newId;
  }
  const row = await categoryRow(db, slug, categoryId);
  const name = cleanText(pick(payload, 'name', row.name), 'نام دسته‌بندی', 1, 40);
  const icon = cleanIcon(pick(payload, 'icon', row.icon));
  const position = cleanInt(pick(payload, 'position', row.position), 'ترتیب', 0, 9999);
  const enabled = cleanBool(pick(payload, 'enabled', !!row.enabled), 'وضعیت دسته‌بندی') ? 1 : 0;
  await run(db, 'UPDATE categories SET name=?, icon=?, position=?, enabled=? WHERE restaurant_slug=? AND id=?',
    name, icon, position, enabled, slug, categoryId);
  return categoryId;
}

export async function deleteCategory(db, slug, categoryId) {
  await categoryRow(db, slug, categoryId);
  const count = (await one(db,
    'SELECT COUNT(*) AS n FROM items WHERE restaurant_slug=? AND category_id=?', slug, categoryId)).n;
  if (count) throw new ApiError('این دسته‌بندی غذا دارد. ابتدا غذاهای آن را جابه‌جا یا حذف کنید.', 409);
  await run(db, 'DELETE FROM categories WHERE restaurant_slug=? AND id=?', slug, categoryId);
}

export async function reorderCategories(db, slug, order) {
  if (!Array.isArray(order) || !order.every((entry) => typeof entry === 'string')) {
    throw new ApiError('ترتیب دسته‌بندی‌ها معتبر نیست.');
  }
  const current = (await all(db, 'SELECT id FROM categories WHERE restaurant_slug=?', slug)).map((r) => r.id);
  const same = [...current].sort().join('\n') === [...order].sort().join('\n');
  if (new Set(order).size !== order.length || !same) {
    throw new ApiError('فهرست دسته‌بندی‌ها تغییر کرده است؛ صفحه را دوباره بارگذاری کنید.', 409);
  }
  await db.batch(order.map((categoryId, position) => stmt(db,
    'UPDATE categories SET position=? WHERE restaurant_slug=? AND id=?', position, slug, categoryId)));
}

// ----- items --------------------------------------------------------------------------

async function itemRow(db, slug, itemId) {
  const row = await one(db, 'SELECT * FROM items WHERE restaurant_slug=? AND id=?', slug, itemId);
  if (!row) throw new ApiError('غذا پیدا نشد.', 404);
  return row;
}

export async function saveItem(db, slug, payload, itemId = null) {
  let base;
  if (itemId === null) {
    if (!(await restaurantExists(db, slug))) throw new ApiError('رستوران پیدا نشد.', 404);
    for (const required of ['name', 'category', 'price']) {
      if (!hasKey(payload, required)) throw new ApiError('نام، دسته‌بندی و قیمت الزامی هستند.');
    }
    const last = (await one(db,
      'SELECT COALESCE(MAX(position), -1) AS last FROM items WHERE restaurant_slug=?', slug)).last;
    base = {
      position: last + 1, visible: 1, icon: 'bowl', allergens: '[]', description: '', ingredients: '', label: null,
    };
  } else {
    const row = await itemRow(db, slug, itemId);
    base = { ...row, visible: row.visible ? 1 : 0, allergens: JSON.stringify(jsonList(row.allergens)) };
  }

  const categoryId = pick(payload, 'category', base.category_id);
  if (typeof categoryId !== 'string' || !(await one(db,
    'SELECT 1 AS ok FROM categories WHERE restaurant_slug=? AND id=?', slug, categoryId))) {
    throw new ApiError('دسته‌بندی انتخاب‌شده معتبر نیست.');
  }
  const name = cleanText(pick(payload, 'name', base.name), 'نام غذا', 1, 80);
  const description = cleanText(pick(payload, 'description', base.description), 'توضیحات', 0, 400, true);
  const ingredients = cleanText(pick(payload, 'ingredients', base.ingredients), 'ترکیبات', 0, 400, true);
  const allergens = JSON.stringify(cleanAllergens(pick(payload, 'allergens', jsonList(base.allergens))));
  const price = parsePrice(pick(payload, 'price', base.price));
  const icon = cleanIcon(pick(payload, 'icon', base.icon));
  const label = cleanText(pick(payload, 'label', base.label || ''), 'برچسب', 0, 30) || null;
  const visible = cleanBool(pick(payload, 'visible', !!base.visible), 'وضعیت نمایش') ? 1 : 0;
  const position = cleanInt(pick(payload, 'position', base.position || 0), 'ترتیب', 0, 99999);

  if (itemId === null) {
    const result = await run(db,
      'INSERT INTO items (restaurant_slug, category_id, name, description, ingredients, allergens, price, icon, label,'
      + ' visible, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      slug, categoryId, name, description, ingredients, allergens, price, icon, label, visible, position);
    return result.meta.last_row_id;
  }
  await run(db,
    'UPDATE items SET category_id=?, name=?, description=?, ingredients=?, allergens=?, price=?, icon=?,'
    + ' label=?, visible=?, position=? WHERE restaurant_slug=? AND id=?',
    categoryId, name, description, ingredients, allergens, price, icon, label, visible, position, slug, itemId);
  return itemId;
}

export async function deleteItem(db, slug, itemId) {
  await itemRow(db, slug, itemId);
  await run(db, 'DELETE FROM items WHERE restaurant_slug=? AND id=?', slug, itemId);
}

// ----- schedule rules -----------------------------------------------------------------

export async function updateRule(db, slug, key, payload) {
  const row = await one(db, 'SELECT * FROM theme_rules WHERE restaurant_slug=? AND key=?', slug, key);
  if (!row) throw new ApiError('برنامهٔ تم پیدا نشد.', 404);
  const enabled = cleanBool(pick(payload, 'enabled', !!row.enabled), 'وضعیت برنامه') ? 1 : 0;
  const calendar = pick(payload, 'calendar', row.calendar);
  const theme = cleanTheme(pick(payload, 'theme', row.theme));
  const priority = cleanInt(pick(payload, 'priority', row.priority), 'اولویت', ...schedule.PRIORITY_RANGE);
  const startMonth = cleanInt(pick(payload, 'startMonth', row.start_month), 'ماه شروع', 1, 12);
  const startDay = cleanInt(pick(payload, 'startDay', row.start_day), 'روز شروع', 1, 31);
  const endMonth = cleanInt(pick(payload, 'endMonth', row.end_month), 'ماه پایان', 1, 12);
  const endDay = cleanInt(pick(payload, 'endDay', row.end_day), 'روز پایان', 1, 31);
  const [sm, sd, em, ed] = schedule.validateWindow(calendar, startMonth, startDay, endMonth, endDay);
  await run(db,
    'UPDATE theme_rules SET enabled=?, calendar=?, theme=?, priority=?, start_month=?, start_day=?,'
    + ' end_month=?, end_day=?, updated_at=? WHERE restaurant_slug=? AND key=?',
    enabled, calendar, theme, priority, sm, sd, em, ed, now(), slug, key);
}

// ----- owner accounts -----------------------------------------------------------------

export async function userPasswordHash(db, userId) {
  const row = await one(db, 'SELECT password_hash FROM users WHERE id=?', userId);
  return row ? row.password_hash : null;
}

export async function userByUsername(db, username) {
  return one(db, 'SELECT * FROM users WHERE username=?', username);
}

// Owner-panel account creation. The new user can only act on this restaurant.
export async function addUser(db, slug, username, passwordHash) {
  const name = cleanUsername(username);
  if (!(await restaurantExists(db, slug))) throw new ApiError('رستوران پیدا نشد.', 404);
  if (await one(db, 'SELECT 1 AS ok FROM users WHERE username=?', name)) {
    throw new ApiError('این نام کاربری قبلاً ثبت شده است.', 409);
  }
  try {
    await run(db, 'INSERT INTO users (username, password_hash, restaurant_slug, created_at) VALUES (?, ?, ?, ?)',
      name, passwordHash, slug, now());
  } catch (error) {
    if (String(error && error.message).includes('UNIQUE')) {
      throw new ApiError('این نام کاربری قبلاً ثبت شده است.', 409);
    }
    throw error;
  }
}

async function userInRestaurant(db, slug, userId) {
  if (!(await one(db, 'SELECT 1 AS ok FROM users WHERE id=? AND restaurant_slug=?', userId, slug))) {
    throw new ApiError('کاربر پیدا نشد.', 404);
  }
}

// Sets another owner's password and ends all of that owner's sessions.
export async function resetUserPassword(db, slug, userId, actingUserId, passwordHash) {
  if (userId === actingUserId) {
    throw new ApiError('برای تغییر رمز خودتان از بخش «حساب کاربری» استفاده کنید.', 400);
  }
  await userInRestaurant(db, slug, userId);
  await db.batch([
    stmt(db, 'UPDATE users SET password_hash=? WHERE id=? AND restaurant_slug=?', passwordHash, userId, slug),
    stmt(db, 'DELETE FROM sessions WHERE user_id=?', userId),
  ]);
}

// Removes another owner of this restaurant. The acting owner is never deleted here, so one always remains.
export async function deleteUser(db, slug, userId, actingUserId) {
  if (userId === actingUserId) throw new ApiError('حساب خودتان را از اینجا نمی‌توانید حذف کنید.', 400);
  await userInRestaurant(db, slug, userId);
  await db.batch([
    stmt(db, 'DELETE FROM sessions WHERE user_id=?', userId),
    stmt(db, 'DELETE FROM users WHERE id=? AND restaurant_slug=?', userId, slug),
  ]);
}

// Stores the new hash and ends every other session of this user; the current session stays.
export async function changePassword(db, userId, passwordHash, keepDigest) {
  await db.batch([
    stmt(db, 'UPDATE users SET password_hash=? WHERE id=?', passwordHash, userId),
    stmt(db, 'DELETE FROM sessions WHERE user_id=? AND token_hash<>?', userId, keepDigest),
  ]);
}

// ----- sessions -----------------------------------------------------------------------

export async function createSession(db, digest, userId, csrfToken, expiresAt) {
  await db.batch([
    stmt(db, 'DELETE FROM sessions WHERE expires_at <= ?', now()),
    stmt(db, 'INSERT INTO sessions (token_hash, user_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)',
      digest, userId, csrfToken, expiresAt),
  ]);
}

export async function findSession(db, digest) {
  return one(db,
    'SELECT s.csrf_token, u.id AS user_id, u.username, u.restaurant_slug'
    + ' FROM sessions s JOIN users u ON u.id = s.user_id'
    + ' WHERE s.token_hash=? AND s.expires_at > ?',
    digest, now());
}

export async function deleteSession(db, digest) {
  await run(db, 'DELETE FROM sessions WHERE token_hash=?', digest);
}

// ----- login throttle (persisted in D1 so it holds across Worker isolates) ----------------

export async function throttleBlocked(db, key, limit, windowSeconds, stamp) {
  const row = await one(db, 'SELECT failures, window_start FROM login_throttle WHERE key=?', key);
  return !!row && stamp - row.window_start < windowSeconds && row.failures >= limit;
}

export async function throttleRecord(db, key, windowSeconds, stamp) {
  await run(db,
    'INSERT INTO login_throttle (key, failures, window_start) VALUES (?1, 1, ?2)'
    + ' ON CONFLICT(key) DO UPDATE SET'
    + ' failures = CASE WHEN ?2 - window_start >= ?3 THEN 1 ELSE failures + 1 END,'
    + ' window_start = CASE WHEN ?2 - window_start >= ?3 THEN ?2 ELSE window_start END',
    key, stamp, windowSeconds);
}

export async function throttleReset(db, key) {
  await run(db, 'DELETE FROM login_throttle WHERE key=?', key);
}
