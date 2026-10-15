// The Forge (client/js/forge.js): what can go on the anvil, what it makes, and that no way through it
// creates shards or cards out of nothing.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, test } from 'node:test';
import vm from 'node:vm';

const src = (f) => fs.readFileSync(new URL(`../client/js/${f}`, import.meta.url), 'utf8');
// data.js and forge.js as the page loads them. SAVE and owned() come from save.js in the game; here each test sets them.
const ctx = vm.createContext({ performance, console, SAVE: { loadouts: [null, null, null] }, owned: () => 0 });
for (const f of ['data.js', 'forge.js']) vm.runInContext(src(f), ctx, { filename: f });
const g = vm.runInContext(`({CARDS,PACKS,PITY,PITY_PTS,FORGE_MELT,FORGE_FEE,FORGE_TOP,FORGE_N,
  forgeKeep,forgeExtras,forgeFits,forgeWorth,forgeCan,forgePick,forgeTrim,forgePool,forgeFill,forgeLeft,FG})`, ctx);
// store.js needs a browser to run, so its prices are read from the source
const store = src('store.js');
const num = (name) => JSON.parse(store.match(new RegExp(`const ${name}=(\\[[^\\]]*\\]);`))[1]);
const CARD_PRICE = num('CARD_PRICE');
const PACK_PRICE = JSON.parse(store.match(/const PACK_PRICE=(\{[^}]*\});/)[1].replace(/(\w+):/g, '"$1":'));
const DEAL_OFF = +store.match(/const DEAL_OFF=([\d.]+);/)[1];

const byRar = (r) => g.CARDS.filter((c) => c.rar === r).map((c) => c.id);
const one = (r, k = 0) => byRar(r)[k];
const five = (r) => byRar(r).slice(0, 5);
const coll = (counts) => (id) => counts[id] || 0;

describe('what counts as an extra copy', () => {
  test('your last copy of a card always stays', () => {
    const a = one(1), b = one(2);
    const ex = g.forgeExtras(coll({ [a]: 1, [b]: 3 }), []);
    assert.deepEqual(Array.from(ex, (e) => [e.id, e.count]), [[b, 2]]);
  });
  test('copies a held hand uses stay too, as many as the hand that uses the most', () => {
    const a = one(1), b = one(1, 1);
    const lo = [[a, a, b, one(2), one(3)], null, [a, a, a, b, b]];
    assert.equal(g.forgeKeep(a, lo), 3);
    assert.equal(g.forgeKeep(b, lo), 2);
    assert.equal(g.forgeKeep(one(4), lo), 1);
    const ex = g.forgeExtras(coll({ [a]: 3, [b]: 4 }), lo);
    assert.deepEqual(Array.from(ex, (e) => [e.id, e.count]), [[b, 2]]);
  });
  test('only cards you can spare fit, counting copies', () => {
    const a = one(1), ex = [{ id: a, count: 2 }];
    assert.ok(g.forgeFits([a, a], ex));
    assert.ok(!g.forgeFits([a, a, a], ex));
    assert.ok(!g.forgeFits([one(2)], ex));
    assert.ok(g.forgeFits([], []));
  });
  test('cards on the anvil that are no longer spare come off it', () => {
    const a = one(1), b = one(2);
    ctx.SAVE = { loadouts: [null, null, null] };
    ctx.owned = coll({ [a]: 3, [b]: 2 });
    g.FG.sel = [a, a, a, b, b];
    g.forgeTrim();
    assert.deepEqual(Array.from(g.FG.sel), [a, a, b]);
    ctx.SAVE.loadouts = [{ ids: [a, a, a, b, one(3)] }, null, null];
    g.forgeTrim();
    assert.deepEqual(Array.from(g.FG.sel), [b]);
  });
  test('cards still at stake in an unfinished match can not be melted before the loss is taken', () => {
    const a = one(1), b = one(2), c = one(3);
    ctx.owned = coll({ [a]: 2, [b]: 2, [c]: 2 });
    // an online match you left: its hand can still cost you cards (spare.js)
    ctx.SAVE = { loadouts: [null, null, null], owes: [{ k: 'x', deck: [a, a, one(4), one(4, 1), one(5)] }], live: null };
    assert.ok(!g.forgePool().some((e) => e.id === a));
    // a Solo match with a trade rule you can carry on: your hand (player 0) is held, the CPU's isn't
    ctx.SAVE = { loadouts: [null, null, null], owes: [], live: { trade: 'one', decks: [[b, b, one(1, 2), one(1, 3), one(1, 4)], [c, c, c, c, c]] } };
    const pool = g.forgePool();
    assert.ok(!pool.some((e) => e.id === b));
    assert.equal(pool.find((e) => e.id === c).count, 1);
    // without a trade rule nothing is at stake
    ctx.SAVE.live.trade = 'none';
    assert.equal(g.forgePool().find((e) => e.id === b).count, 1);
  });
});

describe('forging', () => {
  test('five of one rarity, 1★ to 3★, make one of the next for a fee', () => {
    for (const r of [1, 2, 3]) {
      const can = g.forgeCan(five(r));
      assert.equal(can.rar, r + 1);
      assert.equal(can.fee, g.FORGE_FEE[r - 1]);
    }
  });
  test('nothing above 4★ is ever made: 4★ and 5★ cards can only be dissolved', () => {
    assert.equal(g.FORGE_TOP, 4);
    for (const r of [4, 5]) assert.ok(g.forgeCan(five(r)).why, `${r}★`);
    for (const r of [1, 2, 3]) assert.ok(g.forgeCan(five(r)).rar <= g.FORGE_TOP);
  });
  test('fewer than five, or mixed rarities, can only be dissolved', () => {
    assert.ok(g.forgeCan(five(1).slice(0, 4)).why);
    assert.ok(g.forgeCan([...five(1).slice(0, 4), one(2)]).why);
    assert.ok(g.forgeCan([]).why);
  });
  test('the same card five times can be forged (copies count, not kinds)', () => {
    const a = one(2);
    assert.equal(g.forgeCan([a, a, a, a, a]).rar, 3);
  });
  test('the card made is of the right rarity, and one you have not found while there are any', () => {
    for (const r of [2, 3, 4]) {
      const ids = byRar(r), found = new Set(ids.slice(1));
      for (const x of [0, 0.5, 0.999999]) {
        assert.equal(g.forgePick(r, (id) => found.has(id), () => x), ids[0], `${r}★ at ${x}`);
        const any = g.forgePick(r, () => true, () => x);
        assert.equal(g.CARDS[any].rar, r);
      }
    }
  });
  test('every rarity the Forge makes has cards', () => {
    for (let r = 2; r <= g.FORGE_TOP; r++) assert.ok(byRar(r).length > 0, `${r}★`);
  });
});

describe('Auto-fill', () => {
  test('fills five spares of the forgeable rarity you have most of, the cards you have most copies of first', () => {
    const [a, b, c] = byRar(1), [d, e] = byRar(2);
    const ids = g.forgeFill([{ id: a, count: 1 }, { id: b, count: 3 }, { id: c, count: 2 }, { id: d, count: 4 }, { id: e, count: 1 }]);
    assert.deepEqual(Array.from(ids), [b, b, b, c, c]);
    assert.ok(g.forgeCan(Array.from(ids)).rar);
  });
  test('never fills 4★ or 5★ cards, and gives up when no rarity has five spares', () => {
    assert.equal(g.forgeFill([{ id: one(4), count: 9 }, { id: one(5), count: 9 }, { id: one(1), count: 4 }]), null);
    assert.equal(g.forgeFill([]), null);
  });
  test('only ever uses copies that are spare', () => {
    const ex = [{ id: one(2), count: 2 }, { id: one(2, 1), count: 3 }];
    assert.ok(g.forgeFits(Array.from(g.forgeFill(ex)), ex));
  });
  test('counts the cards of a rarity still to find', () => {
    const ids = byRar(4), seen = new Set(ids.slice(0, 3));
    assert.deepEqual(Array.from(g.forgeLeft(4, (id) => seen.has(id))), [ids.length - 3, ids.length]);
  });
});

describe('the economy: no way through the Forge pays more than it costs', () => {
  test('dissolving a card pays well under what it costs to buy', () => {
    for (let r = 1; r <= 5; r++) assert.ok(g.FORGE_MELT[r - 1] * 4 <= CARD_PRICE[r - 1], `${r}★: ${g.FORGE_MELT[r - 1]} vs ${CARD_PRICE[r - 1]}`);
  });
  test('a rarer card always dissolves for more, so the anvil never tempts you to melt the wrong one', () => {
    for (let r = 2; r <= 5; r++) assert.ok(g.FORGE_MELT[r - 1] > g.FORGE_MELT[r - 2]);
  });
  test('forging and then dissolving the result pays less than dissolving the five', () => {
    for (const r of [1, 2, 3]) {
      const before = 5 * g.FORGE_MELT[r - 1], after = g.FORGE_MELT[r] - g.FORGE_FEE[r - 1];
      assert.ok(after < before, `${r}★: ${after} vs ${before}`);
    }
  });
  test('buying five cards to forge costs more than buying the card it makes', () => {
    for (const r of [1, 2, 3]) {
      const forged = 5 * CARD_PRICE[r - 1] + g.FORGE_FEE[r - 1];
      assert.ok(forged > CARD_PRICE[r], `${r}★→${r + 1}★: ${forged} vs ${CARD_PRICE[r]}`);
    }
  });
  // what a pack's cards dissolve for, on average: the last card's floor and the 5★ guarantee included
  const melt = (odds, min) => {
    const w = odds.map((x, i) => (i + 1 >= min ? x : 0)), sum = w.reduce((a, b) => a + b, 0);
    return w.reduce((a, x, i) => a + (x / sum) * g.FORGE_MELT[i], 0);
  };
  const packMelt = (t) => {
    const T = g.PACKS[t];
    return (T.n - 1) * melt(T.odds, 1) + melt(T.odds, T.min) + (g.PITY_PTS[t] / g.PITY) * g.FORGE_MELT[4];
  };
  test('a bought pack dissolves for far less than it costs, even at the daily discount', () => {
    for (const t of Object.keys(g.PACKS)) {
      const deal = Math.round((PACK_PRICE[t] * (1 - DEAL_OFF)) / 10) * 10, v = packMelt(t);
      assert.ok(v * 1.5 < deal, `${t}: dissolves for ${v.toFixed(0)}, costs ${deal} on offer`);
    }
  });
  // melting every card of the free daily pack comes to about 50 shards (a fifth of the match limit): kept under a quarter
  test("the free daily pack dissolves for less than a quarter of a day's match shards", () => {
    const cap = +store.match(/const SHARD_CAP=(\d+);/)[1];
    assert.ok(packMelt('spark') < cap / 4, `${packMelt('spark').toFixed(0)} vs ${cap}`);
  });
  test('no 5★ can be forged: packs and their guarantee stay the only way to one', () => {
    assert.ok(g.forgeCan(five(4)).why);
  });
  test('the dissolve value of what you put in is what the anvil says', () => {
    const ids = [one(1), one(2), one(3), one(4), one(5)];
    assert.equal(g.forgeWorth(ids), g.FORGE_MELT.reduce((a, b) => a + b, 0));
    assert.equal(g.forgeWorth([]), 0);
  });
});
