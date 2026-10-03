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
    const hot=G.sel!=null&&st.b[i]<0&&canAct(st.turn);
    CELLS[i].classList.toggle('hot',hot);
    CELLS[i].classList.remove('over');
    CELLS[i].setAttribute('aria-disabled',!hot);
    CELLS[i].setAttribute('aria-label',`Row ${Math.floor(i/3)+1}, column ${i%3+1}: `+
      (st.b[i]>=0?`${CARDS[st.b[i]].name}, ${colorOf(st.o[i])}`:'empty')+(st.el[i]?`, ${st.el[i]} square`:''));
  }
}
function renderHands(){
  const st=G.st,bot=G.bottom,top=1-bot;
  for(const[p,el] of [[top,$('#handTop')],[bot,$('#handBot')]]){
    const hide=!viewerSees(p),can=canAct(p),chaos=G.forced!=null&&p===st.turn&&!G.over;
    // with Chaos only the picked card can be played; it's marked in either hand
    el.classList.toggle('chaos',chaos);
    el.innerHTML=st.h[p].map((id,i)=>{
      const ok=can&&(G.forced==null||i===G.forced),fc=chaos&&i===G.forced?'forced ':'';
      return hide
      ?cardHTML(id,null,{back:true,cls:fc})
      :cardHTML(id,colorOf(p),{cls:fc+(ok?'play ':'')+(ok&&G.sel===i?'sel':''),
        attrs:`data-p="${p}" data-i="${i}"`+(ok?` role="button" aria-pressed="${G.sel===i}" aria-label="${esc(cardLabel(id))}${fc?', picked by Chaos':''}"`:'')})}).join('');
    if(can)el.querySelectorAll('.card.play').forEach(c=>c.addEventListener('pointerdown',onHandDown));
  }
  // in same-screen mode the active player is shown at the bottom side's highlight
}
function setScores(sc){$('#scBot').textContent=sc[G.bottom];$('#scTop').textContent=sc[1-G.bottom]}
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
  let msg;
  if(G.over)msg='Game over';
  else if(G.mode==='local')msg=(st.turn===0?'Blue':'Red')+"'s turn";
  else if(st.turn===G.me)msg='Your turn';
  else msg=G.mode==='ai'?'CPU is thinking…':`${oppName()}'s turn`;
  $('#turnMsg').textContent=msg; // read out by screen readers
  $('#turnTxt').textContent=msg; // the pill at the top in landscape
  // whose turn it is: a tag next to that player's name
  const tag=p=>G.over||st.turn!==p?'':isHuman(p)?'Your turn':G.mode==='ai'?'Thinking…':'Their turn';
  for(const[el,p]of[[$('#tagBot'),bot],[$('#tagTop'),1-bot]]){const t=tag(p);if(el.textContent!==t){el.textContent=t;el.classList.toggle('on',!!t)}}
  const R=G.rules;
  let chips=RULES.filter(r=>R[r[0]]).map(r=>`<span>${r[1]}</span>`).join('');
  if(R.timer)chips+=`<span>⏱ ${R.timer}s</span>`;
  if(G.mode!=='local'&&G.trade!=='none')chips+=`<span>Trade: ${TRADES.find(t=>t[0]===G.trade)[1]}</span>`;
  if(G.bo>1&&G.ser)chips+=`<span class="ser">Best of ${G.bo} · Match ${G.ser.n} · ${G.ser.wins[G.bottom]}–${G.ser.wins[1-G.bottom]}</span>`;
  if(G.sd)chips+=`<span class="sd">Sudden death ${G.sd}</span>`;
  if($('#ruleBar').innerHTML!==chips){$('#ruleBar').innerHTML=chips;fitGame()}
  updSnd();emoteSync();
}

let drag=null;
function onHandDown(e){
  const el=e.currentTarget,p=+el.dataset.p,hi=+el.dataset.i;
  if(!canAct(p))return;
  e.preventDefault();
  drag={p,hi,el,x:e.clientX,y:e.clientY,moved:false,ghost:null,over:null};
}
window.addEventListener('pointermove',e=>{
  if(!drag)return;
  if(!drag.moved){
    if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<8)return;
    drag.moved=true;
    const r=drag.el.getBoundingClientRect();
    const g=drag.el.cloneNode(true);g.classList.remove('sel','play');g.classList.add('ghost');
    g.style.fontSize='calc(var(--cell) * var(--ui) / 5)'; // the ghost lives on <body>, outside the zoomed screen
    document.body.append(g);drag.ghost=g;drag.el.classList.add('dragging');
    // dragging picks this card, so drop the highlight from the one picked before
    $$('.hand .card.sel').forEach(c=>c!==drag.el&&c.classList.remove('sel'));
    G.sel=drag.hi;CELLS.forEach((c,i)=>c.classList.toggle('hot',G.st.b[i]<0));
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
  if(!drag)return;
  const d=drag;drag=null;
  if(d.ghost)d.ghost.remove();
  if(d.moved){
    d.el.classList.remove('dragging');
    const t=cancel?null:cellAt(e.clientX,e.clientY);
    if(t!=null&&canAct(d.p)){requestMove(d.hi,t);return}
    renderGame();return;
  }
  if(cancel)return;
  G.sel=G.forced!=null?G.forced:G.sel===d.hi?null:d.hi;sfx('click');
  renderHands();renderBoard();
}
window.addEventListener('pointerup',e=>endDrag(e,false));
window.addEventListener('pointercancel',e=>endDrag(e,true));

/* ---------- responsive sizing ---------- */
let UI=1; // current --ui zoom; rects from getBoundingClientRect are in window pixels, so divide by it before reusing them as CSS sizes inside a screen
// iPhone home-screen app quirks (see .ios-app / .ios-short in base.css). On an iPhone 16 Pro Max with iOS 26: the
// screen is 956 tall, the page only 894, short by exactly the clock's strip (safe-area top 62), with the rest at the bottom.
function iosFlags(){
  const app=navigator.standalone===true,top=parseFloat(getComputedStyle($('#safe')).paddingTop)||0;
  const full=innerWidth<innerHeight?Math.max(screen.width,screen.height):Math.min(screen.width,screen.height),gap=full-innerHeight;
  const de=document.documentElement.classList;
  de.toggle('ios-app',app);de.toggle('ios-short',app&&top>0&&gap>0&&gap<=top+8);
}
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
  const H=vh/ui-Math.max(0,p('Top')-6)-Math.max(0,p('Bottom')-6),land=W>H*1.08;
  document.body.classList.toggle('land',land);
  let cell,hc;
  if(!land){
    // hud 52, timer bar + rule bar 30, two player strips 46, gaps 8, screen padding 12, spare 4;
    // the board is 3 cells of 1.2 × --cell tall plus 26px of gaps, padding and border
    const extra=52+30+2*46+8+12+4+26;
    hc=Math.min((W-36)/5,120);
    cell=Math.min((W-40)/3,(H-extra-2*(hc*1.2+6))/3.6,190);
    hc=Math.min(hc,cell*.7);
    cell=Math.min((W-40)/3,(H-extra-2*(hc*1.2+6))/3.6,190);
  }else{
    const avail=H-52-10-22-24; // hud + timer bar + rulebar + padding
    cell=Math.min(avail/3.7,(W-80-2*180)/3.25,200);
    hc=Math.min(cell*.9,(avail-52)/3.52); // player strip + stacked hand
  }
  cell=Math.max(48,Math.floor(cell));hc=Math.max(40,Math.floor(hc));
  const rs=document.documentElement.style;rs.setProperty('--cell',cell+'px');rs.setProperty('--hc',hc+'px');
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
  const rs=document.documentElement.style,limit=innerHeight-parseFloat(getComputedStyle(sg).paddingBottom)*UI;
  for(let k=0;k<3;k++){
    const parts=[$('#sideTop'),$('#board'),$('#sideBot')].map(e=>e.getBoundingClientRect());
    const top=Math.min(...parts.map(r=>r.top)),over=Math.max(...parts.map(r=>r.bottom))-limit;
    if(over<=1)return;
    const f=1-over/(Math.max(...parts.map(r=>r.bottom))-top),cell=parseFloat(rs.getPropertyValue('--cell')),hc=parseFloat(rs.getPropertyValue('--hc'));
    if(cell<=48&&hc<=40)return;
    rs.setProperty('--cell',Math.max(48,Math.floor(cell*f))+'px');rs.setProperty('--hc',Math.max(40,Math.floor(hc*f))+'px');
  }
}
window.addEventListener('resize',layout);
