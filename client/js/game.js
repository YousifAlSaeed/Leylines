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
    const hide=!viewerSees(p),can=canAct(p);
    el.innerHTML=st.h[p].map((id,i)=>hide
      ?cardHTML(id,null,{back:true})
      :cardHTML(id,colorOf(p),{cls:(can?'play ':'')+(can&&G.sel===i?'sel':''),
        attrs:`data-p="${p}" data-i="${i}"`+(can?` role="button" aria-pressed="${G.sel===i}" aria-label="${esc(cardLabel(id))}"`:'')})).join('');
    if(can)el.querySelectorAll('.card').forEach(c=>c.addEventListener('pointerdown',onHandDown));
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
  $('#turnMsg').textContent=msg;
  const R=G.rules;
  let chips=RULES.filter(r=>R[r[0]]).map(r=>`<span>${r[1]}</span>`).join('');
  if(R.timer)chips+=`<span>⏱ ${R.timer}s</span>`;
  if(G.mode!=='local'&&G.trade!=='none')chips+=`<span>Trade: ${TRADES.find(t=>t[0]===G.trade)[1]}</span>`;
  if(G.bo>1&&G.ser)chips+=`<span class="ser">Best of ${G.bo} · Match ${G.ser.n} · ${G.ser.wins[G.bottom]}–${G.ser.wins[1-G.bottom]}</span>`;
  if(G.sd)chips+=`<span class="sd">Sudden death ${G.sd}</span>`;
  $('#ruleBar').innerHTML=chips;
  updSnd();
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
  G.sel=G.sel===d.hi?null:d.hi;sfx('click');
  renderHands();renderBoard();
}
window.addEventListener('pointerup',e=>endDrag(e,false));
window.addEventListener('pointercancel',e=>endDrag(e,true));

/* ---------- responsive sizing ---------- */
let UI=1; // current --ui zoom; rects from getBoundingClientRect are in window pixels, so divide by it before reusing them as CSS sizes inside a screen
function layout(){
  // UI scale: 1 up to a ~1440x900 window, then grows with whichever side is tighter (2K ≈ 1.45, 4K ≈ 2.2)
  const ui=Math.min(2.4,Math.max(1,Math.floor(Math.min(innerWidth/1440,innerHeight/900)*20)/20));
  UI=ui;document.documentElement.style.setProperty('--ui',ui);
  // everything below is in the zoomed screen's own pixels
  const W=innerWidth/ui,H=innerHeight/ui,land=W>H*1.08;
  document.body.classList.toggle('land',land);
  let cell,hc;
  if(!land){
    const extra=52+10+22+2*46+22; // hud + timer bar + rulebar + player strips + gaps/padding
    hc=Math.min((W-36)/5,120);
    cell=Math.min((W-40)/3,(H-extra-2*(hc*1.2+6))/3.7,190);
    hc=Math.min(hc,cell*.7);
    cell=Math.min((W-40)/3,(H-extra-2*(hc*1.2+6))/3.7,190);
  }else{
    const avail=H-52-10-22-24; // hud + timer bar + rulebar + padding
    cell=Math.min(avail/3.7,(W-80-2*180)/3.25,200);
    hc=Math.min(cell*.9,(avail-52)/3.52); // player strip + stacked hand
  }
  cell=Math.max(48,Math.floor(cell));hc=Math.max(40,Math.floor(hc));
  const rs=document.documentElement.style;rs.setProperty('--cell',cell+'px');rs.setProperty('--hc',hc+'px');
  document.body.classList.toggle('nohn',hc<88);
  document.body.classList.toggle('nobn',cell<82);
}
window.addEventListener('resize',layout);
