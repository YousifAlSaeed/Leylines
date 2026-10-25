'use strict';
/* =====================================================================
   STORE  (Ley Shards, the Wandering Merchant and the Pack Counter)
   Shards are earned by playing. CPU and online matches pay up to
   SHARD_CAP a game day (clock.js); the Daily's rewards come on top.
   The Merchant's stock changes at the game's midnight: 3 cards and a
   discounted pack are the same for every player that day, plus 1 card
   you haven't found yet. The Pack Counter sells every pack tier, and a
   bought pack opens right away.
   ===================================================================== */
const SHARD_CAP=250;   // from matches, per game day
// a win; a draw pays half. Online losses pay ONLINE_LOSS, CPU losses nothing. Leaving early and Couch pay nothing.
const MATCH_SHARDS={easy:10,normal:20,hard:30,challenger:25,boss:40,online:40};
const ONLINE_LOSS=10;
const CARD_PRICE=[30,80,200,600,1800];   // the Merchant, by rarity
const PACK_PRICE={spark:120,arcane:300,ley:700,mythic:1600};
const MYTHIC_WEEK=1;   // Mythic packs a week from the Pack Counter
const DEAL_OFF=.25;    // the Pack Counter's pack of the day
// the Merchant's shared slots, as [lowest, highest] rarity, then a 4★. The Merchant never sells a 5★
const MERCH_RAR=[[1,2],[3,3]];

const shd=()=>'<i class="shd" aria-hidden="true"></i>';
const fmtSh=n=>n.toLocaleString('en-US');
const shardsTxt=n=>`${fmtSh(n)} shard${n===1?'':'s'}`;

/* ---------- earning ---------- */
// today's shards from matches {at: game day, n}. Without the server's time they count toward the last known day
// (or the first day the clock comes back), so playing offline can't get round the limit.
function shardDay(){
  const t=today();let d=SAVE.shardDay;
  if(!d)d=SAVE.shardDay={at:t,n:0};
  else if(t&&!d.at)d.at=t;
  else if(t&&d.at<t)d=SAVE.shardDay={at:t,n:0};
  return d;
}
// recordMatch (profile.js) calls this; the caller saves. Returns {sh: shards given, capped: the limit cut it short}
function matchShards(res,o={}){
  if(o.left)return {sh:0,capped:false};
  const base=o.online?MATCH_SHARDS.online:MATCH_SHARDS[o.diff]||0;
  const full=res==='w'?base:res==='d'?Math.round(base/2):o.online?ONLINE_LOSS:0;
  if(!full)return {sh:0,capped:false};
  const d=shardDay(),sh=Math.min(full,Math.max(0,SHARD_CAP-d.n));
  d.n+=sh;SAVE.shards+=sh;
  return {sh,capped:sh<full};
}

/* ---------- the shop's day ---------- */
// weeks start on Monday (game day 0, 1 Jan 1970, was a Thursday)
const weekNo=()=>Math.floor((gameDayNo()+3)/7);
// today's purchases: got {slot: card id, deal: 1}, mine = today's not-found-yet card, myth = Mythic packs bought this week.
// Only called once the server's time is known. peek: a new day's record isn't kept (the menu's market box looks without
// starting the day, which would mark the new stock as seen: renderStoreTile)
function shopDay(peek){
  const t=today(),wk=weekNo();let s=SAVE.shop;
  if(!s||s.at!==t){const n={at:t,got:{},mine:null,wk:s?s.wk:wk,myth:s?s.myth:0};if(peek)return n;s=SAVE.shop=n}
  if(s.wk!==wk){s.wk=wk;s.myth=0}
  return s;
}
// the stock: the shared part comes from the game day alone, so every player sees the same
function merchStock(n=dayNo(),peek=false){
  const rng=mulberry32(daySeed(20,n)),ids=[];
  const pick=(lo,hi)=>{const id=pickOne(CARDS.filter(c=>c.rar>=lo&&c.rar<=hi&&!ids.includes(c.id)),rng).id;ids.push(id);return id};
  const cards=MERCH_RAR.map(([lo,hi])=>({id:pick(lo,hi)}));
  // the roll that once made this a 5★ on some days stays, so the rest of the stock doesn't move
  rng();cards.push({id:pick(4,4)});
  const deal=pickOne(['spark','arcane','arcane','ley'],rng);
  // the card for you, kept for the day once picked: one you haven't found (up to 3★), or any 1★–3★ once you've found them all
  const s=shopDay(peek);
  if(s.mine==null||ids.includes(s.mine)){
    const r2=mulberry32(daySeed(21,n)^hashStr(SAVE.cid)),pool=CARDS.filter(c=>c.rar<=3&&!ids.includes(c.id));
    const fresh=pool.filter(c=>!SAVE.seen.includes(c.id));
    s.mine=pickOne(fresh.length?fresh:pool,r2).id;
  }
  cards.unshift({id:s.mine,mine:!SAVE.seen.includes(s.mine)||s.got[0]!=null});
  cards.forEach(c=>c.price=CARD_PRICE[CARDS[c.id].rar-1]);
  return {cards,deal:{t:deal,price:Math.round(PACK_PRICE[deal]*(1-DEAL_OFF)/10)*10}};
}
function hashStr(s){let h=2166136261;for(const ch of String(s))h=Math.imul(h^ch.charCodeAt(0),16777619);return h>>>0}

/* ---------- buying ---------- */
function short(price){
  if(SAVE.shards>=price)return false;
  toast(`You need ${shardsTxt(price-SAVE.shards)} more. Win matches and dailies to earn them.`,2800);return true;
}
function buyCard(i){
  if(!clockOk())return;
  const s=shopDay(),it=merchStock().cards[i];
  if(!it||s.got[i]!=null||short(it.price))return;
  const c=CARDS[it.id];
  modal(`<div class="kick">Wandering Merchant</div><h2>Buy ${esc(c.name)}?</h2><div class="st-one">${cardHTML(it.id,myCol())}</div>
    <p class="st-cost">${shd()}<b>${fmtSh(it.price)}</b> · you have ${fmtSh(SAVE.shards)}</p>`,
    [{label:'Buy',cls:'primary',wait:1,fn:()=>{
      const s2=shopDay();
      if(s2.at!==s.at||s2.got[i]!=null||SAVE.shards<it.price){renderStore();return}
      const fresh=!SAVE.seen.includes(it.id);
      SAVE.shards-=it.price;s2.got[i]=it.id;collAdd(it.id);profCheck();save();earnNow('shop');
      sfx('buy');renderStore();renderStoreTile();if(typeof hubMarket==='function')hubMarket();
      toast(`${c.name} added to your collection${fresh?' (new!)':''}.`);freshToast();
    }},{label:'Cancel',esc:true}]);
}
// deal: the Pack Counter's pack of the day, at its lower price
function buyPack(t,deal){
  const T=PACKS[t],myth=t==='mythic';
  if((myth||deal)&&!clockOk()){toast('Checking the time with the server. Try again in a moment.');return}
  const s=myth||deal?shopDay():null,price=deal?merchStock().deal.price:PACK_PRICE[t];
  if(deal&&s.got.deal)return;
  if(myth&&s.myth>=MYTHIC_WEEK){toast('One Mythic pack a week. The next one comes on Monday.');return}
  if(short(price))return;
  modal(`<div class="kick">Pack Counter</div><h2>Buy ${aPack(t)}?</h2>
    <div class="st-one">${miniPack(t,'big ready')}</div><p>${T.n} cards${pitySure(t)?', the last one a sure 5★ (guarantee)':T.min>1?`, the last one ${T.min}★ or better`:''}. It opens right away.</p>
    <p class="st-cost">${shd()}<b>${fmtSh(price)}</b> · you have ${fmtSh(SAVE.shards)}</p>`,
    [{label:'Buy and open',cls:'primary',wait:1,fn:()=>{
      if(SAVE.shards<price)return;
      if(s){const s2=shopDay();if(s2.at!==s.at||deal&&s2.got.deal||myth&&s2.myth>=MYTHIC_WEEK){renderStore();return}
        if(deal)s2.got.deal=1;if(myth)s2.myth++}
      SAVE.shards-=price;SAVE.packs.push({t,src:'shop'});save();earnNow('shop');
      renderStore();renderStoreTile();openPack(SAVE.packs.length-1);
    }},{label:'Cancel',esc:true}]);
}

/* ---------- the Store screen: the Night Market (and the menu tile) ---------- */
// Four stops under a starry sky: the Merchant, the Forge (forge.js), the Pack Counter (with the shards you've earned on its
// second tab) and the Atelier (closed for now: it will sell cosmetics).
// A wide screen shows them side by side. A phone opens on just the sky; tapping a star brings up a carousel of the four
// stops to swipe through, and swiping past either end goes back to the sky.
// The light theme gets the Day Market: the same four stops under a sun and a daytime sky.
// Tapping the moon (or the sun) turns on the dial: it crosses an arc as the game day runs out, and the sky's colours go
// with it. The dial is off to begin with and is kept on this device only, outside the save (which follows the account).
const ST_STOPS=[['merchant','I','Merchant','Merchant'],['forge','II','The Forge','Forge'],['packs','III','Pack counter','Packs'],['atelier','IV','Atelier','Atelier']];
// the Atelier's sign: a cauldron with bubbles rising out of it (store.css makes them rise and pop)
const ST_BREW='<svg class="st-brew" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.6" y="10" width="18.8" height="2.4" rx="1.2"/><path d="M4.4 11.8h15.2c0 4.6-3.1 8.4-7.6 8.4s-7.6-3.8-7.6-8.4z"/><path d="M6.8 18.6l-1.3 2.6h2.1l1-2zM17.2 18.6l1.3 2.6h-2.1l-1-2z"/><circle class="bub" cx="9" cy="7.2" r="1.3"/><circle class="bub" cx="12.8" cy="5.4" r="1.7"/><circle class="bub" cx="16" cy="7.6" r="1"/></svg>';
// the Pack counter's tab: 'packs' or 'shards' (the shards you've earned today and the 5★ guarantee); kept while the game is open
let stPkTab='packs';
const ST_DIAL_KEY='ninefold.dial';
let stDial=(()=>{try{return localStorage.getItem(ST_DIAL_KEY)==='1'}catch(e){return false}})();
const stDay=()=>document.documentElement.dataset.theme==='light';
// the dial's sky: its top, middle and bottom colours at the start, the middle and the end of the game day
const ST_SKY={
  day:[[[247,181,200],[255,217,192],[227,214,255]],[[127,200,248],[196,230,251],[255,243,207]],[[183,155,232],[255,179,138],[255,213,154]]],
  night:[[[58,26,94],[96,36,104],[150,58,104]],[[5,4,22],[9,7,36],[20,13,58]],[[10,16,56],[22,38,92],[40,104,120]]]};
// where the arc is t of the way through the day, as [x, y] in % of the box it's drawn in
const stArc=t=>[4+92*t,14+(1-Math.sin(Math.PI*t))*66];
const ST_ARC='M'+Array.from({length:41},(_,i)=>stArc(i/40).map(v=>v.toFixed(1)).join(' ')).join('L');
// the constellation a phone's map draws through the four stars (store.css places the stars on its corners). At night
// the dial's moon goes along it, not the arc
const ST_ZIG=[[16,40],[40,72],[63,30],[85,66]];
function stZig(t){
  const len=ST_ZIG.slice(1).map((p,i)=>Math.hypot(p[0]-ST_ZIG[i][0],p[1]-ST_ZIG[i][1]));
  let d=t*len.reduce((a,b)=>a+b),i=0;
  while(i<len.length-1&&d>len[i])d-=len[i++];
  const a=ST_ZIG[i],b=ST_ZIG[i+1],u=d/len[i];
  return [a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u];
}
const ST_ICON={night:'<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  day:'<circle cx="12" cy="12" r="4"/><path d="M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>'};
// The sky's classes and colours. applyTheme (settings.js) calls it, so it runs on every change of screen or theme.
let stWasDay=null;
function stSky(){
  const sc=$('#scr-store'),root=document.documentElement,day=stDay(),on=sc.classList.contains('on');
  sc.classList.toggle('st-day',day);sc.classList.toggle('st-dial',stDial);
  if(stDial&&on){
    // without the server's time the dial waits at its middle
    const t=clockOk()?dayFrac():.5,K=ST_SKY[day?'day':'night'],a=K[t<.5?0:1],b=K[t<.5?1:2],u=t<.5?t*2:t*2-1;
    const col=a.map((c,i)=>`rgb(${c.map((v,j)=>Math.round(v+(b[i][j]-v)*u)).join(',')})`),[x,y]=stArc(t),[zx,zy]=stZig(t);
    col.forEach((c,i)=>sc.style.setProperty('--s'+(i+1),c));
    sc.style.setProperty('--sa',(.3+.65*Math.sin(Math.PI*t)).toFixed(2)); // the stars are brightest when the sky is darkest
    sc.style.setProperty('--mx',x.toFixed(2)+'%');sc.style.setProperty('--my',y.toFixed(2)+'%');
    sc.style.setProperty('--zx',zx.toFixed(2)+'%');sc.style.setProperty('--zy',zy.toFixed(2)+'%');
    // the page's own colour follows the sky, for an iPhone's strips (store.css)
    root.style.setProperty('--bar',col[0]);root.style.setProperty('--bg0',col[2]);
  }else{
    ['--s1','--s2','--s3','--sa','--mx','--my','--zx','--zy'].forEach(p=>sc.style.removeProperty(p));
    root.style.removeProperty('--bar');root.style.removeProperty('--bg0');
  }
  // the theme changed: the market's name and words change with it
  if(day!==stWasDay){const first=stWasDay==null;stWasDay=day;if(!first){renderStoreTile();if(on)renderStore()}}
}
const stMoonLabel=()=>`The ${stDay()?'sun':'moon'}. ${stDial?'It crosses the sky as the day runs out. Tap to stop it':'Tap to let it cross the sky as the day runs out'}`;
function stDialFlip(){
  stDial=!stDial;try{localStorage.setItem(ST_DIAL_KEY,stDial?'1':'0')}catch(e){}
  // only the sky changes (stSky), so the market isn't drawn again
  sfx('click');applyTheme();
  $$('#stBody .st-moon').forEach(b=>{b.setAttribute('aria-pressed',stDial);b.setAttribute('aria-label',stMoonLabel())});
  toast(stDial?`The ${stDay()?'sun':'moon'} now crosses the sky as the day runs out. Tap it again to stop it.`:'The sky stands still again.',3200);
}
const ST_STAR='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1l2.2 8.8L23 12l-8.8 2.2L12 23l-2.2-8.8L1 12l8.8-2.2z"/></svg>';
// the Day Market marks its stops with little clouds: there are no stars by day
const ST_CLOUD='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 19.5a4.5 4.5 0 01-.7-8.95A6 6 0 0117.9 9.6 5 5 0 0117.5 19.5z"/></svg>';
let stStop='merchant'; // the stop the phone's carousel shows
const stIdx=()=>Math.max(0,ST_STOPS.findIndex(x=>x[0]===stStop));
const stPhone=()=>matchMedia('(max-width:759px)').matches;
function openStore(){
  // a phone opens on just the sky (see stSheet)
  stDown=true;clearInterval(stSheet.c);
  $('#scr-store').classList.remove('st-bar');$('#scr-store').classList.add('st-down');
  renderStore();show('store');$('#scr-store').scrollTop=0;
  stClock();stSheet.c=setInterval(stClock,1000);
}
function renderStore(){
  $('#stBal').innerHTML=`${shd()}<b>${fmtSh(SAVE.shards)}</b>`;
  $('#stBal').setAttribute('aria-label',`You have ${shardsTxt(SAVE.shards)}`);
  const price=p=>`<span class="st-price${SAVE.shards<p?' short':''}">${shd()}${fmtSh(p)}<span class="sr"> shards</span></span>`;
  const ok=clockOk(),s=ok?shopDay():null,st=ok?merchStock():null,wait='<p class="st-note">Checking the time with the server…</p>';

  const day=stDay(),mark=day?ST_CLOUD:ST_STAR;
  $('#scr-store .topbar h2').textContent=day?'Day Market':'Night Market';
  // the moon is the dial's switch. There are two: beside the countdown, and on a phone's map once the dial is on
  const moon=cls=>`<button class="st-moon${cls}" aria-pressed="${stDial}" aria-label="${stMoonLabel()}"></button>`;
  const hero=`<section class="st-hero"><div><div class="st-lab">${day?'Today':'Tonight'}'s sky</div><div class="st-count" id="stWait">${untilMidnight()}</div>
    <div class="st-now" aria-hidden="true"><div class="st-lab" id="stDate"></div><div class="st-count" id="stClock"></div></div>
    <p>${!ok?'Checking the time with the server…':day?'until the stalls pack up. Every player sees the same four stops today, and at midnight they all change.':'until the market moves on. Every player sees the same four stops tonight, and at midnight they all change.'}</p></div>
    <span class="st-orbit"><svg class="st-arc" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="${ST_ARC}" vector-effect="non-scaling-stroke"/></svg>${moon('')}${
      (day?['Dawn','Noon','Dusk']:['Moonrise','High moon','Moonset']).map(l=>`<small aria-hidden="true">${l}</small>`).join('')}</span></section>`;
  const map=`<nav class="st-map" aria-label="Market stops"><svg class="st-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path class="st-zig" d="M${ST_ZIG.map(p=>p.join(' ')).join('L')}" vector-effect="non-scaling-stroke"/><path class="st-arcp" d="${ST_ARC}" vector-effect="non-scaling-stroke"/></svg>${moon(' st-mm')}${
    ST_STOPS.map(([k,,,short])=>`<button class="st-star s-${k}${k===stStop?' on':''}" data-stop="${k}" aria-pressed="${k===stStop}">${mark}<span>${short}${k==='packs'&&s&&!s.got.deal?` −${DEAL_OFF*100}%`:''}</span></button>`).join('')}</nav>`;

  // "New" on a card you have no copies of; it goes once you own one (buying it here draws the market again)
  const merch=!ok?wait:`<div class="st-cards">${st.cards.map((it,i)=>{const sold=s.got[i]!=null,c=CARDS[it.id],nw=!owned(it.id);
    return `<div class="st-slot${sold?' sold':''}${it.mine?' mine':''}">${cardHTML(it.id,myCol(),{isNew:nw})}<span class="st-cn">${esc(c.name)}<small>${it.mine?'For you':'★'.repeat(c.rar)}</small></span>
      <button class="st-buy" data-c="${i}" ${sold?'disabled':''} aria-label="${sold?`${esc(c.name)}, sold`:`Buy ${esc(c.name)}, ${rarName(c.rar)}${nw?", one you don't own":''}, for ${shardsTxt(it.price)}`}">${sold?'Sold':price(it.price)}</button></div>`}).join('')}</div>`;

  const forge=forgeHTML();

  // the pack on offer today is marked on its own row until it's bought
  const mythLeft=s?Math.max(0,MYTHIC_WEEK-s.myth):null,dl=ok&&!s.got.deal?st.deal:null;
  const tiers=`<div class="st-tiers">${Object.entries(PACKS).map(([t,T])=>{
      const out=t==='mythic'&&mythLeft===0,deal=dl&&dl.t===t;
      return `<button class="st-pk t-${t}${out?' sold':''}${deal?' deal':''}" data-p="${t}" ${out?'disabled':''}>${miniPack(t,out?'spent':'ready')}
        <span class="st-dt">${deal?`<span class="st-tag">−${DEAL_OFF*100}% ${day?'today':'tonight'}</span>`:''}<b>${T.name}</b><small>${T.n} cards${T.min>1?` · ${T.min}★+ last`:''}${t==='mythic'?` · ${out?'next on Monday':'1 a week'}`:''}</small></span>${
        out?'':deal?`<span class="st-was"><s><span class="sr">was </span>${fmtSh(PACK_PRICE[t])}</s>${price(dl.price)}</span>`:price(PACK_PRICE[t])}</button>`}).join('')}</div>
    <p class="st-note">Odds are on the Packs screen.</p>`;

  const d=shardDay(),pity=Math.min(PITY,SAVE.pity);
  const ring=(n,max,col,label)=>`<div class="st-ring-w"><div class="st-ring" style="--p:${(Math.min(n,max)/max*100).toFixed(1)};--rc:${col}" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${n}"><span><b>${fmtSh(n)}</b><small>of ${max}</small></span></div><div class="st-rl">${label}</div></div>`;
  const earned=`<div class="st-rings">${ring(d.n,SHARD_CAP,'var(--shard)','Shards from matches today')}${ring(pity,PITY,'var(--st-gold)','5★ guarantee')}</div>
    <dl class="st-rates">
      <div><dt>Solo win</dt><dd>${MATCH_SHARDS.easy} · ${MATCH_SHARDS.normal} · ${MATCH_SHARDS.hard}</dd></div>
      <div><dt>Online</dt><dd>Win ${MATCH_SHARDS.online} · Draw ${MATCH_SHARDS.online/2} · Loss ${ONLINE_LOSS}</dd></div>
      <div><dt>Daily</dt><dd>Duel ${DAILY_REWARD.duel.shards} · Puzzle ${DAILY_REWARD.puzzle.shards} · Gauntlet ${DAILY_REWARD.gauntlet[0].shards}</dd></div>
    </dl>
    <p class="st-note">Matches pay up to ${SHARD_CAP} shards a day, and the Daily pays on top. Every pack you open adds to the guarantee (${pityPts()}): the one that reaches ${PITY} ends with a 5★.</p>`;
  // both tabs are drawn, and switching only shows one or the other (the market isn't drawn again)
  const tab=(k,html)=>`<div class="st-pane" data-pane="${k}"${stPkTab===k?'':' hidden'}>${html}</div>`;
  const packs=`<div class="seg st-seg" id="stSeg" role="group" aria-label="Pack counter">${[['packs','Packs'],['shards','Shards']].map(([k,l])=>
    `<button data-pt="${k}" class="${stPkTab===k?'on':''}" aria-pressed="${stPkTab===k}">${l}</button>`).join('')}</div>${tab('packs',tiers)}${tab('shards',earned)}`;
  const atelier=`<div class="st-closed">${ST_BREW}<b>Atelier</b><span class="st-soon">Coming soon</span><small>Come back another ${day?'day':'night'}.</small></div>`;

  const sub={merchant:'Four cards, the same for every player. <b>For you</b> is one you haven\'t found yet, picked for you.',forge:'Melt extra cards into shards, or forge five into one of the next rarity.',
    packs:'Packs open the moment you buy.',atelier:'Closed for now.'};
  const body={merchant:merch,forge,packs,atelier};
  $('#stBody').innerHTML=hero+map+`<div class="st-swipe"><div class="st-view"><div class="st-stops">${ST_STOPS.map(([k,n,name])=>
    `<section class="st-stop s-${k}${k===stStop?' on':''}" data-stop="${k}"><h3 class="st-sh">${mark}<span>${n} · ${name}</span><i></i></h3><p class="st-sub">${sub[k]}</p><div class="st-glass">${body[k]}</div></section>`).join('')}</div></div>
    <div class="st-dots" aria-hidden="true">${ST_STOPS.map(([k])=>`<i class="s-${k}${k===stStop?' on':''}" data-stop="${k}"></i>`).join('')}</div>
    <p class="st-hint">Swipe past either end to see the sky</p></div>`;

  // a star: from the sky it brings up the market on that stop; in the market it moves the carousel there
  $$('#stBody .st-star').forEach(b=>b.onclick=()=>{
    const i=ST_STOPS.findIndex(x=>x[0]===b.dataset.stop);
    if(!stDown&&i===stIdx())return;
    sfx('click');
    if(stDown){stGo(i,false);stSheet(false)}else stGo(i);
  });
  $$('#stBody .st-moon').forEach(b=>b.onclick=stDialFlip);
  stClock(); // the sky's clock is drawn again with the rest, so it doesn't wait empty for its next second
  stSwipe();
  if(!stDown)stGo(stIdx(),false);
  $$('#stBody .st-buy[data-c]').forEach(b=>b.onclick=()=>{sfx('click');buyCard(+b.dataset.c)});
  $$('#stBody .st-pk').forEach(b=>b.onclick=()=>{sfx('click');buyPack(b.dataset.p,b.classList.contains('deal'))});
  forgeWire();
  $$('#stBody [data-pt]').forEach(b=>b.onclick=()=>{
    if(stPkTab===b.dataset.pt)return;sfx('click');stPkTab=b.dataset.pt;
    $$('#stBody [data-pt]').forEach(x=>{const on=x===b;x.classList.toggle('on',on);x.setAttribute('aria-pressed',on)});
    $$('#stBody .st-pane').forEach(p=>{p.hidden=p.dataset.pane!==stPkTab});
  });
}
// A phone shows either just the sky (stDown: the constellation over the whole screen, the stars without their names,
// the phone's own time in place of the countdown, the top bar faded; good for a screenshot) or the market's carousel.
let stDown=true;
function stSheet(down){
  const sc=$('#scr-store'),map=$('#stBody .st-map'),sw=$('#stBody .st-swipe');
  if(stDown===down||!map||!sw)return;
  stDown=down;sc.classList.remove('st-bar');
  clearInterval(stSheet.c);if(down){stClock();stSheet.c=setInterval(stClock,1000)}
  clearTimeout(stSheet.t);clearTimeout(stSheet.t2);
  // the map's height animates from where it was to where the new layout puts it
  const grow=()=>{
    const h0=map.offsetHeight;sc.classList.toggle('st-down',down);
    const h1=map.offsetHeight;map.style.height=h0+'px';void map.offsetHeight;
    map.style.transition='height .5s var(--ease)';map.style.height=h1+'px';
    stSheet.t=setTimeout(()=>{map.style.height=map.style.transition=''},530);
  };
  sc.classList.add('st-moving');
  if(down){
    // the market lifts out of the page and fades away (sideways after a swipe, see stSwipe) while the sky opens out under it
    sc.scrollTo({top:0,behavior:'smooth'});
    sw.style.top=sw.offsetTop+'px';sw.style.height=sw.offsetHeight+'px';sw.classList.add('leaving');
    grow();
    requestAnimationFrame(()=>{sw.style.opacity='';sw.classList.add('out')});
    stSheet.t2=setTimeout(()=>{
      sw.classList.remove('leaving','out');sw.style.top=sw.style.height='';sw.style.removeProperty('--ox');sw.style.removeProperty('--oy');
      sc.classList.remove('st-moving');
    },530);
  }else{
    // the sky closes up and the market rises in on the chosen stop
    sw.classList.add('out');grow();stGo(stIdx(),false);
    requestAnimationFrame(()=>requestAnimationFrame(()=>sw.classList.remove('out')));
    setTimeout(()=>sc.classList.remove('st-moving'),540);
  }
}
// in the sky, a tap anywhere but a star brings back the top bar (or hides it again)
document.addEventListener('click',e=>{
  const sc=e.target.closest('#scr-store');
  if(!sc||!stDown||!stPhone()||e.target.closest('.st-star,.st-top,.st-moon'))return;
  sc.classList.toggle('st-bar');
});
// the phone's own date and time, shown in the sky in place of the countdown, like a lock screen
function stClock(){
  const now=new Date(),c=$('#stClock'),d=$('#stDate');if(!c||!d)return;
  // the hour and minutes big, AM or PM (where the phone uses them) small
  const t=new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).formatToParts(now)
    .map(p=>p.type==='dayPeriod'?`<small>${esc(p.value)}</small>`:p.type==='literal'&&/^\s+$/.test(p.value)?'':esc(p.value)).join('');
  if(c.innerHTML!==t)c.innerHTML=t;
  d.textContent=now.toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long'});
}

/* ---------- the phone's carousel ---------- */
// where the track sits to centre stop i, with the stops either side peeking in
function stX(i){
  const tr=$('#stBody .st-stops'),sl=tr&&tr.children[i];
  return sl?(tr.parentNode.clientWidth-sl.offsetWidth)/2-sl.offsetLeft:0;
}
// move to stop i (anim false: jump there)
function stGo(i,anim=true){
  stStop=ST_STOPS[i][0];
  $$('#stBody [data-stop]').forEach(x=>{const on=x.dataset.stop===stStop;x.classList.toggle('on',on);if(x.matches('button'))x.setAttribute('aria-pressed',on)});
  const tr=$('#stBody .st-stops');if(!tr)return;
  if(!stPhone()){tr.style.transform='';return}
  if(!anim)tr.style.transition='none';
  tr.style.transform=`translateX(${stX(i)}px)`;
  if(!anim){void tr.offsetWidth;tr.style.transition=''}
}
// Swipe sideways between the stops. Pulling past the first or the last one stretches, fades and, let go far enough,
// goes back to the sky. Up and down still scroll the page.
function stSwipe(){
  const vw=$('#stBody .st-view'),tr=$('#stBody .st-stops'),sw=$('#stBody .st-swipe');if(!vw)return;
  const last=ST_STOPS.length-1;
  let x0=null,y0=0,dx=0,lock=null,moved=false;
  const atEdge=(i,d)=>i===0&&d>0||i===last&&d<0;
  vw.onpointerdown=e=>{if(stDown||!stPhone()||e.button>0)return;x0=e.clientX;y0=e.clientY;dx=0;lock=null;moved=false};
  vw.onpointermove=e=>{
    if(x0==null)return;
    const mx=e.clientX-x0,my=e.clientY-y0;
    if(!lock){
      if(Math.hypot(mx,my)<8)return;
      lock=Math.abs(mx)>Math.abs(my)?'x':'y';
      if(lock==='x'){moved=true;vw.setPointerCapture(e.pointerId);tr.style.transition='none'}
    }
    if(lock!=='x')return;
    const i=stIdx(),edge=atEdge(i,mx);
    dx=edge?mx*.45:mx;
    tr.style.transform=`translateX(${stX(i)+dx}px)`;
    sw.style.opacity=edge?Math.max(.3,1-Math.abs(dx)/160).toFixed(2):'';
  };
  const end=()=>{
    if(x0==null)return;
    x0=null;if(lock!=='x')return;
    setTimeout(()=>moved=false); // the click a swipe ends with comes before this
    tr.style.transition='';
    const i=stIdx();
    if(atEdge(i,dx)&&Math.abs(dx)>50){
      sw.style.setProperty('--ox',(dx>0?110:-110)+'px');sw.style.setProperty('--oy','0px');
      sfx('click');stSheet(true);return; // it fades on from how faded the pull left it (stSheet)
    }
    sw.style.opacity='';
    stGo(Math.abs(dx)>45&&!atEdge(i,dx)?i-Math.sign(dx):i);
  };
  vw.onpointerup=end;vw.onpointercancel=end;
  // a swipe doesn't also tap what it started on, and a tap on a stop peeking in from the side moves to it
  vw.addEventListener('click',e=>{
    if(moved){e.stopPropagation();e.preventDefault();moved=false;return}
    // (a phone's carousel only: a wide screen shows every stop, and a click there is meant for what it's on)
    const sl=stPhone()&&e.target.closest('.st-stop');
    if(sl&&!sl.classList.contains('on')){e.stopPropagation();e.preventDefault();stGo(ST_STOPS.findIndex(x=>x[0]===sl.dataset.stop))}
  },true);
}
// keep the carousel centred when the window changes size (a phone turning, for one)
addEventListener('resize',()=>{if($('#scr-store').classList.contains('on')&&!stDown)stGo(stIdx(),false)});
// the menu's Night Market tile, and the shards on the player card (account.js)
function renderStoreTile(){
  const fresh=clockOk()&&(!SAVE.shop||SAVE.shop.at!==today()),day=stDay(),name=day?'Day Market':'Night Market';
  // the Merchant's cards still for sale. No countdown here: the Daily's is the menu's only one
  const left=()=>{const got=shopDay(true).got,all=merchStock(dayNo(),true).cards,n=all.filter((_,i)=>got[i]==null).length;return n?`${n} of ${all.length} cards left`:'All sold today'};
  const sub=!clockOk()?(day?"Today's stock":"Tonight's stock"):fresh?`New stock ${day?'today':'tonight'}`:left();
  $('#storeTile b').textContent=name;$('#storeTile svg').innerHTML=ST_ICON[day?'day':'night'];
  $('#storeSub').textContent=sub;
  $('#storeTile').classList.toggle('hot',fresh);
  $('#storeTile').setAttribute('aria-label',`${name}. ${sub}`);
  const p=$('#pcShards');if(p)p.innerHTML=`${shd()}${fmtSh(SAVE.shards)}`;
}
// the countdown, and new stock at midnight
setInterval(()=>{
  if($('#scr-menu').classList.contains('on'))renderStoreTile();
  if(!$('#scr-store').classList.contains('on'))return;
  if(SAVE.shop&&clockOk()&&SAVE.shop.at!==today()){renderStore();return}
  const w=$('#stWait');if(w)w.textContent=untilMidnight();
  if(stDial)applyTheme(); // moves the dial on (stSky)
},30000);
