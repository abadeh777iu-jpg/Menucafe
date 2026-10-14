// Automatic theme schedule: rules, Asia/Tehran clock and theme resolution. Port of backend/schedule.py.
//
// Resolution order (highest first):
//   1. manual override set by the manager (restaurants.manual_theme)
//   2. an enabled event rule whose window contains today (Asia/Tehran)
//   3. an enabled seasonal rule whose window contains today
//   4. the restaurant's default theme
// Inside one kind the highest `priority` wins; ties go to the rule that comes first in `position`
// and are reported as a conflict. A window whose start is later than its end wraps the new year.
import { ApiError } from './errors.js';
import { toJalali, JALALI_MONTH_NAMES, JALALI_MONTH_DAYS } from './jalali.js';

export const TIMEZONE_NAME = 'Asia/Tehran';
export const CALENDARS = ['jalali', 'gregorian'];
export const KINDS = ['event', 'seasonal'];
export const PRIORITY_RANGE = [0, 100];
const GREGORIAN_MONTH_NAMES = ['ژانویه', 'فوریه', 'مارس', 'آوریل', 'مه', 'ژوئن', 'ژوئیه', 'اوت', 'سپتامبر',
  'اکتبر', 'نوامبر', 'دسامبر'];
const GREGORIAN_MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// Default rules are created enabled: each theme switches on its own dates. A manager can still turn one off.
export const DEFAULT_RULES = [
  { key: 'spring', kind: 'seasonal', theme: 'spring', label: 'بهار', calendar: 'jalali', start: [1, 1], end: [3, 31], priority: 40 },
  { key: 'summer', kind: 'seasonal', theme: 'summer', label: 'تابستان', calendar: 'jalali', start: [4, 1], end: [6, 31], priority: 40 },
  { key: 'autumn', kind: 'seasonal', theme: 'autumn', label: 'پاییز', calendar: 'jalali', start: [7, 1], end: [9, 30], priority: 40 },
  { key: 'winter', kind: 'seasonal', theme: 'winter', label: 'زمستان', calendar: 'jalali', start: [10, 1], end: [12, 30], priority: 40 },
  // Nowruz: eve (Esfand 29 or 30) through Farvardin 13. Wraps the new year.
  { key: 'nowruz', kind: 'event', theme: 'nowruz', label: 'نوروز', calendar: 'jalali', start: [12, 29], end: [1, 13], priority: 60 },
  // Valentine's Day: Feb 13, Feb 14 (event day), Feb 15.
  { key: 'valentine', kind: 'event', theme: 'valentine', label: 'ولنتاین', calendar: 'gregorian', start: [2, 13], end: [2, 15], priority: 60 },
  // Yalda: Azar 29, Azar 30 (the night of Yalda), Dey 1.
  { key: 'yalda', kind: 'event', theme: 'yalda', label: 'شب یلدا', calendar: 'jalali', start: [9, 29], end: [10, 1], priority: 60 },
  // Halloween: Oct 30, Oct 31 (event day), Nov 1.
  { key: 'halloween', kind: 'event', theme: 'halloween', label: 'هالووین', calendar: 'gregorian', start: [10, 30], end: [11, 1], priority: 60 },
];

// Tehran wall-clock time as {gy, gm, gd, hour, minute}. `override` ("YYYY-MM-DDTHH:MM") is for tests only.
export function tehranNow(override = null) {
  if (override) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(override);
    if (!m) throw new Error('bad MENU_TEST_NOW');
    return { gy: +m[1], gm: +m[2], gd: +m[3], hour: +m[4], minute: +m[5] };
  }
  const parts = {};
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE_NAME, year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
  });
  for (const part of formatter.formatToParts(new Date())) parts[part.type] = part.value;
  return { gy: +parts.year, gm: +parts.month, gd: +parts.day, hour: +parts.hour, minute: +parts.minute };
}

const pad = (n, width) => String(n).padStart(width, '0');

export function todayViews(moment) {
  const [jy, jm, jd] = toJalali(moment.gy, moment.gm, moment.gd);
  return {
    gregorian: { month: moment.gm, day: moment.gd },
    jalali: [jy, jm, jd],
    gregorianText: `${pad(moment.gy, 4)}-${pad(moment.gm, 2)}-${pad(moment.gd, 2)}`,
    jalaliText: `${pad(jy, 4)}/${pad(jm, 2)}/${pad(jd, 2)}`,
    time: `${pad(moment.hour, 2)}:${pad(moment.minute, 2)}`,
    timezone: TIMEZONE_NAME,
  };
}

function inWindow(month, day, startMonth, startDay, endMonth, endDay) {
  const start = startMonth * 100 + startDay;
  const end = endMonth * 100 + endDay;
  const current = month * 100 + day;
  if (start <= end) return start <= current && current <= end;
  return current >= start || current <= end; // wraps around the new year
}

// `rule` uses DB column names: calendar, start_month, start_day, end_month, end_day.
export function ruleIsActive(rule, today) {
  let month;
  let day;
  if (rule.calendar === 'jalali') {
    month = today.jalali[1];
    day = today.jalali[2];
  } else {
    month = today.gregorian.month;
    day = today.gregorian.day;
  }
  return inWindow(month, day, rule.start_month, rule.start_day, rule.end_month, rule.end_day);
}

export function monthMaxDay(calendar, month) {
  if (calendar === 'jalali') return month === 12 ? 30 : JALALI_MONTH_DAYS[month - 1];
  return GREGORIAN_MONTH_DAYS[month - 1];
}

// rules: rows with DB column names plus `position`. Returns {theme, source, rule, conflict}.
export function resolve(moment, rules, defaultTheme, manualTheme) {
  if (manualTheme) return { theme: manualTheme, source: 'manual', rule: null, conflict: null };
  const today = todayViews(moment);
  const active = [...rules].sort((a, b) => a.position - b.position)
    .filter((rule) => rule.enabled && ruleIsActive(rule, today));
  for (const kind of KINDS) { // events beat seasonal rules regardless of priority numbers
    const group = active.filter((rule) => rule.kind === kind);
    if (!group.length) continue;
    const top = Math.max(...group.map((rule) => rule.priority));
    const tied = group.filter((rule) => rule.priority === top);
    const chosen = tied[0];
    let conflict = null;
    if (tied.length > 1) {
      conflict = {
        keys: tied.map((rule) => rule.key), chosen: chosen.key,
        message: 'دو برنامه با اولویت برابر فعال‌اند؛ برنامهٔ اول فهرست استفاده شد.',
      };
    }
    return { theme: chosen.theme, source: kind, rule: chosen.key, conflict };
  }
  return { theme: defaultTheme, source: 'default', rule: null, conflict: null };
}

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
export const faDigits = (value) => String(value).replace(/[0-9]/g, (d) => FA_DIGITS[+d]);

export function describeWindow(rule) {
  const names = rule.calendar === 'jalali' ? JALALI_MONTH_NAMES : GREGORIAN_MONTH_NAMES;
  const part = (month, day) => `${faDigits(day)} ${names[month - 1]}`;
  return `${part(rule.start_month, rule.start_day)} تا ${part(rule.end_month, rule.end_day)}`;
}

export function validateWindow(calendar, startMonth, startDay, endMonth, endDay) {
  if (!CALENDARS.includes(calendar)) throw new ApiError('تقویم انتخاب‌شده معتبر نیست.');
  for (const [label, month, day] of [['شروع', startMonth, startDay], ['پایان', endMonth, endDay]]) {
    if (!Number.isInteger(month) || month < 1 || month > 12) throw new ApiError(`ماه ${label} معتبر نیست.`);
    if (!Number.isInteger(day) || day < 1 || day > monthMaxDay(calendar, month)) {
      throw new ApiError(`روز ${label} برای این ماه معتبر نیست.`);
    }
  }
  return [startMonth, startDay, endMonth, endDay];
}
