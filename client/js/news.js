'use strict';
/* =====================================================================
   WHAT'S NEW  (tap the version next to the menu title)
   Read straight from CHANGELOG.md, so the notes are only written once.
   The server sends it at /CHANGELOG.md; on GitHub Pages it sits one
   folder up from the game, so the same relative path works for both.
   The newest version comes first; scroll down for the older ones.
   ===================================================================== */
// [{v, date, intro: [lines], items: [bullets]}], newest first
function parseNews(md){
  const out=[];let cur=null;
  for(const line of md.split(/\r?\n/)){
    const h=line.match(/^## (\S+)(?: \(([^)]+)\))?/);
    if(h){out.push(cur={v:h[1],date:h[2]||'',intro:[],items:[]});continue}
    if(!cur||!line.trim())continue; // skip the note above the first version
    const b=line.match(/^\s*[-*] (.+)/);
    if(b)cur.items.push(b[1].trim());
    else if(cur.items.length&&/^\s/.test(line))cur.items[cur.items.length-1]+=' '+line.trim(); // a bullet that wraps
    else cur.intro.push(line.trim());
  }
  return out;
}
// **bold** and `code`, everything else as plain text
const newsInline=s=>esc(s).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/`(.+?)`/g,'<code>$1</code>');
const newsDate=d=>/^\d{4}-\d\d-\d\d$/.test(d)?new Date(d+'T00:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}):esc(d);
function newsEntry(e,top){
  return `<section class="nw-ver${top?' top':''}"><div class="nw-h"><b>v${esc(e.v)}</b>${top&&e.v===VERSION?'<span class="nw-tag">You have this</span>':''}<small>${newsDate(e.date)}</small></div>`+
    e.intro.map(t=>`<p class="nw-intro">${newsInline(t)}</p>`).join('')+
    (e.items.length?`<ul>${e.items.map(t=>`<li>${newsInline(t)}</li>`).join('')}</ul>`:'')+`</section>`;
}
function openNews(){
  sfx('click');
  const close=[{label:'Close',cls:'primary',esc:true}];
  const box=modal(`<div class="kick">What's new</div><h2 class="nm2">Leylines v${VERSION}</h2><p class="nw-wait"><span class="spin"></span>Loading the notes…</p>`,close);
  box.classList.add('nw-box');
  fetch('../CHANGELOG.md',{cache:'no-cache'}).then(r=>{if(!r.ok)throw 0;return r.text()}).then(md=>{
    if(!box.isConnected)return; // closed while loading
    const all=parseNews(md);if(!all.length)throw 0;
    box.querySelector('.nw-wait').outerHTML=`<div class="nw-list">${newsEntry(all[0],true)}`+
      (all.length>1?`<div class="nw-old">Earlier versions</div>${all.slice(1).map(e=>newsEntry(e,false)).join('')}`:'')+`</div>`;
  }).catch(()=>{
    const w=box.isConnected&&box.querySelector('.nw-wait');
    if(w)w.textContent='Couldn\'t load the notes. Check your connection and try again.';
  });
}
$('#verBtn').onclick=openNews;
$('#verBtn').setAttribute('aria-label',`Version ${VERSION}. What's new`);
