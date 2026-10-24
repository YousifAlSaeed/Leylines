'use strict';
/* =====================================================================
   GAME RENDERING & INPUT
   ===================================================================== */
let CELLS=[];
function buildBoard(){
  const b=$('#board');b.innerHTML='';CELLS=[];
  for(let i=0;i<9;i++){
    const c=document.createElement('div');c.className='cell';c.dataset.i=i;c.setAttribute('role','button');
    c.onclick=()=>{if(G&&G.sel!=null&&canAct(G.st.turn)&&G.st.b[i]<0){requestMove(G.sel,i)}};
    b.append(c);CELLS.push(c);
  }
}
function renderGame(){renderBoard();renderHands();renderHud()}
function renderBoard(){
  const st=G.st;
  for(let i=0;i<9;i++){
    const el=st.el[i]?`<div class="eicon">${ELEM[st.el[i]]}</div>`:'';
    CELLS[i].innerHTML=st.b[i]>=0?el+cardHTML(st.b[i],colorOf(st.o[i]),{mod:st.m[i]}):el;
    // in the tutorial only the lesson's square lights up
    const hot=G.sel!=null&&st.b[i]<0&&canAct(st.turn)&&(!G.tut||i===TUT[G.tut.i].cell);
    CELLS[i].classList.toggle('hot',hot);CELLS[i].classList.toggle('tut-target',hot&&!!G.tut);
    CELLS[i].classList.remove('over');
    CELLS[i].setAttribute('aria-disabled',!hot);
    CELLS[i].setAttribute('aria-label',`Row ${Math.floor(i/3)+1}, column ${i%3+1}: `+
      (st.b[i]>=0?`${CARDS[st.b[i]].name}, ${colorOf(st.o[i])}`:'empty')+(st.el[i]?`, ${st.el[i]} square`:''));
  }
  if(G.tut)tutSync();
}
function renderHands(){
  const st=G.st,bot=G.bottom,top=1-bot;
  for(const[p,el] of [[top,$('#handTop')],[bot,$('#handBot')]]){
    const hide=!viewerSees(p),can=canAct(p),chaos=G.forced!=null&&p===st.turn&&!G.over;
    // with Chaos only the picked card can be played; it's marked in either hand
    el.classList.toggle('chaos',chaos);
    el.innerHTML=st.h[p].map((id,i)=>{
      const ok=can&&(G.forced==null||i===G.forced),fc=(chaos&&i===G.forced?'forced '+(G.tut&&G.sel==null?'tut-pulse ':''):'')+(faceUp(p,i)?'shown ':'');
      return hide&&!faceUp(p,i)
      ?cardHTML(id,null,{back:true,cls:fc})
      :cardHTML(id,colorOf(p),{cls:fc+(ok?'play ':'')+(ok&&G.sel===i?'sel':''),
        attrs:`data-p="${p}" data-i="${i}"`+(ok?` role="button" aria-pressed="${G.sel===i}" aria-label="${esc(cardLabel(id))}${chaos&&i===G.forced?', picked by Chaos':''}${faceUp(p,i)?', face up for both players':''}"`:'')})}).join('');
    if(can)el.querySelectorAll('.card.play').forEach(c=>c.addEventListener('pointerdown',onHandDown));
  }
  // in Couch the active player is shown at the bottom side's highlight
}
function setScores(sc){
  // a score that changed pops (CSS), so a flip is easy to notice
  const put=(el,v)=>{v=String(v);if(el.textContent===v)return;const was=el.textContent;el.textContent=v;
    if(was){el.classList.remove('pop');void el.offsetWidth;el.classList.add('pop')}};
  put($('#scBot'),sc[G.bottom]);put($('#scTop'),sc[1-G.bottom]);
}
function renderHud(){
  const st=G.st,bot=G.bottom;
  const lab=p=>esc(G.names[p])+(G.mode==='online'?`<small class="tag">${p===0?'HOST':'GUEST'}</small>`:'');
  $('#nameBot').innerHTML=lab(bot);$('#nameTop').innerHTML=lab(1-bot);
  const ini=p=>(String(G.names[p]||'?').trim()[0]||'?').toUpperCase();
  // your avatar card (and an online opponent's) instead of the initial
  const av=p=>G.mode==='local'?null:p===G.me?myAv():G.mode==='online'?NET.oppAv:null;
  for(const[el,p]of[[$('#avBot'),bot],[$('#avTop'),1-bot]]){const a=av(p);el.textContent=a!=null?CARDS[a].art:ini(p);el.classList.toggle('art',a!=null)}
  setScores([score(st,0),score(st,1)]);
  $('#sideBot').classList.toggle('active',!G.over&&st.turn===bot);
  $('#sideTop').classList.toggle('active',!G.over&&st.turn!==bot);
  paintClocks();
  let msg;
  if(G.tut)msg=G.over?'Well played!':'Your turn';
  else if(G.over)msg='Game over';
  else if(G.mode==='local')msg=(st.turn===0?COL_NAME[myCol()]:'Red')+"'s turn";
  else if(st.turn===G.me)msg='Your turn';
  else msg=G.mode==='ai'?'CPU is thinking…':`${oppName()}'s turn`;
  $('#turnMsg').textContent=msg; // read out by screen readers
  $('#turnTxt').textContent=msg; // the pill at the top in landscape
  // whose turn it is: a tag next to that player's name
  const tag=p=>G.over||st.turn!==p?'':isHuman(p)?'Your turn':G.mode==='ai'?'Thinking…':'Their turn';
  for(const[el,p]of[[$('#tagBot'),bot],[$('#tagTop'),1-bot]]){const t=tag(p);if(el.textContent!==t){el.textContent=t;el.classList.toggle('on',!!t)}}
  const R=G.rules;
  let chips=rulesOn(R,G.mode==='local'?'none':G.trade).map(r=>`<span>${r[1]}</span>`).join('');
  if(timedOn(R))chips+=isBank(R)?`<span>⏱ ${fmtLeft(R.bank)} bank</span>`:`<span>⏱ ${R.timer}s</span>`;
  if(G.mode!=='local'&&G.trade!=='none')chips+=`<span>Trade: ${TRADES.find(t=>t[0]===G.trade)[1]}</span>`;
  if(G.bo>1&&G.ser)chips+=`<span class="ser">Best of ${G.bo} · Match ${G.ser.n} · ${G.ser.wins[G.bottom]}–${G.ser.wins[1-G.bottom]}</span>`;
  if(G.sd)chips+=`<span class="sd">Sudden death ${G.sd}</span>`;
  if(G.wb)chips+=`<span>${wbName(G.wb)}</span>`;
  if(G.daily)chips+=dailyChip();
  // the tutorial's lessons, done ones ticked
  if(G.tut)chips=G.tut.single?`<span class="tut-on">Try it · ${TUT[G.tut.i].name}</span>`:
    TUT.map((l,i)=>`<span class="${i===G.tut.i?'tut-on':i<G.tut.i?'tut-done':''}">${i<G.tut.i?'✓ ':''}${l.name}</span>`).join('');
  if($('#ruleBar').innerHTML!==chips){$('#ruleBar').innerHTML=chips;fitGame()}
  updSnd();emoteSync();
}

let drag=null;
function onHandDown(e){
  const el=e.currentTarget,p=+el.dataset.p,hi=+el.dataset.i;
  if(!canAct(p))return;
  e.preventDefault();
  if(drag)endDrag({},true); // a drag still open (a second finger): finish it first, so its card can't be left behind
  drag={p,hi,el,x:e.clientX,y:e.clientY,moved:false,ghost:null,over:null,pid:e.pointerId};
}
window.addEventListener('pointermove',e=>{
  if(!drag||otherPointer(e,drag))return;
  if(!drag.moved){
    if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<8)return;
    drag.moved=true;
    sfx('hand_pick');
    const r=drag.el.getBoundingClientRect();
    const g=drag.el.cloneNode(true);g.classList.remove('sel','play');g.classList.add('ghost');
    g.style.fontSize='calc(var(--cell) * var(--ui) / 5)'; // the ghost lives on <body>, outside the zoomed screen
    ghostSweep();document.body.append(g);drag.ghost=g;drag.el.classList.add('dragging');
    // dragging picks this card, so drop the highlight from the one picked before
    $$('.hand .card.sel').forEach(c=>c!==drag.el&&c.classList.remove('sel'));
    G.sel=drag.hi;CELLS.forEach((c,i)=>c.classList.toggle('hot',G.st.b[i]<0&&(!G.tut||i===TUT[G.tut.i].cell)));
  }
  drag.ghost.style.left=e.clientX+'px';drag.ghost.style.top=e.clientY+'px';
  const t=cellAt(e.clientX,e.clientY);
  if(t!==drag.over){drag.over!=null&&CELLS[drag.over].classList.remove('over');drag.over=t;t!=null&&CELLS[t].classList.add('over')}
},{passive:true});
function cellAt(x,y){
  for(let i=0;i<9;i++){const r=CELLS[i].getBoundingClientRect();if(x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom)return G.st.b[i]<0?i:null}
  return null;
}
function endDrag(e,cancel){
  if(!drag||otherPointer(e,drag))return; // another finger lifting doesn't end this drag
  const d=drag;drag=null;
  if(d.ghost)d.ghost.remove();
  ghostSweep();
  if(d.moved){
    d.el.classList.remove('dragging');
    const t=cancel?null:cellAt(e.clientX,e.clientY);
    if(t!=null&&canAct(d.p)){requestMove(d.hi,t);return}
    renderGame();return;
  }
  if(cancel)return;
  const deselect=G.forced==null&&G.sel===d.hi;
  G.sel=G.forced!=null?G.forced:deselect?null:d.hi;sfx(deselect?'click':'hand_pick');
  renderHands();renderBoard();
}
window.addEventListener('pointerup',e=>endDrag(e,false));
window.addEventListener('pointercancel',e=>endDrag(e,true));

/* ---------- responsive sizing ---------- */
let UI=1; // current --ui zoom; rects from getBoundingClientRect are in window pixels, so divide by it before reusing them as CSS sizes inside a screen
// iPhone home-screen app quirks (see .ios-bar / .ios-app / .ios-short in base.css). On an iPhone 16 Pro Max the screen is
// 956 tall and the page 894, short by exactly the clock's strip (62). With the opaque status bar (index.html) the page
// starts below that strip (no top safe area). An app added before then runs under the clock (safe-area top 62) and
// stops 62 short of the bottom.
function iosFlags(){
  const app=navigator.standalone===true,top=parseFloat(getComputedStyle($('#safe')).paddingTop)||0;
  const full=innerWidth<innerHeight?Math.max(screen.width,screen.height):Math.min(screen.width,screen.height),gap=full-innerHeight;
  const de=document.documentElement.classList;iosFlags.last={app,top,gap};
  de.toggle('ios-bar',app&&top===0&&gap>0&&gap<=80);de.toggle('ios-app',app&&top>0);de.toggle('ios-short',app&&top>0&&gap>0&&gap<=top+8);
}
const PCMQ=matchMedia('(hover:hover) and (pointer:fine)');PCMQ.addEventListener('change',()=>layout());
// the smallest a board square and a hand card get. A short screen (a small phone in its browser, or one held sideways)
// goes a little smaller still and gets a slimmer hud and name rows (body.gshort, game.css), so nothing runs off the bottom
let GMIN={cell:48,hc:40};
function layout(){
  iosFlags();
  const vh=innerHeight;
  // UI scale: 1 up to a ~1440x900 window, then grows with whichever side is tighter (2K ≈ 1.45, 4K ≈ 2.2)
  const ui=Math.min(2.4,Math.max(1,Math.floor(Math.min(innerWidth/1440,vh/900)*20)/20));
  UI=ui;document.documentElement.style.setProperty('--ui',ui);
  // everything below is in the zoomed screen's own pixels. The notch and home bar (safe areas) make the game
  // screen's padding bigger than the usual 6px top/bottom and 10px sides; the extra comes off the space
  const pad=getComputedStyle($('#scr-game')),p=k=>parseFloat(pad['padding'+k])||0;
  const W=innerWidth/ui-Math.max(0,p('Left')-10)-Math.max(0,p('Right')-10);
  const H=vh/ui-Math.max(0,p('Top')-6)-Math.max(0,p('Bottom')-6),land=W>H*1.08,pc=land&&PCMQ.matches&&H>=520;
  // a wide window with a mouse gets the PC layout (like 4-player chess: hands above and below, each player in a corner);
  // phones and tablets turned sideways keep the hands beside the board, and so does a window too short for the PC one
  document.body.classList.toggle('land',land&&!pc);document.body.classList.toggle('pc',pc);
  const short=!pc&&(land?H<360:H<540),hud=short?44:52;
  document.body.classList.toggle('gshort',short);GMIN=short?{cell:40,hc:32}:{cell:48,hc:40};
  let cell,hc;
  if(!land){
    // hud 52 (44 when short), timer bar + rule bar 30, two player strips 46 (40 + a 6px gap; 38 when short), gaps 8, screen padding 12,
    // spare 4; the board is 3 cells of 1.2 × --cell tall plus 26px of gaps, padding and border
    const extra=hud+30+2*(short?38:46)+8+12+4+26;
    if(short){
      // the board and the two hands share the height, a hand card .7 of a square (3.6 + 2 × 1.2 × .7 = 5.28 squares)
      cell=Math.min((W-40)/3,(H-extra-12)/5.28,190);
      hc=Math.max(GMIN.hc,Math.min((W-36)/5,120,cell*.7));
      cell=Math.min(cell,(H-extra-2*(hc*1.2+6))/3.6);
    }else{
      hc=Math.min((W-36)/5,120);
      cell=Math.min((W-40)/3,(H-extra-2*(hc*1.2+6))/3.6,190);
      hc=Math.min(hc,cell*.7);
      cell=Math.min((W-40)/3,(H-extra-2*(hc*1.2+6))/3.6,190);
    }
  }else if(pc){
    // the board (3.6 cells + 26) with a hand row above and below (1.2 card heights + 6, and an 8px gap each),
    // the cards sized so 5 of them span the board; a corner of at least 210px each side for the player
    const avail=H-52-10-22-24;
    cell=Math.min((avail-26-2*14)/(3.6+2*1.2*.6),(W-40-2*210)/3,200);
    hc=(cell*3+6)/5;
  }else{
    const avail=H-hud-10-22-24; // hud + timer bar + rulebar + padding
    // (short: the board's 26px of gaps and padding counted exactly, which avail/3.7 only gets right on big screens)
    cell=Math.min(avail/3.7,short?(avail-26)/3.6:1e9,(W-80-2*180)/3.25,200);
    // each column fits beside the board: the name row with its big score (84 + a 6px gap + spare; 50 when short),
    // then the stacked hand: 3.52 card widths tall, plus .32 for the room the stack opens up around a picked card
    hc=Math.min(cell*.9,(Math.min(avail,cell*3.6+26)-(short?62:96))/3.84);
  }
  cell=Math.max(GMIN.cell,Math.floor(cell));hc=Math.max(GMIN.hc,Math.floor(hc));
  const rs=document.documentElement.style;rs.setProperty('--cell',cell+'px');rs.setProperty('--hc',hc+'px');
  rs.setProperty('--t',Math.ceil(hc*1.2+6)+'px'); // PC: a hand row's height, and so a corner's
  // the emote button (36 + a 10px gap) hangs off the left of the player rows; when the space beside them is
  // smaller than that, the rows start further in by the difference (screen padding is 10px a side)
  const row=Math.min(W-20,hc*5+24);
  rs.setProperty('--pin',Math.ceil(Math.max(0,46-(W-20-row)/2))+'px');
  document.body.classList.toggle('nohn',hc<88);
  document.body.classList.toggle('nobn',cell<82);
  fitGame();
}
// the sizes above are worked out ahead of time; if the game still runs past the bottom (say the rule bar wrapped
// onto two lines), shrink the board and hands until it fits
function fitGame(){
  const sg=$('#scr-game');if(!sg.classList.contains('on'))return;
  sg.classList.remove('gscroll');sg.scrollTop=0;
  const rs=document.documentElement.style,limit=innerHeight-parseFloat(getComputedStyle(sg).paddingBottom)*UI;
  // on PC the sides are laid out by their parts (display: contents), so measure the hands
  const measure=()=>{const parts=(document.body.classList.contains('pc')?[$('#handTop'),$('#board'),$('#handBot')]:[$('#sideTop'),$('#board'),$('#sideBot')]).map(e=>e.getBoundingClientRect());
    const top=Math.min(...parts.map(r=>r.top)),bot=Math.max(...parts.map(r=>r.bottom));return {span:bot-top,over:bot-limit}};
  for(let k=0;k<3;k++){
    const {span,over}=measure();
    if(over<=1)return;
    const f=1-over/span,cell=parseFloat(rs.getPropertyValue('--cell')),hc=parseFloat(rs.getPropertyValue('--hc'));
    if(cell<=GMIN.cell&&hc<=GMIN.hc)break;
    rs.setProperty('--cell',Math.max(GMIN.cell,Math.floor(cell*f))+'px');rs.setProperty('--hc',Math.max(GMIN.hc,Math.floor(hc*f))+'px');
    rs.setProperty('--t',Math.ceil(Math.max(GMIN.hc,Math.floor(hc*f))*1.2+6)+'px');
  }
  // still too tall with the smallest cards (a tiny phone, zoomed in): the match scrolls a little instead of cutting off the bottom
  if(measure().over>1)sg.classList.add('gscroll');
}
window.addEventListener('resize',layout);
// an iPhone home-screen app can come up full height and only then shrink (no resize event), so look again a few times,
// and whenever it comes back to the front
window.visualViewport?.addEventListener('resize',layout);addEventListener('pageshow',layout);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)layout()});
for(const t of [300,1000,2500])setTimeout(layout,t);
