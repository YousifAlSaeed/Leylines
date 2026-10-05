// The tutorial's lessons (client/js/data.js TUT): each one's move must do what the coach says it does.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { loadGame } from './client.js';

const g = loadGame();
const lesson = (name) => g.TUT.find((l) => l.name === name);

// plays the lesson's move with its rules; returns the flip events and the final owners
function play(L) {
  const s = g.newState(L.hand, [], 0, Array(9).fill(null));
  for (const [c, id] of L.board) { s.b[c] = id; s.o[c] = 1; }
  const ev = [];
  g.play(s, L.rules, L.pick, L.cell, ev);
  return { ev: ev.map((e) => [e.t, [...e.cells].sort()]), owners: s.o };
}
const sides = (id) => g.CARDS[id].s; // [top, right, bottom, left]

describe('tutorial lessons', () => {
  test('there are 4: Capture, Same, Plus, Combo', () => {
    assert.deepEqual(Array.from(g.TUT, (l) => l.name), ['Capture', 'Same', 'Plus', 'Combo']);
  });
  test('each lesson can be played: its card is in the hand and its square is empty', () => {
    for (const L of g.TUT) {
      assert.ok(L.hand[L.pick] != null, L.name);
      assert.ok(!L.board.some(([c]) => c === L.cell), L.name);
      for (const id of [...L.hand, ...L.board.map(([, id]) => id)]) assert.ok(g.CARDS[id], `${L.name}: card ${id}`);
    }
  });
  test('Capture: a higher side flips the card', () => {
    assert.deepEqual(play(lesson('Capture')).ev, [['basic', [4]]]);
  });
  test('Same: both touching cards flip by Same', () => {
    assert.deepEqual(play(lesson('Same')).ev, [['same', [1, 3]]]);
  });
  test('Plus: both touching cards flip by Plus', () => {
    assert.deepEqual(play(lesson('Plus')).ev, [['plus', [1, 3]]]);
  });
  test('Combo: Same flips 2, then those flip 2 more', () => {
    const { ev, owners } = play(lesson('Combo'));
    assert.deepEqual(ev, [['same', [1, 3]], ['combo', [0, 2]]]);
    assert.ok(lesson('Combo').board.every(([c]) => owners[c] === 0), 'every CPU card is yours');
  });
  // so nobody thinks every side has to be the same number
  test('Same matches two different numbers, and Plus adds different pairs', () => {
    const S = lesson('Same'), sc = sides(S.hand[S.pick]);
    assert.notEqual(sc[0], sc[3], 'Same: top and left differ');
    const P = lesson('Plus'), pc = sides(P.hand[P.pick]), top = sides(P.board.find(([c]) => c === 1)[1]), left = sides(P.board.find(([c]) => c === 3)[1]);
    assert.notEqual(pc[0], pc[3], 'Plus: top and left differ');
    assert.notEqual(top[2], left[1], 'Plus: the touching enemy sides differ');
  });
  test('the reward is a real pack', () => {
    assert.ok(g.PACKS[g.TUT_PACK]);
  });
});
