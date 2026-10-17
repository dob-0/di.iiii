"""cube_lines.py — redraw the LaserCube frames of a project as LINE pictures (owner 2026-10-17 20:4x: "use only lines and cool
underground ones … also in the laser cubes"). Keeps each frame's lit/dark timing and colour; replaces its picture with one of five
line patterns, every point at or above the cube's axis (y >= 0: nothing below the horizontal, so nothing toward the floor):
  sheet   one horizontal line across the field, gently rising and falling
  layers  three horizontal lines stacked
  fan     seven lines from the cube's axis up to an arc, slowly turning
  scanner one vertical line sweeping across
  cross   two diagonal lines crossing, opening and closing
A lit stretch (consecutive lit frames of the show) keeps one pattern; the pattern moves with the frame's place in the stretch.
Cubes 4-6 mirror cubes 1-3. Colour = the frame's own lit colour at full power. Writes ops JSON for the project's ops route.
  python3 -I scripts/place/cube_lines.py <document.json> <ops-out.json>
"""
import json, math, re, sys, time
STEP = 0.02
PATTERNS = ('sheet', 'layers', 'fan', 'scanner', 'cross')

def seg(a, b, rgb):
    n = max(2, int(math.dist(a, b) / STEP) + 1)
    return [[round(a[0] + (b[0] - a[0]) * i / (n - 1), 4), round(a[1] + (b[1] - a[1]) * i / (n - 1), 4)] + rgb for i in range(n)]

def picture(pattern, ph, mirror, rgb):
    m = -1 if mirror else 1
    if pattern == 'sheet':
        y = 0.45 + 0.2 * math.sin(2 * math.pi * ph)
        return [seg((-0.95, y), (0.95, y), rgb)]
    if pattern == 'layers':
        o = 0.08 * math.sin(2 * math.pi * ph)
        return [seg((-0.95, y + o), (0.95, y + o), rgb) for y in (0.25, 0.5, 0.75)]
    if pattern == 'fan':
        out = []
        for k in range(7):
            a = math.radians(20 + 140 * k / 6 + m * 12 * math.sin(2 * math.pi * ph))
            out.append(seg((0.0, 0.0), (0.95 * math.cos(a), max(0.0, 0.95 * math.sin(a))), rgb))
        return out
    if pattern == 'scanner':
        x = m * 0.9 * math.sin(2 * math.pi * ph)
        return [seg((x, 0.02), (x, 0.95), rgb)]
    open_ = 0.45 + 0.4 * (0.5 + 0.5 * math.sin(2 * math.pi * ph))
    return [seg((-0.95, 0.05), (0.95, open_ + 0.05), rgb), seg((-0.95, open_ + 0.05), (0.95, 0.05), rgb)]

d = json.load(open(sys.argv[1])); doc = d['document']
lines = {e['id']: e for e in doc['entities'] if re.fullmatch(r'rig-laser-[1-6][a-f]', e['id'])}
n = len(next(iter(lines.values()))['components']['beam']['laser']['frames']['list'])
new = {i: [[] for _ in range(n)] for i in lines}
for cube in '123456':
    ids = sorted(i for i in lines if i.startswith(f'rig-laser-{cube}'))
    lit = []
    for k in range(n):
        pts = [p for i in ids for p in lines[i]['components']['beam']['laser']['frames']['list'][k] if len(p) >= 5 and max(p[2:5]) > 0]
        if pts:
            r, g, b = (sum(p[c] for p in pts) / len(pts) for c in (2, 3, 4)); top = max(r, g, b) or 1
            lit.append((k, [round(r / top, 3), round(g / top, 3), round(b / top, 3)]))
    stretch, prev, start = -1, None, 0
    for k, rgb in lit:
        if prev is None or k != prev + 1: stretch += 1; start = k
        prev = k
        length = next((j for j in range(k, n) if j + 1 >= n or not any(x[0] == j + 1 for x in lit)), k) - start + 1
        ph = (k - start) / max(1, length)
        strokes = picture(PATTERNS[stretch % len(PATTERNS)], ph, cube in '456', rgb)
        for s_i, stroke in enumerate(strokes):          # one stroke per line entity a-f (the 7th fan line joins line f)
            new[ids[min(s_i, len(ids) - 1)]][k] += stroke
now = int(time.time() * 1000)
ops = [{'type': 'updateComponent', 'payload': {'entityId': i, 'component': 'beam', 'patch': {'laser': {**e['components']['beam']['laser'], 'frames': {**e['components']['beam']['laser']['frames'], 'list': new[i]}}}}, 'opId': f'cube-lines-{now}-{i}', 'clientId': 'cube-lines-2026-10-17', 'timestamp': now} for i, e in lines.items()]
json.dump({'baseVersion': d['version'], 'ops': ops}, open(sys.argv[2], 'w'))
ys = [p[1] for f in new.values() for fr in f for p in fr]
print(f'v{d["version"]}: {len(ops)} lines redrawn; lit frames per cube {len(lit)}; points {len(ys)}; lowest y {min(ys):.2f} (>= 0 = nothing below the axis)')
