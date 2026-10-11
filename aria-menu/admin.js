/* Owner panel for one restaurant. Every request goes to /api/admin/<slug>/...,
   where the server checks the session, the CSRF token and the restaurant ownership.
   Hiding controls here is convenience only; the server is the real gate. */
(() => {
  'use strict';

  const slug = (location.pathname.match(/^\/admin\/([^/]+)/) || [])[1] || '';
  const money = new Intl.NumberFormat('fa-IR');
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  let csrf = '';
  let view = null;

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'text') node.textContent = value;
      else if (key === 'class') node.className = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else if (value === true) node.setAttribute(key, '');
      else node.setAttribute(key, String(value));
    }
    node.append(...children.filter(child => child !== undefined && child !== null));
    return node;
  }

  function say(text, kind = 'info') {
    const box = $('#admin-status');
    box.textContent = text;
    box.dataset.kind = kind;
  }

  function report(form, text, kind = 'ok') {
    const box = form ? $('[data-msg]', form) : null;
    if (box) {
      box.textContent = text;
      box.dataset.kind = kind;
    } else {
      say(text, kind);
    }
  }

  async function api(method, path, body) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET') headers['X-CSRF-Token'] = csrf;
    const response = await fetch(`/api/${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let payload = {};
    try { payload = await response.json(); } catch { /* empty body */ }
    if (!response.ok) {
      const error = new Error(payload.error || 'درخواست ناموفق بود؛ دوباره تلاش کنید.');
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  const base = () => `admin/${encodeURIComponent(slug)}`;

  function showOnly(name) {
    $('#login-view').hidden = name !== 'login';
    $('#dashboard').hidden = name !== 'dashboard';
    $('#admin-logout').hidden = name === 'login';
  }

  function fillSelect(select, options, selected) {
    select.replaceChildren(...options.map(option => el('option', {
      value: option.value, text: option.label, selected: option.value === selected,
    })));
  }

  // ----- rendering -------------------------------------------------------------

  function renderProfile() {
    const form = $('#profile-form');
    const restaurant = view.restaurant;
    for (const field of ['name', 'englishName', 'mark', 'headline', 'note', 'description', 'footer']) {
      form.elements[field].value = restaurant[field] || '';
    }
    $('#admin-restaurant').textContent = restaurant.name;
    $('#admin-public').href = `/${slug}`;
    $$('[data-public-link]').forEach(link => { link.href = `/${slug}`; });
  }

  function renderThemes() {
    const list = $('#theme-list');
    list.replaceChildren(...view.themes.map(theme => {
      const selected = theme.id === view.restaurant.theme;
      return el('button', {
        type: 'button',
        class: 'theme-choice',
        role: 'radio',
        'aria-checked': String(selected),
        'data-theme': theme.id,
        onclick: () => chooseTheme(theme.id),
      },
        el('strong', { text: theme.name }),
        el('small', { text: theme.hint }),
        selected ? el('span', { class: 'tick', text: 'فعال' }) : null,
      );
    }));
  }

  function categoryName(id) {
    const category = view.categories.find(c => c.id === id);
    return category ? category.name : '—';
  }

  function renderCategories() {
    const list = $('#category-list');
    if (!view.categories.length) {
      list.replaceChildren(el('p', { class: 'muted', text: 'هنوز دسته‌بندی ثبت نشده است.' }));
      return;
    }
    list.replaceChildren(...view.categories.map(category => {
      const count = view.items.filter(item => item.category === category.id).length;
      return el('div', { class: 'row' },
        el('div', { class: 'row-main' },
          el('strong', { text: category.name }),
          el('small', { text: `${money.format(count)} غذا · ترتیب ${money.format(category.position)}` }),
        ),
        el('button', { class: 'btn small', type: 'button', text: 'ویرایش', onclick: () => editCategory(category.id) }),
      );
    }));
    const itemForm = $('#item-form');
    fillSelect(itemForm.elements.category, view.categories.map(c => ({ value: c.id, label: c.name })),
      itemForm.elements.category.value);
  }

  function renderItemFilter() {
    const filter = $('#item-filter');
    const current = filter.value || '';
    fillSelect(filter, [{ value: '', label: 'همهٔ دسته‌ها' }, ...view.categories.map(c => ({ value: c.id, label: c.name }))], current);
  }

  function renderItems() {
    const filter = $('#item-filter').value;
    const items = view.items.filter(item => !filter || item.category === filter);
    const list = $('#item-list');
    if (!items.length) {
      list.replaceChildren(el('p', { class: 'muted', text: 'غذایی برای نمایش در این بخش وجود ندارد.' }));
      return;
    }
    list.replaceChildren(...items.map(item => {
      const toggle = el('input', {
        type: 'checkbox', checked: item.visible, 'aria-label': `نمایش ${item.name} در منوی عمومی`,
        onchange: event => toggleVisible(item.id, event.target.checked),
      });
      return el('div', { class: `row${item.visible ? '' : ' is-hidden'}` },
        el('div', { class: 'row-main' },
          el('strong', { text: item.name }),
          el('small', { text: `${categoryName(item.category)} · ${money.format(item.price)} تومان${item.visible ? '' : ' · پنهان'}` }),
        ),
        el('label', { class: 'switch' }, toggle, el('span', { text: 'نمایش' })),
        el('button', { class: 'btn small', type: 'button', text: 'ویرایش', onclick: () => editItem(item.id) }),
      );
    }));
  }

  function renderAll() {
    renderProfile();
    renderThemes();
    renderCategories();
    renderItemFilter();
    renderItems();
  }

  // ----- data ------------------------------------------------------------------

  async function load() {
    view = await api('GET', base());
    fillSelect($('#category-form').elements.icon, view.icons.map(i => ({ value: i.id, label: i.name })), '');
    fillSelect($('#item-form').elements.icon, view.icons.map(i => ({ value: i.id, label: i.name })), '');
    renderAll();
  }

  function applyView(next) {
    view = next;
    renderAll();
  }

  // ----- profile, theme ---------------------------------------------------------

  async function saveProfile(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = {};
    for (const field of ['name', 'englishName', 'mark', 'headline', 'note', 'description', 'footer']) {
      body[field] = form.elements[field].value;
    }
    try {
      applyView(await api('PUT', `${base()}/profile`, body));
      report(form, 'اطلاعات رستوران ذخیره شد.');
    } catch (error) {
      report(form, error.message, 'error');
    }
  }

  async function chooseTheme(theme) {
    try {
      applyView(await api('PUT', `${base()}/theme`, { theme }));
      report(null, 'تم منو ذخیره شد و در منوی عمومی اعمال می‌شود.');
    } catch (error) {
      report(null, error.message, 'error');
    }
  }

  // ----- categories ------------------------------------------------------------

  function resetCategoryForm() {
    const form = $('#category-form');
    form.reset();
    form.elements.id.value = '';
    form.elements.position.value = String(view.categories.length ? Math.max(...view.categories.map(c => c.position)) + 1 : 0);
    report(form, '');
  }

  function editCategory(id) {
    const category = view.categories.find(c => c.id === id);
    if (!category) return;
    const form = $('#category-form');
    form.elements.id.value = category.id;
    form.elements.name.value = category.name;
    form.elements.icon.value = category.icon;
    form.elements.position.value = String(category.position);
    report(form, `ویرایش «${category.name}»`, 'info');
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function saveCategory(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const id = form.elements.id.value;
    const body = {
      name: form.elements.name.value,
      icon: form.elements.icon.value,
      position: Number.parseInt(form.elements.position.value, 10),
    };
    try {
      applyView(id
        ? await api('PUT', `${base()}/categories/${encodeURIComponent(id)}`, body)
        : await api('POST', `${base()}/categories`, body));
      resetCategoryForm();
      report(form, 'دسته‌بندی ذخیره شد.');
    } catch (error) {
      report(form, error.message, 'error');
    }
  }

  // ----- items -----------------------------------------------------------------

  function openItemForm(item) {
    const form = $('#item-form');
    const isNew = !item;
    form.hidden = false;
    $('#item-form-title').textContent = isNew ? 'غذای تازه' : `ویرایش «${item.name}»`;
    form.elements.id.value = isNew ? '' : String(item.id);
    form.elements.name.value = isNew ? '' : item.name;
    form.elements.category.value = isNew ? ($('#item-filter').value || (view.categories[0] || {}).id || '') : item.category;
    form.elements.price.value = isNew ? '' : String(item.price);
    form.elements.icon.value = isNew ? 'bowl' : item.icon;
    form.elements.label.value = isNew ? '' : item.label;
    form.elements.position.value = isNew
      ? String(view.items.length ? Math.max(...view.items.map(i => i.position)) + 1 : 0)
      : String(item.position);
    form.elements.allergens.value = isNew ? '' : item.allergens.join('، ');
    form.elements.description.value = isNew ? '' : item.description;
    form.elements.ingredients.value = isNew ? '' : item.ingredients;
    form.elements.visible.checked = isNew ? true : item.visible;
    $('#item-delete').hidden = isNew;
    report(form, '');
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function closeItemForm() {
    const form = $('#item-form');
    form.hidden = true;
    form.reset();
    report(form, '');
  }

  function editItem(id) {
    const item = view.items.find(i => i.id === id);
    if (item) openItemForm(item);
  }

  async function toggleVisible(id, visible) {
    try {
      const item = view.items.find(i => i.id === id);
      applyView(await api('PUT', `${base()}/items/${id}`, {
        name: item.name, category: item.category, price: item.price, icon: item.icon, label: item.label,
        position: item.position, description: item.description, ingredients: item.ingredients,
        allergens: item.allergens, visible,
      }));
      report(null, visible ? 'غذا در منوی عمومی نمایش داده می‌شود.' : 'غذا از منوی عمومی پنهان شد.');
    } catch (error) {
      report(null, error.message, 'error');
      await load();
    }
  }

  function parseAllergens(text) {
    return text.split(/[،,]/).map(part => part.trim()).filter(Boolean);
  }

  async function saveItem(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const id = form.elements.id.value;
    const body = {
      name: form.elements.name.value,
      category: form.elements.category.value,
      price: Number.parseInt(form.elements.price.value, 10),
      icon: form.elements.icon.value,
      label: form.elements.label.value,
      position: Number.parseInt(form.elements.position.value, 10),
      allergens: parseAllergens(form.elements.allergens.value),
      description: form.elements.description.value,
      ingredients: form.elements.ingredients.value,
      visible: form.elements.visible.checked,
    };
    if (Number.isNaN(body.price)) body.price = form.elements.price.value;
    if (Number.isNaN(body.position)) body.position = form.elements.position.value;
    try {
      applyView(id
        ? await api('PUT', `${base()}/items/${encodeURIComponent(id)}`, body)
        : await api('POST', `${base()}/items`, body));
      if (!id) {
        closeItemForm();
        say('غذای تازه ذخیره شد.');
      } else {
        report(form, 'غذا ذخیره شد.');
      }
    } catch (error) {
      report(form, error.message, 'error');
    }
  }

  async function deleteItem() {
    const form = $('#item-form');
    const id = form.elements.id.value;
    if (!id || !window.confirm('این غذا برای همیشه حذف شود؟')) return;
    try {
      applyView(await api('DELETE', `${base()}/items/${encodeURIComponent(id)}`));
      closeItemForm();
      say('غذا حذف شد.');
    } catch (error) {
      report(form, error.message, 'error');
    }
  }

  async function deleteCategory() {
    const form = $('#category-form');
    const id = form.elements.id.value;
    if (!id || !window.confirm('این دسته‌بندی حذف شود؟ (فقط دسته‌های بدون غذا حذف می‌شوند)')) return;
    try {
      applyView(await api('DELETE', `${base()}/categories/${encodeURIComponent(id)}`));
      resetCategoryForm();
      say('دسته‌بندی حذف شد.');
    } catch (error) {
      report(form, error.message, 'error');
    }
  }

  // ----- session ---------------------------------------------------------------

  async function login(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $('button[type=submit]', form);
    button.disabled = true;
    try {
      const session = await api('POST', 'auth/login', {
        username: form.elements.username.value,
        password: form.elements.password.value,
      });
      form.elements.password.value = '';
      if (session.user.restaurantSlug !== slug) {
        await api('POST', 'auth/logout').catch(() => {});
        csrf = '';
        report(form, 'این حساب به رستوران دیگری تعلق دارد و به این پنل دسترسی ندارد.', 'error');
        return;
      }
      csrf = session.csrfToken;
      showOnly('dashboard');
      await load();
      say(`وارد شدید: ${session.user.username}`);
    } catch (error) {
      report(form, error.message, 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function logout() {
    try {
      await api('POST', 'auth/logout');
    } catch { /* session may already be gone */ }
    csrf = '';
    view = null;
    showOnly('login');
    say('از پنل خارج شدید.');
  }

  async function start() {
    if (!slug) {
      say('آدرس پنل معتبر نیست.', 'error');
      return;
    }
    $('#admin-public').href = `/${slug}`;
    try {
      const me = await api('GET', 'auth/me');
      csrf = me.csrfToken;
      $('#admin-user').textContent = me.user.username;
      if (me.user.restaurantSlug !== slug) {
        showOnly('login');
        $('#admin-logout').hidden = false;
        report($('#login-form'), 'این حساب به رستوران دیگری تعلق دارد. با حساب مربوط به این رستوران وارد شوید یا از این حساب خارج شوید.', 'error');
        return;
      }
      showOnly('dashboard');
      await load();
    } catch (error) {
      if (error.status === 401) {
        showOnly('login');
        say('برای مدیریت منو وارد شوید.');
      } else {
        showOnly('login');
        say(error.message, 'error');
      }
    }
  }

  // ----- wiring ----------------------------------------------------------------

  $('#login-form').addEventListener('submit', login);
  $('#admin-logout').addEventListener('click', logout);
  $('#profile-form').addEventListener('submit', saveProfile);
  $('#category-form').addEventListener('submit', saveCategory);
  $('[data-reset="category"]').addEventListener('click', resetCategoryForm);
  $('#item-form').addEventListener('submit', saveItem);
  $('#item-new').addEventListener('click', () => openItemForm(null));
  $('#item-cancel').addEventListener('click', closeItemForm);
  $('#item-delete').addEventListener('click', deleteItem);
  $('#item-filter').addEventListener('change', renderItems);
  $('#category-form').insertBefore(
    el('button', { class: 'btn danger', type: 'button', text: 'حذف دسته', onclick: deleteCategory }),
    $('#category-form').querySelector('[data-msg]'),
  );

  start();
})();
