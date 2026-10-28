'use strict';
// The game's version, shown to the right of the title on the menu.
// Bump it with every change (rules in CLAUDE.md). package.json and the top of
// CHANGELOG.md must match; npm test checks.
const VERSION='0.32.2';
document.querySelectorAll('.ver').forEach(e=>{e.textContent='v'+VERSION});
// the test site (leylines-dev on Railway) gets its own tab name and a grey icon, so it's never mixed up with the live game.
// Runs first, before pulse.js copies the title.
if(/^leylines-dev[.-]/.test(location.hostname)){
  document.title='Leylines Dev';
  document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content','Leylines Dev');
  document.querySelectorAll('link[rel="icon"]').forEach(l=>l.remove());
  const ic=document.createElement('link');ic.rel='icon';ic.type='image/svg+xml';ic.href='images/leylines-icon-dev.svg';
  document.head.appendChild(ic);
}
