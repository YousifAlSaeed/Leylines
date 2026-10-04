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
// this device's push registration, if alerts are on here
async function alertsSub(){
  if(!alertsCan())return null;
  try{
    const reg=await Promise.race([navigator.serviceWorker.ready,wait(5000).then(()=>null)]);
    return reg?await reg.pushManager.getSubscription():null;
  }catch(e){return null}
}
function b64bytes(s){const b=atob((s+'='.repeat((4-s.length%4)%4)).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(b,c=>c.charCodeAt(0))}

async function alertsOn(){
  const key=await alertsKey();if(!key)throw new Error('Alerts aren\'t set up on this server yet.');
  const perm=await Notification.requestPermission();
  if(perm!=='granted')throw new Error(perm==='denied'?'Alerts are blocked. Allow notifications for this site in your browser settings.':'Alerts stay off.');
  const reg=await Promise.race([navigator.serviceWorker.ready,wait(5000).then(()=>null)]);
  if(!reg)throw new Error('Alerts need the game to be installed. Reload and try again.');
  const sub=await reg.pushManager.getSubscription()||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64bytes(key)});
  await api('/push/subscribe',{method:'POST',body:{sub:sub.toJSON()}});
}
async function alertsOff(token=ACCT.token){
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
  if(sub)api('/push/subscribe',{method:'POST',body:{sub:sub.toJSON()}}).catch(()=>{});
}

/* ---------- the Settings row ---------- */
function alertsRow(){
  if(API==null)return '';
  return `<div class="setrow" id="setAlerts" hidden><span class="rt"><b>Alerts</b><small id="alertsSub">Invites, friend requests and match news, even with the game closed</small></span><span id="alertsCtl"></span></div>`;
}
async function alertsPaint(box){
  const row=box.querySelector('#setAlerts');if(!row)return;
  const sub=row.querySelector('#alertsSub'),ctl=row.querySelector('#alertsCtl');
  const say=(t,c='')=>{sub.textContent=t;ctl.innerHTML=c};
  if(!await alertsKey())return; // this server sends none: no row
  row.hidden=false;
  if(!ACCT.token)return say('Sign in to get alerts for invites and friend requests.');
  if(!alertsCan())return say(alertsIOS()&&!alertsHome()?'Add Leylines to your home screen, then turn alerts on in the app.':'This browser can\'t show alerts.');
  if(Notification.permission==='denied')return say('Blocked. Allow notifications for this site in your browser settings.');
  const on=!!(await alertsSub())&&Notification.permission==='granted';
  say('Invites, friend requests and match news, even with the game closed',
    `<div class="seg" role="group" aria-label="Alerts">${[['off','Off'],['on','On']].map(([k,l])=>`<button data-k="${k}" class="${(k==='on')===on?'on':''}" aria-pressed="${(k==='on')===on}">${l}</button>`).join('')}</div>`);
  ctl.querySelectorAll('button').forEach(b=>b.onclick=async()=>{
    if(ALERTS.busy||(b.dataset.k==='on')===on)return;
    sfx('click');ALERTS.busy=true;ctl.querySelectorAll('button').forEach(x=>x.disabled=true);
    try{
      if(b.dataset.k==='on'){await alertsOn();toast('Alerts are on')}
      else{await alertsOff();toast('Alerts are off')}
    }catch(e){toast(e.message,3500)}
    finally{ALERTS.busy=false;if(box.isConnected)alertsPaint(box)}
  });
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
