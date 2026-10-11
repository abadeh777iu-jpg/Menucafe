"""Automatic theme schedule: rules, Asia/Tehran clock and theme resolution. Standard library only.

Resolution order (highest first):
  1. manual override set by the manager (restaurants.manual_theme)
  2. an enabled event rule whose window contains today (Asia/Tehran)
  3. an enabled seasonal rule whose window contains today
  4. the restaurant's default theme

Inside one kind, the rule with the highest `priority` wins. If two matching rules of the
same kind share the highest priority, the rule that comes first in the fixed list order
(`position`) is used, and the result is flagged as a conflict so the manager can see it.

A rule window is a start and an end (month, day) in the rule's calendar ('jalali' or
'gregorian'). A window whose start is later than its end wraps around the new year.
"""
from datetime import date, datetime, timedelta, timezone

from . import jalali

TIMEZONE_NAME = 'Asia/Tehran'
try:  # tzdata ships with most systems; Iran has no DST since 2022, so a fixed offset is a safe fallback.
    from zoneinfo import ZoneInfo
    TEHRAN = ZoneInfo(TIMEZONE_NAME)
except Exception:  # pragma: no cover - depends on the host's tz database
    TEHRAN = timezone(timedelta(hours=3, minutes=30), TIMEZONE_NAME)

CALENDARS = ('jalali', 'gregorian')
KINDS = ('event', 'seasonal')
PRIORITY_RANGE = (0, 100)
GREGORIAN_MONTH_NAMES = ('ژانویه', 'فوریه', 'مارس', 'آوریل', 'مه', 'ژوئن', 'ژوئیه', 'اوت', 'سپتامبر',
                         'اکتبر', 'نوامبر', 'دسامبر')

# key, kind, theme, label, calendar, start (month, day), end (month, day), priority, list position.
# Default rules are created disabled, so a restaurant only changes theme after its manager opts in.
DEFAULT_RULES = (
    ('spring', 'seasonal', 'spring', 'بهار', 'jalali', (1, 1), (3, 31), 40),
    ('summer', 'seasonal', 'summer', 'تابستان', 'jalali', (4, 1), (6, 31), 40),
    ('autumn', 'seasonal', 'autumn', 'پاییز', 'jalali', (7, 1), (9, 30), 40),
    ('winter', 'seasonal', 'winter', 'زمستان', 'jalali', (10, 1), (12, 30), 40),
    # Nowruz: eve (Esfand 29 or 30) through Farvardin 13. Wraps the new year.
    ('nowruz', 'event', 'nowruz', 'نوروز', 'jalali', (12, 29), (1, 13), 60),
    # Valentine's Day: Feb 13 (one day before), Feb 14 (event day), Feb 15 (day after).
    ('valentine', 'event', 'valentine', 'ولنتاین', 'gregorian', (2, 13), (2, 15), 60),
    # Yalda: Azar 29, Azar 30 (the night of Yalda), Dey 1.
    ('yalda', 'event', 'yalda', 'شب یلدا', 'jalali', (9, 29), (10, 1), 60),
    # Halloween: Oct 30, Oct 31 (event day), Nov 1.
    ('halloween', 'event', 'halloween', 'هالووین', 'gregorian', (10, 30), (11, 1), 60),
)
RULE_KEYS = frozenset(rule[0] for rule in DEFAULT_RULES)


def tehran_now(override=None):
    """Current time in Asia/Tehran. `override` is an ISO string used only by tests."""
    if override:
        return datetime.fromisoformat(override).replace(tzinfo=TEHRAN)
    return datetime.now(TEHRAN)


def today_views(now):
    today = now.date()
    jy, jm, jd = jalali.to_jalali(today)
    return {
        'gregorian': today, 'jalali': (jy, jm, jd),
        'gregorianText': today.isoformat(), 'jalaliText': f'{jy:04d}/{jm:02d}/{jd:02d}',
        'time': now.strftime('%H:%M'), 'timezone': TIMEZONE_NAME,
    }


def _in_window(month, day, start, end):
    start_key = (start[0], start[1])
    end_key = (end[0], end[1])
    current = (month, day)
    if start_key <= end_key:
        return start_key <= current <= end_key
    return current >= start_key or current <= end_key  # wraps around the new year


def rule_is_active(rule, today):
    """`rule` is a dict with calendar/start/end; `today` comes from today_views()."""
    if rule['calendar'] == 'jalali':
        _, month, day = today['jalali']
    else:
        month, day = today['gregorian'].month, today['gregorian'].day
    return _in_window(month, day, (rule['start_month'], rule['start_day']), (rule['end_month'], rule['end_day']))


def month_max_day(calendar, month, year_hint=None):
    if calendar == 'jalali':
        return 30 if month == 12 else jalali.JALALI_MONTH_DAYS[month - 1]
    return (31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)[month - 1]


def resolve(now, rules, default_theme, manual_theme):
    """Return {'theme', 'source', 'rule', 'conflict'} for `now` (a Tehran-aware datetime)."""
    if manual_theme:
        return {'theme': manual_theme, 'source': 'manual', 'rule': None, 'conflict': None}
    today = today_views(now)
    active = [rule for rule in sorted(rules, key=lambda r: r['position'])
              if rule['enabled'] and rule_is_active(rule, today)]
    for kind in KINDS:  # events beat seasonal rules regardless of priority numbers
        group = [rule for rule in active if rule['kind'] == kind]
        if not group:
            continue
        top = max(rule['priority'] for rule in group)
        tied = [rule for rule in group if rule['priority'] == top]
        chosen = tied[0]  # fixed list order decides ties
        conflict = None
        if len(tied) > 1:
            conflict = {'keys': [rule['key'] for rule in tied], 'chosen': chosen['key'],
                        'message': 'دو برنامه با اولویت برابر فعال‌اند؛ برنامهٔ اول فهرست استفاده شد.'}
        return {'theme': chosen['theme'], 'source': kind, 'rule': chosen['key'], 'conflict': conflict}
    return {'theme': default_theme, 'source': 'default', 'rule': None, 'conflict': None}


def describe_window(rule):
    """Persian text for a rule window, e.g. '۱ فروردین تا ۳۱ خرداد' (jalali) or '۱۳ فوریه تا ۱۵ فوریه'."""
    names_jalali = jalali.JALALI_MONTH_NAMES
    def part(month, day):
        names = names_jalali if rule['calendar'] == 'jalali' else GREGORIAN_MONTH_NAMES
        return f'{fa_digits(day)} {names[month - 1]}'
    return f"{part(rule['start_month'], rule['start_day'])} تا {part(rule['end_month'], rule['end_day'])}"


_FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'


def fa_digits(value):
    return str(value).translate({ord(str(i)): _FA_DIGITS[i] for i in range(10)})


def validate_window(calendar, start_month, start_day, end_month, end_day):
    from .store import ApiError
    if calendar not in CALENDARS:
        raise ApiError('تقویم انتخاب‌شده معتبر نیست.')
    for label, month, day in (('شروع', start_month, start_day), ('پایان', end_month, end_day)):
        if not isinstance(month, int) or isinstance(month, bool) or not 1 <= month <= 12:
            raise ApiError(f'ماه {label} معتبر نیست.')
        if not isinstance(day, int) or isinstance(day, bool) or not 1 <= day <= month_max_day(calendar, month):
            raise ApiError(f'روز {label} برای این ماه معتبر نیست.')
    return start_month, start_day, end_month, end_day
