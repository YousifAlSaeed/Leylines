'use strict';
/* =====================================================================
   PULSE  (news while the game is open, and inviting friends)
   A signed-in game keeps a live line open to the server
   (server/routes/pulse.js) and checks in whenever the server says something
   changed: friend requests and answers reload the list (friends.js), cards
   taken or spared in a match you left show up (spare.js), packs a developer
   gave you arrive (packs.js), game invites pop up, and friends who come online show up to be invited. Without the line
   (it dropped, or the browser can't stream) it checks every few seconds.
   ===================================================================== */
const PULSE_MS=5000,PULSE_SLOW=25000; // how often to check without the live line, and with it
const PULSE={user:null,boot:'',fr:0,fo:0,gi:0,busy:false,again:false,at:0,online:[],away:[],alerts:[],soonT:0};
// hosting or joining an online game (NET.role stays set after netClose, so closing counts as out)
// in a 1v1 room or a Crossroads one (duo.js)
const inOnline=()=>!!NET.role&&!NET.closing||!!DUO.role;
// free to play: not in a match or an online game. Friends can invite you (also while the game is minimised: then it's "away").
const isFree=()=>!G&&!inOnline()&&!$('#scr-online').classList.contains('on');
const frFree=name=>PULSE.online.some(u=>frKey(u)===frKey(name));
const frAway=name=>PULSE.away.some(u=>frKey(u)===frKey(name));
// not in the game, but they get alerts (alerts.js), so an invite still reaches them
const frAlerted=name=>PULSE.alerts.some(u=>frKey(u)===frKey(name));
const frReach=name=>frFree(name)||frAlerted(name);

async function pulse(){
  if(!ACCT.token||!ACCT.user||!ACCT.up||API==null)return;
  // asked again while a check is out: check once more after it, so nothing is missed
  if(PULSE.busy){PULSE.again=true;return}
  PULSE.busy=true;PULSE.at=Date.now();
  let r;
  try{r=await api('/pulse',{method:'POST',body:{menu:isFree(),away:document.hidden},timeout:10000})}
  catch(e){if(e.status===401)acctSignedOut('Your session ended. Sign in again.');return}
  finally{PULSE.busy=false;if(PULSE.again){PULSE.again=false;setTimeout(pulse,0)}}
  if(!ACCT.user)return;
  // the first answer for this account counts from here (signing in has just loaded everything); a server restart starts over
  const first=PULSE.user!==ACCT.user.id,restart=!first&&r.boot!==PULSE.boot;
  if(!first&&(restart||r.fr!==PULSE.fr))frLoad();
  if(!first&&(restart||r.fo!==PULSE.fo))owesCheck();
  if(!first&&(restart||r.gi!==PULSE.gi)){GIFTS.wait=true;giftsCheck()}
  Object.assign(PULSE,{user:ACCT.user.id,boot:r.boot,fr:r.fr,fo:r.fo,gi:r.gi});
  if(first){alertsSync();alertsTipMaybe()}
  const names=l=>Array.isArray(l)?l.filter(u=>typeof u==='string'):[];
  const online=names(r.online),away=names(r.away),alerts=names(r.alerts);
  if([online,away,alerts].join('|')!==[PULSE.online,PULSE.away,PULSE.alerts].join('|')){
    PULSE.online=online;PULSE.away=away;PULSE.alerts=alerts;renderFriendTile();renderFriends();invRoomRender();
    if(online.length)loadPeerJS().catch(()=>{}); // ready for a quick invite
  }
  for(const n of Array.isArray(r.declined)?r.declined:[])invDeclined(String(n));
  const invites=Array.isArray(r.invites)?r.invites:[];
  invIn(invites);alertsInviteGone(invites);
}
// right after something changed here (a new screen, back from another app)
function pulseSoon(){clearTimeout(PULSE.soonT);PULSE.soonT=setTimeout(pulse,50)}

/* ---------- the live line ---------- */
// a stream the server writes to when something for you changes: {k:'fr'|'fo'|'gi', v} or {k:'on'|'inv'|'no'}
const LINE={ctl:null,on:false,tries:0,t:0};
async function lineOpen(){
  if(LINE.ctl||!ACCT.token||!ACCT.user||!ACCT.up||API==null||!window.ReadableStream||!window.TextDecoder)return;
  const ctl=new AbortController();LINE.ctl=ctl;
  try{
    const r=await fetch(API+'/api/pulse/stream',{signal:ctl.signal,cache:'no-store',headers:{Authorization:'Bearer '+ACCT.token}});
    if(r.status===401){LINE.ctl=null;acctSignedOut('Your session ended. Sign in again.');return}
    if(!r.ok||!r.body)throw new Error('no line');
    LINE.on=true;LINE.tries=0;
    pulse(); // with the line open, the server counts you as online until it closes
    const rd=r.body.getReader(),dec=new TextDecoder();
    let buf='';
    for(;;){
      const {value,done}=await rd.read();if(done)break;
      buf+=dec.decode(value,{stream:true});
      let i;while((i=buf.indexOf('\n\n'))>=0){lineEvent(buf.slice(0,i));buf=buf.slice(i+2)}
    }
  }catch(e){}
  // dropped (not closed by us): try again, waiting longer each time
  if(LINE.ctl===ctl){
    LINE.ctl=null;LINE.on=false;
    clearTimeout(LINE.t);LINE.t=setTimeout(()=>{LINE.t=0;lineOpen()},Math.min(30000,1000*2**LINE.tries++));
  }
}
function lineEvent(ev){
  const d=ev.split('\n').find(l=>l.startsWith('data: '));if(!d)return;
  let m;try{m=JSON.parse(d.slice(6))}catch(e){return}
  const mine=ACCT.user&&PULSE.user===ACCT.user.id&&Number.isInteger(m.v);
  // friends, a forfeit or a gift: load them straight away (and remember the count, so the next check doesn't load them twice)
  if(m.k==='fr'){if(mine)PULSE.fr=m.v;frLoad()}
  else if(m.k==='fo'){if(mine)PULSE.fo=m.v;owesCheck()}
  else if(m.k==='gi'){if(mine)PULSE.gi=m.v;GIFTS.wait=true;giftsCheck()}
  else pulse();
}
function lineClose(){clearTimeout(LINE.t);LINE.t=0;LINE.tries=0;const c=LINE.ctl;LINE.ctl=null;LINE.on=false;if(c)c.abort()}

// every second: open the line when it's missing, and check in on time (a browser slows this down while the game is minimised)
setInterval(()=>{
  if(!LINE.ctl&&!LINE.t)lineOpen();
  if(Date.now()-PULSE.at>=(LINE.on?PULSE_SLOW:PULSE_MS))pulse();
},1000);
// minimised or in another tab: still online, as "away" (an alert reaches you if you turned them on); back: catch up
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){pulse();return}
  if(!LINE.ctl){clearTimeout(LINE.t);LINE.t=0;lineOpen()}
  pulseSoon();invTitle(false);
});
addEventListener('online',()=>{lineClose();lineOpen();pulseSoon()});
// signed out: nobody is online for you any more
function pulseReset(){lineClose();PULSE.user=null;PULSE.online=[];PULSE.away=[];PULSE.alerts=[];invHide();INV.sent.clear()}

/* ---------- inviting a friend ---------- */
// sent: the friends you invited to the room you're hosting, username key → 'wait' | 'sent' | 'no'
const INV={sent:new Map(),code:'',done:new Set(),cur:null,t:0};
function inviteFriend(name){
  if(!ACCT.token||!name)return;
  // not hosting yet: open a room first. Its code is picked straight away (NET.want), so the invite goes out now.
  // (hosting a Crossroads room, duo.js, invites go to that room's code)
  if(DUO.role!=='host'&&(NET.role!=='host'||NET.closing))hostStart();
  INV.sent.set(frKey(name),'wait');
  invFlush();invRoomRender();
}
// send what's waiting. again: the room's code changed (the first one was taken), so send them all again
function invFlush(again){
  const code=DUO.role==='host'?DUO.code:NET.role==='host'&&!NET.closing?NET.code||NET.want:'';
  if(!code)return;
  for(const [k,st] of INV.sent){
    if(st!=='wait'&&!(again&&st==='sent'))continue;
    // shown as sent at once; taken back if the server says no
    INV.sent.set(k,'sent');INV.code=code;
    if(!again)toast(`Invite sent to ${frName(k)}`);
    api('/pulse/invite',{method:'POST',body:{to:k,code}})
      .catch(e=>{if(INV.code===code){INV.sent.delete(k);toast(e.message,3000);invRoomRender()}});
  }
}
// the room closed, or someone took the seat: the invites still out are taken down
function invCancel(){
  if(INV.code&&ACCT.token)api('/pulse/invite/cancel',{method:'POST',body:{code:INV.code}}).catch(()=>{});
  INV.sent.clear();INV.code='';
}
function invDeclined(name){
  const k=[...INV.sent.keys()].find(k=>frName(k)===name||k===frKey(name));
  if(k)INV.sent.set(k,'no');
  toast(`${name} can't play right now.`,3000);
  invRoomRender();
}
// redraw whichever room is hosting: 1v1 (setup.js) or Crossroads (duo.js)
function invRoomRender(){roomOpen()&&renderRoom();DUO.role==='host'&&duoOn('duoroom')&&duoRoomRender()}
// the invite list in the room you're hosting, while the seat is empty (setup.js, duo.js)
function roomInvHTML(){
  if(!ACCT.token||!FR.friends.length)return '';
  const tag={sent:'<span class="fr-tag ok">Invited</span>'};
  const list=FR.friends.filter(u=>frReach(u.username)||INV.sent.has(frKey(u.username)));
  // after a no, they can be asked again while they're online
  const rows=list.map(u=>{const st=INV.sent.get(frKey(u.username)),no=st==='no',on=frFree(u.username),al=!on&&frAlerted(u.username);
    return `<div class="fr-row">${frAvatar(u)}<span class="rt"><b>${esc(u.displayName)}</b><small>${no?'Can\'t play right now':on?frOnTag(u.username):al?'Offline · gets an alert':'Offline or playing'}</small></span>`+
      (tag[st]||(on||al?`<button class="btn small primary" data-inv="${esc(u.username)}" aria-label="Invite ${esc(u.displayName)}${no?' again':''}">${no?'Ask again':'Invite'}</button>`:''))+'</div>'}).join('');
  return `<h4>Invite a friend</h4>`+(rows?`<div class="fr-list">${rows}</div>`:'<p class="note">None of your friends are online right now. When one is, or has alerts on, they show up here.</p>');
}
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-inv]');if(!b)return;
  sfx('click');b.disabled=true;inviteFriend(b.dataset.inv);
});

/* ---------- an invite comes in ---------- */
const invKey=i=>frKey(i.from)+'|'+i.code;
function invIn(list){
  list=list.filter(i=>i&&typeof i.from==='string'&&/^[A-Z]{5}$/.test(i.code));
  // taken down by the sender, or it ran out
  if(INV.cur&&!list.some(i=>invKey(i)===INV.cur))invHide();
  // never over a match, its result or another online game
  if(INV.cur||G||inOnline())return;
  const i=list.find(i=>!INV.done.has(invKey(i)));
  if(i){invShow(i);loadPeerJS().catch(()=>{})} // ready to join quickly
}
// "Online", or "Away" when their game is minimised
const frOnTag=name=>frAway(name)?'<span class="fr-on away">Away</span>':'<span class="fr-on">Online</span>';
// an invite while the game is minimised: the tab's title says so until you look
const INV_TITLE=document.title;
function invTitle(name){document.title=name&&document.hidden?`🎮 ${name} invited you · ${INV_TITLE}`:INV_TITLE}
function invShow(i){
  let p=$('#invPop');
  if(!p){
    p=document.createElement('div');p.id='invPop';p.className='fr-pop inv-pop';
    p.setAttribute('role','region');p.setAttribute('aria-label','Game invite');p.setAttribute('aria-live','polite');
    document.body.append(p);
  }
  const k=invKey(i),u=FR.friends.find(f=>frKey(f.username)===frKey(i.from))||{username:i.from,displayName:i.name||i.from};
  INV.cur=k;INV.done.add(k);
  p.innerHTML=`${frAvatar(u)}<span class="rt"><b>${esc(u.displayName)}</b><small>wants to play a match with you</small></span>`+
    '<span class="fr-two"><button class="btn small primary" data-k="join">Join</button><button class="btn small" data-k="no">No thanks</button></span>'+
    '<button class="iconbtn fr-x" data-k="x" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
  p.onclick=e=>{
    const b=e.target.closest('button[data-k]');if(!b)return;
    sfx('click');invHide();
    const what=b.dataset.k;
    if(what==='x')return;
    api('/pulse/invite/answer',{method:'POST',body:{from:i.from,code:i.code,no:what==='no'}}).catch(()=>{});
    if(what==='join'){if(G)return;openOnline(i.code);joinGame(i.code,{patient:4})}
  };
  void p.offsetWidth;p.classList.add('on');sfx('banner');invTitle(u.displayName);
  clearTimeout(INV.t);INV.t=setTimeout(invHide,Math.max(5,Math.min(120,+i.left||60))*1000);
}
function invHide(){clearTimeout(INV.t);INV.cur=null;const p=$('#invPop');if(p)p.classList.remove('on')}
