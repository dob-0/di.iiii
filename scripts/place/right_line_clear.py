#!/usr/bin/env python3
"""Where a floor-standing head line can stand on a hall side without a kept machine in its body or its beam.

MOXIR, 2026-10-13 (ledger N564): the owner asked for the right B380F line "more right" and to "check the open spaces"
in the photos and the hall record. The hall record (dims.massing of the .hall.json) is a list of boxes, each with the
photos it was read from and its stated uncertainty ("x +-0.8, z +-2.5" in `confidence` / `how`). Method: every box is
grown by its OWN stated uncertainty (unstated: x +-1.0, z +-1.5, y +-0.3), then for each head position z the largest x
in [x_min, x_max] (step 0.5) is taken where (a) the head's footprint (at the lamp height) touches no grown box that
stands on the floor (y_min <= 1.2 m) and (b) its beam, cast from the lamp along the fixture's own rotation, meets no
grown box before the roof deck. No x -> the head stays where it is (the dance floor's edge). Worst case per box,
not a probability: a place this says is clear is clear if every box is within its stated error.

    python3 scripts/place/right_line_clear.py --hall <hall.json> --rig <rig.json> [--part 'side line right'] [--x-max 9]
"""
import argparse, json, math, re

NUM = r'([0-9]+(?:\.[0-9]+)?)'


def grown_boxes(hall):
    out = []
    for m in hall['dims']['massing']:
        if 'pendant' in m['id']:
            continue  # bell lamps at 9.5 m, beside the deck, not a head's problem
        txt = (m.get('confidence', '') + ' ' + m.get('how', ''))
        ux = re.search(r'x \+-\s*' + NUM, txt); uz = re.search(r'z \+-\s*' + NUM, txt); uy = re.search(r'(?:top|y) \+-\s*' + NUM, txt)
        ex = float(ux.group(1)) if ux else 1.0; ez = float(uz.group(1)) if uz else 1.5; ey = float(uy.group(1)) if uy else 0.3
        out.append(dict(id=m['id'], x=[m['x_m'][0] - ex, m['x_m'][1] + ex], z=[m['z_m'][0] - ez, m['z_m'][1] + ez],
                        y=[max(0.0, m['y_m'][0] - ey), m['y_m'][1] + ey], grown=(ex, ez, ey)))
    return out


def beam_direction(r):
    """A spot throws down its local -Y; three.js Euler XYZ (r = [x, y, z] radians) -> world direction."""
    x, y, z = 0.0, -1.0, 0.0
    cz, sz = math.cos(r[2]), math.sin(r[2]); x, y = x * cz - y * sz, x * sz + y * cz
    cy, sy = math.cos(r[1]), math.sin(r[1]); x, z = x * cy + z * sy, -x * sy + z * cy
    cx, sx = math.cos(r[0]), math.sin(r[0]); y, z = y * cx - z * sx, y * sx + z * cx
    return [x, y, z]


def blocker(boxes, p, d, roof=10.8, step=0.05):
    for b in boxes:  # the head's own footprint, floor-standing boxes only
        if b['y'][0] <= 1.2 and b['x'][0] <= p[0] <= b['x'][1] and b['z'][0] <= p[2] <= b['z'][1]:
            return b['id']
    for i in range(1, int(60 / step)):
        s = i * step; q = [p[0] + d[0] * s, p[1] + d[1] * s, p[2] + d[2] * s]
        if q[1] > roof or q[1] < 0:
            break
        for b in boxes:
            if b['x'][0] <= q[0] <= b['x'][1] and b['y'][0] <= q[1] <= b['y'][1] and b['z'][0] <= q[2] <= b['z'][1]:
                return b['id']
    return None


def clear_x_by_z(hall, fixtures, x_min=3.0, x_max=9.0, step=0.5):
    """{z: (x or None, blockers)} for each fixture (dicts with p and r); the largest clear x, else None."""
    boxes = grown_boxes(hall); out = {}
    for f in fixtures:
        d = beam_direction(f['r']); z = f['p'][2]; best = None; hit = set()
        for i in range(int(round((x_max - x_min) / step)) + 1):
            x = round(x_min + i * step, 2); b = blocker(boxes, [x, f['p'][1], z], d)
            if b is None:
                best = x
            else:
                hit.add(b)
        out[z] = (best, sorted(hit))
    return out


if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--hall', required=True); ap.add_argument('--rig', required=True)
    ap.add_argument('--part', default='side line right'); ap.add_argument('--x-min', type=float, default=3.0); ap.add_argument('--x-max', type=float, default=9.0)
    a = ap.parse_args()
    hall = json.load(open(a.hall)); rig = json.load(open(a.rig))
    fx = sorted([f for f in rig['fixtures'] if f.get('part') == a.part], key=lambda f: f['p'][2])
    res = clear_x_by_z(hall, fx, a.x_min, a.x_max)
    for f in fx:
        x, hit = res[f['p'][2]]
        print(f"{f['id']}  z {f['p'][2]:g}  now x {f['p'][0]:g}  ->  {'x %g' % x if x is not None else 'none clear: stays'}   grown blockers: {', '.join(hit) or '-'}")
    print(json.dumps({str(k): v[0] for k, v in res.items()}))
