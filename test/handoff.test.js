// Crossroads host hand-off (client/js/duo.js, duo-handoff.js), end to end: real games on a pretend network
// (handoff-world.js). The host leaves, closes the game, drops out or gets cut off; the match must go on with a new host,
// and nobody may see a hand they shouldn't.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { World, LAT, autoplay, room, start, role, seatOf, hosts, moves } from './handoff-world.js';

const noErrors = (w) => assert.deepEqual(w.errors.map((e) => e.stack || String(e)), []);
const CODE_ID = 'ninefold-tt-abcde';
// everyone still playing is on one host, which is `nh`
function allOn(w, nh, players) {
  assert.deepEqual(hosts(w).map((d) => d.name), [nh.name], 'one host');
  for (const g of players) if (g !== nh) {
    assert.equal(role(g), 'guest', `${g.name} is a player`);
    const to = g.x('DUO.conn&&DUO.conn.open&&DUO.conn.peer');
    assert.ok(to === nh.x('DUO.pid') || to === CODE_ID && w.ids.get(CODE_ID)?.dev === nh, `${g.name} is on ${nh.name} (${to})`);
    assert.equal(g.x('DUO.hostAway'), false, `${g.name} isn't waiting for a host`);
  }
}
// play on until the match is over for everyone in `players`
async function finish(w, play, players) {
  await w.run(90000, play);
  for (const g of players) {
    assert.equal(g.x('DUO.snap&&DUO.snap.phase'), 'over', `${g.name} saw the end`);
    assert.equal(g.x('duoScore(DUO.snap.st,0)+duoScore(DUO.snap.st,1)'), 20, 'the scores add up');
  }
}

describe('the host leaves', () => {
  test('mid-match: the heir hosts, everyone follows, and the match plays to the end', async () => {
    const w = new World(1);
    const all = await room(w, { humans: 4 });
    const [H, B, C, D] = all;
    await start(w, all);
    const auto = new Set(all), play = autoplay(w, auto);
    await w.run(5000, play);
    assert.ok(moves(B) >= 2, `some moves made (${moves(B)})`);
    H.x('duoLeave()');
    assert.match(H.modals.at(-1).html, /Juno<\/b> becomes the host/);
    H.click('Leave');
    auto.delete(H);
    await w.run(1500, play);
    assert.equal(role(H), null);
    assert.equal(H.screen, 'menu');
    assert.equal(seatOf(C), 2);
    allOn(w, C, [B, C, D]);
    assert.equal(B.x('DUO.ep'), 2);
    assert.equal(C.x('DUO.seats[0].bot'), true, 'a CPU plays the old host\'s cards at once');
    assert.ok(B.toasts.includes('Juno is the host now'));
    await finish(w, play, [B, C, D]);
    noErrors(w);
  });

  test('the old host rejoins from the menu, gets their seat back, and plays on', async () => {
    const w = new World(2);
    const all = await room(w, { humans: 3 });
    const [H, B, C] = all;
    await start(w, all);
    const auto = new Set(all), play = autoplay(w, auto);
    await w.run(4000, play);
    H.x('duoLeave()'); H.click('Leave'); auto.delete(H);
    await w.run(2000, play);
    const [nh] = hosts(w);
    assert.ok(nh && nh !== H);
    assert.deepEqual(JSON.parse(H.x('JSON.stringify(duoResumeInfo())')), { code: 'ABCDE', host: false }, 'the menu offers Rejoin');
    H.x('duoRejoin()');
    auto.add(H);
    await w.run(3000, play);
    assert.equal(role(H), 'guest');
    assert.equal(seatOf(H), 0, 'same seat');
    assert.equal(nh.x('DUO.seats[0].bot'), false, 'no CPU playing for them any more');
    allOn(w, nh, all);
    await finish(w, play, all);
    noErrors(w);
  });

  test('before the match: the room stays open with a new host, the code moves over, invites still lead there', async () => {
    const w = new World(3);
    const [H, B, C] = await room(w, { humans: 3 });
    // seat 3 (a CPU from room()) goes back to open, with a friend invited to it
    H.x(`duoSetSeat(3,'open');INV.sent.set('zed','sent');INV.code='ABCDE';DUO.invSeat.zed=3;DUO.rules={...DUO.rules,plus:true};duoChanged()`);
    await w.run(500);
    H.x('duoLeave()'); // a room asks nothing
    await w.run(4000);
    const [nh] = hosts(w);
    assert.equal(nh, C, 'the partner seat hosts');
    assert.equal(nh.x('DUO.phase'), 'room');
    assert.equal(nh.x('DUO.rules.plus'), true, 'the rules stay');
    assert.equal(nh.x('DUO.seats[0].kind'), 'open', 'the old host\'s seat frees up');
    assert.equal(nh.x('DUO.invSeat.zed'), 3, 'the invited friend\'s seat is kept');
    assert.equal(nh.x(`INV.sent.get('zed')`), 'sent', 'the new host\'s room shows the invite');
    assert.equal(H.cancelled, 0, 'the old host didn\'t take the invite down');
    assert.equal(w.ids.get(CODE_ID)?.dev, nh, 'the new host has the room\'s code');
    assert.equal(H.x('duoResumeInfo()'), null, 'leaving a room keeps no Rejoin');
    // the invited friend joins with the code: the new host, in the seat kept for them
    const Z = w.device('Zed', { user: 'zed' });
    Z.x(`duoJoin('ABCDE')`);
    await w.run(1500);
    assert.equal(role(Z), 'guest');
    assert.equal(seatOf(Z), 3);
    allOn(w, nh, [B, C, Z]);
    noErrors(w);
  });

  test('two hand-offs in a row: the host leaves, then the new host leaves, and the match goes on', async () => {
    const w = new World(4);
    const all = await room(w, { humans: 4 });
    const [H, B, C, D] = all;
    await start(w, all);
    const auto = new Set(all), play = autoplay(w, auto);
    await w.run(3000, play);
    H.x('duoLeave()'); H.click('Leave'); auto.delete(H);
    await w.run(2000, play);
    assert.equal(hosts(w)[0], C);
    C.x('duoLeave()'); C.click('Leave'); auto.delete(C);
    await w.run(2000, play);
    const [nh] = hosts(w);
    assert.ok(nh === B || nh === D, 'one of the two left hosts');
    assert.equal(nh.x('DUO.ep'), 3);
    allOn(w, nh, [B, D]);
    await finish(w, play, [B, D]);
    noErrors(w);
  });

  test('while the cards are being chosen: the new host starts the match once everyone has chosen', async () => {
    const w = new World(5);
    const all = await room(w, { humans: 3 });
    const [H, B, C] = all;
    B.x('openDeck=function(o){__dev.pick=o}'); // B takes its time choosing
    H.x('duoStart()');
    await w.run(1000);
    assert.equal(H.x('DUO.phase'), 'decks');
    H.x('duoLeave()'); H.click('Leave');
    await w.run(2000);
    const [nh] = hosts(w);
    assert.equal(nh.x('DUO.phase'), 'decks');
    B.x(`__dev.pick.onDone(aiDeck('normal'))`);
    await w.run(2000);
    assert.equal(nh.x('DUO.phase'), 'play');
    assert.equal(nh.x('DUO.decks.every(Boolean)'), true);
    const play = autoplay(w, new Set([B, C]));
    await finish(w, play, [B, C]);
    noErrors(w);
  });

  test('between Sudden death rounds: the new host starts the next round', async () => {
    const w = new World(6);
    const all = await room(w, { humans: 3, rules: { suddenDeath: true } });
    const [H, B, C] = all;
    H.x('duoDraw=()=>true'); // the first round is a draw on the old host
    await start(w, all);
    const auto = new Set(all), play = autoplay(w, auto);
    for (let k = 0; k < 120 && H.x('DUO.phase') !== 'sd'; k++) await w.run(500, play);
    assert.equal(H.x('DUO.phase'), 'sd');
    H.x('duoLeave()'); // (the result is showing: Leave asks nothing)
    if (H.modals.at(-1)?.btns.some((b) => b.label === 'Leave')) H.click('Leave');
    auto.delete(H);
    await w.run(5000, play);
    const [nh] = hosts(w);
    assert.ok(nh);
    assert.equal(nh.x('DUO.phase'), 'play');
    assert.equal(nh.x('DUO.st.sd'), 1, 'round 2');
    noErrors(w);
  });
});

describe('the host drops out without a word', () => {
  test('the game closes: the heir takes over in about a second and the match goes on', async () => {
    const w = new World(7);
    const all = await room(w, { humans: 4 });
    const [H, B, C, D] = all;
    await start(w, all);
    const auto = new Set(all), play = autoplay(w, auto);
    await w.run(5000, play);
    const n = moves(B);
    w.kill(H); auto.delete(H);
    const t0 = w.now;
    let at = 0;
    for (let k = 0; k < 40 && !at; k++) { await w.run(100, play); if (hosts(w).length === 1 && hosts(w)[0] !== H) at = w.now; }
    assert.ok(at && at - t0 < 1500, `taken over in ${at - t0} ms`);
    await w.run(1000, play);
    allOn(w, C, [B, C, D]);
    assert.ok(moves(B) >= n, 'no move lost');
    assert.ok(B.toasts.includes('Juno is the host now'));
    assert.ok(C.toasts.some((t) => /host dropped out/.test(t)));
    await finish(w, play, [B, C, D]);
    noErrors(w);
  });

  test('the connection drops: taken over within seconds; back online, the old host joins as a player', async () => {
    const w = new World(8);
    const all = await room(w, { humans: 4 });
    const [H, B, C, D] = all;
    await start(w, all);
    const auto = new Set(all), play = autoplay(w, auto);
    await w.run(5000, play);
    w.cut(H);
    const t0 = w.now;
    let at = 0;
    for (let k = 0; k < 60 && !at; k++) { await w.run(250, play); if (role(C) === 'host') at = w.now; }
    assert.ok(at, 'the heir took over');
    assert.ok(at - t0 <= 12000, `in ${at - t0} ms`);
    await w.run(3000, play);
    for (const g of [B, D]) assert.equal(g.x('DUO.conn.peer'), C.x('DUO.pid'), `${g.name} on the heir`);
    // the old host's game still thinks it hosts until it hears otherwise
    w.uncut(H);
    await w.run(15000, play);
    allOn(w, C, all);
    assert.equal(seatOf(H), 0);
    assert.ok(H.toasts.some((t) => /took over hosting/.test(t)));
    await w.run(5000, play);
    assert.equal(w.ids.get(CODE_ID)?.dev, C, 'the room\'s code moved to the new host');
    await finish(w, play, all);
    noErrors(w);
  });

  test('just two players and CPUs: the other player takes over (they hold the key themselves)', async () => {
    const w = new World(9);
    const all = await room(w, { humans: 2 });
    const [H, B] = all;
    await start(w, all);
    const auto = new Set(all), play = autoplay(w, auto);
    await w.run(4000, play);
    assert.equal(B.x('DUO.keep&&DUO.keep.self'), true);
    w.kill(H); auto.delete(H);
    await w.run(2000, play);
    assert.equal(role(B), 'host');
    await finish(w, play, [B]);
    noErrors(w);
  });

  test('the old host reloads: the match moves on, and Rejoin puts them back in their seat before a CPU takes it', async () => {
    const w = new World(10);
    const all = await room(w, { humans: 3 });
    const [H, B, C] = all;
    await start(w, all);
    const auto = new Set(all), play = autoplay(w, auto);
    await w.run(4000, play);
    H.on.pagehide();
    w.kill(H); auto.delete(H);
    await w.run(1500, play);
    const [nh] = hosts(w);
    assert.ok(nh);
    assert.equal(nh.x('DUO.seats[0].away'), true);
    assert.equal(nh.x('DUO.seats[0].bot'), false, 'a reload gets the minute like anyone who drops');
    const H2 = w.device('Hana', { ls: H.ls, ss: H.ss }); // the same tab, reloaded
    assert.ok(H2.x('duoResumeInfo()'), 'the menu offers Rejoin');
    H2.x('duoRejoin()'); auto.add(H2);
    await w.run(8000, play);
    assert.equal(seatOf(H2), 0);
    assert.equal(nh.x('DUO.seats[0].away'), false);
    allOn(w, nh, [H2, B, C]);
    await finish(w, play, [H2, B, C]);
    noErrors(w);
  });

  test('the hand-off message is lost: the heir still takes over from its locked copy', async () => {
    const w = new World(11);
    const all = await room(w, { humans: 3 });
    const [H, B, C] = all;
    await start(w, all);
    const auto = new Set(all), play = autoplay(w, auto);
    await w.run(4000, play);
    w.drop = (from, to, m) => from === H && m.t === 'host';
    H.x('duoLeave()'); H.click('Leave'); auto.delete(H);
    await w.run(3000, play);
    const [nh] = hosts(w);
    assert.ok(nh && nh !== H, 'taken over anyway');
    allOn(w, nh, [B, C]);
    await finish(w, play, [B, C]);
    noErrors(w);
  });

  test('the host and the heir drop at the same moment: no one can take over, and the match ends for the rest', async () => {
    const w = new World(12);
    const all = await room(w, { humans: 4 });
    const [H, B, C, D] = all;
    await start(w, all);
    const auto = new Set(all), play = autoplay(w, auto);
    await w.run(4000, play);
    w.kill(H); w.kill(C);
    await w.run(30000, play);
    assert.deepEqual(hosts(w), [], 'nobody hosts');
    assert.equal(role(B), 'guest');
    await w.run(35000, play);
    for (const g of [B, D]) {
      assert.equal(role(g), null);
      assert.match(g.modals.at(-1).html, /The host left, so the match is over/);
    }
    noErrors(w);
  });
});

describe('fair play', () => {
  test('no player gets a hidden hand: not in a snapshot, not in the heir\'s copy, and keepers never get the copy', async () => {
    const w = new World(13);
    const all = await room(w, { humans: 4 });
    const [H, B, C, D] = all;
    const from = w.log.length;
    await start(w, all);
    const auto = new Set(all), play = autoplay(w, auto);
    await w.run(8000, play);
    const hands = H.x('JSON.stringify(DUO.st.h)'), seat = new Map(all.map((d) => [d.name, seatOf(d)]));
    const hidden = (to) => JSON.parse(hands).flatMap((h, q) => (q % 2 === seat.get(to) % 2 ? [] : h));
    for (const { to, m } of w.log.slice(from)) {
      if (m.t === 'snap' && m.st) m.st.h.forEach((h, q) => {
        if (q % 2 !== seat.get(to) % 2) assert.ok(h.every((id) => id === -1), `${to} sees seat ${q}'s hand`);
      });
      // the heir's copy is locked: no hidden card shows in it as text
      if (m.t === 'vault' && m.kid) {
        assert.equal(to, C.name, 'only the heir gets the copy');
        assert.equal(Buffer.from(m.d, 'base64').toString('latin1').includes('"h":['), false, 'the copy is locked');
      }
      assert.notEqual(m.t, 'host', 'nobody gets the open match while the host plays');
    }
    assert.ok(hidden(C.name).length > 0);
    // nobody holds a copy and its key at once; the heir holds no key; the keepers' key opens the copy (and only that key)
    for (const g of all) assert.equal(g.x('!!(DUO.vault&&DUO.keep)'), false, `${g.name} can't open a copy`);
    assert.equal(C.x('DUO.keep'), null);
    assert.equal(C.x('duoUnseal(DUO.vault,duoNewKey())'), null);
    const key = B.x('DUO.keep.key');
    assert.equal(key, D.x('DUO.keep.key'));
    assert.deepEqual(C.x(`JSON.stringify(duoUnseal(DUO.vault,${JSON.stringify(key)}).st.h)`), hands);
    for (const g of [H, B, D]) assert.equal(g.x('DUO.vault'), null);
    noErrors(w);
  });

  test('a keeper won\'t hand over the key while it can still hear the host', async () => {
    const w = new World(14);
    const all = await room(w, { humans: 3 });
    const [H, B, C] = all;
    await start(w, all);
    await w.run(3000);
    // the heir (C, the partner seat) pretends it lost the host and asks the keeper (B)
    const heir = all.find((d) => d.x('DUO.vault'));
    heir.x('DUO.hostAway=true;duoAskKey()');
    await w.run(500);
    const ans = w.log.filter((l) => l.to === heir.name && (l.m.t === 'key' || l.m.t === 'nokey')).map((l) => l.m.t);
    assert.deepEqual(ans, ['nokey']);
    assert.equal(heir.x('DUO.vkey'), '');
    assert.equal(role(heir), 'guest');
    noErrors(w);
  });

  test('the heir and a keeper lose the host while another player still has it: no second host', async () => {
    const w = new World(15);
    const all = await room(w, { humans: 4 });
    const [H, B, C, D] = all;
    await start(w, all);
    const auto = new Set(all), play = autoplay(w, auto);
    await w.run(4000, play);
    assert.equal(H.x('DUO.vk.heir'), 2);
    w.split(H, C); w.split(H, B); // C (heir) and B (keeper) can't reach the host; D still can
    for (let k = 0; k < 80; k++) { await w.run(250, play); assert.deepEqual(hosts(w), [H], 'only the host hosts'); }
    assert.equal(C.x('DUO.hostAway'), true, 'the heir did lose the host');
    w.join(H, C); w.join(H, B);
    await w.run(20000, play);
    allOn(w, H, all);
    await finish(w, play, all);
    noErrors(w);
  });
});

describe('the clock and the moves', () => {
  test('the turn timer keeps its time through a takeover (the gap doesn\'t count)', async () => {
    const w = new World(16);
    const all = await room(w, { humans: 4, rules: { timer: 30 } });
    const [H, B, C, D] = all;
    await start(w, all);
    const auto = new Set([H, C, D]), play = autoplay(w, auto);
    // play until it's B's turn, then B thinks
    for (let k = 0; k < 300 && !(B.x('duoMyTurn()') && B.x('DUO.snap.timeLeft') > 0); k++) await w.run(100, play);
    assert.ok(B.x('duoMyTurn()'), "B's turn");
    await w.run(12000, play);
    w.kill(H); auto.delete(H);
    await w.run(6000, play);
    assert.equal(role(C), 'host');
    const left = B.x('DUO.snap.timeLeft');
    assert.ok(left > 13000 && left < 22000, `B has ${left} ms left of 30 s`);
    noErrors(w);
  });

  test('a player\'s move the new host\'s copy missed is played again, so nobody sees it vanish', async () => {
    const w = new World(17);
    const all = await room(w, { humans: 3 });
    const [H, B, C] = all;
    await start(w, all);
    const auto = new Set(all), play = autoplay(w, auto);
    for (let k = 0; k < 200 && !B.x('duoMyTurn()'); k++) await w.run(100, play);
    auto.clear();
    const n = moves(B);
    // B moves; the host takes it, but the heir's copy of that move is lost, and then the host's game closes
    w.drop = (from, to, m) => from === H && m.t === 'vault';
    B.x(`(()=>{const st=DUO.snap.st;duoMove(st.f>=0?st.f:0,st.b.findIndex(x=>x<0))})()`);
    await w.run(4 * LAT);
    assert.equal(moves(B), n + 1, 'B saw its move');
    w.kill(H); w.drop = null;
    await w.run(2000);
    assert.equal(role(C), 'host');
    assert.equal(C.x('DUO.st.n'), n + 1, 'the new host has the move');
    assert.equal(moves(B), n + 1);
    noErrors(w);
  });
});

describe('everything else still works', () => {
  test('a player (not the host) drops out and comes back: nothing moves, hosting stays put', async () => {
    const w = new World(21);
    const all = await room(w, { humans: 4 });
    const [H, B, C, D] = all;
    await start(w, all);
    const auto = new Set(all), play = autoplay(w, auto);
    await w.run(4000, play);
    const kid = B.x('DUO.keep.kid');
    w.cut(C); // the heir, even
    await w.run(20000, play);
    assert.deepEqual(hosts(w).filter((d) => !d.cut), [H]);
    assert.equal(H.x('DUO.seats[2].away'), true);
    assert.notEqual(H.x('DUO.vk.heir'), 2, 'someone else is the heir meanwhile');
    assert.notEqual(B.x('DUO.keep&&DUO.keep.kid'), kid, 'with a new key');
    w.uncut(C);
    await w.run(15000, play);
    allOn(w, H, all);
    assert.equal(H.x('DUO.seats[2].away'), false, 'back in their seat');
    await finish(w, play, all);
    noErrors(w);
  });

  test('the host\'s game closes while everyone is still in the room: the room carries on', async () => {
    const w = new World(22);
    const [H, B, C] = await room(w, { humans: 3 });
    w.kill(H);
    await w.run(3000);
    const [nh] = hosts(w);
    assert.ok(nh);
    assert.equal(nh.x('DUO.phase'), 'room');
    assert.equal(nh.x('DUO.seats[0].kind'), 'open');
    allOn(w, nh, [B, C]);
    nh.x(`duoSetSeat(0,'normal')`);
    for (const g of [B, C]) if (g !== nh) g.x(`duoSend({t:'ready',on:true})`);
    await w.run(500);
    nh.x('duoStart()');
    await w.run(1500);
    assert.equal(nh.x('DUO.phase'), 'play');
    noErrors(w);
  });

  test('a player the host removed can\'t get back in through the new host', async () => {
    const w = new World(23);
    const all = await room(w, { humans: 4 });
    const [H, B, C, D] = all;
    H.x('duoKick(3)');
    await w.run(500);
    assert.match(D.modals.at(-1).html, /Removed/);
    H.x('duoLeave()');
    await w.run(3000);
    D.x(`duoJoin('ABCDE','${D.ss.get('duo-tok:ABCDE')}')`);
    await w.run(2000);
    assert.equal(role(D), null, 'turned away');
    noErrors(w);
  });

  test('after a takeover: Back to room works, the Review has every move, and the old host\'s seat opens', async () => {
    const w = new World(24);
    const all = await room(w, { humans: 3 });
    const [H, B, C] = all;
    await start(w, all);
    const auto = new Set(all), play = autoplay(w, auto);
    await w.run(4000, play);
    w.kill(H); auto.delete(H);
    await finish(w, play, [B, C]);
    const [nh] = hosts(w);
    for (const g of [B, C]) assert.equal(g.x('DUO.snap.rev.length'), 16, `${g.name} can review all 16 moves`);
    const other = nh === B ? C : B;
    other.x(`duoSend({t:'back'})`);
    await w.run(1000);
    for (const g of [B, C]) assert.equal(g.x('DUO.snap.phase'), 'room');
    assert.equal(nh.x('DUO.seats[0].kind'), 'open');
    noErrors(w);
  });

  test('cards a player chose that never reached the old host are sent again to the new one', async () => {
    const w = new World(25);
    const all = await room(w, { humans: 3 });
    const [H, B, C] = all;
    B.x('openDeck=function(o){__dev.pick=o}');
    H.x('duoStart()');
    await w.run(1000);
    w.drop = (from, to, m) => from === B && m.t === 'deck';
    B.x(`__dev.pick.onDone(aiDeck('normal'))`);
    await w.run(500);
    w.drop = null;
    assert.equal(H.x('!!DUO.decks[1]'), false, 'the old host never got them');
    w.kill(H);
    await w.run(3000);
    const [nh] = hosts(w);
    assert.equal(nh.x('DUO.phase'), 'play', 'the match started');
    assert.equal(nh.x('!!DUO.decks[1]'), true);
    noErrors(w);
  });

  test('the host and the heir press Leave at the same moment: hosting passes on twice and the match goes on', async () => {
    const w = new World(26);
    const all = await room(w, { humans: 4 });
    const [H, B, C, D] = all;
    await start(w, all);
    const auto = new Set(all), play = autoplay(w, auto);
    await w.run(4000, play);
    H.x('duoLeave()'); C.x('duoLeave()');
    H.click('Leave'); C.click('Leave');
    auto.delete(H); auto.delete(C);
    await w.run(4000, play);
    const [nh] = hosts(w);
    assert.ok(nh === B || nh === D, `${nh && nh.name} hosts`);
    allOn(w, nh, [B, D]);
    await finish(w, play, [B, D]);
    noErrors(w);
  });
});

describe('who takes over', () => {
  test('an older game in the room (it can\'t host) is never the heir or a keeper', async () => {
    const w = new World(18);
    const all = [w.device('Hana'), w.device('Ivo'), w.device('Juno'), w.device('Kit')];
    // Juno (seat 2, the host's partner) runs a game from before the hand-off
    all[2].x('const __h=duoHello;duoHello=function(x){const o=__h(x);delete o.hv;return o}');
    all[0].x('duoHost()'); await w.run(400);
    for (const d of all.slice(1)) { d.x(`duoJoin('ABCDE')`); await w.run(400); }
    await w.run(500);
    const vk = all[0].x('JSON.stringify(DUO.vk)');
    assert.equal(JSON.parse(vk).heir, 1, 'the next seat round the table');
    assert.deepEqual(JSON.parse(vk).keepers, [3]);
    noErrors(w);
  });

  test('a player on a computer is picked before players on phones', async () => {
    const w = new World(19);
    const all = await room(w, { humans: 4, pcs: [3] });
    assert.equal(all[0].x('DUO.vk.heir'), 3);
    noErrors(w);
  });

  test('when the host ends a room no one can take over, the invites go down with it', async () => {
    const w = new World(20);
    const [H] = await room(w, { humans: 1 });
    H.x(`INV.sent.set('zed','sent');INV.code='ABCDE'`);
    H.x('duoLeave()');
    if (H.modals.at(-1)?.btns.some((b) => /Close|End/.test(b.label))) H.click(H.modals.at(-1).btns[0].label);
    await w.run(1000);
    assert.equal(role(H), null);
    assert.equal(H.cancelled, 1);
    noErrors(w);
  });
});
