'use strict';
/* =====================================================================
   THE OWL'S REVIEW: the search and the grades (review.js draws them)
   After a match every hand is known, so the owl can score every move exactly: the game's own rules, searched
   to the last square. A move's value is the final score difference (the mover's cards minus the other
   player's) if both play perfectly from there on. The 10 cards always add up to 10, so values are even and
   one card changing hands moves a value by 2.
   The page runs it in a Web Worker (the bottom of this file) so the screen stays smooth; without one it runs
   it itself, a position at a time.
   With Chaos the move's card was picked for the player, so only its squares are compared; later turns are
   searched as if each player picked their card (the owl can't know which cards Chaos would have picked).
   ===================================================================== */

/* ---------- the search ---------- */
// One round of a match: its rules, Elemental squares, both hands as dealt and who goes first. The board is kept
// in typed arrays and moves are played and taken back in place (play() in engine.js makes a new state each
// time, far too slow for millions of positions), with a table of positions already searched.
// Hand cards are slots 0–4 of the hands as dealt; of two copies of a card the lower free slot is played.
function owlSolver(R,el,h0,h1,first,bits=21){
  const NC=CARDS.length,S=new Int8Array(NC*4),CE=new Int8Array(NC),ek=[...new Set(CARDS.map(c=>c.e).concat(el).filter(Boolean))];
  CARDS.forEach((c,i)=>{for(let d=0;d<4;d++)S[i*4+d]=c.s[d];CE[i]=c.e?ek.indexOf(c.e):-1});
  const EL=new Int8Array(9).map((_,i)=>el[i]?ek.indexOf(el[i]):-1),NBF=new Int8Array(36);
  for(let i=0;i<9;i++)for(let d=0;d<4;d++)NBF[i*4+d]=NB[i][d];
  const rev=!!R.reverse,same=!!R.same,plus=!!R.plus,wall=!!R.sameWall,combo=!!R.combo,elem=!!R.elemental;
  const win=rev?(a,b)=>a<b:(a,b)=>a>b;
  const b=new Int16Array(9).fill(-1),o=new Int8Array(9).fill(-1),m=new Int8Array(9);
  const H=[h0,h1].map(h=>Int16Array.from(h)),hn=[h0.length,h1.length],used=[0,0];
  let turn=first,empty=9;
  // a position's two 32-bit keys: a random number for each (square, card, owner), each hand slot played, and whose turn
  let seed=0x2545F491;
  const rnd=()=>{seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return(t^t>>>14)>>>0};
  const ZA=new Uint32Array(9*NC*2).map(rnd),ZB=new Uint32Array(9*NC*2).map(rnd),MA=new Uint32Array(11).map(rnd),MB=new Uint32Array(11).map(rnd);
  let ha=0,hb=0;
  if(turn){ha^=MA[10];hb^=MB[10]}
  // the table: both keys, the value, what it is (1 exact, 2 at least, 3 at most), the best move found, and squares left
  const SZ=1<<bits,MK=SZ-1,TA=new Int32Array(SZ),TB=new Int32Array(SZ),TV=new Int8Array(SZ),TF=new Uint8Array(SZ),TM=new Uint8Array(SZ),TE=new Uint8Array(SZ);
  // squares flipped, in order, so a move can be taken back
  const FL=new Int8Array(256);let fp=0;
  const ents=new Int8Array(12),sp=new Int8Array(9),qa=new Int8Array(9),qb=new Int8Array(9);
  const MV=[...Array(10)].map(()=>new Uint8Array(64)),SC=[...Array(10)].map(()=>new Int8Array(64));
  function flip(c,p){o[c]=p;const k=(c*NC+b[c])*2;ha^=ZA[k+1-p]^ZA[k+p];hb^=ZB[k+1-p]^ZB[k+p];FL[fp++]=c}
  // the same rules as play() in engine.js (a test checks they agree); returns the mark to take it back to
  function put(i,cell){
    const p=turn,q=1-p,id=H[p][i],mark=fp,s0=id*4,nb=cell*4;
    used[p]|=1<<i;ha^=MA[p*5+i];hb^=MB[p*5+i];
    b[cell]=id;o[cell]=p;const z=(cell*NC+id)*2+p;ha^=ZA[z];hb^=ZB[z];
    const mod=elem&&EL[cell]>=0?(CE[id]===EL[cell]?1:-1):0;m[cell]=mod;
    let ns=0;
    if(same||plus){
      // Same and Plus compare printed values
      let w=0,ne=0;
      for(let d=0;d<4;d++){const n=NBF[nb+d];if(n<0){if(wall&&S[s0+d]===10)w++;continue}if(b[n]<0)continue;
        ents[ne*3]=n;ents[ne*3+1]=S[s0+d];ents[ne*3+2]=S[b[n]*4+((d+2)&3)];ne++}
      let sf=0,pf=0;
      if(same){let k=0;for(let e=0;e<ne;e++)if(ents[e*3+1]===ents[e*3+2])k++;
        if(k+w>=2)for(let e=0;e<ne;e++)if(ents[e*3+1]===ents[e*3+2]&&o[ents[e*3]]===q)sf|=1<<ents[e*3]}
      if(plus&&ne>=2)for(let e=0;e<ne;e++){const sum=ents[e*3+1]+ents[e*3+2],n=ents[e*3];let k=0;
        for(let f=0;f<ne;f++)if(ents[f*3+1]+ents[f*3+2]===sum)k++;
        if(k>=2&&o[n]===q&&!(sf>>n&1))pf|=1<<n}
      for(let e=0;e<ne;e++)if(sf>>ents[e*3]&1)sp[ns++]=ents[e*3];
      for(let e=0;e<ne;e++)if(pf>>ents[e*3]&1)sp[ns++]=ents[e*3];
      for(let k=0;k<ns;k++)flip(sp[k],p);
    }
    for(let d=0;d<4;d++){const n=NBF[nb+d];if(n<0||b[n]<0||o[n]!==q)continue;
      if(win(S[s0+d]+mod,S[b[n]*4+((d+2)&3)]+m[n]))flip(n,p)}
    if(combo&&ns){
      let cur=qa,nxt=qb,nc=ns;for(let k=0;k<ns;k++)cur[k]=sp[k];
      while(nc){let nn=0;
        for(let k=0;k<nc;k++){const c=cur[k],cs=b[c]*4;
          for(let d=0;d<4;d++){const n=NBF[c*4+d];if(n<0||b[n]<0||o[n]!==q)continue;
            if(win(S[cs+d]+m[c],S[b[n]*4+((d+2)&3)]+m[n])){flip(n,p);nxt[nn++]=n}}}
        const t=cur;cur=nxt;nxt=t;nc=nn}
    }
    turn=q;empty--;ha^=MA[10];hb^=MB[10];
    return mark;
  }
  function take(i,cell,mark){
    turn=1-turn;empty++;ha^=MA[10];hb^=MB[10];const p=turn;
    while(fp>mark){const c=FL[--fp],k=(c*NC+b[c])*2;o[c]=1-p;ha^=ZA[k+p]^ZA[k+1-p];hb^=ZB[k+p]^ZB[k+1-p]}
    const z=(cell*NC+b[cell])*2+p;ha^=ZA[z];hb^=ZB[z];
    b[cell]=-1;o[cell]=-1;m[cell]=0;used[p]&=~(1<<i);ha^=MA[p*5+i];hb^=MB[p*5+i];
  }
  const left=k=>{let n=hn[k],u=used[k];while(u){u&=u-1;n--}return n};
  // the board is full: the mover's cards minus the other player's (owned squares and cards still in hand)
  function final(){const p=turn;let d=left(p)-left(1-p);for(let i=0;i<9;i++)d+=o[i]===p?1:-1;return d}
  // the moves of the player to move into MV[empty]: slot × 9 + square, each different card once (only `only` when given)
  function moves(only){
    const p=turn,h=H[p],u=used[p],mv=MV[empty];let n=0;
    for(let i=0;i<hn[p];i++){
      if(u>>i&1||only!=null&&h[i]!==only)continue;
      let dup=false;for(let j=0;j<i;j++)if(!(u>>j&1)&&h[j]===h[i]){dup=true;break}
      if(!dup)for(let c=0;c<9;c++)if(b[c]<0)mv[n++]=i*9+c;
    }
    return n;
  }
  // alpha-beta (negamax) to the end of the round, fail-soft: a result outside (a, z) is still a true bound
  function search(a,z){
    if(!empty)return final();
    const x=ha&MK;let tm=255;
    if(TF[x]&&TA[x]===ha&&TB[x]===hb){const v=TV[x],f=TF[x];tm=TM[x];
      if(f===1)return v;if(f===2){if(v>=z)return v;if(v>a)a=v}else if(v<=a)return v;else if(v<z)z=v}
    const a0=a,mv=MV[empty],n=moves();
    // try first the move the table remembers, then (with 4 or more squares left) the ones that flip most right away
    if(empty>=4){
      const sc=SC[empty];
      for(let k=0;k<n;k++){const i=mv[k]/9|0,c=mv[k]%9,mk=put(i,c);sc[k]=fp-mk+(mv[k]===tm?50:0);take(i,c,mk)}
      for(let k=1;k<n;k++){const v=mv[k],s=sc[k];let j=k-1;while(j>=0&&sc[j]<s){mv[j+1]=mv[j];sc[j+1]=sc[j];j--}mv[j+1]=v;sc[j+1]=s}
    }else if(tm!==255)for(let k=1;k<n;k++)if(mv[k]===tm){mv[k]=mv[0];mv[0]=tm;break}
    let best=-99,bm=mv[0];
    for(let k=0;k<n;k++){
      const i=mv[k]/9|0,c=mv[k]%9,mk=put(i,c),v=-search(-z,-a);take(i,c,mk);
      if(v>best){best=v;bm=mv[k]}
      if(v>a)a=v;
      if(a>=z)break;
    }
    if(!TF[x]||TA[x]!==ha||TB[x]!==hb||TE[x]<=empty){TA[x]=ha;TB[x]=hb;TV[x]=best;TF[x]=best<=a0?3:best>=z?2:1;TM[x]=bm;TE[x]=empty}
    return best;
  }
  // the exact value of the position: halve the range -10…10 with yes/no searches ("at least t?")
  function exact(){
    let lo=-10,hi=10;
    while(lo<hi){
      const t=lo+2*Math.ceil((hi-lo)/4),s=search(t-1,t);
      if(s>=t)lo=Math.max(t,s);else hi=Math.min(t-2,s);
    }
    return lo;
  }
  // a move's exact value, given the best value here (no move can beat it): step down from there
  function value(i,cell,best){
    const mk=put(i,cell);let t=best;
    while(t>-10){const s=search(-t,1-t);if(s<=-t)break;t=Math.min(t-2,0-s)}
    take(i,cell,mk);return t;
  }
  // can the next player flip the card this move puts down, right away?
  function open(i,cell){
    const mk=put(i,cell),p=1-turn,mv=MV[empty],n=moves();let hit=false;
    for(let k=0;k<n&&!hit;k++){const j=mv[k]/9|0,c=mv[k]%9,mk2=put(j,c);hit=o[cell]!==p;take(j,c,mk2)}
    take(i,cell,mk);return hit;
  }
  return{
    get turn(){return turn},
    get empty(){return empty},
    exact,value,open,
    // the lowest free slot of card id in the hand of the player to move
    slot(id){const p=turn;for(let i=0;i<hn[p];i++)if(!(used[p]>>i&1)&&H[p][i]===id)return i;return -1},
    // every different move of the player to move: [card, square, slot] (only card `only` when given)
    list(only){const n=moves(only),mv=MV[empty],out=[];for(let k=0;k<n;k++){const i=mv[k]/9|0;out.push([H[turn][i],mv[k]%9,i])}return out},
    // cards flipped by a move, right away
    flips(i,cell){const mk=put(i,cell),n=fp-mk;take(i,cell,mk);return n},
    play(i,cell){put(i,cell)},
  };
}

/* ---------- reading a match ---------- */
// One round of a match (G.ser.rev, match.js): {h: [hand, hand] as dealt, first, el, moves: [[hand index, square]]}.
// A job reads it a position at a time (step() is false once it's done). Each position, before move k:
// {p: who moves, best: the best value there, n: how many different moves there were,
//  mv: [[card, square, value, cards it flips right away, can it be flipped right back (1/0)]], pl: [card, square] played, v: its value}
// The value after one move is the best value of the next position, turned round, so only the first needs its own search.
function owlJob(R,round,bits){
  const so=owlSolver(R,round.el,round.h[0],round.h[1],round.first,bits);
  const h=[round.h[0].slice(),round.h[1].slice()],out=[];
  // top: the best value with any card (with Chaos, the moves of the picked card can only do as well or worse)
  let k=0,top=null;
  return{
    out,
    step(){
      if(k>=round.moves.length)return false;
      const p=so.turn,[hi,cell]=round.moves[k],id=h[p][hi];
      if(top==null)top=so.exact();
      const mv=so.list(R.chaos?id:null).map(([c,sq,i])=>[c,sq,so.value(i,sq,top)|0,so.flips(i,sq),so.open(i,sq)?1:0]);
      const me=mv.find(x=>x[0]===id&&x[1]===cell);
      out.push({p,best:Math.max(...mv.map(x=>x[2])),n:mv.length,mv,pl:[id,cell],v:me[2]});
      so.play(so.slot(id),cell);h[p].splice(hi,1);
      top=0-me[2];k++;
      return k<round.moves.length;
    },
  };
}
// roughly how long each position takes (the first by far the longest), for the progress bar
const OWL_COST=[60,14,4,1.5,.6,.3,.2,.1,.1];

/* ---------- the grades ---------- */
// how likely a value is to end in a win (draw = .5), as for a player who doesn't play perfectly:
// a card means more when the game is close (5–5 into 4–6) than when it isn't (9–1 into 8–2)
const owlEp=v=>1/(1+Math.exp(-v/4));
// [key, glyph, name], best first
const OWL_CLS=[['brilliant','!!','Brilliant'],['great','!','Great'],['best','★','Best'],['excellent','👍','Excellent'],['good','✓','Good'],
  ['inaccuracy','?!','Inaccuracy'],['mistake','?','Mistake'],['miss','✕','Miss'],['blunder','??','Blunder'],['forced','→','Forced']];
const OWL_BAD=['inaccuracy','mistake','blunder','miss'];
// what a move gave away, as a share of a win
const owlDrop=x=>owlEp(x.best)-owlEp(x.v);
// one move's grade. prev: the move just before it (the other player's), already graded
function owlClass(x,prev,k){
  if(x.n===1)return 'forced';
  const drop=owlDrop(x);
  if(x.v===x.best){
    // the only move that keeps the result: every other one costs at least an Inaccuracy
    const rest=x.mv.filter(y=>y[0]!==x.pl[0]||y[1]!==x.pl[1]).map(y=>y[2]);
    if(x.n<3||owlEp(x.best)-owlEp(Math.max(...rest))<.115)return 'best';
    // ...and it looks wrong: it flips less than another move would, or lets its card be flipped right back.
    // Not in the last three moves, where there's little left to see
    const me=x.mv.find(y=>y[0]===x.pl[0]&&y[1]===x.pl[1]);
    return k<=5&&(me[4]||me[3]<Math.max(...x.mv.map(y=>y[3])))?'brilliant':'great';
  }
  let c=drop<.07?'excellent':drop<.115?'good':drop<.2?'inaccuracy':drop<.3?'mistake':'blunder';
  // the other player just slipped, and this gives it all back
  if(prev&&OWL_BAD.includes(prev.cls)&&OWL_BAD.includes(c)&&x.v<=-prev.best)c='miss';
  return c;
}
// a move's accuracy, 0–100, from what it gave away (chess.com's curve, with the win share in percent)
const owlAcc=drop=>drop<=0?100:Math.max(0,Math.min(100,103.1668*Math.exp(-4.354*drop)-3.1669));
// grades a whole match in place: rounds = [[position, …], …] from the jobs. Adds cls, drop, acc to each position
function owlGrade(rounds){
  for(const ps of rounds)ps.forEach((x,k)=>{x.cls=owlClass(x,ps[k-1],k);x.drop=x.cls==='forced'?0:Math.max(0,owlDrop(x));x.acc=owlAcc(x.drop)});
  return rounds;
}
// a player's accuracy over a match (forced moves don't count), and how many moves of each grade
function owlTotals(rounds,p){
  const xs=rounds.flat().filter(x=>x.p===p),scored=xs.filter(x=>x.cls!=='forced');
  const n={};for(const[c]of OWL_CLS)n[c]=0;
  xs.forEach(x=>n[x.cls]++);
  return{acc:scored.length?scored.reduce((s,x)=>s+x.acc,0)/scored.length:100,n};
}
// the CPU a player's accuracy is closest to, or the owl itself for no slip at all. tools/owl-calibrate.mjs measured the CPUs
// at about 69 (Easy), 82 (Normal) and 97 (Hard, with Open; with hidden hands it plans against stand-in cards and plays like Normal)
const OWL_LIKE=[[99.95,'the owl'],[90,'the Hard CPU'],[76,'the Normal CPU'],[0,'the Easy CPU']];
const owlLike=acc=>OWL_LIKE.find(([a])=>acc>=a)[1];
// a stretch of moves (Start 1–3, Middle 4–6, End 7–9) in one grade, from its average accuracy
function owlPhase(rounds,p,from,to){
  const xs=rounds.flatMap(ps=>ps.slice(from,to)).filter(x=>x.p===p&&x.cls!=='forced');
  if(!xs.length)return null;
  const a=xs.reduce((s,x)=>s+x.acc,0)/xs.length;
  return a>=99.95?'best':a>=80?'excellent':a>=65?'good':a>=45?'inaccuracy':a>=30?'mistake':'blunder';
}

/* ---------- the worker ---------- */
// message in: {id, R, rounds}; out: {id, t: 'prog', f: 0–1} as it goes, then {id, t: 'done', rounds}
if(typeof document==='undefined'&&typeof importScripts==='function'){
  importScripts('data.js','engine.js');
  onmessage=e=>{
    const{id,R,rounds}=e.data,total=rounds.reduce((s,r)=>s+r.moves.reduce((a,_,k)=>a+OWL_COST[k],0),0);
    let done=0;const res=[];
    try{
      for(const r of rounds){
        const job=owlJob(R,r);
        for(let k=0;;k++){const more=job.step();done+=OWL_COST[k];postMessage({id,t:'prog',f:done/total});if(!more)break}
        res.push(job.out);
      }
      postMessage({id,t:'done',rounds:res});
    }catch(err){postMessage({id,t:'fail',err:String(err)})}
  };
}
