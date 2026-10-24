// The music player (client/js/music.js) against a pretend Web Audio that is as strict as the strictest browser:
// a curve may not touch any other change on the same volume, a volume that is changing can't be read back, and the
// clock only moves when the test moves it. After every move, exactly one song may be heard.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { describe, test } from 'node:test';

class Param {
  constructor(v) { this.base = v; this.ev = []; }
  get value() { return this.base; } // like a browser that reports only what was set directly
  set value(v) { this.base = v; }
  at(t) { // the volume at time t: steps and straight lines between the planned points
    let v = this.base, pt = 0;
    for (const e of this.ev) {
      if (e.t > t) { if (e.k === 'lin') return v + (e.v - v) * (t - pt) / (e.t - pt || 1); break; }
      v = e.v; pt = e.t;
    }
    return v;
  }
  add(e) {
    if (this.ev.some((x) => x.k === 'curve' && e.t >= x.t && e.t <= x.t + x.d)) throw new Error('NotSupportedError: inside a curve');
    this.ev.push(e); this.ev.sort((a, b) => a.t - b.t);
  }
  setValueAtTime(v, t) { this.add({ k: 'set', v, t }); }
  linearRampToValueAtTime(v, t) { this.add({ k: 'lin', v, t }); }
  setValueCurveAtTime(c, t, d) {
    if (this.ev.some((x) => x.t >= t && x.t <= t + d)) throw new Error('NotSupportedError: curve overlaps');
    this.add({ k: 'curve', v: c[c.length - 1], t, d });
  }
  // like Firefox: a curve that has already begun is not cancelled, and nothing may then be set inside it
  cancelScheduledValues(t) { this.ev = this.ev.filter((x) => x.t < t); }
}

function world() {
  const sources = [];
  const AC = {
    currentTime: 0, state: 'running', destination: {},
    createGain() { const g = { gain: new Param(1), connect: (d) => d }; return g; },
    createBufferSource() {
      const s = { loop: false, started: null, stopAt: Infinity, ended: false, onended: null,
        connect(g) { s.g = g; return g; }, start(t) { s.started = t; }, stop(t) { if (s.started == null) throw new Error('InvalidStateError'); s.stopAt = t; } };
      sources.push(s); return s;
    },
    decodeAudioData(ab, ok) { const d = ab.dur; ok({ duration: d, length: Math.round(d * 100), sampleRate: 100, numberOfChannels: 1, getChannelData: () => new Float32Array(Math.round(d * 100)) }); },
  };
  const loads = []; // downloads waiting to arrive
  let screen = 'menu', jukebox = false;
  const ctx = vm.createContext({
    SAVE: { musicVol: 50, musicMute: false }, console, AC, G: null, DUO: { snap: null }, CH: {}, BH: null,
    fetch: (url) => new Promise((ok) => loads.push(() => ok({ ok: true, arrayBuffer: () => Promise.resolve({ url, slice() { return this; }, get dur() { return dur(url); } }) }))),
    addEventListener() {}, removeEventListener() {}, setTimeout, clearTimeout,
    document: { hidden: false, addEventListener() {}, getElementById: (id) => id === 'jbBox' ? (jukebox ? {} : null) : id === 'scr-' + screen ? { classList: { contains: () => true } } : null },
  });
  ctx.BH = ctx.CH;
  vm.runInContext(fs.readFileSync(new URL('../client/js/music.js', import.meta.url), 'utf8'), ctx, { filename: 'music.js' });
  const g = vm.runInContext('({TRACKS,MUS,musicPlay,musicUpdate,musicListen,musicListenEnd,musicPause,musicSeek,musicSync,musicNow})', ctx);
  function dur(url) { const t = Object.values(g.TRACKS).find((x) => x.src === url); return t.len ? t.len + 2 : t.loopAt + 1.5; }
  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  return {
    g, ctx, sources,
    async arrive() { while (loads.length) loads.shift()(); await flush(); },
    async go(s) { screen = s; g.musicUpdate(); await flush(); },
    jukebox(on) { jukebox = on; },
    async tick(sec) { // move the clock in small steps, ending what was stopped
      for (let t = 0; t < sec; t += 0.05) {
        AC.currentTime = +(AC.currentTime + 0.05).toFixed(4);
        for (const s of sources) if (!s.ended && s.stopAt <= AC.currentTime) { s.ended = true; s.onended && s.onended(); }
        await flush();
      }
    },
    heard() { // songs that can be heard now, by length, with their volume
      return sources.filter((s) => s.loop && s.started != null && s.started <= AC.currentTime && !s.ended && s.g.gain.at(AC.currentTime) > 0.005)
        .map((s) => +s.buffer.duration.toFixed(0));
    },
    playing() { return g.MUS.cur && g.MUS.cur.id; },
  };
}
const LEN = { discovery: 169, 'ley-lines': 89, crossroads: 82, 'sudden-death': 63, market: 76, 'open-sky': 79, afterglow: 85 };

async function started() {
  const w = world();
  w.g.musicPlay(); await w.arrive(); await w.tick(1);
  return w;
}

describe('one song at a time', () => {
  test('the first song starts', async () => {
    const w = await started();
    assert.equal(w.playing(), 'discovery');
    assert.deepEqual(w.heard(), [LEN.discovery]);
  });
  test('going round the places: each change leaves just the new song', async () => {
    const w = await started();
    for (const [s, id] of [['leaders', 'afterglow'], ['menu', 'discovery'], ['coll', 'open-sky'], ['store', 'market'], ['duoroom', 'crossroads'], ['menu', 'discovery']]) {
      await w.go(s); await w.arrive(); await w.tick(1.5);
      assert.equal(w.playing(), id, s);
      assert.deepEqual(w.heard(), [LEN[id]], `${s}: ${w.heard()}`);
    }
  });
  test('the jukebox: tapping songs one after another', async () => {
    const w = await started();
    w.jukebox(true);
    for (const id of ['ley-lines', 'afterglow', 'crossroads', 'discovery', 'market']) {
      w.g.musicListen(id); await w.arrive(); await w.tick(1.5);
      assert.deepEqual(w.heard(), [LEN[id]], `${id}: ${w.heard()}`);
    }
  });
  test('tapping songs faster than they load, and in the middle of every fade', async () => {
    const w = await started();
    w.jukebox(true);
    const ids = ['ley-lines', 'afterglow', 'crossroads', 'sudden-death', 'open-sky', 'market', 'discovery'];
    for (let r = 0; r < 3; r++) {
      for (const [i, id] of ids.entries()) {
        w.g.musicListen(id);
        if (i % 2) await w.arrive(); // some arrive at once, some are still loading when the next tap comes
        await w.tick([0.05, 0.2, 0.35, 0.5, 0.8][(i + r) % 5]);
        assert.ok(w.heard().length <= 2, `${id}: ${w.heard()}`); // mid-change, at most the old fading and the new coming in
      }
      await w.arrive(); await w.tick(1.5);
      assert.deepEqual(w.heard(), [LEN.discovery], `round ${r}: ${w.heard()}`);
    }
  });
  test('closing the jukebox brings the place\'s song back, alone', async () => {
    const w = await started();
    w.jukebox(true);
    w.g.musicListen('ley-lines'); await w.arrive(); await w.tick(0.3);
    w.jukebox(false); w.g.musicListenEnd(); await w.arrive(); await w.tick(1.5);
    assert.deepEqual(w.heard(), [LEN.discovery]);
  });
  test('pause, play, seek and mute in the middle of changes', async () => {
    const w = await started();
    w.jukebox(true);
    w.g.musicListen('afterglow'); await w.arrive(); await w.tick(0.2);
    w.g.musicPause(true); await w.tick(1.2);
    assert.deepEqual(w.heard(), []);
    w.g.musicPause(false); await w.arrive(); await w.tick(0.1);
    w.g.musicSeek(30); await w.arrive(); await w.tick(0.1);
    w.g.musicListen('crossroads'); await w.tick(0.1);
    w.ctx.SAVE.musicMute = true; w.g.musicSync(); await w.tick(1.2);
    assert.deepEqual(w.heard(), []);
    w.ctx.SAVE.musicMute = false; w.g.musicSync(); await w.arrive(); await w.tick(1.5);
    assert.deepEqual(w.heard(), [LEN.crossroads]);
  });
  test('a change of mind: the song playing comes back up, alone', async () => {
    const w = await started();
    await w.go('coll'); await w.tick(0.1); await w.go('menu'); await w.arrive(); await w.tick(1.5);
    assert.deepEqual(w.heard(), [LEN.discovery]);
    assert.ok(w.sources.filter((s) => s.loop && !s.ended).length === 1);
  });
  test('the volume settles where the slider is', async () => {
    const w = await started();
    await w.go('leaders'); await w.arrive(); await w.tick(1.5);
    const s = w.sources.find((x) => x.loop && !x.ended);
    assert.ok(Math.abs(s.g.gain.at(w.ctx.AC.currentTime) - 0.25) < 0.001); // 50% of the music's top level (0.5)
  });
});
