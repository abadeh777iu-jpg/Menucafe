// Browser checks for the restaurant admin panel. Uses its own temporary database and server.
// Run from anywhere:
//   CHROME_PATH=/path/to/chromium PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/admin-e2e.mjs
// Prints one PASS/FAIL line per check and exits non-zero when any check fails.
import {execFileSync, spawn} from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASSWORD = 'owner-pass-123';
const SHOTS = process.env.SHOTS_DIR || '';

const results = [];
function check(name, ok, detail = '') {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && detail ? ` — ${detail}` : ''}`);
}

const freePort = () => new Promise((resolve, reject) => {
  const srv = net.createServer();
  srv.listen(0, '127.0.0.1', () => {
    const {port} = srv.address();
    srv.close(() => resolve(port));
  });
  srv.on('error', reject);
});

// ----- temporary database and server ---------------------------------------------------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-e2e-'));
const db = path.join(tmp, 'admin.db');
const py = (args, input) => execFileSync('python3', ['server.py', '--db', db, ...args],
  {cwd: root, input, encoding: 'utf8'});
py(['init']);
py(['add-user', '--restaurant', 'aria', '--username', 'aria.owner', '--password-stdin'], `${PASSWORD}\n`);
py(['add-user', '--restaurant', 'bahar', '--username', 'bahar.owner', '--password-stdin'], `${PASSWORD}\n`);
const port = await freePort();
const server = spawn('python3', ['server.py', '--db', db, '--port', String(port)], {cwd: root, stdio: 'ignore'});
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 100; i += 1) {
  try { await fetch(`${base}/aria`); break; } catch { await new Promise(r => setTimeout(r, 100)); }
}

const api = async (slug) => (await fetch(`${base}/api/restaurants/${slug}/menu`)).json();
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--disable-gpu'], headless: true,
});

let dialogMode = 'accept';
const dialogs = [];
async function newPage(viewport = {width: 390, height: 844}) {
  const context = await browser.newContext({viewport, locale: 'fa-IR'});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error' && !/status of 4\d\d/.test(message.text())) errors.push(`console: ${message.text()}`);
  });
  page.on('dialog', async dialog => {
    dialogs.push(dialog.message());
    if (dialogMode === 'accept') await dialog.accept();
    else await dialog.dismiss();
  });
  return {context, page, errors};
}

async function login(page, username) {
  await page.goto(`${base}/admin/aria`, {waitUntil: 'networkidle'});
  if (username !== 'aria.owner') await page.goto(`${base}/admin/${username.split('.')[0]}`, {waitUntil: 'networkidle'});
  await page.fill('#login-form input[name=username]', username);
  await page.fill('#login-form input[name=password]', PASSWORD);
  await page.click('#login-form button[type=submit]');
  await page.waitForSelector('#dashboard:not([hidden])');
  await page.waitForTimeout(300);
}

const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const adminView = page => page.evaluate(async () => (await fetch('/api/admin/aria')).json());

try {
  // ----- mobile layout of the panel -------------------------------------------------------
  const widths = [320, 390, 768, 1280];
  for (const width of widths) {
    const {context, page, errors} = await newPage({width, height: 800});
    await login(page, 'aria.owner');
    check(`admin panel has no horizontal scroll at ${width}px`, await noOverflow(page));
    check(`admin panel has no page errors at ${width}px`, errors.length === 0, errors.join(' | '));
    if (SHOTS && (width === 390 || width === 1280)) {
      fs.mkdirSync(SHOTS, {recursive: true});
      await page.locator('#theme-panel').screenshot({path: path.join(SHOTS, `admin-theme-${width}.png`)});
      await page.locator('#schedule-panel').screenshot({path: path.join(SHOTS, `admin-schedule-${width}.png`)});
      for (const [name, selector] of [['categories', '#category-list'], ['items', '#item-list'], ['account', '#password-form'], ['settings', '#profile-form']]) {
        const box = page.locator(selector);
        if (await box.count()) await box.first().screenshot({path: path.join(SHOTS, `admin-${name}-${width}.png`)});
      }
    }
    await context.close();
  }

  const {context, page, errors} = await newPage({width: 390, height: 844});
  await login(page, 'aria.owner');

  // ----- categories -----------------------------------------------------------------------
  const before = await api('aria');
  const baharBefore = (await api('bahar')).restaurant.theme;
  const firstCategory = before.categories[0];
  const firstName = firstCategory.name;
  const activeItemsInFirst = before.items.filter(i => i.category === firstCategory.id).length;

  // Reorder: move the first category down, then back up.
  await page.getByRole('button', {name: `پایین بردن ${firstName}`}).click();
  await page.waitForTimeout(400);
  const moved = await api('aria');
  check('category can be moved down', moved.categories[1].id === firstCategory.id);
  await page.getByRole('button', {name: `بالا بردن ${firstName}`}).click();
  await page.waitForTimeout(400);
  check('category can be moved back up', (await api('aria')).categories[0].id === firstCategory.id);

  // Rename through the edit form.
  await page.locator('#category-list .row', {hasText: firstName}).getByRole('button', {name: 'ویرایش'}).click();
  await page.fill('#category-form input[name=name]', `${firstName} ویژه`);
  await page.click('#category-form button[type=submit]');
  await page.waitForFunction(() => /ذخیره شد/.test(document.querySelector('#category-form [data-msg]').textContent));
  check('category can be renamed', (await api('aria')).categories.some(c => c.name === `${firstName} ویژه`));

  // Disable: warns about active items, and the public menu then hides the category and its items.
  dialogs.length = 0;
  dialogMode = 'dismiss';
  await page.locator('#category-list .row', {hasText: `${firstName} ویژه`}).locator('input[type=checkbox]').click();
  await page.waitForTimeout(300);
  check('disabling a category with items asks for confirmation', dialogs.some(m => m.includes('غذای فعال')),
    dialogs.join(' | '));
  check('dismissing the warning keeps the category enabled',
    await page.locator('#category-list .row', {hasText: `${firstName} ویژه`}).locator('input[type=checkbox]').isChecked());
  dialogMode = 'accept';
  await page.locator('#category-list .row', {hasText: `${firstName} ویژه`}).locator('input[type=checkbox]').uncheck();
  await page.waitForTimeout(400);
  const publicAfter = await api('aria');
  check('disabled category is hidden from the public menu',
    !publicAfter.categories.some(c => c.id === firstCategory.id));
  check('items of a disabled category are not shown publicly',
    !publicAfter.items.some(i => i.category === firstCategory.id));
  const storedView = await adminView(page);
  const storedCategory = storedView.categories.find(c => c.id === firstCategory.id);
  check('disabled category is kept in the owner view with enabled=false',
    Boolean(storedCategory) && storedCategory.enabled === false);
  check('items of a disabled category are kept in storage',
    storedView.items.filter(i => i.category === firstCategory.id).length === activeItemsInFirst);
  const publicPageOff = await context.newPage();
  await publicPageOff.goto(`${base}/aria`, {waitUntil: 'networkidle'});
  check('public page does not show the disabled category name',
    !(await publicPageOff.textContent('body')).includes(`${firstName} ویژه`));
  await publicPageOff.close();
  // Re-enable.
  await page.locator('#category-list .row', {hasText: `${firstName} ویژه`}).locator('input[type=checkbox]').check();
  await page.waitForTimeout(400);
  check('re-enabled category returns to the public menu',
    (await api('aria')).categories.some(c => c.id === firstCategory.id));
  check('category item count is unchanged after disable and enable',
    (await api('aria')).items.filter(i => i.category === firstCategory.id).length === activeItemsInFirst);

  // ----- items: prices, double submits, unsaved changes -------------------------------------
  const target = (await api('aria')).items[0];
  await page.locator('#item-list .row', {hasText: target.name}).getByRole('button', {name: 'ویرایش'}).click();
  await page.fill('#item-form input[name=price]', '-5');
  await page.click('#item-form button[type=submit]');
  await page.waitForFunction(() => /منفی/.test(document.querySelector('#item-form [data-msg]').textContent));
  check('negative price is not stored', (await adminView(page)).items.find(i => i.id === target.id).price === target.price);

  await page.fill('#item-form input[name=price]', '۱۲۳٬۰۰۰');
  await page.fill('#item-form input[name=name]', `${target.name} تست`);
  await page.click('#item-form button[type=submit]');
  await page.waitForFunction(() => /ذخیره شد/.test(document.querySelector('#item-form [data-msg]').textContent));
  const edited = (await api('aria')).items.find(i => i.name === `${target.name} تست`);
  check('item name and Persian price format are saved', edited && edited.price === 123000,
    JSON.stringify(edited && edited.price));
  check('item form has ingredients and description fields',
    await page.isVisible('#item-form textarea[name=ingredients]') && await page.isVisible('#item-form textarea[name=description]'));

  // Double submit: two quick clicks create one item only.
  await page.click('#item-new');
  await page.fill('#item-form input[name=name]', 'غذای دوبار کلیک');
  await page.fill('#item-form input[name=price]', '50000');
  let postCount = 0;
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().includes('/items')) postCount += 1;
  });
  await page.locator('#item-form button[type=submit]').dblclick();
  await page.waitForFunction(() => /ذخیره شد/.test(document.querySelector('#admin-status').textContent));
  await page.waitForTimeout(500);
  const doubled = (await api('aria')).items.filter(i => i.name === 'غذای دوبار کلیک');
  check('double tap on save stores the item once', doubled.length === 1 && postCount === 1,
    `stored ${doubled.length}, posts ${postCount}`);

  // Unsaved changes: changing a row without saving and opening another item asks first.
  await page.locator('#item-list .row', {hasText: 'غذای دوبار کلیک'}).getByRole('button', {name: 'ویرایش'}).click();
  await page.fill('#item-form input[name=name]', 'نام نهایی نشده');
  dialogs.length = 0;
  dialogMode = 'dismiss';
  await page.locator('#item-list .row', {hasText: target.name}).getByRole('button', {name: 'ویرایش'}).click();
  await page.waitForTimeout(300);
  check('opening another item warns about unsaved changes', dialogs.some(m => m.includes('ذخیره‌نشده')),
    dialogs.join(' | '));
  check('dismissed warning keeps the typed value',
    (await page.inputValue('#item-form input[name=name]')) === 'نام نهایی نشده');
  dialogMode = 'accept';
  await page.click('#item-cancel');
  await page.waitForTimeout(200);
  check('cancel discards after confirmation', await page.locator('#item-form').isHidden());
  dialogMode = 'accept';

  // Delete the test item (confirmation accepted).
  await page.locator('#item-list .row', {hasText: 'غذای دوبار کلیک'}).getByRole('button', {name: 'ویرایش'}).click();
  await page.click('#item-delete');
  await page.waitForTimeout(400);
  check('item can be deleted after confirmation', !(await api('aria')).items.some(i => i.name === 'غذای دوبار کلیک'));

  // ----- schedule ---------------------------------------------------------------------------
  const valentine = page.locator('form[data-rule="valentine"]');
  await valentine.locator('input[name=enabled]').check();
  await valentine.locator('select[name=calendar]').selectOption('gregorian');
  await valentine.locator('select[name=startMonth]').selectOption('2');
  await valentine.locator('input[name=startDay]').fill('13');
  await valentine.locator('select[name=endMonth]').selectOption('2');
  await valentine.locator('input[name=endDay]').fill('15');
  await valentine.locator('button[type=submit]').click();
  await page.waitForFunction(() => /ذخیره شد/.test(document.querySelector('form[data-rule="valentine"] [data-msg]').textContent));
  await page.reload({waitUntil: 'networkidle'});
  await page.waitForSelector('#dashboard:not([hidden])');
  check('schedule change persists after reload',
    await page.locator('form[data-rule="valentine"] input[name=enabled]').isChecked());
  check('schedule window keeps Asia/Tehran label',
    (await page.textContent('form[data-rule="valentine"] [data-window]')).includes('Asia/Tehran'));

  // ----- theme and manual override ---------------------------------------------------------
  await page.locator('.theme-choice-wrap', {has: page.locator('[data-theme="halloween"]')})
    .locator('[data-theme="halloween"]').click();
  await page.waitForFunction(() => document.querySelector('#theme-clear') && !document.querySelector('#theme-clear').hidden);
  check('manual theme overrides the schedule', (await api('aria')).restaurant.theme === 'halloween');
  await page.click('#theme-clear');
  await page.waitForFunction(() => document.querySelector('#theme-clear').hidden);
  const afterClear = await api('aria');
  const adminAfterClear = await adminView(page);
  check('removing the override clears the stored manual theme', adminAfterClear.restaurant.manualTheme === null);
  check('after the override is removed the public theme follows the schedule or default',
    afterClear.restaurant.theme === adminAfterClear.activeTheme.theme && adminAfterClear.activeTheme.source !== 'manual',
    `${afterClear.restaurant.theme} / ${adminAfterClear.activeTheme.source}`);

  // Preview: owner-only iframe, does not change the saved theme.
  await page.locator('.theme-choice-wrap', {has: page.locator('[data-theme="winter"]')})
    .getByRole('button', {name: 'پیش‌نمایش'}).click();
  await page.waitForFunction(() => document.querySelector('#preview-frame').src.includes('theme=winter'));
  await page.waitForTimeout(800);
  const previewTheme = await page.evaluate(() => {
    const frame = document.querySelector('#preview-frame');
    return frame.contentDocument ? frame.contentDocument.documentElement.dataset.theme : null;
  });
  check('preview shows the chosen theme inside the owner panel', previewTheme === 'winter', String(previewTheme));
  check('preview does not change the saved theme', (await adminView(page)).restaurant.manualTheme === null);
  await page.click('#preview-close');

  // Spring theme exists and renders on the public page.
  await page.locator('.theme-choice-wrap', {has: page.locator('[data-theme="spring"]')})
    .locator('[data-theme="spring"]').click();
  await page.waitForFunction(() => document.querySelector('#theme-clear') && !document.querySelector('#theme-clear').hidden);
  const publicPage = await context.newPage();
  await publicPage.goto(`${base}/aria`, {waitUntil: 'networkidle'});
  check('spring theme is applied on the public menu', await publicPage.evaluate(() => document.documentElement.dataset.theme) === 'spring');
  await page.click('#theme-clear');
  await publicPage.close();

  // Default theme.
  await page.selectOption('#default-theme-form select[name=theme]', 'autumn');
  await page.click('#default-theme-form button[type=submit]');
  await page.waitForFunction(() => /ذخیره شد/.test(document.querySelector('#default-theme-form [data-msg]').textContent));
  check('default theme is saved', (await adminView(page)).restaurant.defaultTheme === 'autumn');

  // ----- password change ----------------------------------------------------------------------
  await page.fill('#password-form input[name=currentPassword]', 'wrong-password-99');
  await page.fill('#password-form input[name=newPassword]', 'brand-new-pass-1');
  await page.fill('#password-form input[name=confirmPassword]', 'brand-new-pass-1');
  await page.click('#password-form button[type=submit]');
  await page.waitForFunction(() => document.querySelector('#password-form [data-msg]').textContent.length > 0);
  check('wrong current password is refused', (await page.textContent('#password-form [data-msg]')).includes('فعلی'));

  await page.fill('#password-form input[name=currentPassword]', PASSWORD);
  await page.fill('#password-form input[name=newPassword]', 'brand-new-pass-1');
  await page.fill('#password-form input[name=confirmPassword]', 'brand-new-pass-2');
  await page.click('#password-form button[type=submit]');
  await page.waitForFunction(() => document.querySelector('#password-form [data-msg]').textContent.includes('یکسان'));
  check('mismatched new password is refused', true);

  await page.fill('#password-form input[name=confirmPassword]', 'brand-new-pass-1');
  await page.click('#password-form button[type=submit]');
  await page.waitForFunction(() => document.querySelector('#password-form [data-msg]').textContent.includes('تغییر کرد'));
  const reLogin = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({username: 'aria.owner', password: 'brand-new-pass-1'}),
  });
  check('new password works for a new sign in', reLogin.status === 200);

  // ----- public menu: no admin controls, readable with motion -----------------------------------
  const publicAria = await context.newPage();
  await publicAria.goto(`${base}/aria`, {waitUntil: 'networkidle'});
  check('public menu has no theme controls', (await publicAria.locator('#theme-list, [data-theme-choice], .theme-lab').count()) === 0);
  check('public menu shows no admin links', (await publicAria.locator('a[href*="/admin"]').count()) === 0);
  await publicAria.evaluate(() => { document.documentElement.dataset.theme = 'summer'; });
  await publicAria.setViewportSize({width: 320, height: 640});
  await publicAria.waitForTimeout(300);
  check('public menu has no horizontal scroll at 320px',
    await publicAria.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  const readable = await publicAria.evaluate(() => {
    const card = document.querySelector('.card h3');
    if (!card) return false;
    const rect = card.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return Boolean(hit && hit.closest('.card'));
  });
  check('food names are not covered by animation layers', readable);
  check('public page has no errors', errors.length === 0, errors.join(' | '));
  await publicAria.close();

  // ----- restaurant isolation in the browser -------------------------------------------------
  const crossStatus = await page.evaluate(async () => (await fetch('/api/admin/bahar/schedule/spring', {
    method: 'PUT', headers: {'Content-Type': 'application/json'}, body: '{"enabled":true}',
  })).status);
  check('owner gets 403 when changing another restaurant schedule', crossStatus === 403, `status ${crossStatus}`);
  const baharPublic = await api('bahar');
  check('changes for aria did not change bahar public theme', baharPublic.restaurant.theme === baharBefore);
  await context.close();
} catch (error) {
  check('suite ran to completion', false, error.stack || String(error));
} finally {
  await browser.close();
  server.kill();
  fs.rmSync(tmp, {recursive: true, force: true});
}

const failed = results.filter(ok => !ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
