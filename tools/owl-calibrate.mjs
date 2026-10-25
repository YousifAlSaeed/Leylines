// Measures the Owl's review accuracy of each CPU (client/js/ai.js), for "Played like the … CPU" (OWL_LIKE in owl.js).
// Each CPU plays the Normal CPU many times, with the default rules (Open, Same, Plus, Combo) and with hidden hands,
// and the owl grades its moves.  node tools/owl-calibrate.mjs [games per CPU and rule set, default 20]
import { loadGame } from '../test/client.js';

const g = loadGame();
const N = +process.argv[2] || 20;
const SETS = { default: { open: 1, same: 1, plus: 1, combo: 1 }, hidden: { same: 1, plus: 1, combo: 1 } };
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
for (const level of ['easy', 'normal', 'hard']) {
  for (const [name, R] of Object.entries(SETS)) {
    const accs = [];
    for (let t = 0; t < N; t++) {
      // the CPU being measured is player 0, half the time going first
      const h = [g.aiDeck(level), g.aiDeck('normal')], first = t & 1, st = g.newState(h[0], h[1], first, Array(9).fill(null)), moves = [];
      while (!g.isFull(st)) {
        const m = g.aiChoose(st, R, st.turn === 0 ? level : 'normal', null, null);
        moves.push(m); g.play(st, R, m[0], m[1], null);
      }
      const job = g.owlJob(R, { h, first, el: Array(9).fill(null), moves });
      while (job.step());
      accs.push(g.owlTotals(g.owlGrade([job.out]), 0).acc);
    }
    accs.sort((a, b) => a - b);
    console.log(`${level.padEnd(6)} ${name.padEnd(7)} mean ${mean(accs).toFixed(1)}  median ${accs[accs.length >> 1].toFixed(1)}  low ${accs[0].toFixed(1)}  high ${accs[accs.length - 1].toFixed(1)}`);
  }
}
