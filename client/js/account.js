'use strict';
/* =====================================================================
   ACCOUNT  (sign up / sign in, the menu's profile card, cloud save)
   Guests are untouched: everything below only runs for a signed-in player
   or when they open the sign-in sheet. The save itself still lives in
   localStorage; a signed-in account keeps a copy on the server.
   ===================================================================== */
// where the API lives: <meta name="leylines-api"> when the client is hosted apart
// from the server (GitHub Pages), otherwise this same site; null = no server (file://)
const API=(()=>{const v=($('meta[name="leylines-api"]')||{}).content;
  return v&&v.trim()?v.trim().replace(/\/+$/,''):/^https?:$/.test(location.protocol)?'':null})();
const AKEY='leylines.account';
// token/user/rev/dirty are kept in localStorage; the rest is per page load
const ACCT={token:null,user:null,rev:0,dirty:false,up:false,state:'',syncedAt:0,pushT:0,busy:false,applying:false,conflict:null,checkedAt:0};
try{const a=JSON.parse(localStorage.getItem(AKEY)||'null');
  if(a&&a.token&&a.user)Object.assign(ACCT,{token:a.token,user:a.user,rev:a.rev|0,dirty:!!a.dirty})}catch(e){}
function acctStore(){try{
  if(ACCT.token)localStorage.setItem(AKEY,JSON.stringify({token:ACCT.token,user:ACCT.user,rev:ACCT.rev,dirty:ACCT.dirty}));
  else localStorage.removeItem(AKEY)}catch(e){}}

async function api(path,{method='GET',body,timeout=20000}={}){
  if(API==null)throw new Error('Accounts need the game server.');
  const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),timeout);
  let r;
  try{r=await fetch(API+'/api'+path,{method,signal:ctl.signal,body:body&&JSON.stringify(body),
    headers:{...(body&&{'Content-Type':'application/json'}),...(ACCT.token&&{Authorization:'Bearer '+ACCT.token})}})}
  catch(e){throw Object.assign(new Error("Couldn't reach the server. Check your connection and try again."),{net:true})}
  finally{clearTimeout(t)}
  const j=r.status===204?{}:await r.json().catch(()=>({}));
  if(!r.ok)throw Object.assign(new Error(j.error||'Something went wrong. Try again.'),{status:r.status,body:j});
  return j;
}

/* ---------- what gets synced ---------- */
// the whole save except cid, which identifies this device in online matches
const syncData=()=>{const d={...SAVE};delete d.cid;return d};
// compared after filling in defaults (an older save gains its profile fields) and with keys sorted
const stable=v=>JSON.stringify(v,(k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const sameSave=d=>{const n=normSave(d);delete n.cid;return stable(n)===stable(syncData())};
// a device that has never really been played: signing in just loads the account
const isFresh=()=>Object.values(SAVE.stats).every(v=>!v)&&SAVE.seen.length<=STARTER.length&&!(SAVE.loadouts||[]).some(Boolean);
const plural=(n,w)=>`${n} ${w}${n===1?'':'s'}`;
function saveSummary(s){
  const st=s.stats||{},cards=Object.values(s.coll||{}).reduce((a,b)=>a+(+b||0),0);
  return plural(cards,'card')+' · '+plural((st.w|0)+(st.ow|0),'win');
}
function ago(t){
  const s=Math.round((Date.now()-new Date(t))/1000);
  return s<60?'just now':s<3600?Math.round(s/60)+' min ago':s<86400?plural(Math.round(s/3600),'hour')+' ago':plural(Math.round(s/86400),'day')+' ago';
}

// replace this device's progress with the account's copy
function acctApply(data,rev){
  ACCT.applying=true;
  try{localStorage.setItem(SKEY,JSON.stringify({...data,cid:SAVE.cid}))}catch(e){}
  SAVE=loadSave();save();
  ACCT.applying=false;
  Object.assign(ACCT,{rev,dirty:false,syncedAt:Date.now(),state:''});acctStore();
  applyTheme();updSnd();musicSync();
  if($('#scr-menu').classList.contains('on'))renderMenu();else{renderProfile();renderProfilePage()}
}

/* ---------- syncing ---------- */
// called by save() on every change
function acctChanged(){
  if(!ACCT.token||ACCT.applying)return;
  if(!ACCT.dirty){ACCT.dirty=true;acctStore()}
  // while the player hasn't picked which progress to keep, don't overwrite the account's
  clearTimeout(ACCT.pushT);if(!ACCT.conflict)ACCT.pushT=setTimeout(acctPush,2500);
  renderProfile();
}
async function acctPush(force){
  if(!ACCT.token)return;
  clearTimeout(ACCT.pushT);
  if(ACCT.busy){ACCT.pushT=setTimeout(()=>acctPush(force),1000);return}
  ACCT.busy=true;acctState('syncing');
  const sent=JSON.stringify(SAVE);
  try{
    const r=await api('/me/save',{method:'PUT',body:{data:syncData(),baseRev:ACCT.rev,force:!!force}});
    ACCT.rev=r.rev;ACCT.syncedAt=Date.now();
    // something changed while the request was out: send that too
    if(JSON.stringify(SAVE)===sent)ACCT.dirty=false;else ACCT.pushT=setTimeout(acctPush,2500);
    acctStore();acctState('');
  }catch(e){acctFail(e)}
  finally{ACCT.busy=false}
}
function acctFail(e){
  if(e.status===401)return acctSignedOut('Your session ended. Sign in again to keep syncing.');
  if(e.status===409)return acctRefresh();
  acctState(e.net?'offline':'error');
}
// fetch the account's copy and work out which progress wins
async function acctRefresh(){
  if(!ACCT.token)return;
  ACCT.checkedAt=Date.now();
  try{const r=await api('/me');ACCT.user=r.user;ACCT.up=true;acctStore();renderProfilePage();acctReconcile(r.save,false);frLoad()}
  catch(e){acctFail(e)}
}
function acctReconcile(s,justSignedIn){
  if(!s){ACCT.rev=0;return acctPush(true)}
  if(sameSave(s.data)){Object.assign(ACCT,{rev:s.rev,dirty:false,syncedAt:Date.now()});acctStore();return acctState('')}
  if(justSignedIn?isFresh():!ACCT.dirty&&s.rev>ACCT.rev)return acctApply(s.data,s.rev);
  if(!justSignedIn&&ACCT.dirty&&s.rev===ACCT.rev)return acctPush();
  acctAsk(s);
}
// both sides changed: the player picks one
function acctAsk(s){
  // only on the menu or your profile, never mid-match or over another popup; renderMenu asks again later
  if(G||!['#scr-menu','#scr-profile'].some(id=>$(id).classList.contains('on'))||$('#modal').classList.contains('on')){ACCT.conflict=s;return}
  ACCT.conflict=null;
  modal(`<h2 class="nm2">Which progress to keep?</h2><p>This device and your account have different progress. The one you don't keep is replaced.</p>
    <div class="pick2"><div class="pk2"><b>Your account</b><small>${saveSummary(s.data)} · ${ago(s.updatedAt)}</small></div>
    <div class="pk2"><b>This device</b><small>${saveSummary(SAVE)}</small></div></div>`,[
    {label:'Keep account',cls:'primary',fn:()=>{acctApply(s.data,s.rev);toast('Account progress loaded.')}},
    {label:'Keep this device',fn:()=>{ACCT.rev=s.rev;acctPush(true);toast('This device\'s progress saved to your account.')}}]);
}
function acctState(s){ACCT.state=s;renderProfile()}

/* ---------- signing in and out ---------- */
function acctSignedIn(r){
  Object.assign(ACCT,{token:r.token,user:r.user,rev:r.save?r.save.rev:0,dirty:false,up:true,syncedAt:Date.now(),state:'',conflict:null});
  acctStore();renderProfile();renderProfilePage();frLoad();
}
function acctSignedOut(msg){
  clearTimeout(ACCT.pushT);
  Object.assign(ACCT,{token:null,user:null,rev:0,dirty:false,state:'',conflict:null});
  // the name belonged to the account: don't leave it behind for the next one to pick up
  if(SAVE.name){SAVE.name='';save()}
  acctStore();renderProfile();renderProfilePage();frReset();
  if(msg)toast(msg,3500);
}
function acctSignOut(){
  modal(`<h2 class="nm2">Sign out?</h2><p>Your progress stays on this device.${ACCT.dirty?' Changes that haven\'t synced yet will only be here.':''}</p>`,[
    {label:'Sign out',cls:'danger',fn:async()=>{
      if(ACCT.dirty)await acctPush();
      api('/auth/logout',{method:'POST'}).catch(()=>{});
      acctSignedOut();toast('Signed out.');
    }},
    {label:'Cancel',cls:'primary',esc:true}]);
}

const USERNAME_RE=/^[A-Za-z0-9_]{3,20}$/;
// one sheet for both: .up = create account, .in = sign in
function openAuth(mode='up'){
  const n=Object.values(SAVE.coll).reduce((a,b)=>a+b,0);
  const box=modal(`<h2 class="nm2"></h2>
    <div class="seg" id="auTabs" role="group" aria-label="Account"><button data-k="up">Create account</button><button data-k="in">Sign in</button></div>
    <form class="authf" id="authf" novalidate>
      <label>Username<input name="username" maxlength="20" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="vael_99" required></label>
      <label>Password<input name="password" type="password" maxlength="200" required></label>
      <button type="button" class="forgot si" id="auForgot">Forgot password?</button>
      <label class="su">Email <small>optional, lets you reset a forgotten password</small><input name="email" type="email" maxlength="254" autocomplete="email" placeholder="you@example.com"></label>
      <p class="auerr" role="alert"></p>
      <button class="btn primary full" type="submit" id="auGo"></button>
      <p class="note su">Your ${plural(n,'card')}, stats and settings come with you.</p>
    </form>`,[{label:'Not now',cls:'text',esc:true}]);
  const f=box.querySelector('#authf'),err=f.querySelector('.auerr'),go=f.querySelector('#auGo'),pw=f.elements.password;
  const set=m=>{
    mode=m;f.classList.toggle('in',m==='in');
    box.querySelector('h2').textContent=m==='up'?'Create your account':'Welcome back';
    go.textContent=m==='up'?'Create account':'Sign in';
    pw.autocomplete=m==='up'?'new-password':'current-password';
    pw.placeholder=m==='up'?'At least 8 characters':'';
    box.querySelectorAll('#auTabs button').forEach(b=>{b.classList.toggle('on',b.dataset.k===m);b.setAttribute('aria-pressed',b.dataset.k===m)});
    err.textContent='';
  };
  box.querySelectorAll('#auTabs button').forEach(b=>b.onclick=()=>{sfx('click');set(b.dataset.k)});
  f.oninput=()=>{err.textContent=''};
  f.querySelector('#auForgot').onclick=()=>{sfx('click');openForgot(f.elements.username.value.trim())};
  set(mode);
  setTimeout(()=>f.elements.username.focus(),50);

  f.onsubmit=async e=>{
    e.preventDefault();
    const username=f.elements.username.value.trim(),password=pw.value,email=f.elements.email.value.trim();
    const bad=!username||!password?'Enter a username and password.'
      :mode==='up'&&!USERNAME_RE.test(username)?'Usernames are 3 to 20 letters, numbers or underscores.'
      :mode==='up'&&password.length<8?'Passwords need at least 8 characters.':'';
    if(bad){err.textContent=bad;return}
    sfx('click');go.disabled=true;go.textContent=mode==='up'?'Creating account…':'Signing in…';
    try{
      if(mode==='up'){
        const r=await api('/auth/signup',{method:'POST',body:{username,password,email:email||undefined,displayName:cleanName(SAVE.name)||undefined,save:syncData()}});
        closeModal();acctSignedIn(r);
        toast(`Welcome, ${r.user.displayName}. Your progress is saved to your account.`,3000);
      }else{
        const r=await api('/auth/login',{method:'POST',body:{username,password}});
        closeModal();acctSignedIn(r);
        toast(`Signed in as ${r.user.displayName}.`);
        acctReconcile(r.save,true);
      }
    }catch(x){
      err.textContent=x.message;go.disabled=false;go.textContent=mode==='up'?'Create account':'Sign in';
    }
  };
}

/* ---------- forgotten password ---------- */
// asks for a reset email; the answer is the same whether or not the account exists
function openForgot(who=''){
  const box=modal(`<h2 class="nm2">Reset your password</h2><p>Enter your username or the email on your account. We'll email you a link to choose a new password.</p>
    <form class="authf" id="fgf" novalidate>
      <label>Username or email<input name="who" maxlength="254" autocomplete="username" autocapitalize="off" spellcheck="false" required></label>
      <p class="auerr" role="alert"></p>
      <button class="btn primary full" type="submit">Send link</button>
    </form>`,[{label:'Back',cls:'text',esc:true,fn:()=>openAuth('in')}]);
  const f=box.querySelector('#fgf'),err=f.querySelector('.auerr'),go=f.querySelector('button[type=submit]'),inp=f.elements.who;
  inp.value=who;setTimeout(()=>inp.focus(),50);
  f.oninput=()=>{err.textContent=''};
  f.onsubmit=async e=>{
    e.preventDefault();
    const v=inp.value.trim();
    if(!v){err.textContent='Enter your username or email.';return}
    sfx('click');go.disabled=true;go.textContent='Sending…';
    try{
      await api('/auth/forgot',{method:'POST',body:{who:v}});
      modal(`<h2 class="nm2">Check your email</h2><p>If an account matches, we sent a link to its email. It works once, for 30 minutes. Check your spam folder too.</p>
        <p class="note">No email on your account? Then it can't be reset, but your progress is still saved on any device where you're signed in.</p>`,
        [{label:'OK',cls:'primary'}]);
    }catch(x){err.textContent=x.message;go.disabled=false;go.textContent='Send link'}
  };
}
// opened from the emailed link (#reset=…): choose a new password, then you're signed in
function openReset(token){
  const box=modal(`<h2 class="nm2">Choose a new password</h2><p>You'll be signed out on every other device.</p>
    <form class="authf" id="rsf" novalidate>
      <label>New password<input name="password" type="password" maxlength="200" autocomplete="new-password" placeholder="At least 8 characters" required></label>
      <p class="auerr" role="alert"></p>
      <button class="btn primary full" type="submit">Save password</button>
    </form>`,[{label:'Cancel',cls:'text',esc:true}]);
  const f=box.querySelector('#rsf'),err=f.querySelector('.auerr'),go=f.querySelector('button[type=submit]'),pw=f.elements.password;
  setTimeout(()=>pw.focus(),50);
  f.oninput=()=>{err.textContent=''};
  f.onsubmit=async e=>{
    e.preventDefault();
    if(pw.value.length<8){err.textContent='Passwords need at least 8 characters.';return}
    sfx('click');go.disabled=true;go.textContent='Saving…';
    try{
      const r=await api('/auth/reset',{method:'POST',body:{token,password:pw.value}});
      closeModal();acctSignedIn(r);
      toast(`Password changed. Signed in as ${r.user.displayName}.`,3000);
      acctReconcile(r.save,true);
    }catch(x){err.textContent=x.message;go.disabled=false;go.textContent='Save password'}
  };
}

/* ---------- the profile card (menu) and the account row (settings) ---------- */
const USER_ICON='<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/></svg>';
// your chosen card (profile.js), else your initial, else a person icon for a nameless guest
function avatar(u){
  const a=SAVE.avatar,name=u?u.displayName:cleanName(SAVE.name);
  if(a)return `<span class="pc-av art" style="--ring:${RINGS[a.r]}" aria-hidden="true">${artOf(a)}</span>`;
  return `<span class="pc-av${name?' on':''}" aria-hidden="true">${name?initialOf(name):USER_ICON}</span>`;
}
function acctStatus(){
  if(!ACCT.token)return API!=null&&ACCT.up?'Saved on this device only':'Saved on this device';
  return {syncing:'Syncing…',offline:'Offline · syncs when you reconnect',error:"Couldn't sync · will retry"}[ACCT.state]
    ||(ACCT.dirty?'Not synced yet':ACCT.syncedAt?'Synced · '+ago(ACCT.syncedAt):'Synced');
}
// the menu card: who you are and your level; your record lives on the profile it opens
function renderProfile(){
  const el=$('#pcard');if(!el)return;
  const u=ACCT.token&&ACCT.user,cta=!u&&ACCT.up,lv=levelOf(SAVE.xp),name=u?u.displayName:profName();
  el.innerHTML=avatar(u)+
    `<span class="pc-main"><b>${esc(name)}</b><small class="pc-lv">${titleOf(lv)} · Lv ${lv}</small>`+
    `<small class="pc-st ${ACCT.state}">${!u&&ACCT.up?'<span class="lg">Saved on this device only</span><span class="sm">This device only</span>':acctStatus()}</small></span>`+
    (cta?'<span class="btn small pc-cta"><span class="lg">Create account</span><span class="sm">Sign up</span></span>'
      :'<svg class="i pc-go" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>');
  el.setAttribute('aria-label',`${name}${u?', signed in':''}. ${titleOf(lv)}, level ${lv}. ${acctStatus()}. Open profile.`);
  // the profile's sync line, when it's open
  const sy=$('#pfSync');if(sy)sy.textContent=acctStatus();
}
$('#pcard').onclick=()=>{sfx('click');openProfile()};
// the first row of Settings; empty when there's no server to sign in to
function acctSettingsRow(){
  const u=ACCT.token&&ACCT.user;
  if(u)return `<div class="setrow acctrow">${avatar(u)}<span class="rt"><b>${esc(u.displayName)}</b><small>@${esc(u.username)} · ${acctStatus()}</small></span><button class="btn small" id="setSignOut">Sign out</button></div>`;
  if(!ACCT.up)return '';
  return `<div class="setrow acctrow">${avatar(null)}<span class="rt"><b>Account</b><small>Keep your cards on every device</small></span><button class="btn small" id="setSignIn">Sign in</button></div>`;
}
function acctWireSettings(box){
  const o=box.querySelector('#setSignOut'),i=box.querySelector('#setSignIn');
  if(o)o.onclick=()=>{sfx('click');acctSignOut()};
  if(i)i.onclick=()=>{sfx('click');openAuth('in')};
}

/* ---------- start-up and staying in sync ---------- */
async function acctBoot(){
  if(API==null)return;
  try{await api('/health',{timeout:60000});ACCT.up=true}catch(e){ACCT.up=false;if(ACCT.token)ACCT.state='offline'}
  renderProfile();renderFriendTile();renderFriends();
  if(ACCT.up&&ACCT.token)acctRefresh();
}
// a closing tab gets one last try at sending unsynced changes
function acctFlush(){
  if(!ACCT.token||!ACCT.dirty||API==null)return;
  try{fetch(API+'/api/me/save',{method:'PUT',keepalive:true,headers:{'Content-Type':'application/json',Authorization:'Bearer '+ACCT.token},
    body:JSON.stringify({data:syncData(),baseRev:ACCT.rev})}).catch(()=>{})}catch(e){}
}
addEventListener('pagehide',acctFlush);
addEventListener('online',()=>{if(ACCT.token&&ACCT.dirty)acctPush()});
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden')return acctFlush();
  // coming back to the tab: pick up anything another device saved meanwhile
  if(ACCT.token&&!G&&Date.now()-ACCT.checkedAt>30000)acctRefresh();
});
