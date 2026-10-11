"""Generate Leylines' sound effects into client/audio/sfx/*.mp3.

No samples and no chiptune waves: every sound is built the way the real thing makes noise.
Taps and knocks ring like wood, chimes like glass, notes like a plucked harp string, paper is
shaped noise, and big moments get a soft chord. Everything is stereo with a little room echo.

    python tools/generate-sfx.py              # make every sound
    python tools/generate-sfx.py click win    # make only these

Needs FFmpeg with libmp3lame (on PATH, or set FFMPEG to the ffmpeg executable).
MP3 because every browser, iPhones included, can decode it in Web Audio.
Sounds in RECORDED are real recordings (tools/sfx-recordings.mjs) and are skipped here.
"""
import math
import os
import random
import shutil
import subprocess
import sys
import tempfile
import wave
from array import array

RATE = 44100
TAU = 2 * math.pi
OUT = os.path.join(os.path.dirname(__file__), '..', 'client', 'audio', 'sfx')
FFMPEG = os.environ.get('FFMPEG') or shutil.which('ffmpeg')
if not FFMPEG:
    raise SystemExit('Install FFmpeg or set the FFMPEG environment variable to its executable path.')
ONLY = set(sys.argv[1:])
# These are real recordings now, built by tools/sfx-recordings.mjs. Skipped unless named on the command line.
RECORDED = {'click', 'tick', 'place', 'flip', 'hand_pick', 'pack_whoosh', 'pack_snapback', 'pack_rip', 'pack_fling',
            'pack_tick_01', 'pack_tick_02', 'pack_tick_03', 'pack_tick_04', 'pack_tick_05',
            'coll_card_out', 'coll_card_in', 'coll_hand_add', 'coll_hand_remove', 'coll_deny', 'coll_riffle',
            'coll_bump', 'coll_tab', 'coll_close', 'coll_locked', 'coll_return', 'win',
            'coll_page_01', 'coll_page_02', 'coll_page_03', 'coll_page_04'}


def note(name):
    """'A4' -> 440.0, 'C#5' -> 554.37"""
    steps = {'C': -9, 'D': -7, 'E': -5, 'F': -4, 'G': -2, 'A': 0, 'B': 2}
    n = steps[name[0]] + (1 if '#' in name else 0) - (1 if 'b' in name[1:] else 0)
    return 440 * 2 ** ((n + 12 * (int(name[-1]) - 4)) / 12)


# ---------- building blocks (mono lists of floats) ----------

def n_(sec):
    return max(1, int(sec * RATE))


def noise(sec):
    return [random.uniform(-1, 1) for _ in range(n_(sec))]


def env(sig, attack=.002, decay=.1, hold=0.0):
    """Smooth attack, optional hold, then exponential decay. Short fade at the end so nothing clicks."""
    a, h, n = n_(attack), n_(hold), len(sig)
    fade = min(n, n_(.004))
    out = []
    for i, x in enumerate(sig):
        if i < a:
            g = math.sin(.5 * math.pi * i / a) ** 2
        elif i < a + h:
            g = 1.0
        else:
            g = math.exp(-(i - a - h) / (decay * RATE))
        if i > n - fade:
            g *= (n - i) / fade
        out.append(x * g)
    return out


def swell(sig, peak=.4, power=2.0):
    """Rise to a peak (fraction of the length), then fall away: the shape of a swish or whoosh."""
    n = len(sig)
    out = []
    for i, x in enumerate(sig):
        t = i / n
        g = math.sin(.5 * math.pi * t / peak) if t < peak else math.cos(.5 * math.pi * (t - peak) / (1 - peak))
        out.append(x * g ** power)
    return out


def biquad(sig, kind, freq, q=.707):
    """Low-pass, high-pass or band-pass. freq may be a function of progress 0..1, for sweeps."""
    n = len(sig)
    out = [0.0] * n
    x1 = x2 = y1 = y2 = 0.0
    b0 = b1 = b2 = a1 = a2 = 0.0
    for i in range(n):
        if i % 32 == 0:
            f = max(20, min(RATE * .45, freq(i / n) if callable(freq) else freq))
            w = TAU * f / RATE
            cs, al = math.cos(w), math.sin(w) / (2 * q)
            if kind == 'lp':
                b0, b1, b2 = (1 - cs) / 2, 1 - cs, (1 - cs) / 2
            elif kind == 'hp':
                b0, b1, b2 = (1 + cs) / 2, -(1 + cs), (1 + cs) / 2
            else:
                b0, b1, b2 = al, 0.0, -al
            a0 = 1 + al
            b0, b1, b2, a1, a2 = b0 / a0, b1 / a0, b2 / a0, -2 * cs / a0, (1 - al) / a0
        x = sig[i]
        y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2, x1, y2, y1 = x1, x, y1, y
        out[i] = y
    return out


def modes(f0, spec, sec, attack=.0008, detune=.002):
    """A struck object: decaying sine modes. spec = [(ratio, amp, decay_seconds)]."""
    n = n_(sec)
    out = [0.0] * n
    a = n_(attack)
    for ratio, amp, decay in spec:
        f = f0 * ratio * (1 + random.uniform(-detune, detune))
        if f > RATE * .45:
            continue
        w, ph = TAU * f / RATE, random.uniform(0, TAU)
        k, g = math.exp(-1 / (decay * RATE)), amp
        for i in range(n):
            out[i] += g * (1 if i >= a else i / a) * math.sin(w * i + ph)
            g *= k
            if g < 1e-5:
                break
    return out


def wood(f, sec=.25, d=.05):
    """Free wooden bar: a knock, a tap, a clock tick."""
    return modes(f, [(1, 1, d), (2.76, .45, d * .45), (5.40, .18, d * .22), (8.93, .07, d * .12)], sec)


def marimba(f, sec=.5, d=.18):
    """Tuned wooden bar over a tube: round and friendly."""
    return modes(f, [(1, 1, d), (3.93, .22, d * .35), (9.2, .05, d * .15)], sec, attack=.002, detune=.001)


def glass(f, sec=1.2, d=.5):
    """Small glass or celesta chime."""
    return modes(f, [(1, 1, d), (2.0, .22, d * .5), (3.0, .08, d * .3), (4.16, .06, d * .18), (5.43, .03, d * .1)],
                 sec, attack=.0015, detune=.0008)


def bell(f, sec=1.6, d=.8):
    """Deep bell: hum, prime, minor third, fifth, octave. f is the prime."""
    return modes(f, [(.5, .5, d * 1.4), (1, 1, d), (1.19, .45, d * .7), (1.5, .3, d * .55), (2.0, .4, d * .45),
                     (2.51, .15, d * .3), (3.0, .1, d * .2)], sec, attack=.002, detune=.0006)


def pluck(f, sec=1.4, d=.9, bright=.82, pos=.13):
    """Harp-like plucked string: harmonic modes, the higher ones fade faster."""
    spec = []
    for k in range(1, 14):
        amp = abs(math.sin(k * math.pi * pos)) / k ** 1.4 * bright ** k
        spec.append((k * math.sqrt(1 + .0003 * k * k), amp, d / (1 + .55 * (k - 1))))
    s = modes(f, spec, sec, attack=.0012, detune=.0004)
    for i, x in enumerate(env(biquad(noise(.01), 'lp', 3500), .0003, .002)):
        s[i] += x * .04
    return s


def pad(freqs, sec, attack=.4, release=.8, cutoff=1500, harmonics=8):
    """Warm chord: two slightly detuned band-limited saw voices per note, low-passed."""
    n = n_(sec)
    out = [0.0] * n
    for f in freqs:
        for det in (-.0035, .0035):
            ff, ph0 = f * (1 + det), random.uniform(0, TAU)
            for k in range(1, harmonics + 1):
                if ff * k > RATE * .45:
                    break
                w = TAU * ff * k / RATE
                for i in range(n):
                    out[i] += math.sin(w * i + ph0 * k) / k
    out = biquad(out, 'lp', cutoff, .6)
    a, r = n_(attack), n_(release)
    for i in range(n):
        g = math.sin(.5 * math.pi * i / a) ** 2 if i < a else 1.0
        if i > n - r:
            g *= ((n - i) / r) ** 2
        out[i] *= g
    return out


def thump(f0, f1, sec, decay):
    """Pitch-dropping sine: the weight under an impact."""
    out, ph, n = [], 0.0, n_(sec)
    for i in range(n):
        ph += TAU * f0 * (f1 / f0) ** (i / n) / RATE
        out.append(math.sin(ph))
    return env(out, .001, decay)


def contact(hp=1500, sec=.004):
    """A tiny contact click."""
    return env(biquad(noise(sec), 'hp', hp), .0003, sec / 3)


def crackle(sec, per_sec, hp=2500):
    """Sparse random ticks: paper fibres, card edges."""
    n, p = n_(sec), per_sec / RATE
    return biquad([random.uniform(-1, 1) if random.random() < p else 0.0 for _ in range(n)], 'hp', hp)


def rough(sec, rate):
    """Random amplitude wobble at `rate` changes per second (or a function of progress)."""
    n = n_(sec)
    out, v, target, cnt = [], .5, .5, 0
    for i in range(n):
        cnt -= 1
        if cnt <= 0:
            r = rate(i / n) if callable(rate) else rate
            target, cnt = random.uniform(.05, 1), int(RATE / r)
        v += (target - v) * .02
        out.append(v)
    return out


def mul(a, b):
    return [x * y for x, y in zip(a, b)]


def swish(sec, freq, q=1.0, peak=.4, power=1.5, grain=None):
    """Air or paper moving: band-passed noise with a sweep and a rise-and-fall."""
    s = biquad(noise(sec), 'bp', freq, q)
    if grain:
        s = mul(s, rough(sec, grain))
    return swell(s, peak, power)


# ---------- mixing ----------

class Mix:
    def __init__(self, sec):
        self.L = [0.0] * n_(sec)
        self.R = [0.0] * n_(sec)

    def add(self, sig, at=0.0, gain=1.0, pan=0.0):
        """Place a layer, scaled to its own peak. pan -1..1, or a function of progress for movement."""
        o, L, R = n_(at) if at else 0, self.L, self.R
        top = max(1e-9, max(abs(x) for x in sig))
        n = len(sig)
        for i, x in enumerate(sig):
            j = o + i
            if j >= len(L):
                break
            p = pan(i / n) if callable(pan) else pan
            a = (p + 1) * math.pi / 4
            L[j] += x / top * gain * math.cos(a)
            R[j] += x / top * gain * math.sin(a)

    def reverb(self, room=.5, damp=.4, wet=.15):
        """Freeverb: 8 comb and 4 all-pass filters per side, the right side detuned for width."""
        fb, d = room * .28 + .7, damp * .4
        mono = [(l + r) * .5 for l, r in zip(self.L, self.R)]

        def side(spread):
            combs = [[0.0] * (c + spread) for c in (1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617)]
            aps = [[0.0] * (a + spread) for a in (556, 441, 341, 225)]
            ci, ai, fs = [0] * 8, [0] * 4, [0.0] * 8
            out = []
            for s in mono:
                inp, acc = s * .015, 0.0
                for k in range(8):
                    buf, i = combs[k], ci[k]
                    y = buf[i]
                    fs[k] = y * (1 - d) + fs[k] * d
                    buf[i] = inp + fs[k] * fb
                    ci[k] = i + 1 if i + 1 < len(buf) else 0
                    acc += y
                for k in range(4):
                    buf, i = aps[k], ai[k]
                    b = buf[i]
                    buf[i] = acc + b * .5
                    ai[k] = i + 1 if i + 1 < len(buf) else 0
                    acc = b - acc
                out.append(acc * 3)
            return out

        wl, wr = side(0), side(23)
        self.L = [x + y * wet for x, y in zip(self.L, wl)]
        self.R = [x + y * wet for x, y in zip(self.R, wr)]


def render(name, sec, build, room=(.5, .4, .12), peak=.78):
    """Run `build(mix)`, add room echo, then soft-limit, trim the silent tail and encode to MP3."""
    if (ONLY and name not in ONLY) or (not ONLY and name in RECORDED):
        return
    random.seed(name)  # the same sound every run
    m = Mix(sec)
    build(m)
    if room:
        m.reverb(*room)
    L, R = biquad(m.L, 'hp', 35), biquad(m.R, 'hp', 35)
    top = max(1e-9, max(abs(x) for x in L + R))
    L = [math.tanh(1.2 * x / top) / math.tanh(1.2) for x in L]
    R = [math.tanh(1.2 * x / top) / math.tanh(1.2) for x in R]
    n = len(L)
    while n > RATE * .05 and abs(L[n - 1]) < .003 and abs(R[n - 1]) < .003:
        n -= 1
    fade = n_(.03)
    pcm = array('h')
    for i in range(n):
        g = peak * min(1, (n - i) / fade)
        pcm.append(int(max(-1, min(1, L[i] * g)) * 32767))
        pcm.append(int(max(-1, min(1, R[i] * g)) * 32767))
    os.makedirs(OUT, exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        tmp = f.name
    try:
        with wave.open(tmp, 'wb') as w:
            w.setnchannels(2); w.setsampwidth(2); w.setframerate(RATE)
            w.writeframes(pcm.tobytes())
        subprocess.run([FFMPEG, '-v', 'error', '-y', '-i', tmp, '-c:a', 'libmp3lame', '-q:a', '4',
                        os.path.join(OUT, name + '.mp3')], check=True)
    finally:
        os.unlink(tmp)
    print('made', name)


def sound(sec, room=(.5, .4, .12), peak=.78, name=None):
    """Decorator: @sound(.3) def click(m): ... renders client/audio/sfx/click.mp3"""
    def wrap(fn):
        render(name or fn.__name__, sec, fn, room, peak)
        return fn
    return wrap


def arp(m, names, at=0.0, step=.11, gain=.5, d=1.0, spread=.8, bright=.82, sec=1.6):
    """Harp notes one after another, spread from left to right."""
    for i, nm in enumerate(names):
        p = -spread / 2 + spread * i / max(1, len(names) - 1)
        m.add(pluck(note(nm), sec, d, bright), at=at + i * step, gain=gain, pan=p)


def sparkles(m, count, start, end, gain=(.03, .07), notes=('D7', 'E7', 'F#7', 'A7', 'B7', 'D8')):
    for _ in range(count):
        m.add(glass(note(random.choice(notes)), .5, .16), at=random.uniform(start, end),
              gain=random.uniform(*gain), pan=random.uniform(-.75, .75))


# ---------- menus and matches ----------

@sound(.16, (.3, .5, .06), .6)
def click(m):
    m.add(env(biquad(biquad(noise(.006), 'hp', 2000), 'lp', 6000), .0004, .0012), gain=.5)
    m.add(wood(1900, .08, .018), gain=.6)


@sound(.38, (.4, .45, .08))
def place(m):
    m.add(thump(150, 75, .12, .035), gain=.9)
    m.add(env(biquad(noise(.06), 'bp', 1800, .8), .001, .012), gain=.55)
    m.add(crackle(.04, 900, 3000), gain=.15)
    m.add(wood(185, .2, .05), gain=.35)


@sound(.6, (.5, .4, .14))
def flip(m):
    m.add(swish(.17, lambda t: 900 * 4.5 ** math.sin(math.pi * t * .85), 1.2, .5), gain=.5, pan=lambda t: -.3 + .5 * t)
    m.add(contact(1500, .005), at=.135, gain=.35, pan=.15)
    m.add(wood(1350, .08, .02), at=.135, gain=.35, pan=.15)
    m.add(glass(note('C7'), .45, .16), at=.14, gain=.11, pan=.3)


@sound(1.4, (.7, .4, .22))
def banner(m):
    arp(m, ('D5', 'A5', 'D6'), step=.09, gain=.45, d=.7, spread=.6)
    m.add(glass(note('A6'), .9, .4), at=.2, gain=.14, pan=.3)
    m.add(swish(.3, lambda t: 2000 + 4000 * t, .8, .7), gain=.06)


@sound(3.4, (.85, .35, .3), .72)
def win(m):
    arp(m, ('C5', 'E5', 'G5', 'C6', 'E6'), gain=.5, d=1.1, spread=.9)
    m.add(glass(note('C7'), 1.4, .7), at=.55, gain=.16, pan=.25)
    m.add(glass(note('G6'), 1.4, .7), at=.58, gain=.12, pan=-.25)
    m.add(pad([note(x) for x in ('C3', 'C4', 'E4', 'G4')], 2.3, .45, .9,
              lambda t: 500 + 1800 * math.sin(math.pi * min(1, t * 1.3))), at=.35, gain=.32)
    sparkles(m, 9, .45, 1.7, notes=('D7', 'E7', 'G7', 'A7', 'C8'))


@sound(3.0, (.8, .45, .3), .72)
def lose(m):
    for i, nm in enumerate(('A4', 'F4', 'D4')):
        m.add(pluck(note(nm), 1.4, .9, .7), at=i * .32, gain=.45, pan=.3 - i * .3)
    m.add(pad([note(x) for x in ('D3', 'F3', 'A3')], 2.0, .5, .9, lambda t: 650 - 300 * t), at=.5, gain=.28)
    m.add(thump(82, 60, .5, .18), at=.64, gain=.25)


@sound(2.6, (.8, .4, .28), .72)
def draw(m):
    for i, nm in enumerate(('G4', 'G4')):
        m.add(pluck(note(nm), 1.3, .9, .75), at=i * .42, gain=.45, pan=(-.25, .25)[i])
    m.add(pad([note(x) for x in ('G3', 'A3', 'D4')], 1.8, .5, .9, 900), at=.35, gain=.22)
    m.add(glass(note('D6'), 1.0, .45), at=.45, gain=.08)


@sound(.12, (.25, .5, .05), .65)
def tick(m):
    m.add(wood(2600, .05, .012), gain=.8)
    m.add(contact(4000, .003), gain=.4)


@sound(1.8, (.7, .4, .22))
def timeup(m):
    m.add(wood(1300, .08, .02), gain=.4)
    m.add(bell(note('G3'), 1.6, .7), at=.03, gain=.6)
    m.add(thump(110, 55, .4, .14), at=.03, gain=.35)


@sound(.5, (.4, .4, .1), .7)
def emote(m):
    m.add(marimba(note('A5'), .3, .1), gain=.5, pan=-.15)
    m.add(marimba(note('E6'), .4, .14), at=.08, gain=.5, pan=.15)


@sound(.5, (.4, .45, .1), .7)
def hand_pick(m):
    m.add(swish(.1, lambda t: 1500 + 2500 * t, 1.0, .6, grain=200), gain=.35)
    m.add(contact(2000, .004), at=.07, gain=.3)
    m.add(wood(1500, .08, .02), at=.07, gain=.3)
    m.add(glass(note('C7'), .3, .1), at=.08, gain=.07)


# ---------- opening a pack ----------

@sound(.8, (.55, .4, .14))
def pack_whoosh(m):
    m.add(swish(.42, lambda t: 350 * 9 ** t, .9, .65, 2), gain=.5, pan=lambda t: -.5 + t)
    m.add(thump(90, 70, .3, .08), at=.3, gain=.2)
    m.add(glass(note('D7'), .4, .14), at=.32, gain=.08, pan=.3)


for _i, (_f, _n) in enumerate(((4200, 4), (3400, 6), (5200, 3), (3800, 5), (4800, 4)), 1):
    def _pack_tick(m, f=_f, k=_n):
        m.add(env(biquad(noise(.03), 'bp', f, 1.4), .0005, .006), gain=.4)
        m.add(crackle(.03, k * 60, 3000), gain=.35)
    render(f'pack_tick_0{_i}', .12, _pack_tick, (.3, .5, .05), .5)


@sound(.5, (.45, .4, .1))
def pack_snapback(m):
    m.add(swish(.18, lambda t: 3200 * .2 ** t, .9, .15, 1.2), gain=.45)
    m.add(thump(140, 90, .15, .04), at=.02, gain=.4)
    m.add(wood(420, .12, .03), at=.02, gain=.2)


@sound(1.35, (.6, .4, .18))
def pack_rip(m):
    tear_len = .34
    tear = biquad(noise(tear_len), 'bp', lambda t: 3000 - 1600 * t, .7)
    tear = env(mul(tear, rough(tear_len, lambda t: 70 + 220 * t)), .015, .06, hold=.26)
    m.add(tear, gain=.65, pan=lambda t: -.3 + .4 * t)
    m.add(env(crackle(tear_len, 450, 3000), .005, .1, hold=.25), gain=.3, pan=.15)
    m.add(thump(120, 55, .15, .05), gain=.4)
    for i, nm in enumerate(('C6', 'D6', 'G6', 'A6', 'C7', 'E7')):
        m.add(glass(note(nm), .9, .35), at=.3 + i * .04, gain=.13, pan=(-.5, .5)[i % 2])
    m.add(swell(biquad(noise(.4), 'hp', 3500), .5, 1), at=.28, gain=.07)


@sound(.5, (.45, .4, .1))
def pack_flip(m):
    m.add(swish(.14, lambda t: 1000 * 4 ** math.sin(math.pi * t * .85), 1.2, .5), gain=.45, pan=lambda t: .3 - .5 * t)
    m.add(contact(1800, .004), at=.11, gain=.3)
    m.add(wood(1600, .06, .015), at=.11, gain=.25)


def riser(m, sec, chord, beats=(), sparkle=10):
    """Tension that climbs for `sec` seconds and stops as the card flips."""
    m.add(pad([note(x) for x in chord], sec + .05, sec * .7, .05, lambda t: 300 * 12 ** t, 10), gain=.45)
    m.add(swell(biquad(noise(sec), 'hp', lambda t: 900 * 7 ** t), .97, 2.2), gain=.18)
    m.add(swell(biquad(noise(sec), 'bp', lambda t: 400 * 10 ** t, 2), .97, 1.6), gain=.18, pan=lambda t: math.sin(t * 18) * .5)
    for k in range(sparkle):  # sparkles come faster and higher
        t = sec * (1 - (1 - (k + 1) / (sparkle + 1)) ** 1.6)
        m.add(glass(note(('A6', 'B6', 'D7', 'E7', 'F#7', 'A7', 'B7', 'D8')[min(7, k * 8 // sparkle)]), .4, .12),
              at=t - .02, gain=.05 + .05 * k / sparkle, pan=(-.6, .6)[k % 2])
    for t in beats:
        m.add(thump(70, 45, .3, .09), at=t, gain=.45)


render('pack_build_4', 1.15, lambda m: riser(m, 1.12, ('D4', 'A4', 'D5', 'F#5'), (), 8), (.55, .4, .1), .65)
render('pack_build_5', 1.9, lambda m: riser(m, 1.86, ('D3', 'A3', 'D4', 'F#4', 'A4', 'E5'), (.1, .6, 1.02, 1.36, 1.62), 14),
       (.6, .4, .1), .68)


@sound(.9, (.55, .4, .16), .6)
def pack_reveal_1(m):
    m.add(glass(note('A5'), .8, .3), gain=.4)


@sound(1.1, (.6, .4, .18), .66)
def pack_reveal_2(m):
    m.add(glass(note('E5'), .9, .35), gain=.35, pan=-.2)
    m.add(glass(note('A5'), .9, .35), at=.13, gain=.38, pan=.2)


@sound(1.6, (.7, .4, .22), .72)
def pack_reveal_3(m):
    arp(m, ('D5', 'F#5', 'A5'), step=.1, gain=.45, d=.8, sec=1.2, spread=.6)
    m.add(glass(note('D7'), .9, .4), at=.24, gain=.1, pan=.3)
    sparkles(m, 3, .25, .6)


@sound(2.6, (.8, .4, .28), .76)
def pack_reveal_4(m):
    arp(m, ('D5', 'F#5', 'A5', 'D6'), step=.09, gain=.48, d=1.0, spread=.8)
    m.add(thump(90, 45, .6, .2), gain=.5)
    m.add(pad([note(x) for x in ('D3', 'A3', 'D4', 'F#4', 'A4')], 1.8, .2, 1.0, lambda t: 2500 - 1500 * t), at=.05, gain=.3)
    m.add(glass(note('A6'), 1.2, .6), at=.3, gain=.14, pan=-.3)
    m.add(glass(note('D7'), 1.2, .6), at=.34, gain=.12, pan=.3)
    sparkles(m, 8, .3, 1.2)


@sound(3.6, (.88, .35, .34), .8)
def pack_reveal_5(m):
    m.add(thump(80, 38, .9, .3), gain=.6)
    m.add(bell(note('D4'), 2.4, 1.1), gain=.25)
    arp(m, ('D5', 'F#5', 'A5', 'D6', 'F#6', 'A6'), at=.05, step=.08, gain=.48, d=1.2, spread=1.0, sec=2)
    m.add(pad([note(x) for x in ('D3', 'A3', 'D4', 'F#4', 'A4', 'E5')], 3.0, .25, 1.4,
              lambda t: 3500 - 2500 * t, 10), at=.05, gain=.34)
    m.add(swell(biquad(noise(1.5), 'hp', 5000), .15, 1.5), gain=.06)
    sparkles(m, 18, .25, 2.0, (.03, .08))


@sound(.5, (.45, .4, .1), .65)
def pack_fling(m):
    m.add(swish(.24, lambda t: 600 * 8 ** t, 1.0, .35, 1.4), gain=.5, pan=lambda t: -.2 + .7 * t)


# ---------- the collection binder ----------

for _i, (_lo, _hi) in enumerate(((700, 3200), (850, 3800), (600, 2800), (780, 3500)), 1):
    def _page(m, lo=_lo, hi=_hi):
        m.add(swish(.42, lambda t: lo * (hi / lo) ** math.sin(math.pi * t * .9), .8, .35, 1.4, 120),
              gain=.5, pan=lambda t: .4 - .8 * t)
        m.add(env(crackle(.25, 260, 3500), .02, .1), at=.05, gain=.2)
        m.add(env(biquad(noise(.04), 'lp', 1200), .002, .015), at=.33, gain=.2)
    render(f'coll_page_0{_i}', .7, _page, (.45, .45, .1), .62)


@sound(.6, (.45, .4, .1), .66)
def coll_card_out(m):
    m.add(swish(.26, lambda t: 1200 + 2600 * t, .9, .7, 1.2, 160), gain=.45)
    m.add(contact(2000, .004), at=.24, gain=.25)
    m.add(wood(1250, .08, .02), at=.24, gain=.3)


@sound(.55, (.45, .4, .1), .66)
def coll_card_in(m):
    m.add(swish(.2, lambda t: 3200 - 2200 * t, .9, .4, 1.2, 160), gain=.45)
    m.add(thump(160, 110, .08, .02), at=.17, gain=.35)
    m.add(wood(700, .08, .02), at=.17, gain=.25)


@sound(.8, (.5, .4, .12), .7)
def coll_hand_add(m):
    m.add(swish(.1, lambda t: 2400 - 1000 * t, .9, .5, 1.2), gain=.3)
    m.add(thump(170, 110, .08, .02), at=.06, gain=.4)
    m.add(wood(560, .1, .03), at=.06, gain=.3)
    m.add(marimba(note('A5'), .4, .14), at=.08, gain=.3)


@sound(.4, (.35, .5, .07), .62)
def coll_deny(m):
    for t, f in ((0, 330), (.11, 280)):
        m.add(wood(f, .12, .035), at=t, gain=.5)
        m.add(thump(120, 90, .07, .02), at=t, gain=.3)


@sound(1.7, (.7, .4, .24), .72)
def coll_hand_full(m):
    arp(m, ('D5', 'F#5', 'A5'), step=.12, gain=.45, d=.9, sec=1.3, spread=.6)
    m.add(pad([note(x) for x in ('D4', 'F#4', 'A4')], 1.0, .2, .6, 1200), at=.24, gain=.18)
    m.add(glass(note('D7'), .8, .35), at=.3, gain=.1)


@sound(2.6, (.8, .4, .28), .74)
def coll_set_done(m):
    arp(m, ('C5', 'E5', 'G5', 'C6'), step=.12, gain=.48, d=1.0, spread=.8)
    m.add(pad([note(x) for x in ('C4', 'E4', 'G4', 'B4')], 1.6, .3, .8, 1600), at=.38, gain=.24)
    sparkles(m, 7, .4, 1.1, notes=('C7', 'D7', 'E7', 'G7', 'A7'))


@sound(.9, (.45, .45, .1), .6)
def coll_riffle(m):
    for i in range(7):
        m.add(swish(.1, lambda t: 1500 + 3000 * t, 1.0, .3, 1.3, 220), at=i * .07, gain=.35 - i * .02,
              pan=.35 - i * .1)
        m.add(crackle(.03, 500, 3500), at=i * .07 + .05, gain=.15)


@sound(.3, (.3, .5, .06), .6)
def coll_bump(m):
    m.add(thump(120, 70, .15, .04), gain=.6)
    m.add(wood(240, .1, .03), gain=.25)


@sound(.25, (.3, .5, .06), .58)
def coll_tab(m):
    m.add(contact(2500, .004), gain=.4)
    m.add(wood(2100, .08, .015), gain=.5)
    m.add(swish(.04, 3500, 1.2, .3), gain=.15)


@sound(1.0, (.55, .45, .14), .7)
def coll_open(m):
    m.add(thump(95, 60, .25, .07), gain=.5)
    m.add(swish(.5, lambda t: 500 * 6 ** math.sin(math.pi * t * .9), .7, .4, 1.4, 90), at=.05, gain=.4, pan=lambda t: -.3 + .6 * t)
    m.add(env(crackle(.35, 200, 3000), .02, .12), at=.1, gain=.15)
    m.add(env(biquad(noise(.06), 'lp', 900), .002, .02), at=.5, gain=.3)


@sound(.8, (.55, .45, .14), .7)
def coll_close(m):
    m.add(swish(.28, lambda t: 800 + 2400 * t, .8, .7, 1.3, 90), gain=.35, pan=lambda t: .3 - .6 * t)
    m.add(thump(110, 55, .25, .06), at=.27, gain=.6)
    m.add(env(biquad(noise(.05), 'lp', 1400), .001, .015), at=.27, gain=.4)
    m.add(wood(260, .12, .03), at=.27, gain=.2)


@sound(.4, (.35, .5, .07), .6)
def coll_locked(m):
    m.add(wood(300, .15, .045), gain=.5)
    m.add(thump(100, 80, .1, .03), gain=.35)
    m.add(env(biquad(noise(.03), 'lp', 900), .001, .01), gain=.2)


@sound(1.5, (.7, .45, .22), .66)
def coll_lost(m):
    m.add(thump(90, 50, .3, .08), gain=.5)
    m.add(env(biquad(noise(.05), 'lp', 900), .001, .015), gain=.25)
    m.add(pluck(note('D4'), 1.2, .8, .65), at=.12, gain=.4, pan=-.15)
    m.add(glass(note('F5'), 1.0, .4), at=.2, gain=.12, pan=.2)


@sound(1.3, (.7, .4, .26), .6)
def coll_shimmer(m):
    m.add(swell(biquad(noise(.8), 'hp', lambda t: 3000 + 5000 * t), .3, 1.5), gain=.08)
    for i, nm in enumerate(('A6', 'B6', 'D7', 'E7', 'F#7', 'A7', 'B7', 'D8')):
        m.add(glass(note(nm), .6, .2), at=i * .06, gain=.12 - i * .008, pan=(-.6, .6)[i % 2])


@sound(.3, (.35, .45, .07), .55)
def coll_lift(m):
    m.add(swish(.1, lambda t: 1500 + 2500 * t, 1.0, .5, 1.3, 200), gain=.4)
    m.add(contact(2500, .003), gain=.25)


@sound(.45, (.4, .45, .08), .6)
def coll_return(m):
    m.add(swish(.18, lambda t: 3000 - 1800 * t, .9, .4, 1.3, 180), gain=.4)
    m.add(thump(170, 120, .07, .018), at=.16, gain=.35)
    m.add(wood(900, .07, .018), at=.16, gain=.25)


@sound(.75, (.45, .45, .12), .64)
def coll_hand_remove(m):
    m.add(swish(.18, lambda t: 2800 - 1600 * t, .9, .3, 1.2, 180), gain=.4, pan=lambda t: .4 * t)
    m.add(marimba(note('E5'), .4, .14), at=.1, gain=.28)
    m.add(wood(500, .1, .03), at=.1, gain=.2)


if not ONLY:
    print(f'Made every effect in {os.path.abspath(OUT)}')
