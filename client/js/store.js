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

/* ---------- the Store screen and the menu tile ---------- */
function openStore(){renderStore();show('store');$('#scr-store').scrollTop=0}
function renderStore(){
  $('#stBal').innerHTML=`${shd()}<b>${fmtSh(SAVE.shards)}</b>`;
  $('#stBal').setAttribute('aria-label',`You have ${shardsTxt(SAVE.shards)}`);
  const price=p=>`<span class="st-price${SAVE.shards<p?' short':''}">${shd()}${fmtSh(p)}<span class="sr"> shards</span></span>`;

  let merch;
  if(!clockOk())merch=`<section class="pk-card st-merch"><h3>Wandering Merchant</h3><p class="st-note">Checking the time with the server…</p></section>`;
  else{
    const s=shopDay(),st=merchStock(),d=st.deal,T=PACKS[d.t];
    merch=`<section class="pk-card st-merch"><h3>Wandering Merchant <em>New stock in <b id="stWait">${untilMidnight()}</b></em></h3>
      <div class="st-grid">${st.cards.map((it,i)=>{const sold=s.got[i]!=null,c=CARDS[it.id];
        return `<div class="st-slot${sold?' sold':''}">${it.mine?'<span class="st-tag">For you</span>':''}${cardHTML(it.id,'blue')}
          <button class="btn small st-buy" data-c="${i}" ${sold?'disabled':''} aria-label="${sold?`${esc(c.name)}, sold`:`Buy ${esc(c.name)}, ${rarName(c.rar)}, for ${shardsTxt(it.price)}`}">${sold?'Sold':price(it.price)}</button></div>`}).join('')}</div>
      <button class="st-deal${s.got.deal?' sold':''}" id="stDeal" ${s.got.deal?'disabled':''}>${miniPack(d.t,s.got.deal?'spent':'ready')}
        <span class="st-dt"><b>${T.name} pack</b><small>${s.got.deal?'Sold':`${T.n} cards · ${DEAL_OFF*100}% off today`}</small></span>
        ${s.got.deal?'':`<span class="st-was">${fmtSh(PACK_PRICE[d.t])}</span>${price(d.price)}`}</button>
      <p class="st-note">Every player gets the same stock today. <b>For you</b> is a card you haven't found yet, picked for you. Each item sells once.</p></section>`;
  }

  const s=clockOk()?shopDay():null,mythLeft=s?Math.max(0,MYTHIC_WEEK-s.myth):null;
  const counter=`<section class="pk-card"><h3>Pack Counter <em>Opens right away</em></h3><div class="st-packs">${Object.entries(PACKS).map(([t,T])=>{
      const out=t==='mythic'&&mythLeft===0;
      return `<button class="st-pk t-${t}${out?' sold':''}" data-p="${t}" ${out?'disabled':''}>${miniPack(t,out?'spent':'ready')}
        <span class="st-dt"><b>${T.name}</b><small>${T.n} cards${T.min>1?` · ${T.min}★+ last`:''}${t==='mythic'?` · ${out?'next on Monday':'1 a week'}`:''}</small></span>${out?'':price(PACK_PRICE[t])}</button>`}).join('')}</div>
    <div class="st-pity">${pityHTML()}</div><p class="st-note">Odds are on the Packs screen.</p></section>`;

  const d=shardDay(),pct=Math.min(100,d.n/SHARD_CAP*100);
  const earn=`<section class="pk-card st-earn"><h3>Earning shards <em>${fmtSh(d.n)} / ${SHARD_CAP} from matches today</em></h3>
    <div class="st-bar${d.n>=SHARD_CAP?' full':''}" role="progressbar" aria-label="Shards from matches today" aria-valuemin="0" aria-valuemax="${SHARD_CAP}" aria-valuenow="${d.n}"><i style="width:${pct.toFixed(1)}%"></i></div>
    <dl class="st-rates">
      <div><dt>Win vs Computer</dt><dd>Easy ${MATCH_SHARDS.easy} · Normal ${MATCH_SHARDS.normal} · Hard ${MATCH_SHARDS.hard}</dd></div>
      <div><dt>Online</dt><dd>Win ${MATCH_SHARDS.online} · Draw ${MATCH_SHARDS.online/2} · Loss ${ONLINE_LOSS}</dd></div>
      <div><dt>Daily tab</dt><dd>Duel ${DAILY_REWARD.duel.shards} · Puzzle ${DAILY_REWARD.puzzle.shards} · Gauntlet ${DAILY_REWARD.gauntlet[0].shards}</dd></div>
    </dl>
    <p class="st-note">Matches pay up to ${SHARD_CAP} shards a day, and a draw pays half a win. The Daily tab pays on top of that. The limit resets at midnight with the dailies. Same screen, and leaving a match early, pay nothing.</p></section>`;

  $('#stBody').innerHTML=merch+counter+earn;
  $$('#stBody .st-buy').forEach(b=>b.onclick=()=>{sfx('click');buyCard(+b.dataset.c)});
  $$('#stBody .st-pk').forEach(b=>b.onclick=()=>{sfx('click');buyPack(b.dataset.p,false)});
  const dl=$('#stDeal');if(dl)dl.onclick=()=>{sfx('click');buyPack(merchStock().deal.t,true)};
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
