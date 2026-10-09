// The Expedition (client/js/exp-core.js and its hooks in engine.js): locked squares, relic bonuses,
// upgraded cards, and the act maps.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { loadGame } from './client.js';

const g = loadGame();
// a made-up card with these sides [top, right, bottom, left] (10 = X), added to the card list
const card = (t, r, b, l, e = null) => (g.CARDS.push({ id: g.CARDS.length, name: 'test', s: [t, r, b, l], e, lv: 1, rar: 1, sum: t + r + b + l }), g.CARDS.length - 1);
// an Expedition board: no square locked, no square modifiers, no bonuses yet
function expState(hand, el = Array(9).fill(null)) {
  const s = g.newState(hand, [], 0, el);
  s.k = Array(9).fill(0); s.x = Array(9).fill(0); s.nx = [0, 0]; s.pc = [0, 0];
  return s;
}
// puts cards on the board, then player 0 places hand card 0 on `cell`
function place(board, id, cell, rules = {}, setup = () => {}) {
  const s = expState([id]);
  for (const [c, cid, owner] of board) { s.b[c] = cid; s.o[c] = owner; }
  setup(s);
  const ev = [];
  g.play(s, rules, 0, cell, ev);
  return { owners: s.o, ev, s };
}
const bon = (B) => ({ bon: [B, null] });
// arrays and objects made inside the sandbox, as plain ones here (deepEqual checks where they come from)
const A = (x) => JSON.parse(JSON.stringify(x));

describe('locked squares (roots, Bulwark, Anchor)', () => {
  const enemy = card(1, 1, 1, 3), strong = card(1, 9, 1, 1);
  test('a card on a locked square is never flipped by a higher number', () => {
    assert.equal(place([[1, enemy, 1]], strong, 0).owners[1], 0);
    assert.equal(place([[1, enemy, 1]], strong, 0, {}, (s) => { s.k[1] = 1; }).owners[1], 1);
  });
  test('nor by Same, Plus or Combo', () => {
    const up = card(1, 1, 6, 1), left = card(1, 7, 1, 1), placed = card(6, 1, 1, 7);
    const r = place([[1, up, 1], [3, left, 1]], placed, 4, { same: true }, (s) => { s.k[1] = 1; });
    assert.deepEqual([r.owners[1], r.owners[3]], [1, 0]);
    const pu = card(1, 1, 6, 1), pl = card(1, 6, 1, 1);
    const p = place([[1, pu, 1], [3, pl, 1]], card(2, 1, 1, 2), 4, { plus: true }, (s) => { s.k[3] = 1; });
    assert.deepEqual([p.owners[1], p.owners[3]], [0, 1]);
  });
  test('Anchor locks your first card only', () => {
    const s = expState([card(5, 5, 5, 5), card(5, 5, 5, 5)]);
    const R = bon({ anchor: 1 });
    g.play(s, R, 0, 0, null); s.turn = 0;
    g.play(s, R, 0, 1, null);
    assert.deepEqual([s.k[0], s.k[1]], [1, 0]);
    assert.deepEqual(A(s.pc), [2, 0]);
  });
});

describe('relic bonuses', () => {
  const enemy = card(1, 1, 1, 5);
  test('Tiebreaker: an equal number flips, for its owner only', () => {
    const five = card(1, 5, 1, 1);
    assert.equal(place([[1, enemy, 1]], five, 0).owners[1], 1);
    assert.equal(place([[1, enemy, 1]], five, 0, bon({ tie: 1 })).owners[1], 0);
    assert.equal(place([[1, enemy, 1]], five, 0, { bon: [null, { tie: 1 }] }).owners[1], 1);
  });
  test('Tiebreaker with Reverse: an equal number still wins', () => {
    const five = card(1, 5, 1, 1);
    assert.equal(place([[1, enemy, 1]], five, 0, { reverse: true, ...bon({ tie: 1 }) }).owners[1], 0);
  });
  test('Cornerstone adds 1 in a corner, not elsewhere', () => {
    const four = card(4, 4, 4, 4);
    assert.equal(place([[1, enemy, 1]], four, 0, bon({ corner: 1 })).owners[1], 1); // 5 vs 5: no flip
    const e2 = card(1, 1, 1, 4);
    assert.equal(place([[1, e2, 1]], four, 0, bon({ corner: 1 })).owners[1], 0);  // 5 vs 4
    assert.equal(place([[1, e2, 1]], four, 0, bon({ corner: 1 })).s.m[0], 1);
    assert.equal(place([[4, e2, 1]], four, 3, bon({ corner: 1 })).s.m[3], 0);
  });
  test('Keystone adds 2 in the middle', () => {
    assert.equal(place([], card(4, 4, 4, 4), 4, bon({ mid: 2 })).s.m[4], 2);
  });
  test('First Light only lifts the first card each player places', () => {
    const s = expState([card(4, 4, 4, 4), card(4, 4, 4, 4)]);
    const R = bon({ first: 1 });
    g.play(s, R, 0, 0, null); s.turn = 0;
    g.play(s, R, 0, 2, null);
    assert.deepEqual([s.m[0], s.m[2]], [1, 0]);
  });
  test('Echo Chime: Combo works for its owner with the rule off', () => {
    const up = card(1, 8, 6, 1), left = card(1, 7, 1, 1), far = card(1, 1, 1, 3), placed = card(6, 1, 1, 7);
    const board = [[1, up, 1], [3, left, 1], [2, far, 1]];
    assert.equal(place(board, placed, 4, { same: true }).owners[2], 1);
    assert.equal(place(board, placed, 4, { same: true, ...bon({ combo: 1 }) }).owners[2], 0);
  });
  test('Prism Lens: an element square never takes a point; Prism Heart: −2 for a card with no element', () => {
    const el = Array(9).fill(null); el[0] = 'ice';
    const plain = card(1, 5, 1, 1), fire = card(1, 5, 1, 1, 'fire');
    const at = (id, B) => { const s = expState([id], el); g.play(s, { elemental: true, ...bon(B) }, 0, 0, null); return s.m[0]; };
    assert.equal(at(plain, null), -1);
    assert.equal(at(plain, { lens: 1 }), 1);
    assert.equal(at(plain, { heart: 1 }), -2);
    assert.equal(at(fire, { heart: 1 }), 1);
  });
  test('Empower lifts the next card once; a square\'s own modifier (High tide) adds too', () => {
    const s = expState([card(4, 4, 4, 4), card(4, 4, 4, 4)]);
    s.nx[0] = 2; s.x[2] = -1;
    g.play(s, {}, 0, 0, null); s.turn = 0;
    g.play(s, {}, 0, 2, null);
    assert.deepEqual([s.m[0], s.m[2], s.nx[0]], [2, -1, 0]);
  });
  test('the AI search copies the extra state', () => {
    const s = expState([1]); s.k[3] = 1; s.x[5] = -1; s.nx[1] = 2;
    const c = g.cloneS(s);
    c.k[3] = 0; c.x[5] = 0; c.nx[1] = 0; c.pc[0] = 9;
    assert.deepEqual([s.k[3], s.x[5], s.nx[1], s.pc[0]], [1, -1, 2, 0]);
  });
});

describe('your cards on the road', () => {
  const run = (bag, relics = []) => ({ bag, relics });
  // Frostpup (id 7): 5, 3, 1, 6, ice, 1★. Thunder Ox (id 28): 7, 3, 6, 5, 3★. Seraph Warden (id 45): 8, 5, 9, 6, 4★
  test('upgrades change the numbers, and only for the run copy', () => {
    const r = run([{ b: 7, u: [0, 0, 2, 0], k: 'own' }]);
    g.expCards(r);
    assert.deepEqual(A(g.cardOf(g.RUN_ID).s), [5, 3, 3, 6]);
    assert.deepEqual(A(g.cardOf(g.RUN_ID).d), [0, 0, 2, 0]);
    assert.deepEqual(A(g.CARDS[7].s), [5, 3, 1, 6]);
    assert.equal(g.baseId(g.RUN_ID), 7);
    assert.equal(g.baseId(7), 7);
  });
  test('sides stay between 1 and X', () => {
    g.expCards(run([{ b: 7, u: [9, 0, -5, 0], k: 'own' }]));
    assert.deepEqual(A(g.cardOf(g.RUN_ID).s), [10, 3, 1, 6]);
  });
  test('Turn moves every number one side round, clockwise', () => {
    g.expCards(run([{ b: 7, u: [0, 0, 0, 0], r: 1, k: 'own' }]));
    assert.deepEqual(A(g.cardOf(g.RUN_ID).s), [6, 5, 3, 1]);
  });
  test('Crown of Thorns, Underdog\'s Pact and Molten Core change every card', () => {
    const bag = [{ b: 7, u: [0, 0, 0, 0], k: 'own' }, { b: 45, u: [0, 0, 0, 0], k: 'own' }];
    g.expCards(run(bag, ['crown']));
    assert.deepEqual(A(g.cardOf(g.RUN_ID).s), [6, 4, 2, 7]);
    g.expCards(run(bag, ['pact']));
    assert.deepEqual([A(g.cardOf(g.RUN_ID).s), A(g.cardOf(g.RUN_ID + 1).s)], [[7, 5, 3, 8], [7, 4, 8, 5]]);
    g.expCards(run(bag, ['molten']));
    assert.deepEqual(A(g.cardOf(g.RUN_ID + 1).s), [8, 5, 8, 6]);
  });
  test('an upgraded card fights with its new numbers', () => {
    g.expCards(run([{ b: 7, u: [0, 4, 0, 0], k: 'own' }]));   // right side 3 → 7
    const enemy = card(1, 1, 1, 6);
    assert.equal(place([[1, enemy, 1]], g.RUN_ID, 0).owners[1], 0);
    g.expCards(null);
  });
  test('relics become the engine\'s bonuses', () => {
    assert.deepEqual(A(g.expBon(run([], ['cornerstone', 'keystone', 'firstlight', 'molten', 'tiebreaker']))), { corner: 1, mid: 2, first: 4, tie: 1 });
    assert.equal(g.maxHearts(run([], ['crown'])), 2);
    assert.equal(g.scrollSlots(run([], ['satchel'])), 3);
    assert.equal(g.priceOf(run([], ['haggler']), 100), 75);
    assert.equal(g.winEmbers(run([], ['goldtooth', 'coin']), 'fight'), 80);
  });
  test('every boss relic has a catch, and no other relic does', () => {
    for (const [k, R] of Object.entries(g.RELICS)) assert.equal(!!R.c, R.t === 5, k);
  });
});

describe('the act maps', () => {
  const kinds = (map, path) => path.map(([r, i]) => map[r][i].t);
  // every path from the first row to the boss
  function paths(map) {
    const out = [];
    const walk = (pos, p) => { const n = g.expNext(map, pos); if (!n.length) { out.push(p); return; } n.forEach((q) => walk(q, [...p, q])); };
    walk(null, []);
    return out;
  }
  test('6 rows: 3 matches first, the boss last, and every stop leads somewhere', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const map = g.expMap(g.mulberry32(seed));
      assert.equal(map.length, 6);
      assert.ok(map[0].every((n) => n.t === 'fight'));
      assert.deepEqual(A(map[5].map((n) => n.t)), ['boss']);
      map.slice(0, 5).forEach((row) => row.forEach((n) => assert.ok(n.to.length > 0)));
    }
  });
  test('every path has 2 matches (or an elite) and then the boss, and every stop can be reached', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const map = g.expMap(g.mulberry32(seed)), all = paths(map), seen = new Set();
      for (const p of all) {
        const t = kinds(map, p);
        assert.equal(t.filter((k) => k === 'fight' || k === 'elite').length, 2, `seed ${seed}: ${t}`);
        assert.equal(t[t.length - 1], 'boss');
        p.forEach((q) => seen.add(q.join()));
      }
      assert.equal(seen.size, map.reduce((a, r) => a + r.length, 0), `seed ${seed}`);
    }
  });
  test('paths never cross', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const map = g.expMap(g.mulberry32(seed));
      for (let r = 0; r < 4; r++) {
        const edges = map[r].flatMap((n, i) => n.to.map((j) => [i, j]));
        for (const [a, b] of edges) for (const [c, d] of edges) assert.ok(!(a < c && b > d), `seed ${seed} row ${r}`);
      }
    }
  });
  test('the same seed gives the same map', () => {
    assert.deepEqual(A(g.expMap(g.mulberry32(7))), A(g.expMap(g.mulberry32(7))));
  });
  test('CPU hands: one card per level band, no repeats', () => {
    for (let seed = 1; seed <= 50; seed++) for (const A of g.EXP_ACTS) {
      const h = g.expHand(g.mulberry32(seed), A.bands);
      assert.equal(new Set(h).size, 5);
      h.forEach((id, k) => assert.ok(g.CARDS[id].lv >= A.bands[k][0] && g.CARDS[id].lv <= A.bands[k][1]));
    }
  });
  test('each act has 2 bosses, each with a trick', () => {
    for (const A of g.EXP_ACTS) {
      assert.equal(A.bosses.length, 2);
      A.bosses.forEach((b) => assert.ok(g.EXP_BOSS[b] && g.EXP_BOSS[b].trick && g.EXP_BOSS[b].text));
    }
  });
});
