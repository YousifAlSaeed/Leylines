'use strict';
/* =====================================================================
   ONLINE (PeerJS)
   ===================================================================== */
// waiting room: room = the host's settings as the guest last heard them, rv = their version (bumped on every change, so a
// Ready for older rules doesn't count), roomCfg = what the host last sent, meReady/oppReady, oppIn = the other player is in the room
// coming back: sid = this pairing's id (the host makes it), gcid = the guest's device (host only), out = the game messages we sent,
// got = how many of theirs we've handled, away = the other side dropped and we're holding the match for them
const NET={peer:null,conn:null,role:null,code:null,meNext:0,oppNext:0,pendingDeck:null,closing:false,oppName:'',oppAv:null,last:0,joining:false,joinT:0,joinAt:0,
  room:null,rv:0,roomCfg:'',roomMsg:'',meReady:false,oppReady:false,oppIn:false,
  sid:null,gcid:'',out:[],got:0,away:false,waiting:false,awayMsg:'',retryT:0,ended:null};
// these messages change the match, so they're numbered and kept, and sent again after a reconnect
const LOGGED=new Set(['setup','deck','move','trade','next']);
// avatars travel as a card id; anything else means no avatar
const netAv=v=>Number.isInteger(v)&&v>=0&&v<CARDS.length?v:null;
const myAv=()=>SAVE.avatar?SAVE.avatar.c:null;
const CODE_ABC='ABCDEFGHJKLMNPQRSTUVWXYZ';
const peerId=code=>'ninefold-tt-'+code.toLowerCase();
const newCode=()=>Array.from({length:5},()=>CODE_ABC[Math.floor(Math.random()*CODE_ABC.length)]).join('');
// a match (or its trade, or the rest of a series) is still going, so a dropped player can come back to it
const liveMatch=()=>!!(G&&G.mode==='online'&&!G.done);
function loadPeerJS(){
  if(window.Peer)return Promise.resolve();
  const urls=['https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js','https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js'];
  return urls.reduce((p,u)=>p.catch(()=>new Promise((res,rej)=>{
    const s=document.createElement('script');s.src=u;s.onload=()=>window.Peer?res():rej();s.onerror=()=>{s.remove();rej()};document.head.append(s);
  })),Promise.reject()).catch(()=>{throw new Error('Could not load the networking library. Check your connection.')});
}
const cleanName=s=>String(s==null?'':s).replace(/[\u0000-\u001f\u007f<>]/g,'').replace(/\s+/g,' ').trim().slice(0,16);
// your name: the account's display name when signed in, otherwise the name typed on this device
function playerName(){return ACCT.token&&ACCT.user?cleanName(ACCT.user.displayName):cleanName(SAVE.name)}
function myName(){return playerName()||(NET.role==='guest'?'Guest':'Host')}
// account usernames travel with the names, so each side can add the other as a friend ('' for a guest)
function myUser(){return ACCT.token&&ACCT.user?ACCT.user.username:''}
const netUser=u=>typeof u==='string'&&/^[A-Za-z0-9_]{3,20}$/.test(u)?u:'';
function oppName(){return G&&G.mode==='online'&&G.names?G.names[1-G.me]:(NET.oppName||'Your opponent')}
function onStatus(html,err){const s=$('#onStatus');s.innerHTML=html;s.classList.toggle('err',!!err)}
// which lobby panels are visible: 'choose' (name + host/join) or 'none'
function onPanels(which){
  $('#onName').classList.toggle('hidden',which!=='choose');
  $('#onChoose').classList.toggle('hidden',which!=='choose');
}
function setJoining(on){NET.joining=on;NET.joinAt=on?Date.now():0;$('#btnJoin').disabled=on;clearTimeout(NET.joinT)}

/* ---------- rejoin after the page was closed ---------- */
// a guest's game is remembered on the device, so the menu can offer to go back in after the app was closed or reloaded
const RJ_KEY='leylines-rejoin';
function saveRejoin(){try{localStorage.setItem(RJ_KEY,JSON.stringify({code:NET.code,name:NET.oppName,at:Date.now()}))}catch(e){}}
function clearRejoin(){try{localStorage.removeItem(RJ_KEY)}catch(e){}}
function readRejoin(){
  if(NET.peer||NET.conn)return null; // still connected in this page
  try{
    const r=JSON.parse(localStorage.getItem(RJ_KEY)||'null');
    if(r&&/^[A-Z]{5}$/.test(r.code)&&Date.now()-r.at<2*3600e3)return{code:r.code,name:cleanName(r.name)};
  }catch(e){}
  return null;
}

function openOnline(code){
  const rj=code?null:readRejoin();
  netClose(true);
  onPanels('choose');
  // signed in, the name comes from the account and is changed on the profile
  const n=$('#myName'),acc=ACCT.token&&ACCT.user;
  n.value=acc?acc.displayName:SAVE.name||'';n.readOnly=!!acc;n.title=acc?'Change your name on your profile':'';
  $('#joinCode').value=code||(rj?rj.code:'');
  onStatus(rj?`You were in game <b class="gold">${rj.code}</b>${rj.name?' with '+esc(rj.name):''}. Tap <b>Join</b> to go back in.`:'');
  show('online');
}
$('#onBack').onclick=()=>{sfx('click');netClose(true);show('menu')};
$('#btnHost').onclick=()=>{sfx('click');hostStart()};
$('#btnJoin').onclick=()=>{sfx('click');joinGame($('#joinCode').value)};
$('#myName').addEventListener('input',e=>{if(e.target.readOnly)return;SAVE.name=cleanName(e.target.value);save();e.target.classList.remove('need')});
$('#joinCode').addEventListener('input',e=>{e.target.value=e.target.value.toUpperCase().replace(/[^A-Z]/g,'').slice(0,5)});
$('#joinCode').addEventListener('keydown',e=>{if(e.key==='Enter')joinGame(e.target.value)});
function inviteLink(code){return location.href.split(/[?#]/)[0]+'?join='+code}
$('#btnCopy').onclick=async()=>{
  const v=$('#hostLink').value;
  try{await navigator.clipboard.writeText(v);toast('Invite link copied')}catch(e){$('#hostLink').select();document.execCommand&&document.execCommand('copy');toast('Invite link copied')}
};
$('#btnShare').onclick=()=>{
  const url=$('#hostLink').value;
  if(navigator.share)navigator.share({title:'Leylines',text:`${myName()} invited you to Leylines. Code: ${NET.code}`,url}).catch(()=>{});
  else $('#btnCopy').click();
};

/* ---------- hosting ---------- */
// hosting opens the waiting room straight away; the code shows up there once the connection is made
async function hostStart(){
  clearRejoin();
  netClose(true);NET.closing=false;NET.role='host';NET.code=null;NET.oppName='';NET.oppAv=null;NET.oppUser='';
  openRoom();
  try{await loadPeerJS()}catch(e){if(!NET.closing){NET.roomMsg=esc(e.message);renderRoom()}return}
  if(NET.closing||NET.role!=='host')return; // left the room while the library loaded
  let tries=0;
  const attempt=()=>hostPeer(newCode(),err=>{
    if(err.type==='unavailable-id'&&tries++<4){try{NET.peer.destroy()}catch(e){}attempt();return}
    NET.roomMsg='Connection error: '+esc(err.type||err.message);roomOpen()&&renderRoom();
  });
  attempt();
}
// the host's line to the matchmaking server, under the room's code. Also gets the same code back after the phone slept.
function hostPeer(code,onFirstErr,tries=0){
  const peer=new Peer(peerId(code));NET.peer=peer;
  peer.on('open',()=>{
    if(NET.peer!==peer)return;
    NET.code=code;NET.roomMsg='';roomOpen()&&renderRoom();
  });
  peer.on('connection',c=>{if(NET.peer===peer&&!NET.closing)onGuest(c)});
  peer.on('error',err=>{
    if(NET.peer!==peer)return;
    if(NET.code!==code){onFirstErr(err);return}
    // getting our own code back: the server may not have noticed the old line is gone yet
    if(err.type==='unavailable-id'&&tries<20){setTimeout(()=>{if(NET.peer===peer&&!NET.closing){try{peer.destroy()}catch(e){}hostPeer(code,onFirstErr,tries+1)}},3000);return}
    if(!NET.conn){NET.roomMsg='Connection error: '+esc(err.type||err.message);roomOpen()&&renderRoom()}
  });
  peer.on('disconnected',()=>setTimeout(()=>{if(NET.peer===peer&&!NET.closing&&!peer.destroyed&&peer.disconnected)try{peer.reconnect()}catch(e){}},1500));
}
function onGuest(c){
  const meta=c.metadata||{},old=NET.conn,mine=!!meta.cid&&meta.cid===NET.gcid;
  const refuse=busy=>{const no=()=>{try{c.send({t:'full',busy})}catch(e){}setTimeout(()=>c.close(),500)};c.open?no():c.on('open',no)};
  // the seat is kept for the player in the match
  if(!mine&&liveMatch()){refuse(true);return}
  if(!mine&&old&&old.open){
    // someone else while the seat looks taken. A phone that went to another app leaves a dead link that still looks open,
    // so wait a moment: the guest pings every 3 seconds, and if nothing came in, the newcomer gets the seat.
    const t=Date.now();
    c.on('open',()=>setTimeout(()=>{
      if(NET.closing||!c.open)return;
      const cur=NET.conn;
      if(cur&&cur.open&&(cur!==old||NET.last>=t)||liveMatch()){refuse(false);return}
      seat(c,meta);
    },4000));
    return;
  }
  seat(c,meta);
}
function seat(c,meta){
  const old=NET.conn;
  if(old&&old!==c){NET.conn=null;try{old.close()}catch(e){}}
  NET.conn=c;bindConn(c);
  const go=()=>{
    if(NET.conn!==c)return;
    NET.last=Date.now();
    NET.oppName=cleanName(meta.name)||'Guest';NET.oppAv=netAv(meta.av);NET.oppUser=netUser(meta.user);
    // the same player and the same pairing, with the match still on: pick up where we left off
    if(NET.sid&&meta.sid===NET.sid&&meta.cid===NET.gcid&&liveMatch()){
      rawSend({t:'hello',sid:NET.sid,resume:true,got:NET.got});
      resend(meta.got);comeBack();return;
    }
    const back=!!meta.cid&&meta.cid===NET.gcid,lost=liveMatch(),ended=!!meta.sid&&meta.sid===NET.ended;
    newSession();NET.gcid=typeof meta.cid==='string'?meta.cid.slice(0,20):'';
    frLoad(); // a player just sat down: their Add friend button should show the real state
    rawSend({t:'hello',sid:NET.sid,ended});
    toast(lost?`${NET.oppName} is back, but your match couldn't be picked up again`:back?`${NET.oppName} reconnected`:`${NET.oppName} joined your game`,lost?4000:2200);
    sfx('banner');
    // a match that was going on is over; everyone meets back in the room
    NET.oppReady=NET.oppIn=false;
    hideAway();
    if(G){G=null;stopTurnTimer();closeModal()}
    if(roomOpen()){sendRoom();renderRoom()}else openRoom();
  };
  c.open?go():c.on('open',go);
}
function newSession(){NET.sid=Math.random().toString(36).slice(2,12);NET.out=[];NET.got=0;NET.away=NET.waiting=false}

/* ---------- joining ---------- */
async function joinGame(code){
  code=(code||'').toUpperCase().replace(/[^A-Z]/g,'');
  if(code.length!==5){onStatus('Enter the 5-letter code from your friend.',true);return}
  // a join that got stuck (the phone went to another app halfway) doesn't block a new one
  if(NET.joining&&Date.now()-NET.joinAt<20000){onStatus('<span class="spin"></span>Already connecting to '+code+'…');return}
  setJoining(true);
  onStatus('<span class="spin"></span>Connecting…');
  try{await loadPeerJS()}catch(e){setJoining(false);onStatus(e.message,true);return}
  netClose(true);NET.closing=false;NET.role='guest';NET.code=code;NET.oppName='';NET.oppAv=null;NET.oppUser='';
  setJoining(true);
  const fail=(msg,gone)=>{if(NET.code!==code||NET.sid)return;if(gone)clearRejoin();netClose(true);onPanels('choose');onStatus(msg,true)};
  NET.joinT=setTimeout(()=>fail('Couldn\'t reach game '+code+'. Check the code and try again.'),20000);
  guestPeer(err=>fail(err.type==='peer-unavailable'?'No game found with code '+code+'.':'Connection error: '+(err.type||err.message),err.type==='peer-unavailable'));
}
// the guest's line to the host. sid and got tell the host which match we're coming back to, and how much of it we heard.
function guestPeer(onErr){
  const peer=new Peer();NET.peer=peer;
  peer.on('open',()=>{
    if(NET.peer!==peer)return;
    if(!NET.sid)onStatus('<span class="spin"></span>Looking for game '+NET.code+'…');
    const c=peer.connect(peerId(NET.code),{reliable:true,metadata:{name:myName(),user:myUser(),cid:SAVE.cid,av:myAv(),sid:NET.sid,got:NET.got}});NET.conn=c;bindConn(c);
    c.on('open',()=>{
      if(NET.conn!==c)return;
      if(NET.sid){clearTimeout(NET.retryT);return}
      clearTimeout(NET.joinT);onPanels('none');onStatus('<span class="spin"></span>Connected as <b class="gold">'+esc(myName())+'</b>. Waiting for the host…');
    });
  });
  peer.on('error',err=>{if(NET.peer===peer)onErr(err)});
}
// while away, the guest keeps knocking on the host's code until it gets back in
function retry(){
  clearTimeout(NET.retryT);
  if(NET.closing||NET.role!=='guest'||!NET.away||!NET.code)return;
  dropLink();
  guestPeer(()=>retryLater(3000));
  NET.retryT=setTimeout(retry,8000); // no answer at all: start over
}
function retryLater(ms=2000){clearTimeout(NET.retryT);NET.retryT=setTimeout(retry,ms)}

/* ---------- the link ---------- */
function bindConn(c){
  NET.last=Date.now();
  c.on('data',m=>{
    if(NET.conn!==c)return;
    NET.last=Date.now();
    // numbered messages are handled once each, in order; repeats after a reconnect are skipped
    if(m&&LOGGED.has(m.t)){if(m.q!==NET.got)return;NET.got++}
    onNet(m);
  });
  c.on('close',()=>{if(NET.conn===c)netLost(`Lost connection to ${oppName()}.`)});
  c.on('error',()=>{});
}
// heartbeat: WebRTC often doesn't report a closed tab, so ping and time out
setInterval(()=>{
  if(!NET.conn||!NET.conn.open||NET.closing)return;
  rawSend({t:'ping'});
  if(Date.now()-NET.last>15000)netLost(`Lost connection to ${oppName()}.`);
},3000);
// closing or leaving the page isn't leaving the match: tell the other side we're away, so they can wait for us
window.addEventListener('pagehide',()=>{
  if(!NET.role||NET.closing)return;
  if(NET.role==='guest'&&!NET.sid){netClose(true);return}
  rawSend({t:'away'});dropLink();
});
// back from another app, a locked screen or a lost signal: check the link is still alive and fix it if not
function checkLink(){
  if(NET.closing||!NET.role)return;
  if(NET.role==='host'&&NET.code){
    if(!NET.peer||NET.peer.destroyed)hostPeer(NET.code,()=>{});
    else if(NET.peer.disconnected)try{NET.peer.reconnect()}catch(e){}
  }
  if(!NET.sid)return;
  if(NET.away){if(NET.role==='guest')retry();return}
  if(!NET.conn||!NET.conn.open){netLost(`Lost connection to ${oppName()}.`);return}
  // a link can look open but be dead after the phone slept; pings come every 3 seconds, so give it a moment
  const t=Date.now(),c=NET.conn;rawSend({t:'ping'});
  setTimeout(()=>{if(NET.conn===c&&!NET.away&&NET.last<t)netLost(`Lost connection to ${oppName()}.`)},5000);
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkLink()});
window.addEventListener('pageshow',e=>{if(e.persisted)checkLink()});
window.addEventListener('online',checkLink);
function rawSend(m){try{NET.conn&&NET.conn.open&&NET.conn.send(m)}catch(e){}}
function netSend(m){
  if(LOGGED.has(m.t)){m={...m,q:NET.out.length};NET.out.push(m)}
  rawSend(m);
}
function resend(n){NET.out.slice(Number.isInteger(n)&&n>0?n:0).forEach(rawSend)}
// drop the connection but keep the match, so we can come back to it
function dropLink(){
  const c=NET.conn,p=NET.peer;NET.conn=null;NET.peer=null;
  try{c&&c.close()}catch(e){}
  try{p&&p.destroy()}catch(e){}
}
function netClose(silent){
  NET.closing=true;
  try{if(NET.conn&&NET.conn.open)NET.conn.send({t:'bye'})}catch(e){}
  dropLink();clearTimeout(NET.retryT);
  NET.meNext=NET.oppNext=0;NET.pendingDeck=null;
  NET.room=null;NET.roomCfg='';NET.roomMsg='';NET.meReady=NET.oppReady=NET.oppIn=false;
  NET.sid=null;NET.gcid='';NET.out=[];NET.got=0;NET.away=NET.waiting=false;NET.ended=null;
  hideAway();setJoining(false);
}
// the connection dropped by accident: hold the match and wait, or try to get back in
function netLost(msg){
  if(NET.closing)return;
  const c=NET.conn;NET.conn=null;try{c&&c.close()}catch(e){}
  if(NET.away){if(NET.role==='guest')retryLater();return}
  if(liveMatch()||(NET.role==='guest'&&NET.sid)){goAway(msg);return}
  if(NET.role==='host'&&NET.code){hostBackToRoom(msg);return}
  netClose(true);G=null;
  modal(`<h2>Disconnected</h2><p>${esc(msg)}</p>`,[{label:'Menu',cls:'primary',fn:()=>show('menu')}]);
}
// the other player left on purpose (Leave, Menu): no waiting
function netGone(msg){
  if(NET.closing)return;
  const playing=liveMatch()&&!G.over;
  if(playing){histXp(recordMatch('w',{online:true}));histAdd('w','them');save();freshToast();msg+=' The match counts as a win.'}
  clearRejoin();hideAway();
  if(NET.role==='host'&&NET.code){hostBackToRoom(msg);return}
  netClose(true);G=null;stopTurnTimer();
  modal(`<h2>${playing?'Match over':'Disconnected'}</h2><p>${esc(msg)}</p>`,[{label:'Menu',cls:'primary',fn:()=>show('menu')}]);
}
function hostBackToRoom(msg){
  const c=NET.conn;NET.conn=null;try{c&&c.close()}catch(e){}
  NET.pendingDeck=null;NET.oppName='';NET.oppAv=null;NET.oppUser='';NET.oppReady=NET.oppIn=false;G=null;stopTurnTimer();
  NET.sid=null;NET.out=[];NET.got=0;NET.away=NET.waiting=false;
  hideAway();closeModal();toast(msg,4000);
  if(roomOpen())renderRoom();else openRoom();
}

/* ---------- waiting for the other player to come back ---------- */
// its own layer above #modal, so whatever was open underneath (the series score, a trade) is still there afterwards
function goAway(msg){
  NET.away=true;NET.waiting=false;NET.awayMsg=msg;
  stopTurnTimer();if(drag)endDrag({},true);
  renderAway();
  if(NET.role==='guest')retryLater(500);
}
function renderAway(){
  const el=$('#away'),opp=`<b class="gold">${esc(oppName())}</b>`,host=NET.role==='host';
  let html,btns;
  if(!liveMatch()){
    html=`<h2>Reconnecting</h2><p>${esc(NET.awayMsg)}</p><p><span class="spin"></span>Trying to get you back in with ${opp}…</p>`;
    btns=[['Leave','danger',()=>{hideAway();closeModal();G=null;stopTurnTimer();leaveRoom()}]];
  }else if(!NET.waiting){
    html=`<h2>Connection lost</h2><p>${host?`${opp} dropped out of the match. They can come back and pick up where you left off.`
      :`You lost connection to ${opp}. We'll keep trying to get you back in.`}</p><p>Wait for them, or abandon the match (it counts as a win for you).</p>`;
    btns=[['Wait','primary',()=>{NET.waiting=true;renderAway()}],['Abandon match','danger',abandonMatch]];
  }else{
    html=`<h2>Waiting</h2><p><span class="spin"></span>${host?`Waiting for ${opp} to come back…`:`Reconnecting to ${opp}…`}</p>`;
    btns=[['Abandon match','danger',abandonMatch]];
  }
  el.innerHTML=`<div class="mbox" tabindex="-1">${html}<div class="mbtns"></div></div>`;
  const bx=el.querySelector('.mbtns');
  for(const[label,cls,fn] of btns){const b=document.createElement('button');b.className='btn '+cls;b.textContent=label;b.onclick=()=>{sfx('click');fn()};bx.append(b)}
  el.querySelector('h2').id='awTitle';el.setAttribute('aria-labelledby','awTitle');
  el.classList.add('on');$('#modal').inert=true;$$('.screen').forEach(s=>s.inert=true);
  el.querySelector('.btn').focus({preventScroll:true});
}
function hideAway(){
  const el=$('#away');if(!el.classList.contains('on'))return;
  el.classList.remove('on');el.innerHTML='';$('#modal').inert=false;
  if(!$('#modal').classList.contains('on'))$$('.screen').forEach(s=>s.inert=false);
}
// they're back (or we are): hand over what they missed and carry on
function comeBack(){
  const was=NET.away;NET.away=NET.waiting=false;NET.last=Date.now();clearTimeout(NET.retryT);
  hideAway();
  if(was){toast(NET.role==='host'?`${oppName()} is back`:'Back in the game');sfx('banner')}
  // a fresh clock for whoever's turn it is, on both sides
  if(G&&G.st&&!G.over&&!G.busy)startTurnTimer();
}
function abandonMatch(){
  const playing=G&&!G.over;
  if(playing){histXp(recordMatch('w',{online:true}));histAdd('w','them');save();freshToast()}
  const msg=playing?'You ended the match. It counts as a win.':'You ended the match.';
  clearRejoin();hideAway();
  // the host keeps the room open; if the other player comes back they're told the match is over
  if(NET.role==='host'){NET.ended=NET.sid;hostBackToRoom(msg);return}
  netClose(true);G=null;stopTurnTimer();closeModal();
  modal(`<h2>Match ended</h2><p>${msg}</p>`,[{label:'Menu',cls:'primary',fn:()=>show('menu')}]);
}

/* ---------- waiting room ---------- */
function openRoom(){
  openSetup('room');
  if(NET.role==='host')sendRoom();
  netSend({t:'inroom'});
}
function leaveRoom(){
  const guest=NET.role==='guest';
  clearRejoin();netClose(true);setupMode='ai';
  if(guest)openOnline();else show('menu');
}
// back to the room after a match (the Rematch button)
function backToRoom(){
  closeModal();G=null;stopTurnTimer();
  if(!NET.conn||!NET.conn.open){if(NET.role==='host'&&NET.code)openRoom();else leaveRoom();return}
  openRoom();
}
function sendRoom(){
  NET.roomCfg=JSON.stringify([SAVE.rules,SAVE.trade,boOf(SAVE.bo)]);
  netSend({t:'room',v:1,rv:NET.rv,rules:{...SAVE.rules},trade:SAVE.trade,bo:boOf(SAVE.bo),name:myName(),user:myUser(),av:myAv()});
}
// the host changed something: tell the guest, and their Ready no longer counts
function roomSync(){
  if(!inRoom()||NET.role!=='host')return;
  if(JSON.stringify([SAVE.rules,SAVE.trade,boOf(SAVE.bo)])===NET.roomCfg)return;
  NET.rv++;NET.oppReady=false;sendRoom();
}
function sendSetup(){
  const seed=rand32(),bo=boOf(SAVE.bo);
  netSend({t:'setup',v:1,rules:{...SAVE.rules},trade:SAVE.trade,bo,seed,name:myName(),user:myUser(),av:myAv()});
  beginOnline({rules:{...SAVE.rules},trade:SAVE.trade,bo,seed});
}
function beginOnline(cfg){
  closeModal();
  NET.meNext=NET.oppNext=0;NET.meReady=NET.oppReady=NET.oppIn=false;
  const me=NET.role==='host'?0:1,other=NET.oppName||(me===0?'Guest':'Host');
  G=baseMatch('online',{rules:cfg.rules,trade:cfg.trade,bo:cfg.bo,seed:cfg.seed,me,bottom:me,names:me===0?[myName(),other]:[other,myName()]});
  if(NET.pendingDeck){G.decks[1-me]=NET.pendingDeck;NET.pendingDeck=null}
  if(deckable(collPool())<5)ensureMinimum();
  const done=ids=>{
    SAVE.lastDeck=ids;save();G.decks[me]=ids;netSend({t:'deck',ids});
    if(!G.decks[1-me]){show('online');onPanels('none');onStatus(`<span class="spin"></span>Waiting for <b class="gold">${esc(oppName())}</b> to choose cards…`)}
    tryStartOnline();
  };
  if(cfg.rules.random){done(randomDeck(collPool()));return}
  openDeck({title:`vs ${other} — choose 5`,pool:collPool(),pre:preDeck(),color:'blue',loadouts:true,onDone:done,
    onBack:()=>modal('<h2>Leave online game?</h2>',[{label:'Leave',cls:'danger',fn:()=>{clearRejoin();netClose(true);G=null;show('menu')}},{label:'Stay',cls:'primary',esc:true}])});
}
function tryStartOnline(){if(G&&G.decks[0]&&G.decks[1]&&!G.st)startMatch()}
function validDeck(ids){return Array.isArray(ids)&&ids.length===5&&ids.every(i=>Number.isInteger(i)&&i>=0&&i<CARDS.length)}
// rules from the host, with anything missing or odd replaced by a safe value
function netRules(m){const r={...defSave().rules,...(m.rules&&typeof m.rules==='object'?m.rules:{})};r.timer=timerSec(r.timer);return r}
const netTrade=t=>TRADES.some(x=>x[0]===t)?t:'none';
function onNet(m){
  if(!m||typeof m!=='object')return;
  switch(m.t){
    case 'full':{
      const code=NET.code,msg=m.busy?`Game ${code} is in the middle of a match.`:`Game ${code} already has two players.`,was=NET.away||!!G;
      clearRejoin();netClose(true);
      if(was){G=null;stopTurnTimer();closeModal();modal(`<h2>Can't get back in</h2><p>${esc(msg)}</p>`,[{label:'Menu',cls:'primary',fn:()=>show('menu')}])}
      else{onPanels('choose');onStatus(msg,true)}
      break;
    }
    case 'hello':{
      if(NET.role!=='guest')return;
      setJoining(false);clearTimeout(NET.retryT);
      // back in the same match: send what the host missed
      if(m.resume&&m.sid===NET.sid){resend(m.got);comeBack();break}
      // a new seat in the room: anything from before is gone
      const had=liveMatch();
      NET.sid=typeof m.sid==='string'?m.sid.slice(0,20):'';NET.out=[];NET.got=0;NET.away=NET.waiting=false;NET.meReady=false;
      hideAway();saveRejoin();frLoad(); // in a room with the host: get the real friend state for their button
      if(had){G=null;stopTurnTimer();closeModal();toast(m.ended?`${oppName()} ended the match while you were away.`:`Your match couldn't be picked up again. Back to the room.`,4000)}
      break;
    }
    case 'room':{
      if(NET.role!=='guest')return;
      setJoining(false);
      NET.oppName=cleanName(m.name)||'Host';NET.oppAv=netAv(m.av);NET.oppUser=netUser(m.user);NET.oppIn=true;
      const rv=Number.isInteger(m.rv)?m.rv:0;
      if(NET.room&&NET.room.rv!==rv)NET.meReady=false;
      NET.room={rules:netRules(m),trade:netTrade(m.trade),bo:boOf(m.bo),rv};
      saveRejoin();
      // still looking at the last match: the new rules wait until Rematch
      if(G&&G.st)break;
      if(roomOpen())renderSetup();else{G=null;openRoom()}
      break;
    }
    case 'inroom':NET.oppIn=true;roomOpen()&&renderRoom();break;
    case 'ready':
      if(NET.role!=='host')return;
      NET.oppIn=true;
      // a Ready only counts for the rules the guest was looking at
      NET.oppReady=!!m.on&&m.rv===NET.rv;
      roomOpen()&&renderRoom();
      break;
    case 'setup':
      if(NET.role!=='guest')return;
      setJoining(false);
      NET.oppName=cleanName(m.name)||'Host';NET.oppAv=netAv(m.av);NET.oppUser=netUser(m.user);
      beginOnline({rules:netRules(m),trade:netTrade(m.trade),bo:boOf(m.bo),seed:m.seed>>>0});break;
    case 'deck':
      if(!validDeck(m.ids))return;
      if(G&&G.mode==='online'&&!G.st){G.decks[1-G.me]=m.ids;tryStartOnline()}
      else NET.pendingDeck=m.ids;
      break;
    case 'move':
      if(G&&G.mode==='online'){G.inbox.push(m);pump()}break;
    case 'trade':
      if(!G||G.mode!=='online'||!Array.isArray(m.idx))return;
      {const idx=m.idx.filter(i=>Number.isInteger(i)&&i>=0&&i<5);
      if(G.onTrade){const f=G.onTrade;G.onTrade=null;closeModal();f(idx)}else G.pendingTrade=idx;}
      break;
    case 'emote':emoteIn(m.i);break;
    case 'friend':frLoad();break; // they sent or accepted a friend request: refresh the Add friend button
    case 'next':
      if(Number.isInteger(m.n)){NET.oppNext=m.n;checkNext()}break;
    case 'away':netLost(`${oppName()} closed the game or switched apps.`);break;
    case 'bye':netGone(`${oppName()} left the game.`);break;
  }
}
function pump(){
  if(!G||G.mode!=='online'||G.busy||G.over||!G.st)return;
  if(G.st.turn===G.me||!G.inbox.length)return;
  const m=G.inbox.shift(),st=G.st;
  if(!Number.isInteger(m.hi)||!Number.isInteger(m.cell)||m.hi<0||m.hi>=st.h[st.turn].length||m.cell<0||m.cell>8||st.b[m.cell]>=0||(G.forced!=null&&m.hi!==G.forced))return pump();
  execMove(m.hi,m.cell);
}
