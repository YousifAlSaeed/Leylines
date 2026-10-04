'use strict';
/* =====================================================================
   MATCH FLOW
   ===================================================================== */
let G=null;
/* G = {mode, rules, trade, diff, bo, ser, me, bottom, names[], decks[[],[]], seed, rng, st, first, sd, sel, busy, over, inbox[]}
   bo = matches in the series (1, 3 or 5); ser = {n: match number, first: who went first in match 1, wins[2], log[]} */
function baseMatch(mode,extra){
  return{mode,rules:{...SAVE.rules},trade:'none',diff:SAVE.diff,bo:boOf(SAVE.bo),ser:null,me:0,bottom:0,names:['You','CPU'],decks:[null,null],
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
  G.ser={n:1,first,wins:[0,0],log:[]};
  if(G.mode==='online')oweAdd();
  show('game');buildBoard();
  newRound(G.decks[0],G.decks[1],first);
}
// the next match of a series: same decks, and whoever went first last time goes second
function nextMatch(){
  const s=G.ser;s.n++;
  G.sd=0;G.over=false;G.pendingTrade=null;
  newRound(G.decks[0],G.decks[1],s.n%2?s.first:1-s.first);
}
async function newRound(h0,h1,first){
  const g=G;
  G.first=first;G.sel=null;G.busy=true;
  G.st=newState(h0,h1,first,genElements(G.rules,G.rng));
  renderGame();
  const who=G.mode==='local'?(first===0?'Blue':'Red')+' goes first':first===G.me?'You go first':esc(G.mode==='ai'?'CPU':oppName())+' goes first';
  if(G.bo>1&&!G.sd){await banner(`Match ${G.ser.n}`);if(G!==g)return}
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
  liveSave();
  // Chaos: the card that must be played this turn. Drawn from the match's seeded random numbers, so both online players get the same one
  G.sel=null;G.forced=null;
  if(G.rules.chaos&&!isFull(G.st)){G.forced=chaosPick(G.st,G.rng);if(isHuman(G.st.turn))G.sel=G.forced}
  renderGame();
  if(isFull(G.st)){endRound();return}
  startTurnTimer();
  // the Daily Puzzle is a single move: it ends as soon as it's placed
  if(G.daily&&G.daily.kind==='puzzle'&&G.st.turn!==G.me){puzzleDone();return}
  if(G.mode==='ai'&&G.st.turn===1)aiTurn();
  else if(G.mode==='online'&&G.st.turn!==G.me)pump();
}
function aiTurn(){
  const g=G;G.busy=true;renderHud();
  const t0=performance.now();
  setTimeout(async()=>{
    if(G!==g)return;
    const[hi,cell]=aiChoose(G.st,G.rules,G.diff,G.forced);
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
  if(!canAct(G.st.turn)||G.st.b[cell]>=0||(G.forced!=null&&hi!==G.forced))return;
  if(G.mode==='online')netSend({t:'move',hi,cell});
  if(G.daily)dailyMoved();
  execMove(hi,cell);
}
async function execMove(hi,cell){
  const g=G,st=G.st,p=st.turn,q=1-p,id=st.h[p][hi];
  G.busy=true;G.sel=null;G.timeUp=false;stopTurnTimer();
  if(p===G.me)G.moved=true;
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
  emoteMove(p,ev);
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
// in a series: Diff uses the series winner's last win, Sweep counts if any of their wins was a sweep
function tradeCount(s0,s1,w){
  const won=G.ser.log.filter(m=>m.w===w),last=won[won.length-1];
  const diff=G.bo>1?(last?last.diff:0):Math.abs(s0-s1),sw=G.bo>1?won.some(m=>m.sweep):swept(w);
  return{one:1,diff:Math.min(5,diff),all:5,sweep:sw?5:0}[G.trade]||0;
}
function rowHTML(ids,color){return`<div class="cardrow">${ids.map(id=>cardHTML(id,color)).join('')}</div>`}
const resultTitle=(w,end='')=>G.mode==='local'?(w<0?'Draw':(w===0?'Blue':'Red')+' wins'+end):w<0?'Draw':(w===G.me?'You win':'You lose')+end;
function finish(s0,s1){
  G.over=true;G.busy=true;
  const m=G.bottom===0?[s0,s1]:[s1,s0],mw=s0>s1?0:s1>s0?1:-1,ser=G.ser;
  ser.log.push({w:mw,diff:Math.abs(s0-s1),sweep:swept(mw),sb:m[0],sr:m[1]});
  if(G.sd>0)ser.sd=1;
  if(mw>=0)ser.wins[mw]++;
  renderHud();
  let reward='';
  if(G.mode!=='local')reward=rewardHTML(histXp(recordMatch(mw<0?'d':mw===G.me?'w':'l',
    {online:G.mode==='online',diff:G.mode==='ai'?G.diff:null,sweep:swept(mw),sd:G.sd>0,elemental:!!G.rules.elemental})));
  sfx(mw<0?'draw':(G.mode==='local'||mw===G.me)?'win':'lose');
  const vs=G.mode==='online'?`<p>${esc(G.names[G.me])} vs <b class="gold">${esc(oppName())}</b></p><div class="fr-res">${friendBtn(NET.oppUser)}</div>`:'';
  const big=(b,r)=>`<div class="bigscore"><span class="b">${b}</span> – <span class="r">${r}</span></div>`;
  const sw=[ser.wins[G.bottom],ser.wins[1-G.bottom]];
  if(G.bo>1&&!seriesDone(G.bo,ser.n,ser.wins)){
    liveSave(true);
    const g=G;
    setTimeout(()=>{if(G===g)seriesNextModal(`<div class="kick">Best of ${G.bo} · Match ${ser.n}</div><h2>${resultTitle(mw)}</h2>`+vs+big(m[0],m[1])+
      `<p class="serscore">Series <b class="b">${sw[0]}</b> – <b class="r">${sw[1]}</b></p>`+reward)},600);
    return;
  }
  let w=mw,head;
  if(G.bo>1){
    w=ser.wins[0]>ser.wins[1]?0:ser.wins[1]>ser.wins[0]?1:-1;
    head=`<div class="kick">Best of ${G.bo} · ${G.mode==='online'?'Online series':'Series over'}</div><h2>${w<0?'Series tied':resultTitle(w,' the series')}</h2>`+vs+big(sw[0],sw[1])+
      `<div class="serlog">${ser.log.map((x,i)=>`<span class="${x.w<0?'d':x.w===G.bottom?'b':'r'}">M${i+1} ${x.sb}–${x.sr}</span>`).join('')}</div>`+reward;
  }else head=`<div class="kick">${G.daily?'Daily · '+(G.daily.kind==='duel'?'Duel':'Gauntlet'):G.mode==='online'?'Online match':'Match over'}</div><h2>${resultTitle(w)}</h2>`+vs+big(m[0],m[1])+reward;
  if(histAdd(w<0?'d':w===G.me?'w':'l'))save();
  if(G.daily)head+=dailyFinish(w);
  const n=(G.mode==='local'||w<0)?0:tradeCount(s0,s1,w);
  // vs Computer a loss is settled straight away, so closing the app on the result screen can't undo it
  const cpuTook=G.mode==='ai'&&n&&w!==G.me?loseCards(strongest(G.decks[G.me],n)):null;
  liveClear();
  // online, nothing more is owed unless you lost cards (then it's settled when the winner decides)
  if(G.mode==='online'&&!(n&&w!==G.me))oweClear(matchKey());
  const g=G;
  setTimeout(()=>{
    if(G!==g)return;
    if(!n){resultModal(head+(G.mode==='local'||G.trade==='none'?'':w<0?`<p>No cards change hands on a ${G.bo>1?'tied series':'draw'}.</p>`:
      G.trade==='sweep'?`<p>No sweep: cards only change hands when the winner owns the whole board${G.bo>1?' in a match they won':''}.</p>`:''));return}
    if(G.trade==='sweep')head+='<p class="gold"><b>Full board sweep!</b></p>';
    const loserDeck=G.decks[1-w],online=G.mode==='online';
    if(w===G.me){
      // online the winner can take the cards or spare the loser
      pickCards(head,loserDeck,n,{spare:online}).then(idx=>{
        if(G!==g)return;
        if(idx==='spare'){netSend({t:'trade',idx:[],spare:true});forfeitPost(NET.oppUser,matchKey(),[]);resultModal(head+spareHTML(oppName(),spareGive()));return}
        const ids=idx.map(i=>loserDeck[i]);ids.forEach(collAdd);earn('spoils');profCheck();histTrade('won',ids);save();
        // also through the server, in case they close the game before it reaches them
        if(online){netSend({t:'trade',idx});forfeitPost(NET.oppUser,matchKey(),ids)}
        resultModal(head+`<p>You won ${ids.length>1?'these cards':'this card'}:</p>`+rowHTML(ids,'blue')+freshHTML());
      });
    }else if(cpuTook)resultModal(head+tookHTML('The CPU',cpuTook));
    else{
      // online the winner decides: these cards, or a spare
      const decided=idx=>{
        oweClear(matchKey());
        if(idx==='spare'){resultModal(head+sparedHTML(oppName(),G.decks[G.me]),thanksBtn());return}
        resultModal(head+tookHTML(esc(oppName()),loseCards(idx)));
      };
      if(G.pendingTrade){decided(G.pendingTrade);return}
      G.onTrade=decided;
      modal(head+`<p><span class="spin"></span>${esc(oppName())} is deciding: take ${plural(n,'card')} or spare you…</p>`+rowHTML(G.decks[G.me],'blue'),[]);
    }
  },600);
}
// resolves with the chosen indexes, or 'spare' (o.spare adds that button). Taking every card needs no choosing.
function pickCards(head,deck,n,o={}){
  return new Promise(res=>{
    const all=n>=deck.length;
    if(all&&!o.spare){res(deck.map((_,i)=>i));return}
    const sel=new Set(all?deck.map((_,i)=>i):[]);
    const ask=o.ask||(all?`Take all their cards, or spare them.`:`Choose <b>${n}</b> card${n>1?'s':''} to take${o.spare?', or spare them':''}.`);
    const box=modal(head+`<p>${ask}</p><div class="cardrow">${deck.map((id,i)=>`<div class="pk${all?' on':''}" data-i="${i}" role="button" aria-pressed="${all}" aria-label="${esc(cardLabel(id))}">${cardHTML(id,'red')}</div>`).join('')}</div>`+
      (o.spare?`<p class="note">💛 Spare: they keep their cards, and you count a spare. Every ${SPARE_PACK} spares give a free pack.</p>`:''),
      [{label:all?'Take all':'Take',cls:'primary',keep:true,fn:()=>{if(sel.size===n||all){closeModal();res([...sel])}}},
       ...(o.spare?[{label:'Spare 💛',fn:()=>res('spare')}]:[])]);
    const btn=box.querySelector('.mbtns .btn');btn.disabled=!all;
    if(!all)box.querySelectorAll('.pk').forEach(el=>el.onclick=()=>{
      const i=+el.dataset.i;
      if(sel.has(i))sel.delete(i);else if(sel.size<n)sel.add(i);else if(n===1){sel.clear();sel.add(i)}
      box.querySelectorAll('.pk').forEach(x=>{x.classList.toggle('on',sel.has(+x.dataset.i));x.setAttribute('aria-pressed',sel.has(+x.dataset.i))});
      btn.disabled=sel.size!==n;sfx('click');
    });
  });
}
function seriesNextModal(html){
  modal(html,[
    {label:'Next match',cls:'primary',keep:G.mode==='online',fn:readyNext},
    {label:'Menu',fn:()=>leaveCount()?askLeave():leaveMatch()}
  ]);
}
// online, both players press Next match before it starts; the match itself is the same on both sides
function readyNext(){
  if(G.mode!=='online'){nextMatch();return}
  NET.meNext=G.ser.n;netSend({t:'next',n:G.ser.n});
  const b=$('#modal .mbtns .btn.primary');if(b){b.disabled=true;b.innerHTML='<span class="spin"></span>Waiting…'}
  checkNext();
}
function checkNext(){
  if(!G||G.mode!=='online'||!G.over||!G.ser||NET.meNext!==G.ser.n||NET.oppNext!==G.ser.n)return;
  closeModal();nextMatch();
}
// extra: one more button before the others (Say thanks)
function resultModal(html,extra){
  // the match is fully settled (trade included); online, a dropped player can no longer come back to it
  G.done=true;
  // a Daily challenge says what comes next (try again, next opponent), or nothing
  const again=G.daily?G.daily.again:{label:G.mode==='online'?'Rematch':'Play again',fn:playAgain};
  modal(html,[
    ...(extra?[extra]:[]),
    ...(again?[{label:again.label,cls:extra?'':'primary',fn:again.fn}]:[]),
    {label:'Menu',cls:again||extra?'':'primary',fn:leaveMatch}
  ]);
}
function playAgain(){
  if(G.mode==='ai')startAI();
  else if(G.mode==='local')startLocal();
  else backToRoom();
}
function leaveMatch(){
  closeModal();
  // left between the matches of a series: it goes in the history as it stood
  if(G&&G.over&&G.ser&&G.ser.log.length&&!G.hist){const sw=G.ser.wins,a=sw[G.me],b=sw[1-G.me];if(histAdd(a>b?'w':a<b?'l':'d','early'))save()}
  if(G&&G.mode==='online'){clearRejoin();netClose(true)}
  if(G&&G.mode==='ai')liveClear();
  G=null;show('menu');
}

/* ---------- leaving early ---------- */
// the match (or the rest of a series) is still being played, so leaving now gives it up
function stillPlaying(){return !!(G&&G.st&&!G.done&&(!G.over||G.bo>1&&!seriesDone(G.bo,G.ser.n,G.ser.wins)))}
// the cards you give up by leaving: what the trade rule takes on a loss, and at least 1 (so Sweep and a close Diff take 1).
// Nothing in a same-screen game, the Daily, or with no trade rule.
function leaveCount(){
  if(!stillPlaying()||G.mode==='local'||G.daily||G.trade==='none')return 0;
  const gap=Math.abs(score(G.st,0)-score(G.st,1));
  return {one:1,diff:Math.max(1,Math.min(5,gap)),all:5,sweep:1}[G.trade]||0;
}
// the CPU always takes your strongest cards: their indexes in your hand
const strongest=(deck,n)=>deck.map((_,i)=>i).sort((a,b)=>cardStrength(deck[b])-cardStrength(deck[a])).slice(0,n);
// you lose these cards (indexes in your hand); a collection that drops too low gets a few back. The caller shows what happened.
function loseCards(idx){
  const deck=G.decks[G.me],ids=idx.filter(i=>Number.isInteger(i)&&deck[i]!=null).map(i=>deck[i]);
  ids.forEach(collRemove);histTrade('lost',ids);save();
  return {ids,added:ensureMinimum()};
}
function tookHTML(who,t){
  return `<p>${who} took:</p>`+rowHTML(t.ids,'red')+(t.added.length?`<p>Your collection ran low — a wandering dealer gives you:</p>`+rowHTML(t.added,'blue'):'');
}
// you left, or tapped Give up on a CPU match you closed: a loss, and vs Computer the cards go now
function quitMatch(){
  const puzzle=G.daily&&G.daily.kind==='puzzle',n=leaveCount(),ai=G.mode==='ai';
  let took=null;
  if(G.mode!=='local'&&!puzzle){
    // between the matches of a series that match already counted; the series is what's given up
    if(!G.over)histXp(recordMatch('l',{online:G.mode==='online'}));
    const h=histAdd('l','you');
    if(ai&&n)took=loseCards(strongest(G.decks[G.me],n));
    // online the other player decides; it reaches you through the server (spare.js)
    if(G.mode==='online'&&n)oweLeft(matchKey(),h);
    save();freshToast();
  }
  dailyLeave();leaveMatch();
  if(took)modal(`<h2>Match over</h2><p>You left, so it counts as a loss.</p>`+tookHTML('The CPU',took),[{label:'OK',cls:'primary',esc:true}]);
}
function askLeave(){
  const n=leaveCount(),opp=G.mode==='ai'?'The CPU':esc(oppName()),cards=plural(n,'card');
  // vs Computer, leaving before you've played a card costs nothing
  if(G.mode==='ai'&&!G.daily&&!G.moved&&!G.over&&G.ser.n===1&&!G.sd){
    modal(`<h2>Leave match?</h2><p>You haven't played a card yet, so leaving now costs nothing.</p>`,[
      {label:'Leave',cls:'danger',fn:leaveMatch},{label:'Keep playing',cls:'primary',esc:true}]);
    return;
  }
  let p;
  if(G.mode==='local')p='<p>The game will be abandoned.</p>';
  else if(!n)p=`<p>Leaving counts as a loss.</p>`;
  else if(G.mode==='ai'){const d=G.decks[G.me],ids=strongest(d,n).map(i=>d[i]);
    p=`<p>Leaving counts as a loss. <b class="gold">The CPU takes ${n>=5?'all your cards':cards}</b>, the same as if it won.</p>`+rowHTML(ids,'red')+
      (n<5?`<p class="note">The CPU always takes your strongest ${n>1?'cards':'card'}.</p>`:'');}
  else p=`<p>Leaving counts as a loss. <b class="gold">${opp} can take ${n>=5?'all your cards':cards}</b>, or spare you.</p>`;
  // between the matches of a series, the way back is the Next match button
  const back=G.over?{label:'Next match',cls:'primary',keep:G.mode==='online',fn:readyNext}:{label:'Keep playing',cls:'primary',esc:true};
  modal(`<h2>Leave ${G.over?'the series':'match'}?</h2>${p}`,[{label:'Leave',cls:'danger',fn:()=>{if(G)quitMatch()}},back]);
}
$('#btnQuit').onclick=()=>{
  sfx('click');if(!G)return;
  if(G.over&&!leaveCount()){leaveMatch();return}
  askLeave();
};

/* ---------- picking a CPU match back up ---------- */
// A match vs Computer is saved at the start of every turn (SAVE.live), so closing the app doesn't end it:
// the menu offers to carry on, and giving up counts as leaving. The Daily has its own rules, so it isn't saved.
function liveSave(next){
  if(!G||G.mode!=='ai'||G.daily||!G.st||!next&&(G.over||isFull(G.st)))return;
  SAVE.live=JSON.parse(JSON.stringify({v:1,next:!!next,rules:G.rules,trade:G.trade,diff:G.diff,bo:G.bo,names:G.names,decks:G.decks,
    seed:G.seed,a:G.rng.a,ser:G.ser,sd:G.sd,first:G.first,st:G.st,moved:!!G.moved}));
  save();
}
function liveClear(){if(SAVE.live){SAVE.live=null;save()}}
// the saved match as a G, or null if it doesn't hold together
function liveMatchFrom(L){
  try{
    const ok9=a=>Array.isArray(a)&&a.length===9,st=L.st,hand=h=>Array.isArray(h)&&h.every(i=>CARDS[i]);
    if(L.v!==1||!L.decks.every(d=>Array.isArray(d)&&d.length===5&&hand(d))||!ok9(st.b)||!ok9(st.o)||!ok9(st.m)||!st.h.every(hand)||!Array.isArray(L.ser.wins))return null;
    const g=baseMatch('ai',{rules:{...defSave().rules,...L.rules},trade:netTrade(L.trade),diff:DIFFS.some(d=>d[0]===L.diff)?L.diff:'normal',bo:boOf(L.bo),
      names:L.names,decks:L.decks,seed:L.seed>>>0,ser:L.ser,sd:L.sd|0,first:L.first?1:0,st,moved:!!L.moved});
    g.rng=mulberry32(L.a|0);
    return g;
  }catch(e){return null}
}
// on the menu: carry on with the match the app closed on, or give it up
function liveOffer(){
  const L=SAVE.live;
  if(!L||G||!$('#scr-menu').classList.contains('on')||$('#modal').classList.contains('on'))return;
  const g=liveMatchFrom(L);
  if(!g){liveClear();return}
  G=g;const n=leaveCount(),s=[score(g.st,0),score(g.st,1)];G=null;
  modal(`<div class="kick">vs Computer · ${esc(DIFFS.find(d=>d[0]===g.diff)[1])}${g.bo>1?` · Best of ${g.bo}`:''}</div><h2>Match in progress</h2>`+
    `<p>You left a match before it ended. Pick up where you left off.</p>`+
    (L.next?`<p class="serscore">Series <b class="b">${g.ser.wins[0]}</b> – <b class="r">${g.ser.wins[1]}</b></p>`:`<div class="bigscore"><span class="b">${s[0]}</span> – <span class="r">${s[1]}</span></div>`)+
    `<p class="note">Giving up counts as a loss${n?`. The CPU takes ${n>=5?'all your cards':plural(n,'card')}`:''}.</p>`,[
    {label:'Resume',cls:'primary',fn:()=>liveResume(L)},
    {label:'Give up',cls:'danger',fn:()=>{G=liveMatchFrom(L);if(G){G.over=!!L.next;quitMatch()}else liveClear()}}]);
}
function liveResume(L){
  G=liveMatchFrom(L);if(!G){liveClear();return}
  show('game');buildBoard();
  if(L.next){G.over=true;nextMatch();return}
  G.busy=false;nextTurn();
}
$('#btnSnd').onclick=()=>{SAVE.sound=!SAVE.sound;save();updSnd();sfx('click');musicSync()};
const SND_ON='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16.5 9a4 4 0 010 6M19 6.5a7.5 7.5 0 010 11"/></svg>',
  SND_OFF='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h4l5 4V6L8 10z"/><path d="M17 10l4 4M21 10l-4 4"/></svg>';
function updSnd(){const b=$('#btnSnd');b.innerHTML=SAVE.sound?SND_ON:SND_OFF;b.setAttribute('aria-label',SAVE.sound?'Sound on':'Sound off');$$('[data-vol]').forEach(r=>r.paint&&r.paint())}

/* ---------- turn timer ---------- */
// The ring (landscape) and the bar under the top bar are redrawn every frame from a fixed deadline, so they move at a steady speed however busy the page is.
// The interval below handles the logic (seconds, warnings, time-up), because animation frames pause in a background tab.
const RING=106.8;
let TMR={g:null,end:0,dur:0,p:-1,fired:false,sec:-1,raf:0,lt:0};
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
  // a phone that slept or went to another app froze this page: the clock doesn't run while frozen,
  // so nobody comes back to a random card already played for them
  const now=performance.now();
  if(TMR.lt&&now-TMR.lt>2000)TMR.end+=now-TMR.lt-100;
  TMR.lt=now;
  const rem=Math.max(0,TMR.end-performance.now()),sec=Math.ceil(rem/1000),t=TMR.dur/1000;
  if(sec!==TMR.sec){
    TMR.sec=sec;
    setTimerLevel(sec<=timerCrit(t)?'crit':sec<=timerWarn(t)?'warn':'');
    $('#tNum').textContent=sec;
    $('#tbar').setAttribute('aria-label',`${sec} seconds left`);
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
  const moves=genMoves(G.st).filter(m=>G.forced==null||m[0]===G.forced),pick=moves[Math.floor(Math.random()*moves.length)];
  // genMoves skips a second copy of the same card, so the Chaos card picks a random empty square itself
  const hi=G.forced!=null?G.forced:pick[0],cell=G.forced!=null?(e=>e[Math.floor(Math.random()*e.length)])(G.st.b.flatMap((x,i)=>x<0?[i]:[])):pick[1];
  if(G.mode==='online')netSend({t:'move',hi,cell});
  execMove(hi,cell);
}
