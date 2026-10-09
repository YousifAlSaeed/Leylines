'use strict';
/* =====================================================================
   EXPEDITION  (the Expedition tab on the Play card; rules and data in exp-core.js)
   The run lives in SAVE.exp and is saved after every step, so it waits
   when the app closes. The 5 cards you bring leave your collection while
   the run is on (so they can't be used or lost anywhere else) and come
   back when you go home. A match the app closed on counts as a loss.
   ===================================================================== */
const EXN=()=>SAVE.exp;
const exAct=()=>EXP_ACTS[EXN().act];
const strHash=s=>{let h=2166136261;for(const c of String(s))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0};
// the same random numbers for the same stop, so closing the app and coming back changes nothing
function exRng(...k){let a=EXN().seed>>>0;for(const v of k)a=(Math.imul(a^(typeof v==='number'?v:strHash(v)),0x9E3779B1)+0x7F4A7C15)>>>0;return mulberry32(a)}
const emChip=n=>`<span class="pf-ember"><i class="em-i" aria-hidden="true"></i>+${n} Embers</span>`;
const emTxt=n=>`<span class="ex-em"><i class="em-i" aria-hidden="true"></i>${n}</span>`;
const heartsTxt=r=>`<span class="ex-hp" aria-label="${r.hp} of ${maxHearts(r)} hearts">${'❤'.repeat(Math.max(0,r.hp))}<i>${'❤'.repeat(Math.max(0,maxHearts(r)-r.hp))}</i></span>`;
const relicHTML=(id,cls='')=>{const R=RELICS[id];return `<span class="ex-rel t${R.t} ${cls}" title="${esc(R.n+': '+R.d+(R.c?' Catch: '+R.c:''))}">${R.i}</span>`};
const scrollHTML=id=>`<span class="ex-scr" title="${esc(SCROLLS[id].n+': '+SCROLLS[id].d)}">${SCROLLS[id].i}</span>`;
const bagCard=(i,col='blue',o={})=>cardHTML(RUN_ID+i,col,o);
// a card of the run as the player sees it: name, star rating, numbers
const bagLabel=i=>cardLabel(RUN_ID+i);
function exSave(){expCards(EXN());save()}

// a match the app closed on counts as a loss: a heart, said when the Expedition opens next
function expClosed(r){const ev=r.live.ev;r.live=null;if(!expLoss(r,ev))r.over='closed';r.note='closed';save()}
{const r=SAVE.exp;if(r&&r.live)expClosed(r)}
// a lost match: a heart (the Ghost Duel takes Embers instead). false: that was the last heart
function expLoss(r,ev){
  if(ev==='ghost'){r.em=Math.max(0,r.em-40);r.ev.done=1;return true}
  const alive=exLoseHeart(r);
  // an event's match ends the event; a map match can be tried again (or another path taken)
  if(ev==='toll')r.ev.done=1;else{r.tries++;r.at=null}
  return alive;
}
// takes a heart (a Lucky Charm saves it, a Phoenix Feather brings you back once). false: the run is lost
function exLoseHeart(r,o={}){
  if(!o.noCharm){const k=r.scrolls.indexOf('lucky');if(k>=0){r.scrolls.splice(k,1);r.saved='lucky';return true}}
  r.hp--;
  if(r.hp>0)return true;
  if(hasRelic(r,'phoenix')&&!r.pho){r.pho=1;r.hp=1;r.saved='phoenix';return true}
  return false;
}

/* ---------- the menu's Expedition tab ---------- */
const EXP_ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4L3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5z"/><path d="M9 4v13M15 6.5v13"/></svg>';
function expPane(){
  const r=EXN(),rec=SAVE.expRec;
  const stamps=`<div class="dly-stamps ex-stamps" aria-hidden="true">${EXP_ACTS.map((a,i)=>`<i class="${r&&i<=r.act?'on':!r&&i<rec.best?'on':''}">${a.art}</i>`).join('')}</div>`;
  if(!r)return {h:'Expedition',sub:'A long road with your own cards',side:stamps,
    stats:[[rec.clears,rec.clears===1?'run cleared':'runs cleared'],[rec.best?`Act ${rec.best}`:'—','best'],[`${EXP_HEARTS} ❤`,'hearts a run']],
    row:'<button class="btn primary full" id="heroGo">Start a run</button><button class="btn full" id="heroHow">How it works</button>'};
  expCards(r);
  return {h:'Expedition',sub:`Act ${r.act+1} · ${esc(exAct().name)}`,side:stamps,
    stats:[[`${r.hp}/${maxHearts(r)} ❤`,'hearts'],[`<i class="em-i"></i>${r.em}`,'Embers'],(n=>[n,n===1?'card won':'cards won'])(r.bag.filter(e=>e.k==='spoil'&&!e.x).length)],
    row:'<button class="btn primary full" id="heroGo">Continue run</button><button class="btn full" id="heroHow">How it works</button>'};
}
function bindExp(){
  $('#heroGo').onclick=()=>{sfx('click');openExp()};
  $('#heroHow').onclick=()=>{sfx('click');expHow()};
}
function expHow(start){
  modal(`<div class="kick">Expedition</div><h2>How it works</h2>
    <div class="ex-how">
      <p>🎒 <b>Bring 5 of your own cards.</b> They leave your collection for the run.</p>
      <p>🗺️ <b>3 acts</b>, each a map. Pick a path through matches and stops. A <b>boss with its own trick</b> waits at the top.</p>
      <p>⚒️ Forges, markets and events <b>upgrade your cards</b> and give you <b>relics</b> and <b>scrolls</b>. They last for this run only.</p>
      <p>🏆 Beat a CPU and <b>take 1 of its cards</b>.</p>
      <p>⛩️ After acts 1 and 2 a <b>Waystone</b> lets you go home with your cards and a reward, or go on for more.</p>
      <p>❤️ You have <b>3 hearts</b>. Each lost match costs one. Lose all 3 and <b>the cards you brought are gone</b>.</p>
    </div>`,start?[{label:'Pick 5 cards',cls:'primary',fn:expNewRun},{label:'Not now',esc:true}]:[{label:'Got it',cls:'primary',esc:true}]);
}

/* ---------- a new run ---------- */
function openExp(){
  const r=EXN();
  if(!r){expHow(true);return}
  if(r.live&&!G)expClosed(r);
  show('exp');renderExp();
  setTimeout(expResume,250);
}
function expNewRun(){
  if(deckable(collPool())<5)ensureMinimum();
  openDeck({title:'Expedition · bring 5',pool:collPool(),pre:preDeck(),color:'blue',loadouts:true,onDone:expWard,onBack:()=>show('menu')});
}
// optional: pay shards to keep one card safe if the run is lost
function expWard(ids){
  let pick=-1;
  const price=i=>WARD_PRICE[CARDS[ids[i]].rar-1];
  const draw=()=>{
    const box=modal(`<div class="kick">Expedition</div><h2 class="nm2">Ward one card?</h2>
      <p>A warded card comes home even if you lose the run. You have ${shd()}<b>${fmtSh(SAVE.shards)}</b> shards.</p>
      <div class="cardrow">${ids.map((id,i)=>`<div class="pk${pick===i?' on':''}${SAVE.shards<price(i)?' off':''}" data-i="${i}" role="button" aria-pressed="${pick===i}" aria-label="${esc(cardLabel(id))}, ward for ${price(i)} shards">${cardHTML(id,'blue')}<small class="ex-price">${shd()}${price(i)}</small></div>`).join('')}</div>`,
      [{label:pick<0?'No ward':`Ward it · ${price(pick)} shards`,cls:'primary',fn:()=>expBegin(ids,pick)},{label:'Back',fn:expNewRun}]);
    box.querySelectorAll('.pk:not(.off)').forEach(el=>el.onclick=()=>{const i=+el.dataset.i;pick=pick===i?-1:i;sfx('click');draw()});
  };
  draw();
}
function expBegin(ids,ward){
  // the cards must still be there (the picker only offers cards you own)
  const need={};if(ids.some(id=>(need[id]=(need[id]||0)+1)>owned(id))){toast('You no longer have those cards.');show('menu');return}
  if(ward>=0){const p=WARD_PRICE[CARDS[ids[ward]].rar-1];if(SAVE.shards<p)ward=-1;else SAVE.shards-=p}
  ids.forEach(collRemove);
  const seed=rand32();
  SAVE.exp={v:1,seed,act:0,hp:EXP_HEARTS,em:0,bag:ids.map((b,i)=>({b,u:[0,0,0,0],k:'own',...(i===ward?{w:1}:{})})),hand:[0,1,2,3,4],
    relics:[],scrolls:[],map:null,pos:null,path:[],at:null,boss:null,evs:[],fx:{},sh:0,tries:0,wins:0,start:null,bossRelic:null,pend:null,shop:null,ev:null};
  const r=SAVE.exp;
  r.boss=EXP_ACTS.map((a,i)=>a.bosses[Math.floor(exRng('boss',i)()*a.bosses.length)]);
  r.map=expMap(exRng('map',0));
  r.evs=shuffle(EVENTS.slice(),exRng('events'));
  const g=exRng('start');r.start=shuffle(Object.keys(RELICS).filter(k=>RELICS[k].t===1),g).slice(0,3);
  SAVE.lastDeck=ids;
  SAVE.expRec.runs++;SAVE.expRec.best=Math.max(SAVE.expRec.best,1);
  exSave();
  show('exp');renderExp();setTimeout(expResume,250);
}
// what's still waiting: a starting relic, a boss relic, cards to take, a stop you were at, news about a match
function expResume(){
  const r=EXN();if(!r||!$('#scr-exp').classList.contains('on')||$('#modal').classList.contains('on'))return;
  if(r.over){expRunOver();return}
  if(r.note==='closed'){r.note=null;save();modal(`<h2 class="nm2">Match lost</h2><p>The app closed during a match, so it counted as a loss.</p>${savedNote(r)}<p>${heartsTxt(r)}</p>`,[{label:'OK',cls:'primary',esc:true,fn:expResume}]);return}
  if(r.start){expPickRelic(r.start,'Pick a starting relic','It lasts the whole run.',k=>{r.start=null;r.relics.push(k);exSave();renderExp()});return}
  if(r.pend){expTakeSpoils();return}
  if(r.bossRelic){expBossRelic();return}
  // the boss is beaten: on to the Waystone
  if(atTop(r)){r.act<2?expWaystone():expClear();return}
  if(r.at)expStop();
}
const atTop=r=>!!r.pos&&r.pos[0]===r.map.length-1;
const savedNote=r=>{const s=r.saved;r.saved=null;return s==='lucky'?'<p>🍀 Your <b>Lucky Charm</b> saved the heart.</p>':s==='phoenix'?'<p>🪶 Your <b>Phoenix Feather</b> brought you back with 1 heart.</p>':''};

/* ---------- the map screen ---------- */
function renderExp(){
  const r=EXN();if(!r){show('menu');return}
  expCards(r);
  const A=exAct(),B=EXP_BOSS[r.boss[r.act]];
  $('#exTitle').textContent=`Act ${r.act+1} · ${A.name}`;
  $('#exBal').innerHTML=emTxt(r.em);
  const live=bagLive(r);
  $('#exBody').innerHTML=`
    <div class="ex-hud">
      ${heartsTxt(r)}
      <button class="ex-pills" id="exKit" aria-label="Relics and scrolls">${r.relics.map(k=>relicHTML(k)).join('')||'<small>No relics yet</small>'}<em>${r.scrolls.map(scrollHTML).join('')}${'<span class="ex-scr none"></span>'.repeat(Math.max(0,scrollSlots(r)-r.scrolls.length))}</em></button>
    </div>
    <button class="ex-boss" id="exBoss"><span class="ex-face">${B.art}</span><span><small>Act ${r.act+1} boss</small><b>${esc(B.name)}</b><i>${B.icon} ${esc(B.trick)}</i></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>
    <div class="ex-mapbox">${expMapSVG(r)}</div>
    <p class="ex-legend">${['fight','elite','forge','market','camp','chest','event'].map(t=>`<span>${STOP[t].i} ${STOP[t].n}</span>`).join('')}</p>
    <div class="ex-bag"><h3>Your bag <em>${live.length} cards</em></h3><div class="cardrow">${live.map(i=>`<div class="ex-bc">${bagCard(i)}${bagTag(r,i)}</div>`).join('')}</div></div>
    ${atTop(r)?'<button class="btn primary" id="exWay">Go to the Waystone</button>':''}
    <button class="btn text ex-quit" id="exQuit">Give up the run</button>`;
  const wb=$('#exWay');if(wb)wb.onclick=()=>{sfx('click');expResume()};
  $$('#exBody .ex-n.can').forEach(n=>{
    const go=()=>{sfx('click');expGo(+n.dataset.r,+n.dataset.i)};
    n.addEventListener('click',go);n.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go()}});
  });
  $('#exBoss').onclick=()=>{sfx('click');expBossInfo()};
  $('#exKit').onclick=()=>{sfx('click');expKit()};
  $('#exQuit').onclick=()=>{sfx('click');modal(`<h2 class="nm2">Give up the run?</h2><p>It counts as losing the run: <b>the cards you brought are gone</b>${r.bag.some(e=>e.w)?' (your warded card comes home)':''}.</p>`,
    [{label:'Give up',cls:'danger',fn:()=>{EXN().over='gave';save();expRunOver()}},{label:'Keep going',cls:'primary',esc:true}])};
}
function bagTag(r,i){
  const e=r.bag[i],t=e.w?'🛡️ Ward':e.k==='spoil'?'Won':e.k==='hire'?'Hired':e.k==='twin'?'Twin':'';
  return t?`<small class="ex-tag ${e.k}">${t}</small>`:'';
}
// the act's map: rows from the bottom, the boss on top. Stops you can go to now glow
function expMapSVG(r){
  const M=r.map,W=300,step=72,H=60+(M.length-1)*step,next=expNext(M,r.pos).map(p=>p.join());
  const pos=(ri,i)=>{const n=M[ri].length,xs=n===1?[150]:n===2?[95,205]:[55,150,245],j=exRng('xy',r.act,ri,i);
    return [xs[i]+(n>1?(j()-.5)*22:0),H-34-ri*step+(ri&&ri<M.length-1?(j()-.5)*14:0)]};
  const on=new Set(r.path.map(p=>p.join())),cur=r.pos?r.pos.join():'';
  let lines='',nodes='';
  M.forEach((row,ri)=>row.forEach((n,i)=>{
    const [x,y]=pos(ri,i);
    n.to.forEach(j=>{const [x2,y2]=pos(ri+1,j),walked=on.has(`${ri},${i}`)&&on.has(`${ri+1},${j}`),can=cur===`${ri},${i}`&&next.includes(`${ri+1},${j}`);
      lines+=`<line class="ex-p${walked?' on':can?' can':''}" x1="${x}" y1="${y}" x2="${x2}" y2="${y2}"/>`});
    const k=`${ri},${i}`,boss=n.t==='boss',can=next.includes(k)&&!r.at,cls=boss?'boss':'',st=can?'can':on.has(k)?'done':'',rad=boss?26:18;
    const ic=boss?EXP_BOSS[r.boss[r.act]].art:STOP[n.t].i;
    nodes+=`<g class="ex-n ${cls} ${st}${cur===k?' now':''}" data-r="${ri}" data-i="${i}"${can?` role="button" tabindex="0" aria-label="${boss?'Boss: '+esc(EXP_BOSS[r.boss[r.act]].name):STOP[n.t].n}"`:''}>`+
      `<circle cx="${x}" cy="${y}" r="${rad}"/><text x="${x}" y="${y+1}" style="font-size:${boss?24:17}px">${ic}</text></g>`;
  }));
  return `<svg class="ex-map" viewBox="0 0 ${W} ${H}" role="group" aria-label="Map of act ${r.act+1}">${lines}${nodes}</svg>`;
}
function expBossInfo(){
  const r=EXN(),B=EXP_BOSS[r.boss[r.act]];
  modal(`<div class="kick">Act ${r.act+1} boss</div><div class="ex-bigface">${B.art}</div><h2 class="nm2">${esc(B.name)}</h2>
    <div class="ex-trick"><b>${B.icon} ${esc(B.trick)}</b><span>${esc(B.text)}</span></div><p class="dly-note">Tip: ${esc(B.tip)}</p>`,[{label:'OK',cls:'primary',esc:true}]);
}
function expKit(){
  const r=EXN(),rel=r.relics.map(k=>{const R=RELICS[k];return `<div class="ex-row">${relicHTML(k)}<div><b>${esc(R.n)}</b><span>${esc(R.d)}</span>${R.c?`<span class="ex-bd">Catch: ${esc(R.c)}</span>`:''}</div></div>`}).join('');
  const sc=r.scrolls.map(k=>{const S=SCROLLS[k];return `<div class="ex-row">${scrollHTML(k)}<div><b>${esc(S.n)}</b><span>${esc(S.d)}</span></div></div>`}).join('');
  modal(`<h2 class="nm2">Relics and scrolls</h2><div class="ex-list">${rel||'<p>No relics yet. Find them in chests, from elites, at markets and from bosses.</p>'}</div>
    <h3 class="ex-h3">Scrolls · ${r.scrolls.length} of ${scrollSlots(r)}</h3><div class="ex-list">${sc||'<p>No scrolls. Markets sell them; you use them during a match.</p>'}</div>`,[{label:'Close',cls:'primary',esc:true}]);
}

/* ---------- moving on the map ---------- */
function expGo(ri,i){
  const r=EXN();if(!r||r.at||!expNext(r.map,r.pos).some(p=>p[0]===ri&&p[1]===i))return;
  const t=r.map[ri][i].t;
  // matches only start once you tap Fight; every other stop starts as soon as you go to it
  if(t==='fight'||t==='elite'||t==='boss'){expBrief(ri,i);return}
  r.at=[ri,i];r.shop=null;r.ev=null;save();expStop();
}
function expStop(){
  const r=EXN(),[ri,i]=r.at,t=r.map[ri][i].t;
  // a match that never started: back to its briefing
  if(t==='fight'||t==='elite'||t==='boss'){r.at=null;save();expBrief(ri,i);return}
  ({forge:expForge,market:expMarket,camp:expCamp,chest:expChest,event:expEvent}[t]||expDone)();
}
// the stop is over: you stand on it now
function expDone(){
  const r=EXN();if(!r)return;
  if(r.at){r.pos=r.at;r.path.push(r.at)}
  r.at=null;r.shop=null;r.ev=null;exSave();
  if($('#scr-exp').classList.contains('on'))renderExp();else{show('exp');renderExp()}
}

/* ---------- picking cards and sides ---------- */
// resolves with a bag index, or null for Back. ok(entry, index): which cards can be picked
function pickBag(title,text,ok=()=>true){
  return new Promise(res=>{
    const r=EXN(),ids=bagLive(r);
    const box=modal(`<h2 class="nm2">${title}</h2><p>${text}</p><div class="cardrow">${ids.map(i=>{const can=ok(r.bag[i],i);
      return `<div class="pk${can?'':' off'}" data-i="${i}" role="button"${can?' tabindex="0"':' aria-disabled="true"'} aria-label="${esc(bagLabel(i))}">${bagCard(i)}</div>`}).join('')}</div>`,
      [{label:'Back',esc:true,fn:()=>res(null)}]);
    box.querySelectorAll('.pk:not(.off)').forEach(el=>{const go=()=>{sfx('click');closeModal();res(+el.dataset.i)};el.onclick=go;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go()}}});
  });
}
// resolves with a side (0 top … 3 left), or null. delta: what happens to it; skip: a side that can't be picked
function pickSide(i,title,delta,skip=-1){
  return new Promise(res=>{
    const s=RUNC[RUN_ID+i].s;
    const can=k=>k!==skip&&s[k]+delta>=1&&s[k]+delta<=10&&!(delta===0);
    const btn=k=>`<button class="btn ex-side${can(k)?'':' off'}" data-k="${k}"${can(k)?'':' disabled'} aria-label="${SIDE_NAMES[k]}: ${fmt(s[k])}${can(k)?' to '+fmt(s[k]+delta):''}"><small>${SIDE_NAMES[k]}</small>`+
      `<b>${fmt(s[k])}${can(k)?` → <i class="${delta>0?'ex-g':'ex-bd'}">${fmt(s[k]+delta)}</i>`:''}</b></button>`;
    const box=modal(`<h2 class="nm2">${title}</h2><div class="ex-forge"><span></span>${btn(0)}<span></span>${btn(3)}<div class="bigcard">${bagCard(i)}</div>${btn(1)}<span></span>${btn(2)}<span></span></div>
      <p class="dly-note">A side can't go above X (10) or below 1.</p>`,[{label:'Back',esc:true,fn:()=>res(null)}]);
    box.querySelectorAll('.ex-side:not(.off)').forEach(b=>b.onclick=()=>{sfx('click');closeModal();res(+b.dataset.k)});
  });
}
const sideOk=(i,delta)=>{const s=RUNC[RUN_ID+i].s;return s.some(v=>v+delta>=1&&v+delta<=10)};
// one card upgrade: +n to a side you pick. Resolves true when it's done
async function upgradeSide(n,title){
  const i=await pickBag(title,`Pick a card for <b>+${n}</b> on one side.`,(e,k)=>sideOk(k,n));if(i==null)return false;
  const sd=await pickSide(i,`+${n} to which side?`,n);if(sd==null)return upgradeSide(n,title);
  EXN().bag[i].u[sd]+=n;exSave();sfx('win');return true;
}
// the Market's card work and some events: resolves true once the card is changed
async function doWork(id){
  const r=EXN();
  if(id==='up1')return upgradeSide(1,'+1 to a side');
  if(id==='up2')return upgradeSide(2,'+2 to a side');
  if(id==='polish'){const i=await pickBag('Polish','A 1★ or 2★ card gets <b>+1 on every side</b>.',e=>CARDS[e.b].rar<=2);if(i==null)return false;r.bag[i].u=r.bag[i].u.map(v=>v+1);exSave();return true}
  if(id==='turn'){const i=await pickBag('Turn a card','Its numbers move one side round: the top number goes to the right, and so on.');if(i==null)return false;
    const e=r.bag[i];e.r=((e.r||0)+1)%4;e.u=[e.u[3],e.u[0],e.u[1],e.u[2]];exSave();return true}
  if(id==='shift'){const i=await pickBag('Shift','Move 1 point from one side of a card to another.');if(i==null)return false;
    const a=await pickSide(i,'Take 1 from which side?',-1);if(a==null)return doWork(id);
    const b=await pickSide(i,'Add it to which side?',1,a);if(b==null)return doWork(id);
    r.bag[i].u[a]--;r.bag[i].u[b]++;exSave();return true}
  if(id==='element'){const i=await pickBag('Element stone','Give a card an element. On a square of the same element it gets +1.');if(i==null)return false;
    const el=await new Promise(res=>{const box=modal(`<h2 class="nm2">Which element?</h2><div class="ex-els">${ELEM_KEYS.map(k=>`<button class="btn" data-k="${k}">${ELEM[k]} ${k[0].toUpperCase()+k.slice(1)}</button>`).join('')}</div>`,[{label:'Back',esc:true,fn:()=>res(null)}]);
      box.querySelectorAll('.ex-els .btn').forEach(b=>b.onclick=()=>{sfx('click');closeModal();res(b.dataset.k)})});
    if(el==null)return doWork(id);r.bag[i].e=el;exSave();return true}
  return false;
}
function expPickRelic(ids,title,text,done,skip){
  const box=modal(`<div class="kick">Expedition</div><h2 class="nm2">${title}</h2><p>${text}</p><div class="ex-picks">${ids.map(k=>{const R=RELICS[k];
    return `<button class="ex-pick" data-k="${k}">${relicHTML(k)}<span><b>${esc(R.n)}</b>${esc(R.d)}${R.c?`<em>Catch: ${esc(R.c)}</em>`:''}</span></button>`}).join('')}</div>`,
    skip?[{label:'Skip',fn:skip}]:[]);
  box.querySelectorAll('.ex-pick').forEach(b=>b.onclick=()=>{sfx('win');closeModal();done(b.dataset.k)});
}

/* ---------- stops ---------- */
function expForge(){
  const r=EXN(),free2=hasRelic(r,'engine'),n=r.forgeN||0,two=hasRelic(r,'whetstone');
  const head=`<div class="kick">Forge</div><div class="ex-bigface">⚒️</div><h2 class="nm2">The Forge</h2><p>${two?`Whetstone: <b>2 upgrades</b> here (${n} of 2 done).`:'One upgrade per visit.'} You have ${emTxt(r.em)}.</p>`;
  const after=async ok=>{if(!ok){expForge();return}r.forgeN=n+1;if(two&&r.forgeN<2){save();expForge();return}r.forgeN=0;expDone()};
  modal(head,[
    ...(free2?[]:[{label:'+1 to a side · free',cls:'primary',fn:async()=>after(await upgradeSide(1,'Forge'))}]),
    {label:free2?'+2 to a side · free':`+2 to a side · ${EXP_PRICE.forge2} Embers`,cls:free2?'primary':'',fn:async()=>{
      if(!free2&&r.em<EXP_PRICE.forge2){toast('Not enough Embers.');expForge();return}
      const ok=await upgradeSide(2,'Forge');if(ok&&!free2){r.em-=EXP_PRICE.forge2;save()}after(ok)}},
    {label:'Leave',fn:()=>{r.forgeN=0;expDone()}}]);
}
function expCamp(){
  const r=EXN(),heal=hasRelic(r,'lantern')?0:Math.min(hasRelic(r,'spring')?2:1,maxHearts(r)-r.hp);
  modal(`<div class="kick">Camp</div><div class="ex-bigface">🔥</div><h2 class="nm2">A quiet camp</h2><p>Rest by the fire, or train a card.</p><p>${heartsTxt(r)}</p>${hasRelic(r,'lantern')?'<p class="ex-bd">Black Lantern: camps can\'t heal you.</p>':''}`,[
    {label:heal?`Rest · +${heal} ❤`:'Rest',cls:heal?'primary':'',fn:()=>{if(!heal){toast(hasRelic(r,'lantern')?'The Black Lantern stops you resting.':'Your hearts are full.');expCamp();return}r.hp+=heal;sfx('win');expDone()}},
    {label:'Train · +1 to a side',cls:heal?'':'primary',fn:async()=>{if(await upgradeSide(1,'Train'))expDone();else expCamp()}}]);
}
function expChest(){
  const r=EXN(),g=exRng('chest',r.act,...r.at),k=relicOf(r,g,relicTier(g));
  if(!k){r.em+=40;modal(`<h2 class="nm2">A chest</h2><p>You have every relic already. Inside: ${emTxt(40)} Embers.</p>`,[{label:'Take',cls:'primary',fn:expDone}]);save();return}
  expPickRelic([k],'A chest!','Inside is a relic.',id=>{r.relics.push(id);expDone()});
}
// the Market: about 6 things for sale, the same ones if you come back to it
function shopStock(r,rr){
  const g=exRng('shop',r.act,...r.at,rr),st=[];
  if(!hasRelic(r,'engine'))shuffle(Object.keys(WORK),g).slice(0,3).forEach(id=>st.push({k:'work',id}));
  // Peek only helps when hands are hidden (Act 3)
  shuffle(Object.keys(SCROLLS).filter(k=>k!=='peek'||exAct().rules.open===false),g).slice(0,2).forEach(id=>st.push({k:'scroll',id}));
  if(!hasRelic(r,'coin')){const id=relicOf(r,g,relicTier(g));if(id)st.push({k:'relic',id})}
  const A=exAct();st.push({k:'hire',id:expHand(g,[A.bands[2+Math.floor(g()*3)]])[0]});
  return st;
}
const stockPrice=(r,s)=>priceOf(r,s.k==='work'?WORK[s.id].p:s.k==='scroll'?SCROLLS[s.id].p:s.k==='relic'?RELIC_PRICE[RELICS[s.id].t]:HIRE_PRICE[CARDS[s.id].rar-1]);
function expMarket(){
  const r=EXN();
  if(!r.shop){r.shop={rr:0,sold:[],stock:shopStock(r,0)};save()}
  const S=r.shop,heartP=priceOf(r,EXP_PRICE.heart),rrP=EXP_PRICE.reroll;
  const row=(s,i)=>{
    const p=stockPrice(r,s),sold=S.sold.includes(i);
    const [ic,name,d]=s.k==='work'?[WORK[s.id].i,WORK[s.id].n,WORK[s.id].d]:s.k==='scroll'?[SCROLLS[s.id].i,'Scroll · '+SCROLLS[s.id].n,SCROLLS[s.id].d]
      :s.k==='relic'?[RELICS[s.id].i,'Relic · '+RELICS[s.id].n,RELICS[s.id].d]:[cardHTML(s.id,'blue',{name:false}),'Hire · '+CARDS[s.id].name,'Joins your bag for this run only.'];
    return `<div class="ex-item ${s.k}${sold?' sold':''}"><span class="ex-ic">${ic}</span><span class="ex-it"><b>${esc(name)}</b>${esc(d)}</span>`+
      `<button class="btn small" data-i="${i}"${sold||r.em<p?' disabled':''}>${sold?'Sold':emTxt(p)}</button></div>`;
  };
  const box=modal(`<div class="kick">Market</div><h2 class="nm2">The Market</h2><p>You have ${emTxt(r.em)} · scrolls ${r.scrolls.length} of ${scrollSlots(r)} · ${heartsTxt(r)}</p>
    <div class="ex-shop">${S.stock.map(row).join('')}
      <div class="ex-item"><span class="ex-ic">❤️</span><span class="ex-it"><b>A heart back</b>Up to ${maxHearts(r)}.</span><button class="btn small" id="exHeart"${r.hp>=maxHearts(r)||r.em<heartP?' disabled':''}>${emTxt(heartP)}</button></div>
    </div>`,[{label:`Reroll · ${rrP}`,keep:true,fn:()=>{if(r.em<rrP){toast('Not enough Embers.');return}r.em-=rrP;S.rr++;S.sold=[];S.stock=shopStock(r,S.rr);save();sfx('click');expMarket()}},
      {label:'Leave',cls:'primary',fn:expDone}]);
  box.querySelectorAll('.ex-shop [data-i]').forEach(b=>b.onclick=async()=>{
    const i=+b.dataset.i,s=S.stock[i],p=stockPrice(r,s);
    if(r.em<p||S.sold.includes(i))return;
    if(s.k==='scroll'&&r.scrolls.length>=scrollSlots(r)){toast('Your scroll slots are full.');return}
    sfx('click');
    if(s.k==='work'){if(!await doWork(s.id)){expMarket();return}}
    else if(s.k==='scroll')r.scrolls.push(s.id);
    else if(s.k==='relic'){r.relics.push(s.id);if(s.id==='crown')r.hp=Math.min(r.hp,maxHearts(r))}
    else r.bag.push({b:s.id,u:[0,0,0,0],k:'hire'});
    r.em-=p;S.sold.push(i);exSave();sfx('win');expMarket();
  });
  const h=box.querySelector('#exHeart');if(h)h.onclick=()=>{if(r.em<heartP||r.hp>=maxHearts(r))return;r.em-=heartP;r.hp++;save();sfx('win');expMarket()};
}

/* ---------- events ---------- */
const G_=t=>`<span class="ex-g">${t}</span>`,B_=t=>`<span class="ex-bd">${t}</span>`;
const spoilsOf=r=>bagLive(r).filter(i=>r.bag[i].k==='spoil');
// each event: {n, i, t: the scene, ch(r): its choices [{l: label, s: what it does, ok: can pick it, fn}]}
const EVT={
  toll:{n:'The Toll Bridge',i:'🌉',t:'A troll blocks the bridge. He grins. "Nobody crosses for free."',ch:r=>[
    {l:'Pay 40 Embers',s:B_('−40 Embers'),ok:r.em>=40,fn:()=>{r.em-=40;evEnd('You pay. The troll steps aside.')}},
    {l:'Pay in blood',s:`A card of yours gets ${B_('−1 on a side')}. Free.`,fn:async()=>{
      const i=await pickBag('Pay in blood','Pick a card to lose <b>1</b> on one side.',(e,k)=>sideOk(k,-1));if(i==null)return expEvent();
      const sd=await pickSide(i,'−1 on which side?',-1);if(sd==null)return expEvent();
      r.bag[i].u[sd]--;evEnd('The troll takes his toll and lets you cross.')}},
    {l:'Fight him',s:`An elite match. Win ${G_('+60 Embers')}, lose ${B_('a heart')}.`,fn:()=>expEventFight('toll')}]},
  smith:{n:'The Mad Smith',i:'🔨',t:'"I can make it stronger. Much stronger. Mostly."',ch:r=>[
    {l:'Let him',s:`A card gets ${G_('+3 on a side')} but ${B_('−1 on the other three')}.`,fn:async()=>{
      const i=await pickBag('The Mad Smith','Pick a card for the smith.');if(i==null)return expEvent();
      const sd=await pickSide(i,'+3 on which side?',3);if(sd==null)return expEvent();
      r.bag[i].u=r.bag[i].u.map((v,k)=>v+(k===sd?3:-1));evEnd('Sparks fly. The card looks… different.')}},
    {l:'Be careful',s:`${G_('+1 on a side')} for ${B_('30 Embers')}.`,ok:r.em>=30,fn:async()=>{if(!await upgradeSide(1,'The careful smith'))return expEvent();r.em-=30;evEnd('A neat, careful job.')}},
    {l:'Leave',s:'Nothing happens.',fn:()=>evEnd('You leave the smith to his hammering.')}]},
  well:{n:'The Wishing Well',i:'⛲',t:'Coins glint at the bottom. Something glints brighter.',ch:r=>[
    {l:'Toss a coin',s:`${B_('−30 Embers')}. Half the time: ${G_('a relic')}.`,ok:r.em>=30,fn:()=>{r.em-=30;const g=exRng('well',r.act,...r.at);
      if(g()<.5){const k=relicOf(r,g,relicTier(g));if(k){evRelic(k,'Your wish comes true!');return}}evEnd('The coin sinks. Nothing happens.')}},
    {l:'Reach in',s:`${G_('A relic')} for sure. ${B_('Lose a heart')}.`,ok:r.hp>1,fn:()=>{const g=exRng('well2',r.act,...r.at),k=relicOf(r,g,relicTier(g));r.hp--;
      if(k)evRelic(k,'The water bites, but you pull something out.');else evEnd('The water bites, and there\'s nothing left.')}},
    {l:'Leave',s:'Nothing happens.',fn:()=>evEnd('You walk on.')}]},
  gambler:{n:'The Gambler',i:'🃏',t:'Three cards face down. "One of them is a winner. Care to bet?"',ch:r=>[
    {l:'Bet 50 Embers',s:`Pick a card. Win: ${G_('+150 Embers')}. Lose: ${B_('the 50')}.`,ok:r.em>=50,fn:()=>gamble('em')},
    {l:'Bet a card you won',s:`Pick a card. Win: ${G_('a 4★ card')} hired for this run. Lose: ${B_('the card you bet')}.`,ok:spoilsOf(r).length>0,fn:()=>gamble('card')},
    {l:'Walk on',s:'Nothing happens.',fn:()=>evEnd('"Suit yourself."')}]},
  pool:{n:'The Mirror Pool',i:'🪞',t:'Your reflection holds a card. It looks just like one of yours.',ch:r=>[
    {l:'Reach in',s:`${G_('A twin of one of your cards')}, upgrades and all, for this run. ${B_('Lose a heart')}.`,ok:r.hp>1,fn:async()=>{
      const i=await pickBag('The Mirror Pool','Pick the card to copy. The twin only lasts for this run.');if(i==null)return expEvent();
      const e=r.bag[i];r.bag.push({b:e.b,u:e.u.slice(),r:e.r||0,...(e.e?{e:e.e}:{}),k:'twin'});r.hp--;evEnd('The reflection climbs out and joins you.')}},
    {l:'Leave',s:'Nothing happens.',fn:()=>evEnd('The pool goes still.')}]},
  traveller:{n:'The Lost Traveller',i:'🧳',t:'A traveller asks for help. Their bag looks heavy.',ch:r=>[
    {l:'Help',s:`${B_('−40 Embers')}. At the next Waystone: ${G_('+60 shards')}.`,ok:r.em>=40,fn:()=>{r.em-=40;r.sh+=60;evEnd('"I\'ll repay you, I promise!"')}},
    {l:'Rob them',s:`${G_('A random relic')}. You're ${B_('cursed')}: your next match has Chaos on.`,fn:()=>{const g=exRng('rob',r.act,...r.at),k=relicOf(r,g,1);r.fx.chaos=1;
      if(k)evRelic(k,'You grab the bag and run. You feel a curse settle on you.');else evEnd('The bag is empty. You feel a curse settle on you.')}},
    {l:'Walk on',s:'Nothing happens.',fn:()=>evEnd('You leave them to find their own way.')}]},
  ghost:{n:'The Ghost Duel',i:'👻',t:'A ghost lays out its cards. "Here, lower wins."',ch:r=>[
    {l:'Play',s:`A match with <b>Reverse</b> on. Win: ${G_('a rare relic')}. Lose: ${B_('−40 Embers')}, but no heart.`,fn:()=>expEventFight('ghost')},
    {l:'Refuse',s:'Nothing happens.',fn:()=>evEnd('The ghost fades away.')}]},
  fog:{n:'The Fog',i:'🌫️',t:'Thick fog on the road ahead. In there, you won\'t see their cards.',ch:r=>[
    {l:'Go in',s:`Next match: ${B_('hidden hands')}, but ${G_('double Embers')}.`,fn:()=>{r.fx.fog=1;evEnd('You step into the fog.')}},
    {l:'Go round',s:`${B_('−20 Embers')} for the long way.`,ok:r.em>=20,fn:()=>{r.em-=20;evEnd('The long way round. Your feet hurt.')}}]},
  altar:{n:'The Ember Altar',i:'🕯️',t:'An altar that wants what you love most.',ch:r=>[
    {l:'Offer a card you won',s:`Lose it for good. Another card gets ${G_('+1 on every side')}.`,ok:spoilsOf(r).length>0,fn:async()=>{
      const a=await pickBag('Offer a card','Pick a card you won to give up.',e=>e.k==='spoil');if(a==null)return expEvent();
      const b=await pickBag('The altar\'s gift','Pick the card that gets <b>+1 on every side</b>.',(e,k)=>k!==a);if(b==null)return expEvent();
      r.bag[a].x=1;r.bag[b].u=r.bag[b].u.map(v=>v+1);evEnd('The flames take your offering.')}},
    {l:'Offer a relic',s:`Lose one. Get ${G_('a heart')} and ${G_('+50 Embers')}.`,ok:r.relics.length>0,fn:()=>{
      expPickRelic(r.relics,'Offer a relic','Pick the relic to give up.',k=>{r.relics.splice(r.relics.indexOf(k),1);r.hp=Math.min(maxHearts(r),r.hp+1);r.em+=50;evEnd('The altar glows warm.')},expEvent)}},
    {l:'Leave',s:'Nothing happens.',fn:()=>evEnd('You leave the altar be.')}]}
};
function expEvent(){
  const r=EXN();
  if(!r.ev){r.ev={id:r.evs.length?r.evs.shift():EVENTS[Math.floor(Math.random()*EVENTS.length)]};save()}
  if(r.ev.done){expDone();return}
  const E=EVT[r.ev.id],ch=E.ch(r);
  const box=modal(`<div class="kick">Event</div><div class="ex-bigface">${E.i}</div><h2 class="nm2">${esc(E.n)}</h2><p class="ex-scene">${esc(E.t)}</p>
    <div class="ex-choices">${ch.map((c,i)=>`<button class="btn ex-ch" data-i="${i}"${c.ok===false?' disabled':''}><b>${esc(c.l)}</b><span>${c.s}</span></button>`).join('')}</div>
    <p class="dly-note">You have ${emTxt(r.em)} · ${heartsTxt(r)}</p>`,[]);
  box.querySelectorAll('.ex-ch').forEach(b=>b.onclick=()=>{const c=ch[+b.dataset.i];if(c.ok===false)return;sfx('click');closeModal();c.fn()});
}
function evEnd(msg,extra=''){
  const r=EXN();r.ev.done=1;exSave();
  modal(`<div class="ex-bigface">${EVT[r.ev.id].i}</div><p class="ex-scene">${esc(msg)}</p>${extra}<p class="dly-note">${emTxt(r.em)} · ${heartsTxt(r)}</p>`,[{label:'Continue',cls:'primary',fn:expDone}]);
}
function evRelic(k,msg){EXN().relics.push(k);if(k==='crown')EXN().hp=Math.min(EXN().hp,maxHearts(EXN()));evEnd(msg,`<div class="ex-list">${relicRow(k)}</div>`)}
const relicRow=k=>{const R=RELICS[k];return `<div class="ex-row">${relicHTML(k)}<div><b>${esc(R.n)}</b><span>${esc(R.d)}</span>${R.c?`<span class="ex-bd">Catch: ${esc(R.c)}</span>`:''}</div></div>`};
// the Gambler: 3 face-down cards, one wins (decided by the stop, so closing the app changes nothing)
function gamble(kind){
  const r=EXN(),win=Math.floor(exRng('gamble',r.act,...r.at)()*3);
  const go=async()=>{
    let bet=null;
    if(kind==='card'){bet=await pickBag('Bet a card','Pick a card you won to bet.',e=>e.k==='spoil');if(bet==null){expEvent();return}}
    const box=modal(`<h2 class="nm2">Pick a card</h2><p>One of these is the winner.</p><div class="cardrow ex-gamble">${[0,1,2].map(i=>`<div class="pk" data-i="${i}" role="button" tabindex="0" aria-label="Card ${i+1}">${cardHTML(0,null,{back:true})}</div>`).join('')}</div>`,[]);
    box.querySelectorAll('.pk').forEach(el=>el.onclick=()=>{
      const i=+el.dataset.i,won=i===win;sfx(won?'win':'lose');closeModal();
      if(kind==='em'){r.em+=won?150:-50;evEnd(won?'"Well, well. A winner!" +150 Embers.':'"Better luck next time." The 50 Embers are gone.');return}
      if(won){const g=exRng('gwin',r.act,...r.at),c=CARDS.filter(c=>c.rar===4),id=c[Math.floor(g()*c.length)].id;r.bag.push({b:id,u:[0,0,0,0],k:'hire'});
        evEnd(`"A winner!" ${CARDS[id].name} joins you for this run.`,rowHTML([id],'blue'))}
      else{r.bag[bet].x=1;evEnd(`"Mine now." You lose ${CARDS[r.bag[bet].b].name}.`)}
    });
  };
  go();
}

/* ---------- matches ---------- */
// the opponent at a map stop: {kind, name, art, hand, diff, rules, boss}
function expFoe(ri,i){
  const r=EXN(),A=exAct(),t=r.map[ri][i].t,g=exRng('foe',r.act,ri,i,r.tries);
  const rules={...EXP_RULES,...A.rules};
  if(t==='boss'){
    const id=r.boss[r.act],B=EXP_BOSS[id];
    const hand=id==='mirror'?null:(B.card!=null?[B.card,...expHand(g,A.bossBands,[B.card])]:expHand(g,A.bossBands));
    return {kind:'boss',name:B.name,art:B.art,hand,diff:A.ai[2],rules,boss:id};
  }
  const hand=expHand(g,t==='elite'?A.elite:A.bands),top=hand.reduce((a,b)=>CARDS[b].lv>CARDS[a].lv?b:a);
  return {kind:t,name:CARDS[top].name,art:CARDS[top].art,hand,diff:A.ai[t==='elite'?1:0],rules};
}
// what the run adds to a match's rules: Eclipse Stone, Prism Heart, the Fog and the Rob curse
function runRules(r,rules,ev){
  const R={...rules};
  if(hasRelic(r,'eclipse'))R.reverse=true;
  if(hasRelic(r,'prism'))R.elemental=true;
  if(r.fx.fog&&!ev)R.open=false;
  if(r.fx.chaos&&!ev)R.chaos=true;
  R.bon=[expBon(r),null];
  return R;
}
const ruleNames=R=>RULES.filter(x=>R[x[0]]&&x[0]!=='sweep').map(x=>x[1]);
// before a match: who you meet, the rules, and which 5 of your cards to bring
function expBrief(ri,i,ev){
  const r=EXN(),f=ev?evFoe(ev):expFoe(ri,i),R=runRules(r,f.rules,ev),live=bagLive(r);
  expCards(r);
  let sel=r.hand.filter(k=>live.includes(k));
  for(const k of live)if(sel.length<5&&!sel.includes(k)&&!rarBlock(sel.map(x=>RUN_ID+x),RUN_ID+k))sel.push(k);
  sel=sel.slice(0,5);
  const B=f.boss?EXP_BOSS[f.boss]:null,open=R.open;
  const draw=()=>{
    const foe=f.boss==='mirror'?sel.map(k=>bagCard(k,'red',{name:false})).join(''):f.hand.map(id=>open?cardHTML(id,'red',{name:false}):cardHTML(id,null,{back:true})).join('');
    const box=modal(`<div class="kick">Act ${r.act+1} · ${f.kind==='boss'?'Boss':f.kind==='elite'?'Elite':f.kind==='event'?'Event':'Match'}</div>
      <div class="ex-vs"><span class="ex-face">${f.art}</span><div><h2 class="nm2">${esc(f.name)}</h2><small>CPU · ${DIFF_NAME[f.diff]||f.diff}</small></div></div>
      ${B?`<div class="ex-trick"><b>${B.icon} ${esc(B.trick)}</b><span>${esc(B.text)}</span></div>`:''}
      <div class="dly-rules">${ruleNames(R).map(n=>`<span>${n}</span>`).join('')||'<span>Basic rules</span>'}${R.open?'':'<span>Hidden hands</span>'}</div>
      ${r.fx.fog&&!ev?'<p class="dly-note">🌫️ The Fog: hidden hands, double Embers.</p>':''}${r.fx.chaos&&!ev?'<p class="dly-note ex-bd">Cursed: Chaos is on this match.</p>':''}
      <p class="dly-lab">Their hand</p><div class="cardrow ex-foe">${foe}</div>
      <p class="dly-lab">${live.length>5?'Your 5 · tap to swap':'Your 5'}</p><div class="cardrow ex-pickhand">${live.map(k=>{const on=sel.includes(k),why=on?'':sel.length>=5?'full':rarBlock(sel.map(x=>RUN_ID+x),RUN_ID+k);
        return `<div class="pk${on?' on':''}" data-k="${k}" role="button" tabindex="0" aria-pressed="${on}" aria-label="${esc(bagLabel(k))}">${bagCard(k,'blue',{name:false})}</div>`}).join('')}</div>
      <p class="dly-note" id="exSelNote">${sel.length===5?'Ready.':`Pick ${5-sel.length} more.`}</p>`,
      [{label:'Fight',cls:'primary',fn:()=>{if(sel.length!==5)return;expFight(ri,i,f,R,sel,ev)}},
       {label:'Back',esc:true,fn:()=>{if(ev)expEvent()}}]);
    box.querySelector('.mbtns .btn.primary').disabled=sel.length!==5;
    box.querySelectorAll('.ex-pickhand .pk').forEach(el=>el.onclick=()=>{
      const k=+el.dataset.k;
      if(sel.includes(k))sel=sel.filter(x=>x!==k);
      else if(sel.length>=5){toast('Tap one of your 5 first to take it out.');return}
      else{const why=rarBlock(sel.map(x=>RUN_ID+x),RUN_ID+k);if(why){toast(why);return}sel.push(k)}
      sfx('click');draw();
    });
  };
  draw();
}
// an event's match: the Toll Bridge's troll, the Ghost Duel
function evFoe(ev){
  const r=EXN(),A=exAct(),g=exRng('evfoe',ev,r.act,...r.at,r.tries),hand=expHand(g,A.elite);
  return ev==='toll'?{kind:'event',name:'The Troll',art:'🧌',hand,diff:A.ai[1],rules:{...EXP_RULES,...A.rules}}
    :{kind:'event',name:'The Ghost',art:'👻',hand:expHand(g,A.bands),diff:A.ai[0],rules:{...EXP_RULES,...A.rules,reverse:true}};
}
function expEventFight(ev){expBrief(...EXN().at,ev)}
function expFight(ri,i,f,R,sel,ev){
  const r=EXN(),fog=!!r.fx.fog&&!ev;
  r.hand=sel.slice();save();
  const go=first=>{
    // from here, closing the app loses the match. The Fog and the curse are used up by this match
    if(!ev){r.at=[ri,i];r.fx.fog=0;r.fx.chaos=0}
    r.live={k:f.kind,ev:ev||null};exSave();
    const hand=sel.map(k=>RUN_ID+k);
    G=baseMatch('ai',{rules:R,trade:'none',diff:f.diff,bo:1,names:['You',(f.kind==='boss'?'Boss · ':f.kind==='elite'?'Elite · ':'')+f.name],seed:rand32(),
      exp:{kind:f.kind,ev:ev||null,boss:f.boss||null,fog,hand:f.hand},firstP:first});
    G.decks=[hand,f.boss==='mirror'?hand.slice():f.hand.slice()];
    startMatch();
  };
  if(hasRelic(r,'hourglass'))modal(`<h2 class="nm2">Hourglass</h2><p>Who goes first?</p>`,[{label:'I go first',cls:'primary',fn:()=>go(0)},{label:'They go first',fn:()=>go(1)}]);
  else go(null);
}
const CELLS9=[0,1,2,3,4,5,6,7,8];
// match.js newRound: the run's extras on the new board, the boss's trick, and the cards you can see
function expRound(){
  const st=G.st,X=G.exp,r=EXN(),g=mulberry32(G.seed^0x5bd1e995);
  st.k=Array(9).fill(0);st.x=Array(9).fill(0);st.nx=[0,0];st.pc=[0,0];
  X.g={};
  if(X.boss==='rootking'){X.g.roots=shuffle(CELLS9.slice(),g).slice(0,2).sort();X.g.roots.forEach(c=>st.k[c]=1)}
  if(X.boss==='tidecaller')X.g.lvl=0;
  if(X.boss==='king'){X.g.dec=shuffle(DECREES.slice(),g).slice(0,3);X.g.n=0}
  if(X.boss==='dragon'){X.g.row=Math.floor(g()*3);X.g.n=0}
  if(X.boss==='storm')X.g.cell=Math.floor(g()*9);
  X.rg=g;
  // Spyglass, Black Lantern and Peek show their cards when hands are hidden
  if(!G.rules.open){
    const all=hasRelic(r,'lantern'),n=all?5:hasRelic(r,'spyglass')?2:0;
    if(n)G.trk.v=[[],shuffle([0,1,2,3,4],g).slice(0,n).sort()];
  }
}
const ROW_NAME=['top','middle','bottom'];
const decreeTxt=k=>({reverse:'Reverse',combo:'Combo',sameWall:'Same wall',plus:'Plus',same:'Same'}[k]);
// match.js execMove: after each card, the boss's trick may go off
async function expAfter(p){
  const g=G,st=G.st,X=G.exp,placed=st.b.filter(x=>x>=0).length;
  if(!X.g)return;
  if(X.boss==='tidecaller'&&(placed===3||placed===6)){
    const row=2-X.g.lvl;X.g.lvl++;
    for(let c=row*3;c<row*3+3;c++){st.x[c]-=1;if(st.b[c]>=0)st.m[c]-=1}
    await banner('High tide!');if(G!==g)return;renderBoard();
  }
  if(X.boss==='king'&&placed%2===0&&X.g.n<X.g.dec.length){
    const k=X.g.dec[X.g.n++];G.rules[k]=!G.rules[k];
    await banner(`${decreeTxt(k)} ${G.rules[k]?'on':'off'}!`,'small');if(G!==g)return;renderHud();
  }
  if(X.boss==='dragon'&&p===1){
    X.g.n++;
    if(X.g.n===2||X.g.n===4){
      const row=X.g.row;
      await banner('Dragonfire!');if(G!==g)return;
      for(let c=row*3;c<row*3+3;c++)if(st.b[c]>=0&&st.o[c]===0)st.m[c]-=1;
      X.g.row=(row+1+Math.floor(X.rg()*2))%3;renderBoard();
    }
  }
  if(X.boss==='storm'&&(placed===4||placed===8)){
    const c=X.g.cell;
    await banner('Lightning!');if(G!==g)return;
    if(st.b[c]>=0&&!st.k[c]){st.o[c]=1-st.o[c];flipCells([c],st.o[c],c);await wait(400);if(G!==g)return}
    X.g.cell=(c+1+Math.floor(X.rg()*8))%9;
    renderGame();
  }
}
// marks on the board's squares (game.js renderBoard)
function expCellHTML(i){
  const X=G.exp,st=G.st,g=X.g||{};let h='';
  if(g.roots&&g.roots.includes(i))h+='<i class="xo root" aria-hidden="true">🌿</i>';
  else if(st.k&&st.k[i])h+='<i class="xo lock" aria-hidden="true">🛡️</i>';
  if(st.x&&st.x[i]<0)h+='<i class="xg water" aria-hidden="true"></i>';
  else if(X.boss==='tidecaller'&&g.lvl<2&&Math.floor(i/3)===2-g.lvl)h+='<i class="xg tide" aria-hidden="true"></i>';
  if(X.boss==='dragon'&&g.n<4&&Math.floor(i/3)===g.row)h+='<i class="xg fire" aria-hidden="true"></i>';
  if(X.boss==='storm'&&i===g.cell&&st.b.filter(x=>x>=0).length<8)h+='<i class="xg zap" aria-hidden="true"></i>';
  if(G.target&&G.target.cells.includes(i))h+='<i class="xg tgt" aria-hidden="true"></i>';
  return h;
}
function expCellLabel(i){
  const X=G.exp,st=G.st,g=X.g||{};
  return (st.k&&st.k[i]?', can\'t be flipped':'')+(st.x&&st.x[i]<0?', under water':'')+(X.boss==='dragon'&&Math.floor(i/3)===g.row?', fire comes here':'')+(X.boss==='storm'&&i===g.cell?', lightning comes here':'');
}
// the chips in the match's rule bar, and the scroll button
function expChip(){
  const X=G.exp,g=X.g||{},r=EXN();
  const b=$('#btnScroll');b.classList.remove('hidden');b.classList.toggle('on',!!G.target);b.disabled=!r;
  let t=`<span class="ser">Expedition · Act ${r?r.act+1:''}${X.kind==='boss'?' · Boss':X.kind==='elite'?' · Elite':''}</span>`;
  if(X.boss){const B=EXP_BOSS[X.boss];
    let nx='';
    if(X.boss==='dragon'&&g.n<4)nx=` · ${ROW_NAME[g.row]} row after his ${g.n<2?'2nd':'4th'} card`;
    if(X.boss==='king'&&g.dec&&g.n<g.dec.length){const k=g.dec[g.n];nx=` · next: ${decreeTxt(k)} ${G.rules[k]?'off':'on'}`}
    if(X.boss==='tidecaller'&&g.lvl<2)nx=` · ${ROW_NAME[2-g.lvl]} row floods next`;
    if(X.boss==='storm')nx=' · glowing square';
    t+=`<span class="ex-chip" title="${esc(B.text)}">${B.icon} ${esc(B.trick)}${nx}</span>`;
  }
  if(r&&r.relics.length)t+=`<span class="ex-chip rel">${r.relics.map(k=>RELICS[k].i).join('')}</span>`;
  return t;
}
// the scroll button in a match: your scrolls (use one on your turn) and your relics
function expScrolls(){
  const r=EXN();if(!G||!G.exp||!r)return;
  if(G.target){G.target=null;renderBoard();renderHud();return}
  const mine=canAct(G.me);
  const box=modal(`<h2 class="nm2">Scrolls</h2>${r.scrolls.length?`<div class="ex-list">${r.scrolls.map((k,i)=>{const S=SCROLLS[k];
    return `<div class="ex-row">${scrollHTML(k)}<div><b>${esc(S.n)}</b><span>${esc(S.d)}</span></div>${S.passive?'<small class="ex-auto">Works by itself</small>':`<button class="btn small" data-i="${i}"${mine?'':' disabled'}>Use</button>`}</div>`}).join('')}</div>${mine?'':'<p class="dly-note">Scrolls can be used on your turn.</p>'}`
    :'<p>No scrolls. Markets sell them.</p>'}${r.relics.length?`<h3 class="ex-h3">Relics</h3><div class="ex-list">${r.relics.map(relicRow).join('')}</div>`:''}`,[{label:'Close',cls:'primary',esc:true}]);
  box.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>{closeModal();useScroll(+b.dataset.i)});
}
function useScroll(i){
  const r=EXN(),k=r.scrolls[i],st=G.st;if(!k||!canAct(G.me))return;
  const spend=()=>{r.scrolls.splice(r.scrolls.indexOf(k),1);save();sfx('win')};
  if(k==='peek'){spend();G.trk.v=[[],[0,1,2,3,4]];renderGame();toast('You can see their whole hand.');return}
  if(k==='empower'){spend();st.nx[G.me]+=2;toast('Your next card gets +2 on every side.');renderHud();return}
  const S=SCROLLS[k],cells=CELLS9.filter(c=>st.b[c]>=0&&(S.target==='mine'?st.o[c]===G.me&&!st.k[c]:st.o[c]!==G.me));
  if(!cells.length){toast(S.target==='mine'?'You have no card on the board to protect.':'They have no card on the board.');return}
  G.sel=null;G.target={k,cells};renderGame();
  toast(S.target==='mine'?'Tap one of your cards to protect it.':'Tap one of their cards to hex it.',3000);
}
// game.js: a tap on a square while a scroll is waiting for its target
function expTarget(c){
  const T=G.target,st=G.st,r=EXN();G.target=null;
  if(!T.cells.includes(c)||!canAct(G.me)){renderGame();return}
  r.scrolls.splice(r.scrolls.indexOf(T.k),1);save();sfx('win');
  if(T.k==='bulwark')st.k[c]=1;else st.m[c]-=2;
  renderGame();
}
// match.js finish: the run's side of a result. Returns what the result screen adds; G.exp.again is its main button
function expFinish(w){
  const r=EXN(),X=G.exp;
  if(!r){X.again=null;return ''}
  r.live=null;
  let out='',chips='';
  const won=w===G.me;
  if(won){
    r.wins++;r.tries=0;
    if(X.ev==='ghost'){const g=exRng('ghostwin',r.act,...r.at),k=relicOf(r,g,3);if(k){r.relics.push(k);out+=`<div class="ex-list">${relicRow(k)}</div>`}r.ev.done=1}
    else if(X.ev==='toll'){r.em+=60;chips+=emChip(60);r.ev.done=1}
    else{
      const em=winEmbers(r,X.kind,X.fog);r.em+=em;chips+=emChip(em);
      if(X.kind==='elite'){const g=exRng('elite',r.act,...r.at),k=relicOf(r,g,relicTier(g,true));if(k){r.relics.push(k);out+=`<p>The elite dropped a relic:</p><div class="ex-list">${relicRow(k)}</div>`}}
      const n=X.kind==='boss'&&hasRelic(r,'pockets')?2:1;
      // the Mirror Mask's cards are copies of yours: she drops her own mask instead
      r.pend={spoil:X.boss==='mirror'?[20]:X.hand.slice(),n,then:X.kind==='boss'?(r.act<2?'way':'clear'):'map'};
    }
    X.again={label:'Continue',fn:expAfterMatch};
  }else if(w<0){
    out+='<p>A draw: no heart lost. Play it again.</p>';
    if(!X.ev)r.at=null;
    X.again={label:'Continue',fn:expAfterMatch};
  }else{
    const alive=expLoss(r,X.ev);
    if(X.ev==='ghost')out+='<p>The ghost laughs and takes 40 Embers. No heart lost.</p>';
    else out+=savedNote(r)||'<p>You lose a heart.</p>';
    if(!alive){r.over='lost';out+='<p class="ex-bd"><b>That was your last heart.</b></p>'}
    X.again={label:r.over?'See what you lost':'Continue',fn:expAfterMatch};
  }
  out+=`<p>${heartsTxt(r)} · ${emTxt(r.em)} Embers</p>`;
  exSave();
  return dailyBox(chips,'')+out;
}
const expKick=()=>{const r=EXN();return `Expedition · Act ${r?r.act+1:''}`};
function expAfterMatch(){
  closeModal();G=null;
  const r=EXN();if(!r){show('menu');return}
  show('exp');renderExp();
  if(r.over){expRunOver();return}
  if(r.pend){expTakeSpoils();return}
  // an event's match: it's over (or after a draw, back to the event)
  if(r.at&&r.ev){r.ev.done?expDone():expStop()}
}
// match.js quitMatch: leaving a match loses it
function expLeft(){
  const r=EXN();if(!r||!r.live)return;
  const ev=r.live.ev;r.live=null;
  if(!expLoss(r,ev))r.over='lost';
  save();
  show('exp');renderExp();
  if(r.over){expRunOver();return}
  modal(`<h2 class="nm2">Match lost</h2><p>You left, so it counts as a loss.</p>${savedNote(r)}<p>${heartsTxt(r)}</p>`,[{label:'OK',cls:'primary',esc:true,fn:()=>{if(r.ev&&r.ev.done)expDone()}}]);
}
// take 1 (or 2) of the beaten CPU's cards for your bag
function expTakeSpoils(){
  const r=EXN(),P=r.pend,ids=P.spoil,n=Math.min(P.n,ids.length);
  const take=idx=>{
    const R=EXN();if(!R||!R.pend)return;
    idx.forEach(k=>R.bag.push({b:ids[k],u:[0,0,0,0],k:'spoil'}));
    const then=R.pend.then;R.pend=null;exSave();sfx('win');
    if(then==='way'){expDone2();expWaystone()}
    else if(then==='clear'){expDone2();expClear()}
    else expDone();
  };
  const head='<div class="kick">Spoils</div><h2 class="nm2">Take a card</h2>';
  // nothing to choose (the Mirror Mask drops her mask)
  if(n>=ids.length){modal(head+`<p>${ids.length>1?'These join':'This joins'} your bag. Take ${ids.length>1?'them':'it'} home and ${ids.length>1?"they're":"it's"} yours.</p>`+rowHTML(ids,'blue',ids.map(id=>!isSeen(id))),
    [{label:'Take',cls:'primary',fn:()=>take(ids.map((_,k)=>k))}]);return}
  pickCards(head,ids,n,{ask:n>1?`Choose <b>${n}</b> cards for your bag. Take them home and they're yours.`:"Choose <b>1</b> card for your bag. Take it home and it's yours."}).then(take);
}
// stand on the boss's square without drawing the map
function expDone2(){const r=EXN();if(r.at){r.pos=r.at;r.path.push(r.at)}r.at=null;save()}

/* ---------- Waystones, boss relics and the end of a run ---------- */
function expWaystone(){
  const r=EXN(),rw=EXP_REWARD[r.act],nx=EXP_ACTS[r.act+1],NB=EXP_BOSS[r.boss[r.act+1]];
  const won=r.bag.filter(e=>e.k==='spoil'&&!e.x).length;
  modal(`<div class="kick">Act ${r.act+1} cleared</div><div class="ex-bigface">⛩️</div><h2 class="nm2">Waystone</h2><p>${heartsTxt(r)}</p>
    <div class="ex-way">
      <div class="ex-wayc home"><b>🏠 Go home now</b><span>Keep your <b>5 cards</b> and the <b>${won} you won</b>.</span><span><b>${shd()}${rw.sh+r.sh}</b> shards${rw.pack?` + ${aPack(rw.pack)}`:''}</span></div>
      <div class="ex-wayc go"><b>⚔️ Go on to Act ${r.act+2}</b><span>${esc(nx.name)}: ${ruleNames({...EXP_RULES,...nx.rules}).join(' + ')}${nx.rules.open===false?', hidden hands':''}.</span><span>Boss: <b>${esc(NB.name)}</b> ${NB.icon}</span><span class="ex-bd">Run out of hearts and your cards are gone.</span></div>
    </div>`,[{label:'Go on',cls:'primary',fn:expNextAct},{label:'Go home',fn:()=>expHome(r.act)}]);
}
function expNextAct(){
  const r=EXN();
  r.act++;r.map=expMap(exRng('map',r.act));r.pos=null;r.path=[];r.at=null;r.tries=0;
  SAVE.expRec.best=Math.max(SAVE.expRec.best,r.act+1);
  // a boss relic to start the act: strong, with a catch
  r.bossRelic=shuffle(Object.keys(RELICS).filter(k=>RELICS[k].t===5&&!hasRelic(r,k)),exRng('bossrelic',r.act)).slice(0,3);
  exSave();renderExp();expBossRelic();
}
function expBossRelic(){
  const r=EXN();
  expPickRelic(r.bossRelic,`Act ${r.act+1} begins`,'Pick a <b>boss relic</b>. Each is strong, but each has a catch. Think about your cards.',k=>{
    r.relics.push(k);r.bossRelic=null;if(k==='crown')r.hp=Math.min(r.hp,maxHearts(r));exSave();renderExp()},
    ()=>{r.bossRelic=null;exSave();renderExp()});
}
// shards from the Expedition, up to EXP_SHARD_CAP a game day (like store.js shardDay)
function expShards(n){
  const t=today();let d=SAVE.exDay;
  if(!d)d=SAVE.exDay={at:t,n:0};else if(t&&!d.at)d.at=t;else if(t&&d.at<t)d=SAVE.exDay={at:t,n:0};
  const sh=Math.min(n,Math.max(0,EXP_SHARD_CAP-d.n));d.n+=sh;SAVE.shards+=sh;
  return {sh,capped:sh<n};
}
// the cards that come home: the ones you brought and the ones you won (hired cards and twins stay behind)
function expBringHome(r,all){
  const back=[],fresh=[];
  r.bag.forEach(e=>{if(e.x||!(e.k==='own'||e.k==='spoil'))return;if(!all&&!e.w)return;fresh.push(e.k==='spoil'&&!isSeen(e.b));back.push(e.b);collAdd(e.b)});
  return {back,fresh};
}
function expHome(stage,clear){
  const r=EXN(),rw=EXP_REWARD[stage];
  const {back,fresh}=expBringHome(r,true),{sh,capped}=expShards(rw.sh+r.sh);
  if(rw.pack)SAVE.packs.push({t:rw.pack,src:'exp'});
  if(clear){SAVE.expRec.clears++;SAVE.expRec.best=3;earn('expedition')}
  SAVE.exp=null;profCheck();save();expCards(null);
  const chips=`<div class="pf-reward">${sh?`<span class="pf-shard">${shd()}+${sh}</span>`:''}${capped?'<span class="pf-cap">Daily Expedition shard limit reached</span>':''}${rw.pack?`<span class="pf-pack">🎁 ${PACKS[rw.pack].name} pack</span>`:''}</div>`;
  modal(`<div class="kick">Expedition</div><h2>${clear?'Expedition cleared!':'Home safe'}</h2>${chips}
    <p>${clear?'You beat all three bosses.':'You went home with everything.'} These cards are in your collection now:</p>${rowHTML(back,'blue',fresh)}${freshHTML()}`,
    [{label:'Menu',cls:'primary',fn:()=>show('menu')}]);
  sfx('win');
}
function expClear(){expHome(2,true)}
function expRunOver(){
  const r=EXN();if(!r)return;
  const why=r.over;
  const {back}=expBringHome(r,false);
  const lost=r.bag.filter(e=>!e.x&&!e.w&&(e.k==='own'||e.k==='spoil')).map(e=>e.b);
  SAVE.exp=null;save();expCards(null);
  modal(`<div class="kick">Expedition · Act ${r.act+1}</div><h2>Run over</h2><p>${why==='gave'?'You gave up the run.':why==='closed'?'The app closed during your last match.':'You ran out of hearts.'}</p>
    ${lost.length?`<p class="dly-lab">Lost</p><div class="cardrow ex-lost">${lost.map(id=>cardHTML(id,'red')).join('')}</div>`:''}
    ${back.length?`<p class="dly-lab">Came home</p>${rowHTML(back,'blue')}<p class="dly-note">🛡️ Your ward kept it safe.</p>`:''}`,
    [{label:'New run',cls:'primary',fn:()=>{show('menu');expHow(true)}},{label:'Menu',fn:()=>show('menu')}]);
  sfx('lose');
}
$('#btnScroll').onclick=()=>{sfx('click');expScrolls()};
