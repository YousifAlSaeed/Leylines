'use strict';
/* =====================================================================
   SETTINGS & THEME
   ===================================================================== */
const lightMQ=matchMedia('(prefers-color-scheme: light)');
function applyTheme(){
  const t=SAVE.theme||'system',dark=t==='dark'||(t==='system'&&!lightMQ.matches);
  document.documentElement.dataset.theme=dark?'dark':'light';
  $('#themeColor').setAttribute('content',dark?'#0E0A1F':'#f6f3ff');
}
lightMQ.addEventListener('change',()=>{if((SAVE.theme||'system')==='system')applyTheme()});
function openSettings(){
  const th=SAVE.theme||'system';
  const box=modal(`<h2 class="nm2">Settings</h2><div class="setlist">
    <div class="setrow"><span class="rt"><b>Theme</b><small>System follows your device</small></span><div class="seg" id="setTheme" role="group" aria-label="Theme">${
      [['system','System'],['dark','Dark'],['light','Light']].map(([k,l])=>`<button data-k="${k}" class="${th===k?'on':''}" aria-pressed="${th===k}">${l}</button>`).join('')}</div></div>
    ${[['musicVol','Music','Background track'],['sfxVol','Sound effects','Clicks, flips and the timer']].map(([k,l,sub])=>
      `<div class="setrow" data-vol="${k}"><span class="rt"><b id="${k}L">${l}</b><small>${sub}</small></span>`+
      `<input type="range" class="rng" min="0" max="100" step="5" aria-labelledby="${k}L"><span class="vpct"></span></div>`).join('')}
    <div class="setrow"><span class="rt"><b>Unlock all cards</b><small>Use every card. Off brings back your own collection</small></span><div class="seg" id="setUnlock" role="group" aria-label="Unlock all cards">${
      [[false,'Off'],[true,'On']].map(([k,l])=>`<button data-k="${k}" class="${!!SAVE.unlockAll===k?'on':''}" aria-pressed="${!!SAVE.unlockAll===k}">${l}</button>`).join('')}</div></div>
    <button class="setrow" id="setHow"><span class="rt"><b>How to play</b><small>Rules, modes and tips</small></span><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>
    <div class="setrow"><span class="rt"><b>Reset progress</b><small>Erase your cards and stats</small></span><button class="btn danger small" id="setReset">Reset</button></div>
  </div>`,[{label:'Done',cls:'primary',esc:true}]);
  box.querySelectorAll('#setTheme button').forEach(b=>b.onclick=()=>{
    SAVE.theme=b.dataset.k;save();applyTheme();sfx('click');
    box.querySelectorAll('#setTheme button').forEach(x=>{x.classList.toggle('on',x===b);x.setAttribute('aria-pressed',x===b)});
  });
  box.querySelectorAll('#setUnlock button').forEach(b=>b.onclick=()=>{
    const on=b.dataset.k==='true';if(!!SAVE.unlockAll===on)return;
    SAVE.unlockAll=on;save();sfx('click');
    box.querySelectorAll('#setUnlock button').forEach(x=>{x.classList.toggle('on',x===b);x.setAttribute('aria-pressed',x===b)});
    if($('#scr-menu').classList.contains('on'))renderMenu();
  });
  box.querySelectorAll('[data-vol]').forEach(row=>{
    const k=row.dataset.vol,sl=row.querySelector('input'),pct=row.querySelector('.vpct');
    const paint=()=>{const v=SAVE[k];sl.value=v;sl.style.setProperty('--f',v+'%');
      const txt=!SAVE.sound?'Muted':v?v+'%':'Off';pct.textContent=txt;sl.setAttribute('aria-valuetext',txt);row.classList.toggle('muted',!SAVE.sound||!v)};
    row.paint=paint;paint();
    // moving a slider also lifts the in-game mute
    sl.oninput=()=>{SAVE[k]=+sl.value;if(!SAVE.sound){SAVE.sound=true;updSnd()}save();box.querySelectorAll('[data-vol]').forEach(r=>r.paint());musicSync()};
    if(k==='sfxVol')sl.onchange=()=>sfx('click');
  });
  box.querySelector('#setHow').onclick=()=>{closeModal();openHow(0)};
  box.querySelector('#setReset').onclick=()=>confirmReset(()=>show('menu'));
}
$('#btnSettings').onclick=()=>{sfx('click');openSettings()};
