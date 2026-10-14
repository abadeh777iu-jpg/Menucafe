/* Welcome notice: a Dynamic Island-style card shown at the top of a restaurant's menu when a guest arrives.
   It starts as a black island, drops a gooey droplet and morphs into a white card with the restaurant's
   welcome line. It hides by itself, on tap, or when swiped up, and shows once per visit to each restaurant.
   Concept adapted from github.com/rit3zh/expo-dynamic-notifications (MIT). This is a new web implementation. */
(() => {
  'use strict';
  const SHOW_DELAY = 700;      // let the hero settle first
  const VISIBLE_MS = 4800;     // reading time for a short Persian sentence
  const RESUME_MS = 2200;      // time left after the pointer leaves
  const HIDE_MS = 650;         // matches the exit transition in welcome.css
  const SWIPE_UP_PX = 24;
  const TAP_PX = 6;

  let root = null;
  let timer = 0;
  let hideTimer = 0;
  let startY = null;

  function ensureGooFilter() {
    if (document.getElementById('wn-goo-filter')) return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'wn-goo-filter';
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.position = 'absolute';
    svg.innerHTML = '<filter id="wn-goo" color-interpolation-filters="sRGB">'
      + '<feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur"/>'
      + '<feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9.5" result="goo"/>'
      + '<feComposite in="SourceGraphic" in2="goo" operator="atop"/>'
      + '</filter>';
    document.body.append(svg);
  }

  function build() {
    if (root) return root;
    ensureGooFilter();
    root = document.createElement('div');
    root.className = 'wn';
    root.id = 'welcome-notice';
    root.hidden = true;
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    // Static markup only; restaurant text is set with textContent below.
    root.innerHTML = '<div class="wn-goo" aria-hidden="true"><div class="wn-shape"></div><div class="wn-drop"></div></div>'
      + '<div class="wn-card"><span class="wn-mark" aria-hidden="true"></span>'
      + '<div class="wn-text"><strong class="wn-title"></strong><span class="wn-message"></span></div>'
      + '<button type="button" class="wn-close" aria-label="بستن پیام">×</button></div>';
    document.body.append(root);
    root.addEventListener('pointerdown', event => { startY = event.clientY; });
    root.addEventListener('pointerup', event => {
      if (startY === null) return;
      const dy = event.clientY - startY;
      startY = null;
      if (dy < -SWIPE_UP_PX || Math.abs(dy) < TAP_PX) hide();
    });
    root.addEventListener('pointerenter', pause);
    root.addEventListener('pointerleave', resume);
    root.querySelector('.wn-close').addEventListener('click', event => {
      event.stopPropagation();
      hide();
    });
    return root;
  }

  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(hide, ms);
  }

  function pause() {
    clearTimeout(timer);
  }

  function resume() {
    if (root && root.classList.contains('is-open')) schedule(RESUME_MS);
  }

  function hide() {
    if (!root || root.hidden) return;
    clearTimeout(timer);
    root.classList.remove('is-open');
    root.classList.add('is-leaving');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      root.hidden = true;
      root.classList.remove('is-leaving');
    }, HIDE_MS);
  }

  function present(restaurant) {
    const key = `menu-welcome:${restaurant.slug}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      // Storage is blocked (private mode, iframe): show the notice anyway.
    }
    const node = build();
    node.querySelector('.wn-mark').textContent = restaurant.mark || '';
    node.querySelector('.wn-title').textContent = `خوش آمدید به ${restaurant.name}`;
    node.querySelector('.wn-message').textContent = restaurant.welcomeMessage
      || `${restaurant.name} منوی امروز را برای شما آماده کرده است.`;
    clearTimeout(hideTimer);
    node.classList.remove('is-leaving');
    node.hidden = false;
    void node.offsetWidth; // restart the morph from the island
    node.classList.add('is-open');
    schedule(VISIBLE_MS);
  }

  window.WelcomeNotice = {
    show(restaurant) {
      // The owner's preview page never shows the guest welcome.
      if (!restaurant || window.MENU_PREVIEW_SLUG) return;
      setTimeout(() => present(restaurant), SHOW_DELAY);
    },
    hide,
  };
})();
