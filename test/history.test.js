// Match history on public profiles: shown unless hidden, and only checked fields leave the server.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

Object.assign(process.env, { EMAIL_KEY: 'test-email-key-0123456789abcdefghij' });
const { publicHistory } = await import('../server/lib/users.js');

const entry = {
  t: 1759500000000, m: 'online', bo: 3, r: 'w', log: [[6, 4], [3, 7], [5, 4]], me: [0, 1, 2, 3, 4], op: [5, 6, 7, 8, 9],
  ru: ['open', 'same', 'plus'], tm: 45, tr: 'one', xp: 90, n: 'Yousif', u: 'yousif', av: 12, won: [6], sw: 1,
};

describe('publicHistory', () => {
  test('a normal entry comes through as it was', () => {
    assert.deepEqual(publicHistory({ history: [entry] }), [entry]);
  });
  test('hidden history is null', () => {
    assert.equal(publicHistory({ history: [entry], hideHist: true }), null);
  });
  test('no save, or no history, is an empty list', () => {
    assert.deepEqual(publicHistory(null), []);
    assert.deepEqual(publicHistory({}), []);
  });
  test('bad values are cleaned and unknown fields dropped', () => {
    const [e] = publicHistory({ history: [{ ...entry, m: 'hack', d: 'godlike', n: '<b>x</b>', u: 'no spaces!', av: 999, bo: 7, r: 'x',
      log: [[99, -1], 'x'], me: [1, 'a', 200], ru: ['open', 'evil'], tm: 500, tr: 'steal', xp: -3, q: 'nope', extra: 'secret' }] });
    assert.deepEqual(e, { t: entry.t, m: 'ai', bo: 1, r: 'd', log: [[10, 0]], me: [1], op: entry.op, ru: ['open'], tm: 90, tr: 'none',
      xp: 0, d: 'normal', won: [6], sw: 1 });
  });
  test('Daily games saved by old versions are left out', () => {
    assert.deepEqual(publicHistory({ history: [{ ...entry, m: 'ai', dk: 'gauntlet' }, { ...entry, m: 'ai', dk: 'duel' }] }), []);
    assert.equal(publicHistory({ history: [{ ...entry, m: 'ai', dk: 'duel' }, entry] }).length, 1);
  });
  test('keeps at most the last 30', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ ...entry, t: i }));
    const out = publicHistory({ history: many });
    assert.equal(out.length, 30);
    assert.equal(out[0].t, 10);
  });
});
