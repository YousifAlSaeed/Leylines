'use strict';
/* =====================================================================
   BOOT
   ===================================================================== */
applyTheme();updSnd();renderMenu();layout();acctBoot();
(function(){
  const P=new URLSearchParams(location.search),q=P.get('join'),u=P.get('u');
  // a shared profile link: ?u=username
  if(u&&!q){try{history.replaceState(null,'',location.pathname)}catch(e){}if(/^[A-Za-z0-9_]{3,20}$/.test(u))openPlayer(u);return}
  if(q){
    const code=q.toUpperCase().replace(/[^A-Z]/g,'').slice(0,5);
    try{history.replaceState(null,'',location.pathname)}catch(e){}
    if(code.length===5){
      openOnline(code);
      if(cleanName(SAVE.name))joinGame(code);
      else{onStatus("You've been invited. Enter your name, then tap <b>Join</b>.");const n=$('#myName');n.classList.add('need');setTimeout(()=>n.focus(),50)}
    }
  }
})();
