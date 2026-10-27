'use strict';
/* =====================================================================
   THE STAR CHART  (the leaderboard's Sky view; leaderboard.js has the rest)
   The board as one sky: #1 in the middle, the other ranks spiralling out
   from it like the seeds of a sunflower, with faint rings at the top 3, 10
   and 25. A star's size is the number the board is ranked by, its colour
   the player's title (the same colours as the title chips). Yours is pink
   and pulses, and a line runs from you to the player you picked. It draws
   the board leaderboard.js already has (LB.board), so it asks the server
   for nothing more. List is the same board as a table.
   ===================================================================== */
// nodes: a point per player (by username) that glides to its spot when the board changes. pts: where each star was
// drawn, for taps. W/H: the size in the screen's own pixels; k: canvas pixels per screen pixel (zoom and the display)
const SKY={cv:null,x:null,ro:null,W:0,H:0,k:1,z:1,nodes:new Map(),pts:[],built:null,intro:true,hov:'',pal:null,neb:null,twinkle:[],raf:0,last:0,dirty:false,busy:false};
// the number a star's size follows, for each tab
const SKY_VAL={level:p=>p.xp,wins:p=>p.wins,streak:p=>p.best,cards:p=>p.cards};
const SKY_GA=Math.PI*(3-Math.sqrt(5));
// where the i-th of n players sits, in a disc of radius 1: the first in the middle, then out along a sunflower spiral
function skySpot(i,n){if(i===0)return[0,0];const f=.1+.9*Math.sqrt(i/Math.max(1,n-1)),a=i*SKY_GA-Math.PI/2;return[Math.cos(a)*f,Math.sin(a)*f]}
// the ring between the k-th player and the next one
const skyRing=(k,n)=>.1+.9*Math.sqrt((k-.5)/Math.max(1,n-1));
const skyOn=()=>!!(SKY.cv&&SKY.cv.isConnected&&LB.view==='sky'&&$('#scr-leaders').classList.contains('on')&&!document.hidden);
// you, when you're on the board but not in its top 50: your star sits under the sky
const skyPinned=()=>{const d=LB.board;return d&&d.me&&!d.rows.some(p=>p.username===d.me.username)?d.me:null};
// a search lights the players whose username or name starts with it, like the server's search
const skyHit=(p,q)=>p.username.toLowerCase().startsWith(q)||p.displayName.toLowerCase().startsWith(q);
const skyStat=(p,by)=>by==='wins'?plural(p.wins,'online win'):by==='streak'?`best online streak ${p.best}`:
  by==='cards'?`${p.cards} of ${CARDS.length} cards found`:`LV ${levelOf(p.xp)} · ${p.xp.toLocaleString()} XP`;

/* ---------- colours: read again when the theme changes ---------- */
// from the sky's own box: it's a night sky in the light theme too, so it has the dark theme's colours (leaderboard.css)
function skyPal(){
  const cs=getComputedStyle(SKY.cv),g=n=>cs.getPropertyValue(n).trim();
  SKY.neb=null;
  SKY.pal={text:g('--text'),muted:g('--muted'),ring:g('--lb-ring'),acc:g('--accent-ink'),cta:g('--cta'),back:g('--lb-sky-tag'),
    neb:[1,2,3,4].map(i=>g('--lb-neb-'+i)),
    medal:[g('--lb-gold'),g('--lb-silver'),g('--lb-bronze')],body:g('--body'),
    // the title chips' colours (leaderboard.css .lb-tier), Wanderer to Ley Sovereign
    tier:['--muted','--lb-bronze','--lb-silver','--blue-ink','--lb-gold','--accent-ink','--cta'].map(g)};
}
new MutationObserver(()=>{SKY.pal=null;skyKick()}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','class']});
document.addEventListener('visibilitychange',()=>skyKick());
if(document.fonts&&document.fonts.addEventListener)document.fonts.addEventListener('loadingdone',()=>skyKick());

/* ---------- the canvas ---------- */
// lbShell() makes a new one each time the leaderboard opens; the stars unfold from the middle again
function skyMount(cv){
  if(SKY.ro)SKY.ro.disconnect();
  Object.assign(SKY,{cv,x:cv.getContext('2d'),W:0,H:0,built:null,intro:true,hov:'',pts:[]});SKY.nodes.clear();
  // it also comes back from a screen that hid it (a player's profile) this way. The words go again too: a wider window
  // may have brought the third column, which needs no Details button
  SKY.ro=window.ResizeObserver?new ResizeObserver(()=>skyPaint()):null;
  if(SKY.ro)SKY.ro.observe(cv.parentElement);
  // taps and clicks in the screen's own pixels: the screen is zoomed on big monitors (--ui), so go by the drawn size
  const at=e=>{const r=cv.getBoundingClientRect(),s=r.width?SKY.W/r.width:1;return[(e.clientX-r.left)*s,(e.clientY-r.top)*s]};
  const near=(e,max)=>{const[mx,my]=at(e);let u='',bd=max*max;for(const[px,py,n]of SKY.pts){const d=(px-mx)**2+(py-my)**2;if(d<bd){bd=d;u=n}}return u};
  cv.addEventListener('pointermove',e=>{if(e.pointerType!=='mouse')return;const u=near(e,20);if(u!==SKY.hov){SKY.hov=u;cv.style.cursor=u?'pointer':'';skyKick()}});
  cv.addEventListener('pointerleave',()=>{if(SKY.hov){SKY.hov='';cv.style.cursor='';skyKick()}});
  cv.addEventListener('click',e=>{const u=near(e,26);if(u)skyPick(u)});
  cv.addEventListener('keydown',skyKey);
}
// a phone gets a square sky, a wider screen a slightly flatter one, and it's never taller than the window leaves room for
function skySize(){
  const cv=SKY.cv,box=cv&&cv.parentElement,W=box?box.clientWidth:0;if(!W)return false;
  const H=Math.round(Math.max(240,Math.min(W*(W<520?1:.8),innerHeight/(UI||1)-210)));
  if(H!==SKY.H)cv.style.height=H+'px';
  const r=cv.getBoundingClientRect(),k=Math.min(3,(r.width?r.width/W:1)*(window.devicePixelRatio||1));
  if(W===SKY.W&&H===SKY.H&&k===SKY.k)return false;
  Object.assign(SKY,{W,H,k,z:Math.max(.8,Math.min(1.2,Math.min(W,H)/440)),neb:null});
  cv.width=Math.round(W*k);cv.height=Math.round(H*k);
  return true;
}
// draws at most 30 times a second once nothing is moving (your star still pulses); with reduced motion only when something changes
function skyKick(){SKY.dirty=true;if(!SKY.raf&&skyOn())SKY.raf=requestAnimationFrame(skyLoop)}
function skyLoop(t){
  SKY.raf=0;if(!skyOn())return;
  if(SKY.dirty||SKY.busy||t-SKY.last>=33){SKY.dirty=false;SKY.last=t;SKY.busy=skyDraw(t)}
  if(SKY.busy||!noMotion())SKY.raf=requestAnimationFrame(skyLoop);
}

/* ---------- the stars move when the board changes ---------- */
function skyTo(o,x,y,a,t,dur){Object.assign(o,{fx:o.x,fy:o.y,fa:o.a,tx:x,ty:y,ta:a,t0:t,dur:noMotion()?0:dur})}
function skyGlide(o,t){const k=o.dur?Math.min(1,Math.max(0,(t-o.t0)/o.dur)):1,e=1-Math.pow(1-k,3);
  o.x=o.fx+(o.tx-o.fx)*e;o.y=o.fy+(o.ty-o.fy)*e;o.a=o.fa+(o.ta-o.fa)*e;return k<1}
function skyBuild(t){
  const d=LB.board,intro=SKY.intro;SKY.built=d;if(!d)return;
  SKY.intro=false;
  const n=d.rows.length,pin=skyPinned(),keep=new Set();
  const aim=(p,x,y,dur)=>{let o=SKY.nodes.get(p.username);
    // a new star fades in where it belongs, or on opening flies out from the middle
    if(!o){o={u:p.username,x:intro?0:x,y:intro?0:y,a:0};SKY.nodes.set(p.username,o)}
    o.p=p;o.low=false;skyTo(o,x,y,1,t,dur);keep.add(p.username);return o};
  d.rows.forEach((p,i)=>{const[x,y]=skySpot(i,n);aim(p,x,y,intro?700+i*12:800+i*6)});
  if(pin)aim(pin,0,1,800).low=true; // its height is worked out as it's drawn (skyGeo)
  SKY.nodes.forEach((o,u)=>{if(!keep.has(u))skyTo(o,o.x,o.y,0,t,450)});
}
// the middle of the sky and its size; room is left at the bottom for you when you're outside the top 50
function skyGeo(){const low=skyPinned()?30:0,h=SKY.H-low;return{cx:SKY.W/2,cy:h/2,Rx:Math.max(20,SKY.W/2-34),Ry:Math.max(20,h/2-24),low:SKY.H-17}}

/* ---------- the night behind it: a nebula, like a photo of deep space ---------- */
// A purple cloud with a plume rising from it, a blue band across the middle, two white glows above and below #1, darker
// dust, and a field of faint stars. Painted once into two layers (again when the size or the theme changes), from the same
// seed, so the sky looks the same each time; then only the glow layer drifts and breathes and a few stars twinkle
function skyNebMake(){
  const P=SKY.pal,W=SKY.W,H=SKY.H,k=Math.min(SKY.k,1.5),r=mulberry32(4507),m=Math.min(W,H),cx=W/2,cy=H*.47;
  const layer=()=>{const c=document.createElement('canvas');c.width=Math.ceil(W*k);c.height=Math.ceil(H*k);const x=c.getContext('2d');x.scale(k,k);return [c,x]};
  const gauss=()=>(r()+r()+r()-1.5)/1.5;
  const blob=(x,bx,by,rx,ry,turn,rgb,a)=>{x.save();x.translate(bx,by);x.rotate(turn);x.scale(1,ry/rx);
    const g=x.createRadialGradient(0,0,0,0,0,rx);g.addColorStop(0,`rgba(${rgb},${a})`);g.addColorStop(.5,`rgba(${rgb},${a*.4})`);g.addColorStop(1,`rgba(${rgb},0)`);
    x.fillStyle=g;x.beginPath();x.arc(0,0,rx,0,7);x.fill();x.restore()};
  const [base,b]=layer(),[glow,gl]=layer();
  // the purple cloud, thickest in the middle, and its plume
  b.globalCompositeOperation='lighter';
  for(let i=0;i<8;i++){const s=(.3+r()*.2)*m;blob(b,cx+gauss()*.3*W,cy+gauss()*.25*H,s*(1.2+r()*.6),s,r()*3,P.neb[0],.05+r()*.04)} // a wide, faint haze
  for(let i=0;i<50;i++){const pl=i>=40,s=(.08+r()*.16)*m;
    blob(b,pl?cx+gauss()*.12*W:cx+gauss()*.4*W,pl?cy-(.2+r()*.3)*H:cy+gauss()*.32*H,s*(1+r()*.8),s,r()*3,P.neb[i%3===0?1:0],.06+r()*.1)}
  // dark dust in it
  b.globalCompositeOperation='source-over';
  for(let i=0;i<10;i++){const s=(.04+r()*.09)*m;blob(b,cx+gauss()*.4*W,cy+gauss()*.34*H,s*1.6,s,r()*3,'4,2,12',.28+r()*.2)}
  // the stars, most of them faint
  const n=Math.round(W*H/420);SKY.twinkle=[];
  for(let i=0;i<n;i++){const sx=r()*W,sy=r()*H,big=r()<.05,rr=big?.9+r()*.6:.25+r()*.5,tint=r();
    b.fillStyle=tint<.7?'#fff':tint<.88?'#cfdcff':'#ffd6ef';b.globalAlpha=big?.9:.15+r()*.5;
    b.beginPath();b.arc(sx,sy,rr,0,7);b.fill();if(big&&SKY.twinkle.length<26)SKY.twinkle.push([sx,sy,rr,r()*6.3])}
  b.globalAlpha=1;
  // the blue band, tilted a little, and the two white glows at the middle
  gl.globalCompositeOperation='lighter';
  for(let i=0;i<13;i++){const f=i/12-.5;blob(gl,cx+f*1.02*W,cy-f*.16*H+gauss()*.03*H,(.14+r()*.06)*W,(.06+r()*.03)*H,-.16,P.neb[2],.22+r()*.12)}
  blob(gl,cx-.01*W,cy-.13*H,.17*m,.13*m,.2,P.neb[3],.5);blob(gl,cx+.015*W,cy+.12*H,.16*m,.12*m,-.2,P.neb[3],.44);
  blob(gl,cx,cy,.07*m,.07*m,0,P.neb[3],.3);
  SKY.neb={base,glow};
}
// the glow drifts and breathes a little and some stars twinkle (all still with reduced motion)
function skyNebDraw(x,t,still){
  if(!SKY.neb)skyNebMake();
  const W=SKY.W,H=SKY.H;
  x.drawImage(SKY.neb.base,0,0,W,H);
  x.globalAlpha=still?1:.82+.18*Math.sin(t/7000);
  x.drawImage(SKY.neb.glow,still?0:Math.sin(t/61000*Math.PI*2)*W*.012,0,W,H);
  x.globalAlpha=1;
  if(still)return;
  x.fillStyle='#fff';
  SKY.twinkle.forEach(([sx,sy,rr,ph],i)=>{const a=.5+.5*Math.sin(t/(700+i*53)+ph);x.globalAlpha=a;x.beginPath();x.arc(sx,sy,rr+.4,0,7);x.fill();
    if(a>.85){x.globalAlpha=(a-.85)*4;x.fillRect(sx-rr*3,sy-.4,rr*6,.8);x.fillRect(sx-.4,sy-rr*3,.8,rr*6)}});
  x.globalAlpha=1;
}

/* ---------- drawing ---------- */
const skyName=s=>s.length>14?s.slice(0,13)+'…':s;
// a name on a backing so it reads over the lines. One that would cover a name already placed is left out, unless it's
// one that must show (yours, the pick's)
function skyTag(x,taken,s,px,py,o){
  const P=SKY.pal,size=o.size||10.5;x.font=`${o.weight||600} ${size}px ${P.body}`;
  const w=x.measureText(s).width,al=o.align||'center';
  const lx=Math.max(4,Math.min(SKY.W-w-4,al==='center'?px-w/2:al==='left'?px:px-w)),b=[lx-4,py-size,w+8,size+5];
  if(!o.must&&taken.some(c=>b[0]<c[0]+c[2]&&c[0]<b[0]+b[2]&&b[1]<c[1]+c[3]&&c[1]<b[1]+b[3]))return false;
  taken.push(b);
  x.globalAlpha=.8;x.fillStyle=P.back;x.beginPath();if(x.roundRect)x.roundRect(b[0],b[1],b[2],b[3],5);else x.rect(b[0],b[1],b[2],b[3]);x.fill();
  x.globalAlpha=1;x.fillStyle=o.col||P.muted;x.textAlign='left';x.textBaseline='alphabetic';x.fillText(s,lx,py);
  return true;
}
// one frame; says whether anything is still moving
function skyDraw(t){
  const x=SKY.x,W=SKY.W,H=SKY.H;if(!x||!W)return false;
  if(!SKY.pal)skyPal();
  const P=SKY.pal,still=noMotion(),z=SKY.z;
  x.setTransform(SKY.k,0,0,SKY.k,0,0);x.clearRect(0,0,W,H);
  skyNebDraw(x,t,still);
  SKY.pts=[];
  const d=SKY.built;if(!d||!d.rows.length)return false;
  const g=skyGeo(),n=d.rows.length,val=SKY_VAL[d.by]||SKY_VAL.level,max=Math.max(1,...d.rows.map(val));
  let moving=false;
  SKY.nodes.forEach((o,u)=>{if(o.low)o.ty=(g.low-g.cy)/g.Ry;if(skyGlide(o,t))moving=true;else if(!o.ta)SKY.nodes.delete(u)});
  const at=o=>[g.cx+o.x*g.Rx,g.cy+o.y*g.Ry];
  // the rings at the top 3, 10 and 25
  x.setLineDash([3,6]);x.lineWidth=1.6;x.strokeStyle=P.ring;
  for(const k of [3,10,25]){
    if(k>=n)continue;const f=skyRing(k,n);
    x.globalAlpha=1;x.beginPath();x.ellipse(g.cx,g.cy,f*g.Rx,f*g.Ry,0,0,7);x.stroke();
    x.globalAlpha=.9;x.font=`700 10px ${P.body}`;x.fillStyle=P.muted;x.textAlign='left';x.textBaseline='alphabetic';
    x.fillText(`TOP ${k}`,g.cx+f*g.Rx*.72+4,g.cy-f*g.Ry*.69-4);
  }
  x.setLineDash([]);x.globalAlpha=1;
  const meU=d.me?d.me.username:'',mo=meU&&SKY.nodes.get(meU),mp=mo&&mo.a>.02&&at(mo);
  const f=SKY.hov||LB.sel,q=LB.q.toLowerCase();
  // Friends: a line from you to each of them
  if(d.show==='friends'&&mp)SKY.nodes.forEach((o,u)=>{if(u===meU||o.a<.02)return;
    x.strokeStyle=P.acc;x.globalAlpha=.3*o.a;x.lineWidth=1.2;x.beginPath();x.moveTo(mp[0],mp[1]);x.lineTo(...at(o));x.stroke()});
  // you → the player you picked
  const so=LB.sel&&LB.sel!==meU&&SKY.nodes.get(LB.sel);
  if(mp&&so&&so.a>.02){x.globalAlpha=.9*so.a;x.strokeStyle=P.cta;x.lineWidth=1.6;x.setLineDash([3,5]);x.lineDashOffset=still?0:-t*.02;
    x.beginPath();x.moveTo(mp[0],mp[1]);x.lineTo(...at(so));x.stroke();x.setLineDash([]);x.lineDashOffset=0}
  // the stars, the one you're pointing at or picked last so it sits on top
  const ord=[...SKY.nodes.values()].sort((a,b)=>(a.u===f)-(b.u===f)),drawn=[];
  for(const o of ord){
    if(o.a<.02)continue;
    const p=o.p,[px,py]=at(o),me=o.u===meU,lv=levelOf(p.xp),dim=q&&!me&&!skyHit(p,q)?.22:1;
    const r=(me?6.5:2+5.6*Math.sqrt(Math.max(0,val(p))/max))*z,col=me?P.cta:P.tier[TITLES.filter(tt=>lv>=tt[0]).length-1]||P.muted;
    x.globalAlpha=o.a*dim;
    if(p.rank<=3&&!me){x.strokeStyle=P.medal[p.rank-1];x.lineWidth=1.5;x.beginPath();x.arc(px,py,r+4*z,0,7);x.stroke()}
    if(me&&!still){const k=(t%2200)/2200;x.strokeStyle=P.cta;x.globalAlpha=o.a*(1-k)*.8;x.lineWidth=2;x.beginPath();x.arc(px,py,r+3+k*16,0,7);x.stroke();x.globalAlpha=o.a*dim}
    if(me||p.rank<=3){x.shadowColor=col;x.shadowBlur=14}
    x.fillStyle=col;x.beginPath();x.arc(px,py,r,0,7);x.fill();x.shadowBlur=0;
    // yours has a white middle, so it isn't mistaken for a Ley Sovereign's (pink too)
    if(me){x.fillStyle='#fff';x.beginPath();x.arc(px,py,r*.42,0,7);x.fill()}
    if(o.u===f&&!me){x.strokeStyle=P.text;x.lineWidth=1.5;x.beginPath();x.arc(px,py,r+3,0,7);x.stroke()}
    if(o.ta)SKY.pts.push([px,py,o.u]);
    drawn.push([o,px,py,r]);
  }
  // names: yours and the pick's first, then the top 3, a search's finds, and everyone in Friends
  x.globalAlpha=1;
  const taken=[],rank=o=>o.u===meU?0:o.u===f?1:o.p.rank<=3?2:3;
  drawn.filter(([o])=>o.a>.5&&o.ta).sort((a,b)=>rank(a[0])-rank(b[0])).forEach(([o,px,py,r])=>{
    const p=o.p,me=o.u===meU,pick=o.u===f,top=p.rank<=3&&d.show==='all'&&(!q||skyHit(p,q));
    if(!(me||pick||top||d.show==='friends'||(q&&skyHit(p,q))))return;
    const lo={size:me||pick?11.5:10.5,weight:me||pick||top?700:600,col:me?P.cta:pick||top?P.text:P.muted,must:me||pick};
    if(me&&o.low){skyTag(x,taken,`You · #${p.rank}`,px+r+8,py+4,{...lo,align:'left'});
      x.font=`600 9.5px ${P.body}`;x.fillStyle=P.muted;x.textAlign='right';x.fillText('OUTSIDE THE TOP 50',px-r-10,py+3.5);return}
    const s=me?`You · #${p.rank}`:`#${p.rank} ${skyName(p.displayName)}`;
    // the top 3 sit beside their stars, away from the middle; #1 (in the middle) and you above, the rest below
    if(top&&!me&&Math.abs(px-g.cx)>2){const right=px>g.cx;if(skyTag(x,taken,s,px+(right?r+7:-r-7),py+4,{...lo,align:right?'left':'right'}))return}
    const above=py-r-7,below=py+r+13;
    if(me||top)skyTag(x,taken,s,px,above,lo)||skyTag(x,taken,s,px,below,lo);
    else skyTag(x,taken,s,px,below,lo)||skyTag(x,taken,s,px,above,lo);
  });
  return moving;
}

/* ---------- picking ---------- */
// a tap picks a star (the line goes to it); without the third column, a second tap on it opens the player
function skyPick(u){
  sfx('click');
  if(u===LB.sel&&!lbSideOn()){lbPick(u);return}
  LB.sel=u;if(lbSideOn())lbPaintSide();skyPaint();
}
// the arrow keys go through the ranks, Enter opens the player (on a narrow screen)
function skyKey(e){
  const d=LB.board;if(!d||!d.rows.length)return;
  const list=d.rows.map(p=>p.username),pin=skyPinned();if(pin)list.push(pin.username);
  let i=list.indexOf(LB.sel);
  if(e.key==='ArrowRight'||e.key==='ArrowDown')i=Math.min(list.length-1,i+1);
  else if(e.key==='ArrowLeft'||e.key==='ArrowUp')i=Math.max(0,i-1);
  else if(e.key==='Home')i=0;else if(e.key==='End')i=list.length-1;
  else if(e.key==='Enter'||e.key===' '){e.preventDefault();if(LB.sel)lbPick(LB.sel);return}
  else return;
  e.preventDefault();if(list[i]===LB.sel)return;
  LB.sel=list[i];if(lbSideOn())lbPaintSide();skyPaint();
}

/* ---------- the words around it ---------- */
function skyPaint(){
  if(!SKY.cv||!SKY.cv.isConnected)return;
  if(LB.board!==SKY.built)skyBuild(performance.now());
  const d=LB.board;
  $('#lbSky').classList.toggle('busy',!!d&&(LB.loading||!!LB.err));
  $('#lbSkyMsg').innerHTML=LB.err?`<span>${esc(LB.err)}</span><button class="btn small" data-k="retry">Try again</button>`:
    !d?'<span><span class="spin"></span>Loading the leaderboard…</span>':!d.rows.length?'<span>Nobody here yet.</span>':'';
  $('#lbInfo').innerHTML=d&&!LB.err?skyInfo(d):'';
  skySize();skyKick();
}
// who you picked and how far they are from you, and what a search found further down the board
function skyInfo(d){
  const meU=d.me?d.me.username:'',out=[];
  if(d.show==='friends'&&d.counts.friends<=1&&!LB.q)return 'Add friends to see how you stack up against them.';
  const p=lbFind(LB.sel);
  if(p){
    const mine=p.username===meU,gap=d.me&&!mine?p.rank-d.me.rank:null;
    const rel=mine?' Pick any star to draw a line to it.':gap==null?'':gap<0?` ${plural(-gap,'place')} above you.`:gap>0?` ${plural(gap,'place')} below you.`:' Level with you.';
    out.push(`<span><b>${mine?'You':esc(p.displayName)}</b> · #${p.rank} · ${skyStat(p,d.by)}.${rel}${lbSideOn()?'':` <button class="btn small lb-more" data-u="${esc(p.username)}">Details</button>`}</span>`);
  }
  if(LB.q&&LB.data&&LB.data!==d){
    const sky=new Set(d.rows.map(r=>r.username)),far=LB.data.rows.filter(r=>!sky.has(r.username));
    if(!LB.data.rows.length&&!LB.loading)out.push(`<span>No player whose name starts with “${esc(LB.q)}”.</span>`);
    else if(far.length)out.push(`<span class="lb-far">Further down: ${far.slice(0,4).map(r=>`<button class="lb-chip" data-u="${esc(r.username)}">#${r.rank} ${esc(r.displayName)}</button>`).join(' ')}${far.length>4?` and ${far.length-4} more`:''}</span>`);
  }
  return out.join('');
}
