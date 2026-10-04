'use strict';
/* =====================================================================
   PULSE  (news while the game is open, and inviting friends)
   Every few seconds a signed-in game checks in with the server
   (server/routes/pulse.js): it says whether you're on the main menu, and
   hears back what changed. Friend requests and answers reload the list
   (friends.js), cards taken or spared in a match you left show up
   (spare.js), and game invites pop up. Friends who are on the main menu
   can be invited to a room you host.
   ===================================================================== */
const PULSE_MS=5000;
const PULSE={user:null,boot:'',fr:0,fo:0,busy:false,online:[],soonT:0};
// on the main menu with nothing going on: friends can invite you
const atMenu=()=>!G&&$('#scr-menu').classList.contains('on');
// hosting or joining an online game (NET.role stays set after netClose, so closing counts as out)
const inOnline=()=>!!NET.role&&!NET.closing;
const frOnMenu=name=>PULSE.online.some(u=>frKey(u)===frKey(name));

async function pulse(){
  if(PULSE.busy||!ACCT.token||!ACCT.user||!ACCT.up||API==null||document.hidden)return;
  PULSE.busy=true;
  let r;
  try{r=await api('/pulse',{method:'POST',body:{menu:atMenu()},timeout:10000})}
  catch(e){if(e.status===401)acctSignedOut('Your session ended. Sign in again.');return}
  finally{PULSE.busy=false}
  if(!ACCT.user)return;
  // the first answer for this account counts from here (signing in has just loaded everything); a server restart starts over
  const first=PULSE.user!==ACCT.user.id,restart=!first&&r.boot!==PULSE.boot;
  if(!first&&(restart||r.fr!==PULSE.fr))frLoad();
  if(!first&&(restart||r.fo!==PULSE.fo))owesCheck();
  Object.assign(PULSE,{user:ACCT.user.id,boot:r.boot,fr:r.fr,fo:r.fo});
  const online=Array.isArray(r.online)?r.online.filter(u=>typeof u==='string'):[];
  if(online.join()!==PULSE.online.join()){PULSE.online=online;renderFriendTile();renderFriends();roomOpen()&&renderRoom()}
  for(const n of Array.isArray(r.declined)?r.declined:[])invDeclined(String(n));
  invIn(Array.isArray(r.invites)?r.invites:[]);
}
// soon after something changed here (a new screen, back from another app)
function pulseSoon(){clearTimeout(PULSE.soonT);PULSE.soonT=setTimeout(pulse,300)}
setInterval(pulse,PULSE_MS);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)pulseSoon()});
addEventListener('online',pulseSoon);
// signed out: nobody is on your menu any more
function pulseReset(){PULSE.user=null;PULSE.online=[];invHide();INV.sent.clear()}

/* ---------- inviting a friend ---------- */
// sent: the friends you invited to the room you're hosting, username key → 'wait' | 'sending' | 'sent' | 'no'
const INV={sent:new Map(),code:'',done:new Set(),cur:null,t:0};
function inviteFriend(name){
  if(!ACCT.token||!name)return;
  // not hosting yet: open a room first; the invite goes out once it has its code
  if(NET.role!=='host'||NET.closing)hostStart();
  INV.sent.set(frKey(name),'wait');
  invFlush();roomOpen()&&renderRoom();
}
// the room has its code: send what's waiting
function invFlush(){
  if(NET.role!=='host'||NET.closing||!NET.code)return;
  for(const [k,st] of INV.sent){
    if(st!=='wait')continue;
    INV.sent.set(k,'sending');INV.code=NET.code;
    api('/pulse/invite',{method:'POST',body:{to:k,code:NET.code}})
      .then(()=>{if(INV.sent.get(k)==='sending'){INV.sent.set(k,'sent');toast(`Invite sent to ${frName(k)}`)}})
      .catch(e=>{INV.sent.delete(k);toast(e.message,3000)})
      .finally(()=>roomOpen()&&renderRoom());
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
  roomOpen()&&renderRoom();
}
// the invite list in the room you're hosting, while the seat is empty (setup.js)
function roomInvHTML(){
  if(!ACCT.token||!FR.friends.length)return '';
  const tag={sending:'<span class="spin"></span>',sent:'<span class="fr-tag ok">Invited</span>'};
  const list=FR.friends.filter(u=>frOnMenu(u.username)||INV.sent.has(frKey(u.username)));
  // after a no, they can be asked again once they're back on the menu
  const rows=list.map(u=>{const st=INV.sent.get(frKey(u.username)),no=st==='no',on=frOnMenu(u.username);
    return `<div class="fr-row">${frAvatar(u)}<span class="rt"><b>${esc(u.displayName)}</b><small>${no?'Can\'t play right now':on?'<span class="fr-on">On the menu</span>':'Not on the menu'}</small></span>`+
      (tag[st]||(on?`<button class="btn small primary" data-inv="${esc(u.username)}" aria-label="Invite ${esc(u.displayName)}${no?' again':''}">${no?'Ask again':'Invite'}</button>`:''))+'</div>'}).join('');
  return `<h4>Invite a friend</h4>`+(rows?`<div class="fr-list">${rows}</div>`:'<p class="note">None of your friends are on the main menu right now. When one is, they show up here.</p>');
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
  if(i)invShow(i);
}
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
    if(what==='join'){if(G)return;openOnline(i.code);joinGame(i.code)}
  };
  void p.offsetWidth;p.classList.add('on');sfx('banner');
  clearTimeout(INV.t);INV.t=setTimeout(invHide,Math.max(5,Math.min(60,+i.left||60))*1000);
}
function invHide(){clearTimeout(INV.t);INV.cur=null;const p=$('#invPop');if(p)p.classList.remove('on')}
