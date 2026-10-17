"""cube_block_lines.py — the cubes' line pictures (cube_lines.py patterns: sheet, layers, fan, scanner, cross; whole field) per
SCENE BLOCK of a scene-picked show (cube_cycles.py blocks), so each scene draws its own moving lines (2026-10-18 01:1x, owner: the
net's still dots read as "the cubes are not running"). Colour = the block's own lit colour at full power; a dark block stays dark.
  python3 -I scripts/place/cube_block_lines.py <document.json> <blocks.json> <ops-out.json>
"""
import json, math, re, sys, time
sys.argv, keep = sys.argv[:1] + ['x', 'y'], sys.argv
STEP = 0.03   # the engine keeps at most 20 000 points a line (laserLine.js); 0.02 gave 22 905
def seg(a, b, rgb):
    n = max(2, int(math.dist(a, b) / STEP) + 1)
    return [[round(a[0] + (b[0] - a[0]) * i / (n - 1), 4), round(a[1] + (b[1] - a[1]) * i / (n - 1), 4)] + rgb for i in range(n)]
def picture(k, ph, m, rgb):           # whole field, -0.95..0.95 (owner 22:2x: cubes installed so they hurt no one)
    s = math.sin(2 * math.pi * ph)
    if k == 0: y = 0.6 * s; return [seg((-0.95, y), (0.95, y), rgb)]
    if k == 1: o = 0.15 * s; return [seg((-0.95, y + o), (0.95, y + o), rgb) for y in (-0.6, 0, 0.6)]
    if k == 2:
        out = []
        for j in range(7):
            a = math.pi * (j / 6) + m * 0.5 * s
            out.append(seg((0, -0.95), (0.95 * math.cos(a), -0.95 + 1.9 * abs(math.sin(a))), rgb))
        return out
    if k == 3: x = m * 0.9 * s; return [seg((x, -0.95), (x, 0.95), rgb)]
    o = 0.9 * (0.5 + 0.5 * s); return [seg((-0.95, -o), (0.95, o), rgb), seg((-0.95, o), (0.95, -o), rgb)]
doc_f, blocks_f, out_f = keep[1:4]
FORCE = None   # --colour <prefix>=r,g,b : those blocks draw in that colour (owner 01:4x: the new scenes red only)
if '--colour' in keep:
    pre, rgb_s = keep[keep.index('--colour') + 1].split('=')
    FORCE = (pre, [float(x) for x in rgb_s.split(',')])
SKIP = keep[keep.index('--keep-prefix') + 1] if '--keep-prefix' in keep else None   # blocks whose ids start so keep their compiled frames (e.g. the dots)
d = json.load(open(doc_f)); doc = d.get('document', d); blocks = json.load(open(blocks_f))
lines = {e['id']: e for e in doc['entities'] if re.fullmatch(r'rig-laser-[1-6][a-f]', e['id'])}
fr0 = next(iter(lines.values()))['components']['beam']['laser']['frames']; n = len(fr0['list']); period = fr0['period']
new = {i: [[] for _ in range(n)] for i in lines}
for bi, (sid, b) in enumerate(sorted(blocks['blocks'].items(), key=lambda kv: kv[1]['start'])):
    f0, f1 = int(b['start'] / period * n), max(int(b['start'] / period * n) + 1, int((b['start'] + b['len']) / period * n))
    for cube in '123456':
        ids = sorted(i for i in lines if i.startswith(f'rig-laser-{cube}'))
        for k in range(f0, min(f1, n)):
            pts = [p for i in ids for p in lines[i]['components']['beam']['laser']['frames']['list'][k] if len(p) >= 5 and max(p[2:5]) > 0]
            if SKIP and sid.startswith(SKIP):
                for i in ids: new[i][k] = lines[i]['components']['beam']['laser']['frames']['list'][k]
                continue
            if sid == 'dark' or not pts: continue
            r, g, bb = (sum(p[c] for p in pts) / len(pts) for c in (2, 3, 4)); top = max(r, g, bb) or 1
            rgb = [round(r / top, 3), round(g / top, 3), round(bb / top, 3)]
            if FORCE and sid.startswith(FORCE[0]): rgb = FORCE[1]
            ph = (k - f0) / max(1, f1 - f0)
            for s_i, stroke in enumerate(picture(bi % 5, ph, -1 if cube in '456' else 1, rgb)):
                new[ids[min(s_i, len(ids) - 1)]][k] += stroke
# A frame left empty is trimmed off the END of the list by the server (seen 2026-10-18: lists of 51/101/152 instead of 256), which
# re-times the whole line (frameIndexAt spreads the period over list.length). One blank point keeps every frame in place.
for f in new.values():
    for k in range(n):
        if not f[k]: f[k] = [[0, 0, 0, 0, 0]]
now = int(time.time() * 1000)
ops = [{'type': 'updateComponent', 'payload': {'entityId': i, 'component': 'beam', 'patch': {'laser': {**e['components']['beam']['laser'], 'frames': {**e['components']['beam']['laser']['frames'], 'list': new[i]}}}}, 'opId': f'cube-block-lines-{now}-{i}', 'clientId': 'cube-block-lines', 'timestamp': now} for i, e in lines.items()]
json.dump({'baseVersion': d.get('version'), 'ops': ops}, open(out_f, 'w'))
pts = sum(len(fr) for f in new.values() for fr in f)
print(f"{len(ops)} lines, {n} frames, {sum(1 for k in range(n) if any(new[i][k] for i in new))} lit frames, {pts} points, max points a line {max(sum(len(fr) for fr in f) for f in new.values())}")
