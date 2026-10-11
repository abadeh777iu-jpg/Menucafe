// HTTP tests against a running Worker (started by scripts/run-api-tests.mjs).
// Mirrors the Python tests in tests/test_backend.py and tests/test_admin_features.py.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL;
const PASSWORD = process.env.OWNER_PASSWORD;
if (!BASE || !PASSWORD) throw new Error('run through scripts/run-api-tests.mjs');

class Client {
  constructor() {
    this.cookie = null;
    this.csrf = null;
  }

  async request(method, path, body, { headers = {}, raw = null } = {}) {
    const head = { ...headers };
    if (this.cookie) head.Cookie = `menu_session=${this.cookie}`;
    let payload;
    if (raw !== null) {
      payload = raw;
      head['Content-Type'] = head['Content-Type'] || 'application/json';
    } else if (body !== undefined) {
      payload = JSON.stringify(body);
      head['Content-Type'] = 'application/json';
    }
    const response = await fetch(`${BASE}${path}`, { method, headers: head, body: payload, redirect: 'manual' });
    const text = await response.text();
    let parsed = text;
    try { parsed = JSON.parse(text); } catch { /* html or empty */ }
    return { status: response.status, body: parsed, headers: response.headers };
  }

  async login(username, password = PASSWORD) {
    const response = await this.request('POST', '/api/auth/login', { username, password });
    if (response.status === 200) {
      const setCookie = response.headers.get('set-cookie') || '';
      this.cookie = setCookie.split(';')[0].split('=').slice(1).join('=');
      this.csrf = response.body.csrfToken;
    }
    return response;
  }

  write(method, path, body) {
    return this.request(method, path, body, { headers: { 'X-CSRF-Token': this.csrf || '' } });
  }
}

async function ownerClient(username, password = PASSWORD) {
  const client = new Client();
  const response = await client.login(username, password);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return client;
}

const uniq = () => Math.random().toString(36).slice(2, 8);
const publicMenu = async (slug) => (await new Client().request('GET', `/api/restaurants/${slug}/menu`)).body;

// ----- public site -------------------------------------------------------------------

describe('public site', () => {
  test('root redirects to the first restaurant; pages and files are served', async () => {
    const client = new Client();
    const root = await client.request('GET', '/');
    assert.equal(root.status, 302);
    assert.equal(root.headers.get('location'), '/aria');
    assert.equal((await client.request('GET', '/aria')).status, 200);
    assert.equal((await client.request('GET', '/aria/')).status, 200);
    assert.equal((await client.request('GET', '/bahar')).status, 200);
    assert.equal((await client.request('GET', '/styles.css')).status, 200);
    assert.equal((await client.request('GET', '/admin/aria')).status, 200);
  });

  test('unknown paths, reserved slugs and data files are not served', async () => {
    const client = new Client();
    assert.equal((await client.request('GET', '/nope')).status, 404);
    assert.equal((await client.request('GET', '/admin')).status, 404);
    assert.equal((await client.request('GET', '/admin/nope-restaurant')).status, 404);
    assert.equal((await client.request('GET', '/data/aria.json')).status, 404);
    assert.equal((await client.request('GET', '/server.py')).status, 404);
    assert.equal((await client.request('GET', '/wrangler.jsonc')).status, 404);
    assert.equal((await client.request('POST', '/aria', {})).status, 405);
  });

  test('public menu has the restaurant identity and only visible items', async () => {
    const menu = await publicMenu('aria');
    assert.equal(menu.restaurant.name, 'رستوران آریا');
    assert.equal(menu.restaurant.theme, 'winter'); // seed default; no schedule rule is enabled
    assert.ok(menu.categories.length >= 5);
    assert.ok(menu.items.every((item) => !('visible' in item)));
    const missing = await new Client().request('GET', '/api/restaurants/nope-restaurant/menu');
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error, 'رستوران پیدا نشد.');
  });

  test('menu requests are never cached', async () => {
    const response = await new Client().request('GET', '/api/restaurants/aria/menu');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });
});

// ----- sessions ----------------------------------------------------------------------

describe('sessions and login', () => {
  test('anonymous visitors get 401 on the owner API', async () => {
    const client = new Client();
    assert.equal((await client.request('GET', '/api/auth/me')).status, 401);
    assert.equal((await client.request('GET', '/api/admin/aria')).status, 401);
    assert.equal((await client.write('POST', '/api/admin/aria/items', { name: 'x' })).status, 401);
  });

  test('wrong credentials give the same generic message', async () => {
    const client = new Client();
    const unknown = await client.login('nobody.here');
    const wrong = await client.login('aria.owner', 'wrong-password-1');
    assert.equal(unknown.status, 401);
    assert.equal(wrong.status, 401);
    assert.equal(unknown.body.error, wrong.body.error);
  });

  test('login sets a strict, http-only cookie and returns a CSRF token', async () => {
    const client = new Client();
    const response = await client.login('aria.owner');
    assert.equal(response.status, 200);
    const cookie = response.headers.get('set-cookie');
    assert.match(cookie, /menu_session=/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    assert.match(cookie, /Secure/);
    assert.equal(response.body.user.restaurantSlug, 'aria');
    assert.ok(response.body.csrfToken);
  });

  test('logout ends the session', async () => {
    const client = await ownerClient('aria.owner');
    assert.equal((await client.write('POST', '/api/auth/logout')).status, 200);
    assert.equal((await client.request('GET', '/api/auth/me')).status, 401);
  });

  test('a forged session cookie is rejected', async () => {
    const client = new Client();
    client.cookie = 'forged-token-value';
    assert.equal((await client.request('GET', '/api/auth/me')).status, 401);
  });

  test('repeated failures lock the account for the window, even with the right password', async () => {
    const username = `throttle${uniq()}`;
    const creator = await ownerClient('aria.owner');
    const created = await creator.write('POST', '/api/admin/aria/users',
      { username, password: 'throttle-pass-1' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    for (let i = 0; i < 5; i += 1) {
      assert.equal((await new Client().login(username, 'wrong-password-1')).status, 401);
    }
    const blocked = await new Client().login(username, 'throttle-pass-1');
    assert.equal(blocked.status, 429);
  });
});

// ----- writes, CSRF and restaurant scope ---------------------------------------------

describe('owner writes', () => {
  let aria;
  let bahar;
  before(async () => {
    aria = await ownerClient('aria.owner');
    bahar = await ownerClient('bahar.owner');
  });

  test('writes need the CSRF token', async () => {
    const forged = await aria.request('POST', '/api/admin/aria/items', { name: 'x' },
      { headers: { 'X-CSRF-Token': 'forged' } });
    assert.equal(forged.status, 403);
    const missing = await aria.request('POST', '/api/admin/aria/items', { name: 'x' });
    assert.equal(missing.status, 403);
  });

  test('an owner cannot read or write another restaurant', async () => {
    assert.equal((await aria.request('GET', '/api/admin/bahar')).status, 403);
    assert.equal((await bahar.request('GET', '/api/admin/aria')).status, 403);
    const cases = [
      ['PUT', '/api/admin/bahar/theme', { theme: 'winter' }],
      ['PUT', '/api/admin/bahar/categories/order', { order: [] }],
      ['POST', '/api/admin/bahar/categories', { name: 'x', icon: 'bowl' }],
      ['POST', '/api/admin/bahar/items', { name: 'x', category: 'x', price: '1', icon: 'bowl' }],
      ['POST', '/api/admin/bahar/users', { username: 'cross.user', password: 'cross-pass-123' }],
    ];
    for (const [method, path, body] of cases) {
      const response = await aria.write(method, path, body);
      assert.equal(response.status, 403, `${method} ${path}`);
    }
  });

  test('item create, update, hide and delete, with price parsing', async () => {
    const created = await aria.write('POST', '/api/admin/aria/items', {
      name: `تست ${uniq()}`, category: 'starters', price: '۱۴۵٬۰۰۰', icon: 'bowl',
      allergens: ['شیر'], label: 'تازه',
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const item = created.body.items.find((i) => i.name.startsWith('تست'));
    assert.equal(item.price, 145000);
    assert.deepEqual(item.allergens, ['شیر']);

    const hidden = await aria.write('PUT', `/api/admin/aria/items/${item.id}`, { visible: false });
    assert.equal(hidden.status, 200);
    const menu = await publicMenu('aria');
    assert.ok(!menu.items.some((i) => i.id === item.id), 'hidden item must not be public');

    const deleted = await aria.write('DELETE', `/api/admin/aria/items/${item.id}`);
    assert.equal(deleted.status, 200);
    assert.equal((await aria.write('DELETE', `/api/admin/aria/items/${item.id}`)).status, 404);
  });

  test('item ids cannot cross restaurants', async () => {
    const ariaItem = (await publicMenu('aria')).items[0];
    const response = await bahar.write('PUT', `/api/admin/bahar/items/${ariaItem.id}`, { name: 'hijack' });
    assert.equal(response.status, 404);
    const menu = await publicMenu('aria');
    assert.ok(menu.items.some((i) => i.name === ariaItem.name));
  });

  test('item price and field rules are enforced on the server', async () => {
    const cases = [
      { price: '-1000' }, { price: '12.5' }, { price: '' }, { price: 'abc' },
      { price: 2000000000 }, { category: 'no-such-category' }, { icon: 'dragon' }, { name: '' },
    ];
    for (const change of cases) {
      const response = await aria.write('POST', '/api/admin/aria/items', {
        name: 'x', category: 'starters', price: '100', icon: 'bowl', ...change,
      });
      assert.equal(response.status, 400, JSON.stringify(change));
    }
  });

  test('category add, rename, reorder, and delete rules', async () => {
    const created = await aria.write('POST', '/api/admin/aria/categories', { name: `دسته ${uniq()}`, icon: 'cake' });
    assert.equal(created.status, 201);
    const added = created.body.categories.at(-1);
    const renamed = await aria.write('PUT', `/api/admin/aria/categories/${added.id}`, { name: 'تغییر نام', enabled: false });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.body.categories.find((c) => c.id === added.id).enabled, false);
    const ids = (await aria.request('GET', '/api/admin/aria')).body.categories.map((c) => c.id);
    const reordered = await aria.write('PUT', '/api/admin/aria/categories/order', { order: [...ids].reverse() });
    assert.equal(reordered.status, 200);
    const stale = await aria.write('PUT', '/api/admin/aria/categories/order', { order: ids.slice(1) });
    assert.equal(stale.status, 409);
    assert.equal((await aria.write('DELETE', `/api/admin/aria/categories/${added.id}`)).status, 200);
    const nonEmpty = await aria.write('DELETE', '/api/admin/aria/categories/starters');
    assert.equal(nonEmpty.status, 409);
  });

  test('theme choice, manual override and default theme', async () => {
    assert.equal((await aria.write('PUT', '/api/admin/aria/theme', { theme: 'winter' })).body.restaurant.manualTheme, 'winter');
    assert.equal((await aria.write('PUT', '/api/admin/aria/theme', { theme: null })).body.restaurant.manualTheme, null);
    assert.equal((await aria.write('PUT', '/api/admin/aria/theme', { theme: 'dragon' })).status, 400);
    assert.equal((await aria.write('PUT', '/api/admin/aria/default-theme', { theme: 'autumn' })).body.restaurant.defaultTheme, 'autumn');
    await aria.write('PUT', '/api/admin/aria/default-theme', { theme: 'summer' });
  });

  test('schedule rules are saved and validated', async () => {
    const ok = await aria.write('PUT', '/api/admin/aria/schedule/valentine', {
      enabled: true, calendar: 'gregorian', startMonth: 2, startDay: 13, endMonth: 2, endDay: 15, priority: 60, theme: 'valentine',
    });
    assert.equal(ok.status, 200);
    const rule = ok.body.schedule.rules.find((r) => r.key === 'valentine');
    assert.equal(rule.enabled, true);
    assert.match(rule.window, /فوریه/);
    const bad = await aria.write('PUT', '/api/admin/aria/schedule/valentine', { startMonth: 2, startDay: 30 });
    assert.equal(bad.status, 400);
    assert.equal((await aria.write('PUT', '/api/admin/aria/schedule/no-such-rule', {})).status, 404);
    await aria.write('PUT', '/api/admin/aria/schedule/valentine', { enabled: false });
  });

  test('profile text limits are enforced', async () => {
    const saved = await aria.write('PUT', '/api/admin/aria/profile', { headline: 'عنوان تازه' });
    assert.equal(saved.body.restaurant.name, 'رستوران آریا');
    const tooLong = await aria.write('PUT', '/api/admin/aria/profile', { headline: 'x'.repeat(121) });
    assert.equal(tooLong.status, 400);
    await aria.write('PUT', '/api/admin/aria/profile', { headline: 'طعم اصیل، حالِ خوب.' });
  });

  test('preview is owner-only and injects the chosen theme into the response only', async () => {
    const anonymous = await new Client().request('GET', '/admin/aria/preview?theme=winter');
    assert.equal(anonymous.status, 302);
    const owner = await aria.request('GET', '/admin/aria/preview?theme=winter');
    assert.equal(owner.status, 200);
    assert.match(owner.body, /MENU_PREVIEW_THEME="winter"/);
    assert.equal((await aria.request('GET', '/admin/aria/preview?theme=dragon')).status, 400);
    const publicPage = await new Client().request('GET', '/aria');
    assert.doesNotMatch(publicPage.body, /MENU_PREVIEW_THEME/);
  });
});

// ----- owner accounts (the new panel feature) ----------------------------------------

describe('owner accounts from the panel', () => {
  let aria;
  before(async () => { aria = await ownerClient('aria.owner'); });

  test('list shows only this restaurant and never password data', async () => {
    const view = (await aria.request('GET', '/api/admin/aria')).body;
    const names = view.users.map((u) => u.username);
    assert.ok(names.includes('aria.owner'));
    assert.ok(!names.includes('bahar.owner'));
    assert.doesNotMatch(JSON.stringify(view), /pbkdf2|password_hash/);
  });

  test('add a colleague who can only manage this restaurant', async () => {
    const username = `staff.${uniq()}`;
    const created = await aria.write('POST', '/api/admin/aria/users', { username, password: 'staff-pass-123' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.ok(created.body.users.some((u) => u.username === username));
    const staff = await ownerClient(username, 'staff-pass-123');
    assert.equal((await staff.request('GET', '/api/admin/aria')).status, 200);
    assert.equal((await staff.request('GET', '/api/admin/bahar')).status, 403);
  });

  test('add refuses duplicates, bad names and short passwords', async () => {
    const cases = [
      [{ username: 'ok.name', password: 'short' }, 400],
      [{ username: 'ab', password: 'long-enough-1' }, 400],
      [{ username: 'bad name!', password: 'long-enough-1' }, 400],
      [{ username: 'x'.repeat(41), password: 'long-enough-1' }, 400],
      [{ username: 'aria.owner', password: 'long-enough-1' }, 409],
      [{ username: 'bahar.owner', password: 'long-enough-1' }, 409],
      [{ username: 'no.password' }, 400],
    ];
    for (const [body, expected] of cases) {
      const response = await aria.write('POST', '/api/admin/aria/users', body);
      assert.equal(response.status, expected, JSON.stringify(body));
    }
  });

  test('usernames are stored lowercase', async () => {
    const name = `Mixed.${uniq()}`;
    const created = await aria.write('POST', '/api/admin/aria/users', { username: name, password: 'mixed-pass-123' });
    assert.equal(created.status, 201);
    assert.ok(created.body.users.some((u) => u.username === name.toLowerCase()));
  });

  test('reset a colleague password; their sessions end and the new password works', async () => {
    const username = `reset.${uniq()}`;
    await aria.write('POST', '/api/admin/aria/users', { username, password: 'first-pass-123' });
    const colleague = await ownerClient(username, 'first-pass-123');
    const view = (await aria.request('GET', '/api/admin/aria')).body;
    const id = view.users.find((u) => u.username === username).id;
    const reset = await aria.write('POST', `/api/admin/aria/users/${id}/password`, { password: 'second-pass-123' });
    assert.equal(reset.status, 200, JSON.stringify(reset.body));
    assert.equal((await colleague.request('GET', '/api/admin/aria')).status, 401);
    assert.equal((await new Client().login(username, 'first-pass-123')).status, 401);
    assert.equal((await new Client().login(username, 'second-pass-123')).status, 200);
  });

  test('reset rules: own password goes through the account panel; other restaurants are unreachable', async () => {
    const view = (await aria.request('GET', '/api/admin/aria')).body;
    const self = view.users.find((u) => u.username === 'aria.owner').id;
    assert.equal((await aria.write('POST', `/api/admin/aria/users/${self}/password`, { password: 'self-reset-789' })).status, 400);
    const bahar = (await (await ownerClient('bahar.owner')).request('GET', '/api/admin/bahar')).body;
    const other = bahar.users.find((u) => u.username === 'bahar.owner').id;
    assert.equal((await aria.write('POST', `/api/admin/aria/users/${other}/password`, { password: 'cross-pass-123' })).status, 404);
    assert.equal((await aria.write('POST', '/api/admin/aria/users/999999/password', { password: 'cross-pass-123' })).status, 404);
    assert.equal((await new Client().login('bahar.owner')).status, 200);
  });

  test('delete a colleague; the acting owner cannot delete themselves', async () => {
    const username = `gone.${uniq()}`;
    await aria.write('POST', '/api/admin/aria/users', { username, password: 'gone-pass-123' });
    const doomed = await ownerClient(username, 'gone-pass-123');
    const view = (await aria.request('GET', '/api/admin/aria')).body;
    const id = view.users.find((u) => u.username === username).id;
    const selfId = view.users.find((u) => u.username === 'aria.owner').id;
    assert.equal((await aria.write('DELETE', `/api/admin/aria/users/${selfId}`)).status, 400);
    const removed = await aria.write('DELETE', `/api/admin/aria/users/${id}`);
    assert.equal(removed.status, 200);
    assert.ok(!removed.body.users.some((u) => u.username === username));
    assert.equal((await doomed.request('GET', '/api/admin/aria')).status, 401);
    assert.equal((await new Client().login(username, 'gone-pass-123')).status, 401);
  });

  test('changing your own password ends your other sessions', async () => {
    const username = `pw.${uniq()}`;
    await aria.write('POST', '/api/admin/aria/users', { username, password: 'start-pass-123' });
    const first = await ownerClient(username, 'start-pass-123');
    const second = await ownerClient(username, 'start-pass-123');
    const wrong = await first.write('POST', '/api/admin/aria/account/password',
      { currentPassword: 'not-the-password', newPassword: 'brand-new-pass-1' });
    assert.equal(wrong.status, 403);
    const same = await first.write('POST', '/api/admin/aria/account/password',
      { currentPassword: 'start-pass-123', newPassword: 'start-pass-123' });
    assert.equal(same.status, 400);
    const changed = await first.write('POST', '/api/admin/aria/account/password',
      { currentPassword: 'start-pass-123', newPassword: 'brand-new-pass-1' });
    assert.equal(changed.status, 200);
    assert.equal((await second.request('GET', '/api/admin/aria')).status, 401);
    assert.equal((await first.request('GET', '/api/admin/aria')).status, 200);
    assert.equal((await new Client().login(username, 'start-pass-123')).status, 401);
    assert.equal((await new Client().login(username, 'brand-new-pass-1')).status, 200);
  });
});

// ----- request handling ---------------------------------------------------------------

describe('request handling', () => {
  test('malformed and oversized bodies are rejected cleanly', async () => {
    const aria = await ownerClient('aria.owner');
    const bad = await aria.request('PUT', '/api/admin/aria/profile', undefined,
      { headers: { 'X-CSRF-Token': aria.csrf, 'Content-Type': 'application/json' }, raw: '{not json' });
    assert.equal(bad.status, 400);
    const array = await aria.request('PUT', '/api/admin/aria/profile', undefined,
      { headers: { 'X-CSRF-Token': aria.csrf }, raw: '[1,2]' });
    assert.equal(array.status, 400);
    const huge = await aria.request('PUT', '/api/admin/aria/profile', undefined,
      { headers: { 'X-CSRF-Token': aria.csrf }, raw: JSON.stringify({ description: 'x'.repeat(70 * 1024) }) });
    assert.equal(huge.status, 413);
  });

  test('unknown API routes return a Persian 404', async () => {
    const response = await new Client().request('GET', '/api/nothing/here');
    assert.equal(response.status, 404);
    assert.equal(response.body.error, 'آدرس پیدا نشد.');
  });
});
