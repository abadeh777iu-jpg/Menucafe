"""Persian (Jalali/Solar Hijri) calendar conversion. Standard library only.

Uses the arithmetic 2820-year cycle rule, which matches the official Iranian calendar
for years roughly 1200-1600 AH. Tests compare it with an independent reference library.
Dates are proleptic-Gregorian `datetime.date` values on the Gregorian side.
"""
from datetime import date

_BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394,
           2456, 3178]
JALALI_MONTH_NAMES = ('فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
                      'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند')
JALALI_MONTH_DAYS = (31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29)  # Esfand is 30 in leap years


def _div(a, b):
    """Integer division truncated toward zero (matches the reference algorithm)."""
    q = abs(a) // abs(b)
    return q if (a >= 0) == (b > 0) else -q


def _mod(a, b):
    """Remainder with a floor-based quotient, always in [0, b) for b > 0."""
    return a - b * (a // b)


def _jal_cal(jy):
    """Return (leap, gy, march): leap index, Gregorian year, and March day of Farvardin 1."""
    if jy < _BREAKS[0] or jy >= _BREAKS[-1]:
        raise ValueError('Jalali year out of supported range')
    gy = jy + 621
    leap_j = -14
    jp = _BREAKS[0]
    jump = 0
    for jm in _BREAKS[1:]:
        jump = jm - jp
        if jy < jm:
            break
        leap_j += _div(jump, 33) * 8 + _div(_mod(jump, 33), 4)
        jp = jm
    n = jy - jp
    leap_j += _div(n, 33) * 8 + _div(_mod(n, 33) + 3, 4)
    if _mod(jump, 33) == 4 and jump - n == 4:
        leap_j += 1
    leap_g = _div(gy, 4) - _div((_div(gy, 100) + 1) * 3, 4) - 150
    march = 20 + leap_j - leap_g
    if jump - n < 6:
        n = n - jump + _div(jump + 4, 33) * 33
    leap = _mod(_mod(n + 1, 33) - 1, 4)
    if leap == -1:
        leap = 4
    return leap, gy, march


def _g2d(gy, gm, gd):
    d = _div((gy + _div(gm - 8, 6) + 100100) * 1461, 4) + _div(153 * _mod(gm + 9, 12) + 2, 5) + gd - 34840408
    d = d - _div(_div(gy + 100100 + _div(gm - 8, 6), 100) * 3, 4) + 752
    return d


def _d2g(jdn):
    j = 4 * jdn + 139361631
    j = j + _div(_div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908
    i = _div(_mod(j, 1461), 4) * 5 + 308
    gd = _div(_mod(i, 153), 5) + 1
    gm = _mod(_div(i, 153), 12) + 1
    gy = _div(j, 1461) - 100100 + _div(8 - gm, 6)
    return gy, gm, gd


def jalali_month_length(jy, jm):
    if jm == 12:
        return 30 if _jal_cal(jy)[0] == 0 else 29
    return JALALI_MONTH_DAYS[jm - 1]


def to_jalali(value):
    """Convert a Gregorian date to (jy, jm, jd)."""
    jdn = _g2d(value.year, value.month, value.day)
    gy = _d2g(jdn)[0]
    jy = gy - 621
    leap, _, march = _jal_cal(jy)
    jdn1f = _g2d(gy, 3, march)
    k = jdn - jdn1f
    if k >= 0:
        if k <= 185:
            return jy, 1 + _div(k, 31), _mod(k, 31) + 1
        k -= 186
    else:
        jy -= 1
        k += 179
        if leap == 1:
            k += 1
    return jy, 7 + _div(k, 30), _mod(k, 30) + 1


def from_jalali(jy, jm, jd):
    """Convert a Jalali (jy, jm, jd) to a Gregorian date. Raises ValueError for invalid dates."""
    if not (1 <= jm <= 12) or not (1 <= jd <= jalali_month_length(jy, jm)):
        raise ValueError('invalid Jalali date')
    _, gy, march = _jal_cal(jy)
    jdn = _g2d(gy, 3, march) + (jm - 1) * 31 - _div(jm, 7) * (jm - 7) + jd - 1
    gy2, gm, gd = _d2g(jdn)
    return date(gy2, gm, gd)


def format_jalali(value):
    jy, jm, jd = to_jalali(value)
    return f'{jd} {JALALI_MONTH_NAMES[jm - 1]} {jy}'
