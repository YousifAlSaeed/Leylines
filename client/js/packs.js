'use strict';
/* =====================================================================
   PACKS  (level-up packs, the daily pack, and opening them)
   Opening: drag across the top strip to tear it, light leaks out in the
   best card's colour, then the cards come out worst to best. Tap one to
   flip it (rarer cards glow and shake longer first), swipe it away for
   the next. The cards are added to the collection before any of that,
   so closing early never loses them.
   ===================================================================== */
const RC=['#b08358','#cfd8e0','#f0c35c','#b98cff','#ff8fd0'];
const rarCol=r=>r===5?'#ffd76a':RC[r-1];
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
// src: an index into SAVE.packs, or 'daily'
function openPack(src){
  let p;
  if(src==='daily'){const d=dailyState();if(!d.ready)return;p={t:d.t,daily:d.day};SAVE.daily={at:today(),n:d.n}}
  else{p=SAVE.packs[src];if(!p)return;SAVE.packs.splice(src,1)}
  const ids=rollPack(p),fresh=[];
  // a second copy of a new card in the same pack isn't new
  ids.forEach(id=>{fresh.push(!SAVE.seen.includes(id));collAdd(id)});
  SAVE.pity=ids.some(id=>CARDS[id].rar===5)?0:Math.min(PITY,SAVE.pity+PITY_PTS[p.t]);
  profCheck();save();
  pkStart(p,ids,fresh);
}
// the next pack to open after this one: level packs first, then the daily
const nextPack=()=>SAVE.packs.length?0:dailyState().ready?'daily':null;

/* ---------- pack sound effects (generated locally; follows the SFX volume) ---------- */
let lastPackTick=0;
const PSND={
  tick:()=>{let n;do{n=1+Math.floor(Math.random()*5)}while(n===lastPackTick);lastPackTick=n;sfx(`pack_tick_0${n}`)},
  rip:()=>sfx('pack_rip'),
  snap:()=>sfx('pack_snapback'),
  whoosh:()=>sfx('pack_whoosh'),
  flip:()=>sfx('pack_flip'),
  build:r=>sfx(`pack_build_${r}`),
  reveal:r=>sfx(`pack_reveal_${r}`),
  fling:()=>sfx('pack_fling'),
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
const stg=$('#pkStage'),pk=$('#pkPack'),capA=$('#pkStage .pk-capA'),capB=$('#pkStage .pk-capB'),seam=$('#pkStage .pk-seam i'),leak=$('#pkStage .pk-leak');
FX.cv=$('#pkFx');FX.cx=FX.cv.getContext('2d');
function pkHint(html,top){const h=$('#pkHint');h.innerHTML=html;h.style.opacity=html?1:0;if(top)h.style.top=top}
function pkStart(p,ids,fresh){
  const T=PACKS[p.t],best=CARDS[ids[ids.length-1]].rar;
  Object.assign(PK,{src:p,ids,fresh,i:0,state:'idle'});
  if(!stg.classList.contains('on'))PK.ret=document.activeElement;
  stg.className='pk-stage on t-'+p.t;stg.style.setProperty('--leak',rarCol(best));
  $$('.screen').forEach(s=>s.inert=true);fxFit();
  $('#pkTitle').textContent=p.daily?`Daily pack · day ${p.daily}`:p.lv?`Level ${p.lv} pack`:T.name+' pack';
  $('#pkName').textContent=T.name;$('#pkSub').textContent=`${T.n} cards`+(p.mile?' · 4★ inside':'');
  pk.setAttribute('aria-label',`${T.name} pack, ${T.n} cards. Drag across the top to tear it open, or press Enter.`);
  $('#pkDeck').innerHTML='';$('#pkSum').className='pk-sum';$('#pkSum').innerHTML='';$('#pkCount').style.opacity=0;$('#pkFoot').innerHTML='';
  $('#pkRays').className='pk-rays';
  capA.style.cssText='';capB.style.cssText='';seam.style.cssText='';leak.style.cssText='';
  pk.style.transition='none';pk.style.transform='translateY(60px) scale(.85)';pk.style.opacity=0;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{pk.style.transition='transform .6s var(--spring),opacity .4s';pk.style.transform='';pk.style.opacity=1;PSND.whoosh()}));
  pkHint('<span class="pk-arr">⟶</span> Drag across the top to tear it open','calc(50% + min(36vh,62vw)*.78 + 18px)');
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
  if(PK.state!=='idle'||PK.tear.on||RM.matches)return;
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

/* ---------- tearing ---------- */
const TR=PK.tear;
pk.addEventListener('pointerdown',e=>{
  if(PK.state!=='idle')return;
  const r=pk.getBoundingClientRect();
  // anywhere in the top third counts: the strip itself is thin on phones
  if(e.clientY>r.top+r.height*.33){pk.animate([{transform:'translateY(0)'},{transform:'translateY(-10px)'},{transform:'translateY(0)'}],{duration:300,easing:'ease-out'});return}
  Object.assign(TR,{on:true,x0:e.clientX,dir:0,p:0,last:0,id:e.pointerId});
  pk.setPointerCapture(e.pointerId);pk.classList.add('drag');pk.style.transform='';
});
pk.addEventListener('pointermove',e=>{
  if(!TR.on||e.pointerId!==TR.id)return;
  const dx=e.clientX-TR.x0;
  if(!TR.dir){if(Math.abs(dx)<6)return;TR.dir=Math.sign(dx);PK.state='tearing';pkHint('')}
  TR.p=Math.max(0,Math.min(1,dx*TR.dir/(pk.offsetWidth*.92)));
  drawTear(TR.p);
  const step=Math.floor(TR.p*28);
  if(step>TR.last){TR.last=step;PSND.tick();buzz(4);
    const r=pk.getBoundingClientRect();
    spark(TR.dir>0?r.left+TR.p*r.width:r.right-TR.p*r.width,r.top+r.width*.17,stg.style.getPropertyValue('--leak'),4,2.4,30,.18)}
  if(TR.p>=1)finishTear();
});
const tearUp=e=>{
  if(!TR.on||e.pointerId!==TR.id)return;
  TR.on=false;pk.classList.remove('drag');
  if(TR.p>.7)return finishTear();
  // not far enough: the strip settles back
  if(TR.p>0){PSND.snap();tearTo(TR.p,0,260,()=>{PK.state='idle'})}else PK.state='idle';
};
pk.addEventListener('pointerup',tearUp);pk.addEventListener('pointercancel',tearUp);
function drawTear(p){
  const W=pk.offsetWidth,d=TR.dir||1,cut=p*100;
  if(d>0){capA.style.clipPath=`inset(0 ${100-cut}% 0 0)`;capA.style.transformOrigin=`${p*W}px 100%`;capB.style.clipPath=`inset(0 0 0 ${cut}%)`;seam.style.left=0;seam.style.right='auto'}
  else{capA.style.clipPath=`inset(0 0 0 ${100-cut}%)`;capA.style.transformOrigin=`${W-p*W}px 100%`;capB.style.clipPath=`inset(0 ${cut}% 0 0)`;seam.style.right=0;seam.style.left='auto'}
  // the torn part peels up around the point where it's still attached
  capA.style.transform=`rotate(${-Math.min(28,p*40)*d}deg) translateY(${-p*10}px)`;
  seam.style.width=cut+'%';seam.style.opacity=Math.min(1,p*3);leak.style.opacity=p*.9;
  pk.style.transform=`rotate(${d*p*-2}deg)`;
}
function tearTo(a,b,ms,done){
  const t0=performance.now();
  const f=now=>{const k=Math.min(1,(now-t0)/ms),e=1-Math.pow(1-k,3);drawTear(a+(b-a)*e);
    if(k<1)return requestAnimationFrame(f);
    if(!b){capA.style.cssText='';capB.style.cssText='';pk.style.transform=''}
    done&&done()};
  requestAnimationFrame(f);
}
// keyboard (and anyone who'd rather not drag): the strip tears itself
function autoTear(){PK.state='tearing';TR.dir=1;pkHint('');tearTo(0,1,520,finishTear)}
function finishTear(){
  if(PK.state==='torn'||PK.state==='cards'||PK.state==='sum')return;
  PK.state='torn';TR.on=false;
  const d=TR.dir||1,best=CARDS[PK.ids[PK.ids.length-1]].rar,col=rarCol(best);
  PSND.rip();buzz([20,30,40]);
  capB.style.opacity=0;
  capA.style.transition='transform .7s cubic-bezier(.2,.7,.3,1),opacity .7s';capA.style.clipPath='none';capA.style.transformOrigin='50% 100%';
  capA.style.transform=`translate(${d*260}px,-220px) rotate(${-d*50}deg)`;capA.style.opacity=0;
  const r=pk.getBoundingClientRect(),sy=r.top+r.width*.17;
  for(let i=0;i<10;i++)spark(r.left+r.width*i/9,sy,best===5?rainbow:col,best>=4?8:4,best>=4?6:4,best>=4?70:45,.08);
  leak.style.transition='opacity .3s';leak.style.opacity=1;seam.style.width='100%';
  pk.classList.add('shake');
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
    return `<div class="pk-slot" data-i="${i}" style="--rc:${RC[c.rar-1]};z-index:${50-i};transform:translate(-50%,10vh) scale(.6);opacity:0">
    <div class="pk-flip" style="--g:${rarCol(c.rar)}"><div class="pk-face pk-back"></div><div class="pk-face pk-front">${cardHTML(id,'blue')}</div></div>
    ${PK.fresh[i]?'<span class="pk-new">NEW</span>':''}<div class="pk-rname"><b>${esc(c.name)}</b><small>${rarName(c.rar)}</small></div></div>`}).join('');
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
