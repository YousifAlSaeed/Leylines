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
// a win; a draw pays half. Online losses pay ONLINE_LOSS, CPU losses nothing. Leaving early and Couch pay nothing.
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
  // Expedition matches pay Embers instead (expedition.js)
  if(o.left||o.exp)return {sh:0,capped:false};
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
// A wide screen shows them side by side. A phone opens on just the sky; tapping a star brings up a carousel of the four
// stops to swipe through, and swiping past either end goes back to the sky.
const ST_STOPS=[['merchant','I','Merchant','Merchant'],['deal','II','Deal of the night','Deal'],['packs','III','Pack counter','Packs'],['well','IV','Shard well','Well']];
const ST_STAR='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1l2.2 8.8L23 12l-8.8 2.2L12 23l-2.2-8.8L1 12l8.8-2.2z"/></svg>';
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
      <div><dt>Solo win</dt><dd>${MATCH_SHARDS.easy} · ${MATCH_SHARDS.normal} · ${MATCH_SHARDS.hard}</dd></div>
      <div><dt>Online</dt><dd>Win ${MATCH_SHARDS.online} · Draw ${MATCH_SHARDS.online/2} · Loss ${ONLINE_LOSS}</dd></div>
      <div><dt>Daily tab</dt><dd>Duel ${DAILY_REWARD.duel.shards} · Puzzle ${DAILY_REWARD.puzzle.shards} · Gauntlet ${DAILY_REWARD.gauntlet[0].shards}</dd></div>
    </dl>
    <p class="st-note">Matches pay up to ${SHARD_CAP} shards a day, and the Daily tab pays on top. Every pack you open adds to the guarantee (${pityPts()}): the one that reaches ${PITY} ends with a 5★.</p>`;

  const sub={merchant:'Four cards, the same for every player. <b>For you</b> is one you haven\'t found yet, picked for you.',deal:'One pack at a discount. It sells once.',
    packs:'Opens the moment you buy.',well:'What you\'ve drawn from the ley today.'};
  const body={merchant:merch,deal,packs,well};
  $('#stBody').innerHTML=hero+map+`<div class="st-swipe"><div class="st-view"><div class="st-stops">${ST_STOPS.map(([k,n,name])=>
    `<section class="st-stop s-${k}${k===stStop?' on':''}" data-stop="${k}"><h3 class="st-sh">${ST_STAR}<span>${n} · ${name}</span><i></i></h3><p class="st-sub">${sub[k]}</p><div class="st-glass">${body[k]}</div></section>`).join('')}</div></div>
    <div class="st-dots" aria-hidden="true">${ST_STOPS.map(([k])=>`<i class="s-${k}${k===stStop?' on':''}" data-stop="${k}"></i>`).join('')}</div>
    <p class="st-hint">Swipe past either end to see the sky</p></div>`;

  // a star: from the sky it brings up the market on that stop; in the market it moves the carousel there
  $$('#stBody .st-star').forEach(b=>b.onclick=()=>{
    const i=ST_STOPS.findIndex(x=>x[0]===b.dataset.stop);
    if(!stDown&&i===stIdx())return;
    sfx('click');
    if(stDown){stGo(i,false);stSheet(false)}else stGo(i);
  });
  stSwipe();
  if(!stDown)stGo(stIdx(),false);
  $$('#stBody .st-buy').forEach(b=>b.onclick=()=>{sfx('click');buyCard(+b.dataset.c)});
  $$('#stBody .st-pk').forEach(b=>b.onclick=()=>{sfx('click');buyPack(b.dataset.p,false)});
  const dl=$('#stDeal');if(dl)dl.onclick=()=>{sfx('click');buyPack(merchStock().deal.t,true)};
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
  if(!sc||!stDown||!stPhone()||e.target.closest('.st-star,.st-top'))return;
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
    const sl=e.target.closest('.st-stop');
    if(sl&&!sl.classList.contains('on')){e.stopPropagation();e.preventDefault();stGo(ST_STOPS.findIndex(x=>x[0]===sl.dataset.stop))}
  },true);
}
// keep the carousel centred when the window changes size (a phone turning, for one)
addEventListener('resize',()=>{if($('#scr-store').classList.contains('on')&&!stDown)stGo(stIdx(),false)});
// the menu's Night Market tile, and the shards on the player card (account.js)
function renderStoreTile(){
  const fresh=clockOk()&&(!SAVE.shop||SAVE.shop.at!==today());
  const sub=!clockOk()?"Tonight's stock":fresh?'New stock tonight':`New stock in ${untilMidnight()}`;
  $('#storeSub').textContent=sub;
  $('#storeTile').classList.toggle('hot',fresh);
  $('#storeTile').setAttribute('aria-label',`Night Market. ${sub}`);
  const p=$('#pcShards');if(p)p.innerHTML=`${shd()}${fmtSh(SAVE.shards)}`;
}
// the countdown, and new stock at midnight
setInterval(()=>{
  if($('#scr-menu').classList.contains('on'))renderStoreTile();
  if(!$('#scr-store').classList.contains('on'))return;
  if(SAVE.shop&&clockOk()&&SAVE.shop.at!==today()){renderStore();return}
  const w=$('#stWait');if(w)w.textContent=untilMidnight();
},30000);
