/* Owner panel for one restaurant. Every request goes to /api/admin/<slug>/...; the server checks
   the session, the CSRF token, and that the session belongs to this restaurant on every call.
   Hiding controls here is convenience only; the server is the real gate. */
(() => {
  'use strict';

  const slug = (location.pathname.match(/^\/admin\/([^/]+)/) || [])[1] || '';
  const money = new Intl.NumberFormat('fa-IR');
  const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
  const fa = text => String(text).replace(/[0-9]/g, digit => FA_DIGITS[Number(digit)]);
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const JALALI_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
    'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
  const GREGORIAN_MONTHS = ['ژانویه', 'فوریه', 'مارس', 'آوریل', 'مه', 'ژوئن', 'ژوئیه', 'اوت', 'سپتامبر',
    'اکتبر', 'نوامبر', 'دسامبر'];
  const SUGGESTED_CATEGORIES = [
    { name: 'فست‌فود', icon: 'plate' }, { name: 'غذای اصلی', icon: 'rice' },
    { name: 'نوشیدنی', icon: 'glass' }, { name: 'دسر', icon: 'cake' },
    { name: 'قلیان', icon: 'leaf' }, { name: 'صبحانه', icon: 'bowl' },
    { name: 'سالاد', icon: 'leaf' }, { name: 'پیش‌غذا', icon: 'kebab' },
  ];
  const PROFILE_FIELDS = ['name', 'englishName', 'mark', 'headline', 'note', 'description', 'footer'];

  let csrf = '';
  let view = null;
  let currentUsername = '';
  const tracked = new Map(); // form -> serialized values at the last load or save

  // ----- small helpers ----------------------------------------------------------

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
    let response;
    try {
      response = await fetch(`/api/${path}`, {
        method,
        headers,
        credentials: 'same-origin',
        cache: 'no-store',
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new Error('اتصال به سرور برقرار نشد؛ تغییرات ذخیره نشد. اتصال را بررسی کنید و دوباره تلاش کنید.');
    }
    let payload = {};
    try { payload = await response.json(); } catch { /* empty body */ }
    if (!response.ok) {
      const error = new Error(payload.error || 'ذخیره انجام نشد؛ دوباره تلاش کنید.');
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

  // ----- unsaved changes and double submits ---------------------------------------

  function serialize(form) {
    const values = {};
    for (const field of form.elements) {
      if (!field.name) continue;
      values[field.name] = field.type === 'checkbox' ? field.checked : field.value;
    }
    return JSON.stringify(values);
  }

  function track(form) {
    tracked.set(form, serialize(form));
  }

  function untrack(form) {
    tracked.delete(form);
  }

  function isDirty(form) {
    return tracked.has(form) && !form.hidden && tracked.get(form) !== serialize(form);
  }

  function confirmDiscard(forms) {
    const dirty = forms.some(isDirty);
    return !dirty || window.confirm('تغییرات ذخیره‌نشده دارید. اگر ادامه دهید این تغییرات از بین می‌رود. ادامه می‌دهید؟');
  }

  window.addEventListener('beforeunload', event => {
    if ([...tracked.keys()].some(isDirty)) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  // Runs `task` once; repeated taps while a save is running are ignored.
  async function saveOnce(form, task) {
    if (form.dataset.busy === '1') return;
    form.dataset.busy = '1';
    const buttons = $$('button[type=submit], button[data-busy-button]', form);
    buttons.forEach(button => { button.disabled = true; });
    try {
      await task();
    } finally {
      form.dataset.busy = '';
      buttons.forEach(button => { button.disabled = false; });
    }
  }

  // ----- theme helpers --------------------------------------------------------------

  function themeName(id) {
    const theme = view.themes.find(t => t.id === id);
    return theme ? theme.name : id;
  }

  function ruleLabel(key) {
    const rule = view.schedule.rules.find(r => r.key === key);
    return rule ? rule.label : key;
  }

  function sourceText(active) {
    if (active.source === 'manual') return 'انتخاب دستی شما (بالاترین اولویت)';
    if (active.source === 'event') return `برنامهٔ رویداد: ${ruleLabel(active.rule)}`;
    if (active.source === 'seasonal') return `برنامهٔ فصلی: ${ruleLabel(active.rule)}`;
    return 'تم پیش‌فرض رستوران (هیچ برنامه‌ای امروز فعال نیست)';
  }

  function renderThemeStatus() {
    const box = $('#theme-status');
    const active = view.activeTheme;
    const today = view.schedule.today;
    const lines = [
      el('strong', { text: `تم فعال الان: ${active.themeName}` }),
      el('span', { text: `دلیل: ${sourceText(active)}` }),
      el('small', { text: `امروز (تهران): ${fa(today.jalali)} برابر ${fa(today.gregorian)} · ساعت ${fa(today.time)}` }),
    ];
    if (active.conflict) {
      lines.push(el('span', { class: 'warning', text: `هشدار تعارض: ${active.conflict.message} (${active.conflict.keys.map(ruleLabel).join('، ')})` }));
    }
    box.replaceChildren(...lines);
    $('#theme-clear').hidden = !view.restaurant.manualTheme;
  }

  function renderThemeList() {
    const list = $('#theme-list');
    const manual = view.restaurant.manualTheme;
    list.replaceChildren(...view.themes.map(theme => {
      const selected = theme.id === manual;
      const isActive = theme.id === view.activeTheme.theme;
      return el('div', { class: 'theme-choice-wrap' },
        el('button', {
          type: 'button',
          class: 'theme-choice',
          role: 'radio',
          'aria-checked': String(selected),
          'data-theme': theme.id,
          onclick: () => chooseManualTheme(theme.id),
        },
          el('strong', { text: theme.name }),
          el('small', { text: theme.hint }),
          isActive ? el('span', { class: 'tick', text: 'فعال الان' }) : null,
        ),
        el('button', {
          type: 'button', class: 'btn small ghost', text: 'پیش‌نمایش',
          onclick: () => openPreview(theme.id, theme.name),
        }),
      );
    }));
  }

  function openPreview(themeId, name) {
    const panel = $('#preview-panel');
    $('#preview-title').textContent = `پیش‌نمایش: ${name}`;
    $('#preview-frame').src = `/admin/${encodeURIComponent(slug)}/preview?theme=${encodeURIComponent(themeId)}`;
    panel.hidden = false;
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function closePreview() {
    $('#preview-frame').src = 'about:blank';
    $('#preview-panel').hidden = true;
  }

  // ----- profile ----------------------------------------------------------------------

  function renderProfile() {
    const form = $('#profile-form');
    const restaurant = view.restaurant;
    for (const field of PROFILE_FIELDS) {
      form.elements[field].value = restaurant[field] || '';
    }
    $('#admin-restaurant').textContent = restaurant.name;
    $('#admin-public').href = `/${slug}`;
    $$('[data-public-link]').forEach(link => { link.href = `/${slug}`; });
    track(form);
  }

  function renderDefaultThemeForm() {
    const form = $('#default-theme-form');
    fillSelect(form.elements.theme, view.themes.map(t => ({ value: t.id, label: t.name })), view.restaurant.defaultTheme);
    track(form);
  }

  // ----- schedule ---------------------------------------------------------------------

  function monthOptions(calendar) {
    const names = calendar === 'jalali' ? JALALI_MONTHS : GREGORIAN_MONTHS;
    return names.map((name, index) => ({ value: String(index + 1), label: `${fa(index + 1)} · ${name}` }));
  }

  function ruleStatus(rule) {
    if (!rule.enabled) return { text: 'خاموش', kind: 'off' };
    if (rule.matchesToday) return { text: 'فعال امروز', kind: 'on' };
    return { text: 'روشن · خارج از بازه', kind: 'wait' };
  }

  function ruleCard(rule) {
    const form = el('form', { class: 'rule-card', 'data-rule': rule.key, autocomplete: 'off' });
    const status = ruleStatus(rule);
    form.append(
      el('div', { class: 'rule-head' },
        el('div', { class: 'rule-title' },
          el('strong', { text: rule.label }),
          el('small', { text: `${rule.kind === 'event' ? 'رویداد' : 'فصلی'} · تم: ${rule.themeName}` }),
        ),
        el('span', { class: `badge ${status.kind}`, 'data-status': '', text: status.text }),
      ),
      el('p', { class: 'muted rule-window', 'data-window': '', text: `بازه: ${rule.window} · منطقهٔ زمانی ${rule.timezone}` }),
      el('div', { class: 'grid-form rule-fields' },
        el('label', { class: 'check wide' },
          el('input', { name: 'enabled', type: 'checkbox', checked: rule.enabled }), 'فعال باشد'),
        el('label', { text: 'تقویم' },
          el('select', { name: 'calendar' },
            el('option', { value: 'jalali', text: 'شمسی (هجری خورشیدی)', selected: rule.calendar === 'jalali' }),
            el('option', { value: 'gregorian', text: 'میلادی', selected: rule.calendar === 'gregorian' }))),
        el('label', { text: 'تم این برنامه' },
          el('select', { name: 'theme' }, ...view.themes.map(theme => el('option', {
            value: theme.id, text: theme.name, selected: theme.id === rule.theme,
          })))),
        el('label', { text: 'ماه شروع' }, el('select', { name: 'startMonth' })),
        el('label', { text: 'روز شروع' }, el('input', { name: 'startDay', type: 'number', min: '1', max: '31', step: '1', required: true, value: rule.startDay })),
        el('label', { text: 'ماه پایان' }, el('select', { name: 'endMonth' })),
        el('label', { text: 'روز پایان' }, el('input', { name: 'endDay', type: 'number', min: '1', max: '31', step: '1', required: true, value: rule.endDay })),
        el('label', { text: 'اولویت (۰ تا ۱۰۰)' }, el('input', { name: 'priority', type: 'number', min: '0', max: '100', step: '1', required: true, value: rule.priority })),
      ),
      el('div', { class: 'actions' },
        el('button', { class: 'btn primary', type: 'submit', text: 'ذخیرهٔ برنامه' }),
        el('button', { class: 'btn ghost', type: 'button', text: 'پیش‌نمایش این تم', onclick: () => openPreview(rule.theme, themeName(rule.theme)) }),
      ),
      el('p', { class: 'form-msg', 'data-msg': '', role: 'status' }),
    );
    fillRuleMonths(form, rule.calendar, rule.startMonth, rule.endMonth);
    form.elements.calendar.addEventListener('change', event => {
      fillRuleMonths(form, event.target.value, Number(form.elements.startMonth.value), Number(form.elements.endMonth.value));
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      saveRule(form, rule.key);
    });
    track(form);
    return form;
  }

  function fillRuleMonths(form, calendar, startMonth, endMonth) {
    fillSelect(form.elements.startMonth, monthOptions(calendar), String(startMonth));
    fillSelect(form.elements.endMonth, monthOptions(calendar), String(endMonth));
  }

  function renderSchedule() {
    const schedule = view.schedule;
    $('#schedule-note').textContent =
      `منطقهٔ زمانی: ${schedule.timezone}. اولویت: انتخاب دستی، سپس برنامهٔ رویداد، سپس برنامهٔ فصلی و در پایان تم پیش‌فرض. ` +
      'برنامهٔ رویداد با ولنتاین شروع می‌شود (یک روز قبل) و تا روز بعد از رویداد ادامه دارد.';
    $('#schedule-list').replaceChildren(...schedule.rules.map(ruleCard));
  }

  // Updates badges and window text without touching the fields the manager may be editing.
  function refreshScheduleStatus() {
    for (const rule of view.schedule.rules) {
      const form = $(`form[data-rule="${rule.key}"]`);
      if (!form) continue;
      const status = ruleStatus(rule);
      const badge = $('[data-status]', form);
      badge.textContent = status.text;
      badge.className = `badge ${status.kind}`;
      $('[data-window]', form).textContent = `بازه: ${rule.window} · منطقهٔ زمانی ${rule.timezone}`;
    }
  }

  async function saveRule(form, key) {
    await saveOnce(form, async () => {
      const values = form.elements;
      const body = {
        enabled: values.enabled.checked,
        calendar: values.calendar.value,
        theme: values.theme.value,
        startMonth: Number(values.startMonth.value),
        startDay: Number.parseInt(values.startDay.value, 10),
        endMonth: Number(values.endMonth.value),
        endDay: Number.parseInt(values.endDay.value, 10),
        priority: Number.parseInt(values.priority.value, 10),
      };
      try {
        view = await api('PUT', `${base()}/schedule/${encodeURIComponent(key)}`, body);
        track(form);
        renderLive();
        report(form, 'برنامهٔ تم ذخیره شد و از همین حالا در منوی عمومی اعمال می‌شود.');
      } catch (error) {
        report(form, error.message, 'error');
      }
    });
  }

  // ----- categories -------------------------------------------------------------------

  function resetCategoryForm() {
    const form = $('#category-form');
    form.reset();
    form.elements.id.value = '';
    form.elements.enabled.checked = true;
    $('#category-delete').hidden = true;
    track(form);
    report(form, '');
  }

  function editCategory(id) {
    const form = $('#category-form');
    const category = view.categories.find(c => c.id === id);
    if (!category || !confirmDiscard([form])) return;
    form.elements.id.value = category.id;
    form.elements.name.value = category.name;
    form.elements.icon.value = category.icon;
    form.elements.enabled.checked = category.enabled;
    $('#category-delete').hidden = false;
    track(form);
    report(form, `ویرایش «${category.name}»`, 'info');
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function categoryItemCount(id) {
    return view.items.filter(item => item.category === id).length;
  }

  function categoryActiveCount(id) {
    return view.items.filter(item => item.category === id && item.visible).length;
  }

  function renderCategories() {
    const list = $('#category-list');
    if (!view.categories.length) {
      list.replaceChildren(el('p', { class: 'muted', text: 'هنوز دسته‌بندی ثبت نشده است. از پیشنهادهای زیر یا فرم پایین استفاده کنید.' }));
    } else {
      list.replaceChildren(...view.categories.map((category, index) => {
        const last = index === view.categories.length - 1;
        return el('div', { class: `row${category.enabled ? '' : ' is-hidden'}` },
          el('div', { class: 'row-main' },
            el('strong', { text: category.name }),
            el('small', { text: `${money.format(categoryItemCount(category.id))} غذا · ${category.enabled ? 'نمایش در منو' : 'غیرفعال (پنهان از منوی عمومی)'}` }),
          ),
          el('div', { class: 'row-tools' },
            el('button', { class: 'btn small', type: 'button', 'aria-label': `بالا بردن ${category.name}`, text: '↑', disabled: index === 0, onclick: () => moveCategory(index, -1) }),
            el('button', { class: 'btn small', type: 'button', 'aria-label': `پایین بردن ${category.name}`, text: '↓', disabled: last, onclick: () => moveCategory(index, 1) }),
            el('label', { class: 'switch' },
              el('input', {
                type: 'checkbox', checked: category.enabled, 'aria-label': `نمایش ${category.name} در منوی عمومی`,
                onchange: event => toggleCategory(category.id, event.target.checked, event.target),
              }),
              el('span', { text: 'فعال' })),
            el('button', { class: 'btn small', type: 'button', text: 'ویرایش', onclick: () => editCategory(category.id) }),
          ),
        );
      }));
    }
    const itemForm = $('#item-form');
    const current = itemForm.elements.category.value;
    fillSelect(itemForm.elements.category, view.categories.map(c => ({
      value: c.id, label: c.enabled ? c.name : `${c.name} (غیرفعال)`,
    })), current);
    renderCategorySuggestions();
  }

  function renderCategorySuggestions() {
    const existing = new Set(view.categories.map(c => c.name));
    $('#category-suggestions').replaceChildren(...SUGGESTED_CATEGORIES.filter(s => !existing.has(s.name)).map(s =>
      el('button', {
        type: 'button', class: 'chip', text: s.name,
        onclick: () => {
          const form = $('#category-form');
          if (form.elements.id.value) return;
          form.elements.name.value = s.name;
          form.elements.icon.value = s.icon;
          report(form, `«${s.name}» در فرم قرار گرفت. برای افزودن، ذخیره کنید.`, 'info');
        },
      })));
  }

  async function toggleCategory(id, enabled, checkbox) {
    const category = view.categories.find(c => c.id === id);
    if (!category) return;
    const active = categoryActiveCount(id);
    if (!enabled && active > 0 && !window.confirm(
      `این دسته‌بندی ${money.format(active)} غذای فعال دارد. با غیرفعال کردن، این غذاها از منوی عمومی پنهان می‌شوند ` +
      '(غذاها حذف نمی‌شوند و با فعال کردن دوباره نمایش داده می‌شوند). ادامه می‌دهید؟')) {
      checkbox.checked = true;
      return;
    }
    try {
      view = await api('PUT', `${base()}/categories/${encodeURIComponent(id)}`, {
        name: category.name, icon: category.icon, enabled,
      });
      renderLive();
      say(enabled ? 'دسته‌بندی در منوی عمومی نمایش داده می‌شود.' : 'دسته‌بندی غیرفعال شد و از منوی عمومی پنهان است.');
    } catch (error) {
      say(error.message, 'error');
      await refreshView();
    }
  }

  async function moveCategory(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= view.categories.length) return;
    const order = view.categories.map(c => c.id);
    [order[index], order[target]] = [order[target], order[index]];
    try {
      view = await api('PUT', `${base()}/categories/order`, { order });
      renderLive();
      say('ترتیب دسته‌بندی‌ها ذخیره شد.');
    } catch (error) {
      say(error.message, 'error');
      await refreshView();
    }
  }

  async function saveCategory(event) {
    event.preventDefault();
    const form = event.currentTarget;
    await saveOnce(form, async () => {
      const id = form.elements.id.value;
      const body = {
        name: form.elements.name.value,
        icon: form.elements.icon.value,
        enabled: form.elements.enabled.checked,
      };
      try {
        view = id
          ? await api('PUT', `${base()}/categories/${encodeURIComponent(id)}`, body)
          : await api('POST', `${base()}/categories`, body);
        renderLive();
        if (id) {
          track(form);
          report(form, 'دسته‌بندی ذخیره شد.');
        } else {
          resetCategoryForm();
          report(form, 'دسته‌بندی تازه ذخیره شد.');
        }
      } catch (error) {
        report(form, error.message, 'error');
      }
    });
  }

  async function deleteCategory() {
    const form = $('#category-form');
    const id = form.elements.id.value;
    if (!id) return;
    if (categoryItemCount(id) > 0) {
      report(form, 'این دسته‌بندی غذا دارد و حذف نمی‌شود. آن را غیرفعال کنید یا غذاهایش را جابه‌جا کنید.', 'error');
      return;
    }
    if (!window.confirm('این دسته‌بندی برای همیشه حذف شود؟')) return;
    try {
      view = await api('DELETE', `${base()}/categories/${encodeURIComponent(id)}`);
      resetCategoryForm();
      renderLive();
      say('دسته‌بندی حذف شد.');
    } catch (error) {
      report(form, error.message, 'error');
    }
  }

  // ----- items ------------------------------------------------------------------------

  function categoryName(id) {
    const category = view.categories.find(c => c.id === id);
    return category ? category.name : '—';
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
      const category = view.categories.find(c => c.id === item.category);
      const hiddenByCategory = category && !category.enabled;
      return el('div', { class: `row${item.visible ? '' : ' is-hidden'}` },
        el('div', { class: 'row-main' },
          el('strong', { text: item.name }),
          el('small', { text: `${categoryName(item.category)} · ${money.format(item.price)} تومان${item.visible ? '' : ' · پنهان'}${hiddenByCategory ? ' · دسته غیرفعال است' : ''}` }),
        ),
        el('label', { class: 'switch' },
          el('input', {
            type: 'checkbox', checked: item.visible, 'aria-label': `نمایش ${item.name} در منوی عمومی`,
            onchange: event => toggleVisible(item.id, event.target.checked),
          }),
          el('span', { text: 'نمایش' })),
        el('button', { class: 'btn small', type: 'button', text: 'ویرایش', onclick: () => editItem(item.id) }),
      );
    }));
  }

  function openItemForm(item) {
    const form = $('#item-form');
    if (!confirmDiscard([form])) return;
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
    track(form);
    report(form, '');
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function closeItemForm() {
    const form = $('#item-form');
    if (!confirmDiscard([form])) return;
    form.hidden = true;
    form.reset();
    untrack(form);
    report(form, '');
  }

  function editItem(id) {
    const item = view.items.find(i => i.id === id);
    if (item) openItemForm(item);
  }

  async function toggleVisible(id, visible) {
    try {
      const item = view.items.find(i => i.id === id);
      view = await api('PUT', `${base()}/items/${id}`, {
        name: item.name, category: item.category, price: item.price, icon: item.icon, label: item.label,
        position: item.position, description: item.description, ingredients: item.ingredients,
        allergens: item.allergens, visible,
      });
      renderLive();
      say(visible ? 'غذا در منوی عمومی نمایش داده می‌شود.' : 'غذا از منوی عمومی پنهان شد.');
    } catch (error) {
      say(error.message, 'error');
      await refreshView();
    }
  }

  function parseAllergens(text) {
    return text.split(/[،,]/).map(part => part.trim()).filter(Boolean);
  }

  async function saveItem(event) {
    event.preventDefault();
    const form = event.currentTarget;
    await saveOnce(form, async () => {
      const id = form.elements.id.value;
      const position = Number.parseInt(form.elements.position.value, 10);
      const body = {
        name: form.elements.name.value,
        category: form.elements.category.value,
        price: form.elements.price.value,
        icon: form.elements.icon.value,
        label: form.elements.label.value,
        position: Number.isNaN(position) ? form.elements.position.value : position,
        allergens: parseAllergens(form.elements.allergens.value),
        description: form.elements.description.value,
        ingredients: form.elements.ingredients.value,
        visible: form.elements.visible.checked,
      };
      try {
        view = id
          ? await api('PUT', `${base()}/items/${encodeURIComponent(id)}`, body)
          : await api('POST', `${base()}/items`, body);
        renderLive();
        if (!id) {
          untrack(form);
          closeItemForm();
          say('غذای تازه ذخیره شد.');
        } else {
          track(form);
          report(form, 'غذا ذخیره شد.');
        }
      } catch (error) {
        report(form, error.message, 'error');
      }
    });
  }

  async function deleteItem() {
    const form = $('#item-form');
    const id = form.elements.id.value;
    if (!id || !window.confirm('این غذا برای همیشه حذف شود؟')) return;
    try {
      view = await api('DELETE', `${base()}/items/${encodeURIComponent(id)}`);
      untrack(form);
      closeItemForm();
      renderLive();
      say('غذا حذف شد.');
    } catch (error) {
      report(form, error.message, 'error');
    }
  }

  // ----- users of this restaurant ------------------------------------------------------

  const userDate = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Tehran' });

  function renderUsers() {
    const users = (view && view.users) || [];
    const list = $('#user-list');
    list.replaceChildren(...users.map(user => {
      const isMe = user.username === currentUsername;
      return el('div', { class: 'row' },
        el('div', { class: 'row-main' },
          el('strong', { text: isMe ? `${user.username} (شما)` : user.username, dir: 'ltr' }),
          el('small', { text: `ساخته‌شده: ${userDate.format(new Date(user.createdAt * 1000))}` })),
        el('div', { class: 'row-tools' },
          isMe ? null : el('button', { class: 'btn small danger', type: 'button', text: 'حذف کاربر', onclick: () => deleteUser(user) })));
    }));
    const select = $('#user-password-form').elements.userId;
    const previous = select.value;
    fillSelect(select, users.filter(user => user.username !== currentUsername)
      .map(user => ({ value: String(user.id), label: user.username })), previous);
    if (!select.value && select.options.length) select.selectedIndex = 0;
  }

  async function addUser(event) {
    event.preventDefault();
    const form = event.currentTarget;
    await saveOnce(form, async () => {
      if (form.elements.password.value !== form.elements.confirmPassword.value) {
        report(form, 'رمز عبور و تکرار آن یکسان نیستند.', 'error');
        return;
      }
      try {
        const username = form.elements.username.value.trim();
        view = await api('POST', `${base()}/users`, {
          username,
          password: form.elements.password.value,
        });
        form.reset();
        renderLive();
        report(form, `کاربر «${username.toLowerCase()}» ساخته شد. رمز اولیه را به او بدهید.`);
      } catch (error) {
        report(form, error.message, 'error');
      }
    });
  }

  async function resetUserPassword(event) {
    event.preventDefault();
    const form = event.currentTarget;
    await saveOnce(form, async () => {
      if (!form.elements.userId.value) {
        report(form, 'کاربری برای تغییر رمز انتخاب نشده است.', 'error');
        return;
      }
      if (form.elements.newPassword.value !== form.elements.confirmPassword.value) {
        report(form, 'رمز عبور تازه و تکرار آن یکسان نیستند.', 'error');
        return;
      }
      const name = form.elements.userId.selectedOptions[0].textContent;
      try {
        view = await api('POST', `${base()}/users/${encodeURIComponent(form.elements.userId.value)}/password`, {
          password: form.elements.newPassword.value,
        });
        form.reset();
        renderLive();
        report(form, `رمز «${name}» تغییر کرد و نشست‌های باز آن خاتمه یافتند.`);
      } catch (error) {
        report(form, error.message, 'error');
      }
    });
  }

  async function deleteUser(user) {
    if (!window.confirm(`حساب «${user.username}» حذف شود؟ این کار برگشت‌پذیر نیست و همهٔ نشست‌های آن خاتمه می‌یابد.`)) return;
    try {
      view = await api('DELETE', `${base()}/users/${encodeURIComponent(user.id)}`);
      renderLive();
      say(`حساب «${user.username}» حذف شد.`);
    } catch (error) {
      say(error.message, 'error');
    }
  }

  // ----- account ----------------------------------------------------------------------

  async function changePassword(event) {
    event.preventDefault();
    const form = event.currentTarget;
    await saveOnce(form, async () => {
      if (form.elements.newPassword.value !== form.elements.confirmPassword.value) {
        report(form, 'رمز عبور تازه و تکرار آن یکسان نیستند.', 'error');
        return;
      }
      try {
        await api('POST', `${base()}/account/password`, {
          currentPassword: form.elements.currentPassword.value,
          newPassword: form.elements.newPassword.value,
        });
        form.reset();
        report(form, 'رمز عبور تغییر کرد. نشست‌های دیگر این حساب خاتمه یافتند.');
      } catch (error) {
        report(form, error.message, 'error');
      }
    });
  }

  async function saveProfile(event) {
    event.preventDefault();
    const form = event.currentTarget;
    await saveOnce(form, async () => {
      const body = {};
      for (const field of PROFILE_FIELDS) body[field] = form.elements[field].value;
      try {
        view = await api('PUT', `${base()}/profile`, body);
        track(form);
        renderLive();
        report(form, 'اطلاعات رستوران ذخیره شد.');
      } catch (error) {
        report(form, error.message, 'error');
      }
    });
  }

  async function saveDefaultTheme(event) {
    event.preventDefault();
    const form = event.currentTarget;
    await saveOnce(form, async () => {
      try {
        view = await api('PUT', `${base()}/default-theme`, { theme: form.elements.theme.value });
        track(form);
        renderLive();
        report(form, 'تم پیش‌فرض ذخیره شد.');
      } catch (error) {
        report(form, error.message, 'error');
      }
    });
  }

  async function chooseManualTheme(theme) {
    try {
      view = await api('PUT', `${base()}/theme`, { theme });
      renderLive();
      say(`تم «${themeName(theme)}» به‌صورت دستی انتخاب شد و در منوی عمومی اعمال می‌شود.`);
    } catch (error) {
      say(error.message, 'error');
    }
  }

  async function clearManualTheme() {
    try {
      view = await api('PUT', `${base()}/theme`, { theme: null });
      renderLive();
      say('تم دستی حذف شد؛ تم از برنامهٔ خودکار محاسبه می‌شود.');
    } catch (error) {
      say(error.message, 'error');
    }
  }

  // ----- session and rendering ----------------------------------------------------------

  function renderLive() {
    renderThemeStatus();
    renderThemeList();
    renderCategories();
    renderItemFilter();
    renderItems();
    renderUsers();
    refreshScheduleStatus();
  }

  // Reloads the data without touching any form the manager is editing.
  async function refreshView() {
    view = await api('GET', base());
    renderLive();
  }

  async function load() {
    view = await api('GET', base());
    fillSelect($('#category-form').elements.icon, view.icons.map(i => ({ value: i.id, label: i.name })), 'bowl');
    fillSelect($('#item-form').elements.icon, view.icons.map(i => ({ value: i.id, label: i.name })), 'bowl');
    renderProfile();
    renderDefaultThemeForm();
    renderSchedule();
    renderLive();
  }

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
      currentUsername = session.user.username;
      $('#admin-user').textContent = session.user.username;
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
    const dirty = [...tracked.keys()].some(isDirty);
    if (dirty && !window.confirm('تغییرات ذخیره‌نشده دارید. با خروج، این تغییرات از بین می‌رود. خارج می‌شوید؟')) return;
    try {
      await api('POST', 'auth/logout');
    } catch { /* session may already be gone */ }
    csrf = '';
    currentUsername = '';
    view = null;
    tracked.clear();
    closePreview();
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
      currentUsername = me.user.username;
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
      showOnly('login');
      say(error.status === 401 ? 'برای مدیریت منو وارد شوید.' : error.message, error.status === 401 ? 'info' : 'error');
    }
  }

  // ----- wiring -----------------------------------------------------------------------

  $('#login-form').addEventListener('submit', login);
  $('#admin-logout').addEventListener('click', logout);
  $('#profile-form').addEventListener('submit', saveProfile);
  $('#default-theme-form').addEventListener('submit', saveDefaultTheme);
  $('#theme-clear').addEventListener('click', clearManualTheme);
  $('#preview-close').addEventListener('click', closePreview);
  $('#category-form').addEventListener('submit', saveCategory);
  $('[data-reset="category"]').addEventListener('click', () => {
    if (confirmDiscard([$('#category-form')])) resetCategoryForm();
  });
  $('#category-delete').addEventListener('click', deleteCategory);
  $('#item-form').addEventListener('submit', saveItem);
  $('#item-new').addEventListener('click', () => openItemForm(null));
  $('#item-cancel').addEventListener('click', closeItemForm);
  $('#item-delete').addEventListener('click', deleteItem);
  $('#item-filter').addEventListener('change', renderItems);
  $('#password-form').addEventListener('submit', changePassword);
  $('#user-form').addEventListener('submit', addUser);
  $('#user-password-form').addEventListener('submit', resetUserPassword);

  start();
})();
