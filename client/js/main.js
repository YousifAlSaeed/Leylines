'use strict';
/* =====================================================================
   BOOT
   ===================================================================== */
applyTheme();updSnd();renderMenu();layout();
(function(){
  const q=new URLSearchParams(location.search).get('join');
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
