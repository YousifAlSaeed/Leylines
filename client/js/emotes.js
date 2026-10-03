'use strict';
/* =====================================================================
   QUICK EMOTES
   ===================================================================== */
// a face and a short phrase. Online they travel as their place in this list, so new ones only go on the end
const EMOTES=[['👋','Hi!'],['👍','Nice move!'],['😂','Haha!'],['😮','Wow!'],['🤔','Hmm…'],['😤','Grr!'],['😅','Oops!'],['🤝','Good game']];
// sent = when your recent ones went out, cool = when you can send again, got = when theirs arrived, muted = the opponent's are hidden (for this match),
// g = the match the mute belongs to, cpuAt = when the CPU may emote again
const EMO={sent:[],cool:0,coolT:0,got:[],muted:false,g:null,cpuAt:0};
// 3 in a row are fine; the 3rd (within 5 seconds) starts a 4 second wait
const EMO_BURST=3,EMO_WINDOW=5000,EMO_COOL=4000;
const emoteOn=()=>!!G&&G.mode!=='local';
const emoteOpp=()=>G.mode==='ai'?'CPU':oppName();
// the button only shows vs Computer and online; a new match starts with the opponent unmuted
function emoteSync(){
  $('#btnEmote').classList.toggle('hidden',!emoteOn());$('#scr-game').classList.toggle('emo',emoteOn());
  if(EMO.g!==G){EMO.g=G;EMO.muted=false;closeEmotes()}
}
function openEmotes(){
  const t=$('#emoteTray');
  t.innerHTML=`<div class="egrid">${EMOTES.map(([e,w],i)=>`<button class="em" data-i="${i}" aria-label="${esc(w)}"><b aria-hidden="true">${e}</b>${esc(w)}</button>`).join('')}</div>`+
    `<div class="efoot"><button class="emute" aria-pressed="${EMO.muted}">${EMO.muted?'Unmute':'Mute'} ${esc(emoteOpp())}</button></div>`;
  t.querySelectorAll('.em').forEach(b=>b.onclick=()=>sendEmote(+b.dataset.i));
  t.querySelector('.emute').onclick=()=>{EMO.muted=!EMO.muted;sfx('click');openEmotes();t.querySelector('.emute').focus()};
  t.classList.remove('hidden');$('#btnEmote').classList.add('on');$('#btnEmote').setAttribute('aria-expanded','true');
}
function closeEmotes(){
  const t=$('#emoteTray');if(t.classList.contains('hidden'))return;
  t.classList.add('hidden');t.innerHTML='';$('#btnEmote').classList.remove('on');$('#btnEmote').setAttribute('aria-expanded','false');
}
$('#btnEmote').onclick=()=>{
  if(!emoteOn())return;
  sfx('click');
  if(!$('#emoteTray').classList.contains('hidden')){closeEmotes();return}
  if(Date.now()<EMO.cool){toast('Wait a moment before the next emote');return}
  openEmotes();
};
// a tap anywhere else, or Esc, closes the tray
document.addEventListener('pointerdown',e=>{if(!e.target.closest('#emoteTray,#btnEmote'))closeEmotes()},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#emoteTray').classList.contains('hidden')){closeEmotes();$('#btnEmote').focus()}});

function sendEmote(i){
  if(!emoteOn()||Date.now()<EMO.cool)return;
  closeEmotes();showEmote('me',i);
  if(G.mode==='online')netSend({t:'emote',i});
  else cpuReply(i);
  const now=Date.now();
  EMO.sent=EMO.sent.filter(t=>now-t<EMO_WINDOW);EMO.sent.push(now);
  if(EMO.sent.length<EMO_BURST)return;
  // that's the burst: the button empties like a timer, then you can send again
  EMO.sent=[];EMO.cool=now+EMO_COOL;
  const b=$('#btnEmote');b.classList.remove('cool');void b.offsetWidth;b.classList.add('cool');
  clearTimeout(EMO.coolT);EMO.coolT=setTimeout(()=>b.classList.remove('cool'),EMO_COOL);
}
// one from the other side: hidden when muted, and a sender who skips the wait gets cut off at 4 in 5 seconds
function emoteIn(i){
  if(!emoteOn()||EMO.muted||!Number.isInteger(i)||!EMOTES[i]||!$('#scr-game').classList.contains('on'))return;
  const now=Date.now();EMO.got=EMO.got.filter(t=>now-t<EMO_WINDOW);
  if(EMO.got.length>=EMO_BURST+1)return;
  EMO.got.push(now);showEmote('opp',i);
}
// the bubble pops out of that player's avatar for a couple of seconds
function showEmote(side,i){
  const row=$(side==='me'?'#sideBot .pname':'#sideTop .pname'),[e,w]=EMOTES[i];
  row.querySelector('.ebub')?.remove();
  const d=document.createElement('div');d.className='ebub';d.setAttribute('role','status');
  d.innerHTML=`<b aria-hidden="true">${e}</b><span>${esc(w)}</span>`;
  d.setAttribute('aria-label',`${side==='me'?'You':emoteOpp()}: ${w}`);
  row.append(d);sfx('emote');
  setTimeout(()=>d.classList.add('out'),2500);setTimeout(()=>d.remove(),2900);
}

/* ---------- the CPU's emotes ---------- */
// now and then, never more than one every 8 seconds
function cpuEmote(i,chance,delay=500){
  if(!G||G.mode!=='ai'||EMO.muted||Math.random()>chance||Date.now()<EMO.cpuAt)return;
  EMO.cpuAt=Date.now()+8000;
  const g=G;setTimeout(()=>{if(G===g)emoteIn(i)},delay);
}
// answering yours: Hi for Hi, Good game for Good game, and so on
const CPU_REPLY=[0,7,2,3,4,4,2,7];
function cpuReply(i){cpuEmote(CPU_REPLY[i],.5,900)}
// after a move that took two or more cards (or a Same, Plus or Combo)
function emoteMove(p,ev){
  if(!G||G.mode!=='ai')return;
  const n=ev.reduce((a,e)=>a+e.cells.length,0);
  if(n<2&&!ev.some(e=>e.t!=='basic'))return;
  if(p===1)cpuEmote(Math.random()<.5?2:3,.45); // Haha! / Wow!
  else cpuEmote(Math.random()<.5?5:1,.35); // Grr! / Nice move!
}
