// Your colour in Crossroads (client/js/duo.js duoColFor): a player sits down in their own colour (Settings → Your
// colour) when nobody has it, a CPU gives it up, and otherwise they get a free one that isn't red.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { World } from './handoff-world.js';

// a host and two players, each wanting a colour; the host fills the empty seat with a CPU before anyone joins
async function table(cols, cpuCol) {
  const w = new World(5);
  const all = ['Host', 'Bea', 'Cy'].map((n, i) => Object.assign(w.device(n), { col: cols[i] }));
  all[0].x('duoHost()'); await w.run(400);
  all[0].x(`DUO.seats[1]={kind:'cpu',diff:'normal',col:${JSON.stringify(cpuCol)}};duoChanged()`);
  for (const d of all.slice(1)) { d.x(`duoJoin('ABCDE')`); await w.run(800); }
  return { w, all, seats: JSON.parse(all[0].x('JSON.stringify(DUO.seats.map(s=>[s.kind,s.col]))')) };
}

test('everyone sits in their own colour when nobody else has it', async () => {
  const { seats } = await table(['green', 'purple', 'gold'], 'teal');
  const humans = seats.filter(([k]) => k === 'human').map(([, c]) => c).sort();
  assert.deepEqual(humans, ['gold', 'green', 'purple']);
});

test('a CPU gives its colour up to a player who plays in it', async () => {
  const { seats } = await table(['green', 'teal', 'gold'], 'teal');
  const cpu = seats.find(([k]) => k === 'cpu');
  assert.ok(seats.some(([k, c]) => k === 'human' && c === 'teal'), 'the player has teal');
  assert.ok(cpu && cpu[1] !== 'teal', 'the CPU took another colour');
  assert.equal(new Set(seats.filter(([k]) => k !== 'open').map(([, c]) => c)).size, 4, 'no two seats share a colour');
});

test('a taken colour: the player gets a free one, never red', async () => {
  const { seats } = await table(['blue', 'blue', 'blue'], 'gold');
  const taken = seats.filter(([k]) => k !== 'open').map(([, c]) => c);
  assert.equal(new Set(taken).size, 4, 'no two seats share a colour');
  for (const [k, c] of seats) if (k === 'human') assert.notEqual(c, 'red');
});
