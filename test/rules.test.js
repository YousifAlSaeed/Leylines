// The game rules: captures, Same, Same wall, Plus, Combo, Elemental, Chaos and series.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { loadGame } from './client.js';

const g = loadGame();
const NONE = {};
// a made-up card with these sides [top, right, bottom, left] (10 = X), added to the card list
const card = (t, r, b, l, e = null) => (g.CARDS.push({ id: g.CARDS.length, name: 'test', s: [t, r, b, l], e, lv: 1, sum: t + r + b + l }), g.CARDS.length - 1);

// board cells:  0 1 2 / 3 4 5 / 6 7 8. Puts cards on the board, then player 0 places `id` on `cell`
function place(board, id, cell, rules = NONE, el = Array(9).fill(null)) {
  const s = g.newState([id], [], 0, el);
  for (const [c, cid, owner] of board) { s.b[c] = cid; s.o[c] = owner; }
  const ev = [];
  g.play(s, rules, 0, cell, ev);
  return { owners: s.o, ev, s };
}

describe('basic capture', () => {
  test('a higher touching side flips the enemy card', () => {
    const enemy = card(1, 1, 1, 3);                 // left side 3
    const { owners } = place([[1, enemy, 1]], card(1, 5, 1, 1), 0); // right side 5 touches it
    assert.equal(owners[1], 0);
  });
  test('an equal or lower side does not flip', () => {
    const enemy = card(1, 1, 1, 5);
    assert.equal(place([[1, enemy, 1]], card(1, 5, 1, 1), 0).owners[1], 1);
    assert.equal(place([[1, enemy, 1]], card(1, 4, 1, 1), 0).owners[1], 1);
  });
  test('your own cards never flip', () => {
    const mine = card(1, 1, 1, 1);
    assert.equal(place([[1, mine, 0]], card(9, 9, 9, 9), 0).owners[1], 0);
  });
  test('score counts cards owned on the board plus cards in hand', () => {
    const s = g.newState([1, 2], [3], 0, Array(9).fill(null));
    s.b[0] = 4; s.o[0] = 0; s.b[1] = 5; s.o[1] = 1;
    assert.equal(g.score(s, 0), 3);
    assert.equal(g.score(s, 1), 2);
  });
});

describe('Same and Same wall', () => {
  // placed on 4 (centre): its top touches cell 1's bottom, its left touches cell 3's right
  const up = card(1, 1, 6, 1), left = card(1, 7, 1, 1);
  const placed = card(6, 1, 1, 7);
  test('two matching sides flip both enemy cards', () => {
    const { owners, ev } = place([[1, up, 1], [3, left, 1]], placed, 4, { same: true });
    assert.deepEqual([owners[1], owners[3]], [0, 0]);
    assert.ok(ev.some((e) => e.t === 'same'));
  });
  test('without the Same rule, equal sides do nothing', () => {
    const { owners } = place([[1, up, 1], [3, left, 1]], placed, 4, NONE);
    assert.deepEqual([owners[1], owners[3]], [1, 1]);
  });
  test('one match alone is not enough', () => {
    const other = card(1, 9, 1, 1);
    const { owners } = place([[1, up, 1], [3, other, 1]], placed, 4, { same: true });
    assert.deepEqual([owners[1], owners[3]], [1, 1]);
  });
  test('Same wall: an X facing the board edge counts as a match', () => {
    // placed on 1 (top middle): its top A faces the wall, its left touches cell 0's right
    const corner = card(1, 4, 1, 1), astra = card(10, 1, 1, 4);
    assert.equal(place([[0, corner, 1]], astra, 1, { same: true }).owners[0], 1);
    assert.equal(place([[0, corner, 1]], astra, 1, { same: true, sameWall: true }).owners[0], 0);
  });
});

describe('Plus and Combo', () => {
  test('two touching pairs with the same sum flip, even with lower numbers', () => {
    const up = card(1, 1, 6, 1), left = card(1, 6, 1, 1);  // 2+6 = 8 and 2+6 = 8
    const { owners, ev } = place([[1, up, 1], [3, left, 1]], card(2, 1, 1, 2), 4, { plus: true });
    assert.deepEqual([owners[1], owners[3]], [0, 0]);
    assert.ok(ev.some((e) => e.t === 'plus'));
  });
  test('Combo: a card flipped by Same flips its weaker neighbours', () => {
    // Same flips cell 1; cell 1's right side (8) then beats cell 2's left side (3)
    const up = card(1, 8, 6, 1), left = card(1, 7, 1, 1), far = card(1, 1, 1, 3);
    const board = [[1, up, 1], [3, left, 1], [2, far, 1]];
    const placed = card(6, 1, 1, 7);
    const off = place(board, placed, 4, { same: true });
    assert.equal(off.owners[2], 1);
    const on = place(board, placed, 4, { same: true, combo: true });
    assert.equal(on.owners[2], 0);
    assert.ok(on.ev.some((e) => e.t === 'combo'));
  });
});

describe('Elemental', () => {
  const enemy = card(1, 1, 1, 5);
  const fire = card(1, 5, 1, 1, 'fire'), plain = card(1, 6, 1, 1);
  const el = (k) => { const a = Array(9).fill(null); a[0] = k; return a; };
  test('a matching element gets +1 and can capture', () => {
    assert.equal(place([[1, enemy, 1]], fire, 0, { elemental: true }, el('fire')).owners[1], 0);
    assert.equal(place([[1, enemy, 1]], fire, 0, NONE, el('fire')).owners[1], 1);
  });
  test('any other card on an element square gets -1', () => {
    assert.equal(place([[1, enemy, 1]], plain, 0, NONE, el('ice')).owners[1], 0);
    assert.equal(place([[1, enemy, 1]], plain, 0, { elemental: true }, el('ice')).owners[1], 1);
  });
  test('squares are only given out when the rule is on, 1 to 4 of them, the same for the same seed', () => {
    assert.ok(g.genElements(NONE, g.mulberry32(1)).every((x) => x === null));
    for (let seed = 1; seed < 50; seed++) {
      const a = g.genElements({ elemental: true }, g.mulberry32(seed));
      const n = a.filter(Boolean).length;
      assert.ok(n >= 1 && n <= 4, `seed ${seed} gave ${n} squares`);
      assert.deepEqual(g.genElements({ elemental: true }, g.mulberry32(seed)), a);
    }
  });
});

describe('Chaos', () => {
  const hand = () => [0, 1, 2, 3, 4];
  test('the picked card is always in the hand, and the same seed picks the same cards (online sync)', () => {
    const r1 = g.mulberry32(42), r2 = g.mulberry32(42);
    for (let k = 0; k < 40; k++) {
      const s = g.newState(hand().slice(0, 1 + (k % 5)), hand(), 0, Array(9).fill(null));
      const a = g.chaosPick(s, r1), b = g.chaosPick(s, r2);
      assert.equal(a, b);
      assert.ok(a >= 0 && a < s.h[0].length);
    }
  });
  test('the CPU only ever plays the picked card, on every difficulty', () => {
    for (const level of ['easy', 'normal', 'hard']) {
      for (let forced = 0; forced < 5; forced++) {
        const s = g.newState([10, 20, 30, 40, 50], [11, 21, 31, 41, 51], 0, Array(9).fill(null));
        const [hi, cell] = g.aiChoose(s, { same: true, plus: true, combo: true }, level, forced);
        assert.equal(hi, forced, `${level} played card ${hi}, not ${forced}`);
        assert.equal(s.b[cell], -1);
      }
    }
  });
  test('without Chaos the CPU makes a legal move', () => {
    const s = g.newState([10, 20], [11, 21], 0, Array(9).fill(null));
    s.b[4] = 3; s.o[4] = 1;
    const [hi, cell] = g.aiChoose(s, NONE, 'normal');
    assert.ok(hi >= 0 && hi < 2);
    assert.notEqual(cell, 4);
  });
});

describe('best-of series', () => {
  test('a single match is over after one match', () => assert.ok(g.seriesDone(1, 1, [0, 0])));
  test('best of 3 ends early at 2-0, but not at 1-0', () => {
    assert.ok(g.seriesDone(3, 2, [2, 0]));
    assert.ok(!g.seriesDone(3, 1, [1, 0]));
  });
  test('a draw counts for nobody: win then draw goes on to match 3', () => {
    assert.ok(!g.seriesDone(3, 2, [1, 0]));
    assert.ok(g.seriesDone(3, 3, [1, 0]));
  });
  test('all matches played ends it, even when tied', () => assert.ok(g.seriesDone(3, 3, [1, 1])));
  test('best of 5 ends at 3-0 or 3-1, not at 2-1', () => {
    assert.ok(g.seriesDone(5, 3, [3, 0]));
    assert.ok(g.seriesDone(5, 4, [1, 3]));
    assert.ok(!g.seriesDone(5, 3, [2, 1]));
  });
  test('only 1, 3 and 5 are valid series lengths', () => {
    assert.deepEqual([...g.SERIES.map((x) => x[0])], [1, 3, 5]);
    assert.equal(g.boOf(3), 3);
    assert.equal(g.boOf(4), 1);
    assert.equal(g.boOf('5'), 1);
  });
});
