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
  $('#setupTitle').textContent={ai:'vs Computer',local:'Same screen',room:'Waiting room'}[mode];
  $('#diffBox').classList.toggle('hidden',mode!=='ai');
  $('#tradeBox').classList.toggle('hidden',mode==='local');
  $('#roomBox').classList.toggle('hidden',mode!=='room');
  $('#scr-setup').classList.toggle('ro',roomGuest());
  $('#setupGo').disabled=false;
  $('#setupNote').innerHTML=mode==='local'?'Free play: each player picks 5 cards from every card this account has found, even ones you lost. The same card can be picked more than once. No cards are traded.':'';
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
  chaos:'<path d="M3 7h3c4.5 0 7.5 10 12 10h3"/><path d="M3 17h3c4.5 0 7.5-10 12-10h3"/><path d="M18 4l3 3-3 3M18 14l3 3-3 3"/>',
  timer:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M10 2h4"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'};
const ruleSvg=k=>`<svg viewBox="0 0 24 24" aria-hidden="true">${RULE_ICON[k]}</svg>`;
const DIFF_INFO={easy:[1,'1★ Common cards'],normal:[2,'1–2★ cards'],hard:[3,'2–3★ cards, plans ahead']};
const TRADE_MARK={none:'0',one:'1',diff:'±',all:'5',sweep:'9'};
let setupLast=null; // the rule card tapped last, explained in the box under the cards
const ruleCountText=()=>{const R=SR().rules;return`${RULES.filter(r=>R[r[0]]).length+(R.timer?1:0)} on`};
function timerInfo(){const t=SR().rules.timer;return`${ruleSvg('timer')}<div><b>Turn timer · ${t?t+' seconds':'off'}</b><span>${timerDesc(t)}</span></div>`}
// slider positions: 0 = off, 1..17 = 10..90 seconds
function renderTimerRow(){
  const row=$('#timerRow'),t=SR().rules.timer;
  if(!row.firstChild){
    row.innerHTML=`${ruleSvg('timer')}<b id="timerName">Turn timer</b><output id="timerOut" for="timerSl"></output>`+
      `<input type="range" class="rng" id="timerSl" min="0" max="${TIMER_MAX/5-1}" step="1" aria-labelledby="timerName">`+
      `<div class="ticks" aria-hidden="true">${[0,30,50,70,90].map(n=>`<span style="--p:${(n?n/5-1:0)/(TIMER_MAX/5-1)}">${n||'Off'}</span>`).join('')}</div>`;
    const sl=$('#timerSl');
    sl.oninput=()=>{const v=+sl.value,n=v?(v+1)*5:0;if(roomGuest()||n===SAVE.rules.timer)return;SAVE.rules.timer=n;save();setupLast='timer';sfx('click');
      renderTimerRow();$('#ruleInfo').innerHTML=timerInfo();if(inRoom()){roomSync();renderRoom()}};
  }
  const sl=$('#timerSl'),pos=t?t/5-1:0;
  sl.disabled=roomGuest();sl.value=pos;sl.style.setProperty('--f',(pos/(+sl.max)*100)+'%');
  sl.setAttribute('aria-valuetext',t?t+' seconds per turn':'Off, no time limit');
  $('#timerOut').textContent=t?t+' s':'Off';
  row.classList.toggle('off',!t);
  $('#ruleCount').textContent=ruleCountText();
}
function renderSetup(flipKey){
  const ro=roomGuest(),cur=SR();
  $('#diffSeg').innerHTML=DIFFS.map(([k,l])=>{const[n,sub]=DIFF_INFO[k];
    return`<button class="dc ${SAVE.diff===k?'on':''}" data-k="${k}" aria-pressed="${SAVE.diff===k}"><span class="pips" aria-hidden="true">${[1,2,3].map(i=>`<i class="${i<=n?'f':''}"></i>`).join('')}</span><b>${l}</b><small>${sub}</small></button>`}).join('');
  $$('#diffSeg button').forEach(b=>b.onclick=()=>{SAVE.diff=b.dataset.k;save();sfx('click');renderSetup();refocus('#diffSeg',b)});
  const R=cur.rules;
  $('#ruleChips').innerHTML=RULES.map(([k,l])=>{
    const dim=(k==='sameWall'&&!R.same)||(k==='combo'&&!R.same&&!R.plus);
    return`<button class="rc ${R[k]?'on':''} ${dim?'dim':''} ${flipKey===k?'flip':''}" data-k="${k}" role="switch" aria-checked="${!!R[k]}"${ro?' aria-readonly="true"':''} aria-label="${l}: ${RULE_SHORT[k]}"><span class="em">${ruleSvg(k)}</span><b>${l}</b></button>`}).join('');
  // the guest can tap a card to read about it, but not turn it on or off
  $$('#ruleChips .rc').forEach(b=>b.onclick=()=>{const k=b.dataset.k;
    if(ro){setupLast=k;sfx('click');renderSetup();refocus('#ruleChips',b);return}
    R[k]=!R[k];if(k==='sameWall'&&R.sameWall)R.same=true;setupLast=k;save();sfx('flip');renderSetup(k);refocus('#ruleChips',b)});
  renderTimerRow();
  const lr=RULES.find(r=>r[0]===setupLast);
  $('#ruleInfo').innerHTML=setupLast==='timer'?timerInfo():lr?`${ruleSvg(lr[0])}<div><b>${lr[1]} · ${R[lr[0]]?'on':'off'}</b><span>${lr[2]}</span></div>`
    :`${ruleSvg('info')}<div><b>Tap a rule card</b><span>${ro?'Violet cards are on. Only the host can change them. Tap one to see what it does.':'Violet cards are on. Tap one to turn it on or off and see what it does.'}</span></div>`;
  const lock=ro?' aria-disabled="true"':'',tlock=ro||tradeLocked()?' aria-disabled="true"':'';
  $('#tradeSeg').innerHTML=TRADES.map(([k,l])=>`<button class="tc ${cur.trade===k?'on':''}" data-k="${k}" aria-pressed="${cur.trade===k}"${tlock}><span class="n" aria-hidden="true">${TRADE_MARK[k]}</span><small>${l}</small></button>`).join('');
  $$('#tradeSeg button').forEach(b=>b.onclick=()=>{if(ro||tradeLocked())return;SAVE.trade=b.dataset.k;save();sfx('click');renderSetup();refocus('#tradeSeg',b)});
  const tr=TRADES.find(t=>t[0]===cur.trade);
  $('#tradeDesc').textContent=tr[2];
  // leaving early gives up the cards too (match.js, spare.js)
  $('#tradeWarn').innerHTML=tradeLocked()?(myUser()
      ?`<b>🔒 Card bets are off.</b> <b class="gold">${esc(NET.oppName)}</b> is playing as a guest. Both players need an account to play for cards.`
      :`<b>🔒 Card bets are off.</b> You're playing as a guest. Create an account to play online for cards.`)
    :cur.trade==='none'||setupMode==='local'?'':`<b>⚠ Leaving mid-match counts as a loss.</b> ${inRoom()?'Your opponent can take your cards or spare you.':'The CPU takes your cards as if it won.'}`;
  const bo=cur.bo;
  $('#seriesSeg').innerHTML=SERIES.map(([n,l])=>`<button class="tc ${bo===n?'on':''}" data-k="${n}" aria-pressed="${bo===n}"${lock}><span class="n" aria-hidden="true">${n}</span><small>${l}</small></button>`).join('');
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
