"""cube_crazy.py — one fast shared line-animation loop for the six cubes (2026-10-18 01:5x, owner: "laser cube make white and crazy
line animations"). The room plays at most 256 frames a line (laserLine.js): one loop of --seconds (default 62) gives a pose every
~0.24 s (tweened), instead of 2-3 poses per scene when every scene has its own block. Eight patterns, ~8 s each, whole field
(-0.95..0.95), cubes 4-6 mirror 1-3, max 6 strokes a cube a frame; a short dark tail for the scenes without lasers.
Writes the ops for the project's cube lines and a blocks map for cube-scene-player.mjs (every laser scene -> the loop, else dark).
  python3 -I scripts/place/cube_crazy.py <document.json> <scenes.json> <ops-out.json> <blocks-out.json> [--seconds 62] [--pattern-s 8] [--speed 1] [--set crazy|scan|mix] [--red-every N] [--gradient-every N] [--rgb 1,1,1]
"""
import json, math, re, sys, time
doc_f, scenes_f, ops_f, blocks_f = sys.argv[1:5]
arg = lambda k, d: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d
LOOP = float(arg('--seconds', 62)); SEG = float(arg('--pattern-s', 8)); SPEED = float(arg('--speed', 1)); RGB = [float(x) for x in arg('--rgb', '1,1,1').split(',')]
N, DARK, STEP, F = 256, 2.0, 0.035, 0.95
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
    r = math.pi * t * m; c, sn = math.cos(r), math.sin(r)
    return [seg((-F * c, -F * sn), (F * c, F * sn))]                                          # one line turning slowly, like a radar
SET = arg('--set', 'crazy')
# --set mix (owner 02:1x: "more animations, red and white but more white"): the 5 scans and the 8 crazy patterns interleaved;
# --red-every N: every Nth pattern red, the rest white.
MIX = [(scan, 0), (scan, 5), (pat, 0), (scan, 1), (scan, 6), (pat, 1), (scan, 2), (scan, 7), (pat, 2), (scan, 3), (scan, 8), (pat, 3),
       (scan, 4), (scan, 9), (pat, 4), (scan, 10), (pat, 5), (pat, 6), (pat, 7)]
RED_EVERY = int(arg('--red-every', 0))
NPAT = {'scan': 11, 'mix': len(MIX)}.get(SET, 8)
def PICK(k, t, m):
    if SET == 'scan': return scan(k, t, m)
    if SET == 'mix': f, j = MIX[k]; return f(j, t, m)
    return pat(k, t, m)
GRAD_EVERY = int(arg('--gradient-every', 0))   # owner 02:2x: "white red gradient": every Nth pattern runs white -> red along each line, the gradient travelling
def colour_of(k): return [1.0, 0.0, 0.0] if RED_EVERY and k % RED_EVERY == RED_EVERY - 1 else ('grad' if GRAD_EVERY and k % GRAD_EVERY == 1 else RGB)
def paint(stroke, col, t):
    if col != 'grad': return [q[:2] + col for q in stroke]
    n = max(1, len(stroke) - 1)
    out = []
    for i, q in enumerate(stroke):
        w = 0.5 + 0.5 * math.cos(2 * math.pi * (i / n - t))     # 1 = white, 0 = red
        out.append(q[:2] + [1.0, round(w, 3), round(w, 3)])
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
        f0, f1, e = hit; t = ((k - f0) / max(1, f1 - f0) * (float(e[5]) if len(e) > 5 else 1)) % 1; fn = scan if e[1] == 'scan' else pat; col = [float(x) for x in e[3].split(',')]
        for cube in '123456':
            ids = sorted(i for i in lines if i.startswith(f'rig-laser-{cube}'))
            for s_i, stroke in enumerate(fn(int(e[2]), t, -1 if cube in '456' else 1)[:6]): new[ids[s_i]][k] = [q[:2] + col for q in stroke]
        continue
    if k >= lit_frames: continue
    tt = k / lit_frames * LOOP; p = int(tt // SEG) % NPAT; t = ((tt % SEG) / SEG * SPEED) % 1   # --pattern-s: seconds per pattern; --speed: cycles inside it
    for cube in '123456':
        ids = sorted(i for i in lines if i.startswith(f'rig-laser-{cube}'))
        col = colour_of(p)
        for s_i, stroke in enumerate(PICK(p, t, -1 if cube in '456' else 1)[:6]):
            new[ids[s_i]][k] = paint(stroke, col, t)
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
