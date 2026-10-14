// Cloudflare Worker: public menus, owner panels and the JSON API. Port of server.py.
// Static files (index.html, app.js, ...) are served from the ASSETS binding; this file decides
// which page or file a path maps to, and handles every /api/ request.
import { ApiError } from './errors.js';
import * as store from './store.js';
import * as security from './security.js';
import * as schedule from './schedule.js';

const COOKIE_NAME = 'menu_session';
const SUPER_COOKIE = 'menu_super';
const MAX_BODY_BYTES = 64 * 1024;

// Same files the Python server exposes. Nothing else in aria-menu/ is public.
const STATIC = new Set([
  '/atmosphere-art.js', '/atmosphere-effects.js', '/atmosphere.css', '/winter-art.js', '/winter-effects.js',
  '/winter.css', '/seasonal-art.js', '/seasonal.css', '/themes.js', '/themes.css', '/styles.css', '/app.js',
  '/menu-data.js', '/welcome.js', '/welcome.css', '/lively.js', '/lively.css',
  '/assets/Vazirmatn.woff2', '/assets/OFL.txt',
]);
const PAGE_FILES = new Set(['/admin.html', '/admin.js', '/admin.css', '/super.html', '/super.js']);
const SLUG = '[a-z0-9][a-z0-9-]{1,39}';
const RESTAURANT_PAGE = new RegExp(`^/(${SLUG})/?$`);
const ADMIN_PAGE = new RegExp(`^/admin/(${SLUG})/?$`);
const PREVIEW_PAGE = new RegExp(`^/admin/(${SLUG})/preview/?$`);
const API_MENU = new RegExp(`^/api/restaurants/(${SLUG})/menu$`);
const SLUG_ONLY = new RegExp(`^${SLUG}$`);

const NOT_FOUND_HTML = `<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>منو پیدا نشد</title><link rel="stylesheet" href="/styles.css">
<main class="wrap empty"><h1>منو پیدا نشد</h1><p>این آدرس به هیچ رستورانی تعلق ندارد.</p>
<p><a href="/aria">منوی آریا</a> · <a href="/bahar">منوی بهار</a></p></main></html>`;

const BASE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

function headers(extra = {}) {
  return new Headers({ ...BASE_HEADERS, ...extra });
}

function json(status, payload, extra = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: headers({ 'Content-Type': 'application/json; charset=utf-8', ...extra }),
  });
}

function html(status, body, extra = {}) {
  return new Response(body, {
    status,
    headers: headers({ 'Content-Type': 'text/html; charset=utf-8', ...extra }),
  });
}

function redirect(location, extra = {}) {
  return new Response(null, { status: 302, headers: headers({ Location: location, ...extra }) });
}

function clientKey(request) {
  return request.headers.get('CF-Connecting-IP') || 'unknown';
}

function getCookie(request, name) {
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

function sessionCookie(value, maxAge) {
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}; Secure`;
}

// Body is read once; it must be a JSON object and no larger than MAX_BODY_BYTES.
async function readBody(request) {
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > MAX_BODY_BYTES) throw new ApiError('حجم درخواست بیش از حد مجاز است.', 413);
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    throw new ApiError('حجم درخواست بیش از حد مجاز است.', 413);
  }
  if (!text) return {};
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ApiError('داده‌های ارسالی معتبر نیستند.');
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new ApiError('داده‌های ارسالی معتبر نیستند.');
  }
  return data;
}

function checkedNewPassword(value) {
  const text = typeof value === 'string' ? value : '';
  const length = security.codePointLength(text);
  if (length < security.PASSWORD_MIN_LENGTH) {
    throw new ApiError(`رمز عبور باید حداقل ${security.PASSWORD_MIN_LENGTH} نویسه باشد.`);
  }
  if (length > security.PASSWORD_MAX_LENGTH) throw new ApiError('رمز عبور بیش از حد طولانی است.');
  return text;
}

async function assetResponse(env, request, path) {
  const assetRequest = new Request(new URL(path, request.url), {
    method: request.method === 'HEAD' ? 'HEAD' : 'GET',
  });
  const asset = await env.ASSETS.fetch(assetRequest);
  return new Response(asset.body, {
    status: asset.status,
    headers: headers({ 'Content-Type': asset.headers.get('Content-Type') || 'application/octet-stream' }),
  });
}

function notFound() {
  return html(404, NOT_FOUND_HTML);
}

// ----- sessions and access checks --------------------------------------------------

async function currentSession(env, request) {
  const token = getCookie(request, COOKIE_NAME);
  if (!token) return null;
  return store.findSession(env.DB, await security.tokenDigest(token));
}

// Checks session, then CSRF (for writes), then restaurant scope — in the same order as the Python server.
async function requireSession(env, request, { slug, csrf = false } = {}) {
  const session = await currentSession(env, request);
  if (!session) throw new ApiError('برای ادامه باید وارد شوید.', 401);
  if (csrf) {
    const sent = request.headers.get('X-CSRF-Token') || '';
    if (!security.sameText(sent, session.csrf_token)) {
      throw new ApiError('نشست فرم معتبر نیست؛ صفحه را دوباره بارگذاری کنید.', 403);
    }
  }
  if (slug !== undefined && session.restaurant_slug !== slug) {
    throw new ApiError('این حساب به این رستوران دسترسی ندارد.', 403);
  }
  return session;
}

// ----- routing -----------------------------------------------------------------------

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith('/api/')) return await api(request, env, url);
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response(null, { status: 405, headers: headers({ 'Content-Type': 'text/plain; charset=utf-8' }) });
      }
      return await page(request, env, url);
    } catch (error) {
      if (error instanceof ApiError) return json(error.status, { error: error.message });
      console.error(error);
      return json(500, { error: 'خطای داخلی سرور. دوباره تلاش کنید.' });
    }
  },
};

async function page(request, env, url) {
  const path = url.pathname;
  if (path === '/' || path === '/index.html') return redirect('/aria', { 'Content-Length': '0' });
  if (STATIC.has(path) || PAGE_FILES.has(path)) return assetResponse(env, request, path);

  let match = PREVIEW_PAGE.exec(path);
  if (match) return preview(request, env, url, match[1]);

  if (path === '/admin' || path === '/admin/') return assetResponse(env, request, '/admin.html');
  if (path === '/super' || path === '/super/') return assetResponse(env, request, '/super.html');

  match = ADMIN_PAGE.exec(path);
  if (match) {
    if (!(await store.restaurantExists(env.DB, match[1]))) return notFound();
    return assetResponse(env, request, '/admin.html');
  }

  match = RESTAURANT_PAGE.exec(path);
  if (match && !store.RESERVED_SLUGS.has(match[1]) && await store.restaurantExists(env.DB, match[1])) {
    return assetResponse(env, request, '/index.html');
  }
  return notFound();
}

// Owner-only preview of the public menu with a chosen theme. The theme is injected into this
// response only; the public page never reads it from the URL.
async function preview(request, env, url, slug) {
  const session = await currentSession(env, request);
  if (!session || session.restaurant_slug !== slug) return redirect(`/admin/${slug}`);
  const theme = url.searchParams.get('theme') || '';
  if (!store.THEME_IDS.has(theme)) throw new ApiError('تم انتخاب‌شده معتبر نیست.');
  const page = await env.ASSETS.fetch(new Request(new URL('/index.html', request.url)));
  const source = await page.text();
  const marker = `<script>window.MENU_PREVIEW_SLUG="${slug}";window.MENU_PREVIEW_THEME="${theme}";</script>`;
  const body = source.replace('</head>', `${marker}</head>`);
  return html(200, body, { 'X-Robots-Tag': 'noindex, nofollow' });
}

// ----- API ---------------------------------------------------------------------------

async function api(request, env, url) {
  const path = url.pathname;
  const method = request.method;

  const menuMatch = API_MENU.exec(path);
  if (menuMatch) {
    if (method !== 'GET') throw new ApiError('روش درخواست پشتیبانی نمی‌شود.', 405);
    const menu = await store.publicMenu(env.DB, menuMatch[1], schedule.tehranNow(env.MENU_TEST_NOW));
    if (!menu) throw new ApiError('رستوران پیدا نشد.', 404);
    return json(200, menu);
  }

  const parts = path.replace(/^\/+|\/+$/g, '').split('/');
  if (parts.length === 3 && parts[0] === 'api' && parts[1] === 'auth' && parts[2] === 'me' && method === 'GET') {
    return authMe(env, request);
  }
  if (parts.length === 3 && parts[0] === 'api' && parts[1] === 'auth' && parts[2] === 'login' && method === 'POST') {
    return login(env, request);
  }
  if (parts.length === 3 && parts[0] === 'api' && parts[1] === 'auth' && parts[2] === 'logout' && method === 'POST') {
    return logout(env, request);
  }
  if (parts.length === 3 && parts[0] === 'api' && parts[1] === 'auth' && parts[2] === 'license-login' && method === 'POST') {
    return licenseLogin(env, request);
  }
  if (parts.length >= 3 && parts[0] === 'api' && parts[1] === 'super') {
    return superApi(env, request, method, parts.slice(2));
  }
  if (parts.length >= 3 && parts[0] === 'api' && parts[1] === 'admin') {
    return adminApi(env, request, method, parts.slice(2));
  }
  throw new ApiError('آدرس پیدا نشد.', 404);
}

async function authMe(env, request) {
  const session = await requireSession(env, request);
  return json(200, {
    user: { username: displayName(session), restaurantSlug: session.restaurant_slug },
    csrfToken: session.csrf_token,
  });
}

async function login(env, request) {
  const data = await readBody(request);
  const username = (data.username ? String(data.username) : '').trim().toLowerCase();
  const password = data.password ? String(data.password) : '';
  if (!username || !password || security.codePointLength(password) > security.PASSWORD_MAX_LENGTH) {
    throw new ApiError('نام کاربری یا رمز عبور اشتباه است.', 401);
  }
  const key = `${clientKey(request)}|${username}`;
  const stamp = Math.floor(Date.now() / 1000);
  const window = security.LOGIN_FAILURE_WINDOW_SECONDS;
  if (await store.throttleBlocked(env.DB, key, security.LOGIN_FAILURE_LIMIT, window, stamp)) {
    throw new ApiError('تعداد تلاش‌ها زیاد است؛ چند دقیقه بعد دوباره امتحان کنید.', 429);
  }
  const iterations = security.passwordIterations(env);
  const user = await store.userByUsername(env.DB, username);
  const stored = user ? user.password_hash : await security.dummyHash(iterations);
  const valid = await security.verifyPassword(password, stored);
  if (!user || !valid) {
    await store.throttleRecord(env.DB, key, window, stamp);
    throw new ApiError('نام کاربری یا رمز عبور اشتباه است.', 401);
  }
  await store.throttleReset(env.DB, key);
  const token = security.newToken();
  const csrf = security.newToken();
  const expires = stamp + security.SESSION_TTL_SECONDS;
  await store.createSession(env.DB, await security.tokenDigest(token), user.id, csrf, expires);
  return json(200, {
    user: { username, restaurantSlug: user.restaurant_slug },
    csrfToken: csrf,
  }, { 'Set-Cookie': sessionCookie(token, security.SESSION_TTL_SECONDS) });
}

// Manager sign-in with the licence key that the seller issued for one restaurant.
async function licenseLogin(env, request) {
  const data = await readBody(request);
  const key = security.normalizeLicenseKey(data.licenseKey);
  const bucket = `${clientKey(request)}|license`;
  const stamp = Math.floor(Date.now() / 1000);
  const window = security.LOGIN_FAILURE_WINDOW_SECONDS;
  if (await store.throttleBlocked(env.DB, bucket, security.LOGIN_FAILURE_LIMIT, window, stamp)) {
    throw new ApiError('تعداد تلاش‌ها زیاد است؛ چند دقیقه بعد دوباره امتحان کنید.', 429);
  }
  const license = key ? await store.licenseByKeyDigest(env.DB, await security.tokenDigest(key)) : null;
  if (!license) {
    await store.throttleRecord(env.DB, bucket, window, stamp);
    throw new ApiError('کلید لایسنس معتبر نیست یا باطل شده است.', 401);
  }
  await store.throttleReset(env.DB, bucket);
  const token = security.newToken();
  const csrf = security.newToken();
  await store.createSession(env.DB, await security.tokenDigest(token), license.user_id, csrf,
    stamp + security.SESSION_TTL_SECONDS);
  await store.touchLicense(env.DB, license.id);
  return json(200, {
    user: { username: 'مدیر (با لایسنس)', restaurantSlug: license.restaurant_slug },
    csrfToken: csrf,
  }, { 'Set-Cookie': sessionCookie(token, security.SESSION_TTL_SECONDS) });
}

async function logout(env, request) {
  await requireSession(env, request, { csrf: true });
  const token = getCookie(request, COOKIE_NAME);
  await store.deleteSession(env.DB, await security.tokenDigest(token));
  return json(200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
}

async function adminApi(env, request, method, rest) {
  const slug = rest[0];
  if (!SLUG_ONLY.test(slug) || store.RESERVED_SLUGS.has(slug)) throw new ApiError('رستوران پیدا نشد.', 404);
  const tail = rest.slice(1);
  const writes = method === 'POST' || method === 'PUT' || method === 'DELETE';
  const db = env.DB;
  const moment = () => schedule.tehranNow(env.MENU_TEST_NOW);
  const view = async () => json(200, await store.adminView(db, slug, moment()));
  const viewCreated = async () => json(201, await store.adminView(db, slug, moment()));

  const session = await requireSession(env, request, { slug, csrf: writes });
  const id = (value) => (/^[0-9]+$/.test(value) ? Number(value) : null);

  if (method === 'GET' && tail.length === 0) return view();

  if (tail.length === 1 && tail[0] === 'profile' && method === 'PUT') {
    await store.updateProfile(db, slug, await readBody(request));
    return view();
  }
  if (tail.length === 1 && tail[0] === 'theme' && method === 'PUT') {
    const body = await readBody(request);
    if (!hasOwn(body, 'theme')) throw new ApiError('تم انتخاب‌شده معتبر نیست.');
    await store.setManualTheme(db, slug, body.theme);
    return view();
  }
  if (tail.length === 1 && tail[0] === 'default-theme' && method === 'PUT') {
    const body = await readBody(request);
    await store.setDefaultTheme(db, slug, body.theme === undefined ? null : body.theme);
    return view();
  }
  if (tail.length === 2 && tail[0] === 'schedule' && method === 'PUT') {
    await store.updateRule(db, slug, tail[1], await readBody(request));
    return view();
  }
  if (tail.length === 2 && tail[0] === 'account' && tail[1] === 'password' && method === 'POST') {
    await changeOwnPassword(env, request, session);
    return view();
  }

  if (tail.length === 1 && tail[0] === 'categories' && method === 'POST') {
    await store.saveCategory(db, slug, await readBody(request));
    return viewCreated();
  }
  if (tail.length === 2 && tail[0] === 'categories' && tail[1] === 'order' && method === 'PUT') {
    const body = await readBody(request);
    await store.reorderCategories(db, slug, body.order);
    return view();
  }
  if (tail.length === 2 && tail[0] === 'categories') {
    if (method === 'PUT') {
      await store.saveCategory(db, slug, await readBody(request), tail[1]);
      return view();
    }
    if (method === 'DELETE') {
      await store.deleteCategory(db, slug, tail[1]);
      return view();
    }
  }

  if (tail.length === 1 && tail[0] === 'items' && method === 'POST') {
    await store.saveItem(db, slug, await readBody(request));
    return viewCreated();
  }
  if (tail.length === 2 && tail[0] === 'items' && id(tail[1]) !== null) {
    if (method === 'PUT') {
      await store.saveItem(db, slug, await readBody(request), id(tail[1]));
      return view();
    }
    if (method === 'DELETE') {
      await store.deleteItem(db, slug, id(tail[1]));
      return view();
    }
  }

  if (tail.length === 1 && tail[0] === 'users' && method === 'POST') {
    const body = await readBody(request);
    const password = checkedNewPassword(body.password);
    await store.addUser(db, slug, body.username, await security.hashPassword(password, security.passwordIterations(env)));
    return viewCreated();
  }
  if (tail.length === 2 && tail[0] === 'users' && id(tail[1]) !== null && method === 'DELETE') {
    await store.deleteUser(db, slug, id(tail[1]), session.user_id);
    return view();
  }
  if (tail.length === 3 && tail[0] === 'users' && id(tail[1]) !== null && tail[2] === 'password' && method === 'POST') {
    const userId = id(tail[1]);
    const body = await readBody(request);
    if (userId === session.user_id) {
      throw new ApiError('برای تغییر رمز خودتان از بخش «حساب کاربری» استفاده کنید.', 400);
    }
    const password = checkedNewPassword(body.password);
    await store.resetUserPassword(db, slug, userId, session.user_id,
      await security.hashPassword(password, security.passwordIterations(env)));
    return view();
  }

  throw new ApiError('آدرس پیدا نشد.', 404);
}

function displayName(session) {
  return session.license_id ? 'مدیر (با لایسنس)' : session.username;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

async function changeOwnPassword(env, request, session) {
  if (session.license_id) throw new ApiError('حساب لایسنسی رمز عبور ندارد؛ برای ورود از کلید لایسنس استفاده کنید.', 403);
  const body = await readBody(request);
  const current = body.currentPassword ? String(body.currentPassword) : '';
  const next = body.newPassword ? String(body.newPassword) : '';
  const key = `${clientKey(request)}|password:${session.username}`;
  const stamp = Math.floor(Date.now() / 1000);
  const window = security.LOGIN_FAILURE_WINDOW_SECONDS;
  if (await store.throttleBlocked(env.DB, key, security.LOGIN_FAILURE_LIMIT, window, stamp)) {
    throw new ApiError('تعداد تلاش‌ها زیاد است؛ چند دقیقه بعد دوباره امتحان کنید.', 429);
  }
  const iterations = security.passwordIterations(env);
  const stored = (await store.userPasswordHash(env.DB, session.user_id)) || await security.dummyHash(iterations);
  if (!(await security.verifyPassword(current, stored))) {
    await store.throttleRecord(env.DB, key, window, stamp);
    throw new ApiError('رمز عبور فعلی درست نیست.', 403);
  }
  const length = security.codePointLength(next);
  if (length < security.PASSWORD_MIN_LENGTH) {
    throw new ApiError(`رمز عبور تازه باید حداقل ${security.PASSWORD_MIN_LENGTH} نویسه باشد.`);
  }
  if (length > security.PASSWORD_MAX_LENGTH) throw new ApiError('رمز عبور تازه بیش از حد طولانی است.');
  if (next === current) throw new ApiError('رمز عبور تازه باید با رمز فعلی متفاوت باشد.');
  await store.throttleReset(env.DB, key);
  const token = getCookie(request, COOKIE_NAME);
  await store.changePassword(env.DB, session.user_id, await security.hashPassword(next, iterations),
    await security.tokenDigest(token));
}

// ----- super-admin (the seller's panel) ----------------------------------------------

function superCookie(value, maxAge) {
  return `${SUPER_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}; Secure`;
}

async function requireSuper(env, request, { csrf = false } = {}) {
  const token = getCookie(request, SUPER_COOKIE);
  const session = token ? await store.findSuperSession(env.DB, await security.tokenDigest(token)) : null;
  if (!session) throw new ApiError('برای ادامه باید وارد شوید.', 401);
  if (csrf) {
    const sent = request.headers.get('X-CSRF-Token') || '';
    if (!security.sameText(sent, session.csrf_token)) {
      throw new ApiError('نشست فرم معتبر نیست؛ صفحه را دوباره بارگذاری کنید.', 403);
    }
  }
  return session;
}

async function superLogin(env, request) {
  const data = await readBody(request);
  const username = (data.username ? String(data.username) : '').trim().toLowerCase();
  const password = data.password ? String(data.password) : '';
  if (!username || !password || security.codePointLength(password) > security.PASSWORD_MAX_LENGTH) {
    throw new ApiError('نام کاربری یا رمز عبور اشتباه است.', 401);
  }
  const key = `${clientKey(request)}|super|${username}`;
  const stamp = Math.floor(Date.now() / 1000);
  const window = security.LOGIN_FAILURE_WINDOW_SECONDS;
  if (await store.throttleBlocked(env.DB, key, security.LOGIN_FAILURE_LIMIT, window, stamp)) {
    throw new ApiError('تعداد تلاش‌ها زیاد است؛ چند دقیقه بعد دوباره امتحان کنید.', 429);
  }
  const admin = await store.superAdminByUsername(env.DB, username);
  const stored = admin ? admin.password_hash : await security.dummyHash(security.passwordIterations(env));
  const valid = await security.verifyPassword(password, stored);
  if (!admin || !valid) {
    await store.throttleRecord(env.DB, key, window, stamp);
    throw new ApiError('نام کاربری یا رمز عبور اشتباه است.', 401);
  }
  await store.throttleReset(env.DB, key);
  const token = security.newToken();
  const csrf = security.newToken();
  await store.createSuperSession(env.DB, await security.tokenDigest(token), admin.id, csrf,
    stamp + security.SESSION_TTL_SECONDS);
  return json(200, { admin: { username }, csrfToken: csrf },
    { 'Set-Cookie': superCookie(token, security.SESSION_TTL_SECONDS) });
}

// First-time seller account, created from the browser. It works only when the owner has set the
// SUPER_SETUP_CODE secret (at least 12 characters, chosen by the owner) and no seller account exists yet.
const SETUP_CODE_MIN_LENGTH = 12;

function setupEnabled(env) {
  return typeof env.SUPER_SETUP_CODE === 'string' && env.SUPER_SETUP_CODE.length >= SETUP_CODE_MIN_LENGTH;
}

async function superSetup(env, request) {
  if (!setupEnabled(env)) throw new ApiError('این بخش فعال نیست.', 404);
  const data = await readBody(request);
  const stamp = Math.floor(Date.now() / 1000);
  const key = `${clientKey(request)}|super-setup`;
  const window = security.LOGIN_FAILURE_WINDOW_SECONDS;
  if (await store.throttleBlocked(env.DB, key, security.LOGIN_FAILURE_LIMIT, window, stamp)) {
    throw new ApiError('تعداد تلاش‌ها زیاد است؛ چند دقیقه بعد دوباره امتحان کنید.', 429);
  }
  const code = data.setupCode ? String(data.setupCode) : '';
  if (!security.sameText(code, env.SUPER_SETUP_CODE)) {
    await store.throttleRecord(env.DB, key, window, stamp);
    throw new ApiError('کد راه‌اندازی اشتباه است.', 401);
  }
  const username = store.cleanUsername(data.username);
  const password = data.password ? String(data.password) : '';
  const length = security.codePointLength(password);
  if (length < security.PASSWORD_MIN_LENGTH || length > security.PASSWORD_MAX_LENGTH) {
    throw new ApiError(`رمز عبور باید بین ${security.PASSWORD_MIN_LENGTH} تا ${security.PASSWORD_MAX_LENGTH} نویسه باشد.`, 400);
  }
  const hash = await security.hashPassword(password, security.passwordIterations(env));
  const created = await store.createFirstSuperAdmin(env.DB, username, hash, stamp);
  if (!created) throw new ApiError('حساب فروشنده قبلاً ساخته شده است.', 403);
  await store.throttleReset(env.DB, key);
  const admin = await store.superAdminByUsername(env.DB, username);
  const token = security.newToken();
  const csrf = security.newToken();
  await store.createSuperSession(env.DB, await security.tokenDigest(token), admin.id, csrf,
    stamp + security.SESSION_TTL_SECONDS);
  return json(201, { admin: { username }, csrfToken: csrf },
    { 'Set-Cookie': superCookie(token, security.SESSION_TTL_SECONDS) });
}

async function issueLicense(env, slug, label) {
  const key = security.newLicenseKey();
  const hint = key.slice(-4);
  await store.createLicense(env.DB, slug, label, await security.tokenDigest(security.normalizeLicenseKey(key)), hint);
  return { key, keyHint: hint };
}

async function superApi(env, request, method, rest) {
  const [head, ...tail] = rest;
  const db = env.DB;
  const numericId = (value) => (/^[0-9]+$/.test(value || '') ? Number(value) : null);

  if (head === 'login' && tail.length === 0 && method === 'POST') return superLogin(env, request);
  if (head === 'setup-status' && tail.length === 0 && method === 'GET') {
    return json(200, { needsSetup: setupEnabled(env) && (await store.superAdminCount(db)) === 0 });
  }
  if (head === 'setup' && tail.length === 0 && method === 'POST') return superSetup(env, request);
  if (head === 'me' && tail.length === 0 && method === 'GET') {
    const session = await requireSuper(env, request);
    return json(200, { admin: { username: session.username }, csrfToken: session.csrf_token });
  }

  const writes = method !== 'GET';
  await requireSuper(env, request, { csrf: writes });

  if (head === 'logout' && tail.length === 0 && method === 'POST') {
    await store.deleteSuperSession(db, await security.tokenDigest(getCookie(request, SUPER_COOKIE)));
    return json(200, { ok: true }, { 'Set-Cookie': superCookie('', 0) });
  }
  if (head === 'restaurants' && tail.length === 0 && method === 'GET') {
    return json(200, { restaurants: await store.listRestaurants(db) });
  }
  if (head === 'restaurants' && tail.length === 0 && method === 'POST') {
    const body = await readBody(request);
    const slug = await store.createRestaurant(db, body);
    return json(201, { slug, restaurants: await store.listRestaurants(db) });
  }
  if (head === 'restaurants' && tail.length === 2 && tail[1] === 'licenses') {
    if (method === 'GET') return json(200, { licenses: await store.listLicenses(db, tail[0]) });
    if (method === 'POST') {
      if (!store.SLUG_RE.test(tail[0])) throw new ApiError('رستوران پیدا نشد.', 404);
      const body = await readBody(request);
      const label = store.cleanText(body.label ?? '', 'برچسب لایسنس', 0, 60);
      const issued = await issueLicense(env, tail[0], label);
      return json(201, { ...issued, slug: tail[0], label, licenses: await store.listLicenses(db, tail[0]) });
    }
  }
  if (head === 'licenses' && tail.length === 2 && tail[1] === 'revoke' && method === 'POST') {
    const licenseId = numericId(tail[0]);
    if (licenseId === null) throw new ApiError('لایسنس پیدا نشد.', 404);
    await store.revokeLicense(db, licenseId);
    return json(200, { ok: true });
  }
  throw new ApiError('آدرس پیدا نشد.', 404);
}
