'use strict';
/* =====================================================================
   OLDER PHONES: boxes that size what's inside them
   Some layouts size their cards from the box they sit in (container queries: cqw/cqh and @container in the CSS).
   Browsers from before late 2022 don't have them (iPhone 6s/7/SE on iOS 15, Android phones stuck on Chrome 104
   or older), so there those cards fell back to the page's text size and spilled out of the book. On those
   browsers only, this gives each such box its size as --cqw/--cqh and a class for each width the CSS asks about
   (cq-b600: narrower than 600px), and the CSS has fallbacks under .cq-poly that use them. Newer browsers skip it.
   ===================================================================== */
(function(){
  if(window.CSS&&CSS.supports&&CSS.supports('container-type','inline-size'))return;
  if(!window.ResizeObserver||!window.MutationObserver)return;
  // the boxes, and the widths (w) or heights (h) their @container rules switch at; r: the book page's
  // "wide" shape (width at least 1.5 × height), where its cards sit in one row
  const BOX=[['.dk-tray',{w:[261,331,361]}],['.coll-book',{w:[260]}],['.bd-page',{h:[261],r:1.5}],['.bd-cover',{}],['.dr-wrap',{}],
    ['.mh-card',{w:[440]}],['.lb-wrap',{w:[520,760,1080]}],['.lb-table',{w:[600]}],['.lb-handbox',{h:[120]}],['.fg-ring',{}],['.st-stop',{}]];
  const SEL=BOX.map(b=>b[0]).join(','),seen=new WeakSet();
  document.documentElement.classList.add('cq-poly');
  const put=(el,w,h)=>{
    if(!(w>0||h>0))return;
    el.style.setProperty('--cqw',w+'px');el.style.setProperty('--cqh',h+'px');
    for(const [s,o] of BOX){if(!el.matches(s))continue;
      (o.w||[]).forEach(n=>el.classList.toggle('cq-b'+n,w<n));
      (o.h||[]).forEach(n=>el.classList.toggle('cq-h'+n,h<n));
      if(o.r)el.classList.toggle('cq-wide',w>=o.r*h)}
  };
  const ro=new ResizeObserver(es=>es.forEach(e=>put(e.target,e.contentRect.width,e.contentRect.height)));
  // a new box is measured straight away, before it's drawn, so it never shows a frame at the wrong size
  const add=el=>{if(seen.has(el))return;seen.add(el);ro.observe(el);
    const cs=getComputedStyle(el),px=k=>parseFloat(cs[k])||0;
    put(el,el.clientWidth-px('paddingLeft')-px('paddingRight'),el.clientHeight-px('paddingTop')-px('paddingBottom'))};
  const scan=root=>{if(root.matches&&root.matches(SEL))add(root);if(root.querySelectorAll)root.querySelectorAll(SEL).forEach(add)};
  scan(document.body);
  new MutationObserver(ms=>ms.forEach(m=>m.addedNodes.forEach(n=>{if(n.nodeType===1)scan(n)}))).observe(document.body,{childList:true,subtree:true});
})();
