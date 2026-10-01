'use strict';
/* =====================================================================
   AI
   ===================================================================== */
function genMoves(s){
  const p=s.turn,seen=new Set(),res=[],empty=[];
  for(let i=0;i<9;i++)if(s.b[i]<0)empty.push(i);
  s.h[p].forEach((id,hi)=>{if(seen.has(id))return;seen.add(id);for(const c of empty)res.push([hi,c])});
  return res;
}
function evalFor(s,p){
  const q=1-p,diff=score(s,p)-score(s,q);
  if(isFull(s))return diff*100;
  // exposure: strong open sides are good for owner, weak ones are liabilities
  let pos=0;
  for(let i=0;i<9;i++){
    if(s.b[i]<0)continue;
    const sign=s.o[i]===p?1:-1,cs=CARDS[s.b[i]].s;
    for(let d=0;d<4;d++){const n=NB[i][d];if(n>=0&&s.b[n]<0)pos+=sign*(cs[d]+s.m[i]-5.5)*.045}
  }
  return diff+pos;
}
const TIMEOUT={};
function negamax(s,R,depth,a,b,ctx){
  if((++ctx.n&1023)===0&&performance.now()>ctx.dl)throw TIMEOUT;
  if(depth===0||isFull(s))return evalFor(s,s.turn);
  let best=-Infinity;
  for(const[hi,c] of genMoves(s)){
    const ch=cloneS(s);play(ch,R,hi,c,null);
    const v=-negamax(ch,R,depth-1,-b,-a,ctx);
    if(v>best)best=v;if(v>a)a=v;if(a>=b)break;
  }
  return best;
}
function aiChoose(st,R,level){
  const s=cloneS(st),p=s.turn,moves=genMoves(s);
  const scored=moves.map(m=>{const ch=cloneS(s);play(ch,R,m[0],m[1],null);return{m,v:evalFor(ch,p)+Math.random()*.01}});
  scored.sort((x,y)=>y.v-x.v);
  if(level==='easy'){
    if(Math.random()<.55)return moves[Math.floor(Math.random()*moves.length)];
    return scored[Math.floor(Math.random()*Math.min(4,scored.length))].m;
  }
  if(level==='normal'){
    return(Math.random()<.2&&scored.length>1?scored[1]:scored[0]).m;
  }
  // hard: iterative deepening alpha-beta with a time budget
  const empty=s.b.filter(x=>x<0).length;
  const ctx={n:0,dl:performance.now()+1100};
  let best=scored[0].m;
  for(let depth=2;depth<=empty;depth++){
    try{
      let a=-Infinity,bm=null;
      for(const x of scored){
        const ch=cloneS(s);play(ch,R,x.m[0],x.m[1],null);
        const v=-negamax(ch,R,depth-1,-Infinity,-a,ctx);
        x.v=v;if(v>a){a=v;bm=x.m}
      }
      best=bm||best;
      scored.sort((x,y)=>y.v-x.v);
      if(a>=500)break; // forced win found
    }catch(e){if(e!==TIMEOUT)throw e;break}
  }
  return best;
}
function aiDeck(level){
  const[lo,hi]={easy:[1,2],normal:[1,4],hard:[3,6]}[level];
  const pool=CARDS.filter(c=>c.lv>=lo&&c.lv<=hi).map(c=>c.id);
  return shuffle(pool.slice()).slice(0,5);
}
