'use strict';
/* =====================================================================
   SAVE
   ===================================================================== */
const SKEY='ninefold.save.v1';
const STARTER=[0,1,2,3,4,5,6,7,13];
function defSave(){
  const coll={};STARTER.forEach(i=>coll[i]=1);
  return {coll,lastDeck:[],rules:{open:true,same:true,sameWall:false,plus:true,combo:true,elemental:false,suddenDeath:false,random:false,timer:45},
    trade:'one',diff:'normal',stats:{w:0,l:0,d:0,ow:0,ol:0,od:0},sound:true,musicVol:70,sfxVol:100,theme:'system',menuMode:'ai',name:'',cid:'',seen:STARTER.slice(),loadouts:[null,null,null],
    // profile (profile.js): avatar {c: card id, r: ring colour}, XP, win streaks, last results, toughest CPU beaten, badges {id: date}, pinned cards
    pv:2,avatar:null,xp:0,streak:0,best:0,recent:[],beat:-1,badges:{},showcase:[],
    // packs (packs.js): unopened packs [{t: tier, lv, mile}], the last level that gave one, the daily pack {at: local date, n: streak}, packs since a 5★
    packs:[],packLv:1,daily:null,pity:0};
}
// fills in the profile fields; a save from before profiles gets XP for the matches it already played
function fixProfile(p,s){
  const ob=v=>v&&typeof v==='object'&&!Array.isArray(v);
  if(!s.pv){const t=p.stats;p.xp=t.w*40+t.d*20+t.l*10+t.ow*60+t.od*30+t.ol*15;p.pv=1}
  // the first time with packs: one for every level already reached
  if(p.pv<2){p.packLv=1;p.pv=2}
  for(const k of ['xp','streak','best','pity'])p[k]=Math.max(0,+p[k]|0);
  p.packLv=Math.max(1,+p.packLv|0);
  p.packs=(Array.isArray(p.packs)?p.packs:[]).filter(k=>ob(k)&&PACKS[k.t]).slice(0,200);
  p.daily=ob(p.daily)&&typeof p.daily.at==='string'?{at:p.daily.at.slice(0,10),n:Math.max(0,p.daily.n|0)}:null;
  grantPacks(p);
  p.beat=[0,1,2].includes(p.beat)?p.beat:-1;
  p.recent=(Array.isArray(p.recent)?p.recent:[]).filter(r=>r==='w'||r==='l'||r==='d').slice(-10);
  p.badges=ob(p.badges)?p.badges:{};
  p.showcase=(Array.isArray(p.showcase)?p.showcase:[]).filter(i=>Number.isInteger(i)&&i>=0&&i<CARD_DATA.length).slice(0,3);
  p.avatar=ob(p.avatar)&&Number.isInteger(p.avatar.c)&&p.avatar.c>=0&&p.avatar.c<CARD_DATA.length?{c:p.avatar.c,r:Math.max(0,Math.min(5,p.avatar.r|0))}:null;
  return p;
}
// a pack for every level reached since the last one that gave one; returns the new packs.
// Worked out from the save alone, so two devices with the same save agree.
function grantPacks(p){
  const got=[],lv=levelOf(p.xp);
  while(p.packLv<lv){const l=++p.packLv,k={t:packForLevel(l),lv:l};if(l%5===0)k.mile=1;p.packs.push(k);got.push(k)}
  return got;
}
// a stored save with any missing fields filled in
function normSave(s){
  const d=defSave();
  return fixProfile({...d,...s,rules:{...d.rules,...(s.rules||{})},stats:{...d.stats,...(s.stats||{})},coll:s.coll&&typeof s.coll==='object'?s.coll:d.coll},s);
}
function loadSave(){
  try{const s=JSON.parse(localStorage.getItem(SKEY)||'null');if(s&&typeof s==='object')return normSave(s)}catch(e){}
  return defSave();
}
let SAVE=loadSave();
if(SAVE.music===false)SAVE.musicVol=0;delete SAVE.music;
for(const k of ['musicVol','sfxVol'])SAVE[k]=Math.max(0,Math.min(100,Math.round(+SAVE[k]/5)*5||0));
SAVE.rules.timer=timerSec(SAVE.rules.timer);
// every change goes through here; account.js (loaded later) syncs it to a signed-in account
function save(){try{localStorage.setItem(SKEY,JSON.stringify(SAVE))}catch(e){}if(typeof acctChanged==='function')acctChanged()}
// stable per-device id so the host can recognise a guest who reconnects
if(!SAVE.cid){SAVE.cid=Math.random().toString(36).slice(2,12);save()}
// 'seen' = every card ever owned, so lost cards still show in the collection.
// Older saves had no history: rebuild it from starter cards, current cards and the last deck used.
{const seen=new Set([...(Array.isArray(SAVE.seen)?SAVE.seen:[]),...STARTER,...Object.keys(SAVE.coll).map(Number),...(SAVE.lastDeck||[])]);
 SAVE.seen=[...seen].filter(i=>Number.isInteger(i)&&i>=0&&i<CARD_DATA.length).sort((a,b)=>a-b);save()}
// loadouts: 3 saved hands, each {name, ids:[5 card ids]} or null
SAVE.loadouts=[0,1,2].map(i=>{const l=Array.isArray(SAVE.loadouts)?SAVE.loadouts[i]:null;
  return l&&Array.isArray(l.ids)&&l.ids.length===5&&l.ids.every(id=>Number.isInteger(id)&&id>=0&&id<CARD_DATA.length)
    ?{name:typeof l.name==='string'&&l.name?l.name.slice(0,24):`Loadout ${i+1}`,ids:l.ids.slice()}:null});
// the main loadout is what the menu shows and the deck picker starts with; it must point at a saved slot
function fixMain(){if(!(Number.isInteger(SAVE.mainLo)&&SAVE.loadouts[SAVE.mainLo]))SAVE.mainLo=SAVE.loadouts.findIndex(Boolean)}
fixMain();
// indexes in ids you don't have enough copies of; have(id) = how many you own
function missingIn(ids,have){const need={},miss=[];ids.forEach((id,k)=>{need[id]=(need[id]||0)+1;if(need[id]>have(id))miss.push(k)});return miss}
/* deck building rules: at most 1 card of 5★ rarity, at most 2 cards of 4★ or more, 3★ and below have no limit */
function rarBlock(ids,id){
  const r=CARDS[id].rar;if(r<4)return '';
  if(r===5&&ids.some(x=>CARDS[x].rar===5))return 'Only 1 card of 5★ rarity per deck.';
  if(ids.filter(x=>CARDS[x].rar>=4).length>=2)return 'Only 2 cards of 4★ rarity or more per deck.';
  return '';
}
// indexes in ids that break the rarity rules (the earlier cards are kept)
function rarOver(ids){const kept=[],bad=[];ids.forEach((id,k)=>{if(rarBlock(kept,id))bad.push(k);else kept.push(id)});return bad}
// add ids in order, skipping any that break the rules, up to 5
function legalDeck(ids){const d=[];for(const id of ids){if(d.length<5&&!rarBlock(d,id))d.push(id)}return d}
// how many cards of a pool can go into one legal deck
function deckable(pool){let lo=0,n4=0,n5=0;pool.forEach(e=>{const r=CARDS[e.id].rar;if(r<4)lo+=e.count;else if(r===4)n4+=e.count;else n5+=e.count});return lo+Math.min(2,n4+Math.min(1,n5))}
function mainLoadout(){const l=SAVE.loadouts[SAVE.mainLo];return l?{l,miss:missingIn(l.ids,owned),over:rarOver(l.ids)}:null}
// the hand the deck picker opens with: the main loadout when it's complete, otherwise the last deck played
function preDeck(){const m=mainLoadout();return m&&!m.miss.length&&!m.over.length?m.l.ids:SAVE.lastDeck}
// developer tools (profile.js): for accounts the server lists in DEV_USERS, and on a local copy of the game
function isDev(){
  if(/^(localhost|127\.0\.0\.1|\[::1\]|)$/.test(location.hostname))return true;
  try{return !!(ACCT.token&&ACCT.user&&ACCT.user.dev)}catch(e){return false}   // account.js loads later
}
// "Unlock all cards" (a developer tool) lends at least 1 copy of every card while it's on; the real collection stays underneath.
// It's ignored for everyone else, even if an old save has it switched on.
const unlocked=()=>!!SAVE.unlockAll&&isDev();
const owned=id=>{const n=SAVE.coll[id]||0;return unlocked()?Math.max(1,n):n};
const isSeen=id=>unlocked()||SAVE.seen.includes(id);
const seenCount=()=>unlocked()?CARDS.length:SAVE.seen.length;
function collTotal(){return CARDS.reduce((a,c)=>a+owned(c.id),0)}
function collAdd(id){SAVE.coll[id]=(SAVE.coll[id]||0)+1;if(!SAVE.seen.includes(id))SAVE.seen.push(id)}
function collRemove(id){if(SAVE.coll[id]){SAVE.coll[id]--;if(SAVE.coll[id]<=0)delete SAVE.coll[id]}}
function collPool(){return CARDS.map(c=>({id:c.id,count:owned(c.id)})).filter(e=>e.count>0)}
function ensureMinimum(){
  const added=[];const lv1=CARDS.filter(c=>c.lv===1);
  // enough cards for a legal deck: 4★ and 5★ cards beyond the rarity limits don't count
  while(deckable(collPool())<5){const c=lv1[Math.floor(Math.random()*lv1.length)];collAdd(c.id);added.push(c.id)}
  save();return added;
}
