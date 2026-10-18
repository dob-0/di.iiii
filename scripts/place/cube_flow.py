"""cube_flow.py — the cubes as ONE continuous line choreography (2026-10-18 04:5x, owner: "transitions are shit, think a sequence
that can be animated smoother"). Six parallel lines, always the same six, each with a FIXED number of points (the room's tween
blends point i to point i, so a stroke that changes length or count scrambles). Their state — angle, spacing, length, offset,
red-gradient share — moves from keyframe to keyframe with a cosine ease, and every keyframe is where the last move stopped:
a point grows into a line, opens into six, turns, closes, scans, opens again, turns diagonal, collapses back into the point.
  python3 -I scripts/place/cube_flow.py <document.json> <scenes.json> <ops-out.json> <blocks-out.json> [--step 3] [--field 1.0]
"""
import json, math, re, sys, time
doc_f, scenes_f, ops_f, blocks_f = sys.argv[1:5]
arg = lambda k, d: float(sys.argv[sys.argv.index(k) + 1]) if k in sys.argv else d
STEP, F, PTS, N, DARK = arg("--step", 3.0), arg("--field", 1.0), 16, 256, 2.0
NSPARK = 2   # sparkle dots per line (owner 05:5x: "more lines and dots like sparkles")
P = math.pi
#        angle  spacing length offset  red   (each row = where one move ends; the first = where the loop starts)
#        angle  spacing length offset  red   cross  spark   (cross = a second line across each line, its share of the length)
KEYS = [(0,      0.0,   0.0,   0.0,   0.0,  0.0,   0.0),   # a point
        (0,      0.0,   F,     0.0,   0.0,  0.0,   0.6),   # one line across, sparkles come
        (0,      0.34,  F,     0.0,   0.0,  0.0,   0.6),   # six lines open
        (0,      0.34,  F,     0.0,   0.0,  0.3,   0.3),   # each grows a cross: twelve lines
        (P / 2,  0.34,  F,     0.0,   0.3,  0.3,   0.0),   # the net turns
        (P / 2,  0.34,  F,     0.0,   0.3,  0.0,   0.0),   # crosses fold away
        (P / 2,  0.18,  F,     0.55,  0.3,  0.0,   0.3),   # six standing lines slide RIGHT together (owner 06:5x: "add right left")
        (P / 2,  0.18,  F,    -0.55,  0.3,  0.0,   0.3),   # and LEFT
        (P / 2,  0.18,  F,     0.0,   0.3,  0.0,   0.0),   # back to the middle
        (P / 2,  0.0,   F,     0.0,   0.3,  0.0,   0.8),   # closed into one, sparkles
        (P / 2,  0.0,   F,     0.85,  0.6,  0.0,   0.8),   # scanned to one side
        (P / 2,  0.0,   F,    -0.85,  0.6,  0.0,   0.4),   # and across to the other
        (P / 2,  0.0,   F,     0.0,   0.3,  0.0,   0.0),   # back to the middle
        (P,      0.18,  F,     0.0,   0.0,  0.0,   0.0),   # turned lying, opening
        (P,      0.18,  F,     0.45,  0.0,  0.3,   0.5),   # six lines up, short crosses, sparkles
        (P,      0.18,  F,    -0.45,  0.5,  0.3,   0.5),   # and down
        (P,      0.34,  F,     0.0,   0.5,  0.0,   0.0),   # wide open in the middle
        (5 * P / 4, 0.25, F,   0.0,   1.0,  0.3,   0.3),   # turned diagonal with crosses, red
        (5 * P / 4, 0.0,  F,   0.0,   0.5,  0.0,   0.9),   # closed into one diagonal, a sky of sparkles
        (2 * P,  0.0,   0.0,   0.0,   0.0,  0.0,   0.0)]   # shrunk back into the point (2 pi = 0: the loop closes seamlessly)
ease = lambda u: (1 - math.cos(P * u)) / 2
LOOP = STEP * (len(KEYS) - 1)
def state(tt):   # crosses only with ONE line: six lines with crosses broke the cube's 2000-point frame (frames 48 / 176, 06:28)
    i = min(int(tt // STEP), len(KEYS) - 2); u = ease((tt - i * STEP) / STEP)
    return [a + (b - a) * u for a, b in zip(KEYS[i], KEYS[i + 1])]
clip = lambda v: max(-F, min(F, v))
def lines(st, m, k):
    th, sp, ln, off, red, cross, spark = st; cross = cross * max(0.0, 1 - sp / 0.05); dx, dy = math.cos(th) * m, math.sin(th); nx, ny = -dy, dx
    out = []
    for j in range(6):
        c = off + (j - 2.5) * sp; cx, cy = nx * c, ny * c
        pts = []
        for i in range(PTS):          # the line
            s_ = -1 + 2 * i / (PTS - 1); w = 1 - red * abs(s_)
            pts.append([round(clip(cx + dx * ln * s_), 4), round(clip(cy + dy * ln * s_), 4), 1.0, round(w, 3), round(w, 3)])
        cl = ln * cross; b = 1.0 if cross > 0.02 else 0.0     # the cross: across the line at its middle, same points every frame
        pts.append([round(clip(cx - nx * cl), 4), round(clip(cy - ny * cl), 4), 0, 0, 0])
        for i in range(PTS):
            s_ = -1 + 2 * i / (PTS - 1)
            pts.append([round(clip(cx + nx * cl * s_), 4), round(clip(cy + ny * cl * s_), 4), b, b, b])
        for q in range(NSPARK):       # sparkles: fixed seats drifting slowly, brightness twinkling (the tween fades it)
            sx = math.sin(j * 7.13 + q * 3.7 + k * 0.004) * 0.9; sy = math.sin(j * 4.91 + q * 5.3 + k * 0.003) * 0.9
            tw = spark * (0.5 + 0.5 * math.sin(k * 0.9 + j * 2.1 + q * 4.7)) ** 3
            pts.append([round(sx, 4), round(sy, 4), 0, 0, 0])
            pts += [[round(sx, 4), round(sy, 4), round(tw, 3), round(tw, 3), round(tw, 3)] for _ in range(2)]
        out.append(pts)
    return out
d = json.load(open(doc_f)); doc = d.get('document', d)
ents = {e['id']: e for e in doc['entities'] if re.fullmatch(r'rig-laser-[1-6][a-f]', e['id'])}
TOTAL = LOOP + DARK; lit = int(N * LOOP / TOTAL)
new = {i: [[[0, 0, 0, 0, 0]] for _ in range(N)] for i in ents}
for k in range(lit):
    st = state(k / lit * LOOP)
    for cube in '123456':
        ids = sorted(i for i in ents if i.startswith(f'rig-laser-{cube}'))
        for j, pts in enumerate(lines(st, -1 if cube in '456' else 1, k)): new[ids[j]][k] = pts
now = int(time.time() * 1000)
ops = [{'type': 'updateComponent', 'payload': {'entityId': i, 'component': 'beam', 'patch': {'laser': {**e['components']['beam']['laser'], 'frames': {'period': TOTAL, 'list': new[i], 'tween': True}}}}, 'opId': f'cube-flow-{now}-{i}', 'clientId': 'cube-flow', 'timestamp': now} for i, e in ents.items()]
json.dump({'baseVersion': d.get('version'), 'ops': ops}, open(ops_f, 'w'))
blocks = {'dark': {'start': round(LOOP + 0.5, 3), 'len': 1.0}}
for s in json.load(open(scenes_f))['scenes']: blocks[s['id']] = {'start': 0.0, 'len': LOOP}
json.dump({'loop_s': TOTAL, 'blocks': blocks}, open(blocks_f, 'w'), indent=1)
print(f'max points a line {max(sum(len(fr) for fr in f) for f in new.values())}; {len(KEYS) - 1} moves x {STEP} s = {LOOP} s, {lit} frames, {LOOP / lit:.2f} s a pose, {PTS} points a line every frame')
