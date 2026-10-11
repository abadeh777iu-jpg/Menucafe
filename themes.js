/* Manual demo themes: browser-local preferences, isolated by restaurant slug.
   No account, schedule, server write, or global restaurant setting is implied. */
(() => {
  'use strict';
  const definitions = [
    {id:'default', name:'پیش‌فرض', hint:'زیتونی و آرام', symbol:'✧'},
    ...Object.entries(window.OccasionVisuals || {}).map(([id, visual]) => ({id, name:visual.name, hint:visual.hint, symbol:visual.symbol})),
    {id:'autumn', name:'پاییز', hint:'برگ و دارچین', symbol:'❧'},
  ];
  const valid = new Set(definitions.map(t => t.id));
  const memory = new Map();
  const effectMemory = new Map();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let effectsEnabled = true;
  let activeTheme = 'default';
  let previewConsumed = false;
  const effectKey = slug => `digital-menu:effects:v1:${slug}`;
  let currentSlug = '', restaurantName = '', defaultArt = '';
  const key = slug => `digital-menu:theme:v1:${slug}`;
  const svg = inner => `<svg class="hero-art seasonal-art" viewBox="0 0 240 205" fill="none" aria-hidden="true" focusable="false">
    <path d="M41 187V84a79 79 0 0 1 158 0v103" fill="var(--theme-soft)"/>
    <path d="M53 187V85a67 67 0 0 1 134 0v102" stroke="var(--theme-outline)"/>
    ${inner}<path d="M32 187h176M80 196h81" stroke="var(--theme-outline)" stroke-linecap="round"/>
  </svg>`;
  const arts = {
    autumn: svg(`<path d="M117 180c-3-40 4-66 18-106M123 135l-39-23M124 127l34-21" stroke="var(--green)" stroke-width="2" stroke-linecap="round"/>
      <path d="M134 116C92 82 120 43 153 33c12 34 22 64-19 83Z" fill="var(--theme-petal)" stroke="var(--orange)"/>
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
  function read(slug) {
    try {
      const saved = localStorage.getItem(key(slug));
      return valid.has(saved) ? saved : (memory.get(slug) || 'default');
    } catch { return memory.get(slug) || 'default'; }
  }
  function apply(id) {
    const theme = valid.has(id) ? id : 'default';
    document.documentElement.dataset.theme = theme;
    document.querySelectorAll('[data-theme-choice]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.themeChoice === theme));
    });
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
  function readEffects(slug) {
    try {
      const stored = localStorage.getItem(effectKey(slug));
      if (stored === 'true' || stored === 'false') return stored === 'true';
    } catch { /* Preferences remain usable inside a sandboxed preview. */ }
    return effectMemory.get(slug) ?? true;
  }
  function updateEffects() {
    const supported = Boolean(window.OccasionVisuals?.[activeTheme]?.motion);
    document.documentElement.dataset.effects = effectsEnabled && supported && !reducedMotion.matches ? 'on' : 'off';
    const control = document.querySelector('#effects-toggle');
    control.checked = effectsEnabled;
    control.disabled = !supported;
    document.querySelector('#effects-note').textContent = !supported
      ? 'این تم جلوهٔ متحرک ندارد.'
      : reducedMotion.matches ? 'حرکت مطابق تنظیم کاهش حرکت دستگاه خاموش است.'
      : effectsEnabled ? (activeTheme === 'winter' ? 'برف پشت محتوا می‌بارد؛ حرکت کارت‌ها نرم و کوتاه است.' : ['summer','valentine','halloween'].includes(activeTheme) ? 'جلوه‌ها پشت محتوا اجرا می‌شوند؛ متن و قیمت‌ها همیشه خوانا هستند.' : 'حرکت فقط داخل قاب تصویر؛ متن منو همیشه ثابت است.') : 'جلوه‌ها خاموش‌اند؛ تزئینات ثابت باقی می‌مانند.';
    document.dispatchEvent(new Event('menu:theme-updated'));
  }
  reducedMotion.addEventListener('change', () => { if(currentSlug)updateEffects(); });
  function select(id) {
    if (!currentSlug || !valid.has(id)) return;
    const liveThemes = ['winter','summer','valentine','halloween'];
    const layoutChanged = liveThemes.includes(activeTheme) || liveThemes.includes(id);
    apply(id);
    if(layoutChanged)document.querySelector('.hero').scrollIntoView({block:'start',behavior:reducedMotion.matches?'instant':'smooth'});
    try { const url=new URL(location.href); if(url.searchParams.has('theme')) {url.searchParams.set('theme',id);history.replaceState(null,'',url);} } catch {}
    memory.set(currentSlug, id);
    let saved = false;
    try { localStorage.setItem(key(currentSlug), id); saved = true; } catch { /* Opaque iframe / disabled storage. */ }
    const name = definitions.find(theme => theme.id === id).name;
    document.querySelector('#theme-status').textContent = saved
      ? `تم «${name}» برای ${restaurantName} در این مرورگر ذخیره شد.`
      : `تم «${name}» برای ${restaurantName} فعال شد؛ ذخیره‌سازی مرورگر در دسترس نیست و انتخاب فقط تا بسته‌شدن این صفحه می‌ماند.`;
  }
  window.MenuThemes = {
    mount(restaurant) {
      if (!defaultArt) defaultArt = document.querySelector('.hero-art').outerHTML;
      currentSlug = restaurant.slug;
      restaurantName = restaurant.name;
      effectsEnabled = readEffects(currentSlug);
      document.querySelector('#theme-options').innerHTML = definitions.map(theme => `
        <button type="button" class="theme-choice" data-theme-choice="${theme.id}" aria-pressed="false" aria-label="تم ${theme.name}">
          <span class="theme-symbol" aria-hidden="true">${theme.symbol}</span>
          <span class="theme-choice-text"><strong>${theme.name}</strong><small>${theme.hint}</small></span>
          <span class="theme-tick" aria-hidden="true">✓</span>
        </button>`).join('');
      document.querySelector('#theme-options').onclick = event => {
        const button = event.target.closest('[data-theme-choice]');
        if (button) select(button.dataset.themeChoice);
      };
      document.querySelector('#effects-toggle').onchange = event => {
        effectsEnabled = event.target.checked;
        effectMemory.set(currentSlug, effectsEnabled);
        let saved = false;
        try { localStorage.setItem(effectKey(currentSlug), String(effectsEnabled)); saved = true; } catch {}
        updateEffects();
        document.querySelector('#theme-status').textContent = saved
          ? `تنظیم جلوه‌ها برای ${restaurantName} در این مرورگر ذخیره شد.`
          : `تنظیم جلوه‌ها فقط تا بسته‌شدن این صفحه حفظ می‌شود؛ ذخیره‌سازی مرورگر در دسترس نیست.`;
      };
      document.querySelector('#theme-preview').onclick = () => document.querySelector('.hero').scrollIntoView({block:'start', behavior:reducedMotion.matches ? 'instant' : 'smooth'});
      const requested = !previewConsumed && (new URLSearchParams(location.search).get('theme') || window.DemoRoute?.initialTheme);
      previewConsumed = true;
      apply(valid.has(requested) ? requested : read(currentSlug));
      document.querySelector('#theme-status').textContent = `انتخاب مستقل برای ${restaurantName}؛ فقط در همین مرورگر، نه برای سایر بازدیدکنندگان.`;
    }
  };
})();
