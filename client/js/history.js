'use strict';
/* =====================================================================
   MATCH HISTORY  (the last 30 online and Solo games, on the profile)
   A finished game (a whole series for best-of) is saved as one entry in
   SAVE.history: who, both hands, the scores, the rules, the cards traded
   and the XP. Anyone who opens your profile sees it, unless you hide it
   (SAVE.hideHist); the server leaves it out then (server/lib/users.js).
   Couch games, Daily games and tutorial lessons aren't saved.
   ===================================================================== */
const HIST_MAX=30,HIST_PAGE=5;
// an entry: {t: time, m: 'ai' | 'online', d: CPU difficulty, n: their name, u: their username, av: their avatar card,
//   bo, r: 'w' | 'l' | 'd' (yours), log: [[your score, theirs]] per match, me / op: both hands, ru: rules on, tm: turn timer, bk: bank timer,
//   tr: trade, won / lost: cards that changed hands, xp, sw: the winner swept a match, sd: sudden death, q: 'you' | 'them' | 'early'}
const HIST={f:'all',n:HIST_PAGE,open:-1};

/* ---------- saving (match.js and online.js call these) ---------- */
// adds a match's XP to its series, so the entry shows the total
function histXp(rec){if(G&&G.ser&&rec)G.ser.xp=(G.ser.xp||0)+rec.gain;return rec}
// r: your result. quit: 'you' (you left), 'them' (they left), 'early' (stopped between matches of a series).
// The caller saves. Returns the entry, which stays on G so the trade can be added to it.
function histAdd(r,quit=''){
  // only Solo and online games: not couch games, Daily games (daily.js) or tutorial lessons
  if(!G||G.mode==='local'||G.daily||G.tut||G.hist||!G.decks[0]||!G.decks[1])return null;
  const me=G.me,ser=G.ser||{log:[]},online=G.mode==='online';
  const log=ser.log.map(x=>G.bottom===me?[x.sb,x.sr]:[x.sr,x.sb]);
  // left in the middle of a match: its score when they stopped
  if(quit&&quit!=='early'&&G.st&&!G.over)log.push([score(G.st,me),score(G.st,1-me)]);
  const win=r==='w'?me:r==='l'?1-me:-1;
  const h={t:Date.now(),m:online?'online':'ai',bo:G.bo,r,log:log.slice(-5),me:G.decks[me].slice(0,5),op:G.decks[1-me].slice(0,5),
    ru:rulesOn(G.rules,G.mode==='local'?'none':G.trade).map(x=>x[0]),tm:isBank(G.rules)||!timedOn(G.rules)?0:G.rules.timer,bk:isBank(G.rules)?G.rules.bank:0,tr:G.trade,xp:ser.xp||0};
  if(online){h.n=oppName();if(NET.oppUser)h.u=NET.oppUser;if(NET.oppAv!=null)h.av=NET.oppAv}else h.d=G.diff;
  if(win>=0&&ser.log.some(x=>x.sweep&&x.w===win))h.sw=1;
  if(ser.sd)h.sd=1;
  if(quit)h.q=quit;
  SAVE.history=[...SAVE.history,h].slice(-HIST_MAX);
  G.hist=h;HIST.open=-1;
  return h;
}
// k: 'won' | 'lost'. The caller saves.
function histTrade(k,ids){if(G&&G.hist)G.hist[k]=ids.slice(0,5)}

/* ---------- the profile card ---------- */
// list: entries (yours, or someone else's from the server), or null when they hid it. mine: it's your own profile.
function histCardHTML(list,mine,owner){
  return `<section class="pf-card mh-card" id="pfHist">${histInner(list,mine,owner)}</section>`;
}
function histInner(list,mine,owner){
  const signed=mine&&ACCT.token&&ACCT.user;
  const priv=signed?`<div class="mh-priv"><svg viewBox="0 0 24 24" aria-hidden="true">${SAVE.hideHist?'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>':'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'}</svg>`+
    `<span>${SAVE.hideHist?'Only you can see your history.':'Anyone who opens your profile can see this.'}</span><button class="pf-link" data-h="priv">${SAVE.hideHist?'Show to others':'Hide from others'}</button></div>`:'';
  if(!list)return `<h3>Match history</h3><p class="pf-hint left">${esc(owner)} keeps their match history private.</p>`;
  const all=list.map((h,i)=>({h,i})).reverse(); // newest first; i is the entry's place in the saved list
  const shown=all.filter(x=>HIST.f==='all'||x.h.m===HIST.f);
  const head=`<h3>Match history ${list.length?`<em>last ${list.length}</em>`:''}</h3>`;
  if(!list.length)return head+priv+`<p class="pf-hint left">${mine?'Your online and Solo games will show up here, with both hands, the rules and any cards traded.':'No matches yet.'}</p>`;
  const seg=`<div class="seg mh-seg" role="group" aria-label="Show">${[['all','All'],['online','Online'],['ai','Solo']].map(([k,l])=>
    `<button data-f="${k}" class="${HIST.f===k?'on':''}" aria-pressed="${HIST.f===k}">${l}</button>`).join('')}</div>`;
  const rows=shown.slice(0,HIST.n).map(x=>histRow(x.h,x.i,mine,owner)).join('');
  const more=shown.length>HIST.n?`<button class="mh-more" data-h="more">Show more</button>`:'';
  return head+priv+seg+(rows||`<p class="pf-hint left">No ${HIST.f==='ai'?'games against the computer':'online games'} here yet.</p>`)+more;
}
const histOpp=h=>h.m==='ai'?`CPU · ${(DIFFS.find(d=>d[0]===h.d)||DIFFS[1])[1]}`:h.n||'Player';
function histWhen(t,long){
  const d=new Date(t),days=(Date.now()-t)/864e5;
  if(long)return d.toLocaleDateString(undefined,{month:'short',day:'numeric'})+' · '+d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
  return days<1?ago(t):days<2?'Yesterday':d.toLocaleDateString(undefined,{month:'short',day:'numeric'});
}
// the score on the line: series wins for best-of, the board for a single match
function histScore(h){
  if(h.bo>1)return [h.log.filter(m=>m[0]>m[1]).length,h.log.filter(m=>m[1]>m[0]).length];
  return h.log[h.log.length-1]||[0,0];
}
function histTradeTag(h){
  if(h.won&&h.won.length)return `<span class="mh-tr won">+${plural(h.won.length,'card')}</span>`;
  if(h.lost&&h.lost.length)return `<span class="mh-tr lost">−${plural(h.lost.length,'card')}</span>`;
  return '';
}
// marks the cards that changed hands in a hand (by id, one mark per traded copy)
function histHand(ids,taken,color){
  const left=[...(taken||[])];
  return `<div class="mh-cards">${ids.filter(id=>CARDS[id]).map(id=>{const k=left.indexOf(id);if(k>=0)left.splice(k,1);
    return cardHTML(id,color,{name:false,cls:k>=0?'mh-taken':''})}).join('')}</div>`;
}
function histRow(h,i,mine,owner){
  const open=HIST.open===i,[a,b]=histScore(h),opp=histOpp(h),R={w:'Win',l:'Loss',d:'Draw'}[h.r];
  const av=h.m==='ai'?`<span class="pc-av mh-cpu" aria-hidden="true">${MODE_ICON.ai}</span>`:frAvatar({displayName:opp,avatar:h.av!=null?{c:h.av,r:0}:null});
  const bits=[h.m==='ai'?'Solo':'Online',h.bo>1?`Best of ${h.bo}`:'',h.sw?'Sweep!':'',h.q==='you'?'Left':h.q==='them'?'They left':h.q==='early'?'Stopped early':'',histWhen(h.t)].filter(Boolean);
  const you=mine?'You':owner;
  const tr=h.tr==='sweep'?[,'Sweep']:TRADES.find(t=>t[0]===h.tr); // Sweep was a trade rule before 0.18.0
  const rules=[...h.ru.map(k=>(RULES.find(x=>x[0]===k)||[k,k])[1]),h.tm?`Turn timer ${h.tm}s`:'',h.bk?`Bank timer ${fmtLeft(h.bk)}`:'',tr?`Trade: ${tr[1]}`:''].filter(Boolean);
  const traded=h.won&&h.won.length?`<b class="w">${h.won.map(id=>CARDS[id]?CARDS[id].name:'').join(', ')}</b><small>${mine?'You won':'Won'}</small>`
    :h.lost&&h.lost.length?`<b class="l">${h.lost.map(id=>CARDS[id]?CARDS[id].name:'').join(', ')}</b><small>${mine?'You lost':'Lost'}</small>`:'<b>—</b><small>No trade</small>';
  const quit=h.q==='you'?`${you} left the match, so it counts as a loss.`:h.q==='them'?`${esc(opp)} left the match, so it counts as a win.`:h.q==='early'?'The series was stopped before it was over.':'';
  const prof=h.m==='online'&&h.u&&!(ACCT.user&&frKey(ACCT.user.username)===frKey(h.u))?`<div class="mh-btns"><button class="btn small" data-prof="${esc(h.u)}">View ${esc(opp)}'s profile</button></div>`:'';
  return `<div class="mh${open?' open':''}">
    <button class="mh-row" data-i="${i}" aria-expanded="${open}" aria-label="${R} ${h.m==='ai'?'against':'vs'} ${esc(opp)}, ${a} to ${b}, ${esc(bits.slice(1).join(', '))}">
      <span class="mh-res ${h.r}" aria-hidden="true">${h.r.toUpperCase()}</span>${av}
      <span class="mh-who"><b>${esc(opp)}</b><small><span class="mh-trn">${histTradeTag(h)}</span>${esc(bits.join(' · '))}</small></span>
      <span class="mh-trw">${histTradeTag(h)}</span>
      <span class="mh-sc"><span class="b">${a}</span>–<span class="r">${b}</span></span>
      <svg class="fr-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>
    </button>
    ${open?`<div class="mh-body">
      ${quit?`<p class="mh-quit">${quit}</p>`:''}
      ${h.bo>1?`<p class="mh-h">Matches</p><div class="mh-log">${h.log.map((m,k)=>`<span class="${m[0]>m[1]?'w':m[0]<m[1]?'l':'d'}">M${k+1} ${m[0]}–${m[1]}</span>`).join('')}</div>`:''}
      <p class="mh-h">Hands</p>
      <div class="mh-hand"><span>${esc(you)}</span>${histHand(h.me,h.lost,'blue')}</div>
      <div class="mh-hand"><span>${esc(opp.replace(/^CPU · .*/,'CPU'))}</span>${histHand(h.op,h.won,'red')}</div>
      <p class="mh-h">Rules</p>
      <div class="mh-rules">${rules.length?rules.map(r=>`<span>${esc(r)}</span>`).join(''):'<span>No rules</span>'}</div>
      <div class="mh-facts"><div>${traded}</div><div><b>+${h.xp}</b><small>XP</small></div><div><b>${esc(histWhen(h.t,true).split(' · ')[0])}</b><small>${esc(histWhen(h.t,true).split(' · ')[1])}</small></div></div>
      ${prof}
    </div>`:''}
  </div>`;
}
// clicks inside the card; it redraws only itself
function histWire(list,mine,owner){
  const el=$('#pfHist');if(!el)return;
  const paint=()=>{el.innerHTML=histInner(list(),mine,owner)};
  el.onclick=e=>{
    const b=e.target.closest('button');if(!b||!el.contains(b))return;
    sfx('click');
    if(b.dataset.f){HIST.f=b.dataset.f;HIST.n=HIST_PAGE;HIST.open=-1;paint();return}
    if(b.dataset.i!=null){const i=+b.dataset.i;HIST.open=HIST.open===i?-1:i;paint();return}
    if(b.dataset.prof){openPlayer(b.dataset.prof,$('#scr-profile [data-back]').dataset.back);return}
    if(b.dataset.h==='more'){HIST.n+=HIST_PAGE*2;paint();return}
    if(b.dataset.h==='priv'){SAVE.hideHist=!SAVE.hideHist;save();paint();toast(SAVE.hideHist?'Your match history is hidden from others.':'Others can see your match history again.')}
  };
}
