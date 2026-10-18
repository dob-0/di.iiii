"""cube_crazy.py — one fast shared line-animation loop for the six cubes (2026-10-18 01:5x, owner: "laser cube make white and crazy
line animations"). The room plays at most 256 frames a line (laserLine.js): one loop of --seconds (default 62) gives a pose every
~0.24 s (tweened), instead of 2-3 poses per scene when every scene has its own block. Eight patterns, ~8 s each, whole field
(-0.95..0.95), cubes 4-6 mirror 1-3, max 6 strokes a cube a frame; a short dark tail for the scenes without lasers.
Writes the ops for the project's cube lines and a blocks map for cube-scene-player.mjs (every laser scene -> the loop, else dark).
  python3 -I scripts/place/cube_crazy.py <document.json> <scenes.json> <ops-out.json> <blocks-out.json> [--seconds 62] [--pattern-s 8] [--speed 1] [--set crazy|scan|mix|dots|smooth|burst] [--red-every N] [--gradient-every N] [--rgb 1,1,1]
"""
import json, math, re, sys, time
doc_f, scenes_f, ops_f, blocks_f = sys.argv[1:5]
arg = lambda k, d: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d
LOOP = float(arg('--seconds', 62)); SEG = float(arg('--pattern-s', 8)); SPEED = float(arg('--speed', 1)); RGB = [float(x) for x in arg('--rgb', '1,1,1').split(',')]
N, DARK, STEP = 256, 2.0, 0.035
F = float(arg('--field', 0.95))   # 1.0 = the cube's whole field (zone edge); owner 03:3x: "maximum scale of lines"
def seg(a, b):
    n = max(2, int(math.dist(a, b) / STEP) + 1)
    return [[round(a[0] + (b[0] - a[0]) * i / (n - 1), 4), round(a[1] + (b[1] - a[1]) * i / (n - 1), 4)] + RGB for i in range(n)]
clip = lambda v: max(-F, min(F, v))
def pat(k, t, m):                      # t in [0,1) inside the pattern's 8 s; m = mirror
    w = 2 * math.pi * t
    if k == 0:   # rotating star, 3 lines through the centre
        return [seg((clip(F * math.cos(w * 2 * m + j * math.pi / 3)), clip(F * math.sin(w * 2 * m + j * math.pi / 3))), (clip(-F * math.cos(w * 2 * m + j * math.pi / 3)), clip(-F * math.sin(w * 2 * m + j * math.pi / 3)))) for j in range(3)]
    if k == 1:   # zigzag running sideways
        o = (t * 4) % 1; xs = [-F + i * 0.38 for i in range(6)]
        return [seg((clip(x + o * 0.38 - 0.19), -0.6 if i % 2 else 0.6), (clip(x + o * 0.38 + 0.19), 0.6 if i % 2 else -0.6)) for i, x in enumerate(xs)]
    if k == 2:   # two scanners crossing, fast
        x = F * math.sin(w * 3) * m; y = F * math.sin(w * 2)
        return [seg((x, -F), (x, F)), seg((-F, y), (F, y))]
    if k == 3:   # grid that breathes
        s = 0.3 + 0.6 * abs(math.sin(w * 2))
        return [seg((-s, v * s), (s, v * s)) for v in (-1, 0, 1)] + [seg((v * s, -s), (v * s, s)) for v in (-1, 0, 1)]
    if k == 4:   # tunnel: a square zooming
        s = 0.1 + 0.85 * ((t * 3) % 1)
        return [seg((-s, -s), (s, -s)), seg((s, -s), (s, s)), seg((s, s), (-s, s)), seg((-s, s), (-s, -s))]
    if k == 5:   # sine sheet: three wavy lines (each 3 segments)
        out = []
        for row in (-0.6, 0, 0.6):
            pts = [(-F + i * 0.633, clip(row + 0.3 * math.sin(w * 4 + i + row * 3))) for i in range(4)]
            out.append(sum((seg(pts[i], pts[i + 1])[:-1] for i in range(3)), []))
        return out
    if k == 6:   # fan from the bottom centre, swinging
        return [seg((0, -F), (clip(F * math.cos(math.pi * j / 5 + 0.4 * math.sin(w * 3) * m)), clip(-F + 1.9 * math.sin(math.pi * j / 5 + 0.01)))) for j in range(1, 5)]
    # 7: scissors — two diagonals opening and closing fast
    o = F * math.sin(w * 4)
    return [seg((-F, -o), (F, o)), seg((-F, o), (F, -o))]
def scan(k, t, m):                     # --set scan (owner 02:0x: "loop lines x y like scanning, few animations in loop")
    a = F * math.sin(2 * math.pi * t)      # one back-and-forth per cycle
    if k == 0: return [seg((a * m, -F), (a * m, F))]                                        # one line scanning X
    if k == 1: return [seg((-F, a), (F, a))]                                                # one line scanning Y
    if k == 2: return [seg((a * m, -F), (a * m, F)), seg((-a * m, -F), (-a * m, F))]          # two lines scanning X, opposite
    if k == 3: return [seg((-F, a), (F, a)), seg((-F, -a), (F, -a))]                         # two lines scanning Y, opposite
    b = F * math.sin(2 * math.pi * t + math.pi / 2)
    if k == 4: return [seg((a * m, -F), (a * m, F)), seg((-F, b), (F, b))]                   # X and Y together: a moving cross
    o = 0.45 * math.sin(2 * math.pi * t)   # owner 02:1x: "move all laser lines right and left"
    if k == 5: return [seg((clip(x + o * m), -F), (clip(x + o * m), F)) for x in (-0.6, -0.2, 0.2, 0.6)]   # four lines sliding X together
    if k == 6: return [seg((-F, clip(y + o)), (F, clip(y + o))) for y in (-0.6, -0.2, 0.2, 0.6)]           # four lines sliding Y together
    if k == 7: g = 0.15 + 0.3 * (0.5 + 0.5 * math.sin(2 * math.pi * t)); return [seg((x * g * m, -F), (x * g * m, F)) for x in (-3, -1, 1, 3)]  # lines spreading out in X
    if k == 8: g = 0.15 + 0.3 * (0.5 + 0.5 * math.sin(2 * math.pi * t)); return [seg((-F, y * g), (F, y * g)) for y in (-3, -1, 1, 3)]          # lines spreading out in Y
    if k == 9: return [seg((clip(x + o * m - 0.4), -F), (clip(x + o * m + 0.4), F)) for x in (-0.5, 0, 0.5)]   # slanted lines sliding X
    tri = F * (1 - 4 * abs(t - 0.5))      # straight down then straight up (owner 03:3x: "going down and up")
    w = 2 * math.pi * t
    if k == 16: return [seg((F * math.cos(w * m + j * math.pi / 6), F * math.sin(w * m + j * math.pi / 6)), (-F * math.cos(w * m + j * math.pi / 6), -F * math.sin(w * m + j * math.pi / 6))) for j in range(6)]   # full-field star, 6 lines
    if k == 17: o2 = 0.3 * math.sin(w); return [seg((-F, clip(y + o2)), (F, clip(y + o2))) for y in (-0.66, 0, 0.66)] + [seg((clip(x - o2 * m), -F), (clip(x - o2 * m), F)) for x in (-0.66, 0, 0.66)]   # full grid, drifting
    if k == 18: return [seg((-F * m, -F), (clip(-F * m + 2 * F * m * math.cos(math.pi / 2 * (j / 5) + 0.3 * math.sin(w))), clip(-F + 2 * F * math.sin(math.pi / 2 * (j / 5) + 0.3 * math.sin(w))))) for j in range(6)]   # fan from the corner, full field
    if k == 19: return [seg((tri * m, -F), (tri * m, F)), seg((-tri * m, -F), (-tri * m, F))]                       # two lines crossing each other across
    if k == 20: return [seg((clip((tri + o3) * m), -F), (clip((tri + o3) * m), F)) for o3 in (-0.4, 0, 0.4)]          # three lines scanning across together
    if k == 21: return [seg((tri * m, -F), (tri * m, F)), seg((-F, F * (1 - 4 * abs(((t + 0.25) % 1) - 0.5))), (F, F * (1 - 4 * abs(((t + 0.25) % 1) - 0.5))))]   # grid scan
    if k == 22: return [seg((clip(tri * m - 0.6), -F), (clip(tri * m + 0.6), F))]                                    # a diagonal scanning over
    if k == 23: a3 = math.pi / 2 + (math.pi / 2.2) * math.sin(2 * math.pi * t) * m; return [seg((0, -F), (clip(2 * F * math.cos(a3)), clip(-F + 2 * F * math.sin(a3))))]   # searchlight from the bottom
    if k == 24: g3 = F * abs(math.sin(2 * math.pi * t)); return [seg((-F, g3), (F, g3)), seg((-F, -g3), (F, -g3))]    # two lines meeting and parting
    if k == 11: return [seg((-F, -tri), (F, -tri))]                                          # a line going down, then up
    if k == 12: return [seg((tri * m, -F), (tri * m, F))]                                     # a line going across, then back
    if k == 13: return [seg((-F, clip(F - 2 * F * (1 - abs(1 - 2 * ((t + j / 3) % 1))))), (F, clip(F - 2 * F * (1 - abs(1 - 2 * ((t + j / 3) % 1)))))) for j in range(3)]  # three lines cascading down and up
    if k == 14: return [seg((tri * m * 0.6, -F), (tri * m * 0.6, F)), seg((-F, -tri), (F, -tri))]   # a cross travelling down-across and back
    if k == 15: return [seg((-F, clip(-tri - 0.5)), (F, clip(-tri + 0.5))), seg((-F, clip(-tri + 0.5)), (F, clip(-tri - 0.5)))]          # an X sweeping down and up
    r = math.pi * t * m; c, sn = math.cos(r), math.sin(r)
    return [seg((-F * c, -F * sn), (F * c, F * sn))]                                          # one line turning slowly, like a radar
def dot(x, y, lit=3):                  # one dot: a blank move there, then a short dwell lit (owner 03:2x: "a lot of dots")
    x, y = clip(x), clip(y); return [[x, y, 0, 0, 0]] + [[x, y] + RGB for _ in range(lit)]
def dots(k, t, m):
    w = 2 * math.pi * t; out = []
    if k == 0:   # grid of dots, rows sliding against each other
        for r in range(4):
            out.append(sum((dot(-0.8 + c * 0.4 + 0.2 * math.sin(w + r) * m, -0.75 + r * 0.5) for c in range(5)), []))
    elif k == 1: # ring of 12 dots turning and breathing
        rr = 0.4 + 0.45 * abs(math.sin(w))
        out.append(sum((dot(rr * math.cos(w * m + j * math.pi / 6), rr * math.sin(w * m + j * math.pi / 6)) for j in range(12)), []))
    elif k == 2: # rain: 6 columns of dots falling
        for c in range(6):
            out.append(sum((dot(-0.85 + c * 0.34, 0.95 - ((t * 2 + c * 0.17 + j * 0.33) % 1) * 1.9) for j in range(3)), []))
    elif k == 3: # scattered dots jumping every pose (a fixed pseudo-random table, so the loop repeats)
        n = int(t * 40)
        out.append(sum((dot(math.sin(n * 12.9898 + j * 78.233) * 0.9, math.sin(n * 39.346 + j * 11.135) * 0.9) for j in range(16)), []))
    elif k == 4: # spiral of dots unwinding
        out.append(sum((dot((0.1 + j * 0.055) * math.cos(w * 2 * m + j * 0.6), (0.1 + j * 0.055) * math.sin(w * 2 * m + j * 0.6)) for j in range(16)), []))
    else:        # a row of dots scanning up and down, and a column scanning across
        y = 0.9 * math.sin(w); x = 0.9 * math.sin(w * 1.5) * m
        out.append(sum((dot(-0.9 + i * 0.3, y) for i in range(7)), [])); out.append(sum((dot(x, -0.9 + i * 0.3) for i in range(7)), []))
    return out
def many(k, t, m):                     # --set smooth (owner 03:4x: "more lines, move them smooth"): six lines, one slow cycle
    w = 2 * math.pi * t; wrap = lambda v: ((v + F) % (2 * F)) - F
    if k == 0: return [seg((wrap(-F + j * F / 3 + 2 * F * t) * m, -F), (wrap(-F + j * F / 3 + 2 * F * t) * m, F)) for j in range(6)]          # six lines sliding across, endless
    if k == 1: return [seg((-F, wrap(-F + j * F / 3 + 2 * F * t)), (F, wrap(-F + j * F / 3 + 2 * F * t))) for j in range(6)]                  # six lines sliding down, endless
    if k == 2: return [seg((0, 0), (F * math.cos(w / 2 * m + j * math.pi / 3), F * math.sin(w / 2 * m + j * math.pi / 3))) for j in range(6)]   # six spokes turning
    if k == 3: return [seg((clip(-F + j * 0.4 + 0.4 * math.sin(w) * m - 0.5), -F), (clip(-F + j * 0.4 + 0.4 * math.sin(w) * m + 0.5), F)) for j in range(6)]   # six diagonals swaying
    if k == 4: g = 0.12 + 0.24 * (0.5 - 0.5 * math.cos(w)); return [seg(((j - 2.5) * g * m, -F), ((j - 2.5) * g * m, F)) for j in range(6)]    # six lines opening and closing across
    if k == 5: g = 0.12 + 0.24 * (0.5 - 0.5 * math.cos(w)); return [seg((-F, (j - 2.5) * g), (F, (j - 2.5) * g)) for j in range(6)]             # six lines opening and closing up-down
    if k == 6: o = 0.3 * math.sin(w); return [seg((clip(x + o * m), -F), (clip(x + o * m), F)) for x in (-0.6, 0, 0.6)] + [seg((-F, clip(y - o)), (F, clip(y - o))) for y in (-0.6, 0, 0.6)]   # a grid drifting
    if k == 7: return [seg((0, -F), (clip(2 * F * math.cos(math.pi * (j + 1) / 7 + 0.35 * math.sin(w) * m)), clip(-F + 2 * F * math.sin(math.pi * (j + 1) / 7 + 0.35 * math.sin(w) * m)))) for j in range(6)]   # a fan from the floor swaying
    if k == 8:
        a = w / 4 * m; c, sn = math.cos(a), math.sin(a)
        return [seg((clip(-F * c - (j - 2.5) * 0.3 * sn), clip(-F * sn + (j - 2.5) * 0.3 * c)), (clip(F * c - (j - 2.5) * 0.3 * sn), clip(F * sn + (j - 2.5) * 0.3 * c))) for j in range(6)]   # six parallel lines turning together
    return [seg((clip(-F + j * 0.38 + 0.25 * math.sin(w + j * 0.8) * m), -F), (clip(-F + j * 0.38 + 0.25 * math.sin(w + j * 0.8) * m), F)) for j in range(6)]   # 9: a wave running through six lines
def burst(k, t, m):                    # --set burst (owner 04:2x): lines born at one point, opening to the field's maximum, then back
    g = math.sin(math.pi * t) ** 0.7 * F; e = 0.001
    def from_c(x, y): return seg((0, 0), (x or e, y or e))          # drawn from the centre outward, so a gradient runs centre -> edge
    if k == 0: return [from_c(-g, 0), from_c(g, 0)]                                                     # a line growing across from the point
    if k == 1: return [from_c(0, -g), from_c(0, g)]                                                     # a line growing up and down
    if k == 2: return [seg((-g, (j - 2.5) * g / 2.6), (g, (j - 2.5) * g / 2.6)) for j in range(6)]       # six lines born at the point, spreading and growing
    if k == 3: return [seg(((j - 2.5) * g / 2.6 * m, -g), ((j - 2.5) * g / 2.6 * m, g)) for j in range(6)]   # the same, standing
    if k == 4: return [from_c(-g, 0), from_c(g, 0), from_c(0, -g), from_c(0, g)]                        # a cross growing from the point
    return [from_c(-g, -g), from_c(g, g), from_c(-g, g), from_c(g, -g)]                                # 5: diagonals bursting out
SET = arg('--set', 'crazy')
# --set mix (owner 02:1x: "more animations, red and white but more white"): the 5 scans and the 8 crazy patterns interleaved;
# --red-every N: every Nth pattern red, the rest white.
MIX_DOTS = [(scan, 0), (dots, 0), (pat, 0), (scan, 5), (dots, 1), (pat, 1), (scan, 1), (dots, 2), (pat, 2), (scan, 6), (dots, 3), (pat, 3),
            (scan, 4), (dots, 4), (pat, 4), (scan, 9), (dots, 5), (pat, 7), (scan, 10), (dots, 3), (pat, 6), (scan, 7), (dots, 0), (pat, 5),
            (scan, 11), (scan, 12), (scan, 13), (scan, 14), (scan, 15), (scan, 16), (scan, 17), (scan, 18),
            (scan, 19), (scan, 20), (scan, 21), (scan, 22), (scan, 23), (scan, 24)]
MIX = [(scan, 0), (scan, 5), (pat, 0), (scan, 1), (scan, 6), (pat, 1), (scan, 2), (scan, 7), (pat, 2), (scan, 3), (scan, 8), (pat, 3),
       (scan, 4), (scan, 9), (pat, 4), (scan, 10), (pat, 5), (pat, 6), (pat, 7)]
RED_EVERY = int(arg('--red-every', 0))
if SET == 'dots': MIX = MIX_DOTS; SET = 'mix'
if SET == 'burst': MIX = [(burst, 0), (many, 0), (scan, 11), (burst, 2), (many, 3), (scan, 19), (burst, 4), (many, 4), (scan, 20), (burst, 1), (many, 1), (scan, 12), (burst, 3), (many, 5), (scan, 21), (burst, 5), (many, 6), (many, 8), (many, 9)]; SET = 'mix'
if SET == 'smooth': MIX = [(many, 0), (scan, 11), (many, 1), (scan, 12), (many, 2), (scan, 19), (many, 3), (many, 4), (scan, 20), (many, 5), (many, 6), (scan, 21), (many, 7), (many, 8), (scan, 23), (many, 9)]; SET = 'mix'
NPAT = {'scan': 25, 'mix': len(MIX)}.get(SET, 8)
def PICK(k, t, m):
    if SET == 'scan': return scan(k, t, m)
    if SET == 'mix': f, j = MIX[k]; return f(j, t, m)
    return pat(k, t, m)
GRAD_EVERY = int(arg('--gradient-every', 0))   # owner 02:2x: "white red gradient": every Nth pattern runs white -> red along each line, the gradient travelling
def colour_of(k): return [1.0, 0.0, 0.0] if RED_EVERY and k % RED_EVERY == RED_EVERY - 1 else ('grad' if GRAD_EVERY and k % GRAD_EVERY == 1 else RGB)
def paint(stroke, col, t):
    if col not in ('grad', 'gradg'): return [q[:2] + (col if max(q[2:5]) > 0 else [0, 0, 0]) for q in stroke]
    n = max(1, len(stroke) - 1)
    out = []
    for i, q in enumerate(stroke):
        w = 0.5 + 0.5 * math.cos(2 * math.pi * (i / n - t))     # 1 = white, 0 = red
        out.append(q[:2] + ([1.0, round(w, 3), round(w, 3)] if col == 'grad' else [round(w, 3), 1.0, round(w, 3)]))   # gradg: white -> green
    return out
EXTRA = [e.split(':') for e in arg('--extra', '').split(';') if e]   # id:set:k:r,g,b:seconds[:speed]
EXTRA_S = sum(float(e[4]) for e in EXTRA)
d = json.load(open(doc_f)); doc = d.get('document', d)
lines = {e['id']: e for e in doc['entities'] if re.fullmatch(r'rig-laser-[1-6][a-f]', e['id'])}
new = {i: [[] for _ in range(N)] for i in lines}
TOTAL = LOOP + EXTRA_S + DARK
lit_frames = int(N * LOOP / TOTAL)
xb = []; t0 = LOOP
for e in EXTRA:
    xb.append((int(N * t0 / TOTAL), int(N * (t0 + float(e[4])) / TOTAL), e)); t0 += float(e[4])
for k in range(N):
    hit = next((x for x in xb if x[0] <= k < x[1]), None)
    if hit:
        f0, f1, e = hit; t = ((k - f0) / max(1, f1 - f0) * (float(e[5]) if len(e) > 5 else 1)) % 1; fn = scan if e[1] == 'scan' else pat; col = e[3] if e[3] in ('grad', 'gradg') else [float(x) for x in e[3].split(',')]
        for cube in '123456':
            ids = sorted(i for i in lines if i.startswith(f'rig-laser-{cube}'))
            for s_i, stroke in enumerate(fn(int(e[2]), t, -1 if cube in '456' else 1)[:6]): new[ids[s_i]][k] = paint(stroke, col, t)
        continue
    if k >= lit_frames: continue
    tt = k / lit_frames * LOOP; p = int(tt // SEG) % NPAT; t = ((tt % SEG) / SEG * SPEED) % 1   # --pattern-s: seconds per pattern; --speed: cycles inside it
    for cube in '123456':
        ids = sorted(i for i in lines if i.startswith(f'rig-laser-{cube}'))
        col = colour_of(p)
        for s_i, stroke in enumerate(PICK(p, t, -1 if cube in '456' else 1)[:6]):
            new[ids[s_i]][k] = paint(stroke, col, t)
if '--massive' in sys.argv:
    seg_of = lambda k: int((k / lit_frames * LOOP) // SEG) % NPAT if k < lit_frames else None
    for p in range(NPAT):
        ks = [k for k in range(lit_frames) if seg_of(k) == p]
        big = max([abs(c) for i in new for k in ks for q in new[i][k] for c in q[:2]] or [0])
        if big <= 0: continue
        g = F / big
        for i in new:
            for k in ks: new[i][k] = [[round(max(-F, min(F, q[0] * g)), 4), round(max(-F, min(F, q[1] * g)), 4)] + q[2:] for q in new[i][k]]
for f in new.values():
    for k in range(N):
        if not f[k]: f[k] = [[0, 0, 0, 0, 0]]
now = int(time.time() * 1000); period = TOTAL
ops = [{'type': 'updateComponent', 'payload': {'entityId': i, 'component': 'beam', 'patch': {'laser': {**e['components']['beam']['laser'], 'frames': {'period': period, 'list': new[i], 'tween': True}}}}, 'opId': f'cube-crazy-{now}-{i}', 'clientId': 'cube-crazy', 'timestamp': now} for i, e in lines.items()]
json.dump({'baseVersion': d.get('version'), 'ops': ops}, open(ops_f, 'w'))
blocks = {'dark': {'start': round(TOTAL - DARK + 0.5, 3), 'len': 1.0}}
t0 = LOOP
for e in EXTRA: blocks[e[0]] = {'start': round(t0, 3), 'len': float(e[4])}; t0 += float(e[4])
for s in json.load(open(scenes_f))['scenes']:
    if s.get('laser'): blocks[s['id']] = {'start': 0.0, 'len': LOOP}
json.dump({'loop_s': period, 'blocks': blocks}, open(blocks_f, 'w'), indent=1)
print(f"period {period}s, {lit_frames} lit frames ({LOOP / lit_frames:.2f} s a pose), max points a line {max(sum(len(fr) for fr in f) for f in new.values())}, laser scenes {len(blocks) - 1}")
