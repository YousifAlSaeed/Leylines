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
  musicUpdate(); // each place has its song (music.js)
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
  const nw=collNew(),ct=$('.tile[data-go="coll"]');
  $('#collSub').textContent=unlocked()?'All cards unlocked':`${SAVE.seen.length} of ${CARDS.length} found`+(nw?` · ${nw} new`:'');
  ct.classList.toggle('hot',nw>0);
  // How to play: a badge on its button, like the Inbox's, until the tutorial is finished and its free pack is yours (tutorial.js)
  const tut=SAVE.tut<2,hd=$('#helpDot');
  hd.hidden=!tut;hd.textContent=tut?'1':'';
  hd.parentNode.setAttribute('aria-label',tut?'How to play (a free pack is waiting)':'How to play');
}
// your colour changed (Settings): the menu's cards are drawn again in it
function recolour(){driftDim=null;renderMenu()}
function renderMenu(){
  if(SAVE.wipe&&!ACCT.token)acctWipe(); // signed out during a match (account.js)
  renderProfile();if(ACCT.conflict)setTimeout(()=>ACCT.conflict&&acctTakeAccount(ACCT.conflict),300);
  renderNewsTiles();
  $('#collBar').style.width=(seenCount()/CARDS.length*100).toFixed(1)+'%';
  driftSync();renderHero();renderPackTile();renderStoreTile();renderFriendTile();renderLbTile();renderHub();
  // a CPU match the app closed on, or news about an online match you left (spare.js)
  if(SAVE.live||OWES.news.length)setTimeout(()=>{liveOffer();oweNews()},300);
  alertsTipMaybe(); // a tip about alerts, once a player has a few matches in (alerts.js)
}

/* ---------- the Hub ----------
   Each place on the menu is a widget: its tile is the widget's header (the other scripts keep the tile's line and dot up
   to date, as before) and under it the widget shows what's inside. A PC shows every widget in a grid; a phone shows the
   Play card, the Daily, then Packs and the Leaderboard side by side, and reaches the rest from the tab bar and the top bar.
   Nothing here asks the server for anything: it draws what this device already knows, so the database can sleep. */
const hubSvg=d=>`<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const HUB_IC={
  friends:hubSvg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0"/><path d="M16 4.6a3.5 3.5 0 010 6.8M18 14.2a6.5 6.5 0 013.5 5.8"/>'),
  badge:hubSvg('<circle cx="12" cy="9" r="5.5"/><path d="M8.5 13.5L7 21l5-2.5 5 2.5-1.5-7.5"/>'),
  pack:hubSvg('<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M5 6.5h14"/><path d="M12 10l3 3.5-3 3.5-3-3.5z"/>'),
  daily:hubSvg('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>'),
  news:hubSvg('<path d="M5 4h11l3 3v13H5z"/><path d="M8 10h8M8 14h8M8 18h5"/>')};
function renderHub(){
  $('.hub-grid').classList.toggle('no-srv',API==null); // no friends or leaderboard without the server (menu.css)
  hubDaily();hubColl();hubMarket();hubPacks();hubFriends();hubLb();hubDots();hubFit();
}
// a phone shows the whole Hub without scrolling: if it doesn't fit, the Packs and Leaderboard row gives up its insides a
// step at a time (menu.css .fit1 to .fit3). Checked again when the screen or the Play card changes size
const HUB_PC=matchMedia('(min-width:920px) and (min-height:560px)');
function hubFit(){
  const s=$('#scr-menu'),g=$('.hub-grid');
  g.classList.remove('fit1','fit2','fit3');
  if(!s.classList.contains('on')||HUB_PC.matches)return;
  const cs=getComputedStyle(s),room=s.clientHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom),m=$('.menu');
  for(const c of ['fit1','fit2','fit3']){if(m.getBoundingClientRect().height<=room)break;g.classList.add(c)}
}
if(window.ResizeObserver){const ro=new ResizeObserver(()=>hubFit());ro.observe($('#scr-menu'));ro.observe($('.hero'))}else addEventListener('resize',hubFit);
document.fonts?.ready.then(hubFit);
// the Daily: its three challenges, always in view. The header opens the next one still to play
function hubDaily(){
  const el=$('#hwDaily');if(!el)return;
  const ok=clockOk(),ks=['duel','puzzle','gauntlet'],s=ok?dailyStatus():null,done=ok?ks.filter(k=>s[k].done).length:0,next=ok?ks.find(k=>!s[k].done):'';
  el.innerHTML=`<button class="tile hw-dh" type="button">${MODE_ICON.daily}<div><b>Daily${ok?` <em>#${dayNo()}</em>`:''}</b><small>${ok?`${done} of 3 done · new in ${untilMidnight()}`:'Checking the time with the server…'}</small></div></button>`+
    (ok?`<div class="dly-row">${ks.map(k=>`<button class="dly ${s[k].done?'done':''} ${s[k].miss?'miss':''} ${k===next?'next':''}" type="button" data-k="${k}">${DLY_ICON[k]}<b>${DLY_NAME[k]}</b><small>${s[k].done&&!s[k].miss?'✓ ':''}${s[k].txt}</small></button>`).join('')}</div>`:'');
  el.classList.toggle('hot',dailyOpen());
  el.querySelector('.hw-dh').onclick=()=>{sfx('click');dailyNext()};
  el.querySelectorAll('.dly').forEach(b=>b.onclick=()=>{sfx('click');dailyBrief(b.dataset.k)});
}
// the Collection: how many of each rarity you've found, each opening the binder at that rarity (collection.js).
// A rarity with cards still marked new (the tile's count) gets a dot
function hubColl(){
  const el=$('#hwColl');if(!el)return;
  if(unlocked()){el.innerHTML='';return}
  const nw=collNew(),fresh=new Set(nw?SAVE.seen.slice(-nw).map(id=>CARDS[id].rar):[]);
  el.innerHTML=`<div class="hw-rars">${[1,2,3,4,5].map(r=>{const [f,t]=rarFound(r),n=fresh.has(r);
    return `<button class="hw-rar${f===t?' done':''}" type="button" style="--rc:var(--r${r});--rt:var(--r${r}t)" data-r="${r}" aria-label="${RARITY[r-1]}: ${f} of ${t} found${n?', new cards':''}">`+
      `<b>${r}★</b><i><s style="width:${Math.round(f/t*100)}%"></s></i><small>${f===t?'✓ ':''}${f}/${t}</small>${n?'<span class="hw-new" aria-hidden="true"></span>':''}</button>`}).join('')}</div>`;
  el.querySelectorAll('.hw-rar').forEach(b=>b.onclick=()=>openCollection(+b.dataset.r));
}
// the market: its four stops, each opening the market there
// the market: tonight's Merchant cards not sold yet, one at a time (the one picked for you first). The card opens the
// market; Buy asks first (store.js buyCard). Dots pick one
const HUB_MK={i:0,id:null,t:0};
function hubMarket(){
  const el=$('#hwMkt');if(!el)return;
  if(!clockOk()){el.innerHTML='<small class="hw-note">Checking the time with the server…</small>';return}
  const got=shopDay(true).got,left=merchStock(dayNo(),true).cards.map((it,i)=>({...it,i})).filter(it=>got[it.i]==null);
  if(!left.length){el.innerHTML='<small class="hw-note">All sold. New cards at midnight.</small>';return}
  HUB_MK.i%=left.length;
  const it=left[HUB_MK.i],c=CARDS[it.id],moved=HUB_MK.id!==it.id;HUB_MK.id=it.id;
  el.innerHTML=`<div class="hw-mk${moved?' in':''}"><button class="hw-mc" type="button" aria-label="${esc(c.name)}. Open the market">${cardHTML(it.id,myCol(),{name:false})}`+
    `<span class="hw-mt"><em>${it.mine?'For you':'Merchant'}</em><b>${esc(c.name)}</b><small>${rarName(c.rar)}${owned(it.id)?'':' · <i>New</i>'}</small></span></button>`+
    `<button class="btn small primary hw-buy${SAVE.shards<it.price?' short':''}" type="button" aria-label="Buy ${esc(c.name)} for ${shardsTxt(it.price)}">Buy ${shd()}${fmtSh(it.price)}</button></div>`+
    (left.length>1?`<div class="hw-mdots">${left.map((x,k)=>`<button type="button" class="${k===HUB_MK.i?'on':''}" data-k="${k}" aria-label="Show ${esc(CARDS[x.id].name)}" aria-pressed="${k===HUB_MK.i}"></button>`).join('')}</div>`:'');
  el.querySelector('.hw-mc').onclick=()=>{sfx('click');stStop='merchant';openStore()};
  el.querySelector('.hw-buy').onclick=()=>{sfx('click');buyCard(it.i)};
  el.querySelectorAll('.hw-mdots button').forEach(b=>b.onclick=()=>{HUB_MK.i=+b.dataset.k;hubMarket();const d=$(`#hwMkt .hw-mdots [data-k="${HUB_MK.i}"]`);if(d)d.focus()});
  // the next card every 4 s while the box is in view, held while the mouse or the keyboard is on it
  if(!HUB_MK.t)HUB_MK.t=setInterval(()=>{
    const w=$('#hwMkt');if(!w||document.hidden||!$('#scr-menu').classList.contains('on')||!w.offsetParent)return;
    if(w.parentNode.matches(':hover')||w.contains(document.activeElement))return;
    HUB_MK.i++;hubMarket();
  },4000);
}
// packs waiting to be opened, the daily one first, each in its own colours and art (packs.js miniPack);
// seven at most, then a count of the rest
const HUB_PKMAX=7;
function hubPacks(){
  const el=$('#hwPacks');if(!el)return;
  const d=dailyState(),list=SAVE.packs.map(p=>PACKS[p.t]?p.t:'spark');if(d.ready)list.unshift(d.t);
  const fan=list.slice(0,HUB_PKMAX),more=list.length-fan.length,mid=(fan.length-1)/2;
  el.innerHTML=list.length?`<span class="hw-pk" aria-hidden="true">${fan.map((t,i)=>`<span class="hpk" style="--o:${(i-mid).toFixed(1)}">${miniPack(t)}</span>`).join('')}${more?`<b class="hpk-more">+${more}</b>`:''}</span><button class="btn small primary" type="button" aria-label="Open a pack">Open</button>`
    // nothing to open: the tile's line already counts down to the next daily pack (packs.js)
    :'';
  // Open tears the first one open right here (packs.js openPack), the daily first; its summary offers the next
  const b=el.querySelector('.btn');if(b)b.onclick=()=>{sfx('click');openPack(dailyState().ready?'daily':0)};
}
// friends: requests to answer, who's free to play right now (with Invite, pulse.js), then their news this week (friends.js)
function hubFriends(){
  const el=$('#hwFr');if(!el)return;
  $('#frWidget').hidden=API==null;
  if(API==null){el.innerHTML='';return}
  if(!ACCT.token){
    el.innerHTML=`<small class="hw-note">Add the people you play, see when they're on and invite them to a match.</small>${ACCT.up?'<button class="btn small" type="button">Sign in</button>':''}`;
    const b=el.querySelector('.btn');if(b)b.onclick=()=>{sfx('click');openAuth('in')};
    return;
  }
  if(!FR.loaded){el.innerHTML='<small class="hw-note">Loading friends…</small>';return}
  // with news to show, one friend to invite is enough; the rest are in Friends
  const news=FR.moments.slice(0,3),req=FR.incoming.length;
  const on=[...FR.friends.filter(u=>frFree(u.username)),...FR.friends.filter(u=>!frFree(u.username)&&frAlerted(u.username))].slice(0,news.length?1:3);
  el.innerHTML=(req?`<button class="hw-req" type="button"><b>${plural(req,'friend request')}</b><small>Answer in Friends</small></button>`:'')+
    (on.length?`<div class="hw-fl">${on.map(u=>`<div class="hw-on">${frAvatar(u)}<span class="rt"><b>${esc(u.displayName)}</b><small>${frFree(u.username)?'Free to play':'Gets alerts'}</small></span><button class="btn small primary" type="button" data-inv="${esc(u.username)}" aria-label="Invite ${esc(u.displayName)} to a match">Invite</button></div>`).join('')}</div>`
      :news.length?'':`<small class="hw-note">${FR.friends.length?'No friends online right now.':'No friends yet. Add someone by their username.'}</small>`)+
    (news.length?momentsHTML(news):'');
  el.querySelectorAll('[data-inv]').forEach(b=>b.onclick=()=>{sfx('click');inviteFriend(b.dataset.inv)});
  bindMoments(el);
  const r=el.querySelector('.hw-req');if(r)r.onclick=()=>{sfx('click');openFriends()};
}
// the leaderboard as you saw it last, kept on this device: it's only fetched when you open it (leaderboard.js lbKeep)
function hubLb(){
  const el=$('#hwLb');if(!el)return;
  $('#lbWidget').hidden=API==null;$$('.fr-lb').forEach(b=>b.hidden=API==null);
  const d=lbSeen(),by=d&&LB_BY.find(b=>b[0]===d.by);
  // only when it changes: the line is in the tile, and a write there redraws the widgets (hubSoon), which would loop
  const sub=by?`${by[1]} · last look`:"See who's on top";if($('#lbSub').textContent!==sub)$('#lbSub').textContent=sub;
  if(!by||!d.rows.length){el.innerHTML='';return}
  const val=p=>{const [v,unit]=lbStat(p,d.by);return d.by==='level'?`Lv ${v}`:d.by==='cards'?`${v}/${CARDS.length}`:`${v} ${unit}`};
  // the top two and you, or the top three when you're one of them. x: the one a short phone leaves out (menu.css .fit1),
  // so it keeps the top one and you
  const rows=d.rows.slice(0,d.me&&!d.rows.slice(0,3).some(lbIsMe)?2:3);if(d.me&&!rows.some(lbIsMe))rows.push(d.me);
  const x=rows.length<3?-1:rows.findIndex(lbIsMe)===2?1:2;
  el.innerHTML=`<div class="hw-lbl">${rows.map((p,k)=>`<span class="hw-lr${lbIsMe(p)?' me':''}${k===x?' x':''}"><i>${p.rank}</i><span>${lbIsMe(p)?'You':esc(p.displayName)}</span><em>${val(p)}</em></span>`).join('')}</div>`;
}
// what's waiting for you, gathered in one place
function inboxItems(){
  const it=[];
  if(ACCT.token&&FR.incoming.length)it.push(['friends',plural(FR.incoming.length,'friend request'),FR.incoming.slice(0,3).map(u=>u.displayName).join(', '),()=>openFriends()]);
  const b=toClaim().length;if(b)it.push(['badge',`${plural(b,'badge')} to claim`,'Shards are waiting on your profile',()=>openProfile()]);
  const d=dailyState(),p=SAVE.packs.length+(d.ready?1:0);if(p)it.push(['pack',`${plural(p,'pack')} to open`,d.ready?'Your daily pack is ready':'From levels, the Daily and the market',()=>openPacks()]);
  if(dailyOpen())it.push(['daily','Daily rewards left today',`${plural(dailyStatus().left,'challenge')} can still pay out`,()=>dailyNext()]);
  if(OWES.news.length)it.push(['news','News about a match you left','What happened to your cards',()=>setTimeout(oweNews,50)]);
  return it;
}
function openInbox(){
  const it=inboxItems();
  const box=modal(`<h2 class="nm2">Inbox</h2>`+(it.length?`<div class="ibx">${it.map(([ic,t,s],i)=>`<button class="ibx-row" type="button" data-i="${i}">${HUB_IC[ic]}<span class="rt"><b>${esc(t)}</b><small>${esc(s)}</small></span>${hubSvg('<path d="M9 5l7 7-7 7"/>')}</button>`).join('')}</div>`
    :`<p>Nothing is waiting for you. You're all caught up.</p>`),[{label:'Close',esc:true}]);
  box.querySelectorAll('.ibx-row').forEach(b=>b.onclick=()=>{sfx('click');closeModal();it[+b.dataset.i][3]()});
}
// the tab bar's dots and the inbox count follow the tiles
function hubDots(){
  const tabs=$('#hubTabs');if(!tabs)return;
  const dot=(k,on,n)=>{const i=tabs.querySelector(`[data-tab="${k}"] .td`);i.hidden=!on;i.textContent=n||''};
  const req=ACCT.token?FR.incoming.length:0;
  // a widget has news when its tile does (the Daily sets its own, hubDaily)
  $$('.hub-grid>.hw').forEach(w=>{const t=w.firstElementChild;if(w.id!=='hwDaily'&&t&&t.classList.contains('tile'))w.classList.toggle('hot',t.classList.contains('hot'))});
  dot('coll',collNew()>0);dot('store',$('#storeTile').classList.contains('hot'));dot('friends',req>0,req);dot('you',toClaim().length>0);
  $('#tabFriends').hidden=API==null;
  $('#tabAv').innerHTML=avatar(ACCT.token&&ACCT.user);
  tabs.querySelector('.tab-mkt').innerHTML=ST_ICON[stDay()?'day':'night'];
  const n=inboxItems().length,ib=$('#inboxDot');ib.hidden=!n;ib.textContent=n;
  $('#btnInbox').setAttribute('aria-label',n?`Inbox, ${plural(n,'thing')} waiting`:'Inbox');
}
// redraw the widgets whenever another script changes a tile (its line, its dot, news); the tiles' own 30-second timers keep the countdowns fresh
let hubT=0;
const hubSoon=()=>{if(!hubT)hubT=requestAnimationFrame(()=>{hubT=0;if($('#scr-menu').classList.contains('on'))renderHub()})};
if(window.MutationObserver){const mo=new MutationObserver(hubSoon);$$('.hw>.tile').forEach(t=>mo.observe(t,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','hidden']}))}
$$('#hubTabs [data-tab]').forEach(b=>b.onclick=()=>{
  const t=b.dataset.tab;
  if(t==='menu'){$('#scr-menu').scrollTop=0;return}
  if(t==='coll'){openCollection();return}
  sfx('click');
  if(t==='store')openStore();else if(t==='friends')openFriends();else openProfile();
});
$('#btnInbox').onclick=()=>{sfx('click');openInbox()};
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
    :mlo?mlo.l.ids.map((id,k)=>mlo.miss.includes(k)?back:cardHTML(id,myCol(),{name:false}))
    :d?d.map(id=>cardHTML(id,myCol(),{name:false})):Array(5).fill(back);
  return {sub,fan:`<div class="fan" aria-hidden="true">${cards.join('')}</div>`};
}
// on your own first (Solo), then with other people (Online, Couch). The Daily has its own box on the menu
const MODES=[['ai','Solo'],['online','Online'],['local','Couch']];
// a small fan for Couch: two of your colour's cards (or backs) vs two of Red's
function localFan(d){
  const two=(i,col)=>d?d[i].slice(0,2).map(id=>cardHTML(id,col,{name:false})).join(''):Array(2).fill(cardHTML(0,null,{back:true})).join('');
  return `<div class="vsfan" aria-hidden="true"><div class="fan">${two(0,myCol())}</div><em>vs</em><div class="fan">${two(1,'red')}</div></div>`;
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
    h='Couch';sub=d?'Quick play repeats your last game':`${COL_NAME[myCol()]} picks, then passes to Red`;side=localFan(d);
    // no XP or shards here, so the bar says what kind of game it is
    stats=[['2 players','one device'],['Friendly','no trades'],[ruleCountText().replace(' on',' rules'),'turned on']];
    row=`<button class="btn primary full" id="heroQuick" ${d?'':'disabled title="Play one game first"'}>Quick play</button><button class="btn full" id="heroGo">New rules and cards</button>`;
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
// the Play card: a 3-way mode switch, then what that mode needs
function renderHero(anim){
  const m=MODES.some(x=>x[0]===SAVE.menuMode)?SAVE.menuMode:'ai';
  $('#modeSeg').innerHTML=MODES.map(([k,l])=>`<button data-k="${k}" class="${m===k?'on':''}" aria-pressed="${m===k}">${MODE_ICON[k]}${l}</button>`).join('');
  $$('#modeSeg button').forEach(b=>b.onclick=()=>{if(SAVE.menuMode===b.dataset.k)return;SAVE.menuMode=b.dataset.k;save();sfx('click');renderHero(true);refocus('#modeSeg',b)});
  // the other modes sit invisibly in the same spot, so the card is always as tall as the tallest one
  // and the menu doesn't jump when you switch
  const ghosts=MODES.filter(x=>x[0]!==m).map(([k])=>`<div class="hero-pane hero-ghost" aria-hidden="true" inert>${heroPane(k).replace(/ id="[^"]*"/g,'')}</div>`).join('');
  const body=$('#heroBody');
  body.innerHTML=`<div class="hero-pane">${heroPane(m)}</div>`+ghosts;
  if(anim){body.classList.remove('fade');void body.offsetWidth;body.classList.add('fade')}
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
   has no seam; only transforms move, so nothing is laid out again. With reduced motion the cards keep still and
   don't turn over (menu.css); the switch in Settings takes them away, and is kept per device (localStorage, like
   the other device-only things). */
const DRIFT_KEY='leylines.drift';
const driftWanted=()=>{try{return localStorage.getItem(DRIFT_KEY)!=='off'}catch(e){return true}};
function driftSet(on){try{on?localStorage.removeItem(DRIFT_KEY):localStorage.setItem(DRIFT_KEY,'off')}catch(e){}driftSync()}
let driftDim=null; // the sheet that's up: its columns, rows, card size and the cards it draws from
// a lighter card than cardHTML's: the picture, the numbers, the rarity tag and frame (no name, so the tag sits low: .nn)
function driftCard(pool){
  const c=CARDS[pool[Math.floor(Math.random()*pool.length)]];
  return `<div class="card ${Math.random()<.6?myCol():'red'} rar${c.rar} nn${Math.random()<.3?' back':''}"><div class="art">${c.art}</div>`+
    `<div class="nums">${c.s.map((v,k)=>`<b class="n${k}">${fmt(v)}</b>`).join('')}</div><div class="rchip">${c.rar}★</div><i class="rf"></i></div>`;
}
function driftSync(){
  const scr=$('#scr-menu'),el=$('#drift'),on=driftWanted();
  scr.classList.toggle('drift-on',on);
  if(!on){el.innerHTML='';driftDim=null;return}
  if(!scr.classList.contains('on'))return;
  // enough columns and rows to cover the tilted screen (a card is 5 x 6 em, with 1.1 em between cards)
  const em=parseFloat(getComputedStyle(el).fontSize),w=innerWidth/UI,h=innerHeight/UI;
  const cols=Math.ceil((w*.97+h*.25)/(6.1*em))+1,n=Math.ceil((h*.97+w*.25)/(7.1*em))+1;
  let pool=CARDS.map(c=>c.id).filter(isSeen);if(!pool.length)pool=CARDS.map(c=>c.id);
  // a new sheet when the cards you've found change (a win, signing in) or the screen outgrows this one; a phone's
  // keyboard or address bar coming and going makes it smaller, and that shouldn't shuffle the cards
  const d=driftDim,seen=pool.join();
  if(d&&d.em===em&&d.seen===seen&&d.cols>=cols&&d.n>=n)return;
  driftDim={cols,n,em,seen};
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
  if(!emOn()||document.hidden||noMotion())return;
  const all=$$('#drift .card');if(!all.length)return;
  const c=all[Math.floor(Math.random()*all.length)];
  c.classList.add('fy');setTimeout(()=>c.classList.toggle('back'),230);setTimeout(()=>c.classList.remove('fy'),480);
},1300);
{let t;addEventListener('resize',()=>{clearTimeout(t);t=setTimeout(driftSync,250)})}
