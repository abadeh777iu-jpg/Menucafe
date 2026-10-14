/* Restaurant theme. The restaurant's manager sets the theme in the admin panel: a default theme,
   date rules that switch themes automatically, or a manual override. Visitors cannot change it.
   The theme is delivered with the menu (menu.restaurant.theme). Motion follows the device's
   reduced-motion setting. */
(() => {
  'use strict';
  const definitions = [
    {id:'default', name:'پیش‌فرض', hint:'زیتونی و آرام', symbol:'✧'},
    ...Object.entries(window.OccasionVisuals || {}).map(([id, visual]) => ({id, name:visual.name, hint:visual.hint, symbol:visual.symbol})),
    {id:'autumn', name:'پاییز', hint:'برگ و دارچین', symbol:'❧'},
    {id:'spring', name:'بهار', hint:'شکوفه و سبزهٔ تازه', symbol:'✿'},
  ];
  const valid = new Set(definitions.map(theme => theme.id));
  // Set only on the owner's preview page (injected by the server). Public pages never have it.
  const previewTheme = typeof window.MENU_PREVIEW_THEME === 'string' ? window.MENU_PREVIEW_THEME : '';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let activeTheme = 'default';
  let defaultArt = '';
  let ownerTheme = 'default';
  function apply(id) {
    const theme = valid.has(id) ? id : 'default';
    document.documentElement.dataset.theme = theme;
    const art = document.querySelector('.hero-art');
    const visual = window.OccasionVisuals?.[theme];
    if (art) art.outerHTML = theme === 'default' ? defaultArt : (visual?.art || arts[theme]);
    activeTheme = theme;
    const intro = document.querySelector('#occasion-intro');
    intro.hidden = !visual;
    document.querySelector('#occasion-kicker').textContent = visual?.kicker || '';
    document.querySelector('#occasion-title').textContent = visual?.title || '';
    document.querySelector('#occasion-subtitle').textContent = visual?.subtitle || '';
    const banner = document.querySelector('#occasion-banner');
    banner.hidden = !visual;
    banner.textContent = visual?.signature || '';
    updateEffects();
    document.querySelector('meta[name="theme-color"]').content = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim();
    return theme;
  }
  function updateEffects() {
    const supported = Boolean(window.OccasionVisuals?.[activeTheme]?.motion);
    document.documentElement.dataset.effects = supported && !reducedMotion.matches ? 'on' : 'off';
    document.dispatchEvent(new Event('menu:theme-updated'));
  }
  reducedMotion.addEventListener('change', updateEffects);
  window.MenuThemes = {
    mount(restaurant) {
      if (!defaultArt) defaultArt = document.querySelector('.hero-art').outerHTML;
      ownerTheme = valid.has(restaurant.theme) ? restaurant.theme : 'default';
      // The owner's preview page passes the theme explicitly; public pages always use the owner's theme.
      apply(valid.has(previewTheme) ? previewTheme : ownerTheme);
    }
  };
})();
