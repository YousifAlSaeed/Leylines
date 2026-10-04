'use strict';
/* =====================================================================
   CLOCK  (the game day, from the server's clock)
   The daily pack, the Daily tab and spares go by the server's time, so
   moving the device's clock doesn't give extra dailies. The game day
   starts at midnight Arabia time (UTC+3) for every player. Until the
   server has answered (offline, or Render still waking up) there's no
   game day: daily rewards wait, everything else plays as normal.
   ===================================================================== */
const DAY_TZ=3*3600e3; // the game day starts at midnight UTC+3
// base: the server's time at `at`, a performance.now() reading, which changing the device's clock doesn't move
const CLK={base:0,at:0,ok:false,busy:false,retry:0,t:0,syncAt:-Infinity};
const clockOk=()=>CLK.ok;
const clockNow=()=>CLK.base+performance.now()-CLK.at;
// the game day as 'YYYY-MM-DD', `off` days away (-1 = yesterday); null until the server has answered
const gameDay=(off=0)=>CLK.ok?new Date(clockNow()+DAY_TZ+off*864e5).toISOString().slice(0,10):null;
const today=()=>gameDay();
const yesterday=()=>gameDay(-1);
// whole game days since 1970; the Daily tab numbers its challenges by this
const gameDayNo=()=>Math.floor((clockNow()+DAY_TZ)/864e5);
function untilMidnight(){
  if(!CLK.ok)return '…';
  const s=Math.max(0,Math.round((864e5-(clockNow()+DAY_TZ)%864e5)/1000)),h=Math.floor(s/3600),min=Math.floor(s%3600/60);
  return h?`${h}h ${min}m`:`${Math.max(1,min)}m`;
}
// a save that claimed days ahead (the device's clock was moved forward before this clock existed)
// counts them as today, so it waits one day instead of until that date
function clockFix(){
  const d=today();let ch=false;
  for(const k of ['daily','trial','spareDay','shardDay','shop'])if(SAVE[k]&&typeof SAVE[k].at==='string'&&SAVE[k].at>d){SAVE[k].at=d;ch=true}
  if(ch)save();
}
async function clockSync(){
  if(CLK.busy||API==null)return;
  CLK.busy=true;clearTimeout(CLK.t);
  try{
    const t0=performance.now(),r=await api('/time',{timeout:10000}),t1=performance.now();
    if(!Number.isFinite(r.now))throw new Error('No time from the server.');
    const first=!CLK.ok;
    // the answer left the server about halfway through the round trip
    Object.assign(CLK,{base:r.now,at:(t0+t1)/2,ok:true,retry:0,syncAt:t1});
    clockFix();
    if(first){
      if($('#scr-menu').classList.contains('on'))renderMenu();
      if($('#scr-packs').classList.contains('on'))renderPacks();
      if($('#scr-store').classList.contains('on'))renderStore();
    }
  }catch(e){
    // try again soon, then less often: 5s, 10s, 20s … up to every 2 minutes
    CLK.t=setTimeout(clockSync,Math.min(120e3,5e3*2**CLK.retry++));
  }finally{CLK.busy=false}
}
// a phone can pause performance.now() while asleep, so check again on coming back
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&performance.now()-CLK.syncAt>60e3)clockSync()});
clockSync();
