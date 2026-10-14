/* Seller panel: register restaurants and issue or revoke manager licence keys.
   Every request goes to /api/super/...; the server checks the seller session and the CSRF token on writes. */
(() => {
  'use strict';

  const THEMES = [
    ['default', 'پیش‌فرض'], ['winter', 'زمستان'], ['nowruz', 'نوروز و بهار'], ['yalda', 'شب یلدا'],
    ['summer', 'تابستان'], ['valentine', 'ولنتاین'], ['halloween', 'هالووین'], ['autumn', 'پاییز'], ['spring', 'بهار'],
  ];
  const $ = (selector, root = document) => root.querySelector(selector);
  let csrf = '';
  let selected = null;

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === 'text') node.textContent = value;
      else if (key === 'className') node.className = value;
      else if (key === 'onClick') node.addEventListener('click', value);
      else node.setAttribute(key, value);
    }
    node.append(...children.filter(child => child !== null && child !== undefined));
    return node;
  }

  function say(text, kind = 'info') {
    const box = $('#super-status');
    box.textContent = text;
    box.dataset.kind = kind;
  }

  function report(form, text, kind = 'ok') {
    const box = $('[data-msg]', form);
    box.textContent = text;
    box.dataset.kind = kind;
  }

  const date = unix => (unix ? new Date(unix * 1000).toLocaleDateString('fa-IR') : '—');

  async function api(method, path, body) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET') headers['X-CSRF-Token'] = csrf;
    let response;
    try {
      response = await fetch(`/api/super/${path}`, {
        method, headers, credentials: 'same-origin', cache: 'no-store',
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new Error('اتصال به سرور برقرار نشد؛ دوباره تلاش کنید.');
    }
    let payload = {};
    try { payload = await response.json(); } catch { /* empty body */ }
    if (!response.ok) {
      const error = new Error(payload.error || 'انجام نشد؛ دوباره تلاش کنید.');
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function showOnly(name) {
    $('#super-setup').hidden = name !== 'setup';
    $('#super-login').hidden = name !== 'login';
    $('#super-dashboard').hidden = name !== 'dashboard';
    $('#super-logout').hidden = name === 'login';
  }

  function renderRestaurants(restaurants) {
    const box = $('#restaurant-list');
    box.replaceChildren();
    if (!restaurants.length) box.append(el('p', { className: 'muted', text: 'هنوز رستورانی ثبت نشده است.' }));
    for (const restaurant of restaurants) {
      box.append(el('div', { className: 'row' },
        el('div', { className: 'row-main' },
          el('strong', { text: restaurant.name }),
          el('small', { dir: 'ltr', text: `${restaurant.slug} · ${restaurant.activeLicenses} لایسنس فعال` })),
        el('div', { className: 'row-tools' },
          el('button', { className: 'btn small', type: 'button', text: 'لایسنس‌ها', onClick: () => selectRestaurant(restaurant) }),
          el('a', { className: 'btn small ghost', href: `/${restaurant.slug}`, target: '_blank', rel: 'noopener', text: 'منوی عمومی' }),
          el('a', { className: 'btn small ghost', href: `/admin/${restaurant.slug}`, target: '_blank', rel: 'noopener', text: 'پنل مدیر' }))));
    }
  }

  async function loadRestaurants() {
    const { restaurants } = await api('GET', 'restaurants');
    renderRestaurants(restaurants);
    return restaurants;
  }

  function renderLicenses(licenses) {
    const box = $('#license-list');
    box.replaceChildren();
    if (!licenses.length) box.append(el('p', { className: 'muted', text: 'برای این رستوران هنوز لایسنسی صادر نشده است.' }));
    for (const license of licenses) {
      const status = license.active ? 'فعال' : 'باطل‌شده';
      box.append(el('div', { className: 'row' },
        el('div', { className: 'row-main' },
          el('strong', { text: license.label || 'بدون برچسب' }),
          el('small', { dir: 'ltr', text: `…${license.keyHint} · ${status}` }),
          el('small', { text: `ساخت: ${date(license.createdAt)} · آخرین ورود: ${date(license.lastUsedAt)}` })),
        license.active
          ? el('div', { className: 'row-tools' },
            el('button', { className: 'btn small danger', type: 'button', text: 'باطل کردن', onClick: () => revoke(license) }))
          : null));
    }
  }

  async function selectRestaurant(restaurant) {
    selected = restaurant.slug;
    $('#license-restaurant').textContent = restaurant.name;
    $('#license-panel').hidden = false;
    $('#new-key').hidden = true;
    $('#license-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    const { licenses } = await api('GET', `restaurants/${encodeURIComponent(selected)}/licenses`);
    renderLicenses(licenses);
  }

  async function revoke(license) {
    if (!window.confirm(`لایسنس «${license.label || '…' + license.keyHint}» باطل شود؟ مدیری که با این کلید وارد شده، بلافاصله خارج می‌شود.`)) return;
    try {
      await api('POST', `licenses/${license.id}/revoke`);
      say('لایسنس باطل شد.');
      await selectRestaurant({ slug: selected, name: $('#license-restaurant').textContent });
      await loadRestaurants();
    } catch (error) {
      say(error.message, 'error');
    }
  }

  async function login(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $('button[type=submit]', form);
    button.disabled = true;
    try {
      const session = await api('POST', 'login', {
        username: form.elements.username.value,
        password: form.elements.password.value,
      });
      form.elements.password.value = '';
      csrf = session.csrfToken;
      $('#super-user').textContent = session.admin.username;
      showOnly('dashboard');
      await loadRestaurants();
      say(`وارد شدید: ${session.admin.username}`);
    } catch (error) {
      report(form, error.message, 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function setup(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $('button[type=submit]', form);
    if (form.elements.password.value !== form.elements.password2.value) {
      report(form, 'دو رمز عبور یکسان نیستند.', 'error');
      return;
    }
    button.disabled = true;
    try {
      const session = await api('POST', 'setup', {
        setupCode: form.elements.setupCode.value,
        username: form.elements.username.value,
        password: form.elements.password.value,
      });
      form.reset();
      csrf = session.csrfToken;
      $('#super-user').textContent = session.admin.username;
      showOnly('dashboard');
      await loadRestaurants();
      say(`حساب ساخته شد و وارد شدید: ${session.admin.username}`);
    } catch (error) {
      report(form, error.message, 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function logout() {
    try { await api('POST', 'logout'); } catch { /* session may already be gone */ }
    csrf = '';
    selected = null;
    $('#license-panel').hidden = true;
    showOnly('login');
    say('از پنل خارج شدید.');
  }

  async function addRestaurant(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $('button[type=submit]', form);
    button.disabled = true;
    try {
      const body = {
        slug: form.elements.slug.value.trim(),
        name: form.elements.name.value,
        englishName: form.elements.englishName.value,
        theme: form.elements.theme.value,
      };
      const { slug, restaurants } = await api('POST', 'restaurants', body);
      form.reset();
      renderRestaurants(restaurants);
      report(form, `رستوران «${slug}» ثبت شد. حالا برای آن لایسنس صادر کنید.`);
      const created = restaurants.find(restaurant => restaurant.slug === slug);
      if (created) await selectRestaurant(created);
    } catch (error) {
      report(form, error.message, 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function issueLicense(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!selected) {
      report(form, 'ابتدا یک رستوران را انتخاب کنید.', 'error');
      return;
    }
    const button = $('button[type=submit]', form);
    button.disabled = true;
    try {
      const issued = await api('POST', `restaurants/${encodeURIComponent(selected)}/licenses`, {
        label: form.elements.label.value,
      });
      form.reset();
      $('#new-key-value').textContent = issued.key;
      $('#new-key').hidden = false;
      renderLicenses(issued.licenses);
      report(form, 'لایسنس صادر شد. کلید را همین حالا کپی کنید.');
      await loadRestaurants();
    } catch (error) {
      report(form, error.message, 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function start() {
    const select = $('#theme-select');
    select.replaceChildren(...THEMES.map(([id, name]) => el('option', { value: id, text: name })));
    try {
      const status = await api('GET', 'setup-status');
      if (status.needsSetup) {
        showOnly('setup');
        return;
      }
    } catch { /* older server or offline: continue to the normal sign-in check */ }
    try {
      const me = await api('GET', 'me');
      csrf = me.csrfToken;
      $('#super-user').textContent = me.admin.username;
      showOnly('dashboard');
      await loadRestaurants();
    } catch (error) {
      showOnly('login');
      if (error.status !== 401) say(error.message, 'error');
    }
  }

  $('#super-login-form').addEventListener('submit', login);
  $('#super-setup-form').addEventListener('submit', setup);
  $('#super-logout').addEventListener('click', logout);
  $('#restaurant-form').addEventListener('submit', addRestaurant);
  $('#license-form').addEventListener('submit', issueLicense);
  $('#copy-key').addEventListener('click', async () => {
    const key = $('#new-key-value').textContent;
    try {
      await navigator.clipboard.writeText(key);
      say('کلید کپی شد.');
    } catch {
      say('کپی خودکار انجام نشد؛ کلید را دستی کپی کنید.', 'error');
    }
  });
  start();
})();
