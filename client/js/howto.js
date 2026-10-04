'use strict';
/* =====================================================================
   HOW TO PLAY  (Basics, Same, Plus, Combo, and the other rules in a list)
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
// plays the scenes on a loop; with reduced motion, shows the first one finished
function exDemo(st,scenes,still){
  const steps=[],q=k=>st.querySelector(`[data-k="${k}"]`);let t=0,first=0;
  scenes.forEach((sc,i)=>{
    steps.push([t,()=>{st.innerHTML=`<div class="ex-wrap"><span class="ex-lbl">${sc.label}</span>${exBoard(sc)}<div class="ex-cap"></div></div>`}]);
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
const EX_SAME={rows:2,cols:2,cards:{'0,1':[35,'red'],'1,0':[9,'red']},at:'1,1'};
const EX_PLUS={rows:2,cols:2,cards:{'0,1':[1,'red'],'1,0':[0,'red']},at:'1,1'};
const EX_CAP={rows:1,cols:2,cards:{'0,1':[20,'red']},at:'0,0'};
// tut: the tutorial lesson its button plays (tutorial.js); Basics plays all of it
const HOW=[
 {tab:'Basics',tag:'Basics',title:'Own the most cards',tut:0,try:'Play the tutorial',
  ex:[{...EX_CAP,label:'7 meets 6',card:22,waves:[{pairs:[['0,0',1,'7 › 6',1]],cap:'Higher side flips it'}]},
      {...EX_CAP,label:'4 meets 6',card:0,waves:[{pairs:[['0,0',1,'4 ‹ 6',0]],cap:'Lower: nothing happens',bad:1}]}],
  list:['Each player brings <b>5 cards</b>: at most <b>1 of 5★</b> and <b>2 of 4★ or more</b>','Take turns placing one card on the <b>3×3 board</b>',
    'Where your card touches an enemy card, compare the two numbers. If yours is <b>higher</b>, their card turns your colour. <b>X</b> = 10',
    'Board full? Whoever owns <b>more cards</b> wins (cards left in your hand count too)'],
  extra:'<h4>Tips</h4><ul><li>Point your <b>strong sides</b> at empty squares</li><li><b>Corners</b> hide 2 sides: a safe spot for a weak card</li><li>Save a strong card for the last turn</li><li>Tap a card then a square, or drag it there</li></ul>'},
 {tab:'Same',tag:'Rule · Same',title:'Two matches flip both',tut:1,
  ex:[{...EX_SAME,label:'Seraph Warden: top 8, left 6',card:45,waves:[{pairs:[['1,1',0,'8 = 8',1],['1,1',3,'6 = 6',1]],cap:'2 matches: Same!'}]},
      {...EX_SAME,label:'Gale Harpy: top 8, left 4',card:34,waves:[{pairs:[['1,1',0,'8 = 8',1],['1,1',3,'4 ≠ 6',0]],cap:'Only 1 match: nothing',bad:1}]}],
  list:['Check every side your card touches','If <b>2 or more</b> are the <b>same number</b> as the side they touch, all those enemy cards flip',
    'The two matches can be <b>different numbers</b>: 8 = 8 and 6 = 6 counts','Equal is enough here. Normal captures need higher','Only 1 match? Nothing happens',
    '<b>Same wall</b> (an extra rule): the board edge counts as X. So an X facing the edge plus 1 match is enough']},
 {tab:'Plus',tag:'Rule · Plus',title:'Two equal totals flip both',tut:2,
  ex:[{...EX_PLUS,label:'Bog Newt: top 2, left 1',card:2,waves:[{pairs:[['1,1',0,'2 + 3 = 5',1],['1,1',3,'1 + 4 = 5',1]],cap:'5 and 5: Plus!'}]},
      {...EX_PLUS,label:'Candlewisp: top 1, left 4',card:6,waves:[{pairs:[['1,1',0,'1 + 3 = 4',0],['1,1',3,'4 + 4 = 8',0]],cap:'4 and 8: nothing',bad:1}]}],
  list:['For each side your card touches, add the two numbers: <b>yours + theirs</b>','If <b>2 or more</b> totals are the <b>same</b>, all those enemy cards flip',
    'The pairs can use <b>different numbers</b>: 2 + 3 and 1 + 4 both make 5','Low numbers work too: a 1 can flip a 4 this way','Different totals? Nothing happens']},
 {tab:'Combo',tag:'Rule · Combo',title:'Flips that keep going',tut:3,
  ex:[{label:'Same or Plus starts it',rows:2,cols:3,cards:{'0,0':[0,'red'],'0,1':[35,'red'],'0,2':[11,'red'],'1,0':[9,'red']},at:'1,1',card:45,waves:[
      {pairs:[['1,1',0,'8 = 8',1],['1,1',3,'6 = 6',1]],cap:'Same!'},
      {pairs:[['0,1',1,'4 › 3',1],['1,0',0,'3 › 2',1]],cap:'Combo: 4 cards!'}]}],
  list:['Works with <b>Same</b> or <b>Plus</b> on','A card flipped by Same or Plus attacks its own neighbours','Normal rule: the <b>higher</b> side flips them','Those can flip more, and on and on']},
 {tab:'More',tag:'Other rules',title:'The rest, in a line each',more:true,
  list:['<b>Open</b>Both hands are face up, so you can plan around their cards.',
    '<b>Elemental</b>Some squares have an element. A card of that element gets +1 on every side. Any other card gets −1.',
    '<b>Sudden death</b>A draw restarts the match. Each player keeps the cards they owned at the end.',
    '<b>Random</b>Your 5 cards are dealt from your collection.',
    '<b>Chaos</b>Each turn the game picks which card you must play. You only pick the square.',
    '<b>Turn timer</b>Run out of time and a random card is played for you.',
    '<b>Series</b>Best of 3 or 5 with the same cards. Who goes first swaps each match. A draw counts for nobody.',
    '<b>Trade</b>The winner takes cards. <b>One</b>: 1 they pick. <b>Diff</b>: the score gap, from cards they flipped. <b>All</b>: all 5. <b>Sweep</b>: all 5, only if they own the whole board.']}
];
let HI=0,hStop=null,howReturn=null;
function renderHow(){
  const h=HOW[HI];
  $('#hTabs').innerHTML=HOW.map((x,i)=>`<button role="tab" id="htab${i}" aria-selected="${i===HI}" aria-controls="hPanel" data-i="${i}">${x.tab}</button>`).join('');
  $('#hPanel').setAttribute('aria-labelledby','htab'+HI);
  if(hStop){hStop();hStop=null}
  // a tab without an example (More) gives its text the whole panel
  const st=$('#hStage');st.innerHTML='';st.style.display=h.ex?'':'none';
  if(h.ex)hStop=exDemo(st,h.ex,matchMedia('(prefers-reduced-motion: reduce)').matches);
  $('#hTag').textContent=h.tag;$('#hTitle').textContent=h.title;
  $('#hList').innerHTML=h.list.map(l=>`<li>${l}</li>`).join('');$('#hList').classList.toggle('more',!!h.more);
  $('#hExtra').innerHTML=h.extra||'';
  // plays the lesson on the real board; not from inside a match, which it would end
  const tr=$('#hTry');tr.hidden=h.tut==null||$('#scr-game').classList.contains('on');
  tr.textContent='▶ '+(h.try||`Try ${h.tab} yourself`);
  $('#hDots').innerHTML=HOW.map((_,i)=>`<i class="${i===HI?'on':''}"></i>`).join('');
  $('#hNext').textContent=HI===HOW.length-1?'Got it':'Next';
  $('#hBack').disabled=HI===0;
  const t=$('#hTabs'),o=t.children[HI];t.scrollLeft=o.offsetLeft-(t.clientWidth-o.offsetWidth)/2;
  $('.htext').scrollTop=0;
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
$('#hBack').onclick=()=>{sfx('click');goHow(HI-1)};
$('#hTry').onclick=()=>{sfx('click');const t=HOW[HI].tut;tutStart(t,t>0)};
$('#hClose').onclick=()=>{sfx('click');closeHow()};
$('#how').onclick=e=>{if(e.target.id==='how')closeHow()};
$('#btnHow').onclick=()=>{sfx('click');openHow(0)};
