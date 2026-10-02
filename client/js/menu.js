'use strict';
/* =====================================================================
   NAV / MENU
   ===================================================================== */
function show(id){
  // the main menu always ends any match in progress, so its timer and the CPU can't keep playing behind it
  if(id==='menu'&&G){if(G.mode==='online')netClose(true);G=null;stopTurnTimer()}
  $$('.screen').forEach(s=>s.classList.toggle('on',s.id==='scr-'+id));if(id==='game')layout();if(id==='menu')renderMenu();
  const h=$(`#scr-${id} .topbar h2`);if(h){h.tabIndex=-1;h.focus({preventScroll:true})}
}
// the last deck is only "ready" if every card in it is still owned
function lastDeckReady(){
  const d=SAVE.lastDeck||[],need={};
  if(d.length!==5)return null;
  for(const id of d){need[id]=(need[id]||0)+1;if(owned(id)<need[id])return null}
  return d;
}
function renderMenu(){
  renderProfile();if(ACCT.conflict)setTimeout(()=>ACCT.conflict&&acctAsk(ACCT.conflict),300);
  $('#collSub').textContent=unlocked()?'All cards unlocked':`${SAVE.seen.length} of ${CARDS.length} found`;
  $('#collBar').style.width=(seenCount()/CARDS.length*100).toFixed(1)+'%';
  renderHero();renderPackTile();
}
const MODE_ICON={
  ai:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="7" width="14" height="12" rx="3"/><path d="M12 3v4M9 12h.01M15 12h.01M9 16h6"/></svg>',
  local:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
  online:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/></svg>'};
// what the Play card says about your deck, plus the small fan of its cards
function heroDeck(random){
  const mlo=mainLoadout(),d=lastDeckReady(),back=cardHTML(0,null,{back:true});
  const sub=random?'Random deck'
    :mlo?(mlo.miss.length?`${mlo.l.name} is missing ${mlo.miss.length} card${mlo.miss.length>1?'s':''}`:mlo.over.length?`${mlo.l.name} breaks the rarity limits`:`${mlo.l.name} ready`)
    :d?'Last deck ready':'Pick 5 cards';
  const cards=random?Array(5).fill(back)
    :mlo?mlo.l.ids.map((id,k)=>mlo.miss.includes(k)?back:cardHTML(id,'blue',{name:false}))
    :d?d.map(id=>cardHTML(id,'blue',{name:false})):Array(5).fill(back);
  return {sub,fan:`<div class="fan" aria-hidden="true">${cards.join('')}</div>`};
}
const MODES=[['ai','vs Computer'],['local','Same screen'],['online','Online']];
// what the Play card shows for one mode
function heroPane(m){
  let h,sub,side='',row;
  if(m==='ai'){
    const dk=heroDeck(SAVE.rules.random),tr=TRADES.find(t=>t[0]===SAVE.trade);
    h='vs Computer';
    sub=dk.sub+' · '+(SAVE.trade==='none'?'Friendly':'Trade: '+tr[1])+(boOf(SAVE.bo)>1?' · Best of '+SAVE.bo:'');
    side=dk.fan;
    row=`<button class="btn primary" id="heroGo">Play</button><div class="seg" id="menuDiff" role="group" aria-label="Difficulty">${
      DIFFS.map(([k,l])=>`<button data-k="${k}" class="${SAVE.diff===k?'on':''}" aria-pressed="${SAVE.diff===k}">${l}</button>`).join('')}</div>`;
  }else if(m==='local'){
    h='Same screen';sub='Blue picks, then passes to Red · friendly';
    side='<div class="vsav" aria-hidden="true"><span class="av b">B</span><em>vs</em><span class="av r">R</span></div>';
    row='<button class="btn primary full" id="heroGo">Play</button>';
  }else{
    // online uses the host's rules, so your own "random deck" setting doesn't apply here
    const dk=heroDeck(false);
    h='Online';sub=dk.sub+' · Host or join with a code';side=dk.fan;
    row=`<button class="btn primary full" id="heroGo">Host a game</button><div class="joinrow"><input class="codein" id="heroCode" maxlength="5" placeholder="CODE" aria-label="Friend's game code" autocomplete="off" autocapitalize="characters" spellcheck="false"><button class="btn" id="heroJoin">Join</button></div>`;
  }
  return `<div class="hero-top"><div><h2 class="hero-h">${h}</h2><p class="hero-sub">${esc(sub)}</p></div>${side}</div><div class="hero-row">${row}</div>`;
}
// the Play card: a 3-way mode switch, then what that mode needs
function renderHero(anim){
  const m=MODES.some(x=>x[0]===SAVE.menuMode)?SAVE.menuMode:'ai';
  $('#modeSeg').innerHTML=MODES.map(([k,l])=>`<button data-k="${k}" class="${m===k?'on':''}" aria-pressed="${m===k}">${MODE_ICON[k]}${l}</button>`).join('');
  $$('#modeSeg button').forEach(b=>b.onclick=()=>{if(SAVE.menuMode===b.dataset.k)return;SAVE.menuMode=b.dataset.k;save();sfx('click');renderHero(true);refocus('#modeSeg',b)});
  // the other modes sit invisibly in the same spot, so the card is always as tall as the tallest one
  // and the menu doesn't jump when you switch
  const ghosts=MODES.filter(x=>x[0]!==m).map(([k])=>`<div class="hero-pane hero-ghost" aria-hidden="true" inert>${heroPane(k).replace(/ id="[^"]*"/g,'')}</div>`).join('');
  const body=$('#heroBody');
  body.innerHTML=`<div class="hero-pane">${heroPane(m)}</div>`+ghosts;
  if(anim){body.classList.remove('fade');void body.offsetWidth;body.classList.add('fade')}
  $('#heroGo').onclick=()=>{sfx('click');m==='online'?heroHost():openSetup(m)};
  $$('#menuDiff button').forEach(b=>b.onclick=()=>{SAVE.diff=b.dataset.k;save();sfx('click');renderHero();refocus('#menuDiff',b)});
  const ci=$('#heroCode');
  if(ci){
    ci.addEventListener('input',()=>{ci.value=ci.value.toUpperCase().replace(/[^A-Z]/g,'').slice(0,5)});
    ci.addEventListener('keydown',e=>{if(e.key==='Enter')heroJoin()});
    $('#heroJoin').onclick=()=>{sfx('click');heroJoin()};
  }
}
// online from the menu: the online screen still asks for a name if we don't have one yet
function askName(msg){onStatus(msg);const n=$('#myName');n.classList.add('need');setTimeout(()=>n.focus(),50)}
function heroHost(){
  if(playerName()){hostStart();return}
  openOnline();askName('Enter your name, then tap <b>Host a game</b>.');
}
function heroJoin(){
  const code=$('#heroCode').value.toUpperCase().replace(/[^A-Z]/g,'');
  if(code.length!==5){toast('Enter the 5-letter code from your friend.');$('#heroCode').focus();return}
  openOnline(code);
  if(playerName())joinGame(code);else askName('Enter your name, then tap <b>Join</b>.');
}
$$('[data-go]').forEach(b=>b.onclick=()=>{
  sfx('click');const g=b.dataset.go;
  if(g==='ai'||g==='local')openSetup(g);
  else if(g==='online')openOnline();
  else if(g==='coll')openCollection();
  else if(g==='packs')openPacks();
  else if(g==='howto')openHow(0);
});
$$('[data-back]').forEach(b=>b.onclick=()=>{sfx('click');show(b.dataset.back)});
