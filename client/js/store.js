'use strict';
/* =====================================================================
   STORE  (Ley Shards, the Wandering Merchant and the Pack Counter)
   Shards are earned by playing. CPU and online matches pay up to
   SHARD_CAP a game day (clock.js); the Daily tab's rewards come on top.
   The Merchant's stock changes at the game's midnight: 3 cards and a
   discounted pack are the same for every player that day, plus 1 card
   you haven't found yet. The Pack Counter sells every pack tier, and a
   bought pack opens right away.
   ===================================================================== */
const SHARD_CAP=250;   // from matches, per game day
// a win; a draw pays half. Online losses pay ONLINE_LOSS, CPU losses nothing. Leaving early and Same screen pay nothing.
const MATCH_SHARDS={easy:10,normal:20,hard:30,challenger:25,boss:40,online:40};
const ONLINE_LOSS=10;
const CARD_PRICE=[30,80,200,600,1800];   // the Merchant, by rarity
const PACK_PRICE={spark:120,arcane:300,ley:700,mythic:1600};
const MYTHIC_WEEK=1;   // Mythic packs a week from the Pack Counter
const DEAL_OFF=.25;    // the Merchant's pack of the day
// the Merchant's shared slots, as [lowest, highest] rarity, then a 4★ (a 5★ on 1 day in 10)
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
// Only called once the server's time is known.
function shopDay(){
  const t=today(),wk=weekNo();let s=SAVE.shop;
  if(!s||s.at!==t)s=SAVE.shop={at:t,got:{},mine:null,wk:s?s.wk:wk,myth:s?s.myth:0};
  if(s.wk!==wk){s.wk=wk;s.myth=0}
  return s;
}
// the stock: the shared part comes from the game day alone, so every player sees the same
function merchStock(n=dayNo()){
  const rng=mulberry32(daySeed(20,n)),ids=[];
  const pick=(lo,hi)=>{const id=pickOne(CARDS.filter(c=>c.rar>=lo&&c.rar<=hi&&!ids.includes(c.id)),rng).id;ids.push(id);return id};
  const cards=MERCH_RAR.map(([lo,hi])=>({id:pick(lo,hi)}));
  const r4=rng()<.1?5:4;cards.push({id:pick(r4,r4)});
  const deal=pickOne(['spark','arcane','arcane','ley'],rng);
  // the card for you, kept for the day once picked: one you haven't found (up to 3★), or any 1★–3★ once you've found them all
  const s=shopDay();
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
  modal(`<div class="kick">Wandering Merchant</div><h2>Buy ${esc(c.name)}?</h2><div class="st-one">${cardHTML(it.id,'blue')}</div>
    <p class="st-cost">${shd()}<b>${fmtSh(it.price)}</b> · you have ${fmtSh(SAVE.shards)}</p>`,
    [{label:'Buy',cls:'primary',fn:()=>{
      const s2=shopDay();
      if(s2.at!==s.at||s2.got[i]!=null||SAVE.shards<it.price){renderStore();return}
      const fresh=!SAVE.seen.includes(it.id);
      SAVE.shards-=it.price;s2.got[i]=it.id;collAdd(it.id);profCheck();save();
      sfx('win');renderStore();renderStoreTile();
      toast(`${c.name} added to your collection${fresh?' (new!)':''}.`);freshToast();
    }},{label:'Cancel',esc:true}]);
}
// deal: the Merchant's pack of the day
function buyPack(t,deal){
  const T=PACKS[t],myth=t==='mythic';
  if((myth||deal)&&!clockOk()){toast('Checking the time with the server. Try again in a moment.');return}
  const s=myth||deal?shopDay():null,price=deal?merchStock().deal.price:PACK_PRICE[t];
  if(deal&&s.got.deal)return;
  if(myth&&s.myth>=MYTHIC_WEEK){toast('One Mythic pack a week. The next one comes on Monday.');return}
  if(short(price))return;
  modal(`<div class="kick">${deal?'Wandering Merchant':'Pack Counter'}</div><h2>Buy ${aPack(t)}?</h2>
    <div class="st-one">${miniPack(t,'big ready')}</div><p>${T.n} cards${pitySure(t)?', the last one a sure 5★ (guarantee)':T.min>1?`, the last one ${T.min}★ or better`:''}. It opens right away.</p>
    <p class="st-cost">${shd()}<b>${fmtSh(price)}</b> · you have ${fmtSh(SAVE.shards)}</p>`,
    [{label:'Buy and open',cls:'primary',fn:()=>{
      if(SAVE.shards<price)return;
      if(s){const s2=shopDay();if(s2.at!==s.at||deal&&s2.got.deal||myth&&s2.myth>=MYTHIC_WEEK){renderStore();return}
        if(deal)s2.got.deal=1;if(myth)s2.myth++}
      SAVE.shards-=price;SAVE.packs.push({t,src:'shop'});save();
      renderStore();renderStoreTile();openPack(SAVE.packs.length-1);
    }},{label:'Cancel',esc:true}]);
}

/* ---------- the Store screen: the Night Market (and the menu tile) ---------- */
// Four stops under a starry sky: the Merchant, the deal of the night, the Pack Counter and the Shard well.
// A wide screen shows them side by side; a phone shows a map of the four stars and the chosen stop in a sheet under it.
const ST_STOPS=[['merchant','I','Merchant','Merchant'],['deal','II','Deal of the night','Deal'],['packs','III','Pack counter','Packs'],['well','IV','Shard well','Well']];
const ST_STAR='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1l2.2 8.8L23 12l-8.8 2.2L12 23l-2.2-8.8L1 12l8.8-2.2z"/></svg>';
let stStop='merchant'; // the stop the phone layout shows
function openStore(){stDown=false;clearInterval(stSheet.c);$('#scr-store').classList.remove('st-down','st-bar');renderStore();show('store');$('#scr-store').scrollTop=0}
function renderStore(){
  $('#stBal').innerHTML=`${shd()}<b>${fmtSh(SAVE.shards)}</b>`;
  $('#stBal').setAttribute('aria-label',`You have ${shardsTxt(SAVE.shards)}`);
  const price=p=>`<span class="st-price${SAVE.shards<p?' short':''}">${shd()}${fmtSh(p)}<span class="sr"> shards</span></span>`;
  const ok=clockOk(),s=ok?shopDay():null,st=ok?merchStock():null,wait='<p class="st-note">Checking the time with the server…</p>';

  const hero=`<section class="st-hero"><div><div class="st-lab">Tonight's sky</div><div class="st-count" id="stWait">${untilMidnight()}</div>
    <div class="st-now" aria-hidden="true"><div class="st-lab" id="stDate"></div><div class="st-count" id="stClock"></div></div>
    <p>${ok?'until the market moves on. Every player sees the same four stops tonight, and at midnight they all change.':'Checking the time with the server…'}</p></div><span class="st-moon" aria-hidden="true"></span></section>`;
  const map=`<nav class="st-map" aria-label="Market stops"><svg class="st-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M16 40L40 72L63 30L85 66" vector-effect="non-scaling-stroke"/></svg>${
    ST_STOPS.map(([k,,,short])=>`<button class="st-star s-${k}${k===stStop?' on':''}" data-stop="${k}" aria-pressed="${k===stStop}">${ST_STAR}<span>${short}${k==='deal'&&s&&!s.got.deal?` −${DEAL_OFF*100}%`:''}</span></button>`).join('')}</nav>`;

  const merch=!ok?wait:`<div class="st-cards">${st.cards.map((it,i)=>{const sold=s.got[i]!=null,c=CARDS[it.id];
    return `<div class="st-slot${sold?' sold':''}${it.mine?' mine':''}">${cardHTML(it.id,'blue')}<span class="st-cn">${esc(c.name)}<small>${it.mine?'For you':'★'.repeat(c.rar)}</small></span>
      <button class="st-buy" data-c="${i}" ${sold?'disabled':''} aria-label="${sold?`${esc(c.name)}, sold`:`Buy ${esc(c.name)}, ${rarName(c.rar)}, for ${shardsTxt(it.price)}`}">${sold?'Sold':price(it.price)}</button></div>`}).join('')}</div>`;

  let deal=wait;
  if(ok){
    const d=st.deal,T=PACKS[d.t],sold=!!s.got.deal;
    deal=`<div class="st-dealbox${sold?' sold':''}">${miniPack(d.t,sold?'spent':'ready')}<b class="st-dn">${T.name} pack</b>
      <small>${T.n} cards${T.min>1?` · the last one ${T.min}★ or better`:''}</small>${sold
        ?'<p class="st-off">Sold. A new deal comes at midnight.</p>'
        :`<p class="st-off">${DEAL_OFF*100}% off tonight · <s>${fmtSh(PACK_PRICE[d.t])}</s></p><button class="btn primary st-dealbuy" id="stDeal">${shd()}${fmtSh(d.price)} · Buy and open</button>`}</div>`;
  }

  const mythLeft=s?Math.max(0,MYTHIC_WEEK-s.myth):null;
  const packs=`<div class="st-tiers">${Object.entries(PACKS).map(([t,T])=>{
      const out=t==='mythic'&&mythLeft===0;
      return `<button class="st-pk t-${t}${out?' sold':''}" data-p="${t}" ${out?'disabled':''}>${miniPack(t,out?'spent':'ready')}
        <span class="st-dt"><b>${T.name}</b><small>${T.n} cards${T.min>1?` · ${T.min}★+ last`:''}${t==='mythic'?` · ${out?'next on Monday':'1 a week'}`:''}</small></span>${out?'':price(PACK_PRICE[t])}</button>`}).join('')}</div>
    <p class="st-note">Odds are on the Packs screen.</p>`;

  const d=shardDay(),pity=Math.min(PITY,SAVE.pity);
  const ring=(n,max,col,label)=>`<div class="st-ring-w"><div class="st-ring" style="--p:${(Math.min(n,max)/max*100).toFixed(1)};--rc:${col}" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${n}"><span><b>${fmtSh(n)}</b><small>of ${max}</small></span></div><div class="st-rl">${label}</div></div>`;
  const well=`<div class="st-rings">${ring(d.n,SHARD_CAP,'#6fe3f0','Shards from matches today')}${ring(pity,PITY,'#FFC45C','5★ guarantee')}</div>
    <dl class="st-rates">
      <div><dt>Win vs Computer</dt><dd>${MATCH_SHARDS.easy} · ${MATCH_SHARDS.normal} · ${MATCH_SHARDS.hard}</dd></div>
      <div><dt>Online</dt><dd>Win ${MATCH_SHARDS.online} · Draw ${MATCH_SHARDS.online/2} · Loss ${ONLINE_LOSS}</dd></div>
      <div><dt>Daily tab</dt><dd>Duel ${DAILY_REWARD.duel.shards} · Puzzle ${DAILY_REWARD.puzzle.shards} · Gauntlet ${DAILY_REWARD.gauntlet[0].shards}</dd></div>
    </dl>
    <p class="st-note">Matches pay up to ${SHARD_CAP} shards a day, and the Daily tab pays on top. Every pack you open adds to the guarantee (${pityPts()}): the one that reaches ${PITY} ends with a 5★.</p>`;

  const sub={merchant:'Four cards, the same for every player. <b>For you</b> is one you haven\'t found yet, picked for you.',deal:'One pack at a discount. It sells once.',
    packs:'Opens the moment you buy.',well:'What you\'ve drawn from the ley today.'};
  const body={merchant:merch,deal,packs,well};
  $('#stBody').innerHTML=hero+map+`<div class="st-stops"><button class="st-grab" aria-label="Hide the market to see the sky"></button>${ST_STOPS.map(([k,n,name])=>
    `<section class="st-stop s-${k}${k===stStop?' on':''}" data-stop="${k}"><h3 class="st-sh">${ST_STAR}<span>${n} · ${name}</span><i></i></h3><p class="st-sub">${sub[k]}</p><div class="st-glass">${body[k]}</div></section>`).join('')}</div>`;

  $$('#stBody .st-star').forEach(b=>b.onclick=()=>{
    if(stStop===b.dataset.stop&&!stDown)return;
    sfx('click');stStop=b.dataset.stop;
    $$('#stBody [data-stop]').forEach(x=>{const on=x.dataset.stop===stStop;x.classList.toggle('on',on);if(x.matches('button'))x.setAttribute('aria-pressed',on)});
    stSheet(false);
  });
  stDrag($('#stBody .st-grab'),$('#stBody .st-stops'));
  $$('#stBody .st-buy').forEach(b=>b.onclick=()=>{sfx('click');buyCard(+b.dataset.c)});
  $$('#stBody .st-pk').forEach(b=>b.onclick=()=>{sfx('click');buyPack(b.dataset.p,false)});
  const dl=$('#stDeal');if(dl)dl.onclick=()=>{sfx('click');buyPack(merchStock().deal.t,true)};
}
// A phone can pull the sheet down to see just the sky: the constellation spreads over the screen and the stars lose
// their names, for a clean screenshot. Tapping any star brings the sheet back on that stop.
let stDown=false;
function stSheet(down){
  const sc=$('#scr-store'),map=$('#stBody .st-map'),sheet=$('#stBody .st-stops');
  if(stDown===down||!map||!sheet)return;
  stDown=down;sc.classList.remove('st-bar');
  clearInterval(stSheet.c);if(down){stClock();stSheet.c=setInterval(stClock,1000)}
  clearTimeout(stSheet.t);
  // the map's height animates from where it was to where the new layout puts it
  const grow=()=>{
    const h0=map.offsetHeight;sc.classList.toggle('st-down',down);
    const h1=map.offsetHeight;map.style.height=h0+'px';void map.offsetHeight;
    map.style.transition='height .45s var(--ease)';map.style.height=h1+'px';
    stSheet.t=setTimeout(()=>{map.style.height=map.style.transition=''},480);
  };
  if(down){
    sc.scrollTop=0;sc.classList.add('st-moving');sheet.classList.add('out');
    stSheet.t=setTimeout(()=>{sheet.classList.remove('out');grow();setTimeout(()=>sc.classList.remove('st-moving'),480)},280);
  }else{
    sc.classList.add('st-moving');sheet.classList.add('out');grow();
    requestAnimationFrame(()=>requestAnimationFrame(()=>sheet.classList.remove('out')));
    setTimeout(()=>sc.classList.remove('st-moving'),480);
  }
}
// with the sheet down the top bar fades too; a tap on the sky brings it back (or hides it again)
document.addEventListener('click',e=>{
  const sc=e.target.closest('#scr-store');
  if(!sc||!stDown||e.target.closest('.st-star,.st-top,.st-grab'))return;
  sc.classList.toggle('st-bar');
});
// with the sheet down the countdown gives way to the phone's own date and time, like a lock screen
function stClock(){
  const now=new Date(),c=$('#stClock'),d=$('#stDate');if(!c||!d)return;
  // the hour and minutes big, AM or PM (where the phone uses them) small
  const t=new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).formatToParts(now)
    .map(p=>p.type==='dayPeriod'?`<small>${esc(p.value)}</small>`:p.type==='literal'&&/^\s+$/.test(p.value)?'':esc(p.value)).join('');
  if(c.innerHTML!==t)c.innerHTML=t;
  d.textContent=now.toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long'});
}
// the sheet's handle: drag it down (or tap it) to hide the sheet
function stDrag(h,sheet){
  if(!h)return;
  let y0=null,dy=0;
  h.onpointerdown=e=>{y0=e.clientY;dy=0;h.setPointerCapture(e.pointerId);sheet.style.transition='none'};
  h.onpointermove=e=>{if(y0==null)return;dy=Math.max(0,e.clientY-y0);sheet.style.transform=`translateY(${dy}px)`};
  // the click that follows a drag is ignored; a click from the keyboard (no drag) still hides the sheet
  const end=()=>{if(y0==null)return;y0=null;sheet.style.transition=sheet.style.transform='';if(dy>60){sfx('click');stSheet(true)}setTimeout(()=>dy=0)};
  h.onpointerup=end;h.onpointercancel=end;
  h.onclick=()=>{if(dy<6){sfx('click');stSheet(true)}};
}
function renderStoreTile(){
  const fresh=clockOk()&&(!SAVE.shop||SAVE.shop.at!==today());
  $('#storeSub').innerHTML=`${shd()}${fmtSh(SAVE.shards)}${fresh?' · new stock':''}`;
  $('#storeTile').classList.toggle('hot',fresh);
  $('#storeTile').setAttribute('aria-label',`Store. ${shardsTxt(SAVE.shards)}${fresh?', new stock today':''}`);
}
// the countdown, and new stock at midnight
setInterval(()=>{
  if($('#scr-menu').classList.contains('on'))renderStoreTile();
  if(!$('#scr-store').classList.contains('on'))return;
  if(SAVE.shop&&clockOk()&&SAVE.shop.at!==today()){renderStore();return}
  const w=$('#stWait');if(w)w.textContent=untilMidnight();
},30000);
