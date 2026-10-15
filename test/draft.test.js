// Draft (online 1v1): the 10 cards on the table and the pick order, which both players work out from the same seed.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadGame } from './client.js';

const g = loadGame();
const SEEDS = [1, 42, 123456789, 0xdeadbeef, 2 ** 32 - 1];

test('the table has 10 different cards, 2 of each rarity from 1★ to 5★', () => {
  for (const seed of SEEDS) {
    const pool = g.draftPool(seed);
    assert.equal(pool.length, 10);
    assert.equal(new Set(pool).size, 10);
    assert.deepEqual([...pool].map(id => g.CARDS[id].rar), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  }
});

test('both players get the same table from the same seed, and a new seed deals a new one', () => {
  assert.deepEqual([...g.draftPool(42)], [...g.draftPool(42)]);
  assert.notDeepEqual([...g.draftPool(42)], [...g.draftPool(43)]);
});

test('the pick order is 1, 2, 2, 2, 2, 1 and gives each player 5', () => {
  assert.deepEqual([...g.DRAFT_ORDER], [0, 1, 1, 0, 0, 1, 1, 0, 0, 1]);
  for (const seed of SEEDS) {
    const seats = g.DRAFT_ORDER.map((_, n) => g.draftTurn(seed, n));
    assert.equal(seats.filter(s => s === 0).length, 5);
    assert.equal(seats.filter(s => s === 1).length, 5);
    assert.equal(g.draftTurn(seed, 10), -1);
  }
});

test('whoever plays second picks first', () => {
  for (const seed of SEEDS) {
    const playsFirst = g.mulberry32(seed)() < 0.5 ? 0 : 1; // match.js startMatch
    assert.equal(g.draftFirst(seed), 1 - playsFirst);
    assert.equal(g.draftTurn(seed, 0), 1 - playsFirst);
  }
});

test('with Random on, the table is any 10 cards, laid out from 1★ to 5★', () => {
  const mixes = new Set();
  for (let seed = 1; seed <= 200; seed++) {
    const pool = [...g.draftPool(seed, true)], rars = pool.map(id => g.CARDS[id].rar);
    assert.equal(pool.length, 10);
    assert.equal(new Set(pool).size, 10);
    assert.deepEqual(rars, [...rars].sort((a, b) => a - b));
    assert.deepEqual(pool, [...g.draftPool(seed, true)]);
    mixes.add(rars.join(''));
  }
  // not the fixed 2 of each rarity: many different mixes come up
  assert.ok(mixes.size > 20);
  assert.ok(![...mixes].every(m => m === '1122334455'));
});
