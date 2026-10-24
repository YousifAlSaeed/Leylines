'use strict';
/* =====================================================================
   DRAFT — an online 1v1 where nobody brings cards (Host a game → Draft, duo.js)
   10 cards go on the table (engine.js draftPool, from the match seed) and the
   players take turns picking 5 (DRAFT_ORDER: 1, 2, 2, 2, 2, 1). Whoever plays
   second picks first. Each pick is a 'dpick' message {n: pick number, id}.
   Then a normal match with trade 'none': drafted cards are borrowed.
   With no friend around, the host can draft against the CPU instead (Play the CPU
   in the room): then G.mode is 'ai' and nothing goes over the network.
   ===================================================================== */
const DRAFT_SEC=15; // seconds a pick; out of time takes a random card
let DR=null; // {g: the match it belongs to, cpu: vs the CPU, pool: [ids], h: [[ids], [ids]] by seat, n: picks made, last: id, end, at, sec, cpuAt}
let DR_T=0; // the one pick clock (setInterval), whichever draft it was for

function draftStart(){
  clearInterval(DR_T);
  DR={g:G,cpu:G.mode==='ai',pool:draftPool(G.seed,!!G.rules.random),h:[[],[]],n:0,last:-1,end:0,at:0,sec:-1,cpuAt:0};
  show('draft');draftRender();draftClock();
}
// the Draft room's Play the CPU: the room closes and you draft against the CPU with the room's rules
function draftCpu(rules=roomRules(),bo=boOf(SAVE.bo)){
  clearRejoin();netClose(true);NET.role=null;setupMode='ai';
  G=baseMatch('ai',{rules:{...rules},trade:'none',diff:'normal',bo,draft:1,names:['You','CPU']});
  draftStart();
}
// Play again after a CPU draft: a new table, same rules
const draftCpuAgain=()=>draftCpu(G.rules,G.bo);
// the CPU takes one of the two strongest cards left
function draftCpuPick(){
  const rest=DR.pool.filter(id=>!draftTaken(id)).sort((a,b)=>cardStrength(b)-cardStrength(a));
  if(rest.length)draftPick(1-G.me,rest[Math.random()<.7||rest.length<2?0:1]);
}
const draftOn=()=>!!(DR&&DR.g===G&&G&&!G.st);
const draftWho=()=>draftTurn(G.seed,DR.n);
const draftTaken=id=>DR.h[0].includes(id)||DR.h[1].includes(id);
const draftAway=()=>!DR.cpu&&NET.away; // the other player dropped: the clock waits for them

function draftPick(seat,id){
  if(DR.n>=DRAFT_ORDER.length||!CARDS[id]||draftTaken(id))return;
  DR.h[seat].push(id);DR.n++;DR.last=id;sfx('hand_pick');
  if(DR.n>=DRAFT_ORDER.length){draftRender();draftDone();return}
  DR.end=0;draftClock();draftRender();
}
// your tap (or the clock running out)
function draftMine(id){
  if(!draftOn()||draftWho()!==G.me||draftAway()||draftTaken(id)||!DR.pool.includes(id))return;
  if(!DR.cpu)netSend({t:'dpick',n:DR.n,id});
  draftPick(G.me,id);
}
// their pick, from online.js: only the next pick, theirs, of a card still on the table
function draftIn(m){
  if(!draftOn()||m.n!==DR.n||draftWho()!==1-G.me||!DR.pool.includes(m.id)||draftTaken(m.id))return;
  draftPick(1-G.me,m.id);
}
function draftDone(){
  clearInterval(DR_T);DR_T=0;
  const d=DR;
  setTimeout(()=>{if(DR!==d||!draftOn())return;G.decks=[d.h[0].slice(),d.h[1].slice()];DR=null;startMatch()},1200);
}

/* ---------- the pick clock: 15 s, paused while the other player is away ---------- */
function draftClock(){
  clearInterval(DR_T);
  DR.end=Date.now()+DRAFT_SEC*1000;DR.at=Date.now();DR.sec=-1;DR.cpuAt=Date.now()+700+Math.random()*900;
  DR_T=setInterval(draftTick,200);draftTick();
}
function draftTick(){
  // the draft is over or gone (left, back to the room): the clock stops for good
  if(!draftOn()||DR.n>=DRAFT_ORDER.length){clearInterval(DR_T);DR_T=0;if(DR&&!draftOn())DR=null;return}
  const now=Date.now();
  if(draftAway())DR.end+=now-DR.at;
  DR.at=now;
  const left=Math.max(0,Math.ceil((DR.end-now)/1000)),mine=draftWho()===G.me;
  if(left!==DR.sec){
    DR.sec=left;
    const c=$('#drClock');c.textContent=left;c.classList.toggle('low',mine&&left<=5);
    if(mine&&left>0&&left<=5)sfx('tick');
  }
  if(!mine&&DR.cpu&&now>=DR.cpuAt){draftCpuPick();return}
  if(mine&&now>=DR.end&&!draftAway()){
    const rest=DR.pool.filter(id=>!draftTaken(id));
    sfx('timeup');toast('Out of time: a random card was picked for you.',2500);
    draftMine(rest[Math.floor(Math.random()*rest.length)]);
  }
}

/* ---------- the screen ---------- */
function draftRender(){
  if(!draftOn())return;
  const me=G.me,foe=1-me,done=DR.n>=DRAFT_ORDER.length,who=done?-1:draftWho(),mine=who===me,next=draftTurn(G.seed,DR.n+1);
  const col=s=>s===me?myCol():'red';
  const hand=s=>DR.h[s].map(id=>cardHTML(id,col(s),{cls:id===DR.last?'dr-in':''})).join('')+'<i class="dr-slot"></i>'.repeat(5-DR.h[s].length);
  const them=DR.cpu?'CPU':oppName();
  // each player's row, like a match's (game.js renderHud): avatar card or initial, name, HOST/GUEST online, cards taken
  const row=(s,name,av)=>{const a=av!=null&&CARDS[av];
    return`<span class="av${a?' art':''}" aria-hidden="true">${a?a.art:esc((String(name).trim()[0]||'?').toUpperCase())}</span>`+
      `<span class="who">${esc(name)}${DR.cpu?'':`<small class="tag">${s===0?'HOST':'GUEST'}</small>`}</span><span class="sc">${DR.h[s].length}<small>/5</small></span>`};
  $('#drFoeName').innerHTML=row(foe,them,DR.cpu?null:NET.oppAv);
  $('#drMeName').innerHTML=row(me,DR.cpu?'You':myName(),myAv());
  $('#drFoeName').parentNode.classList.toggle('active',who===foe);$('#drMeName').parentNode.classList.toggle('active',who===me);
  $('#drFoe').innerHTML=hand(foe);$('#drMe').innerHTML=hand(me);
  $('#drStatus').innerHTML=done?'<b class="ok">Both hands are ready</b><span>The match starts now.</span>'
    :mine?`<b class="you">Your pick</b><span>${DR.n?'':'You play second, so you pick first. '}${next===me?'You get 2 in a row.':next<0?'Last card.':'Tap a card to take it.'}</span>`
    :`<b class="foe">${esc(them)} is picking…</b><span>${next===foe?'They get 2 in a row.':next<0?'Their last card.':'You pick next.'}</span>`;
  $('#drOrder').innerHTML=DRAFT_ORDER.map((_,i)=>{const s=draftTurn(G.seed,i);return`<i class="${s===me?'me':'foe'}${i<DR.n?' past':''}${i===DR.n?' now':''}"></i>`}).join('');
  $('#drPool').innerHTML=DR.pool.map(id=>draftTaken(id)?'<i class="dr-slot"></i>'
    :`<button class="dr-pick" data-id="${id}" aria-label="${esc(cardLabel(id))}"${mine&&!draftAway()?'':' disabled'}>${cardHTML(id,'grey')}</button>`).join('');
  $('#scr-draft').classList.toggle('mine',mine);
  $('#drClock').classList.toggle('hidden',done);
  $$('#drPool .dr-pick').forEach(b=>b.onclick=()=>draftMine(+b.dataset.id));
}
$('#drBack').onclick=()=>{
  sfx('click');
  modal(`<h2>Leave the draft?</h2>${DR&&DR.cpu?'':'<p>The other player goes back to the room.</p>'}`,[
    {label:'Leave',cls:'danger',wait:true,fn:()=>{if(!(DR&&DR.cpu)){clearRejoin();netClose(true)}G=null;DR=null;show('menu')}},{label:'Stay',cls:'primary',esc:true}]);
};
