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
    (o.isNew?'<div class="nchip" aria-hidden="true">New</div>':'')+
    (o.name===false?'':`<div class="nm">${esc(c.name)}</div>`)+
    '<i class="rf"></i>'+
  `</div>`;
}

// A dragged card is a copy ("ghost") on <body>: game.js (1v1 hand), duo.js (Crossroads hand), collection.js (card picker).
// Only one drag runs at a time, so a copy that's still around when a drag starts or ends, the screen changes or the
// window loses focus was left behind (a second finger, a release the browser never reported) and is removed.
// keep: the copy of the drag that's running now.
const otherPointer=(e,d)=>!!e&&e.pointerId!=null&&d.pid!=null&&e.pointerId!==d.pid;
function ghostSweep(keep){$$('body > .ghost').forEach(g=>{if(g!==keep)g.remove()})}

/* ---------- flying cards (collection and hand) ----------
   A copy of the card on <body> (outside the zoomed screens) flies from one card to another in an arc,
   turning and resizing to match. The cards themselves stay put; hide them while the copy is in the air. */
const CARD_COLS=['blue','red','grey','gold','green','purple','teal'];
const noMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
// a card's font size in window pixels (cards are sized in em; screens and popups are zoomed by --ui)
const cardPx=el=>parseFloat(getComputedStyle(el).fontSize)*(el.closest('.screen,#modal')?UI:1);
// o: ms, ease, arc (px up at the middle), r0/r1 (deg at start/end), s0 (start scale), pop (scale at the middle),
//    lift (card heights to rise first, as out of a sleeve), liftAt, liftScale, shadow, done
function fly(src,dst,o={}){
  if(!src||!dst){o.done&&o.done();return}
  const a=src.getBoundingClientRect(),b=dst.getBoundingClientRect(),fa=cardPx(src),fb=cardPx(dst);
  if(noMotion()||!a.width||!b.width){o.done&&o.done();return}
  const g=src.cloneNode(true);g.classList.remove('hold','deal','ghost','dragging');g.classList.add('flyer');if(o.shadow)g.classList.add('lifted');
  // a card changing hands changes colour on the way (a lost red one coming back into your colour)
  const col=e=>CARD_COLS.find(c=>e.classList.contains(c)),c0=col(g),c1=col(dst);
  const ax=a.left+a.width/2,ay=a.top+a.height/2,dx=b.left+b.width/2-ax,dy=b.top+b.height/2-ay;
  Object.assign(g.style,{fontSize:fa+'px',left:(ax-2.5*fa)+'px',top:(ay-3*fa)+'px',transform:'',visibility:''});
  document.body.append(g);
  if(c0&&c1&&c0!==c1){getComputedStyle(g).getPropertyValue('--c1');g.style.transition=`--c1 ${o.ms||360}ms,--c2 ${o.ms||360}ms`;g.classList.replace(c0,c1)}
  const s0=o.s0||1,s=fb/fa,r0=o.r0||0,r1=o.r1||0,tf=(x,y,r,k)=>`translate(${x}px,${y}px) rotate(${r}deg) scale(${k})`;
  const kf=[{transform:tf(0,0,r0,s0)}];
  if(o.lift)kf.push({transform:tf(0,-o.lift*6*fa*s0,r0*.5,s0*(o.liftScale||1)),offset:o.liftAt||.25});
  kf.push({transform:tf(dx/2,dy/2-(o.arc||0),(r0+r1)/2,(s0+s)/2*(o.pop||1.06)),offset:o.lift?.62:.5});
  kf.push({transform:tf(dx,dy,r1,s)});
  const an=g.animate(kf,{duration:o.ms||360,easing:o.ease||'cubic-bezier(.3,.55,.3,1)',fill:'forwards'});
  an.onfinish=an.oncancel=()=>{g.remove();o.done&&o.done()};
}
// a card that just landed gives a small bounce
const settle=el=>{if(el&&!noMotion())el.animate([{transform:'translateY(-.35em) scale(1.04)'},{transform:'none'}],{duration:180,easing:'cubic-bezier(.2,1.4,.4,1)'})};
// a quick side-to-side "no"
const shakeNo=(el,px=6)=>{if(el&&!noMotion())el.animate([{transform:'none'},{transform:`translateX(${-px}px)`},{transform:`translateX(${px*.8}px)`},{transform:`translateX(${-px/2}px)`},{transform:`translateX(${px/3}px)`},{transform:'none'}],{duration:260,easing:'ease-out'})};
addEventListener('blur',()=>ghostSweep());
document.addEventListener('visibilitychange',()=>{if(document.hidden)ghostSweep()});

let toastT=0;
function toast(msg,ms=2200){const t=$('#toast');t.textContent=msg;t.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('on'),ms)}

let modalReturn=null;
// important popups (a choice that costs something, or news of a loss): a button with wait:true counts down
// READ_WAIT seconds before it works, so there's time to read first. Cancel / Stay / Escape never wait.
const READ_WAIT=3;
function readWait(e,label){
  let n=READ_WAIT;e.classList.add('waiting');e.setAttribute('aria-disabled','true');
  const tick=()=>{if(!e.isConnected)return;
    if(n>0){e.textContent=`${label} (${n--})`;setTimeout(tick,1000)}
    else{e.textContent=label;e.classList.remove('waiting');e.removeAttribute('aria-disabled')}};
  tick();
}
function modal(html,btns=[]){
  const bg=$('#modal');
  if(!bg.classList.contains('on'))modalReturn=document.activeElement;
  bg.innerHTML=`<div class="mbox" tabindex="-1">${html}<div class="mbtns"></div></div>`;
  const bx=bg.querySelector('.mbtns');
  btns.forEach(b=>{const e=document.createElement('button');e.className='btn '+(b.cls||'');e.textContent=b.label;if(b.esc)e.dataset.esc='';
    e.onclick=()=>{if(e.classList.contains('waiting'))return;if(!bg.querySelector('.cd-box'))sfx('click');if(!b.keep)closeModal();b.fn&&b.fn()};bx.append(e);
    if(b.wait)readWait(e,b.label)});
  const h=bg.querySelector('h2');
  if(h){h.id='mTitle';bg.setAttribute('aria-labelledby','mTitle')}else bg.removeAttribute('aria-labelledby');
  bg.classList.add('on');
  $$('.screen').forEach(s=>s.inert=true);
  const box=bg.querySelector('.mbox');
  (box.querySelector('.pk,.btn.primary:not(:disabled)')||box.querySelector('.btn')||box).focus({preventScroll:true});
  return box;
}
function closeModal(){
  const m=$('#modal'),collectionCard=!!m.querySelector('.cd-box');
  if(collectionCard)collCardBack(m); // the card flies back into its sleeve (collection.js); needs the popup still on screen
  m.classList.remove('on');m.innerHTML='';
  // the "waiting for the other player" layer can sit on top of a modal; the screens stay blocked under it
  const away=$('#away').classList.contains('on');$$('.screen').forEach(s=>s.inert=away);
  if(modalReturn&&modalReturn.isConnected&&modalReturn.offsetParent)modalReturn.focus({preventScroll:true});
  modalReturn=null;
  // news about a match you left waits for the popup in front of it to close (spare.js)
  if(OWES.news.length)setTimeout(oweNews,300);
  // a song the jukebox was playing to listen to stops with it (music.js)
  if(MUS.preview){MUS.preview=null;musicUpdate()}
}

// Same / Plus / Combo: n counts the Combos in this move; the second one and any after it ring higher
const RULE_TXT={same:'Same!',plus:'Plus!',combo:'Combo!'};
function ruleBanner(t,n){return banner(RULE_TXT[t],'',t!=='combo'?'same_plus':n>1?'combo2':'combo')}
function banner(text,cls='',snd){
  sfx(snd||(cls==='small'?'click':'banner'));
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
  'coll_open','coll_close','coll_locked','coll_lost','coll_shimmer','coll_lift','coll_return','coll_hand_remove','hand_pick','badge_claim','same_plus','combo','combo2'];
const SFX_BUFFERS={},SFX_QUEUED={};let SFX_LOADING=null;
function sfxLoad(){
  if(SFX_LOADING)return SFX_LOADING;
  SFX_LOADING=Promise.all(SFX_NAMES.map(async k=>{
    const r=await fetch(`audio/sfx/${k}.mp3`);if(!r.ok)throw new Error(r.status);
    SFX_BUFFERS[k]=await AC.decodeAudioData(await r.arrayBuffer());
  })).catch(()=>{SFX_LOADING=null});
  return SFX_LOADING;
}
// vol: 0–1 of the normal loudness (a softer version of the same sound)
function sfx(k,vol=1){
  const v=SAVE.sfxVol/100*vol;
  if(SAVE.sfxMute||!v)return;
  try{
    AC=AC||new(window.AudioContext||window.webkitAudioContext)();
    if(AC.state==='suspended')AC.resume();
    if(SFX_BUFFERS[k]){
      const src=AC.createBufferSource(),g=AC.createGain();src.buffer=SFX_BUFFERS[k];g.gain.value=.32*v;
      src.connect(g).connect(AC.destination);src.start();return;
    }
    if(!SFX[k]&&SFX_LOADING&&!k.startsWith('pack_tick_')&&!SFX_QUEUED[k]){
      const at=performance.now(),loading=SFX_LOADING;SFX_QUEUED[k]=true;
      loading.then(()=>{delete SFX_QUEUED[k];if(SFX_BUFFERS[k]&&performance.now()-at<800)sfx(k,vol)});return;
    }
    let t=AC.currentTime+.01;
    for(const[f,d,type] of SFX[k]||[]){
      const o=AC.createOscillator(),g=AC.createGain();o.type=type||'triangle';o.frequency.value=f;
      g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.16*v,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+d);
      o.connect(g).connect(AC.destination);o.start(t);o.stop(t+d+.03);t+=d*.85;
    }
  }catch(e){}
}
