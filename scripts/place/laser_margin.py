#!/usr/bin/env python3
# laser_margin.py — how far every laser line of the v2.8 matrix rig stays above the people on the dance floor (2026-10-13).
#
# WHAT IT MEASURES: each line (fixture p -> beam 'to', straight) is clipped to the dance zone's footprint
# (hall record dims.zones.dance.used, x/z), sampled every --step m along that stretch, and from every sample a ray is cast
# STRAIGHT DOWN (occlusion_lib.Obstacles.cast, Moller & Trumbore) onto what a person can stand on: the hall floor (y 0),
# every dims.massing item that stands on the ground, and the rig's own solids (barrier, PA placeholders). The hit
# distance is the height above the standing surface; the lowest over the zone is the line's margin. A second pass tilts
# each line DOWN by its tube's half_fan_deg (rig.lasers.tubes) about its source: the worst case if the controller zone /
# mount tolerance points it lower. The reference is the 3.0 m vertical audience separation (see SEPARATION below).
#
# WHY NOT THE HALL GLB: occlusion_lib's full cast loads hall.glb (55 000 triangles), which lives under /mnt/data and is
# not in git. Under the dance zone the GLB holds the floor and nothing else that stands on it (dims.massing: only the
# pendant lamps, hanging at 9.5-10.6 m, overlap the zone in plan), so the massing boxes + floor give the same surfaces.
# The triangles here are built from the same hall record the GLB was built from; the caster is occlusion_lib's.
#
# FIRST SURFACE (physics first): a beam stops where it first meets the floor, a ground-standing solid or a shell slab
# (optional hall record dims.shell = [{id, x_m, y_m, z_m}] boxes for walls and roof). Only the part of the line BEFORE that
# surface is measured; a wall between the source and the zone means the zone is not reached. A hall record with no
# dims.shell has no modelled walls or roof: the result says shell_modelled false and stays UNVALIDATED, and the line is then
# measured to its stored end, which is the longer, more conservative stretch. Hanging envelopes (lamps) never shorten a line:
# a lamp scatters, so a strike is only flagged.
# STANDARD: none validated. 3 m is read from laser-distance.mjs (the repo's one source); IEC TR 60825-3 / ILDA / HSG95 are named
# in the repo's notes with clause numbers UNVERIFIED. This is a geometry check, NOT a safety assessment (LSO sign-off owed).
#
# Also reported, informational: whether a line passes through a HANGING massing envelope (pendant lamps) anywhere on
# its length. Envelopes are boxes from dims.massing, not the lamp geometry: a strike here is a flag, not a measurement.
#
# Usage: python3 laser_margin.py --rig R --hall H [--json] [--step 0.05]
import argparse, json, math, os, sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from occlusion_lib import Obstacles  # noqa: E402



import laser_rules  # noqa: E402  (the rules' one reader; see laser_rules.py)


SEPARATION_M = laser_rules.MIN_HEIGHT_M
SEPARATION = ('%.1f m vertical above any surface an audience member may stand on. Quoted source: Ariz. Admin. Code '
              'R9-7-1441(L) ("at any point less than three meters above any surface upon which an individual in the '
              'audience is permitted to stand"), the US FDA/CDRH laser-show variance figure. IEC TR 60825-3 / HSE '
              'HS(G)95 / ILDA give the same 3 m in the repo\'s notes: clause numbers UNVERIFIED (not quoted).' % SEPARATION_M)
HAND_RULE_M = laser_rules.HAND_RULE_M   # the owner's stricter rule: 3 m counted from a raised hand at 2.4 m (both in laser-distance.mjs)
OUTSIDE = 'rig-out-'


def euler_xyz(r):
    """three.js Euler XYZ (intrinsic) -> rotation matrix Rx @ Ry @ Rz."""
    a, b, c = r
    Rx = np.array([[1, 0, 0], [0, math.cos(a), -math.sin(a)], [0, math.sin(a), math.cos(a)]])
    Ry = np.array([[math.cos(b), 0, math.sin(b)], [0, 1, 0], [-math.sin(b), 0, math.cos(b)]])
    Rz = np.array([[math.cos(c), -math.sin(c), 0], [math.sin(c), math.cos(c), 0], [0, 0, 1]])
    return Rx @ Ry @ Rz


def box_tris(lo, hi, R=None, p=None):
    """12 triangles of a box given in local lo/hi, optionally rotated by R about p."""
    xs, ys, zs = (lo[0], hi[0]), (lo[1], hi[1]), (lo[2], hi[2])
    V = np.array([[xs[i], ys[j], zs[k]] for i in (0, 1) for j in (0, 1) for k in (0, 1)], float)
    if R is not None:
        V = p + V @ R.T
    F = [(0, 1, 3), (0, 3, 2), (4, 6, 7), (4, 7, 5), (0, 4, 5), (0, 5, 1),
         (2, 3, 7), (2, 7, 6), (0, 2, 6), (0, 6, 4), (1, 5, 7), (1, 7, 3)]
    return V[np.array(F)]


def make_obstacles(named):
    """An Obstacles instance over [(name, cls, (N,3,3) tris)] — occlusion_lib's cast without its GLB loader."""
    O = Obstacles.__new__(Obstacles)
    T, lab = [], []
    O.labels, O.lcls = [], []
    for i, (name, cls, tris) in enumerate(named):
        O.labels.append(name)
        O.lcls.append(cls)
        T.append(tris)
        lab += [i] * len(tris)
    T = np.concatenate(T) if T else np.zeros((0, 3, 3))
    O.V0, O.E1, O.E2 = T[:, 0], T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]
    O.C = T.mean(1)
    O.R = np.linalg.norm(T - O.C[:, None, :], axis=2).max(1) if len(T) else np.zeros(0)
    n = np.cross(O.E1, O.E2)
    O.N = n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
    O.lab = np.array(lab, int)
    O.cls = np.array(O.lcls)[O.lab] if len(T) else np.array([])
    O.boxes, O.G, O.n_tris = [], None, len(T)
    return O


def surfaces(hall, rig, zone):
    """(standing, hanging): standing = floor + ground massing + rig solids inside the hall; hanging = massing off the ground."""
    D = hall['dims']
    x0, x1 = zone['x_m'][0] - 50, zone['x_m'][1] + 50
    z0, z1 = zone['z_m'][0] - 50, zone['z_m'][1] + 50
    floor = np.array([[[x0, 0, z0], [x1, 0, z0], [x1, 0, z1]], [[x0, 0, z0], [x1, 0, z1], [x0, 0, z1]]], float)
    standing, hanging = [('hall floor', 'floor', floor)], []
    for m in D.get('massing', []):
        if not all(k in m for k in ('x_m', 'y_m', 'z_m')):
            continue
        t = box_tris([m['x_m'][0], m['y_m'][0], m['z_m'][0]], [m['x_m'][1], m['y_m'][1], m['z_m'][1]])
        (standing if m['y_m'][0] <= 0.05 else hanging).append((m['id'], 'massing', t))
    for s in rig.get('solids', []):
        if s.get('kind') != 'box' or s['id'].startswith(OUTSIDE):
            continue
        sx, sy, sz = s['s']   # rig primitives: p is the middle of the base (lights_beta_options.Box anchor 'base')
        t = box_tris([-sx / 2, 0, -sz / 2], [sx / 2, sy, sz / 2], euler_xyz(s.get('r', [0, 0, 0])), np.array(s['p'], float))
        standing.append((s['id'], 'rig solid', t))
    shell = [(m.get('id', 'shell'), 'shell', box_tris([m['x_m'][0], m['y_m'][0], m['z_m'][0]], [m['x_m'][1], m['y_m'][1], m['z_m'][1]]))
             for m in D.get('shell', [])]
    return make_obstacles(standing), make_obstacles(hanging), make_obstacles(standing + shell), bool(shell)


def stop_at_first_surface(a, b, Stop):
    """b' = where the beam a->b first meets a standing surface or shell slab (b itself if none); and what it met."""
    d = b - a
    L = float(np.linalg.norm(d))
    if L < 1e-12:
        return b, None
    t, name, _, _ = Stop.cast(a, d / L, tmin=1e-6, tmax=L)
    if t is None:
        return b, None
    return a + d / L * t, name


def clip_xz(a, b, zone):
    """Liang-Barsky: parameter interval [t0, t1] of a->b inside the zone rectangle in plan, or None."""
    t0, t1 = 0.0, 1.0
    for axis, (lo, hi) in ((0, zone['x_m']), (2, zone['z_m'])):
        d = b[axis] - a[axis]
        if abs(d) < 1e-12:
            if a[axis] < lo or a[axis] > hi:
                return None
            continue
        ta, tb = (lo - a[axis]) / d, (hi - a[axis]) / d
        t0, t1 = max(t0, min(ta, tb)), min(t1, max(ta, tb))
    return (t0, t1) if t0 <= t1 else None


def tilt_down(a, b, deg):
    """b' : the line a->b rotated by deg toward -y in its own vertical plane, same length."""
    d = b - a
    L = np.linalg.norm(d)
    h = math.hypot(d[0], d[2])
    el = math.atan2(d[1], h) - math.radians(deg)
    return a + L * np.array([d[0] / h * math.cos(el), math.sin(el), d[2] / h * math.cos(el)])


def lowest_over_zone(a, b, zone, S, step, Stop):
    b, _ = stop_at_first_surface(a, b, Stop)
    iv = clip_xz(a, b, zone)
    if iv is None:
        return None
    t0, t1 = iv
    L = np.linalg.norm(b - a)
    n = max(2, int(math.ceil((t1 - t0) * L / step)) + 1)
    best = None
    down = np.array([0.0, -1.0, 0.0])
    for t in np.linspace(t0, t1, n):
        q = a + t * (b - a)
        h, name, cls, _ = S.cast(q, down, tmin=0.0)
        if h is None:
            continue
        if best is None or h < best['height_m']:
            best = {'height_m': h, 'at': [round(float(v), 3) for v in q], 'over': name}
    if best is None:
        # nothing under a sample = unmeasured: report the floor-only figure and FAIL it rather than skip it
        best = {'height_m': -1e9, 'at': [round(float(v), 3) for v in (a + t0 * (b - a))], 'over': 'nothing below'}
    best['in_zone_m'] = round(float((t1 - t0) * L), 3)
    best['analytic_floor_only_m'] = round(float(min(a[1] + t0 * (b[1] - a[1]), a[1] + t1 * (b[1] - a[1]))), 3)
    return best


def measure(rig, hall, step=0.05):
    zone = hall['dims']['zones']['dance']['used']
    S, H, Stop, shell_modelled = surfaces(hall, rig, zone)
    fan = {t['beam']: t.get('half_fan_deg', 0.0) for t in rig.get('lasers', {}).get('tubes', [])}
    out = []
    for f in rig['fixtures']:
        if 'laser' not in f or f.get('status') != 'used':
            continue
        for bm in f['laser']['beams']:
            if bm.get('off'):
                continue
            a, b = np.array(f['p'], float), np.array(bm['to'], float)
            nom = lowest_over_zone(a, b, zone, S, step, Stop)
            hf = float(fan.get(bm['id'], 0.0))
            tol = lowest_over_zone(a, tilt_down(a, b, hf), zone, S, step, Stop) if hf > 0 else nom
            d = b - a
            L = float(np.linalg.norm(d))
            hit = H.cast(a, d / L, tmin=0.0, tmax=L) if H.n_tris else (None,) * 4
            row = {'line': bm['id'], 'fixture': f['id'], 'type': f['type'], 'from': [float(v) for v in a],
                   'to': [float(v) for v in b], 'half_fan_deg': hf, 'crosses_zone': nom is not None,
                   'hanging_strike': None if hit[0] is None else {'solid': hit[1], 't_m': round(hit[0], 3)}}
            if nom is not None:
                row.update({'lowest_m': round(nom['height_m'], 3), 'lowest_at': nom['at'], 'over': nom['over'],
                            'in_zone_m': nom['in_zone_m'], 'analytic_floor_only_m': nom['analytic_floor_only_m'],
                            'margin_m': round(nom['height_m'] - SEPARATION_M, 3),
                            'lowest_tilted_m': round(tol['height_m'], 3) if tol else None,
                            'margin_tilted_m': round(tol['height_m'] - SEPARATION_M, 3) if tol else None,
                            'pass_3m': nom['height_m'] >= SEPARATION_M and (tol is None or tol['height_m'] >= SEPARATION_M),
                            'pass_hand_rule': nom['height_m'] >= HAND_RULE_M})
            out.append(row)
    crossing = [r for r in out if r['crosses_zone']]
    worst = min(crossing, key=lambda r: r['lowest_m']) if crossing else None
    worst_t = min(crossing, key=lambda r: r['lowest_tilted_m']) if crossing else None
    return {'shell_modelled': shell_modelled, 'validated': False, 'zone': zone, 'separation_m': SEPARATION_M, 'separation_source': SEPARATION, 'hand_rule_m': HAND_RULE_M,
            'lines': out,
            'summary': {'lines': len(out), 'crossing_zone': len(crossing),
                        'pass_3m': sum(1 for r in crossing if r['pass_3m']),
                        'worst': worst and {k: worst[k] for k in ('line', 'fixture', 'lowest_m', 'lowest_at', 'over', 'margin_m')},
                        'worst_tilted': worst_t and {k: worst_t[k] for k in ('line', 'fixture', 'lowest_tilted_m', 'margin_tilted_m', 'half_fan_deg')},
                        'hanging_strikes': sorted({r['line'] for r in out if r['hanging_strike']})}}


def table(R):
    L = ['| line | fixture | in zone m | lowest over floor m | at (x, y, z) | margin vs 3 m | tilted by half-fan: lowest / margin m | strike on hanging envelope |',
         '|---|---|---:|---:|---|---:|---:|---|']
    for r in R['lines']:
        if not r['crosses_zone']:
            L.append('| %s | %s | 0 | does not cross the zone | | | | %s |' % (r['line'], r['fixture'], (r['hanging_strike'] or {}).get('solid', '')))
            continue
        L.append('| %s | %s | %.1f | %.2f | %s | %+.2f | %.2f / %+.2f (%.3f deg) | %s |' % (
            r['line'], r['fixture'], r['in_zone_m'], r['lowest_m'], ', '.join('%.2f' % v for v in r['lowest_at']),
            r['margin_m'], r['lowest_tilted_m'], r['margin_tilted_m'], r['half_fan_deg'],
            (r['hanging_strike'] or {}).get('solid', '')))
    return '\n'.join(L)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--rig', required=True)
    ap.add_argument('--hall', required=True)
    ap.add_argument('--step', type=float, default=0.05)
    ap.add_argument('--json', action='store_true')
    a = ap.parse_args()
    R = measure(json.load(open(a.rig)), json.load(open(a.hall)), a.step)
    if a.json:
        print(json.dumps(R, indent=1))
        return
    print(table(R))
    s = R['summary']
    print('\nlines %d, crossing the dance zone %d, >= 3 m (nominal and tilted) %d' % (s['lines'], s['crossing_zone'], s['pass_3m']))
    print('worst nominal: %s' % json.dumps(s['worst']))
    print('worst tilted:  %s' % json.dumps(s['worst_tilted']))
    print('hanging-envelope strikes (flag, not measured): %s' % (', '.join(s['hanging_strikes']) or 'none'))


if __name__ == '__main__':
    main()
