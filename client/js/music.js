'use strict';
/* =====================================================================
   MUSIC & THE JUKEBOX
   Each place in the game has its song (Settings → Jukebox picks them). Moving between places crossfades
   from one song to the next, and a song you come back to carries on from where it was.
   ===================================================================== */
// Every track. Discovery is the original theme: 173.48 BPM in 4/4 (one bar = 1.3835 s), starting on a downbeat at
// 0 s. Its last bar (bar 122, from 167.409 s) is just a final hit ringing out into near-silence, so the opening comes
// back in on that bar's downbeat and the final hit and its ring play on top of it, fading out, instead of leaving a
// second of silence. Replace these numbers if the track changes.
// The others are seamless loops len seconds long. Each file holds a second of the loop's end, the loop, then a second
// of its start: they play from 1 s and loop from 1 s to 1 s + len, which stays exact even when a decoder adds a
// little silence at the front of an MP3 (any stretch that long inside the file is one whole turn of the loop).
const TRACKS={
  discovery:{name:'Discovery',src:'audio/theme.mp3',loopAt:167.4085},
  'ley-lines':{name:'Ley Lines',src:'audio/music/ley-lines.mp3',len:3848727/44100},
  crossroads:{name:'Crossroads',src:'audio/music/crossroads.mp3',len:80},
  'sudden-death':{name:'Sudden Death',src:'audio/music/sudden-death.mp3',len:2688000/44100},
  market:{name:'Market',src:'audio/music/market.mp3',len:3256615/44100},
  'open-sky':{name:'Open Sky',src:'audio/music/open-sky.mp3',len:76.8},
  afterglow:{name:'Afterglow',src:'audio/music/afterglow.mp3',len:3681391/44100}};
const isTrack=id=>typeof id==='string'&&Object.prototype.hasOwnProperty.call(TRACKS,id);
// the places with a song of their own: [key, name, what it covers]
const JB_PLACES=[['main','Main menu','And every screen without a song of its own'],['leaders','Leaderboard',''],['coll','Collection',''],
  ['market','Market',''],['crossroads','Crossroads','The room and the match'],['sd','Sudden Death','When a draw replays the match, in 1v1 and Crossroads']];
const JB_DEF={main:'discovery',leaders:'afterglow',coll:'open-sky',market:'market',crossroads:'crossroads',sd:'sudden-death',one:false};
// SAVE.jb, with anything missing or unknown put back to its default. Besides a track, a place can follow the main
// menu ('main'), and Sudden Death can leave the music as it is ('keep'). one: the main menu's song plays everywhere
function jbNorm(j){
  const o=j&&typeof j==='object'?j:{},out={one:o.one===true};
  for(const[k]of JB_PLACES){const v=o[k];out[k]=isTrack(v)||(k!=='main'&&v==='main')||(k==='sd'&&v==='keep')?v:JB_DEF[k]}
  return out;
}
const jb=()=>jbNorm(SAVE.jb);
// the track a place plays. base: where a Sudden Death is happening (a 1v1 match, or Crossroads), for 'keep'
function jbTrack(j,place,base='main'){
  if(j.one||place==='main'||!j[place])return j.main;
  if(place==='sd'&&j.sd==='keep')return jbTrack(j,base);
  return j[place]==='main'?j.main:j[place];
}

/* ---------- where the player is ---------- */
// [place, where its Sudden Death is] for the jukebox, or null to leave the music as it is: choosing a hand and the
// Forge use the collection's screen (they belong to the match or the market), and packs open from the menu or the market
function musicPlace(){
  const on=id=>{const s=document.getElementById('scr-'+id);return !!s&&s.classList.contains('on')};
  if(on('game'))return G&&G.sd>0&&!G.over?['sd','main']:['main'];
  if(on('duo')){const S=DUO.snap,sd=!!S&&(S.phase==='sd'||S.phase==='play'&&!!S.st&&S.st.sd>0);return sd?['sd','crossroads']:['crossroads']}
  if(on('duoroom'))return ['crossroads'];
  if(on('store'))return ['market'];
  if(on('coll'))return BH===CH?['coll']:null;
  if(on('packs'))return null;
  if(on('leaders'))return ['leaders'];
  return ['main'];
}

/* ---------- the player ---------- */
// want: music may play (after the first tap or key press). cur: the song playing {id, src, g (its gain), t0, off,
// ls, le}. pos: where each song stopped. data: downloads. buf: decoded songs. gen: the
// newest change asked for (an older one that finishes loading later is dropped). preview: a song the jukebox is playing
const MUS={want:false,cur:null,pos:{},data:{},buf:{},gen:0,preview:null};
function musicOn(){return !!(!SAVE.musicMute&&SAVE.musicVol)}
const musicGain=()=>.5*SAVE.musicVol/100;
function musicFetch(id){
  if(!MUS.data[id]){
    const p=MUS.data[id]=fetch(TRACKS[id].src).then(r=>{if(!r.ok)throw new Error(r.status);return r.arrayBuffer()});
    p.catch(()=>{if(MUS.data[id]===p)delete MUS.data[id]}); // a failed download is tried again next time
  }
  return MUS.data[id];
}
// download the main menu's song now; decoding needs the audio context, which waits for the first interaction
musicFetch(jbTrack(jb(),'main')).catch(()=>{});
// decoded songs take 25 to 60 MB each: only the ones in keep stay (the downloads stay, so a song dropped is
// decoded again quickly). A song still fading out keeps its own copy until it stops
function musicPrune(...keep){for(const x in MUS.buf)if(!keep.includes(x))delete MUS.buf[x]}
// a decoded song {b, first, ls, le}: the buffer, where it starts, and its loop
function musicLoad(id){
  if(MUS.buf[id])return MUS.buf[id];
  const T=TRACKS[id];
  // decoding takes the downloaded bytes away from it, so it gets a copy
  const p=MUS.buf[id]=musicFetch(id).then(d=>new Promise((ok,no)=>AC.decodeAudioData(d.slice(0),ok,no))).then(b=>{
    const sr=b.sampleRate;
    if(!T.loopAt)return {b,first:1,ls:1,le:Math.min(1+T.len,b.duration)};
    // Discovery: from the loop point to the end of the file, the opening plus the leftover tail fading out (cosine
    // curve), then on from just after that stretch of the opening
    const E=Math.round(T.loopAt*sr),F=b.length-E;
    for(let c=0;c<b.numberOfChannels;c++){const d=b.getChannelData(c);
      for(let j=0;j<F;j++)d[E+j]=d[j]+d[E+j]*.5*(1+Math.cos(Math.PI*j/F))}
    return {b,first:0,ls:F/sr,le:b.length/sr};
  });
  p.catch(()=>{if(MUS.buf[id]===p)delete MUS.buf[id]});
  return p;
}
// where in its song c is now: past the loop's end it wraps back to the loop's start
function musicAt(c){
  let p=c.off+Math.max(0,AC.currentTime-c.t0);
  if(p>=c.le)p=c.ls+(p-c.le)%(c.le-c.ls);
  return p;
}
function musicStart(id,L,fromTop){
  const src=AC.createBufferSource(),g=AC.createGain(),t=AC.currentTime+.05;
  let off=fromTop?L.first:MUS.pos[id]??L.first;
  if(!(off>=0&&off<L.le))off=L.first;
  src.buffer=L.b;src.loop=true;src.loopStart=L.ls;src.loopEnd=L.le;
  g.gain.value=0;g.gain.setValueAtTime(0,AC.currentTime); // a gain starts at 1: silent until its fade in
  src.connect(g).connect(AC.destination);src.start(t,off);
  return {id,src,g,t0:t,off,ls:L.ls,le:L.le};
}
// from wherever the volume is now, over dur seconds (to nothing while the tab is hidden)
function musicRamp(c,to,dur,hold=0){
  const g=c.g.gain,t=AC.currentTime;
  if(g.cancelAndHoldAtTime)g.cancelAndHoldAtTime(t);else{const v=g.value;g.cancelScheduledValues(t);g.setValueAtTime(v,t)}
  if(hold)g.setValueAtTime(g.value,t+hold);
  g.linearRampToValueAtTime(to,t+hold+dur);
}
const musicFadeIn=(c,dur)=>musicRamp(c,document.hidden?0:musicGain(),dur);
// a song going away: remember where it was, fade it out (after hold seconds) and stop it
function musicFadeOut(c,dur,hold=0){
  MUS.pos[c.id]=musicAt(c);
  musicRamp(c,0,dur,hold);
  try{c.src.stop(AC.currentTime+hold+dur+.05)}catch(e){}
}
// the song to play now {id, top: from its start}, or null to leave things as they are
function musicWanted(){
  if(MUS.preview&&document.getElementById('jbBox'))return {id:MUS.preview};
  const pl=musicPlace(),j=jb();
  if(!pl)return MUS.cur?null:{id:j.main};
  const id=jbTrack(j,pl[0],pl[1]);
  // a Sudden Death starts its song from the top
  return {id,top:pl[0]==='sd'};
}
// play the song this place should have, crossfading from the one playing (it keeps going until the new one is ready)
function musicUpdate(){
  if(!MUS.want||!AC)return;
  if(!musicOn()){musicHalt();return}
  const w=musicWanted();if(!w)return;
  const gen=++MUS.gen;
  if(MUS.cur&&MUS.cur.id===w.id)return;
  musicLoad(w.id).then(L=>{
    if(gen!==MUS.gen||!MUS.want||!musicOn()||MUS.cur&&MUS.cur.id===w.id)return;
    if(AC.state==='suspended')AC.resume();
    const old=MUS.cur;
    MUS.cur=musicStart(w.id,L,w.top);
    // the new song comes up while the old one holds a moment, then goes
    musicFadeIn(MUS.cur,old?1.4:.4);
    if(old)musicFadeOut(old,1.4,.35);
    // the song before stays decoded too, for going straight back
    musicPrune(w.id,old&&old.id);
    jbNowPaint();
  }).catch(()=>{});
}
// music off (muted or turned to 0): fade out, keeping the place
function musicHalt(){
  MUS.gen++;
  if(MUS.cur){musicFadeOut(MUS.cur,.6);MUS.cur=null;jbNowPaint()}
}
function musicPlay(){MUS.want=true;musicUpdate()}
// after a change to the music's volume or mute
function musicSync(){
  if(!musicOn()){musicHalt();return}
  if(MUS.cur)musicFadeIn(MUS.cur,.08);
  musicUpdate();
}
function audioUnlock(){
  removeEventListener('pointerdown',audioUnlock,true);removeEventListener('keydown',audioUnlock,true);
  try{AC=AC||new(window.AudioContext||window.webkitAudioContext)();if(AC.state==='suspended')AC.resume()}catch(e){return}
  sfxLoad();
  musicPlay();
}
addEventListener('pointerdown',audioUnlock,true);addEventListener('keydown',audioUnlock,true);
// fade out while the tab is hidden, back in when it returns
document.addEventListener('visibilitychange',()=>{if(MUS.cur)musicRamp(MUS.cur,document.hidden?0:musicGain(),document.hidden?.3:1)});
// the jukebox's "Now playing" line, when it's open (settings.js)
function jbNowPaint(){const el=document.getElementById('jbNow');if(el)el.textContent=MUS.cur?TRACKS[MUS.cur.id].name:musicOn()?'Nothing yet':'Music is off'}
