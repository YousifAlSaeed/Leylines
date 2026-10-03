'use strict';
/* =====================================================================
   LEADERBOARD  (everyone, or you and your friends)
   The server ranks players from their cloud saves (/api/leaderboard), so
   only signed-in players are on it; guests can still look. Wide screens
   get three columns: you, the table, and the player you picked. Narrower
   ones drop the last column and open the player in a pop-up instead.
   ===================================================================== */
const LB={by:'level',show:'all',q:'',data:null,sel:'',err:'',loading:false,seq:0,qT:0};
// [key, tab name, short name for phones]
const LB_BY=[['level','Level','Level'],['wins','Online wins','Wins'],['streak','Online streak','Streak'],['cards','Cards found','Cards']];

/* ---------- the menu tile ---------- */
// no server to rank anyone (a copy opened from a file): leave the tile out
function renderLbTile(){const t=$('#lbTile');if(t)t.hidden=API==null}

/* ---------- talking to the server ---------- */
async function lbLoad(){
  const n=++LB.seq;LB.loading=true;LB.err='';lbPaint();
  try{
    const qs=new URLSearchParams({by:LB.by,show:LB.show});if(LB.q)qs.set('q',LB.q);
    const j=await api('/leaderboard?'+qs,{timeout:60000});
    if(n!==LB.seq)return;
    LB.data=j;
    // keep the player you picked if they're still on screen, otherwise pick the top one
    if(!lbFind(LB.sel))LB.sel=j.rows.length?j.rows[0].username:'';
  }catch(e){
    if(n!==LB.seq)return;
    if(e.status===401&&ACCT.token){acctSignedOut('Your session ended. Sign in again.');LB.show='all';LB.loading=false;lbLoad();return}
    LB.err=e.message;
  }
  LB.loading=false;lbPaint();
}
const lbFind=name=>{const d=LB.data;if(!d||!name)return null;return [...d.rows,d.me].find(p=>p&&p.username===name)||null};
const lbIsMe=p=>!!(p&&ACCT.user&&frKey(p.username)===frKey(ACCT.user.username));

/* ---------- the screen ---------- */
function openLeaderboard(){
  if(LB.show==='friends'&&!ACCT.token)LB.show='all';
  show('leaders');$('#scr-leaders').scrollTop=0;
  lbShell();lbLoad();
}
// the parts that stay put (so the search box keeps its text and focus); lbPaint() fills them in
function lbShell(){
  $('#lbBody').innerHTML=`<div class="lb-grid">
    <div class="lb-left"><section class="pf-card lb-me" id="lbMe"></section><section class="pf-card lb-show" id="lbShow"></section>
      <p class="lb-note">Wins, streaks and results count online matches only. Ranks update each time a signed-in player's progress is saved.</p></div>
    <div class="lb-mid">
      <div class="lb-tools"><div class="seg lb-by" role="group" aria-label="Rank by">${LB_BY.map(([k,n,sh])=>`<button data-by="${k}" aria-pressed="false" aria-label="${n}"><span class="lb-l">${n}</span><span class="lb-s" aria-hidden="true">${sh}</span></button>`).join('')}</div>
        <label class="lb-find"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>
          <input id="lbQ" type="search" maxlength="20" placeholder="Find a player" aria-label="Find a player" autocomplete="off" autocapitalize="off" spellcheck="false"></label></div>
      <section class="pf-card lb-table" id="lbTable" aria-live="polite"></section>
    </div>
    <aside class="lb-side" id="lbSide" aria-label="Player"></aside>
  </div>`;
  const q=$('#lbQ');q.value=LB.q;
  q.oninput=()=>{clearTimeout(LB.qT);LB.qT=setTimeout(()=>{const v=q.value.trim().replace(/^@/,'');if(v!==LB.q){LB.q=v;lbLoad()}},250)};
  $$('#lbBody [data-by]').forEach(b=>b.onclick=()=>{if(LB.by===b.dataset.by)return;sfx('click');LB.by=b.dataset.by;lbLoad()});
  $('#lbBody').onclick=e=>{
    const sh=e.target.closest('[data-show]');
    if(sh){
      sfx('click');
      if(sh.dataset.show==='friends'&&!ACCT.token){openAuth('in');return}
      if(LB.show!==sh.dataset.show){LB.show=sh.dataset.show;lbLoad()}
      return;
    }
    const row=e.target.closest('[data-u]');
    if(row){sfx('click');lbPick(row.dataset.u);return}
    const k=e.target.closest('[data-k]');if(!k)return;
    sfx('click');
    if(k.dataset.k==='up')openAuth('up');else if(k.dataset.k==='in')openAuth('in');
    else if(k.dataset.k==='retry')lbLoad();
    else if(k.dataset.k==='prof')openPlayer(k.dataset.name,'leaders');
  };
}
function lbPaint(){
  if(!$('#lbTable'))return;
  $$('#lbBody [data-by]').forEach(b=>{const on=b.dataset.by===LB.by;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on)});
  $('#lbMe').innerHTML=lbMeHTML();$('#lbMe').classList.toggle('guest',!ACCT.token);$('#lbShow').innerHTML=lbShowHTML();
  $('#lbTable').innerHTML=lbTableHTML();$('#lbTable').classList.toggle('busy',LB.loading&&!!LB.data);
  lbPaintSide();
}
// the third column shows whoever you picked; without it (narrow screens) they open in a pop-up
function lbPick(name){
  const p=lbFind(name);if(!p)return;
  LB.sel=name;
  if(getComputedStyle($('#lbSide')).display!=='none'){
    $$('#lbTable [data-u]').forEach(r=>r.classList.toggle('sel',r.dataset.u===name));lbPaintSide();return;
  }
  modal(`<div class="lb-pop">${lbPlayerHTML(p)}</div>`,[
    {label:'View profile',cls:'primary',fn:()=>openPlayer(p.username,'leaders')},{label:'Close',esc:true}]);
}
function lbPaintSide(){const p=lbFind(LB.sel);$('#lbSide').innerHTML=p?`<section class="pf-card">${lbPlayerHTML(p)}
  <div class="pf-two lb-acts"><button class="btn primary" data-k="prof" data-name="${esc(p.username)}">View profile</button></div></section>`:''}

/* ---------- pieces ---------- */
const lbTier=lv=>`<span class="lb-tier t${TITLES.filter(t=>lv>=t[0]).length-1}">${titleOf(lv)}</span>`;
const lbLast=(r,n=5)=>{const l=[...(r||'')].slice(-n);return l.length?`<span class="lb-l5" role="img" aria-label="Last ${plural(l.length,'online result')}: ${l.map(x=>({w:'win',l:'loss',d:'draw'})[x]).join(', ')}">${l.map(x=>`<i class="${x}"></i>`).join('')}</span>`:'<span class="lb-none">—</span>'};
const lbRate=(w,l,d)=>{const n=w+l+d;return n?Math.round(w/n*100)+'%':'—'};
// the number the board is ranked by, and what it counts
function lbStat(p){
  if(LB.by==='level')return [levelOf(p.xp),`${p.xp.toLocaleString()} XP`];
  if(LB.by==='wins')return [p.wins,p.wins===1?'win':'wins'];
  if(LB.by==='streak')return [p.best,'wins in a row'];
  return [p.cards,`of ${CARDS.length}`];
}
const lbRankCls=r=>r===1?' g':r===2?' s':r===3?' b':'';
function lbRow(p,pin){
  const lv=levelOf(p.xp),[v,unit]=lbStat(p),me=lbIsMe(p);
  return `<button class="lb-row${me?' me':''}${pin?' pin':''}${p.username===LB.sel?' sel':''}" data-u="${esc(p.username)}" aria-label="${esc(p.displayName)}${me?' (you)':''}, rank ${p.rank}, ${v} ${unit}">
    <span class="lb-rk${lbRankCls(p.rank)}">${p.rank}</span>
    <span class="lb-pl">${frAvatar(p)}<span class="rt"><b>${esc(p.displayName)}${me?' <em>(you)</em>':''}</b><small>LV ${lv}<span class="lb-narrow">${lbLast(p.recent)}</span></small></span></span>
    <span class="lb-stat"><b>${v}</b><small>${unit}</small></span>
    <span class="lb-c lb-ttl">${lbTier(lv)}</span>
    <span class="lb-c lb-wl">${p.wins}–${p.losses}</span>
    <span class="lb-c">${lbLast(p.recent)}</span>
  </button>`;
}
function lbTableHTML(){
  const d=LB.data,cur=LB_BY.find(b=>b[0]===LB.by)[1];
  if(!d)return LB.err?lbErr():'<p class="pf-wait"><span class="spin"></span>Loading the leaderboard…</p>';
  if(LB.err)return lbErr();
  const head=`<div class="lb-head" aria-hidden="true"><span>#</span><span>Player</span><span class="lb-stat">${cur}</span><span class="lb-c">Title</span><span class="lb-c lb-wl">Online W–L</span><span class="lb-c">Last 5 online</span></div>`;
  const inList=d.me&&d.rows.some(p=>p.username===d.me.username);
  const pin=d.me&&!inList&&!LB.q?`<div class="lb-gap" aria-hidden="true">···</div>${lbRow(d.me,true)}`:'';
  const empty=!d.rows.length?`<p class="pf-hint">${LB.q?`No player whose name starts with “${esc(LB.q)}”.`:'Nobody here yet.'}</p>`:'';
  const lonely=d.show==='friends'&&d.counts.friends<=1&&!LB.q?'<p class="pf-hint">Add friends to see how you stack up against them.</p>':'';
  return head+`<div class="lb-rows">${d.rows.map(p=>lbRow(p)).join('')}</div>`+empty+pin+lonely;
}
const lbErr=()=>`<p class="pf-wait">${esc(LB.err)}</p><div class="lb-retry"><button class="btn small" data-k="retry">Try again</button></div>`;
function lbMeHTML(){
  if(!ACCT.token)return `<h3>You</h3><p class="pf-hint left">${ACCT.up?'Make an account to get on the leaderboard. Your progress so far comes with you.':'Sign-in is unavailable right now. You can still look at the leaderboard.'}</p>
    ${ACCT.up?'<div class="pf-two"><button class="btn primary small" data-k="up">Create account</button><button class="btn small" data-k="in">Sign in</button></div>':''}`;
  // your own numbers come from this device, so they're right even before the save reaches the server
  const s=SAVE,st=s.stats,lv=levelOf(s.xp),lo=lvlXp(lv),hi=lvlXp(lv+1),me=LB.data&&LB.data.me;
  const n=LB.data?(LB.data.show==='friends'?LB.data.counts.friends:LB.data.counts.all):0;
  const where=`${LB_BY.find(b=>b[0]===LB.by)[1]} · ${LB.show==='friends'?'Friends':'Everyone'}`;
  return `<div class="lb-who">${frAvatar({displayName:ACCT.user.displayName,avatar:s.avatar})}<span class="rt"><b>${esc(ACCT.user.displayName)}</b><small>Your rank · ${where}</small></span></div>
    <div class="lb-big"><b>${me?'#'+me.rank:'—'}</b>${me&&n?`<small>of ${n.toLocaleString()}</small>`:''}</div>
    <div class="lb-lvl">${lbTier(lv)}<b>LV ${lv}</b></div>
    <div class="pf-xpbar" role="img" aria-label="${hi-s.xp} XP to level ${lv+1}"><i style="width:${((s.xp-lo)/(hi-lo)*100).toFixed(1)}%"></i></div>
    <p class="lb-tiny">${hi-s.xp} XP to LV ${lv+1}</p>
    <div class="lb-kv"><span>Online W / L / D</span><b>${st.ow} / ${st.ol} / ${st.od}</b></div>
    <div class="lb-kv"><span>Online win rate</span><b>${lbRate(st.ow,st.ol,st.od)}</b></div>
    <div class="lb-kv"><span>Best online streak</span><b>${s.obest}</b></div>
    <div class="lb-kv"><span>Cards found</span><b>${s.seen.length} / ${CARDS.length}</b></div>`;
}
function lbShowHTML(){
  const c=LB.data&&LB.data.counts,opt=(k,name,n,dis)=>`<button class="lb-opt${LB.show===k?' on':''}" data-show="${k}" aria-pressed="${LB.show===k}">${name}<span>${dis||(n==null?'':n.toLocaleString())}</span></button>`;
  return `<h3>Show</h3><div class="lb-opts">${opt('all','Everyone',c&&c.all)}${opt('friends','Friends',c&&c.friends,!ACCT.token&&'Sign in')}</div>`;
}
function lbPlayerHTML(p){
  const lv=levelOf(p.xp),me=lbIsMe(p),hand=(p.hand||[]).filter(i=>CARDS[i]);
  return `<div class="lb-pp">${frAvatar(p)}<div><b>${esc(p.displayName)}${me?' <em>(you)</em>':''}</b><div>${lbTier(lv)}<small>#${p.rank} · LV ${lv} · @${esc(p.username)}</small></div></div></div>
    <div class="lb-trio"><div><b>${lv}</b><small>Level</small></div><div><b>${lbRate(p.wins,p.losses,p.draws)}</b><small>Online win rate</small></div><div><b>${p.best}</b><small>Best online streak</small></div></div>
    <h4>Main hand</h4>${hand.length===5?`<div class="lb-hand">${hand.map(i=>cardHTML(i,'blue',{name:false})).join('')}</div>`:'<p class="lb-none">No hand saved yet.</p>'}
    <h4>Recent online results</h4>${p.recent?`<span class="pf-form">${[...p.recent].map(r=>`<i class="${r}">${r.toUpperCase()}</i>`).join('')}</span>`:'<p class="lb-none">No online matches yet.</p>'}
    <div class="lb-kv"><span>Online W / L / D</span><b>${p.wins} / ${p.losses} / ${p.draws}</b></div>
    <div class="lb-kv"><span>Cards found</span><b>${p.cards} / ${CARDS.length}</b></div>
    ${me?'':`<div class="lb-fr">${friendBtn(p.username)}</div>`}`;
}
// signed in or out, or this device took the account's progress: if the leaderboard is open, it shows the new you
function lbAcct(){
  if(!ACCT.token&&LB.show==='friends')LB.show='all';
  if($('#scr-leaders').classList.contains('on'))lbLoad();
}
