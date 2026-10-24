'use strict';
/* =====================================================================
   ALERTS  (push notifications)
   A signed-in player can turn on alerts in Settings. Then invites,
   friend requests, news about a match they left and an evening
   reminder about the daily pack and Daily challenges (only while
   something's still waiting) reach their device even when the game is closed (server/lib/push.js sends them, sw.js
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
// made with another server key (the server moved, or got new keys): the push service would refuse every alert to it
function alertsStale(sub,key){
  const k=sub.options&&sub.options.applicationServerKey;if(!k)return false; // older browsers don't say
  const a=new Uint8Array(k),b=b64bytes(key);
  return a.length!==b.length||a.some((v,i)=>v!==b[i]);
}
// tells the server this device has alerts on, for the account using it now
const alertsSend=sub=>api('/push/subscribe',{method:'POST',body:{sub:sub.toJSON()}});
// remembered on this device, so Settings can show the switch straight away
const AL_KEY='leylines.alerts';
const alertsMark=on=>{try{on?localStorage.setItem(AL_KEY,'1'):localStorage.removeItem(AL_KEY)}catch(e){}};
const alertsMarked=()=>{try{return localStorage.getItem(AL_KEY)==='1'}catch(e){return false}};

// the browser's own error, in words a player can act on
const DEVICE_HELP=alertsIOS()?'iPhone Settings → Notifications → Leylines'
  :/Android/.test(navigator.userAgent)?'your phone\'s Settings → Apps → your browser → Notifications'
  :/Windows/.test(navigator.userAgent)?'Windows Settings → System → Notifications (then restart the browser)'
  :'your computer\'s notification settings';
// Brave keeps push off until this setting is on, and then either never answers or says "push service error"
const BRAVE_HELP=navigator.brave?'Brave keeps alerts off at first. In Brave\'s settings → Privacy and security, turn on "Use Google services for push messaging", restart Brave and try again.'
  :'This browser can\'t get alerts (in Brave, turn on "Use Google services for push messaging" in its settings).';
function alertsWhy(e){
  const t=(e&&e.name||'')+' '+(e&&e.message||'');
  // the site is allowed, but the device blocks the browser itself (Windows, Android): the browser reports it as "permission denied"
  if(/NotAllowed|permission denied/i.test(t))return `Your device is blocking alerts from your browser. Turn them on in ${DEVICE_HELP} and try again.`;
  if(/push service|AbortError|not supported/i.test(t)||navigator.brave)return BRAVE_HELP;
  return e&&e.message||'Alerts couldn\'t be turned on. Try again.';
}
// the browser's "allow notifications?" question. Some browsers (Brave) tuck it into the address bar or never show it,
// and then never answer: after a minute that counts as no answer, so nothing waits forever
function alertsAsk(){
  const ask=new Promise(res=>{const p=Notification.requestPermission(res);if(p&&p.then)p.then(res)}); // older Safari only calls back
  return alertsWithin(ask,60000,'Your browser didn\'t ask about alerts. Look for a bell in the address bar, or allow notifications in this site\'s settings, then try again.');
}
async function alertsOn(){
  const key=await alertsKey();if(!key)throw new Error('Alerts aren\'t set up on this server yet.');
  const perm=Notification.permission==='granted'?'granted':await alertsAsk();
  if(perm!=='granted')throw new Error(perm==='denied'?'Alerts are blocked. Allow notifications for this site in your browser settings.':'Alerts stay off.');
  const reg=await alertsReg();
  let sub=await alertsWithin(reg.pushManager.getSubscription(),4000,'This browser didn\'t answer. Try again, or try another browser.');
  if(sub&&alertsStale(sub,key)){await sub.unsubscribe().catch(()=>{});sub=null}
  if(!sub)sub=await alertsWithin(reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64bytes(key)}),15000,'This browser didn\'t answer. Try again, or try another browser.')
    .catch(e=>{throw new Error(alertsWhy(e))});
  await alertsSend(sub);
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
  if(!sub)return;
  const key=await alertsKey();
  if(key&&alertsStale(sub,key))alertsOn().catch(()=>{}); // a new one with the server's key (no question: alerts are allowed already)
  else alertsSend(sub).catch(()=>{});
}
// a test alert (Settings, developer accounts only). When the server has lost this device (moved to new hosting,
// a restart at the wrong moment), it's told about it again and asked once more
async function alertsTry(path){
  let r=await api(path,{method:'POST'});
  const sub=!r.devices&&await alertsSub();
  if(sub){await alertsSend(sub);r=await api(path,{method:'POST'})}
  if(!r.devices)throw new Error('The server has no device of yours. Turn alerts off and on again.');
  if(r.failed.length)throw new Error(`The alert didn't go through (${r.failed[0]}).`);
  return r;
}
// Settings → Alerts → Test: the server sends one to each of your devices and says how it went
async function alertsTest(){
  const r=await alertsTry('/push/test');
  toast(r.devices>1?`Test alert sent to your ${r.devices} devices`:'Test alert sent. It should show up in a moment.',3500);
}

/* ---------- the Settings row ---------- */
function alertsRow(){
  if(API==null)return '';
  return `<div class="setrow setalerts" id="setAlerts" hidden><span class="rt"><b>Alerts</b><small id="alertsSub">Invites, friend requests, match news and a daily reminder, even with the game closed</small></span><span id="alertsCtl"></span></div>`+
    // the evening reminder (server/lib/dailyAlerts.js): on unless the player turns it off. It's in the save, so the server can read it
    `<div class="setrow setalerts" id="setDailyAlert" hidden><span class="rt"><b>Daily reminder</b><small>One alert in the evening if your daily pack or Daily challenges are still waiting</small></span><span id="dailyAlertCtl"><div class="seg" id="dailyAlertSeg" role="group" aria-label="Daily reminder">${
      [[1,'On'],[0,'Off']].map(([k,l])=>`<button data-k="${k}" class="${dailyAlertOn()==!!k?'on':''}" aria-pressed="${dailyAlertOn()==!!k}">${l}</button>`).join('')}</div>`+
      // Test: developer accounts only (and a local copy of the game)
      `${isDev()?'<button class="btn small" id="dailyAlertTest">Test</button>':''}</span></div>`;
}
const dailyAlertOn=()=>SAVE.dailyAlert!==false;
function dailyAlertWire(box){
  box.querySelectorAll('#setDailyAlert .seg button').forEach(b=>b.onclick=()=>{
    const on=b.dataset.k==='1';if(on===dailyAlertOn())return;
    if(on)delete SAVE.dailyAlert;else SAVE.dailyAlert=false;
    save();sfx('click');
    box.querySelectorAll('#setDailyAlert .seg button').forEach(x=>{x.classList.toggle('on',x===b);x.setAttribute('aria-pressed',x===b)});
  });
  const t=box.querySelector('#dailyAlertTest');
  if(t)t.onclick=async()=>{
    if(ALERTS.busy)return;
    sfx('click');ALERTS.busy=true;t.disabled=true;
    try{await dailyAlertTest()}catch(e){toast(e.message,5000)}
    finally{ALERTS.busy=false;t.disabled=false}
  };
}
// Settings → Daily reminder → Test: the server sends this account's reminder now (a sample when nothing's waiting)
async function dailyAlertTest(){
  const r=await alertsTry('/push/test-daily');
  toast(r.waiting?'Daily reminder sent. It should show up in a moment.':'Nothing is waiting today, so you got a sample. It should show up in a moment.',4000);
}
async function alertsPaint(box){
  const row=box.querySelector('#setAlerts');if(!row)return;
  const sub=row.querySelector('#alertsSub'),ctl=row.querySelector('#alertsCtl'),daily=box.querySelector('#setDailyAlert');
  if(daily&&!daily.wired){daily.wired=true;dailyAlertWire(box)}
  const say=(t,c='')=>{sub.textContent=t;ctl.innerHTML=c};
  if(!await alertsKey())return; // this server sends none: no row
  row.hidden=false;
  if(!ACCT.token)return say('Sign in to get alerts for invites and friend requests.');
  if(!alertsCan())return say(alertsIOS()&&!alertsHome()?'Add Leylines to your home screen, then turn alerts on in the app.':'This browser can\'t show alerts.');
  if(Notification.permission==='denied')return say(`Blocked. Allow notifications for this site in your browser, and for your browser in ${DEVICE_HELP}.`);
  const draw=on=>{
    if(daily)daily.hidden=!on; // only with alerts on for this device
    say(on?'On for this device. Invites, friend requests, match news and a daily reminder reach you even with the game closed.':'Invites, friend requests, match news and a daily reminder, even with the game closed',
      `<div class="seg" id="alertsSeg" role="group" aria-label="Alerts">${[['off','Off'],['on','On']].map(([k,l])=>`<button data-k="${k}" class="${(k==='on')===on?'on':''}" aria-pressed="${(k==='on')===on}">${l}</button>`).join('')}</div>`+
      // Test: developer accounts only (and a local copy of the game)
      (on&&isDev()?'<button class="btn small" id="alertsTest">Test</button>':''));
    ctl.querySelectorAll('.seg button').forEach(b=>b.onclick=async()=>{
      if(ALERTS.busy||(b.dataset.k==='on')===on)return;
      sfx('click');ALERTS.busy=true;ctl.querySelectorAll('button').forEach(x=>x.disabled=true);
      try{
        if(b.dataset.k==='on'){await alertsOn();toast(isDev()?'Alerts are on. Tap Test to try one.':'Alerts are on',3000)}
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
// ./?friends=1 opens Friends; ./?invite=1 brings up the invite (or says it ended); ./?daily=1 the next Daily challenge
function alertOpen(url){
  let q;try{q=new URL(url,location.href).searchParams}catch(e){return}
  if(q.get('friends')&&!G)openFriends();
  if(q.get('daily')&&!G&&$('#scr-menu').classList.contains('on'))dailyNext();
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

/* ---------- the tip on the main menu ---------- */
// A signed-in player who has finished a few matches, and could get alerts but hasn't turned
// them on, gets one small card about them. Not now: again in TIP_SNOOZE days; ✕: never again
// (per device, in localStorage, like the other device-only things).
const TIP_KEY='leylines.alertsTip',TIP_AFTER=3,TIP_SNOOZE=3;
const BELL='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16v-5a6 6 0 0112 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 004 0"/></svg>';
function tipLater(){try{const v=localStorage.getItem(TIP_KEY);return v==='never'||Date.now()<(+v||0)}catch(e){return true}}
function tipSave(v){try{localStorage.setItem(TIP_KEY,String(v))}catch(e){}}
const tipMenuFree=()=>!G&&$('#scr-menu').classList.contains('on')&&!$('#modal').classList.contains('on')
  &&!$('#frPop.on')&&!$('#invPop.on')&&!$('#a2hs:not([hidden])');
async function alertsTipMaybe(){
  if(ALERTS.tipped||!ACCT.token||!ACCT.up||!alertsCan()||Notification.permission==='denied'||tipLater())return;
  if(Object.values(SAVE.stats).reduce((a,v)=>a+(+v||0),0)<TIP_AFTER)return;
  if(!await alertsKey()||await alertsSub())return;
  // a moment after the menu draws, and only if nothing else is showing then
  await wait(1500);
  if(ALERTS.tipped||!ACCT.token||!tipMenuFree())return;
  ALERTS.tipped=true;
  const p=document.createElement('div');p.id='alertTip';p.className='fr-pop';
  p.setAttribute('role','region');p.setAttribute('aria-label','Alerts');p.setAttribute('aria-live','polite');
  p.innerHTML=`<span class="pc-av on al-bell">${BELL}</span><span class="rt"><b>Never miss an invite</b><small>Hear about invites and friend requests, even with the game closed.</small></span>`+
    '<span class="fr-two"><button class="btn small primary" data-k="on">Turn on</button><button class="btn small" data-k="later">Not now</button></span>'+
    '<button class="iconbtn fr-x" data-k="x" aria-label="Don\'t show this again"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
  const hide=()=>{p.classList.remove('on');setTimeout(()=>p.remove(),400)};
  p.onclick=async e=>{
    const b=e.target.closest('button[data-k]');if(!b)return;
    sfx('click');const k=b.dataset.k;
    if(k==='x'){tipSave('never');hide();return}
    if(k==='later'){tipSave(Date.now()+TIP_SNOOZE*864e5);hide();return}
    // the card goes at once, so it can't hang about while the browser takes its time to answer (or never does)
    hide();
    if(Notification.permission!=='granted')toast('Choose Allow in the box your browser shows (it can be up by the address bar).',6000);
    try{await alertsOn();tipSave('never');toast('Alerts are on. You can turn them off in Settings.',3500)}
    catch(e){
      // blocked or failed: don't ask again for a while, and say why
      tipSave(Date.now()+TIP_SNOOZE*864e5);toast(e.message,9000);
    }
  };
  document.body.append(p);void p.offsetWidth;p.classList.add('on');
}
