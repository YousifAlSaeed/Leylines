'use strict';
/* =====================================================================
   CONTROL PANEL  (developers only: DEV_USERS, or a local copy of the game)
   Every developer tool in one place, opened from the Developer card on
   your profile:
   - Live events: ×2 or ×3 XP and shards from matches for a while
     (server/lib/boosts.js). The games do the multiplying (store.js)
   - Announcements (announce.js)
   - Players: find someone, give packs or shards, fix a rude display name,
     sign them out everywhere (server/routes/admin.js)
   - My account: the testing tools for your own save, the alert tests and
     the developers' looks
   - Server: who's on, how busy the database is, pausing online play,
     asking older games to reload and gifts for every player (server/lib/maint.js)
   A local copy without a developer account only gets My account.
   ===================================================================== */
const CTL={sec:'events',boosts:[],signs:[],f:null,busy:false,q:'',players:[],pick:null,qT:0};
const ctlSvg=d=>`<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const CTL_SECS=[
  ['events','Live events',ctlSvg('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>')],
  ['news','Announcements',ctlSvg('<path d="M4 10v4h3l7 4.5v-13L7 10z"/><path d="M17.5 9.5a3.5 3.5 0 010 5"/>')],
  ['players','Players',ctlSvg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0"/><path d="M16 4.6a3.5 3.5 0 010 6.8M18 14.2a6.5 6.5 0 013.5 5.8"/>')],
  ['server','Server',ctlSvg('<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>')],
  ['me','My account',ctlSvg('<path d="M14.5 6.5a4 4 0 00-5.2 5.2L4 17l3 3 5.3-5.3a4 4 0 005.2-5.2l-2.5 2.5-2.5-.5-.5-2.5z"/>')]];
// the server's tools need a developer account; a local copy only has its own save
const ctlServer=()=>!!(ACCT.user&&ACCT.user.dev)&&API!=null;
const ctlWhen=t=>new Date(t).toLocaleString('en-GB',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
// an end at midnight reads as 23:59 of the day before
const ctlUntilTxt=t=>ctlWhen(t-1);

function openControl(sec='events',arg){
  if(!isDev())return;
  CTL.sec=sec;show('ctl');$('#scr-ctl').scrollTop=0;ctlNav();ctlRender(arg);
}
function ctlNav(){
  $('#ctlNav').innerHTML=CTL_SECS.map(([k,l,ic])=>`<button type="button" data-sec="${k}"${CTL.sec===k?' aria-current="page" class="on"':''}>${ic}<span>${l}</span>${k==='events'&&boostOn()?'<i class="ctl-live" aria-label="An event is running"></i>':''}</button>`).join('');
  $$('#ctlNav button').forEach(b=>b.onclick=()=>{if(CTL.sec===b.dataset.sec)return;sfx('click');CTL.sec=b.dataset.sec;ctlNav();ctlRender();$('#scr-ctl').scrollTop=0});
}
function ctlRender(arg){
  if(CTL.sec!=='me'&&!ctlServer()){
    $('#ctlBody').innerHTML=`<section class="pf-card"><p class="pf-hint left">${API==null?'This needs the game server.':'Sign in with a developer account to use this. My account works on this copy.'}</p></section>`;return;
  }
  if(CTL.sec==='events')ctlEvents();else if(CTL.sec==='news')annSection();else if(CTL.sec==='players')ctlPlayers(arg);
  else if(CTL.sec==='server')ctlServerSec();else ctlMe();
}
// Back: a phone writing an announcement goes back to its list first
$('#ctlBack').onclick=()=>{sfx('click');if(CTL.sec==='news'&&ANA.mode==='form'&&!HUB_PC.matches){ANA.mode='list';ANA.err='';annAdmin();return}openProfile()};

/* ---------- live events: what players get ---------- */
const BOOST_W={2:'Double',3:'Triple'},BOOST_TIMES={2:'twice',3:'three times'};
// "Double XP and shards", "Triple XP, double shards"
function boostName(b){
  if(b.xp>1&&b.xp===b.shards)return `${BOOST_W[b.xp]} XP and shards`;
  return [b.xp>1?`${BOOST_W[b.xp]} XP`:'',b.shards>1?`${BOOST_W[b.shards]} shards`.toLowerCase():''].filter(Boolean).join(', ').replace(/^./,c=>c.toUpperCase());
}
function boostLeft(b){
  const s=Math.max(0,b.end-annNow())/1000,d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.max(1,Math.floor(s%3600/60));
  return d?`${d}d ${h}h`:h?`${h}h ${m}m`:`${m}m`;
}
// from the server, with the announcements (announce.js annLoad). The Play card follows at once, and again when it ends
function boostSet(b){
  const ok=!!b&&Number.isInteger(b.id)&&[1,2,3].includes(b.xp)&&[1,2,3].includes(b.shards)&&Number.isFinite(b.start)&&Number.isFinite(b.end);
  const key=ok?[b.id,b.xp,b.shards,b.raise,b.start,b.end].join():'';
  if(key===BOOST.key)return;
  BOOST.key=key;BOOST.now=ok?{id:b.id,xp:b.xp,shards:b.shards,raise:!!b.raise,start:b.start,end:b.end}:null;
  clearTimeout(BOOST.t);
  const w=ok?b.end-annNow():0;
  if(w>0&&w<864e5)BOOST.t=setTimeout(boostRedraw,w+500);
  boostRedraw();
}
function boostRedraw(){
  if($('#scr-menu').classList.contains('on'))renderHero();
  if($('#scr-ctl').classList.contains('on'))ctlNav();
}
// the time left on the Play card's chip, once a minute while an event runs (nothing asks the server)
setInterval(()=>{const b=boostOn();if(b)$$('.hero-left').forEach(e=>{e.textContent=boostLeft(b)})},60e3);

/* ---------- live events: starting one ---------- */
const CTL_DURS=[['1h','1 hour'],['mid','Until midnight'],['wknd','Until Sunday night'],['pick','Pick an end']];
const ctlBlank=()=>({xp:2,sh:1,raise:true,dur:'wknd',start:'',end:toLocal(annNow()+864e5),banner:true,alert:false});
// when it ends: midnight and Sunday are the game's (clock.js DAY_TZ), like the Daily
function ctlEnd(f,start){
  const D=864e5,day=Math.floor((start+DAY_TZ)/D),dayStart=day*D-DAY_TZ;
  if(f.dur==='1h')return start+3600e3;
  if(f.dur==='mid')return dayStart+D;
  if(f.dur==='wknd')return dayStart+((7-(day+4)%7)%7+1)*D; // day 0 (1 Jan 1970) was a Thursday
  return fromLocal(f.end);
}
const ctlUntil=(f,end)=>f.dur==='1h'?'for the next hour':f.dur==='mid'?'until midnight':f.dur==='wknd'?'until Sunday night':`until ${ctlUntilTxt(end)}`;
// the announcement that can go with it
function ctlPost(f,end){
  const b={xp:f.xp,shards:f.sh},bits=[f.xp>1?`${BOOST_TIMES[f.xp]} the XP`:'',f.sh>1?`${BOOST_TIMES[f.sh]} the shards`:''].filter(Boolean);
  return {title:`${boostName(b)} ${ctlUntil(f,end)}`.slice(0,60),
    body:`Every match you play pays **${bits.join(' and ')}** until ${ctlUntilTxt(end)}.${f.sh>1&&f.raise?` The daily shard limit goes up to ${SHARD_CAP*f.sh} too.`:''} The Daily stays the same.`};
}
async function ctlEvents(){
  if(!CTL.f)CTL.f=ctlBlank();
  $('#ctlBody').innerHTML='<p class="pf-hint"><span class="spin"></span> Loading events…</p>';
  try{
    const [b,n]=await Promise.all([api('/admin/boosts'),api('/news/all')]);
    CTL.boosts=Array.isArray(b.boosts)?b.boosts:[];CTL.signs=Array.isArray(n.signs)?n.signs:[];
  }catch(e){if(CTL.sec==='events')$('#ctlBody').innerHTML=`<section class="pf-card"><p class="pf-hint left">${esc(e.message)}</p></section>`;return}
  if(CTL.sec==='events')ctlEventsDraw();
}
function ctlEventsDraw(){
  // ANN_GRACE: this clock can trail the server's by a moment (announce.js)
  const f=CTL.f,now=annNow(),G=ANN_GRACE,run=CTL.boosts.find(b=>b.start<=now+G&&b.end>now+G),soon=CTL.boosts.filter(b=>b.start>now+G&&b.end-b.start>1000);
  const past=CTL.boosts.filter(b=>b.end<=now+G&&b.end-b.start>1000).slice(0,5);
  const start=f.start?fromLocal(f.start):now,end=ctlEnd(f,start),later=!!f.start&&start>now+ANN_GRACE,post=ctlPost(f,end);
  const seg=(attr,val,cls)=>`<div class="seg ctl-mult${cls}" role="group">${[1,2,3].map(n=>`<button type="button" data-${attr}="${n}" class="${val===n?'on':''}" aria-pressed="${val===n}">×${n}</button>`).join('')}</div>`;
  const nx=MATCH_XP.normal[0],ox=MATCH_XP.online[0],ns=MATCH_SHARDS.normal,os=MATCH_SHARDS.online,none=f.xp===1&&f.sh===1;
  const row=(b,acts)=>`<div class="ctl-ev"><span class="rt"><b>${boostName(b)}</b><small>${b.start>now+ANN_GRACE?`Starts ${ctlWhen(b.start)} · `:''}ends ${ctlUntilTxt(b.end)}${b.raise?' · higher shard limit':''} · ${esc(b.by||'')}</small></span>${acts}</div>`;
  $('#ctlBody').innerHTML=`<div class="ctl-grid">
    <section class="pf-card ctl-now ctl-wide"><h3>Right now</h3>${run?row(run,`<span class="an-st ok">Live</span><button class="btn small danger" type="button" data-end="${run.id}">End now</button>`)
      :'<p class="pf-hint left">No event: matches pay the normal XP and shards.</p>'}${soon.map(b=>row(b,`<span class="an-st warn">Scheduled</span><button class="btn small danger" type="button" data-end="${b.id}">Cancel</button>`)).join('')}</section>
    <div class="ctl-col">
      <section class="pf-card"><h3>XP from matches</h3>${seg('xp',f.xp,'')}<p class="ctl-line">Normal win ${nx} → <b>${nx*f.xp}</b> XP · online win ${ox} → <b>${ox*f.xp}</b></p></section>
      <section class="pf-card"><h3>Shards from matches</h3>${seg('sh',f.sh,' sh')}<p class="ctl-line">Normal win ${ns} → <b>${ns*f.sh}</b> · online win ${os} → <b>${os*f.sh}</b>. The Daily stays the same</p>
        <label class="an-check"><input type="checkbox" id="ctlRaise"${f.raise?' checked':''}${f.sh>1?'':' disabled'}><span><b>Raise the daily shard limit with it</b><small>${f.sh>1?`${SHARD_CAP} → ${SHARD_CAP*f.sh} shards a day while it runs`:'Only with a shard boost'}</small></span></label></section>
      <section class="pf-card"><h3>When</h3>
        <label class="an-fld" for="ctlStart"><span>Starts <i>empty = now</i></span><input id="ctlStart" type="datetime-local" value="${f.start}"></label>
        <div class="an-fld"><span>How long</span><div class="an-chips">${CTL_DURS.map(([k,l])=>`<button type="button" class="an-chip${f.dur===k?' on':''}" data-dur="${k}" aria-pressed="${f.dur===k}">${l}</button>`).join('')}</div></div>
        ${f.dur==='pick'?`<label class="an-fld" for="ctlEndAt"><span>Ends</span><input id="ctlEndAt" type="datetime-local" value="${f.end}"></label>`:''}
        <p class="ctl-line">${Number.isFinite(end)?`Runs ${later?`from ${ctlWhen(start)} `:''}until ${ctlUntilTxt(end)}`:'Pick when it ends'}</p></section>
    </div>
    <div class="ctl-col">
      <section class="pf-card"><h3>Tell players</h3>
        <label class="an-check"><input type="checkbox" id="ctlBanner"${f.banner?' checked':''}><span><b>Post a Banner announcement</b><small>On the menu and in the megaphone until the event ends</small></span></label>
        <label class="an-check"><input type="checkbox" id="ctlAlert"${f.alert?' checked':''}><span><b>Send an alert</b><small>To every device with alerts on, when it starts</small></span></label>
        ${f.banner&&!none?`<div class="ann-bar an-demo">${annBarHTML({id:0,kind:'event',title:post.title,body:post.body})}</div>`:''}</section>
      <section class="pf-card"><h3>On the Play card</h3><div class="hero-stats ctl-stats">${[[`+${nx*f.xp}${boostTag(f.xp)}`,'XP a win'],[`${shd()}+${ns*f.sh}${boostTag(f.sh)}`,'shards a win'],[`${shd()}0/${f.raise&&f.sh>1?SHARD_CAP*f.sh:SHARD_CAP}`,'shards today']]
        .map(([v,l])=>`<div><b>${v}</b><small>${l}</small></div>`).join('')}</div></section>
      <p class="an-err" id="ctlErr" role="alert"></p>
      <button class="btn primary full" type="button" id="ctlGo"${none?' disabled':''}>${none?'Pick a boost first':later?'Schedule the event':run?'Start it (ends the one running)':'Start the event'}</button>
      ${past.length?`<section class="pf-card"><h3>Past events</h3>${past.map(b=>row(b,'')).join('')}</section>`:''}
    </div></div>`;
  const B=$('#ctlBody'),redraw=()=>{sfx('click');ctlEventsDraw()};
  B.querySelectorAll('[data-xp]').forEach(b=>b.onclick=()=>{f.xp=+b.dataset.xp;redraw()});
  B.querySelectorAll('[data-sh]').forEach(b=>b.onclick=()=>{f.sh=+b.dataset.sh;redraw()});
  B.querySelectorAll('[data-dur]').forEach(b=>b.onclick=()=>{f.dur=b.dataset.dur;redraw()});
  $('#ctlRaise').onchange=e=>{f.raise=e.target.checked;redraw()};
  $('#ctlBanner').onchange=e=>{f.banner=e.target.checked;redraw()};
  $('#ctlAlert').onchange=e=>{f.alert=e.target.checked};
  $('#ctlStart').onchange=e=>{f.start=e.target.value;ctlEventsDraw()};
  const ea=$('#ctlEndAt');if(ea)ea.onchange=e=>{f.end=e.target.value;ctlEventsDraw()};
  $('#ctlGo').onclick=ctlStart;
  B.querySelectorAll('[data-end]').forEach(b=>b.onclick=()=>{sfx('click');const ev=CTL.boosts.find(x=>x.id===+b.dataset.end);if(!ev)return;
    modal(`<h2 class="nm2">End ${esc(boostName(ev))} now?</h2><p>Matches go back to normal rewards for every player. Its announcement ends too.</p>`,
      [{label:'Keep it',esc:true},{label:'End now',cls:'danger',fn:()=>ctlEnd1(ev)}])});
}
async function ctlStart(){
  if(CTL.busy)return;
  const f=CTL.f,now=annNow(),start=f.start?fromLocal(f.start):null,s0=start??now,end=ctlEnd(f,s0),er=$('#ctlErr');
  if(!Number.isFinite(end)){er.textContent='Pick when it ends.';return}
  CTL.busy=true;sfx('click');er.textContent='';
  try{
    const {boost:ev}=await api('/admin/boosts',{method:'POST',body:{xp:f.xp,shards:f.sh,raise:f.raise&&f.sh>1,start,end}});
    // the announcement: a Banner, or just a Note when it's only the alert. The event's own times, so ending it can find it
    if(f.banner||f.alert){
      const me=ACCT.user.displayName,by=CTL.signs.includes(me)?me:CTL.signs[CTL.signs.length-1];
      await api('/news',{method:'POST',body:{...ctlPost(f,end),kind:'event',show:f.banner?['note','banner']:['note'],who:'all',by,alert:f.alert,start:ev.start,end:ev.end}})
        .catch(e=>toast(`The event started, but its announcement didn't: ${e.message}`,5000));
    }
    toast(start&&start>now+ANN_GRACE?'Event scheduled':'Event started',2500);
    CTL.f=ctlBlank();annLoad();await ctlEvents();
  }catch(e){er.textContent=e.message}
  finally{CTL.busy=false}
}
// ends an event, and the announcement that went out with it (same start and end, kind Event)
async function ctlEnd1(ev){
  try{
    await api(`/admin/boosts/${ev.id}/end`,{method:'POST'});
    const n=await api('/news/all').catch(()=>({posts:[]}));
    for(const p of n.posts||[])if(p.kind==='event'&&p.start===ev.start&&p.end===ev.end&&!p.draft)await api(`/news/${p.id}/end`,{method:'POST'}).catch(()=>{});
    toast('Event ended',2000);annLoad();ctlEvents();
  }catch(e){toast(e.message,3000)}
}

/* ---------- players ---------- */
function ctlPlayers(pre){
  if(pre){CTL.q=pre;CTL.pick=pre}
  $('#ctlBody').innerHTML=`<div class="ctl-pl"><section class="pf-card ctl-find"><h3>Find a player</h3>
    <label class="an-fld" for="ctlQ"><span>Username or display name</span><input id="ctlQ" type="search" autocomplete="off" spellcheck="false" value="${esc(CTL.q)}"></label>
    <div id="ctlRes" class="ctl-res"></div></section><div id="ctlPick"></div></div>`;
  $('#ctlQ').oninput=e=>{CTL.q=e.target.value;clearTimeout(CTL.qT);CTL.qT=setTimeout(ctlFind,300)};
  ctlFind();
}
async function ctlFind(){
  const q=CTL.q.trim();
  if(!q){CTL.players=[];ctlResDraw();return}
  try{const r=await api(`/admin/players?q=${encodeURIComponent(q)}`);if(q!==CTL.q.trim())return;CTL.players=Array.isArray(r.players)?r.players:[]}
  catch(e){CTL.players=[];toast(e.message,3000)}
  ctlResDraw();
}
function ctlResDraw(){
  const el=$('#ctlRes');if(!el)return;
  el.innerHTML=CTL.q.trim()?(CTL.players.length?CTL.players.map(p=>`<button type="button" class="ctl-p${CTL.pick===p.username?' on':''}" data-u="${esc(p.username)}" aria-pressed="${CTL.pick===p.username}">`+
    `<span class="rt"><b>${esc(p.displayName)}</b><small>@${esc(p.username)} · level ${p.level}</small></span>${p.online?'<i class="ctl-on" aria-label="In the game now"></i>':''}</button>`).join('')
    :'<p class="pf-hint left">Nobody by that name.</p>'):'<p class="pf-hint left">Type part of a name.</p>';
  el.querySelectorAll('[data-u]').forEach(b=>b.onclick=()=>{sfx('click');CTL.pick=b.dataset.u;ctlResDraw()});
  ctlPickDraw();
}
function ctlPickDraw(){
  const el=$('#ctlPick'),p=CTL.players.find(x=>x.username===CTL.pick);if(!el)return;
  if(!p){el.innerHTML='';return}
  el.innerHTML=`<section class="pf-card ctl-who"><div class="ctl-who-h"><span class="rt"><b>${esc(p.displayName)}</b><small>@${esc(p.username)} · ${esc(titleOf(p.level))}, level ${p.level} · ${p.cards} cards found · ${fmtSh(p.shards)} shards · joined ${new Date(p.createdAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}${p.online?' · in the game now':''}</small></span>
      <button class="btn small" type="button" id="ctlProf">Open profile</button></div></section>
    <div class="ctl-acts">
      <section class="pf-card"><h3>Give packs</h3><div class="pf-gift">${Object.keys(PACKS).map(t=>`<button class="btn small" type="button" data-gift="${t}">+1 ${PACKS[t].name}</button>`).join('')}</div><p class="pf-hint left">Each one arrives on their next check.</p></section>
      <section class="pf-card"><h3>Give shards</h3><div class="ctl-inrow"><label class="sr" for="ctlSh">Shards</label><input id="ctlSh" type="number" min="1" max="10000" step="1" inputmode="numeric" value="100"><button class="btn small primary" type="button" id="ctlShGo">Give</button></div><p class="pf-hint left">Arrives like a gift pack.</p></section>
      <section class="pf-card"><h3>Change a rude name</h3><div class="ctl-inrow"><label class="sr" for="ctlNm">Display name</label><input id="ctlNm" type="text" maxlength="16" autocomplete="off" value="${esc(p.displayName)}"><button class="btn small" type="button" id="ctlNmGo">Save</button></div></section>
      <section class="pf-card"><h3>Their account</h3><button class="btn small danger" type="button" id="ctlOut">Sign them out everywhere</button><p class="pf-hint left">Every device of theirs has to sign in again.</p></section>
    </div>`;
  const u=encodeURIComponent(p.username),busy=(b,fn)=>async()=>{if(b.disabled)return;sfx('click');b.disabled=true;try{await fn()}catch(e){toast(e.message,3000)}finally{b.disabled=false}};
  $('#ctlProf').onclick=()=>{sfx('click');openPlayer(p.username)};
  el.querySelectorAll('[data-gift]').forEach(b=>b.onclick=busy(b,async()=>{await api('/gifts',{method:'POST',body:{to:p.username,pack:b.dataset.gift}});toast(`Sent ${aPack(b.dataset.gift)} to ${p.displayName}.`)}));
  const sg=$('#ctlShGo');sg.onclick=busy(sg,async()=>{const n=Math.round(+$('#ctlSh').value);await api(`/admin/players/${u}/shards`,{method:'POST',body:{shards:n}});toast(`Sent ${shardsTxt(n)} to ${p.displayName}.`)});
  const ng=$('#ctlNmGo');ng.onclick=busy(ng,async()=>{const r=await api(`/admin/players/${u}`,{method:'PATCH',body:{displayName:$('#ctlNm').value}});toast(`Renamed to ${r.displayName}.`);p.displayName=r.displayName;ctlResDraw()});
  $('#ctlOut').onclick=()=>{sfx('click');modal(`<h2 class="nm2">Sign ${esc(p.displayName)} out everywhere?</h2><p>Every device of theirs has to sign in again. Their progress stays.</p>`,
    [{label:'Keep them in',esc:true},{label:'Sign out',cls:'danger',fn:()=>api(`/admin/players/${u}/signout`,{method:'POST'}).then(()=>toast(`${p.displayName} is signed out.`)).catch(e=>toast(e.message,3000))}])};
}

/* ---------- my account: testing on your own save, alert tests, looks ---------- */
function ctlMe(){
  const look=SAVE.aero?'aero':SAVE.liquid?'glass':'off',alerts=API!=null&&!!ACCT.token;
  const seg=(id,cur,opts)=>`<div class="seg" id="${id}" role="group">${opts.map(([k,l])=>`<button type="button" data-k="${k}" class="${cur===k?'on':''}" aria-pressed="${cur===k}">${l}</button>`).join('')}</div>`;
  $('#ctlBody').innerHTML=`<div class="ctl-grid">
    <section class="pf-card pf-dev ctl-col"><h3>Testing on my account <em>${ACCT.user&&ACCT.user.dev?'Developer account':'Local copy'}</em></h3>
      <div class="pf-row"><span class="rt"><b>Unlock all cards</b><small>Use every card. Off brings back your own collection.</small></span>${seg('ctlUnlock',String(!!SAVE.unlockAll),[['false','Off'],['true','On']])}</div>
      <div class="pf-row"><span class="rt"><b>Level up</b><small>Jump to level ${levelOf(SAVE.xp)+1} and get its pack.</small></span><button class="btn small" type="button" id="ctlLv">+1 level</button></div>
      <div class="pf-row"><span class="rt"><b>Daily pack</b><small>Make today's daily pack ready again.</small></span><button class="btn small" type="button" id="ctlDaily">Refill</button></div>
      <div class="pf-row"><span class="rt"><b>Screen info</b><small>Sizes this device reports, for fixing layout on phones.</small></span><button class="btn small" type="button" id="ctlScreen">Show</button></div>
      ${alerts?`<div class="pf-row"><span class="rt"><b>Alerts</b><small>Send yourself a test alert, or tonight's reminder now. Turn alerts on in Settings first.</small></span><span class="ctl-btns"><button class="btn small" type="button" id="ctlAlert">Alert</button><button class="btn small" type="button" id="ctlRemind">Reminder</button></span></div>`:''}
    </section>
    <section class="pf-card ctl-col"><h3>Looks</h3><p class="pf-hint left">Only developers can pick these.</p>${seg('ctlLook',look,[['off','Normal'],['aero','Aero'],['glass','Glass']])}</section></div>`;
  const B=$('#ctlBody'),on=(sel,fn)=>B.querySelectorAll(sel).forEach(b=>b.onclick=()=>{sfx('click');fn(b)});
  on('#ctlUnlock button',b=>{const v=b.dataset.k==='true';if(!!SAVE.unlockAll===v)return;SAVE.unlockAll=v;save();ctlMe();toast(v?'All cards unlocked.':'Back to your own collection.')});
  on('#ctlLv',()=>{const lv=levelOf(SAVE.xp)+1;SAVE.xp=lvlXp(lv);const got=grantPacks(SAVE);profCheck();save();renderProfile();ctlMe();
    toast(`Level ${lv}`+(got.length?` · ${PACKS[got[0].t].name} pack added`:''));freshToast()});
  on('#ctlDaily',()=>{SAVE.daily={at:yesterday(),n:SAVE.daily?SAVE.daily.n:0};save();toast('Daily pack is ready.')});
  on('#ctlScreen',screenInfo);
  // the same tests Settings had (alerts.js)
  const test=(b,fn)=>async()=>{if(ALERTS.busy)return;ALERTS.busy=true;b.disabled=true;try{await fn()}catch(e){toast(e.message,5000)}finally{ALERTS.busy=false;b.disabled=false}};
  on('#ctlAlert',b=>test(b,alertsTest)());
  on('#ctlRemind',b=>test(b,dailyAlertTest)());
  on('#ctlLook button',b=>{SAVE.aero=b.dataset.k==='aero';SAVE.liquid=b.dataset.k==='glass';save();applyTheme();
    B.querySelectorAll('#ctlLook button').forEach(x=>{x.classList.toggle('on',x===b);x.setAttribute('aria-pressed',x===b)})});
}

/* ---------- the Server section's switches, as every game gets them (announce.js annLoad) ---------- */
// pause: the message Host and Join show instead (null: online play is on); reloadKey: the ask this device answered
const LIVE={pause:null,reloadV:'',reloadKey:''};
const LIVE_KEY='leylines.reloadAsk';
function ctlLive(r){
  const p=typeof r.pause==='string'&&r.pause?r.pause:null;
  if(p!==LIVE.pause){LIVE.pause=p;if($('#scr-menu').classList.contains('on'))renderHero()}
  // a new version is out: a game older than it is asked once to reload
  const rl=r.reload;
  if(rl&&typeof rl.v==='string'&&verLess(VERSION,rl.v)){
    let seen='';try{seen=localStorage.getItem(LIVE_KEY)||''}catch(e){}
    const key=`${rl.v}@${rl.at}`;
    if(seen!==key){LIVE.reloadV=rl.v;LIVE.reloadKey=key;ctlReloadMaybe()}
  }
  // gifts for everyone: this save takes each one once
  const got=(Array.isArray(r.gifts)?r.gifts:[]).filter(g=>g&&Number.isInteger(g.id)&&!SAVE.giftAll.includes(g.id)&&g.end>annNow()&&(PACKS[g.pack]||Number.isInteger(g.shards)&&g.shards>0));
  if(!got.length)return;
  got.forEach(g=>{if(PACKS[g.pack])SAVE.packs.push({t:g.pack,src:'gift'});else SAVE.shards+=g.shards});
  SAVE.giftAll=[...SAVE.giftAll,...got.map(g=>g.id)].slice(-50);save();
  toast(`A gift from the team: ${got.map(g=>PACKS[g.pack]?aPack(g.pack):shardsTxt(g.shards)).join(' and ')}`,4000);
  if($('#scr-menu').classList.contains('on'))renderPackTile();
  renderProfile();
}
// "a new version is ready", on the menu when nothing else is open (announce.js annBigMaybe calls this too)
function ctlReloadMaybe(){
  if(!LIVE.reloadV||G||!$('#scr-menu').classList.contains('on')||$('#modal').classList.contains('on'))return;
  const v=LIVE.reloadV;LIVE.reloadV='';
  try{localStorage.setItem(LIVE_KEY,LIVE.reloadKey)}catch(e){}
  modal(`<h2 class="nm2">A new version is ready</h2><p>Leylines v${esc(v)} is out, and you're on v${VERSION}. Reload to get it. Your progress is saved.</p>`,
    [{label:'Later',esc:true},{label:'Reload now',cls:'primary',fn:()=>location.reload()}]);
}
// Host and Join check this first (online.js, duo.js). Developers can still play, to test what they paused
function onlinePaused(){
  if(!LIVE.pause)return false;
  if(isDev()){toast('Online play is paused for players. You can still play.',3000);return false}
  modal(`<h2 class="nm2">Online play is paused</h2><p dir="auto">${esc(LIVE.pause)}</p><p>Solo and Couch still work.</p>`,[{label:'OK',cls:'primary',esc:true}]);
  return true;
}
// the Play card's Online side says so too (menu.js heroPane)
const pauseChip=()=>LIVE.pause?`<span class="hero-boost hero-paused"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5v14M15 5v14"/></svg><span dir="auto">${esc(LIVE.pause)}</span></span>`:'';

/* ---------- the Server section ---------- */
const ctlAgo=t=>{const s=Math.max(0,Math.round((Date.now()-t)/1000));return s<60?`${s} s ago`:s<3600?`${Math.round(s/60)} min ago`:`${Math.floor(s/3600)} h ${Math.round(s%3600/60)} min ago`};
const ctlUp=ms=>{const m=Math.floor(ms/60e3),h=Math.floor(m/60),d=Math.floor(h/24);return d?`${d}d ${h%24}h`:h?`${h}h ${m%60}m`:`${m}m`};
async function ctlServerSec(){
  $('#ctlBody').innerHTML='<p class="pf-hint"><span class="spin"></span> Asking the server…</p>';
  try{CTL.srv=await api('/admin/server')}
  catch(e){if(CTL.sec==='server')$('#ctlBody').innerHTML=`<section class="pf-card"><p class="pf-hint left">${esc(e.message)}</p></section>`;return}
  if(CTL.sec==='server')ctlServerDraw();
}
function ctlServerDraw(){
  const s=CTL.srv,d=s.db,pg=d.kind==='postgres',awake=Date.now()-d.last<5*60e3,max=Math.max(1,...d.perHour);
  const tile=(label,big,sub)=>`<section class="pf-card ctl-tile"><small>${label}</small><b>${big}</b><small>${sub}</small></section>`;
  const hour=i=>new Date(Date.now()-(d.perHour.length-1-i)*3600e3).toLocaleTimeString('en-GB',{hour:'2-digit'});
  const open=(s.gifts||[]).filter(g=>g.end>Date.now()),past=(s.gifts||[]).filter(g=>g.end<=Date.now()).slice(0,3);
  const giftName=g=>PACKS[g.pack]?`${PACKS[g.pack].name} pack`:shardsTxt(g.shards);
  $('#ctlBody').innerHTML=`<div class="ctl-srv">
    <div class="ctl-tiles">${tile('Signed in now',s.online,`${s.free} free to play`)}${tile('Alerts on',s.alerts==null?'Off':s.alerts,s.alerts==null?'this server sends none':'players')}
      ${tile('Server up',ctlUp(s.now-s.started),'since it last started')}${tile('Live version',esc(s.live||'?'),`${s.old} signed-in ${s.old===1?'game':'games'} on older ones`)}</div>
    <div class="ctl-grid">
      <section class="pf-card"><h3>Database <button class="pf-link" type="button" id="srvRefresh">Refresh</button></h3>
        <p class="ctl-db"><i class="${!pg||awake?'on':''}"></i><b>${pg?(awake?'Awake':'Asleep'):'Local file'}</b><span>· last asked ${d.last?ctlAgo(d.last):'never'}</span></p>
        <p class="ctl-line">${pg?'It goes to sleep after 5 minutes with no questions, and the free plan counts the hours it\'s awake. ':''}${fmtSh(d.n)} questions since the server started.</p>
        <div class="ctl-bars" role="img" aria-label="Questions per hour, the last ${d.perHour.length} hours: ${d.perHour.join(', ')}">${d.perHour.map((n,i)=>`<span title="${hour(i)}:00 · ${n}"><i style="height:${Math.round(n/max*100)}%"></i></span>`).join('')}</div>
        <div class="ctl-bars-x" aria-hidden="true"><span>${hour(0)}:00</span><span>now</span></div></section>
      <section class="pf-card"><h3>Maintenance</h3>
        <label class="an-check"><input type="checkbox" id="srvPause"${s.pause?' checked':''}><span><b>Pause online play</b><small>${s.pause?`Paused ${ctlAgo(s.pause.at)} by ${esc(s.pause.by)}. `:''}Host and Join show the message below; Solo and Couch keep working</small></span></label>
        <label class="an-fld" for="srvMsg"><span>Message players see</span><input id="srvMsg" type="text" maxlength="120" value="${esc(s.pause?s.pause.msg:'Back in 30 minutes. We\'re fixing something.')}"></label>
        <button class="btn small" type="button" id="srvSave">${s.pause?'Save the message':'Pause now'}</button>
        <div class="ctl-ev"><span class="rt"><b>Ask older games to reload</b><small>${s.old?`${s.old} signed-in ${s.old===1?'game is':'games are'} on a version before ${esc(s.live)}`:'Every signed-in game is up to date'}${s.reload?` · last asked ${ctlAgo(s.reload.at)}`:''}. Guests are asked too.</small></span><button class="btn small" type="button" id="srvReload">Ask them</button></div></section>
      <section class="pf-card ctl-wide"><h3>Gifts for everyone</h3>
        <p class="ctl-line">After a break or a bug: every player gets it once, the next time they open the game in the next 7 days. Guests too.</p>
        <div class="ctl-gift-row"><div class="pf-gift">${Object.keys(PACKS).map(t=>`<button class="btn small" type="button" data-all="${t}">${PACKS[t].name} pack</button>`).join('')}</div>
          <div class="ctl-inrow"><label class="sr" for="srvSh">Shards</label><input id="srvSh" type="number" min="1" max="10000" step="1" inputmode="numeric" value="300"><button class="btn small" type="button" id="srvShGo">Shards</button></div></div>
        ${open.map(g=>`<div class="ctl-ev"><span class="rt"><b>${giftName(g)}</b><small>Given ${ctlAgo(g.at)} by ${esc(g.by)} · open until ${ctlWhen(g.end)}</small></span><span class="an-st ok">Open</span><button class="btn small danger" type="button" data-stop="${g.id}">Stop</button></div>`).join('')}
        ${past.map(g=>`<div class="ctl-ev"><span class="rt"><b>${giftName(g)}</b><small>Given by ${esc(g.by)} · ended ${ctlWhen(g.end)}</small></span><span class="an-st">Ended</span></div>`).join('')}</section>
    </div></div>`;
  const B=$('#ctlBody'),call=async(path,method,body,done)=>{try{await api(path,{method,body});if(done)toast(done,2500);annLoad();await ctlServerSec()}catch(e){toast(e.message,3500)}};
  $('#srvRefresh').onclick=()=>{sfx('click');ctlServerSec()};
  $('#srvPause').onchange=e=>{sfx('click');if(e.target.checked)call('/admin/server/pause','PUT',{on:true,msg:$('#srvMsg').value},'Online play is paused');else call('/admin/server/pause','PUT',{on:false},'Online play is back on')};
  $('#srvSave').onclick=()=>{sfx('click');call('/admin/server/pause','PUT',{on:true,msg:$('#srvMsg').value},s.pause?'Message saved':'Online play is paused')};
  $('#srvReload').onclick=()=>{sfx('click');modal(`<h2 class="nm2">Ask older games to reload?</h2><p>Every game older than v${esc(s.live)} gets a popup once, with Reload now and Later.</p>`,
    [{label:'Cancel',esc:true},{label:'Ask them',cls:'primary',fn:()=>call('/admin/server/reload','POST',undefined,'Older games will be asked to reload')}])};
  const give=(body,what)=>modal(`<h2 class="nm2">Give everyone ${what}?</h2><p>Every player gets it once, the next time they open the game in the next 7 days.</p>`,
    [{label:'Cancel',esc:true},{label:'Give it',cls:'primary',fn:()=>call('/admin/server/gifts','POST',body,`Everyone gets ${what}`)}]);
  B.querySelectorAll('[data-all]').forEach(b=>b.onclick=()=>{sfx('click');give({pack:b.dataset.all},aPack(b.dataset.all))});
  $('#srvShGo').onclick=()=>{sfx('click');const n=Math.round(+$('#srvSh').value);give({shards:n},shardsTxt(n))};
  B.querySelectorAll('[data-stop]').forEach(b=>b.onclick=()=>{sfx('click');call(`/admin/server/gifts/${b.dataset.stop}/end`,'POST',undefined,'Stopped. Games that took it keep it')});
}
