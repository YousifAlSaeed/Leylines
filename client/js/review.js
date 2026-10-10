'use strict';
/* =====================================================================
   REVIEW  (after a game: step through its moves on the board)
   The result popup's Review button. Each match's moves are kept in
   G.ser.rev (match.js); a position is rebuilt by playing them again from
   the start. Each move says who played what and why cards flipped, with
   the tutorial's tags on the edges that did it ("3 + 5 = 8", "7 › 6").
   A move with a Combo takes two steps: the move with its Same or Plus, then a half step (6.5) for the Combo's flips.
   In a series, tabs pick the match. Back brings the result popup back.
   A missed Daily Puzzle uses the same view for See why: your move, then the answer.
   Crossroads has it too (the last part of this file): one match on the 4×4 board.
   ===================================================================== */
const RV={on:false,m:0,s:0,real:null,go:0,puz:false};

// a match can be reviewed when playing its moves again ends on the board it really ended on
function revOk(m){
  try{
    if(!m||!m.end||!m.rounds.length)return false;
    let st;
    for(const r of m.rounds){
      st=newState(r.h[0],r.h[1],r.first,r.el.slice());
      if(r.moves.length!==9)return false;
      for(const[hi,c]of r.moves){if(!(hi>=0&&hi<st.h[st.turn].length)||st.b[c]>=0)return false;play(st,G.rules,hi,c)}
    }
    return st.b.every((x,i)=>x===m.end.b[i]&&st.o[i]===m.end.o[i]);
  }catch(e){return false}
}
const revMatches=()=>G&&G.ser&&Array.isArray(G.ser.rev)?G.ser.rev.map((m,i)=>revOk(m)?i:-1).filter(i=>i>=0):[];
const revAvail=()=>!G.tut&&revMatches().length>0;
// every position of a match, in order: [round, moves played, half]. A round starts with 0 moves played;
// half 1 is the extra step of a move with a Combo
function revSteps(m){
  const out=[];
  G.ser.rev[m].rounds.forEach((r,ri)=>{for(let k=0;k<=r.moves.length;k++){out.push([ri,k,0]);if(revCombo(revAt(m,ri,k).last))out.push([ri,k,1])}});
  return out;
}
const revCombo=last=>!!last&&last.ev.some(e=>e.t==='combo');
// a step's number: whole moves count 1, 2, 3; a Combo's half step is 6.5. Returns [this step, the last one]
function revNum(steps,s){
  const whole=n=>steps.slice(0,n+1).filter(x=>!x[x.length-1]).length-1;
  return [whole(s)+(steps[s][steps[s].length-1]?'.5':''),whole(steps.length-1)];
}
// one move with a Combo, cut in two. half 0: the board before the Combo's flips, and what came before them.
// half 1: the Combo's flips (and a Ley line they close), starting from that board. Anything else: the whole move
function revSplit(st,last,half,clone){
  const i=last&&half>=0?last.ev.findIndex(e=>e.t==='combo'):-1;
  if(i<0)return{st,last};
  const mid=clone(st);
  for(const e of last.ev.slice(i))e.cells.forEach(c=>{if(e.t==='seal')mid.k[c]=last.pre.k[c];else mid.o[c]=last.pre.o[c]});
  if(!half)return{st:mid,last:{...last,ev:last.ev.slice(0,i)}};
  // prev: the cards Same and Plus flipped, which the Combo starts from
  return{st,last:{...last,pre:mid,half:true,ev:last.ev.slice(i),prev:last.ev.slice(0,i).filter(e=>e.t==='same'||e.t==='plus').flatMap(e=>e.cells)}};
}
// the tags of a step that isn't playing out are all bright (while it plays, the wave before fades)
const revFresh=()=>TT.forEach(g=>g.el.classList.remove('old'));
// the board after k moves of round r, and what the last of them did (half: see revSplit)
function revAt(m,r,k,half=-1){
  const R=G.ser.rev[m].rounds[r],st=newState(R.h[0],R.h[1],R.first,R.el.slice());
  let last=null;
  R.moves.slice(0,k).forEach(([hi,cell],i)=>{
    if(i<k-1){play(st,G.rules,hi,cell);return}
    const pre=cloneS(st),p=st.turn,id=st.h[p][hi],ev=[];
    play(st,G.rules,hi,cell,ev);last={pre,p,id,cell,ev};
  });
  return {...revSplit(st,last,half,cloneS),R};
}

/* ---------- opening and closing ---------- */
function revOpen(){
  const ms=revMatches();if(!ms.length)return;
  RV.on=true;RV.real=G.st;G.sel=null;G.busy=true;
  document.body.classList.add('rev');
  revShow(ms[ms.length-1],-1);
}
// back to the result popup
function revClose(){
  if(!RV.on)return;
  const puz=RV.puz;revClear();
  if(G&&RV.real){G.st=RV.real;renderGame();if(puz)G.reopen&&G.reopen();else if(G.res)resultModal(...G.res)}
  RV.real=null;
}
// leaving the game screen ends a review (menu.js show)
function revClear(){
  if(!RV.on)return;
  RV.on=false;RV.puz=false;RV.go++;revTags();
  $('#tutCoach').hidden=true;$('#revBar').hidden=true;
  document.body.classList.remove('rev');
  CELLS.forEach(c=>c.classList.remove('rv-last'));
}

/* ---------- one position ---------- */
// s: the step to show (-1: the last one). anim: play the move out instead of jumping to it
async function revShow(m,s,anim=false){
  const steps=revSteps(m);
  if(s<0)s=steps.length-1;
  s=Math.max(0,Math.min(steps.length-1,s));
  RV.m=m;RV.s=s;const go=++RV.go;
  const[r,k,half]=steps[s],{st,last,R}=revAt(m,r,k,half);
  revTags();
  if(anim&&last){
    // the board before the move, then the card lands and each wave flips (a Combo's half step: the card is already there)
    G.st=last.pre;renderBoard();CELLS.forEach(c=>c.classList.remove('rv-last'));
    G.st=st;renderHands();renderHud();
    if(!last.half){
      CELLS[last.cell].innerHTML=(st.el[last.cell]?`<div class="eicon">${ELEM[st.el[last.cell]]}</div>`:'')+cardHTML(last.id,colorOf(last.p),{mod:st.m[last.cell],cls:'drop'});
      sfx('place');
    }
    CELLS[last.cell].classList.add('rv-last');
    revText(m,r,k,st,last,R,steps);revBar(m,s,steps);
    await wait(300);
    let prev=last.prev||[];
    for(const e of last.ev){
      if(go!==RV.go)return;
      prev=revWave(e,last,st,prev);
      flipCells(e.cells,last.p,last.cell);
      await wait(520);
    }
    if(go===RV.go){revFresh();revPlace()}
    return;
  }
  G.st=st;renderGame();
  CELLS.forEach(c=>c.classList.remove('rv-last'));
  if(last){CELLS[last.cell].classList.add('rv-last');let prev=last.prev||[];for(const e of last.ev)prev=revWave(e,last,st,prev);revFresh()}
  revText(m,r,k,st,last,R,steps);revBar(m,s,steps);
}
// the tags for one wave of flips; returns the cells that can start a Combo from it
// Rl, nb, cells: the rules and the board (Crossroads passes its own)
function revWave(e,last,st,prev,Rl=G.rules,nb=NB,cells=CELLS){
  TT.forEach(g=>g.el.classList.add('old'));
  const cell=last.cell,side=(c,d)=>CARDS[st.b[c]].s[d],mod=c=>st.m[c]?(st.m[c]>0?'+1':'−1'):'';
  // a tag reads the way the cards sit: when the other card is on the left (side 3), its number comes first ("4 ‹ 6", "2 + 1 = 3")
  const gt=Rl.reverse?' ‹ ':' › ',lt=Rl.reverse?' › ':' ‹ ';
  if(e.t==='same'||e.t==='plus'){
    // every pair that counted, not only the ones that flipped: one of them can be your own card
    const ents=[];
    for(let d=0;d<4;d++){const n=nb[cell][d];if(n>=0&&st.b[n]>=0)ents.push([d,side(cell,d),side(n,(d+2)&3)])}
    for(const[d,a,b]of ents){
      const[x,y]=d===3?[b,a]:[a,b];
      if(e.t==='same'&&a===b)tutTag(cell,d,`${fmt(x)} = ${fmt(y)}`,cells,nb);
      if(e.t==='plus'&&ents.filter(f=>f[1]+f[2]===a+b).length>=2)tutTag(cell,d,`${x} + ${y} = ${a+b}`,cells,nb);
    }
    return e.cells;
  }
  for(const n of e.cells){
    // Combo flips come from a card flipped in the wave before; a basic one from the card just placed
    const from=e.t==='combo'?prev.find(c=>{const d=nb[c].indexOf(n);return d>=0&&beats(Rl,side(c,d)+st.m[c],side(n,(d+2)&3)+st.m[n])}):cell;
    if(from==null)continue;
    const d=nb[from].indexOf(n);
    const mine=`${fmt(side(from,d))}${mod(from)}`,theirs=`${fmt(side(n,(d+2)&3))}${mod(n)}`;
    tutTag(from,d,d===3?theirs+lt+mine:mine+gt+theirs,cells,nb);
  }
  return e.t==='combo'?e.cells:prev;
}
function revTags(){TT.forEach(g=>g.el.remove());TT.length=0}

/* ---------- the words and the buttons ---------- */
const revWho=p=>G.mode==='local'?(p===0?'Blue':'Red'):p===G.me?'You':G.mode==='ai'?'The CPU':esc(oppName());
function revText(m,r,k,st,last,R,steps){
  const n=R.moves.length,sd=r>0?`Sudden death ${r} · `:'',ser=G.bo>1?`Match ${m+1} · `:'';
  let kick=`${ser}${sd}${k?`Move ${k}${last.half?'.5':''} of ${n}`:'Start'}`,txt;
  if(!last){
    const w=revWho(R.first);
    txt=(r>0?'A draw, so Sudden Death: each player takes back the cards they owned on the board. ':'')+`<b>${w}</b> ${w==='You'?'go':'goes'} first.`;
  }else txt=last.half?revWhy(last):`<b>${revWho(last.p)}</b> played <b>${esc(CARDS[last.id].name)}</b>. `+revWhy(last);
  // the end of the match: the score it finished on
  if(RV.s===steps.length-1){const a=G.mode==='local'?0:G.me;txt+=` <span class="rv-end">Final score ${score(st,a)}–${score(st,1-a)}</span>`}
  const c=$('#tutCoach');
  c.innerHTML=`<div class="tc-av" aria-hidden="true">🦉</div><div><div class="tc-k">${kick}</div><p>${txt}</p></div>`;
  c.hidden=false;c.classList.remove('dim','shake','in');
}
// what a move's flips came from, in words
function revWhy(last,Rl=G.rules){
  if(!last.ev.length)return 'Nothing flipped.';
  // a Combo that chains, or several Ley lines from one move, are said once
  const ev=[];
  for(const e of last.ev){const p=ev[ev.length-1];
    if(p&&p.t===e.t&&(e.t==='combo'||e.t==='seal')){p.cells=p.cells.concat(e.cells);p.n++}else ev.push({t:e.t,cells:e.cells,n:1})}
  return ev.map(e=>{
    if(e.t==='seal')return e.n>1?`<b>Ley lines!</b> ${e.n} rows or columns in one colour seal: their cards can't be flipped again.`
      :'<b>Ley line!</b> A full row or column in one colour seals: its 4 cards can\'t be flipped again.';
    const fl=`${plural(e.cells.length,'card')} flip${e.cells.length===1?'s':''}`;
    return {same:`<b>Same!</b> Two sides match the numbers they touch, so ${fl}.`,
      plus:`<b>Plus!</b> Two sides add up to the same total, so ${fl}.`,
      combo:`<b>Combo!</b> The cards Same or Plus flipped beat their neighbours: ${fl}.`,
      basic:`It beats ${plural(e.cells.length,'card')} next to it${Rl.reverse?' (Reverse: lower wins)':''}.`}[e.t];
  }).join(' ');
}
function revBar(m,s,steps){
  const ms=revMatches(),b=$('#revBar'),icon=d=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
  b.innerHTML=(ms.length>1?`<div class="rv-tabs" role="group" aria-label="Match">${ms.map(i=>{const l=G.ser.log[i];
      return `<button data-m="${i}" class="${i===m?'on':''}" aria-pressed="${i===m}">M${i+1} ${l?`${l.sb}–${l.sr}`:''}</button>`}).join('')}</div>`:'')+
    `<div class="rv-nav">
      <button class="iconbtn" data-s="first" aria-label="Start of the match" ${s?'':'disabled'}>${icon('M6 5v14M18 5l-9 7 9 7z')}</button>
      <button class="iconbtn" data-s="prev" aria-label="Move back" ${s?'':'disabled'}>${icon('M15 5l-7 7 7 7')}</button>
      <span class="rv-pos" aria-live="polite">${revNum(steps,s).join(' / ')}</span>
      <button class="iconbtn" data-s="next" aria-label="Next move" ${s<steps.length-1?'':'disabled'}>${icon('M9 5l7 7-7 7')}</button>
      <button class="iconbtn" data-s="last" aria-label="End of the match" ${s<steps.length-1?'':'disabled'}>${icon('M18 5v14M6 5l9 7-9 7z')}</button>
    </div><button class="btn small" id="rvBack">Back to results</button>`;
  b.hidden=false;
  b.querySelectorAll('[data-m]').forEach(x=>x.onclick=()=>{sfx('click');revShow(+x.dataset.m,-1)});
  b.querySelectorAll('[data-s]').forEach(x=>x.onclick=()=>{sfx('click');revStep(x.dataset.s)});
  $('#rvBack').onclick=()=>{sfx('click');revClose()};
  revPlace();
}

/* ---------- a missed Daily Puzzle: your move, then the answer (daily.js) ---------- */
function revPuzzle(){
  if(!G||!G.daily||!G.daily.mine)return;
  RV.on=true;RV.puz=true;RV.real=G.st;G.sel=null;G.busy=true;
  document.body.classList.add('rev');
  revPuzzleShow(0);
}
// i: 0 your move, 1 the answer
function revPuzzleShow(i){
  const p=G.daily.p,[hi,cell]=i?[p.hi,p.cell]:G.daily.mine,st=cloneS(p.st),pre=cloneS(st),id=st.h[0][hi],ev=[];
  play(st,G.rules,hi,cell,ev);
  const last={pre,p:0,id,cell,ev},n=blues(st)-blues(pre)-1;
  RV.go++;revTags();G.st=st;renderGame();
  CELLS.forEach(c=>c.classList.remove('rv-last'));CELLS[cell].classList.add('rv-last');
  let prev=[];for(const e of ev)prev=revWave(e,last,st,prev);
  const c=$('#tutCoach');
  c.innerHTML=`<div class="tc-av" aria-hidden="true">🦉</div><div><div class="tc-k">${i?'The answer':'Your move'} · flip ${p.goal}</div>`+
    `<p>${i?'':'You played '}<b>${esc(CARDS[id].name)}</b> on the ${CELL_NAME[cell]} square. ${revWhy(last)}`+
    `<span class="rv-end">${i?`That's ${n} of ${p.goal}: solved.`:`That's ${n} of the ${p.goal} needed.`}</span></p></div>`;
  c.hidden=false;c.classList.remove('dim','shake','in');
  const b=$('#revBar');
  b.innerHTML=`<div class="rv-tabs" role="group" aria-label="Show">${['Your move','The answer'].map((l,k)=>
    `<button data-k="${k}" class="${k===i?'on':''}" aria-pressed="${k===i}">${l}</button>`).join('')}</div><button class="btn small" id="rvBack">Back</button>`;
  b.hidden=false;
  b.querySelectorAll('[data-k]').forEach(x=>x.onclick=()=>{sfx('click');revPuzzleShow(+x.dataset.k)});
  $('#rvBack').onclick=()=>{sfx('click');revClose()};
  revPlace();
}
function revStep(k){
  if(RV.puz){revPuzzleShow(k==='prev'||k==='first'?0:1);return}
  const n=revSteps(RV.m).length-1;
  if(k==='first')revShow(RV.m,0);else if(k==='last')revShow(RV.m,n);
  else if(k==='prev')revShow(RV.m,RV.s-1);else if(RV.s<n)revShow(RV.m,RV.s+1,true);
}
// arrows step, Home and End jump, Escape goes back to the results
document.addEventListener('keydown',e=>{
  if(!RV.on&&!DUO.rv||$('#modal').classList.contains('on'))return;
  const k={ArrowLeft:'prev',ArrowRight:'next',Home:'first',End:'last'}[e.key];
  if(k){e.preventDefault();DUO.rv?duoRevStep(k):revStep(k)}else if(e.key==='Escape'){e.preventDefault();DUO.rv?duoRevClose():revClose()}
});
// like the tutorial: the words over the top hand (also the Daily Puzzle's goal, daily.js),
// the buttons from the top of yours down. Rects are divided by the --ui zoom (game.js)
function coachPlace(){
  const c=$('#tutCoach'),land=document.body.classList.contains('land'),W=innerWidth/UI;
  const r=(land?$('#sideTop'):$('#handTop')).getBoundingClientRect(),w=land?Math.max(240,r.width/UI):Math.min(W-24,440);
  c.style.width=w+'px';
  c.style.left=Math.max(12,Math.min(W-w-12,(r.left+r.width/2)/UI-w/2))+'px';
  // upright (phones, PC): the bubble ends just above the board and grows upwards over the names if its words need
  // the room, so it never covers the top row's numbers
  c.style.top=(land?(r.top+r.height*.12)/UI:Math.max(58,$('#board').getBoundingClientRect().top/UI-c.offsetHeight-8))+'px';
}
function revPlace(){
  if(document.body.classList.contains('puz'))coachPlace();
  if(!RV.on)return;
  coachPlace();
  const b=$('#revBar'),h=$('#handBot').getBoundingClientRect();
  b.style.left=(h.left+h.width/2)/UI+'px';b.style.top=h.top/UI+'px';
  TT.forEach(tagPos);
}
addEventListener('resize',()=>requestAnimationFrame(revPlace));

/* =====================================================================
   CROSSROADS (duo.js): the same Review on the 4×4 board, 2v2 or Free-for-all
   The host keeps the match's moves and sends them with the result (snap.rev: [[card, square]] in the order played).
   DUO.rv = {steps: every [moves played, half] (half 1: a Combo's extra step), s: the step shown, st: its board,
   cell: the square of its move, go: a stop counter}
   ===================================================================== */
// a match can be reviewed when its 16 moves, played again, end on the board it really ended on
function duoRevOk(S){
  try{
    const mv=S.rev,st=S.st;
    if(!st||!Array.isArray(mv)||mv.length!==16)return false;
    if(!mv.every(m=>Array.isArray(m)&&Number.isInteger(m[0])&&m[0]>=0&&m[0]<CARDS.length&&Number.isInteger(m[1])&&m[1]>=0&&m[1]<16))return false;
    if(new Set(mv.map(m=>m[1])).size!==16)return false;
    const end=duoRevAt(st.first,st.el,mv,S.rules,16).st;
    return end.b.every((x,i)=>x===st.b[i]&&end.o[i]===st.o[i]);
  }catch(e){return false}
}
function duoRevOpen(){
  const S=DUO.snap;if(!S||S.phase!=='over'||!duoRevOk(S))return;
  const at=k=>duoRevAt(S.st.first,S.st.el,S.rev,S.rules,k),steps=[];
  for(let k=0;k<=16;k++){steps.push([k,0]);if(revCombo(at(k).last))steps.push([k,1])}
  DUO.rv={steps,s:0,st:S.st,cell:-1,go:0};DUO.sel=null;
  document.body.classList.add('drev');
  duoRender();duoRevShow(steps.length-1);
}
// back to the result popup
function duoRevClose(){
  if(!DUO.rv)return;
  duoRevClear();duoRender();duoResult(true);
}
// leaving the match screen ends a Review (menu.js show)
function duoRevClear(){
  if(!DUO.rv)return;
  DUO.rv=null;revTags();
  $$('#duoBoard .hl').forEach(x=>x.classList.remove('hl'));
  $('#tutCoach').hidden=true;$('#revBar').hidden=true;
  document.body.classList.remove('drev');
}
// s: the step to show. anim: play its move out instead of jumping to it
async function duoRevShow(s,anim=false){
  const S=DUO.snap,rv=DUO.rv;if(!S||!rv)return;
  s=Math.max(0,Math.min(rv.steps.length-1,s));
  rv.s=s;const go=++rv.go,on=()=>DUO.rv===rv&&rv.go===go;
  const[k,half]=rv.steps[s],whole=duoRevAt(S.st.first,S.st.el,S.rev,S.rules,k),{st,last}=revSplit(whole.st,whole.last,half,duoClone);
  revTags();$$('#duoBoard .hl').forEach(x=>x.classList.remove('hl'));
  rv.cell=last?last.cell:-1;
  const wave=(e,prev)=>e.t==='seal'?prev:revWave(e,last,st,prev,S.rules,DNB,DUO_CELLS);
  if(anim&&last){
    // the board before the move with the card dropping in, then each wave flips (a Combo's half step: the card is already there)
    const a=duoClone(last.pre);
    if(!last.half){a.h[last.p]=a.h[last.p].slice(1);a.b[last.cell]=last.id;a.o[last.cell]=last.p;a.m[last.cell]=st.m[last.cell]}
    rv.st=a;duoDrawBoard(S,a,{drop:last.half?-1:last.cell,last:last.cell});duoScoreRow(S,a);if(!last.half)sfx('place');
    duoRevText(S,s,st,last);duoRevBar(s);
    await wait(300);
    let prev=last.prev||[];
    for(const e of last.ev){
      if(!on())return;
      if(e.t==='seal'){e.cells.forEach(c=>a.k[c]=1);duoDrawBoard(S,a,{seal:e.cells,last:last.cell})}
      else{prev=wave(e,prev);duoFlip(S,a,e.cells,last.p,last.cell,on)}
      await wait(520);
    }
    if(on()){rv.st=st;revFresh();duoRevPlace()}
    return;
  }
  rv.st=st;duoDrawBoard(S,st,{last:rv.cell});duoScoreRow(S,st);
  if(last){let prev=last.prev||[];for(const e of last.ev)prev=wave(e,prev);revFresh()}
  duoRevText(S,s,st,last);duoRevBar(s);
}
// a player's name in their seat's colour
const duoRevWho=(S,q)=>`<b class="rv-who dc-${duoCol(S,q)}">${q===S.you?'You':esc(duoSeatName(S.seats[q]))}</b>`;
function duoRevText(S,s,st,last){
  const me=S.you,R=S.rules,steps=DUO.rv.steps;
  let txt;
  if(!last)txt=`${duoRevWho(S,S.st.first)} ${S.st.first===me?'go':'goes'} first.`;
  else txt=last.half?revWhy(last,R):`${duoRevWho(S,last.p)} played <b>${esc(CARDS[last.id].name)}</b>. `+revWhy(last,R);
  // the end of the match: the scores it finished on
  if(s===steps.length-1)txt+=` <span class="rv-end">${R.ffa?'Final scores: '+[0,1,2,3].map(k=>{const q=(me+k)%4;return `${k?esc(duoSeatName(S.seats[q])):'You'} ${duoPts(st,R,q)}`}).join(', ')
    :`Final score ${duoScore(st,duoTeam(me))}–${duoScore(st,1-duoTeam(me))}`}</span>`;
  const c=$('#tutCoach');
  c.innerHTML=`<div class="tc-av" aria-hidden="true">🦉</div><div><div class="tc-k">Crossroads · ${duoMode(R)} · ${s?`Move ${revNum(steps,s)[0]} of 16`:'Start'}</div><p>${txt}</p></div>`;
  c.hidden=false;c.classList.remove('dim','shake','in');
}
function duoRevBar(s){
  const n=DUO.rv.steps.length-1;
  const b=$('#revBar'),icon=d=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
  b.innerHTML=`<div class="rv-nav">
      <button class="iconbtn" data-s="first" aria-label="Start of the match" ${s?'':'disabled'}>${icon('M6 5v14M18 5l-9 7 9 7z')}</button>
      <button class="iconbtn" data-s="prev" aria-label="Move back" ${s?'':'disabled'}>${icon('M15 5l-7 7 7 7')}</button>
      <span class="rv-pos" aria-live="polite">${revNum(DUO.rv.steps,s).join(' / ')}</span>
      <button class="iconbtn" data-s="next" aria-label="Next move" ${s<n?'':'disabled'}>${icon('M9 5l7 7-7 7')}</button>
      <button class="iconbtn" data-s="last" aria-label="End of the match" ${s<n?'':'disabled'}>${icon('M18 5v14M6 5l9 7-9 7z')}</button>
    </div><button class="btn small" id="rvBack">Back to results</button>`;
  b.hidden=false;
  b.querySelectorAll('[data-s]').forEach(x=>x.onclick=()=>{sfx('click');duoRevStep(x.dataset.s)});
  $('#rvBack').onclick=()=>{sfx('click');duoRevClose()};
  duoRevPlace();
}
function duoRevStep(k){
  const rv=DUO.rv;if(!rv)return;
  const n=rv.steps.length-1;
  if(k==='first')duoRevShow(0);else if(k==='last')duoRevShow(n);
  else if(k==='prev')duoRevShow(rv.s-1);else if(rv.s<n)duoRevShow(rv.s+1,true);
}
// the words end just above the board (growing upwards), the buttons sit where your hand was
function duoRevPlace(){
  if(!DUO.rv)return;
  const c=$('#tutCoach'),W=innerWidth/UI,r=$('#duoBoard').getBoundingClientRect(),w=Math.min(W-24,440);
  c.style.width=w+'px';
  c.style.left=Math.max(12,Math.min(W-w-12,(r.left+r.width/2)/UI-w/2))+'px';
  c.style.top=Math.max(58,r.top/UI-c.offsetHeight-8)+'px';
  const b=$('#revBar'),h=$('#duoHand').getBoundingClientRect();
  b.style.left=(r.left+r.width/2)/UI+'px';
  b.style.top=Math.min(h.top/UI,innerHeight/UI-b.offsetHeight-8)+'px';
  TT.forEach(tagPos);
}
