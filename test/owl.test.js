// The Owl's review (client/js/owl.js): its search agrees with the game's rules, and its grades.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { loadGame } from './client.js';

const g = loadGame();
const { CARDS, newState, cloneS, play, genMoves, score, isFull, shuffle, mulberry32, genElements } = g;

// the plain way: every move, to the end, with the game's own play()
function slow(s, R) {
  if (isFull(s)) return score(s, s.turn) - score(s, 1 - s.turn);
  let best = -99;
  for (const [hi, c] of genMoves(s)) { const ch = cloneS(s); play(ch, R, hi, c, null); best = Math.max(best, 0 - slow(ch, R)); }
  return best;
}
const RULES = [{}, { same: 1, plus: 1, combo: 1 }, { elemental: 1, same: 1, sameWall: 1 },
  { reverse: 1, plus: 1, combo: 1, same: 1, sameWall: 1, elemental: 1 }];
// two random hands from the whole card list (a copy of a card in both hands now and then)
function deal(r) {
  const ids = shuffle(CARDS.map((c) => c.id), r);
  return [ids.slice(0, 5), r() < 0.3 ? [ids[0], ...ids.slice(5, 9)] : ids.slice(5, 10)];
}

describe('the search', () => {
  test('scores every move the same as playing it out with the game rules', () => {
    let n = 0;
    for (const R of RULES) {
      const r = mulberry32(42);
      for (let t = 0; t < 12; t++) {
        const [h0, h1] = deal(r), el = genElements(R, r), st = newState(h0, h1, t & 1, el);
        const so = g.owlSolver(R, el, h0, h1, t & 1, 16);
        // a few random moves first, played on both
        for (let k = 0; k < 4 + (t % 2); k++) {
          const ms = genMoves(st), [hi, c] = ms[Math.floor(r() * ms.length)], id = st.h[st.turn][hi];
          so.play(so.slot(id), c); play(st, R, hi, c, null);
        }
        const best = so.exact();
        assert.equal(best, slow(st, R));
        for (const [id, c, i] of so.list()) {
          const ch = cloneS(st); play(ch, R, st.h[st.turn].indexOf(id), c, null);
          assert.equal(so.value(i, c, best), 0 - slow(ch, R), `${JSON.stringify(R)} card ${id} on ${c}`);
          n++;
        }
      }
    }
    assert.ok(n > 300);
  });

  test('reads a whole match: each position follows from the one before, and the last matches the board', () => {
    const R = { same: 1, plus: 1, combo: 1, elemental: 1 }, r = mulberry32(7), [h0, h1] = deal(r), el = genElements(R, r);
    const st = newState(h0, h1, 1, el), moves = [];
    while (!isFull(st)) { const ms = genMoves(st), m = ms[Math.floor(r() * ms.length)]; moves.push(m); play(st, R, m[0], m[1], null); }
    const job = g.owlJob(R, { h: [h0, h1], first: 1, el, moves });
    while (job.step());
    const ps = job.out;
    assert.equal(ps.length, 9);
    ps.forEach((x, k) => {
      assert.equal(x.p, (1 + k) % 2);
      assert.ok(x.mv.every((m) => m[2] <= x.best) && x.mv.some((m) => m[2] === x.best));
      if (k) assert.equal(x.best, 0 - ps[k - 1].v);
    });
    const last = ps[8];
    assert.equal(last.n, 1); // one card, one square
    assert.equal(last.v, score(st, last.p) - score(st, 1 - last.p));
  });

  test('with Chaos, only the squares of the card that was picked are compared', () => {
    const R = { chaos: 1 }, r = mulberry32(3), [h0, h1] = deal(r), el = Array(9).fill(null);
    const st = newState(h0, h1, 0, el), moves = [];
    while (!isFull(st)) { const ms = genMoves(st), m = ms[Math.floor(r() * ms.length)]; moves.push(m); play(st, R, m[0], m[1], null); }
    const job = g.owlJob(R, { h: [h0, h1], first: 0, el, moves });
    while (job.step());
    for (const x of job.out) assert.ok(x.mv.every((m) => m[0] === x.pl[0]) && x.n === 9 - job.out.indexOf(x));
  });
});

describe('the grades', () => {
  // a position: best value, the value played, and the other moves' values (cards flipped right away, can be flipped back)
  const pos = (best, v, others = [], o = {}) => ({
    p: 0, best, v, n: 1 + others.length, pl: [1, 0],
    mv: [[1, 0, v, o.flips ?? 1, o.open ?? 0], ...others.map((w, i) => [2, i + 1, w, o.otherFlips ?? 1, 0])],
  });
  const cls = (x, prev, k = 2) => g.owlClass(x, prev, k);

  test('the cost of a card depends on how close the game is', () => {
    assert.equal(cls(pos(0, 0, [0, 0])), 'best');
    assert.equal(cls(pos(8, 6, [8, 8])), 'excellent'); // 9–1 into 8–2
    assert.equal(cls(pos(4, 2, [4, 4])), 'good'); // 7–3 into 6–4
    assert.equal(cls(pos(0, -2, [0, 0])), 'inaccuracy'); // 5–5 into 4–6
    assert.equal(cls(pos(2, 0, [2, 2])), 'inaccuracy'); // a win into a draw
    assert.equal(cls(pos(0, -4, [0, 0])), 'mistake');
    assert.equal(cls(pos(2, -2, [2, 2])), 'mistake'); // a win into a loss
    assert.equal(cls(pos(0, -6, [0, 0])), 'blunder');
  });
  test('Great, Brilliant and Forced', () => {
    assert.equal(cls(pos(0, 0, [-2, -4])), 'great'); // the only move that keeps the draw
    assert.equal(cls(pos(0, 0, [-2, 0])), 'best'); // another move was as good
    assert.equal(cls(pos(4, 4, [2, 2])), 'best'); // the others only cost a Good
    assert.equal(cls(pos(0, 0, [-2, -4], { flips: 0, otherFlips: 2 })), 'brilliant'); // flips less now, wins later
    assert.equal(cls(pos(0, 0, [-2, -4], { open: 1 })), 'brilliant'); // lets its card be flipped right back
    assert.equal(cls(pos(0, 0, [-2, -4], { open: 1 }), null, 7), 'great'); // too late in the round to count
    assert.equal(cls(pos(0, 0, [-2])), 'best'); // two moves are too few for Great
    assert.equal(cls(pos(-2, -2)), 'forced');
  });
  test('Miss: the other player slipped, and the move gives it all back', () => {
    const prev = { ...pos(0, -2, [0, 0]), cls: 'inaccuracy' }; // they went from 5–5 to 4–6 down
    assert.equal(cls(pos(2, 0, [2, 2]), prev), 'miss'); // and you went back to 5–5
    assert.equal(cls(pos(2, 0, [2, 2]), { ...prev, cls: 'best' }), 'inaccuracy');
  });
  test('accuracy: 100 for the best move, less the more a move gives away', () => {
    assert.equal(g.owlAcc(0), 100);
    const a = [0.05, 0.1, 0.2, 0.3].map(g.owlAcc);
    assert.ok(a.every((v, i) => v < (i ? a[i - 1] : 100) && v > 0));
    const rounds = g.owlGrade([[pos(0, 0, [0]), { ...pos(0, -2, [0, 0]), p: 1 }, pos(2, 2, [2]), { ...pos(-2, -2), p: 1 }]]);
    const t0 = g.owlTotals(rounds, 0), t1 = g.owlTotals(rounds, 1);
    assert.equal(t0.acc, 100);
    assert.equal(t0.n.best, 2);
    assert.equal(t1.n.inaccuracy, 1);
    assert.equal(t1.n.forced, 1);
    assert.equal(t1.acc, g.owlAcc(g.owlEp(0) - g.owlEp(-2))); // the forced move doesn't count
  });
});
