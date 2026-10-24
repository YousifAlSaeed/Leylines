// Build the Leylines sound effects that come from real recordings (the rest are made by generate-sfx.py).
//
//   node tools/sfx-recordings.mjs <srcDir> <oldDir> <outDir> [name ...]
//
// <srcDir> holds the source recordings (Kenney casino, rpg and impact packs, plus the Freesound files named
// fs-<id>.mp3); `kit:` sources come from the opus-sound-layer library (github.com/Bodila51/opus-sound-layer,
// `sfx.py kit`) in <srcDir>/../../audio/kit. Every source is CC0 or CC BY: see client/audio/sfx/CREDITS.md.
// <oldDir> is the current client/audio/sfx: each new sound is matched to the old one's loudness.
// Each sound = layers of recordings, cut, filtered, placed, then written as stereo MP3 through a peak limiter.
// Prints a check line per sound (loudness, peak, start delay, clean ending).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [SRC, OLD, OUT, ...ONLY] = process.argv.slice(2);
const SR = 44100;

// layer: {f: file, from, to (s, cut of the source), at (s, place), db, hp, lp, pan (-1..1), rate (pitch), peakAt (align source peak to `at`)}
// pick: 'clicks:i' cuts the i-th strongest click of the file (for pack ticks)
const L = (f, o = {}) => ({ f, ...o });
const TARGET = { badge_claim: -12.7, buy: -12.7, same_plus: 'banner', combo: 'banner', combo2: 'banner' }; // a number (dBFS) or an old sound to match
// instruments and layers shared by the recipes below
const st = (n, c = 0) => +Math.pow(2, (n - c) / 12).toFixed(4);
const G = (at, n, o = {}) => L('fs-373364.mp3', { at, rate: st(n, .1), to: .5, fout: .3, ...o });   // glockenspiel, n semitones from C6
const K = (at, n, o = {}) => L('fs-441137.mp3', { at, rate: st(n, .15), to: 1.2, fout: .6, ...o }); // kalimba, n from E5
const X = (at, n, o = {}) => L('fs-204647.mp3', { at, rate: st(n, .06), ...o });                    // xylophone, n from A6
const CR = (at, n, o = {}) => L('fs-614832.mp3', { at, rate: st(n, -.15), db: -12, ...o });          // crystal bell, n from D#7
const HARP = (o = {}) => L('fs-486952.mp3', { rate: st(7, -.02), to: 1.6, fout: .7, ...o });         // harp flourish, D4 -> A4
const TB = (o = {}) => L('fs-374272.mp3', { rate: .9439, to: 2.5, fout: 1.2, ...o });                // tubular bell -> E
const THUD = (o = {}) => L('bookPlace1.ogg', { db: -6, lp: 1800, ...o });
const SWEEP = (o = {}) => L('fs-693698.mp3', { from: .45, to: 2.4, fout: 1.0, th: .01, db: -6, pan: [-.5, .5], ...o });
const runOf = (f, t0, step, ns, o = {}) => ns.map((n, i) => f(+(t0 + i * step).toFixed(3), n, { pan: +(-.4 + .8 * i / Math.max(1, ns.length - 1)).toFixed(2), ...o }));
const P = (at, n, o = {}) => L('fs-521332.mp3', { at, rate: st(n), to: .7, fout: .4, ...o });         // bottle pling, n from A6
const CHOIR = (o = {}) => L('fs-211494.mp3', { ...o, to: 1.05, fout: .45 });  // first phrase only: a second one follows a pause                             // choir "aah" on A
const SNAP = (o = {}) => L('card-slide-6.ogg', { db: -4, ...o });
export const RECIPES = {
  click:            [L('kit:click/kenney-ui-audio-click2.wav')],
  tick:             [X(0, 0)],
  place:            [L('fs-571576.mp3')],
  flip:             [L('fs-554208.mp3')],
  hand_pick:        [L('card-slide-1.ogg')],
  pack_whoosh:      [L('fs-446010.mp3')],
  pack_tick_01:     [L('card-fan-2.ogg', { pick: 0 })],
  pack_tick_02:     [L('card-fan-2.ogg', { pick: 1 })],
  pack_tick_03:     [L('card-fan-2.ogg', { pick: 2 })],
  pack_tick_04:     [L('card-fan-2.ogg', { pick: 3 })],
  pack_tick_05:     [L('card-fan-2.ogg', { pick: 4 })],
  pack_snapback:    [L('card-shove-3.ogg', { to: .4 }), L('bookPlace2.ogg', { db: -6, lp: 2500 })],
  pack_rip:         [L('fs-590329.mp3')],
  pack_fling:       [L('fs-74691.mp3')],
  coll_card_out:    [L('fs-571574.mp3')],
  coll_card_in:     [L('fs-444431.mp3')],
  coll_hand_add:    [L('card-place-4.ogg'), L('bookPlace1.ogg', { db: -6, lp: 2500 })],
  coll_hand_remove: [L('cards-pack-take-out-1.ogg', { to: .5 })],
  coll_deny:        [L('fs-369710.mp3', { to: .12 }), L('fs-369710.mp3', { to: .12, at: .11, rate: .85, db: -2 })],
  coll_riffle:      [L('card-fan-1.ogg', { pan: [.35, -.35] })],
  coll_bump:        [L('kit:tap/kenney-impact-impact-wood-light-000.wav')],
  coll_tab:         [L('fs-218115.mp3')],
  coll_close:       [L('fs-617410.mp3')],
  // the close recording played the other way round in spirit: its rustle as the cover lifts, then its thud, deeper and
  // softer, as the cover lands open on the table (about .8 s in, with the swing in collection.js)
  coll_open:        [L('fs-617410.mp3', { to: .15, db: -3, fout: .06 }), L('fs-617410.mp3', { from: .17, at: .74, rate: .92, lp: 2600, db: -3 })],
  coll_locked:      [L('impactWood_medium_000.ogg')],
  // new sound, no old one to match: TARGET sets its loudness (loudest 50 ms RMS, dBFS)
  badge_claim:      [L('fs-169146.mp3', { to: .7, fout: .3 }), P(.08, 0, { db: -4 })],
  // buying a card from the Merchant: a coin clink, then two glockenspiel notes up (E, A)
  buy:              [L('fs-512216.mp3'), G(.06, 4, { db: -5, pan: -.2 }), G(.12, 9, { db: -4, pan: .2 })],
  // Same / Plus, Combo, second Combo: a real bubble pop and rising glockenspiel notes (A major), crystal sparkle, bell tree
  same_plus:        [L('kit:pop/fs-97978-pop-aif-1.wav', { db: -2 }), L('fs-373364.mp3', { at: .03, rate: 0.8361, to: .45, fout: .25, pan: -.2 }),
                     L('fs-373364.mp3', { at: .09, rate: 1.0534, to: .45, fout: .25, pan: .2 }), L('fs-614832.mp3', { at: .09, rate: 1.0687, db: -12, pan: .3 })],
  combo:            [L('kit:pop/fs-796298-bubble-pop-1.wav', { db: -2 }), L('fs-373364.mp3', { at: .03, rate: 1.0534, to: .45, fout: .25, pan: -.25 }),
                     L('fs-373364.mp3', { at: .08, rate: 1.2527, to: .45, fout: .25 }), L('fs-373364.mp3', { at: .13, rate: 1.6721, to: .45, fout: .25, pan: .25 }),
                     L('fs-614832.mp3', { at: .13, rate: 1.4265, db: -11, pan: .35 })],
  combo2:           [L('kit:pop/fs-669918-the-best-bubble-pop-sound-fo-1.wav', { db: -1 }), L('fs-373364.mp3', { at: .03, rate: 1.2527, to: .45, fout: .25, pan: -.3 }),
                     L('fs-373364.mp3', { at: .075, rate: 1.6721, to: .45, fout: .25, pan: -.1 }), L('fs-373364.mp3', { at: .12, rate: 2.1067, to: .45, fout: .25, pan: .1 }),
                     L('fs-373364.mp3', { at: .165, rate: 2.5053, to: .45, fout: .25, pan: .3 }), L('fs-614832.mp3', { at: .165, rate: 2.1374, db: -10, pan: .4 }),
                     L('fs-375596.mp3', { at: .1, to: .45, fout: .25, db: -9, pan: [-.4, .4] })],
  win:              [L('fs-626259.mp3')],
  // page turns: four real recordings, picked at random
  coll_page_01:     [L('fs-179007.mp3')],
  coll_page_02:     [L('fs-241322.mp3')],
  coll_page_03:     [L('fs-167047.mp3')],
  coll_page_04:     [L('fs-20241.mp3')],
  coll_lift:        [L('card-slide-8.ogg', { th: .3, to: .3 })],
  coll_set_done:    [L('fs-636656.mp3')],
  banner:           [L('fs-715784.mp3')],
  coll_hand_full:   [L('fs-403012.mp3')],
  pack_reveal_1:    [SNAP(), P(.02, 0)],
  pack_reveal_2:    [SNAP(), ...runOf(P, .02, .07, [0, 4])],
  pack_reveal_3:    [SNAP(), ...runOf(P, .02, .06, [0, 4, 7]), CR(.14, 6)],
  pack_reveal_4:    [THUD(), ...runOf(P, .02, .05, [0, 4, 7, 12]), CR(.17, 6, { db: -10 }), SWEEP({ db: -8 })],
  pack_reveal_5:    [THUD({ db: -2 }), ...runOf(P, .02, .045, [-5, 0, 4, 7, 12], { to: 1.4, fout: .8 }), CR(.2, 13, { db: -8 }), SWEEP({ to: 3.0, fout: 1.2, db: -5 }), L('kit:shimmer/fs-462095-sparkling-star-01-wav-2.wav', { at: .25, db: -10 })],
  draw:             [L('fs-162473.mp3')],
  emote:            [L('fs-174695.mp3')],
  coll_lost:        [L('fs-538013.mp3')],
  coll_shimmer:     [L('fs-578803.mp3')],
  coll_return:      [L('card-shove-2.ogg', { to: .3 }), L('bookPlace3.ogg', { db: -6, lp: 2500 })],
};

function decode(file, filters = []) {
  const args = ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR)];
  if (filters.length) args.push('-af', filters.join(','));
  args.push('-f', 'f32le', '-');
  const r = spawnSync('ffmpeg', args, { maxBuffer: 1 << 28 });
  if (r.status) throw new Error(`${file}: ${r.stderr}`);
  const b = r.stdout; return new Float32Array(b.buffer, b.byteOffset, b.length / 4).slice();
}
function decodeStereo(file) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '2', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  const b = r.stdout, x = new Float32Array(b.buffer, b.byteOffset, b.length / 4);
  const Lc = new Float32Array(x.length / 2), Rc = new Float32Array(x.length / 2);
  for (let i = 0; i < Lc.length; i++) { Lc[i] = x[2 * i]; Rc[i] = x[2 * i + 1]; }
  return [Lc, Rc];
}
const db = v => 20 * Math.log10(v + 1e-12);
function env(x, win) { // RMS envelope
  const n = Math.max(1, Math.round(win * SR)), out = new Float32Array(x.length); let s = 0;
  for (let i = 0; i < x.length; i++) { s += x[i] * x[i]; if (i >= n) s -= x[i - n] * x[i - n]; out[i] = Math.sqrt(Math.max(0, s) / n); }
  return out;
}
const maxOf = a => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
function stats(chs) { // loudest 50 ms RMS, peak, onset (first sample within 20 dB of peak env), length
  const mono = chs[0].map((v, i) => chs.reduce((s, c) => s + c[i], 0) / chs.length);
  const e = env(mono, .05), f = env(mono, .002), pk = maxOf(f);
  let on = 0; while (on < f.length && f[on] < pk * .1) on++;
  const spec = centroid(mono);
  return { rms: db(maxOf(e)), peak: db(Math.max(...chs.map(maxOf))), onset: on / SR * 1000, dur: mono.length / SR, centroid: spec,
           head: db(maxOf(mono.subarray(0, 44))), tail: db(maxOf(mono.subarray(mono.length - 220))) };
}
function centroid(x) { // spectral centroid over 2048-sample frames, energy weighted
  const N = 2048; let num = 0, den = 0;
  for (let o = 0; o + N <= x.length; o += N) {
    for (let k = 1; k < N / 2; k += 4) { // coarse DFT, every 4th bin is enough for a centroid
      let re = 0, im = 0; for (let n = 0; n < N; n++) { const w = x[o + n] * (.5 - .5 * Math.cos(2 * Math.PI * n / N)); re += w * Math.cos(2 * Math.PI * k * n / N); im -= w * Math.sin(2 * Math.PI * k * n / N); }
      const p = re * re + im * im; num += p * k * SR / N; den += p;
    }
  }
  return Math.round(num / (den + 1e-20));
}

function srcPath(f) { return f.startsWith('kit:') ? path.join(SRC, '..', '..', 'audio', 'kit', f.slice(4)) : path.join(SRC, f); }

function clicks(x, k) { // the k-th strongest separate click, cut -3 ms .. +60 ms
  const f = env(x, .002), found = [];
  const used = new Uint8Array(x.length);
  for (let n = 0; n < 12; n++) {
    let best = -1; for (let i = 0; i < f.length; i++) if (!used[i] && (best < 0 || f[i] > f[best])) best = i;
    const a = Math.max(0, best - Math.round(.003 * SR)), b = Math.min(x.length, best + Math.round(.1 * SR));
    for (let i = Math.max(0, best - Math.round(.04 * SR)); i < Math.min(x.length, best + Math.round(.07 * SR)); i++) used[i] = 1;
    found.push([a, b]);
  }
  const [a, b] = found[k]; return x.slice(a, b);
}

function trim(x, th = .05) { // drop leading silence (to 3 ms before onset) and the tail below -55 dB of peak
  const f = env(x, .002), pk = maxOf(f);
  let a = 0; while (a < f.length && f[a] < pk * th) a++;
  a = Math.max(0, a - Math.round(.003 * SR));
  let b = f.length - 1; while (b > a && f[b] < pk * 10 ** (-55 / 20)) b--;
  return x.slice(a, Math.min(x.length, b + Math.round(.01 * SR)));
}
function fades(x, fin = .002, fout = .04) {
  const a = Math.min(Math.round(fin * SR), x.length >> 2), b = Math.min(Math.round(fout * SR), Math.floor(x.length / 3));
  for (let i = 0; i < a; i++) x[i] *= i / a;
  for (let i = 0; i < b; i++) x[x.length - 1 - i] *= Math.sin(Math.PI / 2 * i / b) ** 2;
  return x;
}

function build(name) {
  const layers = RECIPES[name].map(l => {
    const flt = [];
    if (l.from || l.to) flt.push(`atrim=${l.from || 0}${l.to ? ':' + l.to : ''}`);
    if (l.rate) flt.push(`asetrate=${Math.round(SR * l.rate)}`, `aresample=${SR}`);
    flt.push(`highpass=f=${l.hp || 60}`);
    if (l.lp) flt.push(`lowpass=f=${l.lp}`);
    let x = decode(srcPath(l.f), flt);
    x = l.pick != null ? clicks(x, l.pick) : trim(x, l.th);
    return { x: fades(x, .002, l.fout), at: l.at || 0, g: 10 ** ((l.db || 0) / 20), pan: l.pan ?? 0 };
  });
  const n = Math.max(...layers.map(l => Math.round(l.at * SR) + l.x.length));
  const Lc = new Float32Array(n), Rc = new Float32Array(n);
  for (const l of layers) {
    const o = Math.round(l.at * SR), top = maxOf(l.x);
    for (let i = 0; i < l.x.length; i++) {
      const p = Array.isArray(l.pan) ? l.pan[0] + (l.pan[1] - l.pan[0]) * i / l.x.length : l.pan;
      const a = (p + 1) * Math.PI / 4, v = l.x[i] / top * l.g;
      Lc[o + i] += v * Math.cos(a) * Math.SQRT2; Rc[o + i] += v * Math.sin(a) * Math.SQRT2;
    }
  }
  // match the old sound's loudness, but keep the peak at or under -1 dBFS
  const oldFile = path.join(OLD, name + '.mp3');
  const t = TARGET[name];
  const old = typeof t === 'number' ? { rms: t, onset: 0, dur: 0, centroid: 0 } : stats(decodeStereo(t ? path.join(OLD, t + '.mp3') : oldFile));
  const cur = stats([Lc, Rc]);
  // the limiter takes the sharp tops off loud transients (at most MAXLIM dB) so they can be as loud as the old sounds
  const out = path.join(OUT, name + '.mp3'), MAXLIM = 9;
  let gain = Math.min(old.rms - cur.rms, -1 - cur.peak + MAXLIM), nw;
  for (let pass = 0; pass < 3; pass++) {
    const g = 10 ** (gain / 20), pad = Math.round(.01 * SR), inter = new Float32Array(2 * (n + pad));
    for (let i = 0; i < n; i++) { inter[2 * i] = Lc[i] * g; inter[2 * i + 1] = Rc[i] * g; }
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(SR), '-ac', '2', '-i', '-',
      '-af', 'alimiter=limit=0.84:attack=1:release=30:level=disabled:asc=1', '-c:a', 'libmp3lame', '-q:a', '4', out], { input: Buffer.from(inter.buffer) });
    if (r.status) throw new Error(String(r.stderr));
    nw = stats(decodeStereo(out));
    const miss = old.rms - nw.rms; if (Math.abs(miss) < .4) break;
    gain = Math.min(gain + miss, -1 - cur.peak + MAXLIM);
  }
  return { name, old, nw, lim: gain + cur.peak + 1.5 };
}

fs.mkdirSync(OUT, { recursive: true });
const names = ONLY.length ? ONLY : Object.keys(RECIPES);
const rows = names.map(build);
const f1 = v => v.toFixed(1).padStart(6);
console.log('name'.padEnd(17), '  oldRMS  newRMS   dRMS  peak  onset(ms) old>new   len old>new   centroid old>new  head  tail  verdict');
for (const { name, old, nw, lim } of rows) {
  const why = [];
  if (Math.abs(nw.rms - old.rms) > 1.5) why.push(`loudness ${(nw.rms - old.rms).toFixed(1)} dB`);
  if (nw.peak > -0.5) why.push('peak');
  if (nw.onset > 50) why.push('slow start');
  if (nw.tail > -50) why.push('cut tail');
  console.log(name.padEnd(17), f1(old.rms), f1(nw.rms), f1(nw.rms - old.rms), f1(nw.peak), `${f1(old.onset)}>${f1(nw.onset)}`, ` ${old.dur.toFixed(2)}>${nw.dur.toFixed(2)}`,
    `   ${String(old.centroid).padStart(5)}>${String(nw.centroid).padStart(5)}`, f1(nw.head), f1(nw.tail), 'lim' + f1(Math.max(0, lim)), why.length ? 'FAIL ' + why.join(', ') : 'PASS');
}
