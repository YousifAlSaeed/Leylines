'use strict';
/* =====================================================================
   ALERTS  (push notifications)
   A signed-in player can turn on alerts in Settings. Then invites,
   friend requests and news about a match they left reach their device
   even when the game is closed (server/lib/push.js sends them, sw.js
   shows them). Each device turns them on for itself; signing out turns
   them off. On iPhone and iPad they only work in the home-screen app.
   ===================================================================== */
const ALERTS={key:undefined,busy:false,fromInvite:false};
const alertsCan=()=>'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
const alertsIOS=()=>/iPhone|iPod|iPad/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const alertsHome=()=>navigator.standalone===true||matchMedia('(display-mode: standalone)').matches;
// the server's public key (null: this server sends no alerts)
async function alertsKey(){
  if(ALERTS.key===undefined&&API!=null)try{ALERTS.key=(await api('/push/key')).key||null}catch(e){return null}
  return ALERTS.key||null;
}
// a promise that gives up: some browsers never answer about push (a privacy setting, push turned off)
const alertsWithin=(p,ms,msg)=>Promise.race([p,wait(ms).then(()=>{throw new Error(msg)})]);
async function alertsReg(){
  if(!alertsCan())return null;
  return alertsWithin(navigator.serviceWorker.ready,5000,'The game\'s offline helper isn\'t running. Reload and try again.');
}
// this device's push registration, if alerts are on here (null when off, or the browser won't say)
async function alertsSub(){
  try{const reg=await alertsReg();return reg?await alertsWithin(reg.pushManager.getSubscription(),4000,'no answer'):null}
  catch(e){return null}
}
function b64bytes(s){const b=atob((s+'='.repeat((4-s.length%4)%4)).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(b,c=>c.charCodeAt(0))}
// remembered on this device, so Settings can show the switch straight away
const AL_KEY='leylines.alerts';
const alertsMark=on=>{try{on?localStorage.setItem(AL_KEY,'1'):localStorage.removeItem(AL_KEY)}catch(e){}};
const alertsMarked=()=>{try{return localStorage.getItem(AL_KEY)==='1'}catch(e){return false}};

// the browser's own error, in words a player can act on
const DEVICE_HELP=alertsIOS()?'iPhone Settings → Notifications → Leylines'
  :/Android/.test(navigator.userAgent)?'your phone\'s Settings → Apps → your browser → Notifications'
  :/Windows/.test(navigator.userAgent)?'Windows Settings → System → Notifications (then restart the browser)'
  :'your computer\'s notification settings';
function alertsWhy(e){
  const t=(e&&e.name||'')+' '+(e&&e.message||'');
  // the site is allowed, but the device blocks the browser itself (Windows, Android): the browser reports it as "permission denied"
  if(/NotAllowed|permission denied/i.test(t))return `Your device is blocking alerts from your browser. Turn them on in ${DEVICE_HELP} and try again.`;
  if(/push service|AbortError|not supported/i.test(t))return 'This browser can\'t get alerts (in Brave, turn on "Use Google services for push messaging" in its settings).';
  return e&&e.message||'Alerts couldn\'t be turned on. Try again.';
}
async function alertsOn(){
  const key=await alertsKey();if(!key)throw new Error('Alerts aren\'t set up on this server yet.');
  const perm=await Notification.requestPermission();
  if(perm!=='granted')throw new Error(perm==='denied'?'Alerts are blocked. Allow notifications for this site in your browser settings.':'Alerts stay off.');
  const reg=await alertsReg();
  let sub=await alertsWithin(reg.pushManager.getSubscription(),4000,'This browser didn\'t answer. Try again, or try another browser.');
  if(!sub)sub=await alertsWithin(reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64bytes(key)}),15000,'This browser didn\'t answer. Try again, or try another browser.')
    .catch(e=>{throw new Error(alertsWhy(e))});
  await api('/push/subscribe',{method:'POST',body:{sub:sub.toJSON()}});
  alertsMark(true);
}
async function alertsOff(token=ACCT.token){
  alertsMark(false);
  const sub=await alertsSub();if(!sub)return;
  // told with the token directly: when signing out, the account is already gone from ACCT
  if(token&&API!=null)fetch(API+'/api/push/unsubscribe',{method:'POST',keepalive:true,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify({endpoint:sub.endpoint})}).catch(()=>{});
  await sub.unsubscribe().catch(()=>{});
}
// signed in again, or another account on this device: the server should send this device's alerts to the account using it now
async function alertsSync(){
  if(!ACCT.token||!alertsCan()||Notification.permission!=='granted')return;
  const sub=await alertsSub();
  alertsMark(!!sub);
  if(sub)api('/push/subscribe',{method:'POST',body:{sub:sub.toJSON()}}).catch(()=>{});
}
// Settings → Alerts → Test: the server sends one to each of your devices and says how it went
async function alertsTest(){
  const r=await api('/push/test',{method:'POST'});
  if(!r.devices)throw new Error('The server has no device of yours. Turn alerts off and on again.');
  if(r.failed.length)throw new Error(`The alert didn't go through (${r.failed[0]}).`);
  toast(r.devices>1?`Test alert sent to your ${r.devices} devices`:'Test alert sent. It should show up in a moment.',3500);
}

/* ---------- the Settings row ---------- */
function alertsRow(){
  if(API==null)return '';
  return `<div class="setrow setalerts" id="setAlerts" hidden><span class="rt"><b>Alerts</b><small id="alertsSub">Invites, friend requests and match news, even with the game closed</small></span><span id="alertsCtl"></span></div>`;
}
async function alertsPaint(box){
  const row=box.querySelector('#setAlerts');if(!row)return;
  const sub=row.querySelector('#alertsSub'),ctl=row.querySelector('#alertsCtl');
  const say=(t,c='')=>{sub.textContent=t;ctl.innerHTML=c};
  if(!await alertsKey())return; // this server sends none: no row
  row.hidden=false;
  if(!ACCT.token)return say('Sign in to get alerts for invites and friend requests.');
  if(!alertsCan())return say(alertsIOS()&&!alertsHome()?'Add Leylines to your home screen, then turn alerts on in the app.':'This browser can\'t show alerts.');
  if(Notification.permission==='denied')return say(`Blocked. Allow notifications for this site in your browser, and for your browser in ${DEVICE_HELP}.`);
  const draw=on=>{
    say(on?'On for this device. Invites, friend requests and match news reach you even with the game closed.':'Invites, friend requests and match news, even with the game closed',
      `<div class="seg" role="group" aria-label="Alerts">${[['off','Off'],['on','On']].map(([k,l])=>`<button data-k="${k}" class="${(k==='on')===on?'on':''}" aria-pressed="${(k==='on')===on}">${l}</button>`).join('')}</div>`+
      (on?'<button class="btn small" id="alertsTest">Test</button>':''));
    ctl.querySelectorAll('.seg button').forEach(b=>b.onclick=async()=>{
      if(ALERTS.busy||(b.dataset.k==='on')===on)return;
      sfx('click');ALERTS.busy=true;ctl.querySelectorAll('button').forEach(x=>x.disabled=true);
      try{
        if(b.dataset.k==='on'){await alertsOn();toast('Alerts are on. Tap Test to try one.',3000)}
        else{await alertsOff();toast('Alerts are off')}
      }catch(e){toast(e.message,7000)}
      finally{ALERTS.busy=false;if(box.isConnected)alertsPaint(box)}
    });
    const t=ctl.querySelector('#alertsTest');
    if(t)t.onclick=async()=>{
      if(ALERTS.busy)return;
      sfx('click');ALERTS.busy=true;t.disabled=true;
      try{await alertsTest()}catch(e){toast(e.message,5000)}
      finally{ALERTS.busy=false;t.disabled=false}
    };
  };
  // the switch shows at once from what this device remembers, then from what the browser says
  draw(alertsMarked()&&Notification.permission==='granted');
  const on=!!(await alertsSub())&&Notification.permission==='granted';
  alertsMark(on);
  if(box.isConnected&&!ALERTS.busy)draw(on);
}

/* ---------- tapping an alert ---------- */
// ./?friends=1 opens Friends; ./?invite=1 brings up the invite (or says it ended)
function alertOpen(url){
  let q;try{q=new URL(url,location.href).searchParams}catch(e){return}
  if(q.get('friends')&&!G)openFriends();
  if(q.get('invite')){ALERTS.fromInvite=true;INV.done.clear();pulseSoon()}
}
// the game was open already: the service worker hands the alert over
if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('message',e=>{if(e.data&&e.data.t==='alert')alertOpen(e.data.url)});
// opened from an invite alert, but the invite is gone by the time the game checks
function alertsInviteGone(list){
  if(!ALERTS.fromInvite)return;
  ALERTS.fromInvite=false;
  if(!list.length)toast('That invite has ended.',3000);
}
