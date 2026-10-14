// Public menu loader. Each restaurant is read from the server API, which only returns
// that restaurant's visible items and its theme. Static hosts without an API (for
// example GitHub Pages) fall back to the bundled demo snapshot in data/<slug>.json.
(() => {
  const SLUG = /^[a-z0-9][a-z0-9-]{1,39}$/;
  const isJson = response => (response.headers.get('content-type') || '').includes('application/json');

  // GitHub Pages has no server clock, so the demo applies the same date rules in the browser.
  // The schedule files are copied next to the site by build_pages.py. On failure the bundled theme is used.
  async function dateTheme(bundledTheme) {
    try {
      const schedule = await import('../schedule.js');
      const rules = schedule.DEFAULT_RULES.map((rule, position) => ({
        key: rule.key, kind: rule.kind, theme: rule.theme, calendar: rule.calendar, enabled: 1, position,
        priority: rule.priority, start_month: rule.start[0], start_day: rule.start[1],
        end_month: rule.end[0], end_day: rule.end[1],
      }));
      return schedule.resolve(schedule.tehranNow(), rules, bundledTheme, null).theme;
    } catch (error) {
      console.warn('date themes unavailable', error);
      return bundledTheme;
    }
  }

  window.MenuRepository = {
    async getMenu(slug) {
      if (!SLUG.test(slug)) throw new Error('UNKNOWN_RESTAURANT');
      let response = null;
      try {
        response = await fetch(`/api/restaurants/${encodeURIComponent(slug)}/menu`, {cache: 'no-store'});
      } catch {
        response = null;
      }
      if (response && isJson(response)) {
        if (response.status === 404) throw new Error('UNKNOWN_RESTAURANT');
        if (!response.ok) throw new Error('MENU_LOAD_FAILED');
        return response.json();
      }
      const snapshot = await fetch(`/data/${encodeURIComponent(slug)}.json`, {cache: 'no-store'});
      if (!snapshot.ok) throw new Error('UNKNOWN_RESTAURANT');
      const data = await snapshot.json();
      if (data.restaurant?.slug !== slug) throw new Error('RESTAURANT_MISMATCH');
      data.restaurant.theme = await dateTheme(data.restaurant.theme);
      return data;
    }
  };
})();
