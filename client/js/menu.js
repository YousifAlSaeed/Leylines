'use strict';
/* =====================================================================
   NAV / MENU
   ===================================================================== */
function show(id){
  if(id!=='game'){tutClear();revClear()} // leaving ends a tutorial lesson or a Review
  if(id!=='duo')duoRevClear(); // and a Crossroads Review
  // the main menu always ends any match in progress, so its timer and the CPU can't keep playing behind it
  if(id==='menu'&&G){if(G.mode==='online'){clearRejoin();netClose(true)}G=null;stopTurnTimer()}
  if(id==='menu'&&DUO.role)duoQuit(); // and a 2v2 room (duo.js)
  keepAwake(id==='game');closeEmotes();ghostSweep(); // no dragged card follows you to another screen (helpers.js)
  $$('.screen').forEach(s=>s.classList.toggle('on',s.id==='scr-'+id));
  if(id!=='menu')emReset(); // the small logo in a match is the same drawing, so it goes back to the real logo
  if(id==='game')layout();if(id==='menu')renderMenu();
  document.documentElement.classList.toggle('night',id==='store');applyTheme(); // the market's sky (store.css)
  pulseSoon(); // friends see whether you're free to play (pulse.js)
  const h=$(`#scr-${id} .topbar h2`);if(h){h.tabIndex=-1;h.focus({preventScroll:true})}
}
// the last deck is only "ready" if every card in it is still owned
function lastDeckReady(){
  const d=SAVE.lastDeck||[],need={};
  if(d.length!==5)return null;
  for(const id of d){need[id]=(need[id]||0)+1;if(owned(id)<need[id])return null}
  return d;
}
// Tiles with news. Collection: cards found since you last opened it. The count you last saw is kept per device
// (localStorage, like the other device-only things); a device that has never opened it starts with no news.
const COLL_KEY='leylines.collSeen';
function collNew(){
  if(unlocked())return 0;
  try{const v=localStorage.getItem(COLL_KEY);if(v==null){collNewSeen();return 0}return Math.max(0,SAVE.seen.length-(+v||0))}catch(e){return 0}
}
function collNewSeen(){try{localStorage.setItem(COLL_KEY,String(SAVE.seen.length))}catch(e){}}
function renderNewsTiles(){
  const nw=collNew(),ct=$('.tile[data-go="coll"]'),ht=$('.tile[data-go="howto"]');
  $('#collSub').textContent=unlocked()?'All cards unlocked':`${SAVE.seen.length} of ${CARDS.length} found`+(nw?` · ${nw} new`:'');
  ct.classList.toggle('hot',nw>0);
  // How to play: until the tutorial is finished, its free pack is waiting (tutorial.js)
  const tut=SAVE.tut<2;
  ht.querySelector('small').textContent=tut?'Tutorial: free pack':'Rules in 2 minutes';
  ht.classList.toggle('hot',tut);
}
function renderMenu(){
  if(SAVE.wipe&&!ACCT.token)acctWipe(); // signed out during a match (account.js)
  renderProfile();if(ACCT.conflict)setTimeout(()=>ACCT.conflict&&acctTakeAccount(ACCT.conflict),300);
  renderNewsTiles();
  $('#collBar').style.width=(seenCount()/CARDS.length*100).toFixed(1)+'%';
  driftSync();renderHero();renderPackTile();renderStoreTile();renderFriendTile();renderLbTile();
  // a CPU match the app closed on, or news about an online match you left (spare.js)
  if(SAVE.live||OWES.news.length)setTimeout(()=>{liveOffer();oweNews()},300);
  alertsTipMaybe(); // a tip about alerts, once a player has a few matches in (alerts.js)
}
const MODE_ICON={
  // Solo: one player; Couch: two players side by side
  ai:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/></svg>',
  local:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M2.5 20a5.5 5.5 0 0111 0M10.5 20a5.5 5.5 0 0111 0"/></svg>',
  online:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/></svg>',
  daily:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>'};
// what the Play card says about your deck, plus the small fan of its cards
function heroDeck(random){
  const mlo=mainLoadout(),d=lastDeckReady(),back=cardHTML(0,null,{back:true});
  const sub=random?'Random deck'
    :mlo?(mlo.miss.length?`${mlo.l.name} is missing ${mlo.miss.length} card${mlo.miss.length>1?'s':''}`:mlo.over.length?`${mlo.l.name} breaks the rarity limits`:`${mlo.l.name} ready`)
    :d?'Last deck ready':'Pick 5 cards';
  const cards=random?Array(5).fill(back)
    :mlo?mlo.l.ids.map((id,k)=>mlo.miss.includes(k)?back:cardHTML(id,'blue',{name:false}))
    :d?d.map(id=>cardHTML(id,'blue',{name:false})):Array(5).fill(back);
  return {sub,fan:`<div class="fan" aria-hidden="true">${cards.join('')}</div>`};
}
// on your own first (Solo, Daily), then with other people (Online, Couch)
const MODES=[['ai','Solo'],['daily','Daily'],['online','Online'],['local','Couch']];
// a small fan for Couch: two of Blue's cards (or backs) vs two of Red's
function localFan(d){
  const two=(i,col)=>d?d[i].slice(0,2).map(id=>cardHTML(id,col,{name:false})).join(''):Array(2).fill(cardHTML(0,null,{back:true})).join('');
  return `<div class="vsfan" aria-hidden="true"><div class="fan">${two(0,'blue')}</div><em>vs</em><div class="fan">${two(1,'red')}</div></div>`;
}
// the bar of 3 numbers above a mode's buttons: [value, label]. XP, shards, then one more that fits the mode
const shardsToday=()=>[`${shd()}${shardDay().n}/${SHARD_CAP}`,'shards today'];
const winStats=(xp,sh)=>[[`+${xp}`,'XP a win'],[`${shd()}+${sh}`,'shards a win'],shardsToday()];
// what the Play card shows for one mode. Every mode has the same parts: a title with a picture,
// the bar of 3 numbers, then the controls (two rows), so no mode leaves a gap
function heroPane(m){
  let h,sub,side='',stats=[],row;
  if(m==='ai'){
    const dk=heroDeck(SAVE.rules.random),tr=TRADES.find(t=>t[0]===SAVE.trade),bo=boOf(SAVE.bo);
    h='Solo';sub=esc(dk.sub)+' · '+(SAVE.trade==='none'?'Friendly':'Trade: '+tr[1]+(SAVE.rules.sweep?' + Sweep':''))+(bo>1?' · Best of '+bo:'');side=dk.fan;
    // the numbers follow the difficulty you pick
    stats=winStats(MATCH_XP[SAVE.diff][0],MATCH_SHARDS[SAVE.diff]);
    row=`<div class="seg full" id="menuDiff" role="group" aria-label="Difficulty">${
      DIFFS.map(([k,l])=>`<button data-k="${k}" class="${SAVE.diff===k?'on':''}" aria-pressed="${SAVE.diff===k}">${l}</button>`).join('')}</div>`+
      `<button class="btn primary full" id="heroGo">Play</button>`;
  }else if(m==='local'){
    // Quick play: last game's rules and both players' cards, straight into the match
    const d=localDecks();
    h='Couch';sub=d?'Quick play repeats your last game':'Blue picks, then passes to Red';side=localFan(d);
    // no XP or shards here, so the bar says what kind of game it is
    stats=[['2 players','one device'],['Friendly','no trades'],[ruleCountText().replace(' on',' rules'),'turned on']];
    row=`<button class="btn primary full" id="heroQuick" ${d?'':'disabled title="Play one game first"'}>Quick play</button><button class="btn full" id="heroGo">New rules and cards</button>`;
  }else if(m==='daily'){
    // daily.js: today's three challenges
    ({h,sub,side,stats,row}=dailyPane());
  }else{
    // online uses the host's rules, so your own "random deck" setting doesn't apply here
    const dk=heroDeck(false),rj=readRejoin(),drj=rj?null:duoResumeInfo();
    h='Online';sub=esc(dk.sub)+' · Host picks the rules';side=dk.fan;
    stats=winStats(MATCH_XP.online[0],MATCH_SHARDS.online);
    // a game this device was in when the app closed: one tap back in
    // a 2v2 game this device was in, or hosted
    row=(rj?`<button class="btn primary full" id="heroRejoin">Rejoin game ${rj.code}</button>`:'')+
      (drj?`<button class="btn primary full" id="heroDuoRejoin">${drj.host?'Resume':'Rejoin'} Crossroads game ${drj.code}</button>`:'')+
      `<button class="btn ${rj||drj?'':'primary '}full" id="heroGo">Host a game</button><div class="joinrow"><input class="codein" id="heroCode" maxlength="5" placeholder="CODE" aria-label="Friend's game code" autocomplete="off" autocapitalize="characters" spellcheck="false"><button class="btn" id="heroJoin">Join</button></div>`;
  }
  return `<div class="hero-top"><div><h2 class="hero-h">${h}</h2><p class="hero-sub">${sub}</p></div>${side}</div>`+
    (stats.length?`<div class="hero-stats">${stats.map(([v,l])=>`<div><b>${v}</b><small>${l}</small></div>`).join('')}</div>`:'')+`<div class="hero-row">${row}</div>`;
}
// the Play card: a 4-way mode switch, then what that mode needs
function renderHero(anim){
  const m=MODES.some(x=>x[0]===SAVE.menuMode)?SAVE.menuMode:'ai';
  // the Daily tab gets a dot while a challenge can still pay out today
  $('#modeSeg').innerHTML=MODES.map(([k,l])=>`<button data-k="${k}" class="${m===k?'on':''}" aria-pressed="${m===k}">${MODE_ICON[k]}${l}${k==='daily'&&dailyOpen()?'<i class="mdot" aria-label="(rewards left)"></i>':''}</button>`).join('');
  $$('#modeSeg button').forEach(b=>b.onclick=()=>{if(SAVE.menuMode===b.dataset.k)return;SAVE.menuMode=b.dataset.k;save();sfx('click');renderHero(true);refocus('#modeSeg',b)});
  // the other modes sit invisibly in the same spot, so the card is always as tall as the tallest one
  // and the menu doesn't jump when you switch
  const ghosts=MODES.filter(x=>x[0]!==m).map(([k])=>`<div class="hero-pane hero-ghost" aria-hidden="true" inert>${heroPane(k).replace(/ id="[^"]*"/g,'')}</div>`).join('');
  const body=$('#heroBody');
  body.innerHTML=`<div class="hero-pane">${heroPane(m)}</div>`+ghosts;
  if(anim){body.classList.remove('fade');void body.offsetWidth;body.classList.add('fade')}
  if(m==='daily'){bindDaily();return}
  $('#heroGo').onclick=()=>{sfx('click');m==='online'?heroHost():openSetup(m)};
  const dr=$('#heroDuoRejoin');if(dr)dr.onclick=()=>{sfx('click');duoRejoin()};
  const qp=$('#heroQuick');if(qp)qp.onclick=()=>{sfx('click');quickLocal()};
  const rb=$('#heroRejoin');
  if(rb)rb.onclick=()=>{sfx('click');const rj=readRejoin();if(!rj){renderHero();return}$('#heroCode').value=rj.code;heroJoin()};
  $$('#menuDiff button').forEach(b=>b.onclick=()=>{SAVE.diff=b.dataset.k;save();sfx('click');renderHero();refocus('#menuDiff',b)});
  const ci=$('#heroCode');
  if(ci){
    ci.addEventListener('input',()=>{ci.value=ci.value.toUpperCase().replace(/[^A-Z]/g,'').slice(0,5)});
    ci.addEventListener('keydown',e=>{if(e.key==='Enter')heroJoin()});
    $('#heroJoin').onclick=()=>{sfx('click');heroJoin()};
  }
}
// online from the menu: the online screen still asks for a name if we don't have one yet
function askName(msg){onStatus(msg);const n=$('#myName');n.classList.add('need');setTimeout(()=>n.focus(),50)}
// Host a game: pick 1v1 or Crossroads first (duo.js)
function heroHost(){hostPick()}
function heroJoin(){
  const code=$('#heroCode').value.toUpperCase().replace(/[^A-Z]/g,'');
  if(code.length!==5){toast('Enter the 5-letter code from your friend.');$('#heroCode').focus();return}
  openOnline(code);
  if(playerName())joinGame(code);else askName('Enter your name, then tap <b>Join</b>.');
}
$$('[data-go]').forEach(b=>b.onclick=()=>{
  const g=b.dataset.go;if(g==='coll'){openCollection();return}sfx('click');
  if(g==='ai'||g==='local')openSetup(g);
  else if(g==='online')openOnline();
  else if(g==='packs')openPacks();
  else if(g==='store')openStore();
  else if(g==='howto')openHow(0);
  else if(g==='friends')openFriends();
  else if(g==='leaders')openLeaderboard();
});
$$('[data-back]').forEach(b=>b.onclick=()=>{sfx('click');show(b.dataset.back)});
$('#alphaPill').onclick=()=>{sfx('click');modal(`<h2 class="nm2">Alpha version</h2><p>Leylines is still being built. Your record, XP, shards and collection could be reset at any time.</p>`,[{label:'Got it',cls:'primary',esc:true}])};

/* ---------- the logo plays ----------
   On the menu, the emblem's eight outer squares turn over and take their neighbours, like a match that never ends;
   every few moves they settle back into the real logo. The squares are the SVG's own (index.html), recoloured here.
   The small logo in a match draws the same squares (<use>), so they're put back whenever the menu is left. */
const EM_COL={v:['#6A2BAE','#B894FF'],p:['#C2469A','#FF86C4'],e:['#140C33','#3A2C6E']};
const EM_LOGO=['v','p','e','p','','v','e','v','p'],EM_OUT=[0,1,2,3,5,6,7,8];
let emSt=EM_LOGO.slice(),emCells=null,emN=0;
function emInit(){
  const g=$('#lyEmblem'),sq=g.children[0],dg=g.children[1];emCells=[];
  [...sq.children].forEach(r=>{
    const x=+r.getAttribute('x'),y=+r.getAttribute('y'),i=Math.round((y-26)/66)*3+Math.round((x-26)/66);
    if(i===4){ // the centre: a soft halo behind it that swells and fades (menu.css)
      const h=r.cloneNode();h.setAttribute('class','em-core');sq.insertBefore(h,r);return}
    // each square's diamond; the two dark squares get one too, hidden until the square is taken
    const cx=x+28,cy=y+28,pts=`${cx},${cy-10} ${cx+10},${cy} ${cx},${cy+10} ${cx-10},${cy}`;
    let d=[...dg.children].find(p=>p.getAttribute('points')===pts);
    if(!d){d=document.createElementNS('http://www.w3.org/2000/svg','polygon');d.setAttribute('points',pts);d.setAttribute('opacity','0');dg.appendChild(d)}
    emCells[i]=[r,d];
  });
}
function emSet(i,s){const [r,d]=emCells[i];emSt[i]=s;r.setAttribute('fill',EM_COL[s][0]);r.setAttribute('stroke',EM_COL[s][1]);d.setAttribute('opacity',s==='e'?'0':'1')}
const emOn=()=>$('#scr-menu').classList.contains('on');
function emReset(){if(emCells)EM_OUT.forEach(i=>{emCells[i].forEach(n=>n.classList.remove('em-turn'));if(emSt[i]!==EM_LOGO[i])emSet(i,EM_LOGO[i])})}
// one square turns over: it's edge-on halfway through, and that's when its colour changes
function emTurn(i,s){
  emCells[i].forEach(n=>{n.classList.remove('em-turn');void n.getBoundingClientRect();n.classList.add('em-turn')});
  setTimeout(()=>{if(emOn())emSet(i,s)},230);
}
function emTick(){
  if(!emCells)emInit();
  if(!emOn()||noMotion()){emReset();return}
  if(document.hidden)return;
  // every seventh move, back to the logo, so it's still the logo most times you look
  if(++emN%7===0){EM_OUT.filter(i=>emSt[i]!==EM_LOGO[i]).forEach((i,k)=>setTimeout(()=>{if(emOn())emTurn(i,EM_LOGO[i])},k*130));return}
  const i=EM_OUT[Math.floor(Math.random()*8)],r=Math.floor(i/3),c=i%3;
  const nb=[[r-1,c],[r+1,c],[r,c-1],[r,c+1]].filter(([y,x])=>y>=0&&y<3&&x>=0&&x<3&&y*3+x!==4).map(([y,x])=>y*3+x);
  // a square is taken by a neighbour of the other colour; with none, it changes sides (or, now and then, empties)
  const rivals=nb.map(j=>emSt[j]).filter(s=>s!=='e'&&s!==emSt[i]);
  const to=emSt[i]!=='e'&&Math.random()<.16?'e':rivals.length?rivals[Math.floor(Math.random()*rivals.length)]:emSt[i]==='v'?'p':'v';
  emTurn(i,to);
  // and sometimes takes the square next to it along
  const j=nb[Math.floor(Math.random()*nb.length)];
  if(to!=='e'&&emSt[j]!==to&&Math.random()<.45)setTimeout(()=>{if(emOn())emTurn(j,to)},260);
}
setInterval(emTick,1600);

/* ---------- card drift ----------
   Behind the menu, tilted columns of the cards you've found slide slowly past, every other column the other way,
   and now and then one turns over. Each column holds its cards twice and moves by half its height, so the loop
   has no seam; only transforms move, so nothing is laid out again. Off with reduced motion or the switch in
   Settings, which is kept per device (localStorage, like the other device-only things). */
const DRIFT_KEY='leylines.drift';
const driftWanted=()=>{try{return localStorage.getItem(DRIFT_KEY)!=='off'}catch(e){return true}};
function driftSet(on){try{on?localStorage.removeItem(DRIFT_KEY):localStorage.setItem(DRIFT_KEY,'off')}catch(e){}driftSync()}
let driftDim='';
// a lighter card than cardHTML's: the picture, the numbers and the rarity frame
function driftCard(pool){
  const c=CARDS[pool[Math.floor(Math.random()*pool.length)]];
  return `<div class="card ${Math.random()<.6?'blue':'red'} rar${c.rar}${Math.random()<.3?' back':''}"><div class="art">${c.art}</div>`+
    `<div class="nums">${c.s.map((v,k)=>`<b class="n${k}">${fmt(v)}</b>`).join('')}</div><i class="rf"></i></div>`;
}
function driftSync(){
  const scr=$('#scr-menu'),el=$('#drift'),on=driftWanted()&&!noMotion();
  scr.classList.toggle('drift-on',on);
  if(!on){el.innerHTML='';driftDim='';return}
  if(!scr.classList.contains('on'))return;
  // enough columns and rows to cover the tilted screen (a card is 5 x 6 em, with 1.1 em between cards)
  const em=parseFloat(getComputedStyle(el).fontSize),w=innerWidth/UI,h=innerHeight/UI;
  const cols=Math.ceil((w*.97+h*.25)/(6.1*em))+1,n=Math.ceil((h*.97+w*.25)/(7.1*em))+1,dim=cols+'x'+n+'x'+em;
  if(dim===driftDim)return;driftDim=dim;
  const pool=CARDS.map(c=>c.id).filter(isSeen);
  let out='';
  for(let c=0;c<cols;c++){
    const half=Array.from({length:n},()=>driftCard(pool)).join('');
    // about 12 px a second, each column a little faster or slower
    out+=`<div class="drift-col" style="--d:${Math.round(n*7.1*em/12*(.75+Math.random()*.5))}s">${half}${half}</div>`;
  }
  el.innerHTML=`<div class="drift-sheet" style="--h:${(n*7.1).toFixed(1)}em">${out}</div>`;
}
// one card turns over: edge-on halfway through, and that's when it changes face (.fy, cards.css)
setInterval(()=>{
  if(!emOn()||document.hidden)return;
  const all=$$('#drift .card');if(!all.length)return;
  const c=all[Math.floor(Math.random()*all.length)];
  c.classList.add('fy');setTimeout(()=>c.classList.toggle('back'),230);setTimeout(()=>c.classList.remove('fy'),480);
},1300);
{let t;addEventListener('resize',()=>{clearTimeout(t);t=setTimeout(driftSync,250)})}
