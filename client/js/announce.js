'use strict';
/* =====================================================================
   ANNOUNCEMENTS  (the megaphone on the menu)
   Posts the developers write to every player (server/routes/news.js).
   Each is any mix of three:
   - Note: a number on the megaphone until it's read
   - Banner: a card on the menu until it's closed. On a phone it covers
     the logo and the name, so it waits until the menu has been open for
     5 seconds (a new player sees what the game is called first)
   - Big: a popup, once, whose Close waits 3 seconds so it gets read
   The megaphone lists every post showing now. What's been read, closed
   and popped up is kept on this device. The posts come with the game's
   first check and again when the server says they changed (pulse.js).
   Developers write them from the Developer card on their profile.
   ===================================================================== */
const ANN={posts:[],at:0,nextT:0,endT:0,barT:0,barReady:false,busy:null};
const ANN_KEY='leylines.news';
const ANN_KIND={event:'Event',update:'Update',break:'Server break',thanks:'Thanks'};
const ANN_SHOW=[['note','Note','A number on the megaphone until it\'s read'],['banner','Banner','A card on the menu until it\'s closed'],['big','Big','Pops up once. Close waits 3 seconds']];
const ANN_BAR_WAIT=5000; // a phone's banner covers the top bar, logo and all: the menu is open this long first
// wide enough for the banner to sit between the logo and the buttons (announce.css); narrower, it covers the top bar like on a phone
const ANN_WIDE=matchMedia('(min-width:1180px) and (min-height:560px)');
const ANN_IC='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h3l7 4.5v-13L7 10z"/><path d="M7 14l1.3 5h2.4l-.9-3.7"/><path d="M17.5 9.5a3.5 3.5 0 010 5M19.8 7.2a7 7 0 010 9.6"/></svg>';
const ANN_X='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
// the server's clock once it has answered (clock.js), so a device set to the wrong time still ends posts on time.
// A post's start gets a minute's grace: this clock can trail the server's by a moment, and the server only sends posts that started
const annNow=()=>clockOk()?clockNow():Date.now();
const ANN_GRACE=60e3;
// 0.30.9 < 0.31.0
const verLess=(a,b)=>{const x=String(a).split('.').map(Number),y=String(b).split('.').map(Number);for(let i=0;i<3;i++)if((x[i]|0)!==(y[i]|0))return (x[i]|0)<(y[i]|0);return false};

/* ---------- what this device has seen ---------- */
const annSeenMem={read:[],closed:[],big:[]}; // in case this browser can't keep anything
function annSeen(){
  try{const s=JSON.parse(localStorage.getItem(ANN_KEY)||'{}');return {read:s.read||[],closed:s.closed||[],big:s.big||[]}}
  catch(e){return annSeenMem}
}
function annMark(k,ids){
  const s=annSeen();s[k]=[...new Set([...s[k],...ids])].slice(-200);annSeenMem[k]=s[k];
  try{localStorage.setItem(ANN_KEY,JSON.stringify(s))}catch(e){}
}

/* ---------- loading ---------- */
// showing now and meant for this player: signed-in players only, or only games older than the post
function annShown(){
  const now=annNow();
  return ANN.posts.filter(p=>p.start<=now+ANN_GRACE&&p.end>now&&(p.who!=='signed'||!!ACCT.token)&&(p.who!=='old'||verLess(VERSION,p.ver)));
}
function annLoad(){
  if(API==null)return Promise.resolve();
  if(ANN.busy)return ANN.busy;
  ANN.busy=(async()=>{
    try{
      const r=await api('/news',{timeout:10000});
      ANN.posts=(Array.isArray(r.posts)?r.posts:[]).filter(p=>p&&Number.isInteger(p.id)&&typeof p.title==='string'&&typeof p.body==='string'&&Array.isArray(p.show));
      ANN.at=Date.now();
      // a post scheduled for later: ask again when it starts (only while the game is open)
      clearTimeout(ANN.nextT);
      const w=Number(r.next)-annNow();
      if(w>0&&w<864e5)ANN.nextT=setTimeout(annLoad,w+1500);
      annRender();
    }catch(e){}
    finally{ANN.busy=null}
  })();
  return ANN.busy;
}
// back from another app after a while: a guest has no live line to hear about new posts
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-ANN.at>10*60e3)annLoad()});

/* ---------- the megaphone, the banner and the popup ---------- */
function annRender(){
  const b=$('#btnNews');if(!b)return;
  b.hidden=API==null;
  const s=annSeen(),list=annShown();
  const n=list.filter(p=>p.show.includes('note')&&!s.read.includes(p.id)).length,dot=$('#newsDot');
  dot.hidden=!n;dot.textContent=n;
  b.setAttribute('aria-label',n?`News from the team, ${plural(n,'new post')}`:'News from the team');
  annBar();annBigMaybe();
  // the next post to end goes away by itself
  clearTimeout(ANN.endT);
  const end=Math.min(...list.map(p=>p.end))-annNow();
  if(end>0&&end<864e5)ANN.endT=setTimeout(annRender,end+500);
}
// paragraphs from blank lines, a line break from a single one; **bold** like the changelog (news.js)
const annBody=t=>String(t).split(/\n{2,}/).map(p=>`<p>${p.split('\n').map(newsInline).join('<br>')}</p>`).join('');
const annLine=t=>esc(String(t).replace(/\*\*(.+?)\*\*/g,'$1').replace(/`(.+?)`/g,'$1').replace(/\s+/g,' ').trim());
const annDate=t=>new Date(t).toLocaleDateString('en-GB',{day:'numeric',month:'short'});
function annCard(p,isNew){
  return `<article class="ann-card" data-ann="${p.id}"><div class="ann-k"><span class="ann-chip k-${esc(p.kind)}">${ANN_KIND[p.kind]||'News'}</span>`+
    `${isNew?'<span class="ann-new">New</span>':''}<small>${annDate(p.start)}</small></div><h3 dir="auto">${esc(p.title)}</h3><div class="ann-txt" dir="auto">${annBody(p.body)}</div>`+
    `<p class="ann-by">${esc(p.by)}</p></article>`;
}
// the megaphone's list: every post showing now, newest first. Opening it reads them all
function annOpen(id){
  const list=annShown(),s=annSeen(),dev=!!(ACCT.user&&ACCT.user.dev);
  const box=modal(`<div class="kick">News</div><h2 class="nm2">From the team</h2>`+
    (list.length?`<div class="ann-list">${list.map(p=>annCard(p,!s.read.includes(p.id))).join('')}</div>`
      :`<p class="ann-none">Nothing from the team right now. When the developers post something, it shows up here.</p>`)+
    `<div class="ann-more"><button class="pf-link" type="button" id="annWn">What's new in v${VERSION}</button>${dev?'<button class="pf-link" type="button" id="annWrite">Write a post</button>':''}</div>`,
    [{label:'Close',cls:'primary',esc:true}]);
  box.classList.add('ann-box');
  $('#annWn').onclick=()=>{closeModal();setTimeout(openNews,60)};
  if(dev)$('#annWrite').onclick=()=>{sfx('click');closeModal();openAnnAdmin()};
  annMark('read',list.map(p=>p.id));annRender();
  const c=id&&box.querySelector(`[data-ann="${id}"]`);if(c)setTimeout(()=>c.scrollIntoView({block:'nearest'}),50);
}
$('#btnNews').onclick=()=>{sfx('click');annOpen()};

// the banner: the newest Banner post not closed yet. A wide screen shows it beside the logo; a phone (or a smaller
// window) puts it over the whole top bar, once the menu has been open for ANN_BAR_WAIT (show() in menu.js starts the wait).
// The bar grows when the banner is taller, so the menu fits itself again (menu.js hubFit)
function annBarHTML(p){
  return `<button class="ann-open" type="button"><span class="ann-ic">${ANN_IC}</span><span class="ann-t"><small>From the team · ${ANN_KIND[p.kind]||'News'}</small>`+
    `<b dir="auto">${esc(p.title)}</b><span class="ann-line" dir="auto">${annLine(p.body)}</span></span></button>`+
    `<button class="ann-x" type="button" aria-label="Hide this announcement">${ANN_X}</button>`;
}
function annBar(){
  const el=$('#annBar');if(!el)return;
  const s=annSeen();
  const p=$('#scr-menu').classList.contains('on')&&annShown().find(x=>x.show.includes('banner')&&!s.closed.includes(x.id));
  if(!p||!(ANN_WIDE.matches||ANN.barReady)){if(!el.hidden){el.hidden=true;el.innerHTML='';delete el.dataset.id;requestAnimationFrame(hubFit)}return}
  if(!el.hidden&&el.dataset.id===String(p.id))return;
  el.dataset.id=p.id;el.innerHTML=annBarHTML(p);el.hidden=false;requestAnimationFrame(hubFit);
  el.querySelector('.ann-open').onclick=()=>{sfx('click');annOpen(p.id)};
  el.querySelector('.ann-x').onclick=()=>{sfx('click');annMark('closed',[p.id]);annBar()};
}
// the menu came up: a phone's banner waits again. Leaving hides it, and on a phone a banner that was showing counts as
// seen: going to a match or another tab closes it for good and reads it (it's still in the megaphone's list)
function annMenuShown(){clearTimeout(ANN.barT);ANN.barReady=false;annBar();ANN.barT=setTimeout(()=>{ANN.barReady=true;annBar()},ANN_BAR_WAIT);setTimeout(annBigMaybe,600)}
function annMenuLeft(){
  clearTimeout(ANN.barT);ANN.barReady=false;
  const el=$('#annBar'),id=+el.dataset.id;
  if(!el.hidden&&id&&!HUB_PC.matches){annMark('closed',[id]);annMark('read',[id])}
  annRender();
}
ANN_WIDE.addEventListener?.('change',annBar);

// a Big post pops up once, on the menu, when nothing else is open. A new player sees the tutorial's welcome first
function annBigMaybe(){
  if(!SAVE.tut||G||!$('#scr-menu').classList.contains('on')||$('#modal').classList.contains('on')||stg.classList.contains('on'))return;
  const s=annSeen(),p=annShown().find(x=>x.show.includes('big')&&!s.big.includes(x.id));
  if(!p)return;
  annMark('big',[p.id]);annBig(p);
}
// preview: from the writing screen, so it isn't marked as read
function annBig(p,preview){
  const box=modal(`<div class="ann-art" aria-hidden="true">${ANN_IC}</div><div class="kick">From the team · ${ANN_KIND[p.kind]||'News'}</div>`+
    `<h2 class="nm2" dir="auto">${esc(p.title)}</h2><div class="ann-txt" dir="auto">${annBody(p.body)}</div><p class="ann-by">${esc(p.by)} · ${annDate(p.start)}</p>`,
    [{label:'Close',cls:'primary',esc:true,wait:true,fn:()=>{if(!preview){annMark('read',[p.id]);annRender()}}}]);
  box.classList.add('ann-big');
}

/* ---------- writing them (developers only) ---------- */
// f: the post being written; id is set when it changes one that exists
const ANA={posts:[],signs:[],f:null,mode:'list',busy:false,err:''};
const DAY_MS=864e5;
// <input type="datetime-local"> takes local time
const toLocal=t=>{const d=new Date(t),z=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`};
const fromLocal=s=>{const t=new Date(s).getTime();return Number.isFinite(t)?t:NaN};
const annBlank=()=>({id:null,title:'',body:'',show:['banner'],kind:'update',who:'all',by:ANA.signs[0]||'',alert:false,start:'',end:toLocal(annNow()+3*DAY_MS),live:false});
const annStatus=(p,now=annNow())=>p.draft?'draft':p.end<=now?'ended':p.start>now+ANN_GRACE?'soon':'live';
const ANN_ST={live:['Live','ok'],soon:['Scheduled','warn'],draft:['Draft',''],ended:['Ended','']};

async function openAnnAdmin(){
  show('annc');$('#scr-annc').scrollTop=0;
  ANA.mode='list';ANA.err='';
  $('#annBody').innerHTML='<p class="pf-hint"><span class="spin"></span> Loading posts…</p>';
  try{
    const r=await api('/news/all');
    ANA.posts=Array.isArray(r.posts)?r.posts:[];ANA.signs=Array.isArray(r.signs)?r.signs:[];
  }catch(e){
    $('#annBody').innerHTML=`<p class="pf-hint">${esc(e.message)}</p><button class="btn" type="button" id="annRetry">Try again</button>`;
    $('#annRetry').onclick=()=>{sfx('click');openAnnAdmin()};return;
  }
  ANA.f=annBlank();annAdmin();
}
// a post from the list into the form: edit it, or (copy) start a new one from it
function annFill(p,copy){
  const now=annNow(),live=!copy&&!p.draft&&p.start<=now+ANN_GRACE;
  ANA.f={id:copy?null:p.id,title:p.title,body:p.body,show:[...p.show],kind:p.kind,who:p.who,by:ANA.signs.includes(p.by)?p.by:ANA.signs[0]||'',alert:copy?false:p.alert,
    start:copy||live?'':toLocal(p.start),end:toLocal(copy||p.end<=now?now+3*DAY_MS:p.end),live,keep:live?p.start:null};
  ANA.mode='form';ANA.err='';annAdmin();$('#scr-annc').scrollTop=0;
}
function annFormHTML(){
  const f=ANA.f,tog=(on,attr,label,sub)=>`<button type="button" class="an-tog${on?' on':''}" ${attr} aria-pressed="${on}"><b>${label}</b>${sub?`<small>${sub}</small>`:''}</button>`;
  const chip=(on,attr,label)=>`<button type="button" class="an-chip${on?' on':''}" ${attr} aria-pressed="${on}">${esc(label)}</button>`;
  return `<section class="pf-card an-form"><h3>${f.id?'Change post':'New post'}${f.id?'<button class="pf-link" type="button" id="anNew">New post instead</button>':''}</h3>
    <label class="an-fld" for="anTitle"><span>Title <em id="anTl"></em></span><input id="anTitle" type="text" maxlength="60" autocomplete="off" value="${esc(f.title)}"></label>
    <label class="an-fld" for="anText"><span>Message <i>**bold** works, like the changelog</i> <em id="anBl"></em></span><textarea id="anText" rows="4" maxlength="400">${esc(f.body)}</textarea></label>
    <div class="an-fld"><span>How loud <i>pick one or more</i></span><div class="an-togs">${ANN_SHOW.map(([k,l,s])=>tog(f.show.includes(k),`data-show="${k}"`,l,s)).join('')}</div></div>
    <div class="an-two">
      <div class="an-fld"><span>Kind</span><div class="an-chips">${Object.entries(ANN_KIND).map(([k,l])=>chip(f.kind===k,`data-kind="${k}"`,l)).join('')}</div></div>
      <div class="an-fld"><span>From</span><div class="an-chips">${ANA.signs.map((n,i)=>chip(f.by===n,`data-by="${i}"`,n)).join('')}</div></div>
    </div>
    <div class="an-two">
      <label class="an-fld" for="anStart"><span>Shows from <i>${f.live?'already showing':'empty = now'}</i></span><input id="anStart" type="datetime-local" value="${f.start}"${f.live?' disabled':''}></label>
      <label class="an-fld" for="anEnd"><span>Ends</span><input id="anEnd" type="datetime-local" value="${f.end}"></label>
    </div>
    <div class="an-fld"><span>Who sees it</span><div class="an-chips">${[['all','Every player'],['signed','Signed-in players'],['old',`Games older than v${VERSION}`]].map(([k,l])=>chip(f.who===k,`data-who="${k}"`,l)).join('')}</div></div>
    <label class="an-check"><input type="checkbox" id="anAlert"${f.alert&&f.who!=='old'?' checked':''}${f.who==='old'?' disabled':''}><span><b>Also send an alert</b><small>${f.who==='old'?'Alerts can\'t tell which version a game is on':'To every device with alerts on, when it starts'}</small></span></label>
    <p class="an-err" id="anErr" role="alert">${esc(ANA.err)}</p>
    <div class="an-btns"><button class="btn" type="button" id="anDraft">${f.id&&!f.live?'Save as draft':'Save draft'}</button><button class="btn" type="button" id="anPrev">Preview</button><button class="btn primary" type="button" id="anGo"></button></div>
  </section>`;
}
function annPostsHTML(){
  const now=annNow(),order={live:0,soon:1,draft:2,ended:3};
  const list=[...ANA.posts].sort((a,b)=>order[annStatus(a,now)]-order[annStatus(b,now)]||b.id-a.id);
  const when=p=>{const st=annStatus(p,now);return st==='soon'?`starts ${annDate(p.start)}, ${new Date(p.start).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}`
    :st==='ended'?`ended ${annDate(p.end)}`:`ends ${annDate(p.end)}, ${new Date(p.end).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}`};
  const row=p=>{const st=annStatus(p,now),[label,cls]=ANN_ST[st];
    const acts=st==='live'?[['edit','Edit'],['end','End now']]:st==='ended'?[['copy','Post again'],['del','Delete']]:[['edit','Edit'],['del','Delete']];
    return `<div class="an-row"><span class="rt"><b>${esc(p.title)}</b><small>${p.show.map(k=>ANN_SHOW.find(x=>x[0]===k)[1]).join(' + ')} · ${esc(p.by)} · ${when(p)}${p.alert?(p.alerted?' · alert sent':' · with alert'):''}</small></span>`+
      `<span class="an-st ${cls}">${label}</span><span class="an-acts">${acts.map(([a,l])=>`<button class="btn small${a==='end'||a==='del'?' danger':''}" type="button" data-act="${a}" data-id="${p.id}">${l}</button>`).join('')}</span></div>`};
  return `<section class="pf-card an-posts"><h3>Posts <button class="btn small primary an-newbtn" type="button" id="anNewPost">New post</button></h3>`+
    (list.length?list.map(row).join(''):'<p class="pf-hint left">Nothing posted yet. Your first post shows up here.</p>')+`</section>`;
}
// how it looks to players: the banner, and the post in the megaphone's list
function annPreviewHTML(){
  const p=annDraft(),show=ANA.f.show;
  return `<section class="pf-card an-prev"><h3>Preview</h3>`+
    (show.includes('banner')?`<div class="an-pl">Banner on the menu</div><div class="ann-bar an-demo">${annBarHTML(p)}</div>`:'')+
    `<div class="an-pl">In the megaphone${show.includes('note')?', with a number on it until it\'s read':''}</div><div class="an-card-demo">${annCard(p,show.includes('note'))}</div>`+
    (show.includes('big')?`<button class="btn" type="button" id="anBig">See the popup</button>`:'')+`</section>`;
}
// the form as a post (for the preview and for sending)
function annDraft(){
  const f=ANA.f,start=f.keep??(f.start?fromLocal(f.start):annNow());
  return {id:f.id||0,title:f.title.trim()||'Your title',body:f.body.trim()||'Your message.',kind:f.kind,show:f.show,who:f.who,by:f.by,start,end:fromLocal(f.end)};
}
function annAdmin(){
  const f=ANA.f;
  $('#annBody').innerHTML=`<div class="an-admin" data-mode="${ANA.mode}"><div class="an-main">${annFormHTML()}</div><div class="an-side"><div id="anPrevBox">${annPreviewHTML()}</div>${annPostsHTML()}</div></div>`;
  const B=$('#annBody');
  const counts=()=>{$('#anTl').textContent=`${60-f.title.length} left`;$('#anBl').textContent=`${400-f.body.length} left`};
  const prev=()=>{$('#anPrevBox').innerHTML=annPreviewHTML();const b=$('#anBig');if(b)b.onclick=()=>{sfx('click');annBig(annDraft(),true)};
    const go=$('#anGo'),later=!f.live&&f.start&&fromLocal(f.start)>annNow()+ANN_GRACE;go.textContent=f.id&&f.live?'Save changes':later?'Schedule':'Post now'};
  counts();prev();
  $('#anTitle').oninput=e=>{f.title=e.target.value;counts();prev()};
  $('#anText').oninput=e=>{f.body=e.target.value;counts();prev()};
  $('#anStart').onchange=e=>{f.start=e.target.value;prev()};
  $('#anEnd').onchange=e=>{f.end=e.target.value};
  $('#anAlert').onchange=e=>{f.alert=e.target.checked};
  B.querySelectorAll('[data-show]').forEach(b=>b.onclick=()=>{sfx('click');const k=b.dataset.show;
    // at least one stays on
    if(f.show.includes(k)){if(f.show.length>1)f.show=f.show.filter(x=>x!==k)}else f.show=ANN_SHOW.map(x=>x[0]).filter(x=>x===k||f.show.includes(x));
    B.querySelectorAll('[data-show]').forEach(x=>{const on=f.show.includes(x.dataset.show);x.classList.toggle('on',on);x.setAttribute('aria-pressed',on)});prev()});
  const pick=(attr,set)=>B.querySelectorAll(`[${attr}]`).forEach(b=>b.onclick=()=>{sfx('click');set(b.getAttribute(attr));
    B.querySelectorAll(`[${attr}]`).forEach(x=>{const on=x===b;x.classList.toggle('on',on);x.setAttribute('aria-pressed',on)});prev()});
  pick('data-kind',v=>{f.kind=v});
  pick('data-by',v=>{f.by=ANA.signs[+v]});
  B.querySelectorAll('[data-who]').forEach(b=>b.onclick=()=>{sfx('click');f.who=b.dataset.who;annAdmin()}); // the alert box changes with it
  $('#anDraft').onclick=()=>annSave(true);
  $('#anGo').onclick=()=>annSave(false);
  $('#anPrev').onclick=()=>{sfx('click');$('#anPrevBox').scrollIntoView({behavior:'smooth',block:'start'})};
  const nw=$('#anNew');if(nw)nw.onclick=()=>{sfx('click');ANA.f=annBlank();ANA.err='';annAdmin()};
  $('#anNewPost').onclick=()=>{sfx('click');ANA.f=annBlank();ANA.mode='form';ANA.err='';annAdmin();$('#scr-annc').scrollTop=0};
  B.querySelectorAll('[data-act]').forEach(b=>b.onclick=()=>{sfx('click');const p=ANA.posts.find(x=>x.id===+b.dataset.id);if(!p)return;
    const a=b.dataset.act;
    if(a==='edit')annFill(p,false);
    else if(a==='copy')annFill(p,true);
    else if(a==='end')modal(`<h2 class="nm2">End this post now?</h2><p>“${esc(p.title)}” stops showing for every player.</p>`,[{label:'Keep it',esc:true},{label:'End now',cls:'danger',fn:()=>annAct(`/news/${p.id}/end`,'POST','Ended')}]);
    else if(a==='del')modal(`<h2 class="nm2">Delete this post?</h2><p>“${esc(p.title)}” is gone for good${annStatus(p)==='live'?' and stops showing':''}.</p>`,[{label:'Keep it',esc:true},{label:'Delete',cls:'danger',fn:()=>annAct(`/news/${p.id}`,'DELETE','Deleted')}]);
  });
}
async function annSave(draft){
  if(ANA.busy)return;
  const f=ANA.f,start=f.keep??(f.start?fromLocal(f.start):null);
  const body={title:f.title,body:f.body,kind:f.kind,show:f.show,who:f.who,ver:f.who==='old'?VERSION:'',by:f.by,alert:f.alert&&f.who!=='old',draft,start,end:fromLocal(f.end)};
  ANA.busy=true;sfx('click');
  try{
    await api(f.id?`/news/${f.id}`:'/news',{method:f.id?'PUT':'POST',body});
    toast(draft?'Saved as a draft':start&&start>annNow()+ANN_GRACE?'Scheduled':f.id&&f.live?'Changes saved':'Posted',2500);
    await annReload();ANA.f=annBlank();ANA.mode='list';ANA.err='';annAdmin();$('#scr-annc').scrollTop=0;
  }catch(e){ANA.err=e.message;const er=$('#anErr');if(er)er.textContent=e.message}
  finally{ANA.busy=false}
}
async function annAct(path,method,done){
  try{await api(path,{method});toast(done,2000);await annReload();annAdmin()}
  catch(e){toast(e.message,3000)}
}
// the list again, and this game's own megaphone
async function annReload(){
  try{const r=await api('/news/all');ANA.posts=Array.isArray(r.posts)?r.posts:[];if(Array.isArray(r.signs))ANA.signs=r.signs}catch(e){}
  annLoad();
}
// Back: a phone writing a post goes back to the list first
$('#annBack').onclick=()=>{sfx('click');if(ANA.mode==='form'&&!HUB_PC.matches){ANA.mode='list';ANA.err='';annAdmin();return}openProfile()};

annMenuShown();annLoad();
