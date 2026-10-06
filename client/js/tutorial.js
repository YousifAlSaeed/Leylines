'use strict';
/* =====================================================================
   TUTORIAL  (4 one-move lessons on the real board: capture, Same, Plus, Combo)
   The lessons live in data.js (TUT). A new player is offered it on first launch
   (main.js); How to play replays it whole, or one lesson at a time ("Try it").
   Finishing it the first time gives a pack.
   SAVE.tut: 0 = not offered yet, 1 = offered (skipped, or started once), 2 = finished
   ===================================================================== */
const TUT_OFF={open:false,same:false,sameWall:false,plus:false,combo:false,elemental:false,suddenDeath:false,random:false,chaos:false,timer:0};
const TT=[]; // the number tags on the board: {el, c: square, d: side}
// lesson i; single = only this lesson, from a "Try it" button in How to play
function tutStart(i,single=false){
  closeModal();closeHow();tutClear();
  const L=TUT[i];
  G=baseMatch('ai',{rules:{...TUT_OFF,...L.rules},trade:'none',bo:1,names:['You','CPU'],tut:{i,single,state:'pick',prev:[]}});
  G.st=newState(L.hand,[],0,Array(9).fill(null));
  for(const[c,id]of L.board){G.st.b[c]=id;G.st.o[c]=1}
  G.first=0;G.ser={n:1,first:0,wins:[0,0],log:[]};
  // only the lesson's card can be picked (the same marking as Chaos)
  G.forced=L.pick;
  document.body.classList.add('tut');$('#tutSkip').textContent=single?'Close':'Skip';
  show('game');buildBoard();renderGame();tutCoach();
}
// the coach's bubble: what to do now
function tutCoach(nudge){
  const t=G&&G.tut;if(!t)return;
  const L=TUT[t.i],last=t.i===TUT.length-1,c=$('#tutCoach'),n=$('#tutNext');
  const txt=t.state==='done'?L.after:t.state==='moving'?'Watch the numbers…':nudge?'Not there. Use the <b>glowing</b> square.':t.state==='place'?L.place:L.intro;
  c.innerHTML=`<div class="tc-av" aria-hidden="true">🦉</div><div><div class="tc-k">${t.single?'Try it':`Lesson ${t.i+1} of ${TUT.length}`} · ${L.name}</div><p>${txt}</p></div>`;
  c.hidden=false;c.classList.toggle('dim',t.state==='moving');
  c.classList.remove('in','shake');void c.offsetWidth;c.classList.add(nudge?'shake':'in');
  // after the move, the next button takes the place of your hand
  n.hidden=t.state!=='done';n.textContent=t.single?'Back to How to play':last?'Finish':'Next lesson ›';
  document.body.classList.toggle('tut-fin',t.state==='done');
  tutPlace();
  if(t.state==='done')n.focus({preventScroll:true});
}
// the bubble sits over the CPU's (empty) hand, the next button over yours. They live outside the screen, so
// rects from getBoundingClientRect are divided by the --ui zoom (game.js) before use
function tutPlace(){
  if(!(G&&G.tut))return;
  const c=$('#tutCoach'),n=$('#tutNext'),land=document.body.classList.contains('land'),W=innerWidth/UI;
  const r=(land?$('#sideTop'):$('#handTop')).getBoundingClientRect(),w=land?Math.max(240,r.width/UI):Math.min(W-24,440);
  c.style.width=w+'px';
  c.style.left=Math.max(12,Math.min(W-w-12,(r.left+r.width/2)/UI-w/2))+'px';
  c.style.top=(land?(r.top+r.height*.12)/UI:Math.max(r.top/UI-4,58))+'px';
  if(!n.hidden){
    // sized to its text; the CSS translate centres it on the hand
    const h=$('#handBot').getBoundingClientRect();
    n.style.left=(h.left+h.width/2)/UI+'px';n.style.top=(h.top+h.height/2)/UI+'px';
  }
  TT.forEach(tagPos);
}
addEventListener('resize',()=>requestAnimationFrame(tutPlace));
// match.js and game.js call these while a lesson is on
function tutSync(){
  const t=G.tut;
  if(t.state==='pick'&&G.sel!=null){t.state='place';tutCoach()}
}
// only the glowing square counts
function tutMove(cell){
  const t=G.tut;
  if(cell!==TUT[t.i].cell){sfx('click');renderGame();tutCoach(true);return false}
  t.state='moving';tutCoach();return true;
}
// one wave of flips (an event from play()): a tag on each edge that flipped a card, saying how the two numbers compare
function tutWave(e,cell){
  const t=G.tut,st=G.st,side=(c,d)=>CARDS[st.b[c]].s[d];
  TT.forEach(g=>g.el.classList.add('old')); // the wave before fades; this wave's tags all stay bright
  for(const n of e.cells){
    // Combo flips come from a card flipped in the wave before; everything else from the card just placed
    const from=e.t==='combo'?t.prev.find(c=>{const d=NB[c].indexOf(n);return d>=0&&side(c,d)>side(n,(d+2)&3)}):cell;
    if(from==null)continue;
    const d=NB[from].indexOf(n),a=side(from,d),b=side(n,(d+2)&3);
    tutTag(from,d,e.t==='same'?`${fmt(a)} = ${fmt(b)}`:e.t==='plus'?`${a} + ${b} = ${a+b}`:`${fmt(a)} › ${fmt(b)}`);
  }
  if(e.t!=='basic')t.prev=e.cells;
}
function tutTag(c,d,txt){
  const el=document.createElement('div');el.className='tut-tag';el.textContent=txt;el.setAttribute('aria-hidden','true');
  document.body.append(el);const g={el,c,d};TT.push(g);tagPos(g);
  requestAnimationFrame(()=>el.classList.add('on'));
  CELLS[c].querySelector('.n'+d)?.classList.add('hl');CELLS[NB[c][d]].querySelector('.n'+((d+2)&3))?.classList.add('hl');
}
// on the edge between square c and its neighbour on side d
function tagPos({el,c,d}){
  const a=CELLS[c].getBoundingClientRect(),b=CELLS[NB[c][d]].getBoundingClientRect();
  const x=d===1?(a.right+b.left)/2:d===3?(a.left+b.right)/2:a.left+a.width/2;
  const y=d===0?(a.top+b.bottom)/2:d===2?(a.bottom+b.top)/2:a.top+a.height/2;
  el.style.left=x/UI+'px';el.style.top=y/UI+'px';
}
// the lesson's move has played out
function tutMoved(){
  G.tut.state='done';G.over=true;
  renderHud();renderHands();tutCoach();sfx('win');
}
// leaving the game screen ends the lesson (menu.js show)
function tutClear(){
  TT.forEach(g=>g.el.remove());TT.length=0;
  $('#tutCoach').hidden=true;$('#tutNext').hidden=true;
  document.body.classList.remove('tut','tut-fin');
}
function tutSeen(){if(!SAVE.tut){SAVE.tut=1;save()}}
function tutLeave(){const i=G.tut.i;show('menu');openHow(Math.max(0,HOW.findIndex(h=>h.tut===i)))}
function tutSkip(){
  const t=G&&G.tut;if(!t)return;
  if(t.single){tutLeave();return}
  modal(`<h2>Skip the tutorial?</h2><p>You can play it any time from <b>How to play</b>.${SAVE.tut<2?' Your free pack waits until you finish it.':''}</p>`,
    [{label:'Keep learning',esc:true},{label:'Skip',cls:'primary',fn:()=>{tutSeen();show('menu')}}]);
}
function tutDone(){
  const T=PACKS[TUT_PACK],reward=SAVE.tut<2;
  if(reward){SAVE.packs.push({t:TUT_PACK,tut:1});SAVE.tut=2;save()}
  show('menu');
  modal(`<div class="kick">Tutorial complete</div><h2>You're ready!</h2>`+
    (reward?`<div class="tut-pk">${miniPack(TUT_PACK,'big ready')}</div>`+dailyBox(`<span class="pf-pack">🎁 ${T.name} pack</span>`,'The other rules (Elemental, Chaos and more) are in <b>How to play</b>.')
      :'<p>The other rules (Elemental, Chaos and more) are in <b>How to play</b>.</p>'),
    reward?[{label:'Later',esc:true},{label:'Open pack',cls:'primary',fn:()=>{const k=SAVE.packs.findIndex(p=>p.tut);if(k>=0)openPack(k)}}]
      :[{label:'OK',cls:'primary',esc:true}]);
}
$('#tutNext').onclick=()=>{
  sfx('click');const t=G&&G.tut;if(!t)return;
  if(t.single)tutLeave();else if(t.i<TUT.length-1)tutStart(t.i+1);else tutDone();
};
$('#tutSkip').onclick=()=>{sfx('click');tutSkip()};

/* ---------- first launch ---------- */
// closing the app during a lesson offers it again next time; only Skip (or finishing) stops it
function tutWelcome(){
  const T=PACKS[TUT_PACK];
  modal(`<div class="kick">Welcome to Leylines</div><h2>Learn to play in 2 minutes</h2><p>4 quick lessons on the real board: capture, Same, Plus and Combo.</p>`+
    `<div class="tut-pk">${miniPack(TUT_PACK,'big ready')}</div>`+dailyBox(`<span class="pf-pack">🎁 ${T.name} pack</span>`,'Finish all 4 to get it.'),
    [{label:'Skip tutorial',keep:true,fn:tutWelcomeSkip},{label:'Start',cls:'primary',fn:()=>tutStart(0)}]);
}
function tutWelcomeSkip(){
  modal('<h2>Skip the tutorial?</h2><p>You can play it any time from <b>How to play</b>. Your free pack waits until you finish it.</p>',
    [{label:'Back',esc:true,fn:tutWelcome},{label:'Skip',cls:'primary',fn:tutSeen}]);
}
