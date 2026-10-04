'use strict';
/* =====================================================================
   SPARES AND FORFEITS  (online)
   The winner of a trade can spare the loser instead of taking cards.
   A player who leaves mid-match, or closes the game and isn't back within
   a minute, loses it: the other player takes their cards or spares them.
   The leaver is gone by then, so the choice goes through the server and is
   applied the next time their game checks in (signed-in players only).
   ===================================================================== */
const SPARE_PACK=10;  // every this many spares give a free pack
const AWAY_GRACE=60;  // seconds a player who closed the game has to come back
const OWE_DAYS=3;     // how long a match you left can still cost you cards

// one online match: the pairing (sid) and that match's seed, which both players know
const matchKey=()=>G&&NET.sid?`${NET.sid}:${G.seed>>>0}`:'';

/* ---------- matches you might still lose cards from ---------- */
// SAVE.owes: [{k, deck, at, left, ht}] for online matches with a trade rule. Only a choice for one of these, and only
// cards from its hand, is ever applied, so nobody can take cards from a match you didn't play.
// left = you left on purpose (the loss is already counted), ht = that match's history entry.
function oweAdd(){
  const k=matchKey();if(!k||G.trade==='none')return;
  SAVE.owes=[...SAVE.owes.filter(o=>o.k!==k),{k,deck:G.decks[G.me].slice(),at:Date.now()}].slice(-10);save();
}
function oweClear(k){if(SAVE.owes.some(o=>o.k===k)){SAVE.owes=SAVE.owes.filter(o=>o.k!==k);save()}}
function oweLeft(k,h){const o=SAVE.owes.find(o=>o.k===k);if(o){o.left=1;if(h)o.ht=h.t;save()}}

// the other player chose (take or spare) after you'd gone: the server kept it for you
const OWES={busy:false,news:[]};
async function owesCheck(){
  if(OWES.busy||!ACCT.token||API==null||!SAVE.owes.length)return;
  const fresh=SAVE.owes.filter(o=>Date.now()-o.at<OWE_DAYS*864e5);
  if(fresh.length!==SAVE.owes.length){SAVE.owes=fresh;save();if(!fresh.length)return}
  OWES.busy=true;
  let list=[];
  try{list=(await api('/forfeits')).forfeits||[]}catch(e){}finally{OWES.busy=false}
  for(const f of list){
    const o=SAVE.owes.find(x=>x.k===f.key);if(!o)continue;
    SAVE.owes=SAVE.owes.filter(x=>x!==o);
    // closed the game and never came back: that's a loss too
    if(!o.left)recordMatch('l',{online:true,left:true});
    const left=o.deck.slice(),ids=[];
    for(const id of (Array.isArray(f.cards)?f.cards:[]).slice(0,5)){const i=left.indexOf(id);if(i>=0&&owned(id)>0){left.splice(i,1);collRemove(id);ids.push(id)}}
    const h=o.ht&&SAVE.history.find(x=>x.t===o.ht);if(h&&ids.length)h.lost=ids;
    OWES.news.push({name:cleanName(f.name)||'Your opponent',ids,spared:!ids.length});
  }
  if(!OWES.news.length)return;
  OWES.news.forEach(x=>x.added=ensureMinimum());
  save();oweNews();
}
// shown on the menu, never over a match or another popup
function oweNews(){
  if(!OWES.news.length||G||!$('#scr-menu').classList.contains('on')||$('#modal').classList.contains('on'))return;
  const news=OWES.news.splice(0);
  modal(`<h2>While you were away</h2><p>You left a match before it ended, so it counted as a loss.</p>`+news.map(x=>x.spared
    ?`<p><b class="gold">${esc(x.name)}</b> spared you 💛 You kept your cards.</p>`
    :`<p><b class="gold">${esc(x.name)}</b> took:</p>`+rowHTML(x.ids,'red')+(x.added.length?`<p>Your collection ran low — a wandering dealer gives you:</p>`+rowHTML(x.added,'blue'):'')).join(''),
    [{label:'OK',cls:'primary',esc:true}]);
  renderMenu();
}
// the server also says when one comes in (pulse.js); this is in case that check misses it
setInterval(owesCheck,45000);

// your choice, kept by the server in case they've closed the game (it also reaches them directly when they're still here)
function forfeitPost(user,key,ids){
  if(!user||!key||API==null)return;
  api('/forfeits',{method:'POST',body:{to:user,key,name:myName(),cards:ids}}).catch(()=>{});
}

/* ---------- spares ---------- */
// a spare counts once per player per day; every SPARE_PACK of them give your level's small pack (data.js). Returns {counted, pack}
function spareGive(who){
  const k=String(who).toLowerCase(),d=today();
  if(!SAVE.spareDay||SAVE.spareDay.at!==d)SAVE.spareDay={at:d,who:[]};
  if(SAVE.spareDay.who.includes(k)){save();return {counted:false}}
  SAVE.spareDay.who.push(k);SAVE.spares++;
  let pack=null;
  if(SAVE.spares%SPARE_PACK===0){pack=smallPack(levelOf(SAVE.xp));SAVE.packs.push({t:pack,src:'spare'})}
  profCheck();save();
  return {counted:true,pack};
}
function spareHTML(name,r){
  const n=r.pack?SPARE_PACK:SAVE.spares%SPARE_PACK;
  return `<p class="spared">You spared <b class="gold">${esc(name)}</b> 💛<br><small>They keep their cards.</small></p>`+
    (r.pack?`<p class="gold"><b>🎁 ${SPARE_PACK} spares: a free ${PACKS[r.pack].name} pack!</b></p>`:'')+
    `<div class="spare-bar"><div><b>Spares</b><span><b>${n}</b> / ${SPARE_PACK}</span></div><div class="bar"><i style="width:${n/SPARE_PACK*100}%"></i></div>`+
    `<small>${!r.counted?`You already spared ${esc(name)} today, so this one doesn't count.`:r.pack?'Your pack is waiting in Packs.':`${plural(SPARE_PACK-n,'more spare')} for a free pack`}</small></div>`+freshHTML();
}
function sparedHTML(name,deck){
  return `<p class="spared"><b class="gold">${esc(name)} spared you</b> 💛<br><small>You keep all your cards.</small></p>`+rowHTML(deck,'blue');
}
// the spared player's first button
function thanksBtn(){
  return {label:'Thanks 🙏',cls:'primary',keep:true,fn:()=>{
    netSend({t:'thanks'});
    const b=$('#modal .mbtns .btn');if(b){b.disabled=true;b.textContent='Thanks sent 🙏'}
  }};
}

/* ---------- the other player left ---------- */
// They left on purpose, or didn't come back within a minute: the match is yours, and with a trade rule you take
// their cards or spare them. why: what happened, for the popup.
function oppForfeit(why){
  if(!stillPlaying())return;
  const g=G,host=NET.role==='host',n=leaveCount(),deck=G.decks[1-G.me],opp=oppName(),user=NET.oppUser,key=matchKey();
  NET.resolving=true; // someone coming back meanwhile is turned away (onGuest)
  stopTurnTimer();hideAway();closeModal();if(drag)endDrag({},true);
  // between the matches of a series the last one already counted
  if(!G.over)histXp(recordMatch('w',{online:true}));
  histAdd('w','them');
  G.over=G.done=true;clearRejoin();save();
  if(host)NET.ended=NET.sid;else netClose(true);
  const head=`<div class="kick">Online match</div><h2>${esc(opp)} left</h2><p>${esc(why)} It counts as a win for you.</p>`;
  const end=html=>{
    NET.resolving=false;
    modal(html+freshHTML(),[{label:host?'Back to room':'Menu',cls:'primary',fn:()=>{if(host&&NET.role==='host')hostBackToRoom('');else{G=null;show('menu')}}}]);
  };
  if(!n){end(head);return}
  if(!user){end(head+`<p>${esc(opp)} plays as a guest, so there are no cards to take.</p>`);return}
  pickCards(head,deck,n,{spare:true}).then(r=>{
    if(G!==g){NET.resolving=false;return}
    if(r==='spare'){forfeitPost(user,key,[]);end(head+spareHTML(opp,spareGive(user)));return}
    const ids=r.map(i=>deck[i]);ids.forEach(collAdd);earn('spoils');profCheck();histTrade('won',ids);save();
    forfeitPost(user,key,ids);
    end(head+`<p>You took ${ids.length>1?'these cards':'this card'}:</p>`+rowHTML(ids,'blue'));
  });
}
// you were gone for longer than the other player waits: the match went to them
function selfForfeit(){
  const n=leaveCount(),opp=oppName(),host=NET.role==='host';
  if(!G.over)histXp(recordMatch('l',{online:true,left:true}));
  const h=histAdd('l','you');
  if(n)oweLeft(matchKey(),h);
  G.over=G.done=true;clearRejoin();save();
  if(host){NET.ended=NET.sid;hostBackToRoom('')}else{netClose(true);G=null;stopTurnTimer()}
  modal(`<h2>Match over</h2><p>You were away for more than a minute, so the match went to <b class="gold">${esc(opp)}</b>.</p>`+
    (n?`<p>They can take ${n>=5?'all your cards':plural(n,'card')} or spare you. If they take any, you'll see it here.</p>`:''),
    [{label:'OK',cls:'primary',esc:true,fn:()=>{if(!host)show('menu')}}]);
}
// this side still reaches the matchmaking server, so it's the other player who's gone
function meOnline(){const p=NET.peer;return navigator.onLine!==false&&!!p&&p.open&&!p.disconnected&&!p.destroyed}
function fmtLeft(s){return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`}
// the countdown on the "dropped out" popup; at zero the match is yours (if you're the one still online)
setInterval(()=>{
  if(!NET.away||!NET.awayAt||NET.closing||!stillPlaying())return;
  const left=AWAY_GRACE-Math.floor((Date.now()-NET.awayAt)/1000),el=$('#awLeft');
  if(left>0){if(el)el.textContent=fmtLeft(left);return}
  if(!meOnline()){const p=el&&el.closest('p');if(p)p.innerHTML='<span class="spin"></span>Checking your connection…';return}
  NET.away=false;oppForfeit(`${oppName()} didn't come back within a minute.`);
},500);
