'use strict';
/* =====================================================================
   DECK PICKER
   ===================================================================== */
let DK=null;
// the picker is the collection binder in "pick" mode: same pages and tray, plus a Play button
function openDeck(o){
  // o: {title, pool:[{id,count}], color, pre:[ids], free (Couch: count kinds, not copies), onDone(ids), onBack()}
  DK={...o,pfx:'coll',sel:[],deal:-1,saving:false,note:'',render:()=>renderDeck()};
  for(const id of (o.pre||[])){if(DK.sel.length<5&&handRemaining(DK,id)>0&&!rarBlock(DK.sel,id))DK.sel.push(id)}
  const total=o.free?o.pool.length:o.pool.reduce((a,e)=>a+e.count,0);
  collMode(DK,o.title,`${total} cards`);
  BD.p=0;show('coll');$('#scr-coll').scrollTop=0;
  bdRender();renderDeck();
}
const SIDE_NAMES=['Top','Right','Bottom','Left'];
function renderDeck(){
  const n=DK.sel.length;
  renderHand(DK);bdSyncAdd();
  $('#collGo').disabled=n!==5;
  $('#collGo').textContent=n<5?`${n} / 5`:'Play';
}

/* =====================================================================
   HAND + LOADOUTS — shared by the deck picker (ids "deck…") and the
   collection (ids "coll…"). A hand context looks like
   {pfx, sel:[ids], pool:[{id,count}], color, loadouts, saving, note, deal, render()}
   ===================================================================== */
function handRemaining(h,id){const e=h.pool.find(x=>x.id===id);return e?e.count-h.sel.filter(x=>x===id).length:0}
// from: a card on screen to fly in from (a binder sleeve, the card popup, a dragged card); returns whether it was added
// set for a moment after a hand card is dragged, so the click that ends the drag doesn't also remove it (collection.js)
let handDragged=false;
function handAdd(h,id,from){
  const tray=$(`#${h.pfx}Slots`).closest('.dk-tray');
  if(h.sel.length>=5||handRemaining(h,id)<=0){sfx('coll_deny');shakeNo(tray);return false}
  const why=h.anyRar?'':rarBlock(h.sel,id); // the Forge (forge.js) has no deck rarity limits
  if(why){h.note=`<span class="bad">${why}</span>`;sfx('coll_deny');shakeNo(tray);h.render();return false}
  h.sel.push(id);const k=h.sel.length-1,full=k===4;h.note='';sfx('coll_hand_add');
  if(from&&!noMotion()){
    // the card flies in an arc from where it was and lands in its slot
    h.hold=k;h.render();h.hold=-1;
    const dst=$(`#${h.pfx}Slots .dk-fs[data-i="${k}"] .card`);
    fly(from,dst,{ms:360,arc:60,r1:(k-2)*4,shadow:true,ease:'cubic-bezier(.35,.4,.25,1)',done:()=>{if(dst){dst.classList.remove('hold');settle(dst)}if(full)handFull(h)}});
  }else{h.deal=k;h.render();if(full)handFull(h)}
  return true;
}
// the 5th card: the hand does a wave and the tray glows, with the "hand full" tune
function handFull(h){
  setTimeout(()=>{
    sfx('coll_hand_full');if(noMotion())return;
    $$(`#${h.pfx}Slots .card`).forEach((c,i)=>c.animate([{transform:'none'},{transform:'translateY(-.7em) scale(1.05)',offset:.4},{transform:'none'}],{duration:440,delay:i*95,easing:'ease-in-out'}));
    // the glow goes round the hand's own mat (its rounded corners), on top of its usual edge
    const t=$(`#${h.pfx}Slots`),glow=getComputedStyle(document.documentElement).getPropertyValue('--accent-glow').trim(),base=t&&getComputedStyle(t).boxShadow,b=base&&base!=='none'?base+',':'';
    if(t)t.animate([{boxShadow:`${b}0 0 0 0 transparent,0 0 0 0 transparent`},{boxShadow:`${b}0 0 0 4px ${glow},0 0 40px ${glow}`,offset:.35},{boxShadow:`${b}0 0 0 0 transparent,0 0 0 0 transparent`}],{duration:1500,easing:'ease-out'});
  },120);
}
// tap a hand card (or drag it onto the book): it goes back to its spot in the book, which turns to its page if that
// isn't open (collection.js); with no book on screen it floats off. The rest slide over. from: a dragged card to fly from.
function handRemove(h,i,from){
  const P=h.pfx,id=h.sel[i],card=from||$(`#${P}Slots .dk-fs[data-i="${i}"] .card`);
  sfx('coll_hand_remove');
  const old=$$(`#${P}Slots .dk-fs`).map(s=>{const c=s.querySelector('.card');return c&&c.getBoundingClientRect()});
  if(card&&!noMotion()){
    if(!bdSendHome(card,id)){const g=card.cloneNode(true),a=card.getBoundingClientRect(),fs=cardPx(card);g.classList.add('flyer','lifted');
      Object.assign(g.style,{fontSize:fs+'px',left:(a.left+a.width/2-2.5*fs)+'px',top:(a.top+a.height/2-3*fs)+'px'});document.body.append(g);
      g.animate([{transform:`rotate(${(i-2)*4}deg)`},{transform:'translateY(-1.4em) scale(1.08)',offset:.3},{transform:'translateY(-4em) scale(.9)',opacity:0}],{duration:560,easing:'cubic-bezier(.4,.1,.25,1)',fill:'forwards'}).onfinish=()=>g.remove()}
  }
  h.sel.splice(i,1);h.note='';h.render();
  if(!noMotion())$$(`#${P}Slots .dk-fs`).forEach((s,j)=>{
    const c=s.querySelector('.card'),o=old[j+1];if(j<i||!c||!o)return;const n=c.getBoundingClientRect();
    c.animate([{transform:`translate(${(o.left-n.left)/UI}px,${(o.top-n.top)/UI}px) rotate(4deg)`},{transform:'none'}],{duration:420,easing:'cubic-bezier(.34,1.4,.64,1)'});
  });
}
function renderHand(h){
  const P=h.pfx,col=h.color||myCol(),n=h.sel.length;
  // 5 cards spread in a gentle arc, spaced so each card's art stays visible
  $(`#${P}Slots`).innerHTML=[0,1,2,3,4].map(i=>{
    const d=i-2,t=`translate(${d*5.5}em,${(d*d*.18).toFixed(2)}em) rotate(${d*4}deg)`,id=h.sel[i];
    const st=`style="--t:${t};transform:${t};z-index:${i}"`;
    return id!=null
      ?`<div class="dk-fs" ${st} data-i="${i}" role="button" aria-label="Remove ${esc(CARDS[id].name)}">${cardHTML(id,col,{name:false,cls:i===h.deal?'deal':i===h.hold?'hold':''})}</div>`
      :`<div class="dk-fs" ${st}><div class="dk-empty">${i+1}</div></div>`}).join('');
  h.deal=-1;
  $$(`#${P}Slots .dk-fs[data-i]`).forEach(s=>s.onclick=()=>{if(!handDragged)handRemove(h,+s.dataset.i)});
  // stats: total power and the best number on each side
  $(`#${P}Power`).textContent=h.sel.reduce((a,id)=>a+CARDS[id].sum,0);
  $(`#${P}Sides`).innerHTML=SIDE_NAMES.map((s,i)=>{const v=n?Math.max(...h.sel.map(id=>CARDS[id].s[i])):0;
    return `<span>${s}</span><span class="dk-bar ${n&&v<5?'weak':''}" role="img" aria-label="Best ${s.toLowerCase()} ${v}"><i style="width:${v*10}%"></i></span>`}).join('');
  $(`#${P}Save`).disabled=n!==5;
  $(`#${P}Save`).title=n===5?'':'Pick 5 cards to save them';
  $(`#${P}Clear`).disabled=!n;
  renderLoadouts(h);
}
// indexes in a loadout whose card you no longer own enough copies of (lost in a trade)
function loMissing(h,ids){return missingIn(ids,id=>{const e=h.pool.find(x=>x.id===id);return e?e.count:0})}
const sameHand=(a,b)=>a.length===b.length&&a.slice().sort((x,y)=>x-y).join()===b.slice().sort((x,y)=>x-y).join();
function renderLoadouts(h){
  const P=h.pfx;
  const lo=$(`#${P}Lo`);lo.classList.toggle('hidden',!h.loadouts);lo.parentElement.classList.toggle('nolo',!h.loadouts);
  $(`#${P}Save`).classList.toggle('hidden',!h.loadouts);
  if(!h.loadouts)return;
  const col=h.color||myCol();
  $(`#${P}LoRow`).innerHTML=SAVE.loadouts.map((l,i)=>{
    const attrs=`data-i="${i}"`;
    if(!l)return `<div class="dk-lowrap"><button class="dk-loslot empty ${h.saving?'pick':''}" ${attrs}>${h.saving?'Save here':'+ Save hand<br>to this slot'}</button></div>`;
    const miss=loMissing(h,l.ids),over=rarOver(l.ids),pow=l.ids.reduce((a,id)=>a+CARDS[id].sum,0),on=!h.saving&&!miss.length&&!over.length&&sameHand(l.ids,h.sel),main=i===SAVE.mainLo;
    const sub=h.saving?'<span>Replace with hand</span>':miss.length?`<span class="bad">Missing ${miss.length} card${miss.length>1?'s':''}</span>`:over.length?'<span class="bad">Over rarity limit</span>':`<span>Power ${pow}</span>`;
    return `<div class="dk-lowrap ${h.saving?'':'named'}"><button class="dk-loslot ${on?'on':''} ${h.saving?'pick':''}" ${attrs} aria-label="${esc(l.name)}${main?', main loadout':''}${miss.length?`, missing ${miss.length}`:''}${on?', in hand':''}">${on?'<span class="tagx">In hand</span>':''}`+
      `<div class="stack">${l.ids.map((id,k)=>miss.includes(k)?'<div class="miss"></div>':cardHTML(id,col,{name:false})).join('')}</div><b>${main?'<i class="dk-star" title="Main loadout">★</i>':''}${esc(l.name)}</b>${sub}</button>`+
      (h.saving?'':`<button class="dk-loedit" data-edit="${i}" aria-label="Edit ${esc(l.name)}" title="Edit"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg></button>`)+`</div>`;
  }).join('');
  $$(`#${P}LoRow .dk-loslot`).forEach(b=>b.onclick=()=>pickLoadout(h,+b.dataset.i));
  $$(`#${P}LoRow .dk-loedit`).forEach(b=>b.onclick=()=>renameLoadout(h,+b.dataset.edit));
  $(`#${P}LoCancel`).classList.toggle('hidden',!h.saving);
  $(`#${P}LoNote`).innerHTML=h.saving?'Pick a slot to save your hand in.':h.note||'';
}
function pickLoadout(h,i){
  const l=SAVE.loadouts[i];sfx('click');
  if(h.saving||!l){
    if(h.sel.length!==5){h.saving=false;h.note='Pick 5 cards first, then save them here.';h.render();return}
    SAVE.loadouts[i]={name:l?l.name:`Loadout ${i+1}`,ids:h.sel.slice()};fixMain();save();
    h.saving=false;h.note=`Saved to <b>${esc(SAVE.loadouts[i].name)}</b>.`;h.render();return;
  }
  const miss=loMissing(h,l.ids),have=l.ids.filter((_,k)=>!miss.includes(k));
  h.sel=legalDeck(have);
  const over=have.length-h.sel.length;
  h.note=miss.length
    ?`<span class="bad">You no longer have enough ${[...new Set(miss.map(k=>esc(CARDS[l.ids[k]].name)))].join(', ')}.</span> Pick a replacement.`
    :over?`<span class="bad">${over} card${over>1?'s':''} went over the rarity limit.</span> Pick a replacement.`
    :`Loaded <b>${esc(l.name)}</b>.`;
  h.render();
}
function renameLoadout(h,i){
  const l=SAVE.loadouts[i];if(!l)return;sfx('click');
  const commit=()=>{
    const v=$('#loName').value.trim().replace(/\s+/g,' ').slice(0,24);
    closeModal();
    l.name=v||`Loadout ${i+1}`;save();
    h.note=`Renamed to <b>${esc(l.name)}</b>.`;h.render();
  };
  const box=modal(`<h2 class="nm2">Edit loadout</h2><p>Give this hand a name you'll recognise, like "Ice wall" or "All-out attack".</p>
    <input class="namein" id="loName" maxlength="24" autocomplete="off" spellcheck="false" aria-label="Loadout name" value="${esc(l.name)}">
    <div class="dk-loopts"><button class="btn text dk-lomain" id="loMain"></button>
    <button class="btn text dk-lodel" id="loDel"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>Delete loadout</button></div>`,
    [{label:'Cancel',esc:true},{label:'Save',cls:'primary',keep:true,fn:commit}]);
  const inp=box.querySelector('#loName');
  inp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();sfx('click');commit()}};
  box.querySelector('#loDel').onclick=()=>{sfx('click');deleteLoadout(h,i)};
  const mb=box.querySelector('#loMain');
  const paintMain=()=>{const on=SAVE.mainLo===i;mb.disabled=on;mb.innerHTML=on?'★ Your main loadout':'☆ Make main loadout'};
  mb.onclick=()=>{sfx('click');SAVE.mainLo=i;save();paintMain();h.render();inp.focus()};
  paintMain();
  inp.focus();inp.select();
}
function deleteLoadout(h,i){
  const l=SAVE.loadouts[i];if(!l)return;
  modal(`<h2 class="nm2">Delete “${esc(l.name)}”?</h2><p>This removes the saved hand. The cards stay in your collection.</p>`,
    [{label:'Cancel',esc:true},
     {label:'Delete',cls:'danger',wait:true,fn:()=>{SAVE.loadouts[i]=null;fixMain();save();h.note=`Deleted <b>${esc(l.name)}</b>.`;h.render()}}]);
}
// Save hand / Cancel / Best 5 / Clear for one screen; get() returns that screen's current hand context
function wireHand(P,get){
  $(`#${P}Save`).onclick=()=>{const h=get();if(h.sel.length!==5)return;sfx('click');h.saving=!h.saving;h.note='';h.render();
    // on a short phone the loadouts can sit below the hand, out of sight: bring the slots up to pick from
    if(h.saving){const lo=$(`#${P}Lo`);if(lo.getBoundingClientRect().bottom>innerHeight)lo.scrollIntoView({block:'end',behavior:noMotion()?'auto':'smooth'})}};
  $(`#${P}LoCancel`).onclick=()=>{const h=get();sfx('click');h.saving=false;h.render()};
  $(`#${P}Best`).onclick=()=>{
    const h=get();sfx('click');
    const all=[];h.pool.forEach(e=>{for(let i=0;i<e.count;i++)all.push(e.id)});
    all.sort((a,b)=>CARDS[b].sum-CARDS[a].sum||CARDS[b].lv-CARDS[a].lv);
    h.sel=legalDeck(all);h.saving=false;h.note='';h.render();
    // the five cards deal onto the mat one after another, then the hand does its "full" wave and glow
    if(!noMotion())$$(`#${P}Slots .card`).forEach((c,k)=>c.animate([{transform:'translateY(-1.6em) scale(1.08)',opacity:0},{transform:'none',opacity:1}],{duration:320,delay:k*70,easing:'cubic-bezier(.2,1.3,.4,1)',fill:'backwards'}));
    if(h.sel.length===5)setTimeout(()=>handFull(h),noMotion()?0:300);
  };
  $(`#${P}Clear`).onclick=()=>{const h=get();sfx('click');h.sel=[];h.saving=false;h.note='';h.render()};
}
function randomDeck(pool){const all=[];pool.forEach(e=>{for(let i=0;i<e.count;i++)all.push(e.id)});return legalDeck(shuffle(all))}
// Couch: any card this account has ever found (even if lost since), up to 5 copies
const foundPool=()=>CARDS.filter(c=>isSeen(c.id)).map(c=>({id:c.id,count:5}));
