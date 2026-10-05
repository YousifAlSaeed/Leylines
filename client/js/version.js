'use strict';
// The game's version, shown to the right of the title on the menu.
// Bump it with every change (rules in CLAUDE.md). package.json and the top of
// CHANGELOG.md must match; npm test checks.
const VERSION='0.17.8';
document.querySelectorAll('.ver').forEach(e=>{e.textContent='v'+VERSION});
