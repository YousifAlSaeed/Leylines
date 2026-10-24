'use strict';
/* =====================================================================
   LIQUID GLASS (glass.css): a developer's look, switched on in Settings
   (settings.js applyTheme sets :root.liquid; save.js liquidOn). Here: the
   lens under the picked tab and switch option, which slides there and
   stretches on the way like a drop of water; pressing and
   sliding along the tab bar; the glass brightening under the mouse; and,
   in Chrome and Edge, glass edges that bend what's behind them (.lq-bend).
   ===================================================================== */
(()=>{
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const root=document.documentElement;
const live=()=>root.classList.contains('liquid');
const still=matchMedia('(prefers-reduced-motion: reduce)');

// ---------- the lens ----------
const lensOf=el=>{
  let l=el.querySelector(':scope>.lq-lens');
  if(!l){l=document.createElement('i');l.className='lq-lens';l.setAttribute('aria-hidden','true');el.prepend(l)}
  return l;
};
// where a button sits in its bar (offsets aren't changed by the big screens' zoom, so no sums are needed)
const spot=b=>({x:b.offsetLeft,y:b.offsetTop,w:b.offsetWidth,h:b.offsetHeight});
const same=(a,b)=>a&&b&&Math.abs(a.x-b.x)<.5&&Math.abs(a.y-b.y)<.5&&Math.abs(a.w-b.w)<.5&&Math.abs(a.h-b.h)<.5;
// the lens stands on `to` straight away, and stops sliding
function put(l,to){
  if(l._slide){l._slide.cancel();l._slide=null}
  l._to=to;l.style.left=to.x+'px';l.style.top=to.y+'px';l.style.width=to.w+'px';l.style.height=to.h+'px';
}
// where the lens is right now, partway through a slide too: its translate and scale say how far it still has to go
function now(l){
  const t=l._to;if(!t||!l._slide)return t;
  const cs=getComputedStyle(l),tr=cs.translate.split(' ').map(parseFloat),sc=cs.scale.split(' ').map(parseFloat);
  const sx=isNaN(sc[0])?1:sc[0],sy=isNaN(sc[1])?sx:sc[1],w=t.w*sx,h=t.h*sy;
  return {x:t.x+t.w/2+(tr[0]||0)-w/2,y:t.y+t.h/2+(tr[1]||0)-h/2,w,h};
}
// the slide's spring, the one glass.css has (--lq-slide); read when it's first needed, while the glass is on
let spring='';
// put the lens l on `to`, sliding there from `from` (or from where it is, if it's sliding already). It stretches on the
// way, more the further it goes, and gathers up as it lands. Only its translate and scale move, which the browser plays
// apart from the page's own work, so the slide stays smooth while a tab's page is being drawn
function place(l,to,from){
  if(l._slide&&same(l._to,to))return;
  const at=l._slide?now(l):from;put(l,to);
  if(!at||same(at,to)||still.matches||!l.animate)return;
  const dx=at.x+at.w/2-to.x-to.w/2,dy=at.y+at.h/2-to.y-to.h/2,down=Math.abs(dy)>Math.abs(dx);
  const k=Math.min(.45,.2*Math.abs(down?dy/to.h:dx/to.w)),mid=down?`${1-k/4} ${1+k}`:`${1+k} ${1-k/4}`;
  const keys=[{translate:`${dx}px ${dy}px`,scale:`${at.w/to.w} ${at.h/to.h}`},{translate:`${dx*.45}px ${dy*.45}px`,scale:mid,offset:.35},{translate:'0px 0px',scale:'1 1'}];
  if(!spring)spring=getComputedStyle(root).getPropertyValue('--lq-slide').trim()||'ease-out';
  let a;
  try{a=l.animate(keys,{duration:560,easing:spring})}catch(_){spring='cubic-bezier(.3,1.25,.5,1)';a=l.animate(keys,{duration:560,easing:spring})}
  l._slide=a;a.onfinish=a.oncancel=()=>{if(l._slide===a)l._slide=null};
}

// the switches, on every screen and in the pop-ups (the Play card's modes and difficulty, Settings, the sign-in sheet,
// a room's mode): the lens follows the picked option. Some are drawn again on every tap (menu.js) or when the server
// says so (duo.js), so a new lens starts where the old one was and slides from there. Only switches with an id: that's
// how the lens remembers where it was. One out of sight forgets, so it doesn't slide in from long ago
const segAt=new Map();
// our own changes (a lens put in or taken out, a switch's lq-has-lens) aren't news
const ours=m=>m.type==='attributes'?m.target.classList.contains('seg')||m.target.classList.contains('lq-lens')
  :[...m.addedNodes,...m.removedNodes].every(n=>n.classList&&n.classList.contains('lq-lens'));
// everything that can move a lens asks for one look in the next frame
let segQ=0;
const segSoon=()=>{if(!segQ&&live())segQ=requestAnimationFrame(()=>{segQ=0;segs()})};
// a switch with a lens is watched: an option lit, or its buttons drawn again, moves the lens
const segMO=new MutationObserver(ms=>{if(!ms.every(ours))segSoon()});
function segs(){
  // every switch is measured first and only then moved, so the page is laid out once, not once a switch
  const on=live(),keep=new Map(),drop=[];
  $$('.seg[id]').forEach(s=>{const b=on&&s.offsetWidth&&s.querySelector('button.on');if(b)keep.set(s,spot(b));else drop.push(s)});
  drop.forEach(s=>{const l=s.querySelector(':scope>.lq-lens');if(l)l.remove();if(s.classList.contains('lq-has-lens'))s.classList.remove('lq-has-lens')});
  keep.forEach((to,s)=>{
    place(lensOf(s),to,segAt.get(s.id));segAt.set(s.id,to);s.classList.add('lq-has-lens');
    segMO.observe(s,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  });
  // a switch out of sight, or gone with its pop-up, forgets where its lens was
  const ids=new Set([...keep.keys()].map(s=>s.id));
  segAt.forEach((_,id)=>{if(!ids.has(id))segAt.delete(id)});
  if(!on)segMO.disconnect();
}

// ---------- the tab bar ----------
const tabs=$('#hubTabs');
let tabAt=null,drag=null,dropT=0;
function tabSync(){
  if(!tabs||drag)return;
  const b=tabs.querySelector('button.on:not([hidden])'),l=lensOf(tabs);
  if(!live()||!b||!tabs.offsetWidth){l.style.opacity=0;tabAt=null;return}
  l.style.opacity='';
  const to=spot(b);place(l,to,tabAt);tabAt=to;
}
// press anywhere on the bar: the lens lifts off it and grows, and follows your finger; let go over a tab to open it
const side=()=>tabs.offsetHeight>tabs.offsetWidth; // a phone held sideways: the bar is a rail down the left
function tabNear(p){
  let best=null;
  tabs.querySelectorAll('button:not([hidden])').forEach(b=>{const c=side()?b.offsetTop+b.offsetHeight/2:b.offsetLeft+b.offsetWidth/2,d=Math.abs(c-p);if(!best||d<best.d)best={b,d}});
  return best&&best.b;
}
const under=u=>tabs.querySelectorAll('button').forEach(x=>x.classList.toggle('lq-under',x===u));
function follow(e){
  const r=tabs.getBoundingClientRect(),b=drag.b0,v=side()?b.offsetHeight:b.offsetWidth;
  const first=tabs.querySelector('button:not([hidden])'),last=[...tabs.querySelectorAll('button:not([hidden])')].pop();
  const min=side()?first.offsetTop:first.offsetLeft,max=side()?last.offsetTop:last.offsetLeft;
  const p=Math.max(min,Math.min(max,(side()?e.clientY-r.top:e.clientX-r.left)-v/2));
  drag.at=side()?{x:b.offsetLeft,y:p,w:b.offsetWidth,h:b.offsetHeight}:{x:p,y:b.offsetTop,w:b.offsetWidth,h:b.offsetHeight};
  put(lensOf(tabs),drag.at);
  drag.u=tabNear(p+v/2);under(drag.u);
}
if(tabs){
  // a tap is left to the browser, which clicks the tab (a keyboard too). Once the finger slides, the bar takes the
  // pointer and opens the tab it's let go over, itself; let go well away from the bar and nothing opens
  tabs.addEventListener('pointerdown',e=>{
    const b=e.target.closest('button');
    if(!live()||!b||e.button>0||!e.isPrimary)return;
    clearTimeout(dropT);
    const l=lensOf(tabs);l.style.opacity='';
    drag={id:e.pointerId,b0:b,x:e.clientX,y:e.clientY,moved:false,at:spot(b),u:b};
    // a tap slides the lens to the tab and lifts it there; holding still keeps it up
    place(l,spot(b),tabAt);tabAt=spot(b);
    tabs.classList.add('lq-drag');under(b);
  });
  tabs.addEventListener('pointermove',e=>{
    if(!drag||e.pointerId!==drag.id)return;
    if(!drag.moved){
      if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<6)return;
      drag.moved=true;try{tabs.setPointerCapture(e.pointerId)}catch(_){}
    }
    follow(e);
  });
  const eat=ev=>{ev.stopPropagation();ev.preventDefault()};
  const up=e=>{
    if(!drag||e.pointerId!==drag.id)return;
    const d=drag;drag=null;
    const r=tabs.getBoundingClientRect(),m=24;
    const off=e.clientX<r.left-m||e.clientX>r.right+m||e.clientY<r.top-m||e.clientY>r.bottom+m;
    const cancel=e.type!=='pointerup'||off;
    const b=cancel?tabs.querySelector('button.on:not([hidden])'):d.u||d.b0;
    if(b){const to=spot(b);place(lensOf(tabs),to,d.at);tabAt=to}
    // the lens stays up a moment after a quick tap, then settles into the bar, back on the lit tab if the tab didn't open
    dropT=setTimeout(()=>{tabs.classList.remove('lq-drag');under(null);tabSync()},d.moved?0:160);
    // after a slide the bar clicks the tab itself, and swallows the click the browser may still send for the gesture
    // (it comes at once, before any new press: the next press, or a moment, ends the swallowing)
    if(d.moved&&!cancel&&b){
      b.click();
      const unEat=()=>{removeEventListener('click',eat,true);removeEventListener('pointerdown',unEat,true)};
      addEventListener('click',eat,{capture:true,once:true});addEventListener('pointerdown',unEat,{capture:true,once:true});setTimeout(unEat,350);
    }
  };
  // heard on the whole page: a mouse can leave the bar before it slid far enough for the bar to take it
  addEventListener('pointerup',up);addEventListener('pointercancel',up);
  // the bar lost the pointer some other way (a window opened over it): put the lens back
  tabs.addEventListener('lostpointercapture',e=>{if(drag&&e.pointerId===drag.id&&e.target===tabs)up({type:'lost',pointerId:e.pointerId,clientX:0,clientY:0})});
  // the game lights a tab (menu.js tabsSync) or hides Friends with no server; the bar comes back with body[data-tab]
  const mt=new MutationObserver(()=>requestAnimationFrame(tabSync));
  mt.observe(tabs,{subtree:true,attributes:true,attributeFilter:['class','hidden']});
  mt.observe(document.body,{attributes:true,attributeFilter:['data-tab']});
}

// ---------- the light on the glass ----------
// The light stays where it is (glass.css): the glass only brightens a little under the mouse, and a box lifts
const GLASS='#scr-menu .hero,#scr-menu .hw,#scr-menu .hub-ib,#scr-menu .pcard,.hub-tabs';
const glassAt=t=>t&&t.closest&&t.closest(GLASS);
let lit=null;
function hover(el){if(lit===el)return;if(lit)lit.classList.remove('lq-lit');lit=el;if(el)el.classList.add('lq-lit')}
document.addEventListener('pointerover',e=>{if(e.pointerType==='mouse')hover(live()?glassAt(e.target):null)},{passive:true});
root.addEventListener('mouseleave',()=>hover(null),{passive:true});
let touched=null,pressed=null;
document.addEventListener('pointerdown',e=>{
  if(!live()||!e.isPrimary)return;
  release();
  // (not the tab bar: its lens lifting is how it answers, and the brightening would repaint the bar while a page opens)
  touched=glassAt(e.target);if(touched===tabs)touched=null;if(touched)touched.classList.add('lq-touch');
  // a box sinks when you press the part that opens its place (all of it but its own buttons; only the Daily's title);
  // a button or the profile chip swells
  const box=e.target.closest('#scr-menu .hw'),ctl=e.target.closest('button,a,input,select,textarea,[tabindex]');
  pressed=box&&(ctl?ctl.matches('.hw>.tile'):!box.matches('.hw-daily'))?box
    :e.target.closest('#scr-menu .hub-ib,#scr-menu .pcard,#scr-menu .btn:not(:disabled),#scr-menu .dly');
  if(pressed)pressed.classList.add('lq-press');
},{passive:true});
const release=e=>{
  if(e&&e.isPrimary===false)return;
  if(touched)touched.classList.remove('lq-touch');if(pressed)pressed.classList.remove('lq-press');touched=pressed=null;
};
document.addEventListener('pointerup',release,{passive:true});document.addEventListener('pointercancel',release,{passive:true});

// ---------- bending edges (Chrome and Edge) ----------
// Only Chromium draws an SVG filter behind an element (backdrop-filter:url()). Safari and Firefox accept the line and
// then drop the whole filter, blur too, so it's never in the CSS: each piece of glass gets its own filter here, in
// --lq-f, which glass.css uses only under .lq-bend. The filter's map says how far each pixel is pushed: nothing in the
// middle, more and more towards the rim, pointing inwards, like the curved edge of a thick lens
const BEND=!!(navigator.userAgentData&&navigator.userAgentData.brands&&navigator.userAgentData.brands.some(b=>b.brand==='Chromium'))&&(navigator.deviceMemory||8)>=4;
// what each piece gets: blur (px), how wide the curved rim is, how far it pushes, and how much the colours split there
const KIND=[
  ['.hub-tabs',{blur:4,bezel:22,px:13,ab:.07}],
  ['#scr-menu .hub-ib',{blur:2,bezel:14,px:8,ab:.08}],
  ['#scr-menu .pcard',{blur:3,bezel:16,px:9,ab:.06}],
  ['#scr-menu .hero',{blur:4,bezel:26,px:16,ab:0}],
  ['#scr-menu .hw',{blur:4,bezel:22,px:13,ab:0}],
];
const NS='http://www.w3.org/2000/svg';
let defs=null;
// how far a pixel is pushed, against how deep it is into the rim (0 at the outside edge, 1 where the flat middle starts):
// light bending through a squircle-shaped edge (glass bends it by 1.5), as worked out by kube.io
const N=128,PROF=(()=>{
  const H=t=>Math.pow(1-Math.pow(1-t,4),.25),n=1.5,depth=.6,base=.35,e=1e-3,p=new Float32Array(N+1);let max=0;
  for(let i=0;i<=N;i++){
    const t=Math.min(Math.max(i/N,e),1-e),a=Math.atan(depth*(H(Math.min(t+e,1))-H(t-e))/(2*e));
    p[i]=Math.tan(a-Math.asin(Math.sin(a)/n))*(base+depth*H(t));max=Math.max(max,p[i]);
  }
  return p.map(v=>v/max);
})();
const maps=new Map();
function mapURL(w,h,r,bez){
  const k=`${w}x${h}x${r}x${bez}`;if(maps.has(k))return maps.get(k);
  const c=document.createElement('canvas');c.width=w;c.height=h;
  const x2=c.getContext('2d'),img=x2.createImageData(w,h),d=img.data,hw=w/2,hh=h/2;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const px=x+.5-hw,py=y+.5-hh,qx=Math.abs(px)-(hw-r),qy=Math.abs(py)-(hh-r);
    let nx,ny,sd;
    if(qx>0&&qy>0){const L=Math.hypot(qx,qy);sd=L-r;nx=qx/L;ny=qy/L}else if(qx>qy){sd=qx-r;nx=1;ny=0}else{sd=qy-r;nx=0;ny=1}
    nx*=Math.sign(px)||1;ny*=Math.sign(py)||1;
    const dist=-sd,m=dist>0&&dist<bez?PROF[Math.round(dist/bez*N)]:0,i=(y*w+x)*4;
    d[i]=Math.round(128-nx*m*127);d[i+1]=Math.round(128-ny*m*127);d[i+2]=128;d[i+3]=255;
  }
  x2.putImageData(img,0,0);
  const url=c.toDataURL();if(maps.size>40)maps.delete(maps.keys().next().value);maps.set(k,url);return url;
}
let uid=0;
function build(el){
  const o=el._lq,w=el.offsetWidth,h=el.offsetHeight;
  if(!w||!h||(w===o.w&&h===o.h))return;o.w=w;o.h=h;
  const r=Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius)||0,w/2,h/2);
  const bez=Math.max(1,Math.min(o.bezel,w/2,h/2)),s=2*o.px;
  const dm=(k,res)=>`<feDisplacementMap in="SourceGraphic" in2="map" scale="${k}" xChannelSelector="R" yChannelSelector="G" result="${res}"/>`;
  o.f.setAttribute('width',w);o.f.setAttribute('height',h);
  o.f.innerHTML=`<feImage href="${mapURL(w,h,Math.round(r),Math.round(bez))}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="map"/>`+
    (o.ab?dm(s,'dr')+dm(s*(1-o.ab),'dg')+dm(s*(1-2*o.ab),'db')+
      '<feColorMatrix in="dr" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="r"/>'+
      '<feColorMatrix in="dg" values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0" result="g"/>'+
      '<feColorMatrix in="db" values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0" result="b"/>'+
      '<feBlend in="r" in2="g" mode="screen" result="rg"/><feBlend in="rg" in2="b" mode="screen"/>':dm(s,'out'));
  // glass.css adds the theme's colour lift after it
  el.style.setProperty('--lq-f',`blur(${o.blur}px) url(#${o.id})`);
}
let ro=null;
function bendAll(){
  if(!BEND||!live())return;
  if(!defs){defs=document.createElementNS(NS,'svg');defs.setAttribute('aria-hidden','true');defs.style.cssText='position:absolute;width:0;height:0;overflow:hidden';document.body.append(defs)}
  if(!ro)ro=new ResizeObserver(es=>requestAnimationFrame(()=>es.forEach(e=>e.target._lq&&build(e.target))));
  KIND.forEach(([sel,opt])=>$$(sel).forEach(el=>{
    if(el._lq)return;
    const f=document.createElementNS(NS,'filter'),id='lqf'+ ++uid;
    for(const [k,v] of Object.entries({id,filterUnits:'userSpaceOnUse',primitiveUnits:'userSpaceOnUse',x:0,y:0,'color-interpolation-filters':'sRGB'}))f.setAttribute(k,v);
    defs.append(f);el._lq={id,f,...opt};build(el);ro.observe(el);
  }));
}

// ---------- keeping it all in place ----------
function sync(){segs();tabSync();bendAll()}
// a developer switches the glass on and off in Settings (settings.js applyTheme sets <html class="liquid">, save.js liquidOn)
let was=null;
function own(){
  const on=live();if(on===was)return;was=on;
  hover(null);requestAnimationFrame(sync);
}
root.classList.toggle('lq-bend',BEND);own();
new MutationObserver(own).observe(root,{attributes:true,attributeFilter:['class']});
const body=$('#heroBody'),mode=$('#modeSeg');
const mine=m=>[...m.addedNodes,...m.removedNodes].every(n=>n.classList&&n.classList.contains('lq-lens'));
const mo=new MutationObserver(ms=>{if(!ms.every(mine))segSoon()});
if(body)mo.observe(body,{childList:true});if(mode)mo.observe(mode,{childList:true});
// a switch coming into sight gets its lens: a pop-up drawn (helpers.js modal), a screen shown, or anything a tap opens
// or draws again (a match setting's row, a page). Only these, not the whole page, so a match's own changes cost nothing
const seen=new MutationObserver(segSoon),pop=$('#modal');
if(pop)seen.observe(pop,{childList:true});
$$('.screen').forEach(s=>seen.observe(s,{attributes:true,attributeFilter:['class']}));
document.addEventListener('click',segSoon,{passive:true});
addEventListener('resize',()=>{segAt.clear();tabAt=null;requestAnimationFrame(sync)});
if(document.fonts)document.fonts.ready.then(sync);
sync();
})();
