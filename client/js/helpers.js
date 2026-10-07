'use strict';
/* =====================================================================
   HELPERS
   ===================================================================== */
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const fmt=v=>v===10?'X':String(v);
// keeps the screen from dimming during a match, where the browser allows it (it lets go when the app is hidden)
let wakeLock=null;
async function keepAwake(on){
  try{
    if(on&&!wakeLock&&navigator.wakeLock){wakeLock=await navigator.wakeLock.request('screen');wakeLock.addEventListener('release',()=>{wakeLock=null})}
    else if(!on&&wakeLock){const w=wakeLock;wakeLock=null;await w.release()}
  }catch(e){}
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)keepAwake($('#scr-game').classList.contains('on'))});
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function cardStrength(id){const c=CARDS[id];return c.lv*100+c.sum}

function cardLabel(id){const c=CARDS[id],s=c.s;return `${c.name}, ${c.rar} star ${RARITY[c.rar-1]}, top ${fmt(s[0])}, right ${fmt(s[1])}, bottom ${fmt(s[2])}, left ${fmt(s[3])}`+(c.e?`, ${c.e}`:'')}
// Esc closes the open popup
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  if($('#modal').classList.contains('on')){const b=$('#modal [data-esc]');if(b){e.preventDefault();b.click()}return}
  if($('#how').classList.contains('on')){e.preventDefault();closeHow()}
});
function cardHTML(id,color,o={}){
  if(o.back) return `<div class="card back ${o.cls||''}" ${o.attrs||''}><i>◆</i></div>`;
  const c=CARDS[id];
  return `<div class="card ${color||'blue'} rar${c.rar}${o.name===false?' nn':''} ${o.cls||''}" ${o.attrs||''}>`+
    `<div class="art">${c.art}</div>`+
    `<div class="nums"><b class="n0">${fmt(c.s[0])}</b><b class="n1">${fmt(c.s[1])}</b><b class="n2">${fmt(c.s[2])}</b><b class="n3">${fmt(c.s[3])}</b></div>`+
    (c.e?`<div class="el">${ELEM[c.e]}</div>`:'')+
    (o.mod?`<div class="mod ${o.mod>0?'up':'dn'}">${o.mod>0?'+1':'−1'}</div>`:'')+
    (o.count>1?`<div class="cnt">×${o.count}</div>`:'')+
    `<div class="rchip" aria-hidden="true">${c.rar}★</div>`+
    (o.name===false?'':`<div class="nm">${esc(c.name)}</div>`)+
    '<i class="rf"></i>'+
  `</div>`;
}

let toastT=0;
function toast(msg,ms=2200){const t=$('#toast');t.textContent=msg;t.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('on'),ms)}

let modalReturn=null;
function modal(html,btns=[]){
  const bg=$('#modal');
  if(!bg.classList.contains('on'))modalReturn=document.activeElement;
  bg.innerHTML=`<div class="mbox" tabindex="-1">${html}<div class="mbtns"></div></div>`;
  const bx=bg.querySelector('.mbtns');
  btns.forEach(b=>{const e=document.createElement('button');e.className='btn '+(b.cls||'');e.textContent=b.label;if(b.esc)e.dataset.esc='';
    e.onclick=()=>{if(!bg.querySelector('.cd-box'))sfx('click');if(!b.keep)closeModal();b.fn&&b.fn()};bx.append(e)});
  const h=bg.querySelector('h2');
  if(h){h.id='mTitle';bg.setAttribute('aria-labelledby','mTitle')}else bg.removeAttribute('aria-labelledby');
  bg.classList.add('on');
  $$('.screen').forEach(s=>s.inert=true);
  const box=bg.querySelector('.mbox');
  (box.querySelector('.pk,.btn.primary:not(:disabled)')||box.querySelector('.btn')||box).focus({preventScroll:true});
  return box;
}
function closeModal(){
  const m=$('#modal'),collectionCard=!!m.querySelector('.cd-box');m.classList.remove('on');m.innerHTML='';
  if(collectionCard)sfx('coll_card_in');
  // the "waiting for the other player" layer can sit on top of a modal; the screens stay blocked under it
  const away=$('#away').classList.contains('on');$$('.screen').forEach(s=>s.inert=away);
  if(modalReturn&&modalReturn.isConnected&&modalReturn.offsetParent)modalReturn.focus({preventScroll:true});
  modalReturn=null;
  // news about a match you left waits for the popup in front of it to close (spare.js)
  if(OWES.news.length)setTimeout(oweNews,300);
}

function banner(text,cls=''){
  sfx(cls==='small'?'click':'banner');
  const d=document.createElement('div');d.className='banner '+cls;d.innerHTML=`<span>${text}</span>`;
  $('#banners').append(d);setTimeout(()=>d.remove(),1150);
  return wait(cls==='small'?850:780);
}

/* ---------- sound ---------- */
let AC=null;
const SFX={place:[[300,.07,'triangle']],flip:[[620,.05,'square'],[930,.07,'triangle']],banner:[[523,.08],[659,.08],[784,.08],[1047,.16]],
  win:[[523,.12],[659,.12],[784,.12],[1047,.35]],lose:[[440,.18],[370,.18],[294,.4]],click:[[880,.03]],tick:[[1320,.035,'square']],timeup:[[330,.12,'sawtooth'],[220,.25,'sawtooth']],draw:[[523,.15],[523,.25]],emote:[[660,.05],[990,.09]]};
const SFX_NAMES=['click','place','flip','banner','win','lose','draw','tick','timeup','emote',
  'pack_whoosh','pack_tick_01','pack_tick_02','pack_tick_03','pack_tick_04','pack_tick_05',
  'pack_snapback','pack_rip','pack_flip','pack_build_4','pack_build_5',
  'pack_reveal_1','pack_reveal_2','pack_reveal_3','pack_reveal_4','pack_reveal_5','pack_fling',
  'coll_page_01','coll_page_02','coll_page_03','coll_page_04','coll_card_out','coll_card_in',
  'coll_hand_add','coll_deny','coll_hand_full','coll_set_done','coll_riffle','coll_bump','coll_tab',
  'coll_open','coll_close','coll_locked','coll_lost','coll_shimmer','coll_lift','coll_return','coll_hand_remove'];
const SFX_BUFFERS={},SFX_QUEUED={};let SFX_LOADING=null;
function sfxLoad(){
  if(SFX_LOADING)return SFX_LOADING;
  SFX_LOADING=Promise.all(SFX_NAMES.map(async k=>{
    const r=await fetch(`audio/sfx/${k}.ogg`);if(!r.ok)throw new Error(r.status);
    SFX_BUFFERS[k]=await AC.decodeAudioData(await r.arrayBuffer());
  })).catch(()=>{SFX_LOADING=null});
  return SFX_LOADING;
}
function sfx(k){
  const v=SAVE.sfxVol/100;
  if(!SAVE.sound||!v)return;
  try{
    AC=AC||new(window.AudioContext||window.webkitAudioContext)();
    if(AC.state==='suspended')AC.resume();
    if(SFX_BUFFERS[k]){
      const src=AC.createBufferSource(),g=AC.createGain();src.buffer=SFX_BUFFERS[k];g.gain.value=.32*v;
      src.connect(g).connect(AC.destination);src.start();return;
    }
    if(!SFX[k]&&SFX_LOADING&&!k.startsWith('pack_tick_')&&!SFX_QUEUED[k]){
      const at=performance.now(),loading=SFX_LOADING;SFX_QUEUED[k]=true;
      loading.then(()=>{delete SFX_QUEUED[k];if(SFX_BUFFERS[k]&&performance.now()-at<800)sfx(k)});return;
    }
    let t=AC.currentTime+.01;
    for(const[f,d,type] of SFX[k]||[]){
      const o=AC.createOscillator(),g=AC.createGain();o.type=type||'triangle';o.frequency.value=f;
      g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.16*v,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+d);
      o.connect(g).connect(AC.destination);o.start(t);o.stop(t+d+.03);t+=d*.85;
    }
  }catch(e){}
}

/* ---------- music ---------- */
// Game track, played on every screen from the first click, tap or key press. It is 173.48 BPM in 4/4
// (one bar = 1.3835 s) and starts on a downbeat at 0 s. Its last bar (bar 122, from 167.409 s) is just a
// final hit ringing out into near-silence, so the opening comes back in on that bar's downbeat and the
// final hit and its ring play on top of it, fading out, instead of leaving a second of silence.
// Replace these numbers if the track changes.
const MUSIC={src:'audio/theme.mp3',max:.5,first:0,loopAt:167.4085,
  buf:null,loading:null,node:null,gain:null,want:false,pos:null,t0:0,off:0};
function musicOn(){return !!(SAVE.sound&&SAVE.musicVol)}
const musicGain=()=>MUSIC.max*SAVE.musicVol/100;
// download now; decoding needs the audio context, which waits for the first interaction
MUSIC.data=fetch(MUSIC.src).then(r=>{if(!r.ok)throw new Error(r.status);return r.arrayBuffer()});
MUSIC.data.catch(()=>{});
function audioUnlock(){
  removeEventListener('pointerdown',audioUnlock,true);removeEventListener('keydown',audioUnlock,true);
  try{AC=AC||new(window.AudioContext||window.webkitAudioContext)();if(AC.state==='suspended')AC.resume()}catch(e){return}
  sfxLoad();
  musicPlay();
}
addEventListener('pointerdown',audioUnlock,true);addEventListener('keydown',audioUnlock,true);
function musicLoad(){
  if(MUSIC.loading)return MUSIC.loading;
  AC=AC||new(window.AudioContext||window.webkitAudioContext)();
  MUSIC.loading=MUSIC.data.then(d=>new Promise((ok,no)=>AC.decodeAudioData(d,ok,no))).then(b=>{
    const sr=b.sampleRate,S=Math.round(MUSIC.first*sr),E=Math.round(MUSIC.loopAt*sr),F=b.length-E;
    // from the loop point to the end of the file: the opening plus the leftover tail fading out (cosine curve)
    for(let c=0;c<b.numberOfChannels;c++){const d=b.getChannelData(c);
      for(let j=0;j<F;j++)d[E+j]=d[S+j]+d[E+j]*.5*(1+Math.cos(Math.PI*j/F))}
    // then carry on from just after that stretch of the opening
    MUSIC.buf=b;MUSIC.loopStart=(S+F)/sr;MUSIC.loopEnd=b.length/sr;return b;
  }).catch(e=>{MUSIC.loading=null;throw e});
  return MUSIC.loading;
}
function musicPlay(){
  MUSIC.want=true;
  if(!musicOn()||MUSIC.node)return;
  musicLoad().then(b=>{
    if(!MUSIC.want||!musicOn()||MUSIC.node)return;
    if(AC.state==='suspended')AC.resume();
    const src=AC.createBufferSource(),g=AC.createGain(),t=AC.currentTime+.05;
    // after a mute, carry on from where it stopped (fading in), not from the top
    const off=MUSIC.pos??MUSIC.first,resume=MUSIC.pos!=null;MUSIC.pos=null;
    src.buffer=b;src.loop=true;src.loopStart=MUSIC.loopStart;src.loopEnd=MUSIC.loopEnd;
    g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(document.hidden?.0001:musicGain(),t+(resume?.6:.03));
    src.connect(g).connect(AC.destination);src.start(t,off);
    Object.assign(MUSIC,{node:src,gain:g,t0:t,off});
  }).catch(()=>{});
}
function musicStop(keepWant){
  if(!keepWant)MUSIC.want=false;
  const src=MUSIC.node,g=MUSIC.gain;if(!src)return;
  MUSIC.node=MUSIC.gain=null;
  const t=AC.currentTime;
  // where in the track we are: past the loop end it wraps back to the loop start
  let p=MUSIC.off+Math.max(0,t-MUSIC.t0);
  if(p>=MUSIC.loopEnd)p=MUSIC.loopStart+(p-MUSIC.loopEnd)%(MUSIC.loopEnd-MUSIC.loopStart);
  MUSIC.pos=p;g.gain.cancelScheduledValues(t);g.gain.setValueAtTime(g.gain.value,t);g.gain.linearRampToValueAtTime(0,t+.6);
  src.stop(t+.65);
}
function musicSync(){
  if(!musicOn()){musicStop(true);return}
  if(!MUSIC.node){if(MUSIC.want)musicPlay();return}
  if(!document.hidden)MUSIC.gain.gain.setTargetAtTime(musicGain(),AC.currentTime,.05);
}
// fade out while the tab is hidden, back in when it returns
document.addEventListener('visibilitychange',()=>{
  const g=MUSIC.gain;if(!g)return;
  const t=AC.currentTime;g.gain.cancelScheduledValues(t);g.gain.setValueAtTime(Math.max(g.gain.value,.0001),t);
  g.gain.exponentialRampToValueAtTime(document.hidden?.0001:musicGain(),t+(document.hidden?.3:1));
});
