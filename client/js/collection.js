'use strict';
/* =====================================================================
   COLLECTION
   ===================================================================== */
// the hand you build in the collection; it stays put while you browse, and survives leaving the screen
const CH={pfx:'coll',sel:[],pool:[],color:'blue',loadouts:true,saving:false,note:'',deal:-1,render:()=>renderCollHand()};
function renderCollHand(){renderHand(CH);bdSyncAdd()}
// the hand the binder and tray work on: CH in the collection, DK when picking cards for a match
let BH=CH;
const picking=()=>BH!==CH;
wireHand('coll',()=>BH);
// switch the screen between the collection and the match picker (Play button, its own title and back)
function collMode(h,title,meta){
  BH=h;const pick=picking();
  $('#scr-coll').classList.toggle('pick',pick);
  $('#collTitle').textContent=title;$('#collMeta').innerHTML=meta;
  $('#collGo').classList.toggle('hidden',!pick);
  const sv=$('#collSave');
  sv.className=pick?'dk-act':'btn primary';
  sv.innerHTML=pick?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg><span>Save hand</span>':'Save hand';
}
$('#collBack').onclick=()=>{if(picking()){sfx('click');DK.onBack&&DK.onBack()}else{sfx('coll_close');bdCoverClose(()=>show('menu'))}};
$('#collGo').onclick=()=>{if(picking()&&DK.sel.length===5){sfx('click');DK.onDone(DK.sel.slice())}};
function openCollection(){
  sfx('coll_open');
  const lost=SAVE.seen.filter(i=>!owned(i)).length;
  collMode(CH,'Collection',(unlocked()?`All ${CARDS.length} cards unlocked`:`${SAVE.seen.length} of ${CARDS.length} discovered · ${collTotal()} cards owned`)+(lost?` · <span class="lostc">${lost} lost</span>`:''));
  // cards can be won or lost between visits: keep only the hand cards you still own enough copies of
  CH.pool=collPool();
  const keep=CH.sel;CH.sel=[];keep.forEach(id=>{if(handRemaining(CH,id)>0&&!rarBlock(CH.sel,id))CH.sel.push(id)});
  CH.saving=false;CH.note='';
  show('coll');$('#scr-coll').scrollTop=0;
  bdRender();renderCollHand(); // after show(), so the binder can measure the space it has
  bdCoverOpen();
}

/* ---------- card detail: the card slides out of its sleeve and flies into the popup ---------- */
const CD={pocket:null,toHand:false};
function collDetail(id,pocket){
  const c=CARDS[id],n=owned(id);
  const lost=!n&&isSeen(id);
  if(!n&&!lost){
    sfx('coll_locked');toast(`${rarName(c.rar)} card — win it in a match to discover it.`);
    // the sleeve shakes no
    if(pocket&&!noMotion()){pocket.animate([{transform:'none'},{transform:'translateX(-5px) rotate(-2deg)'},{transform:'translateX(5px) rotate(2deg)'},{transform:'translateX(-3px)'},{transform:'translateX(2px)'},{transform:'none'}],{duration:260,easing:'ease-out'});
      const q=pocket.querySelector('.unknown i');if(q)q.animate([{transform:'none'},{transform:'scale(1.3)',offset:.4},{transform:'none'}],{duration:260})}
    return;
  }
  const shiny=!lost&&c.rar>=4;
  sfx(lost?'coll_lost':'coll_card_out');if(shiny)setTimeout(()=>sfx('coll_shimmer'),120);
  const r=handRemaining(CH,id),full=CH.sel.length>=5,capped=!!rarBlock(CH.sel,id),src=pocket&&pocket.querySelector('.card');
  const box=modal(`<div class="cd-rings" aria-hidden="true"><i></i><i></i><i></i><i></i></div><div class="cd-sheet">
    <div class="cd-top"><span>No. ${id+1} / ${CARDS.length}</span><b class="rar${c.rar} rt">${rarName(c.rar)}</b></div>
    <div class="cd-pulled"><div class="cd-sleeve">${cardHTML(id,lost?'red':'blue',{cls:(lost?'lost ':'')+(src?'hold':'')})}${lost?'<span class="cd-stamp">Lost</span>':''}</div></div>
    <h2 class="nm2 cd-name">${esc(c.name)}</h2>
    <div class="cd-sub">${c.e?ELEM[c.e]+' '+c.e[0].toUpperCase()+c.e.slice(1):'No element'} · Power ${c.sum}</div>
    <div class="cd-sides">${SIDE_NAMES.map((s,i)=>`<div><b>${fmt(c.s[i])}</b><span>${s}</span></div>`).join('')}</div>
    <div class="cd-own ${lost?'lost':''}"><b>×${n}</b>${lost?'None left in your binder':n>1?'copies in your binder':'copy in your binder'}</div>
    ${lost?'<p class="cd-msg">You lost every copy of this card. Win it back in a match with a trade rule.</p>':''}</div>`,
    lost?[{label:'Close',cls:'primary',esc:true}]
      :[{label:'Close',esc:true},{label:r<=0?'All copies in hand':full?'Hand is full':capped?'Over rarity limit':'Add to hand',cls:'primary',keep:true,fn:()=>{
        // the card flies from the popup straight into the hand instead of back to its sleeve
        CD.toHand=true;handAdd(CH,id,box.querySelector('.cd-sleeve .card'));closeModal()}}]);
  box.classList.add('cd-box');
  // move the buttons onto the page (this drops focus, so set it again below)
  box.querySelector('.cd-sheet').append(box.querySelector('.mbtns'));
  const add=box.querySelector('.mbtns .btn.primary');
  if(!lost&&(r<=0||full||capped))add.disabled=true;
  (add.disabled?box.querySelector('.mbtns .btn'):add).focus({preventScroll:true});
  CD.pocket=pocket||null;CD.toHand=false;
  const dst=box.querySelector('.cd-sleeve .card');
  if(shiny)dst.insertAdjacentHTML('beforeend','<i class="shine" aria-hidden="true"></i>');
  if(noMotion()){dst.classList.remove('hold');return}
  if(src){
    src.style.visibility='hidden';
    fly(src,dst,{ms:470,lift:.25,liftAt:.22,r1:-2.5,arc:20,pop:1.08,shadow:true,ease:'cubic-bezier(.35,.2,.2,1)',done:()=>{
      dst.classList.remove('hold');settle(dst);
      if(shiny){
        dst.querySelector('.shine').animate([{opacity:1,transform:'translateX(-70%)'},{opacity:1,transform:'translateX(70%)'}],{duration:900,easing:'cubic-bezier(.45,0,.3,1)',fill:'both'});
        dst.animate([{boxShadow:'0 0 0 0 transparent'},{boxShadow:`0 0 1.4em .2em ${getComputedStyle(dst).getPropertyValue('--rc').trim()}`,offset:.4},{boxShadow:'0 .5em 1em -.2em rgba(0,0,0,.8)'}],{duration:1100,easing:'ease-out'});
      }
    }});
  }
  box.animate([{opacity:0,transform:'translateY(12px) scale(.97)'},{opacity:1,transform:'none'}],{duration:280,delay:40,easing:'cubic-bezier(.2,.8,.3,1)',fill:'backwards'});
  box.querySelectorAll('.cd-name,.cd-sub,.cd-sides,.cd-own,.cd-msg,.mbtns').forEach((el,i)=>el.animate([{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:240,delay:200+i*45,easing:'ease-out',fill:'backwards'}));
  if(lost){
    // the LOST stamp thumps down and the popup shudders
    box.querySelector('.cd-stamp').animate([{opacity:0,transform:'translate(-50%,-50%) rotate(-24deg) scale(2.4)'},{opacity:1,transform:'translate(-50%,-50%) rotate(-14deg) scale(.92)',offset:.75},{opacity:1,transform:'translate(-50%,-50%) rotate(-14deg) scale(1)'}],{duration:300,delay:520,easing:'cubic-bezier(.5,0,.75,0)',fill:'backwards'});
    box.animate([{transform:'none'},{transform:'translateY(3px)'},{transform:'translateY(-1px)'},{transform:'none'}],{duration:200,delay:820});
  }
}
// called by closeModal while the popup is still on screen: the card flies back and drops into its sleeve
function collCardBack(m){
  const src=CD.pocket&&CD.pocket.querySelector('.card'),card=m.querySelector('.cd-sleeve .card');
  CD.pocket=null;
  if(CD.toHand){CD.toHand=false;if(src)src.style.visibility='';return}
  sfx('coll_card_in');
  if(!src)return;
  if(!src.isConnected||!card){src.style.visibility='';return}
  fly(card,src,{ms:260,r0:-2.5,arc:10,pop:1,shadow:true,ease:'cubic-bezier(.55,0,.6,1)',done:()=>{
    src.style.visibility='';
    if(!noMotion())src.animate([{transform:'translateY(-.9em)'},{transform:'translateY(.08em)',offset:.7},{transform:'none'}],{duration:110,easing:'ease-out'});
  }});
}
// the + on each owned card: faded once every copy is in the hand, the hand is full, or the rarity limit is reached
// (it still answers a tap, with a "no", instead of doing nothing)
const bdCanAdd=id=>BH.sel.length<5&&handRemaining(BH,id)>0&&!rarBlock(BH.sel,id);
// how many of a card the binder holds: owned copies in the collection, the picker's pool when picking
const bdHave=id=>{const e=BH.pool.find(x=>x.id===id);return e?e.count:0};
// when picking, a card you can't add right now also fades, like the old picker grid
function bdSyncAdd(){$$('#binder .pk-add').forEach(b=>{const no=!bdCanAdd(+b.dataset.add);b.classList.toggle('off',no);b.setAttribute('aria-disabled',no);b.parentNode.classList.toggle('used',no&&picking())})}
// a card's face in its sleeve on the open pages (where hand cards fly home to)
const bdPocketCard=id=>{const p=$(`#bdL .pocket[data-id="${id}"],#bdR .pocket[data-id="${id}"]`);return p&&p.querySelector('.card')};
const bdPocketLand=card=>{const p=card&&card.closest('.pocket');if(p&&!noMotion())p.animate([{transform:'scale(1.07)'},{transform:'none'}],{duration:260,easing:'cubic-bezier(.2,1.4,.4,1)'})};

/* ---------- binder: pages by rarity ----------
   8 cards a page (3×3 sleeves with one spare, 4×2 on short pages, 2×4 on tall ones). Epic and Legendary are
   trophy pages: 4 cards in bigger sleeves. With two pages side by side, a rarity with an odd number of pages
   gets a blank one, so every rarity starts on its own spread and a tab always opens just that rarity. */
const BD_PER=8,BD_BIG=4;
function bdBook(spread){
  const out=[];
  for(let r=1;r<=5;r++){
    const cs=CARDS.filter(c=>c.rar===r).sort((a,b)=>a.lv-b.lv||a.id-b.id),big=r>=4,per=big?BD_BIG:BD_PER,n=Math.ceil(cs.length/per),start=out.length;
    for(let i=0;i<n;i++)out.push({r,big,cards:cs.slice(i*per,(i+1)*per),part:i+1,parts:n});
    if(spread&&(out.length-start)%2)out.push({r,blank:true});
  }
  return out;
}
let BD_BOOK=bdBook(true);
const bdFirst=r=>BD_BOOK.findIndex(pg=>pg.r===r);
const BD={p:0,done:null,swiped:false,drag:null,sp:null};
// two pages side by side when the binder area is wide enough (it shares the width with the side column on big screens)
const bdSpread=()=>$('#collBook').clientWidth>=540;
const rarFound=r=>{const cs=CARDS.filter(c=>c.rar===r);return [cs.filter(c=>isSeen(c.id)).length,cs.length]};
// in spread mode the left page is always even, so the pair is (p, p+1)
const bdNorm=p=>{p=Math.max(0,Math.min(BD_BOOK.length-1,p));return BD.sp?p-p%2:p};
function bdPage(k){
  const pg=BD_BOOK[k];
  if(!pg)return '';
  if(pg.blank)return '<div class="bd-blank"></div>';
  const cs=pg.cards,[f,t]=rarFound(pg.r),slots=pg.big?BD_BIG:9;
  let pk='';
  for(let i=0;i<slots;i++){
    const c=cs[i];
    if(!c){pk+=`<div class="pk-cell${i===8?' p9':''}"><div class="pocket blank" aria-hidden="true"></div></div>`;continue}
    const n=bdHave(c.id),seen=isSeen(c.id),no=n&&!bdCanAdd(c.id);
    const face=n?cardHTML(c.id,BH.color||'blue',{count:n}):seen?cardHTML(c.id,'red',{cls:'lost'}):'<div class="card unknown"><i>?</i></div>';
    const lbl=n?esc(cardLabel(c.id))+`, owned ×${n}`:seen?esc(c.name)+', lost':`Undiscovered ${c.rar} star ${RARITY[c.rar-1]} card`;
    const add=n?`<button class="pk-add${no?' off':''}" data-add="${c.id}" aria-disabled="${!!no}" aria-label="Add ${esc(c.name)} to hand" title="Add to hand">+</button>`:'';
    pk+=`<div class="pk-cell${no&&picking()?' used':''}"><button class="pocket" data-id="${c.id}" aria-label="${lbl}">${face}</button>${add}</div>`;
  }
  return `<div class="bd-h rar${pg.r}"><b><span class="rt">${pg.r}★</span> ${RARITY[pg.r-1]}${pg.parts>1?` <em>${pg.part}/${pg.parts}</em>`:''}</b>`+
    `<span class="${f===t?'done':''}">${f===t?'✓ ':''}${f} / ${t} found</span></div>`+
    `<div class="bd-bar"><i style="width:${(f/t*100).toFixed(1)}%"></i></div><div class="bd-grid${pg.big?' big rar'+pg.r:''}">${pk}</div><div class="bd-num">${k+1}</div>`;
}
function bdChrome(p){
  const sp=BD.sp,n=BD_BOOK.length;
  // the open rarity's tab rises and joins the page
  const seen=new Set((sp?[p,p+1]:[p]).map(k=>BD_BOOK[k]&&BD_BOOK[k].r));
  $$('#bdTabs .bd-tab').forEach(b=>{const on=seen.has(+b.dataset.r);b.classList.toggle('on',on);b.setAttribute('aria-pressed',on)});
  $('#bdPos').textContent=sp?`Pages ${p+1}–${p+2} of ${n}`:`Page ${p+1} of ${n}`;
  $('#bdPrev').disabled=p===0;
  $('#bdNext').disabled=p+(sp?2:1)>=n;
  // the folded corner shows on a page you can turn
  $('#binder').classList.toggle('has-prev',p>0);$('#binder').classList.toggle('has-next',p+(sp?2:1)<n);
  // keep the current tab in view by scrolling the tab row sideways only (never the screen)
  const row=$('#bdTabs'),t=$('#bdTabs .bd-tab.on');
  if(t&&row.scrollWidth>row.clientWidth)row.scrollTo({left:t.offsetLeft-(row.clientWidth-t.offsetWidth)/2,behavior:'smooth'});
}
function bdRender(){
  if(BD.done)BD.done();
  const sp=bdSpread();
  // one page or two changes which pages exist (blank pages only pair rarities up on spreads): stay on the same rarity
  if(sp!==BD.sp){const r=BD_BOOK[BD.p]?BD_BOOK[BD.p].r:1;BD.sp=sp;BD_BOOK=bdBook(sp);if(BD.p)BD.p=Math.max(0,bdFirst(r))}
  BD.p=bdNorm(BD.p);
  $('#binder').classList.toggle('single',!sp);$('#collBook').classList.toggle('single',!sp);
  $('#bdL').innerHTML=sp?bdPage(BD.p):'';
  $('#bdR').innerHTML=bdPage(sp?BD.p+1:BD.p);
  // one tab per rarity; it opens that rarity's first page. On one page only the open tab shows its name.
  $('#bdTabs').innerHTML=[1,2,3,4,5].map(r=>{
    const [f,t]=rarFound(r);
    return `<button class="bd-tab rar${r}" data-r="${r}" aria-label="${RARITY[r-1]}"><span class="rt">${r}★</span><span class="tn"> ${RARITY[r-1]}</span>${f===t?'<i aria-label="complete">✓</i>':''}</button>`}).join('');
  $$('#bdTabs .bd-tab').forEach(b=>b.onclick=()=>{bdTabPop(b);bdTurn(bdFirst(+b.dataset.r),'tab')});
  bdChrome(BD.p);
}
const bdTabPop=b=>{if(!noMotion())b.animate([{transform:'none'},{transform:'translateY(-4px) scale(1.04)',offset:.45},{transform:'none'}],{duration:210,easing:'ease-out'})};

/* ---------- page turns ----------
   One engine for arrows, tabs, riffles and drags. A sheet is cut into 8 strips that each turn a little more
   than the one before, so the paper curls (like the pack tear). Arrows and tabs play it on a timed curve as
   long as the page sound; a drag moves it on a spring. Two pages: the sheet turns around the middle of the
   rings. One page (phones): it hinges on the rings and swings as far as edge-on, inside a box the size of the page. */
const BD_STRIPS=8;
function cubicBez(x1,y1,x2,y2){
  const cx=3*x1,bx=3*(x2-x1)-cx,ax=1-cx-bx,cy=3*y1,by=3*(y2-y1)-cy,ay=1-cy-by;
  const X=t=>((ax*t+bx)*t+cx)*t,Y=t=>((ay*t+by)*t+cy)*t,dX=t=>(3*ax*t+2*bx)*t+cx;
  return x=>{if(x<=0)return 0;if(x>=1)return 1;let t=x;for(let i=0;i<8;i++){const d=dX(t);if(Math.abs(d)<1e-6)break;t-=(X(t)-x)/d}return Y(Math.max(0,Math.min(1,t)))};
}
const BD_EASE=cubicBez(.45,.05,.2,1),BD_AWAY=cubicBez(.45,0,.8,.55),BD_IN=cubicBez(.2,.45,.55,1);
// s=1: hinge on the sheet's left edge; s=-1: on its right. gap: how far outside the sheet the hinge sits.
function bdLeaf(host,o){
  const {w,h,s}=o,sw=w/BD_STRIPS;
  const el=document.createElement('div');el.className='bd-leaf';el.setAttribute('aria-hidden','true');
  Object.assign(el.style,{left:o.x+'px',top:o.y+'px',width:w+'px',height:h+'px',zIndex:o.z,transformOrigin:s>0?`${-o.gap}px 50%`:`${w+o.gap}px 50%`});
  let par=el;const sl=[],sh=[];
  for(let k=0;k<BD_STRIPS;k++){
    const d=document.createElement('div');d.className='bd-strip';
    const fx=s>0?k*sw:w-(k+1)*sw,bx=s>0?w-(k+1)*sw:k*sw;
    // each strip is a hair wider than its share, so no seam shows between bent strips
    Object.assign(d.style,{width:(sw+.6)+'px',height:h+'px',left:(k?(s>0?sw:-sw):(s>0?0:w-sw))+'px',transformOrigin:s>0?'0 50%':`${sw}px 50%`});
    d.innerHTML=`<div class="bd-face"><div class="bd-page ${o.fSide}" style="width:${w}px;height:${h}px;left:${-fx}px">${o.front}</div><i class="bd-dim"></i></div>`+
      `<div class="bd-face back"><div class="bd-page ${o.bSide}" style="width:${w}px;height:${h}px;left:${-bx+.6}px">${o.back}</div><i class="bd-dim"></i></div>`;
    par.append(d);par=d;sl.push(d);sh.push(d.children[0].lastChild,d.children[1].lastChild);
  }
  host.append(el);
  // t: how far the sheet has turned (deg); b: how much more each strip turns than the one before
  const set=(t,b)=>{
    el.style.transform=`rotateY(${(-s*t).toFixed(2)}deg)`;
    let a=t;
    for(let k=0;k<BD_STRIPS;k++){
      const e=k?b*(.6+k*.12):0;a+=e; // the bend grows toward the free edge
      if(k)sl[k].style.transform=`rotateY(${(-s*e).toFixed(2)}deg)`;
      const c=Math.max(0,Math.min(180,a));
      sh[2*k].style.opacity=(.5*Math.pow(Math.min(1,c/90),1.5)).toFixed(3);
      sh[2*k+1].style.opacity=(.5*Math.pow(Math.min(1,(180-c)/90),1.5)).toFixed(3);
    }
  };
  return {el,set};
}
let BD_TURN=null;
// the sheets for a turn from page `from` to `to` (several sheets = a riffle), and the page drawn under them
function bdBuildTurn(from,to){
  const sp=BD.sp,fwd=to>from,st=fwd?1:-1,binder=$('#binder'),L=$('#bdL'),R=$('#bdR');
  let list=[];for(let k=from;fwd?k<=to:k>=to;k+=st*(sp?2:1))list.push(k);
  if(list.length>4)list=[list[0],list[Math.round((list.length-1)/3)],list[Math.round(2*(list.length-1)/3)],list[list.length-1]];
  const n=list.length-1,T={from,to,fwd,n,sp,leaves:[],sounded:false,raf:0};
  const box=el=>({x:el.offsetLeft,y:el.offsetTop,w:el.offsetWidth,h:el.offsetHeight});
  if(sp){
    // pivot on the middle of the rings, not the page's own edge, so the sheet lands exactly on the facing page
    const gap=(R.offsetLeft-L.offsetLeft-L.offsetWidth)/2,src=fwd?R:L,b=box(src);
    T.src=src;T.srcHTML=src.innerHTML;T.land=fwd?L:R;T.landHTML=bdPage(fwd?to:to+1);
    src.innerHTML=bdPage(fwd?to+1:to); // what the last sheet uncovers
    for(let i=0;i<n;i++){const a=list[i],c=list[i+1];
      T.leaves.push({...bdLeaf(binder,{...b,s:fwd?1:-1,gap,z:30-i,front:bdPage(fwd?a+1:a),back:bdPage(fwd?c:c+1),fSide:fwd?'r':'l',bSide:fwd?'l':'r'}),t0:0,t1:180})}
    T.under=document.createElement('i');T.under.className='bd-under '+(fwd?'to-r':'to-l');src.append(T.under);
    T.underOp=p=>.6*(1-p);
    // where the free edge is, in window pixels, so a drag keeps it under the finger
    const r=src.getBoundingClientRect(),g=gap*r.width/b.w;
    T.hinge=fwd?r.left-g:r.right+g;T.W=r.width+g;T.edge0=fwd?r.right:r.left;T.dirE=fwd?1:-1;T.minCos=-1;
  }else{
    const clip=document.createElement('div');clip.className='bd-clip';const b=box(R);
    Object.assign(clip.style,{left:b.x+'px',top:b.y+'px',width:b.w+'px',height:b.h+'px'});binder.append(clip);T.clip=clip;
    T.src=R;T.srcHTML=R.innerHTML;
    // forward: the page lifts away to edge-on, the next waits underneath. Back: the earlier page swings in over it.
    if(fwd)R.innerHTML=bdPage(to);
    for(let i=0;i<n;i++)T.leaves.push({...bdLeaf(clip,{x:0,y:0,w:b.w,h:b.h,s:1,gap:0,z:fwd?30-i:30+i,front:bdPage(fwd?list[i]:list[i+1]),back:'',fSide:'r',bSide:'r'}),t0:fwd?0:90,t1:fwd?90:0});
    T.under=document.createElement('i');T.under.className='bd-under to-r';R.append(T.under);
    T.underOp=fwd?p=>.45*(1-p):p=>.3*p;
    const r=R.getBoundingClientRect();
    T.hinge=r.left;T.W=r.width;T.edge0=fwd?r.right:r.left;T.dirE=1;T.minCos=0;
  }
  T.leaves.forEach(l=>l.set(l.t0,0));T.under.style.opacity=T.underOp(0);
  // finish: draw the landing page underneath, then drop the sheets in the same frame
  T.end=commit=>{
    if(BD_TURN!==T)return;BD_TURN=null;BD.done=null;cancelAnimationFrame(T.raf);
    T.leaves.forEach(l=>l.el.remove());T.under.remove();if(T.clip)T.clip.remove();
    if(commit){if(sp)T.land.innerHTML=T.landHTML;else R.innerHTML=bdPage(to);BD.p=to}
    else T.src.innerHTML=T.srcHTML;
    binder.classList.remove('grabbing');bdChrome(BD.p);
  };
  BD_TURN=T;BD.done=()=>T.end(true);
  return T;
}
// arrows and tabs: a timed turn as long as its sound (a riffle flicks up to 3 sheets in the same time)
function bdAutoTurn(T){
  const n=T.n,ms=n>1?440:T.sp?700:600,gap=n>1?(700-ms)/(n-1):0,total=ms+gap*(n-1),t0=performance.now();
  const ease=T.sp?BD_EASE:T.fwd?BD_AWAY:BD_IN,full=T.sp?180:90;
  const f=now=>{
    const el=now-t0;
    T.leaves.forEach((l,i)=>{
      const e=ease(Math.max(0,Math.min(1,(el-i*gap)/ms))),th=l.t0+(l.t1-l.t0)*e;
      l.set(th,-Math.sign(l.t1-l.t0)*2.6*Math.sin(Math.PI*th/full)); // the free edge trails behind
      if(T.sp)l.el.style.zIndex=th>90?30+i:30-i; // past edge-on, a later sheet lands on top of the earlier ones
    });
    T.under.style.opacity=T.underOp(Math.min(1,el/total));
    if(el>=total)T.end(true);else T.raf=requestAnimationFrame(f);
  };
  T.raf=requestAnimationFrame(f);
}
let lastBdPageSound=0;
const bdPageSound=(vol)=>{let n;do{n=1+Math.floor(Math.random()*4)}while(n===lastBdPageSound);lastBdPageSound=n;sfx(`coll_page_0${n}`,vol)};
function bdTurn(to,source='page'){
  if(BD.done)BD.done();
  to=bdNorm(to);
  const from=BD.p;if(source==='tab')sfx('coll_tab');if(to===from)return;
  const go=()=>{
    const T=bdBuildTurn(from,to);
    if(T.n>1)sfx('coll_riffle');else bdPageSound();
    if(noMotion()){T.end(true);return}
    bdChrome(to); // tabs and page count update right away instead of after the turn
    bdAutoTurn(T);
  };
  // a tab tap gives its click a moment before the paper sound
  if(source==='tab'&&!noMotion()){const t=setTimeout(go,90);BD.done=()=>{clearTimeout(t);BD.done=null;go();if(BD.done)BD.done()}}else go();
}
// at the first or last page: the binder nudges and springs back
function bdBump(d){
  sfx('coll_bump');if(noMotion())return;
  const binder=$('#binder'),pg=d>0||!BD.sp?$('#bdR'):$('#bdL');
  binder.animate([{transform:'none'},{transform:`translateX(${-d*8}px)`,offset:.25},{transform:`translateX(${d*3}px)`,offset:.6},{transform:'none'}],{duration:300,easing:'ease-out'});
  pg.style.transformOrigin=d>0?'0 50%':'100% 50%';
  pg.animate([{transform:'none'},{transform:`perspective(1200px) rotateY(${d>0?-9:9}deg)`,offset:.3},{transform:'none'}],{duration:300,easing:'ease-out'});
}
// finish a turn that's still running first, so quick repeated taps each move one more page
const bdStep=d=>{
  if(BD.done)BD.done();
  const to=bdNorm(BD.p+d*(BD.sp?2:1));
  if(to===BD.p){bdBump(d);return}
  bdTurn(to);
};
$('#bdPrev').onclick=()=>bdStep(-1);
$('#bdNext').onclick=()=>bdStep(1);

/* ---------- drag a page ----------
   Grab any empty bit of paper (or the folded corner) and pull: the free edge follows the finger. Let go past
   halfway, or flick, and it carries on; let go early and it falls back. On a spring, so a fast pull lags a
   little and a let-go keeps its speed. The page sound plays as the page passes halfway. */
const PG={g:null};
function bdDragLoop(T){
  const l=T.leaves[0],dir=Math.sign(l.t1-l.t0),lo=Math.min(l.t0,l.t1),hi=Math.max(l.t0,l.t1),full=T.sp?180:90;
  const f=()=>{
    const k=T.held?.3:.16,dm=T.held?.6:.74;
    T.v=(T.v+(T.tt-T.th)*k)*dm;T.th+=T.v;
    if(T.th<lo){T.th=lo;T.v=0}if(T.th>hi){T.th=hi;T.v=0}
    const p=(T.th-l.t0)/(l.t1-l.t0),arc=Math.sin(Math.PI*T.th/full);
    // held: the edge leads, pulled by the finger; let go: it trails as the page falls
    l.set(T.th,(T.held?dir*2.2*arc:-dir*2*arc)+Math.max(-3,Math.min(3,T.v*.35)));
    if(T.sp)l.el.style.zIndex=T.th>90?31:30;
    T.under.style.opacity=T.underOp(Math.max(0,Math.min(1,p)));
    if(!T.sounded&&p>.5){T.sounded=true;bdPageSound()}
    if(!T.held&&Math.abs(T.tt-T.th)<.4&&Math.abs(T.v)<.4){T.end(T.tt===l.t1);return}
    T.raf=requestAnimationFrame(f);
  };
  T.raf=requestAnimationFrame(f);
}
const bdEdgeTheta=(T,x)=>{const c=T.dirE*(T.edge0+(x-T.x0)*1.15-T.hinge)/T.W;return Math.acos(Math.max(T.minCos,Math.min(1,c)))*180/Math.PI};
{const binder=$('#binder');
 binder.addEventListener('pointerdown',e=>{
   BD.swiped=false;
   if(e.button>0||PG.g&&PG.g.on||e.target.closest('.pk-add')||bdCovered())return;
   if(BD.done)BD.done(); // a turn still running finishes first
   PG.g={x0:e.clientX,y0:e.clientY,id:e.pointerId,onCard:!!e.target.closest('.pocket[data-id]'),touch:e.pointerType!=='mouse',on:false};
 });
 window.addEventListener('pointermove',e=>{
   const g=PG.g;if(!g||e.pointerId!==g.id)return;
   if(BD.drag&&BD.drag.g){PG.g=null;return} // a card is being dragged instead
   const dx=e.clientX-g.x0,dy=e.clientY-g.y0;
   if(!g.on){
     if(Math.abs(dy)>14&&Math.abs(dy)>Math.abs(dx)){PG.g=null;return} // scrolling
     if(Math.abs(dx)<8||Math.abs(dx)<Math.abs(dy)*1.2)return;
     if(g.onCard&&!g.touch){PG.g=null;return} // a mouse on a card drags the card
     if(BD.drag){clearTimeout(BD.drag.t);BD.drag=null} // touch: moved before the hold, so it's the page
     g.on=true;try{binder.setPointerCapture(g.id)}catch(_){}
     binder.classList.add('grabbing');BD.swiped=true;
     const fwd=dx<0,to=bdNorm(BD.p+(fwd?1:-1)*(BD.sp?2:1));
     if(to===BD.p||noMotion()){g.rubber=to===BD.p?(fwd?1:-1):0;g.jump=to===BD.p?0:to;return}
     const T=g.T=bdBuildTurn(BD.p,to),l=T.leaves[0];
     T.x0=g.x0;T.held=true;T.th=T.tt=l.t0;T.v=0;
     BD.done=()=>T.end((T.th-l.t0)/(l.t1-l.t0)>.5);
     bdDragLoop(T);
   }
   // nothing to turn to: the binder stretches a little
   if(g.rubber){binder.style.transform=`translateX(${Math.max(-24,Math.min(24,dx*.12))/UI}px)`;return}
   if(g.T&&BD_TURN===g.T)g.T.tt=bdEdgeTheta(g.T,e.clientX);
 },{passive:true});
 const up=e=>{
   const g=PG.g;if(!g||e.pointerId!==g.id)return;PG.g=null;
   if(!g.on)return;
   binder.classList.remove('grabbing');setTimeout(()=>{BD.swiped=false},0);
   if(g.rubber){
     sfx('coll_bump');const was=binder.style.transform;binder.style.transform='';
     binder.animate([{transform:was||'none'},{transform:`translateX(${g.rubber*3}px)`,offset:.55},{transform:'none'}],{duration:320,easing:'cubic-bezier(.3,1.4,.5,1)'});
     return;
   }
   if(!g.T){if(g.jump!=null&&e.type!=='pointercancel')bdTurn(g.jump);return} // reduced motion: a swipe just turns
   const T=g.T;if(BD_TURN!==T)return;
   const l=T.leaves[0],dir=Math.sign(l.t1-l.t0),p=(T.th-l.t0)/(l.t1-l.t0),vp=T.v*dir;
   const commit=e.type!=='pointercancel'&&(p>.5?vp>-1.5:vp>1.8||p>.42&&vp>.6);
   T.held=false;T.tt=commit?l.t1:l.t0;
   if(commit){if(!T.sounded){T.sounded=true;bdPageSound()}bdChrome(T.to)}
   else if(p>.12)bdPageSound(.35); // a soft flap as it falls back
   BD.done=()=>T.end(commit);
 };
 window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up);
}

/* ---------- the front cover ----------
   Opening the collection: two pages, the cover (the right half) swings open on the rings and lands as the
   left half while the binder slides to the middle. One page: it swings off to the left and fades. Leaving
   plays it backwards, quickly. Not when picking cards for a match. */
let bdCover=null;
const bdCovered=()=>!!bdCover;
function bdCoverBuild(){
  if(bdCover)bdCover.remove();
  const binder=$('#binder'),L=$('#bdL'),R=$('#bdR'),sp=BD.sp;
  const left=sp?binder.offsetLeft+binder.offsetWidth/2:binder.offsetLeft+R.offsetLeft-8;
  const cv=bdCover=document.createElement('div');cv.className='bd-cover';cv.setAttribute('aria-hidden','true');
  Object.assign(cv.style,{left:left+'px',top:binder.offsetTop+'px',height:binder.offsetHeight+'px',width:(binder.offsetLeft+binder.offsetWidth-left)+'px'});
  cv.innerHTML=`<div class="cf front"><div class="emb"><i class="emb-ic"></i><b>Leylines</b><span>Collection</span></div><i class="strap"></i></div>`+
    `<div class="cf back">${sp?`<div class="bd-page l" style="left:${L.offsetLeft}px;top:${L.offsetTop}px;width:${L.offsetWidth}px;height:${L.offsetHeight}px">${L.innerHTML}</div>`:''}</div>`;
  $('#bdWrap').append(cv);
  return cv;
}
function bdCoverReset(){if(bdCover){bdCover.remove();bdCover=null}$('#binder').style.clipPath='';$('#bdWrap').style.transform=''}
function bdCoverOpen(){
  bdCoverReset();if(noMotion())return;
  const cv=bdCoverBuild(),sp=BD.sp,wrap=$('#bdWrap'),binder=$('#binder');let a;
  if(sp){
    // the left half appears the moment the cover lies flat on it, so the swap can't be seen
    binder.style.clipPath='inset(0 0 0 50%)';
    a=[wrap.animate([{transform:'translateX(-25%) translateY(10px) scale(.97)'},{transform:'translateX(-25%)',offset:.14},{transform:'none'}],{duration:820,easing:'cubic-bezier(.3,.1,.2,1)'}),
      cv.animate([{transform:'rotateY(0deg)'},{transform:'rotateY(-12deg)',offset:.12},{transform:'rotateY(-180deg)',offset:.82},{transform:'rotateY(-174deg)',offset:.91},{transform:'rotateY(-180deg)'}],{duration:1000,easing:'cubic-bezier(.35,.05,.25,1)',fill:'forwards'})];
    setTimeout(()=>{if(bdCover===cv)binder.style.clipPath=''},820);
  }else{
    a=[wrap.animate([{transform:'translateY(10px) scale(.97)'},{transform:'none'}],{duration:260,easing:'cubic-bezier(.2,.8,.3,1)'}),
      cv.animate([{transform:'rotateY(0deg)',opacity:1},{transform:'rotateY(-12deg)',opacity:1,offset:.12},{transform:'rotateY(-105deg)',opacity:1,offset:.55},{transform:'rotateY(-160deg)',opacity:0,offset:.8},{transform:'rotateY(-180deg)',opacity:0}],{duration:1000,easing:'cubic-bezier(.35,.05,.25,1)',fill:'forwards'})];
  }
  a[1].onfinish=()=>{if(bdCover===cv)bdCoverReset()};
}
function bdCoverClose(then){
  if(BD.done)BD.done();
  if(noMotion()||bdCover||!$('#scr-coll').classList.contains('on')){bdCoverReset();then();return}
  const cv=bdCoverBuild(),sp=BD.sp;let a;
  if(sp){
    $('#binder').style.clipPath='inset(0 0 0 50%)';
    a=[cv.animate([{transform:'rotateY(-180deg)'},{transform:'rotateY(0deg)'}],{duration:240,easing:'cubic-bezier(.55,0,.9,.45)',fill:'forwards'}),
      $('#bdWrap').animate([{transform:'none'},{transform:'translateX(-25%)'}],{duration:260,easing:'cubic-bezier(.4,0,.2,1)',fill:'forwards'})];
  }else a=[cv.animate([{transform:'rotateY(-150deg)',opacity:0},{transform:'rotateY(-80deg)',opacity:1,offset:.4},{transform:'rotateY(0deg)',opacity:1}],{duration:250,easing:'cubic-bezier(.55,0,.9,.45)',fill:'forwards'})];
  a[a.length-1].onfinish=()=>{a.forEach(x=>x.cancel());bdCoverReset();then()};
}

/* ---------- taps and card drags ---------- */
$('#binder').addEventListener('click',e=>{
  if(BD.swiped||bdCovered())return;
  const a=e.target.closest('.pk-add');
  if(a){
    const id=+a.dataset.add;
    // a faded + still answers: it wiggles, and the hand says why
    if(a.classList.contains('off')&&!noMotion())a.animate([{transform:'none'},{transform:'rotate(-18deg) scale(.9)'},{transform:'rotate(14deg)'},{transform:'rotate(-8deg)'},{transform:'none'}],{duration:260});
    handAdd(BH,id,bdPocketCard(id));return;
  }
  const b=e.target.closest('.pocket[data-id]');
  if(!b)return;
  // picking: a tap adds the card straight to the hand; in the collection it opens the card
  const id=+b.dataset.id;
  if(picking()&&bdHave(id))handAdd(BH,id,b.querySelector('.card'));else collDetail(id,b);
});
// drag an owned card from the binder onto the hand. Mouse: just drag. Touch: press and hold first,
// so a quick swipe still turns the page.
{const tray=$('#scr-coll .coll-tray'),overTray=(x,y)=>{const r=tray.getBoundingClientRect();return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom};
 const lift=d=>{
   const card=d.el.querySelector('.card');if(!card){BD.drag=null;return}
   const g=card.cloneNode(true);g.classList.add('ghost');
   // the ghost lives on <body>, outside the zoomed screen
   g.style.fontSize=parseFloat(getComputedStyle(card).fontSize)*UI+'px';
   g.style.left=d.x+'px';g.style.top=d.y+'px';
   ghostSweep();document.body.append(g);d.g=g;d.el.classList.add('dragging');sfx('coll_lift');
   // it pops up out of the sleeve and tilts
   if(!noMotion())g.animate([{transform:'translate(-50%,-50%) scale(1) rotate(0deg)'},{transform:'translate(-50%,-55%) scale(1.14) rotate(-5deg)',offset:.6},{transform:'translate(-50%,-55%) scale(1.06) rotate(-4deg)'}],{duration:240,easing:'cubic-bezier(.3,1.3,.5,1)'});
 };
 const end=(e,cancel)=>{
   const d=BD.drag;if(!d||otherPointer(e,d))return; // another finger lifting doesn't end this drag
   BD.drag=null;clearTimeout(d.t);
   if(!d.g)return;
   const g=d.g;tray.classList.remove('over');
   // swallow the click that follows, so the card's detail doesn't open
   BD.swiped=true;setTimeout(()=>{BD.swiped=false},0);
   const home=d.el.querySelector('.card');
   const back=()=>{sfx('coll_return');
     // it flies back into its sleeve
     if(home&&home.isConnected&&!cancel){home.style.visibility='hidden';d.el.classList.remove('dragging');
       fly(g,home,{ms:300,s0:1.06,r0:-4,arc:16,pop:1,shadow:true,ease:'cubic-bezier(.4,0,.3,1)',done:()=>{home.style.visibility='';bdPocketLand(home)}})}
     else d.el.classList.remove('dragging');
     g.remove();ghostSweep()};
   if(!cancel&&overTray(e.clientX,e.clientY)){
     d.el.classList.remove('dragging');
     if(handAdd(BH,d.id,g)){g.remove();ghostSweep()}else back();
   }else back();
 };
 $('#binder').addEventListener('pointerdown',e=>{
   // a drag still open (a second finger, or a release the browser never reported): finish it first, so its card
   // can't be left behind on the screen
   if(BD.drag)end({},true);
   const b=e.target.closest('.pocket[data-id]');
   if(!b||e.button>0||BD_TURN||bdCovered())return;
   const id=+b.dataset.id;if(BH.sel.length>=5||handRemaining(BH,id)<=0)return;
   const d=BD.drag={id,el:b,x:e.clientX,y:e.clientY,g:null,touch:e.pointerType!=='mouse',t:0,pid:e.pointerId};
   if(d.touch)d.t=setTimeout(()=>{if(BD.drag===d&&!(PG.g&&PG.g.on))lift(d)},280);
 });
 window.addEventListener('pointermove',e=>{
   const d=BD.drag;if(!d||otherPointer(e,d))return;
   if(!d.g){
     if(Math.hypot(e.clientX-d.x,e.clientY-d.y)<8)return;
     if(d.touch){clearTimeout(d.t);BD.drag=null;return} // moved before the hold: it's a swipe or scroll
     lift(d);if(!d.g)return;
   }
   d.g.style.left=e.clientX+'px';d.g.style.top=e.clientY+'px';
   tray.classList.toggle('over',overTray(e.clientX,e.clientY));
 },{passive:true});
 // once a held card is lifted, the finger moves it instead of scrolling the page
 $('#binder').addEventListener('touchmove',e=>{if((BD.drag&&BD.drag.g||PG.g&&PG.g.on)&&e.cancelable)e.preventDefault()},{passive:false});
 $('#binder').addEventListener('contextmenu',e=>{if(BD.drag)e.preventDefault()});
 window.addEventListener('pointerup',e=>end(e,false));
 window.addEventListener('pointercancel',e=>end(e,true));
}
// switch between one and two pages when the window crosses the breakpoint
const bdFit=()=>{if($('#scr-coll').classList.contains('on')&&BD.sp!==bdSpread()){bdCoverReset();bdRender()}};

if(window.ResizeObserver)new ResizeObserver(bdFit).observe($('#collBook'));else window.addEventListener('resize',bdFit);
