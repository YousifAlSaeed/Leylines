'use strict';
/* =====================================================================
   ONLINE (PeerJS)
   ===================================================================== */
// waiting room: room = the host's settings as the guest last heard them, rv = their version (bumped on every change, so a
// Ready for older rules doesn't count), roomCfg = what the host last sent, meReady/oppReady, oppIn = the other player is in the room
const NET={peer:null,conn:null,role:null,code:null,meNext:0,oppNext:0,pendingDeck:null,closing:false,oppName:'',oppAv:null,last:0,joining:false,joinT:0,
  room:null,rv:0,roomCfg:'',roomMsg:'',meReady:false,oppReady:false,oppIn:false};
// avatars travel as a card id; anything else means no avatar
const netAv=v=>Number.isInteger(v)&&v>=0&&v<CARDS.length?v:null;
const myAv=()=>SAVE.avatar?SAVE.avatar.c:null;
const CODE_ABC='ABCDEFGHJKLMNPQRSTUVWXYZ';
const peerId=code=>'ninefold-tt-'+code.toLowerCase();
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
function oppName(){return G&&G.mode==='online'&&G.names?G.names[1-G.me]:(NET.oppName||'Your opponent')}
function onStatus(html,err){const s=$('#onStatus');s.innerHTML=html;s.classList.toggle('err',!!err)}
// which lobby panels are visible: 'choose' (name + host/join) or 'none'
function onPanels(which){
  $('#onName').classList.toggle('hidden',which!=='choose');
  $('#onChoose').classList.toggle('hidden',which!=='choose');
}
function setJoining(on){NET.joining=on;$('#btnJoin').disabled=on;clearTimeout(NET.joinT)}
function openOnline(code){
  netClose(true);
  onPanels('choose');
  // signed in, the name comes from the account and is changed on the profile
  const n=$('#myName'),acc=ACCT.token&&ACCT.user;
  n.value=acc?acc.displayName:SAVE.name||'';n.readOnly=!!acc;n.title=acc?'Change your name on your profile':'';
  $('#joinCode').value=code||'';onStatus('');show('online');
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

// hosting opens the waiting room straight away; the code shows up there once the connection is made
async function hostStart(){
  netClose(true);NET.closing=false;NET.role='host';NET.code=null;NET.oppName='';NET.oppAv=null;
  openRoom();
  try{await loadPeerJS()}catch(e){if(!NET.closing){NET.roomMsg=esc(e.message);renderRoom()}return}
  if(NET.closing||NET.role!=='host')return; // left the room while the library loaded
  let tries=0;
  const attempt=()=>{
    const code=Array.from({length:5},()=>CODE_ABC[Math.floor(Math.random()*CODE_ABC.length)]).join('');
    const peer=new Peer(peerId(code));NET.peer=peer;
    peer.on('open',()=>{
      if(NET.peer!==peer)return;
      NET.code=code;NET.roomMsg='';roomOpen()&&renderRoom();
    });
    peer.on('connection',c=>{
      const meta=c.metadata||{},old=NET.conn;
      if(old){
        // let the same device back in (e.g. it pressed Join twice or reloaded), or replace a dead link
        const same=meta.cid&&old.metadata&&old.metadata.cid===meta.cid;
        const stale=!old.open||Date.now()-NET.last>8000;
        if(!same&&!stale){c.on('open',()=>{c.send({t:'full'});setTimeout(()=>c.close(),500)});return}
        NET.conn=null;try{old.close()}catch(e){}
      }
      const rejoin=!!old;
      NET.conn=c;bindConn(c);
      c.on('open',()=>{
        if(NET.conn!==c)return;
        NET.oppName=cleanName(meta.name)||'Guest';NET.oppAv=netAv(meta.av);
        toast(rejoin?`${NET.oppName} reconnected`:`${NET.oppName} joined your game`);
        sfx('banner');
        // a match that was going on is over; everyone meets back in the room
        NET.oppReady=NET.oppIn=false;
        if(G){G=null;stopTurnTimer();closeModal()}
        if(roomOpen()){sendRoom();renderRoom()}else openRoom();
      });
    });
    peer.on('error',err=>{
      if(err.type==='unavailable-id'&&tries++<4){peer.destroy();attempt();return}
      if(NET.peer===peer&&!NET.conn){NET.roomMsg='Connection error: '+esc(err.type||err.message);roomOpen()&&renderRoom()}
    });
    peer.on('disconnected',()=>{if(NET.peer===peer&&!NET.closing&&!peer.destroyed)try{peer.reconnect()}catch(e){}});
  };
  attempt();
}
async function joinGame(code){
  code=(code||'').toUpperCase().replace(/[^A-Z]/g,'');
  if(code.length!==5){onStatus('Enter the 5-letter code from your friend.',true);return}
  if(NET.joining||(NET.role==='guest'&&NET.code===code&&NET.conn&&NET.conn.open)){onStatus('<span class="spin"></span>Already connecting to '+code+'…');return}
  setJoining(true);
  onStatus('<span class="spin"></span>Connecting…');
  try{await loadPeerJS()}catch(e){setJoining(false);onStatus(e.message,true);return}
  netClose(true);NET.closing=false;NET.role='guest';NET.code=code;NET.oppName='';NET.oppAv=null;
  setJoining(true);
  const peer=new Peer();NET.peer=peer;
  const fail=msg=>{if(NET.peer!==peer)return;netClose(true);onPanels('choose');onStatus(msg,true)};
  NET.joinT=setTimeout(()=>fail('Couldn\'t reach game '+code+'. Check the code and try again.'),20000);
  peer.on('open',()=>{
    onStatus('<span class="spin"></span>Looking for game '+code+'…');
    const c=peer.connect(peerId(code),{reliable:true,metadata:{name:myName(),cid:SAVE.cid,av:myAv()}});NET.conn=c;bindConn(c);
    c.on('open',()=>{clearTimeout(NET.joinT);onPanels('none');onStatus('<span class="spin"></span>Connected as <b class="gold">'+esc(myName())+'</b>. Waiting for the host…')});
  });
  peer.on('error',err=>{
    if(NET.peer!==peer)return;
    fail(err.type==='peer-unavailable'?'No game found with code '+code+'.':'Connection error: '+(err.type||err.message));
  });
}
function bindConn(c){
  NET.last=Date.now();
  c.on('data',m=>{if(NET.conn===c){NET.last=Date.now();onNet(m)}});
  c.on('close',()=>{if(NET.conn===c)netLost(`${oppName()} disconnected.`)});
  c.on('error',()=>{});
}
// heartbeat: WebRTC often doesn't report a closed tab, so ping and time out
setInterval(()=>{
  if(!NET.conn||!NET.conn.open||NET.closing)return;
  netSend({t:'ping'});
  if(Date.now()-NET.last>15000)netLost(`Lost connection to ${oppName()}.`);
},3000);
window.addEventListener('pagehide',()=>{if(NET.conn)netClose(true)});
function netSend(m){try{NET.conn&&NET.conn.open&&NET.conn.send(m)}catch(e){}}
function netClose(silent){
  NET.closing=true;
  try{if(NET.conn&&NET.conn.open)NET.conn.send({t:'bye'})}catch(e){}
  try{NET.conn&&NET.conn.close()}catch(e){}
  try{NET.peer&&NET.peer.destroy()}catch(e){}
  NET.conn=null;NET.peer=null;NET.meNext=NET.oppNext=0;NET.pendingDeck=null;
  NET.room=null;NET.roomCfg='';NET.roomMsg='';NET.meReady=NET.oppReady=NET.oppIn=false;
  setJoining(false);
}
function netLost(msg){
  if(NET.closing)return;
  // host whose guest left outside a match: keep the code alive and wait in the room for someone else
  if(NET.role==='host'&&(!G||G.mode!=='online'||!G.st||G.over)&&NET.peer&&!NET.peer.destroyed){hostBackToRoom(msg);return}
  netClose(true);
  if(G&&G.mode==='online'&&!G.over){recordMatch('w',{online:true});freshToast();msg+=' The match counts as a win.'}
  G=null;
  modal(`<h2>Disconnected</h2><p>${esc(msg)}</p>`,[{label:'Menu',cls:'primary',fn:()=>show('menu')}]);
}
function hostBackToRoom(msg){
  const c=NET.conn;NET.conn=null;try{c&&c.close()}catch(e){}
  NET.pendingDeck=null;NET.oppName='';NET.oppAv=null;NET.oppReady=NET.oppIn=false;G=null;stopTurnTimer();
  closeModal();toast(msg);
  if(roomOpen())renderRoom();else openRoom();
}

/* ---------- waiting room ---------- */
function openRoom(){
  openSetup('room');
  if(NET.role==='host')sendRoom();
  netSend({t:'inroom'});
}
function leaveRoom(){
  const guest=NET.role==='guest';
  netClose(true);setupMode='ai';
  if(guest)openOnline();else show('menu');
}
// back to the room after a match (the Rematch button)
function backToRoom(){
  closeModal();G=null;stopTurnTimer();
  if(!NET.conn||!NET.conn.open){if(NET.role==='host'&&NET.peer&&!NET.peer.destroyed)openRoom();else leaveRoom();return}
  openRoom();
}
function sendRoom(){
  NET.roomCfg=JSON.stringify([SAVE.rules,SAVE.trade,boOf(SAVE.bo)]);
  netSend({t:'room',v:1,rv:NET.rv,rules:{...SAVE.rules},trade:SAVE.trade,bo:boOf(SAVE.bo),name:myName(),av:myAv()});
}
// the host changed something: tell the guest, and their Ready no longer counts
function roomSync(){
  if(!inRoom()||NET.role!=='host')return;
  if(JSON.stringify([SAVE.rules,SAVE.trade,boOf(SAVE.bo)])===NET.roomCfg)return;
  NET.rv++;NET.oppReady=false;sendRoom();
}
function sendSetup(){
  const seed=rand32(),bo=boOf(SAVE.bo);
  netSend({t:'setup',v:1,rules:{...SAVE.rules},trade:SAVE.trade,bo,seed,name:myName(),av:myAv()});
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
    onBack:()=>modal('<h2>Leave online game?</h2>',[{label:'Leave',cls:'danger',fn:()=>{netClose(true);G=null;show('menu')}},{label:'Stay',cls:'primary',esc:true}])});
}
function tryStartOnline(){if(G&&G.decks[0]&&G.decks[1]&&!G.st)startMatch()}
function validDeck(ids){return Array.isArray(ids)&&ids.length===5&&ids.every(i=>Number.isInteger(i)&&i>=0&&i<CARDS.length)}
// rules from the host, with anything missing or odd replaced by a safe value
function netRules(m){const r={...defSave().rules,...(m.rules&&typeof m.rules==='object'?m.rules:{})};r.timer=timerSec(r.timer);return r}
const netTrade=t=>TRADES.some(x=>x[0]===t)?t:'none';
function onNet(m){
  if(!m||typeof m!=='object')return;
  switch(m.t){
    case 'full':{const code=NET.code;netClose(true);onPanels('choose');onStatus(`Game ${code} already has two players.`,true);break}
    case 'room':{
      if(NET.role!=='guest')return;
      setJoining(false);
      NET.oppName=cleanName(m.name)||'Host';NET.oppAv=netAv(m.av);NET.oppIn=true;
      const rv=Number.isInteger(m.rv)?m.rv:0;
      if(NET.room&&NET.room.rv!==rv)NET.meReady=false;
      NET.room={rules:netRules(m),trade:netTrade(m.trade),bo:boOf(m.bo),rv};
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
      NET.oppName=cleanName(m.name)||'Host';NET.oppAv=netAv(m.av);
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
    case 'next':
      if(Number.isInteger(m.n)){NET.oppNext=m.n;checkNext()}break;
    case 'bye':netLost(`${oppName()} left the game.`);break;
  }
}
function pump(){
  if(!G||G.mode!=='online'||G.busy||G.over||!G.st)return;
  if(G.st.turn===G.me||!G.inbox.length)return;
  const m=G.inbox.shift(),st=G.st;
  if(!Number.isInteger(m.hi)||!Number.isInteger(m.cell)||m.hi<0||m.hi>=st.h[st.turn].length||m.cell<0||m.cell>8||st.b[m.cell]>=0||(G.forced!=null&&m.hi!==G.forced))return pump();
  execMove(m.hi,m.cell);
}
