"""Generate Leylines' UI, game-result, pack-opening, and collection sounds from synthesis."""
import math
import os
import random
import shutil
import subprocess
import tempfile
import wave
from array import array

RATE = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', 'client', 'audio', 'sfx')
FFMPEG = shutil.which('ffmpeg') or os.environ.get('FFMPEG')
if not FFMPEG:
    raise SystemExit('Install FFmpeg or set the FFMPEG environment variable to its executable path.')
random.seed(24)


def render(name, duration, layers):
    count = round(RATE * duration)
    mix = [0.0] * count
    for start, length, freq, end_freq, amp, shape, wave_type in layers:
        first, n = round(start * RATE), round(length * RATE)
        phase = 0.0
        filtered_noise = 0.0
        for j in range(n):
            i = first + j
            if i >= count:
                break
            x = j / max(1, n - 1)
            env = (1 - math.exp(-x * 45)) * math.exp(-x * shape)
            f = freq * ((end_freq / freq) ** x) if freq and end_freq else 0
            phase += 2 * math.pi * f / RATE
            if wave_type == 'noise':
                cutoff = max(180, min(10000, f))
                filtered_noise += (1 - math.exp(-2 * math.pi * cutoff / RATE)) * (random.uniform(-1, 1) - filtered_noise)
                sample = filtered_noise * 2.2
            elif wave_type == 'bell':
                sample = math.sin(phase) + .35 * math.sin(phase * 2.76) + .18 * math.sin(phase * 5.4)
            elif wave_type == 'triangle':
                sample = 2 / math.pi * math.asin(math.sin(phase))
            elif wave_type == 'square':
                sample = 1 if math.sin(phase) >= 0 else -1
            elif wave_type == 'brass':
                sample = 2 * ((phase / (2 * math.pi)) % 1) - 1
            elif wave_type == 'pad':
                sample = math.sin(phase) + .3 * math.sin(phase * 2) + .12 * math.sin(phase * 3)
            else:
                sample = math.sin(phase)
            mix[i] += amp * env * sample
    peak = max(max(mix), -min(mix), .001)
    pcm = array('h', (int(max(-1, min(1, x / peak * .78)) * 32767) for x in mix))
    os.makedirs(OUT, exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        tmp = f.name
    try:
        with wave.open(tmp, 'wb') as wav:
            wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(RATE)
            wav.writeframes(pcm.tobytes())
        subprocess.run([FFMPEG, '-v', 'error', '-y', '-i', tmp, '-c:a', 'libvorbis', '-q:a', '5', os.path.join(OUT, name + '.ogg')], check=True)
    finally:
        os.unlink(tmp)


render('click', .085, [(0, .018, 2400, 1500, .34, 7, 'noise'), (0, .07, 1250, 980, .25, 12, 'bell')])
render('place', .21, [(0, .19, 210, 155, .65, 5, 'triangle'), (.015, .13, 1000, 620, .22, 12, 'noise'), (.02, .18, 1760, 1250, .12, 17, 'bell')])
render('flip', .27, [(0, .2, 3700, 900, .3, 5, 'noise'), (.09, .22, 620, 1200, .32, 5, 'bell'), (.15, .22, 880, 1568, .22, 4, 'bell')])
render('banner', .72, [(i*.105, .46, f, f*1.006, .28, 2.5, 'bell') for i,f in enumerate((587,740,880,1175))] + [(.25,.38,294,440,.1,3,'triangle')])
render('win', 2.05, [(i*.22, 1.08, f, f*1.004, .25, 1.8, 'bell') for i,f in enumerate((523,659,784,1047,1319,1568))] + [(.9,1.12,262,523,.16,1.3,'triangle'), (1.25,.7,1760,1320,.08,3,'noise')])
render('lose', 1.7, [(i*.42, .72, f, f*.995, .2, 2.1, 'bell') for i,f in enumerate((440,370,294))] + [(0,1.55,220,147,.13,2,'triangle')])
render('draw', 1.25, [(i*.46, .76, f, f*1.002, .24, 2.2, 'bell') for i,f in enumerate((523,523))] + [(.06,.85,262,262,.1,2,'triangle')])
render('tick', .075, [(0,.045,3200,2550,.5,8,'square'), (0,.06,7100,3900,.16,11,'noise')])
render('timeup', .52, [(0,.48,490,245,.42,2.5,'triangle'), (0,.42,164,82,.26,2.8,'sine'), (.03,.32,1200,500,.16,5,'noise')])
render('emote', .205, [(0,.095,740,740,.3,6,'bell'), (.075,.125,1110,1110,.29,5,'bell'), (.01,.07,1900,1150,.1,10,'noise')])

# Pack opening and card reveal effects.
render('pack_whoosh', .43, [(0,.39,700,6500,.3,-.15,'noise'), (0,.39,190,760,.17,-.15,'triangle'),
                            (.22,.19,1047,1568,.12,5,'bell'), (.29,.14,1568,2093,.08,6,'bell')])
for i, (cutoff, pitch) in enumerate(((7600, 2900), (6200, 2100), (8800, 3500), (7000, 2500), (9500, 3100)), 1):
    render(f'pack_tick_0{i}', .055, [(0,.052,cutoff,pitch,.32,7,'noise'), (0,.021,1800,900,.12,15,'bell')])
render('pack_snapback', .205, [(0,.18,3200,550,.3,3.5,'noise'), (0,.16,230,145,.2,5,'triangle'),
                               (.025,.12,790,540,.1,9,'bell')])
render('pack_rip', .54, [(0,.48,7600,380,.43,2.2,'noise'), (0,.42,108,54,.34,2,'sine'),
                         (0,.035,2500,700,.22,12,'noise'), (.24,.25,880,1760,.13,3,'bell'),
                         (.31,.22,1175,2349,.1,4,'bell'), (.39,.17,1568,2637,.08,5,'bell')])
render('pack_flip', .205, [(0,.16,4200,1200,.26,4,'noise'), (.025,.1,360,230,.12,8,'triangle'),
                           (.115,.085,1480,1175,.2,8,'bell')])
render('pack_build_4', 1.12, [(0,1.1,245,1175,.16,-.9,'pad'), (0,1.1,390,1568,.11,-.7,'triangle'),
                              (0,1.08,4200,9200,.1,-.6,'noise'),
                              *[(i*.18,.2,880+i*110,1500+i*120,.055,2,'bell') for i in range(5)]])
render('pack_build_5', 1.68, [(0,1.66,180,1568,.17,-1.0,'pad'), (0,1.66,95,660,.13,-.7,'triangle'),
                              (0,1.65,3200,10000,.13,-.75,'noise'),
                              *[(i*.14,.2,523+i*125,880+i*170,.05,2.2,'bell') for i in range(9)],
                              *[(t,.21,72,52,.14,3,'sine') for t in (.18,.62,1.06,1.5)]])
render('pack_reveal_1', .3, [(.015,.26,988,988,.28,3.8,'bell'), (.02,.16,1976,1600,.06,8,'bell')])
render('pack_reveal_2', .4, [(.025,.25,659,659,.23,3.5,'bell'), (.17,.22,988,988,.25,3.2,'bell'),
                             (.18,.18,1976,1760,.05,7,'bell')])
render('pack_reveal_3', .55, [(.02,.27,523,523,.2,3,'bell'), (.14,.28,659,659,.22,3,'bell'),
                              (.27,.28,784,784,.25,2.8,'bell'), (.3,.2,1568,1760,.05,8,'bell')])
render('pack_reveal_4', 1.28, [(.02,.42,587,587,.18,3,'bell'), (.13,.42,740,740,.18,3,'bell'),
                               (.24,.42,880,880,.2,3,'bell'), (.35,.44,1175,1175,.22,2.7,'bell'),
                               (.43,.82,587,587,.12,1.8,'pad'), (.43,.82,740,740,.11,1.8,'pad'),
                               (.43,.82,880,880,.11,1.8,'pad'), (.43,.72,1175,1175,.1,2,'bell'),
                               (.38,.5,82,48,.25,2.2,'sine'), (.55,.5,1760,2637,.045,2,'bell'),
                               (.72,.42,2093,3136,.035,2,'bell')])
render('pack_reveal_5', 1.82, [(.02,.37,392,392,.16,3,'bell'), (.13,.38,523,523,.17,3,'bell'),
                               (.24,.39,659,659,.18,3,'bell'), (.35,.4,784,784,.19,3,'bell'),
                               (.46,.42,988,988,.2,2.8,'bell'), (.57,.46,1319,1319,.21,2.6,'bell'),
                               (.67,1.08,523,523,.12,1.3,'pad'), (.67,1.08,659,659,.11,1.3,'pad'),
                               (.67,1.08,784,784,.11,1.3,'pad'), (.67,1.08,1047,1047,.1,1.3,'pad'),
                               (.59,.76,65,42,.31,2.3,'sine'),
                               *[(.82+i*.12,.36,1568+i*95,2200+i*120,.06,2.8,'bell') for i in range(6)]])
render('pack_fling', .26, [(0,.23,850,6200,.27,1.7,'noise'), (0,.23,250,720,.1,2.5,'triangle'),
                           (.12,.13,1760,2500,.055,4,'bell')])

# Collection binder and hand-building effects.
for i, (base, end) in enumerate(((2600,700), (3200,900), (2200,620), (2900,780)), 1):
    render(f'coll_page_0{i}', .49+i*.012, [(0,.46,base,end,.24,2.8,'noise'),
                                           (.04,.38,290+i*22,190+i*15,.12,4,'triangle'),
                                           (.12,.16,850+i*55,620+i*40,.045,8,'bell')])
render('coll_card_out', .36, [(0,.29,2400,800,.24,2.5,'noise'), (0,.29,310,210,.12,3,'triangle'),
                              (.25,.08,780,520,.16,8,'bell')])
render('coll_card_in', .255, [(0,.21,2600,620,.24,2.7,'noise'), (.17,.07,380,260,.17,8,'triangle')])
render('coll_hand_add', .255, [(0,.17,1900,850,.2,3.2,'noise'), (.025,.18,360,220,.25,4,'triangle'),
                               (.105,.15,880,1175,.12,4,'bell')])
render('coll_deny', .205, [(0,.075,190,155,.24,5,'triangle'), (.105,.085,155,110,.22,4.5,'triangle'),
                           (0,.025,1200,650,.09,10,'noise')])
render('coll_hand_full', .76, [(.02,.3,587,587,.2,2.8,'bell'), (.19,.32,740,740,.22,2.5,'bell'),
                               (.37,.35,988,988,.24,2.2,'bell'), (.38,.65,587,587,.1,1.6,'pad'),
                               (.38,.65,740,740,.1,1.6,'pad'), (.38,.65,988,988,.1,1.6,'pad'),
                               (.42,.35,1976,2637,.045,3,'bell')])
render('coll_set_done', 1.34, [(.02,.35,523,523,.18,2.6,'bell'), (.16,.38,659,659,.2,2.5,'bell'),
                               (.3,.42,784,784,.21,2.4,'bell'), (.44,.88,659,659,.1,1.4,'pad'),
                               (.44,.88,784,784,.1,1.4,'pad'), (.44,.88,988,988,.11,1.3,'pad'),
                               (.46,.82,1319,1319,.08,1.5,'bell'), (.62,.65,1760,2637,.04,2.5,'bell')])
render('coll_riffle', .68, [*((i*.085,.22,3400-i*240,1100-i*90,.16,3,'noise') for i in range(6)),
                            *((i*.085,.15,310+i*12,200+i*8,.08,4,'triangle') for i in range(6))])
render('coll_bump', .18, [(0,.15,120,72,.28,3.2,'sine'), (0,.035,420,180,.16,10,'noise')])
render('coll_tab', .12, [(0,.045,2700,1800,.21,6,'noise'), (.015,.09,1480,1280,.12,7,'bell')])
render('coll_open', .68, [(0,.55,900,300,.22,2.2,'noise'), (0,.42,180,115,.14,3,'triangle'),
                          (.28,.11,1150,470,.22,8,'noise'), (.43,.11,1800,700,.17,9,'noise'),
                          (.52,.15,560,340,.12,5,'triangle')])
render('coll_close', .52, [(0,.34,420,1250,.2,2.6,'noise'), (.16,.11,1350,460,.2,8,'noise'),
                           (.29,.19,110,68,.25,3.1,'sine'), (.34,.1,680,400,.13,6,'triangle')])
render('coll_locked', .205, [(0,.16,185,145,.21,4,'triangle'), (0,.04,750,360,.1,9,'noise')])
render('coll_lost', .52, [(0,.1,105,75,.37,3.6,'sine'), (0,.045,850,400,.26,10,'noise'),
                          (.13,.39,220,165,.17,2.7,'triangle'), (.2,.3,330,294,.07,3,'bell')])
render('coll_shimmer', .82, [(0,.78,880,4200,.14,1.8,'bell'), (0,.78,700,2400,.09,1.5,'triangle'),
                             *[(i*.12,.3,1760+i*190,2500+i*220,.05,3,'bell') for i in range(6)]])
render('coll_lift', .135, [(0,.11,2100,1100,.22,4,'noise'), (.035,.075,520,300,.1,8,'triangle')])
render('coll_return', .255, [(0,.22,650,2800,.2,2.5,'noise'), (.18,.075,310,200,.13,5,'triangle')])
render('coll_hand_remove', .255, [(0,.2,2800,700,.22,2.7,'noise'), (.14,.105,460,280,.18,5,'triangle'),
                                  (.14,.12,659,523,.09,5,'bell')])
print(f'Generated synthesized OGG effects in {os.path.abspath(OUT)}')
