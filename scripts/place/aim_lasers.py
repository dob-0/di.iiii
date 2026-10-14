#!/usr/bin/env python3
"""Re-place and re-aim a rig's laser lines from a spec, as a moves file for move_lamps.py (2026-10-15).

    python3 scripts/place/aim_lasers.py --rig <rig.json> --spec <spec.json> --out <moves.json> [--write-rig]

The rig's `lasers.tubes` (one line per beam: `beam`, `cube`, `from`, `to`, hall frame) are the source. The spec says where the
units stand and where the lines end:
  {"offset": [dx, dy, dz],                      # hall frame -> project frame (the rig's show offset)
   "cubes": {"<cube id>": [x, y, z], ...},        # new unit positions (hall frame); a cube not named keeps its place
   "comb": {"x0", "step", "n", "y", "z", "order": [cube ids left->right]},   # optional: n lines across at y,z, interleaved
   "to": {"<beam>": [x, y, z], ...}}              # optional: a line's own end point
Each line's rotation is three.js Euler XYZ for a spot whose unrotated beam is -Y (euler_for, as moxir_v2_3_aerial.py):
c = asin(dx), a = atan2(-dz, -dy). Writes {"what","source","moves":[{"id":"rig-laser-<beam>","position","rotation"}]};
--write-rig also updates the rig's tubes (from/to) and the cube fixtures' p/r (r = the unit's middle line). Pure arithmetic;
the hall is not consulted: run physics_check.py after the move.
"""
import argparse, json, math

def euler_for(d):
    c = math.asin(max(-1.0, min(1.0, d[0]))); return [round(math.atan2(-d[2], -d[1]), 4), 0.0, round(c, 4)]

def unit(a, b):
    d = [b[i] - a[i] for i in range(3)]; n = math.sqrt(sum(x * x for x in d)); return [x / n for x in d]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--rig', required=True); ap.add_argument('--spec', required=True); ap.add_argument('--out', required=True)
    ap.add_argument('--write-rig', action='store_true')
    a = ap.parse_args()
    rig = json.load(open(a.rig)); spec = json.load(open(a.spec)); off = spec.get('offset', [0, 0, 0])
    tubes = rig['lasers']['tubes']; cubes = spec.get('cubes', {}); comb = spec.get('comb'); ends = spec.get('to', {})
    by_cube = {}
    for t in tubes: by_cube.setdefault(t['cube'], []).append(t)
    if comb:
        order = comb['order']; k = len(order)
        xs = [comb['x0'] + i * comb['step'] for i in range(comb['n'])]
        for j, cube in enumerate(order):
            mine = sorted(by_cube[cube], key=lambda t: t['to'][0])
            own = xs[j::k]
            if len(own) != len(mine): raise SystemExit(f'{cube}: {len(mine)} lines, comb gives {len(own)}')
            for t, x in zip(mine, own): t['to'] = [round(x, 3), comb['y'], comb['z']]
    moves = []
    for t in tubes:
        if t['cube'] in cubes: t['from'] = list(cubes[t['cube']])
        if str(t['beam']) in ends: t['to'] = list(ends[str(t['beam'])])
        d = unit(t['from'], t['to']); t['r'] = euler_for(d); t['length_m'] = round(math.dist(t['from'], t['to']), 3)
        moves.append({'id': f"rig-laser-{t['beam']}", 'position': [round(t['from'][i] + off[i], 3) for i in range(3)], 'rotation': t['r']})
    for f in rig['fixtures']:
        if f['id'] in by_cube:
            mine = by_cube[f['id']]; f['p'] = list(mine[0]['from'])
            mid = [sum(t['to'][i] for t in mine) / len(mine) for i in range(3)]; f['r'] = euler_for(unit(f['p'], mid))
    out = {'what': spec.get('what', 'laser lines re-aimed'), 'source': f"{a.rig} lasers.tubes + {a.spec}", 'moves': moves}
    json.dump(out, open(a.out, 'w'), indent=1)
    if a.write_rig: json.dump(rig, open(a.rig, 'w'), indent=1)
    print(f"{len(moves)} laser lines -> {a.out}" + (' (rig updated)' if a.write_rig else ''))
    for c, ts in by_cube.items(): print(f"  {c:22} from {ts[0]['from']} to x {min(t['to'][0] for t in ts):.2f}..{max(t['to'][0] for t in ts):.2f}")

if __name__ == '__main__': main()
