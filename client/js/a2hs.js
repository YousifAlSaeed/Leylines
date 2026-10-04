'use strict';
/* =====================================================================
   ADD TO HOME SCREEN  (a guide for iPhone and iPad Safari)
   iOS doesn't let a page add itself to the home screen, so this card
   shows the steps instead. It sits on the main menu, only in Safari
   (other iOS browsers and in-app browsers have different menus), never
   in the home-screen app itself. Closing it hides it on this device for
   A2HS_WAIT days; it's kept in localStorage, not the save, because the
   save follows the account to other devices.
   ===================================================================== */
const A2HS_KEY='leylines.a2hs',A2HS_WAIT=30;
function a2hsWanted(){
  const ua=navigator.userAgent;
  const ios=/iPhone|iPod|iPad/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const safari=/Safari\//.test(ua)&&!/CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|YaBrowser|DuckDuckGo|Instagram|FBAN|FBAV|Line\//.test(ua);
  if(!ios||!safari||navigator.standalone===true||matchMedia('(display-mode: standalone)').matches)return false;
  try{const t=+localStorage.getItem(A2HS_KEY)||0;return Date.now()-t>A2HS_WAIT*864e5}catch(e){return true}
}
const A2HS_SHARE='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M8 7l4-4 4 4"/><path d="M8 11H6v10h12V11h-2"/></svg>';
const A2HS_ADD='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg>';
function a2hsShow(){
  const el=$('#a2hs');
  // Safari 26 moved Share into the ••• menu at the bottom of the screen
  const v=+(navigator.userAgent.match(/Version\/(\d+)/)||[])[1]||0,dots=v>=26;
  const steps=[
    ...(dots?[`Tap <b class="a2hs-ic">•••</b> at the bottom of the screen`]:[]),
    `Tap <b class="a2hs-ic">${A2HS_SHARE}</b> <b>Share</b>${dots?'':' in Safari\'s bar'}`,
    `Choose <b class="a2hs-ic">${A2HS_ADD}</b> <b>Add to Home Screen</b> <small>(under More if you don't see it)</small>`,
    `Tap <b>Add</b>`];
  el.innerHTML=`<button class="a2hs-x" id="a2hsX" aria-label="Close">×</button>
    <div class="a2hs-top"><img src="images/apple-touch-icon.png" alt="" class="a2hs-icon"><div><h3 id="a2hsTitle">Play Leylines like an app</h3><p>Full screen, no browser bars, one tap from your home screen.</p></div></div>
    <ol>${steps.map(s=>`<li>${s}</li>`).join('')}</ol>`;
  el.hidden=false;requestAnimationFrame(()=>el.classList.add('on'));
  $('#a2hsX').onclick=()=>{
    sfx('click');try{localStorage.setItem(A2HS_KEY,String(Date.now()))}catch(e){}
    el.classList.remove('on');setTimeout(()=>{el.hidden=true},300);
  };
}
// a moment after the game opens, so the menu draws first; it only shows on the menu screen
if(a2hsWanted())setTimeout(a2hsShow,2500);
