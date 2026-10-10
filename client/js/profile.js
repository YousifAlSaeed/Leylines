'use strict';
/* =====================================================================
   PROFILE  (levels, badges, match tracking and the profile screen)
   Your profile is built from the save, so guests have one too. A shared
   link (?u=name) shows someone else's, read-only, from /api/users/:name.
   ===================================================================== */
// XP per match by opponent, as [win, draw, loss]. Leaving early and Couch give none.
// challenger: the Daily Duel and Gauntlet CPU; boss: the Gauntlet's last stage
const MATCH_XP={easy:[20,10,5],normal:[40,20,10],hard:[60,30,15],challenger:[50,25,10],boss:[80,40,15],online:[60,30,20]};
const TITLES=[[1,'Wanderer'],[3,'Apprentice'],[5,'Card Adept'],[8,'Leyweaver'],[12,'Rune Master'],[16,'Archmage'],[20,'Ley Sovereign']];
const titleOf=lv=>TITLES.filter(t=>lv>=t[0]).pop()[1];
const RINGS=['#8B6CFF','#FF5FA8','#2F5FD0','#5EE6B0','#f0c35c','#C8344F'];
const PROF={fresh:[],view:null};

/* ---------- badges ---------- */
// groups: [name, icon, badges]. A badge: [id, icon, name, how to earn, tier, test] — badges with a test are worked out from the save;
// the rest are earned by something that happens (earn() is called there).
// Each tier pays shards once, when you tap the badge on your profile (SAVE.bclaim holds the ones claimed)
const BADGE_SHARDS={b:20,s:50,g:120,p:300};
const BADGE_TIER={b:'Bronze',s:'Silver',g:'Gold',p:'Prism'};
const totals=s=>{const t=s.stats;return{w:t.w+t.ow,l:t.l+t.ol,d:t.d+t.od,n:t.w+t.l+t.d+t.ow+t.ol+t.od}};
const seenRar=(s,r)=>s.seen.some(i=>CARDS[i].rar===r);
const BADGE_GROUPS=[
  ['Getting started','🧭',[
    ['first','🏆','First win','Win a match','b',s=>totals(s).w>=1],
    ['tut','🎓','Lesson learned','Finish the tutorial','b',s=>s.tut===2],
    ['pack1','🎁','First pack','Open a pack','b',s=>s.opened>=1],
    ['friend','🤝','Making friends','Add a friend','b'],
    ['emote','😄','Say hi','Send an emote in a match','b']]],
  ['Winning','🏆',[
    ['streak3','🔥','On fire','Win 3 matches in a row','b',s=>s.best>=3],
    ['streak5','☄️','Unstoppable','Win 5 matches in a row','s',s=>s.best>=5],
    ['streak10','🌋','Legendary run','Win 10 matches in a row','g',s=>s.best>=10],
    ['hard','🧠','Outsmarted','Beat the CPU on Hard','s',s=>s.beat>=2],
    ['series','🎖️','Series champ','Win a Best of 3 or Best of 5','s'],
    ['comeback','🔄','Comeback','Win a series after losing its first match','g']]],
  ['Playing','🎴',[
    ['played10','🎴','Regular','Play 10 matches','b',s=>totals(s).n>=10],
    ['played50','🗡️','Veteran','Play 50 matches','s',s=>totals(s).n>=50],
    ['played100','🛡️','Centurion','Play 100 matches','g',s=>totals(s).n>=100],
    ['played500','🏛️','Ley legend','Play 500 matches','p',s=>totals(s).n>=500]]],
  ['Online','🌐',[
    ['online','🌐','Hello, world','Win an online match','b',s=>s.stats.ow>=1],
    ['online10','🛰️','Far reach','Win 10 online matches','s',s=>s.stats.ow>=10],
    ['online50','⚔️','Conqueror','Win 50 online matches','g',s=>s.stats.ow>=50],
    ['ostreak5','📡','Hot streak','Win 5 online matches in a row','g',s=>s.obest>=5]]],
  ['Big moves','💥',[
    ['same','⚖️','Same!','Flip a card with Same','b'],
    ['plus','➕','Plus!','Flip a card with Plus','b'],
    ['combo','⛓️','Chain reaction','Flip a card with a Combo','s'],
    ['big','💥','Big turn','Flip 5 cards in one move','s'],
    ['sweep','💯','Clean sweep','Win owning all 9 squares','s'],
    ['sudden','⏳','Overtime','Win a match in Sudden death','b'],
    ['elemental','🔮','Elementalist','Win with the Elemental rule on','b'],
    ['reverse','🙃','Upside down','Win with the Reverse rule on','b'],
    ['chaos','🎲','Chaos tamer','Win with the Chaos rule on','b'],
    ['random','🃏','Lucky draw','Win with the Random rule on','b']]],
  ['Trades','💰',[
    ['spoils','💰','Spoils of war','Win a card in a trade','b'],
    ['tradeall','🎰','High roller','Win a match with Trade: All','s'],
    ['winback','↩️','Got it back','Win back a card from the CPU','s'],
    ['laststand','🏹','Last stand','Win a Last chance','g']]],
  ['Kindness','💛',[
    ['spare1','💛','Kind heart','Spare a player instead of taking their cards','b',s=>s.spares>=1],
    ['spare10','🕊️','Peacemaker','Spare 10 players','s',s=>s.spares>=10],
    ['spare50','😇','Guardian','Spare 50 players','g',s=>s.spares>=50]]],
  ['Daily','📅',[
    ['duel','🤺','Duelist','Win a Daily Duel','b'],
    ['puzzle','🧩','Puzzler','Solve a Daily Puzzle','b'],
    ['gauntlet','👹','Gauntlet master','Beat the Gauntlet boss','g'],
    ['fullday','📅','Full day','Win the Duel, solve the Puzzle and clear the Gauntlet in one day','s']]],
  ['Collection','📚',[
    ['found25','📗','Collector','Find 25 different cards','b',s=>s.seen.length>=25],
    ['found40','📘','Curator','Find 40 different cards','s',s=>s.seen.length>=40],
    ['foundall','📚','Complete set',`Find all ${CARDS.length} cards`,'p',s=>s.seen.length>=CARDS.length],
    ['legend','👑','Legendary','Find a 5★ card','g',s=>seenRar(s,5)],
    ['elements','🌈','All elements','Find a card of every element','s',s=>ELEM_KEYS.every(e=>s.seen.some(i=>CARDS[i].e===e))],
    ['shop','🛒','Shopper','Buy something in the Store','b'],
    ['packs25','📦','Pack rat','Open 25 packs','s',s=>s.opened>=25]]],
  ['Levels','⭐',[
    ['lv5','🌱','Card adept','Reach level 5','b',s=>levelOf(s.xp)>=5],
    ['lv10','⭐','Seasoned','Reach level 10','s',s=>levelOf(s.xp)>=10],
    ['lv16','🔱','Archmage','Reach level 16','g',s=>levelOf(s.xp)>=16],
    ['lv20','🌌','Ley sovereign','Reach level 20','p',s=>levelOf(s.xp)>=20]]],
];
const BADGES=BADGE_GROUPS.flatMap(g=>g[2]);
// how close you are to a badge that counts something: [have, need] (shown when you tap it)
const BADGE_PROG={streak3:s=>[s.best,3],streak5:s=>[s.best,5],streak10:s=>[s.best,10],
  played10:s=>[totals(s).n,10],played50:s=>[totals(s).n,50],played100:s=>[totals(s).n,100],played500:s=>[totals(s).n,500],
  online10:s=>[s.stats.ow,10],online50:s=>[s.stats.ow,50],ostreak5:s=>[s.obest,5],spare10:s=>[s.spares,10],spare50:s=>[s.spares,50],
  found25:s=>[s.seen.length,25],found40:s=>[s.seen.length,40],foundall:s=>[s.seen.length,CARDS.length],packs25:s=>[s.opened,25],
  lv5:s=>[levelOf(s.xp),5],lv10:s=>[levelOf(s.xp),10],lv16:s=>[levelOf(s.xp),16],lv20:s=>[levelOf(s.xp),20]};
const BADGE=Object.fromEntries(BADGES.map(b=>[b[0],b]));
function earn(id){
  if(SAVE.badges[id]||!BADGE[id])return;
  SAVE.badges[id]=new Date().toISOString().slice(0,10);PROF.fresh.push(id);
}
// stored after a match; also worked out on the spot, so a profile is right before its next match
function profCheck(){BADGES.forEach(b=>{if(b[5]&&b[5](SAVE))earn(b[0])})}
const hasBadge=(s,b)=>!!s.badges[b[0]]||!!(b[5]&&b[5](s));
// your badges whose shards haven't been claimed yet
const toClaim=()=>BADGES.filter(b=>hasBadge(SAVE,b)&&!SAVE.bclaim[b[0]]);
// tap a glowing badge on your profile: its shards go to your wallet, once
function claimBadge(id){
  const b=BADGE[id];if(!b||SAVE.bclaim[id]||!hasBadge(SAVE,b))return 0;
  earn(id);PROF.fresh=PROF.fresh.filter(x=>x!==id);
  const n=BADGE_SHARDS[b[4]];SAVE.bclaim[id]=1;SAVE.shards+=n;save();
  return n;
}
// the line over your badges: how many have shards waiting
const waitShards=w=>w.reduce((a,b)=>a+BADGE_SHARDS[b[4]],0);
function bwaitHTML(){const w=toClaim();if(!w.length)return '';
  return `${shd()}<b>${fmtSh(waitShards(w))} shards</b> waiting in ${plural(w.length,'badge')}. Open a group with a dot to claim them.`}
// the profile's Badges card: a card for each group, with a dot where shards wait and a gold frame once it's complete
function bgroupsHTML(s,mine){
  return BADGE_GROUPS.map(([n,e,bs],i)=>{const k=bs.filter(b=>hasBadge(s,b)).length,done=k===bs.length,dot=mine&&bs.some(b=>hasBadge(s,b)&&!SAVE.bclaim[b[0]]);
    return `<button class="bg-card${done?' done':''}" data-g="${i}" aria-label="${n}: ${k} of ${bs.length}${dot?', shards to claim':''}">${dot?'<i class="bg-dot" aria-hidden="true"></i>':''}`+
      `<span class="bg-emb" aria-hidden="true">${e}</span><b>${n}</b><span class="bg-bar"><i style="width:${(k/bs.length*100).toFixed(0)}%"></i></span><small>${done?'Complete':k+' / '+bs.length}</small></button>`}).join('');
}
// one badge in a group's popup: its medal (tier colour), what it takes, and Claim / Claimed / how close you are
function bRowHTML(b,s,mine){
  const on=hasBadge(s,b),cl=mine&&on&&!SAVE.bclaim[b[0]],n=BADGE_SHARDS[b[4]],pr=mine&&!on&&BADGE_PROG[b[0]]?BADGE_PROG[b[0]](s):null;
  const right=cl?`<button class="btn small bg-claim" data-claim="${b[0]}">Claim ${shd()}${n}</button>`
    :on?`<span class="bg-st done">✓ ${mine?'Claimed':'Earned'}</span>`:`<span class="bg-st">${pr?`${Math.min(pr[0],pr[1])} / ${pr[1]}`:'Locked'}</span>`;
  return `<div class="bg-row${on?'':' off'}"><span class="bg-medal t-${b[4]}" aria-hidden="true">${b[1]}</span>`+
    `<span class="bg-tx"><b>${esc(b[2])}</b><small>${esc(b[3])}${on?'':` · ${BADGE_TIER[b[4]]}, ${n} shards`}</small>`+
    `${pr?`<span class="bg-pbar"><i style="width:${(Math.min(1,pr[0]/pr[1])*100).toFixed(0)}%"></i></span>`:''}</span>${right}</div>`;
}
// a group tapped on the profile: its badges, with a Claim button on each one whose shards wait
function badgeGroup(s,mine,g){
  const[n,e,bs]=BADGE_GROUPS[g];
  const box=modal(`<div class="kick">Badges</div><h2 class="nm2">${e} ${n}</h2><p>${bs.filter(b=>hasBadge(s,b)).length} of ${bs.length}</p>`+
    `<div class="bg-rows">${bs.map(b=>bRowHTML(b,s,mine)).join('')}</div>`+(mine?`<p class="bg-foot" id="bgFoot">${bfootHTML()}</p>`:''),[{label:'Close',cls:'primary',esc:true}]);
  box.classList.add('bg-box');
  box.querySelectorAll('[data-claim]').forEach(btn=>btn.onclick=()=>badgeClaimed(btn));
}
const bfootHTML=()=>{const w=toClaim();return `<span>${w.length?`${shd()}<b>${fmtSh(waitShards(w))}</b> shards waiting`:'All badge shards claimed'}</span><span>Wallet <b>${shd()}${fmtSh(SAVE.shards)}</b></span>`};
// Claim tapped: the shards fly off the button into your wallet, and the profile behind catches up
function badgeClaimed(btn){
  const b=BADGE[btn.dataset.claim],n=b&&claimBadge(b[0]);if(!n)return;
  sfx('flip');
  const st=document.createElement('span');st.className='bg-st done';st.innerHTML=`✓ Claimed<em class="pf-bfly" aria-hidden="true">+${n}</em>`;
  btn.replaceWith(st);setTimeout(()=>{const f=st.querySelector('.pf-bfly');if(f)f.remove()},1000);
  const f=$('#bgFoot');if(f)f.innerHTML=bfootHTML();
  renderProfilePage();renderProfile();toast(`${b[1]} ${b[2]}: +${shardsTxt(n)}`,1800);
}
// out of a match (a pack, the Store, a friend): new badges show as a toast
function earnNow(id){earn(id);if(PROF.fresh.length){save();freshToast()}}
// badges earned since the last time they were shown
function freshHTML(){
  const f=PROF.fresh.splice(0);
  return f.length?`<div class="pf-new">${f.map(id=>`<span>${BADGE[id][1]} <b>${BADGE[id][2]}</b></span>`).join('')}</div>`:'';
}
function freshToast(){
  const f=PROF.fresh.splice(0);
  if(f.length)toast((f.length>1?'Badges earned: ':'Badge earned: ')+f.map(id=>BADGE[id][1]+' '+BADGE[id][2]).join(', '),3200);
}

/* ---------- match tracking (match.js and online.js call these) ---------- */
// res: 'w' | 'l' | 'd'. o: {online, diff, sweep, sd, rules (the rule badges), left: left early (no shards)}. Returns what the result screen shows.
// o.daily: a Daily game (daily.js) gives XP but isn't a win, loss or draw on your record
function recordMatch(res,o={}){
  const k=(o.online?'o':'')+res,rec=!o.daily;
  if(rec)SAVE.stats[k]=(SAVE.stats[k]||0)+1;
  const lv0=levelOf(SAVE.xp),xp=MATCH_XP[o.online?'online':o.diff]||MATCH_XP.normal,gain=o.left?0:xp['wdl'.indexOf(res)];
  SAVE.xp+=gain;
  const packs=grantPacks(SAVE),{sh,capped}=matchShards(res,o);
  // a draw doesn't break a streak, it just doesn't add to it
  if(rec){
    if(res==='w'){SAVE.streak++;SAVE.best=Math.max(SAVE.best,SAVE.streak)}else if(res==='l')SAVE.streak=0;
    SAVE.recent=[...SAVE.recent,res].slice(-10);
  }
  if(o.online){
    if(res==='w'){SAVE.ostreak++;SAVE.obest=Math.max(SAVE.obest,SAVE.ostreak)}else if(res==='l')SAVE.ostreak=0;
    SAVE.orecent=[...SAVE.orecent,res].slice(-10);
  }
  if(res==='w'){
    const di=DIFFS.findIndex(d=>d[0]===o.diff);
    if(!o.online&&rec&&di>SAVE.beat)SAVE.beat=di;
    if(o.sweep)earn('sweep');
    if(o.sd)earn('sudden');
    for(const k of ['elemental','reverse','chaos','random'])if(o.rules&&o.rules[k])earn(k);
  }
  profCheck();save();
  return {gain,lv0,lv:levelOf(SAVE.xp),packs,sh,capped};
}
// a move's flips, for the badges (only your own moves in CPU and online matches)
function profFlips(ev){
  let n=0;
  for(const e of ev){n+=e.cells.length;if(e.t!=='basic')earn(e.t)}
  if(n>=5)earn('big');
  if(PROF.fresh.length)save();
}
function rewardHTML(r){
  const up=r.lv>r.lv0,newTitle=titleOf(r.lv)!==titleOf(r.lv0);
  return `<div class="pf-reward">${r.gain?`<span class="pf-gain">+${r.gain} XP</span>`:''}`+
    (r.sh?`<span class="pf-shard">${shd()}+${r.sh}</span>`:'')+(r.capped?'<span class="pf-cap">Daily shard limit reached</span>':'')+
    (up?`<span class="pf-up">Level ${r.lv}${newTitle?' · '+titleOf(r.lv):''}</span>`:'')+
    Object.entries((r.packs||[]).reduce((n,k)=>(n[k.t]=(n[k.t]||0)+1,n),{})).map(([t,n])=>`<span class="pf-pack">🎁 ${PACKS[t].name} pack${n>1?' ×'+n:''}</span>`).join('')+`</div>`+freshHTML();
}

/* ---------- screen info (developer tool) ---------- */
// Full-screen panel with the sizes the device reports, and coloured bars sized five different ways, so a screenshot
// shows which way reaches the real bottom of the screen. Tap anywhere to close.
function screenInfo(){
  const bars=[['inset 0','top:0;bottom:0','#ff4d6d'],['100vh','top:0;height:100vh','#3ddc84'],['100dvh','top:0;height:100dvh','#4da3ff'],
    ['100lvh','top:0;height:100lvh','#ffd23f'],['100svh','top:0;height:100svh','#c77dff']];
  const d=document.createElement('div');
  d.style.cssText='position:fixed;top:0;left:0;width:100vw;height:100lvh;z-index:999;background:#0b0820;color:#fff;font:12px/1.45 ui-monospace,monospace;overflow:hidden';
  d.innerHTML=bars.map(([l,css,c],i)=>`<div data-bar="${l}" style="position:fixed;${css};right:${8+i*22}px;width:14px;background:${c};opacity:.85">`+
    `<span style="position:absolute;bottom:${4+i*18}px;right:${110-i*22}px;white-space:nowrap;color:${c};font-weight:700">${l} ▸</span></div>`).join('')+'<pre id="siTxt" style="margin:0;padding:calc(env(safe-area-inset-top) + 8px) 130px 0 12px;white-space:pre-wrap"></pre>';
  document.body.append(d);
  const sa=getComputedStyle($('#safe')),g=$('#scr-game'),gp=getComputedStyle(g);
  const barH=l=>Math.round(d.querySelector(`[data-bar="${l}"]`).getBoundingClientRect().height);
  const vv=window.visualViewport;
  d.querySelector('#siTxt').textContent=[
    'Leylines screen info  (tap to close)','',
    'home-screen app  '+(navigator.standalone===true)+'   display-mode standalone  '+matchMedia('(display-mode: standalone)').matches,
    'screen           '+screen.width+' x '+screen.height+'   dpr '+devicePixelRatio,
    'window inner     '+innerWidth+' x '+innerHeight+'   outer '+outerWidth+' x '+outerHeight,
    'visualViewport   '+(vv?Math.round(vv.width)+' x '+Math.round(vv.height)+'  top '+Math.round(vv.offsetTop):'none'),
    'html client      '+document.documentElement.clientWidth+' x '+document.documentElement.clientHeight,
    'safe areas       top '+sa.paddingTop+'  bottom '+sa.paddingBottom+'  left '+sa.paddingLeft+'  right '+sa.paddingRight,
    'bars (height)    '+bars.map(([l])=>l+' '+barH(l)).join('  '),
    'classes '+(document.documentElement.className||'(none)')+'   --ui '+UI,
    'ios check        '+(iosFlags.last?`app ${iosFlags.last.app}  top ${iosFlags.last.top}  gap ${iosFlags.last.gap}`:'not run'),
    'game padding     top '+gp.paddingTop+'  bottom '+gp.paddingBottom,
    'offline helper   '+(navigator.serviceWorker&&navigator.serviceWorker.controller?'on':'off'),
    navigator.userAgent].join(String.fromCharCode(10));
  d.onclick=()=>d.remove();
}

/* ---------- avatar ---------- */
const initialOf=name=>esc(([...String(name||'?').trim()][0]||'?').toUpperCase());
const artOf=a=>a&&CARDS[a.c]?CARDS[a.c].art:'';
function profName(){return ACCT.token&&ACCT.user?ACCT.user.displayName:cleanName(SAVE.name)||'Guest'}
function pickAvatar(){
  let a=SAVE.avatar?{...SAVE.avatar}:null,ring=a?a.r:0;
  const box=modal(`<h2 class="nm2">Your avatar</h2><p>Any card you've found can be your picture.</p>
    <div class="pf-avprev"><span class="pf-av big" id="avPrev"></span></div>
    <div class="pf-rings" role="group" aria-label="Ring colour">${RINGS.map((c,i)=>`<button style="--c:${c}" data-r="${i}" aria-label="Ring colour ${i+1}"></button>`).join('')}</div>
    <div class="pf-avgrid" role="group" aria-label="Pick a card"><button data-c="-1" class="pf-letter" aria-label="Your initial">${initialOf(profName())}</button>${
      // cards you've found first, then the ones still to find
      [...CARDS].sort((x,y)=>isSeen(y.id)-isSeen(x.id)).map(c=>isSeen(c.id)?`<button data-c="${c.id}" aria-label="${esc(c.name)}">${c.art}</button>`:`<button disabled aria-label="Not found yet">?</button>`).join('')}</div>`,
    [{label:'Cancel',esc:true},{label:'Save',cls:'primary',fn:()=>{SAVE.avatar=a;save();renderProfile();renderProfilePage();toast('Avatar saved.')}}]);
  const paint=()=>{
    if(a)a.r=ring;
    const p=box.querySelector('#avPrev');p.style.setProperty('--ring',RINGS[ring]);p.innerHTML=a?artOf(a):initialOf(profName());p.classList.toggle('letter',!a);
    box.querySelectorAll('.pf-rings button').forEach(b=>{const on=+b.dataset.r===ring;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on)});
    box.querySelectorAll('.pf-avgrid button[data-c]').forEach(b=>{const on=+b.dataset.c===(a?a.c:-1);b.classList.toggle('on',on);b.setAttribute('aria-pressed',on)});
  };
  box.querySelectorAll('.pf-rings button').forEach(b=>b.onclick=()=>{sfx('click');ring=+b.dataset.r;paint()});
  box.querySelectorAll('.pf-avgrid button[data-c]').forEach(b=>b.onclick=()=>{sfx('click');const c=+b.dataset.c;a=c<0?null:{c,r:ring};paint()});
  paint();
}

/* ---------- showcase: up to 3 pinned cards ---------- */
function pickShowcase(){
  const sel=SAVE.showcase.filter(isSeen);
  const ids=CARDS.filter(c=>isSeen(c.id)).sort((x,y)=>y.rar-x.rar||y.sum-x.sum).map(c=>c.id);
  const box=modal(`<h2 class="nm2">Showcase</h2><p>Pick up to 3 cards to show on your profile.</p>
    <div class="pf-pick">${ids.map(id=>`<button class="pk" data-id="${id}" aria-label="${esc(cardLabel(id))}">${cardHTML(id,'blue')}</button>`).join('')}</div>`,
    [{label:'Cancel',esc:true},{label:'Save',cls:'primary',fn:()=>{SAVE.showcase=sel.slice();save();renderProfilePage()}}]);
  const paint=()=>box.querySelectorAll('.pf-pick .pk').forEach(b=>{const k=sel.indexOf(+b.dataset.id);
    b.classList.toggle('on',k>=0);b.dataset.n=k>=0?k+1:'';b.setAttribute('aria-pressed',k>=0)});
  box.querySelectorAll('.pf-pick .pk').forEach(b=>b.onclick=()=>{
    const id=+b.dataset.id,k=sel.indexOf(id);sfx('click');
    if(k>=0)sel.splice(k,1);else if(sel.length<3)sel.push(id);else toast('You can pin 3 cards. Tap one to unpin it.');
    paint();
  });
  paint();
}

/* ---------- account settings ---------- */
// erase everything and start over (the account's copy too, when signed in)
function confirmReset(after){
  pfForm({title:'Reset progress?',text:`Your cards, stats, level, badges, packs and settings will be erased and you'll start over with the starter cards.${ACCT.token?' This also resets your account.':''} This can't be undone.`,
    go:'Erase everything',danger:true,confirm:'RESET',fields:[],
    run:async()=>{const cid=SAVE.cid;SAVE=defSave();SAVE.cid=cid;save();applyTheme();updSnd();musicSync();renderProfile();after();toast('Progress reset.')}});
}
// a small form in a popup; run(values) throws to show an error and keep it open
// confirm: a word the player has to type before the button works (for things that can't be undone)
function pfForm({title,text='',fields,go,danger,run,confirm}){
  if(confirm)fields=[...fields,{label:`<span>Type <b>${confirm}</b> to confirm</span>`,name:'confirm',attrs:'autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="20"'}];
  const box=modal(`<h2 class="nm2">${title}</h2>${text?`<p>${text}</p>`:''}<form class="authf" novalidate>${fields.map(f=>
    `<label>${f.label}<input name="${f.name}" type="${f.type||'text'}" value="${esc(f.value||'')}" ${f.attrs||''}></label>`).join('')}
    <p class="auerr" role="alert"></p><button class="btn ${danger?'danger':'primary'} full" type="submit">${go}</button></form>`,
    [{label:'Cancel',cls:'text',esc:true}]);
  const f=box.querySelector('form'),err=f.querySelector('.auerr'),b=f.querySelector('[type=submit]');
  const typed=()=>!confirm||f.elements.confirm.value.trim().toUpperCase()===confirm;
  b.disabled=!typed();
  f.oninput=()=>{err.textContent='';b.disabled=!typed()};
  setTimeout(()=>f.elements[0].focus(),50);
  f.onsubmit=async e=>{
    e.preventDefault();if(!typed())return;sfx('click');b.disabled=true;
    try{await run(Object.fromEntries(new FormData(f)));closeModal()}
    catch(x){
      if(x.status===401){closeModal();acctSignedOut('Your session ended. Sign in again.');return}
      err.textContent=x.message;b.disabled=!typed();
    }
  };
}
function acctUser(u){ACCT.user=u;acctStore();renderProfile();renderProfilePage()}
function editName(){
  pfForm({title:'Display name',text:'Shown on your profile and in online matches.',go:'Save',
    fields:[{label:'Name',name:'name',value:ACCT.user.displayName,attrs:'maxlength="16" autocomplete="nickname" spellcheck="false"'}],
    run:async v=>{
      const name=cleanName(v.name);if(!name)throw new Error('Enter a name.');
      const r=await api('/me',{method:'PATCH',body:{displayName:name}});
      acctUser(r.user);toast('Name saved.');
    }});
}
function editEmail(){
  const has=!!ACCT.user.email;
  pfForm({title:has?'Change email':'Add an email',text:'Enter your password to confirm.',go:'Save',
    fields:[{label:'Email',name:'email',type:'email',value:ACCT.user.email||'',attrs:'maxlength="254" autocomplete="email" placeholder="you@example.com"'},
      {label:'Password',name:'password',type:'password',attrs:'maxlength="200" autocomplete="current-password"'}],
    run:async v=>{
      if(!v.password)throw new Error('Enter your password.');
      const r=await api('/me',{method:'PATCH',body:{email:v.email.trim(),password:v.password}});
      acctUser(r.user);toast(r.user.email?'Email saved.':'Email removed.');
    }});
}
function editPassword(){
  pfForm({title:'Change password',text:'Your other devices will be signed out.',go:'Change password',
    fields:[{label:'Current password',name:'password',type:'password',attrs:'maxlength="200" autocomplete="current-password"'},
      {label:'New password',name:'next',type:'password',attrs:'maxlength="200" autocomplete="new-password" placeholder="At least 8 characters"'}],
    run:async v=>{
      if(!v.password)throw new Error('Enter your current password.');
      if(v.next.length<8)throw new Error('New passwords need at least 8 characters.');
      await api('/me/password',{method:'PUT',body:{password:v.password,newPassword:v.next}});
      toast('Password changed.');
    }});
}
function deleteAccount(){
  pfForm({title:'Delete account?',text:`This removes <b>@${esc(ACCT.user.username)}</b> and its cloud save for good. Your progress stays on this device. This can't be undone.`,go:'Delete account',danger:true,confirm:'DELETE',
    fields:[{label:'Password',name:'password',type:'password',attrs:'maxlength="200" autocomplete="current-password"'}],
    run:async v=>{
      if(!v.password)throw new Error('Enter your password.');
      await api('/me',{method:'DELETE',body:{password:v.password}});
      acctSignedOut();toast('Account deleted. Your progress is still on this device.',3200);
    }});
}
async function profShare(){
  const u=ACCT.user,url=location.href.split(/[?#]/)[0]+'?u='+encodeURIComponent(u.username);
  // phones get the share sheet; desktops just copy
  if(navigator.share&&matchMedia('(pointer:coarse)').matches){navigator.share({title:'Leylines',text:`${u.displayName} on Leylines`,url}).catch(()=>{});return}
  try{await navigator.clipboard.writeText(url);toast('Profile link copied.')}catch(e){prompt('Copy your profile link:',url)}
}

/* ---------- the screen ---------- */
// view = null for your own profile, or {user, profile} from /api/users/:name; back = the screen its Back button returns to
const profBack=back=>{$('#scr-profile [data-back]').dataset.back=back};
function openProfile(view=null,back='menu'){PROF.view=view;Object.assign(HIST,{f:'all',n:HIST_PAGE,open:-1});profBack(back);renderProfilePage(true);show('profile');$('#scr-profile').scrollTop=0}
// opened from a shared link, or from your friend list (back = 'friends')
async function openPlayer(name,back='menu'){
  if(ACCT.token&&ACCT.user&&ACCT.user.username.toLowerCase()===name.toLowerCase())return openProfile(null,back);
  PROF.view={loading:true};profBack(back);show('profile');
  $('#pfTitle').textContent='Profile';
  $('#pfBody').innerHTML='<p class="pf-wait"><span class="spin"></span>Loading profile…</p>';
  try{const j=await api('/users/'+encodeURIComponent(name),{timeout:60000});if(PROF.view&&PROF.view.loading)openProfile({user:j,profile:j.profile},back)}
  catch(e){
    if(!PROF.view||!PROF.view.loading)return;
    $('#pfBody').innerHTML=`<p class="pf-wait">${esc(e.status===404?`There's no player called ${name}.`:e.message)}</p>`;
  }
}
// called after sign in / out and account changes; only redraws when it's showing
function renderProfilePage(force){
  if(!force&&!$('#scr-profile').classList.contains('on'))return;
  const v=PROF.view;if(v&&v.loading)return;
  const mine=!v,s=mine?SAVE:v.profile,u=mine?ACCT.token&&ACCT.user:v.user;
  const name=u?u.displayName:profName(),t=totals(s),lv=levelOf(s.xp);
  const lo=lvlXp(lv),hi=lvlXp(lv+1),pct=(s.xp-lo)/(hi-lo)*100;
  $('#pfTitle').textContent=mine?'Profile':'@'+u.username;
  const joined=u&&u.createdAt?new Date(u.createdAt).toLocaleDateString(undefined,{month:'short',year:'numeric'}):'';
  const played=`${t.n} match${t.n===1?'':'es'} played`;
  const meta=u?`@${esc(u.username)} · Joined ${joined} · ${played}`:`Playing as a guest · ${played}`;
  const a=s.avatar,art=artOf(a);
  const hero=`<div class="pf-hero">
    <button class="pf-av${art?'':' letter'}" id="pfAv" style="--ring:${RINGS[a?a.r:0]}" ${mine?'aria-label="Change avatar"':'disabled aria-hidden="true"'}>${art||initialOf(name)}<span class="pf-lv">LV ${lv}</span>${
      mine?'<span class="pf-edit" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg></span>':''}</button>
    <div class="pf-who">
      <span class="pf-title">✦ ${titleOf(lv)}</span>
      <h1 class="pf-name">${esc(name)}</h1>
      <div class="pf-meta">${meta}</div>
      <div class="pf-xp" role="img" aria-label="${s.xp} XP. ${hi-s.xp} XP to level ${lv+1}"><div class="pf-xpbar"><i style="width:${pct.toFixed(1)}%"></i></div><small>${s.xp-lo} / ${hi-lo} XP to Lv ${lv+1}</small></div>
    </div>
    <div class="pf-acts">${mine&&u?'<button class="btn small" id="pfShare"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 12h.01M4 12a8 8 0 1016 0 8 8 0 00-16 0"/><path d="M10 14l4-4M9 7h8v8"/></svg>Share</button>':''}${
      mine&&!u&&ACCT.up?'<button class="btn primary small" id="pfJoin">Create account</button>':''}${!mine&&u?friendBtn(u.username,{remove:true}):''}</div>
  </div>`;

  // record: online matches only, like the leaderboard; games against the computer get one line at the bottom
  const st=s.stats,ol={w:st.ow,l:st.ol,d:st.od},n=ol.w+ol.l+ol.d;
  const rate=n?Math.round(ol.w/n*100):0,W=n?ol.w/n*100:0,L=n?ol.l/n*100:0,D=n?ol.d/n*100:0;
  const seg=(len,off,col,op='')=>len?`<circle cx="21" cy="21" r="16" pathLength="100" stroke="${col}" ${op} stroke-dasharray="${len} ${100-len}" stroke-dashoffset="${-off}"/>`:'';
  const rec=`<span class="pf-form">${s.orecent.map(r=>`<i class="${r}">${r.toUpperCase()}</i>`).join('')}</span>`;
  const cpu=st.w+st.l+st.d||s.beat>=0?`<div class="pf-cpu"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="7" width="14" height="12" rx="3"/><path d="M12 3v4M9 12h.01M15 12h.01M9 16h6"/></svg>`+
    `<span>Solo <b>${st.w} W · ${st.l} L · ${st.d} D</b></span>${s.beat>=0?`<span>Toughest beaten <b>${DIFFS[s.beat][1]}</b></span>`:''}</div>`:'';
  const record=`<section class="pf-card"><h3>Online record</h3>
    <div class="pf-rec">
      <div class="pf-ring" role="img" aria-label="${n?rate+'% online win rate':'No online matches yet'}"><svg viewBox="0 0 42 42"><circle cx="21" cy="21" r="16" stroke="var(--well)"/>${seg(W,0,'var(--pf-win)')}${seg(L,W,'var(--red-ink)')}${seg(D,W+L,'var(--muted)','stroke-opacity=".45"')}</svg>
        <div><b>${n?rate+'%':'—'}</b><small>win rate</small></div></div>
      <div class="pf-wld"><div class="w"><b>${ol.w}</b><small>Wins</small></div><div class="l"><b>${ol.l}</b><small>Losses</small></div><div class="d"><b>${ol.d}</b><small>Draws</small></div></div>
    </div>
    ${n?`<div class="pf-mini">
      <div><b>${s.ostreak?'🔥 ':''}${s.ostreak}</b><small>Win streak</small></div>
      <div><b>${s.obest}</b><small>Best streak</small></div>
      ${s.orecent.length?`<div><small class="pf-rl">Recent</small>${rec}</div>`:''}
    </div>`:`<p class="pf-empty">No online matches yet.${mine?' Play a friend online to start your record and get on the leaderboard.':''}</p>`}
    ${cpu}${s.spares||mine?`<div class="pf-cpu"><span aria-hidden="true">💛</span><span>Spares <b>${s.spares}</b></span>${mine?`<span>${SPARE_PACK-s.spares%SPARE_PACK} more for a free pack</span>`:''}</div>`:''}</section>`;

  // badges: a card for each group; tap one for its badges (badgeGroup)
  const got=BADGES.filter(b=>hasBadge(s,b)).length;
  const badges=`<section class="pf-card"><h3>Badges <em>${got} of ${BADGES.length}</em></h3>`+(mine?`<p class="pf-bwait" id="pfBwait">${bwaitHTML()}</p>`:'')+
    `<div class="bg-groups">${bgroupsHTML(s,mine)}</div></section>`;

  // collection
  const seen=s.seen,owned=mine?Object.values(SAVE.coll).reduce((x,y)=>x+(+y||0),0):null;
  const rars=[1,2,3,4,5].map(r=>{const all=CARDS.filter(c=>c.rar===r).length,n=seen.filter(i=>CARDS[i].rar===r).length;
    return `<div class="rar${r}"><b class="rt">${n}/${all}</b>${r}★</div>`}).join('');
  const els=ELEM_KEYS.map(e=>`<span title="${e}">${ELEM[e]} ${seen.filter(i=>CARDS[i].e===e).length}</span>`).join('');
  const coll=`<section class="pf-card"><h3>Collection ${mine?'<button class="pf-link" id="pfColl">Open →</button>':''}</h3>
    <div class="pf-found"><b>${seen.length} <span>/ ${CARDS.length} found</span></b>${owned!=null?`<small>${plural(owned,'card')} owned</small>`:''}</div>
    <div class="pf-cbar"><i style="width:${(seen.length/CARDS.length*100).toFixed(1)}%"></i></div>
    <div class="pf-rars">${rars}</div><div class="pf-els">${els}</div></section>`;

  // showcase
  const sc=s.showcase.filter(id=>!mine||isSeen(id));
  const slots=[0,1,2].map(i=>sc[i]!=null?cardHTML(sc[i],'blue'):mine?'<button class="pf-slot" data-pin aria-label="Pin a card">+</button>':'').join('');
  const show=(mine||sc.length)?`<section class="pf-card"><h3>Showcase ${mine?'<button class="pf-link" data-pin>Change</button>':''}</h3>
    <div class="pf-show">${slots}</div>${mine&&!sc.length?'<p class="pf-hint">Pin up to 3 cards to show off.</p>':''}</section>`:'';

  // account (only your own)
  let acct='',dev='';
  if(mine){
    const ic=p=>`<span class="pf-ic" aria-hidden="true"><svg viewBox="0 0 24 24">${p}</svg></span>`;
    const row=(icon,b,small,btn,id,cls='')=>`<div class="pf-row">${ic(icon)}<span class="rt"><b>${b}</b><small${id==='pfOut'?' id="pfSync"':''}>${small}</small></span><button class="btn small ${cls}" id="${id}">${btn}</button></div>`;
    const resetRow=row('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>','Reset progress',`Start over with the starter cards${u?'. Your account is reset too':''}.`,'Reset','pfReset','danger');
    if(u)acct=`<section class="pf-card"><h3>Account</h3>`+
      row('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>','Display name',esc(u.displayName),'Edit','pfName')+
      row('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>','Email',u.email?esc(u.email):'Not set',u.email?'Change':'Add','pfEmail')+
      row('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>','Password','••••••••','Change','pfPass')+
      row('<path d="M10 17l5-5-5-5M15 12H3M14 3h5a2 2 0 012 2v14a2 2 0 01-2 2h-5"/>','Sign out',acctStatus(),'Sign out','pfOut')+
      resetRow+
      row('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>','Delete account','Removes your account and cloud save. This device keeps its copy.','Delete','pfDel','danger')+
      `</section>`;
    else acct=`<section class="pf-card"><h3>Account</h3>`+(ACCT.up
      ?`<p class="pf-hint left">Make an account to keep your cards, stats and badges on every device, and to share your profile.</p><div class="pf-two"><button class="btn primary" id="pfUp">Create account</button><button class="btn" id="pfIn">Sign in</button></div>`
      :`<p class="pf-hint left">${API==null?'Accounts need the game server.':'Accounts are unavailable right now. Try again later.'} Your progress is saved on this device.</p>`)+resetRow+`</section>`;
    // developer tools: only for accounts in the server's DEV_USERS list, or on a local copy of the game
    if(isDev())dev=`<section class="pf-card pf-dev"><h3>Developer <em>${u&&u.dev?'Developer account':'Local copy'}</em></h3>
      <div class="pf-row"><span class="rt"><b>Unlock all cards</b><small>Use every card. Off brings back your own collection.</small></span>
        <div class="seg" id="pfUnlock" role="group" aria-label="Unlock all cards">${[[false,'Off'],[true,'On']].map(([k,l])=>
          `<button data-k="${k}" class="${!!SAVE.unlockAll===k?'on':''}" aria-pressed="${!!SAVE.unlockAll===k}">${l}</button>`).join('')}</div></div>
      <div class="pf-row"><span class="rt"><b>Level up</b><small>Jump to level ${levelOf(SAVE.xp)+1} and get its pack.</small></span><button class="btn small" id="pfLvUp">+1 level</button></div>
      <div class="pf-row"><span class="rt"><b>Daily pack</b><small>Make today's daily pack ready again.</small></span><button class="btn small" id="pfDaily">Refill</button></div>
      <div class="pf-row"><span class="rt"><b>Screen info</b><small>Sizes this device reports, for fixing layout on phones.</small></span><button class="btn small" id="pfScreen">Show</button></div>
      </section>`;
  }
  // developer accounts can give a pack to the player they're looking at (server/routes/gifts.js)
  else if(u&&ACCT.token&&ACCT.user&&ACCT.user.dev)acct=`<section class="pf-card pf-dev"><h3>Developer <em>Give packs</em></h3>
    <p class="pf-hint left">Each tap sends @${esc(u.username)} one pack. It arrives on their next check-in.</p>
    <div class="pf-gift">${Object.keys(PACKS).map(t=>`<button class="btn small" data-gift="${t}">+1 ${PACKS[t].name}</button>`).join('')}</div></section>`;

  // match history: yours, or theirs from the server (null when they hid it)
  const hist=()=>mine?SAVE.history:s.history===undefined?[]:s.history;
  // two columns on a computer; one on a phone, in its own order (--o, profile.css): showcase, record, history, collection, badges, account, developer
  const o=(h,n)=>h.replace('<section ',`<section style="--o:${n}" `);
  $('#pfBody').innerHTML=hero+`<div class="pf-grid"><div class="pf-col">${o(record,2)}${o(histCardHTML(hist(),mine,name),3)}${o(acct,6)}${o(dev,7)}</div>`+
    `<div class="pf-col">${o(coll,4)}${o(show,1)}${o(badges,5)}</div></div>`;
  histWire(hist,mine,name);
  const on=(sel,fn)=>$$('#pfBody '+sel).forEach(b=>b.onclick=()=>{sfx('click');fn(b)});
  on('.bg-card',c=>badgeGroup(s,mine,+c.dataset.g));
  on('[data-gift]',b=>{const t=b.dataset.gift;b.disabled=true;
    api('/gifts',{method:'POST',body:{to:u.username,pack:t}}).then(()=>toast(`Sent ${aPack(t)} to ${u.displayName}.`)).catch(e=>toast(e.message,3000)).finally(()=>b.disabled=false)});
  if(!mine)return;
  on('#pfAv',pickAvatar);on('[data-pin]',pickShowcase);on('#pfColl',openCollection);
  on('#pfShare',profShare);on('#pfJoin',()=>openAuth('up'));on('#pfUp',()=>openAuth('up'));on('#pfIn',()=>openAuth('in'));
  on('#pfName',editName);on('#pfEmail',editEmail);on('#pfPass',editPassword);on('#pfOut',acctSignOut);on('#pfDel',deleteAccount);
  on('#pfReset',()=>confirmReset(renderProfilePage));
  on('#pfUnlock button',b=>{const v=b.dataset.k==='true';if(!!SAVE.unlockAll===v)return;SAVE.unlockAll=v;save();renderProfilePage();toast(v?'All cards unlocked.':'Back to your own collection.')});
  on('#pfLvUp',()=>{const lv=levelOf(SAVE.xp)+1;SAVE.xp=lvlXp(lv);const got=grantPacks(SAVE);profCheck();save();renderProfile();renderProfilePage();
    toast(`Level ${lv}`+(got.length?` · ${PACKS[got[0].t].name} pack added`:''));freshToast()});
  on('#pfScreen',screenInfo);
  on('#pfDaily',()=>{SAVE.daily={at:yesterday(),n:SAVE.daily?SAVE.daily.n:0};save();toast('Daily pack is ready.')});
}
