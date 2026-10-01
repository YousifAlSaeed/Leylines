'use strict';
/* =====================================================================
   MATCH FLOW
   ===================================================================== */
let G=null;
/* G = {mode, rules, trade, diff, me, bottom, names[], decks[[],[]], seed, rng, st, first, sd, sel, busy, over, inbox[]} */
function baseMatch(mode,extra){
  return{mode,rules:{...SAVE.rules},trade:'none',diff:SAVE.diff,me:0,bottom:0,names:['You','CPU'],decks:[null,null],
    seed:rand32(),sd:0,sel:null,busy:false,over:false,inbox:[],...extra};
}
function startAI(){
  if(deckable(collPool())<5)ensureMinimum();
  G=baseMatch('ai',{trade:SAVE.trade,names:['You',`CPU · ${DIFFS.find(d=>d[0]===SAVE.diff)[1]}`]});
  G.decks[1]=aiDeck(G.diff);
  if(G.rules.random){G.decks[0]=randomDeck(collPool());startMatch();return}
  openDeck({title:'Choose 5 cards',pool:collPool(),pre:preDeck(),color:'blue',loadouts:true,
    onDone:ids=>{SAVE.lastDeck=ids;save();G.decks[0]=ids;startMatch()},onBack:()=>openSetup('ai')});
}
function startLocal(){
  G=baseMatch('local',{names:['Blue','Red']});
  if(G.rules.random){G.decks=[randomDeck(fullPool()),randomDeck(fullPool())];startMatch();return}
  openDeck({title:'Blue — choose 5',pool:fullPool(),color:'blue',onBack:()=>openSetup('local'),
    onDone:ids=>{G.decks[0]=ids;
      modal('<h2>Pass the device</h2><p>Red, it\'s your turn to choose 5 cards.</p>',[{label:'Ready',cls:'primary',fn:()=>
        openDeck({title:'Red — choose 5',pool:fullPool(),color:'red',onBack:startLocal,onDone:ids2=>{G.decks[1]=ids2;startMatch()}})}]);
    }});
}
function startMatch(){
  G.rng=mulberry32(G.seed);G.sd=0;G.over=false;
  const first=G.rng()<.5?0:1;
  show('game');buildBoard();
  newRound(G.decks[0],G.decks[1],first);
}
async function newRound(h0,h1,first){
  const g=G;
  G.first=first;G.sel=null;G.busy=true;
  G.st=newState(h0,h1,first,genElements(G.rules,G.rng));
  renderGame();
  const who=G.mode==='local'?(first===0?'Blue':'Red')+' goes first':first===G.me?'You go first':esc(G.mode==='ai'?'CPU':oppName())+' goes first';
  await banner(who,'small');await wait(250);
  if(G!==g)return;
  G.busy=false;nextTurn();
}
function isHuman(p){return G.mode==='local'||p===G.me}
function canAct(p){return G&&!G.busy&&!G.over&&!G.timeUp&&G.st.turn===p&&isHuman(p)}
function colorOf(p){return p===G.bottom?'blue':'red'}
function viewerSees(p){return G.rules.open||(G.mode==='local'?p===G.st.turn:p===G.me)}

function nextTurn(){
  if(!G)return;
  G.sel=null;renderGame();
  if(isFull(G.st)){endRound();return}
  startTurnTimer();
  if(G.mode==='ai'&&G.st.turn===1)aiTurn();
  else if(G.mode==='online'&&G.st.turn!==G.me)pump();
}
function aiTurn(){
  const g=G;G.busy=true;renderHud();
  const t0=performance.now();
  setTimeout(async()=>{
    if(G!==g)return;
    const[hi,cell]=aiChoose(G.st,G.rules,G.diff);
    const el=$('#handTop').children[hi];
    await wait(Math.max(0,450-(performance.now()-t0)));
    if(G!==g)return;
    el&&el.classList.add('sel');sfx('click');
    await wait(380);
    if(G!==g)return;
    execMove(hi,cell);
  },80);
}
function requestMove(hi,cell){
  if(!canAct(G.st.turn)||G.st.b[cell]>=0)return;
  if(G.mode==='online')netSend({t:'move',hi,cell});
  execMove(hi,cell);
}
async function execMove(hi,cell){
  const g=G,st=G.st,p=st.turn,q=1-p,id=st.h[p][hi];
  G.busy=true;G.sel=null;G.timeUp=false;stopTurnTimer();
  const sc=[score(st,0),score(st,1)];
  const ev=[];play(st,G.rules,hi,cell,ev);
  if(G.mode!=='local'&&p===G.me)profFlips(ev);
  renderHands();renderHud();$$('.cell').forEach(c=>c.classList.remove('hot','over'));
  CELLS[cell].innerHTML=cardHTML(id,colorOf(p),{mod:st.m[cell],cls:'drop'});
  sfx('place');
  await wait(300);
  for(const e of ev){
    if(G!==g)return;
    if(e.t!=='basic')await banner({same:'Same!',plus:'Plus!',combo:'Combo!'}[e.t]);
    if(G!==g)return;
    flipCells(e.cells,p,cell);
    sc[p]+=e.cells.length;sc[q]-=e.cells.length;
    setTimeout(()=>G===g&&setScores(sc),230);
    await wait(520);
  }
  if(G!==g)return;
  G.busy=false;nextTurn();
}
function flipCells(cells,p,origin){
  sfx('flip');
  const col=colorOf(p);
  for(const c of cells){
    const card=CELLS[c].querySelector('.card');if(!card)continue;
    const cls=Math.floor(c/3)===Math.floor(origin/3)?'fy':'fx';
    card.classList.remove('fx','fy','drop');void card.offsetWidth;card.classList.add(cls);
    setTimeout(()=>{card.classList.remove('blue','red');card.classList.add(col)},230);
  }
}
async function endRound(){
  const g=G;G.busy=true;
  const s0=score(G.st,0),s1=score(G.st,1);
  await wait(450);if(G!==g)return;
  if(s0===s1&&G.rules.suddenDeath&&G.sd<5){
    G.sd++;
    await banner('Sudden Death!','sd');await wait(200);if(G!==g)return;
    const h=[[],[]];
    for(let i=0;i<9;i++)h[G.st.o[i]].push(G.st.b[i]);
    h[0].push(...G.st.h[0]);h[1].push(...G.st.h[1]);
    newRound(h[0],h[1],1-G.first);
    return;
  }
  finish(s0,s1);
}

/* ---------- results & trading ---------- */
// sweep: the winner must own all 9 squares at the end
const swept=w=>w>=0&&G.st.o.every(o=>o===w);
function tradeCount(s0,s1,w){return{one:1,diff:Math.min(5,Math.abs(s0-s1)),all:5,sweep:swept(w)?5:0}[G.trade]||0}
function rowHTML(ids,color){return`<div class="cardrow">${ids.map(id=>cardHTML(id,color)).join('')}</div>`}
function finish(s0,s1){
  G.over=true;G.busy=true;renderHud();
  const w=s0>s1?0:s1>s0?1:-1;
  const sb=G.bottom===0?s0:s1,sr=G.bottom===0?s1:s0;
  let title;
  if(G.mode==='local')title=w<0?'Draw':w===0?'Blue wins':'Red wins';
  else title=w<0?'Draw':w===G.me?'You win':'You lose';
  let reward='';
  if(G.mode!=='local')reward=rewardHTML(recordMatch(w<0?'d':w===G.me?'w':'l',
    {online:G.mode==='online',diff:G.mode==='ai'?G.diff:null,sweep:swept(w),sd:G.sd>0,elemental:!!G.rules.elemental}));
  sfx(w<0?'draw':(G.mode==='local'||w===G.me)?'win':'lose');
  let head=`<div class="kick">${G.mode==='online'?'Online match':'Match over'}</div><h2>${title}</h2>`+(G.mode==='online'?`<p>${esc(G.names[G.me])} vs <b class="gold">${esc(oppName())}</b></p>`:'')+
    `<div class="bigscore"><span class="b">${sb}</span> – <span class="r">${sr}</span></div>`+reward;
  const n=(G.mode==='local'||w<0)?0:tradeCount(s0,s1,w);
  const g=G;
  setTimeout(()=>{
    if(G!==g)return;
    if(!n){resultModal(head+(G.mode==='local'||G.trade==='none'?'':w<0?'<p>No cards change hands on a draw.</p>':
      G.trade==='sweep'?'<p>No sweep: cards only change hands when the winner owns the whole board.</p>':''));return}
    if(G.trade==='sweep')head+='<p class="gold"><b>Full board sweep!</b></p>';
    const loser=1-w,loserDeck=G.decks[loser];
    if(w===G.me){
      const take=idx=>{
        const ids=idx.map(i=>loserDeck[i]);ids.forEach(collAdd);earn('spoils');profCheck();save();
        if(G.mode==='online'&&n<5)netSend({t:'trade',idx});
        resultModal(head+`<p>You won ${ids.length>1?'these cards':'this card'}:</p>`+rowHTML(ids,'blue')+freshHTML());
      };
      if(n>=loserDeck.length)take(loserDeck.map((_,i)=>i));
      else pickCards(head,loserDeck,n).then(take);
    }else{
      const lose=idx=>{
        const ids=idx.map(i=>G.decks[G.me][i]);ids.forEach(collRemove);save();
        const added=ensureMinimum();
        resultModal(head+`<p>${G.mode==='ai'?'The CPU':esc(oppName())} took:</p>`+rowHTML(ids,'red')+
          (added.length?`<p>Your collection ran low — a wandering dealer gives you:</p>`+rowHTML(added,'blue'):''));
      };
      const myDeck=G.decks[G.me];
      if(n>=myDeck.length)lose(myDeck.map((_,i)=>i));
      else if(G.mode==='ai'){
        const idx=myDeck.map((id,i)=>i).sort((a,b)=>cardStrength(myDeck[b])-cardStrength(myDeck[a])).slice(0,n);
        lose(idx);
      }else{
        if(G.pendingTrade){lose(G.pendingTrade);return}
        G.onTrade=lose;
        modal(head+`<p><span class="spin"></span>${esc(oppName())} is choosing ${n} card${n>1?'s':''}…</p>`+rowHTML(myDeck,'blue'),[]);
      }
    }
  },600);
}
function pickCards(head,deck,n){
  return new Promise(res=>{
    const sel=new Set();
    const box=modal(head+`<p>Choose <b>${n}</b> card${n>1?'s':''} to take.</p><div class="cardrow">${deck.map((id,i)=>`<div class="pk" data-i="${i}" role="button" aria-pressed="false" aria-label="${esc(cardLabel(id))}">${cardHTML(id,'red')}</div>`).join('')}</div>`,
      [{label:'Take',cls:'primary',keep:true,fn:()=>{if(sel.size===n){closeModal();res([...sel])}}}]);
    const btn=box.querySelector('.mbtns .btn');btn.disabled=true;
    box.querySelectorAll('.pk').forEach(el=>el.onclick=()=>{
      const i=+el.dataset.i;
      if(sel.has(i))sel.delete(i);else if(sel.size<n)sel.add(i);else if(n===1){sel.clear();sel.add(i)}
      box.querySelectorAll('.pk').forEach(x=>{x.classList.toggle('on',sel.has(+x.dataset.i));x.setAttribute('aria-pressed',sel.has(+x.dataset.i))});
      btn.disabled=sel.size!==n;sfx('click');
    });
  });
}
function resultModal(html){
  modal(html,[
    {label:G.mode==='online'?'Rematch':'Play again',cls:'primary',keep:G.mode==='online',fn:playAgain},
    {label:'Menu',fn:leaveMatch}
  ]);
}
function playAgain(){
  if(G.mode==='ai')startAI();
  else if(G.mode==='local')startLocal();
  else{
    NET.meRe=true;netSend({t:'rematch'});
    const b=$('#modal .mbtns .btn.primary');if(b){b.disabled=true;b.innerHTML='<span class="spin"></span>Waiting…'}
    checkRematch();
  }
}
function leaveMatch(){
  closeModal();
  if(G&&G.mode==='online')netClose(true);
  G=null;show('menu');
}
$('#btnQuit').onclick=()=>{
  sfx('click');if(!G)return;
  if(G.over){leaveMatch();return}
  modal(`<h2>Leave match?</h2><p>${G.mode==='local'?'The game will be abandoned.':'Leaving counts as a loss (no cards are traded).'}</p>`,[
    {label:'Leave',cls:'danger',fn:()=>{if(G&&G.mode!=='local'){recordMatch('l',{online:G.mode==='online'});freshToast()}leaveMatch()}},
    {label:'Keep playing',cls:'primary',esc:true}]);
};
$('#btnSnd').onclick=()=>{SAVE.sound=!SAVE.sound;save();updSnd();sfx('click');musicSync()};
const SND_ON='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16.5 9a4 4 0 010 6M19 6.5a7.5 7.5 0 010 11"/></svg>',
  SND_OFF='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h4l5 4V6L8 10z"/><path d="M17 10l4 4M21 10l-4 4"/></svg>';
function updSnd(){const b=$('#btnSnd');b.innerHTML=SAVE.sound?SND_ON:SND_OFF;b.setAttribute('aria-label',SAVE.sound?'Sound on':'Sound off');$$('[data-vol]').forEach(r=>r.paint&&r.paint())}

/* ---------- turn timer ---------- */
// The ring and bar are redrawn every frame from a fixed deadline, so they move at a steady speed however busy the page is.
// The interval below handles the logic (seconds, warnings, time-up), because animation frames pause in a background tab.
const RING=106.8;
let TMR={g:null,end:0,dur:0,p:-1,fired:false,sec:-1,raf:0};
function startTurnTimer(){
  // the CPU doesn't need a clock; everyone else gets the chosen time per turn
  if(!G||!G.rules.timer||G.over||(G.mode==='ai'&&G.st.turn!==G.me)){stopTurnTimer();return}
  const dur=G.rules.timer*1000;
  cancelAnimationFrame(TMR.raf);
  TMR={g:G,end:performance.now()+dur,dur,p:G.st.turn,fired:false,sec:-1,raf:0};
  $('#timer').classList.remove('off');$('#tbar').classList.remove('off');
  tickTimer();drawTimer(performance.now());
}
function stopTurnTimer(){
  TMR.g=null;cancelAnimationFrame(TMR.raf);
  $('#timer').classList.add('off');$('#tbar').classList.add('off');
  setTimerLevel('');
}
function setTimerLevel(lvl){
  for(const el of [$('#timer'),$('#tbar')]){el.classList.toggle('warn',lvl==='warn');el.classList.toggle('crit',lvl==='crit')}
  $('#board').classList.toggle('crit',lvl==='crit');
  const onBot=TMR.g&&TMR.p===G.bottom;
  $('#sideBot').classList.toggle('crit',lvl==='crit'&&onBot);
  $('#sideTop').classList.toggle('crit',lvl==='crit'&&!onBot);
}
const tProg=$('#tProg'),tFill=$('#tFill');
function drawTimer(now){
  if(!TMR.g)return;
  const f=Math.max(0,TMR.end-now)/TMR.dur;
  tProg.style.strokeDashoffset=(RING*(1-f)).toFixed(3);
  tFill.style.transform=`scaleX(${f.toFixed(6)})`;
  if(f>0)TMR.raf=requestAnimationFrame(drawTimer);
}
function tickTimer(){
  if(!TMR.g)return;
  if(TMR.g!==G||G.over){stopTurnTimer();return}
  const rem=Math.max(0,TMR.end-performance.now()),sec=Math.ceil(rem/1000),t=TMR.dur/1000;
  if(sec!==TMR.sec){
    TMR.sec=sec;
    $('#tNum').textContent=sec;
    setTimerLevel(sec<=timerCrit(t)?'crit':sec<=timerWarn(t)?'warn':'');
    $('#timer').setAttribute('aria-label',`${sec} seconds left`);
    if(sec>0&&sec<=5&&isHuman(TMR.p))sfx('tick');
  }
  if(rem<=0&&!TMR.fired){TMR.fired=true;onTimeUp(TMR.p)}
}
setInterval(tickTimer,100);
async function onTimeUp(p){
  // each client only auto-plays for its own player; an online opponent's move arrives over the network
  if(!isHuman(p))return;
  const g=G;
  G.timeUp=true;G.sel=null;
  if(drag)endDrag({},true);
  renderHands();renderBoard();
  sfx('timeup');
  await banner("Time's up!",'small');
  if(G!==g||G.busy||G.over||G.st.turn!==p)return;
  G.timeUp=false;
  const moves=genMoves(G.st),[hi,cell]=moves[Math.floor(Math.random()*moves.length)];
  if(G.mode==='online')netSend({t:'move',hi,cell});
  execMove(hi,cell);
}
