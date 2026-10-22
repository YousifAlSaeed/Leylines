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
// bar: one bar in seconds, phrase: how many bars make a phrase (where a song can be joined again, see musicStart).
// The others are seamless loops len seconds long. Each file holds a second of the loop's end, the loop, then a second
// of its start: they play from 1 s and loop from 1 s to 1 s + len, which stays exact even when a decoder adds a
// little silence at the front of an MP3 (any stretch that long inside the file is one whole turn of the loop).
const TRACKS={
  discovery:{name:'Discovery',src:'audio/theme.mp3',loopAt:167.4085,bar:240/173.48,phrase:8},
  'ley-lines':{name:'Ley Lines',src:'audio/music/ley-lines.mp3',len:3848727/44100,bar:240/88,phrase:8},
  crossroads:{name:'Crossroads',src:'audio/music/crossroads.mp3',len:80,bar:1.25,phrase:8},
  'sudden-death':{name:'Sudden Death',src:'audio/music/sudden-death.mp3',len:2688000/44100,bar:240/126,phrase:8},
  market:{name:'Market',src:'audio/music/market.mp3',len:3256615/44100,bar:240/78,phrase:4},
  'open-sky':{name:'Open Sky',src:'audio/music/open-sky.mp3',len:76.8,bar:2.4,phrase:8},
  afterglow:{name:'Afterglow',src:'audio/music/afterglow.mp3',len:3681391/44100,bar:240/92,phrase:8}};
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
// newest change asked for (an older one that finishes loading later is dropped). preview: a song the jukebox's player
// is playing; paused: its pause button is down (both end when the jukebox closes); last: the song playing before a pause.
// left: when each song was left for another place. held: songs stopped by a pause, mute or seek, which carry on exactly
const MUS={want:false,cur:null,pos:{},data:{},buf:{},gen:0,preview:null,paused:false,last:null,left:{},held:{}};
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
// Where a song starts, the way games do it. Arriving somewhere starts its song from the top: its opening is written to
// be heard first. Back within MEMORY seconds (a quick look somewhere else), it carries on from the start of the phrase
// it was in, never mid-phrase. A pause, a mute or a seek carries on exactly where it was. top: from the top, always
const MEMORY=45;
// wait: seconds before it starts (while the song before steps back)
function musicStart(id,L,top,wait=0){
  const src=AC.createBufferSource(),g=AC.createGain(),t=AC.currentTime+.05+wait,T=TRACKS[id],p=MUS.pos[id];
  let off=L.first;
  if(!top&&p!=null){
    if(MUS.held[id])off=p;
    else if(AC.currentTime-(MUS.left[id]??-1e9)<MEMORY){
      const len=songLen(id),ph=T.bar*T.phrase,at=((p-L.first)%len+len)%len;
      off=L.first+Math.floor(at/ph+1e-6)*ph;
    }
  }
  if(!(off>=0&&off<L.le))off=L.first;
  delete MUS.held[id];
  src.buffer=L.b;src.loop=true;src.loopStart=L.ls;src.loopEnd=L.le;
  g.gain.value=0;g.gain.setValueAtTime(0,AC.currentTime); // a gain starts at 1: silent until its fade in
  src.connect(g).connect(AC.destination);src.start(t,off);
  return {id,src,g,t0:t,off,ls:L.ls,le:L.le};
}
// from wherever the volume is now to `to`, after wait seconds, over dur seconds. The change follows an S-curve: it
// starts gently and settles gently, which the ear hears as an even fade (a straight line seems to hold, then drop)
function musicRamp(c,to,dur,wait=0){
  const g=c.g.gain,t=AC.currentTime;
  let v;
  if(g.cancelAndHoldAtTime){g.cancelAndHoldAtTime(t);v=g.value}else{v=g.value;g.cancelScheduledValues(t)}
  g.setValueAtTime(v,t);
  const n=64,curve=new Float32Array(n);
  for(let i=0;i<n;i++)curve[i]=v+(to-v)*(.5-.5*Math.cos(Math.PI*i/(n-1)));
  // the curve starts a moment after the value is pinned, so the two never fall on the same instant
  try{g.setValueCurveAtTime(curve,t+wait+.01,dur)}catch(e){g.setValueAtTime(v,t+wait+.01);g.linearRampToValueAtTime(to,t+wait+.01+dur)}
}
const musicFadeIn=(c,dur,wait)=>musicRamp(c,document.hidden?0:musicGain(),dur,wait);
// a song going away: remember where it was, fade it out (after wait seconds) and stop it. held: a pause, a mute or a
// seek, so it carries on exactly (otherwise it was left for another place)
function musicFadeOut(c,dur,held,wait=0){
  musicLeft(c,held);
  musicRamp(c,0,dur,wait);
  try{c.src.stop(AC.currentTime+wait+dur+.06)}catch(e){}
}
// where a song going away was, and why it went (see musicStart)
function musicLeft(c,held){
  MUS.pos[c.id]=musicAt(c);
  if(held)MUS.held[c.id]=true;else{delete MUS.held[c.id];MUS.left[c.id]=AC.currentTime}
}
// Moving from one song to the next. The moment another song is asked for, the one playing steps back to a quarter of
// its volume (DUCK, about -12 dB) over DUCK_T seconds, even before the next one has loaded. The next one starts once
// it has stepped back, coming up over FADE_IN, while the old one goes on down to nothing over FADE_OUT: the new
// song's first seconds are heard clearly, with the old one only faint behind them
const DUCK=.25,DUCK_T=.3,FADE_OUT=.6,FADE_IN=.25;
// the song playing steps back, or (the change it made room for didn't happen) comes forward again
function musicDuck(c,on){
  if(!c||!!c.duck===on)return;
  // a song still coming in (or quieter already) steps back no further up than where it is
  c.duck=on;c.duckLevel=document.hidden?0:on?Math.min(c.g.gain.value,musicGain()*DUCK):musicGain();
  musicRamp(c,c.duckLevel,on?DUCK_T:.4);
  c.duckEnd=on?AC.currentTime+.01+DUCK_T:0; // when it has finished stepping back
}
// the song stepping back for the next one: once it has stepped back (and not before at), on down to nothing, then stop.
// Added after the step back rather than replacing it, so a next song that was ready at once can't cut it short
function musicBowOut(c,at){
  musicLeft(c,false);
  const g=c.g.gain,from=Math.max(at,c.duckEnd+.005),v=c.duckLevel||0;
  if(c.duckEnd>AC.currentTime+.005){
    const n=64,curve=new Float32Array(n);
    for(let i=0;i<n;i++)curve[i]=v*(.5+.5*Math.cos(Math.PI*i/(n-1)));
    try{g.setValueCurveAtTime(curve,from,FADE_OUT)}catch(e){g.setValueAtTime(v,from);g.linearRampToValueAtTime(0,from+FADE_OUT)}
    try{c.src.stop(from+FADE_OUT+.06)}catch(e){}
  }else{musicRamp(c,0,FADE_OUT,Math.max(0,at-AC.currentTime));try{c.src.stop(at+FADE_OUT+.06)}catch(e){}}
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
  if(!musicOn()||MUS.paused){musicHalt();return}
  const w=musicWanted();if(!w)return;
  const gen=++MUS.gen;
  // the song this place wants is the one playing: if it had stepped back for a change that's off, it comes forward
  if(MUS.cur&&MUS.cur.id===w.id){musicDuck(MUS.cur,false);return}
  musicDuck(MUS.cur,true);
  const asked=AC.currentTime;
  musicLoad(w.id).then(L=>{
    if(gen!==MUS.gen||!MUS.want||!musicOn()||MUS.cur&&MUS.cur.id===w.id)return;
    if(AC.state==='suspended')AC.resume();
    const old=MUS.cur;
    // the new song waits until the old one has stepped back (no wait if loading took that long already)
    const wait=old?Math.max(0,DUCK_T-(AC.currentTime-asked)):0;
    MUS.cur=musicStart(w.id,L,w.top,wait);
    if(old){musicBowOut(old,AC.currentTime+wait);musicFadeIn(MUS.cur,FADE_IN,wait)}
    else musicFadeIn(MUS.cur,.3);
    // the song before stays decoded too, for going straight back
    musicPrune(w.id,old&&old.id);
    jbNowPaint();
  }).catch(()=>{if(gen===MUS.gen)musicDuck(MUS.cur,false)}); // the next song couldn't load: the one playing comes back up
}
// music off (muted or turned to 0): fade out, keeping the place
function musicHalt(){
  MUS.gen++;
  if(MUS.cur){MUS.last=MUS.cur.id;musicFadeOut(MUS.cur,.8,true);MUS.cur=null;jbNowPaint()}
}
function musicPlay(){MUS.want=true;musicUpdate()}
// after a change to the music's volume or mute
function musicSync(){
  if(!musicOn()){musicHalt();return}
  if(MUS.cur)musicRamp(MUS.cur,musicGain()*(MUS.cur.duck?DUCK:1),.1);
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
document.addEventListener('visibilitychange',()=>{if(MUS.cur)musicRamp(MUS.cur,document.hidden?0:musicGain()*(MUS.cur.duck?DUCK:1),document.hidden?.3:1)});

/* ---------- for the jukebox's player (settings.js) ---------- */
// a song's length, and where in its file it starts
const songLen=id=>TRACKS[id].len||TRACKS[id].loopAt;
const songFirst=id=>TRACKS[id].loopAt?0:1;
// the song the player shows: the one it asked for (even while that's still loading), the one playing, or (paused,
// or nothing yet) the one that would play. t: how far into it, in seconds of the song. playing: something is playing
function musicNow(){
  // a place that leaves the music as it is shows the song it was left playing
  const c=MUS.cur,pl=musicPlace(),id=MUS.preview||(c?c.id:pl?jbTrack(jb(),pl[0],pl[1]):MUS.last||jb().main),len=songLen(id);
  const p=c&&c.id===id?musicAt(c):MUS.pos[id];
  return {id,len,t:p==null?0:((p-songFirst(id))%len+len)%len,playing:!!c};
}
// jump to t seconds into the song the player shows (paused, it starts from there)
function musicSeek(t){
  const id=musicNow().id,c=MUS.cur;
  if(c&&c.id===id){MUS.cur=null;musicFadeOut(c,.12,true)}
  MUS.pos[id]=songFirst(id)+Math.max(0,Math.min(songLen(id)-.05,t));MUS.held[id]=true;
  if(!c||c.id!==id||!MUS.want||!musicOn()||MUS.paused)return;
  musicLoad(id).then(L=>{
    if(MUS.cur||!musicOn()||MUS.paused)return;
    MUS.cur=musicStart(id,L,false);musicFadeIn(MUS.cur,.12);jbNowPaint();
  }).catch(()=>{});
}
// play this song in the player, from its start
function musicListen(id){MUS.preview=id;MUS.paused=false;MUS.pos[id]=undefined;delete MUS.held[id];musicUpdate();jbNowPaint()}
function musicPause(on){MUS.paused=on;musicUpdate();jbNowPaint()}
// the jukebox closing: the place's own song comes back, from where it was
function musicListenEnd(){if(MUS.preview||MUS.paused){MUS.preview=null;MUS.paused=false;musicUpdate()}}
function jbNowPaint(){if(document.getElementById('jbBox')&&typeof jbpPaint==='function')jbpPaint()}
