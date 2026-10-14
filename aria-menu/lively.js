/* Livelier menu page: scroll progress, staggered reveal of sections and cards, sticky-bar shadow.
   Everything here is progressive: without JavaScript the page is complete and static, and
   visitors who asked for reduced motion get no reveal animation at all. */
(() => {
  'use strict';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduced.matches) return;
  const root = document.documentElement;
  root.classList.add('lv');

  const bar = document.createElement('div');
  bar.className = 'lv-progress';
  bar.setAttribute('aria-hidden', 'true');
  document.body.append(bar);

  const nav = () => document.querySelector('.navigation');
  let frame = 0;
  function onScroll() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      root.style.setProperty('--lv-progress', progress.toFixed(4));
      nav()?.classList.toggle('is-stuck', window.scrollY > 40);
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  // Cards that were already shown stay visible when the list is filtered again (search typing),
  // so only genuinely new cards animate in.
  const seen = new Set();
  const canObserve = 'IntersectionObserver' in window;
  const observer = canObserve ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-in');
      observer.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }) : null;

  function reveal(node, delay, key) {
    node.classList.add('lv-reveal');
    node.style.setProperty('--d', `${delay}ms`);
    if (key && seen.has(key)) {
      node.classList.add('is-in', 'lv-instant');
      return;
    }
    if (key) seen.add(key);
    if (!observer) {
      node.classList.add('is-in');
      return;
    }
    observer.observe(node);
  }

  function scan(container) {
    container.querySelectorAll('.section:not(.lv-reveal)').forEach((section, index) => {
      reveal(section, Math.min(index, 4) * 90, `section:${section.getAttribute('aria-labelledby')}`);
    });
    container.querySelectorAll('.card:not(.lv-reveal)').forEach((card, index) => {
      const title = card.querySelector('h3')?.textContent || '';
      const section = card.closest('.section');
      const key = `card:${section?.getAttribute('aria-labelledby') || ''}:${title}`;
      reveal(card, (index % 4) * 70, key);
    });
  }

  const content = document.querySelector('#menu-content');
  if (content) {
    new MutationObserver(() => scan(content)).observe(content, { childList: true });
    scan(content);
  }
})();
