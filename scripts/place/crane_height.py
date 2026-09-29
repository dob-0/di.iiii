"""Heights of an overhead crane (rail, bridge underside, cab, hook) from ONE telephoto photograph
that sees the crane and, behind it, the floor at the end wall.

    python3 scripts/place/crane_height.py --picks scripts/place/rigs/<picks>.json [--n 20000] [--out result.json]

The method (single-view metrology, after Criminisi, Reid & Zisserman, "Single View Metrology",
IJCV 40(2), 2000; Hartley & Zisserman, "Multiple View Geometry", 2nd ed., ch. 8): with a long lens
the crane and the end wall are each nearly fronto-parallel, so at a depth D a metre spans f / D
pixels. The crane's own rail span (the rail centres, a standard: GOST 534-78, L_k = L - 2*lambda)
gives its depth D_c = f * L_k / (rail-to-rail pixels). The end wall's depth D_w comes from where
the camera stood and where the wall is (the hall's grid). For a point at height H on the crane and
the floor at the wall, both measured in the same image column:

    v_floor_wall = v_h + f * h / D_w          (h = camera height, v_h = the horizon row)
    v_point      = v_h + f * (h - H) / D_c
    =>  H = (v_floor_wall - v_point) * D_c / f + h * (1 - D_c / D_w)

so the unknown horizon cancels, and the camera height enters only through the small factor
(1 - D_c/D_w). Roll is removed first from a straight horizontal edge (the bridge girder's top).
Every input carries its uncertainty; the script draws them (Monte Carlo) and reports the median
and the 5-95 % range. Pixel positions are READ by a person from the full-resolution photograph
and written into the picks file with how they were read — nothing is fitted by hand here.
Needs numpy only.
"""
import argparse
import json
import math

import numpy as np


def draw(rng, spec, n):
    """A prior: {"value", "sd"} normal, {"min", "max"} uniform, or a bare number (fixed)."""
    if isinstance(spec, (int, float)):
        return np.full(n, float(spec))
    if 'min' in spec:
        return rng.uniform(spec['min'], spec['max'], n)
    return rng.normal(spec['value'], spec.get('sd', 0.0), n)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--picks', required=True)
    ap.add_argument('--n', type=int, default=20000)
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--out')
    a = ap.parse_args()
    P = json.load(open(a.picks))
    rng = np.random.default_rng(a.seed)
    n = a.n
    pr = P['priors']
    f = draw(rng, pr['fx_px'], n)
    cam_z = draw(rng, pr['camera_z_m'], n)
    wall_z = draw(rng, pr['wall_inner_z_m'], n)
    h = draw(rng, pr['camera_h_m'], n)
    span = draw(rng, pr['rail_span_m'], n)
    sd_edge = float(P['pixel_sd']['edge'])
    sd_rail_x = float(P['pixel_sd']['rail_x'])
    cx = float(P['image_px'][0]) / 2

    # roll: a straight edge that is level in the world (least squares slope through its points)
    xs = np.array([p[0] for p in P['level_edge']], float)
    vs = np.array([p[1] for p in P['level_edge']], float)
    slope = np.polyfit(xs, vs, 1)[0]
    slope_draw = slope + rng.normal(0, sd_edge * math.sqrt(2) / (xs.max() - xs.min()), n)

    def level(pt):
        """row of a picked point after removing the roll about the image's centre column"""
        x, v = pt
        return v - slope_draw * (x - cx) + rng.normal(0, sd_edge, n)

    xl, xr = P['rail_x_px']
    rail_px = (xr - xl) + rng.normal(0, sd_rail_x * math.sqrt(2), n)
    D_c = f * span / rail_px
    D_w = cam_z - wall_z
    floor = np.mean([level(p) for p in P['floor_at_wall']], axis=0)

    def height(points):
        v = np.mean([level(p) for p in points], axis=0)
        return (floor - v) * D_c / f + h * (1 - D_c / D_w)

    def summary(x, nd=2):
        q = np.percentile(x, [5, 50, 95])
        return {'median': round(float(q[1]), nd), 'p05': round(float(q[0]), nd), 'p95': round(float(q[2]), nd)}

    out = {
        'photo': P['photo'],
        'method': 'crane_height.py: fronto-parallel two-depth metrology (Criminisi et al. 2000), Monte Carlo n=%d' % n,
        'roll_deg': round(math.degrees(math.atan(slope)), 2),
        'crane_depth_m': summary(D_c, 1),
        'wall_depth_m': summary(D_w, 1),
        'crane_from_camera_along_hall_m': summary(D_c, 1),
        'crane_z_m': summary(cam_z - D_c, 1),
        'heights_m': {},
    }
    for name, pts in P['points'].items():
        out['heights_m'][name] = summary(height(pts['px']))
        out['heights_m'][name]['what'] = pts.get('what', '')
    rail = height(P['points']['rail_top']['px'])
    for name, pts in P['points'].items():
        if name != 'rail_top':
            out['heights_m'][name]['minus_rail_top'] = summary(height(pts['px']) - rail)
    # points ON the end wall (fronto-parallel at D_w): H = (floor - v) * D_w / f
    for name, pts in (P.get('wall_points') or {}).items():
        v = np.mean([level(p) for p in pts['px']], axis=0)
        out.setdefault('wall_heights_m', {})[name] = {**summary((floor - v) * D_w / f), 'what': pts.get('what', '')}
    # sizes at the end wall (fronto-parallel at D_w): a check of the scale against known objects
    for name, box in (P.get('wall_objects') or {}).items():
        w = (box['x'][1] - box['x'][0]) * D_w / f
        hgt = (box['v'][1] - box['v'][0]) * D_w / f
        out.setdefault('wall_objects_m', {})[name] = {'w': summary(w), 'h': summary(hgt), 'what': box.get('what', '')}
    txt = json.dumps(out, indent=1)
    print(txt)
    if a.out:
        with open(a.out, 'w') as fh:
            fh.write(txt + '\n')


if __name__ == '__main__':
    main()
