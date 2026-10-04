'use strict';
/* =====================================================================
   FRIENDS  (the friend list, requests, and adding the player you just met)
   Friends live on the server, so they need an account. Tapping a friend
   opens their public profile (profile.js). friendBtn() drops an "Add friend"
   button anywhere a username shows up: the online room, the result screen,
   someone's profile. Every one of those buttons repaints when the list changes.
   ===================================================================== */
const FR={friends:[],incoming:[],outgoing:[],loaded:false,loading:null,again:false};
const FR_POLL=120000; // the server says when the list changes (pulse.js); this catches anything that check missed
const frKey=n=>String(n||'').toLowerCase();
const frIn=(list,name)=>list.some(u=>frKey(u.username)===frKey(name));
// 'friends' | 'incoming' (they asked you) | 'sent' (you asked them) | ''
const friendState=name=>frIn(FR.friends,name)?'friends':frIn(FR.incoming,name)?'incoming':frIn(FR.outgoing,name)?'sent':'';
const frMe=name=>!!(ACCT.user&&frKey(ACCT.user.username)===frKey(name));

function frLoad(){
  if(!ACCT.token||API==null)return Promise.resolve();
  // asked again while a check is out: that answer may be from before the change, so check once more after it
  if(FR.loading){FR.again=true;return FR.loading}
  FR.loading=api('/friends')
    .then(r=>{Object.assign(FR,{friends:r.friends,incoming:r.incoming,outgoing:r.outgoing,loaded:true});frChanged()})
    .catch(e=>{if(e.status===401)acctSignedOut('Your session ended. Sign in again.');else if(!FR.loaded)renderFriends()})
    .finally(()=>{FR.loading=null;if(FR.again){FR.again=false;frLoad()}});
  return FR.loading;
}
// signing out: nothing about the old account stays on screen
function frReset(){Object.assign(FR,{friends:[],incoming:[],outgoing:[],loaded:false});frChanged()}
function frChanged(){renderFriendTile();renderFriends();frPaint();frNotify()}
// keep the list current while the game is open and in front: levels and avatars, and anything the pulse missed
setInterval(()=>{if(ACCT.token&&ACCT.up&&document.visibilityState==='visible')frLoad()},FR_POLL);

/* ---------- the button that goes next to a name ---------- */
// remove: also offer "Remove" once you're friends (on their profile)
function friendBtn(name,{remove=false}={}){
  if(ACCT.token&&!FR.loaded)frLoad();
  return `<span class="fr-slot" data-fr="${esc(name||'')}"${remove?' data-rm="1"':''}>${frSlot(name,remove)}</span>`;
}
function frSlot(name,remove){
  if(!ACCT.token||API==null||!name||frMe(name))return '';
  const st=friendState(name);
  if(st==='friends')return '<span class="fr-tag ok">✓ Friends</span>'+(remove?'<button class="btn small fr-rm">Remove</button>':'');
  if(st==='sent')return '<span class="fr-tag">Request sent</span>';
  return `<button class="btn small fr-add${st==='incoming'?' primary':''}">${st==='incoming'?'Accept friend':'Add friend'}</button>`;
}
function frPaint(){$$('.fr-slot').forEach(s=>{s.innerHTML=frSlot(s.dataset.fr,!!s.dataset.rm)})}
document.addEventListener('click',e=>{
  const b=e.target.closest('.fr-slot button');if(!b)return;
  const name=b.closest('.fr-slot').dataset.fr;sfx('click');
  if(b.classList.contains('fr-rm'))frRemove(name);else frAdd(name,b);
});

/* ---------- talking to the server ---------- */
const frName=name=>{const u=[...FR.friends,...FR.incoming,...FR.outgoing].find(x=>frKey(x.username)===frKey(name));return u?u.displayName:name};
async function frAdd(name,btn){
  if(btn){btn.disabled=true;btn.innerHTML='<span class="spin"></span>'}
  try{
    const r=await api('/friends/requests',{method:'POST',body:{username:name}});
    // the player you're facing online: their Add friend button updates right away
    if(frKey(name)===frKey(NET.oppUser))rawSend({t:'friend'});
    await frLoad();
    const shown=frName(name);
    toast(r.status==='friends'?`You and ${shown} are now friends.`:`Friend request sent to ${shown}.`);
    return true;
  }catch(e){
    if(e.status===401){acctSignedOut('Your session ended. Sign in again.');return false}
    toast(e.message,3000);frPaint();return false;
  }
}
async function frDrop(path,msg){
  try{
    await api(path,{method:'DELETE'});
    // the last path part is the other player's username; if you're facing them online, their button updates too
    if(frKey(decodeURIComponent(path.split('/').pop()))===frKey(NET.oppUser))rawSend({t:'friend'});
    await frLoad();if(msg)toast(msg)
  }
  catch(e){if(e.status===401)acctSignedOut('Your session ended. Sign in again.');else toast(e.message,3000)}
}
function frRemove(name){
  const shown=esc(frName(name));
  modal(`<h2 class="nm2">Remove ${shown}?</h2><p>You'll leave each other's friend lists. You can add each other again later.</p>`,[
    {label:'Remove',cls:'danger',fn:()=>frDrop('/friends/'+encodeURIComponent(name),`${frName(name)} removed from your friends.`)},
    {label:'Cancel',cls:'primary',esc:true}]);
}

/* ---------- the pop-up when a request comes in ---------- */
// Each request pops up once; the ones already shown are remembered per account on this device.
// It never covers a match in progress: it waits for the match to end.
const frSeenKey=()=>'leylines.frSeen.'+(ACCT.user?ACCT.user.id:'');
const frReqKey=u=>frKey(u.username)+'|'+u.since;
function frSeen(){try{return new Set(JSON.parse(localStorage.getItem(frSeenKey())||'[]'))}catch(e){return new Set()}}
function frSeenSave(keys){try{localStorage.setItem(frSeenKey(),JSON.stringify(keys))}catch(e){}}
const frBusy=()=>!!(G&&G.st&&!G.over);
let frPopT=0,frWaitT=0;
function frNotify(){
  clearTimeout(frWaitT);
  if(!ACCT.token||!FR.loaded){frPopHide();return}
  // its request was answered somewhere else, or cancelled: take the card down
  const p=$('#frPop');
  if(p&&p.dataset.who&&!frIn(FR.incoming,p.dataset.who))frPopHide();
  const seen=frSeen(),fresh=FR.incoming.filter(u=>!seen.has(frReqKey(u)));
  if(!fresh.length)return;
  if(frBusy()){frWaitT=setTimeout(frNotify,4000);return}
  // only requests still waiting are kept, so the list can't grow forever
  frSeenSave(FR.incoming.map(frReqKey));
  frPopShow(fresh);
}
function frPopShow(list){
  let p=$('#frPop');
  if(!p){
    p=document.createElement('div');p.id='frPop';p.className='fr-pop';
    p.setAttribute('role','region');p.setAttribute('aria-label','Friend request');p.setAttribute('aria-live','polite');
    // stays up while the pointer or keyboard focus is on it
    p.addEventListener('mouseenter',()=>clearTimeout(frPopT));p.addEventListener('focusin',()=>clearTimeout(frPopT));
    p.addEventListener('mouseleave',frPopTimer);p.addEventListener('focusout',frPopTimer);
    document.body.append(p);
  }
  const u=list[0],one=list.length===1;
  p.dataset.who=one?u.username:'';
  // several at once: one card that leads to the Friends screen (not from the result screen of a match)
  const acts=one?'<button class="btn small primary" data-k="acc">Accept</button><button class="btn small" data-k="dec">Decline</button>'
    :G?'':'<button class="btn small primary" data-k="view">View</button>';
  p.innerHTML=`${frAvatar(u)}<span class="rt"><b>${one?esc(u.displayName):plural(list.length,'friend request')}</b>`+
    `<small>${one?`@${esc(u.username)} wants to be friends`:`${esc(u.displayName)} and ${plural(list.length-1,'other')} want to be friends`}</small></span>`+
    (acts?`<span class="fr-two">${acts}</span>`:'')+
    '<button class="iconbtn fr-x" data-k="x" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
  p.onclick=e=>{
    const b=e.target.closest('button[data-k]');if(!b)return;
    sfx('click');frPopHide();
    const k=b.dataset.k;
    if(k==='acc')frAdd(u.username);
    else if(k==='dec')frDrop('/friends/requests/'+encodeURIComponent(u.username),'Request declined.');
    else if(k==='view')openFriends();
  };
  // read its layout first so it slides in (no requestAnimationFrame: that never runs while the tab is in the background)
  void p.offsetWidth;p.classList.add('on');
  frPopTimer();
}
function frPopTimer(){clearTimeout(frPopT);frPopT=setTimeout(frPopHide,10000)}
function frPopHide(){clearTimeout(frPopT);const p=$('#frPop');if(p){p.classList.remove('on');p.dataset.who=''}}

/* ---------- the menu tile ---------- */
function renderFriendTile(){
  const t=$('#friendTile');if(!t)return;
  // no server to keep friends on (a copy opened from a file): leave the tile out
  t.hidden=API==null;
  const n=FR.friends.length,k=FR.incoming.length,dot=$('#friendDot');
  const on=ACCT.token?FR.friends.filter(u=>frFree(u.username)).length:0;
  $('#friendSub').textContent=!ACCT.token?'Sign in to add friends':!FR.loaded?'Your friend list'
    :(n?plural(n,'friend'):'No friends yet')+(k?` · ${plural(k,'request')}`:on?` · ${on} online`:'');
  dot.hidden=!(ACCT.token&&k);dot.textContent=k;
  t.setAttribute('aria-label','Friends'+(ACCT.token&&k?`, ${plural(k,'new request')}`:''));
}

/* ---------- the screen ---------- */
function openFriends(){
  show('friends');renderFriends();
  if(ACCT.token)frLoad();
}
// a friend's profile; its Back button comes back here
function openFriend(name){openPlayer(name,'friends')}
function frAvatar(u){
  const a=u.avatar;
  return a&&CARDS[a.c]?`<span class="pc-av art" style="--ring:${RINGS[a.r]||RINGS[0]}" aria-hidden="true">${CARDS[a.c].art}</span>`
    :`<span class="pc-av on" aria-hidden="true">${initialOf(u.displayName)}</span>`;
}
const frMeta=u=>{const lv=levelOf(u.xp||0);return (frFree(u.username)?'<span class="fr-on">Online</span> · ':frAlerted(u.username)?'Gets alerts · ':'')+`@${esc(u.username)} · Lv ${lv} ${esc(titleOf(lv))}`};
function renderFriends(){
  const el=$('#frBody');if(!el||!$('#scr-friends').classList.contains('on'))return;
  if(!ACCT.token){
    el.innerHTML=`<section class="pf-card"><h3>Friends</h3>
      <p class="pf-hint left">${API==null?'Friends need the game server.':!ACCT.up?'Friends are unavailable right now. Try again later.'
        :'Make an account to add the people you play online and see their profiles.'}</p>
      ${ACCT.up?'<div class="pf-two"><button class="btn primary" id="frUp">Create account</button><button class="btn" id="frIn">Sign in</button></div>':''}</section>`;
    const up=$('#frUp'),inn=$('#frIn');
    if(up)up.onclick=()=>{sfx('click');openAuth('up')};
    if(inn)inn.onclick=()=>{sfx('click');openAuth('in')};
    return;
  }
  // keep what's being typed when the list redraws
  const old=$('#frName'),typed=old?old.value:'',focused=document.activeElement===old;
  const add=`<section class="pf-card"><h3>Add a friend</h3>
    <form class="fr-addf" id="frAddF" novalidate><input id="frName" name="username" maxlength="20" placeholder="Their username" aria-label="Their username" autocomplete="off" autocapitalize="off" spellcheck="false">
    <button class="btn primary" type="submit">Add</button></form>
    <p class="fr-err" id="frErr" role="alert"></p>
    <p class="pf-hint left fr-tip">Played someone online? Tap <b>Add friend</b> next to their name in the room or on the result screen.</p></section>`;
  const row=(u,acts)=>`<div class="fr-row">${frAvatar(u)}<span class="rt"><b>${esc(u.displayName)}</b><small>${frMeta(u)}</small></span>${acts}</div>`;
  const reqs=FR.incoming.length?`<section class="pf-card"><h3>Requests <em>${FR.incoming.length}</em></h3><div class="fr-list">${FR.incoming.map(u=>row(u,
    `<span class="fr-two"><button class="btn small primary" data-acc="${esc(u.username)}">Accept</button><button class="btn small" data-dec="${esc(u.username)}" aria-label="Decline ${esc(u.displayName)}">Decline</button></span>`)).join('')}</div></section>`:'';
  const chev='<svg class="fr-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
  const list=!FR.loaded?'<p class="pf-wait"><span class="spin"></span>Loading friends…</p>'
    :FR.friends.length?`<div class="fr-list">${FR.friends.map(u=>`<button class="fr-row" data-open="${esc(u.username)}" aria-label="${esc(u.displayName)}, open profile">${frAvatar(u)}<span class="rt"><b>${esc(u.displayName)}</b><small>${frMeta(u)}</small></span>${chev}</button>`).join('')}</div>`
    :'<p class="pf-hint left">No friends yet. Add someone by username, or add the player you just faced online.</p>';
  // friends who are online and not in a match can be invited to one, and so can friends with alerts on (pulse.js)
  const onMenu=[...FR.friends.filter(u=>frFree(u.username)),...FR.friends.filter(u=>!frFree(u.username)&&frAlerted(u.username))];
  const live=onMenu.length?`<section class="pf-card"><h3>Invite to a match <em>${onMenu.length}</em></h3><div class="fr-list">${onMenu.map(u=>row(u,
    `<button class="btn small primary" data-inv="${esc(u.username)}" aria-label="Invite ${esc(u.displayName)} to a match">Invite</button>`)).join('')}</div>
    <p class="pf-hint left fr-tip fr-inv-tip">Inviting opens a room. Online friends get a pop-up; friends with alerts on get one on their device.</p></section>`:'';
  const friends=`<section class="pf-card"><h3>Your friends ${FR.loaded?`<em>${FR.friends.length}</em>`:''}</h3>${list}</section>`;
  const sent=FR.outgoing.length?`<section class="pf-card"><h3>Sent requests <em>${FR.outgoing.length}</em></h3><div class="fr-list">${FR.outgoing.map(u=>row(u,
    `<button class="btn small" data-can="${esc(u.username)}" aria-label="Cancel request to ${esc(u.displayName)}">Cancel</button>`)).join('')}</div></section>`:'';
  el.innerHTML=add+reqs+live+friends+sent;

  const f=$('#frAddF'),inp=$('#frName'),err=$('#frErr');
  inp.value=typed;if(focused)inp.focus();
  inp.oninput=()=>{err.textContent=''};
  f.onsubmit=async e=>{
    e.preventDefault();
    const name=inp.value.trim().replace(/^@/,'');
    if(!USERNAME_RE.test(name)){err.textContent='Usernames are 3 to 20 letters, numbers or underscores.';return}
    if(frMe(name)){err.textContent="That's you.";return}
    if(friendState(name)==='friends'){err.textContent=`You're already friends with ${frName(name)}.`;return}
    sfx('click');const b=f.querySelector('button');b.disabled=true;
    try{
      const r=await api('/friends/requests',{method:'POST',body:{username:name}});
      inp.value='';await frLoad();
      toast(r.status==='friends'?`You and ${frName(name)} are now friends.`:`Friend request sent to ${frName(name)}.`);
    }catch(x){
      if(x.status===401){acctSignedOut('Your session ended. Sign in again.');return}
      err.textContent=x.message;
    }finally{b.disabled=false}
  };
  const on=(sel,fn)=>$$('#frBody '+sel).forEach(b=>b.onclick=()=>{sfx('click');fn(b)});
  on('[data-open]',b=>openFriend(b.dataset.open));
  on('[data-acc]',b=>frAdd(b.dataset.acc,b));
  on('[data-dec]',b=>{b.disabled=true;frDrop('/friends/requests/'+encodeURIComponent(b.dataset.dec),'Request declined.')});
  on('[data-can]',b=>{b.disabled=true;frDrop('/friends/requests/'+encodeURIComponent(b.dataset.can),'Request cancelled.')});
}
