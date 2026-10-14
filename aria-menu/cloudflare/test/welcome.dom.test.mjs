// DOM test for the welcome notice (aria-menu/welcome.js). It needs jsdom, which the project does not
// install by default. Run it with:  npm i --no-save jsdom@24 && node --test test/welcome.dom.test.mjs
// If jsdom is missing, the tests are skipped instead of failing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let JSDOM = null;
try {
  ({ JSDOM } = await import('jsdom'));
} catch {
  JSDOM = null;
}
const skip = JSDOM ? false : 'jsdom is not installed';
const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../welcome.js'), 'utf8');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function freshPage(extra = '') {
  const dom = new JSDOM(`<!doctype html><html><body>${extra}</body></html>`, { url: 'https://example.test/aria', runScripts: 'outside-only', pretendToBeVisual: true });
  dom.window.eval(source);
  return dom.window;
}

const aria = { slug: 'aria', name: 'رستوران آریا', mark: 'آ', welcomeMessage: 'امروز چه طعمی در سر دارید؟' };

test('shows the restaurant welcome once per session, then dismisses it', { skip }, async () => {
  const win = freshPage();
  win.WelcomeNotice.show(aria);
  await wait(900);
  const root = win.document.getElementById('welcome-notice');
  assert.ok(root, 'notice element is created');
  assert.equal(root.hidden, false);
  assert.ok(root.classList.contains('is-open'));
  assert.equal(root.querySelector('.wn-title').textContent, 'خوش آمدید به رستوران آریا');
  assert.equal(root.querySelector('.wn-message').textContent, 'امروز چه طعمی در سر دارید؟');
  assert.equal(root.getAttribute('role'), 'status');

  root.querySelector('.wn-close').click();
  await wait(750);
  assert.equal(root.hidden, true, 'close button hides the notice');

  win.WelcomeNotice.show(aria);
  await wait(900);
  assert.equal(root.hidden, true, 'same restaurant is not shown again in this session');
});

test('another restaurant in the same session still gets its own welcome', { skip }, async () => {
  const win = freshPage();
  win.WelcomeNotice.show(aria);
  await wait(900);
  win.document.querySelector('#welcome-notice .wn-close').click();
  await wait(750);
  win.WelcomeNotice.show({ slug: 'bahar', name: 'رستوران بهار', mark: 'ب', welcomeMessage: '' });
  await wait(900);
  const root = win.document.getElementById('welcome-notice');
  assert.equal(root.hidden, false);
  assert.equal(root.querySelector('.wn-title').textContent, 'خوش آمدید به رستوران بهار');
  assert.equal(root.querySelector('.wn-message').textContent, 'رستوران بهار منوی امروز را برای شما آماده کرده است.');
});

test('the owner preview never shows the guest welcome', { skip }, async () => {
  const win = freshPage();
  win.MENU_PREVIEW_SLUG = 'aria';
  win.WelcomeNotice.show(aria);
  await wait(900);
  assert.equal(win.document.getElementById('welcome-notice'), null);
});

// Regression: every theme the manager can get from the date rules must mount without an error.
// (A missing artwork table once made spring and autumn throw, which blanked the whole menu.)
test('every theme mounts its hero art without an error', { skip }, () => {
  const base = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const dom = new JSDOM(`<!doctype html><html><head><meta name="theme-color" content="#000"></head><body>
    <svg class="hero-art" viewBox="0 0 10 10"></svg>
    <section id="occasion-intro"><p id="occasion-kicker"></p><h2 id="occasion-title"></h2><p id="occasion-subtitle"></p></section>
    <div id="occasion-banner"></div></body></html>`, { url: 'https://example.test/aria', runScripts: 'outside-only' });
  const win = dom.window;
  win.matchMedia = () => ({ matches: false, addEventListener() {} });
  for (const file of ['seasonal-art.js', 'winter-art.js', 'atmosphere-art.js', 'themes.js']) {
    win.eval(readFileSync(join(base, file), 'utf8'));
  }
  for (const theme of ['default', 'winter', 'nowruz', 'yalda', 'summer', 'valentine', 'halloween', 'autumn', 'spring']) {
    assert.doesNotThrow(() => win.MenuThemes.mount({ slug: 'aria', theme }), theme);
    assert.equal(win.document.documentElement.dataset.theme, theme);
    assert.ok(win.document.querySelector('.hero-art'), `${theme} has hero art`);
  }
});
