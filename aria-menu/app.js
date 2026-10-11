const paths={
 bowl:'M4 11h24c0 9-5 15-12 15S4 20 4 11Z M2 11h28 M10 28h12 M11 2c-3 3 3 4 0 7 M19 2c-3 3 3 4 0 7',
 plate:'M23 5a12 12 0 1 1-15 0 M12 8a8 8 0 1 1-3 3 M3 2v7m3-7v7M3 6h3 M4.5 9v20 M28 2v27 M28 2c-5 4-5 12 0 12',
 rice:'M3 20h26l-4 8H7Z M6 20c0-7 4-12 10-12s10 5 10 12 M11 14l1-1m4-1 1 1m3 3 1 1m-8 0 1 1 M13 2c-2 2 2 3 0 5 M20 2c-2 2 2 3 0 5',
 glass:'M8 8h16l-2 21H10Z M10 16h12 M18 17l2-14 7-2 M11 8a5 5 0 0 1 10 0',
 cake:'M5 13h22v15H5Z M5 19c4-5 6 4 10 0s7 4 12 0 M16 13V7 M16 2c-5 5 5 5 0 0',
 leaf:'M26 4C9 2 1 13 9 22s20 1 17-18Z M5 29 22 10 M13 20v-8 M13 20h8',
 kebab:'M5 28 27 3 M8 21l5 4 4-5-5-4Z M15 13l5 4 4-5-5-4Z M3 28h25',
 icecream:'m9 17 7 13 7-13 M6 17h20c3-4 0-8-4-8 1-9-13-9-12 0-4 0-7 4-4 8Z M12 21h8',
 search:'m22 22 7 7 M25 14a11 11 0 1 1-22 0 11 11 0 0 1 22 0',
 info:'M16 14v9 M16 8v1 M29 16a13 13 0 1 1-26 0 13 13 0 0 1 26 0',
 all:'M4 4h9v9H4Z M19 4h9v9h-9Z M4 19h9v9H4Z M19 19h9v9h-9Z'
};
const icon=(name,cls='')=>`<svg class="${cls}" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(paths[name]||paths.bowl).split(' M').map((p,i)=>`<path d="${i?'M':''}${p}"/>`).join('')}</svg>`;
const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=new Intl.NumberFormat('fa-IR');
let menu, active='all', query='';
function Header(restaurant){return `<div class="wrap topbar"><div class="brand"><div class="brand-mark" aria-hidden="true">${escapeHTML(restaurant.mark)}</div><div><strong>${escapeHTML(restaurant.name)}</strong><small lang="en" dir="ltr">${escapeHTML(restaurant.englishName)}</small></div></div><span class="sample"><i></i>نسخهٔ نمایشی</span></div>`;}
function Categories(categories){return [{id:'all',name:'همهٔ منو',icon:'all'},...categories].map(c=>`<button type="button" class="tab" data-category="${escapeHTML(c.id)}" aria-pressed="${active===c.id}" aria-controls="menu-content">${icon(c.icon)}${escapeHTML(c.name)}</button>`).join('');}
function FoodCard(item){return `<article class="card"><div class="card-top"><div class="food-icon">${icon(item.icon)}</div><div><h3>${escapeHTML(item.name)}</h3>${item.label?`<span class="badge">${escapeHTML(item.label)}</span>`:''}</div></div><p class="description">${escapeHTML(item.description)}</p><p class="ingredients"><b>ترکیبات:</b> ${escapeHTML(item.ingredients)}</p><div class="card-bottom"><div class="allergens">${icon('info')}${item.allergens?`حساسیت‌زا: ${item.allergens.map(escapeHTML).join('، ')}`:'اطلاعات حساسیت‌زا مشخص نشده'}</div><div class="price">${number.format(item.price)}<small>تومان</small></div></div></article>`;}
const normalize=s=>s.replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/\u200c/g,' ').trim().toLowerCase();
function renderMenu(){
 const filtered=menu.items.filter(i=>(active==='all'||i.category===active)&&normalize(`${i.name} ${i.ingredients} ${i.description}`).includes(normalize(query)));
 document.querySelector('#result-count').textContent=`${number.format(filtered.length)} انتخاب خوش‌طعم`;
 document.querySelector('#menu-content').innerHTML=menu.categories.map(c=>{const items=filtered.filter(i=>i.category===c.id);return items.length?`<section class="section" aria-labelledby="title-${c.id}"><div class="section-head">${icon(c.icon,'section-icon')}<h2 id="title-${c.id}">${escapeHTML(c.name)}</h2><span class="count">${number.format(items.length)} مورد</span></div><div class="grid">${items.map(FoodCard).join('')}</div></section>`:'';}).join('')||`<div class="empty"><p>غذایی با این مشخصات پیدا نشد.<br>نام دیگری را امتحان کنید.</p><button type="button" id="reset">نمایش همهٔ منو</button></div>`;
 document.dispatchEvent(new Event('menu:rendered'));
 document.querySelector('#reset')?.addEventListener('click',()=>{active='all';query='';document.querySelector('#search').value='';updateTabs();renderMenu();document.querySelector('#search').focus();});
}
function updateTabs(){document.querySelectorAll('[data-category]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.category===active)));}
let loadVersion=0;
async function init(){const version=++loadVersion;try{
 const slug=window.MENU_PREVIEW_SLUG || (window.DemoRoute ? window.DemoRoute.getSlug() : location.pathname.replace(/^\/+|\/+$/g,''));
 const loaded=await window.MenuRepository.getMenu(slug);
 if(version!==loadVersion)return;
 menu=loaded; menu.categories=(menu.categories||[]).filter(c=>c.enabled!==false); const enabledIds=new Set(menu.categories.map(c=>c.id)); menu.items=(menu.items||[]).filter(i=>i.visible!==false&&enabledIds.has(i.category)); active='all';query='';
 window.MenuThemes.mount(menu.restaurant, slug);
 
 document.querySelector('#search').value='';
 document.title=`منوی ${menu.restaurant.name} | نسخهٔ نمایشی`;
 document.querySelector('meta[name=description]').content=`نسخهٔ نمایشی منوی ${menu.restaurant.name}؛ تمامی غذاها و قیمت‌ها آزمایشی هستند.`;
 document.querySelector('h1').textContent=menu.restaurant.headline;
 document.querySelector('#hero-note-text').textContent=menu.restaurant.note;
 document.querySelector('#restaurant-footer').textContent=menu.restaurant.footer;
 document.querySelector('#header').innerHTML=Header(menu.restaurant);
 document.querySelector('#hero-description').textContent=menu.restaurant.description;
 document.querySelector('#categories').innerHTML=Categories(menu.categories);
 document.querySelector('#search-icon').innerHTML=icon('search');
 document.querySelector('#notice-icon').innerHTML=icon('info');
 document.querySelector('#categories').onclick=event=>{const btn=event.target.closest('[data-category]');if(!btn)return;active=btn.dataset.category;updateTabs();renderMenu();btn.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'});document.querySelector('#menu-start').scrollIntoView({block:'start',behavior:'smooth'});};
 document.querySelector('#search').oninput=event=>{query=event.target.value;renderMenu();};
 renderMenu();
 }catch(error){if(version!==loadVersion)return;document.querySelector('#menu-content').innerHTML='<p class="empty">نمایش منو با مشکل روبه‌رو شد. لطفاً صفحه را دوباره باز کنید.</p>';console.error(error);}}
init();
if(window.DemoRoute)window.addEventListener('hashchange',init);
