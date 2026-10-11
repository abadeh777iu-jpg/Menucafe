"""Tests for the admin panel features: categories, prices, theme schedule, Persian calendar,
password change, owner-only preview, and isolation of the new endpoints.

Run from the aria-menu folder:  python3 -m unittest discover -s tests -v
The calendar reference table was produced with an independent Jalali library and is embedded here
so the tests need nothing beyond the standard library.
"""
import datetime
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend import jalali, schedule, store  # noqa: E402
from test_backend import Client, PASSWORD, ROOT, free_port  # noqa: E402

# (gregorian year, month, day, jalali year, month, day) — reference values.
REFERENCE = [
    (2024, 3, 19, 1402, 12, 29),
    (2024, 3, 20, 1403, 1, 1),
    (2024, 3, 21, 1403, 1, 2),
    (2025, 3, 20, 1403, 12, 30),
    (2025, 3, 21, 1404, 1, 1),
    (2026, 3, 20, 1404, 12, 29),
    (2026, 3, 21, 1405, 1, 1),
    (2026, 2, 13, 1404, 11, 24),
    (2026, 2, 14, 1404, 11, 25),
    (2026, 2, 15, 1404, 11, 26),
    (2026, 10, 31, 1405, 8, 9),
    (2026, 11, 1, 1405, 8, 10),
    (2026, 12, 21, 1405, 9, 30),
    (2026, 12, 22, 1405, 10, 1),
    (2026, 10, 11, 1405, 7, 19),
    (2026, 3, 1, 1404, 12, 10),
    (2028, 2, 29, 1406, 12, 10),
    (2032, 2, 29, 1410, 12, 10),
    (2100, 2, 28, 1478, 12, 10),
    (2100, 3, 1, 1478, 12, 11),
    (1999, 12, 31, 1378, 10, 10),
    (2000, 1, 1, 1378, 10, 11),
    (2009, 7, 11, 1388, 4, 20),
    (2001, 10, 7, 1380, 7, 15),
    (2012, 9, 16, 1391, 6, 26),
    (2024, 3, 13, 1402, 12, 23),
    (1997, 3, 2, 1375, 12, 12),
    (1998, 4, 1, 1377, 1, 12),
    (2031, 11, 3, 1410, 8, 12),
    (2019, 1, 14, 1397, 10, 24),
    (1999, 3, 23, 1378, 1, 3),
    (2011, 5, 28, 1390, 3, 7),
    (2021, 2, 21, 1399, 12, 3),
    (1997, 8, 8, 1376, 5, 17),
    (2017, 10, 5, 1396, 7, 13),
    (2004, 8, 18, 1383, 5, 28),
    (1996, 9, 6, 1375, 6, 16),
    (1998, 11, 9, 1377, 8, 18),
    (2014, 6, 14, 1393, 3, 24),
    (2013, 10, 4, 1392, 7, 12),
    (1998, 2, 18, 1376, 11, 29),
    (2005, 10, 18, 1384, 7, 26),
    (1999, 1, 26, 1377, 11, 6),
    (2019, 9, 20, 1398, 6, 29),
    (2014, 1, 16, 1392, 10, 26),
    (1997, 8, 26, 1376, 6, 4),
    (2032, 2, 3, 1410, 11, 14),
    (2020, 5, 13, 1399, 2, 24),
    (2000, 7, 21, 1379, 4, 31),
    (2005, 1, 5, 1383, 10, 16),
    (2023, 4, 16, 1402, 1, 27),
    (2023, 2, 22, 1401, 12, 3),
    (2021, 2, 24, 1399, 12, 6),
    (1997, 10, 10, 1376, 7, 18),
    (2020, 11, 20, 1399, 8, 30),
    (2021, 4, 7, 1400, 1, 18),
    (2012, 10, 17, 1391, 7, 26),
    (1997, 3, 23, 1376, 1, 3),
    (2004, 12, 1, 1383, 9, 11),
    (1997, 2, 2, 1375, 11, 14),
    (2019, 12, 21, 1398, 9, 30),
    (2033, 7, 5, 1412, 4, 15),
    (2000, 12, 21, 1379, 10, 1),
    (2007, 12, 28, 1386, 10, 7),
    (2013, 10, 20, 1392, 7, 28),
    (2001, 6, 21, 1380, 3, 31),
    (2019, 4, 3, 1398, 1, 14),
    (2000, 4, 13, 1379, 1, 25),
    (2020, 8, 10, 1399, 5, 20),
    (2008, 11, 2, 1387, 8, 12),
    (2020, 2, 18, 1398, 11, 29),
    (2031, 8, 11, 1410, 5, 20),
    (2025, 8, 4, 1404, 5, 13),
    (2003, 2, 9, 1381, 11, 20),
    (1999, 8, 16, 1378, 5, 25),
    (2021, 2, 1, 1399, 11, 13),
    (2020, 8, 15, 1399, 5, 25),
    (2023, 8, 29, 1402, 6, 7),
    (2003, 6, 6, 1382, 3, 16),
    (2011, 9, 15, 1390, 6, 24),
    (1999, 5, 16, 1378, 2, 26),
    (2019, 7, 28, 1398, 5, 6),
    (2026, 12, 11, 1405, 9, 20),
    (1997, 10, 25, 1376, 8, 3),
    (2020, 4, 25, 1399, 2, 6),
    (1997, 9, 3, 1376, 6, 12),
    (2022, 10, 7, 1401, 7, 15),
    (2004, 3, 28, 1383, 1, 9),
    (2017, 4, 8, 1396, 1, 19),
    (2025, 7, 9, 1404, 4, 18),
    (2018, 11, 7, 1397, 8, 16),
    (2014, 3, 7, 1392, 12, 16),
    (2029, 11, 12, 1408, 8, 22),
    (2009, 2, 2, 1387, 11, 14),
    (2015, 11, 20, 1394, 8, 29),
    (2021, 4, 7, 1400, 1, 18),
    (2015, 4, 30, 1394, 2, 10),
    (2011, 3, 22, 1390, 1, 2),
    (2008, 6, 12, 1387, 3, 23),
    (2006, 2, 22, 1384, 12, 3),
    (2030, 8, 20, 1409, 5, 29),
    (2003, 1, 24, 1381, 11, 4),
    (2026, 5, 10, 1405, 2, 20),
    (2029, 12, 24, 1408, 10, 4),
    (2005, 12, 13, 1384, 9, 22),
    (1998, 9, 3, 1377, 6, 12),
    (2020, 10, 7, 1399, 7, 16),
    (2008, 6, 20, 1387, 3, 31),
    (2018, 7, 23, 1397, 5, 1),
    (2017, 3, 17, 1395, 12, 27),
    (2034, 4, 4, 1413, 1, 15),
    (2010, 5, 29, 1389, 3, 8),
    (2027, 9, 21, 1406, 6, 30),
    (2015, 2, 18, 1393, 11, 29),
    (2007, 12, 1, 1386, 9, 10),
    (2022, 4, 26, 1401, 2, 6),
    (1998, 4, 14, 1377, 1, 25),
    (2000, 4, 18, 1379, 1, 30),
    (2017, 12, 18, 1396, 9, 27),
    (2013, 10, 3, 1392, 7, 11),
    (2002, 5, 26, 1381, 3, 5),
    (2028, 12, 17, 1407, 9, 27),
    (2010, 5, 6, 1389, 2, 16),
    (2001, 10, 26, 1380, 8, 4),
    (2016, 12, 7, 1395, 9, 17),
    (2013, 12, 1, 1392, 9, 10),
    (1996, 10, 4, 1375, 7, 13),
    (2024, 12, 22, 1403, 10, 2),
    (1998, 6, 25, 1377, 4, 4),
    (2029, 4, 18, 1408, 1, 30),
    (2020, 1, 13, 1398, 10, 23),
    (2020, 9, 14, 1399, 6, 24),
    (2030, 5, 25, 1409, 3, 4),
    (2034, 4, 9, 1413, 1, 20),
    (2031, 9, 16, 1410, 6, 25),
    (2009, 1, 27, 1387, 11, 8),
    (2010, 4, 4, 1389, 1, 15),
    (2026, 3, 10, 1404, 12, 19),
    (2010, 9, 16, 1389, 6, 25),
    (2021, 8, 30, 1400, 6, 8),
    (2017, 4, 12, 1396, 1, 23),
    (2021, 1, 5, 1399, 10, 16),
    (2030, 9, 30, 1409, 7, 8),
    (2015, 6, 19, 1394, 3, 29),
    (1998, 1, 31, 1376, 11, 11),
    (2032, 9, 5, 1411, 6, 15),
    (1999, 3, 14, 1377, 12, 23),
    (2007, 2, 9, 1385, 11, 20),
    (2016, 4, 7, 1395, 1, 19),
    (2026, 4, 8, 1405, 1, 19),
    (2024, 10, 16, 1403, 7, 25),
    (1997, 11, 30, 1376, 9, 9),
    (1997, 9, 21, 1376, 6, 30),
    (2027, 10, 19, 1406, 7, 27),
    (2026, 6, 20, 1405, 3, 30),
    (2008, 11, 20, 1387, 8, 30),
    (2024, 1, 11, 1402, 10, 21),
    (2020, 12, 4, 1399, 9, 14),
    (2025, 7, 23, 1404, 5, 1),
    (2031, 11, 14, 1410, 8, 23),
    (2014, 12, 28, 1393, 10, 7),
    (2007, 10, 7, 1386, 7, 15)
]


class CalendarTests(unittest.TestCase):
    def test_reference_dates_convert_both_ways(self):
        for gy, gm, gd, jy, jm, jd in REFERENCE:
            with self.subTest(gregorian=(gy, gm, gd)):
                self.assertEqual(jalali.to_jalali(datetime.date(gy, gm, gd)), (jy, jm, jd))
                self.assertEqual(jalali.from_jalali(jy, jm, jd), datetime.date(gy, gm, gd))

    def test_nowruz_dates(self):
        self.assertEqual(jalali.to_jalali(datetime.date(2025, 3, 21)), (1404, 1, 1))
        self.assertEqual(jalali.from_jalali(1404, 1, 1), datetime.date(2025, 3, 21))

    def test_invalid_jalali_dates_are_refused(self):
        with self.assertRaises(ValueError):
            jalali.from_jalali(1404, 7, 31)  # Mehr has 30 days
        with self.assertRaises(ValueError):
            jalali.from_jalali(1404, 13, 1)


class TehranClockTests(unittest.TestCase):
    def test_timezone_is_tehran_and_has_no_dst(self):
        self.assertEqual(schedule.TIMEZONE_NAME, 'Asia/Tehran')
        winter = schedule.tehran_now('2026-01-15T12:00')
        summer = schedule.tehran_now('2026-07-15T12:00')
        self.assertEqual(winter.utcoffset(), datetime.timedelta(hours=3, minutes=30))
        self.assertEqual(summer.utcoffset(), datetime.timedelta(hours=3, minutes=30))

    def test_midnight_in_tehran_switches_the_day(self):
        before = schedule.today_views(schedule.tehran_now('2026-02-12T23:59'))
        after = schedule.today_views(schedule.tehran_now('2026-02-13T00:00'))
        self.assertEqual(before['gregorianText'], '2026-02-12')
        self.assertEqual(after['gregorianText'], '2026-02-13')


def rules_with(enabled_keys, **overrides):
    rules = []
    for position, (key, kind, theme, label, calendar, start, end, priority) in enumerate(schedule.DEFAULT_RULES):
        rules.append({
            'key': key, 'kind': kind, 'theme': theme, 'label': label, 'calendar': calendar,
            'start_month': start[0], 'start_day': start[1], 'end_month': end[0], 'end_day': end[1],
            'priority': priority, 'enabled': int(key in enabled_keys), 'position': position,
        })
    for key, changes in overrides.items():
        for rule in rules:
            if rule['key'] == key:
                rule.update(changes)
    return rules


class ResolutionTests(unittest.TestCase):
    def at(self, value):
        return schedule.tehran_now(value)

    def test_default_when_no_rule_applies(self):
        result = schedule.resolve(self.at('2026-05-01T10:00'), rules_with(set()), 'summer', None)
        self.assertEqual((result['theme'], result['source']), ('summer', 'default'))

    def test_manual_override_beats_event_and_season(self):
        result = schedule.resolve(self.at('2026-02-14T10:00'), rules_with({'valentine', 'winter'}), 'default', 'autumn')
        self.assertEqual((result['theme'], result['source']), ('autumn', 'manual'))

    def test_event_beats_seasonal_even_with_lower_priority(self):
        rules = rules_with({'valentine', 'winter'}, winter={'priority': 99}, valentine={'priority': 1})
        result = schedule.resolve(self.at('2026-02-14T10:00'), rules, 'default', None)
        self.assertEqual((result['theme'], result['source'], result['rule']), ('valentine', 'event', 'valentine'))

    def test_seasonal_applies_when_no_event(self):
        result = schedule.resolve(self.at('2026-01-15T10:00'), rules_with({'winter'}), 'default', None)
        self.assertEqual((result['theme'], result['source']), ('winter', 'seasonal'))

    def test_disabled_rule_is_ignored(self):
        result = schedule.resolve(self.at('2026-01-15T10:00'), rules_with(set()), 'default', None)
        self.assertEqual(result['source'], 'default')

    def test_valentine_window_is_day_before_event_and_day_after(self):
        rules = rules_with({'valentine'})
        for when, expected in [('2026-02-12T12:00', 'default'), ('2026-02-13T12:00', 'valentine'),
                               ('2026-02-14T12:00', 'valentine'), ('2026-02-15T23:59', 'valentine'),
                               ('2026-02-16T00:00', 'default')]:
            with self.subTest(when=when):
                self.assertEqual(schedule.resolve(self.at(when), rules, 'default', None)['theme'], expected)

    def test_halloween_window(self):
        rules = rules_with({'halloween'})
        self.assertEqual(schedule.resolve(self.at('2026-10-31T09:00'), rules, 'default', None)['theme'], 'halloween')
        self.assertEqual(schedule.resolve(self.at('2026-11-02T09:00'), rules, 'default', None)['theme'], 'default')

    def test_nowruz_window_wraps_new_year(self):
        rules = rules_with({'nowruz'})
        # Esfand 29 (eve of Nowruz) in 1404 is 2026-03-19 and Farvardin 13 is 2026-04-02.
        self.assertEqual(schedule.resolve(self.at('2026-03-20T09:00'), rules, 'default', None)['rule'], 'nowruz')
        self.assertEqual(schedule.resolve(self.at('2026-04-02T09:00'), rules, 'default', None)['rule'], 'nowruz')
        self.assertIsNone(schedule.resolve(self.at('2026-04-03T09:00'), rules, 'default', None)['rule'])

    def test_yalda_night_is_inside_its_window(self):
        rules = rules_with({'yalda'})
        # 2026-12-21 is Azar 30 (the night of Yalda) and 2026-12-22 is Dey 1.
        self.assertEqual(schedule.resolve(self.at('2026-12-21T21:00'), rules, 'default', None)['rule'], 'yalda')
        self.assertEqual(schedule.resolve(self.at('2026-12-22T09:00'), rules, 'default', None)['rule'], 'yalda')

    def test_same_kind_equal_priority_is_a_conflict_with_documented_fallback(self):
        rules = rules_with({'spring', 'summer'}, spring={'priority': 40}, summer={'priority': 40})
        # Farvardin 1 (2026-03-21) is inside spring only; make both windows cover it.
        rules = [dict(r, start_month=1, start_day=1, end_month=6, end_day=31) if r['key'] in {'spring', 'summer'} else r
                 for r in rules]
        result = schedule.resolve(self.at('2026-03-21T10:00'), rules, 'default', None)
        self.assertEqual(result['rule'], 'spring')  # first in fixed list order
        self.assertEqual(result['conflict']['keys'], ['spring', 'summer'])

    def test_higher_priority_wins_within_a_kind(self):
        rules = rules_with({'spring', 'summer'}, spring={'priority': 10}, summer={'priority': 60})
        rules = [dict(r, start_month=1, start_day=1, end_month=6, end_day=31) if r['key'] in {'spring', 'summer'} else r
                 for r in rules]
        result = schedule.resolve(self.at('2026-03-21T10:00'), rules, 'default', None)
        self.assertEqual(result['rule'], 'summer')
        self.assertIsNone(result['conflict'])


class ValidationTests(unittest.TestCase):
    def test_window_days_must_exist_in_the_month(self):
        with self.assertRaises(store.ApiError):
            schedule.validate_window('jalali', 7, 31, 7, 30)  # Mehr has 30 days
        with self.assertRaises(store.ApiError):
            schedule.validate_window('gregorian', 2, 30, 2, 28)
        self.assertEqual(schedule.validate_window('gregorian', 2, 29, 3, 1), (2, 29, 3, 1))

    def test_unknown_calendar_is_refused(self):
        with self.assertRaises(store.ApiError):
            schedule.validate_window('lunar', 1, 1, 1, 2)

    def test_price_parsing(self):
        self.assertEqual(store.parse_price('۱۴۵٬۰۰۰'), 145000)
        self.assertEqual(store.parse_price('145,000'), 145000)
        self.assertEqual(store.parse_price(55000), 55000)
        for bad in ['-5', '−3', '', '1.5', '۱۲a', True, None]:
            with self.subTest(price=bad), self.assertRaises(store.ApiError):
                store.parse_price(bad)


class AdminFeatureTests(unittest.TestCase):
    """A real server with three accounts: aria.owner, bahar.owner and cafe.owner (cafe-nila)."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.db = str(Path(cls.tmp.name) / 'admin.db')
        cls.port = free_port()
        env = dict(os.environ)

        def run(*args, stdin=None):
            result = subprocess.run([sys.executable, 'server.py', '--db', cls.db, *args], cwd=ROOT,
                                    input=stdin, capture_output=True, text=True, env=env, timeout=120)
            if result.returncode != 0:
                raise AssertionError(result.stderr or result.stdout)

        run('init')
        run('add-restaurant', '--slug', 'cafe-nila', '--name', 'کافه نیلا', '--english', 'Nila', '--theme', 'autumn')
        run('add-user', '--restaurant', 'aria', '--username', 'aria.owner', '--password-stdin', stdin=PASSWORD + '\n')
        run('add-user', '--restaurant', 'bahar', '--username', 'bahar.owner', '--password-stdin', stdin=PASSWORD + '\n')
        run('add-user', '--restaurant', 'cafe-nila', '--username', 'cafe.owner', '--password-stdin', stdin=PASSWORD + '\n')
        cls.server = subprocess.Popen([sys.executable, 'server.py', '--db', cls.db, '--port', str(cls.port)],
                                      cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(100):
            try:
                Client(cls.port).request('GET', '/aria')
                break
            except OSError:
                import time
                time.sleep(0.1)

    @classmethod
    def tearDownClass(cls):
        cls.server.terminate()
        cls.server.wait(timeout=10)
        cls.tmp.cleanup()

    def owner(self, username, slug=None):
        client = Client(self.port)
        status, payload, _ = client.login(username, PASSWORD)
        self.assertEqual(status, 200, payload)
        return client

    def admin(self, client, slug):
        status, payload, _, _ = client.request('GET', f'/api/admin/{slug}')
        self.assertEqual(status, 200, payload)
        return payload

    def public(self, slug):
        status, payload, _, _ = Client(self.port).request('GET', f'/api/restaurants/{slug}/menu')
        self.assertEqual(status, 200, payload)
        return payload

    # ----- categories -----------------------------------------------------------

    def test_category_add_rename_disable_and_public_rule(self):
        aria = self.owner('aria.owner')
        status, payload, _ = aria.write('POST', '/api/admin/aria/categories', {'name': 'نوشیدنی تست', 'icon': 'glass'})
        self.assertEqual(status, 201, payload)
        cat = next(c for c in payload['categories'] if c['name'] == 'نوشیدنی تست')
        status, payload, _ = aria.write('POST', '/api/admin/aria/items', {
            'name': 'دوغ تست', 'category': cat['id'], 'price': '۴۵٬۰۰۰', 'icon': 'glass'})
        self.assertEqual(status, 201, payload)
        self.assertTrue(any(c['id'] == cat['id'] for c in self.public('aria')['categories']))
        self.assertTrue(any(i['name'] == 'دوغ تست' for i in self.public('aria')['items']))

        status, payload, _ = aria.write('PUT', f"/api/admin/aria/categories/{cat['id']}",
                                        {'name': 'نوشیدنی سرد', 'icon': 'glass', 'enabled': False})
        self.assertEqual(status, 200, payload)
        renamed = next(c for c in payload['categories'] if c['id'] == cat['id'])
        self.assertEqual((renamed['name'], renamed['enabled']), ('نوشیدنی سرد', False))
        public = self.public('aria')
        self.assertFalse(any(c['id'] == cat['id'] for c in public['categories']))
        self.assertFalse(any(i['name'] == 'دوغ تست' for i in public['items']), 'item of disabled category leaked')
        # Items are kept in storage and still counted in the owner's view.
        admin_item = next(i for i in payload['items'] if i['name'] == 'دوغ تست')
        self.assertEqual(admin_item['category'], cat['id'])

        status, payload, _ = aria.write('PUT', f"/api/admin/aria/categories/{cat['id']}",
                                        {'name': 'نوشیدنی سرد', 'icon': 'glass', 'enabled': True})
        self.assertEqual(status, 200)
        self.assertTrue(any(i['name'] == 'دوغ تست' for i in self.public('aria')['items']))

    def test_category_reorder_is_atomic_and_validated(self):
        aria = self.owner('aria.owner')
        view = self.admin(aria, 'aria')
        ids = [c['id'] for c in view['categories']]
        reversed_ids = list(reversed(ids))
        status, payload, _ = aria.write('PUT', '/api/admin/aria/categories/order', {'order': reversed_ids})
        self.assertEqual(status, 200, payload)
        self.assertEqual([c['id'] for c in payload['categories']], reversed_ids)
        self.assertEqual([c['id'] for c in self.public('aria')['categories']][:1], reversed_ids[:1])
        status, _, _ = aria.write('PUT', '/api/admin/aria/categories/order', {'order': reversed_ids[:-1]})
        self.assertEqual(status, 409)
        status, _, _ = aria.write('PUT', '/api/admin/aria/categories/order', {'order': reversed_ids + ['missing']})
        self.assertEqual(status, 409)
        aria.write('PUT', '/api/admin/aria/categories/order', {'order': ids})  # restore

    def test_non_empty_category_cannot_be_deleted(self):
        aria = self.owner('aria.owner')
        view = self.admin(aria, 'aria')
        busy = next(c for c in view['categories'] if any(i['category'] == c['id'] for i in view['items']))
        status, payload, _ = aria.write('DELETE', f"/api/admin/aria/categories/{busy['id']}")
        self.assertEqual(status, 409, payload)

    # ----- items ----------------------------------------------------------------

    def test_item_edit_fields_disable_and_public_visibility(self):
        aria = self.owner('aria.owner')
        view = self.admin(aria, 'aria')
        item = next(i for i in view['items'] if i['visible'])
        body = {
            'name': 'نام تازهٔ تست', 'category': item['category'], 'price': '۱۲۳٬۰۰۰', 'icon': item['icon'],
            'label': '', 'position': item['position'], 'allergens': [], 'description': 'توضیح کوتاه تست',
            'ingredients': 'مواد تست', 'visible': False,
        }
        status, payload, _ = aria.write('PUT', f"/api/admin/aria/items/{item['id']}", body)
        self.assertEqual(status, 200, payload)
        saved = next(i for i in payload['items'] if i['id'] == item['id'])
        self.assertEqual((saved['name'], saved['price'], saved['ingredients'], saved['description']),
                         ('نام تازهٔ تست', 123000, 'مواد تست', 'توضیح کوتاه تست'))
        self.assertFalse(saved['visible'])
        self.assertFalse(any(i['id'] == item['id'] for i in self.public('aria')['items']))
        # The item is kept in storage: it is still in the owner's list.
        self.assertTrue(any(i['id'] == item['id'] for i in payload['items']))
        aria.write('PUT', f"/api/admin/aria/items/{item['id']}", dict(body, visible=True, name=item['name'],
                                                                      price=item['price'],
                                                                      ingredients=item['ingredients'],
                                                                      description=item['description']))

    def test_item_price_rules_on_the_server(self):
        aria = self.owner('aria.owner')
        view = self.admin(aria, 'aria')
        category = view['categories'][0]['id']
        for bad in ['-1000', '1.5', '', 'abc']:
            status, payload, _ = aria.write('POST', '/api/admin/aria/items', {
                'name': 'قیمت بد', 'category': category, 'price': bad, 'icon': 'bowl'})
            self.assertEqual(status, 400, (bad, payload))
        status, payload, _ = aria.write('POST', '/api/admin/aria/items', {
            'name': 'بدون عکس', 'category': category, 'price': '۲۵۰۰۰', 'icon': 'bowl'})
        self.assertEqual(status, 201, payload)
        created = next(i for i in payload['items'] if i['name'] == 'بدون عکس')
        self.assertEqual(created['price'], 25000)
        aria.write('DELETE', f"/api/admin/aria/items/{created['id']}")

    # ----- theme and schedule ---------------------------------------------------

    def test_theme_selection_and_manual_override_are_per_restaurant(self):
        aria = self.owner('aria.owner')
        bahar = self.owner('bahar.owner')
        bahar_before = self.public('bahar')['restaurant']['theme']
        status, payload, _ = aria.write('PUT', '/api/admin/aria/theme', {'theme': 'winter'})
        self.assertEqual(status, 200, payload)
        self.assertEqual(payload['activeTheme']['source'], 'manual')
        self.assertEqual(self.public('aria')['restaurant']['theme'], 'winter')
        self.assertEqual(self.public('bahar')['restaurant']['theme'], bahar_before)
        self.assertEqual(self.admin(bahar, 'bahar')['restaurant']['manualTheme'], None)
        status, payload, _ = aria.write('PUT', '/api/admin/aria/theme', {'theme': None})
        self.assertEqual(status, 200)
        self.assertIsNone(payload['restaurant']['manualTheme'])
        self.assertNotEqual(payload['activeTheme']['source'], 'manual')

    def test_spring_theme_is_selectable_and_all_themes_are_listed(self):
        aria = self.owner('aria.owner')
        view = self.admin(aria, 'aria')
        ids = [t['id'] for t in view['themes']]
        for theme_id in ['default', 'spring', 'summer', 'autumn', 'winter', 'valentine', 'halloween', 'nowruz', 'yalda']:
            self.assertIn(theme_id, ids)
        status, _, _ = aria.write('PUT', '/api/admin/aria/theme', {'theme': 'spring'})
        self.assertEqual(status, 200)
        aria.write('PUT', '/api/admin/aria/theme', {'theme': None})

    def test_default_theme_is_saved(self):
        cafe = self.owner('cafe.owner')
        status, payload, _ = cafe.write('PUT', '/api/admin/cafe-nila/default-theme', {'theme': 'valentine'})
        self.assertEqual(status, 200, payload)
        self.assertEqual(payload['restaurant']['defaultTheme'], 'valentine')
        cafe.write('PUT', '/api/admin/cafe-nila/default-theme', {'theme': 'autumn'})

    def test_schedule_rule_update_persists_and_validates(self):
        aria = self.owner('aria.owner')
        body = {'enabled': True, 'calendar': 'jalali', 'theme': 'summer', 'startMonth': 4, 'startDay': 1,
                'endMonth': 6, 'endDay': 31, 'priority': 45}
        status, payload, _ = aria.write('PUT', '/api/admin/aria/schedule/summer', body)
        self.assertEqual(status, 200, payload)
        rule = next(r for r in payload['schedule']['rules'] if r['key'] == 'summer')
        self.assertEqual((rule['enabled'], rule['priority'], rule['window']), (True, 45, '۱ تیر تا ۳۱ شهریور'))
        fresh = self.owner('aria.owner')  # a reload gets the stored schedule
        rule = next(r for r in self.admin(fresh, 'aria')['schedule']['rules'] if r['key'] == 'summer')
        self.assertTrue(rule['enabled'])
        for bad in [dict(body, endDay=31, endMonth=7), dict(body, calendar='lunar'), dict(body, priority=101),
                    dict(body, theme='unknown'), dict(body, startMonth=13)]:
            status, _, _ = aria.write('PUT', '/api/admin/aria/schedule/summer', bad)
            self.assertEqual(status, 400, bad)
        aria.write('PUT', '/api/admin/aria/schedule/summer', dict(body, enabled=False))

    def test_schedule_rule_keys_are_checked(self):
        aria = self.owner('aria.owner')
        status, _, _ = aria.write('PUT', '/api/admin/aria/schedule/not-a-rule', {'enabled': True})
        self.assertEqual(status, 404)

    # ----- isolation ------------------------------------------------------------

    def test_managers_cannot_touch_another_restaurant(self):
        aria = self.owner('aria.owner')
        cafe = self.owner('cafe.owner')
        cases = [
            ('PUT', '/api/admin/bahar/schedule/spring', {'enabled': True}),
            ('PUT', '/api/admin/bahar/theme', {'theme': 'winter'}),
            ('PUT', '/api/admin/bahar/categories/order', {'order': []}),
            ('POST', '/api/admin/bahar/categories', {'name': 'x', 'icon': 'bowl'}),
            ('POST', '/api/admin/bahar/items', {'name': 'x', 'category': 'x', 'price': '1', 'icon': 'bowl'}),
            ('POST', '/api/admin/bahar/account/password', {'currentPassword': PASSWORD, 'newPassword': 'another-pass-123'}),
        ]
        for method, path, body in cases:
            with self.subTest(path=path):
                status, _, _, _ = aria.request(method, path, body, headers={'X-CSRF-Token': aria.csrf})
                self.assertEqual(status, 403)
        status, _, _, _ = cafe.request('GET', '/api/admin/aria')
        self.assertEqual(status, 403)

    def test_anonymous_visitors_get_401_on_every_admin_operation(self):
        anonymous = Client(self.port)
        for method, path in [('GET', '/api/admin/aria'), ('PUT', '/api/admin/aria/theme'),
                             ('PUT', '/api/admin/aria/schedule/spring'), ('PUT', '/api/admin/aria/categories/order'),
                             ('POST', '/api/admin/aria/account/password')]:
            with self.subTest(path=path):
                status, _, _, _ = anonymous.request(method, path, {'theme': 'winter'}, headers={'X-CSRF-Token': 'x'})
                self.assertEqual(status, 401)

    # ----- preview --------------------------------------------------------------

    def test_preview_is_owner_only_and_never_public(self):
        anonymous = Client(self.port)
        status, _, _, response = anonymous.request('GET', '/admin/aria/preview?theme=winter')
        self.assertEqual(status, 302)
        aria = self.owner('aria.owner')
        status, payload, _, response = aria.request('GET', '/admin/aria/preview?theme=winter')
        self.assertEqual(status, 200)
        self.assertIn(b'window.MENU_PREVIEW_THEME="winter"', payload)
        self.assertEqual(response.getheader('X-Robots-Tag'), 'noindex, nofollow')
        status, payload, _, _ = aria.request('GET', '/admin/aria/preview?theme=javascript:alert(1)')
        self.assertEqual(status, 400)
        status, payload, _, _ = aria.request('GET', '/admin/bahar/preview?theme=winter')
        self.assertEqual(status, 302)
        status, payload, _, _ = anonymous.request('GET', '/aria?theme=winter')
        self.assertEqual(status, 200)
        self.assertNotIn(b'MENU_PREVIEW_THEME', payload)

    # ----- account --------------------------------------------------------------

    def test_password_change_checks_current_password_and_ends_other_sessions(self):
        first = self.owner('cafe.owner')
        second = self.owner('cafe.owner')
        status, payload, _, _ = first.request('POST', '/api/admin/cafe-nila/account/password',
                                              {'currentPassword': 'wrong-password', 'newPassword': 'brand-new-pass-1'},
                                              headers={'X-CSRF-Token': first.csrf})
        self.assertEqual(status, 403)
        status, payload, _, _ = first.request('POST', '/api/admin/cafe-nila/account/password',
                                              {'currentPassword': PASSWORD, 'newPassword': 'short'},
                                              headers={'X-CSRF-Token': first.csrf})
        self.assertEqual(status, 400)
        status, payload, _, _ = first.request('POST', '/api/admin/cafe-nila/account/password',
                                              {'currentPassword': PASSWORD, 'newPassword': 'brand-new-pass-1'},
                                              headers={'X-CSRF-Token': first.csrf})
        self.assertEqual(status, 200, payload)
        status, _, _, _ = second.request('GET', '/api/admin/cafe-nila')
        self.assertEqual(status, 401)
        status, _, _, _ = first.request('GET', '/api/admin/cafe-nila')
        self.assertEqual(status, 200)
        self.assertEqual(Client(self.port).login('cafe.owner', PASSWORD)[0], 401)
        self.assertEqual(Client(self.port).login('cafe.owner', 'brand-new-pass-1')[0], 200)
        first.request('POST', '/api/admin/cafe-nila/account/password',
                      {'currentPassword': 'brand-new-pass-1', 'newPassword': PASSWORD},
                      headers={'X-CSRF-Token': first.csrf})



class ScheduledPublicMenuTests(unittest.TestCase):
    """Real servers whose Tehran clock is fixed with MENU_TEST_NOW; the public API must follow the schedule."""

    def start(self, now):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        db = str(Path(tmp.name) / 'sched.db')
        port = free_port()
        env = dict(os.environ, MENU_TEST_NOW=now)
        subprocess.run([sys.executable, 'server.py', '--db', db, 'init'], cwd=ROOT, env=env, check=True,
                       capture_output=True, timeout=120)
        subprocess.run([sys.executable, 'server.py', '--db', db, 'add-user', '--restaurant', 'aria',
                        '--username', 'aria.owner', '--password-stdin'], cwd=ROOT, env=env, input=PASSWORD + '\n',
                       check=True, capture_output=True, text=True, timeout=120)
        proc = subprocess.Popen([sys.executable, 'server.py', '--db', db, '--port', str(port)], cwd=ROOT, env=env,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.addCleanup(lambda: (proc.terminate(), proc.wait(timeout=10)))
        import time
        for _ in range(100):
            try:
                Client(port).request('GET', '/aria')
                break
            except OSError:
                time.sleep(0.1)
        owner = Client(port)
        self.assertEqual(owner.login('aria.owner', PASSWORD)[0], 200)
        return port, owner

    def public_theme(self, port):
        status, payload, _, _ = Client(port).request('GET', '/api/restaurants/aria/menu')
        self.assertEqual(status, 200)
        return payload['restaurant']['theme']

    def test_event_schedule_selects_valentine_and_manual_override_wins(self):
        port, owner = self.start('2026-02-14T12:00')
        self.assertEqual(self.public_theme(port), 'summer')  # aria's default; rules start disabled
        owner.write('PUT', '/api/admin/aria/schedule/valentine', {
            'enabled': True, 'calendar': 'gregorian', 'theme': 'valentine',
            'startMonth': 2, 'startDay': 13, 'endMonth': 2, 'endDay': 15, 'priority': 60})
        self.assertEqual(self.public_theme(port), 'valentine')
        status, payload, _ = owner.write('PUT', '/api/admin/aria/theme', {'theme': 'winter'})
        self.assertEqual(self.public_theme(port), 'winter')
        self.assertEqual(payload['activeTheme']['source'], 'manual')
        owner.write('PUT', '/api/admin/aria/theme', {'theme': None})
        self.assertEqual(self.public_theme(port), 'valentine')  # override removed: schedule takes over

    def test_seasonal_schedule_selects_winter_in_january(self):
        port, owner = self.start('2026-01-15T12:00')
        owner.write('PUT', '/api/admin/aria/schedule/winter', {
            'enabled': True, 'calendar': 'jalali', 'theme': 'winter',
            'startMonth': 10, 'startDay': 1, 'endMonth': 12, 'endDay': 30, 'priority': 40})
        self.assertEqual(self.public_theme(port), 'winter')
        status, payload, _, _ = Client(port).request('GET', '/api/restaurants/aria/menu')
        self.assertEqual(status, 200)


if __name__ == '__main__':
    unittest.main()
