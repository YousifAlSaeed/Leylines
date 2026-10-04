'use strict';
/* =====================================================================
   DAILY  (the Daily tab on the Play card: Daily Duel, Daily Puzzle, Gauntlet)
   Everything comes from the game day (clock.js, the server's time), so
   every player gets the same challenges on the same day. Progress lives
   in SAVE.trial and resets at the game's midnight, like the daily pack.
   Until the server has told the time, the tab waits.
   ===================================================================== */
const DAILY_EPOCH=Date.UTC(2026,9,1); // challenge #1
// shards from the Daily tab don't count toward the daily limit on match shards (store.js)
const DAILY_REWARD={duel:{xp:100,pack:'spark',shards:50},puzzle:{pack:'spark',shards:30},
  // the Gauntlet's first run pays one tier per win; later runs only the shards, once a day
  gauntlet:[{shards:75},{pack:'spark'},{pack:'arcane'}]};
const CELL_NAME=['top left','top','top right','left','centre','right','bottom left','bottom','bottom right'];
const dayNo=()=>gameDayNo()-DAILY_EPOCH/864e5+1;
// one seed per challenge per day
const daySeed=(salt,n=dayNo())=>(Math.imul(n,0x9E3779B1)^Math.imul(salt,0x85EBCA6B))>>>0;
const pickOne=(a,rng)=>a[Math.floor(rng()*a.length)];
// one card per level band, no repeats; bands are [lo, hi] card levels
function bandHand(rng,bands){
  const ids=[];
  for(const[lo,hi] of bands)ids.push(pickOne(CARDS.filter(c=>c.lv>=lo&&c.lv<=hi&&!ids.includes(c.id)),rng).id);
  return ids;
}
// every rule off except Open; the turn timer is the player's own setting
const dailyRules=(on={},timer=SAVE.rules.timer)=>({open:true,same:false,sameWall:false,plus:false,combo:false,elemental:false,suddenDeath:false,random:false,chaos:false,timer,...on});

/* ---------- today's progress ---------- */
// duel: 1 once won, dt: tries; puz: 0 not tried, 1 missed, 2 solved;
// g: the Gauntlet {run: runs started, stage: wins this run, over: run ended, paid: today's shards claimed, live: in a match, deck}
function trial(){
  const t=SAVE.trial;
  if(t&&t.at>=today()&&t.g&&typeof t.g==='object'){
    // before 0.7.0 the once-a-day reward was XP
    if(t.g.xp){t.g.paid=1;delete t.g.xp}
    return t;
  }
  return SAVE.trial={at:today(),duel:0,dt:0,puz:0,g:{run:0,stage:0,over:0,paid:0,live:0,deck:null}};
}
// a Gauntlet match that was never finished (the app closed mid-game) counts as a loss
{const t=SAVE.trial;if(t&&t.g&&t.g.live){t.g.live=0;t.g.over=1;save()}}

// adds a reward and returns the chips the result screen shows
function dailyGive(r){
  const lv0=levelOf(SAVE.xp),packs=[];
  if(r.pack){SAVE.packs.push({t:r.pack,src:'daily'});packs.push(`${PACKS[r.pack].name} pack`)}
  if(r.shards)SAVE.shards+=r.shards;
  // XP can level you up, which brings that level's own pack
  if(r.xp){SAVE.xp+=r.xp;grantPacks(SAVE).forEach(k=>packs.push(`Level ${k.lv} pack`))}
  const lv=levelOf(SAVE.xp);
  return (r.xp?`<span class="pf-gain">+${r.xp} XP</span>`:'')+(r.shards?`<span class="pf-shard">${shd()}+${r.shards}</span>`:'')+(lv>lv0?`<span class="pf-up">Level ${lv}</span>`:'')+
    packs.map(t=>`<span class="pf-pack">🎁 ${t}</span>`).join('');
}
const aPack=t=>(/^[AEIOU]/.test(PACKS[t].name)?'an ':'a ')+PACKS[t].name+' pack';
const rewardText=r=>[r.pack&&PACKS[r.pack].name+' pack',r.xp&&r.xp+' XP',r.shards&&r.shards+' shards'].filter(Boolean).join(' + ');
const dailyBox=(chips,note='')=>`<div class="dly-res">${chips?`<div class="pf-reward">${chips}</div>`:''}${note?`<p>${note}</p>`:''}</div>`;

/* ---------- Daily Duel: everyone gets the same lent hands, rules and Challenger CPU ---------- */
// the CPU levels shown in briefings; Challenger and Boss are the Daily-only opponents in ai.js
const DIFF_NAME={easy:'Easy',normal:'Normal',hard:'Hard',challenger:'Challenger',boss:'Boss'};
function duelSetup(n=dayNo()){
  const rng=mulberry32(daySeed(1,n));
  // the day's 2 rules, then Sudden death on top so a draw replays instead of costing the try
  // (on days that drew Sudden death already, that's 1 other rule, as it always was)
  const on={};
  shuffle(['same','plus','elemental','chaos','suddenDeath'],rng).slice(0,2).forEach(k=>on[k]=true);
  on.suddenDeath=true;
  if((on.same||on.plus)&&rng()<.5)on.combo=true;
  if(on.same&&rng()<.35)on.sameWall=true;
  const bands=[[2,3],[3,4],[4,5],[5,6],[6,7]];
  return {rules:dailyRules(on),you:bandHand(rng,bands),cpu:bandHand(rng,bands),seed:daySeed(11,n)};
}
function startDuel(){
  const d=duelSetup(),t=trial();t.dt++;save();
  G=baseMatch('ai',{rules:d.rules,trade:'none',diff:'challenger',bo:1,names:['You','Challenger · Daily Duel'],seed:d.seed,daily:{kind:'duel',at:t.at}});
  G.decks=[d.you,d.cpu];startMatch();
}

/* ---------- Daily Puzzle: a position with exactly one move that meets the goal ---------- */
// flips: how many enemy cards turn blue (the placed card itself doesn't count)
const blues=s=>s.o.filter(o=>o===0).length;
function puzzleMoves(st,R){
  return genMoves(st).map(([hi,c])=>{const ch=cloneS(st);play(ch,R,hi,c,null);return{hi,c,flips:blues(ch)-blues(st)-1}});
}
function makePuzzle(n=dayNo()){
  const rng=mulberry32(daySeed(2,n));
  const on=pickOne([{},{same:true},{plus:true},{same:true,combo:true},{plus:true,combo:true},{same:true,plus:true,combo:true}],rng);
  const R=dailyRules(on,0),need=on.combo?3:2;
  for(let k=0;k<4000;k++){
    // 4 or 5 cards down and Blue to move: Blue has played half of them (rounded down)
    const filled=4+Math.floor(rng()*2),pb=Math.floor(filled/2),pr=filled-pb;
    const st=newState(bandHand(rng,Array(5-pb).fill([3,8])),bandHand(rng,Array(5-pr).fill([2,7])),0,Array(9).fill(null));
    const cells=shuffle([0,1,2,3,4,5,6,7,8],rng).slice(0,filled);
    for(const c of cells){st.b[c]=pickOne(CARDS.filter(x=>x.lv>=2&&x.lv<=8),rng).id;st.o[c]=rng()<.65?1:0}
    const mv=puzzleMoves(st,R),best=Math.max(...mv.map(m=>m.flips));
    if(best<need)continue;
    const win=mv.filter(m=>m.flips===best);
    if(win.length!==1)continue;
    return {R,st,goal:best,hi:win[0].hi,cell:win[0].c};
  }
  return null; // practically never: thousands of tries without a clean puzzle
}
function puzzleAnswer(p){return `${CARDS[p.st.h[0][p.hi]].name} on the ${CELL_NAME[p.cell]} square`}
function startPuzzle(){
  const p=makePuzzle(),t=trial();
  if(!p){toast('No puzzle today. Check back tomorrow.');return}
  G=baseMatch('ai',{rules:p.R,trade:'none',diff:'hard',bo:1,names:['You','Puzzle'],daily:{kind:'puzzle',at:t.at,p,before:blues(p.st)}});
  G.st=cloneS(p.st);G.first=0;G.ser={n:1,first:0,wins:[0,0],log:[]};G.sd=0;G.over=false;
  G.busy=true;show('game');buildBoard();renderGame();
  const g=G;
  banner(`Flip ${p.goal} in one move`,'small').then(()=>{if(G!==g)return;G.busy=false;nextTurn()});
}
// the one move is placed: the try is used up, even if the app closes during the animation
function dailyMoved(){
  if(!G.daily||G.daily.kind!=='puzzle'||G.daily.moved)return;
  G.daily.moved=true;const t=trial();if(t.at===G.daily.at&&!t.puz){t.puz=1;save()}
}
function puzzleDone(){
  const d=G.daily,p=d.p,flips=blues(G.st)-d.before-1,ok=flips>=p.goal,t=trial(),fresh=t.at===d.at;
  G.over=true;G.busy=true;renderHud();stopTurnTimer();
  let chips='';
  if(ok&&fresh&&t.puz!==2){t.puz=2;chips=dailyGive(DAILY_REWARD.puzzle);profCheck();save()}
  sfx(ok?'win':'lose');
  const g=G;
  setTimeout(()=>{if(G!==g)return;
    G.done=true;
    modal(`<div class="kick">Daily Puzzle #${dayNo()}</div><h2>${ok?'Solved!':'Not this time'}</h2>`+
      `<p>You flipped <b>${flips}</b> of the <b>${p.goal}</b> needed.</p>`+
      dailyBox(chips,ok?'':`The answer was ${esc(puzzleAnswer(p))}. A new puzzle comes at midnight.`),
      [{label:'Menu',cls:'primary',fn:leaveMatch}]);
  },900);
}

/* ---------- Gauntlet: your own deck against 3 CPUs, a rule more each time ---------- */
const GAUNT=[
  {diff:'normal',on:{},bands:[[1,2],[1,3],[2,3],[2,4],[3,4]]},
  {diff:'challenger',on:{same:true},bands:[[2,3],[3,4],[3,5],[4,5],[5,6]]},
  {diff:'boss',on:{same:true,plus:true,combo:true,open:false},bands:[[4,5],[5,6],[5,6],[6,7],[7,8]],boss:true}];
function gauntStage(i,n=dayNo()){
  const S=GAUNT[i],rng=mulberry32(daySeed(3+i,n)),hand=bandHand(rng,S.bands);
  // the opponent is named after its strongest card
  const top=hand.reduce((a,b)=>CARDS[b].lv>CARDS[a].lv?b:a);
  return {...S,rules:dailyRules(S.on),hand,seed:daySeed(13+i,n),name:CARDS[top].name,art:CARDS[top].art};
}
const gauntActive=g=>g.run>0&&!g.over&&g.stage<3;
// the run's deck, or ask for one if it's new (or a card in it was lost since)
function playGauntlet(){
  const t=trial(),g=t.g;
  if(gauntActive(g)&&g.deck&&!missingIn(g.deck,owned).length){startGauntStage();return}
  if(deckable(collPool())<5)ensureMinimum();
  // a new run only starts once a deck is chosen, so backing out doesn't use up the first run
  openDeck({title:'Gauntlet · choose 5',pool:collPool(),pre:preDeck(),color:'blue',loadouts:true,
    onDone:ids=>{const g2=trial().g;if(!gauntActive(g2)){g2.run++;g2.stage=0;g2.over=0}g2.deck=ids;SAVE.lastDeck=ids;save();startGauntStage()},onBack:()=>show('menu')});
}
function startGauntStage(){
  const t=trial(),g=t.g,S=gauntStage(g.stage);
  g.live=1;save();
  G=baseMatch('ai',{rules:S.rules,trade:'none',diff:S.diff,bo:1,names:['You',`${S.boss?'Boss':'CPU'} · ${S.name}`],seed:S.seed,
    daily:{kind:'gauntlet',at:t.at,stage:g.stage}});
  G.decks=[g.deck.slice(),S.hand];startMatch();
}

/* ---------- match hooks (match.js) ---------- */
// the end of a Daily Duel or Gauntlet match: rewards, and what the result screen's main button does
function dailyFinish(w){
  const d=G.daily,t=trial(),won=w===G.me;
  d.again=null;
  if(t.at!==d.at)return dailyBox('',"This challenge ended at midnight. Today's is ready on the Daily tab.");
  if(d.kind==='duel'){
    if(won&&!t.duel){t.duel=1;save();d.again={label:'Play again',fn:startDuel};return dailyBox(dailyGive(DAILY_REWARD.duel),'Daily Duel won. Come back tomorrow for a new one.')}
    d.again={label:won?'Play again':'Try again',fn:startDuel};
    return won?dailyBox('','Already won today, so no reward this time.'):t.duel?'':dailyBox('',`Try again: the ${rewardText(DAILY_REWARD.duel)} are still waiting for your first win.`);
  }
  const g=t.g;g.live=0;
  if(!won){
    g.over=1;save();d.again={label:'New run',fn:playGauntlet};
    return dailyBox('',g.paid?'Run over. New runs today give no more rewards, but you can keep playing.':`Run over. Start a new run to earn today's ${DAILY_REWARD.gauntlet[0].shards} shards.`);
  }
  g.stage++;
  let chips='';
  const first=g.run===1,tier=DAILY_REWARD.gauntlet[g.stage-1];
  if(first&&tier.pack)chips+=dailyGive({pack:tier.pack});
  if(tier.shards&&!g.paid){g.paid=1;chips+=dailyGive({shards:tier.shards})}
  if(g.stage>=3)g.over=1;
  save();
  if(g.stage<3){
    const nx=gauntStage(g.stage);
    d.again={label:nx.boss?'Face the boss':'Next opponent',fn:startGauntStage};
    return dailyBox(chips,`Next: ${esc(nx.name)}${nx.boss?' (boss)':''}. `+(first?`Win for ${aPack(DAILY_REWARD.gauntlet[g.stage].pack)}.`:''));
  }
  return dailyBox(chips,'Gauntlet cleared! A new one comes at midnight.');
}
// leaving a match early: a Gauntlet run ends there
function dailyLeave(){
  const d=G&&G.daily;if(!d||d.kind!=='gauntlet')return;
  const t=trial();if(t.at===d.at){t.g.live=0;t.g.over=1;save()}
}
// the chip in the game's rule bar
function dailyChip(){
  const d=G.daily;
  return `<span class="ser">${d.kind==='duel'?`Daily Duel #${dayNo()}`:d.kind==='puzzle'?`Puzzle · flip ${d.p.goal}`:`Gauntlet ${d.stage+1}/3`}</span>`;
}

/* ---------- the Daily tab on the Play card ---------- */
function dailyStatus(){
  const t=trial(),g=t.g,act=gauntActive(g);
  return {
    duel:t.duel?{done:true,txt:'Won'}:{txt:t.dt?`Try ${t.dt+1}`:'Spark pack'},
    puzzle:t.puz===2?{done:true,txt:'Solved'}:t.puz===1?{done:true,miss:true,txt:'Missed'}:{txt:'1 try'},
    gauntlet:g.run&&g.over&&g.stage>=3?{done:true,txt:'Cleared'}
      :act?{txt:`Stage ${g.stage+1} of 3`}
      :g.run?{done:!!g.paid,miss:!!g.paid,txt:g.paid?'Run over':'Retry for shards'}:{txt:'Shards + 2 packs'},
    // challenges that can still pay out today
    left:(t.duel?0:1)+(t.puz?0:1)+(!g.run||act&&(g.run===1||!g.paid)||g.over&&!g.paid?1:0)
  };
}
const dailyOpen=()=>clockOk()&&dailyStatus().left>0;
const DLY_ICON={
  duel:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2"/><path d="M9.5 6.5L13 3h3v3l-3.5 3.5M5 14l-2 2 2 2 2-2"/></svg>',
  puzzle:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16"/></svg>',
  gauntlet:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V9l7-5 7 5v11"/><path d="M9 20v-5h6v5M3 20h18"/></svg>'};
const DLY_NAME={duel:'Duel',puzzle:'Puzzle',gauntlet:'Gauntlet'};
function dailyPane(){
  if(!clockOk())return {h:'Daily',sub:'Checking the time with the server…',side:'',
    row:'<p class="hero-sub">The challenges show up once the game reaches the server.</p>'};
  const s=dailyStatus(),done=['duel','puzzle','gauntlet'].filter(k=>s[k].done).length;
  const btn=k=>`<button class="dly ${s[k].done?'done':''} ${s[k].miss?'miss':''}" id="dly-${k}" data-k="${k}">${DLY_ICON[k]}<b>${DLY_NAME[k]}</b><small>${s[k].done&&!s[k].miss?'✓ ':''}${s[k].txt}</small></button>`;
  return {h:`Daily <span class="dly-no">#${dayNo()}</span>`,sub:`${done} of 3 done · new in <span class="dly-wait">${untilMidnight()}</span>`,
    side:`<div class="dly-pips" aria-hidden="true">${['duel','puzzle','gauntlet'].map(k=>`<i class="${s[k].done?(s[k].miss?'miss':'on'):''}"></i>`).join('')}</div>`,
    row:`<div class="dly-row">${btn('duel')}${btn('puzzle')}${btn('gauntlet')}</div>`};
}
function bindDaily(){$$('#heroBody .hero-pane:not(.hero-ghost) .dly').forEach(b=>b.onclick=()=>{sfx('click');dailyBrief(b.dataset.k)})}

/* ---------- the briefing before each challenge ---------- */
const ruleChips=R=>`<div class="dly-rules">${RULES.filter(r=>R[r[0]]).map(r=>`<span title="${esc(r[2])}">${r[1]}</span>`).join('')||'<span>Basic rules</span>'}</div>`;
function dailyBrief(k){
  const t=trial(),n=dayNo();
  if(k==='duel'){
    const d=duelSetup();
    modal(`<div class="kick">Daily Duel #${n}</div><h2>${t.duel?'Won today':'Today\'s duel'}</h2>${ruleChips(d.rules)}
      <p class="dly-lab">Your lent hand</p>${rowHTML(d.you,'blue')}<p class="dly-lab">Challenger CPU</p>${rowHTML(d.cpu,'red')}
      <p class="dly-note">${t.duel?'You already won today. Play again for fun; there\'s no reward.':`First win: <b>${rewardText(DAILY_REWARD.duel)}</b>. Lose and you can try again, as often as you like.`} Same hands and rules for every player.</p>`,
      [{label:t.duel?'Play again':t.dt?'Try again':'Start',cls:'primary',fn:startDuel},{label:'Close',esc:true}]);
  }else if(k==='puzzle'){
    const body=t.puz===2?'<p>You solved today\'s puzzle. A new one comes at midnight.</p>'
      :t.puz===1?(p=>`<p>You missed today's puzzle.${p?` The answer was <b>${esc(puzzleAnswer(p))}</b>.`:''} A new one comes at midnight.</p>`)(makePuzzle())
      :`<p>A board in the middle of a game. Find the one move that flips enough red cards to meet the goal.</p>
        <p class="dly-note"><b>One try a day.</b> Once you place a card, that's your answer. Solve it for a <b>${rewardText(DAILY_REWARD.puzzle)}</b>.</p>`;
    modal(`<div class="kick">Daily Puzzle #${n}</div><h2>${t.puz===2?'Solved':t.puz===1?'Missed':'Today\'s puzzle'}</h2>${body}`,
      t.puz?[{label:'Close',cls:'primary',esc:true}]:[{label:'Start',cls:'primary',fn:startPuzzle},{label:'Close',esc:true}]);
  }else{
    const g=t.g,act=gauntActive(g),first=g.run===0||(g.run===1&&act);
    const st=[0,1,2].map(i=>{const S=gauntStage(i),r=DAILY_REWARD.gauntlet[i],state=act&&i<g.stage||g.over&&g.stage>i?'won':act&&i===g.stage?'now':'';
      return `<div class="dly-st ${state}"><span class="dly-art">${S.art}</span><div><b>${esc(S.name)}${S.boss?' <em>Boss</em>':''}</b><small>${DIFF_NAME[S.diff]} · ${RULES.filter(x=>S.rules[x[0]]).map(x=>x[1]).join(' + ')||'Basic'}${S.rules.open?'':' · hidden hand'}</small></div><span class="dly-rw">${state==='won'?'✓':rewardText(r)}</span></div>`}).join('');
    const note=first?'Your own deck, no cards traded. Each win on your <b>first run</b> pays its reward. A loss ends the run.'
      :g.paid?'Your first run is over, so new runs give no rewards today. Play for fun.':`Your first run is over. Win the first stage of a new run for today's <b>${DAILY_REWARD.gauntlet[0].shards} shards</b>; packs only come on the first run.`;
    const cleared=g.run&&g.over&&g.stage>=3;
    modal(`<div class="kick">Gauntlet #${n}</div><h2>${cleared?'Cleared today':act?`Stage ${g.stage+1} of 3`:'Today\'s gauntlet'}</h2><div class="dly-stages">${st}</div>
      <p class="dly-note">${note} Leaving a match, or closing the app during one, counts as a loss.</p>`,
      [{label:act?'Continue':g.run?'New run':'Choose deck',cls:'primary',fn:playGauntlet},{label:'Close',esc:true}]);
  }
}
// keeps the countdown on the Daily tab current, and rolls the tab over at midnight
setInterval(()=>{
  if(!$('#scr-menu').classList.contains('on'))return;
  const w=$$('#heroBody .dly-wait');if(!w.length)return;
  if(SAVE.trial&&SAVE.trial.at!==today()){renderHero();return}
  w.forEach(e=>e.textContent=untilMidnight());
},30000);
