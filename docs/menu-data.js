// Public demo data only. No accounts, secrets, write API or authorization here.
// Each call returns fresh data; restaurant identity is explicit at this boundary.
(() => {
  const slugs = new Set(['aria', 'bahar']);
  window.MenuRepository = {
    async getMenu(slug) {
      if (!slugs.has(slug)) throw new Error('UNKNOWN_RESTAURANT');
      const response = await fetch(`../data/${encodeURIComponent(slug)}.json`, {cache: 'no-store'});
      if (!response.ok) throw new Error('MENU_LOAD_FAILED');
      const data = await response.json();
      if (data.restaurant?.slug !== slug) throw new Error('RESTAURANT_MISMATCH');
      return data;
    }
  };
})();
