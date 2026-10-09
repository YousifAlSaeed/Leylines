'use strict';
/* =====================================================================
   ENGINE  (pure — used by UI, AI search and online sync)
   ===================================================================== */
// seeded random numbers: the same seed gives the same sequence on both online players' devices
// The state sits on the function (r.a), so a match in progress can be saved and picked up again (match.js).
function mulberry32(a){const r=()=>{let a=r.a|0;a=r.a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};r.a=a;return r}
const rand32=()=>(Math.random()*4294967296)>>>0;
function shuffle(a,r=Math.random){for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
// neighbours: [top,right,bottom,left]; side index d touches opposite side (d+2)&3
const NB=[...Array(9)].map((_,i)=>[i>=3?i-3:-1,i%3<2?i+1:-1,i<6?i+3:-1,i%3>0?i-1:-1]);
function newState(h0,h1,first,el){return{b:Array(9).fill(-1),o:Array(9).fill(-1),m:Array(9).fill(0),h:[h0.slice(),h1.slice()],turn:first,el}}
function cloneS(s){
  const c={b:s.b.slice(),o:s.o.slice(),m:s.m.slice(),h:[s.h[0].slice(),s.h[1].slice()],turn:s.turn,el:s.el};
  // Expedition matches (expedition.js) add: k = squares whose card can't be flipped, x = each square's own +/- for the
  // card placed there, nx = each player's bonus for their next card, pc = how many cards each player has placed
  if(s.k){c.k=s.k.slice();c.x=s.x.slice();c.nx=s.nx.slice();c.pc=s.pc.slice()}
  return c;
}
function isFull(s){return s.b.indexOf(-1)<0}
function score(s,p){let n=s.h[p].length;for(let i=0;i<9;i++)if(s.o[i]===p)n++;return n}

// does side value a (with its elemental +1/−1) beat b? Reverse: the lower number wins.
// Elemental still adds or takes 1, so with Reverse a −1 square helps and a +1 hurts.
// tie: equal numbers win too (the Expedition's Tiebreaker relic)
const beats=(R,a,b,tie)=>R.reverse?(tie?a<=b:a<b):(tie?a>=b:a>b);
const CORNERS=[0,2,6,8];
/* The Expedition's relics for each player: R.bon = [player 0's, player 1's], each null or
   {corner: + in corners, mid: + in the middle, first: + on the first card, lens: Elemental squares always +1,
    heart: Elemental squares +1 for a card with an element and −2 without, tie, combo: Combo is on for them,
    anchor: their first card can't be flipped}. The bonuses add to the card's modifier, like Elemental's. */
function placeMod(s,R,B,p,cell,C){
  let mod=0;
  if(R.elemental&&s.el[cell])mod=B&&B.lens?1:B&&B.heart?(C.e?1:-2):C.e===s.el[cell]?1:-1;
  if(!B)return mod;
  if(B.corner&&CORNERS.includes(cell))mod+=B.corner;
  if(B.mid&&cell===4)mod+=B.mid;
  if(B.first&&s.pc&&!s.pc[p])mod+=B.first;
  return mod;
}
/* Place hand card `hi` of the current player on `cell`. Mutates s.
   If `ev` is an array, pushes animation events: same / plus / basic / combo. */
function play(s,R,hi,cell,ev){
  const p=s.turn,q=1-p,id=s.h[p].splice(hi,1)[0],C=cardOf(id),S=C.s,nb=NB[cell],B=R.bon?R.bon[p]:null,tie=!!(B&&B.tie);
  s.b[cell]=id;s.o[cell]=p;
  let mod=placeMod(s,R,B,p,cell,C);
  if(s.k){
    mod+=s.x[cell];
    if(s.nx[p]){mod+=s.nx[p];s.nx[p]=0}
    if(B&&B.anchor&&!s.pc[p])s.k[cell]=1;
    s.pc[p]++;
  }
  s.m[cell]=mod;
  // can this square's card be flipped? (Expedition: roots, Bulwark, Anchor)
  const free=n=>!s.k||!s.k[n];
  let sp=[];
  if(R.same||R.plus){
    // Same / Plus compare printed values (elemental modifiers do not apply)
    let wall=0;const ents=[];
    for(let d=0;d<4;d++){
      const n=nb[d];
      if(n<0){if(R.sameWall&&S[d]===10)wall++;continue}
      if(s.b[n]<0)continue;
      ents.push([n,S[d],cardOf(s.b[n]).s[(d+2)&3]]);
    }
    let sameF=[],plusF=[];
    if(R.same){
      const m=ents.filter(e=>e[1]===e[2]);
      if(m.length+wall>=2)sameF=m.filter(e=>s.o[e[0]]===q&&free(e[0])).map(e=>e[0]);
    }
    if(R.plus&&ents.length>=2){
      for(const e of ents){
        const sum=e[1]+e[2];let k=0;
        for(const f of ents)if(f[1]+f[2]===sum)k++;
        if(k>=2&&s.o[e[0]]===q&&free(e[0])&&!sameF.includes(e[0]))plusF.push(e[0]);
      }
    }
    for(const c of sameF)s.o[c]=p;
    for(const c of plusF)s.o[c]=p;
    if(ev){if(sameF.length)ev.push({t:'same',cells:sameF});if(plusF.length)ev.push({t:'plus',cells:plusF})}
    sp=sameF.concat(plusF);
  }
  // basic capture
  const basic=[];
  for(let d=0;d<4;d++){
    const n=nb[d];
    if(n<0||s.b[n]<0||s.o[n]!==q||!free(n))continue;
    if(beats(R,S[d]+mod,cardOf(s.b[n]).s[(d+2)&3]+s.m[n],tie)){s.o[n]=p;basic.push(n)}
  }
  if(ev&&basic.length)ev.push({t:'basic',cells:basic});
  // combo chain from Same/Plus captures
  if(R.combo||B&&B.combo){
    let qu=sp;
    while(qu.length){
      const nx=[];
      for(const c of qu){
        const cs=cardOf(s.b[c]).s;
        for(let d=0;d<4;d++){
          const n=NB[c][d];
          if(n<0||s.b[n]<0||s.o[n]!==q||!free(n))continue;
          if(beats(R,cs[d]+s.m[c],cardOf(s.b[n]).s[(d+2)&3]+s.m[n],tie)){s.o[n]=p;nx.push(n)}
        }
      }
      if(ev&&nx.length)ev.push({t:'combo',cells:nx});
      qu=nx;
    }
  }
  s.turn=q;
}
// Three open: which of each player's 5 cards are face up (indexes into the hand as dealt)
const threePick=rng=>[0,1].map(()=>shuffle([0,1,2,3,4],rng).slice(0,3).sort());
// Chaos: which hand card the player to move must play
const chaosPick=(s,rng)=>Math.floor(rng()*s.h[s.turn].length);
// a best-of series is over once every match is played or the leader can't be caught (a draw counts for nobody)
const seriesDone=(bo,played,wins)=>played>=bo||Math.abs(wins[0]-wins[1])>bo-played;
function genElements(R,rng){
  const el=Array(9).fill(null);
  if(!R.elemental)return el;
  const n=1+Math.floor(rng()*4);
  const cells=shuffle([0,1,2,3,4,5,6,7,8],rng);
  for(let k=0;k<n;k++)el[cells[k]]=ELEM_KEYS[Math.floor(rng()*ELEM_KEYS.length)];
  return el;
}
