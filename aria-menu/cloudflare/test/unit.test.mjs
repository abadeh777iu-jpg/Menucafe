// Pure unit tests: calendar, theme schedule, validation helpers. No server needed.
// Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toJalali, fromJalali } from '../src/jalali.js';
import * as schedule from '../src/schedule.js';
import * as security from '../src/security.js';

const reference = JSON.parse(readFileSync(
  new URL('./fixtures/jalali-reference.json', import.meta.url), 'utf8'));

test('Jalali reference dates convert both ways', () => {
  for (const [gy, gm, gd, jy, jm, jd] of reference) {
    assert.deepEqual(toJalali(gy, gm, gd), [jy, jm, jd], `to Jalali ${gy}-${gm}-${gd}`);
    assert.deepEqual(fromJalali(jy, jm, jd), [gy, gm, gd], `from Jalali ${jy}/${jm}/${jd}`);
  }
});

test('invalid Jalali dates are refused', () => {
  assert.throws(() => fromJalali(1404, 12, 30)); // 1404 is not a leap year: Esfand has 29 days
  assert.throws(() => fromJalali(1405, 7, 31)); // Mehr has 30 days
  assert.throws(() => fromJalali(1405, 13, 1));
});

test('Tehran clock override is wall-clock time', () => {
  assert.deepEqual(schedule.tehranNow('2026-10-11T09:30'),
    { gy: 2026, gm: 10, gd: 11, hour: 9, minute: 30 });
});

const rule = (overrides) => ({
  calendar: 'gregorian', enabled: 1, priority: 50, position: 0,
  kind: 'event', theme: 'valentine', key: 'valentine', ...overrides,
});

test('event window contains the day before, the day, and the day after', () => {
  const valentine = rule({ start_month: 2, start_day: 13, end_month: 2, end_day: 15 });
  for (const [day, expected] of [[12, 'default'], [13, 'valentine'], [14, 'valentine'], [15, 'valentine'], [16, 'default']]) {
    const moment = schedule.tehranNow(`2026-02-${String(day).padStart(2, '0')}T10:00`);
    assert.equal(schedule.resolve(moment, [valentine], 'default', null).theme, expected, `day ${day}`);
  }
});

test('Nowruz window wraps the new year', () => {
  const nowruz = rule({ key: 'nowruz', theme: 'nowruz', calendar: 'jalali',
    start_month: 12, start_day: 29, end_month: 1, end_day: 13 });
  // 2026-03-20 is Farvardin 1, 1405 (inside); 2026-03-01 is Esfand 10, 1404 (outside).
  assert.equal(schedule.resolve(schedule.tehranNow('2026-03-20T10:00'), [nowruz], 'default', null).theme, 'nowruz');
  assert.equal(schedule.resolve(schedule.tehranNow('2026-03-01T10:00'), [nowruz], 'default', null).theme, 'default');
});

test('manual override beats events and seasons', () => {
  const winter = rule({ key: 'winter', kind: 'seasonal', theme: 'winter', calendar: 'jalali',
    start_month: 10, start_day: 1, end_month: 12, end_day: 30 });
  const result = schedule.resolve(schedule.tehranNow('2026-01-15T12:00'), [winter], 'default', 'autumn');
  assert.deepEqual(result, { theme: 'autumn', source: 'manual', rule: null, conflict: null });
});

test('an event beats a seasonal rule even with a lower priority number', () => {
  const seasonal = rule({ key: 'winter', kind: 'seasonal', theme: 'winter', priority: 90, calendar: 'gregorian',
    start_month: 1, start_day: 1, end_month: 12, end_day: 31 });
  const event = rule({ key: 'valentine', kind: 'event', theme: 'valentine', priority: 10, calendar: 'gregorian',
    start_month: 2, start_day: 13, end_month: 2, end_day: 15 });
  const result = schedule.resolve(schedule.tehranNow('2026-02-14T10:00'), [seasonal, event], 'default', null);
  assert.equal(result.theme, 'valentine');
  assert.equal(result.source, 'event');
});

test('equal priority in the same kind is a reported conflict; list order decides', () => {
  const a = rule({ key: 'a', theme: 'nowruz', position: 0, start_month: 2, start_day: 13, end_month: 2, end_day: 15 });
  const b = rule({ key: 'b', theme: 'yalda', position: 1, start_month: 2, start_day: 13, end_month: 2, end_day: 15 });
  const result = schedule.resolve(schedule.tehranNow('2026-02-14T10:00'), [b, a], 'default', null);
  assert.equal(result.theme, 'nowruz');
  assert.deepEqual(result.conflict.keys, ['a', 'b']);
});

test('disabled rules are ignored', () => {
  const off = rule({ enabled: 0, start_month: 2, start_day: 13, end_month: 2, end_day: 15 });
  assert.equal(schedule.resolve(schedule.tehranNow('2026-02-14T10:00'), [off], 'default', null).theme, 'default');
});

test('describeWindow uses Persian digits and month names', () => {
  const text = schedule.describeWindow({ calendar: 'jalali', start_month: 1, start_day: 1, end_month: 3, end_day: 31 });
  assert.equal(text, '۱ فروردین تا ۳۱ خرداد');
});

test('validateWindow refuses days that do not exist in the month', () => {
  assert.throws(() => schedule.validateWindow('jalali', 7, 31, 7, 30), /روز شروع/);
  assert.deepEqual(schedule.validateWindow('gregorian', 2, 29, 3, 1), [2, 29, 3, 1]);
  assert.throws(() => schedule.validateWindow('lunar', 1, 1, 1, 2), /تقویم/);
});

test('every default rule has a valid window', () => {
  for (const r of schedule.DEFAULT_RULES) {
    assert.doesNotThrow(() => schedule.validateWindow(r.calendar, r.start[0], r.start[1], r.end[0], r.end[1]), r.key);
  }
});

test('password iterations default to the Workers ceiling and cannot exceed it', () => {
  assert.equal(security.passwordIterations({}), 100000);
  assert.equal(security.passwordIterations({ PASSWORD_ITERATIONS: '100000' }), 100000);
  assert.throws(() => security.passwordIterations({ PASSWORD_ITERATIONS: '600000' }), /between 1000 and 100000/);
  assert.throws(() => security.passwordIterations({ PASSWORD_ITERATIONS: '999' }), /between 1000 and 100000/);
});

test('a hash above the Workers ceiling fails closed instead of throwing', async () => {
  const legacy = 'pbkdf2_sha256$600000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
  assert.equal(await security.verifyPassword('any-password-here', legacy), false);
});

test('a hash made at the ceiling verifies with the right password only', async () => {
  const stored = await security.hashPassword('correct-horse-battery', 100000);
  assert.equal(await security.verifyPassword('correct-horse-battery', stored), true);
  assert.equal(await security.verifyPassword('wrong-horse-battery', stored), false);
});
