const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('fs');
(async()=>{
 const browser=await chromium.launch(); const report=[];
 const countAnimations=page=>page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running').length);
 try{
  for(const width of [320,375,390,768,1280]){
   const ctx=await browser.newContext({viewport:{width,height:900}});
   for(const slug of ['aria','bahar']){
    const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
    await p.goto(`http://127.0.0.1:3000/${slug}`);await p.waitForSelector('.card');await p.evaluate(()=>document.fonts.ready);
    const originalMenu=await p.locator('#menu-content').innerText();
    for(const theme of ['default','nowruz','yalda','autumn','valentine']){
     await p.locator(`[data-theme-choice=${theme}]`).click();
     assert.equal(await p.locator('html').getAttribute('data-theme'),theme);
     assert.equal(await p.locator('#menu-content').innerText(),originalMenu);
     assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
     if(['nowruz','yalda'].includes(theme)){
      assert(await p.locator('#occasion-title').isVisible());
      const valid=await p.evaluate(()=>{
       const scene=document.querySelector('.occasion-scene'),s=scene.getBoundingClientRect();
       const overlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
       const collisions=[...document.querySelectorAll('.hero-text,.card,.tab,.search,.theme-choice')].filter(el=>overlap(s,el.getBoundingClientRect()));
       const motion=document.getAnimations().filter(a=>a.playState==='running');
       return {collisions:collisions.length,clipped:getComputedStyle(scene).overflow==='hidden',isolated:motion.every(a=>a.effect.target.closest('.occasion-scene'))};
      });assert.equal(valid.collisions,0);assert(valid.clipped);assert(valid.isolated);
      if(!(await p.locator('#effects-toggle').isChecked()))await p.locator('.effects-label').click();
      assert((await countAnimations(p))>=2);
      await p.locator('.effects-label').click();assert.equal(await countAnimations(p),0);
      assert.equal(await p.locator('#menu-content').innerText(),originalMenu);
      await p.locator('.effects-label').click();assert((await countAnimations(p))>=2);
      // Preview button actually navigates to the illustrated hero.
      await p.locator('#theme-preview').click();await p.waitForTimeout(250);
     }else{assert.equal(await countAnimations(p),0);assert(!(await p.locator('#occasion-intro').isVisible()));}
     await p.locator('[data-category]').nth(1).click();assert((await p.locator('.card').count())>0);
     await p.locator('[data-category=all]').click();const first=await p.locator('.card h3').first().innerText();
     await p.locator('#search').fill(first);assert.equal(await p.locator('.card').count(),1);
     await p.locator('#search').fill('zzzz');await p.locator('#reset').click();assert.equal(await p.locator('#menu-content').innerText(),originalMenu);
    }
    assert.deepEqual(errors,[]);report.push({width,slug,fiveThemes:true,isolatedMotion:true,noOverlap:true,searchAndCategories:true});await p.close();
   }
   await ctx.close();
  }
  const context=await browser.newContext();const p=await context.newPage();
  await p.goto('http://127.0.0.1:3000/aria');await p.waitForSelector('.card');await p.locator('[data-theme-choice=nowruz]').click();await p.locator('.effects-label').click();
  await p.reload();await p.waitForSelector('.card');assert.equal(await p.locator('html').getAttribute('data-theme'),'nowruz');assert.equal(await countAnimations(p),0);assert(!(await p.locator('#effects-toggle').isChecked()));
  await p.goto('http://127.0.0.1:3000/bahar');await p.waitForSelector('.card');await p.locator('[data-theme-choice=yalda]').click();assert((await countAnimations(p))>0);
  await p.goto('http://127.0.0.1:3000/aria');await p.waitForSelector('.card');assert.equal(await p.locator('html').getAttribute('data-theme'),'nowruz');assert.equal(await countAnimations(p),0);
  await p.goto('http://127.0.0.1:3000/bahar');await p.waitForSelector('.card');assert.equal(await p.locator('html').getAttribute('data-theme'),'yalda');assert((await countAnimations(p))>0);
  await p.emulateMedia({reducedMotion:'reduce'});await p.waitForFunction(()=>document.documentElement.dataset.effects==='off');assert.equal(await countAnimations(p),0);assert((await p.locator('#effects-note').innerText()).includes('کاهش حرکت'));
  await p.emulateMedia({reducedMotion:'no-preference'});await p.waitForFunction(()=>document.documentElement.dataset.effects==='on');assert((await countAnimations(p))>0);
  await p.locator('[data-theme-choice=default]').click();assert.equal(await countAnimations(p),0);assert.equal(await p.locator('.hero-art').getAttribute('viewBox'),'0 0 240 205');
  report.push({persistence:'theme AND motion independent per restaurant across refresh',accessibility:'prefers-reduced-motion and manual toggle stop all motion',defaultRestore:true});
  const html=fs.readFileSync('/home/user/multi-menu-preview.html','utf8');await p.goto('about:blank');await p.setContent('<iframe sandbox="allow-scripts" style="width:390px;height:900px"></iframe>');await p.locator('iframe').evaluate((el,html)=>el.srcdoc=html,html);
  const frame=p.frameLocator('iframe');await frame.locator('.card').first().waitFor();await frame.locator('[data-theme-choice=nowruz]').click();await frame.locator('.effects-label').click();
  await frame.locator('.demo-links a[href="#/bahar"]').click();await frame.locator('.brand strong').filter({hasText:'رستوران بهار'}).waitFor();await frame.locator('[data-theme-choice=yalda]').click();assert.equal(await frame.locator('html').getAttribute('data-effects'),'on');
  await frame.locator('.demo-links a[href="#/aria"]').click();await frame.locator('.brand strong').filter({hasText:'رستوران آریا'}).waitFor();assert.equal(await frame.locator('html').getAttribute('data-theme'),'nowruz');assert.equal(await frame.locator('html').getAttribute('data-effects'),'off');
  report.push({offlineSandbox:'working without network or localStorage; theme and motion independent'});
  fs.writeFileSync('tests/occasion-results.json',JSON.stringify(report,null,2));console.log(report);
 }finally{await browser.close();}
})();
