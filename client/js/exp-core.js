'use strict';
/* =====================================================================
   EXPEDITION: the rules and data  (expedition.js draws it and runs it)
   A long run against the CPU with your own 5 cards. 3 acts, each a map
   of stops with a boss at the top. Forges, markets, events and relics
   change your cards for this run only. Lose 3 matches and the cards you
   brought are gone; go home at a Waystone (after act 1 or 2) to keep them.
   Nothing here touches the page, so the tests can load it.
   ===================================================================== */
const EXP_HEARTS=3;
// Embers: the run's own money. They vanish when the run ends
const EXP_EMBERS={fight:30,elite:45,boss:60,event:40};
// shards from going home or clearing, per game day (the run's cards and packs aren't limited)
const EXP_SHARD_CAP=400;
// [where you stop, shards, pack]
const EXP_REWARD=[{sh:60},{sh:150,pack:'arcane'},{sh:300,pack:'ley'}];
// a Ward keeps one card safe if the run is lost; its price in shards, by rarity
const WARD_PRICE=[40,80,150,300,600];
// every rule off unless an act or a boss turns it on (no turn timer: take your time)
const EXP_RULES={open:true,threeOpen:false,same:false,sameWall:false,plus:false,combo:false,elemental:false,reverse:false,suddenDeath:false,random:false,chaos:false,sweep:false,timer:0};
// bands: the card levels of the CPU's 5 cards. ai: the CPU level for a match, an elite and the boss
const EXP_ACTS=[
  {name:'The Thornwood',art:'🌲',rules:{open:true},ai:['normal','challenger','challenger'],
    bands:[[1,2],[1,3],[2,3],[2,3],[3,4]],elite:[[2,3],[3,4],[3,4],[4,5],[4,5]],bossBands:[[2,3],[3,4],[3,4],[4,4]],bosses:['rootking','tidecaller']},
  {name:'The Hall of Mirrors',art:'🏛️',rules:{open:true,same:true,plus:true},ai:['challenger','boss','boss'],
    bands:[[2,4],[3,4],[3,5],[4,5],[4,6]],elite:[[3,5],[4,5],[4,6],[5,6],[5,7]],bossBands:[[4,5],[5,6],[5,6],[6,7],[6,7]],bosses:['mirror','king']},
  {name:'The Ashen Peak',art:'🌋',rules:{open:false,same:true,plus:true,combo:true,elemental:true},ai:['boss','hard','hard'],
    bands:[[4,5],[4,6],[5,6],[5,7],[6,7]],elite:[[5,6],[5,7],[6,7],[6,8],[7,8]],bossBands:[[6,7],[6,7],[7,8],[7,8]],bosses:['dragon','storm']}
];
// each act picks 1 of its 2 bosses at random. card: the boss plays that card too (and you can win it)
const EXP_BOSS={
  rootking:{name:'The Rootking',art:'🌳',card:19,trick:'Roots',icon:'🌿',
    text:'2 squares have roots. A card on a root can never be flipped, by anyone.',
    tip:'Put a strong card on a root early. He wants the roots too.'},
  tidecaller:{name:'The Tidecaller',art:'🧜',card:31,trick:'High tide',icon:'🌊',
    text:'After the 3rd and 6th card, the water rises a row from the bottom. Cards under water get −1, and so do cards played there later.',
    tip:'Fill the bottom row early with cards that can spare a point.'},
  mirror:{name:'The Mirror Mask',art:'🎭',trick:'Mirror',icon:'🪞',
    text:'She plays a copy of your own 5 cards, with every upgrade. Your relics and scrolls are yours alone.',
    tip:'You know her whole hand. Spend on relics and scrolls, not only on +2s.'},
  king:{name:'King Oryn',art:'👑',trick:'Royal decree',icon:'📜',
    text:'After every 2nd card the King changes a rule. You see the next decree before it comes.',
    tip:'Read the next decree and play for the rules that are coming.'},
  dragon:{name:'The Ashen Dragon',art:'🐲',card:49,trick:'Dragonfire',icon:'🔥',
    text:'After his 2nd and 4th card he breathes fire on the glowing row. Your cards there get −1 for the rest of the match. His don\'t burn.',
    tip:'Keep the glowing row empty, or put a card there you don\'t mind burning.'},
  storm:{name:'Stormbringer',art:'⛈️',card:41,trick:'Lightning',icon:'⚡',
    text:'After the 4th and 8th card, lightning hits the glowing square. The card there changes sides.',
    tip:'Leave his card on the glowing square, never yours.'}
};
// King Oryn's decrees: each turns a rule on, or off if it's on already
const DECREES=['reverse','combo','sameWall','plus','same'];

/* ---------- relics: last the whole run. t: 1 common, 2 uncommon, 3 rare, 5 boss (c: the catch) ---------- */
const RELICS={
  cornerstone:{n:'Cornerstone',i:'🧱',t:1,d:'Your cards in corners get +1 on every side.'},
  goldtooth:{n:'Gold Tooth',i:'🦷',t:1,d:'+10 Embers every win.'},
  spyglass:{n:'Spyglass',i:'🔭',t:1,d:'When their hand is hidden (Act 3, the Fog), see 2 of their cards.'},
  satchel:{n:'Satchel',i:'👝',t:1,d:'Carry 3 scrolls instead of 2.'},
  whetstone:{n:'Whetstone',i:'🪨',t:1,d:'Every Forge visit gives 2 upgrades, not 1.'},
  firstlight:{n:'First Light',i:'🌅',t:2,d:'Your first card each match gets +1 on every side.'},
  tiebreaker:{n:'Tiebreaker',i:'⚖️',t:2,d:'Ties go your way: play a 5 against their 5 and you flip it.'},
  keystone:{n:'Keystone',i:'🗝️',t:2,d:'Your card in the middle square gets +2 on every side.'},
  lens:{n:'Prism Lens',i:'🔮',t:2,d:'Elemental squares always match your card, so never a −1.'},
  haggler:{n:'Haggler\'s Ring',i:'💍',t:2,d:'Market prices are 25% lower.'},
  spring:{n:'Spring Water',i:'⛲',t:2,d:'Camps give back 2 hearts instead of 1.'},
  echo:{n:'Echo Chime',i:'🔔',t:3,d:'Combo works for you, even when the rule is off.'},
  phoenix:{n:'Phoenix Feather',i:'🪶',t:3,d:'Lose your last heart? Come back with 1. Once.'},
  hourglass:{n:'Hourglass',i:'⏳',t:3,d:'You choose who goes first.'},
  anchor:{n:'Anchor',i:'⚓',t:3,d:'Your first card each match can never be flipped.'},
  pockets:{n:'Deep Pockets',i:'🎒',t:3,d:'Beat a boss and take 2 of its cards, not 1.'},
  crown:{n:'Crown of Thorns',i:'👑',t:5,d:'All your cards get +1 on every side.',c:'1 heart fewer for the rest of the run.'},
  pact:{n:'Underdog\'s Pact',i:'🤝',t:5,d:'Your 1★ and 2★ cards get +2 on every side.',c:'Your 4★ and 5★ cards get −1 on every side.'},
  eclipse:{n:'Eclipse Stone',i:'🌑',t:5,d:'Reverse is on in every match: lower numbers win. +20 Embers a win.',c:'Your upgrades now make cards weaker.'},
  molten:{n:'Molten Core',i:'🌋',t:5,d:'Your first card each match gets +3 on every side.',c:'Every card\'s highest side gets −1.'},
  lantern:{n:'Black Lantern',i:'🏮',t:5,d:'Always see their whole hand.',c:'Camps can\'t heal you.'},
  coin:{n:'Cursed Coin',i:'🪙',t:5,d:'Double Embers from every win.',c:'Markets sell no relics.'},
  engine:{n:'Ley Engine',i:'⚙️',t:5,d:'Forges give +2 for free.',c:'Markets can\'t upgrade cards.'},
  prism:{n:'Prism Heart',i:'💠',t:5,d:'Elemental is on in every match, and a card with an element always matches.',c:'A card with no element gets −2 on those squares.'}
};
const RELIC_PRICE={1:90,2:120,3:160};
// scrolls: used once, during a match on your turn (target: pick a card on the board). Lucky Charm works by itself
const SCROLLS={
  bulwark:{n:'Bulwark',i:'🛡️',p:35,target:'mine',d:'Pick one of your cards on the board. It can\'t be flipped.'},
  hex:{n:'Hex',i:'🌀',p:35,target:'theirs',d:'Pick one of their cards on the board. It gets −2 on every side.'},
  empower:{n:'Empower',i:'⚡',p:40,d:'The next card you play gets +2 on every side.'},
  peek:{n:'Peek',i:'👁️',p:20,d:'When their hand is hidden, see all of it for this match.'},
  lucky:{n:'Lucky Charm',i:'🍀',p:60,passive:true,d:'Lose a match while you carry it and you play again, no heart lost.'}
};
// the Market's card work (lasts the run)
const WORK={
  up1:{n:'+1 to a side',i:'⬆️',p:25,d:'Any card, any side.'},
  up2:{n:'+2 to a side',i:'⏫',p:60,d:'Any card, any side.'},
  polish:{n:'Polish',i:'✨',p:70,d:'+1 on every side of a 1★ or 2★ card.'},
  turn:{n:'Turn',i:'🔄',p:30,d:'A card\'s numbers move one side round.'},
  shift:{n:'Shift',i:'↔️',p:20,d:'Move 1 point from one side of a card to another.'},
  element:{n:'Element stone',i:'💎',p:40,d:'Give a card an element.'}
};
const HIRE_PRICE=[40,60,90,130,180];
const EXP_PRICE={heart:50,reroll:15,forge2:40};
// map stops
const STOP={fight:{n:'Match',i:'⚔️'},elite:{n:'Elite',i:'💀'},forge:{n:'Forge',i:'⚒️'},market:{n:'Market',i:'🛒'},
  camp:{n:'Camp',i:'🔥'},event:{n:'Event',i:'❔'},chest:{n:'Chest',i:'🎁'},boss:{n:'Boss',i:'👑'}};
const EVENTS=['toll','smith','well','gambler','pool','traveller','ghost','fog','altar'];

/* ---------- a map: rows from the bottom, the boss on top ---------- */
// every path has 2 matches before the boss (row 0, and a match or an elite in row 2)
function expMap(rng){
  const pick=a=>a[Math.floor(rng()*a.length)];
  const rows=[
    ['fight','fight','fight'],
    shuffle(['forge','event','market','chest'],rng).slice(0,3),
    shuffle(['fight','fight','elite'],rng),
    shuffle(['event','market','forge','chest','camp'],rng).slice(0,3),
    shuffle(['camp',pick(['market','forge'])],rng),
    ['boss']
  ].map(r=>r.map(t=>({t,to:[]})));
  for(let r=0;r<rows.length-1;r++){
    const a=rows[r],b=rows[r+1];
    if(b.length===1){a.forEach(n=>n.to=[0]);continue}
    if(a.length===b.length){
      a.forEach((n,i)=>n.to=[i]);
      // a few cross paths, never two that cross each other
      for(let i=0;i<a.length-1;i++){const x=rng();if(x<.35)a[i].to.push(i+1);else if(x<.7)a[i+1].to.push(i)}
    }else{
      a[0].to=[0];a[2].to=[1];a[1].to=rng()<.5?[0]:rng()<.5?[1]:[0,1];
    }
    a.forEach(n=>n.to.sort());
  }
  return rows;
}
// the stops you can go to next: the first row at the start, then the ones your stop leads to
function expNext(map,pos){
  if(!pos)return map[0].map((_,i)=>[0,i]);
  const r=pos[0];if(r>=map.length-1)return [];
  return map[r][pos[1]].to.map(i=>[r+1,i]);
}
// a CPU hand: one card per level band, no repeats (and none of `skip`)
function expHand(rng,bands,skip=[]){
  const ids=[];
  for(const[lo,hi] of bands){
    const pool=CARDS.filter(c=>c.lv>=lo&&c.lv<=hi&&!ids.includes(c.id)&&!skip.includes(c.id));
    ids.push(pool[Math.floor(rng()*pool.length)].id);
  }
  return ids;
}

/* ---------- your cards on the road ---------- */
// a bag entry: {b: the card, u: change on each side, r: turns (each moves the numbers one side round), e: an element it was given,
// k: 'own' (brought, goes home) | 'spoil' (won, goes home) | 'hire' | 'twin' (this run only), x: 1 once it's gone from the bag}
const hasRelic=(run,k)=>run.relics.includes(k);
function expSides(run,ent){
  const C=CARDS[ent.b];let s=C.s.slice();
  for(let k=0;k<(ent.r||0)%4;k++)s=[s[3],s[0],s[1],s[2]];
  const base=s.slice();
  s=s.map((v,i)=>v+(ent.u?ent.u[i]:0));
  if(hasRelic(run,'crown'))s=s.map(v=>v+1);
  if(hasRelic(run,'pact'))s=s.map(v=>v+(C.rar<=2?2:C.rar>=4?-1:0));
  if(hasRelic(run,'molten')){const m=s.indexOf(Math.max(...s));s[m]--}
  s=s.map(v=>Math.max(1,Math.min(10,v)));
  return {s,d:s.map((v,i)=>v-base[i])};
}
// fills RUNC (data.js) with the run's cards, so matches and the card drawing can use them
function expCards(run){
  for(const k in RUNC)delete RUNC[k];
  if(!run)return;
  run.bag.forEach((ent,i)=>{
    const C=CARDS[ent.b],{s,d}=expSides(run,ent),id=RUN_ID+i;
    RUNC[id]={id,b:ent.b,name:C.name,art:C.art,lv:C.lv,rar:C.rar,s,d,e:ent.e||C.e,sum:s.reduce((a,v)=>a+v,0)};
  });
}
const baseId=id=>id>=RUN_ID&&RUNC[id]?RUNC[id].b:id;
const bagLive=run=>run.bag.map((e,i)=>i).filter(i=>!run.bag[i].x);
// your relics as the engine's bonuses (engine.js placeMod)
function expBon(run){
  const B={},h=k=>hasRelic(run,k);
  if(h('cornerstone'))B.corner=1;
  if(h('keystone'))B.mid=2;
  B.first=(h('firstlight')?1:0)+(h('molten')?3:0);
  if(h('lens'))B.lens=1;else if(h('prism'))B.heart=1;
  if(h('tiebreaker'))B.tie=1;
  if(h('echo'))B.combo=1;
  if(h('anchor'))B.anchor=1;
  return B;
}
const maxHearts=run=>EXP_HEARTS-(hasRelic(run,'crown')?1:0);
const scrollSlots=run=>hasRelic(run,'satchel')?3:2;
// Embers for a win of this kind
function winEmbers(run,kind,fog){
  let n=EXP_EMBERS[kind]||EXP_EMBERS.fight;
  if(hasRelic(run,'goldtooth'))n+=10;
  if(hasRelic(run,'eclipse'))n+=20;
  if(hasRelic(run,'coin'))n*=2;
  if(fog)n*=2;
  return n;
}
const priceOf=(run,p)=>hasRelic(run,'haggler')?Math.round(p*.75):p;
// a relic of tier t (or below, when every one of t is taken) you don't have yet
function relicOf(run,rng,t){
  for(let k=t;k>=1;k--){const pool=Object.keys(RELICS).filter(id=>RELICS[id].t===k&&!hasRelic(run,id));if(pool.length)return pool[Math.floor(rng()*pool.length)]}
  return null;
}
// a random relic tier: 60% common, 30% uncommon, 10% rare (better ones from elites)
const relicTier=(rng,elite)=>{const x=rng();return elite?(x<.6?2:3):x<.6?1:x<.9?2:3};
