'use strict';
/* =====================================================================
   SETTINGS & THEME
   ===================================================================== */
const lightMQ=matchMedia('(prefers-color-scheme: light)');
function applyTheme(){
  const t=SAVE.theme||'system',aero=aeroOn(),dark=t==='dark'||(t==='system'&&!lightMQ.matches);
  document.documentElement.dataset.theme=dark?'dark':'light';
  document.documentElement.classList.toggle('aero',aero); // a developer's Frutiger Aero look: a summer day, or an aurora night in the dark theme (save.js, aero.css)
  stSky(); // the market's sky goes by the theme, and gives the page its top colour while it's open (store.js)
  // the browser's bar, and on an iPhone app the strip behind the clock: the colour at the top of the page (--bar, base.css)
  $('#themeColor').setAttribute('content',getComputedStyle(document.documentElement).getPropertyValue('--bar').trim()||(dark?'#0E0A1F':'#f6f3ff'));
}
lightMQ.addEventListener('change',()=>{if((SAVE.theme||'system')==='system')applyTheme()});
function openSettings(){
  const th=SAVE.theme||'system';
  // Frutiger Aero: a row only developers get (save.js aeroOn); the theme picks its day or its night
  const themeSub=()=>aeroOn()?'Frutiger Aero: Light is day, Dark is night':'System follows your device';
  const box=modal(`<h2 class="nm2">Settings</h2><div class="setlist">${acctSettingsRow()}${alertsRow()}
    <div class="setrow"><span class="rt"><b>Theme</b><small id="setThemeSub">${themeSub()}</small></span><div class="seg" id="setTheme" role="group" aria-label="Theme">${
      [['system','System'],['dark','Dark'],['light','Light']].map(([k,l])=>`<button data-k="${k}" class="${th===k?'on':''}" aria-pressed="${th===k}">${l}</button>`).join('')}</div></div>
    ${isDev()?`<div class="setrow"><span class="rt"><b>Frutiger Aero</b><small>Glass, bubbles, a summer sky or an aurora night. Only developers see this</small></span><div class="seg" id="setAero" role="group" aria-label="Frutiger Aero">${
      [[1,'On'],[0,'Off']].map(([k,l])=>`<button data-k="${k}" class="${!!SAVE.aero==!!k?'on':''}" aria-pressed="${!!SAVE.aero==!!k}">${l}</button>`).join('')}</div></div>`:''}
    <div class="setrow"><span class="rt"><b>Menu background</b><small>${noMotion()?'Cards behind the menu, kept still: your device reduces motion':'Cards drifting behind the menu'}</small></span><div class="seg" id="setDrift" role="group" aria-label="Menu background">${
      [[1,'On'],[0,'Off']].map(([k,l])=>`<button data-k="${k}" class="${driftWanted()==!!k?'on':''}" aria-pressed="${driftWanted()==!!k}">${l}</button>`).join('')}</div></div>
    ${volRows('set')}
    <button class="setrow" id="setHow"><span class="rt"><b>How to play</b><small>Rules, modes and tips</small></span><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>
  </div>`,[{label:'Done',cls:'primary',esc:true}]);
  box.querySelectorAll('#setTheme button').forEach(b=>b.onclick=()=>{
    SAVE.theme=b.dataset.k;save();applyTheme();sfx('click');
    box.querySelectorAll('#setTheme button').forEach(x=>{x.classList.toggle('on',x===b);x.setAttribute('aria-pressed',x===b)});
  });
  box.querySelectorAll('#setAero button').forEach(b=>b.onclick=()=>{
    SAVE.aero=b.dataset.k==='1';save();applyTheme();sfx('click');
    box.querySelector('#setThemeSub').textContent=themeSub();
    box.querySelectorAll('#setAero button').forEach(x=>{x.classList.toggle('on',x===b);x.setAttribute('aria-pressed',x===b)});
  });
  box.querySelectorAll('#setDrift button').forEach(b=>b.onclick=()=>{
    driftSet(b.dataset.k==='1');sfx('click'); // menu.js
    box.querySelectorAll('#setDrift button').forEach(x=>{x.classList.toggle('on',x===b);x.setAttribute('aria-pressed',x===b)});
  });
  volWire(box);
  acctWireSettings(box);alertsPaint(box);
  box.querySelector('#setHow').onclick=()=>{closeModal();openHow(0)};
}
/* ---------- volume rows: in Settings and in the sound panel during a match (match.js) ---------- */
// [level, mute, name, what it covers]. A muted channel keeps its level, so unmuting brings it back
const VOLS=[['musicVol','musicMute','Music','Background track'],['sfxVol','sfxMute','Sound effects','Clicks, flips and the timer']];
// nothing plays at all: both channels muted or at 0 (the in-game speaker shows it crossed out)
const sndSilent=()=>VOLS.every(([k,m])=>SAVE[m]||!SAVE[k]);
// id: a prefix so two sets of rows never share label ids
const volRows=id=>VOLS.map(([k,m,l,sub])=>
  `<div class="setrow" data-vol="${k}"><span class="rt"><b id="${id}${k}L">${l}</b><small>${sub}</small></span>`+
  `<input type="range" class="rng" min="0" max="100" step="5" aria-labelledby="${id}${k}L"><span class="vpct"></span>`+
  `<button class="vmute" aria-label="Mute ${l.toLowerCase()}" aria-pressed="false"></button></div>`).join('');
function volWire(box){
  box.querySelectorAll('[data-vol]').forEach(row=>{
    const k=row.dataset.vol,m=VOLS.find(x=>x[0]===k)[1],sl=row.querySelector('input'),pct=row.querySelector('.vpct'),mb=row.querySelector('.vmute');
    row.paint=()=>{const v=SAVE[k],off=SAVE[m];sl.value=v;sl.style.setProperty('--f',v+'%');
      const txt=off?'Muted':v?v+'%':'Off';pct.textContent=txt;sl.setAttribute('aria-valuetext',txt);row.classList.toggle('muted',off||!v);
      mb.innerHTML=off?SND_OFF:SND_ON;mb.setAttribute('aria-pressed',off);mb.title=off?'Unmute':'Mute'};
    row.paint();
    // moving a slider also lifts that channel's mute
    sl.oninput=()=>{SAVE[k]=+sl.value;SAVE[m]=false;save();updSnd();musicSync()};
    if(k==='sfxVol')sl.onchange=()=>sfx('click');
    // unmuting a channel turned all the way down brings it back at half
    mb.onclick=()=>{SAVE[m]=!SAVE[m];if(!SAVE[m]&&!SAVE[k])SAVE[k]=50;save();updSnd();musicSync();sfx('click')};
  });
}
$('#btnSettings').onclick=()=>{sfx('click');openSettings()};
