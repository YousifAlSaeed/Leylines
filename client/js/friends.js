'use strict';
/* =====================================================================
   FRIENDS  (the friend list, requests, and adding the player you just met)
   Friends live on the server, so they need an account. Tapping a friend
   opens their public profile (profile.js). friendBtn() drops an "Add friend"
   button anywhere a username shows up: the online room, the result screen,
   someone's profile. Every one of those buttons repaints when the list changes.
   ===================================================================== */
const FR={friends:[],incoming:[],outgoing:[],loaded:false,loading:null};
const frKey=n=>String(n||'').toLowerCase();
const frIn=(list,name)=>list.some(u=>frKey(u.username)===frKey(name));
// 'friends' | 'incoming' (they asked you) | 'sent' (you asked them) | ''
const friendState=name=>frIn(FR.friends,name)?'friends':frIn(FR.incoming,name)?'incoming':frIn(FR.outgoing,name)?'sent':'';
const frMe=name=>!!(ACCT.user&&frKey(ACCT.user.username)===frKey(name));

function frLoad(){
  if(!ACCT.token||API==null)return Promise.resolve();
  if(!FR.loading)FR.loading=api('/friends')
    .then(r=>{Object.assign(FR,{friends:r.friends,incoming:r.incoming,outgoing:r.outgoing,loaded:true});frChanged()})
    .catch(e=>{if(e.status===401)acctSignedOut('Your session ended. Sign in again.');else if(!FR.loaded)renderFriends()})
    .finally(()=>{FR.loading=null});
  return FR.loading;
}
// signing out: nothing about the old account stays on screen
function frReset(){Object.assign(FR,{friends:[],incoming:[],outgoing:[],loaded:false});frChanged()}
function frChanged(){renderFriendTile();renderFriends();frPaint()}

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
  try{await api(path,{method:'DELETE'});await frLoad();if(msg)toast(msg)}
  catch(e){if(e.status===401)acctSignedOut('Your session ended. Sign in again.');else toast(e.message,3000)}
}
function frRemove(name){
  const shown=esc(frName(name));
  modal(`<h2 class="nm2">Remove ${shown}?</h2><p>You'll leave each other's friend lists. You can add each other again later.</p>`,[
    {label:'Remove',cls:'danger',fn:()=>frDrop('/friends/'+encodeURIComponent(name),`${frName(name)} removed from your friends.`)},
    {label:'Cancel',cls:'primary',esc:true}]);
}

/* ---------- the menu tile ---------- */
function renderFriendTile(){
  const t=$('#friendTile');if(!t)return;
  // no server to keep friends on (a copy opened from a file): leave the tile out
  t.hidden=API==null;
  const n=FR.friends.length,k=FR.incoming.length,dot=$('#friendDot');
  $('#friendSub').textContent=!ACCT.token?'Sign in to add friends':!FR.loaded?'Your friend list'
    :(n?plural(n,'friend'):'No friends yet')+(k?` · ${plural(k,'request')}`:'');
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
const frMeta=u=>{const lv=levelOf(u.xp||0);return `@${esc(u.username)} · Lv ${lv} ${esc(titleOf(lv))}`};
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
  const friends=`<section class="pf-card"><h3>Your friends ${FR.loaded?`<em>${FR.friends.length}</em>`:''}</h3>${list}</section>`;
  const sent=FR.outgoing.length?`<section class="pf-card"><h3>Sent requests <em>${FR.outgoing.length}</em></h3><div class="fr-list">${FR.outgoing.map(u=>row(u,
    `<button class="btn small" data-can="${esc(u.username)}" aria-label="Cancel request to ${esc(u.displayName)}">Cancel</button>`)).join('')}</div></section>`:'';
  el.innerHTML=add+reqs+friends+sent;

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
