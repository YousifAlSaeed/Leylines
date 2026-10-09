'use strict';
/* =====================================================================
   4-PLAYER ENGINE  (pure — the online 2v2 and Free-for-all modes, duo.js)
   ===================================================================== */
// A 4×4 board and 4 seats, numbered clockwise: 0 bottom, 1 left, 2 top, 3 right.
// 16 squares for 20 cards: everyone places 4 and keeps 1. A flipped card belongs to the seat that flipped it.
// 2v2 (R.ffa off): seats 0 and 2 are one team, 1 and 3 the other. Turns go 0 → 1 → 2 → 3, so every turn switches
//   team, the same rhythm as 1v1, and partners' cards never flip each other.
// Free-for-all (R.ffa on): every seat plays for itself. The first player moves one seat on each round, so over the
//   4 rounds everyone opens once and closes once, and nobody plays two turns in a row.
const DUO_SEATS=4;
const duoTeam=p=>p&1;
// who a seat plays for: its team in 2v2, itself in Free-for-all
const duoSide=(R,p)=>R.ffa?p:p&1;
// whose turn move n is (0..15)
const duoTurnAt=(s,R,n)=>R.ffa?(s.first+(n>>2)+(n&3))%4:(s.first+n)%4;
// neighbours on the 4×4 board: [top,right,bottom,left]; side d touches the neighbour's side (d+2)&3
const DNB=[...Array(16)].map((_,i)=>[i>=4?i-4:-1,i%4<3?i+1:-1,i<12?i+4:-1,i%4>0?i-1:-1]);
// the rows and columns: a Ley line is one of them filled by one team
const DUO_LINES=[0,1,2,3].flatMap(k=>[[0,1,2,3].map(c=>k*4+c),[0,1,2,3].map(r=>r*4+k)]);
// the rules a 2v2 room can turn on (no trades, series, sudden death, Chaos or Three open for now)
const DUO_RULES=[
  ['leyLines','Ley lines','Fill a whole row or column with your cards (your team\'s, in 2v2) and it seals: those 4 cards can\'t be flipped again.'],
  ['open','Open','Every hand is played face up. In 2v2 your partner\'s hand is always face up for you.'],
  ['same','Same','Two or more sides equal to the cards they touch flip those enemy cards.'],
  ['sameWall','Same wall','The board edge counts as an X (10) for Same.'],
  ['plus','Plus','Two or more touching pairs with the same total flip those enemy cards.'],
  ['combo','Combo','Cards flipped by Same or Plus flip their weaker enemy neighbours, and it can chain.'],
  ['elemental','Elemental','2 to 6 squares get an element: +1 for a card of that element, −1 for any other.'],
  ['reverse','Reverse','Lower numbers win. A 1 beats a 2, and X is the weakest.']];
const DUO_TIMERS=[0,20,30,45,60];
const duoDefRules=()=>({ffa:false,leyLines:false,open:false,same:false,sameWall:false,plus:false,combo:false,elemental:false,reverse:false,timer:30});

// b: card ids, o: the seat that owns each square, m: elemental +1/−1, k: sealed by a Ley line, n: moves made
// first: the seat that opened the match (Free-for-all's turn order counts from it)
function duoNew(hands,first,el){return{b:Array(16).fill(-1),o:Array(16).fill(-1),m:Array(16).fill(0),k:Array(16).fill(0),h:hands.map(h=>h.slice()),turn:first,first,el,n:0}}
function duoClone(s){return{b:s.b.slice(),o:s.o.slice(),m:s.m.slice(),k:s.k.slice(),h:s.h.map(h=>h.slice()),turn:s.turn,first:s.first,el:s.el,n:s.n}}
const duoFull=s=>s.n>=16;
// a team's score: the squares its two seats own plus the cards still in their hands
function duoScore(s,t){let n=s.h[t].length+s.h[t+2].length;for(let i=0;i<16;i++)if(s.o[i]>=0&&duoTeam(s.o[i])===t)n++;return n}
// either mode: the score of a side (a team in 2v2, a seat in Free-for-all)
function duoPts(s,R,side){
  if(!R.ffa)return duoScore(s,side);
  let n=s.h[side].length;for(let i=0;i<16;i++)if(s.o[i]===side)n++;return n;
}
// Free-for-all places: 1 + how many players scored more, so tied players share a place
const duoPlaces=pts=>pts.map(v=>1+pts.filter(w=>w>v).length);
function duoElements(R,rng){
  const el=Array(16).fill(null);
  if(!R.elemental)return el;
  const n=2+Math.floor(rng()*5),cells=shuffle([...Array(16).keys()],rng);
  for(let k=0;k<n;k++)el[cells[k]]=ELEM_KEYS[Math.floor(rng()*ELEM_KEYS.length)];
  return el;
}
/* The seat to move places hand card `hi` on `cell`. Mutates s.
   If `ev` is an array, pushes events for the animation: same / plus / basic / combo / seal. */
function duoPlay(s,R,hi,cell,ev){
  const p=s.turn,t=duoSide(R,p),id=s.h[p].splice(hi,1)[0],S=CARDS[id].s,nb=DNB[cell];
  // a card that can be flipped by this move: an enemy's, not sealed
  const foe=n=>s.b[n]>=0&&duoSide(R,s.o[n])!==t&&!s.k[n];
  s.b[cell]=id;s.o[cell]=p;
  const mod=(R.elemental&&s.el[cell])?(CARDS[id].e===s.el[cell]?1:-1):0;
  s.m[cell]=mod;
  let sp=[];
  if(R.same||R.plus){
    // Same / Plus compare printed values; any touching card counts toward the match, only enemy cards flip
    let wall=0;const ents=[];
    for(let d=0;d<4;d++){
      const n=nb[d];
      if(n<0){if(R.sameWall&&S[d]===10)wall++;continue}
      if(s.b[n]<0)continue;
      ents.push([n,S[d],CARDS[s.b[n]].s[(d+2)&3]]);
    }
    let sameF=[],plusF=[];
    if(R.same){const m=ents.filter(e=>e[1]===e[2]);if(m.length+wall>=2)sameF=m.filter(e=>foe(e[0])).map(e=>e[0])}
    if(R.plus&&ents.length>=2)for(const e of ents){
      const sum=e[1]+e[2];let k=0;
      for(const f of ents)if(f[1]+f[2]===sum)k++;
      if(k>=2&&foe(e[0])&&!sameF.includes(e[0]))plusF.push(e[0]);
    }
    for(const c of sameF.concat(plusF))s.o[c]=p;
    if(ev){if(sameF.length)ev.push({t:'same',cells:sameF});if(plusF.length)ev.push({t:'plus',cells:plusF})}
    sp=sameF.concat(plusF);
  }
  const basic=[];
  for(let d=0;d<4;d++){
    const n=nb[d];
    if(n>=0&&foe(n)&&beats(R,S[d]+mod,CARDS[s.b[n]].s[(d+2)&3]+s.m[n])){s.o[n]=p;basic.push(n)}
  }
  if(ev&&basic.length)ev.push({t:'basic',cells:basic});
  if(R.combo){
    let qu=sp;
    while(qu.length){
      const nx=[];
      for(const c of qu){
        const cs=CARDS[s.b[c]].s;
        for(let d=0;d<4;d++){const n=DNB[c][d];if(n>=0&&foe(n)&&beats(R,cs[d]+s.m[c],CARDS[s.b[n]].s[(d+2)&3]+s.m[n])){s.o[n]=p;nx.push(n)}}
      }
      if(ev&&nx.length)ev.push({t:'combo',cells:nx});
      qu=nx;
    }
  }
  // Ley lines: a full row or column in one side's colour seals (checked after the flips, so a line can't seal half-flipped)
  if(R.leyLines)for(const L of DUO_LINES){
    if(L.every(i=>s.k[i])||!L.every(i=>s.b[i]>=0&&duoSide(R,s.o[i])===duoSide(R,s.o[L[0]])))continue;
    L.forEach(i=>s.k[i]=1);
    if(ev)ev.push({t:'seal',cells:L.slice()});
  }
  s.n++;s.turn=duoTurnAt(s,R,s.n);
}

/* ---------- CPU ---------- */
// what a seat may know: its own hand (and its partner's in 2v2); everyone else's only with Open (else average stand-ins)
function duoView(s,R,p){
  const v=duoClone(s);
  if(!R.open)for(let q=0;q<4;q++)if(duoSide(R,q)!==duoSide(R,p))v.h[q]=v.h[q].map(()=>STAND_IN);
  return v;
}
function duoMoves(s){
  const empty=[],seen=new Set(),res=[];
  for(let i=0;i<16;i++)if(s.b[i]<0)empty.push(i);
  s.h[s.turn].forEach((id,hi)=>{if(seen.has(id))return;seen.add(id);for(const c of empty)res.push([hi,c])});
  return res;
}
// how good the board is for side t: the score gap, plus strong open sides (weak ones are liabilities).
// In Free-for-all the gap is against the other three on average, so any one rival's card counts a third as much.
function duoEval(s,t,R){
  const w=R.ffa?1/3:1;
  let diff;
  if(R.ffa){diff=0;for(let q=0;q<4;q++)diff+=q===t?duoPts(s,R,q):-w*duoPts(s,R,q)}
  else diff=duoScore(s,t)-duoScore(s,1-t);
  if(duoFull(s))return diff*100;
  let pos=0;const k=R.reverse?-1:1;
  for(let i=0;i<16;i++){
    if(s.b[i]<0||s.k[i])continue;
    const sign=duoSide(R,s.o[i])===t?1:-w,cs=CARDS[s.b[i]].s;
    for(let d=0;d<4;d++){const n=DNB[i][d];if(n>=0&&s.b[n]<0)pos+=sign*k*(cs[d]+s.m[i]-5.5)*.045}
  }
  return diff+pos;
}
const duoAfter=(s,R,m)=>{const c=duoClone(s);duoPlay(c,R,m[0],m[1],null);return c};
// one step ahead: how each move leaves the board
function duoLook1(s,R,t,moves){return moves.map(m=>({m,v:duoEval(duoAfter(s,R,m),t,R)+Math.random()*.01})).sort((a,b)=>b.v-a.v)}
// two steps ahead: each move, then the next player's best answer for themselves (always an opponent: in 2v2 the
// next seat is the other team's, and in Free-for-all everyone is), and how that leaves the board for us
function duoLook2(s,R,t,moves){
  return moves.map(m=>{
    const c=duoAfter(s,R,m);
    if(duoFull(c))return{m,v:duoEval(c,t,R)};
    const them=duoSide(R,c.turn);let best=-Infinity,v=duoEval(c,t,R); // (v stays put if the next player has nothing to play)
    for(const r of duoMoves(c)){const a=duoAfter(c,R,r),u=duoEval(a,them,R);if(u>best){best=u;v=duoEval(a,t,R)}}
    return{m,v:v+Math.random()*.01};
  }).sort((a,b)=>b.v-a.v);
}
// not thinking: grab a random card and put it somewhere, taking a flip if one is right there (most of the time)
function duoCareless(s,R,p,moves,rnd){
  const hi=Math.floor(rnd()*s.h[p].length),mine=moves.filter(m=>s.h[p][m[0]]===s.h[p][hi]);
  const flips=mine.map(m=>{const c=duoAfter(s,R,m);let n=0;for(let i=0;i<16;i++)if(s.o[i]>=0&&c.o[i]!==s.o[i])n++;return{m,n}});
  const best=Math.max(...flips.map(f=>f.n));
  const pool=best>0&&rnd()<.6?flips.filter(f=>f.n===best):flips;
  return pool[Math.floor(rnd()*pool.length)].m;
}
/* Easy plays like a casual player: about half its turns it looks one move ahead (and doesn't always take the best),
   the other half it doesn't think (duoCareless).
   Normal looks one move ahead, and some turns two (its move and the next player's answer); about 1 turn in 10 it
   slips and doesn't think either, so it can be beaten.
   rnd is only for tests; returns [hand index, square]. */
const DUO_CPU={easy:{think:.5},normal:{slip:.1,deep:.4}};
function duoChoose(st,R,level,rnd=Math.random){
  const p=st.turn,t=duoSide(R,p),s=duoView(st,R,p),moves=duoMoves(s);
  if(level==='easy'){
    if(rnd()>=DUO_CPU.easy.think)return duoCareless(s,R,p,moves,rnd);
    const sc=duoLook1(s,R,t,moves),r=rnd();
    return sc[r<.7||sc.length<2?0:r<.9||sc.length<3?1:2].m;
  }
  if(rnd()<DUO_CPU.normal.slip)return duoCareless(s,R,p,moves,rnd);
  const sc=rnd()<DUO_CPU.normal.deep?duoLook2(s,R,t,moves):duoLook1(s,R,t,moves);
  return sc[0].m;
}
// a CPU's deck: Easy brings 1★ cards, Normal 1–2★ (the same as Solo)
const duoCpuDeck=level=>aiDeck(level==='easy'?'easy':'normal');
