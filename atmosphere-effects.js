/* Independent engine for summer / valentine / halloween. Winter's renderer is
   deliberately untouched. Only one engine can run for the active theme. */
(() => {
 'use strict';
 const modes=new Set(['summer','valentine','halloween']);
 const root=document.documentElement;
 const canvas=document.createElement('canvas');canvas.id='atmosphere-canvas';canvas.hidden=true;canvas.setAttribute('aria-hidden','true');document.body.prepend(canvas);
 const ctx=canvas.getContext('2d',{alpha:true});
 const weak=(navigator.hardwareConcurrency||8)<=4||(navigator.deviceMemory||8)<=4||Boolean(navigator.connection?.saveData);
 const cache=new Map();
 let mode='',width=0,height=0,dpr=1,particles=[],dirty=true,raf=0,last=0,running=false,frame=0,time=0,quality=1,fps=weak?24:30,slow=0;
 let drawMs=0,maxDrawMs=0,draws=0,observer=null;
 const seen=new WeakSet(),cardAnimations=new Set();
 const active=()=>Boolean(ctx)&&modes.has(root.dataset.theme)&&root.dataset.effects==='on';
 function sprite(kind){
  if(cache.has(kind))return cache.get(kind);
  const c=document.createElement('canvas');c.width=c.height=48;const g=c.getContext('2d');g.translate(24,24);
  if(kind==='heart'){
   g.fillStyle='#d399a6';g.strokeStyle='#edc7c4';g.lineWidth=1.2;g.beginPath();g.moveTo(0,15);g.bezierCurveTo(-34,-6,-12,-28,0,-11);g.bezierCurveTo(12,-28,34,-6,0,15);g.fill();g.stroke();
  }else if(kind==='petal'){
   const grad=g.createLinearGradient(-15,-15,15,15);grad.addColorStop(0,'#e3b0b6');grad.addColorStop(1,'#99465c');g.fillStyle=grad;g.beginPath();g.moveTo(-15,-10);g.bezierCurveTo(20,-27,27,17,0,18);g.bezierCurveTo(3,1,-8,1,-15,-10);g.fill();
  }else if(kind==='leaf'){
   g.fillStyle='#d79b54';g.beginPath();g.moveTo(-18,14);g.quadraticCurveTo(-22,-15,17,-17);g.quadraticCurveTo(23,17,-18,14);g.fill();g.strokeStyle='#83573b';g.lineWidth=1.2;g.beginPath();g.moveTo(-18,14);g.lineTo(12,-10);g.moveTo(-4,3);g.lineTo(-9,-10);g.moveTo(2,-2);g.lineTo(13,4);g.stroke();
  }else{
   const rgb=kind==='sun'?'241,192,70':kind==='rose'?'235,191,148':'226,169,100';
   const grad=g.createRadialGradient(0,0,0,0,0,22);grad.addColorStop(0,`rgba(${rgb},.95)`);grad.addColorStop(.17,`rgba(${rgb},.7)`);grad.addColorStop(1,`rgba(${rgb},0)`);g.fillStyle=grad;g.fillRect(-24,-24,48,48);
   if(kind==='sun'){g.strokeStyle='#ffe4a1';g.lineWidth=1;g.beginPath();g.moveTo(-7,0);g.lineTo(7,0);g.moveTo(0,-7);g.lineTo(0,7);g.stroke();}
  }
  cache.set(kind,c);return c;
 }
 const fog=document.createElement('canvas');fog.width=256;fog.height=96;const fg=fog.getContext('2d');
 fg.translate(128,48);fg.scale(1,.35);const haze=fg.createRadialGradient(0,0,0,0,0,120);haze.addColorStop(0,'rgba(196,178,211,.6)');haze.addColorStop(1,'rgba(196,178,211,0)');fg.fillStyle=haze;fg.fillRect(-128,-137,256,274);
 function build(){
  width=canvas.clientWidth||innerWidth;height=canvas.clientHeight||innerHeight;dpr=Math.min(devicePixelRatio||1,weak?1:1.5,Math.sqrt(1600000/(width*height)));
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
  const n=Math.round((weak?24:width<600?36:54)*quality);
  particles=Array.from({length:n},(_,i)=>{
   const layer=i%3;
   const kind=mode==='summer'?'sun':mode==='valentine'?(i%5===0?'heart':i%5===1?'rose':'petal'):(i%4===0?'ember':'leaf');
   return {x:Math.random()*width,y:Math.random()*height,layer,kind,phase:Math.random()*Math.PI*2,angle:Math.random()*6.28,speed:7+layer*6+Math.random()*5,size:mode==='summer'?4+layer*3:6+layer*4,alpha:mode==='summer'?.3+layer*.12:.27+layer*.16};
  });dirty=false;
 }
 function draw(dt){
  const start=performance.now();time+=dt;ctx.clearRect(0,0,width,height);
  if(mode==='halloween'){
   ctx.globalAlpha=.1;const w=Math.max(400,width*.9),h=Math.min(220,height*.25);
   ctx.drawImage(fog,width*.1+Math.sin(time*.07)*width*.2,height*.46+Math.sin(time*.12)*25,w,h);
   ctx.globalAlpha=.075;ctx.drawImage(fog,-width*.25+Math.sin(time*.09+2)*width*.25,height*.79,w*1.3,h);
  }
  for(const p of particles){
   if(mode==='summer'){p.x+=(8+p.layer*4)*dt;p.y+=(Math.sin(time*.45+p.phase)*4-2-p.layer)*dt;}
   else{p.y+=p.speed*dt;p.x+=(Math.sin(time*.38+p.phase)*8+(mode==='halloween'?6:2))*dt;p.angle+=dt*(mode==='valentine'?.18:.3);}
   if(p.y>height+20){p.y=-20;p.x=Math.random()*width}if(p.y< -25)p.y=height+15;if(p.x>width+20)p.x=-20;if(p.x< -25)p.x=width+15;
   ctx.globalAlpha=p.alpha*(mode==='summer'?.65+.35*Math.sin(time*.6+p.phase)**2:1);
   ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
   const squash=p.kind==='petal'?.65+.35*Math.cos(time*.8+p.phase)**2:1;
   ctx.drawImage(sprite(p.kind),-p.size/2,-p.size/2,p.size*squash,p.size);ctx.restore();
  }
  ctx.globalAlpha=1;frame++;const cost=performance.now()-start;drawMs+=cost;draws++;maxDrawMs=Math.max(maxDrawMs,cost);
  slow=cost>6?slow+1:Math.max(0,slow-1);if(slow>=12&&quality>.55){quality=Math.max(.55,quality*.75);particles.length=Math.round(particles.length*.75);fps=24;slow=0;}
 }
 function tick(now){if(!running)return;const gap=now-last;if(!last||gap>=1000/fps-1){if(dirty)build();draw(last?Math.min(gap/1000,.08):1/fps);last=now}raf=requestAnimationFrame(tick)}
 function stop(){if(raf)cancelAnimationFrame(raf);raf=0;last=0;running=false;}
 function cards(){
  observer?.disconnect();observer=null;
  if(!active()||document.hidden){for(const a of cardAnimations)a.cancel();cardAnimations.clear();return;}
  if(!('IntersectionObserver' in window))return;
  observer=new IntersectionObserver(entries=>{
   let i=0;for(const entry of entries){if(!entry.isIntersecting||seen.has(entry.target))continue;seen.add(entry.target);observer.unobserve(entry.target);if(!active()||document.hidden)continue;
    const a=entry.target.animate([{transform:'translateY(10px)'},{transform:'translateY(0)'}],{duration:500,delay:Math.min(i++*50,100),easing:'cubic-bezier(.2,.7,.2,1)'});cardAnimations.add(a);a.onfinish=a.oncancel=()=>cardAnimations.delete(a);
   }
  },{threshold:.08});document.querySelectorAll('.card').forEach(c=>{if(!seen.has(c))observer.observe(c)});
 }
 function sync(){
  const selected=root.dataset.theme,valid=modes.has(selected);
  if(valid){root.dataset.atmosphere=selected;if(selected!==mode){mode=selected;dirty=true;quality=1;time=0;}}
  else delete root.dataset.atmosphere;
  root.dataset.pageVisible=String(!document.hidden);
  const controls=document.querySelector('#atmosphere-controls');controls.hidden=!valid;
  if(valid){
   const lab=document.querySelector('.theme-lab'),main=document.querySelector('main');if(main.lastElementChild!==lab)main.append(lab);
   const label={summer:'نسیم و نورِ تابستان',valentine:'گلبرگ و نورِ گرم',halloween:'مه و فانوس‌های روشن'}[selected];document.querySelector('#atmosphere-caption').textContent=label;
  }
  document.querySelectorAll('[data-live-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.liveChoice===selected)));
  const button=document.querySelector('#atmosphere-motion');button.textContent=active()?'توقف جلوه‌ها':'روشن‌کردن جلوه‌ها';button.setAttribute('aria-pressed',String(active()));button.disabled=matchMedia('(prefers-reduced-motion: reduce)').matches;
  canvas.hidden=!active();
  if(active()&&!document.hidden){if(!running){running=true;last=0;raf=requestAnimationFrame(tick)}}else{stop();if(!active()&&ctx)ctx.clearRect(0,0,width,height)}
  cards();
 }
 document.addEventListener('menu:theme-updated',sync);document.addEventListener('menu:rendered',cards);document.addEventListener('visibilitychange',sync);
 window.addEventListener('pagehide',()=>{stop();observer?.disconnect();for(const a of cardAnimations)a.cancel();cardAnimations.clear()});window.addEventListener('pageshow',sync);window.addEventListener('resize',()=>{dirty=true},{passive:true});
 document.querySelector('#atmosphere-motion').onclick=()=>document.querySelector('#effects-toggle').click();
 document.querySelector('#atmosphere-customize').onclick=()=>document.querySelector('.theme-lab').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 document.querySelector('#live-theme-shortcuts').onclick=e=>{const b=e.target.closest('[data-live-choice]');if(b)document.querySelector(`[data-theme-choice="${b.dataset.liveChoice}"]`).click()};
 window.AtmosphereEffects=Object.freeze({inspect:()=>({mode,running,frame,particles:particles.length,layers:[...new Set(particles.map(p=>p.layer))],kinds:[...new Set(particles.map(p=>p.kind))],fps,dpr,width,height,fogLayers:mode==='halloween'?2:0,meanDrawMs:draws?drawMs/draws:0,maxDrawMs,positions:particles.slice(0,5).map(p=>({x:p.x,y:p.y,angle:p.angle})),cardAnimations:cardAnimations.size})});
})();
