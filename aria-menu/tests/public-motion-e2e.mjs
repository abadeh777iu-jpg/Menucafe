// Browser checks for theme motion and readability on the public menu, using the owner preview
// route so every theme can be shown without changing the saved theme.
// Checks, for every theme at 390px and 1280px:
//   - reduced motion: no infinite CSS animation runs and the JS effects are off
//   - normal motion: spring and autumn sway (so the motion is real, not missing)
//   - the hero art never overlaps the heading or the description
//   - the first food name is reachable by hit-testing (no layer covers it)
//   - no horizontal scroll, no page errors, and no HTTP 4xx/5xx for page resources
// Run: CHROME_PATH=... PLAYWRIGHT_MODULE=... node tests/public-motion-e2e.mjs
import {execFileSync, spawn} from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASSWORD = 'owner-pass-123';
const THEMES = ['default', 'summer', 'winter', 'nowruz', 'yalda', 'valentine', 'halloween', 'spring', 'autumn'];
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && detail ? ` — ${detail}` : ''}`);
};

const freePort = () => new Promise((resolve, reject) => {
  const srv = net.createServer();
  srv.listen(0, '127.0.0.1', () => { const {port} = srv.address(); srv.close(() => resolve(port)); });
  srv.on('error', reject);
});

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-e2e-'));
const db = path.join(tmp, 'motion.db');
const py = (args, input) => execFileSync('python3', ['server.py', '--db', db, ...args], {cwd: root, input, encoding: 'utf8'});
py(['init']);
py(['add-user', '--restaurant', 'aria', '--username', 'aria.owner', '--password-stdin'], `${PASSWORD}\n`);
const port = await freePort();
const server = spawn('python3', ['server.py', '--db', db, '--port', String(port)], {cwd: root, stdio: 'ignore'});
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 100; i += 1) {
  try { await fetch(`${base}/aria`); break; } catch { await new Promise(r => setTimeout(r, 100)); }
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--disable-gpu'], headless: true,
});

// Counts CSS animations that repeat forever, which are the ones that would keep moving.
const infiniteAnimations = page => page.evaluate(() => document.getAnimations()
  .filter(a => a.effect && a.effect.getComputedTiming().iterations === Infinity && a.playState === 'running').length);

try {
  for (const reducedMotion of ['reduce', 'no-preference']) {
    for (const width of [390, 1280]) {
      const label = `${reducedMotion === 'reduce' ? 'reduced motion' : 'normal motion'}, ${width}px`;
      const context = await browser.newContext({viewport: {width, height: 900}, locale: 'fa-IR', reducedMotion});
      const page = await context.newPage();
      const errors = [];
      const badResponses = [];
      page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
      page.on('console', m => { if (m.type() === 'error' && !/status of 4\d\d/.test(m.text())) errors.push(m.text()); });
      page.on('response', r => { if (r.status() >= 400) badResponses.push(`${r.status()} ${new URL(r.url()).pathname}`); });

      // Sign in once per context; the preview route needs the owner session.
      await page.goto(`${base}/admin/aria`, {waitUntil: 'networkidle'});
      await page.fill('#login-form input[name=username]', 'aria.owner');
      await page.fill('#login-form input[name=password]', PASSWORD);
      await page.click('#login-form button[type=submit]');
      await page.waitForSelector('#dashboard:not([hidden])');
      badResponses.length = 0; // only responses from the public preview pages count below

      for (const theme of THEMES) {
        const tag = `${theme}, ${label}`;
        await page.goto(`${base}/admin/aria/preview?theme=${theme}`, {waitUntil: 'networkidle'});
        await page.waitForFunction(t => document.documentElement.dataset.theme === t, theme);
        await page.waitForTimeout(700);

        const info = await page.evaluate(() => {
          const rect = el => { const r = el.getBoundingClientRect(); return {l: r.left, r: r.right, t: r.top, b: r.bottom}; };
          const art = document.querySelector('.hero-art');
          const h1 = document.querySelector('h1');
          const desc = document.querySelector('#hero-description');
          const h3 = document.querySelector('.card h3');
          const overlap = (a, b) => !(a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t);
          let covered = true;
          let hitDesc = '';
          if (h3) {
            h3.scrollIntoView({block: 'center', behavior: 'instant'}); // site CSS smooth-scrolls; wait for the final position
            const r = h3.getBoundingClientRect();
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            covered = !(hit && hit.closest('.card') && hit.closest('.card').contains(h3));
            hitDesc = hit ? `${hit.tagName}.${String(hit.className && hit.className.baseVal !== undefined ? hit.className.baseVal : hit.className)}#${hit.id}` : 'null';
          }
          const spring = document.querySelector('.spring-bloom');
          const autumn = document.querySelector('.autumn-leaf');
          return {
            effects: document.documentElement.dataset.effects,
            artOverlapsHeading: Boolean(art && h1 && overlap(rect(art), rect(h1))),
            artOverlapsDescription: Boolean(art && desc && overlap(rect(art), rect(desc))),
            headingCovered: covered,
            hitDesc,
            overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
            swayName: spring ? getComputedStyle(spring).animationName : (autumn ? getComputedStyle(autumn).animationName : null),
          };
        });
        const infinite = await infiniteAnimations(page);
        if (process.env.SHOTS_DIR && reducedMotion === 'no-preference') {
          fs.mkdirSync(process.env.SHOTS_DIR, {recursive: true});
          await page.screenshot({path: path.join(process.env.SHOTS_DIR, `public-${theme}-${width}.png`), fullPage: false});
        }

        if (reducedMotion === 'reduce') {
          check(`no repeating animation runs (${tag})`, infinite === 0, `${infinite} running`);
          check(`effects are off (${tag})`, info.effects !== 'on', String(info.effects));
          if (theme === 'spring' || theme === 'autumn') {
            check(`sway animation is disabled (${tag})`, info.swayName === 'none', String(info.swayName));
          }
        } else if (theme === 'spring' || theme === 'autumn') {
          check(`${theme} sways when motion is allowed (${tag})`, info.swayName === 'themeSway' && infinite > 0,
            `name ${info.swayName}, infinite ${infinite}`);
        }
        check(`hero art does not overlap the heading (${tag})`, !info.artOverlapsHeading);
        check(`hero art does not overlap the description (${tag})`, !info.artOverlapsDescription);
        check(`first food name is not covered by an effect layer (${tag})`, !info.headingCovered, info.hitDesc);
        check(`no horizontal scroll (${tag})`, !info.overflow);
      }
      check(`no page errors (${label})`, errors.length === 0, errors.join(' | '));
      check(`no 4xx/5xx page resources (${label})`, badResponses.length === 0, [...new Set(badResponses)].join(', '));
      await context.close();
    }
  }
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
