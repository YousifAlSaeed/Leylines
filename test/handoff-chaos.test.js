// Crossroads host hand-off under stress: a seeded storm of hosts leaving, games closing and reloading, connections
// dropping, players split apart and messages lost (handoff-world.js), then calm. However it goes, no game may throw,
// none may hold a copy of the match and its key at once, and in the end everyone still in the match is on one host
// (or the match ended for all of them).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { World, autoplay, room, start, role, hosts } from './handoff-world.js';

const CODE_ID = 'ninefold-tt-abcde';
const prng = (seed) => () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

function check(w, ctx) {
  assert.deepEqual(w.errors.map((e) => e.stack || String(e)), [], ctx());
  for (const d of w.devs) if (!d.dead) assert.equal(d.x('!!(DUO.vault&&DUO.keep&&!DUO.keep.self&&DUO.vault.kid===DUO.keep.kid)'), false, `${ctx()}\n  ${d.name} holds a copy and its key`);
}

// how often each thing happens: harsh (players leave and games close for good as often as they come back), or
// gentle (players mostly come back), which leaves more matches going at the end to check
const MIX = {
  harsh: { leave: 0.15, close: 0.15, back: 0.15, cut: 0.15, split: 0.15, lose: 0.1 },
  gentle: { leave: 0.05, close: 0.08, back: 0.3, cut: 0.2, split: 0.2, lose: 0.08 },
};
// one storm. trace(line): who's hosting, who's on whom, every few seconds (for working out a failing seed)
export async function storm(seed, { mix = 'harsh', verbose = false, trace = null } = {}) {
  const P = MIX[mix];
  const r = prng(seed), pick = (a) => a[Math.floor(r() * a.length)];
  const w = new World(seed);
  const rules = { ffa: r() < 0.5, timer: pick([0, 20, 30]), chaos: r() < 0.3, same: r() < 0.3, plus: r() < 0.3, threeOpen: r() < 0.3, suddenDeath: r() < 0.3 };
  const all = await room(w, { humans: 4, rules });
  await start(w, all);
  const players = [...all]; // each player's game now (a reload replaces it)
  const auto = new Set(all), play = autoplay(w, auto), events = [];
  const ctx = () => `${mix} seed ${seed} ${JSON.stringify(rules)}: ${events.join(', ')}`;
  const live = () => players.filter((d) => !d.dead);
  const t = (s) => events.push(`${Math.round((w.now - 1e6) / 1000)}s ${s}`);
  const end = w.now + 120000;
  const who = (d) => `${d.name}${d.cut ? '(cut)' : ''}:${role(d) || '-'}/ep${d.x('DUO.ep')}` +
    (role(d) === 'guest' ? `${d.x('DUO.hostAway') ? '/away' : ''}→${d.x('DUO.conn&&DUO.conn.open&&DUO.conn.peer')}` : '') +
    (role(d) === 'host' ? `@${d.x('DUO.pid')}${d.x('DUO.probe') ? ` asking ${d.x('DUO.probe.pids')}` : ''}` : '');
  const snap = () => trace && trace(`${Math.round((w.now - 1e6) / 1000)}s  ${w.devs.filter((d) => !d.dead).map(who).join('  ')}  (code: ${w.ids.get(CODE_ID)?.dev.name || 'nobody'})`);
  while (w.now < end) {
    await w.run(2000 + Math.floor(r() * 6000), play);
    snap();
    check(w, ctx);
    let k = r();
    const is = (e) => (k -= P[e]) < 0;
    if (is('leave')) { // the host leaves
      const h = hosts(w).find((d) => !d.cut);
      if (!h) continue;
      t(`${h.name} leaves`);
      h.x('duoLeave()');
      const m = h.modals.at(-1), b = m && m.btns.find((x) => /^(Leave|End match|Close room)$/.test(x.label));
      if (b && b.fn && role(h)) b.fn();
      auto.delete(h);
    } else if (is('close')) { // a game closes
      const d = pick(live());
      if (!d) continue;
      t(`${d.name} closes`); w.kill(d); auto.delete(d);
    } else if (is('back')) { // a closed game opens again, or a player who left, and rejoins from the menu
      const i = players.findIndex((d) => d.dead || !role(d));
      if (i < 0) continue;
      const old = players[i], d = old.dead ? w.device(old.name, { ls: old.ls, ss: old.ss }) : old;
      players[i] = d;
      const back = d.x('!!duoResumeInfo()');
      t(`${d.name} ${old.dead ? 'reopens' : 'is back'}${back ? ' and rejoins' : ''}`);
      if (back) { d.x('duoRejoin()'); auto.add(d); }
    } else if (is('cut')) { // a connection drops for a while
      const d = pick(live().filter((x) => !x.cut)), ms = 3000 + Math.floor(r() * 35000);
      if (!d) continue;
      t(`${d.name} cut ${Math.round(ms / 1000)}s`); w.cut(d); w.later(null, () => w.uncut(d), ms);
    } else if (is('split')) { // two players can't reach each other for a while
      const a = pick(live()), b = pick(live().filter((x) => x !== a)), ms = 3000 + Math.floor(r() * 35000);
      if (!a || !b) continue;
      t(`${a.name}/${b.name} split ${Math.round(ms / 1000)}s`); w.split(a, b); w.later(null, () => w.join(a, b), ms);
    } else if (is('lose')) { // hand-offs and copies get lost for a while
      t('messages lost 10s');
      w.drop = (f, to, m) => (m.t === 'host' || m.t === 'vault' || m.t === 'key') && r() < 0.5;
      w.later(null, () => { w.drop = null; }, 10000);
    }
  }
  // calm: everything heals, and there's time for the cut-off games to find the match (or for it to end)
  w.drop = null; w.blocks.clear();
  for (const d of w.devs) if (d.cut) w.uncut(d);
  for (let k = 0; k < 24; k++) { await w.run(10000, play); if (k % 4 === 0 || k === 23) snap(); }
  check(w, ctx);
  const inGame = live().filter((d) => role(d)), hs = inGame.filter((d) => role(d) === 'host');
  assert.ok(hs.length <= 1, `${ctx()}\n  hosts: ${hs.map((d) => d.name)}`);
  if (hs.length) {
    for (const g of inGame) if (g !== hs[0]) {
      const to = g.x('DUO.conn&&DUO.conn.open&&DUO.conn.peer');
      assert.ok(to === hs[0].x('DUO.pid') || to === CODE_ID && w.ids.get(CODE_ID)?.dev === hs[0], `${ctx()}\n  ${g.name} isn't on ${hs[0].name} (${to})`);
    }
  } else assert.deepEqual(inGame.map((d) => d.name), [], `${ctx()}\n  in a match with no host`);
  if (verbose) console.log(ctx(), '→', hs.length ? `${hs[0].name} hosts ${inGame.length}` : 'over for everyone');
  return { events, hosts: hs.length, inGame: inGame.length };
}

test('stress: hosts leave, games close and reopen, connections drop, players split, messages get lost', async () => {
  for (let seed = 1; seed <= 40; seed++) { await storm(seed); await storm(seed, { mix: 'gentle' }); }
});
