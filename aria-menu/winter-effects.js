/* Bounded viewport canvas; independent of scroll. No full-page DOM particles.
   Scene sprites are prerendered once. Drawing is capped at 24–30 fps and DPR <=1.5.
   Visibility, reduced motion, effects toggle and theme changes own the lifecycle. */
(() => {
  'use strict';
  const canvas=document.createElement('canvas');
  canvas.id='winter-snow';canvas.setAttribute('aria-hidden','true');canvas.hidden=true;
  document.body.prepend(canvas);
  const ctx=canvas.getContext('2d',{alpha:true});
  const weak=(navigator.hardwareConcurrency||8)<=4||(navigator.deviceMemory||8)<=4||Boolean(navigator.connection?.saveData);
  const sprite=(near)=>{
    const c=document.createElement('canvas');c.width=c.height=32;const g=c.getContext('2d');
    const glow=g.createRadialGradient(16,16,0,16,16,16);glow.addColorStop(0,'rgba(236,249,255,1)');glow.addColorStop(.22,'rgba(231,246,255,.85)');glow.addColorStop(1,'rgba(221,242,255,0)');
    g.fillStyle=glow;g.fillRect(0,0,32,32);
    if(near){g.strokeStyle='rgba(235,249,255,.75)';g.lineWidth=1;g.translate(16,16);for(let i=0;i<6;i++){g.rotate(Math.PI/3);g.beginPath();g.moveTo(0,0);g.lineTo(0,9);g.moveTo(0,5);g.lineTo(3,7);g.moveTo(0,5);g.lineTo(-3,7);g.stroke();}}
    return c;
  };
  const sprites=ctx?[sprite(false),sprite(true)]:[];
  let width=0,height=0,dpr=1,particles=[],frame=0,raf=0,last=0,time=0,running=false,resizePending=true;
  let fps=weak?24:30,quality=1,slowFrames=0,observer=null;
  let elapsedDraw=0,maxDraw=0,draws=0;
  const seen=new WeakSet(),cardAnimations=new Set();
  const enabled=()=>Boolean(ctx)&&document.documentElement.dataset.theme==='winter'&&document.documentElement.dataset.effects==='on';
  const count=()=>Math.round((weak?36:width<600?58:90)*quality);
  function build(){
    width=canvas.clientWidth||innerWidth;height=canvas.clientHeight||innerHeight;
    dpr=Math.min(devicePixelRatio||1,weak?1:1.5,Math.sqrt(1800000/(width*height)));
    canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
    particles=Array.from({length:count()},(_,i)=>{
      const layer=i%3;
      return {x:Math.random()*width,y:Math.random()*height,layer,
        radius:[1.5,2.6,4.4][layer]*(.7+Math.random()*.6),
        speed:[11,21,36][layer]*(.7+Math.random()*.65),
        opacity:[.35,.57,.82][layer],phase:Math.random()*Math.PI*2,drift:2+Math.random()*5};
    });
    resizePending=false;
  }
  function draw(dt){
    const before=performance.now();ctx.clearRect(0,0,width,height);time+=dt;
    for(const p of particles){
      p.y+=p.speed*dt;p.x+=(p.drift+Math.sin(time*.45+p.phase)*(3+p.layer*2))*dt;
      if(p.y>height+12){p.y=-12;p.x=Math.random()*width;}if(p.x>width+12)p.x=-12;
      ctx.globalAlpha=p.opacity;
      const size=p.radius*3;ctx.drawImage(sprites[p.layer===2?1:0],p.x-size/2,p.y-size/2,size,size);
    }
    ctx.globalAlpha=1;frame++;const cost=performance.now()-before;elapsedDraw+=cost;draws++;maxDraw=Math.max(maxDraw,cost);
    if(cost>6)slowFrames++;else slowFrames=Math.max(0,slowFrames-1);
    // Reduce density under sustained load, not just because a single frame was slow.
    if(slowFrames>=12&&quality>.55){quality=Math.max(.55,quality*.75);fps=24;particles.length=Math.round(particles.length*.75);slowFrames=0;}
  }
  function tick(now){
    if(!running)return;
    const gap=now-last;
    if(!last||gap>=1000/fps-1){
      if(resizePending)build();
      draw(last?Math.min(gap/1000,.08):1/fps);last=now;
    }
    raf=requestAnimationFrame(tick);
  }
  function stop(){if(raf)cancelAnimationFrame(raf);raf=0;running=false;last=0;}
  function revealCards(){
    observer?.disconnect();observer=null;
    if(!enabled()||document.hidden){for(const a of cardAnimations)a.cancel();cardAnimations.clear();return;}
    if(!('IntersectionObserver' in window))return;
    observer=new IntersectionObserver(entries=>{
      let order=0;
      for(const entry of entries){
        if(!entry.isIntersecting||seen.has(entry.target))continue;
        observer.unobserve(entry.target);seen.add(entry.target);
        if(!enabled()||document.hidden)continue;
        const a=entry.target.animate([{transform:'translateY(12px)'},{transform:'translateY(0)'}],{duration:480,delay:Math.min(order++*55,110),easing:'cubic-bezier(.2,.7,.2,1)'});
        cardAnimations.add(a);a.onfinish=()=>cardAnimations.delete(a);a.oncancel=()=>cardAnimations.delete(a);
      }
    },{threshold:.08});
    document.querySelectorAll('.card').forEach(c=>{if(!seen.has(c))observer.observe(c)});
  }
  function placeControls(){
    const lab=document.querySelector('.theme-lab'),nav=document.querySelector('.navigation');
    if(!lab||!nav)return;
    if(document.documentElement.dataset.theme==='winter'){const main=document.querySelector('main');if(main.lastElementChild!==lab)main.append(lab);}
    else if(lab.nextElementSibling!==nav)nav.before(lab);
  }
  function sync(){
    const winter=document.documentElement.dataset.theme==='winter';
    document.documentElement.dataset.pageVisible=String(!document.hidden);
    canvas.hidden=!enabled();
    const button=document.querySelector('#winter-motion');
    if(button){button.textContent=enabled()?'توقف برف و جلوه‌ها':'روشن‌کردن جلوه‌ها';button.setAttribute('aria-pressed',String(enabled()));button.disabled=matchMedia('(prefers-reduced-motion: reduce)').matches;}
    const controls=document.querySelector('#winter-controls');if(controls)controls.hidden=!winter;
    placeControls();
    if(enabled()&&!document.hidden){if(!running){running=true;last=0;raf=requestAnimationFrame(tick)}}
    else {stop();if(!enabled()&&ctx)ctx.clearRect(0,0,width,height);}
    revealCards();
  }
  document.addEventListener('menu:theme-updated',sync);
  document.addEventListener('menu:rendered',revealCards);
  document.addEventListener('visibilitychange',sync);
  window.addEventListener('pagehide',()=>{stop();observer?.disconnect();for(const a of cardAnimations)a.cancel();cardAnimations.clear();});
  window.addEventListener('pageshow',sync);
  window.addEventListener('resize',()=>{resizePending=true},{passive:true});
  // Read-only diagnostics for reproducible preview checks; no control of user data.
  window.WinterEffects=Object.freeze({inspect:()=>({running,frame,particles:particles.length,fps,dpr,layers:[...new Set(particles.map(p=>p.layer))],width,height,canvasAvailable:Boolean(ctx),meanDrawMs:draws?elapsedDraw/draws:0,maxDrawMs:maxDraw,cardAnimations:cardAnimations.size,positions:particles.slice(0,3).map(p=>({x:p.x,y:p.y,speed:p.speed,radius:p.radius})),hidden:document.hidden})});
})();
