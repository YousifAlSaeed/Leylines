'use strict';
/* =====================================================================
   SETTINGS & THEME
   ===================================================================== */
const lightMQ=matchMedia('(prefers-color-scheme: light)');
function applyTheme(){
  const t=SAVE.theme||'system',aero=aeroOn(),dark=t==='dark'||(t==='system'&&!lightMQ.matches);
  document.documentElement.dataset.theme=dark?'dark':'light';
  document.documentElement.dataset.me=myCol(); // your colour, for what isn't a card (cards.css --me1)
  document.documentElement.classList.toggle('aero',aero); // a developer's Frutiger Aero look: a summer day, or an aurora night in the dark theme (save.js, aero.css)
  document.documentElement.classList.toggle('liquid',liquidOn()); // a developer's Liquid glass menu (save.js, glass.css)
  stSky(); // the market's sky goes by the theme, and gives the page its top colour while it's open (store.js)
  // the browser's bar, and on an iPhone app the strip behind the clock: the colour at the top of the page (--bar, base.css)
  $('#themeColor').setAttribute('content',getComputedStyle(document.documentElement).getPropertyValue('--bar').trim()||(dark?'#0E0A1F':'#f6f3ff'));
}
lightMQ.addEventListener('change',()=>{if((SAVE.theme||'system')==='system')applyTheme()});
function openSettings(){
  const th=SAVE.theme||'system';
  // the developers' themes, Frutiger Aero and Liquid glass: a row only developers get (save.js aeroOn, liquidOn).
  // Under Aero the theme picks its day or its night
  const themeSub=()=>aeroOn()?'Frutiger Aero: Light is day, Dark is night':'System follows your device';
  const box=modal(`<h2 class="nm2">Settings</h2><div class="setlist">${acctSettingsRow()}${alertsRow()}
    <div class="setrow"><span class="rt"><b>Theme</b><small id="setThemeSub">${themeSub()}</small></span><div class="seg" id="setTheme" role="group" aria-label="Theme">${
      [['system','System'],['dark','Dark'],['light','Light']].map(([k,l])=>`<button data-k="${k}" class="${th===k?'on':''}" aria-pressed="${th===k}">${l}</button>`).join('')}</div></div>
    <div class="setrow setcol"><span class="rt"><b>Your colour</b><small id="setColSub">${COL_NAME[myCol()]}: your cards everywhere. Red is always the other side</small></span><div class="colpick" id="setCol" role="group" aria-label="Your colour">${
      MY_COLS.map(c=>`<button class="dc-${c}${c===myCol()?' on':''}" data-col="${c}" aria-pressed="${c===myCol()}" aria-label="${COL_NAME[c]}" title="${COL_NAME[c]}"></button>`).join('')}</div></div>
    <div class="setrow"><span class="rt"><b>Menu background</b><small>${noMotion()?'Cards behind the menu, kept still: your device reduces motion':'Cards drifting behind the menu'}</small></span><div class="seg" id="setDrift" role="group" aria-label="Menu background">${
      [[1,'On'],[0,'Off']].map(([k,l])=>`<button data-k="${k}" class="${driftWanted()==!!k?'on':''}" aria-pressed="${driftWanted()==!!k}">${l}</button>`).join('')}</div></div>
    ${volRows('set')}
    <button class="setrow" id="setJuke"><span class="rt"><b>Jukebox</b><small>Pick the music for each place</small></span><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>
  </div>`,[{label:'Done',cls:'primary',esc:true}]);
  box.querySelectorAll('#setTheme button').forEach(b=>b.onclick=()=>{
    SAVE.theme=b.dataset.k;save();applyTheme();sfx('click');
    box.querySelectorAll('#setTheme button').forEach(x=>{x.classList.toggle('on',x===b);x.setAttribute('aria-pressed',x===b)});
  });
  box.querySelectorAll('#setCol button').forEach(b=>b.onclick=()=>{
    if(SAVE.col===b.dataset.col)return;
    SAVE.col=b.dataset.col;save();applyTheme();sfx('click');recolour();
    box.querySelector('#setColSub').firstChild.textContent=`${COL_NAME[myCol()]}: your cards everywhere. Red is always the other side`;
    box.querySelectorAll('#setCol button').forEach(x=>{x.classList.toggle('on',x===b);x.setAttribute('aria-pressed',x===b)});
  });
  box.querySelectorAll('#setDrift button').forEach(b=>b.onclick=()=>{
    driftSet(b.dataset.k==='1');sfx('click'); // menu.js
    box.querySelectorAll('#setDrift button').forEach(x=>{x.classList.toggle('on',x===b);x.setAttribute('aria-pressed',x===b)});
  });
  volWire(box);
  acctWireSettings(box);alertsPaint(box);
  box.querySelector('#setJuke').onclick=()=>{sfx('click');openJukebox()};
}
/* ---------- the jukebox: a song for each place (music.js) ---------- */
// the player's buttons
const JB_ICON={
  repeat:'<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 013-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 01-3 3H3"/>',
  prev:'<path class="f" d="M19 20L9 12l10-8z"/><path d="M5 19V5"/>',
  next:'<path class="f" d="M5 4l10 8-10 8z"/><path d="M19 5v14"/>',
  play:'<path class="f" d="M7 4.5l12.5 7.5L7 19.5z"/>',
  pause:'<path class="f" d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z"/>',
  shuffle:'<path d="M16 3h5v5"/><path d="M4 20L21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/>'};
const jbIcon=k=>`<svg viewBox="0 0 24 24" aria-hidden="true">${JB_ICON[k]}</svg>`;
const fmtSong=s=>{s=Math.max(0,Math.floor(s));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`};
// a song's length in whole seconds, the same in the list and on the bar
const songSecs=id=>Math.round(songLen(id));
// the player: repeat this song (on: songs loop, as everywhere in the game; off: the next one plays when it ends),
// shuffle (Next and the end of a song pick at random), songs played (for Previous), the next song once it's picked,
// the song last shown, whether it moved on already, the clock that moves the bar, the bar being held
const PL={repeat:true,shuffle:false,hist:[],next:null,id:null,adv:false,t:0,drag:false};
// the places a song plays in now, as words
function jbWhere(id){
  const j=jb(),at=JB_PLACES.filter(([k])=>(k==='main'||!j.one)&&!(k==='sd'&&j.sd==='keep')&&jbTrack(j,k,'main')===id).map(([,l])=>l);
  return at.length?'Plays in: '+at.join(', '):'Not used yet';
}
// the song after (dir 1) or before (dir -1) the one shown, in the list's order, or at random with Shuffle
function jbpPick(dir){
  const ids=Object.keys(TRACKS),cur=musicNow().id;
  if(PL.shuffle&&dir>0){const o=ids.filter(x=>x!==cur);return o[Math.floor(Math.random()*o.length)]}
  return ids[(ids.indexOf(cur)+dir+ids.length)%ids.length];
}
// play a song from its start; back: Previous going back through the songs played, so it isn't added again
function jbpGo(id,back){
  if(!musicOn()){toast('The music is off. Turn it up in Settings to listen.');return}
  const cur=musicNow().id;
  if(!back&&cur!==id)PL.hist=[...PL.hist.slice(-20),cur];
  PL.next=null;PL.adv=false;musicListen(id);
}
function jbpPaint(){
  if(!document.getElementById('jbBox'))return;
  const n=musicNow(),T=TRACKS[n.id],sk=document.getElementById('jbpSeek');
  if(PL.id!==n.id){PL.id=n.id;PL.adv=false;PL.next=null}
  document.getElementById('jbpName').textContent=T.name;
  document.getElementById('jbpWhere').textContent=jbWhere(n.id);
  // while the bar is held, the times show where it will jump to
  const t=PL.drag?+sk.value/1000*n.len:n.t;
  if(!PL.drag)sk.value=Math.round(n.t/n.len*1000);
  sk.style.setProperty('--f',(+sk.value/10)+'%');
  sk.setAttribute('aria-valuetext',`${fmtSong(t)} of ${fmtSong(n.len)}`);
  document.getElementById('jbpAt').textContent=fmtSong(t);
  document.getElementById('jbpLeft').textContent='-'+fmtSong(songSecs(n.id)-Math.floor(t));
  const pb=document.getElementById('jbpPlay'),on=n.playing&&!MUS.paused;
  if(pb.dataset.on!==String(on)){pb.dataset.on=on;pb.innerHTML=jbIcon(on?'pause':'play');pb.setAttribute('aria-label',on?'Pause':'Play')}
  for(const[k,v]of[['jbpRepeat',PL.repeat],['jbpShuffle',PL.shuffle]])document.getElementById(k).setAttribute('aria-pressed',v);
  document.querySelectorAll('#jbList button').forEach(b=>{const me=b.dataset.id===n.id;b.classList.toggle('on',me);b.classList.toggle('live',me&&on);
    if(me)b.setAttribute('aria-current','true');else b.removeAttribute('aria-current')});
}
// four times a second while the jukebox is open: the bar moves, and with Repeat off the next song comes in as one ends
function jbpTick(){
  if(!document.getElementById('jbBox')){clearInterval(PL.t);PL.t=0;return}
  const n=musicNow();
  if(n.playing&&!MUS.paused&&!PL.repeat){
    const left=n.len-n.t;
    // a few seconds before the end the next song is picked and made ready, then takes over as this one fades out (music.js)
    if(left<8&&!PL.next){PL.next=jbpPick(1);musicLoad(PL.next).catch(()=>{})}
    if(left<DUCK_T+FADE_OUT+.1&&!PL.adv){PL.adv=true;jbpGo(PL.next||jbpPick(1))}
  }
  jbpPaint();
}
function openJukebox(){
  const j=jb();
  // a place's choices: the songs, and following the main menu (every place but the main menu), or leaving the music as it is (Sudden Death)
  const opts=(k,v)=>[...(k==='main'?[]:[['main','Same as main menu']]),...(k==='sd'?[['keep','Keep the music playing']]:[]),
    ...Object.entries(TRACKS).map(([id,t])=>[id,t.name])].map(([id,l])=>`<option value="${id}"${id===v?' selected':''}>${l}</option>`).join('');
  const box=modal(`<h2 class="nm2">Jukebox</h2><div class="setlist" id="jbBox">
    <div class="setrow"><span class="rt"><b>One song everywhere</b><small>The main menu's song plays on every screen</small></span><div class="seg" id="jbOne" role="group" aria-label="One song everywhere">${
      [[1,'On'],[0,'Off']].map(([k,l])=>`<button data-k="${k}" class="${j.one==!!k?'on':''}" aria-pressed="${j.one==!!k}">${l}</button>`).join('')}</div></div>
    ${JB_PLACES.map(([k,l,sub])=>`<div class="setrow jbrow" data-k="${k}"><span class="rt"><b id="jbL-${k}">${l}</b>${sub?`<small>${sub}</small>`:''}</span>`+
      `<span class="jbsel"><select data-k="${k}" aria-labelledby="jbL-${k}">${opts(k,j[k])}</select></span></div>`).join('')}
  </div><h3 class="jbh">Listen</h3>
  <div class="jbplayer" role="group" aria-label="Player">
    <div class="jbtitle"><b id="jbpName"></b><small id="jbpWhere"></small></div>
    <input type="range" class="rng jbseek" id="jbpSeek" min="0" max="1000" step="1" value="0" aria-label="Position in the song">
    <div class="jbtimes"><span id="jbpAt">0:00</span><span id="jbpLeft">-0:00</span></div>
    <div class="jbctl">
      <button id="jbpRepeat" class="jbtog" aria-label="Repeat this song" aria-pressed="true" title="Repeat this song">${jbIcon('repeat')}</button>
      <button id="jbpPrev" aria-label="Previous song" title="Previous">${jbIcon('prev')}</button>
      <button id="jbpPlay" class="jbplay" aria-label="Play">${jbIcon('play')}</button>
      <button id="jbpNext" aria-label="Next song" title="Next">${jbIcon('next')}</button>
      <button id="jbpShuffle" class="jbtog" aria-label="Shuffle" aria-pressed="false" title="Shuffle">${jbIcon('shuffle')}</button>
    </div>
  </div>
  <ol class="jblist" id="jbList" aria-label="Songs">${Object.entries(TRACKS).map(([id,t],i)=>
    `<li><button data-id="${id}"><span class="n" aria-hidden="true"><i>${i+1}</i><span class="eq"><b></b><b></b><b></b></span></span><span class="t">${t.name}</span><span class="d">${fmtSong(songSecs(id))}</span></button></li>`).join('')}</ol>`,
    [{label:'Reset',keep:true,fn:()=>{SAVE.jb=null;save();musicUpdate();openJukebox()}},
     {label:'Back',keep:true,fn:()=>{openSettings();musicListenEnd()}},
     {label:'Done',cls:'primary',esc:true}]);
  const paint=()=>{
    const v=jb();
    box.querySelectorAll('#jbOne button').forEach(x=>{const on=v.one==(x.dataset.k==='1');x.classList.toggle('on',on);x.setAttribute('aria-pressed',on)});
    // with one song everywhere, only the main menu's choice counts
    box.querySelectorAll('.jbrow').forEach(r=>{const off=v.one&&r.dataset.k!=='main';r.classList.toggle('off',off);r.querySelector('select').disabled=off});
    jbpPaint();
  };
  box.querySelectorAll('#jbOne button').forEach(b=>b.onclick=()=>{SAVE.jb={...jb(),one:b.dataset.k==='1'};save();sfx('click');musicUpdate();paint()});
  box.querySelectorAll('.jbrow select').forEach(s=>s.onchange=()=>{SAVE.jb={...jb(),[s.dataset.k]:s.value};save();sfx('click');musicUpdate();paint()});
  // the player
  const q=s=>box.querySelector(s),sk=q('#jbpSeek');
  q('#jbpPlay').onclick=()=>{
    if(!musicOn()){toast('The music is off. Turn it up in Settings to listen.');return}
    const n=musicNow();
    if(n.playing&&!MUS.paused)musicPause(true);
    else{MUS.preview=n.id;musicPause(false)} // the song the bar shows is the one that plays
  };
  q('#jbpNext').onclick=()=>jbpGo(jbpPick(1));
  // Previous: back to the start of the song, or (in its first seconds) the song before
  q('#jbpPrev').onclick=()=>{const n=musicNow();if(n.t>3){musicSeek(0);jbpPaint();return}
    jbpGo(PL.hist.length?PL.hist.pop():jbpPick(-1),true)};
  q('#jbpRepeat').onclick=()=>{PL.repeat=!PL.repeat;PL.next=null;sfx('click');jbpPaint()};
  q('#jbpShuffle').onclick=()=>{PL.shuffle=!PL.shuffle;PL.next=null;sfx('click');jbpPaint()};
  box.querySelectorAll('#jbList button').forEach(b=>b.onclick=()=>jbpGo(b.dataset.id));
  // the bar: dragging shows the time, letting go jumps there
  sk.oninput=()=>{PL.drag=true;jbpPaint()};
  sk.onchange=()=>{PL.drag=false;musicSeek(+sk.value/1000*musicNow().len);jbpPaint()};
  clearInterval(PL.t);PL.t=setInterval(jbpTick,250);PL.id=null;
  paint();
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
