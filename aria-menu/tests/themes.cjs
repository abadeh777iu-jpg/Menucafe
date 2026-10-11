const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('fs');
const root=require('path').resolve(__dirname,'..');
const themes=['default','nowruz','yalda','autumn','valentine'];
const chosen=page=>page.locator('html').getAttribute('data-theme');
(async()=>{
 const browser=await chromium.launch({headless:true});const report=[];
 try{
 for(const width of [320,375,390,768,1280]){
  const context=await browser.newContext({viewport:{width,height:900}});
  for(const slug of ['aria','bahar']){
   const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(`http://127.0.0.1:3000/${slug}`);await page.waitForSelector('.card');await page.evaluate(()=>document.fonts.ready);
   const initial=await page.locator('#menu-content').innerText();const snapshots=[];
   assert.equal(await page.locator('[data-theme-choice]').count(),5);
   for(const theme of themes){
    await page.locator(`[data-theme-choice=${theme}]`).click();assert.equal(await chosen(page),theme);
    assert.equal(await page.locator('[data-theme-choice][aria-pressed=true]').count(),1);
    assert.equal(await page.locator('#menu-content').innerText(),initial);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    const geometry=await page.evaluate(()=>{
     const a=document.querySelector('.hero-art').getBoundingClientRect(),b=document.querySelector('.hero-text').getBoundingClientRect();
     return {separate:a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top,position:getComputedStyle(document.querySelector('.hero-art')).position,
      buttons:[...document.querySelectorAll('[data-theme-choice]')].every(el=>el.getBoundingClientRect().height>=44),
      overflowingText:[...document.querySelectorAll('.theme-choice strong,.theme-choice small')].filter(e=>e.getBoundingClientRect().width&&e.scrollWidth>e.clientWidth+1).length};
    });assert(geometry.separate);assert(geometry.buttons);assert.equal(geometry.overflowingText,0);
    snapshots.push(await page.evaluate(()=>({body:getComputedStyle(document.body).backgroundColor,card:getComputedStyle(document.querySelector('.card')).backgroundColor,accent:getComputedStyle(document.querySelector('.eyebrow')).color,art:document.querySelector('.hero-art').outerHTML})));
    await page.locator('[data-category]').nth(1).click();assert((await page.locator('.card').count())>0);
    await page.locator('[data-category=all]').click();
    const name=await page.locator('.card h3').first().innerText();await page.locator('#search').fill(name);assert.equal(await page.locator('.card').count(),1);
    await page.locator('#search').fill('no-such-food');assert.equal(await page.locator('.card').count(),0);await page.locator('#reset').click();
    if(width===390&&slug==='aria'){
     await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:`${__dirname}/theme-${theme}-mobile.png`,fullPage:false});
    }
    if(width===1280&&slug==='bahar'&&theme==='yalda'){
     await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:`${__dirname}/theme-yalda-desktop.png`,fullPage:false});
    }
   }
   for(const prop of ['body','card','accent','art'])assert.equal(new Set(snapshots.map(s=>s[prop])).size,5,prop);
   assert.deepEqual(errors,[]);report.push({width,slug,themes:5,passed:true});await page.close();
  }
  await context.close();
 }
 const context=await browser.newContext(),page=await context.newPage();
 await page.goto('http://127.0.0.1:3000/aria');await page.waitForSelector('.card');await page.locator('[data-theme-choice=yalda]').click();
 await page.reload();await page.waitForSelector('.card');assert.equal(await chosen(page),'yalda');
 await page.goto('http://127.0.0.1:3000/bahar');await page.waitForSelector('.card');assert.equal(await chosen(page),'default');await page.locator('[data-theme-choice=nowruz]').click();
 await page.goto('http://127.0.0.1:3000/aria');await page.waitForSelector('.card');assert.equal(await chosen(page),'yalda');await page.locator('[data-theme-choice=default]').click();
 await page.goto('http://127.0.0.1:3000/bahar');await page.waitForSelector('.card');assert.equal(await chosen(page),'nowruz');
 assert.deepEqual(await page.evaluate(()=>[localStorage.getItem('digital-menu:theme:v1:aria'),localStorage.getItem('digital-menu:theme:v1:bahar')]),['default','nowruz']);
 await page.evaluate(()=>localStorage.setItem('digital-menu:theme:v1:bahar','invalid-theme'));await page.reload();await page.waitForSelector('.card');assert.equal(await chosen(page),'default');
 report.push({persistence:'refresh, independent restaurant keys, default restore, invalid value fallback: passed'});
 // Opaque iframe models the Arena file viewer: scripts allowed but storage unavailable.
 const html=fs.readFileSync('/home/user/multi-menu-preview.html','utf8');
 await page.goto('about:blank');await page.setContent('<iframe sandbox="allow-scripts" style="width:390px;height:850px;border:0"></iframe>');
 await page.locator('iframe').evaluate((el,html)=>el.srcdoc=html,html);
 const frame=page.frameLocator('iframe');await frame.locator('.card').first().waitFor();
 await frame.locator('[data-theme-choice=autumn]').click();assert.equal(await frame.locator('html').getAttribute('data-theme'),'autumn');
 assert((await frame.locator('#theme-status').innerText()).includes('ذخیره‌سازی مرورگر در دسترس نیست'));
 await frame.locator('.demo-links a[href="#/bahar"]').click();await frame.locator('.brand strong').filter({hasText:'رستوران بهار'}).waitFor();assert.equal(await frame.locator('html').getAttribute('data-theme'),'default');
 await frame.locator('[data-theme-choice=valentine]').click();await frame.locator('.demo-links a[href="#/aria"]').click();await frame.locator('.brand strong').filter({hasText:'رستوران آریا'}).waitFor();assert.equal(await frame.locator('html').getAttribute('data-theme'),'autumn');
 report.push({sandboxPreview:'theme changes and restaurant isolation without localStorage: passed'});
 fs.writeFileSync(`${__dirname}/theme-results.json`,JSON.stringify(report,null,2));console.log(report);
 }finally{await browser.close();}
})();
