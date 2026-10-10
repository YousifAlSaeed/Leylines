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
function renderMenu(){
  if(SAVE.wipe&&!ACCT.token)acctWipe(); // signed out during a match (account.js)
  renderProfile();if(ACCT.conflict)setTimeout(()=>ACCT.conflict&&acctTakeAccount(ACCT.conflict),300);
  $('#collSub').textContent=unlocked()?'All cards unlocked':`${SAVE.seen.length} of ${CARDS.length} found`;
  $('#collBar').style.width=(seenCount()/CARDS.length*100).toFixed(1)+'%';
  renderHero();renderPackTile();renderStoreTile();renderFriendTile();renderLbTile();
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
  sfx('click');const g=b.dataset.go;
  if(g==='ai'||g==='local')openSetup(g);
  else if(g==='online')openOnline();
  else if(g==='coll')openCollection();
  else if(g==='packs')openPacks();
  else if(g==='store')openStore();
  else if(g==='howto')openHow(0);
  else if(g==='friends')openFriends();
  else if(g==='leaders')openLeaderboard();
});
$$('[data-back]').forEach(b=>b.onclick=()=>{sfx('click');show(b.dataset.back)});
$('#alphaPill').onclick=()=>{sfx('click');modal(`<h2 class="nm2">Alpha version</h2><p>Leylines is still being built. Your record, XP, shards and collection could be reset at any time.</p>`,[{label:'Got it',cls:'primary',esc:true}])};
