'use strict';
/* =====================================================================
   HOW TO PLAY
   ===================================================================== */
// a small 3×3 board for the demos. Each cell: 0 = empty, an element key = element square,
// or [id, colour, class, {el, mod}] = a card (optionally sitting on an element square)
function miniBoard(cells,cls=''){
  return`<div class="mini ${cls}">${cells.map(x=>{
    if(!x)return'<div class="c"></div>';
    if(typeof x==='string')return`<div class="c"><span class="eic">${ELEM[x]}</span></div>`;
    const[id,col,c,o={}]=x;
    return`<div class="c ${c||''}">${o.el?`<span class="eic">${ELEM[o.el]}</span>`:''}${cardHTML(id,col,{name:false,mod:o.mod})}</div>`;
  }).join('')}</div>`;
}
// runs timed steps on a loop; returns a stop function
function demoLoop(steps,period){
  const ts=[],cyc=()=>steps.forEach(([t,f])=>ts.push(setTimeout(f,t)));
  cyc();const iv=setInterval(cyc,period);
  return()=>{clearInterval(iv);ts.forEach(clearTimeout)};
}
function flipTo(card,col,axis){card.classList.remove('fx','fy','drop');void card.offsetWidth;card.classList.add(axis);setTimeout(()=>{card.classList.remove('blue','red');card.classList.add(col)},230)}
function setCol(card,col){card.classList.remove('fx','fy','blue','red');card.classList.add(col)}
function dropIn(card){card.style.opacity='';card.classList.remove('drop');void card.offsetWidth;card.classList.add('drop')}
// shared capture demo: the new card (.n) drops, then each wave flips its cells and shows a label
function captureDemo(st,waves){
  const q=c=>st.querySelector(`.c.${c} .card`),n=q('n'),f=st.querySelector('.flag'),all=waves.flatMap(w=>w.cells);
  const steps=[[0,()=>{n.style.opacity=0;all.forEach(([c])=>setCol(q(c),'red'));f.classList.remove('on')}],[600,()=>dropIn(n)]];
  waves.forEach((w,i)=>steps.push([1200+i*900,()=>{f.textContent=w.flag;f.classList.add('on');w.cells.forEach(([c,ax])=>flipTo(q(c),'blue',ax))}]));
  return demoLoop(steps,2600+waves.length*900);
}
const HOW=[
 {tab:'Basics',tag:'Basics',title:'Own the most cards',
  stage:()=>miniBoard([[21,'red'],0,[7,'blue'],0,[28,'blue','new'],0,[18,'red'],0,[0,'blue']]),
  list:['Each player brings <b>5 cards</b>: at most <b>1 of 5★</b> and <b>2 of 4★ or more</b>','Take turns placing one on the <b>3×3 board</b>','Your score is your cards on the board plus the cards in your hand','Board full? The <b>higher score wins</b>']},
 {tab:'Capture',tag:'Capture',title:'Higher side flips',
  stage:()=>`<div class="demo">${cardHTML(22,'blue')}<span class="eq">7 › 6</span><span id="hFlip">${cardHTML(20,'red')}</span></div>`,
  run:st=>{const c=st.querySelector('#hFlip .card');return demoLoop([[900,()=>flipTo(c,'blue','fy')],[2400,()=>setCol(c,'red')]],3000)},
  list:['Every card has 4 numbers: top, right, bottom, left','<b>X</b> means 10','Place a card next to an enemy card','If your touching side is <b>higher</b>, that card turns your colour']},
 {tab:'Same',tag:'Rule · Same',title:'Match two sides',
  stage:()=>miniBoard([0,[16,'red','t'],0,[4,'red','l'],[26,'blue','n'],0,0,0,0])+'<span class="flag"></span>',
  run:st=>captureDemo(st,[{flag:'Same',cells:[['t','fx'],['l','fy']]}]),
  list:['When <b>two or more</b> sides of your card equal the touching sides next to it, those enemy cards flip','It uses the printed numbers (Elemental +1/−1 doesn\'t count)','<b>Example:</b> Lantern Monk (all 5s) lands under a 5 and beside a 5 → both flip']},
 {tab:'Same wall',tag:'Rule · Same wall',title:'The edge counts as X',
  stage:()=>miniBoard([[44,'red','l'],[51,'blue','n'],0,0,0,0,0,0,0],'wall')+'<span class="flag"></span>',
  run:st=>captureDemo(st,[{flag:'Same wall',cells:[['l','fy']]}]),
  list:['Only works with <b>Same</b> turned on','A side facing the board edge counts as <b>X (10)</b> for Same','So one real match + the wall is enough','<b>Example:</b> Astra Starborn\'s top X meets the wall, and its left 9 matches Elder Oak\'s 9 → Elder Oak flips']},
 {tab:'Plus',tag:'Rule · Plus',title:'Equal sums flip',
  stage:()=>miniBoard([0,[18,'red','t'],0,[9,'red','l'],[4,'blue','n'],0,0,0,0])+'<span class="flag"></span>',
  run:st=>captureDemo(st,[{flag:'Plus',cells:[['t','fx'],['l','fy']]}]),
  list:['Add each touching pair: your side + their side','If <b>two or more</b> pairs give the same total, those enemy cards flip','It works even when your numbers are lower','<b>Example:</b> Dusk Moth: top 2 + 6 = 8 and left 2 + 6 = 8 → both flip']},
 {tab:'Combo',tag:'Rule · Combo',title:'Flips keep going',
  stage:()=>miniBoard([0,[16,'red','t'],[11,'red','rt'],[4,'red','l'],[26,'blue','n'],0,0,0,0])+'<span class="flag"></span>',
  run:st=>captureDemo(st,[{flag:'Same',cells:[['t','fx'],['l','fy']]},{flag:'Combo',cells:[['rt','fy']]}]),
  list:['Needs <b>Same</b> or <b>Plus</b> turned on','A card flipped by Same or Plus checks its own neighbours','Any weaker enemy next to it flips too, and it can chain on','<b>Example:</b> Same flips Grave Walker; its right 4 beats Cliff Raptor\'s 3 → Combo']},
 {tab:'Open',tag:'Rule · Open',title:'Play with hands shown',
  stage:()=>`<div class="demo-col"><span class="lbl2" id="hOpenLbl">Open: off</span><div class="hand-row" id="hOpen"></div></div>`,
  run:st=>{
    const row=st.querySelector('#hOpen'),lbl=st.querySelector('#hOpenLbl'),ids=[46,17,1,26,9];
    const backs=()=>{row.innerHTML=ids.map(()=>cardHTML(0,null,{back:true})).join('');lbl.textContent='Open: off — their hand is hidden'};
    const faces=()=>{row.innerHTML=ids.map(id=>cardHTML(id,'red',{name:false,cls:'fy'})).join('');lbl.textContent='Open: on — you see every card'};
    backs();return demoLoop([[0,backs],[1500,faces]],3400)},
  list:['Both hands are face up for the whole match','Turn it off to hide the other player\'s cards','Handy for learning: you can plan around their cards','<b>Example:</b> you can see the CPU still holds Tempest Roc (top 9), so you don\'t leave a weak side open']},
 {tab:'Elemental',tag:'Rule · Elemental',title:'Squares with powers',
  stage:()=>miniBoard([0,0,[3,'blue','new',{el:'water',mod:-1}],0,[10,'blue','new',{el:'fire',mod:1}],0,'thunder',0,0]),
  list:['1 to 4 random squares get an element','A card of the <b>same element</b> gets +1 on every side','Any other card on it gets <b>−1</b>','<b>Example:</b> fire card Ember Sprite on 🔥 gets +1; plain Thornbeetle on 💧 gets −1']},
 {tab:'Sudden death',tag:'Rule · Sudden death',title:'A draw isn\'t the end',
  stage:()=>`<div class="demo-col"><div class="bigscore"><span class="b">5</span> – <span class="r">5</span></div><span class="flag red on" style="position:static">Sudden death</span><span class="lbl2">↻ Round 2 · keep the cards you own</span></div>`,
  list:['If a match ends in a draw, it starts again','Each player keeps the cards they owned at the end','Up to 5 extra rounds','<b>Example:</b> 5–5 → round 2 starts, and each side plays with the cards in their colour']},
 {tab:'Random',tag:'Rule · Random',title:'Dealt, not picked',
  stage:()=>`<div class="demo-col"><span class="lbl2">Your hand, dealt from your collection</span><div class="hand-row" id="hDeal"></div></div>`,
  run:st=>{
    const row=st.querySelector('#hDeal'),pool=[0,1,2,3,4,5,6,7,13];
    const deal=()=>{row.innerHTML='';shuffle(pool.slice()).slice(0,5).forEach((id,i)=>setTimeout(()=>row.insertAdjacentHTML('beforeend',cardHTML(id,'blue',{name:false,cls:'drop'})),i*180))};
    return demoLoop([[0,deal]],3000)},
  list:['Your 5 cards are dealt at random from your collection','You skip the card picker','Good for quick games, and for trying cards you never pick','<b>Example:</b> start a match and 5 random cards from your collection land in your hand']},
 {tab:'Chaos',tag:'Rule · Chaos',title:'The game picks your card',
  stage:()=>`<div class="demo-col"><span class="lbl2">Chaos picks the card you play</span><div class="hand-row chaos" id="hChaos"></div></div>`,
  run:st=>{
    const row=st.querySelector('#hChaos'),ids=[46,17,1,26,9];let last=-1;
    row.innerHTML=ids.map(id=>cardHTML(id,'blue',{name:false})).join('');
    const pick=()=>{let i;do i=Math.floor(Math.random()*ids.length);while(i===last);last=i;
      [...row.children].forEach((c,k)=>c.classList.toggle('forced',k===i))};
    pick();return demoLoop([[0,pick]],1400)},
  list:['Each turn, one card from your hand is picked at random','You <b>must</b> play that card. You only choose the square','A new card is picked every turn, for both players','Every card in your 5 can come up, so pick them well','<b>Example:</b> Chaos picks your weakest card, so you tuck its weak sides against the walls']},
 {tab:'Turn timer',tag:'Rule · Turn timer',title:'Up to 90 seconds a turn',
  stage:()=>`<span class="pill big"><span class="ring" id="hRing"><span>45</span></span><span id="hTmsg">Your turn</span></span>`,
  run:st=>{
    const ring=st.querySelector('#hRing'),num=ring.querySelector('span'),msg=st.querySelector('#hTmsg'),steps=[];
    const set=v=>{num.textContent=v;ring.style.setProperty('--p',v/45*100);ring.style.setProperty('--rc',v<=10?'var(--crit)':v<=20?'var(--warn)':'var(--accent)');msg.textContent=v?'Your turn':'Time\'s up'};
    [45,30,20,15,10,6,3,1,0].forEach((v,i)=>steps.push([i*420,()=>set(v)]));
    return demoLoop(steps,5200)},
  list:['Set the limit in match setup: <b>Off</b>, or <b>10 to 90 seconds</b>','The ring turns orange, then red, as time runs low','At 0, a random card goes to a random empty square','<b>Example:</b> the clock hits 0 → one of your cards is played for you']},
 {tab:'Series',tag:'Match setup · Series',title:'Best of 3 or 5',
  stage:()=>`<div class="demo-col"><span class="lbl2" id="hSerLbl"></span><div class="serlog" id="hSer"><span></span><span></span><span></span></div><div class="bigscore" id="hSerSc"></div></div>`,
  run:st=>{
    const lbl=st.querySelector('#hSerLbl'),chips=[...st.querySelectorAll('#hSer span')],sc=st.querySelector('#hSerSc');
    const score=(b,r)=>sc.innerHTML=`<span class="b">${b}</span> – <span class="r">${r}</span>`;
    // Blue wins 6–4, then a 5–5 draw counts for nobody, then Blue wins 7–3; who goes first swaps each match
    const res=(i,txt,cls)=>{chips[i].textContent=txt;chips[i].className=cls};
    const reset=()=>{chips.forEach((c,i)=>{c.textContent='M'+(i+1);c.className=''});score(0,0);lbl.textContent='Match 1 · Blue goes first'};
    reset();
    return demoLoop([[0,reset],[900,()=>{res(0,'M1 6–4','b');score(1,0)}],[1500,()=>lbl.textContent='Match 2 · Red goes first'],
      [2400,()=>res(1,'M2 5–5','d')],[3000,()=>lbl.textContent='Match 3 · Blue goes first'],[3900,()=>{res(2,'M3 7–3','b');score(2,0);lbl.textContent='Blue wins the series'}]],5800)},
  list:['Pick <b>Single</b>, <b>Best of 3</b> or <b>Best of 5</b> in match setup','Both players keep the <b>same 5 cards</b> all series','Whoever went first goes <b>second</b> in the next match','A draw counts for nobody (with Sudden death on, it replays first)','<b>Most wins</b> takes the series. Equal wins is a tie','It ends early once nobody can catch up','Cards are traded <b>once</b>, at the end','<b>Example:</b> Blue wins 6–4, draws 5–5, then wins 7–3 → Blue takes the series 2–0']},
 {tab:'Trade',tag:'Trade · Collection',title:'Win cards, lose cards',
  stage:()=>`<div class="trade"><div class="pile">${cardHTML(22,'red')}${cardHTML(18,'red')}</div><div class="moving">${cardHTML(28,'red')}</div><div style="width:3.5em"></div><div class="pile">${cardHTML(7,'blue')}${cardHTML(0,'blue')}</div></div>`,
  list:['<b>None</b> — a friendly match','<b>One</b> — the winner takes 1 card they choose','<b>Diff</b> — takes as many as the score gap (max 5), only from cards they flipped','<b>All</b> — takes all 5','<b>Sweep</b> — takes all 5, but only by owning the whole board','You start with weak cards. Everything saves on this device']},
 {tab:'Tips',tag:'Tips',title:'How to win more',
  // Iron Crab (3 top, 3 left) tucks into the corner so only its 7 and 6 face the board
  stage:()=>miniBoard([[22,'blue','n'],0,0,0,0,0,0,0,0])+'<span class="flag"></span>',
  run:st=>{const n=st.querySelector('.c.n .card'),f=st.querySelector('.flag');
    return demoLoop([[0,()=>{n.style.opacity=0;f.classList.remove('on')}],[600,()=>dropIn(n)],[1300,()=>{f.textContent='Weak sides hidden';f.classList.add('on')}]],3600)},
  list:['Keep your <b>strong sides</b> facing empty squares','Corners only show 2 sides: safe spots for weak cards','Save a strong card for the last turn','With <b>Open</b> on, check which enemy cards could flip yours before you place','Tap a card then a square, or drag it there','<b>Example:</b> Iron Crab\'s weak 3s face the walls, so only its 7 and 6 can be attacked']}
];
let HI=0,hStop=null,howReturn=null;
function renderHow(){
  const h=HOW[HI];
  $('#hTabs').innerHTML=HOW.map((x,i)=>`<button role="tab" id="htab${i}" aria-selected="${i===HI}" aria-controls="hPanel" data-i="${i}">${x.tab}</button>`).join('');
  $('#hPanel').setAttribute('aria-labelledby','htab'+HI);
  if(hStop){hStop();hStop=null}
  // a tab without an example (Tips) gives its text the whole panel
  const st=$('#hStage');st.innerHTML=h.stage?h.stage():'';st.style.display=h.stage?'':'none';
  if(h.run&&!matchMedia('(prefers-reduced-motion: reduce)').matches)hStop=h.run(st);
  $('#hTag').textContent=h.tag;$('#hTitle').textContent=h.title;
  $('#hList').innerHTML=h.list.map(l=>`<li>${l}</li>`).join('');
  $('#hDots').innerHTML=HOW.map((_,i)=>`<i class="${i===HI?'on':''}"></i>`).join('');
  $('#hNext').textContent=HI===HOW.length-1?'Got it':'Next';
  $('#hBack').disabled=$('#hPrev').disabled=HI===0;
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
$('#hBack').onclick=$('#hPrev').onclick=()=>{sfx('click');goHow(HI-1)};
$('#hClose').onclick=()=>{sfx('click');closeHow()};
$('#how').onclick=e=>{if(e.target.id==='how')closeHow()};
$('#btnHow').onclick=()=>{sfx('click');openHow(0)};
