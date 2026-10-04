'use strict';
/* =====================================================================
   DECK PICKER
   ===================================================================== */
let DK=null;
function openDeck(o){
  // o: {title, pool:[{id,count}], color, pre:[ids], free (Same screen: count kinds, not copies), onDone(ids), onBack()}
  DK={...o,pfx:'deck',sel:[],f:'all',deal:-1,saving:false,note:'',render:()=>renderDeck()};
  for(const id of (o.pre||[])){if(DK.sel.length<5&&remaining(id)>0&&!rarBlock(DK.sel,id))DK.sel.push(id)}
  $('#deckTitle').textContent=o.title;
  renderDeck();show('deck');$('#scr-deck').scrollTop=0;
}
const remaining=id=>handRemaining(DK,id);
const DECK_RANGES=[['all','All',0],...[1,2,3,4,5].map(r=>[String(r),rarName(r),r])];
const SIDE_NAMES=['Top','Right','Bottom','Left'];
function renderDeck(){
  const col=DK.color||'blue';
  // rarity filter: only offer rarities you hold cards of, and hide the row when there's nothing to choose between
  const inRange=(e,r)=>!r[2]||CARDS[e.id].rar===r[2];
  const ranges=DECK_RANGES.filter(r=>r[0]==='all'||DK.pool.some(e=>inRange(e,r)));
  if(!ranges.some(r=>r[0]===DK.f))DK.f='all';
  $('#deckFilter').innerHTML=ranges.length>2?ranges.map(r=>`<button class="dk-chip ${DK.f===r[0]?'on':''}" data-f="${r[0]}" aria-pressed="${DK.f===r[0]}">${r[1]}</button>`).join(''):'';
  $$('#deckFilter .dk-chip').forEach(b=>b.onclick=()=>{DK.f=b.dataset.f;sfx('click');renderDeck()});
  const n=DK.sel.length;
  // collection grid
  const cur=DECK_RANGES.find(r=>r[0]===DK.f);
  const pool=DK.pool.filter(e=>inRange(e,cur)).sort((a,b)=>CARDS[b.id].rar-CARDS[a.id].rar||CARDS[b.id].lv-CARDS[a.id].lv||CARDS[b.id].sum-CARDS[a.id].sum||a.id-b.id);
  let html='',lastR=0;
  for(const e of pool){
    const c=CARDS[e.id];
    if(c.rar!==lastR){html+=`<h4 class="rar${c.rar}"><span class="rt">${c.rar}★</span> ${RARITY[c.rar-1]}${RAR_CAP[c.rar]?`<small>${RAR_CAP[c.rar]}</small>`:''}</h4>`;lastR=c.rar}
    const r=remaining(e.id),why=r>0?rarBlock(DK.sel,e.id):'',off=r<=0||!!why;
    html+=`<div class="gc ${off?'used':''}" data-id="${e.id}" role="button" aria-label="${esc(cardLabel(e.id))}, ${r} left${why?'. '+why:''}"${why?` title="${why}"`:''}${off?' aria-disabled="true"':''}>${cardHTML(e.id,col,{count:r})}</div>`;
  }
  $('#deckGrid').innerHTML=html;
  $$('#deckGrid .gc').forEach(g=>g.onclick=()=>handAdd(DK,+g.dataset.id));
  const total=DK.free?DK.pool.length:DK.pool.reduce((a,e)=>a+e.count,0);
  $('#deckMeta').textContent=`${total} cards`;
  $('#deckGo').disabled=n!==5;
  $('#deckGo').textContent=n<5?`${n} / 5`:'Play';
  renderHand(DK);
}

/* =====================================================================
   HAND + LOADOUTS — shared by the deck picker (ids "deck…") and the
   collection (ids "coll…"). A hand context looks like
   {pfx, sel:[ids], pool:[{id,count}], color, loadouts, saving, note, deal, render()}
   ===================================================================== */
function handRemaining(h,id){const e=h.pool.find(x=>x.id===id);return e?e.count-h.sel.filter(x=>x===id).length:0}
function handAdd(h,id){
  if(h.sel.length>=5||handRemaining(h,id)<=0)return;
  const why=rarBlock(h.sel,id);
  if(why){h.note=`<span class="bad">${why}</span>`;sfx('click');h.render();return}
  h.sel.push(id);h.deal=h.sel.length-1;h.note='';sfx('place');h.render();
}
function renderHand(h){
  const P=h.pfx,col=h.color||'blue',n=h.sel.length;
  // 5 cards spread in a gentle arc, spaced so each card's art stays visible
  $(`#${P}Slots`).innerHTML=[0,1,2,3,4].map(i=>{
    const d=i-2,t=`translate(${d*5.5}em,${(d*d*.18).toFixed(2)}em) rotate(${d*4}deg)`,id=h.sel[i];
    const st=`style="--t:${t};transform:${t};z-index:${i}"`;
    return id!=null
      ?`<div class="dk-fs" ${st} data-i="${i}" role="button" aria-label="Remove ${esc(CARDS[id].name)}">${cardHTML(id,col,{name:false,cls:i===h.deal?'deal':''})}</div>`
      :`<div class="dk-fs" ${st}><div class="dk-empty">${i+1}</div></div>`}).join('');
  h.deal=-1;
  $$(`#${P}Slots .dk-fs[data-i]`).forEach(s=>s.onclick=()=>{h.sel.splice(+s.dataset.i,1);h.note='';sfx('click');h.render()});
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
  $(`#${P}Lo`).classList.toggle('hidden',!h.loadouts);
  $(`#${P}Save`).classList.toggle('hidden',!h.loadouts);
  if(!h.loadouts)return;
  const col=h.color||'blue';
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
     {label:'Delete',cls:'danger',fn:()=>{SAVE.loadouts[i]=null;fixMain();save();h.note=`Deleted <b>${esc(l.name)}</b>.`;h.render()}}]);
}
// Save hand / Cancel / Best 5 / Clear for one screen; get() returns that screen's current hand context
function wireHand(P,get){
  $(`#${P}Save`).onclick=()=>{const h=get();if(h.sel.length!==5)return;sfx('click');h.saving=!h.saving;h.note='';h.render()};
  $(`#${P}LoCancel`).onclick=()=>{const h=get();sfx('click');h.saving=false;h.render()};
  $(`#${P}Best`).onclick=()=>{
    const h=get();sfx('click');
    const all=[];h.pool.forEach(e=>{for(let i=0;i<e.count;i++)all.push(e.id)});
    all.sort((a,b)=>CARDS[b].sum-CARDS[a].sum||CARDS[b].lv-CARDS[a].lv);
    h.sel=legalDeck(all);h.saving=false;h.note='';h.render();
  };
  $(`#${P}Clear`).onclick=()=>{const h=get();sfx('click');h.sel=[];h.saving=false;h.note='';h.render()};
}
wireHand('deck',()=>DK);
$('#deckGo').onclick=()=>{if(DK.sel.length===5){sfx('click');DK.onDone(DK.sel.slice())}};
$('#deckBack').onclick=()=>{sfx('click');DK&&DK.onBack?DK.onBack():show('menu')};
function randomDeck(pool){const all=[];pool.forEach(e=>{for(let i=0;i<e.count;i++)all.push(e.id)});return legalDeck(shuffle(all))}
// Same screen: any card this account has ever found (even if lost since), up to 5 copies
const foundPool=()=>CARDS.filter(c=>isSeen(c.id)).map(c=>({id:c.id,count:5}));
