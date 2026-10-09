// The 2v2 rules (client/js/duo-engine.js): teams, flips, Ley lines, the CPUs, and a whole match.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { loadGame } from './client.js';

const g = loadGame();
const NONE = {};
const card = (t, r, b, l, e = null) => (g.CARDS.push({ id: g.CARDS.length, name: 'test', s: [t, r, b, l], e, lv: 1, rar: 1, sum: t + r + b + l }), g.CARDS.length - 1);
const noEl = () => Array(16).fill(null);

// board cells 0..15, 4 per row. Puts [cell, card, seat] on the board, then `seat` places `id` on `cell`
function place(board, id, cell, seat = 0, rules = NONE) {
  const hands = [[], [], [], []]; hands[seat] = [id];
  const s = g.duoNew(hands, seat, noEl());
  for (const [c, cid, owner] of board) { s.b[c] = cid; s.o[c] = owner; s.n++; }
  const ev = [];
  g.duoPlay(s, rules, 0, cell, ev);
  return { s, ev };
}

describe('teams', () => {
  test('seats 0 and 2 are one team, 1 and 3 the other', () => {
    assert.deepEqual([0, 1, 2, 3].map(g.duoTeam), [0, 1, 0, 1]);
  });
  test('turns go round the table, switching team every turn', () => {
    const s = g.duoNew([[1, 1], [1, 1], [1, 1], [1, 1]], 3, noEl());
    const seen = [];
    for (let k = 0; k < 4; k++) { seen.push(s.turn); g.duoPlay(s, NONE, 0, k, null); }
    assert.deepEqual(seen, [3, 0, 1, 2]);
  });
  test('each seat has the right neighbours on the 4×4 board', () => {
    assert.deepEqual([...g.DNB[0]], [-1, 1, 4, -1]);
    assert.deepEqual([...g.DNB[5]], [1, 6, 9, 4]);
    assert.deepEqual([...g.DNB[15]], [11, -1, -1, 14]);
  });
});

describe('flips', () => {
  const weak = card(1, 1, 1, 1), strong = card(9, 9, 9, 9);
  test('a higher side flips an enemy card to the seat that placed', () => {
    const { s } = place([[1, weak, 1]], strong, 0, 0);
    assert.equal(s.o[1], 0);
  });
  test('the partner\'s cards never flip', () => {
    const { s } = place([[1, weak, 2]], strong, 0, 0);
    assert.equal(s.o[1], 2);
  });
  test('a card the partner flipped stays the partner\'s, and counts for the team', () => {
    const { s } = place([[1, weak, 3]], strong, 0, 2);
    assert.equal(s.o[1], 2);
    assert.equal(g.duoScore(s, 0), 2);
  });
  test('Same flips enemy cards but leaves the partner\'s', () => {
    const up = card(1, 1, 6, 1), left = card(1, 7, 1, 1), placed = card(6, 1, 1, 7);
    const { s, ev } = place([[1, up, 1], [4, left, 2]], placed, 5, 0, { same: true });
    assert.equal(s.o[1], 0);
    assert.equal(s.o[4], 2);
    assert.ok(ev.some((e) => e.t === 'same'));
  });
  test('score: squares a team owns plus both partners\' hands', () => {
    const s = g.duoNew([[1], [2, 3], [4], []], 0, noEl());
    s.b[0] = 5; s.o[0] = 0; s.b[1] = 6; s.o[1] = 2; s.b[2] = 7; s.o[2] = 3;
    assert.equal(g.duoScore(s, 0), 4);
    assert.equal(g.duoScore(s, 1), 3);
  });
});

describe('Ley lines', () => {
  const c = card(5, 5, 5, 5), big = card(9, 9, 9, 9);
  // row 0 filled by team 0 (seats 0 and 2) with one more card to go
  const row = [[0, c, 0], [1, c, 2], [2, c, 0]];
  test('filling a row with one team\'s cards seals it', () => {
    const { s, ev } = place(row, c, 3, 2, { leyLines: true });
    assert.deepEqual([0, 1, 2, 3].map((i) => s.k[i]), [1, 1, 1, 1]);
    assert.ok(ev.some((e) => e.t === 'seal'));
  });
  test('a sealed card can\'t be flipped', () => {
    const { s } = place(row, c, 3, 2, { leyLines: true });
    s.turn = 1; s.h[1] = [big];
    g.duoPlay(s, { leyLines: true }, 0, 4, null); // under cell 0
    assert.equal(s.o[0], 0);
  });
  test('a mixed row doesn\'t seal, and nothing seals with the rule off', () => {
    assert.equal(place([[0, c, 0], [1, c, 1], [2, c, 0]], c, 3, 2, { leyLines: true }).s.k[0], 0);
    assert.equal(place(row, c, 3, 2, NONE).s.k[0], 0);
  });
});

describe('a whole match', () => {
  test('16 moves fill the board: everyone places 4 and keeps 1, and the scores add up to 20', () => {
    const rng = g.mulberry32(7);
    const pool = g.CARDS.filter((x) => x.lv <= 4).map((x) => x.id);
    const s = g.duoNew([0, 1, 2, 3].map(() => g.shuffle(pool.slice(), rng).slice(0, 5)), 1, g.duoElements({ elemental: true }, rng));
    const R = { leyLines: true, same: true, plus: true, combo: true, elemental: true };
    while (!g.duoFull(s)) {
      const level = s.turn % 2 ? 'easy' : 'normal';
      const [hi, cell] = g.duoChoose(s, R, level);
      assert.ok(hi >= 0 && hi < s.h[s.turn].length && s.b[cell] < 0, 'the CPU picks a legal move');
      g.duoPlay(s, R, hi, cell, null);
    }
    assert.deepEqual(s.h.map((h) => h.length), [1, 1, 1, 1]);
    assert.equal(g.duoScore(s, 0) + g.duoScore(s, 1), 20);
  });
  test('Elemental marks 2 to 6 squares', () => {
    for (let k = 0; k < 40; k++) {
      const n = g.duoElements({ elemental: true }, g.mulberry32(k)).filter(Boolean).length;
      assert.ok(n >= 2 && n <= 6, `${n} squares`);
    }
  });
});

describe('CPUs', () => {
  test('a CPU only sees its partner\'s hand, not the other team\'s (unless Open)', () => {
    const s = g.duoNew([[1], [2], [3], [4]], 0, noEl());
    const v = g.duoView(s, NONE, 0);
    assert.deepEqual(v.h.map((h) => h[0]), [1, g.STAND_IN, 3, g.STAND_IN]);
    assert.deepEqual(g.duoView(s, { open: true }, 0).h.map((h) => h[0]), [1, 2, 3, 4]);
  });
  test('Normal takes a free flip when it sees one', () => {
    const weak = card(1, 1, 1, 1), strong = card(9, 9, 9, 9), soft = card(2, 2, 2, 2);
    const s = g.duoNew([[soft, strong], [], [], []], 0, noEl());
    s.b[5] = weak; s.o[5] = 1; s.n = 1;
    // 0.5: not a slip turn (under 0.1) and not a two-step turn (under 0.4)
    for (let k = 0; k < 10; k++) {
      const [hi, cell] = g.duoChoose(s, NONE, 'normal', () => 0.5);
      const c = { ...s, b: s.b.slice(), o: s.o.slice(), m: s.m.slice(), k: s.k.slice(), h: s.h.map((h) => h.slice()) };
      g.duoPlay(c, NONE, hi, cell, null);
      assert.equal(g.duoTeam(c.o[5]), 0, 'it flipped the weak card');
    }
  });
  test('Normal slips now and then: a careless move that is still legal', () => {
    const s = g.duoNew([[card(3, 3, 3, 3), card(4, 4, 4, 4)], [], [], []], 0, noEl());
    let r = 0;
    const [hi, cell] = g.duoChoose(s, NONE, 'normal', () => [0.05, 0.3, 0.9, 0.7][r++ % 4]);
    assert.ok(hi >= 0 && hi < 2 && s.b[cell] < 0);
  });
  test('CPU decks: Easy brings 1★ cards, Normal up to 2★', () => {
    for (let k = 0; k < 10; k++) {
      assert.ok(g.duoCpuDeck('easy').every((id) => g.CARDS[id].rar === 1));
      assert.ok(g.duoCpuDeck('normal').every((id) => g.CARDS[id].rar <= 2));
    }
  });
});

describe('Free-for-all', () => {
  const FFA = { ffa: true };
  const weak = card(1, 1, 1, 1), strong = card(9, 9, 9, 9);
  test('turns go round the table from the first player, as in 2v2 (nobody waits an extra turn)', () => {
    for (let first = 0; first < 4; first++) {
      const s = { first }, order = [...Array(16).keys()].map((n) => g.duoTurnAt(s, FFA, n));
      assert.deepEqual(order.slice(0, 5), [0, 1, 2, 3, 4].map((k) => (first + k) % 4));
      for (let n = 1; n < 16; n++) assert.equal(order[n], (order[n - 1] + 1) % 4, 'always the next seat');
    }
  });
  test('2v2 order: round the table from the opener', () => {
    const s = { first: 2 };
    assert.deepEqual([0, 1, 2, 3, 4].map((n) => g.duoTurnAt(s, {}, n)), [2, 3, 0, 1, 2]);
  });
  test('the seat across the table is an enemy too', () => {
    const { s } = place([[1, weak, 2]], strong, 0, 0, FFA);
    assert.equal(s.o[1], 0);
  });
  test('each seat scores its own squares and hand', () => {
    const s = g.duoNew([[1], [2, 3], [], [4]], 0, noEl());
    s.b[0] = 5; s.o[0] = 0; s.b[1] = 6; s.o[1] = 2; s.b[2] = 7; s.o[2] = 2;
    assert.deepEqual([0, 1, 2, 3].map((p) => g.duoPts(s, FFA, p)), [2, 2, 2, 1]);
  });
  test('places: tied players share one', () => {
    assert.deepEqual([...g.duoPlaces([7, 5, 5, 3])], [1, 2, 2, 4]);
    assert.deepEqual([...g.duoPlaces([5, 5, 5, 5])], [1, 1, 1, 1]);
  });
  test('a CPU sees only its own hand', () => {
    const s = g.duoNew([[1], [2], [3], [4]], 0, noEl());
    assert.deepEqual(g.duoView(s, FFA, 0).h.map((h) => h[0]), [1, g.STAND_IN, g.STAND_IN, g.STAND_IN]);
  });
  test('a whole match with CPUs: legal moves, the turn order, 4 cards each, 20 points in all', () => {
    const rng = g.mulberry32(11);
    const pool = g.CARDS.filter((x) => x.lv <= 4).map((x) => x.id);
    const R = { ffa: true, same: true, plus: true, combo: true, leyLines: true };
    const s = g.duoNew([0, 1, 2, 3].map(() => g.shuffle(pool.slice(), rng).slice(0, 5)), 2, Array(16).fill(null));
    while (!g.duoFull(s)) {
      assert.equal(s.turn, g.duoTurnAt(s, R, s.n));
      const [hi, cell] = g.duoChoose(s, R, s.turn % 2 ? 'easy' : 'normal');
      assert.ok(hi >= 0 && hi < s.h[s.turn].length && s.b[cell] < 0);
      g.duoPlay(s, R, hi, cell, null);
    }
    assert.deepEqual(s.h.map((h) => h.length), [1, 1, 1, 1]);
    assert.equal([0, 1, 2, 3].reduce((a, p) => a + g.duoPts(s, R, p), 0), 20);
  });
});
