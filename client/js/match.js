'use strict';
/* =====================================================================
   MATCH FLOW
   ===================================================================== */
let G=null;
/* G = {mode, rules, trade, diff, bo, ser, me, bottom, names[], decks[[],[]], seed, rng, st, first, sd, sel, busy, over, inbox[]}
   bo = matches in the series (1, 3 or 5); ser = {n: match number, first: who went first in match 1, wins[2], log[], rev[]}
   ser.rev: each match's moves, for the Review after the game (review.js): [{rounds: [{h: [hand, hand], first, el, moves: [[hand index, square]]}], end: final board}] */
function baseMatch(mode,extra){
  return{mode,rules:{...SAVE.rules},trade:'none',diff:SAVE.diff,bo:boOf(SAVE.bo),ser:null,me:0,bottom:0,names:['You','CPU'],decks:[null,null],
    seed:rand32(),sd:0,sel:null,busy:false,over:false,inbox:[],...extra};
}
function startAI(){
  if(deckable(collPool())<5)ensureMinimum();
  G=baseMatch('ai',{rules:{...SAVE.rules,timer:SAVE.cpuTimer,...SAVE.cpuTk},trade:SAVE.trade,names:['You',`CPU · ${DIFFS.find(d=>d[0]===SAVE.diff)[1]}`]});
  G.decks[1]=aiDeck(G.diff);
  if(G.rules.random){G.decks[0]=randomDeck(collPool());startMatch();return}
  openDeck({title:'Choose 5 cards',pool:collPool(),pre:preDeck(),color:'blue',loadouts:true,
    onDone:ids=>{SAVE.lastDeck=ids;save();G.decks[0]=ids;startMatch()},onBack:()=>openSetup('ai')});
}
// Win them back (rules in data.js): the CPU plays holding the cards it took, and you pick a new hand
function wbStart(wb){
  if(deckable(collPool())<5)ensureMinimum();
  const p=G,{h,idx}=winBackHand(wb,cardStrength);
  G=baseMatch('ai',{rules:{...p.rules},trade:p.trade,diff:p.diff,bo:p.bo,names:p.names.slice(),wb:{...wb,idx}});
  G.decks[1]=h;
  if(G.rules.random){G.decks[0]=randomDeck(collPool());startMatch();return}
  openDeck({title:wbName(G.wb),pool:collPool(),pre:preDeck(),color:'blue',loadouts:true,
    onDone:ids=>{SAVE.lastDeck=ids;save();G.decks[0]=ids;startMatch()},
    onBack:()=>modal(`<h2>Give up?</h2><p>The cards the CPU took stay with it.</p>`,[
      {label:'Give up',cls:'danger',fn:()=>{G=null;show('menu')}},{label:'Keep choosing',cls:'primary',esc:true}])});
}
const wbName=wb=>wb.step===3?'Last chance':'Win them back';
// the Last chance has its own stakes: win and every card comes back, lose and as many more go
const wbLast=()=>!!(G.wb&&G.wb.step===3);
// under the result: what the next try is, or why there's none
function wbHTML(x){
  if(!x)return'';
  if(x.end)return`<p class="note">${x.end==='full'?'The CPU can only hold 5 of your cards, so there is no Last chance.':'That was your last try.'} The cards it took are gone.</p>`;
  const n=x.lost.length;
  if(x.step===3)return`<p class="note"><b>Last chance:</b> play the CPU again. It holds ${n===2?'both cards':`all ${n} cards`} it took. Win and they all come back. Lose and it takes ${n} more.</p>`;
  return`<p class="note"><b>Win them back:</b> play the CPU again. It holds the ${n>1?'cards':'card'} it took. `+
    (G.trade==='all'?'Win and you take all 5 back. Lose and it takes 5 more. You get one try.</p>':'Win and the trade rule says how many of them you take back. Lose and it takes more.</p>');
}
function startLocal(){
  G=baseMatch('local',{names:['Blue','Red']});
  if(G.rules.random){G.decks=[randomDeck(foundPool()),randomDeck(foundPool())];startMatch();return}
  openDeck({title:'Blue — choose 5',pool:foundPool(),free:true,color:'blue',onBack:()=>openSetup('local'),
    onDone:ids=>{G.decks[0]=ids;
      modal('<h2>Pass the device</h2><p>Red, it\'s your turn to choose 5 cards.</p>',[{label:'Ready',cls:'primary',fn:()=>
        openDeck({title:'Red — choose 5',pool:foundPool(),free:true,color:'red',onBack:startLocal,onDone:ids2=>{G.decks[1]=ids2;SAVE.localDecks=G.decks.map(d=>d.slice());save();startMatch()}})}]);
    }});
}
// Couch's Quick play (menu.js): the last two hands, if every card in them has still been found
function localDecks(){
  const d=SAVE.localDecks;
  return Array.isArray(d)&&d.length===2&&d.every(h=>Array.isArray(h)&&h.length===5&&h.every(id=>CARDS[id]&&isSeen(id)))?d:null;
}
function quickLocal(){
  const d=localDecks();if(!d){openSetup('local');return}
  G=baseMatch('local',{names:['Blue','Red']});
  G.decks=G.rules.random?[randomDeck(foundPool()),randomDeck(foundPool())]:d.map(h=>h.slice());
  startMatch();
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
  G.first=first;G.sel=null;G.busy=true;G.timeUp=false;G.flagged=null;
  // bank timer: a full clock for each player every match (and every Sudden Death replay)
  G.bank=isBank(G.rules)?[G.rules.bank*1000,G.rules.bank*1000]:null;
  G.st=newState(h0,h1,first,genElements(G.rules,G.rng));
  // a new round of this match (Sudden Death adds one) starts a new list of moves for the Review
  if(G.ser){const rv=G.ser.rev=G.ser.rev||[],m=rv[G.ser.n-1]=rv[G.ser.n-1]||{rounds:[]};
    m.rounds.push({h:[h0.slice(),h1.slice()],first,el:G.st.el.slice(),moves:[]})}
  // who placed the card on each square, and which card of their deck it is ([player, deck index]), for Diff:
  // h follows each hand as cards leave it, c holds the board
  G.trk={h:[h0.map((_,i)=>i),h1.map((_,i)=>i)],c:Array(9).fill(null)};
  // Three open: 3 cards of each hand are face up, drawn from the seeded random numbers so both online players agree
  if(G.rules.threeOpen&&!G.rules.open)G.trk.v=threePick(G.rng);
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
// Three open: is card i of player p's hand one of the face-up ones?
function faceUp(p,i){const t=G.trk;return !!(t&&t.v&&t.v[p]&&t.v[p].includes(t.h[p][i]))}

function nextTurn(){
  if(!G)return;
  if(G.tut){if(G.tut.state==='moving')tutMoved();return} // a lesson is one move (tutorial.js)
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
    const[hi,cell]=aiChoose(G.st,G.rules,G.diff,G.forced,G.st.h[0].map((_,i)=>faceUp(0,i)));
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
  if(G.tut&&!tutMove(cell))return;
  if(G.mode==='online')netSend({t:'move',hi,cell,bk:bankNow(G.st.turn)});
  if(G.daily)dailyMoved(hi,cell);
  execMove(hi,cell);
}
async function execMove(hi,cell){
  const g=G,st=G.st,p=st.turn,q=1-p,id=st.h[p][hi];
  G.busy=true;G.sel=null;G.timeUp=false;stopTurnTimer();
  // bank timer: an online opponent's clock is what their side said it was; every card played adds the bonus
  if(G.bank){if(G.netBk!=null)G.bank[p]=G.netBk;G.bank[p]+=BANK_BONUS}
  G.netBk=null;
  if(p===G.me)G.moved=true;
  const sc=[score(st,0),score(st,1)];
  if(G.trk)G.trk.c[cell]=[p,G.trk.h[p].splice(hi,1)[0]];
  const rm=G.ser&&G.ser.rev&&G.ser.rev[G.ser.n-1];if(rm)rm.rounds[rm.rounds.length-1].moves.push([hi,cell]);
  const ev=[];play(st,G.rules,hi,cell,ev);
  if(G.mode!=='local'&&p===G.me&&!G.tut)profFlips(ev);
  renderHands();renderHud();$$('.cell').forEach(c=>c.classList.remove('hot','over'));
  CELLS[cell].innerHTML=cardHTML(id,colorOf(p),{mod:st.m[cell],cls:'drop'});
  sfx('place');
  await wait(300);
  for(const e of ev){
    if(G!==g)return;
    // the tutorial shows which numbers touched before each flip
    if(G.tut){tutWave(e,cell);if(e.t==='basic')await wait(450)}
    if(e.t!=='basic')await banner({same:'Same!',plus:'Plus!',combo:'Combo!'}[e.t]);
    if(G!==g)return;
    flipCells(e.cells,p,cell);
    sc[p]+=e.cells.length;sc[q]-=e.cells.length;
    setTimeout(()=>G===g&&setScores(sc),230);
    await wait(520);
  }
  if(G!==g)return;
  if(!G.tut)emoteMove(p,ev);
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
// Diff: the loser's cards that end the match in the winner's colour, as indexes in the loser's deck.
// null when it can't be told (a match saved before this was tracked), and then any card can be taken
function flipped(w){
  if(w<0||!G.trk)return null;
  const out=[];G.trk.c.forEach((c,cell)=>{if(c&&c[0]===1-w&&G.st.o[cell]===w)out.push(c[1])});
  return out;
}
// in a series: Diff uses the series winner's last win
const lastWin=w=>{const won=G.ser.log.filter(m=>m.w===w);return won[won.length-1]};
// the Sweep rule: a win owning the whole board (in a series, any of the winner's wins) takes all 5, whatever the trade rule
const sweepWin=w=>w>=0&&sweepOn(G.rules,G.trade)&&G.ser.log.some(m=>m.w===w&&m.sweep);
// Diff picks only from the cards the winner flipped (indexes in the loser's deck), or null for any card.
// Winning a Win them back try you take only your own cards back, flipped or not
const diffPool=w=>{const l=lastWin(w);return G.trade==='diff'&&!sweepWin(w)&&!(G.wb&&(wbLast()||w===G.me))&&l&&Array.isArray(l.fl)?l.fl:null};
function tradeCount(s0,s1,w){
  if(wbLast())return G.wb.lost.length;
  if(sweepWin(w))return 5;
  const last=lastWin(w),diff=G.bo>1?(last?last.diff:0):Math.abs(s0-s1),pool=diffPool(w);
  return{one:1,diff:Math.min(5,diff,pool?pool.length:5),all:5}[G.trade]||0;
}
// a NEW tag on cards you've never found, like in packs
const NEW_TAG='<em class="cr-new">NEW</em>';
function rowHTML(ids,color,fresh=[]){return`<div class="cardrow">${ids.map((id,i)=>fresh[i]?`<div class="cr-it">${NEW_TAG}${cardHTML(id,color)}</div>`:cardHTML(id,color)).join('')}</div>`}
const resultTitle=(w,end='')=>G.mode==='local'?(w<0?'Draw':(w===0?'Blue':'Red')+' wins'+end):w<0?'Draw':(w===G.me?'You win':'You lose')+end;
function finish(s0,s1){
  G.over=true;G.busy=true;
  // a player out of time with "You lose" on loses, whatever the score
  const m=G.bottom===0?[s0,s1]:[s1,s0],mw=G.flagged!=null?1-G.flagged:s0>s1?0:s1>s0?1:-1,ser=G.ser;
  ser.log.push({w:mw,diff:Math.abs(s0-s1),sweep:swept(mw),sb:m[0],sr:m[1],fl:flipped(mw)});
  const rm=ser.rev&&ser.rev[ser.n-1];if(rm)rm.end={b:G.st.b.slice(),o:G.st.o.slice()};
  if(G.sd>0)ser.sd=1;
  if(mw>=0)ser.wins[mw]++;
  renderHud();
  let reward='';
  if(G.mode!=='local')reward=rewardHTML(histXp(recordMatch(mw<0?'d':mw===G.me?'w':'l',
    {online:G.mode==='online',diff:G.mode==='ai'?G.diff:null,daily:!!G.daily,sweep:swept(mw),sd:G.sd>0,rules:G.rules})));
  sfx(mw<0?'draw':(G.mode==='local'||mw===G.me)?'win':'lose');
  const ran=G.flagged!=null?`<p class="note">${G.mode==='local'?(G.flagged===0?'Blue':'Red')+' ran':G.flagged===G.me?'You ran':esc(G.mode==='ai'?'The CPU':oppName())+' ran'} out of time.</p>`:'';
  const vs=ran+(G.mode==='online'?`<p>${esc(G.names[G.me])} vs <b class="gold">${esc(oppName())}</b></p><div class="fr-res">${friendBtn(NET.oppUser)}</div>`:'');
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
  }else head=`<div class="kick">${G.daily?'Daily · '+(G.daily.kind==='duel'?'Duel':'Gauntlet'):G.mode==='online'?'Online match':G.wb?wbName(G.wb):'Match over'}</div><h2>${resultTitle(w)}</h2>`+vs+big(m[0],m[1])+reward;
  if(histAdd(w<0?'d':w===G.me?'w':'l'))save();
  if(G.daily)head+=dailyFinish(w);
  // badges for how it was won: a series (from behind), or with everything on the line
  if(G.mode!=='local'&&w===G.me){
    if(G.bo>1){earn('series');if(ser.log[0].w===1-G.me)earn('comeback')}
    if(G.trade==='all'&&!G.daily)earn('tradeall');
  }
  head+=freshHTML();
  let n=(G.mode==='local'||w<0)?0:tradeCount(s0,s1,w);
  // a Win them back try won: only your own cards can be taken back
  if(n&&G.wb&&w===G.me)n=Math.min(n,G.wb.idx.length);
  // in Solo a loss is settled straight away, so closing the app on the result screen can't undo it
  const pool=w<0?null:diffPool(w);
  const cpuTook=G.mode==='ai'&&n&&w!==G.me?loseCards(strongest(G.decks[G.me],n,pool)):null;
  // Win them back: the next try after the CPU took cards; a draw on a try plays it again
  const wbn=G.mode!=='ai'||G.daily?null:cpuTook?winBackNext(G.trade,G.wb,cpuTook.ids,G.decks[1]):w<0?G.wb:null;
  const wbBtn=label=>wbn&&wbn.step?{label:label||wbName(wbn),cls:'primary',fn:()=>wbStart(wbn)}:null;
  liveClear();
  // online, nothing more is owed unless you lost cards (then it's settled when the winner decides)
  if(G.mode==='online'&&!(n&&w!==G.me))oweClear(matchKey());
  const g=G;
  setTimeout(()=>{
    if(G!==g)return;
    if(!n){resultModal(head+(G.mode==='local'||G.trade==='none'?'':w<0?`<p>No cards change hands on a ${G.bo>1?'tied series':'draw'}.</p>`+(wbn?'<p class="note">Play it again for the same cards.</p>':''):
      G.trade==='diff'?`<p>No trade: with Diff the winner only takes cards they flipped, and none of the loser's cards ended up flipped.</p>`:''),wbBtn('Try again'));return}
    if(sweepWin(w))head+=`<p class="gold"><b>Full board sweep!</b>${G.trade==='all'?'':' All 5 cards change hands.'}</p>`;
    const loserDeck=G.decks[1-w],online=G.mode==='online';
    if(w===G.me){
      // online the winner can take the cards or spare the loser
      pickCards(head,loserDeck,n,{spare:online,only:G.wb?G.wb.idx:pool,ask:G.wb?`Choose <b>${n}</b> of your cards to take back.`:null}).then(idx=>{
        if(G!==g)return;
        if(idx==='spare'){netSend({t:'trade',idx:[],spare:true});forfeitPost(NET.oppUser,matchKey(),[]);resultModal(head+spareHTML(oppName(),spareGive()));return}
        const ids=idx.map(i=>loserDeck[i]),fresh=[];
        // a second copy of a new card isn't new
        ids.forEach(id=>{fresh.push(!isSeen(id));collAdd(id)});earn('spoils');if(G.wb){earn('winback');if(wbLast())earn('laststand')}profCheck();histTrade('won',ids);save();
        // also through the server, in case they close the game before it reaches them
        if(online){netSend({t:'trade',idx});forfeitPost(NET.oppUser,matchKey(),ids)}
        resultModal(head+`<p>You won ${G.wb?`back your ${ids.length>1?'cards':'card'}`:ids.length>1?'these cards':'this card'}:</p>`+rowHTML(ids,'blue',fresh)+freshHTML());
      });
    }else if(cpuTook)resultModal(head+tookHTML('The CPU',cpuTook)+wbHTML(wbn),wbBtn());
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
// o.only: the indexes that may be taken (Diff: the cards you flipped); the rest are shown faded
function pickCards(head,deck,n,o={}){
  return new Promise(res=>{
    const pool=o.only||deck.map((_,i)=>i),all=n>=pool.length;
    if(all&&!o.spare){res(pool.slice());return}
    const sel=new Set(all?pool:[]);
    const of=o.only?' you flipped':'';
    const ask=o.ask||(all?(o.only?`Take the ${plural(pool.length,'card')} you flipped`:'Take all their cards')+(o.spare?', or spare them.':'.'):`Choose <b>${n}</b> of the cards${of} to take${o.spare?', or spare them':''}.`);
    const box=modal(head+`<p>${ask}</p><div class="cardrow">${deck.map((id,i)=>{const can=pool.includes(i),on=all&&can;
      return `<div class="pk${on?' on':''}${can?'':' off'}" data-i="${i}" role="button" aria-pressed="${on}"${can?'':' aria-disabled="true"'} aria-label="${esc(cardLabel(id))}${isSeen(id)?'':', new'}${can?'':', not flipped'}">${isSeen(id)?'':NEW_TAG}${cardHTML(id,'red')}</div>`}).join('')}</div>`+
      (o.spare?`<p class="note">💛 Spare: they keep their cards, and you count a spare. Every ${SPARE_PACK} spares give a free pack.</p>`:''),
      [{label:all?'Take all':'Take',cls:'primary',keep:true,wait:true,fn:()=>{if(sel.size===n||all){closeModal();res([...sel])}}},
       ...(o.spare?[{label:'Spare 💛',wait:true,fn:()=>res('spare')}]:[])]);
    const btn=box.querySelector('.mbtns .btn');btn.disabled=!all;
    if(!all)box.querySelectorAll('.pk:not(.off)').forEach(el=>el.onclick=()=>{
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
  // kept so the Review can bring this popup back
  G.res=[html,extra];
  // a Daily challenge says what comes next (try again, next opponent), or nothing
  const again=G.daily?G.daily.again:{label:G.mode==='online'?'Rematch':'Play again',fn:playAgain};
  modal(html,[
    ...(extra?[extra]:[]),
    ...(again?[{label:again.label,cls:extra?'':'primary',fn:again.fn}]:[]),
    ...(revAvail()?[{label:'Review',fn:revOpen}]:[]),
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
function stillPlaying(){return !!(G&&G.st&&!G.done&&!G.tut&&(!G.over||G.bo>1&&!seriesDone(G.bo,G.ser.n,G.ser.wins)))}
// the cards you give up by leaving: what the trade rule takes on a loss, and at least 1 (so a close Diff takes 1).
// The Sweep rule doesn't add to it: nobody swept.
// Nothing in a Couch game, the Daily, or with no trade rule.
function leaveCount(){
  if(!stillPlaying()||G.mode==='local'||G.daily||G.trade==='none')return 0;
  if(wbLast())return G.wb.lost.length;
  const gap=Math.abs(score(G.st,0)-score(G.st,1));
  return {one:1,diff:Math.max(1,Math.min(5,gap)),all:5}[G.trade]||0;
}
// the CPU always takes your strongest cards: their indexes in your hand (only from `pool` if given: Diff's flipped cards)
const strongest=(deck,n,pool)=>(pool||deck.map((_,i)=>i)).slice().sort((a,b)=>cardStrength(deck[b])-cardStrength(deck[a])).slice(0,n);
// you lose these cards (indexes in your hand); a collection that drops too low gets a few back. The caller shows what happened.
function loseCards(idx){
  const deck=G.decks[G.me],ids=idx.filter(i=>Number.isInteger(i)&&deck[i]!=null).map(i=>deck[i]);
  ids.forEach(collRemove);histTrade('lost',ids);save();
  return {ids,added:ensureMinimum()};
}
function tookHTML(who,t){
  return `<p>${who} took:</p>`+rowHTML(t.ids,'red')+(t.added.length?`<p>Your collection ran low — a wandering dealer gives you:</p>`+rowHTML(t.added,'blue'):'');
}
// you left, or tapped Give up on a CPU match you closed: a loss, and in Solo the cards go now
function quitMatch(){
  const puzzle=G.daily&&G.daily.kind==='puzzle',n=leaveCount(),ai=G.mode==='ai';
  let took=null;
  if(G.mode!=='local'&&!puzzle){
    // between the matches of a series that match already counted; the series is what's given up
    if(!G.over)histXp(recordMatch('l',{online:G.mode==='online',daily:!!G.daily,left:true}));
    const h=histAdd('l','you');
    if(ai&&n)took=loseCards(strongest(G.decks[G.me],n));
    // online the other player decides; it reaches you through the server (spare.js)
    if(G.mode==='online'&&n)oweLeft(matchKey(),h);
    save();freshToast();
  }
  dailyLeave();leaveMatch();
  if(took)modal(`<h2>Match over</h2><p>You left, so it counts as a loss.</p>`+tookHTML('The CPU',took),[{label:'OK',cls:'primary',esc:true,wait:true}]);
}
function askLeave(){
  const n=leaveCount(),opp=G.mode==='ai'?'The CPU':esc(oppName()),cards=plural(n,'card');
  // in Solo, leaving before you've played a card costs nothing
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
  modal(`<h2>Leave ${G.over?'the series':'match'}?</h2>${p}`,[{label:'Leave',cls:'danger',wait:true,fn:()=>{if(G)quitMatch()}},back]);
}
$('#btnQuit').onclick=()=>{
  sfx('click');if(!G)return;
  if(G.over&&!leaveCount()){leaveMatch();return}
  askLeave();
};

/* ---------- picking a CPU match back up ---------- */
// A Solo match is saved at the start of every turn (SAVE.live), so closing the app doesn't end it:
// the menu offers to carry on, and giving up counts as leaving. The Daily has its own rules, so it isn't saved.
function liveSave(next){
  if(!G||G.mode!=='ai'||G.daily||!G.st||!next&&(G.over||isFull(G.st)))return;
  SAVE.live=JSON.parse(JSON.stringify({v:1,next:!!next,rules:G.rules,trade:G.trade,diff:G.diff,bo:G.bo,names:G.names,decks:G.decks,
    seed:G.seed,a:G.rng.a,ser:G.ser,sd:G.sd,first:G.first,st:G.st,moved:!!G.moved,trk:G.trk,wb:G.wb||null,bank:G.bank}));
  save();
}
function liveClear(){if(SAVE.live){SAVE.live=null;save()}}
// the saved match as a G, or null if it doesn't hold together
function liveMatchFrom(L){
  try{
    const ok9=a=>Array.isArray(a)&&a.length===9,st=L.st,hand=h=>Array.isArray(h)&&h.every(i=>CARDS[i]);
    if(L.v!==1||!L.decks.every(d=>Array.isArray(d)&&d.length===5&&hand(d))||!ok9(st.b)||!ok9(st.o)||!ok9(st.m)||!st.h.every(hand)||!Array.isArray(L.ser.wins))return null;
    // a match saved while Sweep was a trade rule (before 0.18.0)
    if(L.trade==='sweep'){L.trade='one';L.rules={...L.rules,sweep:true}}
    // a Win them back try (data.js)
    const w=L.wb,wb=w&&(w.step===2||w.step===3)&&[w.cpu,w.l1,w.lost].every(hand)&&w.cpu.length===5&&w.lost.length<=5&&Array.isArray(w.idx)&&w.idx.length===w.lost.length&&w.idx.every(i=>i>=0&&i<5)?w:null;
    const g=baseMatch('ai',{rules:{...defSave().rules,...L.rules},trade:netTrade(L.trade),diff:DIFFS.some(d=>d[0]===L.diff)?L.diff:'normal',bo:boOf(L.bo),
      names:L.names,decks:L.decks,seed:L.seed>>>0,ser:L.ser,sd:L.sd|0,first:L.first?1:0,st,moved:!!L.moved,wb});
    g.rng=mulberry32(L.a|0);
    normTimer(g.rules);
    g.bank=isBank(g.rules)&&Array.isArray(L.bank)&&L.bank.length===2&&L.bank.every(n=>Number.isFinite(n)&&n>=0)?L.bank:isBank(g.rules)?[g.rules.bank*1000,g.rules.bank*1000]:null;
    // which card each player placed (Diff); a save from before it was tracked lets any card be taken
    const t=L.trk;
    g.trk=t&&Array.isArray(t.h)&&t.h.length===2&&t.h.every(Array.isArray)&&ok9(t.c)?t:null;
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
  modal(`<div class="kick">Solo · ${esc(DIFFS.find(d=>d[0]===g.diff)[1])}${g.bo>1?` · Best of ${g.bo}`:''}</div><h2>Match in progress</h2>`+
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
  // the CPU doesn't need a clock; everyone else gets the chosen time per turn, or what's left of their bank
  if(!G||!timedOn(G.rules)||G.over||(G.mode==='ai'&&G.st.turn!==G.me)){stopTurnTimer();return}
  bankKeep(); // started again mid-turn (back after a reconnect): the bank goes on from where it was
  const p=G.st.turn,bank=!!G.bank,tot=(bank?G.rules.bank:G.rules.timer)*1000,dur=bank?G.bank[p]:tot;
  cancelAnimationFrame(TMR.raf);
  TMR={g:G,end:performance.now()+dur,dur,tot,bank,p,fired:false,sec:-1,raf:0};
  $('#timer').classList.toggle('bank',bank);
  $('#timer').classList.remove('off');$('#tbar').classList.remove('off');
  tickTimer();drawTimer(performance.now());
}
function stopTurnTimer(){
  bankKeep();
  TMR.g=null;cancelAnimationFrame(TMR.raf);
  $('#timer').classList.add('off');$('#tbar').classList.add('off');
  setTimerLevel('');paintClocks();
}
// a running bank keeps what's left of it
function bankKeep(){if(TMR.g&&TMR.bank&&TMR.g.bank)TMR.g.bank[TMR.p]=Math.max(0,TMR.end-performance.now())}
// what's left of player p's bank right now (ms), sent with each move so both sides agree
function bankNow(p){
  if(!G||!G.bank)return undefined;
  return Math.round(TMR.g===G&&TMR.bank&&TMR.p===p?Math.max(0,TMR.end-performance.now()):G.bank[p]);
}
// PC: each player's clock in their corner (game.js layout). The one whose turn it is counts down; the other shows a full
// turn (or what's left of their bank), faded. Both corners always have the box, so they have the same shape: the CPU's
// (it plays at once), or both with no timer, stay empty
function paintClocks(){
  for(const[el,p]of[[$('#ptmBot'),G?G.bottom:0],[$('#ptmTop'),G?1-G.bottom:1]]){
    const on=!!(G&&G.st&&!G.tut&&!G.over);
    el.hidden=!on;if(!on)continue;
    const timed=timedOn(G.rules)&&!(G.mode==='ai'&&p!==G.me),run=timed&&TMR.g===G&&TMR.p===p&&TMR.sec>=0;
    const idle=G.bank?Math.ceil(G.bank[p]/1000):G.rules.timer;
    el.classList.toggle('idle',!run);el.classList.toggle('none',!timed);el.querySelector('b').textContent=timed?fmtLeft(run?TMR.sec:idle):'';
  }
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
  const f=Math.min(1,Math.max(0,TMR.end-now)/TMR.tot);
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
  const rem=Math.max(0,TMR.end-performance.now()),sec=Math.ceil(rem/1000),t=TMR.tot/1000;
  if(sec!==TMR.sec){
    TMR.sec=sec;
    // a bank turns orange in its last 30 seconds and red in its last 10
    const[warn,crit]=TMR.bank?[30,10]:[timerWarn(t),timerCrit(t)];
    setTimerLevel(sec<=crit?'crit':sec<=warn?'warn':'');
    $('#tNum').textContent=TMR.bank&&sec>=60?fmtLeft(sec):sec;paintClocks();
    $('#tbar').setAttribute('aria-label',`${sec} seconds left`);
    if(sec>0&&sec<=5&&isHuman(TMR.p))sfx('tick');
  }
  if(rem<=0&&!TMR.fired){TMR.fired=true;onTimeUp(TMR.p)}
}
setInterval(tickTimer,100);
async function onTimeUp(p){
  // each client only auto-plays for its own player; an online opponent's move arrives over the network
  if(!isHuman(p))return;
  if(G.rules.flag==='lose'){outOfTime(p);return}
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
  if(G.mode==='online')netSend({t:'move',hi,cell,bk:0});
  execMove(hi,cell);
}
// out of time with "You lose" on (either timer): player p loses the match. Online, the other side hears it as a move (pump)
async function outOfTime(p){
  const g=G;
  G.timeUp=true;G.sel=null;G.busy=true;G.flagged=p;
  if(G.mode==='online'&&isHuman(p))netSend({t:'move',flag:true});
  if(drag)endDrag({},true);
  stopTurnTimer();renderHands();renderBoard();
  sfx('timeup');
  await banner('Out of time!','small');
  if(G!==g)return;
  finish(score(G.st,0),score(G.st,1));
}
