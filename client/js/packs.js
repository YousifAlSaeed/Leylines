'use strict';
/* =====================================================================
   PACKS  (level-up packs, the daily pack, and opening them)
   Opening: drag across the top strip to tear it, light leaks out in the
   best card's colour, then the cards come out worst to best. Tap one to
   flip it (rarer cards glow and shake longer first), swipe it away for
   the next. The cards are added to the collection the moment it tears,
   so closing early never loses them; closing before that keeps the pack.
   ===================================================================== */
// the rarity colours, from cards.css (--r1 … --r5), so they're set in one place
const RC=[1,2,3,4,5].map(r=>getComputedStyle(document.documentElement).getPropertyValue('--r'+r).trim());
// one colour for a rarity's light: 5★ is the prism, so its light is white and its sparks and rays are rainbow
const rarCol=r=>r===5?'#ffffff':RC[r-1];
const RM=matchMedia('(prefers-reduced-motion: reduce)');
const PK={src:null,ids:[],fresh:[],i:0,state:'',ret:null,tear:{on:false}};

/* ---------- the daily pack: one per game day (clock.js); 7 days in a row ends with an Arcane ---------- */
function dailyState(){
  const d=SAVE.daily,t=today();
  // no game day until the server has told the time
  if(!t)return {ready:false,wait:true,day:d?(d.n-1)%7+1:1,n:d?d.n:0};
  if(d&&d.at>=t)return {ready:false,day:(d.n-1)%7+1,n:d.n};
  const n=d&&d.at===yesterday()?d.n+1:1,day=(n-1)%7+1;
  return {ready:true,day,n,t:day===7?'arcane':'spark'};
}
const packsToOpen=()=>SAVE.packs.length+(dailyState().ready?1:0);

/* ---------- rolling ---------- */
// p: {t, mile}. Returns card ids, worst first and best last.
function rollPack(p){
  const T=PACKS[p.t],out=[],sure=pitySure(p.t);
  const pick=min=>{const w=T.odds.map((x,i)=>i+1>=min?x:0),sum=w.reduce((a,b)=>a+b,0);
    let r=Math.random()*sum;for(let i=0;i<5;i++){r-=w[i];if(r<=0&&w[i])return i+1}return 5};
  for(let i=0;i<T.n;i++){
    const last=i===T.n-1;
    const rar=last&&sure?5:pick(last?Math.max(T.min,p.mile?4:1):1);
    const pool=CARDS.filter(c=>c.rar===rar);
    out.push(pool[Math.floor(Math.random()*pool.length)].id);
  }
  return out.sort((a,b)=>CARDS[a].rar-CARDS[b].rar);
}
// a roll kept for a pack shown but not torn yet (validated: saves can be edited)
const keptRoll=(ids,t)=>Array.isArray(ids)&&ids.length===PACKS[t].n&&ids.every(i=>Number.isInteger(i)&&CARDS[i])?ids:null;
// src: an index into SAVE.packs, or 'daily'. The pack is only used up once it's
// torn (pkCommit): closing it before that keeps it. Its cards are rolled now and
// kept with it, so closing and opening again can't roll new ones.
function openPack(src){
  let p,ids;
  if(src==='daily'){const d=dailyState();if(!d.ready)return;p={t:d.t,daily:d.day,n:d.n};
    const r=SAVE.dailyRoll;ids=r&&r.at===today()&&keptRoll(r.ids,p.t);
    if(!ids){ids=rollPack(p);SAVE.dailyRoll={at:today(),ids};pityAdd(p,ids)}}
  else{p=SAVE.packs[src];if(!p)return;ids=keptRoll(p.ids,p.t);
    if(!ids){ids=p.ids=rollPack(p);pityAdd(p,ids)}}
  save();
  pkStart(p,ids,[]);
}
// the guarantee counts a pack when its cards are rolled
function pityAdd(p,ids){SAVE.pity=ids.some(id=>CARDS[id].rar===5)?0:Math.min(PITY,SAVE.pity+PITY_PTS[p.t])}
// the pack is torn: use it up and add its cards
function pkCommit(){
  const p=PK.src;
  if(p.daily){SAVE.daily={at:today(),n:p.n};SAVE.dailyRoll=null}
  // found by its cards too: a cloud sync may have swapped SAVE since it was shown
  else{let k=SAVE.packs.indexOf(p);if(k<0)k=SAVE.packs.findIndex(x=>String(x.ids)===String(PK.ids));if(k>=0)SAVE.packs.splice(k,1)}
  // a second copy of a new card in the same pack isn't new
  PK.fresh=PK.ids.map(id=>{const f=!SAVE.seen.includes(id);collAdd(id);return f});
  SAVE.opened++; // for the pack badges
  profCheck();save();freshToast();
}
// the next pack to open after this one: level packs first, then the daily
const nextPack=()=>SAVE.packs.length?0:dailyState().ready?'daily':null;

/* ---------- sound (synthesised; follows the sound-effects volume) ---------- */
let NOISE=null;
function pkAudio(){
  if(!SAVE.sound||!SAVE.sfxVol)return null;
  try{AC=AC||new(window.AudioContext||window.webkitAudioContext)();if(AC.state==='suspended')AC.resume()}catch(e){return null}
  if(!NOISE){NOISE=AC.createBuffer(1,AC.sampleRate,AC.sampleRate);const d=NOISE.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1}
  return AC;
}
function noise(dur,f0,f1,vol,q=1.2){
  const a=pkAudio();if(!a)return;const t=a.currentTime,s=a.createBufferSource(),bp=a.createBiquadFilter(),g=a.createGain();
  s.buffer=NOISE;bp.type='bandpass';bp.Q.value=q;bp.frequency.setValueAtTime(f0,t);bp.frequency.exponentialRampToValueAtTime(f1,t+dur);
  g.gain.setValueAtTime(vol*SAVE.sfxVol/100,t);g.gain.exponentialRampToValueAtTime(.0001,t+dur);
  s.connect(bp).connect(g).connect(a.destination);s.start(t,Math.random()*.5,dur+.05);
}
function tone(f,dur,type='triangle',vol=.12,when=0){
  const a=pkAudio();if(!a)return;const t=a.currentTime+when,o=a.createOscillator(),g=a.createGain();
  o.type=type;o.frequency.value=f;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(vol*SAVE.sfxVol/100,t+.015);g.gain.exponentialRampToValueAtTime(.0001,t+dur);
  o.connect(g).connect(a.destination);o.start(t);o.stop(t+dur+.05);
}
const PSND={
  tick:()=>noise(.035,2400+Math.random()*1800,1800,.22,2.5),
  rip:()=>{noise(.32,5000,900,.5,.9);tone(140,.25,'sine',.25)},
  snap:()=>noise(.12,900,400,.15),
  whoosh:()=>noise(.28,600,3000,.18,.7),
  flip:()=>{noise(.12,3000,1500,.12,1.5);tone(660,.08,'triangle',.06)},
  build:r=>{for(let i=0;i<(r===5?14:8);i++)tone(220+i*(r===5?45:35),.09,'square',.03,i*(r===5?.11:.12))},
  reveal:r=>{const N=[[523],[523,659],[523,659,784],[523,659,784,1047],[523,659,784,1047,1319,1568]][r-1];
    N.forEach((f,i)=>tone(f,r>=4?.6:.25,'triangle',.11,i*.07));if(r>=4)tone(N[0]/2,.9,'sine',.2)},
  fling:()=>noise(.18,1200,4000,.12,.8),
};
const buzz=p=>{try{navigator.vibrate&&navigator.vibrate(p)}catch(e){}};

/* ---------- sparks ---------- */
const FX={cv:null,cx:null,p:[],raf:0};
function fxFit(){const c=FX.cv,d=devicePixelRatio||1;c.width=innerWidth*d;c.height=innerHeight*d;FX.cx.setTransform(d,0,0,d,0,0)}
function spark(x,y,col,n=6,spd=3,life=40,grav=.12){
  if(RM.matches)return;
  for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,v=spd*(.3+Math.random());
    FX.p.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-1,l:life*(.6+Math.random()*.6),m:life,c:typeof col==='function'?col():col,g:grav,s:1+Math.random()*2.2})}
  if(!FX.raf)FX.raf=requestAnimationFrame(fxTick);
}
function fxTick(){
  const cx=FX.cx;cx.clearRect(0,0,innerWidth,innerHeight);cx.globalCompositeOperation='lighter';
  FX.p=FX.p.filter(p=>p.l-->0);
  for(const p of FX.p){p.vy+=p.g;p.vx*=.985;p.vy*=.985;p.x+=p.vx;p.y+=p.vy;cx.globalAlpha=Math.max(0,p.l/p.m);cx.fillStyle=p.c;cx.beginPath();cx.arc(p.x,p.y,p.s,0,7);cx.fill()}
  cx.globalAlpha=1;FX.raf=FX.p.length?requestAnimationFrame(fxTick):0;
}
const rainbow=()=>['#ff8fd0','#ffd76a','#7fe0ff','#b98cff','#fff'][Math.floor(Math.random()*5)];

/* ---------- the stage ---------- */
const stg=$('#pkStage'),pk=$('#pkPack'),pkBody=$('#pkStage .pk-body'),strip=$('#pkStrip'),lipw=$('#pkStage .pk-lipw'),lip=$('#pkStage .pk-lip'),seam=$('#pkStage .pk-seam'),leak=$('#pkStage .pk-leak');
const HINT_Y='calc(50% + min(36vh,62vw)*.78 + 18px)';
FX.cv=$('#pkFx');FX.cx=FX.cv.getContext('2d');
function pkHint(html,top){const h=$('#pkHint');h.innerHTML=html;h.style.opacity=html?1:0;if(top)h.style.top=top}
function pkStart(p,ids,fresh){
  const T=PACKS[p.t],best=CARDS[ids[ids.length-1]].rar;
  Object.assign(PK,{src:p,ids,fresh,i:0,state:'idle'});
  if(!stg.classList.contains('on'))PK.ret=document.activeElement;
  stg.className='pk-stage on t-'+p.t+(best===5?' best5':'');stg.style.setProperty('--leak',rarCol(best));
  $$('.screen').forEach(s=>s.inert=true);fxFit();
  $('#pkTitle').textContent=p.daily?`Daily pack · day ${p.daily}`:p.lv?`Level ${p.lv} pack`:T.name+' pack';
  $('#pkName').textContent=T.name;$('#pkSub').textContent=`${T.n} cards`+(p.mile?' · 4★ inside':'');
  pk.setAttribute('aria-label',`${T.name} pack, ${T.n} cards. Drag across the top to tear it open, or press Enter.`);
  $('#pkDeck').innerHTML='';$('#pkSum').className='pk-sum';$('#pkSum').innerHTML='';$('#pkCount').style.opacity=0;$('#pkFoot').innerHTML='';
  $('#pkRays').className='pk-rays';
  strip.style.cssText='';seam.style.cssText='';leak.style.cssText='';lipw.style.cssText='';
  cancelAnimationFrame(TR.raf);Object.assign(TR,{on:false,dir:0,p:0,A:0,At:0,va:0,phi:0,phit:0,vp:0,raf:0});buildStrip();
  pk.style.transition='none';pk.style.transform='translateY(60px) scale(.85)';pk.style.opacity=0;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{pk.style.transition='transform .6s var(--spring),opacity .4s';pk.style.transform='';pk.style.opacity=1;PSND.whoosh()}));
  pkHint('<span class="pk-arr">⟶</span> Drag across the top to tear it open',HINT_Y);
  setTimeout(()=>pk.focus({preventScroll:true}),60);
}
function pkClose(){
  stg.className='pk-stage';FX.p=[];PK.state='';
  $$('.screen').forEach(s=>s.inert=false);
  if($('#scr-packs').classList.contains('on'))renderPacks();
  if($('#scr-store').classList.contains('on'))renderStore();
  if($('#scr-menu').classList.contains('on'))renderMenu();
  freshToast();
  if(PK.ret&&PK.ret.isConnected&&PK.ret.offsetParent)PK.ret.focus({preventScroll:true});
}
$('#pkClose').onclick=()=>{sfx('click');pkClose()};
// the pack tilts toward the pointer and its foil catches the light
stg.addEventListener('pointermove',e=>{
  if(PK.state!=='idle'||PK.tear.on||PK.tear.p||RM.matches)return;
  const r=pk.getBoundingClientRect(),x=(e.clientX-(r.left+r.width/2))/r.width,y=(e.clientY-(r.top+r.height/2))/r.height;
  pk.style.transform=`rotateY(${x*14}deg) rotateX(${-y*10}deg)`;pk.style.setProperty('--fx',(50+x*60)+'%');
});
stg.addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();if(PK.state!=='tearing')pkClose();return}
  if(e.key!=='Enter'&&e.key!==' '&&e.key!=='ArrowRight')return;
  if(e.target.closest('button'))return;
  e.preventDefault();
  if(PK.state==='idle')autoTear();
  else if(PK.state==='cards'){const s=$$('#pkDeck .pk-slot')[PK.i];if(s&&!s.busy)s.revealed?fling(s,1):reveal(s)}
});

/* ---------- tearing ----------
   The strip is cut into thin slices. The torn ones curl toward you around the
   point the tear has got to, like real foil, along a ragged line that the strip
   and the pack share. Let go early and the tear stays: the flap droops and
   you carry on from there. */
const TR=PK.tear;
function buildStrip(){
  const W=pk.offsetWidth,H=Math.round(W*.17),N=Math.max(24,Math.min(48,Math.round(W/6))),w=W/N;
  pk.style.setProperty('--cap',H+'px');
  // the tear line: a point every 3px, now and then a bigger tooth
  const R=[];for(let k=0;k<=Math.ceil(W/3)+2;k++)R.push(H-2+Math.random()*4+(Math.random()<.12?2+Math.random()*3:0));
  const J=x=>{const k=x/3,a=Math.floor(k),f=k-a;return R[a]*(1-f)+R[a+1]*f};
  // a half-circle notch cut into each side where the tear starts, like a real pack;
  // side -1 is the strip (it ends above the notch), 1 the pack (it starts below it)
  const r=Math.max(5,Math.round(W*.03));pk.style.setProperty('--notch',r+'px');
  const E=(x,side)=>{const e=Math.min(x,W-x),y=J(x);if(e>=r)return y;const c=H+side*Math.sqrt(r*r-e*e);return side<0?Math.min(y,c):Math.max(y,c)};
  // the line from x0 to x1: a point every 3px, every 1px round the notches
  const line=(x0,x1,side)=>{const xs=[x0];for(let x=Math.floor(x0)+1;x<x1;x++)if(x<=r+1||x>=W-r-1||x%3===0)xs.push(x);xs.push(x1);return xs.map(x=>[x,E(x,side)])};
  const px=pts=>pts.map(([x,y])=>`${x.toFixed(1)}px ${y.toFixed(1)}px`).join(',');
  let h='';
  for(let i=0;i<N;i++){const x0=i*w,x1=Math.min(W,x0+w+1.5),ww=x1-x0,L=line(x0,x1,-1).map(([x,y])=>[x-x0,y]),Lr=[...L].reverse();
    h+=`<div class="pk-sg" style="left:${x0}px;width:${ww}px;clip-path:polygon(0 0,${ww}px 0,${px(Lr)})"><b style="left:${-x0}px;width:${W}px"></b><i></i><u style="clip-path:polygon(${px(L.map(([x,y])=>[x,y-2]))},${px(Lr)})"></u></div>`}
  const S0=line(0,W,-1);
  strip.innerHTML=`<div class="pk-whole"><div style="clip-path:polygon(0 0,${W}px 0,${px([...S0].reverse().map(([x,y])=>[x,y+1]))})"><b style="left:0;width:${W}px"></b></div></div>`+h;
  const B=line(0,W,1),top=H-4;
  pkBody.style.clipPath=`polygon(${px(B.map(([x,y])=>[x,y-top]))},100% 100%,0 100%)`;
  lip.style.clipPath=`polygon(${px(B)},${px([...B].reverse().map(([x,y])=>[x,y+2.2]))})`;
  TR.S={W,H,w,N,r,sg:[...strip.querySelectorAll('.pk-sg')],whole:strip.firstChild};
}
function drawTear(){
  const S=TR.S;if(!S)return;
  const {W,H,w,N,sg}=S,d=TR.dir||1,p=TR.p,T=d>0?p*W:W-p*W,A=TR.A*Math.PI/180,L=W*.2;
  // walk out from the tear: each slice turns a little more than the one before
  let lx=0,lz=0,s=0;
  for(let n=0;n<N;n++){const i=d>0?N-1-n:n,g=sg[i],c=(i+.5)*w;
    if(d>0?c>=T:c<=T){if(g.t){g.t=0;g.style.transform='';g.style.removeProperty('--k');g.className='pk-sg'}continue}
    const th=A*(1-Math.exp(-(s+w/2)/L)),ox=d>0?(i+1)*w:i*w;
    if(!g.t){g.t=1;g.style.transformOrigin=`${d>0?parseFloat(g.style.width):0}px ${H}px`}
    g.style.transform=`translate(${(T-ox).toFixed(2)}px,0) rotate(${(TR.phi*d).toFixed(2)}deg) translate3d(${lx.toFixed(2)}px,0,${lz.toFixed(2)}px) rotateY(${(th*d).toFixed(4)}rad)`;
    const cs=Math.cos(th);g.className=cs<0?'pk-sg off bk':'pk-sg off';g.style.setProperty('--k',((1-Math.abs(cs))*.45).toFixed(3));
    lx+=d>0?-w*cs:w*cs;lz+=w*Math.sin(th);s+=w;
  }
  // light comes out of the torn part only; the perforation goes as it tears
  if(d>0){leak.style.left=0;leak.style.right=(W-T)+'px';lipw.style.clipPath=`inset(-20px ${W-T}px -20px 0)`;seam.style.clipPath=`inset(-2px 0 -2px ${Math.max(0,T-S.r)}px)`}
  else{leak.style.left=T+'px';leak.style.right=0;lipw.style.clipPath=`inset(-20px 0 -20px ${T}px)`;seam.style.clipPath=`inset(-2px ${Math.max(0,W-T-S.r)}px -2px 0)`}
  S.whole.style.clipPath=d>0?`inset(-2px 0 -20px ${T}px)`:`inset(-2px ${W-T}px -20px 0)`;
  leak.style.opacity=Math.min(1,p*2.5)*.9;
  if(PK.state==='tearing'||PK.state==='idle'){pk.style.transition='none';pk.style.transform=p?`rotate(${-d*p*2}deg)`:''}
}
// the flap moves on a spring: it lags a fast pull, and droops with a bounce when let go
function tearLoop(){
  if(TR.raf)return;
  const f=()=>{const live=PK.state==='tearing',k=live?.22:.09,dm=live?.62:.8;
    TR.va=(TR.va+(TR.At-TR.A)*k)*dm;TR.A+=TR.va;TR.vp=(TR.vp+(TR.phit-TR.phi)*k)*dm;TR.phi+=TR.vp;drawTear();
    TR.raf=live||Math.abs(TR.va)>.03||Math.abs(TR.At-TR.A)>.1||Math.abs(TR.vp)>.02?requestAnimationFrame(f):0};
  TR.raf=requestAnimationFrame(f);
}
// how far it curls: more the further it's torn; it lifts toward a raised hand
const tearAim=fy=>{TR.At=35+65*Math.min(1,TR.p/.3);if(fy!=null)TR.phit=Math.max(8,Math.min(30,14-fy*40))};
function tearStep(){
  const step=Math.floor(TR.p*28);if(step<=TR.last)return;TR.last=step;PSND.tick();buzz(4);
  const r=pkBody.getBoundingClientRect(),x=TR.dir>0?TR.p:1-TR.p;
  spark(r.left+x*r.width,r.top+4,stg.style.getPropertyValue('--leak'),4,2.4,30,.18);
}
pk.addEventListener('pointerdown',e=>{
  if(PK.state!=='idle')return;
  const r=pkBody.getBoundingClientRect();
  // anywhere in the top third counts: the strip itself is thin on phones
  if(e.clientY>r.top+r.width*.32){if(!TR.p)pk.animate([{transform:'translateY(0)'},{transform:'translateY(-10px)'},{transform:'translateY(0)'}],{duration:300,easing:'ease-out'});return}
  Object.assign(TR,{on:true,x0:e.clientX,p0:TR.p,last:Math.floor(TR.p*28),id:e.pointerId});
  pk.setPointerCapture(e.pointerId);pk.classList.add('drag');if(!TR.p)pk.style.transform='';
});
pk.addEventListener('pointermove',e=>{
  if(!TR.on||e.pointerId!==TR.id)return;
  const dx=e.clientX-TR.x0;
  if(!TR.dir){if(Math.abs(dx)<6)return;TR.dir=Math.sign(dx)}
  if(PK.state!=='tearing'){if(dx*TR.dir<4)return;PK.state='tearing';pkHint('');tearLoop()}
  // a tear doesn't mend: pulling back only lowers the flap
  const q=Math.max(0,Math.min(1,TR.p0+dx*TR.dir/(TR.S.W*.92)));TR.p=Math.max(TR.p,q);
  const r=pkBody.getBoundingClientRect();tearAim((e.clientY-r.top)/r.width);TR.At-=Math.min(60,(TR.p-q)*300);
  tearStep();
  if(TR.p>=1)finishTear();
});
const tearUp=e=>{
  if(!TR.on||e.pointerId!==TR.id)return;
  TR.on=false;pk.classList.remove('drag');
  if(TR.p>.82)return finishTear();
  if(PK.state!=='tearing')return;
  // not all the way: the flap droops, and the next drag carries on from here
  PK.state='idle';PSND.snap();TR.At=24;TR.phit=7;tearLoop();
  pkHint(`<span class="pk-arr"${TR.dir<0?' style="scale:-1 1"':''}>⟶</span> Keep tearing`,HINT_Y);
};
pk.addEventListener('pointerup',tearUp);pk.addEventListener('pointercancel',tearUp);
// keyboard (and anyone who'd rather not drag): the strip tears itself
function autoTear(){
  PK.state='tearing';if(!TR.dir)TR.dir=1;pkHint('');TR.phit=18;
  const p0=TR.p,t0=performance.now(),ms=150+550*(1-p0);tearLoop();
  const f=now=>{if(PK.state!=='tearing')return;const k=Math.min(1,(now-t0)/ms);TR.p=p0+(1-p0)*k*k*(3-2*k);tearAim();tearStep();
    k<1?requestAnimationFrame(f):finishTear()};
  requestAnimationFrame(f);
}
addEventListener('resize',()=>{if(stg.classList.contains('on')&&PK.state==='idle'&&!TR.p)buildStrip()});
function finishTear(){
  // already torn, or closed while the strip was still tearing itself
  if(PK.state!=='idle'&&PK.state!=='tearing')return;
  PK.state='torn';TR.on=false;pkCommit();TR.p=1;TR.At=Math.max(TR.At,110);tearLoop();
  const d=TR.dir||1,best=CARDS[PK.ids[PK.ids.length-1]].rar,col=rarCol(best),{W,H}=TR.S;
  PSND.rip();buzz([20,30,40]);
  // the strip comes away in your hand
  strip.style.transformOrigin=`${d>0?W:0}px ${H}px`;
  strip.style.transition='transform .8s cubic-bezier(.2,.7,.3,1),opacity .45s .3s';
  strip.style.transform=`translate3d(${d*W*.5}px,${-W*.75}px,${W*.25}px) rotate(${-d*22}deg)`;strip.style.opacity=0;
  const r=pkBody.getBoundingClientRect(),sy=r.top+4;
  for(let i=0;i<10;i++)spark(r.left+r.width*i/9,sy,best===5?rainbow:col,best>=4?8:4,best>=4?6:4,best>=4?70:45,.08);
  leak.style.transition='opacity .3s';leak.style.left=leak.style.right='';leak.style.opacity=1;lipw.style.clipPath='none';seam.style.opacity=0;
  pk.style.transform='';pk.classList.add('shake');
  setTimeout(()=>{
    pk.classList.remove('shake');
    // the pack drops away and the cards rise out of it
    pk.style.transition='transform .7s cubic-bezier(.5,0,.75,0),opacity .5s .2s';pk.style.transform='translateY(75vh) rotate(4deg)';pk.style.opacity=0;
    dealCards();
  },380);
}

/* ---------- the cards ---------- */
function dealCards(){
  PK.state='deal';
  $('#pkDeck').innerHTML=PK.ids.map((id,i)=>{const c=CARDS[id];
    return `<div class="pk-slot" data-i="${i}" style="--rc:${RC[c.rar-1]};--rt:var(--r${c.rar}t);z-index:${50-i};transform:translate(-50%,10vh) scale(.6);opacity:0">
    <div class="pk-flip" style="--g:${rarCol(c.rar)}"><div class="pk-face pk-back"></div><div class="pk-face pk-front">${cardHTML(id,'blue')}</div></div>
    ${PK.fresh[i]?'<span class="pk-new">NEW</span>':''}<div class="pk-rname"><b>${esc(c.name)}</b><small class="rt rar${c.rar}">${rarName(c.rar)}</small></div></div>`}).join('');
  const slots=$$('#pkDeck .pk-slot');
  slots.forEach((s,i)=>{bindSlot(s);setTimeout(()=>{s.style.opacity=1;s.style.transform=`translate(-50%,-50%) translate(${-i*3}px,${-i*4}px)`},120+i*90)});
  setTimeout(()=>{
    PK.state='cards';stack();$('#pkCount').style.opacity=1;
    $('#pkFoot').innerHTML='<button class="btn" id="pkSkip">Reveal all</button>';$('#pkSkip').onclick=()=>{sfx('click');summary()};
    pkHint('Tap to reveal · swipe for the next card','calc(50% + min(5vh,8.4vw)*5.6)');
    stg.focus({preventScroll:true});
  },300+PK.ids.length*90);
}
// the top card sits square; the rest peek out behind it
function stack(){
  $$('#pkDeck .pk-slot').forEach((s,i)=>{
    if(i<PK.i)return;const k=i-PK.i;s.style.zIndex=50-k;
    s.style.transform=`translate(-50%,-50%) translate(${k*4}px,${-k*5}px) rotate(${k?(k%2?1.2:-1.2)*k:0}deg) scale(${1-k*.03})`;
  });
  $('#pkCount').textContent=`${Math.min(PK.i+1,PK.ids.length)} / ${PK.ids.length}`;
}
function bindSlot(s){
  const i=+s.dataset.i;let drag=null;
  s.addEventListener('pointerdown',e=>{if(PK.state!=='cards'||i!==PK.i||s.busy)return;drag={x:e.clientX,y:e.clientY,dx:0};s.setPointerCapture(e.pointerId);s.style.transition='none'});
  s.addEventListener('pointermove',e=>{
    if(!drag||!s.revealed)return;drag.dx=e.clientX-drag.x;
    s.style.transform=`translate(-50%,-50%) translate(${drag.dx}px,${(e.clientY-drag.y)*.3}px) rotate(${drag.dx/18}deg)`;
    const c=s.querySelector('.card');if(c)c.style.setProperty('--hx',(50-drag.dx/3)+'%');
  });
  const up=e=>{
    if(!drag)return;const dx=drag.dx;drag=null;s.style.transition='';
    if(!s.revealed)return reveal(s);
    if(Math.abs(dx)>70||Math.abs(dx)<10)fling(s,Math.sign(dx)||1);else stack();
  };
  s.addEventListener('pointerup',up);s.addEventListener('pointercancel',up);
}
function reveal(s){
  const i=+s.dataset.i,c=CARDS[PK.ids[i]],f=s.querySelector('.pk-flip');s.busy=true;
  // the build-up: rarer cards glow in their colour and shake longer before they flip
  const td=RM.matches?Math.min(400,[0,250,550,1150,1900][c.rar-1]):[0,250,550,1150,1900][c.rar-1];
  const go=()=>{
    f.classList.remove('tease');f.classList.add('open');PSND.flip();
    setTimeout(()=>{
      s.revealed=true;s.busy=false;s.classList.add('shown');PSND.reveal(c.rar);buzz(c.rar>=4?[30,40,60]:10);
      const r=s.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
      if(c.rar>=3)spark(x,y,c.rar===5?rainbow:RC[c.rar-1],c.rar===5?90:c.rar===4?50:18,c.rar>=4?9:5,c.rar>=4?80:50,.1);
      if(c.rar===5)for(let k=1;k<5;k++)setTimeout(()=>spark(x,y,rainbow,30,7,70,.1),k*160);
      $('#pkStage .pk-live').textContent=`${c.name}, ${rarName(c.rar)}${PK.fresh[i]?', new':''}`;
      setTimeout(()=>{stg.classList.remove('focus');$('#pkRays').className='pk-rays'},c.rar>=4?1400:0);
    },280);
  };
  if(!td)return go();
  f.style.setProperty('--td',td+'ms');f.classList.add('tease');
  if(c.rar>=4){stg.classList.add('focus');const R=$('#pkRays');R.style.setProperty('--ray',RC[c.rar-1]);R.className='pk-rays'+(c.rar===5?' r5':'');PSND.build(c.rar)}
  setTimeout(go,td);
}
function fling(s,d){
  s.style.transition='transform .45s cubic-bezier(.3,.6,.4,1),opacity .4s';
  s.style.transform=`translate(-50%,-50%) translate(${d*innerWidth*.7}px,-40px) rotate(${d*30}deg)`;s.style.opacity=0;PSND.fling();
  PK.i++;pkHint('');
  if(PK.i>=PK.ids.length)setTimeout(summary,300);else stack();
}
function summary(){
  if(PK.state==='sum')return;
  PK.state='sum';stg.classList.remove('focus');$('#pkRays').className='pk-rays';
  pkHint('');$('#pkCount').style.opacity=0;$('#pkDeck').innerHTML='';
  const n=PK.fresh.filter(Boolean).length;
  $('#pkSum').innerHTML=`<h3>${PACKS[PK.src.t].name} pack</h3><div class="pk-row">${PK.ids.map((id,i)=>
    `<div class="pk-it" style="animation-delay:${i*80}ms">${PK.fresh[i]?'<em>NEW</em>':'<em class="dup">+1 copy</em>'}${cardHTML(id,'blue')}</div>`).join('')}</div>
    <p>${plural(PK.ids.length,'card')} added to your collection${n?` · <b>${n} new</b>`:''}</p>`;
  $('#pkSum').className='pk-sum on';
  const next=nextPack();
  $('#pkFoot').innerHTML=(next!=null?'<button class="btn" id="pkNext">Open next</button>':'')+'<button class="btn primary" id="pkDone">Done</button>';
  if(next!=null)$('#pkNext').onclick=()=>{sfx('click');openPack(nextPack())};
  $('#pkDone').onclick=()=>{sfx('click');pkClose()};
  $('#pkDone').focus({preventScroll:true});
  PSND.whoosh();
}

/* ---------- the Packs screen and the menu tile ---------- */
// the 5★ guarantee as a bar: on the Packs screen and under the Store's Pack Counter
function pityHTML(){
  const n=Math.min(PITY,SAVE.pity);
  return `<div class="pity-h"><span>5★ guarantee</span><b>${n} / ${PITY}</b></div>
    <div class="pity-bar" role="progressbar" aria-label="5 star guarantee points" aria-valuemin="0" aria-valuemax="${PITY}" aria-valuenow="${n}"><i style="width:${(n/PITY*100).toFixed(1)}%"></i></div>
    <p class="pity-note">Every pack you open adds points (${pityPts()}). The pack that reaches ${PITY} ends with a 5★, and any 5★ starts it over.</p>`;
}
const miniPack=(t,cls='')=>`<span class="pk-mini t-${t} ${cls}" aria-hidden="true"></span>`;
function openPacks(){renderPacks();show('packs');$('#scr-packs').scrollTop=0}
function renderPacks(){
  const d=dailyState(),lv=levelOf(SAVE.xp);
  const daily=`<section class="pk-card pk-daily t-${d.ready?d.t:'spark'}">
    ${miniPack(d.ready?d.t:'spark','big'+(d.ready?' ready':' spent'))}
    <div class="pk-dtext"><h3>Daily pack</h3>
      <p>${d.wait?'Checking the time with the server…':d.ready?(d.day===7?'Day 7: today it\'s an <b>Arcane</b> pack.':'A free Spark pack, every day.'):`Opened today. The next one is ready in <b id="pkWait">${untilMidnight()}</b>.`}</p>
      <div class="pk-streak" aria-label="Daily streak: day ${d.day} of 7">${[1,2,3,4,5,6,7].map(k=>
        `<i class="${k<d.day||(!d.ready&&k===d.day)?'on':''}${d.ready&&k===d.day?' today':''}${k===7?' gift':''}">${k}</i>`).join('')}</div>
      <small>Open one every day in a row. Day 7 is an Arcane pack.</small>
      ${d.ready?'<button class="btn primary" id="pkDaily">Open daily pack</button>':''}</div></section>`;

  // unopened packs, grouped: milestones are kept apart since they promise a 4★
  const groups=[];
  SAVE.packs.forEach((p,i)=>{const k=p.t+(p.mile?'*':'');let g=groups.find(x=>x.k===k);if(!g)groups.push(g={k,t:p.t,mile:!!p.mile,first:i,n:0});g.n++});
  const order=Object.keys(PACKS);groups.sort((a,b)=>order.indexOf(b.t)-order.indexOf(a.t)||b.mile-a.mile);
  const next=lvlXp(lv+1)-SAVE.xp;
  const inv=`<section class="pk-card"><h3>Your packs <em>${SAVE.packs.length||''}</em></h3>${groups.length
    ?`<div class="pk-inv">${groups.map(g=>`<button class="pk-ib" data-i="${g.first}" aria-label="Open a ${PACKS[g.t].name} pack${g.mile?' (milestone)':''}. ${g.n} to open.">
        ${miniPack(g.t,'ready')}${g.n>1?`<span class="pk-n">×${g.n}</span>`:''}<b>${PACKS[g.t].name}</b><small>${PACKS[g.t].n} cards${g.mile?' · 4★ inside':''}</small></button>`).join('')}</div>`
    :`<p class="pk-empty">No packs to open. Level up for the next one: you're <b>${next} XP</b> from level ${lv+1}.</p>`}</section>`;

  // the level road: every level's pack, opened, waiting or still to earn
  const top=Math.max(20,lv+6);let road='';
  for(let l=2;l<=top;l++){
    const t=packForLevel(l),wait=SAVE.packs.findIndex(p=>p.lv===l),st=l>SAVE.packLv?'lock':wait>=0?'ready':'done',mile=l%5===0;
    road+=`<button class="pk-node ${st}${mile?' mile':''}${l===lv?' cur':''}" ${st==='ready'?`data-i="${wait}"`:'tabindex="-1" disabled'}
      aria-label="Level ${l}: ${PACKS[t].name} pack${mile?', milestone':''}${st==='done'?', opened':st==='ready'?', ready to open':''}">
      ${miniPack(t)}${st==='done'?'<span class="pk-ok" aria-hidden="true">✓</span>':''}<span class="pk-lv">Lv ${l}</span><span class="pk-star">${mile?'4★ inside':''}</span></button>`;
  }
  const roadHTML=`<section class="pk-card"><h3>Level road <em>Level ${lv} · ${next} XP to go</em></h3><div class="pk-road" id="pkRoad">${road}</div>
    <div class="pk-legend">${PACK_LEVELS.map(([t,l])=>`<span>${miniPack(t,'tiny')}${PACKS[t].name} · ${l}</span>`).join('')}</div></section>`;

  const odds=`<details class="pk-card pk-odds"><summary>What's inside</summary><div class="pk-tbl"><table>
    <tr><th>Pack</th><th>Cards</th>${[1,2,3,4,5].map(r=>`<th class="rar${r}"><span class="rt">${r}★</span></th>`).join('')}<th>Last card</th></tr>
    ${Object.entries(PACKS).map(([k,T])=>`<tr><td>${miniPack(k,'tiny')}${T.name}</td><td>${T.n}</td>${T.odds.map(o=>`<td>${o?o+'%':'—'}</td>`).join('')}<td>${T.min}★ or better</td></tr>`).join('')}
    </table></div><ul>
      <li>Chances are for each card. Cards come out worst to best, so the best one is always last.</li>
      <li>The level road repeats every 10 levels: a Leyline at levels ending in 5, a Mythic at levels ending in 0 (from level 20; level 10 is a Leyline), and 4 small packs between them (Spark, or Arcane from level 21). The Leyline and Mythic levels are milestones: their last card is at least 4★.</li>
      <li>Light leaks out of the tear in the colour of the best card inside.</li>
      <li>Duplicates are extra copies: use them in decks or lose them in trades.</li></ul></details>`;

  const pity=`<section class="pk-card pk-pity">${pityHTML()}</section>`;
  $('#pkBody').innerHTML=daily+inv+pity+roadHTML+odds;
  const b=$('#pkDaily');if(b)b.onclick=()=>{sfx('click');openPack('daily')};
  $$('#pkBody [data-i]').forEach(x=>x.onclick=()=>{sfx('click');openPack(+x.dataset.i)});
  const cur=$('#pkRoad .cur'),road2=$('#pkRoad');if(cur)road2.scrollLeft=cur.offsetLeft-road2.clientWidth/2+cur.offsetWidth/2;
}
function renderPackTile(){
  const d=dailyState(),n=SAVE.packs.length,all=n+(d.ready?1:0);
  $('#packSub').textContent=[d.ready?'Daily ready':'',n?`${n} to open`:''].filter(Boolean).join(' · ')||(d.wait?'Daily pack: connecting…':`Next daily in ${untilMidnight()}`);
  const dot=$('#packDot');dot.textContent=all;dot.hidden=!all;
  $('#packTile').classList.toggle('hot',!!all);
  $('#packTile').setAttribute('aria-label',`Packs. ${$('#packSub').textContent}`);
}
// the countdown, and the daily pack coming back at midnight
setInterval(()=>{
  if($('#scr-menu').classList.contains('on'))renderPackTile();
  const w=$('#pkWait');
  if(w&&$('#scr-packs').classList.contains('on')){if(dailyState().ready)renderPacks();else w.textContent=untilMidnight()}
},30000);
addEventListener('resize',()=>{if(stg.classList.contains('on'))fxFit()});

/* ---------- gifts: packs a developer gave you from your profile (server/routes/gifts.js) ---------- */
// SAVE.gifts: ids of the gifts already added, so none is added twice. The server keeps a gift until
// a synced save has it: if the account's copy replaces this device's progress first, it's added again.
// They arrive quietly: no message, the pack is just there with the others.
// wait: there may be gifts to fetch or clear (set by the pulse, signing in, and adding some)
const GIFTS={busy:false,wait:true};
async function giftsCheck(){
  if(GIFTS.busy||!ACCT.token||API==null||ACCT.conflict)return;
  GIFTS.busy=true;
  let list;
  try{list=(await api('/gifts')).gifts}catch(e){return}finally{GIFTS.busy=false}
  if(!ACCT.token||ACCT.conflict||!Array.isArray(list))return;
  list=list.filter(g=>g&&Number.isInteger(g.id)&&PACKS[g.pack]);
  const fresh=list.filter(g=>!SAVE.gifts.includes(g.id));
  // already in the account's copy (nothing left to sync): the server can let them go
  const done=ACCT.dirty?[]:list.filter(g=>SAVE.gifts.includes(g.id)).map(g=>g.id);
  if(done.length)api('/gifts/ack',{method:'POST',body:{ids:done}}).catch(()=>{});
  GIFTS.wait=fresh.length>0||done.length<list.length;
  if(!fresh.length)return;
  fresh.forEach(g=>SAVE.packs.push({t:g.pack,src:'gift'}));
  SAVE.gifts=[...SAVE.gifts,...fresh.map(g=>g.id)].slice(-100);save();
  if($('#scr-menu').classList.contains('on'))renderPackTile();
  if($('#scr-packs').classList.contains('on'))renderPacks();
}
setInterval(()=>GIFTS.wait&&giftsCheck(),20000);
