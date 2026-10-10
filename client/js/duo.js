'use strict';
/* =====================================================================
   4-PLAYER ONLINE: 2v2 and Free-for-all (PeerJS) — being tested: online only, no trades, no rewards
   ===================================================================== */
// The host's device runs the match: it holds the board, the four decks and the CPUs, checks every move, and sends
// each player a snapshot after every change (the other team's hands hidden). Guests only send what they do.
// Seats go clockwise from the host: 0 bottom, 1 left, 2 top, 3 right. In 2v2, 0+2 and 1+3 are the teams;
// in Free-for-all (rules.ffa) everyone plays for themselves.
// A seat is {kind:'open'|'human'|'cpu', name, user, av, tok, ready, diff, away, awayAt, bot}:
//   tok = the player's rejoin key, away = their link dropped, bot = a CPU (Normal) is playing their cards until they're back.
const DUO_GRACE=60;      // seconds a dropped player has before a CPU takes over their cards
const DUO_HOST_WAIT=60;  // seconds the others wait for a host whose link dropped (a brief glitch) before the match ends
const DUO_REWARDS=false; // Crossroads is being tested: no XP, shards or stats yet
const DUO={role:null,code:null,peer:null,conn:null,conns:{},kicked:new Set(),seats:[],me:0,rules:duoDefRules(),phase:'room',decks:[],st:null,seed:0,last:null,
  turnEnd:0,turnN:-1,cpuT:0,tickT:0,v:0,closing:false,
  // guest side
  snap:null,snapAt:0,tok:'',hostLast:0,hostAway:false,hostAwayAt:0,retryT:0,joinT:0,
  // both: the picked hand card, a move sent and not answered yet, the last move animated, the result shown, picking a deck
  sel:null,pending:false,shownN:-1,resultV:-1,picking:false,
  // the move animations (duoPump): snapshots waiting to play, the board on screen, the last queued move, a playing flag, a stop counter
  animQ:[],boardSt:null,qN:-1,animating:false,gen:0};
const DUO_HOST_KEY='leylines-duo-host',DUO_RJ_KEY='leylines-duo-rejoin',DUO_RULES_KEY='leylines-duo-rules';
// The host's device runs the match, and when the host leaves (in any way) the match ends for everyone: nothing is kept
// to resume it. A match saved by an older version is cleared.
const DUO_HOST_LEFT='The host left, so the match is over.';
const duoOpen=()=>({kind:'open'});
const duoNewTok=()=>Math.random().toString(36).slice(2,12);
function duoLS(k,v){try{if(v===undefined)return JSON.parse(localStorage.getItem(k)||'null');if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,JSON.stringify(v))}catch(e){}return null}
function duoLoadRules(){const r=duoLS(DUO_RULES_KEY),d=duoDefRules();if(r&&typeof r==='object')for(const k in d)if(typeof r[k]===typeof d[k])d[k]=r[k];d.timer=timerSec(d.timer);return d}
// a Crossroads game this device joined and can go back into, for the menu's Rejoin button: {code, host:false}
// (a host can't go back: their leaving ended it)
function duoResumeInfo(){
  if(DUO.role)return null;
  const g=duoLS(DUO_RJ_KEY);
  return g&&/^[A-Z]{5}$/.test(g.code)&&Date.now()-g.at<2*3600e3?{code:g.code,host:false}:null;
}
duoLS(DUO_HOST_KEY,null);
function duoName(){return playerName()||'Player'}
// colours: in 2v2 your team is blue and theirs red, from where you sit. In Free-for-all each seat has its own
// colour, the same on everyone's screen: players pick one in the room (CPUs get a free one)
const DUO_COLS=['blue','red','gold','green','purple','teal'];
const DUO_COL_NAME={blue:'Blue',red:'Red',gold:'Gold',green:'Green',purple:'Purple',teal:'Teal'};
const duoCol=(S,q)=>S.rules.ffa?(S.seats[q].col||DUO_COLS[q]):duoTeam(q)===duoTeam(S.you)?'blue':'red';
// the first colour no seat has taken (host only)
const duoFreeCol=()=>DUO_COLS.find(c=>!DUO.seats.some(s=>s.kind!=='open'&&s.col===c));
const duoMode=R=>R.ffa?'Free-for-all':'2v2';
const duoSeatName=s=>s.kind==='cpu'?`CPU ${s.diff==='easy'?'Easy':'Normal'}`:s.kind==='human'?s.name:'Open seat';

/* =====================================================================
   HOST
   ===================================================================== */
async function duoHost(){
  netClose(true);duoQuit();
  DUO.role='host';DUO.closing=false;DUO.me=0;
  DUO.code=newCode();DUO.rules=duoLoadRules();DUO.phase='room';DUO.st=null;DUO.last=null;DUO.decks=[null,null,null,null];
  DUO.seats=[{kind:'human',name:duoName(),user:myUser(),av:myAv(),tok:'host',ready:true,col:'blue'},duoOpen(),duoOpen(),duoOpen()];
  duoBroadcast();
  try{await loadPeerJS()}catch(e){toast(e.message,4000);duoQuit();show('menu');return}
  if(DUO.role!=='host'||DUO.closing)return;
  duoHostPeer(0);
}
// the host's line to the matchmaking server, under the room's code (a 1v1 guest who types it is sent over here)
function duoHostPeer(tries){
  const peer=new Peer(peerId(DUO.code));DUO.peer=peer;
  peer.on('open',()=>{if(DUO.peer!==peer)return;DUO.hostAway=false;duoBroadcast()});
  peer.on('connection',c=>{if(DUO.peer!==peer||DUO.closing)return;c.on('open',()=>duoGuestIn(c))});
  peer.on('error',err=>{
    if(DUO.peer!==peer)return;
    if(err.type==='unavailable-id'){
      // a new room with a taken code picks another; a room coming back waits for the old line to time out
      if(DUO.phase==='room'&&!DUO.st&&tries<4){try{peer.destroy()}catch(e){}DUO.code=newCode();duoHostPeer(tries+1);return}
      if(tries<20){setTimeout(()=>{if(DUO.peer===peer&&!DUO.closing){try{peer.destroy()}catch(e){}duoHostPeer(tries+1)}},3000);return}
    }
    if(err.type!=='peer-unavailable')toast('Connection error: '+(err.type||err.message),3000);
  });
  peer.on('disconnected',()=>setTimeout(()=>{if(DUO.peer===peer&&!DUO.closing&&!peer.destroyed&&peer.disconnected)try{peer.reconnect()}catch(e){}},1500));
}
function duoGuestIn(c){
  const meta=c.metadata||{},refuse=(m)=>{try{c.send(m)}catch(e){}setTimeout(()=>{try{c.close()}catch(e){}},600)};
  // someone typed this code into the 1v1 Join box: tell them it's a 2v2 room, and their game joins again as a 2v2 player
  if(!meta.duo){refuse({t:'duo'});return}
  const tok=typeof meta.tok==='string'?meta.tok.slice(0,20):'';
  if(tok&&DUO.kicked.has(tok)){refuse({t:'end',kick:1,why:'The host removed you from this room.'});return}
  let i=tok?DUO.seats.findIndex((s,k)=>k!==DUO.me&&s.kind==='human'&&s.tok===tok):-1;
  // the same key while that player's line is still alive: another tab on the same device, so a new player
  if(i>=0&&DUO.conns[i]&&DUO.conns[i].open&&!DUO.seats[i].away&&Date.now()-(DUO.conns[i].seenAt||0)<6000)i=-1;
  const name=cleanName(meta.name)||'Player';
  if(i>=0){
    const s=DUO.seats[i],was=s.away||s.bot;
    const old=DUO.conns[i];if(old&&old!==c)try{old.close()}catch(e){}
    Object.assign(s,{name,user:netUser(meta.user),av:netAv(meta.av),away:false,awayAt:0,bot:false});
    if(was){toast(`${name} is back`);sfx('banner')}
    if(DUO.st&&DUO.st.turn===i)DUO.turnN=-1; // a fresh turn timer for a player back on their turn
  }else{
    if(DUO.phase!=='room'){refuse({t:'full',busy:true});return}
    i=[1,2,3].find(k=>DUO.seats[k].kind==='open');
    if(i==null)i=[1,2,3].find(k=>DUO.seats[k].kind==='cpu'); // a player takes a CPU's seat
    if(i==null){refuse({t:'full'});return}
    const col=DUO.seats[i].kind==='cpu'&&DUO.seats[i].col||duoFreeCol(); // taking a CPU's seat takes its colour too
    DUO.seats[i]={kind:'human',name,user:netUser(meta.user),av:netAv(meta.av),tok:duoNewTok(),ready:false,col};
    toast(`${name} joined`);sfx('banner');
  }
  // when we last heard from this link (kept on the link, so it follows the player when seats move)
  DUO.conns[i]=c;c.seenAt=Date.now();
  c.on('data',m=>{const k=duoSeatOf(c);if(k<0)return;c.seenAt=Date.now();duoFromGuest(k,m)});
  c.on('close',()=>{const k=duoSeatOf(c);if(k>=0)duoSeatLost(k)});
  c.on('error',()=>{});
  try{c.send({t:'welcome',tok:DUO.seats[i].tok})}catch(e){}
  duoChanged();
}
const duoSeatOf=c=>{for(const k in DUO.conns)if(DUO.conns[k]===c)return +k;return -1};
function duoFromGuest(i,m){
  if(!m||typeof m!=='object')return;
  const s=DUO.seats[i];
  switch(m.t){
    case 'ready':if(DUO.phase==='room'){s.ready=!!m.on;duoChanged()}break;
    case 'sit':duoSit(i,m.i);break;
    case 'color':duoSetCol(i,m.c);break;
    case 'back':if(DUO.phase==='over')duoBackToRoom();break; // anyone can take the table back to the room after a match
    case 'deck':if(DUO.phase==='decks'&&!DUO.decks[i]&&validDeck(m.ids)){DUO.decks[i]=m.ids.slice();duoChanged()}break;
    case 'move':if(DUO.phase==='play'&&DUO.st.turn===i&&!s.bot&&m.n===DUO.st.n&&duoLegal(m.hi,m.cell))duoApply(m.hi,m.cell);break;
    case 'away':duoSeatLost(i);break;
    case 'leave':
      // left on purpose: in the room the seat frees up; in a match a CPU plays their cards straight away (they can still come back)
      if(DUO.phase==='room'){DUO.seats[i]=duoOpen();toast(`${s.name} left`)}
      else{s.away=true;s.awayAt=Date.now()-DUO_GRACE*1000;s.bot=true;toast(`${s.name} left. A CPU plays their cards.`,3000)}
      {const c=DUO.conns[i];delete DUO.conns[i];setTimeout(()=>{try{c&&c.close()}catch(e){}},300)}
      duoChanged();break;
  }
}
function duoSeatLost(i){
  const s=DUO.seats[i],c=DUO.conns[i];delete DUO.conns[i];try{c&&c.close()}catch(e){}
  if(!s||s.kind!=='human'||i===DUO.me)return;
  if(DUO.phase==='room'){DUO.seats[i]=duoOpen();toast(`${s.name} left the room`);duoChanged();return}
  if(s.away)return;
  s.away=true;s.awayAt=Date.now();
  toast(`${s.name} disconnected`,2500);duoChanged();
}
// move to an open seat (or a CPU's) in the room
function duoSit(i,to){
  if(DUO.phase!=='room'||!Number.isInteger(to)||to<0||to>3||to===i)return;
  const t=DUO.seats[to];if(t.kind==='human')return;
  DUO.seats[to]=DUO.seats[i];DUO.seats[i]=duoOpen();
  if(DUO.conns[i]){DUO.conns[to]=DUO.conns[i];delete DUO.conns[i]}
  if(i===DUO.me)DUO.me=to;
  duoChanged();
}
// the host swaps two seats in the room (Switch team swaps a player with the next seat round the table, on the other team)
function duoSwap(a,b){
  if(DUO.role!=='host'||DUO.phase!=='room'||a===b)return;
  [DUO.seats[a],DUO.seats[b]]=[DUO.seats[b],DUO.seats[a]];
  const ca=DUO.conns[a],cb=DUO.conns[b];delete DUO.conns[a];delete DUO.conns[b];if(ca)DUO.conns[b]=ca;if(cb)DUO.conns[a]=cb;
  if(DUO.me===a)DUO.me=b;else if(DUO.me===b)DUO.me=a;
  duoChanged();
}
// the host removes a player from the room; their key can't get back into this room
function duoKick(i){
  const s=DUO.seats[i];
  if(DUO.role!=='host'||DUO.phase!=='room'||i===DUO.me||s.kind!=='human')return;
  DUO.kicked.add(s.tok);
  const c=DUO.conns[i];delete DUO.conns[i];
  try{c&&c.send({t:'end',kick:1,why:'The host removed you from the room.'})}catch(e){}
  setTimeout(()=>{try{c&&c.close()}catch(e){}},400);
  DUO.seats[i]=duoOpen();toast(`${s.name} was removed`);duoChanged();
}
function duoSetSeat(i,kind){
  if(DUO.role!=='host'||DUO.phase!=='room'||DUO.seats[i].kind==='human')return;
  DUO.seats[i]=kind==='open'?duoOpen():{kind:'cpu',diff:kind,col:DUO.seats[i].col||duoFreeCol()};duoChanged();
}
function duoFill(){[0,1,2,3].forEach(i=>{if(DUO.seats[i].kind==='open')DUO.seats[i]={kind:'cpu',diff:'normal',col:duoFreeCol()}});duoChanged()}
// a player picks their Free-for-all colour: any colour another seat hasn't taken
function duoSetCol(i,c){
  if(DUO.role!=='host'||DUO.phase!=='room'||!DUO_COLS.includes(c)||DUO.seats[i].kind!=='human')return;
  if(DUO.seats.some((s,k)=>k!==i&&s.kind!=='open'&&s.col===c))return;
  DUO.seats[i].col=c;duoChanged();
}
// what stops the host from starting: '' when everyone's in and ready
function duoStartBlock(){
  const S=DUO.seats;
  if(!DUO.code||!DUO.peer||!DUO.peer.open)return 'Connecting…';
  if(S.some(s=>s.kind==='open'))return 'Fill every seat: wait for friends, or add a CPU.';
  const nr=S.filter((s,i)=>i!==DUO.me&&s.kind==='human'&&!s.ready).map(s=>s.name);
  if(nr.length)return `Waiting for ${nr.join(' and ')} to be ready.`;
  return '';
}
function duoStart(){
  if(DUO.role!=='host'||DUO.phase!=='room'||duoStartBlock())return;
  DUO.phase='decks';DUO.seed=rand32();DUO.st=null;DUO.last=null;
  DUO.decks=DUO.seats.map(s=>s.kind==='cpu'?duoCpuDeck(s.diff):null);
  DUO.seats.forEach(s=>{s.away=false;s.bot=false});
  duoLS(DUO_RULES_KEY,DUO.rules);
  duoChanged();
}
function duoBegin(){
  const rng=mulberry32(DUO.seed);
  DUO.st=duoNew(DUO.decks,Math.floor(rng()*4),duoElements(DUO.rules,rng));
  DUO.phase='play';DUO.last=null;DUO.turnN=-1;
  duoChanged();
}
const duoLegal=(hi,cell)=>Number.isInteger(hi)&&Number.isInteger(cell)&&hi>=0&&hi<DUO.st.h[DUO.st.turn].length&&cell>=0&&cell<16&&DUO.st.b[cell]<0;
function duoApply(hi,cell){
  const st=DUO.st,p=st.turn,id=st.h[p][hi],ev=[];
  duoPlay(st,DUO.rules,hi,cell,ev);
  DUO.last={n:st.n,p,cell,id,ev};
  if(duoFull(st))DUO.phase='over';
  duoChanged();
}
// the host's clock: CPUs move, dropped players' time runs out, the turn timer plays for a player who ran out
function duoTick(){
  clearTimeout(DUO.tickT);clearTimeout(DUO.cpuT);
  if(DUO.role!=='host'||DUO.closing)return;
  const now=Date.now(),grace=DUO_GRACE*1000;
  let next=Infinity,changed=false;
  // a dropped player's minute is up: a CPU (Normal) takes over their seat, with their cards
  DUO.seats.forEach(s=>{
    if(s.kind!=='human'||!s.away||s.bot)return;
    if(now-s.awayAt>=grace){s.bot=true;changed=true;toast(`A CPU is playing for ${s.name}`,2500)}
    else next=Math.min(next,s.awayAt+grace-now);
  });
  if(DUO.phase==='decks'){
    // a player who left before choosing gets a CPU's hand
    DUO.seats.forEach((s,i)=>{if(!DUO.decks[i]&&s.bot){DUO.decks[i]=duoCpuDeck('normal');changed=true}});
    if(DUO.decks.every(Boolean)){duoBegin();return}
  }
  if(changed){duoChanged();return}
  if(DUO.phase==='play'){
    const st=DUO.st,s=DUO.seats[st.turn],n=st.n;
    if(s.kind==='cpu'||s.bot){
      DUO.cpuT=setTimeout(()=>{
        if(DUO.role!=='host'||DUO.phase!=='play'||DUO.st.n!==n)return;
        const[hi,cell]=duoChoose(DUO.st,DUO.rules,s.kind==='cpu'?s.diff:'normal');
        duoApply(hi,cell);
      },650+Math.random()*700+duoAnimMs(DUO.last));
    }else if(!s.away&&DUO.rules.timer){
      if(DUO.turnN!==n){DUO.turnN=n;DUO.turnEnd=now+DUO.rules.timer*1000+duoAnimMs(DUO.last);duoBroadcast()}
      next=Math.min(next,DUO.turnEnd-now);
      if(now>=DUO.turnEnd){
        // out of time: a random card on a random square, like 1v1
        const hi=Math.floor(Math.random()*st.h[st.turn].length),free=st.b.flatMap((x,c)=>x<0?[c]:[]);
        duoApply(hi,free[Math.floor(Math.random()*free.length)]);return;
      }
    }
  }
  if(next<Infinity)DUO.tickT=setTimeout(duoTick,Math.max(50,next+30));
}
// after every change: tell everyone, run the clock
function duoChanged(){duoBroadcast();duoTick()}
// one player's snapshot: the other team's hands are hidden unless Open is on
function duoSnap(i){
  const R=DUO.rules,now=Date.now();
  let st=null;
  if(DUO.st){st=duoClone(DUO.st);if(!R.open)st.h=st.h.map((h,q)=>duoSide(R,q)===duoSide(R,i)?h:h.map(()=>-1))}
  return{t:'snap',v:++DUO.v,code:DUO.code,you:i,phase:DUO.phase,rules:R,st,last:DUO.last,
    seats:DUO.seats.map((s,k)=>({kind:s.kind,name:s.name||'',col:s.col||'',av:s.av==null?null:s.av,diff:s.diff||'',ready:!!s.ready,away:!!s.away,bot:!!s.bot,
      left:s.away&&!s.bot?Math.max(0,Math.ceil((s.awayAt+DUO_GRACE*1000-now)/1000)):0,deck:!!DUO.decks[k],host:k===DUO.me})),
    // the turn timer only runs for a player who's here (a dropped player's minute is the countdown above)
    timeLeft:DUO.phase==='play'&&DUO.rules.timer&&DUO.turnN===(DUO.st&&DUO.st.n)&&!DUO.seats[DUO.st.turn].away?Math.max(0,DUO.turnEnd-now):0,
    online:!!(DUO.peer&&DUO.peer.open)};
}
function duoBroadcast(){
  if(DUO.role!=='host')return;
  for(const k in DUO.conns){const c=DUO.conns[k];if(c&&c.open)try{c.send(duoSnap(+k))}catch(e){}}
  duoGot(duoSnap(DUO.me));
}

/* =====================================================================
   GUEST
   ===================================================================== */
// tok: the rejoin key from the menu's Rejoin button; otherwise this tab's own key (sessionStorage), so a reload gets the seat back
async function duoJoin(code,tok){
  code=String(code||'').toUpperCase();
  duoQuit();
  DUO.role='guest';DUO.code=code;DUO.closing=false;
  try{tok=tok||sessionStorage.getItem('duo-tok:'+code)||''}catch(e){tok=tok||''}
  DUO.tok=tok;
  if(!$('#scr-online').classList.contains('on')&&!$('#scr-duo').classList.contains('on'))openOnline(code);
  onPanels('none');onStatus('<span class="spin"></span>Joining Crossroads game '+esc(code)+'…');
  try{await loadPeerJS()}catch(e){onPanels('choose');onStatus(esc(e.message),true);DUO.role=null;return}
  if(DUO.role!=='guest'||DUO.code!==code)return;
  DUO.joinT=setTimeout(()=>{if(DUO.role==='guest'&&!DUO.snap){duoQuit();onPanels('choose');onStatus('Couldn\'t reach game '+esc(code)+'. Check the code and try again.',true)}},20000);
  duoConnect();
}
function duoConnect(){
  clearTimeout(DUO.retryT);
  const old=DUO.peer;DUO.peer=null;try{DUO.conn&&DUO.conn.close()}catch(e){}try{old&&old.destroy()}catch(e){}
  const peer=new Peer();DUO.peer=peer;
  peer.on('open',()=>{
    if(DUO.peer!==peer)return;
    const c=peer.connect(peerId(DUO.code),{reliable:true,metadata:{duo:1,name:duoName(),user:myUser(),av:myAv(),tok:DUO.tok}});DUO.conn=c;
    c.on('open',()=>{if(DUO.conn===c){DUO.hostLast=Date.now()}});
    c.on('data',m=>{if(DUO.conn===c){DUO.hostLast=Date.now();duoFromHost(m)}});
    c.on('close',()=>{if(DUO.conn===c)duoHostLost()});
    c.on('error',()=>{});
  });
  peer.on('error',err=>{
    if(DUO.peer!==peer)return;
    if(err.type==='peer-unavailable'&&!DUO.snap){clearTimeout(DUO.joinT);duoQuit();duoLS(DUO_RJ_KEY,null);onPanels('choose');onStatus('No game found with that code.',true);return}
    duoHostLost();
  });
}
function duoFromHost(m){
  if(!m||typeof m!=='object')return;
  switch(m.t){
    case 'welcome':
      DUO.tok=String(m.tok||'').slice(0,20);
      try{sessionStorage.setItem('duo-tok:'+DUO.code,DUO.tok)}catch(e){}
      {const o=duoLS(DUO_RJ_KEY);duoLS(DUO_RJ_KEY,{code:DUO.code,tok:DUO.tok,at:Date.now(),since:o&&o.code===DUO.code&&o.since||Date.now()})}
      clearTimeout(DUO.joinT);
      clearTimeout(DUO.goneT);
      if(DUO.hostAway){DUO.hostAway=false;toast('Back in the game');sfx('banner')}
      break;
    case 'snap':if(Number.isInteger(m.you)&&m.you>=0&&m.you<4&&Array.isArray(m.seats))duoGot(m);break;
    case 'full':{
      const msg=m.busy?`Game ${DUO.code} is in the middle of a match.`:`Game ${DUO.code} already has four players.`;
      const was=!!DUO.snap;duoLS(DUO_RJ_KEY,null);duoQuit();
      if(was){show('menu');modal(`<h2>Can't get back in</h2><p>${esc(msg)}</p>`,[{label:'OK',cls:'primary'}])}
      else{openOnline();onStatus(esc(msg),true)}
      break;
    }
    case 'end':{
      duoLS(DUO_RJ_KEY,null);duoQuit();show('menu');
      modal(`<h2>${m.kick?'Removed':'Match over'}</h2><p>${esc(String(m.why||'The host closed the room.').slice(0,120))}</p>`,[{label:'OK',cls:'primary'}]);
      break;
    }
  }
}
// lost the host: keep knocking on the room's code; a host that reloads comes back under the same code
function duoHostLost(){
  if(DUO.role!=='guest'||DUO.closing)return;
  if(!DUO.snap){return} // still joining: the join timeout reports it
  if(!DUO.hostAway){DUO.hostAway=true;DUO.hostAwayAt=Date.now();duoRender();clearTimeout(DUO.goneT);DUO.goneT=setTimeout(duoHostGone,DUO_HOST_WAIT*1000)}
  clearTimeout(DUO.retryT);DUO.retryT=setTimeout(()=>{if(DUO.role==='guest'&&DUO.hostAway&&!DUO.closing)duoConnect()},3000);
}
// the host didn't come back: the match is over (the host's device ran it)
function duoHostGone(){
  if(DUO.role!=='guest'||!DUO.hostAway)return;
  duoLS(DUO_RJ_KEY,null);duoQuit();show('menu');
  modal(`<h2>Match over</h2><p>${DUO_HOST_LEFT}</p>`,[{label:'OK',cls:'primary'}]);
}
function duoSend(m){try{DUO.conn&&DUO.conn.open&&DUO.conn.send(m)}catch(e){}}

/* ---------- the link, both sides ---------- */
setInterval(()=>{
  if(!DUO.role||DUO.closing)return;
  const now=Date.now();
  if(DUO.role==='host'){
    for(const k in DUO.conns){const c=DUO.conns[k];if(!c)continue;try{c.open&&c.send({t:'ping'})}catch(e){}if(now-(c.seenAt||0)>15000)duoSeatLost(+k)}
    // the countdowns on everyone's screen
    if((DUO.phase==='play'||DUO.phase==='decks')&&DUO.seats.some(s=>s.away&&!s.bot))duoBroadcast();
  }else if(DUO.conn&&DUO.conn.open){
    duoSend({t:'ping'});
    if(now-DUO.hostLast>15000)duoHostLost();
  }
  if(DUO.role==='guest'&&DUO.hostAway&&$('#scr-duo').classList.contains('on'))duoNetBar();
},3000);
window.addEventListener('pagehide',()=>{
  if(!DUO.role||DUO.closing)return;
  if(DUO.role==='guest')duoSend({t:'away'});
  else duoEndAll(DUO_HOST_LEFT); // the host closed or reloaded the game: it's over for everyone
});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden||!DUO.role||DUO.closing)return;
  if(DUO.role==='host'){
    if(!DUO.peer||DUO.peer.destroyed)duoHostPeer(0);else if(DUO.peer.disconnected)try{DUO.peer.reconnect()}catch(e){}
    duoTick();
  }else if(!DUO.conn||!DUO.conn.open||Date.now()-DUO.hostLast>8000)duoHostLost();
});
// the host tells everyone the match is over (guests show why and go back to the menu)
function duoEndAll(why){for(const k in DUO.conns)try{DUO.conns[k].send({t:'end',why})}catch(e){}}
// leave everything behind: used before a new game and when the menu opens. A host leaving ends the match for everyone.
function duoQuit(){
  const told=DUO.role==='host'&&Object.keys(DUO.conns).length>0;
  if(DUO.role==='host'&&!DUO.closing)duoEndAll(DUO_HOST_LEFT);
  DUO.closing=true;
  [DUO.tickT,DUO.cpuT,DUO.retryT,DUO.joinT,DUO.goneT].forEach(clearTimeout);
  // a host's goodbye gets a moment to reach everyone before the links close
  const conns=Object.values(DUO.conns),conn=DUO.conn,peer=DUO.peer;
  const shut=()=>{conns.forEach(c=>{try{c.close()}catch(e){}});try{conn&&conn.close()}catch(e){}try{peer&&peer.destroy()}catch(e){}};
  if(told)setTimeout(shut,400);else shut();
  Object.assign(DUO,{role:null,code:null,peer:null,conn:null,conns:{},kicked:new Set(),seats:[],st:null,last:null,phase:'room',snap:null,hostAway:false,
    sel:null,pending:false,shownN:-1,resultV:-1,picking:false,deckSent:false,turnN:-1,animQ:[],boardSt:null,qN:-1,animating:false});
  DUO.gen++;if(INV.code&&!NET.role)invCancel(); // a hosted room's invites go down with it (pulse.js)
  $('#duoNet')&&$('#duoNet').classList.add('hidden');
}
// the Leave / Menu button
function duoLeave(){
  // a guest only knows the phase from the host's last snapshot
  const host=DUO.role==='host',ph=host?DUO.phase:DUO.snap&&DUO.snap.phase,inMatch=ph==='decks'||ph==='play';
  const go=()=>{
    if(host){
      duoEndAll(inMatch?'The host ended the match.':'The host closed the room.');DUO.closing=true;
      setTimeout(()=>{duoQuit();show('menu')},250);
    }else{
      duoSend({t:'leave'});
      // a match keeps the Rejoin button on the menu; a room doesn't
      if(!inMatch)duoLS(DUO_RJ_KEY,null);
      setTimeout(()=>{duoQuit();show('menu')},250);
    }
  };
  if(!inMatch&&!(host&&DUO.seats.some((s,i)=>i!==DUO.me&&s.kind==='human'))){go();return}
  modal(host?`<h2>${inMatch?'End the match?':'Close the room?'}</h2><p>${inMatch?'You\'re the host, so the match ends for everyone.':'Everyone in the room is sent back to the menu.'}</p>`
    :inMatch?`<h2>Leave the match?</h2><p>A CPU plays your cards${DUO.snap&&DUO.snap.rules.ffa?'':' for your partner'}. You can rejoin from the menu while the match is on.</p>`:'<h2>Leave the room?</h2>',
    [{label:host?(inMatch?'End match':'Close room'):'Leave',cls:'danger',wait:true,fn:go},{label:'Stay',cls:'primary',esc:true}]);
}

/* =====================================================================
   SCREENS (both sides draw from the latest snapshot)
   ===================================================================== */
const duoOn=id=>$('#scr-'+id).classList.contains('on');
function duoGot(snap){
  const prev=DUO.snap;DUO.snap=snap;DUO.snapAt=Date.now();DUO.pending=false;
  if(DUO.role==='guest'){clearTimeout(DUO.joinT);clearTimeout(DUO.goneT);DUO.hostAway=false}
  const ph=snap.phase,me=snap.you;
  if(ph==='room'){
    DUO.picking=false;DUO.deckSent=false;DUO.shownN=-1;
    DUO.animQ=[];DUO.boardSt=null;DUO.qN=-1;DUO.animating=false;DUO.gen++;
    DUO.resultV=-1; // the next match shows its result too (guests as well as the host)
    if(prev&&prev.phase==='over'&&$('#modal').classList.contains('on'))closeModal();
    if(!duoOn('duoroom')&&!$('#modal').classList.contains('on')||prev&&prev.phase!=='room')show('duoroom');
    duoRoomRender();return;
  }
  if(ph==='decks'){
    if(!snap.seats[me].deck&&!DUO.picking&&!DUO.deckSent){duoPickDeck();return}
    if(DUO.picking)return;
    if(!duoOn('duo'))duoShowGame();
    duoRender();return;
  }
  // play / over: each new move plays as an animation (duoPump), then the result shows
  if(!duoOn('duo')){DUO.picking=false;duoShowGame()}
  duoQueue(snap);
  duoRender();
}
/* ---------- move animations, like 1v1 (match.js execMove): the card drops in, then each flip turns in order ---------- */
// how long a move's animation takes, so the host can wait for it before a CPU moves or a turn timer starts
const duoAnimMs=L=>L&&L.ev?320+L.ev.reduce((a,e)=>a+(e.t==='seal'?800:e.t==='basic'?560:800+560),0):0;
function duoQueue(S){
  if(!S.st){DUO.animQ=[];DUO.boardSt=null;DUO.qN=-1;return}
  if(S.st.n===DUO.qN)return; // the same board as before (a countdown, a timer starting): nothing to play
  DUO.qN=S.st.n;DUO.animQ.push(S);
  if(!DUO.animating)duoPump();
}
async function duoPump(){
  DUO.animating=true;const gen=DUO.gen;
  while(DUO.animQ.length){
    const S=DUO.animQ.shift(),prev=DUO.boardSt;
    // only a move that follows the board on screen animates (after a rejoin it just appears)
    if(prev&&S.last&&S.last.n===S.st.n&&prev.n===S.st.n-1&&duoOn('duo'))await duoAnimMove(S,prev);
    if(DUO.gen!==gen)return;
    DUO.boardSt=S.st;
  }
  DUO.animating=false;
  duoRender();
  const S=DUO.snap;
  if(S&&S.phase==='over'&&DUO.resultV<0){DUO.resultV=S.v;setTimeout(duoResult,700)}
}
async function duoAnimMove(S,prev){
  const L=S.last,p=L.p,gen=DUO.gen,col=duoCol(S,p),st=duoClone(prev);
  st.h[p]=st.h[p].slice(0,-1); // the card leaves its hand (only the count matters for the score)
  st.b[L.cell]=L.id;st.o[L.cell]=p;st.m[L.cell]=S.st.m[L.cell];
  duoDrawBoard(S,st,{drop:L.cell});duoScoreRow(S,st);sfx('place');
  await wait(320);
  for(const e of L.ev){
    if(DUO.gen!==gen||!duoOn('duo'))return;
    if(e.t==='seal'){e.cells.forEach(c=>st.k[c]=1);duoDrawBoard(S,st,{seal:e.cells});await banner('Ley line!');continue}
    if(e.t!=='basic'){await banner({same:'Same!',plus:'Plus!',combo:'Combo!'}[e.t]);if(DUO.gen!==gen)return}
    sfx('flip');
    for(const c of e.cells){
      st.o[c]=p;
      const card=DUO_CELLS[c].querySelector('.card');if(!card)continue;
      card.classList.remove('fx','fy','drop');void card.offsetWidth;
      card.classList.add((c>>2)===(L.cell>>2)?'fy':'fx');
      // the colour turns halfway through the flip
      setTimeout(()=>{card.classList.remove(...DUO_COLS);card.classList.add(col)},230);
    }
    setTimeout(()=>{if(DUO.gen===gen)duoScoreRow(S,st)},230);
    await wait(560);
  }
}
// the 16 squares for board state st. A square is only rebuilt when it changed, so nothing interrupts a card
// that is still turning; o.drop: the square whose card drops in; o.seal: squares that just sealed
function duoDrawBoard(S,st,o={}){
  const me=S.you,can=duoMyTurn();
  for(let i=0;i<16;i++){
    const c=DUO_CELLS[i];
    if(!st){c.innerHTML='';c.dataset.h='';c.className='cell';continue}
    const el=st.el&&st.el[i]?`<div class="eicon">${ELEM[st.el[i]]}</div>`:'';
    const html=st.b[i]>=0?el+cardHTML(st.b[i],duoCol(S,st.o[i]),{mod:st.m[i],cls:i===o.drop?'drop':'',name:false}):el;
    if(c.dataset.h!==html){c.innerHTML=html;c.dataset.h=html}
    const hot=can&&DUO.sel!=null&&st.b[i]<0;
    c.className='cell'+(hot?' hot':'')+(st.k[i]?' sealed':'')+(o.seal&&o.seal.includes(i)?' seal-new':'');
    c.setAttribute('aria-label',`Row ${(i>>2)+1}, column ${i%4+1}: `+(st.b[i]>=0?`${CARDS[st.b[i]].name}, ${S.rules.ffa?(st.o[i]===me?'yours':duoSeatName(S.seats[st.o[i]])+"'s"):duoTeam(st.o[i])===duoTeam(me)?'your team':'other team'}${st.k[i]?', sealed':''}`:'empty'));
  }
}
// the scores under the board for board state st; a score that changed pops, like 1v1 (scPop in game.css)
function duoScoreRow(S,st){
  const me=S.you;
  if(S.rules.ffa)$('#duoScore').innerHTML=[0,1,2,3].map(k=>{const q=(me+k)%4;
    return `<span class="dc-${duoCol(S,q)}"><small>${k?esc(duoSeatName(S.seats[q])):'You'}</small><b>${st?duoPts(st,S.rules,q):5}</b></span>`}).join('');
  else{const a=st?duoScore(st,duoTeam(me)):0,b=st?duoScore(st,1-duoTeam(me)):0;
    $('#duoScore').innerHTML=`<span class="dc-blue"><small>Your team</small><b>${a}</b></span><span class="dc-red"><small>Other team</small><b>${b}</b></span>`}
  const nums=$$('#duoScore b').map(x=>x.textContent);
  if(DUO.scores&&DUO.scores.length===nums.length)$$('#duoScore b').forEach((x,k)=>{if(nums[k]!==DUO.scores[k])x.classList.add('pop')});
  DUO.scores=nums;
  $('#duoScore').classList.toggle('ffa',!!S.rules.ffa);
}
// the board is sized at the end of the next duoRender, once the hands are drawn (sizing an empty screen would overshoot)
function duoShowGame(){show('duo');keepAwake(true);DUO.fitKey=''}
function duoPickDeck(){
  DUO.picking=true;
  if(deckable(collPool())<5)ensureMinimum();
  const done=ids=>{
    DUO.picking=false;DUO.deckSent=true;SAVE.lastDeck=ids;save();
    if(DUO.role==='host'){if(DUO.phase==='decks'&&!DUO.decks[DUO.me]){DUO.decks[DUO.me]=ids.slice();duoChanged()}}
    else duoSend({t:'deck',ids});
    duoShowGame();duoRender();
  };
  if(DUO.snap.rules.random){done(randomDeck(collPool()));return}
  openDeck({title:`${duoMode(DUO.snap.rules)} — choose 5`,pool:collPool(),pre:preDeck(),color:'blue',loadouts:true,onDone:done,onBack:duoLeave});
}

/* ---------- the room ---------- */
function duoRoomRender(){
  const S=DUO.snap;if(!S)return;
  const me=S.you,host=DUO.role==='host',ffa=!!S.rules.ffa;
  $('#duoRoomTitle').textContent=`Crossroads · ${duoMode(S.rules)}`;
  $('#duoMode').innerHTML=[[0,'2v2'],[1,'Free-for-all']].map(([f,l])=>`<button data-f="${f}" class="${+ffa===f?'on':''}" aria-pressed="${+ffa===f}" ${host?'':'disabled'}>${l}</button>`).join('');
  $('#duoModeNote').innerHTML=ffa?'Everyone plays for themselves, each in their own colour. Turns go round the table from a random first player.'
    :'Partners sit across from each other and see each other\'s hands. Turns switch team every move.';
  $('#duoCode').textContent=S.code&&S.online!==false?S.code:'·····';
  $('#duoLink').value=S.code?inviteLink(S.code):'';
  const seat=i=>{
    const s=S.seats[i],mine=i===me;
    const av=s.kind==='human'?(s.av!=null?`<span class="av art">${CARDS[s.av].art}</span>`:`<span class="av">${esc((s.name||'?')[0].toUpperCase())}</span>`)
      :s.kind==='cpu'?'<span class="av">🤖</span>':'<span class="av">+</span>';
    const tags=[mine?'You':'',s.host?'Host':'',s.kind==='human'&&!s.host?(s.ready?'Ready':'Not ready'):''].filter(Boolean).map(t=>`<em class="dtag${t==='Ready'?' ok':''}">${t}</em>`).join('');
    let ctl='';
    if(s.kind!=='human'&&host)ctl=`<div class="seg dseat" role="group" aria-label="Seat ${i+1}">${[['open','Open'],['easy','CPU Easy'],['normal','CPU Normal']].map(([k,l])=>
      `<button data-seat="${i}" data-k="${k}" class="${(s.kind==='open'?'open':s.diff)===k?'on':''}" aria-pressed="${(s.kind==='open'?'open':s.diff)===k}">${l}</button>`).join('')}</div>`;
    if(s.kind!=='human')ctl+=`<button class="btn small" data-sit="${i}">Sit here</button>`;
    // the host can move anyone to the other team, and remove other players
    else if(host)ctl=(ffa?'':`<button class="btn small" data-swap="${i}">Switch team</button>`)+(mine?'':`<button class="btn small danger" data-kick="${i}">Remove</button>`);
    return `<li class="${s.kind==='open'?'empty':''} dc-${duoCol(S,i)}">${av}<b>${esc(duoSeatName(s,i))}</b>${tags}<span class="dctl">${ctl}</span></li>`;
  };
  // 2v2: your team first (you and the seat across from you). Free-for-all: everyone, clockwise from you
  // Free-for-all: your colour, picked from the ones nobody else has
  const taken=c=>S.seats.find((s,k)=>k!==me&&s.kind!=='open'&&duoCol(S,k)===c),myCol=duoCol(S,me);
  const swatches=`<div class="dcolors"><h3>Your colour</h3><div class="dsw" role="group" aria-label="Your colour">${DUO_COLS.map(c=>{const t=taken(c);
    return `<button class="dc-${c}${c===myCol?' on':''}" data-col="${c}" aria-pressed="${c===myCol}" ${t?'disabled':''} title="${DUO_COL_NAME[c]}${t?' · '+esc(duoSeatName(t)):''}" aria-label="${DUO_COL_NAME[c]}${t?', taken by '+esc(duoSeatName(t)):''}">${c===myCol?'✓':''}</button>`}).join('')}</div></div>`;
  $('#duoTeams').innerHTML=ffa?`<div class="dteam"><h3>Players</h3><ul class="room-pl">${[0,1,2,3].map(k=>seat((me+k)%4)).join('')}</ul></div>`+swatches
    :[[me,(me+2)%4,'Your team'],[(me+1)%4,(me+3)%4,'Other team']].map(([a,b,l])=>
    `<div class="dteam"><h3>${l}</h3><ul class="room-pl">${seat(a)}${seat(b)}</ul></div>`).join('');
  $$('#duoTeams [data-col]').forEach(b=>b.onclick=()=>{sfx('click');if(host)duoSetCol(DUO.me,b.dataset.col);else duoSend({t:'color',c:b.dataset.col})});
  $$('#duoTeams [data-swap]').forEach(b=>b.onclick=()=>{sfx('click');const i=+b.dataset.swap;duoSwap(i,(i+1)%4)});
  $$('#duoTeams [data-kick]').forEach(b=>b.onclick=()=>{sfx('click');const i=+b.dataset.kick;
    modal(`<h2>Remove ${esc(DUO.seats[i].name)}?</h2><p>They leave the room and can't join it again.</p>`,[{label:'Remove',cls:'danger',wait:true,fn:()=>duoKick(i)},{label:'Cancel',cls:'primary',esc:true}])});
  $$('#duoTeams [data-seat]').forEach(b=>b.onclick=()=>{sfx('click');duoSetSeat(+b.dataset.seat,b.dataset.k)});
  $$('#duoTeams [data-sit]').forEach(b=>b.onclick=()=>{sfx('click');const to=+b.dataset.sit;if(host)duoSit(DUO.me,to);else duoSend({t:'sit',i:to})});
  // the rules: the host changes them, everyone sees them
  const R=S.rules;
  // friends to invite, while a seat is open or a CPU's (pulse.js)
  $('#duoInv').innerHTML=host&&S.seats.some(s=>s.kind!=='human')?roomInvHTML():'';
  $('#duoRuleList').innerHTML=DUO_RULES.map(([k,l,d])=>`<button class="drule${R[k]?' on':''}" data-k="${k}" aria-pressed="${!!R[k]}" ${host?'':'disabled'} title="${esc(d)}"><b>${l}</b><span>${esc(d)}</span></button>`).join('');
  duoTimerRow(R.timer,host);
  if(host){
    $$('#duoMode button').forEach(b=>b.onclick=()=>{sfx('click');DUO.rules={...DUO.rules,ffa:b.dataset.f==='1'};duoResetReady();duoChanged()});
    $$('#duoRuleList .drule').forEach(b=>b.onclick=()=>{sfx('click');DUO.rules={...DUO.rules,[b.dataset.k]:!DUO.rules[b.dataset.k]};duoResetReady();duoChanged()});
  }
  const block=host?duoStartBlock():'',meReady=S.seats[me].ready;
  $('#duoNote').textContent=host?(block||'Everyone is ready.'):meReady?'Waiting for the host to start…':'Tap Ready when the rules look good.';
  const go=$('#duoGo');
  go.textContent=host?'Start':meReady?'Not ready':'Ready';
  go.disabled=host&&!!block;
  go.onclick=()=>{sfx('click');if(host)duoStart();else duoSend({t:'ready',on:!meReady})};
  const fill=$('#duoFill');fill.classList.toggle('hidden',!host||!S.seats.some(s=>s.kind==='open'));
  fill.onclick=()=>{sfx('click');duoFill()};
}
// the turn timer: the same slider as 1v1's room (setup.js), off or 10 to 90 seconds; only the host moves it
function duoTimerRow(t,host){
  const row=$('#duoTimerRow');
  if(!row.firstChild){
    row.innerHTML=`${ruleSvg('timer')}<b id="duoTimerName">Turn timer</b><output id="duoTimerOut" for="duoTimerSl"></output>`+
      `<input type="range" class="rng" id="duoTimerSl" min="0" max="${TIMER_MAX/5-1}" step="1" aria-labelledby="duoTimerName">`+
      `<div class="ticks" aria-hidden="true">${[0,30,50,70,90].map(n=>`<span style="--p:${(n?n/5-1:0)/(TIMER_MAX/5-1)}">${n||'Off'}</span>`).join('')}</div>`;
    const sl=$('#duoTimerSl');
    sl.oninput=()=>{const v=+sl.value,n=v?(v+1)*5:0;if(DUO.role!=='host'||n===DUO.rules.timer)return;
      DUO.rules={...DUO.rules,timer:n};duoResetReady();sfx('click');duoChanged()};
  }
  const sl=$('#duoTimerSl'),pos=t?t/5-1:0;
  sl.disabled=!host;if(+sl.value!==pos)sl.value=pos;sl.style.setProperty('--f',(pos/(+sl.max)*100)+'%');
  sl.setAttribute('aria-valuetext',t?t+' seconds per turn':'Off, no time limit');
  $('#duoTimerOut').textContent=t?t+' s':'Off';
  row.classList.toggle('off',!t);
  $('#duoTimerDesc').textContent=timerDesc(t);
}
// the host changed a rule: everyone looks again before Ready counts
function duoResetReady(){DUO.seats.forEach((s,i)=>{if(i!==DUO.me&&s.kind==='human')s.ready=false})}

/* ---------- the match ---------- */
let DUO_CELLS=[];
function duoBuild(){
  const b=$('#duoBoard');b.innerHTML='';DUO_CELLS=[];
  for(let i=0;i<16;i++){
    const c=document.createElement('div');c.className='cell';c.dataset.i=i;c.setAttribute('role','button');
    c.onclick=()=>duoTapCell(i);
    b.append(c);DUO_CELLS.push(c);
  }
}
const duoMyTurn=()=>{const S=DUO.snap;return !!S&&S.phase==='play'&&S.st&&S.st.turn===S.you&&!DUO.pending&&!DUO.animating&&!(DUO.role==='guest'&&DUO.hostAway)};
function duoTapCell(i){if(DUO.sel!=null)duoMove(DUO.sel,i)}
// play hand card hi on square i: the host plays it, a guest sends it and waits for the host's answer
function duoMove(hi,i){
  const S=DUO.snap;
  if(!duoMyTurn()||S.st.b[i]>=0)return;
  DUO.sel=null;
  if(DUO.role==='host'){if(duoLegal(hi,i))duoApply(hi,i)}
  else{DUO.pending=true;duoSend({t:'move',hi,cell:i,n:S.st.n});duoRender()}
}
/* ---------- holding a card and dropping it on a square (like 1v1, game.js); a tap without moving picks it ---------- */
let duoDrag=null;
function duoHandDown(e){
  const el=e.currentTarget;
  if(!duoMyTurn()||e.button>0)return;
  e.preventDefault();
  if(duoDrag)duoDragEnd({},true); // a drag still open (a second finger): finish it first, so its card can't be left behind
  duoDrag={hi:+el.dataset.i,el,x:e.clientX,y:e.clientY,moved:false,ghost:null,over:null,pid:e.pointerId};
}
// the empty square under the pointer, or null
function duoCellAt(x,y){
  for(let i=0;i<16;i++){const r=DUO_CELLS[i].getBoundingClientRect();if(x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom)return DUO.snap.st.b[i]<0?i:null}
  return null;
}
window.addEventListener('pointermove',e=>{
  const d=duoDrag;if(!d||otherPointer(e,d))return;
  if(!d.moved){
    if(Math.hypot(e.clientX-d.x,e.clientY-d.y)<8)return;
    d.moved=true;
    // the ghost lives on <body>, outside the zoomed screen, so it takes the card's size times the zoom
    const g=d.el.cloneNode(true);g.classList.remove('sel','play');g.classList.add('ghost');
    g.style.fontSize=parseFloat(getComputedStyle(d.el).fontSize)*(UI||1)+'px';
    ghostSweep();document.body.append(g);d.ghost=g;d.el.classList.add('dragging');
    DUO.sel=d.hi;$$('#duoHand .card.sel').forEach(c=>c!==d.el&&c.classList.remove('sel'));
    DUO_CELLS.forEach((c,i)=>c.classList.toggle('hot',DUO.snap.st.b[i]<0));
  }
  d.ghost.style.left=e.clientX+'px';d.ghost.style.top=e.clientY+'px';
  const t=duoCellAt(e.clientX,e.clientY);
  if(t!==d.over){if(d.over!=null)DUO_CELLS[d.over].classList.remove('over');d.over=t;if(t!=null)DUO_CELLS[t].classList.add('over')}
},{passive:true});
function duoDragEnd(e,cancel){
  const d=duoDrag;if(!d||otherPointer(e,d))return; // another finger lifting doesn't end this drag
  duoDrag=null;
  if(d.ghost)d.ghost.remove();
  ghostSweep();
  if(d.moved){
    if(d.over!=null)DUO_CELLS[d.over].classList.remove('over');
    const t=cancel?null:duoCellAt(e.clientX,e.clientY);
    if(t!=null&&duoMyTurn()){duoMove(d.hi,t);return}
    duoRender();return;
  }
  if(cancel)return;
  sfx('click');DUO.sel=DUO.sel===d.hi?null:d.hi;duoRender();
}
window.addEventListener('pointerup',e=>duoDragEnd(e,false));
window.addEventListener('pointercancel',e=>duoDragEnd(e,true));
function duoAv(s){return s.kind==='cpu'?'🤖':s.av!=null?CARDS[s.av].art:esc((s.name||'?')[0].toUpperCase())}
function duoPname(S,i,where){
  const s=S.seats[i],st=S.st,turn=st&&S.phase==='play'&&st.turn===i;
  const status=s.kind==='cpu'?'':s.bot?'CPU is playing':s.away?`Away · ${fmtLeft(s.left)}`:
    S.phase==='decks'&&!s.deck?'Choosing cards…':i===S.you?'You':!S.rules.ffa&&duoTeam(i)===duoTeam(S.you)?'Partner':'';
  return `<div class="dname dn-${where} dc-${duoCol(S,i)}${turn?' dactive':''}${s.away&&!s.bot?' daway':''}">`+
    `<span class="av${s.av!=null&&s.kind==='human'?' art':''}">${duoAv(s)}</span><span class="dwho"><b>${esc(duoSeatName(s,i))}</b><small>${status}</small></span></div>`;
}
function duoHandHTML(S,i,cls){
  const h=S.st?S.st.h[i]:[],col=duoCol(S,i);
  return `<div class="dhand dh-${cls}">${h.map(id=>id<0?cardHTML(0,null,{back:true}):cardHTML(id,col,{name:false})).join('')}</div>`;
}
function duoRender(){
  const S=DUO.snap;if(!S||!duoOn('duo'))return;
  if(DUO_CELLS.length!==16)duoBuild();
  const me=S.you,st=S.st,L=(me+1)%4,T=(me+2)%4,Rr=(me+3)%4;
  // the other three players around the board, you at the bottom
  $('#duoTop').innerHTML=duoPname(S,T,'top')+duoHandHTML(S,T,'top');
  $('#duoLeft').innerHTML=duoPname(S,L,'side')+duoHandHTML(S,L,'side');
  $('#duoRight').innerHTML=duoPname(S,Rr,'side')+duoHandHTML(S,Rr,'side');
  $('#duoMe').innerHTML=duoPname(S,me,'me');
  // the board: while a move plays, duoAnimMove draws it; otherwise the board on screen (or the latest)
  if(!DUO.animating)duoDrawBoard(S,DUO.boardSt||st);
  // your hand
  const can=duoMyTurn();
  if(DUO.sel!=null&&(!can||DUO.sel>=st.h[me].length))DUO.sel=null;
  $('#duoHand').innerHTML=st?st.h[me].map((id,i)=>cardHTML(id,duoCol(S,me),{cls:(can?'play ':'')+(DUO.sel===i?'sel':''),
    attrs:`data-i="${i}"`+(can?` role="button" aria-pressed="${DUO.sel===i}" aria-label="${esc(cardLabel(id))}"`:'')})).join(''):'';
  $$('#duoHand .card.play').forEach(c=>c.addEventListener('pointerdown',duoHandDown));
  // scores (from the board on screen, so they follow the animation) and whose turn
  if(!DUO.animating)duoScoreRow(S,DUO.boardSt||st);
  let msg;
  if(S.phase==='decks'){const w=S.seats.filter(s=>!s.deck).map(s=>s.name||'CPU');msg=w.length?`Waiting for ${w.join(', ')} to choose cards…`:'Starting…'}
  else if(S.phase==='over')msg='Match over';
  else if(st.turn===me)msg=DUO.pending?'Sending…':'Your turn';
  else{const s=S.seats[st.turn];msg=s.kind==='cpu'||s.bot?`${s.kind==='cpu'?'CPU':esc(s.name)+"'s CPU"} is thinking…`:s.away?`Waiting for ${esc(s.name)}…`:`${esc(s.name)}'s turn`}
  $('#duoTurn').textContent=msg;
  const R=S.rules;
  $('#duoRules').innerHTML=[`<span>${duoMode(R)}</span>`,...DUO_RULES.filter(([k])=>R[k]).map(r=>`<span>${r[1]}</span>`),R.timer?`<span>⏱ ${R.timer}s</span>`:'','<span>No trades</span>'].join('');
  duoNetBar();duoTimerBar();
  if(DUO.fitKey!==duoFitKey())duoFit();
}
// the turn timer bar, counted down from the host's last word
let duoTbT=0;
function duoTimerBar(){
  clearInterval(duoTbT);
  const S=DUO.snap,bar=$('#duoTbar');
  if(!S||S.phase!=='play'||!S.rules.timer||!S.timeLeft){bar.classList.add('off');return}
  const end=DUO.snapAt+S.timeLeft,tot=S.rules.timer*1000,n=S.st.n;
  const step=()=>{
    if(!DUO.snap||!DUO.snap.st||DUO.snap.st.n!==n){clearInterval(duoTbT);return}
    const left=Math.max(0,end-Date.now());
    bar.classList.remove('off');bar.classList.toggle('warn',left<10000);bar.classList.toggle('crit',left<5000);
    $('#duoTfill').style.transform=`scaleX(${left/tot})`;
  };
  step();duoTbT=setInterval(step,250);
}
// a line under the HUD when someone's link dropped
function duoNetBar(){
  const S=DUO.snap,el=$('#duoNet');if(!S||!el)return;
  let t='';
  if(DUO.role==='guest'&&DUO.hostAway){
    const s=Math.floor((Date.now()-DUO.hostAwayAt)/1000);
    t=`<span class="spin"></span>Lost the host. Reconnecting… The match ends in ${fmtLeft(Math.max(0,DUO_HOST_WAIT-s))} if they're not back.`;
  }else{
    const aw=S.seats.map((s,i)=>[s,i]).filter(([s])=>s.away&&!s.bot&&S.phase!=='room');
    if(aw.length)t=aw.map(([s])=>`${esc(s.name)} disconnected. A CPU takes over in ${fmtLeft(s.left)} unless they're back.`).join(' ');
  }
  el.innerHTML=t;el.classList.toggle('hidden',!t);
}
function duoResult(){
  const S=DUO.snap;if(!S||S.phase!=='over')return;
  const st=S.st,me=S.you,R=S.rules;
  // Back to room takes the whole table back (the host's device runs the room), for a rematch or new rules
  const back=()=>{if(DUO.role==='host'){duoBackToRoom();return}
    duoSend({t:'back'});const b=$('#modal .mbtns .btn.primary');if(b){b.disabled=true;b.innerHTML='<span class="spin"></span>Going back…'}};
  const btns=[{label:'Back to room',cls:'primary',keep:DUO.role!=='host',fn:back},{label:'Leave',fn:duoLeave}];
  const foot=`<p class="note">Crossroads is being tested: no cards change hands${DUO_REWARDS?'':', and it pays no XP or shards yet'}.</p>`;
  if(R.ffa){
    // places 1st to 4th; tied players share one
    const pts=[0,1,2,3].map(q=>duoPts(st,R,q)),pl=duoPlaces(pts),mine=pl[me],shared=pl.filter(x=>x===mine).length>1;
    const ord=['1st','2nd','3rd','4th'];
    sfx(mine===1?'win':'lose');
    modal(`<div class="kick">Crossroads · Free-for-all</div><h2>${shared?'Shared ':'You finish '}${ord[mine-1]}</h2>`+
      `<ol class="dplaces">${[0,1,2,3].sort((x,y)=>pl[x]-pl[y]||(x-me+4)%4-(y-me+4)%4).map(q=>
        `<li class="dc-${duoCol(S,q)}${q===me?' dme':''}"><b>${ord[pl[q]-1]}</b><span>${q===me?'You':esc(duoSeatName(S.seats[q]))}</span><em>${pts[q]}</em></li>`).join('')}</ol>`+foot,btns);
    return;
  }
  const a=duoScore(st,duoTeam(me)),b=duoScore(st,1-duoTeam(me));
  const partner=S.seats[(me+2)%4],opp=[S.seats[(me+1)%4],S.seats[(me+3)%4]];
  sfx(a>b?'win':a<b?'lose':'draw');
  modal(`<div class="kick">Crossroads · 2v2</div><h2>${a>b?'Your team wins':a<b?'Your team loses':'Draw'}</h2>`+
    `<div class="bigscore"><span class="b">${a}</span> – <span class="r">${b}</span></div>`+
    `<p>You and <b>${esc(duoSeatName(partner))}</b> vs ${opp.map(s=>`<b>${esc(duoSeatName(s))}</b>`).join(' and ')}</p>`+foot,btns);
}
function duoBackToRoom(){
  if(DUO.role!=='host')return;
  // players who never came back lose their seat; CPUs and everyone still here stay
  DUO.seats=DUO.seats.map((s,i)=>s.kind==='human'&&i!==DUO.me&&(s.away||!DUO.conns[i])?duoOpen():s);
  DUO.seats.forEach((s,i)=>{if(s.kind==='human'){s.ready=i===DUO.me;s.away=false;s.bot=false}});
  DUO.phase='room';DUO.st=null;DUO.last=null;DUO.decks=[null,null,null,null];DUO.resultV=-1;
  duoChanged();
}
// cards, board and hands sized to the screen
function duoFit(){
  if(!duoOn('duo'))return;
  const ui=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui'))||1;
  const W=Math.min(innerWidth/ui,860)-20,H=innerHeight/ui,el=$('#scr-duo');
  // phones held upright keep the first 2v2 layout (small side columns, your name under your hand);
  // wider screens get big side players
  const narrow=W<540;el.classList.toggle('narrow',narrow);
  const sideOf=dc=>narrow?Math.max(30,Math.min(46,W*.094)):Math.max(34,Math.min(78,dc*.72));
  const set=dc=>{
    const ds=sideOf(dc),dt=narrow?Math.max(34,Math.min(56,dc*.7)):Math.max(30,Math.min(58,dc*.56));
    const dh=narrow?Math.max(42,Math.min(100,(W-30)/5.4,dc*1.1)):Math.max(46,Math.min(118,(W-30)/5.3,dc*1.12));
    el.style.setProperty('--dc',dc+'px');el.style.setProperty('--ds',ds+'px');el.style.setProperty('--dt',dt+'px');el.style.setProperty('--dh',dh+'px');
  };
  // as big as the width allows (the board, a side column each side), then smaller until nothing runs off the bottom
  let dc=narrow?(W-2*(sideOf(0)+6)-32)/4:(W-128)/(4+2*.72);
  dc=Math.max(40,Math.min(132,dc));
  const fits=()=>{const b=$('.duo-bot').getBoundingClientRect(),sc=el.getBoundingClientRect();return b.bottom<=sc.bottom-parseFloat(getComputedStyle(el).paddingBottom)*ui+1};
  set(dc);
  for(let k=0;k<60&&dc>40&&!fits();k++){dc-=2;set(dc)}
  DUO.fitKey=duoFitKey();
}
// refit when the window changes, or when the hands first appear (they take room)
const duoFitKey=()=>`${innerWidth}x${innerHeight}:${!!(DUO.snap&&DUO.snap.st)}`;
addEventListener('resize',()=>{if(duoOn('duo'))duoFit()});

/* ---------- buttons ---------- */
$('#duoRoomBack').onclick=()=>{sfx('click');duoLeave()};
$('#duoQuitBtn').onclick=()=>{sfx('click');duoLeave()};
$('#duoCopy').onclick=async()=>{const v=$('#duoLink').value;try{await navigator.clipboard.writeText(v)}catch(e){$('#duoLink').select();document.execCommand&&document.execCommand('copy')}toast('Invite link copied')};
$('#duoShare').onclick=()=>{
  const url=$('#duoLink').value;
  if(navigator.share)navigator.share({title:'Leylines',text:`${duoName()} invited you to a Crossroads game of Leylines. Code: ${DUO.code}`,url}).catch(()=>{});
  else $('#duoCopy').click();
};
// Host a game (the menu and the Online screen): first pick 1v1 or Crossroads
function hostPick(){
  if(!playerName()){openOnline();askName('Enter your name, then tap <b>Host a game</b>.');return}
  const box=modal(`<h2>Host a game</h2><p>What kind of game?</p><div class="hostpick">`+
    `<button class="hp" data-k="one"><b>1v1</b><span>You and one friend on the 3×3 board. You pick the rules and the trade.</span></button>`+
    `<button class="hp" data-k="cr"><b>Crossroads <em class="dbeta">Testing</em></b><span>4 players on a 4×4 board: 2v2 or Free-for-all. Empty seats can be CPUs. No trades.</span></button></div>`,
    [{label:'Cancel',esc:true}]);
  box.querySelectorAll('.hp').forEach(b=>b.onclick=()=>{sfx('click');closeModal();if(b.dataset.k==='one')hostStart();else{duoHost();show('duoroom')}});
  box.querySelector('.hp').focus({preventScroll:true});
}
function duoRejoin(){
  const r=duoResumeInfo();if(!r){renderHero();return}
  const g=duoLS(DUO_RJ_KEY);duoJoin(g.code,g.tok);
}
