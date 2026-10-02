'use strict';
/* =====================================================================
   BOOT
   ===================================================================== */
applyTheme();updSnd();renderMenu();layout();acctBoot();
// offline support (sw.js); service workers only run on https and localhost
if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'))navigator.serviceWorker.register('sw.js').catch(()=>{});
(function(){
  // a password reset link from an email: #reset=token (after #, so the token never reaches a server log)
  const rs=/^#reset=([\w-]{20,})$/.exec(location.hash);
  if(rs){try{history.replaceState(null,'',location.pathname+location.search)}catch(e){}openReset(rs[1]);return}
  const P=new URLSearchParams(location.search),q=P.get('join'),u=P.get('u');
  // a shared profile link: ?u=username
  if(u&&!q){try{history.replaceState(null,'',location.pathname)}catch(e){}if(/^[A-Za-z0-9_]{3,20}$/.test(u))openPlayer(u);return}
  if(q){
    const code=q.toUpperCase().replace(/[^A-Z]/g,'').slice(0,5);
    try{history.replaceState(null,'',location.pathname)}catch(e){}
    if(code.length===5){
      openOnline(code);
      if(playerName())joinGame(code);
      else{onStatus("You've been invited. Enter your name, then tap <b>Join</b>.");const n=$('#myName');n.classList.add('need');setTimeout(()=>n.focus(),50)}
    }
  }
})();
