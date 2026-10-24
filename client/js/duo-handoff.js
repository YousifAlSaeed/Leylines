'use strict';
/* =====================================================================
   CROSSROADS HOST HAND-OFF  (pure — duo.js): the locked copy of the match, and who takes over
   ===================================================================== */
// When the host leaves, closes the game or drops out, the match moves to another player's device, the heir, and goes on.
// So that can happen even if the host's game dies without a word, the heir always holds a copy of the whole match: every
// hand, so it can carry on. The copy is locked, and the key is with the other players (the keepers), not the heir:
// a keeper only hands it over once it has lost the host too. So nobody can peek at hidden hands while the host plays.
// With just the host and the heir there's no one else to hold the key, so the heir keeps it (and never opens the copy
// before it takes over).
const DUO_Z='duo1'; // the copy's mark: a key that opens it to anything else is the wrong key

// ChaCha20 (RFC 8439), the stream cipher that locks the copy. Plain JS rather than WebCrypto, which is async and
// missing on plain http (a game opened by its LAN address). key: 32 bytes, nonce: 12; returns data XOR the key stream
function duoChacha(key,nonce,data,counter=1){
  const w=(b,o)=>b[o]|b[o+1]<<8|b[o+2]<<16|b[o+3]<<24,rot=(v,c)=>v<<c|v>>>(32-c);
  const s=new Uint32Array(16),x=new Uint32Array(16),out=new Uint8Array(data.length);
  s[0]=0x61707865;s[1]=0x3320646e;s[2]=0x79622d32;s[3]=0x6b206574;
  for(let i=0;i<8;i++)s[4+i]=w(key,i*4);
  s[12]=counter;for(let i=0;i<3;i++)s[13+i]=w(nonce,i*4);
  const qr=(a,b,c,d)=>{x[a]+=x[b];x[d]=rot(x[d]^x[a],16);x[c]+=x[d];x[b]=rot(x[b]^x[c],12);x[a]+=x[b];x[d]=rot(x[d]^x[a],8);x[c]+=x[d];x[b]=rot(x[b]^x[c],7)};
  for(let off=0;off<data.length;off+=64){
    x.set(s);
    for(let r=0;r<10;r++){qr(0,4,8,12);qr(1,5,9,13);qr(2,6,10,14);qr(3,7,11,15);qr(0,5,10,15);qr(1,6,11,12);qr(2,7,8,13);qr(3,4,9,14)}
    for(let i=0;i<16;i++)x[i]+=s[i];
    for(let i=0;i<64&&off+i<data.length;i++)out[off+i]=data[off+i]^(x[i>>2]>>>((i&3)*8)&255);
    s[12]++;
  }
  return out;
}
const duoB64=u=>{let s='';for(let i=0;i<u.length;i++)s+=String.fromCharCode(u[i]);return btoa(s)};
const duoUnB64=s=>{const t=atob(s),u=new Uint8Array(t.length);for(let i=0;i<t.length;i++)u[i]=t.charCodeAt(i);return u};
const duoRandom=n=>crypto.getRandomValues(new Uint8Array(n));
const duoNewKey=()=>duoB64(duoRandom(32));
// lock: {n: the nonce, d: the locked match}, both base64. A fresh nonce every time, so two copies never share a key stream
function duoSeal(obj,key){
  const n=duoRandom(12);
  return{n:duoB64(n),d:duoB64(duoChacha(duoUnB64(key),n,new TextEncoder().encode(JSON.stringify(obj))))};
}
// unlock: the match, or null for a wrong key or a damaged copy
function duoUnseal(box,key){
  try{
    const o=JSON.parse(new TextDecoder().decode(duoChacha(duoUnB64(key),duoUnB64(box.n),duoUnB64(box.d))));
    return o&&o.z===DUO_Z?o:null;
  }catch(e){return null}
}

// The heir: a player who is here and whose game can take over (ok). The host's partner first in 2v2, then round the
// table; a computer before a phone (pc), since a phone put away stops running the game. -1: nobody can
function duoPickHeir(seats,me,ok,pc){
  const can=[(me+2)%4,(me+1)%4,(me+3)%4].filter(i=>seats[i]&&seats[i].kind==='human'&&!seats[i].away&&ok(i));
  const i=can.find(pc);
  return i!=null?i:can.length?can[0]:-1;
}
// The keepers: everyone else who is here and can (the heir needs only one of them to agree the host is gone)
const duoPickKeepers=(seats,me,heir,ok)=>heir<0?[]:[0,1,2,3].filter(i=>i!==me&&i!==heir&&seats[i]&&seats[i].kind==='human'&&!seats[i].away&&ok(i));

// The clocks a new host carries on with, from the last snapshot it had (S) and how long the old host kept going after
// it (since, ms): the turn timer's time left and each dropped player's minute. The gap without a host doesn't count.
function duoClocksFrom(S,since){
  const tm={left:0,aw:{},n:S&&S.st?S.st.n:-1,sd:0};
  if(!S)return tm;
  since=Math.max(0,since||0);
  if(S.phase==='play'&&S.timeLeft)tm.left=Math.max(0,S.timeLeft-since);
  S.seats.forEach((s,k)=>{if(s.away&&!s.bot)tm.aw[k]=Math.max(0,(s.left||0)*1000-since)});
  return tm;
}
