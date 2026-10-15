'use strict';
/* =====================================================================
   THE FORGE  (stop II of the market, store.js)
   Extra copies of cards go on the anvil, up to 5 at a time, picked in the
   collection book. Any of them can be dissolved into shards. Five of one
   rarity, 1★ to 3★, can instead be forged, for a shard fee, into one random
   card of the next rarity (one you haven't found yet, while there are any).
   The Forge makes nothing above 4★.
   An extra is a copy you can spare: your last copy of a card always stays,
   and so does every copy a saved loadout uses, or a match that can still
   cost you cards (so cards at stake can't be melted down before the loss).
   Every way through costs more than it gives back (test/forge.test.js
   checks): dissolving pays far less than the card costs, and forging and
   then dissolving the result pays less than dissolving the five.
   ===================================================================== */
const FORGE_MELT=[5,15,40,120,400];   // shards for dissolving one card, by rarity
const FORGE_FEE=[20,50,150];          // the fee to forge five 1★, 2★ or 3★ cards into one of the next rarity
const FORGE_TOP=4;                    // the highest rarity the Forge makes
const FORGE_N=5;                      // places on the anvil, and cards a forging takes

/* ---------- the rules ---------- */
// copies of a card that stay in the book: the last one, or as many as the hand that uses it most. hands: lists of card ids
function forgeKeep(id,hands){let k=1;for(const h of hands||[])if(Array.isArray(h))k=Math.max(k,h.filter(x=>x===id).length);return k}
// the copies you can spare, [{id, count}]; have(id) = how many you own
function forgeExtras(have,hands){return CARDS.map(c=>({id:c.id,count:Math.max(0,have(c.id)-forgeKeep(c.id,hands))})).filter(e=>e.count>0)}
// whether these cards are all spare copies (a trade loss or a new loadout can take one away)
function forgeFits(ids,extras){const left={};extras.forEach(e=>{left[e.id]=e.count});return ids.every(id=>(left[id]=(left[id]||0)-1)>=0)}
// shards for dissolving these cards
const forgeWorth=ids=>ids.reduce((a,id)=>a+FORGE_MELT[CARDS[id].rar-1],0);
// what the cards on the anvil can be forged into: {rar, fee}, or {why} when they can't
function forgeCan(ids){
  if(ids.length!==FORGE_N)return {why:`Forging takes ${FORGE_N} cards of one rarity.`};
  const r=CARDS[ids[0]].rar;
  if(ids.some(id=>CARDS[id].rar!==r))return {why:'Forging takes five cards of the same rarity. These can only be dissolved.'};
  if(r>=FORGE_TOP)return {why:`${FORGE_TOP}★ is the highest the Forge makes. These can only be dissolved.`};
  return {rar:r+1,fee:FORGE_FEE[r-1]};
}
// the card that comes out: one of that rarity you haven't found yet, or any of them once you've found them all
function forgePick(rar,seen,rnd=Math.random){
  const all=CARDS.filter(c=>c.rar===rar),fresh=all.filter(c=>!seen(c.id)),pool=fresh.length?fresh:all;
  return pool[Math.floor(rnd()*pool.length)].id;
}

// Auto-fill: five spares of the forgeable rarity you have the most spares of, the cards you have most of first; null if no
// rarity has five
function forgeFill(extras){
  let best=null;
  for(let r=1;r<FORGE_TOP;r++){
    const es=extras.filter(e=>CARDS[e.id].rar===r),n=es.reduce((a,e)=>a+e.count,0);
    if(n>=FORGE_N&&(!best||n>best.n))best={n,es};
  }
  if(!best)return null;
  const ids=[];
  for(const e of best.es.slice().sort((a,b)=>b.count-a.count||a.id-b.id))for(let k=0;k<e.count&&ids.length<FORGE_N;k++)ids.push(e.id);
  return ids;
}
// how many cards of a rarity are still to find: [left, all]
function forgeLeft(rar,seen){const all=CARDS.filter(c=>c.rar===rar);return [all.filter(c=>!seen(c.id)).length,all.length]}

/* ---------- the anvil (in the market) ---------- */
// the cards on the anvil, kept while the game is open (they stay in your collection until dissolved or forged)
const FG={sel:[]};
// the hands your cards are held for: saved loadouts, online matches you left that can still cost you cards (spare.js),
// and a Solo match with a trade rule you can carry on (match.js; you are player 0)
const forgeHeld=()=>[...SAVE.loadouts.filter(Boolean).map(l=>l.ids),...(SAVE.owes||[]).map(o=>o.deck),
  ...(SAVE.live&&SAVE.live.trade&&SAVE.live.trade!=='none'&&Array.isArray(SAVE.live.decks)?[SAVE.live.decks[0]]:[])];
const forgePool=()=>forgeExtras(owned,forgeHeld());
// drop anything that is no longer a spare copy
function forgeTrim(){const left={};forgePool().forEach(e=>{left[e.id]=e.count});FG.sel=FG.sel.filter(id=>(left[id]=(left[id]||0)-1)>=0)}
// the five places, round the anvil (% of the ring)
const FG_AT=[[50,13],[87,41],[73,87],[27,87],[13,41]];
const FG_ANVIL='<svg class="fg-anvil" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 6h14v2.2c-2.6.3-4.4 1.7-5 4.3h-5.2C10.3 9.8 7.6 8.4 3 8.2V7h4z"/><path d="M9.5 13.8h7l1.5 4.2h1v2H7v-2h1z"/></svg>';
function forgeHTML(){
  forgeTrim();
  const n=FG.sel.length,can=forgeCan(FG.sel),worth=forgeWorth(FG.sel),fill=!can.rar&&forgeFill(forgePool());
  const slots=FG_AT.map(([x,y],i)=>{const id=FG.sel[i];
    return `<button class="fg-slot${id!=null?' on':''}" data-i="${i}" style="left:${x}%;top:${y}%" aria-label="${id!=null?`${esc(CARDS[id].name)} on the anvil. Change the cards`:'An empty place on the anvil. Choose cards'}">${
      id!=null?cardHTML(id,'gold',{name:false}):'<i class="fg-plus" aria-hidden="true">+</i>'}</button>`}).join('');
  const say=!n?'Tap a + to put extra cards on the anvil.'
    :n<FORGE_N?`${n} of ${FORGE_N} on the anvil. Five of one rarity can be forged into the next.`
    :can.rar?`Five ${can.rar-1}★ cards make one random ${can.rar}★.<br>${forgeFind(can.rar)}`:can.why;
  const make=can.rar?`<button class="btn primary fg-make" id="fgMake">Forge a ${can.rar}★ · <span class="st-price${SAVE.shards<can.fee?' short':''}">${shd()}${fmtSh(can.fee)}</span></button>`:'';
  const melt=n?`<button class="st-buy fg-melt" id="fgMelt">Dissolve ${n===FORGE_N?'all 5':n} · +${shd()}${fmtSh(worth)}</button>`:'';
  return `<div class="fg"><div class="fg-ring${can.rar?' ready':''}">${FG_ANVIL}${slots}${fill?`<button class="btn text fg-fill" id="fgFill" aria-label="Auto-fill the anvil with five ${CARDS[fill[0]].rar}★ spares">Auto-fill</button>`:''}${n?'<button class="btn text fg-clear" id="fgClear">Clear</button>':''}</div>
    <p class="fg-say">${say}</p><div class="fg-acts">${make}${melt}</div></div>`;
}
// how much of the rarity a forging makes is still to find (what you're forging toward)
function forgeFind(rar){const [l,t]=forgeLeft(rar,isSeen);return l?`<b>${l} of ${t}</b> ${rar}★ cards still to find`:`You've found every ${rar}★ card`}
// renderStore (store.js) calls this once the market is drawn
function forgeWire(){
  $$('#stBody .fg-slot').forEach(b=>b.onclick=()=>{sfx('click');forgeOpen()});
  const m=$('#fgMake'),d=$('#fgMelt'),c=$('#fgClear'),f=$('#fgFill');
  if(f)f.onclick=()=>{const ids=forgeFill(forgePool());if(!ids)return;sfx('coll_hand_full');FG.sel=ids;renderStore();stGo(stIdx(),false);
    if(!noMotion())$$('#stBody .fg-slot.on').forEach((s,i)=>s.animate([{transform:'translate(-50%,-50%) translateY(-1.2em) scale(1.1)',opacity:0},{transform:'translate(-50%,-50%)',opacity:1}],{duration:300,delay:i*70,easing:'cubic-bezier(.2,1.3,.4,1)',fill:'backwards'}))};
  if(m)m.onclick=()=>{sfx('click');forgeMakeAsk()};
  if(d)d.onclick=()=>{sfx('click');forgeMeltAsk()};
  if(c)c.onclick=()=>{sfx('click');FG.sel=[];renderStore();stGo(stIdx(),false)};
}

/* ---------- choosing the cards: the collection book in "forge" mode ---------- */
function forgeOpen(){
  forgeTrim();const pool=forgePool();
  if(!pool.length){toast('You have no extra copies yet. Every copy after your first one can go on the anvil.',3200);return}
  const n=pool.reduce((a,e)=>a+e.count,0);
  // anyRar: no deck rarity limits, it's not a hand for a match. min: Done works with any number of cards (none clears the anvil)
  const h={pfx:'coll',sel:[],pool,color:'gold',loadouts:false,saving:false,note:'',deal:-1,forge:true,anyRar:true,min:0,
    render:()=>forgeHand(),onDone:ids=>{FG.sel=ids;forgeBack()},onBack:()=>forgeBack()};
  h.sel=FG.sel.slice();
  collMode(h,'The Forge',`${n} extra card${n===1?'':'s'} to dissolve or forge · your last copies stay`);
  BD.p=0;show('coll');$('#scr-coll').scrollTop=0;
  bdRender();forgeHand();
}
function forgeHand(){
  const h=BH,n=h.sel.length;
  renderHand(h);bdSyncAdd();
  $('#collWorth b').innerHTML=`${shd()}${fmtSh(forgeWorth(h.sel))}`;
  $('#collGo').disabled=false;
  $('#collGo').textContent=n?`Put ${n} on the anvil`:FG.sel.length?'Clear the anvil':'Back to the market';
}
// back to the market, on the Forge (not the sky a phone opens on)
function forgeBack(){
  stStop='forge';stDown=false;clearInterval(stSheet.c);
  $('#scr-store').classList.remove('st-down','st-bar');
  renderStore();show('store');stGo(stIdx(),false);
}

/* ---------- dissolving and forging ---------- */
// cards of 3★ and up take a few seconds to confirm (helpers.js), so a rare card isn't lost to a quick tap
const fgRow=ids=>`<div class="fg-row">${ids.map(id=>cardHTML(id,'gold')).join('')}</div>`;
function forgeMeltAsk(){
  const ids=FG.sel.slice(),worth=forgeWorth(ids),n=ids.length;if(!n)return;
  modal(`<div class="kick">The Forge</div><h2>Dissolve ${n} card${n>1?'s':''}?</h2>${fgRow(ids)}
    <p>${n>1?'They melt':'It melts'} into shards. This can't be undone.</p><p class="st-cost">${shd()}<b>+${fmtSh(worth)}</b> · you have ${fmtSh(SAVE.shards)}</p>`,
    [{label:'Dissolve',cls:'primary',wait:ids.some(id=>CARDS[id].rar>=3),fn:()=>forgeMelt(ids)},{label:'Cancel',esc:true}]);
}
function forgeMelt(ids){
  if(!forgeFits(ids,forgePool())){toast('Some of those cards are no longer spare.');renderStore();stGo(stIdx(),false);return}
  const worth=forgeWorth(ids);
  ids.forEach(collRemove);SAVE.shards+=worth;FG.sel=[];save();
  sfx('badge_claim');
  forgeSink(()=>{renderStore();stGo(stIdx(),false);renderStoreTile();toast(`+${fmtSh(worth)} shards`)});
}
function forgeMakeAsk(){
  const ids=FG.sel.slice(),can=forgeCan(ids);if(!can.rar||short(can.fee))return;
  const fresh=CARDS.some(c=>c.rar===can.rar&&!isSeen(c.id));
  modal(`<div class="kick">The Forge</div><h2>Forge a ${can.rar}★ card?</h2>${fgRow(ids)}
    <p>The five cards are used up. Out comes one random ${rarName(can.rar)} card${fresh?', one you haven\'t found yet':''}.</p>
    <p class="st-cost">${shd()}<b>${fmtSh(can.fee)}</b> · you have ${fmtSh(SAVE.shards)}</p>`,
    [{label:'Forge',cls:'primary',wait:can.rar>3,fn:()=>forgeMake(ids)},{label:'Cancel',esc:true}]);
}
function forgeMake(ids){
  const can=forgeCan(ids);
  if(!can.rar||!forgeFits(ids,forgePool())||SAVE.shards<can.fee){toast('The anvil changed. Check the cards and try again.');renderStore();stGo(stIdx(),false);return}
  const id=forgePick(can.rar,isSeen),fresh=!isSeen(id);
  ids.forEach(collRemove);SAVE.shards-=can.fee;collAdd(id);FG.sel=[];
  earn('forge1');if(can.rar===FORGE_TOP)earn('forge4');profCheck();save();
  sfx('place');
  forgeSink(()=>{
    renderStore();stGo(stIdx(),false);renderStoreTile();
    const c=CARDS[id];sfx(`pack_reveal_${c.rar}`);
    modal(`<div class="kick">Forged</div><h2>${esc(c.name)}</h2><div class="st-one fg-new">${cardHTML(id,'gold')}</div>
      <p class="fg-got">${rarName(c.rar)}${fresh?' · <b>new to your collection</b>':''}</p>`,[{label:'Done',cls:'primary',esc:true}]);
    freshToast();
  },true);
}
// the cards on the anvil sink into it (and it flashes when they're forged), then the market is drawn again
function forgeSink(then,flash){
  const ring=$('#stBody .fg-ring');
  if(!ring||noMotion()){then();return}
  const W=ring.clientWidth/100,H=ring.clientHeight/100;
  $$('#stBody .fg-slot.on').forEach((s,i)=>s.animate([{transform:'translate(-50%,-50%)',opacity:1},{transform:`translate(-50%,-50%) translate(${(50-parseFloat(s.style.left))*W}px,${(52-parseFloat(s.style.top))*H}px) scale(.4)`,opacity:0}],
    {duration:380,delay:i*40,easing:'cubic-bezier(.5,0,.75,0)',fill:'forwards'}));
  const a=ring.querySelector('.fg-anvil');
  if(flash&&a)a.animate([{filter:'none',transform:'translate(-50%,-50%)'},{filter:'drop-shadow(0 0 18px var(--sc)) brightness(1.8)',transform:'translate(-50%,-50%) scale(1.15)',offset:.3},{filter:'none',transform:'translate(-50%,-50%)'}],{duration:520,delay:420});
  setTimeout(then,flash?900:520);
}
