/* Restaurant theme. The theme is chosen by the restaurant owner in the admin panel and
   delivered with the menu (menu.restaurant.theme). Customers cannot change it here.
   Motion follows the device's reduced-motion setting automatically. */
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
  const svg = inner => `<svg class="hero-art seasonal-art" viewBox="0 0 240 205" fill="none" aria-hidden="true" focusable="false">
    <path d="M41 187V84a79 79 0 0 1 158 0v103" fill="var(--theme-soft)"/>
    <path d="M53 187V85a67 67 0 0 1 134 0v102" stroke="var(--theme-outline)"/>
    ${inner}<path d="M32 187h176M80 196h81" stroke="var(--theme-outline)" stroke-linecap="round"/>
  </svg>`;
  const arts = {
    spring: svg(`<path d="M120 187V104" stroke="var(--green)" stroke-width="2" stroke-linecap="round"/>
      <path d="M120 150c-22-6-40-22-44-44 26 0 42 12 44 44Z" fill="var(--theme-leaf)" stroke="var(--green)"/>
      <path d="M120 130c16-4 30-16 34-36-24 0-36 12-34 36Z" fill="var(--theme-leaf)" stroke="var(--green)"/>
      <g class="spring-bloom" fill="var(--theme-petal)" stroke="var(--orange)"><circle cx="120" cy="92" r="11"/><circle cx="144" cy="104" r="10"/><circle cx="97" cy="104" r="10"/><circle cx="132" cy="68" r="9"/><circle cx="108" cy="70" r="8"/></g>
      <circle cx="120" cy="92" r="3.5" fill="var(--theme-gold)"/><circle cx="144" cy="104" r="2.5" fill="var(--theme-gold)"/><circle cx="97" cy="104" r="2.5" fill="var(--theme-gold)"/>`),
    autumn: svg(`<path d="M117 180c-3-40 4-66 18-106M123 135l-39-23M124 127l34-21" stroke="var(--green)" stroke-width="2" stroke-linecap="round"/>
      <path class="autumn-leaf" d="M134 116C92 82 120 43 153 33c12 34 22 64-19 83Z" fill="var(--theme-petal)" stroke="var(--orange)"/>
      <path d="m134 111 14-58m-8 40-13-14m18-1 13-14" stroke="var(--orange)" stroke-width="1.4"/>
      <path d="M114 138c-47 7-59-22-53-50 36 1 50 19 53 50Z" fill="var(--theme-leaf)" stroke="var(--green)"/>
      <path d="m70 101 40 33m-20-17-2-15m2 16-15 1" stroke="var(--green)"/>
      <path d="M129 154c2-36 33-41 53-34-5 29-23 42-53 34Z" fill="var(--theme-gold)" stroke="var(--orange)"/>
      <path d="m135 151 33-21" stroke="var(--orange)"/>
      <path d="M91 186q29-12 53 0" stroke="var(--orange)"/>
      <path d="M188 55q-15-4-15 10 12 8 15-10ZM39 152q-12-7-18 7 12 12 18-7Z" fill="var(--theme-petal)"/>`),
    valentine: svg(`<path d="M121 158C103 143 73 122 73 98c0-31 35-40 48-14 17-26 50-17 50 14 0 24-33 46-50 60Z" fill="var(--theme-petal)" stroke="var(--orange)" stroke-width="1.5"/>
      <path d="M121 143c-15-12-34-30-34-44 0-20 25-25 34-4 12-21 36-16 36 4 0 14-21 32-36 44Z" stroke="var(--card-bg)" stroke-width="2"/>
      <path d="M121 177v-20M80 177c0-25-17-34-21-46m21 31q-26 2-30-19 24-3 30 19ZM163 181c-1-17 12-29 20-39m-15 19q19 3 25-13-17-4-25 13Z" stroke="var(--green)" fill="var(--theme-leaf)"/>
      <path d="M184 65c-25-16-9-30 0-18 12-12 25 2 0 18Z" fill="var(--orange)"/>
      <path d="m73 44 2 6 6 2-6 2-2 6-2-6-6-2 6-2Z" fill="var(--theme-gold)"/>
      <circle cx="202" cy="106" r="3" fill="var(--theme-gold)"/>`)
  };
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
      const chosen = valid.has(previewTheme) ? previewTheme : restaurant.theme;
      apply(valid.has(chosen) ? chosen : 'default');
    }
  };
})();
