// Persian (Jalali / Solar Hijri) calendar conversion. Port of backend/jalali.py.
// Uses the 2820-year arithmetic rule, which matches the official calendar for the supported range.
// All arithmetic stays on safe integers; `div` truncates toward zero like the Python reference.

const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394,
  2456, 3178];
export const JALALI_MONTH_NAMES = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
export const JALALI_MONTH_DAYS = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];

export function div(a, b) {
  const aa = Math.abs(a);
  const bb = Math.abs(b);
  const q = (aa - (aa % bb)) / bb;
  return (a >= 0) === (b > 0) ? q : -q;
}

export function mod(a, b) {
  return a - b * Math.floor(a / b);
}

function jalCal(jy) {
  if (jy < BREAKS[0] || jy >= BREAKS[BREAKS.length - 1]) {
    throw new RangeError('Jalali year out of supported range');
  }
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0];
  let jump = 0;
  for (const jm of BREAKS.slice(1)) {
    jump = jm - jp;
    if (jy < jm) break;
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

function g2d(gy, gm, gd) {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn) {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return [gy, gm, gd];
}

export function jalaliMonthLength(jy, jm) {
  if (jm === 12) return jalCal(jy).leap === 0 ? 30 : 29;
  return JALALI_MONTH_DAYS[jm - 1];
}

// Gregorian (gy, gm, gd) -> [jy, jm, jd]
export function toJalali(gy, gm, gd) {
  const jdn = g2d(gy, gm, gd);
  const gyResolved = d2g(jdn)[0];
  let jy = gyResolved - 621;
  const { leap, march } = jalCal(jy);
  const jdn1f = g2d(gyResolved, 3, march);
  let k = jdn - jdn1f;
  if (k >= 0) {
    if (k <= 185) return [jy, 1 + div(k, 31), mod(k, 31) + 1];
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (leap === 1) k += 1;
  }
  return [jy, 7 + div(k, 30), mod(k, 30) + 1];
}

// Jalali (jy, jm, jd) -> [gy, gm, gd]; throws RangeError for invalid dates.
export function fromJalali(jy, jm, jd) {
  if (!(jm >= 1 && jm <= 12) || !(jd >= 1 && jd <= jalaliMonthLength(jy, jm))) {
    throw new RangeError('invalid Jalali date');
  }
  const { gy, march } = jalCal(jy);
  const jdn = g2d(gy, 3, march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
  return d2g(jdn);
}
