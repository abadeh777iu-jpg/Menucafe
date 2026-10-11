const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
(async()=>{
const browser=await chromium.launch({headless:true});const results=[];
try{
for(const width of [320,375,390,768,1280]){
 for(const slug of ['aria','bahar']){
  const data=JSON.parse(fs.readFileSync(`${root}/data/${slug}.json`));
  const page=await browser.newPage({viewport:{width,height:844}});const errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  const response=await page.goto(`http://127.0.0.1:3000/${slug}`);assert.equal(response.status(),200);
  await page.waitForSelector('.card');await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('.brand strong').innerText(),data.restaurant.name);
  assert.equal(await page.locator('.card').count(),data.items.length);
  assert.equal(await page.title(),`منوی ${data.restaurant.name} | نسخهٔ نمایشی`);
  assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.equal(await page.locator('#hero-description').innerText(),data.restaurant.description);
  assert.equal(await page.locator('#restaurant-footer').innerText(),data.restaurant.footer);
  for(const cat of data.categories){await page.locator(`[data-category=${cat.id}]`).click();assert.equal(await page.locator('.card').count(),data.items.filter(i=>i.category===cat.id).length);}
  await page.locator('[data-category=all]').click();await page.locator('#search').fill(data.items[0].name);assert.equal(await page.locator('.card').count(),1);
  await page.locator('#search').fill('zzzz-not-found');assert.equal(await page.locator('.card').count(),0);
  await page.locator('#reset').click();assert.equal(await page.locator('.card').count(),data.items.length);
  await page.reload();await page.waitForSelector('.card');assert.equal(await page.locator('.card').count(),data.items.length);
  const other=slug==='aria'?'bahar':'aria';assert(!requests.some(u=>u.endsWith(`/data/${other}.json`)));
  assert(requests.every(u=>new URL(u).origin==='http://127.0.0.1:3000'));
  assert.deepEqual(errors,[]);
  if([390,1280].includes(width)){await page.screenshot({path:`${__dirname}/${slug}-${width}.png`,fullPage:true});}
  results.push({slug,width,passed:true,checks:'render, RTL, no overflow, own JSON only, categories, search, reset, refresh, no external requests, no JS errors'});
  await page.close();
 }
}
const page=await browser.newPage();await page.goto('http://127.0.0.1:3000');await page.waitForSelector('.card');assert(page.url().endsWith('/aria'));
for(const slug of ['bahar','aria']){await page.locator(`.demo-links a[href="/${slug}"]`).click();await page.waitForSelector('.card');assert(page.url().endsWith('/'+slug));}
for(const route of ['/bahar/','/aria/']){const res=await page.goto('http://127.0.0.1:3000'+route);assert.equal(res.status(),200);await page.waitForSelector('.card');}
const bad=await page.goto('http://127.0.0.1:3000/missing');assert.equal(bad.status(),404);assert((await page.locator('h1').innerText()).includes('پیدا نشد'));
results.push({routing:'root redirect, direct access, trailing slash, cross-links, unknown 404: passed'});
// Edit an actual fixture, verify it is visible only in that restaurant, then restore bytes.
const file=`${root}/data/aria.json`,original=fs.readFileSync(file),baharBefore=fs.readFileSync(`${root}/data/bahar.json`);
try{const altered=JSON.parse(original);altered.items[0].price=987654;altered.categories[0].name='دستهٔ آزمایش استقلال';altered.restaurant.description='توضیح آزمایش استقلال';fs.writeFileSync(file,JSON.stringify(altered));
await page.goto('http://127.0.0.1:3000/aria');await page.waitForSelector('.card');assert((await page.locator('.price').first().innerText()).includes(new Intl.NumberFormat('fa-IR').format(987654)));
assert.equal(await page.locator('#hero-description').innerText(),altered.restaurant.description);
await page.goto('http://127.0.0.1:3000/bahar');await page.waitForSelector('.card');const bahar=JSON.parse(baharBefore);assert.equal(await page.locator('#hero-description').innerText(),bahar.restaurant.description);assert((await page.locator('.price').first().innerText()).includes(new Intl.NumberFormat('fa-IR').format(bahar.items[0].price)));assert(!(await page.locator('body').innerText()).includes('آزمایش استقلال'));assert.deepEqual(fs.readFileSync(`${root}/data/bahar.json`),baharBefore);
results.push({isolation:'actual Aria fixture edited; Bahar file and rendered data unchanged; fixture restored'});
}finally{fs.writeFileSync(file,original);}
await page.goto('file:///home/user/multi-menu-preview.html');await page.waitForSelector('.card');assert.equal(await page.locator('.card').count(),12);
await page.locator('.demo-links a[href="#/bahar"]').click();await page.waitForFunction(()=>document.querySelector('.brand strong')?.textContent==='رستوران بهار');assert.equal(await page.locator('.card').count(),10);
await page.locator('.demo-links a[href="#/aria"]').click();await page.waitForFunction(()=>document.querySelector('.brand strong')?.textContent==='رستوران آریا');assert.equal(await page.locator('.card').count(),12);
results.push({portablePreview:'both hash routes and navigation: passed'});
fs.writeFileSync(`${__dirname}/multi-results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{await browser.close();}
})();
