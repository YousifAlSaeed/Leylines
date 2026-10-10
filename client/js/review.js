'use strict';
/* =====================================================================
   REVIEW  (after a game: step through its moves on the board)
   The result popup's Review button. Each match's moves are kept in
   G.ser.rev (match.js); a position is rebuilt by playing them again from
   the start. Each move says who played what and why cards flipped, with
   the tutorial's tags on the edges that did it ("3 + 5 = 8", "7 › 6").
   In a series, tabs pick the match. Back brings the result popup back.
   A missed Daily Puzzle uses the same view for See why: your move, then the answer.
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
// every position of a match, in order: [round, moves played]. A round starts with 0 moves played.
function revSteps(m){const out=[];G.ser.rev[m].rounds.forEach((r,ri)=>{for(let k=0;k<=r.moves.length;k++)out.push([ri,k])});return out}
// the board after k moves of round r, and what the last of them did
function revAt(m,r,k){
  const R=G.ser.rev[m].rounds[r],st=newState(R.h[0],R.h[1],R.first,R.el.slice());
  let last=null;
  R.moves.slice(0,k).forEach(([hi,cell],i)=>{
    if(i<k-1){play(st,G.rules,hi,cell);return}
    const pre=cloneS(st),p=st.turn,id=st.h[p][hi],ev=[];
    play(st,G.rules,hi,cell,ev);last={pre,p,id,cell,ev};
  });
  return {st,last,R};
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
  const[r,k]=steps[s],{st,last,R}=revAt(m,r,k);
  revTags();
  if(anim&&last){
    // the board before the move, then the card lands and each wave flips
    G.st=last.pre;renderBoard();CELLS.forEach(c=>c.classList.remove('rv-last'));
    G.st=st;renderHands();renderHud();
    CELLS[last.cell].innerHTML=(st.el[last.cell]?`<div class="eicon">${ELEM[st.el[last.cell]]}</div>`:'')+cardHTML(last.id,colorOf(last.p),{mod:st.m[last.cell],cls:'drop'});
    CELLS[last.cell].classList.add('rv-last');sfx('place');
    revText(m,r,k,st,last,R,steps);revBar(m,s,steps);
    await wait(300);
    let prev=[];
    for(const e of last.ev){
      if(go!==RV.go)return;
      prev=revWave(e,last,st,prev);
      flipCells(e.cells,last.p,last.cell);
      await wait(520);
    }
    if(go===RV.go)revPlace();
    return;
  }
  G.st=st;renderGame();
  CELLS.forEach(c=>c.classList.remove('rv-last'));
  if(last){CELLS[last.cell].classList.add('rv-last');let prev=[];for(const e of last.ev)prev=revWave(e,last,st,prev)}
  revText(m,r,k,st,last,R,steps);revBar(m,s,steps);
}
// the tags for one wave of flips; returns the cells that can start a Combo from it
function revWave(e,last,st,prev){
  TT.forEach(g=>g.el.classList.add('old'));
  const Rl=G.rules,cell=last.cell,side=(c,d)=>CARDS[st.b[c]].s[d],mod=c=>st.m[c]?(st.m[c]>0?'+1':'−1'):'';
  const gt=Rl.reverse?' ‹ ':' › ';
  if(e.t==='same'||e.t==='plus'){
    // every pair that counted, not only the ones that flipped: one of them can be your own card
    const ents=[];
    for(let d=0;d<4;d++){const n=NB[cell][d];if(n>=0&&st.b[n]>=0)ents.push([d,side(cell,d),side(n,(d+2)&3)])}
    for(const[d,a,b]of ents){
      if(e.t==='same'&&a===b)tutTag(cell,d,`${fmt(a)} = ${fmt(b)}`);
      if(e.t==='plus'&&ents.filter(f=>f[1]+f[2]===a+b).length>=2)tutTag(cell,d,`${a} + ${b} = ${a+b}`);
    }
    return e.cells;
  }
  for(const n of e.cells){
    // Combo flips come from a card flipped in the wave before; a basic one from the card just placed
    const from=e.t==='combo'?prev.find(c=>{const d=NB[c].indexOf(n);return d>=0&&beats(Rl,side(c,d)+st.m[c],side(n,(d+2)&3)+st.m[n])}):cell;
    if(from==null)continue;
    const d=NB[from].indexOf(n);
    tutTag(from,d,`${fmt(side(from,d))}${mod(from)}${gt}${fmt(side(n,(d+2)&3))}${mod(n)}`);
  }
  return e.t==='combo'?e.cells:prev;
}
function revTags(){TT.forEach(g=>g.el.remove());TT.length=0}

/* ---------- the words and the buttons ---------- */
const revWho=p=>G.mode==='local'?(p===0?'Blue':'Red'):p===G.me?'You':G.mode==='ai'?'The CPU':esc(oppName());
function revText(m,r,k,st,last,R,steps){
  const n=R.moves.length,sd=r>0?`Sudden death ${r} · `:'',ser=G.bo>1?`Match ${m+1} · `:'';
  let kick=`${ser}${sd}${k?`Move ${k} of ${n}`:'Start'}`,txt;
  if(!last){
    const w=revWho(R.first);
    txt=(r>0?'A draw, so Sudden Death: each player takes back the cards they owned on the board. ':'')+`<b>${w}</b> ${w==='You'?'go':'goes'} first.`;
  }else txt=`<b>${revWho(last.p)}</b> played <b>${esc(CARDS[last.id].name)}</b>. `+revWhy(last);
  // the end of the match: the score it finished on
  if(RV.s===steps.length-1){const a=G.mode==='local'?0:G.me;txt+=` <span class="rv-end">Final score ${score(st,a)}–${score(st,1-a)}</span>`}
  const c=$('#tutCoach');
  c.innerHTML=`<div class="tc-av" aria-hidden="true">🦉</div><div><div class="tc-k">${kick}</div><p>${txt}</p></div>`;
  c.hidden=false;c.classList.remove('dim','shake','in');
}
// what a move's flips came from, in words
function revWhy(last){
  if(!last.ev.length)return 'Nothing flipped.';
  return last.ev.map(e=>{
    const fl=`${plural(e.cells.length,'card')} flip${e.cells.length===1?'s':''}`;
    return {same:`<b>Same!</b> Two sides match the numbers they touch, so ${fl}.`,
      plus:`<b>Plus!</b> Two sides add up to the same total, so ${fl}.`,
      combo:`<b>Combo!</b> The cards Same or Plus flipped beat their neighbours: ${fl}.`,
      basic:`It beats ${plural(e.cells.length,'card')} next to it${G.rules.reverse?' (Reverse: lower wins)':''}.`}[e.t];
  }).join(' ');
}
function revBar(m,s,steps){
  const ms=revMatches(),b=$('#revBar'),icon=d=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
  b.innerHTML=(ms.length>1?`<div class="rv-tabs" role="group" aria-label="Match">${ms.map(i=>{const l=G.ser.log[i];
      return `<button data-m="${i}" class="${i===m?'on':''}" aria-pressed="${i===m}">M${i+1} ${l?`${l.sb}–${l.sr}`:''}</button>`}).join('')}</div>`:'')+
    `<div class="rv-nav">
      <button class="iconbtn" data-s="first" aria-label="Start of the match" ${s?'':'disabled'}>${icon('M6 5v14M18 5l-9 7 9 7z')}</button>
      <button class="iconbtn" data-s="prev" aria-label="Move back" ${s?'':'disabled'}>${icon('M15 5l-7 7 7 7')}</button>
      <span class="rv-pos" aria-live="polite">${s} / ${steps.length-1}</span>
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
  if(!RV.on||$('#modal').classList.contains('on'))return;
  const k={ArrowLeft:'prev',ArrowRight:'next',Home:'first',End:'last'}[e.key];
  if(k){e.preventDefault();revStep(k)}else if(e.key==='Escape'){e.preventDefault();revClose()}
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
