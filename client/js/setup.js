'use strict';
/* =====================================================================
   SETUP
   ===================================================================== */
// 'ai', 'local', or 'room': the online waiting room, where the host sets the rules and the guest sees them
let setupMode='ai';
const inRoom=()=>setupMode==='room';
const roomGuest=()=>inRoom()&&NET.role==='guest';
const roomOpen=()=>inRoom()&&$('#scr-setup').classList.contains('on');
// the settings on show: your own, or the host's when you're the guest in the room
const SR=()=>roomGuest()&&NET.room?NET.room:{rules:SAVE.rules,trade:inRoom()?roomTrade():SAVE.trade,bo:boOf(SAVE.bo)};
// no cards are bet online while a guest is in the room (online.js)
const tradeLocked=()=>inRoom()&&guestIn();
function openSetup(mode){
  setupMode=mode;
  $('#setupTitle').textContent={ai:'Solo',local:'Couch',room:'Waiting room'}[mode];
  $('#diffBox').classList.toggle('hidden',mode!=='ai');
  $('#tradeBox').classList.toggle('hidden',mode==='local');
  $('#roomBox').classList.toggle('hidden',mode!=='room');
  $('#scr-setup').classList.toggle('ro',roomGuest());
  $('#setupGo').disabled=false;
  $('#setupNote').innerHTML=mode==='local'?'Free play: each player picks 5 cards from every card this account has found, even ones you lost. The same card can be picked more than once. No cards are traded.':'';
  setupLast=null;setupOpen=null;renderSetup();show('setup');
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
  chaos:'<path d="M3 7h3c4.5 0 7.5 10 12 10h3"/><path d="M3 17h3c4.5 0 7.5-10 12-10h3"/><path d="M18 4l3 3-3 3M18 14l3 3-3 3"/>',
  threeOpen:'<rect x="2.5" y="6" width="5.5" height="12" rx="1.2"/><rect x="9.25" y="6" width="5.5" height="12" rx="1.2"/><rect x="16" y="6" width="5.5" height="12" rx="1.2"/><circle cx="5.25" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="18.75" cy="12" r="1" fill="currentColor"/>',
  reverse:'<path d="M7 20V5M3.5 8.5L7 5l3.5 3.5"/><path d="M17 4v15M13.5 15.5L17 19l3.5-3.5"/>',
  sweep:'<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M3.5 9.2h17M3.5 14.8h17M9.2 3.5v17M14.8 3.5v17"/>',
  timer:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M10 2h4"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'};
const ruleSvg=k=>`<svg viewBox="0 0 24 24" aria-hidden="true">${RULE_ICON[k]}</svg>`;
const DIFF_INFO={easy:[1,'1★ Common cards'],normal:[2,'1–2★ cards'],hard:[3,'2–3★ cards, plans ahead']};
// the trade rule in plain words, for the setup screen
const STAKE={none:'Nothing',one:'1 card',diff:'Diff',all:'All 5'};
const seriesName=n=>n===1?'1 match':'Best of '+n;
// Sweep needs cards to change hands: off in Couch, and with trade None (or a guest in the online room)
const sweepBlock=()=>setupMode==='local'?'Couch games never trade cards, so Sweep is off.':tradeLocked()?'Card bets are off, so Sweep is off.'
  :SR().trade==='none'?(roomGuest()?'The trade rule is None, so Sweep is off.':'Pick a trade rule below (not None) to use Sweep.'):'';
let setupLast=null; // the rule card tapped last, explained in the box under the cards
// Solo keeps its own timer (off by default); Couch and the room use the rules' one.
// The per-turn seconds are SAVE.cpuTimer / rules.timer; the type, bank and out-of-time rule are SAVE.cpuTk / the rules
const setupTimer=()=>setupMode==='ai'?SAVE.cpuTimer:SR().rules.timer;
const setupTk=()=>setupMode==='ai'?SAVE.cpuTk:SR().rules;
const setupBank=()=>setupTk().tkind==='bank';
const ruleCountText=()=>{const R=SR().rules;return`${rulesOn(R,setupMode==='local'?'none':SR().trade).length} on`};
const TKINDS=[['off','Off'],['turn','Per turn'],['bank','Bank']];
const FLAGS=[['random','Random card'],['lose','You lose']];
// what the timer is set to: 'off', 'turn' or 'bank'
const setupTkind=()=>setupBank()?(setupTk().bank?'bank':'off'):setupTimer()?'turn':'off';
const setTurnSec=n=>{if(setupMode==='ai')SAVE.cpuTimer=n;else SAVE.rules.timer=n};
// the slider: per turn 10 to 90 seconds in 5s, a bank 1:00 to 5:00 in 30s
const T_RANGE={turn:[10,TIMER_MAX,5,[10,30,50,70,90],v=>v],bank:[60,BANK_MAX,30,[60,120,180,240,300],v=>fmtLeft(v)]};
function timerVal(){const k=setupTkind();return k==='off'?'Off':k==='turn'?setupTimer()+'s a turn':fmtLeft(setupTk().bank)+' each'}
function renderTimerRow(){
  const ro=roomGuest(),tk=setupTk(),kind=setupTkind(),lock=ro?' aria-disabled="true"':'';
  $('#tkindSeg').innerHTML=TKINDS.map(([k,l])=>`<button class="tc ${kind===k?'on':''}" data-k="${k}" aria-pressed="${kind===k}"${lock}><span class="k">${l}</span></button>`).join('');
  $$('#tkindSeg button').forEach(b=>b.onclick=()=>{const k=b.dataset.k;if(ro||k===setupTkind())return;
    // picking a type that was off turns it on at its usual time
    if(k==='off'){tk.tkind='turn';setTurnSec(0)}
    else if(k==='turn'){tk.tkind='turn';if(!setupTimer())setTurnSec(45)}
    else{tk.tkind='bank';if(!tk.bank)tk.bank=180}
    timerChanged();refocus('#tkindSeg',b)});
  const row=$('#timerRow');
  row.hidden=kind==='off';
  if(kind!=='off'){
    const[min,max,step,ticks,lab]=T_RANGE[kind],bank=kind==='bank';
    if(row.dataset.k!==kind){
      row.dataset.k=kind;
      row.innerHTML=`<b id="timerName">${bank?'Time for each player':'Time per turn'}</b><span></span><output id="timerOut" for="timerSl"></output>`+
        `<input type="range" class="rng" id="timerSl" min="${min}" max="${max}" step="${step}" aria-labelledby="timerName">`+
        `<div class="ticks" aria-hidden="true">${ticks.map(v=>`<span style="--p:${(v-min)/(max-min)}">${lab(v)}</span>`).join('')}</div>`;
      const sl=$('#timerSl');
      sl.oninput=()=>{const v=+sl.value;if(roomGuest())return;
        if(setupBank()){if(v===setupTk().bank)return;setupTk().bank=v}else{if(v===setupTimer())return;setTurnSec(v)}
        timerChanged()};
    }
    const sl=$('#timerSl'),t=bank?tk.bank:setupTimer();
    sl.disabled=ro;sl.value=t;sl.style.setProperty('--f',((t-min)/(max-min)*100)+'%');
    sl.setAttribute('aria-valuetext',bank?fmtLeft(t)+' for each player':t+' seconds per turn');
    $('#timerOut').textContent=bank?fmtLeft(t):t+' s';
  }
  // what running out does: a random card, or you lose (both timers)
  $('#flagRow').hidden=kind==='off';
  $('#flagSeg').innerHTML=FLAGS.map(([k,l])=>`<button class="tc ${tk.flag===k?'on':''}" data-k="${k}" aria-pressed="${tk.flag===k}"${lock}><span class="k">${l}</span></button>`).join('');
  $$('#flagSeg button').forEach(b=>b.onclick=()=>{if(ro||b.dataset.k===tk.flag)return;tk.flag=b.dataset.k;timerChanged();refocus('#flagSeg',b)});
  $('#timerDesc').textContent=kind==='bank'?bankDesc(tk.bank,tk.flag):timerDesc(kind==='turn'?setupTimer():0,tk.flag);
  setVal('timer',timerVal(),kind==='off');
  $('#ruleCount').textContent=ruleCountText();
}
// the match settings rows (index.html .srow): the open one, and what each shows it's set to
let setupOpen=null;
function setVal(k,v,off){const el=$('#val-'+k);el.textContent=v;el.classList.toggle('off',!!off)}
function renderRows(){$$('#setupOpts .srow').forEach(r=>{const on=r.dataset.row===setupOpen;r.classList.toggle('open',on);r.querySelector('.srh').setAttribute('aria-expanded',on)})}
$$('#setupOpts .srh').forEach(b=>b.onclick=()=>{const k=b.dataset.row;setupOpen=setupOpen===k?null:k;sfx('click');renderRows()});
function timerChanged(){save();sfx('click');renderTimerRow();if(inRoom()){roomSync();renderRoom()}}
function renderSetup(flipKey){
  const ro=roomGuest(),cur=SR();
  $('#diffSeg').innerHTML=DIFFS.map(([k,l])=>{const[n,sub]=DIFF_INFO[k];
    return`<button class="dc ${SAVE.diff===k?'on':''}" data-k="${k}" aria-pressed="${SAVE.diff===k}"><span class="pips" aria-hidden="true">${[1,2,3].map(i=>`<i class="${i<=n?'f':''}"></i>`).join('')}</span><b>${l}</b><small>${sub}</small></button>`}).join('');
  $$('#diffSeg button').forEach(b=>b.onclick=()=>{SAVE.diff=b.dataset.k;save();sfx('click');renderSetup();refocus('#diffSeg',b)});
  setVal('diff',DIFFS.find(d=>d[0]===SAVE.diff)[1]);
  renderRows();
  const R=cur.rules;
  const swb=sweepBlock();
  $('#ruleChips').innerHTML=RULES.map(([k,l])=>{
    const dim=(k==='sameWall'&&!R.same)||(k==='combo'&&!R.same&&!R.plus),off=k==='sweep'&&swb,on=R[k]&&!off;
    return`<button class="rc ${on?'on':''} ${dim?'dim':''} ${off?'off':''} ${flipKey===k?'flip':''}" data-k="${k}" role="switch" aria-checked="${!!on}"${ro?' aria-readonly="true"':''}${off?' aria-disabled="true"':''} aria-label="${l}: ${RULE_SHORT[k]}"><span class="em">${ruleSvg(k)}</span><b>${l}</b><small class="rd" aria-hidden="true">${off?swb:RULE_SHORT[k]}</small></button>`}).join('');
  // the guest can tap a card to read about it, but not turn it on or off (nor can anyone turn on a blocked Sweep)
  $$('#ruleChips .rc').forEach(b=>b.onclick=()=>{const k=b.dataset.k;
    if(ro||k==='sweep'&&swb){setupLast=k;sfx('click');renderSetup();refocus('#ruleChips',b);return}
    R[k]=!R[k];if(k==='sameWall'&&R.sameWall)R.same=true;
    // Open shows the whole hand and Three open just 3 cards: only one of them at a time
    if(k==='open'&&R.open)R.threeOpen=false;if(k==='threeOpen'&&R.threeOpen)R.open=false;
    setupLast=k;save();sfx('flip');renderSetup(k);refocus('#ruleChips',b)});
  renderTimerRow();
  const lr=RULES.find(r=>r[0]===setupLast);
  const lrOn=lr&&R[lr[0]]&&!(lr[0]==='sweep'&&swb);
  $('#ruleInfo').innerHTML=lr?`${ruleSvg(lr[0])}<div><b>${lr[1]} · ${lrOn?'on':'off'}</b><span>${lr[2]}${lr[0]==='sweep'&&swb?` <b class="gold">${swb}</b>`:''}</span></div>`
    :`${ruleSvg('info')}<div><b>Tap a rule card</b><span>${ro?'Violet cards are on. Only the host can change them. Tap one to see what it does.':'Violet cards are on. Tap one to turn it on or off and see what it does.'}</span></div>`;
  const lock=ro?' aria-disabled="true"':'',tlock=ro||tradeLocked()?' aria-disabled="true"':'';
  $('#tradeSeg').innerHTML=TRADES.map(([k])=>`<button class="tc ${cur.trade===k?'on':''}" data-k="${k}" aria-pressed="${cur.trade===k}"${tlock}><span class="k">${STAKE[k]}</span></button>`).join('');
  setVal('trade',STAKE[cur.trade]+(tradeLocked()?' 🔒':''),cur.trade==='none');
  $$('#tradeSeg button').forEach(b=>b.onclick=()=>{if(ro||tradeLocked())return;SAVE.trade=b.dataset.k;save();sfx('click');renderSetup();refocus('#tradeSeg',b)});
  const tr=TRADES.find(t=>t[0]===cur.trade);
  $('#tradeDesc').textContent=tr[2];
  // leaving early gives up the cards too (match.js, spare.js)
  $('#tradeWarn').innerHTML=tradeLocked()?(myUser()
      ?`<b>🔒 Card bets are off.</b> <b class="gold">${esc(NET.oppName)}</b> is playing as a guest. Both players need an account to play for cards.`
      :`<b>🔒 Card bets are off.</b> You're playing as a guest. Create an account to play online for cards.`)
    :cur.trade==='none'||setupMode==='local'?'':`<b>⚠ Leaving mid-match counts as a loss.</b> ${inRoom()?'Your opponent can take your cards or spare you.':'The CPU takes your cards as if it won.'}`;
  const bo=cur.bo;
  $('#seriesSeg').innerHTML=SERIES.map(([n])=>`<button class="tc ${bo===n?'on':''}" data-k="${n}" aria-pressed="${bo===n}"${lock}><span class="k">${seriesName(n)}</span></button>`).join('');
  setVal('series',seriesName(bo));
  $$('#seriesSeg button').forEach(b=>b.onclick=()=>{if(ro)return;SAVE.bo=+b.dataset.k;save();sfx('click');renderSetup();refocus('#seriesSeg',b)});
  $('#seriesDesc').textContent=SERIES.find(s=>s[0]===bo)[2];
  if(inRoom()){roomSync();renderRoom()}
  else $('#setupGo').textContent=R.random?'Start match':'Choose cards';
}
// the room's players, status line and button
function renderRoom(){
  const host=NET.role==='host',on=!!(NET.conn&&NET.conn.open&&NET.oppName),opp=esc(NET.oppName||'your friend');
  $('#hostCode').textContent=NET.code||'·····';
  $('#hostLink').value=host&&NET.code?inviteLink(NET.code):'';
  $('#roomShare').classList.toggle('hidden',!host);
  const av=(a,name)=>a!=null&&CARDS[a]?`<span class="av art">${CARDS[a].art}</span>`:`<span class="av">${initialOf(name)}</span>`;
  // the other player's row gets an Add friend button when they're signed in (friends.js)
  const row=(cls,a,name,you,tag,st,ok)=>`<li class="${cls}">${av(a,name)}<b>${esc(name)}${you?' <small>(you)</small>':''}</b>${tag?'<span class="rtag">HOST</span>':''}${you?'':friendBtn(NET.oppUser)}<span class="st ${ok?'ok':''}">${st}</span></li>`;
  const ready=host?NET.oppReady:NET.meReady;
  const hostRow=row('h',host?myAv():NET.oppAv,host?myName():NET.oppName||'Host',host,true,host||NET.oppIn?'':'Still on results',false);
  const guestRow=on?row('g',host?NET.oppAv:myAv(),host?NET.oppName:myName(),!host,false,ready?'✓ Ready':host&&!NET.oppIn?'Still on results':'Not ready',ready)
    :'<li class="empty"><span class="av">?</span><b>Waiting for a friend…</b><span class="spin"></span></li>';
  $('#roomPlayers').innerHTML=hostRow+guestRow;
  // while the seat is empty, the host can invite friends who are on the main menu (pulse.js)
  $('#roomInv').innerHTML=host&&!on?roomInvHTML():'';
  const go=$('#setupGo');
  if(host){
    go.textContent='Start match';go.disabled=!(on&&NET.oppReady);
    $('#setupNote').innerHTML=NET.roomMsg||(!NET.code?'<span class="spin"></span>Connecting…'
      :!on?'Send the code or the invite link to a friend. You can set the rules while you wait.'
      :NET.oppReady?`<b class="gold">${opp}</b> is ready. Start when you are.`:`Waiting for <b class="gold">${opp}</b> to tap Ready. Changing a rule asks them again.`);
  }else{
    go.textContent=NET.meReady?'Not ready':'Ready';go.disabled=false;
    $('#setupNote').innerHTML=NET.meReady?`You're ready. Waiting for <b class="gold">${opp}</b> to start.`:`Only <b class="gold">${opp}</b> can change the rules. Tap Ready when you're happy with them.`;
  }
}
$('#setupGo').onclick=()=>{
  sfx('click');
  if(setupMode==='ai')startAI();
  else if(setupMode==='local')startLocal();
  else if(NET.role==='host'){if(NET.oppReady&&NET.conn&&NET.conn.open)sendSetup()}
  else{NET.meReady=!NET.meReady;netSend({t:'ready',on:NET.meReady,rv:NET.room?NET.room.rv:0});renderRoom()}
};
$('#setupBack').onclick=()=>{
  sfx('click');
  if(!inRoom()){show('menu');return}
  if(!NET.conn||!NET.conn.open){leaveRoom();return}
  modal(`<h2>${NET.role==='host'?'Close the room?':'Leave the room?'}</h2><p>${esc(oppName())} will be told you left.</p>`,
    [{label:'Leave',cls:'danger',fn:leaveRoom},{label:'Stay',cls:'primary',esc:true}]);
};
