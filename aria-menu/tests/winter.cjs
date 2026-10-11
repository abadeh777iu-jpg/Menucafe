const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('fs');
const origin='http://127.0.0.1:3000';
const stats=p=>p.evaluate(()=>WinterEffects.inspect());
(async()=>{
 const browser=await chromium.launch();const results=[];
 try{
  for(const width of [320,375,390,768,1280]){
   for(const slug of ['aria','bahar']){
    const context=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:3});
    // Use the non-low-memory path here; a separate test explicitly covers weak hardware.
    await context.addInitScript(()=>{Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>8});Object.defineProperty(navigator,'deviceMemory',{get:()=>8});});
    const page=await context.newPage();const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('request',r=>requests.push(r.url()));
    await page.goto(`${origin}/${slug}?theme=winter`);await page.waitForSelector('.card');await page.waitForFunction(()=>WinterEffects.inspect().frame>1);
    assert.equal(await page.locator('html').getAttribute('data-theme'),'winter');
    assert.equal(await page.locator('.card').count(),slug==='aria'?12:10);
    assert.equal(await page.locator('[data-theme-choice]').count(),8);
    const a=await stats(page),pixelsA=await page.locator('#winter-snow').evaluate(c=>c.toDataURL());
    await page.waitForTimeout(350);const b=await stats(page),pixelsB=await page.locator('#winter-snow').evaluate(c=>c.toDataURL());
    assert(b.frame>a.frame);assert.notEqual(pixelsA,pixelsB);assert.notDeepEqual(a.positions,b.positions);assert.deepEqual(b.layers,[0,1,2]);assert(b.particles<=90);assert(b.dpr<=1.5);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.equal(await page.locator('#winter-snow').evaluate(c=>getComputedStyle(c).pointerEvents),'none');
    assert.equal(await page.locator('#winter-snow').evaluate(c=>getComputedStyle(c).position),'fixed');
    const firstItem=await page.locator('.card h3').first().innerText();
    await page.locator('#search').fill(firstItem);assert.equal(await page.locator('.card').count(),1);
    const old=await stats(page);await page.evaluate(()=>scrollBy({top:450,behavior:'instant'}));await page.waitForTimeout(180);assert((await stats(page)).frame>old.frame);
    await page.locator('#search').fill('zzzz-none');assert.equal(await page.locator('.card').count(),0);await page.locator('#reset').click();
    for(const cat of ['all',...(slug==='aria'?['starters','mains','iranian','drinks','desserts']:['appetizers','northern','grilled','refreshments','sweets'])]){await page.locator(`[data-category=${cat}]`).click();assert((await page.locator('.card').count())>0);}
    await page.locator('[data-category=all]').click();
    // Entry animations move cards but do not fade their opaque protection layer.
    await page.locator('.card').first().scrollIntoViewIfNeeded();
    assert.equal(await page.locator('.card').first().evaluate(c=>getComputedStyle(c).opacity),'1');
    const original=await page.locator('#menu-content').innerText();
    await page.locator('#winter-motion').click();const paused=await stats(page);assert(!paused.running);await page.waitForTimeout(150);assert.equal((await stats(page)).frame,paused.frame);assert.equal(await page.locator('#winter-snow').isVisible(),false);assert.equal((await stats(page)).cardAnimations,0);
    await page.locator('#winter-motion').click();await page.waitForFunction(()=>WinterEffects.inspect().running);assert.equal(await page.locator('#menu-content').innerText(),original);
    await page.locator('#winter-customize').click();assert(await page.locator('.theme-lab').isVisible());
    // Previously implemented themes must still work and completely stop the snow.
    for(const theme of ['default','nowruz','yalda','autumn','valentine']){
      await page.locator(`[data-theme-choice=${theme}]`).click();assert.equal(await page.locator('html').getAttribute('data-theme'),theme);assert(!(await stats(page)).running);assert.equal(await page.locator('#menu-content').innerText(),original);
    }
    await page.locator('[data-theme-choice=winter]').click();assert((await stats(page)).running);
    assert(requests.every(u=>new URL(u).origin===origin));assert.deepEqual(errors,[]);
    results.push({width,slug,liveCanvas:true,layers:3,maxParticles:b.particles,dpr:b.dpr,searchCategoriesAndOldThemes:'passed',effectsStopAndRestart:'passed',noHorizontalOverflow:true});
    await context.close();
   }
  }
  const context=await browser.newContext({viewport:{width:390,height:844}});const p=await context.newPage();await p.goto(`${origin}/aria?theme=winter`);await p.waitForSelector('.card');
  // The selection is saved by the explicit choice, not by opening a preview link.
  await p.locator('[data-theme-choice=winter]').click();await p.locator('.effects-label').click();await p.reload();await p.waitForSelector('.card');assert(!(await stats(p)).running);assert.equal(await p.locator('html').getAttribute('data-theme'),'winter');
  await p.goto(`${origin}/bahar`);await p.waitForSelector('.card');assert.equal(await p.locator('html').getAttribute('data-theme'),'default');await p.locator('[data-theme-choice=winter]').click();assert((await stats(p)).running);
  await p.goto(`${origin}/aria`);await p.waitForSelector('.card');assert.equal(await p.locator('html').getAttribute('data-theme'),'winter');assert(!(await stats(p)).running);
  await p.locator('#winter-motion').click();
  await p.emulateMedia({reducedMotion:'reduce'});await p.waitForFunction(()=>document.documentElement.dataset.effects==='off');assert(!(await stats(p)).running);assert.equal(await p.locator('#winter-snow').isVisible(),false);assert.equal(await p.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running').length),0);
  await p.emulateMedia({reducedMotion:'no-preference'});await p.waitForFunction(()=>WinterEffects.inspect().running);
  // Exercise the actual visibility handler with a simulated hidden document.
  await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  const stopped=await stats(p);assert(!stopped.running);await p.waitForTimeout(250);assert.equal((await stats(p)).frame,stopped.frame);assert.equal(await p.locator('.winter-glow').first().evaluate(e=>getComputedStyle(e).animationPlayState),'paused');
  await p.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await p.waitForFunction(()=>WinterEffects.inspect().running);
  results.push({independence:'theme and motion remembered per restaurant',reducedMotion:'all winter motion stopped',visibility:'simulated hidden event stops frame counter and pauses lights; resumes on visible'});
  await context.close();
  // Simulated 2-core/2-GB device at 4x CPU throttling (not a physical phone claim).
  const weak=await browser.newContext({viewport:{width:360,height:800},deviceScaleFactor:3});await weak.addInitScript(()=>{Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>2});Object.defineProperty(navigator,'deviceMemory',{get:()=>2});});const w=await weak.newPage();const cdp=await weak.newCDPSession(w);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});await w.goto(`${origin}/aria?theme=winter`);await w.waitForFunction(()=>WinterEffects.inspect().frame>=35);const low=await stats(w);assert(low.particles<=36);assert(low.fps<=24);assert(low.dpr<=1);
  results.push({weakHardwareSimulation:{particles:low.particles,fpsCap:low.fps,dpr:low.dpr,meanCanvasDrawMs:low.meanDrawMs,maxCanvasDrawMs:low.maxDrawMs},note:'draw time only; not total rendering time or a guarantee on real phones'});await weak.close();
  // Test the opaque file viewer, where localStorage is forbidden.
  const offline=await browser.newPage();await offline.setContent('<iframe sandbox="allow-scripts" style="width:390px;height:844px"></iframe>');await offline.locator('iframe').evaluate((el,html)=>el.srcdoc=html,fs.readFileSync('/home/user/winter-preview.html','utf8'));const frame=offline.frameLocator('iframe');await frame.locator('.card').first().waitFor();assert.equal(await frame.locator('html').getAttribute('data-theme'),'winter');await frame.locator('#winter-motion').click();assert.equal(await frame.locator('html').getAttribute('data-effects'),'off');await frame.locator('#winter-motion').click();assert.equal(await frame.locator('html').getAttribute('data-effects'),'on');
  results.push({sandbox:'winter opens immediately; canvas and toggle work without localStorage'});
  fs.writeFileSync('tests/winter-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
 }finally{await browser.close();}
})();
