'use strict';
/* =====================================================================
   HOW TO PLAY  (Basics, Same, Plus, Combo, Sudden death, Reverse, and the other rules in a list)
   ===================================================================== */
// runs timed steps on a loop; returns a stop function
function demoLoop(steps,period){
  const ts=[],cyc=()=>steps.forEach(([t,f])=>ts.push(setTimeout(f,t)));
  cyc();const iv=setInterval(cyc,period);
  return()=>{clearInterval(iv);ts.forEach(clearTimeout)};
}
function flipTo(card,col,axis){card.classList.remove('fx','fy','drop');void card.offsetWidth;card.classList.add(axis);setTimeout(()=>{card.classList.remove('blue','red');card.classList.add(col)},230)}
function setCol(card,col){card.classList.remove('fx','fy','blue','red');card.classList.add(col)}

/* ---------- examples ----------
   A small board with cards keyed "row,col". Each scene drops your new card on `at`, then each wave tags the
   sides that touch ("8 = 8", "2 + 3 = 5") and lights their numbers. A wave's ok pairs then flip, unless it's
   `bad` (the move that doesn't work). pairs: [square, side (0 top, 1 right, 2 bottom, 3 left), tag, ok] */
const EX_DIR=[[-1,0],[0,1],[1,0],[0,-1]];
const exNb=(k,d)=>{const[r,c]=k.split(',').map(Number);return (r+EX_DIR[d][0])+','+(c+EX_DIR[d][1])};
// sizes in em, as in howto.css .ex: cells 4.6 × 5.52, gap .3, padding .35
const exX=c=>.35+c*4.9,exY=r=>.35+r*5.82;
function exBoard(sc){
  let h='';
  for(let r=0;r<sc.rows;r++)for(let c=0;c<sc.cols;c++){const k=r+','+c,x=sc.cards[k];h+=`<div class="c" data-k="${k}">${x?cardHTML(x[0],x[1],{name:false}):''}</div>`}
  return `<div class="ex${sc.rows===1?' big':''}" style="grid-template-columns:repeat(${sc.cols},4.6em)">${h}</div>`;
}
function exTag(b,k,d,txt,ok){
  const n=exNb(k,d),[r,c]=k.split(',').map(Number),fs=parseFloat(getComputedStyle(b).fontSize);
  b.querySelector(`[data-k="${k}"] .n${d}`).classList.add('hl');b.querySelector(`[data-k="${n}"] .n${(d+2)&3}`).classList.add('hl');
  const el=document.createElement('span');el.className='ex-tag'+(ok?'':' bad');el.textContent=txt;
  el.style.left=(d===1?exX(c+1)-.15:d===3?exX(c)-.15:exX(c)+2.3)*fs+'px';
  el.style.top=(d===0?exY(r)-.15:d===2?exY(r+1)-.15:exY(r)+2.76)*fs+'px';
  b.append(el);requestAnimationFrame(()=>el.classList.add('on'));
}
// zooms the example to fill the stage, whatever the screen: smaller on a short phone, bigger on a PC
function exFit(st){
  const w=st.querySelector('.ex-wrap');if(!w)return;
  w.style.zoom=1;
  w.style.zoom=Math.min((st.clientWidth-24)/w.offsetWidth,(st.clientHeight-16)/w.offsetHeight,1.7).toFixed(3);
}
// shrinks the text a little when a small screen can't fit it; nothing in How to play scrolls
function textFit(){
  const box=$('.htext'),inn=$('#hIn');inn.style.zoom=1;
  for(let k=.95;k>.69&&box.scrollHeight>box.clientHeight+1;k-=.05)inn.style.zoom=k.toFixed(2);
}
addEventListener('resize',()=>{if($('#how').classList.contains('on')){exFit($('#hStage'));textFit()}});
// plays the scenes on a loop; with reduced motion, shows the first one finished
function exDemo(st,scenes,still){
  const steps=[],q=k=>st.querySelector(`[data-k="${k}"]`);let t=0,first=0;
  scenes.forEach((sc,i)=>{
    steps.push([t,()=>{st.innerHTML=`<div class="ex-wrap"><span class="ex-lbl">${sc.label}</span>${exBoard(sc)}<div class="ex-cap"></div></div>`;exFit(st)}]);
    steps.push([t+500,()=>{q(sc.at).innerHTML=cardHTML(sc.card,'blue',{name:false,cls:still?'':'drop'})}]);
    t+=1200;
    for(const w of sc.waves){
      steps.push([t,()=>{const b=st.querySelector('.ex');b.querySelectorAll('.ex-tag').forEach(x=>x.classList.add('old'));w.pairs.forEach(p=>exTag(b,...p))}]);
      t+=1000;
      steps.push([t,()=>{
        const cap=st.querySelector('.ex-cap');cap.textContent=w.cap;cap.classList.toggle('bad',!!w.bad);cap.classList.add('on');
        if(!w.bad)for(const[k,d,,ok]of w.pairs)if(ok){const c=q(exNb(k,d)).querySelector('.card');still?setCol(c,'blue'):flipTo(c,'blue',d%2?'fy':'fx')}
      }]);
      t+=1300;
    }
    t+=900;
    if(!i)first=steps.length;
  });
  if(still){steps.slice(0,first).forEach(s=>s[1]());return null}
  return demoLoop(steps,t);
}
// Sudden death: a 5–5 board (badges on the cards that changed colour), then your hand for the next round
const SD_BOARD={rows:3,cols:3,cards:{'0,0':[22,'blue'],'0,1':[20,'red'],'0,2':[0,'blue'],'1,0':[9,'blue'],'1,1':[13,'red'],'1,2':[1,'red'],'2,0':[2,'red'],'2,1':[10,'blue'],'2,2':[7,'red']}};
const SD_HAND={rows:1,cols:5,cards:{'0,0':[22,'blue'],'0,1':[0,'blue'],'0,2':[9,'blue'],'0,3':[10,'blue'],'0,4':[3,'blue']}};
function sdDemo(st,still){
  const put=(sc,label,badge,keys)=>{
    st.innerHTML=`<div class="ex-wrap"><span class="ex-lbl">${label}</span>${exBoard(sc)}<div class="ex-cap"></div></div>`;
    for(const k of keys)st.querySelector(`[data-k="${k}"]`).insertAdjacentHTML('beforeend',`<span class="ex-badge">${badge}</span>`);
    exFit(st);
  };
  const cap=t=>{const c=st.querySelector('.ex-cap');c.textContent=t;c.classList.add('on')};
  const hand=()=>put(SD_HAND,'Your hand in round 2','won',['0,2','0,3']);
  if(still){hand();cap('Cards you flipped are yours now');return null}
  return demoLoop([[0,()=>put(SD_BOARD,'Round 1 ends 5–5','flipped',['1,0','1,1','2,1','2,2'])],[1000,()=>cap('Draw: Sudden death!')],
    [3000,hand],[3500,()=>cap('Cards you flipped are yours now')]],6800);
}
const EX_SAME={rows:2,cols:2,cards:{'0,1':[35,'red'],'1,0':[9,'red']},at:'1,1'};
const EX_PLUS={rows:2,cols:2,cards:{'0,1':[1,'red'],'1,0':[0,'red']},at:'1,1'};
const EX_CAP={rows:1,cols:2,cards:{'0,1':[20,'red']},at:'0,0'};
// Every tab stays short enough to fit without scrolling (a phone shows about 5 short lines under the example).
// tut: the tutorial lesson its button plays (tutorial.js); Basics plays all of it. more: a list of rules, no example
const HOW=[
 {tab:'Basics',tag:'Basics',title:'Own the most cards',tut:0,try:'Play the tutorial',
  ex:[{...EX_CAP,label:'7 meets 6',card:22,waves:[{pairs:[['0,0',1,'7 › 6',1]],cap:'Higher side flips it'}]},
      {...EX_CAP,label:'4 meets 6',card:0,waves:[{pairs:[['0,0',1,'4 ‹ 6',0]],cap:'Lower: nothing happens',bad:1}]}],
  list:['Each player brings <b>5 cards</b> and takes turns placing one on the <b>3×3 board</b>',
    'Touching an enemy card? If your side is <b>higher</b>, it turns your colour. <b>X</b> = 10',
    'Board full? <b>Most cards</b> wins. Cards still in your hand count too']},
 {tab:'Same',tag:'Rule · Same',title:'Two matches flip both',tut:1,
  ex:[{...EX_SAME,label:'Seraph Warden: top 8, left 6',card:45,waves:[{pairs:[['1,1',0,'8 = 8',1],['1,1',3,'6 = 6',1]],cap:'2 matches: Same!'}]},
      {...EX_SAME,label:'Gale Harpy: top 8, left 4',card:34,waves:[{pairs:[['1,1',0,'8 = 8',1],['1,1',3,'4 ≠ 6',0]],cap:'Only 1 match: nothing',bad:1}]}],
  list:['If <b>2 or more</b> of your sides equal the sides they touch, those cards flip',
    'They can be <b>different numbers</b>: 8 = 8 and 6 = 6 counts',
    'Equal is enough here. Only 1 match does nothing']},
 {tab:'Plus',tag:'Rule · Plus',title:'Two equal totals flip both',tut:2,
  ex:[{...EX_PLUS,label:'Bog Newt: top 2, left 1',card:2,waves:[{pairs:[['1,1',0,'2 + 3 = 5',1],['1,1',3,'1 + 4 = 5',1]],cap:'5 and 5: Plus!'}]},
      {...EX_PLUS,label:'Candlewisp: top 1, left 4',card:6,waves:[{pairs:[['1,1',0,'1 + 3 = 4',0],['1,1',3,'4 + 4 = 8',0]],cap:'4 and 8: nothing',bad:1}]}],
  list:['Add each touching pair: <b>your side + theirs</b>',
    'If <b>2 or more</b> totals are the <b>same</b>, those cards flip',
    'Any numbers work: 2 + 3 and 1 + 4 both make 5. Even low cards win this way']},
 {tab:'Combo',tag:'Rule · Combo',title:'Flips that keep going',tut:3,
  ex:[{label:'Same or Plus starts it',rows:2,cols:3,cards:{'0,0':[0,'red'],'0,1':[35,'red'],'0,2':[11,'red'],'1,0':[9,'red']},at:'1,1',card:45,waves:[
      {pairs:[['1,1',0,'8 = 8',1],['1,1',3,'6 = 6',1]],cap:'Same!'},
      {pairs:[['0,1',1,'4 › 3',1],['1,0',0,'3 › 2',1]],cap:'Combo: 4 cards!'}]}],
  list:['A card flipped by <b>Same</b> or <b>Plus</b> attacks its own neighbours',
    'If its side is <b>higher</b>, they flip too, and so on']},
 {tab:'Sudden death',tag:'Rule · Sudden death',title:'A draw plays on',demo:sdDemo,
  list:['A draw doesn\'t end the match: a new round starts, up to 5 times',
    'Your new hand is <b>every card in your colour</b> when the round ended',
    'So cards you <b>flipped</b> come with you, and cards they flipped from you go to them',
    'The other player goes first']},
 {tab:'Reverse',tag:'Rule · Reverse',title:'Low beats high',
  ex:[{...EX_CAP,label:'4 meets 6',card:0,waves:[{pairs:[['0,0',1,'4 ‹ 6',1]],cap:'Lower side flips it'}]},
      {...EX_CAP,label:'7 meets 6',card:22,waves:[{pairs:[['0,0',1,'7 › 6',0]],cap:'Higher: nothing happens',bad:1}]}],
  list:['Everything flips around: if your side is <b>lower</b>, their card turns your colour',
    'A <b>1</b> is the strongest side, and <b>X</b> the weakest',
    'Same and Plus work as usual. With Elemental, a <b>−1</b> square helps you']},
 {tab:'Hands',tag:'Other rules',title:'Your cards',more:true,
  list:['<b>Your 5</b>Up to one 5★ card, and up to two of 4★ or more.',
    '<b>Open · Three open</b>Both hands are face up, or just 3 random cards of each. 👁 marks a card both players can see.',
    '<b>Random</b>Your 5 cards are dealt from your collection.',
    '<b>Chaos</b>Each turn the game picks which card you must play. You only pick the square.']},
 {tab:'Board',tag:'Other rules',title:'The board',more:true,
  list:['<b>Elemental</b>Some squares have an element. A card of that element gets +1 on every side. Any other card gets −1.',
    '<b>Same wall</b>With Same on, the board edge counts as X. An X facing the edge plus 1 match is enough.']},
 {tab:'Match',tag:'Other rules',title:'The match',more:true,
  list:['<b>Turn timer</b>Run out of time and a random card is played for you.',
    '<b>Series</b>Best of 3 or 5 with the same cards. Who goes first swaps each match. A draw counts for nobody.']},
 {tab:'Trade',tag:'Other rules',title:'Win cards, lose cards',more:true,
  list:['<b>None</b>A friendly match. No cards change hands.','<b>One</b>The winner takes 1 card they pick.',
    '<b>Diff</b>The winner takes the score gap (up to 5), from cards they flipped.','<b>All</b>The winner takes all 5.',
    '<b>Sweep</b>A rule card: own the whole board to take all 5, whatever the trade. Off with None.']},
 {tab:'Tips',tag:'Tips',title:'How to win more',more:true,
  list:['<b>Hide weak sides</b>Corners show only 2 sides, so a weak card is safe there.',
    '<b>Point strong sides out</b>Face your big numbers at the empty squares, where the next card will land.',
    '<b>Save one</b>Keep a strong card for the last turn.',
    '<b>Drag or tap</b>Tap a card, then a square. Or drag it there.']}
];
let HI=0,hStop=null,howReturn=null;
function renderHow(){
  const h=HOW[HI];
  $('#hTabs').innerHTML=HOW.map((x,i)=>`<button role="tab" id="htab${i}" aria-selected="${i===HI}" aria-controls="hPanel" data-i="${i}">${x.tab}</button>`).join('');
  $('#hPanel').setAttribute('aria-labelledby','htab'+HI);
  if(hStop){hStop();hStop=null}
  // a tab without an example (Tips and the other rules) gives its text the whole panel
  const st=$('#hStage'),still=matchMedia('(prefers-reduced-motion: reduce)').matches;st.innerHTML='';st.style.display=h.ex||h.demo?'':'none';
  if(h.demo)hStop=h.demo(st,still);else if(h.ex)hStop=exDemo(st,h.ex,still);
  $('#hTag').textContent=h.tag;$('#hTitle').textContent=h.title;
  $('#hList').innerHTML=h.list.map(l=>`<li>${l}</li>`).join('');$('#hList').classList.toggle('more',!!h.more);
  // plays the lesson on the real board; not from inside a match, which it would end
  const tr=$('#hTry');tr.hidden=h.tut==null||$('#scr-game').classList.contains('on');
  tr.textContent='▶ '+(h.try||`Try ${h.tab} yourself`);
  $('#hDots').innerHTML=HOW.map((_,i)=>`<i class="${i===HI?'on':''}"></i>`).join('');
  $('#hNext').textContent=HI===HOW.length-1?'Got it':'Next';
  $('#hBack').disabled=$('#hPrev').disabled=HI===0;
  const t=$('#hTabs'),o=t.children[HI];t.scrollLeft=o.offsetLeft-(t.clientWidth-o.offsetWidth)/2;
  textFit();
}
function goHow(i,focusTab){HI=Math.max(0,Math.min(HOW.length-1,i));renderHow();if(focusTab)$('#hTabs [aria-selected="true"]').focus()}
function openHow(i=0){
  const d=$('#how');
  if(!d.classList.contains('on'))howReturn=document.activeElement;
  d.classList.add('on');$$('.screen').forEach(s=>s.inert=true);
  goHow(i,true);
}
function closeHow(){
  const d=$('#how');if(!d.classList.contains('on'))return;
  if(hStop){hStop();hStop=null}
  d.classList.remove('on');
  if(!$('#modal').classList.contains('on'))$$('.screen').forEach(s=>s.inert=false);
  if(howReturn&&howReturn.isConnected&&howReturn.offsetParent)howReturn.focus({preventScroll:true});
  howReturn=null;
}
$('#hTabs').onclick=e=>{const b=e.target.closest('[role="tab"]');if(b){sfx('click');goHow(+b.dataset.i,true)}};
$('#hNext').onclick=()=>{sfx('click');HI===HOW.length-1?closeHow():goHow(HI+1)};
$('#hBack').onclick=$('#hPrev').onclick=()=>{sfx('click');goHow(HI-1)};
$('#hTry').onclick=()=>{sfx('click');const t=HOW[HI].tut;tutStart(t,t>0)};
$('#hClose').onclick=()=>{sfx('click');closeHow()};
$('#how').onclick=e=>{if(e.target.id==='how')closeHow()};
$('#btnHow').onclick=()=>{sfx('click');openHow(0)};
