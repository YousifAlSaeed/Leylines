'use strict';
/* =====================================================================
   REVIEW  (after a game: step through its moves on the board)
   The result popup's Review button. Each match's moves are kept in
   G.ser.rev (match.js); a position is rebuilt by playing them again from
   the start. Each move says who played what and why cards flipped, with
   the tutorial's tags on the edges that did it ("3 + 5 = 8", "7 › 6").
   A move with a Combo takes two steps: the move with its Same or Plus, then a half step (6.5) for the Combo's flips.
   In a series, tabs pick the match. Back brings the result popup back.
   The owl grades every move first (owl.js, the Owl's review): a summary of the match, then each move gets its
   badge, the bar beside the board says who's ahead, and a costly move can be shown its better one or tried again.
   A missed Daily Puzzle uses the same view for See why: your move, then the answer.
   Crossroads has it too (the last part of this file): one match on the 4×4 board, without the owl's grades.
   ===================================================================== */
// best: the better move is shown on the board; try: a costly move being tried again (owlTry)
const RV={on:false,m:0,s:0,real:null,go:0,puz:false,best:false,try:null};

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
// the result popup's Review button: the owl reads the last match, then shows its summary
function revOpen(){
  const ms=revMatches();if(!ms.length)return;
  owlOpen(ms[ms.length-1],false);
}
// step through match m from step s (-1: the end)
function revStart(m,s=-1){
  if(!RV.on){RV.on=true;RV.real=G.st;RV.best=false;G.sel=null;G.busy=true;document.body.classList.add('rev')}
  revShow(m,s);
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
  OWL.ask++; // a summary still being read won't open
  if(!RV.on)return;
  RV.on=false;RV.puz=false;RV.try=null;RV.go++;revTags();
  $('#tutCoach').hidden=true;$('#revBar').hidden=true;$('#owEval').hidden=true;
  document.body.classList.remove('rev','rv-try');
  CELLS.forEach(c=>{c.classList.remove('rv-last','hot','ow-bestc');c.style.removeProperty('--owc')});
}

/* ---------- one position ---------- */
// s: the step to show (-1: the last one). anim: play the move out instead of jumping to it
async function revShow(m,s,anim=false){
  if(RV.try)owlTryOff();
  const steps=revSteps(m);
  if(s<0)s=steps.length-1;
  s=Math.max(0,Math.min(steps.length-1,s));
  RV.m=m;RV.s=s;const go=++RV.go;
  const[r,k,half]=steps[s],{st,last,R}=revAt(m,r,k,half);
  revTags();
  if(anim&&last){
    // the board before the move, then the card lands and each wave flips (a Combo's half step: the card is already there)
    G.st=last.pre;renderBoard();owlClean();
    G.st=st;renderHands();renderHud();
    if(!last.half){
      CELLS[last.cell].innerHTML=(st.el[last.cell]?`<div class="eicon">${ELEM[st.el[last.cell]]}</div>`:'')+cardHTML(last.id,colorOf(last.p),{mod:st.m[last.cell],cls:'drop'});
      sfx('place');
    }
    CELLS[last.cell].classList.add('rv-last');owlMark(m,r,k,last);
    revText(m,r,k,st,last,R,steps);revBar(m,s,steps);
    await wait(300);
    let prev=last.prev||[];
    for(const e of last.ev){
      if(go!==RV.go)return;
      prev=revWave(e,last,st,prev);
      flipCells(e.cells,last.p,last.cell);
      await wait(520);
    }
    if(go===RV.go){revFresh();owlGhost(m,r,k,st,last);revPlace()}
    return;
  }
  G.st=st;renderGame();
  owlClean();
  if(last){CELLS[last.cell].classList.add('rv-last');let prev=last.prev||[];for(const e of last.ev)prev=revWave(e,last,st,prev);revFresh()}
  owlMark(m,r,k,last);owlGhost(m,r,k,st,last);
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
const revWho=p=>G.mode==='local'?(p===0?COL_NAME[myCol()]:'Red'):p===G.me?'You':G.mode==='ai'?'The CPU':esc(oppName());
function revText(m,r,k,st,last,R,steps){
  const n=R.moves.length,sd=r>0?`Sudden death ${r} · `:'',ser=G.bo>1?`Match ${m+1} · `:'';
  let kick=`${ser}${sd}${k?`Move ${k}${last.half?'.5':''} of ${n}`:'Start'}`,txt;
  if(!last){
    const w=revWho(R.first);
    txt=(r>0?'A draw, so Sudden Death: each player takes back the cards they owned on the board. ':'')+`<b>${w}</b> ${w==='You'?'go':'goes'} first.`;
  }
  // the owl's grade of the move (a Combo's half step keeps its badge, the words are said once).
  // Its words say enough without "Nothing flipped."
  const x=owlMove(m,r,k);let btns='';
  if(last)txt=last.half?revWhy(last):`<b>${revWho(last.p)}</b> played <b>${esc(CARDS[last.id].name)}</b>.`+(x&&!last.ev.length?'':' '+revWhy(last));
  if(x){
    kick+=' '+owlTag(x.cls);
    if(!last.half){
      txt+=' '+owlWords(m,r,k,st,last,x);
      if(x.v<x.best)btns=`<button class="btn small${RV.best?' on':''}" data-o="best" aria-pressed="${RV.best}">${RV.best?'Hide best':'Show best'}</button>`+
        (G.mode==='local'||x.p===G.me?'<button class="btn small" data-o="try">Try again</button>':'');
    }
  }else if(!last&&owlOf(m)){const[a,b]=owlScore(m,r,0);txt+=` Perfect play from here ends <b>${a}–${b}</b>.`}
  // the end of the match: the score it finished on
  if(RV.s===steps.length-1){const a=G.mode==='local'?0:G.me;txt+=` <span class="rv-end">Final score ${score(st,a)}–${score(st,1-a)}</span>`}
  const c=$('#tutCoach');
  c.innerHTML=`<div class="tc-av" aria-hidden="true">🦉</div><div><div class="tc-k">${kick}</div><p>${txt}</p>${btns?`<div class="ow-btns">${btns}</div>`:''}</div>`;
  c.hidden=false;c.classList.remove('dim','shake','in');
  c.querySelectorAll('[data-o]').forEach(b=>b.onclick=()=>{sfx('click');b.dataset.o==='try'?owlTry():(RV.best=!RV.best,revShow(RV.m,RV.s))});
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
  const ms=revMatches(),b=$('#revBar'),icon=d=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`,A=owlOf(m);
  const tabs=ms.length>1?`<div class="rv-tabs" role="group" aria-label="Match">${ms.map(i=>{const l=G.ser.log[i];
      return `<button data-m="${i}" class="${i===m?'on':''}" aria-pressed="${i===m}">M${i+1} ${l?`${l.sb}–${l.sr}`:''}</button>`}).join('')}</div>`:'';
  if(A){
    // the owl's version: every move of the round with its badge (tap one to go there), then back, forward, the summary
    const[r,k]=steps[s];
    b.innerHTML=tabs+`<div class="ow-strip" role="group" aria-label="Moves">${A[r].map((x,i)=>{const[,g,nm]=OWL_CLS.find(c=>c[0]===x.cls);
        return `<button data-k="${i+1}" class="${i+1===k?'on':''}" style="--pc:var(--${colorOf(x.p)}1)" aria-label="Move ${i+1}, ${revWho(x.p)}: ${nm}"${i+1===k?' aria-current="step"':''}>`+
          `${i+1}<i class="ow-q ow-${x.cls}" aria-hidden="true">${g}</i></button>`}).join('')}</div>
      <div class="rv-nav">
        <button class="iconbtn" data-s="prev" aria-label="Move back" ${s?'':'disabled'}>${icon('M15 5l-7 7 7 7')}</button>
        <span class="rv-pos" aria-live="polite">${revNum(steps,s).join(' / ')}</span>
        <button class="iconbtn" data-s="next" aria-label="Next move" ${s<steps.length-1?'':'disabled'}>${icon('M9 5l7 7-7 7')}</button>
        <button class="btn small" id="owSum">Summary</button><button class="btn small" id="rvBack">Results</button>
      </div>`;
    b.querySelectorAll('[data-k]').forEach(x=>x.onclick=()=>{sfx('click');revShow(m,steps.findIndex(q=>q[0]===r&&q[1]===+x.dataset.k&&!q[2]))});
    $('#owSum').onclick=()=>{sfx('click');owlSummary(m,true)};
  }else b.innerHTML=tabs+
    `<div class="rv-nav">
      <button class="iconbtn" data-s="first" aria-label="Start of the match" ${s?'':'disabled'}>${icon('M6 5v14M18 5l-9 7 9 7z')}</button>
      <button class="iconbtn" data-s="prev" aria-label="Move back" ${s?'':'disabled'}>${icon('M15 5l-7 7 7 7')}</button>
      <span class="rv-pos" aria-live="polite">${revNum(steps,s).join(' / ')}</span>
      <button class="iconbtn" data-s="next" aria-label="Next move" ${s<steps.length-1?'':'disabled'}>${icon('M9 5l7 7-7 7')}</button>
      <button class="iconbtn" data-s="last" aria-label="End of the match" ${s<steps.length-1?'':'disabled'}>${icon('M18 5v14M6 5l9 7-9 7z')}</button>
    </div><button class="btn small" id="rvBack">Back to results</button>`;
  b.hidden=false;
  // another match of the series: the owl reads it first (its summary, if it hasn't yet), or straight to its end
  b.querySelectorAll('[data-m]').forEach(x=>x.onclick=()=>{sfx('click');const i=+x.dataset.m;owlOf(i)||!A?revShow(i,owlOf(i)?1:-1):owlOpen(i,true)});
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
// arrows step, Home and End jump, Escape goes back to the results (or out of a Try again)
document.addEventListener('keydown',e=>{
  if(!RV.on&&!DUO.rv||$('#modal').classList.contains('on'))return;
  if(RV.try){if(e.key==='Escape'){e.preventDefault();revShow(RV.m,RV.s)}return}
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
  // the room, so it never covers the top row's numbers (nor the owl's bar, when it lies along the board's top)
  const lift=$('#owEval').classList.contains('h')&&!$('#owEval').hidden?18:0;
  // (in a review it may go up over the game's top bar: the owl has more to say)
  c.style.top=(land?(r.top+r.height*.12)/UI:Math.max(RV.on?8:58,$('#board').getBoundingClientRect().top/UI-c.offsetHeight-8-lift))+'px';
}
function revPlace(){
  if(document.body.classList.contains('puz'))coachPlace();
  if(!RV.on)return;
  owlBarPlace();coachPlace();
  const b=$('#revBar'),h=$('#handBot').getBoundingClientRect();
  b.style.left=(h.left+h.width/2)/UI+'px';b.style.top=h.top/UI+'px';
  TT.forEach(tagPos);
}
addEventListener('resize',()=>requestAnimationFrame(revPlace));

/* =====================================================================
   THE OWL'S REVIEW (owl.js grades the moves; this draws them)
   OWL.w: the worker, n: its message count, ask: the summary asked for last (a newer ask or leaving cancels it),
   prog: what shows the reading's progress. A match's grades are kept per series (not in G.ser, which liveSave saves):
   OWL.got.get(G.ser) = {done: [match → rounds of graded positions], wait: [match → its reading]}
   ===================================================================== */
const OWL={w:null,n:0,ask:0,prog:null,got:new WeakMap()};
const owlGot=()=>{let g=OWL.got.get(G.ser);if(!g)OWL.got.set(G.ser,g={done:[],wait:[]});return g};
const owlOf=m=>G&&G.ser?owlGot().done[m]:null;
// the graded move that left k moves played in round r of match m
const owlMove=(m,r,k)=>{const A=owlOf(m);return A&&k>0?A[r][k-1]:null};
// whose side the review is told from (the bottom player: you, or Couch's first colour)
const owlMe=()=>G.mode==='local'?0:G.me;
// who's ahead after k moves of round r, if both play perfectly from there: the score difference for owlMe, then both scores
function owlDiff(m,r,k){
  const ps=owlOf(m)[r],a=owlMe();
  if(k<ps.length)return ps[k].p===a?ps[k].best:0-ps[k].best;
  return ps[k-1].p===a?ps[k-1].v:0-ps[k-1].v;
}
const owlScore=(m,r,k)=>{const d=owlDiff(m,r,k);return[(10+d)/2,(10-d)/2]};
const owlTag=c=>{const[,,nm]=OWL_CLS.find(x=>x[0]===c);return `<span class="ow-tag ow-${c}">${nm}</span>`};
const OWL_MEANS={brilliant:'The only move that keeps the result, and it looks wrong: it flips less right now, or lets its card be flipped back, to come out ahead later.',
  great:'The only move that keeps the result. Every other move costs cards.',
  best:'Costs nothing: the best that could be done. Several moves can be best at once.',
  excellent:'Costs 1 card when it hardly matters, far ahead or far behind.',
  good:'Costs 1 card when the game isn\'t close.',
  inaccuracy:'Costs 1 card in a close game, like 5–5 into 4–6.',
  mistake:'Costs 2 cards in a close game, or turns a win into a loss.',
  miss:'The other player just slipped, and this gives it all back.',
  blunder:'Costs 3 cards or more in a close game.'};

/* ---------- reading a match ---------- */
// the rounds of match m, graded (owl.js). Reads it once, in the worker if it can
function owlRead(m){
  const g=owlGot();
  if(g.done[m])return Promise.resolve(g.done[m]);
  if(g.wait[m])return g.wait[m];
  const R={...G.rules},rounds=G.ser.rev[m].rounds.map(r=>({h:r.h,first:r.first,el:r.el,moves:r.moves}));
  const p=owlWorker(R,rounds).catch(()=>owlHere(R,rounds)).then(res=>g.done[m]=owlGrade(res));
  p.catch(()=>{g.wait[m]=null});
  return g.wait[m]=p;
}
function owlWorker(R,rounds){
  return new Promise((ok,no)=>{
    let w;try{w=OWL.w||(OWL.w=new Worker('js/owl.js'))}catch(e){no(e);return}
    const id=++OWL.n,end=()=>{w.removeEventListener('message',on);w.removeEventListener('error',bad)};
    const on=e=>{const d=e.data;if(!d||d.id!==id)return;
      if(d.t==='prog'){if(OWL.prog)OWL.prog(d.f);return}
      end();if(d.t==='done')ok(d.rounds);else no(d.err)};
    // it couldn't start (offline before its file was saved, say): it's dropped and the page reads the match itself
    const bad=e=>{end();if(OWL.w===w){OWL.w=null;w.terminate()}no(e)};
    w.addEventListener('message',on);w.addEventListener('error',bad);
    w.postMessage({id,R,rounds});
  });
}
// no worker: a position at a time, so the screen still draws in between (the first one takes a second or two)
function owlHere(R,rounds){
  return new Promise((ok,no)=>{
    const total=rounds.reduce((s,r)=>s+r.moves.reduce((a,_,k)=>a+OWL_COST[k],0),0),out=[];
    let ri=0,k=0,job=null,done=0;
    const tick=()=>{
      try{
        job=job||owlJob(R,rounds[ri]);
        const more=job.step();done+=OWL_COST[k++];if(OWL.prog)OWL.prog(done/total);
        if(!more){out.push(job.out);job=null;k=0;if(++ri>=rounds.length){ok(out);return}}
      }catch(e){no(e);return}
      setTimeout(tick,0);
    };
    setTimeout(tick,60);
  });
}

/* ---------- the summary ---------- */
// inRev: asked for from the review (its Summary button or a series tab), not the result popup
function owlOpen(m,inRev){
  const t=++OWL.ask,ser=G.ser,live=()=>OWL.ask===t&&G&&G.ser===ser;
  if(!owlOf(m)){
    modal(`<div class="ow-load"><div class="tc-av ow-think" aria-hidden="true">🦉</div><h2 class="nm2">Owl's review</h2>
      <p>The owl is going through every move…</p><div class="ow-prog" role="progressbar" aria-label="Reading the match"><i id="owProg"></i></div></div>`,
      [{label:'Cancel',fn:()=>{OWL.ask++;if(!inRev&&G&&G.res)resultModal(...G.res)}}]).classList.add('ow-box');
    OWL.prog=f=>{const p=$('#owProg');if(p&&OWL.ask===t)p.style.width=Math.round(f*100)+'%'};
  }
  // the owl couldn't read it: the review without the grades
  owlRead(m).then(()=>{if(live())owlSummary(m,inRev)},()=>{if(live()){closeModal();revStart(m)}});
}
function owlSummary(m,inRev){
  const A=owlOf(m),a=owlMe(),b=1-a,T=[a,b].map(p=>owlTotals(A,p)),rl=A.length-1,[sa,sb]=owlScore(m,rl,A[rl].length);
  const short=p=>G.mode==='local'?(p===0?COL_NAME[myCol()]:'Red'):p===G.me?'You':G.mode==='ai'?'CPU':esc(oppName());
  const res=G.mode==='local'?(sa===sb?'A draw':`${short(sa>sb?a:b)} won`):sa>sb?'You won':sa<sb?'You lost':'A draw';
  const ms=revMatches(),col=p=>`--pc:var(--${colorOf(p)}1);--pk:var(--${colorOf(p)}-ink)`,q=c=>{const[,g]=OWL_CLS.find(x=>x[0]===c);return `<i class="ow-q ow-${c}" aria-hidden="true">${g}</i>`};
  const ph=(p,f,t)=>{const c=owlPhase(A,p,f,t);return c?q(c):'<i class="ow-none">–</i>'};
  const say=owlSay(A,a,sa,sb);
  const html=`<div class="ow-hd"><div class="tc-av" aria-hidden="true">🦉</div><div><div class="tc-k">${G.bo>1?`Match ${m+1} · `:''}${res} ${sa}–${sb}</div><h2 class="nm2">Owl's review</h2></div></div>`+
    (ms.length>1?`<div class="rv-tabs ow-tabs" role="group" aria-label="Match">${ms.map(i=>{const l=G.ser.log[i];
      return `<button data-sm="${i}" class="${i===m?'on':''}" aria-pressed="${i===m}">M${i+1} ${l?`${l.sb}–${l.sr}`:''}</button>`}).join('')}</div>`:'')+
    `<p class="ow-say" aria-live="polite">${say}</p>`+owlGraph(m)+
    `<div class="ow-acc">${[a,b].map((p,i)=>`<div style="${col(p)}"><span class="ow-l">${short(p)} · accuracy</span><b>${T[i].acc.toFixed(1)}</b>
      <span class="ow-like">Played like ${owlLike(T[i].acc)}</span></div>`).join('')}</div>`+
    // two columns, a heading on each: Brilliant to Good, then Inaccuracy to Blunder
    `<div class="ow-cls">${OWL_CLS.filter(c=>c[0]!=='forced').map(([c,,nm],i)=>(i%5?'':`<div class="ow-row ow-th" aria-hidden="true"><span></span><b style="${col(a)}">${short(a)}</b><b style="${col(b)}">${short(b)}</b></div>`)+
      `<button class="ow-row" data-c="${c}" aria-label="${nm}: ${short(a)} ${T[0].n[c]}, ${short(b)} ${T[1].n[c]}">`+
      `<span>${q(c)}${nm}</span><b class="${T[0].n[c]?'':'z'}" style="${col(a)}">${T[0].n[c]}</b><b class="${T[1].n[c]?'':'z'}" style="${col(b)}">${T[1].n[c]}</b></button>`).join('')}</div>`+
    `<div class="ow-ph"><span></span><span class="ow-l">Start</span><span class="ow-l">Middle</span><span class="ow-l">End</span>`+
      [a,b].map(p=>`<span class="ow-pn" style="${col(p)}">${short(p)}</span><span>${ph(p,0,3)}</span><span>${ph(p,3,6)}</span><span>${ph(p,6,9)}</span>`).join('')+`</div>`+
    `<p class="ow-note">${G.rules.open?'':'The owl saw every card, even the ones that were hidden. '}${G.rules.chaos?'With Chaos, only the squares for the card Chaos picked are compared. ':''}Tap a badge to see what it means.</p>`;
  const box=modal(html,[
    {label:inRev?'Results':'Back',fn:inRev?revClose:()=>G&&G.res&&resultModal(...G.res)},
    {label:inRev?'Moves':'Start review',cls:'primary',fn:()=>{if(!RV.on||RV.m!==m)revStart(m,1)}}]);
  box.classList.add('ow-box');
  const sayEl=box.querySelector('.ow-say');let shown=null;
  box.querySelectorAll('[data-c]').forEach(x=>x.onclick=()=>{const c=x.dataset.c;shown=shown===c?null:c;
    sayEl.innerHTML=shown?`${q(c)} <b>${OWL_CLS.find(y=>y[0]===c)[2]}:</b> ${OWL_MEANS[c]}`:say;box.querySelectorAll('[data-c]').forEach(y=>y.classList.toggle('on',y.dataset.c===shown))});
  box.querySelectorAll('[data-sm]').forEach(x=>x.onclick=()=>{sfx('click');owlOpen(+x.dataset.sm,inRev)});
  // the graph: tap a move to go to it
  box.querySelectorAll('[data-g]').forEach(x=>x.onclick=()=>{
    const[r,k]=x.dataset.g.split(',').map(Number);sfx('click');closeModal();
    revStart(m,revSteps(m).findIndex(s=>s[0]===r&&s[1]===k&&!s[2]))});
}
// the owl's few words on the match
function owlSay(A,a,sa,sb){
  const xs=A.flat(),good=x=>['best','great','brilliant'].includes(x.cls);
  const worst=p=>xs.filter(x=>x.p===p&&OWL_BAD.includes(x.cls)).sort((u,v)=>v.drop-u.drop)[0];
  const at=x=>{const r=A.findIndex(ps=>ps.includes(x));return `Move ${A[r].indexOf(x)+1}${r?` of sudden death ${r}`:''}`};
  const cost=x=>plural((x.best-x.v)/2,'card');
  if(G.mode==='local'){
    const n=p=>plural(xs.filter(x=>x.p===p&&good(x)).length,'time'),w=[worst(0),worst(1)].filter(Boolean).sort((u,v)=>v.drop-u.drop)[0];
    return `${COL_NAME[myCol()]} found the best move ${n(0)}, Red ${n(1)}.`+(w?` The biggest slip: ${revWho(w.p)}'s ${at(w)}, which cost ${cost(w)}.`:' Neither of you slipped once.');
  }
  const mine=xs.filter(x=>x.p===a&&x.cls!=='forced'),nb=mine.filter(good).length,w=worst(a),o=worst(1-a),br=mine.find(x=>x.cls==='brilliant');
  const opp=G.mode==='ai'?'The CPU':esc(oppName());
  let t=(sa>sb?sa-sb>=4?'Well played!':'A close one!':sa<sb?'A tough one.':'An even match.')+' '+
    (nb===mine.length?'Every move you made was the best one.':nb?`You found the best move ${plural(nb,'time')}.`:'The best move got away from you this time.');
  if(br)t+=` Your ${at(br)} was brilliant!`;
  if(w)t+=` Your ${at(w)} cost you ${cost(w)}.`;
  if(o)t+=sa>sb?` ${opp}'s ${at(o)} gave you your chance.`:` ${opp} slipped too, on ${at(o)}.`;
  return t;
}
// who was ahead, move by move (perfect play from each position): your colour above the line, theirs below.
// Dots on the moves that stand out; tap a move to go to it
function owlGraph(m){
  const A=owlOf(m),W=300,H=56,pts=[];
  A.forEach((ps,r)=>{for(let k=0;k<=ps.length;k++)pts.push({r,k,d:owlDiff(m,r,k),x:k?ps[k-1]:null})});
  const n=pts.length,X=i=>4+i*(W-8)/(n-1),Y=d=>H/2-Math.max(-6,Math.min(6,d))/6*(H/2-4),gap=(W-8)/(n-1);
  const line=pts.map((p,i)=>`${X(i).toFixed(1)},${Y(p.d).toFixed(1)}`).join(' '),area=`${X(0)},${H/2} ${line} ${X(n-1)},${H/2}`;
  const me=`var(--${colorOf(owlMe())}1)`,op=`var(--${colorOf(1-owlMe())}1)`;
  const svg=`<svg viewBox="0 0 ${W} ${H}" aria-hidden="true"><defs><clipPath id="owUp"><rect width="${W}" height="${H/2}"/></clipPath>
      <clipPath id="owDn"><rect y="${H/2}" width="${W}" height="${H/2}"/></clipPath></defs>
    <polygon points="${area}" clip-path="url(#owUp)" style="fill:${me};opacity:.6"/><polygon points="${area}" clip-path="url(#owDn)" style="fill:${op};opacity:.6"/>
    <line x1="0" x2="${W}" y1="${H/2}" y2="${H/2}" class="ow-mid"/>
    ${pts.map((p,i)=>p.r&&!p.k?`<line x1="${X(i)}" x2="${X(i)}" y1="0" y2="${H}" class="ow-mid"/>`:'').join('')}
    <polyline points="${line}" class="ow-line"/>
    ${pts.map((p,i)=>p.x&&['brilliant','great','inaccuracy','mistake','miss','blunder'].includes(p.x.cls)?`<circle cx="${X(i)}" cy="${Y(p.d)}" r="3.6" style="fill:var(--ow-${p.x.cls})"/>`:'').join('')}
    </svg>`;
  // the buttons over it, one per move
  const hits=pts.map((p,i)=>p.k?`<button data-g="${p.r},${p.k}" style="left:${(X(i)-gap/2)/W*100}%;width:${gap/W*100}%" aria-label="Go to move ${p.k}${p.r?` of sudden death ${p.r}`:''}"></button>`:'').join('');
  const lab=A.length===1?`<div class="ow-gx" aria-hidden="true"><span>Start</span>${A[0].map((_,k)=>`<span>${k+1}</span>`).join('')}</div>`
    :`<div class="ow-gx ow-gsd" aria-hidden="true">${A.map((_,r)=>`<span>${r?`Sudden death ${r}`:'Match'}</span>`).join('')}</div>`;
  return `<div class="ow-graph"><div class="ow-gw">${svg}${hits}</div>${lab}</div>`;
}

/* ---------- on the board ---------- */
// the owl's marks from the step before are gone (the board is drawn again under them)
function owlClean(){CELLS.forEach(c=>{c.classList.remove('rv-last','ow-bestc');c.style.removeProperty('--owc')})}
// the bar beside the board: d is the score difference for owlMe with perfect play from here
function owlBar(d){
  const e=$('#owEval'),a=(10+d)/2;
  if(!e.firstChild)e.innerHTML='<i></i><b class="ow-ea"></b><b class="ow-eb"></b>';
  e.style.setProperty('--ow-me',`var(--${colorOf(owlMe())}1)`);e.style.setProperty('--ow-op',`var(--${colorOf(1-owlMe())}1)`);
  e.style.setProperty('--f',a/10);e.querySelector('.ow-ea').textContent=a;e.querySelector('.ow-eb').textContent=10-a;
  e.hidden=false;
}
// the bar, and the badge of the move just played (its square ringed in the badge's colour)
function owlMark(m,r,k,last){
  if(!owlOf(m)){$('#owEval').hidden=true;return}
  owlBar(owlDiff(m,r,k));
  const x=owlMove(m,r,k);
  if(x&&last)owlBadge(last.cell,x.cls);
}
function owlBadge(cell,c){
  const el=CELLS[cell],[,g]=OWL_CLS.find(x=>x[0]===c);
  el.style.setProperty('--owc',`var(--ow-${c})`);el.classList.add('rv-last');
  el.querySelector('.ow-q')?.remove();el.insertAdjacentHTML('beforeend',`<i class="ow-q ow-${c}" aria-hidden="true">${g}</i>`);
}
// a best move to show for a costly one: the same card on another square if that was as good, else the one that flips most now
function owlBest(x){
  return x.mv.filter(y=>y[2]===x.best).sort((u,v)=>(v[0]===x.pl[0])-(u[0]===x.pl[0])||v[3]-u[3])[0];
}
// Show best: the better card, see-through, on its square (on the same square as the move: the board from before it)
function owlGhost(m,r,k,st,last){
  const x=owlMove(m,r,k);
  if(!RV.best||!x||!last||last.half||x.v>=x.best)return;
  const[id,cell]=owlBest(x),pre=cell===last.cell;
  if(pre){revTags();G.st=last.pre;renderBoard();G.st=st}
  const R=G.rules,mod=R.elemental&&st.el[cell]?(CARDS[id].e===st.el[cell]?1:-1):0;
  CELLS[cell].insertAdjacentHTML('beforeend',cardHTML(id,colorOf(x.p),{mod,cls:'ow-ghost'}));
  CELLS[cell].classList.add('ow-bestc');
}
// the owl's words on one move: its grade, what it cost, why, and what was best
function owlWords(m,r,k,st,last,x){
  const keep=v=>v>0?'the win':v===0?'the draw':'it this close',res=v=>v>0?'win':v<0?'loss':'draw';
  const me=x.mv.find(y=>y[0]===x.pl[0]&&y[1]===x.pl[1]);
  switch(x.cls){
    case 'forced':return 'Only one card and one square were left.';
    case 'brilliant':return `<b>Brilliant!</b> The only move that keeps ${keep(x.v)}, even though ${me[4]?'its card can be flipped right back':'another move flips more right now'}.`;
    case 'great':return `<b>Great move:</b> the only one that keeps ${keep(x.v)}.`;
    case 'best':{const n=x.mv.filter(y=>y[2]===x.best).length;return n>1?`One of ${n} best moves.`:'The best move.'}
  }
  const[id,cell]=owlBest(x),a=res(x.best),b=res(x.v);
  return (x.cls==='miss'?'<b>Missed chance!</b> This gives back what the last move gave away. ':'')+
    `It costs <b>${plural((x.best-x.v)/2,'card')}</b>${a!==b?` and turns a ${a} into a ${b}`:''}.`+
    owlWhy(m,r,k,revAt(m,r,k).st,last)+` Best was <b>${esc(CARDS[id].name)}</b> on the ${CELL_NAME[cell]} square.`;
}
// what the next player can do about it: take the card straight back, or flip a lot (from their best replies)
function owlWhy(m,r,k,st,last){
  const nx=owlOf(m)[r][k];if(!nx)return '';
  const q=nx.p,who=revWho(q);let most=0;
  for(const[id,cell]of nx.mv.filter(y=>y[2]===nx.best)){
    const ch=cloneS(st),ev=[];play(ch,G.rules,ch.h[q].indexOf(id),cell,ev);
    const e=ev.find(e=>e.cells.includes(last.cell));
    if(e){
      if(e.t!=='basic')return ` ${who} can take it back next turn with ${e.t==='same'?'Same':e.t==='plus'?'Plus':'a Combo'}.`;
      const d=NB[cell].indexOf(last.cell);
      return ` ${who} can take it back next turn: its ${fmt(CARDS[st.b[last.cell]].s[(d+2)&3])} on the ${['top','right','bottom','left'][(d+2)&3]} loses to a ${fmt(CARDS[id].s[d])}.`;
    }
    most=Math.max(most,ev.reduce((s,e)=>s+e.cells.length,0));
  }
  return most>=2?` ${who} can flip ${most} next turn.`:'';
}
// where the bar goes: up the left of the board if there's room (PC, sideways), else along its top (phones)
function owlBarPlace(){
  const e=$('#owEval');if(e.hidden)return;
  const r=$('#board').getBoundingClientRect(),side=r.left/UI>=30;
  e.classList.toggle('h',!side);
  if(side){e.style.left=r.left/UI-22+'px';e.style.top=r.top/UI+'px';e.style.width='';e.style.height=r.height/UI+'px'}
  else{e.style.left=r.left/UI+8+'px';e.style.top=r.top/UI-18+'px';e.style.width=r.width/UI-16+'px';e.style.height=''}
}

/* ---------- Try again ---------- */
// a costly move: the board goes back to before it, the mover's hand comes back, and the owl grades each try
function owlTry(){
  const steps=revSteps(RV.m),[r,k]=steps[RV.s],x=owlMove(RV.m,r,k);if(!x)return;
  RV.try={r,k,x,pre:revAt(RV.m,r,k-1).st,prev:owlOf(RV.m)[r][k-2],sel:null,done:false,busy:false};
  RV.go++;document.body.classList.add('rv-try');
  owlTryShow();
}
function owlTryOff(){
  RV.try=null;document.body.classList.remove('rv-try');
  CELLS.forEach(c=>c.classList.remove('hot'));
}
function owlTryShow(){
  const t=RV.try;RV.go++;revTags();
  t.done=false;t.busy=false;
  G.st=cloneS(t.pre);renderBoard();owlClean();owlBar(owlDiff(RV.m,t.r,t.k-1));
  // with Chaos the card was picked for them: only its square is chosen
  t.sel=G.rules.chaos?G.st.h[t.x.p].indexOf(t.x.pl[0]):null;
  owlTryHand();
  owlTryText(`Move ${t.k} · try again`,G.rules.chaos?'Chaos picked this card. Choose a square for it.':'Pick a card, then a square.',
    '<button class="btn small" data-t="back">Back</button>');
}
function owlTryText(kick,txt,btns){
  const c=$('#tutCoach');
  c.innerHTML=`<div class="tc-av" aria-hidden="true">🦉</div><div><div class="tc-k">${kick}</div><p>${txt}</p><div class="ow-btns">${btns}</div></div>`;
  c.hidden=false;
  c.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{sfx('click');const k=b.dataset.t;
    if(k==='again')owlTryShow();else if(k==='next'&&RV.s<revSteps(RV.m).length-1)revStep('next');else revShow(RV.m,RV.s)});
  revPlace();
}
// the mover's hand, in front of them (their own colour, in Couch too)
function owlTryHand(){
  const t=RV.try,p=t.x.p,ok=id=>!t.done&&t.x.mv.some(y=>y[0]===id);
  $('#handBot').innerHTML=G.st.h[p].map((id,i)=>cardHTML(id,colorOf(p),{cls:(ok(id)?'play ':'')+(t.sel===i?'sel':''),
    attrs:`data-i="${i}"`+(ok(id)?` role="button" aria-pressed="${t.sel===i}" aria-label="${esc(cardLabel(id))}"`:'')})).join('');
  $$('#handBot .card.play').forEach(c=>c.onclick=()=>{if(G.rules.chaos)return;const i=+c.dataset.i;t.sel=t.sel===i?null:i;sfx(t.sel==null?'click':'hand_pick');owlTryHand()});
  CELLS.forEach((c,i)=>c.classList.toggle('hot',!t.done&&t.sel!=null&&G.st.b[i]<0));
}
// a square tapped while trying again (game.js): the card goes down, flips, and the owl says how good it was
async function owlTryCell(cell){
  const t=RV.try;if(!t||t.busy||t.done||t.sel==null||G.st.b[cell]>=0)return;
  const p=t.x.p,id=G.st.h[p][t.sel],y=t.x.mv.find(q=>q[0]===id&&q[1]===cell);if(!y)return;
  t.busy=true;t.done=true;t.sel=null;
  const go=++RV.go,pre=cloneS(t.pre),st=cloneS(t.pre),ev=[];
  play(st,G.rules,st.h[p].indexOf(id),cell,ev);
  G.st=st;owlTryHand();renderHud();
  CELLS[cell].innerHTML=(st.el[cell]?`<div class="eicon">${ELEM[st.el[cell]]}</div>`:'')+cardHTML(id,colorOf(p),{mod:st.m[cell],cls:'drop'});
  sfx('place');
  const tx={...t.x,v:y[2],pl:[id,cell]},c=owlClass(tx,t.prev,t.k-1),last={pre,p,id,cell,ev};
  owlBadge(cell,c);owlBar(p===owlMe()?y[2]:0-y[2]);
  const nm=`<b>${esc(CARDS[id].name)}</b> on the ${CELL_NAME[cell]} square`,n=t.x.mv.filter(q=>q[2]===t.x.best).length;
  const txt=y[2]===t.x.best?`<b>Yes!</b> ${nm} is ${n>1?'one of the best moves':'the best move'}. ${revWhy(last)}`
    :`${nm} costs <b>${plural((t.x.best-y[2])/2,'card')}</b>. ${revWhy(last)} Try another?`;
  owlTryText(`Move ${t.k} · try again ${owlTag(c)}`,txt,
    '<button class="btn small" data-t="again">Try another</button><button class="btn small primary" data-t="next">Next move</button>');
  await wait(300);
  let prev=[];
  for(const e of ev){
    if(go!==RV.go)return;
    prev=revWave(e,last,st,prev);flipCells(e.cells,p,cell);
    await wait(520);
  }
  if(go===RV.go){revFresh();t.busy=false;revPlace()}
}

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
