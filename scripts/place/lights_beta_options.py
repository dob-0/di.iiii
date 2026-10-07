#!/usr/bin/env python3
# lights_beta_options.py — the LIGHTS step for MOXIR beta v0.9 (2026-10-07), as pictures for the owner's choice.
# Nothing is built: it reads committed records, aims each option's fixtures, checks them, and draws.
#
#   python3 -I scripts/place/lights_beta_options.py --repo . --out ~/Downloads/moxir/stage        # pictures + page
#   python3 -I scripts/place/lights_beta_options.py --repo . --check                              # the checks, JSON
#
# INPUTS (all in git):
#   rigs/moxir-beta-v0.9-lights-2026-10-07.json   every fixture and rig solid of the beta, read back from scratch v61
#   rigs/moxir-lights-beta-options-2026-10-07.json the options: what moves, what each group aims at, and why
#   rigs/moxir-hall-2026-10-07-v8-show-back21.hall.json   the hall (columns, roof, lanterns, cranes, massing)
#
# THE METHOD (established formulas; sources named, nothing measured on site):
#   - Aim: a spot's beam is local -Y turned by Euler XYZ (src/project/viewport/spotLightAim.js); the same here.
#   - Where a beam ends: a ray against the hall's floor, roof deck (open into the lanterns up to their top), end and
#     side walls, the columns, crane girders/trolley/cab, the massing boxes and the rig's own solids — the solids
#     scripts/rigbuild/footprints.mjs uses (slab method for boxes, oriented boxes for rotated rig parts).
#   - The audience view: a pinhole camera (the same look-at maths as ~/Downloads/moxir/moxir-lights.html and
#     scripts/place/stage_line_pictures.py), drawn with a painter's sort, no WebGL. A picture of intent, not a render:
#     beams are cones of the fixture's beam angle, haze is a fixed fall-off, no lux is drawn.
#   - Laser planning rules (NOT a safety assessment): the repo's rules (rig-lib.mjs LASER_MIN_HEIGHT_M, checkLaser,
#     the laser-beside-lantern rule of audit A-03): hung >= 3 m, never aimed downward, every point of the beam >= 3 m
#     over any floor a person can stand on (the riser counts at its deck height), ending on the SOLID roof deck (not a
#     lantern opening, which is glazed), and >= 0.3 m from any steel, chain or hoist on the way. The ocular hazard is
#     sized with IEC 60825-1 (2014) Table A.1's MPE for a visible CW beam at the 0.25 s aversion time,
#     H = 18 t^0.75 J/m^2, and the NOHD formula of the same standard's annex / ANSI Z136.1 (static beam: the
#     scanner-failure case IEC TR 60825-3 asks the show to plan for).
#   - Glare: is an audience eye (x +-5.35 m, z 25.8-48, 1.6 m high) inside a lamp's cone (half the beam angle) or its
#     field (the beam angle); the eye's illuminance E = I / d^2 with the type's borrowed on-axis intensity
#     (src/rigbuild/types/moxir.json optics, basis EQUIVALENT).
import argparse, base64, io, json, math, os, sys

import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('--repo', default='.')
ap.add_argument('--snapshot', default='scripts/place/rigs/moxir-beta-v0.9-lights-2026-10-07.json')
ap.add_argument('--options', default='scripts/place/rigs/moxir-lights-beta-options-2026-10-07.json')
ap.add_argument('--hall', default='scripts/place/rigs/moxir-hall-2026-10-07-v8-show-back21.hall.json')
ap.add_argument('--types', default='src/rigbuild/types/moxir.json')
ap.add_argument('--out', default=None)
ap.add_argument('--check', action='store_true', help='print the checks as JSON and draw nothing')
a = ap.parse_args()

R = lambda p: json.load(open(os.path.join(a.repo, p)))
SNAP, OPTS, HALL = R(a.snapshot), R(a.options), R(a.hall)
G = HALL['geometry']
CRANE = G['cranes'][0]
DECK_Y = G['deck_m']
LANTERN_TOP = G['lantern_top_m']
ENDS = (G['far_wall_z_m'], G['door']['z_m'])
WALLS = G['walls_x_m']
AUD = {'x': (-5.35, 5.35), 'z': (25.8, 48.0), 'eye': 1.6}          # hall zones.used, eye of a standing adult
FLOOR_X = (-G['column_inner_face_x_m'], G['column_inner_face_x_m'])
RISER = {'x': (-1.372, 1.628), 'z': (22.5, 24.5), 'y': 0.4}        # 3 StageDex decks, read from the snapshot
LASER_MIN = 3.0          # rig-lib.mjs LASER_MIN_HEIGHT_M
STEEL_CLEAR = 0.3        # the laser's clearance to steel, chain and hoists: a planning margin, CHOSEN
MOVER_EYE = 2.5          # ground-movers rule: no ground mover's beam through the dance zone below 2.5 m


# ------------------------------------------------------------------ fixture types (optics, borrowed figures)
def load_types():
    t = R(a.types)
    rows = t['types'] if isinstance(t, dict) and 'types' in t else t
    rows = rows if isinstance(rows, list) else list(rows.values())
    out = {}
    for r in rows:
        if r.get('code') in ('UP-PL5403', 'UP-B380F', 'EXT-LC-ULTRA-MK2'):
            out[r['code'].lower()] = r.get('optics') or {}
    return out


TYPES = load_types()
KIND = {'up-pl5403': 'par', 'up-b380f': 'beam', 'ext-lc-ultra-mk2': 'laser', 'ext-hazer': 'haze', 'up-yz31p': 'smoke'}
BEAM_DEG = {'par': TYPES['up-pl5403']['beam_deg'], 'beam': TYPES['up-b380f']['beam_deg'], 'laser': 0.0573}  # laser: 1 mrad
INTENSITY_CD = {'par': TYPES['up-pl5403']['lux'] * TYPES['up-pl5403']['at_m'] ** 2,
                'beam': TYPES['up-b380f']['lux'] * TYPES['up-b380f']['at_m'] ** 2}
REACH = {'par': 24.0, 'beam': 60.0, 'laser': 120.0}                # the room's light distance for a PAR (doc light.distance)

# LaserCube Ultra MK2 (LASEROS-MK2, maker's spec page + ULTRA MK2 Guide v1.2): 10 W optical, 4 mm, 1 mrad
LASER_W, LASER_A_M, LASER_PHI = 10.0, 0.004, 0.001
MPE_T = 0.25                                   # s, the aversion response time IEC 60825-1 uses for visible beams
MPE_H = 18 * MPE_T ** 0.75                     # J/m^2, IEC 60825-1:2014 Table A.1, 400-700 nm, C6 = 1 (small source)
MPE_E = MPE_H / MPE_T                          # W/m^2
NOHD_M = (math.sqrt(4 * LASER_W / (math.pi * MPE_E)) - LASER_A_M) / LASER_PHI


# ------------------------------------------------------------------ maths
def euler_xyz(r):
    x, y, z = r
    cx, sx, cy, sy, cz, sz = math.cos(x), math.sin(x), math.cos(y), math.sin(y), math.cos(z), math.sin(z)
    return np.array([[cy * cz, -cy * sz, sy],
                     [cx * sz + sx * cz * sy, cx * cz - sx * sz * sy, -sx * cy],
                     [sx * sz - cx * cz * sy, sx * cz + cx * sz * sy, cx * cy]])


def aim_dir(rot):
    d = euler_xyz(rot) @ np.array([0.0, -1.0, 0.0])
    return d / np.linalg.norm(d)


def rot_for_dir(d):
    """An Euler XYZ (x, 0, z) whose -Y points along d: the spelling the room stores (spotLightAim: yaw 0)."""
    d = np.asarray(d, float) / np.linalg.norm(d)
    # -Y turned by Rz(c) is (sin c, -cos c, 0); then Rx(a) gives (sin c, -cos c cos a, -cos c sin a)
    c = math.asin(max(-1, min(1, d[0])))
    cc = math.cos(c)
    if abs(cc) < 1e-9:
        return [0.0, 0.0, c]
    av = math.atan2(-d[2] / cc, -d[1] / cc)
    return [round(av, 6), 0.0, round(c, 6)]


def unit(v):
    v = np.asarray(v, float)
    return v / (np.linalg.norm(v) or 1)


class Box:
    """An oriented box. anchor 'base': p is the middle of its base (rig primitives); 'centre': p is its centre."""

    def __init__(self, id, p, size, rot=(0, 0, 0), anchor='centre', cls='solid'):
        self.id, self.cls = id, cls
        self.p, self.size = np.array(p, float), np.array(size, float)
        self.R = euler_xyz(rot)
        self.lo = np.array([-size[0] / 2, 0 if anchor == 'base' else -size[1] / 2, -size[2] / 2])
        self.hi = np.array([size[0] / 2, size[1] if anchor == 'base' else size[1] / 2, size[2] / 2])

    @staticmethod
    def aabb(id, x, y, z, cls='solid'):
        b = Box(id, [(x[0] + x[1]) / 2, y[0], (z[0] + z[1]) / 2], [x[1] - x[0], y[1] - y[0], z[1] - z[0]], anchor='base', cls=cls)
        return b

    def local(self, q):
        return (np.asarray(q, float) - self.p) @ self.R  # R^T (q - p)

    def ray(self, o, d, tmin=0.0):
        lo, ld = self.local(o), self.R.T @ d
        t0, t1 = -1e18, 1e18
        for i in range(3):
            if abs(ld[i]) < 1e-12:
                if lo[i] < self.lo[i] or lo[i] > self.hi[i]:
                    return None
                continue
            ta, tb = (self.lo[i] - lo[i]) / ld[i], (self.hi[i] - lo[i]) / ld[i]
            t0, t1 = max(t0, min(ta, tb)), min(t1, max(ta, tb))
        if t0 > t1 or t1 < tmin:
            return None
        return max(t0, tmin)

    def dist(self, q):
        lq = self.local(q)
        return float(np.linalg.norm(np.maximum(0, np.maximum(self.lo - lq, lq - self.hi))))

    def corners(self):
        out = []
        for x in (self.lo[0], self.hi[0]):
            for y in (self.lo[1], self.hi[1]):
                for z in (self.lo[2], self.hi[2]):
                    out.append(self.p + self.R @ np.array([x, y, z]))
        return np.array(out)


# ------------------------------------------------------------------ the hall's solids and the rig's
def crane_boxes():
    w = CRANE['girder_w_m'] / 2
    out = [Box.aabb('crane girder z %.2f' % (CRANE['z_m'] + dz), (-G['crane_rail_x_m'], G['crane_rail_x_m']),
                    (CRANE['girder_bottom_m'], CRANE['girder_top_m']), (CRANE['z_m'] + dz - w, CRANE['z_m'] + dz + w), 'crane')
           for dz in CRANE['girders_dz_m']]
    for k in ('trolley', 'cab'):
        q = CRANE[k]
        out.append(Box.aabb('crane ' + k, q['x_m'], q['y_m'], (CRANE['z_m'] + q['dz_m'][0], CRANE['z_m'] + q['dz_m'][1]), 'crane'))
    return out


def column_boxes():
    depth = 2 * (G['column_row_x_m'][1] - G['column_inner_face_x_m'])
    top = G['column_head']['head_top_m']
    out = []
    for rx in G['rows_x_m']:
        for z in sorted(set(G['column_grid_z_m'])):
            out.append(Box.aabb('column x %g z %g' % (rx, z), (rx - depth / 2, rx + depth / 2), (0, top), (z - 0.25, z + 0.25), 'column'))
    return out


def massing_boxes():
    return [Box.aabb(m['id'], m['x_m'], m['y_m'], m['z_m'], 'machine') for m in G['massing']]


def truss_box():
    pieces = sorted([s for s in SNAP['solids'] if s['id'].startswith('rig-line-')], key=lambda s: s['p'][0])
    ang = pieces[0]['r'][2]
    d = np.array([math.cos(ang), math.sin(ang), 0])
    a_ = np.array(pieces[0]['p']) - 1.5 * d
    b_ = np.array(pieces[-1]['p']) + 1.5 * d
    c = (a_ + b_) / 2
    return Box('truss', c, [float(np.linalg.norm(b_ - a_)), 0.29, 0.29], (0, 0, ang), 'centre', 'truss'), a_, b_


TRUSS, TRUSS_A, TRUSS_B = truss_box()


def rig_boxes():
    out = []
    for s in SNAP['solids']:
        if s['id'].startswith('rig-line-'):
            continue
        if s['kind'] == 'deck-2x1':
            out.append(Box(s['id'], s['p'], [2.0, s['s'][1], 1.0], s['r'], 'base', 'riser'))
            continue
        cls = 'rigging' if ('hoist' in s['id'] or 'tieoff' in s['id']) else 'stage'
        out.append(Box(s['id'], s['p'], s['s'], s['r'], 'base', cls))
    return out


DJ = Box.aabb('the DJ', (0.128 - 0.9, 0.128 + 0.9), (0.4, 2.4), (22.6, 24.29), 'dj')     # rig-lib performerBox
SOLIDS = crane_boxes() + column_boxes() + massing_boxes() + rig_boxes() + [TRUSS]


def in_lantern(x, z):
    return any(l['x_m'][0] <= x <= l['x_m'][1] and l['z_m'][0] <= z <= l['z_m'][1] for l in G['lanterns'])


def shell_hit(o, d):
    """The building skin: floor, roof deck (lantern openings up to the lantern's top), end walls, side walls."""
    best = (1e9, 'open air')
    if d[1] < -1e-9:
        best = min(best, (-o[1] / d[1], 'floor'))
    if d[1] > 1e-9:
        t = (DECK_Y - o[1]) / d[1]
        q = o + t * d
        if in_lantern(q[0], q[2]):
            t2 = (LANTERN_TOP - o[1]) / d[1]
            best = min(best, (t2, 'lantern opening (glazed)'))
        else:
            best = min(best, (t, 'roof deck (solid)'))
    for zw in ENDS:
        if abs(d[2]) > 1e-9:
            t = (zw - o[2]) / d[2]
            if t > 0:
                best = min(best, (t, 'end wall'))
    for xw in WALLS:
        if abs(d[0]) > 1e-9:
            t = (xw - o[0]) / d[0]
            if t > 0:
                best = min(best, (t, 'side wall'))
    return best


def beam_end(o, d, reach, skip=()):
    """(t, what, cls) of the first thing the beam axis meets within reach."""
    t, what = shell_hit(o, d)
    cls = 'shell'
    for b in SOLIDS + [DJ]:
        if b.id in skip:
            continue
        h = b.ray(o, d, 0.35)
        if h is not None and h < t:
            t, what, cls = h, b.id, b.cls
    if t > reach:
        return reach, 'open air (within the reach)', 'air'
    return t, what, cls


# ------------------------------------------------------------------ the fixtures, today and per option
def today():
    out = []
    for f in SNAP['fixtures']:
        k = KIND.get(f['type'], 'fx')
        out.append({'id': f['id'], 'type': f['type'], 'kind': k, 'pos': f['position'], 'p': np.array(f['p'], float),
                    'p0': np.array(f['p'], float), 'r': list(f['r']), 'd': aim_dir(f['r']) if k in ('par', 'beam', 'laser') else None,
                    'd0': aim_dir(f['r']) if k in ('par', 'beam', 'laser') else None,
                    'colour': f.get('colour') or '#ffffff', 'group': group_of(f['id'])})
    return out


def group_of(fid):
    base = fid.rsplit('-', 1)[0]
    return base[4:] if base.startswith('rig-') else base


def apply_option(opt):
    fx = today()
    by = {f['id']: f for f in fx}
    for g in opt['groups']:
        lamps = sorted([f for f in fx if f['id'].startswith(g['match'])], key=lambda f: f['id'])
        if not lamps:
            raise SystemExit('option %s: no fixture matches %s' % (opt['id'], g['match']))
        n = len(lamps)
        if 'positions' in g:
            if len(g['positions']) != n:
                raise SystemExit('option %s: %s has %d lamps, %d positions' % (opt['id'], g['match'], n, len(g['positions'])))
            for f, p in zip(lamps, g['positions']):
                f['p'] = np.array(p, float)
        aim = g.get('aim', {'rule': 'keep'})
        for i, f in enumerate(lamps):
            f['d'] = resolve_aim(aim, f, i, n)
            f['r'] = rot_for_dir(f['d']) if f['d'] is not None else f['r']
            if g.get('colour'):
                f['colour'] = g['colour']
            f['moved'] = bool(np.linalg.norm(f['p'] - f['p0']) > 0.01)
            f['reaimed'] = bool(f['d'] is not None and math.degrees(math.acos(max(-1.0, min(1.0, float(f['d'] @ f['d0']))))) > 1.0)
            f['note'] = g.get('why', '')
    return fx


def resolve_aim(aim, f, i, n):
    r = aim['rule']
    p = f['p']
    if r == 'keep':
        return f['d']
    if r == 'down':
        return np.array([0, -1.0, 0])
    if r == 'up':
        return np.array([0, 1.0, 0])
    if r == 'point':
        return unit(np.array(aim['target']) - p)
    if r == 'targets':
        return unit(np.array(aim['targets'][i]) - p)
    if r in ('fan', 'parallel'):
        k = 0 if n <= 1 else i / (n - 1) - 0.5
        side = aim.get('side_deg', 0) + (k * aim.get('spread_deg', 0) if r == 'fan' else 0)
        up = 1.0 if aim.get('up', True) else -1.0
        return unit([math.tan(math.radians(side)), up, math.tan(math.radians(aim.get('fwd_deg', 0)))])
    if r == 'cross':
        s = 1 if p[0] > 0 else -1
        return unit(np.array([-s * aim['x'], aim['y'], p[2] + aim.get('dz', 0)]) - p)
    raise SystemExit('unknown aim rule %s' % r)


# ------------------------------------------------------------------ checks
def laser_check(f):
    o, d = f['p'], f['d']
    t, what, cls = beam_end(o, d, REACH['laser'], skip=('truss',))
    out = {'id': f['id'], 'from': [round(v, 2) for v in o], 'to': [round(v, 2) for v in o + t * d], 'ends_on': what, 'path_m': round(t, 1)}
    errs = []
    if o[1] < LASER_MIN:
        errs.append('hung under %.0f m' % LASER_MIN)
    if d[1] < 0:
        errs.append('aimed downward')
    ts = np.arange(0.0, t, 0.05)
    pts = o[None, :] + ts[:, None] * d[None, :]
    inside = (pts[:, 0] > WALLS[0]) & (pts[:, 0] < WALLS[1]) & (pts[:, 2] > ENDS[0]) & (pts[:, 2] < ENDS[1])
    floor = np.where((pts[:, 0] >= RISER['x'][0]) & (pts[:, 0] <= RISER['x'][1]) & (pts[:, 2] >= RISER['z'][0]) & (pts[:, 2] <= RISER['z'][1]), RISER['y'], 0.0)
    clear = (pts[:, 1] - floor)[inside]
    out['min_over_floor_m'] = round(float(clear.min()), 2)
    aud = (pts[:, 0] >= FLOOR_X[0]) & (pts[:, 0] <= FLOOR_X[1]) & (pts[:, 2] >= AUD['z'][0]) & (pts[:, 2] <= ENDS[1])
    out['min_over_audience_m'] = round(float(pts[aud, 1].min()), 2) if aud.any() else None
    out['crosses_audience'] = bool(aud.any())
    if out['min_over_floor_m'] < LASER_MIN:
        errs.append('%.2f m over a floor people stand on (< %.0f m)' % (out['min_over_floor_m'], LASER_MIN))
    if what != 'roof deck (solid)':
        errs.append('ends on %s, not the solid roof deck' % what)
    near = (None, 1e9)
    for b in SOLIDS + [DJ]:
        if b.cls not in ('crane', 'rigging', 'truss', 'column', 'dj'):
            continue
        sel = ts > 0.6 if b.id == 'truss' else ts >= 0
        if not sel.any():
            continue
        dd = min(b.dist(q) for q in pts[sel][::2])
        if dd < near[1]:
            near = (b.id, dd)
    out['nearest_steel'] = {'what': near[0], 'm': round(near[1], 2)}
    if near[1] < STEEL_CLEAR:
        errs.append('%.2f m from %s (< %.1f m)' % (near[1], near[0], STEEL_CLEAR))
    out['errors'] = errs
    out['pass'] = not errs
    return out


def eye_points():
    xs = np.arange(AUD['x'][0], AUD['x'][1] + 1e-6, 0.5)
    zs = np.arange(AUD['z'][0], AUD['z'][1] + 1e-6, 1.0)
    return np.array([[x, AUD['eye'], z] for x in xs for z in zs])


EYES = eye_points()


def glare(f):
    """Eyes in the cone (half the beam angle) and in the field (the full beam angle); the brightest eye in the cone."""
    if f['kind'] not in ('par', 'beam'):
        return None
    v = EYES - f['p'][None, :]
    dist = np.linalg.norm(v, axis=1)
    cosang = (v @ f['d']) / dist
    ang = np.degrees(np.arccos(np.clip(cosang, -1, 1)))
    half = BEAM_DEG[f['kind']] / 2
    cone, field = ang <= half, ang <= 2 * half
    # an eye behind a solid (the riser, the table, the DJ, PA) is shaded: test the line of sight
    def lit(q):
        dd = unit(q - f['p'])
        L = float(np.linalg.norm(q - f['p']))
        for b in SOLIDS + [DJ]:
            if b.cls in ('column',):
                continue
            h = b.ray(f['p'], dd, 0.35)
            if h is not None and h < L - 0.05:
                return False
        return True
    idx = [i for i in np.where(field)[0] if lit(EYES[i])]
    in_cone = [i for i in idx if cone[i]]
    lux = max((INTENSITY_CD[f['kind']] / dist[i] ** 2 for i in in_cone), default=0.0)
    return {'eyes_in_cone': len(in_cone), 'eyes_in_field': len(idx), 'max_eye_lux': round(lux, 1)}


def mover_eye_zone(f):
    """Ground movers: does the beam pass through the dance zone under 2.5 m (moxir-ground-movers rule)?"""
    t, _, _ = beam_end(f['p'], f['d'], REACH['beam'])
    ts = np.arange(0.3, t, 0.1)
    pts = f['p'][None, :] + ts[:, None] * f['d'][None, :]
    hit = (pts[:, 0] >= AUD['x'][0]) & (pts[:, 0] <= AUD['x'][1]) & (pts[:, 2] >= AUD['z'][0]) & (pts[:, 2] <= AUD['z'][1]) & (pts[:, 1] < MOVER_EYE)
    return bool(hit.any())


def check_option(opt_id, fx):
    res = {'id': opt_id, 'counts': {}, 'lasers': [], 'glare': {}, 'dj_narrow': [], 'mover_eye_zone': [], 'beam_ends': {}, 'moves': []}
    for f in fx:
        res['counts'][f['type']] = res['counts'].get(f['type'], 0) + 1
        if f.get('moved'):
            res['moves'].append({'id': f['id'], 'from': [round(v, 2) for v in f['p0']], 'to': [round(v, 2) for v in f['p']]})
        if f['kind'] == 'laser':
            res['lasers'].append(laser_check(f))
        if f['kind'] in ('par', 'beam'):
            t, what, cls = beam_end(f['p'], f['d'], REACH[f['kind']], skip=('truss',) if f['p'][1] > 3 else ())
            res['beam_ends'][f['id']] = {'ends_on': what, 'at': [round(v, 2) for v in f['p'] + t * f['d']], 'm': round(t, 1)}
            g = glare(f)
            if g and g['eyes_in_field']:
                res['glare'][f['id']] = g
            if f['kind'] == 'beam' and mover_eye_zone(f):
                res['mover_eye_zone'].append(f['id'])
        if f['kind'] in ('beam', 'laser'):
            t, _, _ = beam_end(f['p'], f['d'], REACH[f['kind']], skip=('truss', 'the DJ'))
            if DJ.ray(f['p'], f['d'], 0.3) is not None and DJ.ray(f['p'], f['d'], 0.3) < t:
                res['dj_narrow'].append(f['id'])
    L = res['lasers']
    res['laser_pass'] = all(l['pass'] for l in L)
    over = [l['min_over_audience_m'] for l in L if l['min_over_audience_m'] is not None]
    res['laser_min_over_audience_m'] = min(over) if over else None
    res['laser_min_over_floor_m'] = min(l['min_over_floor_m'] for l in L)
    res['laser_min_steel_m'] = min(l['nearest_steel']['m'] for l in L)
    truss_glare = {k: v for k, v in res['glare'].items() if k.startswith('rig-par-cut')}
    res['truss_pars_glaring'] = sorted(truss_glare)
    res['max_eye_lux_truss'] = max((v['max_eye_lux'] for v in truss_glare.values()), default=0.0)
    res['beams_into_eyes'] = sorted(k for k, v in res['glare'].items() if k.startswith('rig-beam380'))
    return res


def laser_verdict(res):
    L = res['lasers']
    if res['laser_pass']:
        aud = res['laser_min_over_audience_m']
        where = ('never over the audience' if aud is None else 'lowest %.1f m over the audience floor' % aud)
        return ('PASS (planning rules): all 6 beams rise, %s, >= %.1f m over any floor, end on the solid roof deck, '
                '>= %.2f m from steel. Not a safety assessment: Class 4, static-beam NOHD %.0f m (IEC 60825-1 MPE %.1f W/m2) '
                '- a laser safety officer signs before any emission.' % (where, res['laser_min_over_floor_m'], res['laser_min_steel_m'], NOHD_M, MPE_E))
    bad = [l for l in L if not l['pass']]
    parts = []
    for e in sorted({e.split(' (')[0] if 'from' in e else e for l in bad for e in l['errors']}):
        who = [l['id'].replace('rig-lasercube-cut-0', 'cube ') for l in bad if any((x.split(' (')[0] if 'from' in x else x) == e for x in l['errors'])]
        parts.append('%s: %s' % (', '.join(who) if len(who) < len(L) else 'all 6', e))
    return 'FAIL (%d of %d beams). %s.' % (len(bad), len(L), '; '.join(parts))


# ------------------------------------------------------------------ the floor fixtures left in place
MASSING_IDS = {m['id'] for m in G['massing']}
FLOOR_EYE = np.array([0.0, AUD['eye'], 38.0])      # centre of the dance floor, a standing eye


def machine_at(p):
    return next((m['id'] for m in G['massing'] if m['x_m'][0] <= p[0] <= m['x_m'][1] and m['y_m'][0] <= p[1] <= m['y_m'][1] and m['z_m'][0] <= p[2] <= m['z_m'][1]), None)


def visible(q, skip=None, eye=FLOOR_EYE):
    """True if the point is seen from the floor eye; else the id of the first solid in the way."""
    d = q - eye
    L = float(np.linalg.norm(d))
    d = d / L
    for b in SOLIDS + [DJ]:
        if b.id == skip:
            continue
        h = b.ray(eye, d, 0.0)
        if h is not None and h < L - 0.15:
            return b.id
    return True


def floor_report(fx):
    """Each floor group of today's rig: where its beam ends now, and whether that still serves the new stage."""
    rows = []
    groups = {}
    for f in fx:
        if f['id'].startswith(('rig-par-cut', 'rig-lasercube-cut')):
            continue
        groups.setdefault(f['group'], []).append(f)
    for gname, lamps in groups.items():
        ends = []
        for f in lamps:
            if f['d'] is None:
                ends.append(None)
                continue
            t, what, _ = beam_end(f['p'], f['d'], REACH[f['kind']])
            ends.append((what, f['p'] + t * f['d']))
        zs = [f['p'][2] for f in lamps]
        inside = [f['id'] for f in lamps if machine_at(f['p'])]
        outside = [f['id'] for f in lamps if not (ENDS[0] < f['p'][2] < ENDS[1])]
        blocked = [f['id'] for f, e in zip(lamps, ends) if e and e[0] in MASSING_IDS and np.linalg.norm(e[1] - f['p']) < 3.5 and f['id'] not in inside]
        seen = [visible(e[1], skip=e[0]) for e in ends if e]
        rows.append({'group': gname, 'n': len(lamps), 'type': lamps[0]['type'], 'z_m': [round(min(zs), 1), round(max(zs), 1)],
                     'x_m': sorted({round(f['p'][0], 2) for f in lamps}),
                     'ends_on': sorted({e[0] for e in ends if e}), 'behind_dj_m': round(22.5 - max(zs), 1),
                     'inside_a_machine': inside, 'outside_the_hall': outside, 'blocked_within_3_5_m': blocked,
                     'lit_point_seen_from_floor': '%d of %d' % (sum(1 for v in seen if v is True), len(seen)) if seen else None,
                     'hidden_by': sorted({v for v in seen if isinstance(v, str)})})
    return rows


# ------------------------------------------------------------------ drawing (matplotlib, no WebGL)
COL = {'bg': '#07090c', 'fg': '#e3e6ea', 'dim': '#8f969e', 'grid': '#1e242b', 'roof': '#262d35', 'col': '#323941',
       'steel': '#c9a200', 'cab': '#d8661a', 'press': '#6a5747', 'machine': '#2f2b27', 'riser': '#454b53', 'truss': '#e8ebee',
       'rig': '#8a929b', 'table': '#1b1f24', 'dj': '#000000', 'djEdge': '#d0d4d9', 'pa': '#16191d', 'barrier': '#2c3138',
       'crowd': '#020304', 'crowdEdge': '#14181d', 'aud': '#2f6bff', 'laserLine': '#ff5a4f', 'ghost': '#5d6670'}
CAM = {'eye': np.array([0.0, 1.6, 38.0]), 'look': np.array([0.0, 5.0, 21.0]), 'vfov': 62.0, 'W': 1600, 'H': 900}


def rgba(hexc, alpha=1.0, k=1.0):
    h = hexc.lstrip('#')
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return (min(1, r * k), min(1, g * k), min(1, b * k), alpha)


class Camera:
    def __init__(self, eye, look, vfov, W, H):
        self.E, self.W, self.H = eye, W, H
        self.f = unit(look - eye)
        self.r = unit(np.cross(self.f, [0, 1, 0]))
        self.u = np.cross(self.r, self.f)
        self.F = (H / 2) / math.tan(math.radians(vfov) / 2)

    def cam(self, P):
        v = np.asarray(P, float) - self.E
        return np.array([v @ self.r, v @ self.u, v @ self.f]) if v.ndim == 1 else np.stack([v @ self.r, v @ self.u, v @ self.f], -1)

    def scr(self, c):
        return np.array([self.W / 2 + c[..., 0] / c[..., 2] * self.F, self.H / 2 - c[..., 1] / c[..., 2] * self.F]).T


NEAR = 0.3


def clip_near(cs):
    """Sutherland-Hodgman against the near plane, on camera-space points."""
    out = []
    n = len(cs)
    for i in range(n):
        a_, b_ = cs[i], cs[(i + 1) % n]
        ina, inb = a_[2] >= NEAR, b_[2] >= NEAR
        if ina:
            out.append(a_)
        if ina != inb:
            t = (NEAR - a_[2]) / (b_[2] - a_[2])
            out.append(a_ + (b_ - a_) * t)
    return np.array(out)


FACES = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
FACE_SHADE = [0.78, 0.78, 0.55, 1.15, 0.9, 0.9]   # x-, x+, bottom, top, z-, z+


def box_pieces(b, maxlen=3.0):
    """Corner sets of the box cut into pieces no longer than maxlen along each local axis (painter's sort)."""
    ranges = []
    for i in range(3):
        L = b.hi[i] - b.lo[i]
        n = max(1, int(math.ceil(L / maxlen)))
        ranges.append([(b.lo[i] + L * k / n, b.lo[i] + L * (k + 1) / n) for k in range(n)])
    out = []
    for xr in ranges[0]:
        for yr in ranges[1]:
            for zr in ranges[2]:
                cs = [b.p + b.R @ np.array([x, y, z]) for x in xr for y in yr for z in zr]
                out.append(np.array(cs))
    return out


def add_box(items, cam, b, fill, edge=None, alpha=1.0, lw=0.4, maxlen=3.0, bias=0.0):
    for cs in box_pieces(b, maxlen):
        centre = cs.mean(0)
        for fi, face in enumerate(FACES):
            q = cs[list(face)]
            c = q.mean(0)
            n = c - centre
            if n @ (c - cam.E) >= 0:
                continue
            cc = clip_near(cam.cam(q))
            if len(cc) < 3:
                continue
            items.append((float(np.linalg.norm(c - cam.E)) + bias, cam.scr(cc), rgba(fill, alpha, FACE_SHADE[fi]),
                          rgba(edge, min(1, alpha + 0.2)) if edge else rgba(fill, alpha, FACE_SHADE[fi]), lw))


def add_seg(items, cam, a_, b_, colour, alpha, width_px, depth=None):
    ca, cb = cam.cam(a_), cam.cam(b_)
    if ca[2] < NEAR and cb[2] < NEAR:
        return
    if ca[2] < NEAR or cb[2] < NEAR:
        t = (NEAR - ca[2]) / (cb[2] - ca[2])
        q = ca + (cb - ca) * t
        ca, cb = (q, cb) if ca[2] < NEAR else (ca, q)
    sa, sb = cam.scr(ca), cam.scr(cb)
    d = sb - sa
    L = np.hypot(*d) or 1
    n = np.array([-d[1], d[0]]) / L * width_px / 2
    poly = np.array([sa + n, sb + n, sb - n, sa - n])
    dep = depth if depth is not None else float((np.linalg.norm(a_ - cam.E) + np.linalg.norm(b_ - cam.E)) / 2)
    items.append((dep, poly, rgba(colour, alpha), (0, 0, 0, 0), 0))


def beam_layers(kind):
    # (radius factor, alpha at the lens, fall-off length m, min half-width px)
    if kind == 'par':
        return [(1.0, 0.11, 11.0, 1.2), (0.45, 0.2, 9.0, 0.9)]
    if kind == 'beam':
        return [(2.2, 0.05, 30.0, 1.6), (1.0, 0.6, 40.0, 0.8)]
    return [(5.0, 0.12, 80.0, 1.8), (1.0, 0.9, 200.0, 0.55)]


def add_beam(items, cam, f, lit=True):
    if f['d'] is None or not lit:
        return
    k = f['kind']
    t, _, _ = beam_end(f['p'], f['d'], REACH[k], skip=('truss',) if f['p'][1] > 3 else ())
    half = math.radians(BEAM_DEG[k] / 2)
    ap = {'par': 0.1, 'beam': 0.07, 'laser': 0.004}[k]
    step = 0.5 if k == 'par' else 1.0
    ss = np.append(np.arange(0.0, t, step), t)
    for fac, a0, fall, minpx in beam_layers(k):
        for s0, s1 in zip(ss[:-1], ss[1:]):
            p0, p1 = f['p'] + s0 * f['d'], f['p'] + s1 * f['d']
            pts, cs = [], []
            for s, p in ((s0, p0), (s1, p1)):
                r = (ap + s * math.tan(half)) * fac
                c = cam.cam(p)
                if c[2] < NEAR:
                    break
                rpx = max(r * cam.F / c[2], minpx)
                pts.append((cam.scr(c), rpx))
            if len(pts) < 2:
                continue
            (sa, ra), (sb, rb) = pts
            d = sb - sa
            L = np.hypot(*d)
            if L < 1e-6:
                n = np.array([1.0, 0.0])
            else:
                n = np.array([-d[1], d[0]]) / L
            poly = np.array([sa + n * ra, sb + n * rb, sb - n * rb, sa - n * ra])
            alpha = a0 * math.exp(-(s0 + s1) / 2 / fall)
            dep = float(np.linalg.norm((p0 + p1) / 2 - cam.E))
            items.append((dep, poly, rgba(f['colour'], alpha), (0, 0, 0, 0), 0))
    # the lens: a bright dot
    c = cam.cam(f['p'])
    if c[2] > NEAR:
        sp = cam.scr(c)
        r = max(0.09 * cam.F / c[2], 1.6)
        ang = np.linspace(0, 2 * np.pi, 10)
        items.append((float(np.linalg.norm(f['p'] - cam.E)) - 0.2, np.stack([sp[0] + r * np.cos(ang), sp[1] + r * np.sin(ang)], 1), rgba(f['colour'], 0.95), (0, 0, 0, 0), 0))


def crowd_boxes():
    rng = np.random.default_rng(7)
    out = []
    for z in (26.3, 27.5, 28.7, 29.9):
        for _ in range(4):
            x = rng.uniform(-5.0, 5.0)
            if abs(x) < 1.7:
                x = math.copysign(1.7 + rng.uniform(0, 1.0), x if x else 1)
            h = rng.uniform(1.55, 1.8)
            out.append(Box.aabb('person', (x - 0.2, x + 0.2), (0, h - 0.25), (z, z + 0.26), 'crowd'))
            out.append(Box.aabb('head', (x - 0.09, x + 0.09), (h - 0.24, h), (z + 0.04, z + 0.22), 'crowd'))
    return out


CROWD = crowd_boxes()


def view(ax, fx, opt_id):
    cam = Camera(CAM['eye'], CAM['look'], CAM['vfov'], CAM['W'], CAM['H'])
    W, H = CAM['W'], CAM['H']
    ax.set_xlim(0, W)
    ax.set_ylim(H, 0)
    ax.set_facecolor(COL['bg'])
    ax.set_xticks([])
    ax.set_yticks([])
    for s in ax.spines.values():
        s.set_color('#2a2e33')
    items = []
    # the hall: floor and roof grid, lantern, end wall (lines, sorted with everything else)
    zfar, znear = ENDS[0], CAM['eye'][2] - 0.5
    for z in np.arange(-54, 38, 6.0):
        add_seg(items, cam, np.array([-12, 0, z]), np.array([12, 0, z]), COL['grid'], 1, 1.0)
        add_seg(items, cam, np.array([-12, DECK_Y, z]), np.array([-6, DECK_Y, z]), COL['roof'], 1, 1.0)
        add_seg(items, cam, np.array([6, DECK_Y, z]), np.array([12, DECK_Y, z]), COL['roof'], 1, 1.0)
        add_seg(items, cam, np.array([-12, G['truss_bottom_m'], z]), np.array([12, G['truss_bottom_m'], z]), COL['roof'], 0.6, 0.8)
    for x in np.arange(-12, 12.01, 3.0):
        add_seg(items, cam, np.array([x, 0, zfar]), np.array([x, 0, znear]), COL['grid'], 1, 1.0)
    for l in G['lanterns']:
        x0, x1 = l['x_m']
        if x0 > 12 or x1 < -12:
            continue
        z0, z1 = max(l['z_m'][0], zfar), min(l['z_m'][1], znear)
        for x in (x0, x1):
            add_seg(items, cam, np.array([x, DECK_Y, z0]), np.array([x, DECK_Y, z1]), COL['roof'], 1, 1.2)
            add_seg(items, cam, np.array([x, LANTERN_TOP, z0]), np.array([x, LANTERN_TOP, z1]), COL['roof'], 0.7, 1.0)
    for x in (-12, 12):
        add_seg(items, cam, np.array([x, DECK_Y, zfar]), np.array([x, DECK_Y, znear]), COL['roof'], 1, 1.2)
    # the 3 m laser floor over the audience (no laser beam may come lower)
    for x in (AUD['x'][0], AUD['x'][1]):
        add_seg(items, cam, np.array([x, LASER_MIN, AUD['z'][0]]), np.array([x, LASER_MIN, 31.0]), COL['laserLine'], 0.55, 1.4)
    add_seg(items, cam, np.array([AUD['x'][0], LASER_MIN, AUD['z'][0]]), np.array([AUD['x'][1], LASER_MIN, AUD['z'][0]]), COL['laserLine'], 0.55, 1.4)
    # solids
    for b in column_boxes():
        if abs(b.p[0]) < 13 and b.p[2] < 36.5:
            add_box(items, cam, b, COL['col'], '#4c545e', 0.95, maxlen=2.5)
    for x in (-G['crane_rail_x_m'], G['crane_rail_x_m']):
        add_box(items, cam, Box.aabb('runway', (x - 0.3, x + 0.3), (G['runway_bottom_m'], G['runway_top_m']), (zfar, 36.0)), COL['col'], '#4c545e', 0.9)
    for m in massing_boxes():
        add_box(items, cam, m, COL['press'] if m.id.startswith('press') and 'side' not in m.id and 'pedestal' not in m.id else COL['machine'], '#5a5249', 0.95)
    for b in crane_boxes():
        add_box(items, cam, b, COL['cab'] if 'cab' in b.id else COL['steel'], '#6e5800', 0.95, maxlen=2.0)
    for b in rig_boxes():
        if b.cls == 'riser':
            add_box(items, cam, b, COL['riser'], '#5d646d')
        elif b.cls == 'rigging':
            add_box(items, cam, b, COL['rig'], None, 0.9, lw=0)
        elif 'pa-' in b.id:
            add_box(items, cam, b, COL['pa'], '#3a4048')
        elif 'barrier' in b.id:
            add_box(items, cam, b, COL['barrier'], None, 0.85)
        elif 'table' in b.id:
            add_box(items, cam, b, COL['table'], '#3a4048')
        else:
            add_box(items, cam, b, COL['rig'], None)
    add_box(items, cam, TRUSS, COL['truss'], '#9aa1a8', 1, maxlen=1.0)
    add_box(items, cam, Box.aabb('dj body', (-0.12, 0.38), (0.4, 1.95), (22.95, 23.25)), COL['dj'], COL['djEdge'], 1, lw=0.8, bias=-0.3)
    add_box(items, cam, Box.aabb('dj head', (0.03, 0.23), (1.95, 2.2), (23.0, 23.2)), COL['dj'], COL['djEdge'], 1, lw=0.8, bias=-0.3)
    for b in CROWD:
        add_box(items, cam, b, COL['crowd'], COL['crowdEdge'], 1, lw=0.6)
    for f in fx:
        if f['kind'] in ('par', 'beam', 'laser'):
            s = 0.13 if f['kind'] != 'beam' else 0.2
            add_box(items, cam, Box('fx', f['p'] - [0, s, 0], [2 * s] * 3, anchor='base'), '#30353c', None, 1, lw=0)
            add_beam(items, cam, f)
    items.sort(key=lambda it: -it[0])
    from matplotlib.collections import PolyCollection
    pc = PolyCollection([it[1] for it in items], facecolors=[it[2] for it in items], edgecolors=[it[3] for it in items],
                        linewidths=[it[4] for it in items], antialiaseds=True)
    ax.add_collection(pc)
    # labels
    def lab(P, text, dx=0, dy=0, ha='center', c=None):
        cc = cam.cam(np.array(P, float))
        if cc[2] < NEAR:
            return
        sx, sy = cam.scr(cc)
        ax.text(sx + dx, sy + dy, text, color=c or COL['dim'], fontsize=8.5, ha=ha, va='center', family='DejaVu Sans Mono')
    lab([0.13, 2.45, 23.1], 'DJ', 0, -12, c=COL['fg'])
    lab([-5.4, 2.1, 24.3], 'PA L')
    lab([5.4, 2.1, 24.3], 'PA R')
    lab([-7.0, 3.0, 21.0], 'the cut, LOW 3.24 m', -6, 6, 'right')
    lab([4.6, 6.8, 21.0], 'HIGH 6.35 m', 8, 0, 'left')
    lab([-10.6, 8.35, 22.1], 'crane bridge z 21', 0, -14)
    lab([9.4, 5.6, 22.0], 'cab', 0, 10)
    lab([-5.3, 3.0, 26.0], '3 m: no laser under it', -4, -8, 'right', '#ff8a80')


def plan(ax, fx, opt):
    ax.set_facecolor(COL['bg'])
    ax.set_xlim(-14, 14)
    ax.set_ylim(52, -4)
    ax.set_aspect('equal')
    ax.tick_params(colors=COL['dim'], labelsize=7)
    for s in ax.spines.values():
        s.set_color('#2a2e33')
    from matplotlib.patches import Rectangle, Circle
    R_ = lambda x, z, c, a=1, fill=True, ls='-', lw=0.8, zo=1: ax.add_patch(Rectangle((x[0], z[0]), x[1] - x[0], z[1] - z[0], fc=c if fill else 'none', ec=c, alpha=a, ls=ls, lw=lw, zorder=zo))
    R_(AUD['x'], AUD['z'], COL['aud'], 0.12, zo=0)
    ax.text(0, 46.5, 'dance floor', color='#7f9cff', fontsize=8, ha='center')
    for l in G['lanterns']:
        if l['x_m'][0] < 12 and l['z_m'][1] > -4:
            R_(l['x_m'], (max(l['z_m'][0], -4), min(l['z_m'][1], 52)), '#4a5562', 1, fill=False, ls='--', lw=0.7)
    ax.text(5.8, 8.0, 'lantern 1\n(glazed)', color='#6b7785', fontsize=6.5, ha='right')
    for rx in (-12, 12):
        for z in G['column_grid_z_m']:
            if -4 <= z <= 52:
                R_((rx - 0.4, rx + 0.4), (z - 0.25, z + 0.25), '#4a525c', zo=2)
    for m in G['massing']:
        if m['z_m'][1] < -4:
            continue
        R_(m['x_m'], m['z_m'], '#5b5148', 0.55, zo=1)
    for lbl, x, z in [('press', 1.65, 1.7), ('blower', 6.9, 19.5), ('conveyor', 4.1, 17.0), ('drum tank', 9.5, 25.0), ('pipe racks', 11.0, 34.0)]:
        ax.text(x, z, lbl, color='#9b8f80', fontsize=6, ha='center', va='center', rotation=90 if lbl in ('conveyor', 'pipe racks') else 0, zorder=3)
    for b in crane_boxes():
        c = b.corners()
        R_((c[:, 0].min(), c[:, 0].max()), (c[:, 2].min(), c[:, 2].max()), COL['cab'] if 'cab' in b.id else COL['steel'], 0.35, zo=2)
    ax.plot([TRUSS_A[0], TRUSS_B[0]], [21.0, 21.0], color=COL['truss'], lw=2.4, zorder=4)
    for s in SNAP['solids']:
        if 'tieoff' in s['id']:
            b = Box(s['id'], s['p'], s['s'], s['r'], 'base')
            q = b.p + b.R @ np.array([0, s['s'][1], 0])
            ax.plot([b.p[0], q[0]], [b.p[2], q[2]], color=COL['rig'], lw=0.8, ls=':', zorder=4)
    R_(RISER['x'], RISER['z'], COL['riser'], 1, zo=3)
    R_((-0.772, 1.028), (23.49, 24.29), '#1b1f24', 1, zo=4)
    ax.add_patch(Circle((0.13, 23.1), 0.28, fc='#000', ec=COL['djEdge'], lw=0.8, zorder=5))
    ax.text(0.13, 22.95, 'DJ', color=COL['fg'], fontsize=6, ha='center', va='center', zorder=6)
    for x in (-5.4, 5.4):
        R_((x - 0.67, x + 0.67), (23.78, 24.5), '#3a4048', 1, zo=3)
    R_((-7.07, 7.07), (25.75, 25.83), COL['barrier'], 1, zo=3)
    ax.text(-13.6, 21.0, 'truss z 21', color=COL['fg'], fontsize=6.5, va='center')
    # fixtures
    kcol = {'par': '#ffb36b', 'beam': '#ffffff', 'laser': '#3cff3c', 'haze': '#7fb2ff', 'smoke': '#7fb2ff'}
    for f in fx:
        k = f['kind']
        if f['p'][2] < -4 or abs(f['p'][0]) > 14 or f['p'][2] > 52:
            continue
        if f.get('moved'):
            ax.plot([f['p0'][0], f['p'][0]], [f['p0'][2], f['p'][2]], color=COL['ghost'], lw=0.7, ls='--', zorder=5)
            ax.plot(f['p0'][0], f['p0'][2], marker='s', ms=3, mfc='none', mec=COL['ghost'], zorder=5)
        mk = {'par': 'o', 'beam': 'D', 'laser': '^', 'haze': 'h', 'smoke': 'h'}.get(k, 'o')
        ax.plot(f['p'][0], f['p'][2], marker=mk, ms=3.6 if k != 'beam' else 3.2, mfc=f['colour'] if k in ('par', 'beam', 'laser') else kcol[k], mec='#000', mew=0.3, zorder=7)
        if f['d'] is None:
            continue
        t, _, _ = beam_end(f['p'], f['d'], REACH[k], skip=('truss',) if f['p'][1] > 3 else ())
        q = f['p'] + f['d'] * t
        horiz = math.hypot(f['d'][0], f['d'][2])
        if horiz < 0.2:
            ax.plot(f['p'][0], f['p'][2], marker='o', ms=6.5 if f['d'][1] > 0 else 5, mfc='none', mec=f['colour'], mew=0.6, alpha=0.7, zorder=6)
        else:
            ax.plot([f['p'][0], q[0]], [f['p'][2], q[2]], color=f['colour'], lw=0.9 if k != 'par' else 1.2, alpha=0.75 if k != 'par' else 0.45, zorder=6)
            if k == 'laser':
                ax.plot(q[0], q[2], marker='x', ms=4, mec=f['colour'], zorder=6)
    ax.text(0, -3.0, 'BACK (press end)', color=COL['dim'], fontsize=7, ha='center')
    ax.text(0, 51.6, 'ENTRY', color=COL['dim'], fontsize=7, ha='center')
    ax.text(-13.6, 50.5, 'off the plan, unchanged:\n8 vista PARs z -12..-48,\nlighthouse beam z -48,\n4 neighbour PARs x +-35', color=COL['dim'], fontsize=5.8, va='bottom')
    ax.set_title('top plan (house left on the left, as the floor sees it)', color=COL['dim'], fontsize=8, loc='left')


def option_lines(opt, chk):
    g = chk
    glare = ('no truss PAR and no beam has an audience eye in its field' if not g['truss_pars_glaring'] and not g['beams_into_eyes'] else
             '%d truss PARs reach audience eyes, up to %.0f lux at an eye (E = I/d^2, I = %d cd borrowed)' % (len(g['truss_pars_glaring']), g['max_eye_lux_truss'], INTENSITY_CD['par']))
    if g['beams_into_eyes']:
        glare += '; BEAMS INTO EYES: %s' % ', '.join(g['beams_into_eyes'])
    dj = 'no narrow beam through the DJ' if not g['dj_narrow'] else 'NARROW BEAM THROUGH THE DJ: ' + ', '.join(g['dj_narrow'])
    mv = 'no ground mover under 2.5 m in the dance zone' if not g['mover_eye_zone'] else 'MOVER IN THE EYE ZONE: ' + ', '.join(g['mover_eye_zone'])
    return glare, dj, mv


def moves_text(opt, fx):
    lines = []
    for gr in opt.get('groups', []):
        lamps = [f for f in fx if f['id'].startswith(gr['match'])]
        moved = [f for f in lamps if f.get('moved')]
        what = gr['match'].replace('rig-', '').rstrip('-')
        aim = gr.get('aim', {}).get('rule', 'keep')
        verb = []
        if moved:
            verb.append('%d MOVE' % len(moved))
        reaimed = [f for f in lamps if f.get('reaimed')]
        if reaimed:
            verb.append('%d re-aim (%s)' % (len(reaimed), aim))
        elif lamps and lamps[0]['d'] is not None and not moved:
            verb.append('kept as today')
        if verb:
            lines.append('%s x%d: %s' % (what, len(lamps), ', '.join(verb)))
    return lines


def figure(opt, fx, chk, path):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    import textwrap
    fw, fh = 19.6, 11.3
    fig = plt.figure(figsize=(fw, fh), dpi=100)
    fig.patch.set_facecolor(COL['bg'])
    vw, vh = 14.0, 7.875
    ax = fig.add_axes([0.2 / fw, (fh - 0.95 - vh) / fh, vw / fw, vh / fh])
    view(ax, fx, opt['id'])
    pw, ph = 4.85, 9.7
    ax2 = fig.add_axes([(0.2 + vw + 0.4) / fw, 0.35 / fh, pw / fw, ph / fh])
    plan(ax2, fx, opt)
    fig.text(0.2 / fw, (fh - 0.38) / fh, ('%s  %s' % (opt['id'], opt['title'])) if opt['id'] != 'today' else opt['title'], color=COL['fg'], fontsize=16, fontweight='bold', family='DejaVu Sans Mono')
    fig.text(0.2 / fw, (fh - 0.72) / fh, 'View from the dance floor, centre, eye 1.6 m, z 38, looking at the DJ (pinhole, 62 deg vertical). A picture of intent, not a render: cones drawn at each type\'s beam angle in a fixed haze.',
             color=COL['dim'], fontsize=9, family='DejaVu Sans Mono')
    glare, dj, mv = option_lines(opt, chk)
    idea = opt.get('idea', 'As built: the cut and its lamps moved with the truss, every aim as it was; the floor fixtures where they were.')
    y = (fh - 0.95 - vh - 0.3) / fh
    rows = [('idea', idea), ('laser', chk['laser_verdict']), ('glare', glare + '; ' + dj + '; ' + mv),
            ('moves vs today', '; '.join(moves_text(opt, fx)) or 'nothing')]
    for k, v in rows:
        wrapped = textwrap.wrap(v, 158)
        fig.text(0.2 / fw, y, '%-15s' % k, color='#3cff3c' if k == 'laser' and chk['laser_pass'] else ('#ff5a4f' if k == 'laser' else COL['fg']), fontsize=9, family='DejaVu Sans Mono', va='top')
        fig.text(1.75 / fw, y, '\n'.join(wrapped[:3]), color=COL['fg'] if k != 'idea' else '#c4c9cf', fontsize=9, family='DejaVu Sans Mono', va='top')
        y -= (0.18 * min(3, len(wrapped)) + 0.08) / fh
    fig.text((0.2 + vw + 0.4) / fw, 0.12 / fh, 'scripts/place/lights_beta_options.py', color='#5d6670', fontsize=7, family='DejaVu Sans Mono')
    fig.savefig(path, facecolor=COL['bg'])
    plt.close(fig)


def page(paths, out):
    data = {'nohd': round(NOHD_M), 'mpe': round(MPE_E, 1), 'options': [], 'floor': SUMMARY['floor']}
    for o in sorted(OPTIONS, key=lambda o: PAGE_ORDER.index(o['id'])):
        chk = CHECKS[o['id']]
        glare, dj, mv = option_lines(o, chk)
        with open(paths[o['id']], 'rb') as fh:
            b64 = base64.b64encode(fh.read()).decode()
        data['options'].append({'id': o['id'], 'title': o['title'], 'idea': o.get('idea', ''), 'palette': o.get('palette', ''),
                                'png': os.path.basename(paths[o['id']]), 'img': 'data:image/png;base64,' + b64,
                                'laser': chk['laser_verdict'], 'laserPass': chk['laser_pass'], 'glare': glare, 'dj': dj, 'mover': mv,
                                'moves': moves_text(o, FX[o['id']]),
                                'groups': [{'what': g['match'].replace('rig-', '').rstrip('-'), 'why': g.get('why', '')} for g in o.get('groups', [])],
                                'lasers': [{'id': l['id'].replace('rig-lasercube-cut-', 'cube '), 'to': l['to'], 'ends': l['ends_on'], 'minAud': l['min_over_audience_m'],
                                            'minFloor': l['min_over_floor_m'], 'steel': '%s %.2f m' % (l['nearest_steel']['what'], l['nearest_steel']['m']), 'err': l['errors']} for l in chk['lasers']]})
    html = PAGE.replace('__DATA__', json.dumps(data))
    with open(out, 'w') as fh:
        fh.write(html)


def draw_all():
    out = os.path.expanduser(a.out or '~/Downloads/moxir/stage')
    os.makedirs(out, exist_ok=True)
    paths = {}
    for o in OPTIONS:
        p = os.path.join(out, 'lights-beta-%s.png' % o['id'])
        figure(o, FX[o['id']], CHECKS[o['id']], p)
        paths[o['id']] = p
        print('wrote', p)
    with open(os.path.join(out, 'lights-beta-checks.json'), 'w') as fh:
        json.dump({'summary': SUMMARY, 'checks': CHECKS}, fh, indent=1, default=float)
    page(paths, os.path.join(out, 'lights-beta-options.html'))
    print('wrote', os.path.join(out, 'lights-beta-options.html'))


PAGE = r"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>MOXIR beta lights</title></head><body><main id="root"></main>
<script>
"use strict";
// Colours are JS constants on purpose: CSS variables came back empty inside di's frame.
const C={bg:"#0b0c0d",panel:"#121416",line:"#2a2e33",fg:"#e3e6ea",sub:"#9aa1a8",dim:"#8f969e",ok:"#3cff3c",bad:"#ff5a4f",warn:"#ffb36b",accent:"#27ff4a"};
const DATA=__DATA__;
const F="ui-monospace,'DejaVu Sans Mono',monospace";
const el=(tag,style,html)=>{const e=document.createElement(tag);if(style)Object.assign(e.style,style);if(html!=null)e.innerHTML=html;return e;};
const wrap=t=>{const w=el("div",{overflowX:"auto",maxWidth:"100%"});w.appendChild(t);return w;};
const esc=s=>String(s).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
Object.assign(document.documentElement.style,{background:C.bg});
Object.assign(document.body.style,{margin:"0",background:C.bg,color:C.fg,font:"16px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif"});
const root=document.getElementById("root");
Object.assign(root.style,{maxWidth:"1240px",margin:"0 auto",padding:"40px 16px 60px",boxSizing:"border-box"});
root.appendChild(el("h1",{font:"600 22px/1.25 "+F,margin:"0 0 6px"},"MOXIR beta v0.9 &middot; the lights, three ways"));
root.appendChild(el("p",{color:C.sub,margin:"0 0 6px"},"The truss is now a backdrop behind the DJ (crane z 21, LOW 3.24 m house left, HIGH 6.35 m house right). Each option is drawn from the dance floor (centre, eye 1.6 m, z 38) and from above, with the beta's own 50 PARs, 18 beams and 6 lasers. Nothing is built: pick by looking."));
root.appendChild(el("p",{color:C.dim,margin:"0 0 22px",font:"13px/1.5 "+F},"Laser figures for every option: LaserCube Ultra MK2, 10 W, 4 mm, 1 mrad (maker's spec) &rarr; MPE "+DATA.mpe+" W/m&sup2; at 0.25 s (IEC 60825-1:2014 Table A.1) &rarr; static-beam NOHD &asymp; "+DATA.nohd+" m, longer than the hall: no beam may ever reach an eye. The verdicts below are the repo's planning rules, not a safety assessment; a laser safety officer signs (IEC 60825-1, IEC TR 60825-3) before any emission."));
const td=(t,s)=>el("td",Object.assign({border:"1px solid "+C.line,padding:"5px 8px",verticalAlign:"top"},s||{}),t);
for(const o of DATA.options){
  const sec=el("section",{background:C.panel,border:"1px solid "+(o.id==="today"?C.line:C.line),margin:"0 0 22px"});
  const img=el("img",{display:"block",width:"100%",height:"auto"});img.src=o.img;img.alt=o.title;sec.appendChild(img);
  const cap=el("div",{padding:"12px 14px 16px"});
  cap.appendChild(el("div",{font:"600 18px/1.3 "+F},"<b style='color:"+C.accent+";margin-right:10px'>"+(o.id==="today"?"Today":o.id)+"</b>"+esc(o.id==="today"?o.title.replace(/^Today: /,""):o.title)));
  if(o.idea)cap.appendChild(el("p",{color:"#c4c9cf",margin:"6px 0 8px"},esc(o.idea)));
  const t=el("table",{borderCollapse:"collapse",width:"100%",font:"13px/1.45 "+F,color:"#c4c9cf"});
  const row=(k,v,col)=>{const r=el("tr");r.appendChild(td(k,{color:C.fg,width:"150px"}));r.appendChild(td(v,col?{color:col}:{}));t.appendChild(r);};
  row("laser safety",esc(o.laser),o.laserPass?C.ok:C.bad);
  row("glare",esc(o.glare),o.glare.startsWith("no ")?null:C.warn);
  row("DJ / movers",esc(o.dj)+"; "+esc(o.mover));
  row("what moves vs today",o.moves.length?o.moves.map(esc).join("<br>"):"nothing");
  if(o.palette)row("colour",esc(o.palette));
  cap.appendChild(wrap(t));
  if(o.groups.length){
    const d=el("details",{marginTop:"10px"});d.appendChild(el("summary",{cursor:"pointer",color:C.sub,font:"13px "+F},"why each group goes where it goes"));
    const t2=el("table",{borderCollapse:"collapse",width:"100%",font:"12.5px/1.45 "+F,color:"#c4c9cf",marginTop:"6px"});
    for(const g of o.groups){const r=el("tr");r.appendChild(td(esc(g.what),{color:C.fg,width:"190px"}));r.appendChild(td(esc(g.why)));t2.appendChild(r);}
    d.appendChild(wrap(t2));cap.appendChild(d);
  }
  const d3=el("details",{marginTop:"8px"});d3.appendChild(el("summary",{cursor:"pointer",color:C.sub,font:"13px "+F},"each laser beam"));
  const t3=el("table",{borderCollapse:"collapse",width:"100%",font:"12px/1.45 "+F,color:"#c4c9cf",marginTop:"6px"});
  const h=el("tr");for(const k of["cube","ends at (x, y, z)","on","lowest over audience","lowest over any floor","nearest steel","problems"])h.appendChild(td(k,{color:C.fg}));t3.appendChild(h);
  for(const l of o.lasers){const r=el("tr");for(const v of[l.id,l.to.join(", "),l.ends,l.minAud==null?"never over it":l.minAud+" m",l.minFloor+" m",l.steel,l.err.join("; ")||"none"])r.appendChild(td(esc(v),l.err.length?{color:C.bad}:{}));t3.appendChild(r);}
  d3.appendChild(wrap(t3));cap.appendChild(d3);
  cap.appendChild(el("div",{color:C.dim,font:"12px "+F,marginTop:"8px"},"PNG beside this page: "+esc(o.png)));
  sec.appendChild(cap);root.appendChild(sec);
}
root.appendChild(el("h2",{font:"600 18px/1.3 "+F,margin:"30px 0 8px"},"The floor fixtures that stayed: what they light now"));
root.appendChild(el("p",{color:C.sub,margin:"0 0 8px"},"Read from the beta's document (v61) against hall v8-show. &lsquo;Seen&rsquo; = the lit point is in view from the centre of the dance floor."));
const tf=el("table",{borderCollapse:"collapse",width:"100%",font:"12.5px/1.45 "+F,color:"#c4c9cf"});
const hh=el("tr");for(const k of["group","n","z (m)","beam ends on","inside a machine","outside the hall","blocked within 3.5 m","seen from the floor"])hh.appendChild(td(k,{color:C.fg}));tf.appendChild(hh);
for(const r of DATA.floor){const tr=el("tr");const bad=r.inside_a_machine.length||r.outside_the_hall.length;
  for(const v of[r.group,r.n,r.z_m.join(" .. "),r.ends_on.join(", ")||"-",r.inside_a_machine.join(", ")||"-",r.outside_the_hall.join(", ")||"-",r.blocked_within_3_5_m.join(", ")||"-",(r.lit_point_seen_from_floor||"-")+(r.hidden_by.length?" (hidden by "+r.hidden_by.join(", ")+")":"")])tr.appendChild(td(esc(v),bad?{color:C.warn}:{}));tf.appendChild(tr);}
root.appendChild(wrap(tf));
root.appendChild(el("div",{color:C.dim,font:"12px/1.55 "+F,marginTop:"28px",borderTop:"1px solid "+C.line,paddingTop:"12px"},"Generated by scripts/place/lights_beta_options.py (branch feat/moxir-stage-line-2026-10-07, PR #823) from rigs/moxir-beta-v0.9-lights-2026-10-07.json (read back from the scratch copy, document v61), rigs/moxir-lights-beta-options-2026-10-07.json and hall v8-show-back21. Crane heights are ASSUMED (the far crane's photo value), the pipe racks are LOW confidence: the 10-08 tape changes the numbers, not the ideas. PAR and beam intensities are borrowed equivalents (types/moxir.json, basis EQUIVALENT). Not a render, not a lux plot, not a laser safety assessment, not a rigging sign-off."));
</script></body></html>
"""


# ------------------------------------------------------------------ main (check)
OPTIONS = [{'id': 'today', 'title': 'Today: beta v0.9 as built (the cut moved, nothing re-aimed)', 'groups': []}] + OPTS['options']
PAGE_ORDER = ['A', 'B', 'C', 'today']
FX = {o['id']: apply_option(o) for o in OPTIONS}
CHECKS = {o['id']: check_option(o['id'], FX[o['id']]) for o in OPTIONS}
for o in OPTIONS:
    CHECKS[o['id']]['laser_verdict'] = laser_verdict(CHECKS[o['id']])
FLOOR = floor_report(FX['today'])
SUMMARY = {'nohd_m': round(NOHD_M), 'mpe_w_m2': round(MPE_E, 1), 'mpe_basis': 'IEC 60825-1:2014 Table A.1, 400-700 nm, t = 0.25 s, C6 = 1',
           'options': {k: {kk: v[kk] for kk in ('counts', 'laser_pass', 'laser_verdict', 'laser_min_over_audience_m', 'laser_min_over_floor_m',
                                                 'laser_min_steel_m', 'truss_pars_glaring', 'max_eye_lux_truss', 'beams_into_eyes',
                                                 'dj_narrow', 'mover_eye_zone')} | {'moves': len(v['moves'])}
                       for k, v in CHECKS.items()},
           'floor': FLOOR,
           # the stored rotation must give back the aimed direction (spotLightAim.js convention), for every lamp of every option
           'aim_roundtrip_max_deg': round(max(math.degrees(math.acos(max(-1.0, min(1.0, float(aim_dir(f['r']) @ f['d'])))))
                                              for fx in FX.values() for f in fx if f['d'] is not None), 6)}

if a.check:
    print(json.dumps({'summary': SUMMARY, 'checks': CHECKS}, indent=1, default=float))
    sys.exit(0)

draw_all()
