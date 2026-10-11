// End-to-end checks for the multi-restaurant platform.
// Creates a temporary database and server, then drives a real browser.
//
//   npm install --no-save playwright && npx playwright install chromium
//   node tests/platform-e2e.mjs
//
// Set CHROME_PATH to use an existing Chromium binary instead of Playwright's download.
// Set PLAYWRIGHT_MODULE to the playwright entry point if it is not resolvable from this folder.
import {execFileSync, spawn} from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASSWORD = 'owner-pass-123';
const failures = [];
const passes = [];
const check = (name, ok, detail = '') => {
  (ok ? passes : failures).push(name);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
};

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const {port} = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForPort(port) {
  for (let i = 0; i < 200; i++) {
    const ok = await new Promise(resolve => {
      const socket = net.connect(port, '127.0.0.1');
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => resolve(false));
    });
    if (ok) return;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('server did not start');
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'menu-e2e-'));
const db = path.join(tmp, 'e2e.db');
const py = (args, input) => execFileSync('python3', ['server.py', '--db', db, ...args], {cwd: root, input, encoding: 'utf8'});
py(['init']);
py(['add-restaurant', '--slug', 'cafe-nila', '--name', 'کافه نیلا', '--english', 'Nila Cafe', '--theme', 'autumn']);
py(['add-user', '--restaurant', 'aria', '--username', 'aria.owner', '--password-stdin'], PASSWORD + '\n');
py(['add-user', '--restaurant', 'cafe-nila', '--username', 'nila.owner', '--password-stdin'], PASSWORD + '\n');

const port = await freePort();
const server = spawn('python3', ['server.py', '--db', db, '--port', String(port)], {cwd: root, stdio: 'ignore'});
const base = `http://127.0.0.1:${port}`;
await waitForPort(port);

const executablePath = process.env.CHROME_PATH || undefined;
const browser = await chromium.launch({executablePath, args: ['--no-sandbox', '--disable-gpu'], headless: true});

const apiMenu = async slug => (await fetch(`${base}/api/restaurants/${slug}/menu`)).json();
const visibleCount = async slug => (await apiMenu(slug)).items.length;

async function newPage(viewport = {width: 390, height: 844}) {
  const context = await browser.newContext({viewport, locale: 'fa-IR'});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error' && !/favicon/i.test(message.text()) && !/status of 4\d\d/.test(message.text())) {
      errors.push(`console: ${message.text()}`);
    }
  });
  return {context, page, errors};
}

try {
  // ---------- public menus ----------
  {
    const {context, page, errors} = await newPage();
    await page.goto(`${base}/aria`, {waitUntil: 'networkidle'});
    await page.waitForSelector('.card');
    const expected = await visibleCount('aria');
    check('aria renders every visible item', await page.locator('.card').count() === expected,
      `cards ${await page.locator('.card').count()} vs api ${expected}`);
    check('aria uses its saved theme (summer)', await page.evaluate(() => document.documentElement.dataset.theme) === 'summer');
    const picker = await page.locator('#theme-options, [data-theme-choice], .theme-lab, #effects-toggle, #live-theme-shortcuts').count();
    check('customer page has no theme controls', picker === 0, `found ${picker}`);
    check('no "حال‌وهوای منو" section on customer page', !(await page.textContent('body')).includes('حال‌وهوای منو'));

    await page.locator('#search').fill('zzzzzz-no-match');
    check('search without results shows reset button', await page.locator('#reset').count() === 1);
    await page.locator('#reset').click();
    await page.waitForFunction(n => document.querySelectorAll('.card').length === n, expected);
    check('reset restores full menu', await page.locator('.card').count() === expected);

    await page.locator('[data-category]').nth(1).click();
    await page.waitForTimeout(400);
    const filtered = await page.locator('.card').count();
    check('category filter narrows the menu', filtered > 0 && filtered < expected, `filtered ${filtered}`);

    await page.goto(`${base}/aria?theme=winter`, {waitUntil: 'networkidle'});
    check('?theme= URL parameter no longer changes the theme',
      await page.evaluate(() => document.documentElement.dataset.theme) === 'summer');

    // Summer animation: engine runs and paints.
    await page.waitForTimeout(1500);
    const summer = await page.evaluate(() => {
      const info = window.AtmosphereEffects?.inspect?.() || {};
      const canvas = document.querySelector('#atmosphere-canvas');
      let painted = false;
      if (canvas && !canvas.hidden && canvas.width) {
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 3; i < data.length; i += 4 * 97) { if (data[i] > 0) { painted = true; break; } }
      }
      return {running: info.running, particles: info.particles, kinds: info.kinds, painted, effects: document.documentElement.dataset.effects};
    });
    check('summer engine runs with sun particles', summer.running && summer.particles > 0 && (summer.kinds || []).includes('sun'), JSON.stringify(summer));
    check('summer canvas paints pixels', summer.painted, JSON.stringify(summer));
    check('customer page has no errors (aria)', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  {
    const {context, page, errors} = await newPage();
    await page.goto(`${base}/bahar`, {waitUntil: 'networkidle'});
    await page.waitForSelector('.card');
    check('bahar renders its own items', await page.locator('.card').count() === await visibleCount('bahar'));
    check('bahar uses its own theme (default)', await page.evaluate(() => document.documentElement.dataset.theme) === 'default');
    check('bahar page shows bahar name', (await page.textContent('#header')).includes('رستوران بهار'));
    check('bahar page has no errors', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  {
    const {context, page} = await newPage();
    await page.goto(`${base}/cafe-nila`, {waitUntil: 'networkidle'});
    check('new restaurant is served at its own URL', (await page.textContent('#header')).includes('کافه نیلا'));
    check('new restaurant uses its own theme (autumn)', await page.evaluate(() => document.documentElement.dataset.theme) === 'autumn');
    const unknown = await page.goto(`${base}/no-such-place`, {waitUntil: 'networkidle'});
    check('unknown restaurant shows not-found page', unknown.status() === 404);
    await context.close();
  }

  // ---------- owner panel ----------
  {
    const {context, page, errors} = await newPage({width: 1280, height: 900});
    await page.goto(`${base}/admin/aria`, {waitUntil: 'networkidle'});
    check('admin login form is shown to anonymous visitors', await page.locator('#login-view').isVisible());
    check('admin dashboard hidden before login', !(await page.locator('#dashboard').isVisible()));

    await page.fill('#login-form input[name=username]', 'aria.owner');
    await page.fill('#login-form input[name=password]', 'wrong-password-99');
    await page.click('#login-form button[type=submit]');
    await page.waitForFunction(() => document.querySelector('#login-form [data-msg]').textContent.length > 0);
    check('wrong password is refused with a generic message',
      (await page.textContent('#login-form [data-msg]')).includes('نام کاربری یا رمز عبور اشتباه است'));

    await page.fill('#login-form input[name=password]', PASSWORD);
    await page.click('#login-form button[type=submit]');
    await page.waitForSelector('#dashboard:not([hidden])');
    check('owner logs in and sees own restaurant', (await page.inputValue('#profile-form input[name=name]')) === 'رستوران آریا');
    check('owner session cookie is HttpOnly', (await context.cookies()).some(c => c.name === 'menu_session' && c.httpOnly));

    // Theme change is saved and shows on the public page.
    await page.click('#theme-list [data-theme="valentine"]');
    await page.waitForFunction(() => document.querySelector('#theme-list [data-theme="valentine"]').getAttribute('aria-checked') === 'true');
    check('theme change is stored for aria', (await apiMenu('aria')).restaurant.theme === 'valentine');
    check('theme change does not touch bahar', (await apiMenu('bahar')).restaurant.theme === 'default');
    await page.click('#theme-list [data-theme="summer"]');
    await page.waitForFunction(() => document.querySelector('#theme-list [data-theme="summer"]').getAttribute('aria-checked') === 'true');

    // Profile edit.
    await page.fill('#profile-form input[name=headline]', 'عنوان آزمایشی');
    await page.click('#profile-form button[type=submit]');
    await page.waitForFunction(() => document.querySelector('#profile-form [data-msg]').textContent.includes('ذخیره'));
    check('profile edit is stored', (await apiMenu('aria')).restaurant.headline === 'عنوان آزمایشی');
    await page.fill('#profile-form input[name=headline]', 'طعم اصیل، حالِ خوب.');
    await page.click('#profile-form button[type=submit]');
    await page.waitForFunction(() => document.querySelector('#profile-form [data-msg]').textContent.includes('ذخیره'));

    // Category create.
    const beforeCategories = (await page.locator('#category-list .row').count());
    await page.fill('#category-form input[name=name]', 'دسرهای ویژه');
    await page.selectOption('#category-form select[name=icon]', 'cake');
    await page.click('#category-form button[type=submit]');
    await page.waitForFunction(n => document.querySelectorAll('#category-list .row').length === n + 1, beforeCategories);
    check('category can be created', true);

    // Item create, visibility toggle, delete.
    const beforeItems = await visibleCount('aria');
    await page.click('#item-new');
    await page.fill('#item-form input[name=name]', 'تست غذای آزمایشی');
    const categoryValue = await page.locator('#item-form select[name=category] option', {hasText: 'دسرهای ویژه'}).getAttribute('value');
    await page.selectOption('#item-form select[name=category]', categoryValue);
    await page.fill('#item-form input[name=price]', '75000');
    await page.fill('#item-form input[name=allergens]', 'شیر، گردو');
    await page.click('#item-form button[type=submit]');
    await page.waitForFunction(() => /ذخیره شد/.test(document.querySelector('#admin-status').textContent));
    check('item can be created', (await visibleCount('aria')) === beforeItems + 1);
    const created = (await apiMenu('aria')).items.find(i => i.name === 'تست غذای آزمایشی');
    check('new item keeps allergen list', created && created.allergens.join('|') === 'شیر|گردو', JSON.stringify(created));

    await page.locator('#item-list .row', {hasText: 'تست غذای آزمایشی'}).locator('input[type=checkbox]').uncheck();
    await page.waitForTimeout(400);
    check('hiding an item removes it from the public menu', (await visibleCount('aria')) === beforeItems);
    await page.locator('#item-list .row', {hasText: 'تست غذای آزمایشی'}).locator('input[type=checkbox]').check();
    await page.waitForTimeout(400);
    check('showing an item restores it on the public menu', (await visibleCount('aria')) === beforeItems + 1);

    page.once('dialog', dialog => dialog.accept());
    await page.locator('#item-list .row', {hasText: 'تست غذای آزمایشی'}).getByRole('button', {name: 'ویرایش'}).click();
    await page.click('#item-delete');
    await page.waitForTimeout(400);
    check('item can be deleted', (await visibleCount('aria')) === beforeItems);

    // Category cleanup.
    await page.locator('#category-list .row', {hasText: 'دسرهای ویژه'}).getByRole('button', {name: 'ویرایش'}).click();
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#category-form button.danger').click();
    await page.waitForFunction(n => document.querySelectorAll('#category-list .row').length === n, beforeCategories);
    check('empty category can be deleted', true);

    // Cross-restaurant access from the browser is refused by the server.
    const crossStatus = await page.evaluate(async () => (await fetch('/api/admin/cafe-nila')).status);
    check('owner gets 403 for another restaurant API', crossStatus === 403, `status ${crossStatus}`);
    await page.goto(`${base}/admin/cafe-nila`, {waitUntil: 'networkidle'});
    check('owner opening another restaurant panel is refused in the UI',
      (await page.textContent('#login-view [data-msg]')).includes('دیگری'));

    await page.goto(`${base}/admin/aria`, {waitUntil: 'networkidle'});
    await page.waitForSelector('#dashboard:not([hidden])');
    await page.click('#admin-logout');
    await page.waitForSelector('#login-view:not([hidden])');
    check('logout returns to the login form', true);
    check('admin page has no errors', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ---------- responsive layout ----------
  const sizes = [
    ['320x568', 320, 568], ['375x667', 375, 667], ['390x844', 390, 844], ['430x932', 430, 932],
    ['768x1024', 768, 1024], ['1280x800', 1280, 800],
  ];
  for (const [label, width, height] of sizes) {
    for (const url of ['/aria', '/bahar']) {
      const {context, page, errors} = await newPage({width, height});
      await page.goto(`${base}${url}`, {waitUntil: 'networkidle'});
      await page.waitForSelector('.card');
      const layout = await page.evaluate(() => {
        const doc = document.documentElement;
        const top = document.querySelector('.topbar');
        const brand = document.querySelector('.brand');
        const sample = document.querySelector('.sample');
        const overlap = (a, b) => {
          if (!a || !b) return false;
          const r1 = a.getBoundingClientRect(), r2 = b.getBoundingClientRect();
          return r1.right > r2.left && r2.right > r1.left && r1.bottom > r2.top && r2.bottom > r1.top;
        };
        const sampleVisible = sample && getComputedStyle(sample).display !== 'none';
        return {
          overflow: doc.scrollWidth - window.innerWidth,
          topbar: top ? top.getBoundingClientRect().height : 0,
          brandOverlapsSample: sampleVisible && overlap(brand, sample),
          brandRight: brand ? brand.getBoundingClientRect().right : 0,
          cardMaxWidth: Math.max(...[...document.querySelectorAll('.card')].map(c => c.getBoundingClientRect().width)),
        };
      });
      check(`${url} no horizontal overflow at ${label}`, layout.overflow <= 1, `overflow ${layout.overflow}px`);
      check(`${url} compact header at ${label}`, layout.topbar > 0 && layout.topbar <= 64, `header ${layout.topbar}px`);
      check(`${url} header items do not overlap at ${label}`, !layout.brandOverlapsSample);
      check(`${url} cards fit the viewport at ${label}`, layout.cardMaxWidth <= width, `card ${layout.cardMaxWidth}px`);
      check(`${url} no errors at ${label}`, errors.length === 0, errors.join(' | '));
      await context.close();
    }
  }
  // admin layout on phones
  for (const [label, width, height] of [['320x568', 320, 568], ['390x844', 390, 844], ['768x1024', 768, 1024]]) {
    const {context, page} = await newPage({width, height});
    await page.goto(`${base}/admin/aria`, {waitUntil: 'networkidle'});
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`admin login has no horizontal overflow at ${label}`, overflow <= 1, `overflow ${overflow}px`);
    await context.close();
  }
} finally {
  await browser.close();
  server.kill();
  fs.rmSync(tmp, {recursive: true, force: true});
}

console.log(`\n${passes.length} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('Failed:\n - ' + failures.join('\n - '));
  process.exit(1);
}
