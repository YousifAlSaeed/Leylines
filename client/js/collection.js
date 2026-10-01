'use strict';
/* =====================================================================
   COLLECTION
   ===================================================================== */
// the hand you build in the collection; it stays put while you browse, and survives leaving the screen
const CH={pfx:'coll',sel:[],pool:[],color:'blue',loadouts:true,saving:false,note:'',deal:-1,render:()=>renderCollHand()};
function renderCollHand(){renderHand(CH);bdSyncAdd()}
wireHand('coll',()=>CH);
function openCollection(){
  const lost=SAVE.seen.filter(i=>!owned(i)).length;
  $('#collMeta').innerHTML=(SAVE.unlockAll?`All ${CARDS.length} cards unlocked`:`${SAVE.seen.length} of ${CARDS.length} discovered · ${collTotal()} cards owned`)+(lost?` · <span class="lostc">${lost} lost</span>`:'');
  // cards can be won or lost between visits: keep only the hand cards you still own enough copies of
  CH.pool=collPool();
  const keep=CH.sel;CH.sel=[];keep.forEach(id=>{if(handRemaining(CH,id)>0&&!rarBlock(CH.sel,id))CH.sel.push(id)});
  CH.saving=false;CH.note='';
  show('coll');$('#scr-coll').scrollTop=0;
  bdRender();renderCollHand(); // after show(), so the binder can measure the space it has
}
// card detail: the card lifts out of its sleeve on a binder page
function collDetail(id){
  const c=CARDS[id],n=owned(id);sfx('click');
  const lost=!n&&isSeen(id);
  if(!n&&!lost){toast(`${rarName(c.rar)} card — win it in a match to discover it.`);return}
  const r=handRemaining(CH,id),full=CH.sel.length>=5,capped=!!rarBlock(CH.sel,id);
  const box=modal(`<div class="cd-rings" aria-hidden="true"><i></i><i></i><i></i><i></i></div><div class="cd-sheet">
    <div class="cd-top"><span>No. ${id+1} / ${CARDS.length}</span><b class="rar${c.rar} rt">${rarName(c.rar)}</b></div>
    <div class="cd-pulled"><div class="cd-sleeve">${cardHTML(id,lost?'red':'blue',{cls:lost?'lost':''})}${lost?'<span class="cd-stamp">Lost</span>':''}</div></div>
    <h2 class="nm2 cd-name">${esc(c.name)}</h2>
    <div class="cd-sub">${c.e?ELEM[c.e]+' '+c.e[0].toUpperCase()+c.e.slice(1):'No element'} · Power ${c.sum}</div>
    <div class="cd-sides">${SIDE_NAMES.map((s,i)=>`<div><b>${fmt(c.s[i])}</b><span>${s}</span></div>`).join('')}</div>
    <div class="cd-own ${lost?'lost':''}"><b>×${n}</b>${lost?'None left in your binder':n>1?'copies in your binder':'copy in your binder'}</div>
    ${lost?'<p class="cd-msg">You lost every copy of this card. Win it back in a match with a trade rule.</p>':''}</div>`,
    lost?[{label:'Close',cls:'primary',esc:true}]
      :[{label:'Close',esc:true},{label:r<=0?'All copies in hand':full?'Hand is full':capped?'Over rarity limit':'Add to hand',cls:'primary',fn:()=>handAdd(CH,id)}]);
  box.classList.add('cd-box');
  // move the buttons onto the page (this drops focus, so set it again below)
  box.querySelector('.cd-sheet').append(box.querySelector('.mbtns'));
  const add=box.querySelector('.mbtns .btn.primary');
  if(!lost&&(r<=0||full||capped))add.disabled=true;
  (add.disabled?box.querySelector('.mbtns .btn'):add).focus({preventScroll:true});
}
// the + on each owned card: greyed out once every copy is in the hand, the hand is full, or the rarity limit is reached
const bdCanAdd=id=>CH.sel.length<5&&handRemaining(CH,id)>0&&!rarBlock(CH.sel,id);
function bdSyncAdd(){$$('#binder .pk-add').forEach(b=>{b.disabled=!bdCanAdd(+b.dataset.add)})}

/* ---------- binder: pages by rarity, up to 8 cards a page ----------
   8 fits the 3×3 sleeves (with one spare), 4×2 on short pages and 2×4 on tall ones, so no card is ever hidden */
const BD_PER=8;
const BD_BOOK=(()=>{const out=[];for(let r=1;r<=5;r++){
  const cs=CARDS.filter(c=>c.rar===r).sort((a,b)=>a.lv-b.lv||a.id-b.id),n=Math.ceil(cs.length/BD_PER);
  for(let i=0;i<n;i++)out.push({r,cards:cs.slice(i*BD_PER,(i+1)*BD_PER),part:i+1,parts:n})}return out})();
const BD_PAGES=BD_BOOK.length;
const bdFirst=r=>BD_BOOK.findIndex(pg=>pg.r===r);
const BD={p:0,done:null,swiped:false,drag:null};
// two pages side by side when the binder area is wide enough (it shares the width with the side column on big screens)
const bdSpread=()=>$('#collBook').clientWidth>=540;
const rarFound=r=>{const cs=CARDS.filter(c=>c.rar===r);return [cs.filter(c=>isSeen(c.id)).length,cs.length]};
// in spread mode the left page is always even, so the pair is (p, p+1)
const bdNorm=p=>{p=Math.max(0,Math.min(BD_PAGES-1,p));return bdSpread()?p-p%2:p};
function bdPage(k){
  const pg=BD_BOOK[k];
  if(!pg)return '';
  const cs=pg.cards,[f,t]=rarFound(pg.r);
  let pk='';
  for(let i=0;i<9;i++){
    const c=cs[i];
    if(!c){pk+=`<div class="pk-cell${i===8?' p9':''}"><div class="pocket blank" aria-hidden="true"></div></div>`;continue}
    const n=owned(c.id),seen=isSeen(c.id);
    const face=n?cardHTML(c.id,'blue',{count:n}):seen?cardHTML(c.id,'red',{cls:'lost'}):'<div class="card unknown"><i>?</i></div>';
    const lbl=n?esc(cardLabel(c.id))+`, owned ×${n}`:seen?esc(c.name)+', lost':`Undiscovered ${c.rar} star ${RARITY[c.rar-1]} card`;
    const add=n?`<button class="pk-add" data-add="${c.id}" ${bdCanAdd(c.id)?'':'disabled'} aria-label="Add ${esc(c.name)} to hand" title="Add to hand">+</button>`:'';
    pk+=`<div class="pk-cell"><button class="pocket" data-id="${c.id}" aria-label="${lbl}">${face}</button>${add}</div>`;
  }
  return `<div class="bd-h rar${pg.r}"><b><span class="rt">${pg.r}★</span> ${RARITY[pg.r-1]}${pg.parts>1?` <em>${pg.part}/${pg.parts}</em>`:''}</b>`+
    `<span class="${f===t?'done':''}">${f===t?'✓ ':''}${f} / ${t} found</span></div>`+
    `<div class="bd-bar"><i style="width:${(f/t*100).toFixed(1)}%"></i></div><div class="bd-grid">${pk}</div><div class="bd-num">${k+1}</div>`;
}
function bdChrome(p){
  const sp=bdSpread();
  // a tab is on when its rarity is on a page you can see (on wide screens two rarities can share a spread)
  const seen=new Set((sp?[p,p+1]:[p]).map(k=>BD_BOOK[k]&&BD_BOOK[k].r));
  $$('#bdTabs .bd-tab').forEach(b=>{const on=seen.has(+b.dataset.r);b.classList.toggle('on',on);b.setAttribute('aria-pressed',on)});
  $('#bdPos').textContent=sp?`Pages ${p+1}–${p+2} of ${BD_PAGES}`:`Page ${p+1} of ${BD_PAGES}`;
  $('#bdPrev').disabled=p===0;
  $('#bdNext').disabled=p+(sp?2:1)>=BD_PAGES;
  // keep the current tab in view by scrolling the tab row sideways only (never the screen)
  const row=$('#bdTabs'),t=$('#bdTabs .bd-tab.on');
  if(t&&row.scrollWidth>row.clientWidth)row.scrollTo({left:t.offsetLeft-(row.clientWidth-t.offsetWidth)/2,behavior:'smooth'});
}
function bdRender(){
  if(BD.done)BD.done();
  const sp=bdSpread();BD.p=bdNorm(BD.p);
  $('#binder').classList.toggle('single',!sp);
  $('#bdL').innerHTML=sp?bdPage(BD.p):'';
  $('#bdR').innerHTML=bdPage(sp?BD.p+1:BD.p);
  // one tab per rarity; it opens that rarity's first page
  $('#bdTabs').innerHTML=[1,2,3,4,5].map(r=>{
    const [f,t]=rarFound(r);
    return `<button class="bd-tab rar${r}" data-r="${r}"><span class="rt">${r}★</span> ${RARITY[r-1]}${f===t?'<i aria-label="complete">✓</i>':''}</button>`}).join('');
  $$('#bdTabs .bd-tab').forEach(b=>b.onclick=()=>bdTurn(bdFirst(+b.dataset.r)));
  bdChrome(BD.p);
}
// turn to page `to`: a two-sided sheet rotates around the rings while a shadow sweeps across it
function bdTurn(to){
  if(BD.done)BD.done();
  to=bdNorm(to);
  const from=BD.p;if(to===from)return;
  const fwd=to>from,sp=bdSpread(),binder=$('#binder'),L=$('#bdL'),R=$('#bdR');
  sfx('click');
  if(matchMedia('(prefers-reduced-motion: reduce)').matches||!binder.animate){BD.p=to;bdRender();return}
  if(!sp){bdTurnSingle(from,to,fwd);return}
  // src: the page the sheet lifts from (the revealed page is drawn into it underneath)
  // land: the static page the sheet comes to rest on, and what it should show once the sheet is gone
  let src,front,back,frontSide,backSide,deg,land,landHTML;
  if(sp){
    if(fwd){src=R;front=bdPage(from+1);back=bdPage(to);frontSide='r';backSide='l';deg=[0,-180];R.innerHTML=bdPage(to+1);land=L;landHTML=back}
    else{src=L;front=bdPage(from);back=bdPage(to+1);frontSide='l';backSide='r';deg=[0,180];L.innerHTML=bdPage(to);land=R;landHTML=back}
  }else{
    // one page: going forward the page swings away to the left; going back the earlier page swings in over it
    src=R;frontSide='r';backSide='l';back=null;land=R;
    if(fwd){front=bdPage(from);deg=[0,-180];R.innerHTML=bdPage(to);landHTML=null}
    else{front=bdPage(to);deg=[-180,0];landHTML=front}
  }
  // Pivot on the middle of the spine, not the page's own edge: the pages sit a gap apart, so turning
  // around the page edge would land the sheet short of the facing page and make it jump at the end.
  // Fractional rects keep the landing exact to the sub-pixel.
  const bR=binder.getBoundingClientRect(),sR=src.getBoundingClientRect();
  let pivot;
  if(sp){const lR=L.getBoundingClientRect(),rR=R.getBoundingClientRect(),mid=(lR.right+rR.left)/2;pivot=(mid-sR.left)/UI}
  else pivot=0;
  const shadeDir=pivot<sR.width/UI/2?'to-r':'to-l',backDir=shadeDir==='to-r'?'to-l':'to-r';
  const leaf=document.createElement('div');
  leaf.className='bd-leaf';leaf.setAttribute('aria-hidden','true');
  Object.assign(leaf.style,{left:((sR.left-bR.left)/UI-binder.clientLeft)+'px',top:((sR.top-bR.top)/UI-binder.clientTop)+'px',
    width:sR.width/UI+'px',height:sR.height/UI+'px',transformOrigin:`${pivot}px 50%`});
  leaf.innerHTML=`<div class="bd-face front"><div class="bd-page ${frontSide}">${front}</div><i class="bd-shade ${shadeDir}"></i></div>`+
    `<div class="bd-face back">${back?`<div class="bd-page ${backSide}">${back}</div>`:'<div class="bd-page bd-blank"></div>'}<i class="bd-shade ${backDir}"></i></div>`;
  binder.append(leaf);
  // a shadow on the page underneath: lifts away as it's uncovered, or falls on it as it's covered
  const under=document.createElement('i');
  under.className='bd-shade '+shadeDir;
  src.append(under);
  const T=780,opt={duration:T,easing:'cubic-bezier(.45,.05,.2,1)',fill:'forwards'},opening=deg[0]===0;
  const anims=[
    leaf.animate([{transform:`rotateY(${deg[0]}deg)`},{transform:`rotateY(${deg[1]}deg)`}],opt),
    // the lifting side darkens as it turns edge-on, the landing side brightens as it settles
    leaf.querySelector('.front .bd-shade').animate(opening?[{opacity:0},{opacity:.55}]:[{opacity:.55},{opacity:0}],opt),
    leaf.querySelector('.back .bd-shade').animate(opening?[{opacity:.55},{opacity:0}]:[{opacity:0},{opacity:.55}],opt),
    under.animate(opening?[{opacity:.6},{opacity:0}]:[{opacity:0},{opacity:.35}],opt),
    // the sheet casts a shadow only while it's in the air, so nothing pops off when it lands
    ...[...leaf.querySelectorAll('.bd-face')].map(f=>f.animate([{boxShadow:'0 0 0 rgba(0,0,0,0)'},{boxShadow:'0 8px 26px rgba(0,0,0,.42)',offset:.5},{boxShadow:'0 0 0 rgba(0,0,0,0)'}],opt))
  ];
  // Finish quietly: draw the landing page underneath, then drop the sheet in the same frame.
  // Only that one page changes, so the tabs and scroll position don't get rebuilt mid-motion.
  const done=()=>{
    if(BD.done!==done)return;BD.done=null;
    if(landHTML!=null)land.innerHTML=landHTML;
    anims.forEach(a=>a.cancel());leaf.remove();under.remove();BD.p=to;bdChrome(to);
  };
  BD.done=done;
  anims[0].onfinish=done;
  bdChrome(to); // tabs and page count update right away instead of after the turn
}
// One page (phones): the sheet hinges on the page's left edge and only swings as far as edge-on, where it's
// invisible. It lives in a clip box the size of the page, with its depth seen from the hinge, so no part of
// it can ever swing out over the rings. Forward: the page lifts away and vanishes edge-on. Back: the earlier
// page swings in from edge-on and settles flat on the page it covers.
function bdTurnSingle(from,to,fwd){
  const binder=$('#binder'),R=$('#bdR');
  const bR=binder.getBoundingClientRect(),sR=R.getBoundingClientRect();
  const sheet=bdPage(fwd?from:to);
  const clip=document.createElement('div');
  clip.className='bd-clip';clip.setAttribute('aria-hidden','true');
  Object.assign(clip.style,{left:((sR.left-bR.left)/UI-binder.clientLeft)+'px',top:((sR.top-bR.top)/UI-binder.clientTop)+'px',width:sR.width/UI+'px',height:sR.height/UI+'px'});
  clip.innerHTML=`<div class="bd-leaf"><div class="bd-face front"><div class="bd-page r">${sheet}</div><i class="bd-shade to-r"></i></div></div>`;
  if(fwd)R.innerHTML=bdPage(to); // the next page waits underneath
  binder.append(clip);
  const under=document.createElement('i');
  under.className='bd-shade to-r';
  R.append(under);
  // forward eases in (a gentle lift, then away); back eases out (swings in, then settles softly)
  const opt={duration:560,easing:fwd?'cubic-bezier(.45,0,.8,.55)':'cubic-bezier(.2,.45,.55,1)',fill:'forwards'};
  const leaf=clip.firstChild;
  const anims=[
    leaf.animate([{transform:`rotateY(${fwd?0:-90}deg)`},{transform:`rotateY(${fwd?-90:0}deg)`}],opt),
    leaf.querySelector('.bd-shade').animate(fwd?[{opacity:0},{opacity:.6}]:[{opacity:.6},{opacity:0}],opt),
    under.animate(fwd?[{opacity:.45},{opacity:0}]:[{opacity:0},{opacity:.3}],opt)
  ];
  const done=()=>{
    if(BD.done!==done)return;BD.done=null;
    if(!fwd)R.innerHTML=sheet; // the sheet is flat on the page now, so the swap is invisible
    anims.forEach(a=>a.cancel());clip.remove();under.remove();BD.p=to;bdChrome(to);
  };
  BD.done=done;
  anims[0].onfinish=done;
  bdChrome(to);
}
// finish a turn that's still running first, so quick repeated taps each move one more page
const bdStep=d=>{if(BD.done)BD.done();bdTurn(BD.p+d*(bdSpread()?2:1))};
$('#bdPrev').onclick=()=>bdStep(-1);
$('#bdNext').onclick=()=>bdStep(1);
$('#binder').addEventListener('click',e=>{
  const a=e.target.closest('.pk-add');
  if(a){if(!BD.swiped&&!a.disabled)handAdd(CH,+a.dataset.add);return}
  const b=e.target.closest('.pocket[data-id]');
  if(b&&!BD.swiped)collDetail(+b.dataset.id);
});
// swipe left / right to turn pages
{let sx=0,sy=0,down=false;
 $('#binder').addEventListener('pointerdown',e=>{down=true;sx=e.clientX;sy=e.clientY;BD.swiped=false});
 $('#binder').addEventListener('pointerup',e=>{
   if(!down)return;down=false;
   if(BD.drag&&BD.drag.g)return; // a card was being dragged, not a page swiped
   const dx=e.clientX-sx,dy=e.clientY-sy;
   if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5){BD.swiped=true;bdStep(dx<0?1:-1);setTimeout(()=>{BD.swiped=false},0)}
 });
 $('#binder').addEventListener('pointercancel',()=>{down=false});
}
// drag an owned card from the binder onto the hand. Mouse: just drag. Touch: press and hold first,
// so a quick swipe still turns the page.
{const tray=$('#scr-coll .coll-tray'),overTray=(x,y)=>{const r=tray.getBoundingClientRect();return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom};
 const lift=d=>{
   const card=d.el.querySelector('.card');if(!card){BD.drag=null;return}
   const g=card.cloneNode(true);g.classList.add('ghost');
   // the ghost lives on <body>, outside the zoomed screen
   g.style.fontSize=parseFloat(getComputedStyle(card).fontSize)*UI+'px';
   g.style.left=d.x+'px';g.style.top=d.y+'px';
   document.body.append(g);d.g=g;d.el.classList.add('dragging');sfx('click');
 };
 const end=(e,cancel)=>{
   const d=BD.drag;if(!d)return;BD.drag=null;clearTimeout(d.t);
   if(!d.g)return;
   d.g.remove();d.el.classList.remove('dragging');tray.classList.remove('over');
   // swallow the click that follows, so the card's detail doesn't open
   BD.swiped=true;setTimeout(()=>{BD.swiped=false},0);
   if(!cancel&&overTray(e.clientX,e.clientY))handAdd(CH,d.id);
 };
 $('#binder').addEventListener('pointerdown',e=>{
   const b=e.target.closest('.pocket[data-id]');
   if(!b||e.button>0||BD.done)return;
   const id=+b.dataset.id;if(CH.sel.length>=5||handRemaining(CH,id)<=0)return;
   const d=BD.drag={id,el:b,x:e.clientX,y:e.clientY,g:null,touch:e.pointerType!=='mouse',t:0};
   if(d.touch)d.t=setTimeout(()=>{if(BD.drag===d)lift(d)},280);
 });
 window.addEventListener('pointermove',e=>{
   const d=BD.drag;if(!d)return;
   if(!d.g){
     if(Math.hypot(e.clientX-d.x,e.clientY-d.y)<8)return;
     if(d.touch){clearTimeout(d.t);BD.drag=null;return} // moved before the hold: it's a swipe or scroll
     lift(d);if(!d.g)return;
   }
   d.g.style.left=e.clientX+'px';d.g.style.top=e.clientY+'px';
   tray.classList.toggle('over',overTray(e.clientX,e.clientY));
 },{passive:true});
 // once a held card is lifted, the finger moves it instead of scrolling the page
 $('#binder').addEventListener('touchmove',e=>{if(BD.drag&&BD.drag.g&&e.cancelable)e.preventDefault()},{passive:false});
 $('#binder').addEventListener('contextmenu',e=>{if(BD.drag)e.preventDefault()});
 window.addEventListener('pointerup',e=>end(e,false));
 window.addEventListener('pointercancel',e=>end(e,true));
}
// switch between one and two pages when the window crosses the breakpoint
const bdFit=()=>{if($('#scr-coll').classList.contains('on')&&$('#binder').classList.contains('single')===bdSpread())bdRender()};

if(window.ResizeObserver)new ResizeObserver(bdFit).observe($('#collBook'));else window.addEventListener('resize',bdFit);
function confirmReset(after){
  modal('<h2>Reset progress?</h2><p>Your collection, stats and settings will be erased and you will start over with the starter cards.'+(ACCT.token?' This also resets your account.':'')+'</p>',[
    {label:'Erase everything',cls:'danger',fn:()=>{const cid=SAVE.cid;SAVE=defSave();SAVE.cid=cid;save();applyTheme();updSnd();after();toast('Progress reset.')}},
    {label:'Cancel',cls:'primary',esc:true}]);
}
$('#btnReset').onclick=()=>confirmReset(openCollection);
