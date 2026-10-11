const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('fs');
const base='http://127.0.0.1:3000';const themes=['summer','valentine','halloween'];
const inspect=p=>p.evaluate(()=>AtmosphereEffects.inspect());
(async()=>{const browser=await chromium.launch();const report=[];try{
 for(const width of [320,375,390,768,1280])for(const slug of ['aria','bahar']){
  const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:2});
  await context.addInitScript(()=>{Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>8});Object.defineProperty(navigator,'deviceMemory',{get:()=>8});});
  const p=await context.newPage(),errors=[],requests=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});p.on('request',r=>requests.push(r.url()));
  for(const theme of themes){
   await p.goto(`${base}/${slug}?theme=${theme}`);await p.waitForSelector('.card');await p.waitForFunction(()=>AtmosphereEffects.inspect().frame>1);await p.evaluate(()=>document.fonts.ready);
   const data=JSON.parse(fs.readFileSync(`data/${slug}.json`));const original=await p.locator('#menu-content').innerText();assert.equal(await p.locator('.card').count(),data.items.length);assert.equal(await p.locator('.brand strong').innerText(),data.restaurant.name);
   assert.equal(await p.locator('[data-theme-choice]').count(),8);assert.equal(await p.locator('[data-theme-choice][aria-pressed=true]').count(),1);
   assert(!(await p.evaluate(()=>WinterEffects.inspect().running)));
   const a=await inspect(p),pixels=await p.locator('#atmosphere-canvas').evaluate(c=>c.toDataURL());
   const selector={summer:'.summer-palm',valentine:'.valentine-lights',halloween:'.halloween-branch'}[theme];
   const cssA=await p.locator(selector).first().evaluate(e=>[getComputedStyle(e).transform,getComputedStyle(e).opacity].join('|'));
   await p.waitForTimeout(240);const b=await inspect(p);assert(b.frame>a.frame);assert.notDeepEqual(a.positions,b.positions);assert.notEqual(pixels,await p.locator('#atmosphere-canvas').evaluate(c=>c.toDataURL()));
   assert.notEqual(cssA,await p.locator(selector).first().evaluate(e=>[getComputedStyle(e).transform,getComputedStyle(e).opacity].join('|')));
   assert(b.particles<=54&&b.dpr<=1.5);assert.deepEqual(b.layers,[0,1,2]);if(theme==='valentine')assert(b.kinds.includes('heart')&&b.kinds.includes('petal'));if(theme==='halloween')assert.equal(b.fogLayers,2);
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   assert.equal(await p.locator('#atmosphere-canvas').evaluate(e=>getComputedStyle(e).pointerEvents),'none');
   assert.equal(await p.locator('.card').first().evaluate(e=>getComputedStyle(e).opacity),'1');
   assert((await p.locator('.card').first().evaluate(e=>getComputedStyle(e).backgroundColor)).startsWith('rgb('));
   if(width===390&&slug==='aria')await p.screenshot({path:`tests/${theme}-mobile-reviewed.png`});
   if(width===1280&&slug==='aria')await p.screenshot({path:`tests/${theme}-desktop-reviewed.png`});
   await p.locator('#search').fill(data.items[0].name);assert.equal(await p.locator('.card').count(),1);const frame=(await inspect(p)).frame;await p.evaluate(()=>scrollBy({top:500,behavior:'instant'}));await p.waitForTimeout(100);assert((await inspect(p)).frame>frame);
   await p.locator('#search').fill('no-such-food');assert.equal(await p.locator('.card').count(),0);await p.locator('#reset').click();
   await p.locator('[data-category]').nth(1).click();assert((await p.locator('.card').count())>0);await p.locator('[data-category=all]').click();assert.equal(await p.locator('#menu-content').innerText(),original);
   await p.locator('#atmosphere-motion').click();const off=await inspect(p);assert(!off.running);await p.waitForTimeout(90);assert.equal((await inspect(p)).frame,off.frame);assert.equal(await p.locator('#atmosphere-canvas').isVisible(),false);assert.equal(await p.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running').length),0);
   await p.locator('#atmosphere-motion').click();assert((await inspect(p)).running);
   report.push({width,slug,theme,canvasPixelsAndPositionsChange:true,svgMotionChanges:true,searchAndCategories:true,offOn:true,particles:b.particles,dpr:b.dpr,noOverflow:true});
  }
  assert(requests.every(u=>new URL(u).origin===base));assert.deepEqual(errors,[]);await context.close();
 }
 const context=await browser.newContext({viewport:{width:390,height:900}});const p=await context.newPage();await p.goto(`${base}/aria?theme=summer`);await p.waitForSelector('.card');
 // Rapid live shortcuts, including switching to and from the untouched winter engine.
 for(const theme of ['valentine','halloween','summer','winter']){await p.locator(`[data-live-choice=${theme}]`).click();assert.equal(await p.locator('html').getAttribute('data-theme'),theme);assert.equal((await inspect(p)).running,theme!=='winter');assert.equal(await p.evaluate(()=>WinterEffects.inspect().running),theme==='winter');}
 await p.locator('[data-theme-choice=summer]').click();await p.locator('#atmosphere-motion').click();await p.reload();await p.waitForSelector('.card');assert(!(await inspect(p)).running);
 await p.goto(`${base}/bahar`);await p.waitForSelector('.card');assert.equal(await p.locator('html').getAttribute('data-theme'),'default');await p.locator('[data-theme-choice=halloween]').click();assert((await inspect(p)).running);
 await p.goto(`${base}/aria`);await p.waitForSelector('.card');assert.equal(await p.locator('html').getAttribute('data-theme'),'summer');assert(!(await inspect(p)).running);await p.locator('#atmosphere-motion').click();
 for(const theme of themes){
  await p.locator(`[data-theme-choice=${theme}]`).click();await p.emulateMedia({reducedMotion:'reduce'});await p.waitForFunction(()=>document.documentElement.dataset.effects==='off');assert(!(await inspect(p)).running);assert.equal(await p.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running').length),0);
  await p.emulateMedia({reducedMotion:'no-preference'});await p.waitForFunction(()=>AtmosphereEffects.inspect().running);
  await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))});const paused=await inspect(p);assert(!paused.running);await p.waitForTimeout(130);assert.equal((await inspect(p)).frame,paused.frame);assert.equal(await p.locator('.atmos-motion').first().evaluate(e=>getComputedStyle(e).animationPlayState),'paused');
  await p.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))});assert((await inspect(p)).running);
 }
 report.push({independentPreferences:true,onlyOneParticleEngineAtATime:true,reducedMotionAllThree:'passed',simulatedVisibilityPause:'passed'});
 await context.close();
 // Low-end CPU simulation, not a claim about a physical phone.
 const weak=await browser.newContext({viewport:{width:360,height:800},deviceScaleFactor:3});await weak.addInitScript(()=>{Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>2});Object.defineProperty(navigator,'deviceMemory',{get:()=>2});});const w=await weak.newPage(),cdp=await weak.newCDPSession(w);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 for(const theme of themes){await w.goto(`${base}/aria?theme=${theme}`);await w.waitForFunction(()=>AtmosphereEffects.inspect().frame>=20);const s=await inspect(w);assert(s.particles<=24&&s.dpr<=1&&s.fps<=24);report.push({weakCpuSimulation:theme,particles:s.particles,fpsCap:s.fps,dpr:s.dpr,meanCanvasDrawMs:s.meanDrawMs,maxCanvasDrawMs:s.maxDrawMs});}await weak.close();
 // Genuine opaque iframe: no storage or external resources required.
 const offline=await browser.newPage();await offline.setContent('<iframe sandbox="allow-scripts" style="width:390px;height:900px"></iframe>');
 for(const theme of themes){await offline.locator('iframe').evaluate((el,html)=>el.srcdoc=html,fs.readFileSync(`/home/user/${theme}-preview.html`,'utf8'));const f=offline.frameLocator('iframe');await f.locator('.card').first().waitFor();assert.equal(await f.locator('html').getAttribute('data-theme'),theme);const before=await f.locator('#atmosphere-canvas').evaluate(c=>c.toDataURL());await offline.waitForTimeout(150);assert.notEqual(before,await f.locator('#atmosphere-canvas').evaluate(c=>c.toDataURL()));await f.locator('#atmosphere-motion').click();assert.equal(await f.locator('html').getAttribute('data-effects'),'off');}
 report.push({opaqueOfflinePreviews:'all three animate and toggle without localStorage'});
 fs.writeFileSync('tests/atmosphere-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}})();
