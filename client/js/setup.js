'use strict';
/* =====================================================================
   SETUP
   ===================================================================== */
let setupMode='ai';
function openSetup(mode){
  setupMode=mode;
  $('#setupTitle').textContent={ai:'vs Computer',local:'Same screen',online:'Host an online game'}[mode];
  $('#diffBox').classList.toggle('hidden',mode!=='ai');
  $('#tradeBox').classList.toggle('hidden',mode==='local');
  $('#setupGo').textContent=mode==='online'?'Create game':SAVE.rules.random?'Start match':'Choose cards';
  $('#setupNote').innerHTML=mode==='local'
    ?'Free play: each player picks any 5 cards from the full set. No cards are traded.'
    :mode==='ai'?''
    :'You will get a 5-letter code and an invite link to send to a friend.';
  setupLast=null;renderSetup();show('setup');
}
function refocus(host,old){const a=document.activeElement;if(!a||a===document.body||!a.isConnected){const n=$(`${host} [data-k="${old.dataset.k}"]`);n&&n.focus()}}
const RULE_ICON={
  open:'<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  same:'<path d="M5 9h14M5 15h14"/>',
  sameWall:'<path d="M4 4v16"/><path d="M9 9h11M9 15h11"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  combo:'<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  elemental:'<path d="M12 3c1 4 5 5.5 5 10a5 5 0 01-10 0c0-2.5 1.5-4 2.5-5 .3 1.6 1 2.5 2 3 .4-3-.5-5.5.5-8z"/>',
  suddenDeath:'<path d="M20 12a8 8 0 11-2.3-5.7"/><path d="M20 4v4h-4"/><path d="M12.5 8.5l-2 4h3l-2 4"/>',
  random:'<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.2" fill="currentColor"/><circle cx="15" cy="15" r="1.2" fill="currentColor"/><circle cx="15" cy="9" r="1.2" fill="currentColor"/><circle cx="9" cy="15" r="1.2" fill="currentColor"/>',
  timer:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M10 2h4"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'};
const ruleSvg=k=>`<svg viewBox="0 0 24 24" aria-hidden="true">${RULE_ICON[k]}</svg>`;
const DIFF_INFO={easy:[1,'1★ Common cards'],normal:[2,'1–2★ cards'],hard:[3,'2–3★ cards, plans ahead']};
const TRADE_MARK={none:'0',one:'1',diff:'±',all:'5',sweep:'9'};
let setupLast=null; // the rule card tapped last, explained in the box under the cards
const ruleCountText=()=>`${RULES.filter(r=>SAVE.rules[r[0]]).length+(SAVE.rules.timer?1:0)} on`;
function timerInfo(){const t=SAVE.rules.timer;return`${ruleSvg('timer')}<div><b>Turn timer · ${t?t+' seconds':'off'}</b><span>${timerDesc(t)}</span></div>`}
// slider positions: 0 = off, 1..17 = 10..90 seconds
function renderTimerRow(){
  const row=$('#timerRow'),t=SAVE.rules.timer;
  if(!row.firstChild){
    row.innerHTML=`${ruleSvg('timer')}<b id="timerName">Turn timer</b><output id="timerOut" for="timerSl"></output>`+
      `<input type="range" class="rng" id="timerSl" min="0" max="${TIMER_MAX/5-1}" step="1" aria-labelledby="timerName">`+
      `<div class="ticks" aria-hidden="true">${[0,30,50,70,90].map(n=>`<span style="--p:${(n?n/5-1:0)/(TIMER_MAX/5-1)}">${n||'Off'}</span>`).join('')}</div>`;
    const sl=$('#timerSl');
    sl.oninput=()=>{const v=+sl.value,n=v?(v+1)*5:0;if(n===SAVE.rules.timer)return;SAVE.rules.timer=n;save();setupLast='timer';sfx('click');
      renderTimerRow();$('#ruleInfo').innerHTML=timerInfo()};
  }
  const sl=$('#timerSl'),pos=t?t/5-1:0;
  sl.value=pos;sl.style.setProperty('--f',(pos/(+sl.max)*100)+'%');
  sl.setAttribute('aria-valuetext',t?t+' seconds per turn':'Off, no time limit');
  $('#timerOut').textContent=t?t+' s':'Off';
  row.classList.toggle('off',!t);
  $('#ruleCount').textContent=ruleCountText();
}
function renderSetup(flipKey){
  $('#diffSeg').innerHTML=DIFFS.map(([k,l])=>{const[n,sub]=DIFF_INFO[k];
    return`<button class="dc ${SAVE.diff===k?'on':''}" data-k="${k}" aria-pressed="${SAVE.diff===k}"><span class="pips" aria-hidden="true">${[1,2,3].map(i=>`<i class="${i<=n?'f':''}"></i>`).join('')}</span><b>${l}</b><small>${sub}</small></button>`}).join('');
  $$('#diffSeg button').forEach(b=>b.onclick=()=>{SAVE.diff=b.dataset.k;save();sfx('click');renderSetup();refocus('#diffSeg',b)});
  const R=SAVE.rules;
  $('#ruleChips').innerHTML=RULES.map(([k,l])=>{
    const dim=(k==='sameWall'&&!R.same)||(k==='combo'&&!R.same&&!R.plus);
    return`<button class="rc ${R[k]?'on':''} ${dim?'dim':''} ${flipKey===k?'flip':''}" data-k="${k}" role="switch" aria-checked="${!!R[k]}" aria-label="${l}: ${RULE_SHORT[k]}"><span class="em">${ruleSvg(k)}</span><b>${l}</b></button>`}).join('');
  $$('#ruleChips .rc').forEach(b=>b.onclick=()=>{const k=b.dataset.k;R[k]=!R[k];if(k==='sameWall'&&R.sameWall)R.same=true;setupLast=k;save();sfx('flip');renderSetup(k);refocus('#ruleChips',b)});
  renderTimerRow();
  const lr=RULES.find(r=>r[0]===setupLast);
  $('#ruleInfo').innerHTML=setupLast==='timer'?timerInfo():lr?`${ruleSvg(lr[0])}<div><b>${lr[1]} · ${R[lr[0]]?'on':'off'}</b><span>${lr[2]}</span></div>`
    :`${ruleSvg('info')}<div><b>Tap a rule card</b><span>Violet cards are on. Tap one to turn it on or off and see what it does.</span></div>`;
  $('#tradeSeg').innerHTML=TRADES.map(([k,l])=>`<button class="tc ${SAVE.trade===k?'on':''}" data-k="${k}" aria-pressed="${SAVE.trade===k}"><span class="n" aria-hidden="true">${TRADE_MARK[k]}</span><small>${l}</small></button>`).join('');
  $$('#tradeSeg button').forEach(b=>b.onclick=()=>{SAVE.trade=b.dataset.k;save();sfx('click');renderSetup();refocus('#tradeSeg',b)});
  const tr=TRADES.find(t=>t[0]===SAVE.trade);
  $('#tradeDesc').textContent=tr[2];
  const bo=boOf(SAVE.bo);
  $('#seriesSeg').innerHTML=SERIES.map(([n,l])=>`<button class="tc ${bo===n?'on':''}" data-k="${n}" aria-pressed="${bo===n}"><span class="n" aria-hidden="true">${n}</span><small>${l}</small></button>`).join('');
  $$('#seriesSeg button').forEach(b=>b.onclick=()=>{SAVE.bo=+b.dataset.k;save();sfx('click');renderSetup();refocus('#seriesSeg',b)});
  $('#seriesDesc').textContent=SERIES.find(s=>s[0]===bo)[2]+(bo>1&&setupMode!=='local'&&SAVE.trade!=='none'?' Cards are traded once, at the end.':'');
  if(setupMode!=='online')$('#setupGo').textContent=R.random?'Start match':'Choose cards';
}
$('#setupGo').onclick=()=>{
  sfx('click');
  if(setupMode==='ai')startAI();
  else if(setupMode==='local')startLocal();
  else hostStart();
};
