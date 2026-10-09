#!/usr/bin/env python3
# moxir_v1_1.py — MOXIR v1.1 part 2 (2026-10-08 night): the v1.0 design moved to the owner's NEW stage at the press end.
#
#   python3 -I scripts/place/moxir_v1_1.py --repo . [--out ~/Downloads/moxir/stage/v1-1]      # rig file + checks + pictures
#   python3 -I scripts/place/moxir_v1_1.py --repo . --check                                     # the checks, JSON, no files
#
# WHAT IT DOES (every number below is computed here or names its source)
#   The owner painted a new stage (paint-stage-v1-1.png): the DJ at x -6.3..-4.1, z 3.7..5.6 (house left of the press,
#   facing the entry), speakers L and R beside him. The place (hall v9-show-park, moxir-hall-crane-park-v1-1-2026-10-08.json)
#   and the stage (moxir-stage-v1-1-2026-10-08.json: the step, the speaker placeholders, the barrier, the floor, FOH, the
#   crane park, the cut's axis) are decided there. This script moves v1.0's LIGHTS AND LASERS (rigs/moxir-epic-2026-10-08.json,
#   moxir_v1.py) to that stage, keeping v1.0's design: the same units, looks, moments, colours, levels and DMX.
#
#   Three rigid moves, each from its source:
#     D_DJ   the stage floor (the halo PARs, the fan and spine B380F behind the step, smoke machine 4): the step's move,
#            v1.0 booth centre (0.128, 23.5; the owner's hand placement kept in the copy) -> (-5.2, 4.65)
#     D_CUT  everything on the cut (curtain, x, the back grazers, blinders): the cut's rigid offset as stage-line.mjs
#            derives it (recutOps over slopedLineRigging: the 10-07 cut at z 21 / axis -1 / girder 7.95 -> the v1.1 cut at
#            z 0.15 / axis -5.0 / girder 7.6): (-4.0, -0.35, -20.85); hall-site test re-derives it
#     (v1.0's ash wall, the lasers' beam stop, is GONE in v1.1: owner 2026-10-09 "I don't need the ash wall"; no panel goes back
#      without his word. The lasers end on the hall's own press, below.)
#   Every unit's aim: a unit that moved keeps its rotation (the look is relative to the stage), EXCEPT where its v1.0 beam
#   ended on a stage thing that moved by another delta (e.g. the grazers on the wall): it is re-aimed at that same point,
#   moved. A hall-fixed unit keeps its rotation unless its v1.0 beam ended on a stage thing (re-aimed the same way).
#   "Ended on" = the first thing its axis meets, cast against the hall's triangles + the rig's boxes (occlusion_lib.Obstacles,
#   Moller-Trumbore), in the v1.0 world (hall v8-show-back21-far41 + v1.0's solids + the 10-07 cut) and in the v1.1 world.
#   Lasers (owner 2026-10-09): ONE static beam per LaserCube (6 beams; the 12 of v1.0 were our own 2-point-scan choice, not his),
#   the cube's whole 6 W in it (duty 1), and no beam-stop panel. Each cube's beam is re-aimed to end on the hall's own matte
#   press (the press body's -z face, or the crown's): per cube a grid of 47 candidate points (LASER_GRID: the -z face, the crown's front, the two side faces), cast with the v1.0 method (occlusion_lib over hall v9-show-park + the rig boxes, no panel): the axis plus 60 rays
#   over the controller zone + mount tolerance (0.8 deg, review B2) must ALL first-hit the press, at >= 3.0 m (HS(G)95) and
#   z <= 3.3; the margin is the largest fan that still all ends on it, minus 0.8 deg. The cube keeps the candidate with the
#   larger margin; the next best is recorded as `alt` (the one to swap in by eye). Safety at the 6 W unit, ONE beam (the scan-failure case of IEC TR 60825-3,
#   unchanged from v1.0): NOHD (IEC 60825-1:2014 Table A.1, 0.25 s, 4 mm, 1 mrad).
#   Power: the same units, so the same connected and running loads (moxir_v1.py power()); the circuits re-derived by
#   epic_plot.circuits() from the moved distro (D-STAGE behind the stage, house left) - cable runs = nearest-neighbour
#   floor Manhattan + rises + 10 % (as v1.0), BS 7671 Table 4D2B volt drop.
#   No sound design (owner 10-08 night): the speaker boxes are the organiser's placeholders at his marks.
import argparse, copy, json, math, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.dont_write_bytecode = True
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('--repo', default='.')
ap.add_argument('--out', default=None)
ap.add_argument('--check', action='store_true')
ap.add_argument('--rig-out', default='scripts/place/rigs/moxir-epic-v1-1-2026-10-08.json')
A = ap.parse_known_args()[0]
REPO = os.path.abspath(os.path.expanduser(A.repo))
J = lambda p: json.load(open(os.path.join(REPO, p)))

import lights_beta_options as L     # noqa: E402  helpers (Box, euler, rot_for_dir) and the v1.0 world's cut + near crane
import occlusion_lib as O           # noqa: E402

V10 = J('scripts/place/rigs/moxir-epic-2026-10-08.json')
DES = J('scripts/place/rigs/moxir-stage-v1-1-2026-10-08.json')
H_OLD = J('scripts/place/rigs/moxir-hall-2026-10-08-v8-show-back21-far41.hall.json')
H_NEW = J('scripts/place/rigs/moxir-hall-2026-10-08-v9-show-park.hall.json')
GLB_OLD = '/mnt/data/footage/place-moxir-hall-v8-show-back21-far41-2026-10-08/hall.glb'
GLB_NEW = '/mnt/data/footage/place-moxir-hall-v9-show-park-2026-10-08/hall.glb'
G_OLD, G_NEW = H_OLD['geometry'], H_NEW['geometry']

R3 = lambda v: round(float(v), 3)
OLD_BOOTH = (0.128, 23.5)                                  # v1.0 copy: decks at x -0.872/0.128/1.128, z 23.49-23.5 (owner's hand, kept)
NEW_BOOTH = (DES['booth']['centre_x_m'], DES['booth']['front_z_m'] - DES['booth']['depth_m'] / 2)
D_DJ = np.array([NEW_BOOTH[0] - OLD_BOOTH[0], 0.0, NEW_BOOTH[1] - OLD_BOOTH[1]])
D_CUT = np.array([-4.0, -0.35, -20.85])                    # stage-line.mjs recut offset (spread 0.000 m), see the header
CUT_PARTS = {'curtain', 'x', 'ash wall', 'press graze', 'blinders'}
FLOOR_PARTS = {'halo', 'fan', 'spine'}
FAN_DEG, ZONE_DEG = 0.8, 0.3
LASER_W = 6.0                                               # owner 10-08 night: 6 W for brightness AND safety


def delta_of(f):
    if f['type'] == 'ext-lc-ultra-mk2':
        return None
    if f.get('part') in CUT_PARTS:
        return D_CUT
    if f.get('part') in FLOOR_PARTS or f['id'] == 'rig-smoke-04':
        return D_DJ
    return None


# ------------------------------------------------------------------ the two worlds
def crane_boxes(G):
    c = G['cranes'][0]
    w = c['girder_w_m'] / 2
    out = [L.Box.aabb('crane girder z %.2f' % (c['z_m'] + dz), (-G['crane_rail_x_m'], G['crane_rail_x_m']), (c['girder_bottom_m'], c['girder_top_m']),
                      (c['z_m'] + dz - w, c['z_m'] + dz + w), 'crane') for dz in c['girders_dz_m']]
    for k in ('trolley', 'cab'):
        q = c[k]
        out.append(L.Box.aabb('crane ' + k, q['x_m'], q['y_m'], (c['z_m'] + q['dz_m'][0], c['z_m'] + q['dz_m'][1]), 'crane'))
    return out


def solid_box(s):
    if s['kind'] == 'tower':
        return L.Box(s['id'], s['p'], [0.29, 6 * s['s'][1], 0.29], (0, 0, 0), 'base', 'stage')
    return L.Box(s['id'], s['p'], s['s'], s.get('r', (0, 0, 0)), 'base', 'beamstop' if s['id'] == 'rig-ash-wall' else 'stage')


def decks(centre_x, mid_z):
    return [L.Box('rig-deck-%d' % (i + 1), [centre_x - 1.0 + i * 1.0, 0, mid_z], [1.0, 0.4, 2.0], (0, 0, 0), 'base', 'riser') for i in range(3)]


def dj_box(centre_x, mid_z):
    return L.Box.aabb('the DJ', (centre_x - 0.9, centre_x + 0.9), (0.4, 2.4), (mid_z - 0.9, mid_z + 0.79), 'dj')


def moved_box(b, d):
    nb = copy.copy(b)
    nb.p = b.p + d
    return nb


def world(glb, G, solids, truss, cranes, booth):
    boxes = [solid_box(s) for s in solids] + decks(*booth) + [dj_box(*booth)]
    return O.Obstacles(glb, G, boxes, truss, cranes)


TRUSS_NEW = moved_box(L.TRUSS, D_CUT)
OLD_W = world(GLB_OLD, G_OLD, V10['solids'], L.TRUSS, L.crane_boxes(), OLD_BOOTH)


# ------------------------------------------------------------------ the new solids
def new_solids():
    out = []
    for s in V10['solids']:
        if s['id'] == 'rig-ash-wall':
            continue                                       # v1.1: no beam-stop panel (owner 2026-10-09); the lasers end on the press
        if s['id'] == 'rig-tower-cube6':
            out.append(dict(s))
        # the barrier and v1.0's PA by class are replaced below
    bx0, bx1 = DES['barrier']['x_m']
    out.append({'id': 'rig-crowd-barrier', 'name': 'crowd barrier %.1f m at z %.2f (v1.1: %s m pit to the step)' % (bx1 - bx0, DES['barrier']['z_m'], DES['barrier']['pit_m']),
                'kind': 'box', 'p': [R3((bx0 + bx1) / 2), 0.0, DES['barrier']['z_m']], 'r': [0, 0, 0], 's': [R3(bx1 - bx0), DES['barrier']['h_m'], 0.08]})
    for b in DES['pa']['boxes']:
        (x0, x1), (z0, z1) = b['x_m'], b['z_m']
        out.append({'id': 'rig-pa-%s' % b['id'].lower(), 'name': "speaker %s - the ORGANISER'S PLACEHOLDER at his mark (%s m high ASSUMED, blocking and sightlines only; no sound design by di)" % (b['id'], b['h_m']),
                    'kind': 'box', 'p': [R3((x0 + x1) / 2), 0.0, R3((z0 + z1) / 2)], 'r': [0, 0, 0], 's': [R3(x1 - x0), b['h_m'], R3(z1 - z0)]})
    f = DES['foh']
    out.append({'id': 'rig-foh-riser', 'name': 'FOH riser %g x %g m, %g m high (ASSUMED): the lighting + laser desk, the laser E-stop' % (f['size_m'][0], f['size_m'][1], f['riser_m']),
                'kind': 'box', 'p': [f['p'][0], 0.0, f['p'][2]], 'r': [0, 0, 0], 's': [f['size_m'][0], f['riser_m'], f['size_m'][1]]})
    return out


SOLIDS = new_solids()
NEW_W = world(GLB_NEW, G_NEW, SOLIDS, TRUSS_NEW, crane_boxes(G_NEW), NEW_BOOTH)
STAGE_THINGS = {'truss': D_CUT, 'the DJ': D_DJ, 'deck-1': D_DJ, 'deck-2': D_DJ, 'deck-3': D_DJ}


def first_hit(Wd, p, d, skip_box=(), reach=80.0):
    t, name, cls, _ = Wd.cast(np.asarray(p, float), np.asarray(d, float), tmin=0.35, tmax=reach, skip_box=skip_box)
    return (None, 'open air (beyond %g m)' % reach, 'air') if t is None else (t, name, cls)


def own_mount(f):
    return ('truss',) if f.get('part') in CUT_PARTS else ()


# The four back grazers lit v1.0's ash wall (their v1.0 beams ended on it). With the wall gone they are re-aimed to graze the hall's
# own press face from the cut (x spread along it, y low on the face): lit ember 12 % they only kiss the press (albedo 0.04). Part renamed.
PRESS_GRAZE = {'rig-par-cut-bridge-01': (0.7, 3.4, 0.25), 'rig-par-cut-bridge-02': (1.3, 3.4, 0.25), 'rig-par-cut-bridge-03': (1.9, 3.4, 0.25), 'rig-par-cut-bridge-04': (2.5, 3.4, 0.25)}


# ------------------------------------------------------------------ the units
def move_units():
    rows, out = [], []
    for f in V10['fixtures']:
        g = copy.deepcopy(f)
        if f['type'] == 'ext-lc-ultra-mk2':
            out.append(g)
            continue
        dl = delta_of(f)
        if dl is not None:
            g['p'] = [R3(v) for v in np.array(f['p']) + dl]
        if f['id'] in OFF_FLOOR:
            g['p'] = list(OFF_FLOOR[f['id']])
            g['position'] = f['position'] + ' (v1.1: moved off the new dance floor, %s m behind the barrier)' % R3(DES['barrier']['z_m'] - g['p'][2])
            g['position'] = f['position'].replace('z 21.35', 'z %.2f' % (21.35 + D_CUT[2]))
        row = {'id': f['id'], 'part': f.get('part'), 'moved': None if dl is None else [R3(v) for v in dl]}
        if f.get('angle_rad') is None:                     # smoke machines: a place, no beam
            out.append(g)
            rows.append(row)
            continue
        d0 = L.aim_dir(f['r'])
        t0, n0, c0 = first_hit(OLD_W, f['p'], d0, own_mount(f))
        row['v1_0_end'] = n0
        target = None
        if t0 is not None and n0 in STAGE_THINGS:
            hit = np.array(f['p']) + t0 * d0
            target = hit + STAGE_THINGS[n0]
            if dl is not None and np.allclose(STAGE_THINGS[n0], dl):
                target = None                              # moved with what it lights: the rotation already holds
        if n0 == 'ash-wall':
            target = np.array(PRESS_GRAZE[f['id']], float)    # v1.1: the wall is gone; graze the press face instead
            row['re_aimed_at_press'] = [R3(v) for v in target]
            g['part'] = 'press graze'
            g['position'] = g['position'].replace('to graze the ash wall', 'to graze the hall\'s press face (v1.1: no ash wall)')
        if f['id'] in OFF_FLOOR and t0 is not None:
            target = np.array(f['p']) + t0 * d0            # the same point it lit, from its new place
        if target is not None:
            g['r'] = L.rot_for_dir(target - np.array(g['p']))
            row['re_aimed_at'] = [R3(v) for v in target]
        d1 = L.aim_dir(g['r'])
        t1, n1, c1 = first_hit(NEW_W, g['p'], d1, own_mount(g))
        row['v1_1_end'] = n1
        row['v1_1_end_cls'] = c1
        if dl is not None or target is not None:
            row['aim_deg_change'] = round(math.degrees(math.acos(max(-1, min(1, float(d0 @ d1))))), 1)
        out.append(g)
        rows.append(row)
    return out, rows


# Hall-fixed units the new floor now reaches (v1.0's floor began at z 26.5): moved to the nearest place out of the crowd's
# reach (>= 2 m behind the barrier), re-aimed at the same point they lit. Found by the check below (2026-10-08 run 1:
# press-sides-02 at (1.0, 0.3, 9.0) stood on the new floor and its beam crossed the barrier).
OFF_FLOOR = {'rig-par-press-sides-02': [1.0, 0.3, 6.0]}


def on_floor(p):
    (x0, x1), (z0, z1) = DES['floor']['x_m'], DES['floor']['z_m']
    return x0 - 0.5 <= p[0] <= x1 + 0.5 and z0 - 2.0 <= p[2] <= z1 and p[1] < 2.5


def place_checks(units):
    """Moved floor units against the fixed massing (plan + height, 0.1 m margin)."""
    bad = []
    for u in units:
        if delta_of(u) is not D_DJ:
            continue
        for m in G_NEW['massing']:
            if (m['x_m'][0] - 0.1 <= u['p'][0] <= m['x_m'][1] + 0.1 and m['z_m'][0] - 0.1 <= u['p'][2] <= m['z_m'][1] + 0.1
                    and m['y_m'][0] - 0.1 <= u['p'][1] <= m['y_m'][1] + 0.1):
                bad.append({'id': u['id'], 'p': u['p'], 'in': m['id']})
    return bad


def nudge(units, bad):
    """The least move out of a fixed box along x or z (+0.1 m), recorded."""
    done = []
    for b in bad:
        u = next(x for x in units if x['id'] == b['id'])
        m = next(x for x in G_NEW['massing'] if x['id'] == b['in'])
        opts = [(m['x_m'][1] + 0.1 - u['p'][0], 0), (m['x_m'][0] - 0.1 - u['p'][0], 0), (m['z_m'][1] + 0.1 - u['p'][2], 2), (m['z_m'][0] - 0.1 - u['p'][2], 2)]
        dv, ax = min(opts, key=lambda o: abs(o[0]))
        u['p'][ax] = R3(u['p'][ax] + dv)
        done.append({'id': u['id'], 'out_of': m['id'], 'axis': 'xz'[ax // 2], 'by_m': R3(dv), 'to': u['p']})
    return done


# ------------------------------------------------------------------ the lasers
LASER_ALLOWED = {'press', 'press-crown'}      # what a beam may end on: the hall's own matte press (albedo 0.04, hall.json); never steel, glass, a column of the crowd's side
LASER_MIN_END_M = 3.0                          # HS(G)95: >= 3.0 m over anywhere people can stand
LASER_MAX_Z = 3.3                              # the press ends at z 3.2; nothing may end past it (the barrier is z 8.2)
# Candidate end points on the press per cube: x 0.5 ... 2.9 every 0.3 m across the face, at y 3.6 / 3.9 / 4.2 on the face (z 0.2) and y 4.5 / 4.9 on the
# crown's front (z 0.8). Each is cast with the full fan; the cube keeps the best margin, the second best (>= 0.5 m from every other chosen end) is `alt`.
LASER_GRID = ([(x, y, 0.2) for x in (0.5, 0.8, 1.1, 1.4, 1.7, 2.0, 2.3, 2.6, 2.9) for y in (3.6, 3.9, 4.2)]
              + [(x, y, 0.8) for x in (0.7, 1.4, 2.1, 2.8) for y in (4.5, 4.9)]
              # and the press body's two side faces (x 0.25 facing house left, x 3.05 facing house right; each z 0.2-3.2 deep, so 3 m of target)
              + [(xf, y, z) for xf in (0.25, 3.05) for y in (3.5, 3.9) for z in (1.0, 1.8, 2.6)])


def ends_on_press(p, d, half):
    """The axis + the controller-zone/mount fan (occlusion_lib AREA_RINGS: 61 rays): every ray's FIRST hit must be the press
    (or its crown) at >= 3.0 m and z <= 3.3. Returns (ok, the set of names hit, the lowest end height)."""
    dirs, _ = O.cone_rays(d, half, O.AREA_RINGS)
    names, low = set(), 99.0
    for q in dirs:
        t, n, c = first_hit(NEW_W, p, q, reach=120.0)
        if t is None:
            return False, {'open air'}, low
        h = p + t * q
        names.add(n)
        low = min(low, float(h[1]))
        if n not in LASER_ALLOWED or h[1] < LASER_MIN_END_M or h[2] > LASER_MAX_Z:
            return False, names, low
    return True, names, low


def fan_margin(p, d):
    lo, hi = 0.0, 3.0                              # the largest fan (half angle) that still all ends on the press
    if not ends_on_press(p, d, 0.0)[0]:
        return None
    for _ in range(10):
        mid = (lo + hi) / 2
        if ends_on_press(p, d, mid)[0]:
            lo = mid
        else:
            hi = mid
    return lo


LASER_SPOT_APART_M = 0.5                        # two beams never end within 0.5 m of each other (6 W + 6 W + 2 W on one spot of paint is a burn, not a mark)


def laser_candidates(f):
    p = np.array(f['p'], float)
    cands = []
    for (x, y, zf) in LASER_GRID:
        T = np.array([x, y, zf])
        d = (T - p) / np.linalg.norm(T - p)
        if not ends_on_press(p, d, FAN_DEG)[0]:            # the 0.8 deg fan must all end on the press; else not a candidate
            continue
        m = fan_margin(p, d)
        t, nm, cl = first_hit(NEW_W, p, d, reach=120.0)           # where the axis REALLY lands (a side-face aim point can lie behind the near face)
        hit = [R3(q) for q in p + t * d]
        if any(c['to'] == hit for c in cands):
            continue
        cands.append({'to': hit, 'aimed_at': [R3(q) for q in T], 'half_fan_deg': round(m, 2), 'margin_after_zone_deg': round(m - FAN_DEG, 2)})
    cands.sort(key=lambda c: (-c['half_fan_deg'], c['to'][1], c['to'][0]))
    return cands


def lasers(units):
    out = []
    cubes = [f for f in units if f['type'] == 'ext-lc-ultra-mk2']
    cand = {f['id']: laser_candidates(f) for f in cubes}
    order = sorted(cubes, key=lambda f: (len(cand[f['id']]), f['id']))              # the most constrained cube first
    best = {'score': None, 'pick': None}

    def apart(c, taken):
        return all(np.linalg.norm(np.array(c['to']) - np.array(t['to'])) >= LASER_SPOT_APART_M for t in taken.values())

    def dfs(i, taken):                                   # every cube gets a candidate, no two ends within 0.5 m: maximise the smallest margin, then the sum
        if i == len(order):
            sc = (min(c['half_fan_deg'] for c in taken.values()), sum(c['half_fan_deg'] for c in taken.values()))
            if best['score'] is None or sc > best['score']:
                best['score'], best['pick'] = sc, dict(taken)
            return
        for c in cand[order[i]['id']]:
            if apart(c, taken):
                taken[order[i]['id']] = c
                dfs(i + 1, taken)
                del taken[order[i]['id']]
    dfs(0, {})
    pick = best['pick'] or {f['id']: ({'to': [1.4, 3.9, 0.2], 'half_fan_deg': 0.0, 'margin_after_zone_deg': -FAN_DEG}) for f in cubes}
    for f in cubes:
        n = int(f['id'][-2:])
        p = np.array(f['p'], float)
        cs = cand[f['id']]
        keep = pick[f['id']]
        # the swap-in alternative: the best other candidate that is still 0.5 m from every OTHER cube's chosen end
        others = [np.array(pick[k]['to']) for k in pick if k != f['id']]
        alt = next((c for c in cs if c['to'] != keep['to'] and all(np.linalg.norm(np.array(c['to']) - t) >= LASER_SPOT_APART_M for t in others)), None)
        T = np.array(keep['to'], float)
        v = T - p
        length = float(np.linalg.norm(v))
        d = v / length
        ok, names, low = ends_on_press(p, d, FAN_DEG)
        old = [b['id'] for b in f['laser']['beams']]
        beam = {'id': '%da' % n, 'to': [R3(x) for x in T], 'length_m': round(length, 1), 'pass': ok, 'margin_after_zone_deg': keep['margin_after_zone_deg'],
                'r': L.rot_for_dir(d), 'ends_on': sorted(names)[0] if len(names) == 1 else sorted(names), 'max_z_m': R3(T[2]), 'end_height_m': R3(T[1]),
                'lowest_end_m_over_fan': R3(low), 'alt': alt, 'was_v1_0_beams': old, 'duty': 1.0, 'candidates_that_pass': len(cs)}
        f['laser']['beams'] = [beam]
        f['laser']['duty'] = 1.0
        f['laser']['room_flux_share'] = 1.0
        f['laser']['note_v1_1'] = ("ONE static beam per cube, the cube's whole 6 W (owner 2026-10-09: 6 beams, not 12); no ash wall: the beam ends on the hall's press at %s "
                                   "(margin %s deg); next best %s. Beam id kept as %da so the looks (cube6a) still match; v1.0 had %s." % (
                                       beam['to'], beam['margin_after_zone_deg'], None if alt is None else '%s (%s deg)' % (alt['to'], alt['margin_after_zone_deg']), n, old))
        out.append({'beam': beam['id'], 'cube': f['id'], 'from': f['p'], 'to': beam['to'], 'length_m': beam['length_m'], 'pass': ok, 'ends_on': beam['ends_on'],
                    'margin_after_zone_deg': beam['margin_after_zone_deg'], 'max_z_m': beam['max_z_m'], 'end_height_m': beam['end_height_m'], 'alt': alt,
                    'was_v1_0_beams': old})
    return out


def seen_whole(eye, units, step=1.0):
    """For each laser beam, the share of its length an eye sees (sight lines cast against the v1.1 world, the wall excluded
    at its own face). Pure numbers."""
    out = {}
    e = np.array(eye, float)
    for f in units:
        if f['type'] != 'ext-lc-ultra-mk2':
            continue
        p = np.array(f['p'], float)
        for b in f['laser']['beams']:
            to = np.array(b['to'], float)
            n = max(2, int(np.linalg.norm(to - p) / step))
            ok = 0
            for k in range(n + 1):
                q = p + (to - p) * (k / n) * 0.995
                v = q - e
                dist = float(np.linalg.norm(v))
                t, name, cls = first_hit(NEW_W, e, v / dist, reach=dist - 0.3)
                ok += t is None
            out[b['id']] = round(ok / (n + 1), 2)
    return out


def spotter(units):
    """E-stop 2's place: with the FOH eye, every beam seen whole. v1.0's x -9, z 12 is on the v1.1 dance floor, so the
    candidates are behind the barrier: house left and right of the stage, backstage."""
    foh = [DES['foh']['p'][0], DES['foh']['riser_m'] + 1.6, DES['foh']['p'][2]]
    f0 = seen_whole(foh, units)
    best = None
    for x, z in ((-10.6, 6.5), (-10.6, 2.0), (-10.6, -2.0), (-8.0, -2.5), (-6.0, -3.0), (-4.0, -3.0), (-7.0, -4.5), (-5.2, -2.0), (-2.0, -2.5), (1.0, 6.0), (6.0, -3.0), (9.0, 6.5)):
        if any(m['x_m'][0] - 0.3 <= x <= m['x_m'][1] + 0.3 and m['z_m'][0] - 0.3 <= z <= m['z_m'][1] + 0.3 and m['y_m'][0] < 1.8 for m in G_NEW['massing']):
            continue
        s = seen_whole([x, 1.7, z], units)
        union = min(max(f0[k], s[k]) for k in s)
        cand = {'at': [x, z], 'eye_m': 1.7, 'per_beam': s, 'with_foh_min': union}
        if best is None or union > best['with_foh_min'] or (union == best['with_foh_min'] and abs(x - NEW_BOOTH[0]) < abs(best['at'][0] - NEW_BOOTH[0])):
            best = cand
    return {'foh_eye': foh, 'foh_per_beam': f0, 'foh_min': min(f0.values()), 'chosen': best,
            'method': 'each beam sampled every 1 m; a sample is seen if the sight line from the eye reaches it with nothing in between (occlusion_lib.Obstacles over hall v9-show-park + the rig boxes); "whole" = the share of samples seen'}


def nohd(P=LASER_W, a=0.004, phi=0.001, rho=None):
    """NOHD of ONE beam carrying the cube's whole power P (the scan-failure case; the same figure with 1 or 2 beams drawn, because the
    safety case never split the power), and the diffuse hazard distance off a surface of reflectance rho (default: the press, hall.json)."""
    rho = G_NEW['albedo']['press'] if rho is None else rho
    mpe = 18 * 0.25 ** 0.75 / 0.25
    return round((math.sqrt(4 * P / (math.pi * mpe)) - a) / phi), round(math.sqrt(rho * P / (math.pi * mpe)), 3)


EYES = {'foh': (-5.2, 1.6, 29.0), 'z38': (0.0, 1.6, 38.0)}


def brightness(units, sigmas=(0.005, 0.02)):
    """cd/m2 of each beam in haze, the moxir_v1.py beam_vis method (Henyey-Greenstein g 0.7 single scattering, a 4 mm + 1 mrad beam,
    9 samples along it, the median of the samples an eye sees), at the 6 W unit with the cube's whole power in the ONE beam (duty 1).
    Eyes: the FOH desk (z 29) and v1.0's z 38. The same call with duty 0.45 reproduces v1.0's two-beam figures."""
    sys.argv = [sys.argv[0], '--repo', REPO]
    import epic_plot as EPL
    LV = EPL.LV
    g = LV.V2['haze']['g']
    out = {}
    for f in units:
        if f['type'] != 'ext-lc-ultra-mk2':
            continue
        b = f['laser']['beams'][0]
        w = LV.VARIANTS['6W']
        mix = {455: 1.0, 525: 1.0, 638: 1.0} if f['laser']['colour'] == 'ash white' else {638: 1.0, 525: 0.1}
        Pc = sum(w[l] * k for l, k in mix.items())
        lm = sum(683 * LV.V_LAMBDA[l] * w[l] * k for l, k in mix.items())
        p = np.array(f['p'], float)
        to = np.array(b['to'], float)
        length = float(np.linalg.norm(to - p))
        d = (to - p) / length
        row = {'lm_full_power': round(lm, 1), 'optical_w': round(Pc, 2), 'duty': b.get('duty', 1.0)}
        for en, eye in EYES.items():
            e = np.array(eye, float)
            for sg in sigmas:
                pts = []
                for sm in np.linspace(1.0, length - 0.5, 9):
                    q = p + d * sm
                    v = q - e
                    dist = float(np.linalg.norm(v))
                    t, nm, cl = first_hit(NEW_W, e, v / dist, reach=dist - 0.3)
                    th = math.acos(max(-1.0, min(1.0, float((-v / dist) @ d))))
                    wd = L.LASER_A_M + L.LASER_PHI * sm
                    Lr = sg * LV.p_hg(th, g) * Pc * row['duty'] * math.exp(-sg * sm) / (wd * max(math.sin(th), 1e-3)) * math.exp(-sg * dist) * (lm / Pc)
                    pts.append((t is None, Lr))
                seen = [c for s_, c in pts if s_]
                row['%s_sigma_%g' % (en, sg)] = {'seen_share': round(len(seen) / len(pts), 2), 'cd_m2': round(float(np.median(seen)), 1) if seen else 0.0}
        out[b['id']] = row
    return out


# ------------------------------------------------------------------ power (the same units; circuits from the moved distro)
SITES_V11 = {
    'D-STAGE': (-8.8, 0.0, 2.0, 'main lighting distro behind the stage, house left, between the cut (z 0.15) and the step (z 3.65); 0.7 m clear of the transformer (x -9.5; its z LOW)'),
    'NODE-STAGE': (-7.5, 0.0, 1.2, 'Art-Net to DMX, 2 ports (U1-A the cut, U1-B the stage floor), behind the cut'),
    'SW-STAGE': (-7.5, 0.0, 1.2, 'switch behind the cut (with NODE-STAGE)'),
    'FOH': (DES['foh']['p'][0], 0.0, DES['foh']['p'][2], 'the lighting + laser desk on the FOH riser at the back of the floor'),
    'SW-FOH': (DES['foh']['p'][0], 0.0, DES['foh']['p'][2], 'switch at the desk'),
}


def power_and_circuits(units):
    sys.argv = [sys.argv[0], '--repo', REPO]
    import epic_plot as EPL                                # the v1.0 engine's circuit planner (imports the v8 engine: ~11 s)
    for k, v in SITES_V11.items():
        EPL.SITES[k] = v
    EPL.WATTS['up-sw3000b'] = 3000
    EPL.WATTS['ext-lc-ultra-mk2'] = 120
    cubes = []
    for f in units:
        if f['type'] == 'ext-lc-ultra-mk2':
            n = int(f['id'][-2:])
            cubes.append({'n': n, 'id': f['id'], 'type': f['type'], 'p': np.array(f['p']), 'beams': f['laser']['beams'], 'power_w': 120, 'ip': f['laser']['ip'], 'artnet': f['laser']['artnet'], 'colour': f['laser']['colour']})
    lamps = [dict(u, part=('smoke' if u.get('part') in ('haze', 'low fog') else u.get('part', 'lamp')), p=np.array(u['p'])) for u in units if u['type'] != 'ext-lc-ultra-mk2']
    circ, ph = EPL.circuits(lamps, cubes)
    cid = {x: c['circuit'] for c in circ for x in c['units']}
    for u in units:
        u['circuit'] = cid.get(u['id'], u.get('circuit'))
    net = EPL.network(cubes)
    net['links'] = [l for l in net['links'] if 'NODE-LEFT' not in str(l['to']) and 'NODE-RIGHT' not in str(l['to'])]
    pw = copy.deepcopy(V10['power']['summary'])
    pw['pa_w'] = 0
    # v1.1's own numbers: connected = the circuits' sum (lighting + smoke + cubes + the network node, as the power map prints it);
    # v1.0's copy said 35 984 W and a supply note with its 21.8 kW running + 4 kW PA (bug fix 2026-10-09)
    pw['connected_w'] = int(sum(c['load_w'] for c in circ))
    pw['pa_note'] = "the sound is the organiser's (owner 10-08 night): v1.0 counted 4.0 kW for the PA; it is on the organiser's own supply plan, not in di's lighting total"
    pw['running_total_w'] = pw['running_total_w'] - V10['power']['summary']['pa_w']
    pw['ok'] = pw['running_total_w'] <= pw['cap_w']
    run_a = pw['running_total_w'] / (3 * 230.0)
    pw['supply'] = ("the factory's own 380 V 3-phase board (owner 10-08: no generator): running %.1f kW with FOH = about %.0f A per phase if balanced; ask for a 3-phase breaker of at least 40 A per phase "
                    "(63 A gives headroom for the smoke machines' warm-up and the discharge lamps' inrush); connected %.1f kW (lighting, smoke, lasers, network); the sound is the organiser's own supply; "
                    "photograph the board today (breakers, phases, earth)" % (pw['running_total_w'] / 1000, run_a, pw['connected_w'] / 1000))
    pw['laser_note'] = 'the cubes at 120 W each from their adapters (ULTRA MK2 manual), 6 W optical (owner 10-08 night)'
    by_site = {}
    for c in circ:
        s = by_site.setdefault(c['distro'], {'distro': c['distro'], 'at': [R3(v) for v in EPL.SITES[c['distro']][:3]], 'what': EPL.SITES[c['distro']][3], 'circuits': 0, 'load_w': 0})
        s['circuits'] += 1
        s['load_w'] += c['load_w']
    return {'summary': pw, 'circuits': circ, 'phases': {k: round(v) for k, v in ph.items()}, 'distros': list(by_site.values()), 'sites': {k: list(v[:3]) + [v[3]] for k, v in EPL.SITES.items()}}, net


# ------------------------------------------------------------------ the pictures
ASH, EMBER = '#e8e4dc', '#ff3a12'
COL = {'the cut': '#ffb08a', 'beams': '#ffd9c8', 'the hall': '#c4553a', 'machines': '#ff6a3a', 'flash': '#e0ff4f', 'air': '#7f9cff', 'lines': '#f5f2ea'}


MASSING_TEXTS = []
CIRCUIT_TEXTS = []                                  # the power map's circuit tags: one that lands on another tag is hidden (the table lists every circuit)


def _declutter(fig, ax):
    """Hide a massing label that sits on another label or runs off the plot (the pictures had labels printed over each
    other and cut at the edge, 2026-10-09). The other labels (crane, cut, zones, solids, circuits, distros) are never hidden."""
    fig.canvas.draw()
    rend = fig.canvas.get_renderer()
    box = lambda t: t.get_window_extent(rend)
    area = ax.get_window_extent(rend)
    mass = set(id(t) for t in MASSING_TEXTS)
    ctx = set(id(t) for t in CIRCUIT_TEXTS)
    keptc = []
    for t in CIRCUIT_TEXTS:                                  # in table order; the first tag of a pile stays
        if any(box(t).overlaps(box(o)) for o in keptc):
            t.set_visible(False)
        else:
            keptc.append(t)
    CIRCUIT_TEXTS.clear()
    fixed = [t for t in ax.texts if id(t) not in mass and t.get_text() and t.get_visible()]
    kept = []
    for t in sorted(MASSING_TEXTS, key=lambda t: -box(t).width * box(t).height):
        b = box(t)
        inside = b.x0 >= area.x0 and b.x1 <= area.x1 and b.y0 >= area.y0 and b.y1 <= area.y1
        if (not inside) or any(b.overlaps(box(o)) for o in fixed + kept):
            t.set_visible(False)
        else:
            kept.append(t)
    MASSING_TEXTS.clear()


def _base(ax, xr, zr, keep_labels=None):
    g = G_NEW
    ax.set_facecolor('#141518')
    for x in g['rows_x_m']:
        for z in sorted(set(g['column_grid_z_m'])):
            if xr[0] - 1 <= x <= xr[1] + 1 and zr[0] - 1 <= z <= zr[1] + 1:
                ax.add_patch(__import__('matplotlib').patches.Rectangle((x - 0.4, z - 0.25), 0.8, 0.5, color='#8a8f98', zorder=2))
    for m in g['massing']:
        (x0, x1), (z0, z1) = m['x_m'], m['z_m']
        lamp = m['id'].startswith('pendant-lamp')
        ax.add_patch(__import__('matplotlib').patches.Rectangle((x0, z0), x1 - x0, z1 - z0, fill=not lamp, fc='#3b342c', ec='#7a6a58' if not lamp else '#5f6670', lw=0.6, zorder=3, alpha=0.9))
        if not lamp and (keep_labels is None or m['id'] in keep_labels) and (x1 - x0) * (z1 - z0) > (0.5 if keep_labels else 1.5) and xr[0] <= (x0 + x1) / 2 <= xr[1] and zr[0] <= (z0 + z1) / 2 <= zr[1]:
            MASSING_TEXTS.append(ax.text((x0 + x1) / 2, (z0 + z1) / 2, '%s\n%g-%g m' % (m['id'], m['y_m'][0], m['y_m'][1]), color='#c9b8a2', fontsize=5.5, ha='center', va='center', zorder=4))
    for name, z in g['zones'].items():
        if name.startswith('_'):
            continue
        (x0, x1), (z0, z1) = z['used']['x_m'], z['used']['z_m']
        ax.add_patch(__import__('matplotlib').patches.Rectangle((x0, z0), x1 - x0, z1 - z0, fill=False, ec={'dance': '#3b6cff', 'stage': '#2fbf5a', 'backstage': '#ff4a3a'}[name], lw=1.2, ls='--', zorder=3))
        ax.text(x0 + 0.2, (z0 + 0.25) if name == 'backstage' else (z1 - 0.6), z['label'], color={'dance': '#7f9cff', 'stage': '#6fe08f', 'backstage': '#ff8a7a'}[name], fontsize=7, zorder=(5 if name == 'backstage' else 9), bbox=(None if name == 'backstage' else dict(fc='#141518', ec='none', alpha=0.8, pad=1)))
    for c in g['cranes']:
        ax.add_patch(__import__('matplotlib').patches.Rectangle((-11.35, c['z_m'] - 1.45), 22.7, 2.9, fc='#d8b400', alpha=0.35, ec='#d8b400', zorder=4))
        ax.text(-11.2, c['z_m'] + (1.6 if c['z_m'] > -20 else -2.3), 'crane bridge z %.2f (girders %.2f-%.2f m)' % (c['z_m'], c['girder_bottom_m'], c['girder_top_m']), color='#ffe066', fontsize=7, zorder=6, bbox=dict(fc='#141518', ec='none', alpha=0.8, pad=1))
    ax.set_xlim(*xr)
    ax.set_ylim(*zr)
    ax.set_aspect('equal')
    ax.tick_params(colors='#9aa0a8', labelsize=7)
    ax.set_xlabel('x (m), house left <- -> house right', color='#9aa0a8', fontsize=8)
    ax.set_ylabel('z (m), -> toward the entry (the audience)', color='#9aa0a8', fontsize=8)


def fig_plan(units, solids, path, xr=(-16, 16), zr=(-44, 32), keep_labels=None, size=(13, 15)):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.patches import Rectangle
    fig, ax = plt.subplots(figsize=size, dpi=130)
    fig.patch.set_facecolor('#0d0e10')
    _base(ax, xr, zr, keep_labels)
    for s in solids:
        x, _, z = s['p']
        sx, _, sz = (0.29, 0, 0.29) if s['kind'] == 'tower' else s['s']
        c = {'rig-crowd-barrier': '#ff4a3a', 'rig-foh-riser': '#7f9cff'}.get(s['id'], '#6fa8ff' if s['id'].startswith('rig-pa-') else '#cccccc')
        ax.add_patch(Rectangle((x - sx / 2, z - sz / 2), sx, max(sz, 0.15), fc=c, ec=c, zorder=7))
        lx, lz = (x - sx / 2 + 0.1, z) if s['id'].startswith('rig-pa-') else (x + sx / 2 + 0.2, z - 0)
        ax.text(lx, lz, {'rig-crowd-barrier': 'barrier', 'rig-foh-riser': 'FOH', 'rig-pa-l': 'spk L\n(organiser)', 'rig-pa-r': 'spk R\n(organiser)', 'rig-tower-cube6': ''}.get(s['id'], s['id']),
                color='#0d0e10' if s['id'].startswith('rig-pa-') else c, fontsize=(7 if xr[1] - xr[0] < 24 else 5), zorder=8, va='center')
    cx, mz = NEW_BOOTH
    ax.add_patch(Rectangle((cx - 1.5, mz - 1.0), 3.0, 2.0, fc='#1fa35a', ec='#6fe08f', zorder=7))
    ax.text(cx, mz, 'DJ step 0.4 m', color='#0d0e10', fontsize=7, ha='center', va='center', zorder=8)
    tx = [TRUSS_NEW.p[0] - TRUSS_NEW.size[0] / 2 * math.cos(TRUSS_NEW_ANGLE), TRUSS_NEW.p[0] + TRUSS_NEW.size[0] / 2 * math.cos(TRUSS_NEW_ANGLE)]
    ax.plot(tx, [TRUSS_NEW.p[2]] * 2, color='#ffb08a', lw=4, zorder=9)
    ax.text(tx[0] + 0.2, TRUSS_NEW.p[2] - 2.0, 'the cut: LOW %.2f m house left -> HIGH %.2f m' % (CUT_ENDS[0], CUT_ENDS[1]), color='#ffb08a', fontsize=7, zorder=11, bbox=dict(fc='#141518', ec='none', alpha=0.85, pad=1))
    for u in units:
        x, y, z = u['p']
        if u['type'] == 'ext-lc-ultra-mk2':
            for b in u['laser']['beams']:
                ax.plot([x, b['to'][0]], [z, b['to'][2]], color=EMBER if u['colour'].lower() == EMBER else ASH, lw=1.0, alpha=0.95, zorder=6)
                ax.plot(b['to'][0], b['to'][2], '*', color=EMBER if u['colour'].lower() == EMBER else '#ffffff', ms=7, zorder=12)
            ax.plot(x, z, 'o', color='#f5f2ea', ms=6, zorder=10)
            ax.text(x + 0.4, z, 'cube %s%s' % (u['id'][-1], ' + tower' if u['id'][-1] == '6' else ''), color='#f5f2ea', fontsize=7, zorder=10)
            continue
        c = COL.get(u.get('layer'), '#cccccc')
        ax.plot(x, z, 's' if u['status'] == 'used' else 'x', color=c, ms=3.2, zorder=10)
    ax.set_title("MOXIR v1.1 - the stage on the owner's new marks (2026-10-08 night): plan, the press end", color='#f5f2ea', fontsize=11, loc='left')
    lines = ['DJ step x -6.7..-3.7, z 3.65..5.65 (his box x -6.3..-4.1, z 3.7..5.6) · speakers = his boxes (L moved +0.4 m off the transformer and trimmed 0.3 m off the step; R moved +0.9 m off the press pedestal)',
             'near crane parked z 0.15 (as found 42.5) · the cut axis x -5.0 · no ash wall: the 6 beams end on the press (z 0.2 face / z 0.8 crown) · far crane z -41 (cubes 1-3)',
             'barrier z 8.2 · floor z 8.2..28 · FOH z 29 · squares = units used, x = held back · lines = the 6 laser beams (one per cube) onto the hall\'s press']
    for i, t in enumerate(lines):
        fig.text(0.07, 0.035 - i * 0.012, t, color='#c9ccd1', fontsize=7.5)
    for t in ax.texts:
        t.set_clip_on(True)
    _declutter(fig, ax)
    fig.savefig(path, facecolor=fig.get_facecolor(), bbox_inches='tight')
    plt.close(fig)


def fig_power(units, P, path):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(19, 17), dpi=120)
    fig.patch.set_facecolor('#0d0e10')
    _base(ax, (-40, 40), (-55, 52))
    fig.subplots_adjust(right=0.68)
    by = {u['id']: u for u in units}
    pal = ['#ff6a3a', '#7f9cff', '#6fe08f', '#ffd166', '#c792ea', '#4dd0e1', '#f78c6c', '#a3be8c', '#ff79c6', '#b0bec5']
    sites = P['sites']
    for i, c in enumerate(P['circuits']):
        col = pal[i % len(pal)]
        src = sites[c['distro']][:3]
        pts = [by[x]['p'] for x in c['units'] if x in by]
        for q in pts:
            ax.plot([src[0], q[0]], [src[2], q[2]], color=col, lw=0.5, alpha=0.45, zorder=5)
            ax.plot(q[0], q[2], 'o', color=col, ms=3, zorder=6)
        if pts:
            m = np.mean(np.array(pts), axis=0)
            CIRCUIT_TEXTS.append(ax.text(m[0], m[2], '%s %d W\n%s' % (c['circuit'], c['load_w'], c['kind']), color=col, fontsize=6, ha='center', zorder=8,
                                         bbox=dict(fc='#0d0e10', ec=col, lw=0.4, alpha=0.8, pad=1.2)))
    for d in P['distros']:
        x, _, z = d['at']
        ax.plot(x, z, 'D', color='#ffffff', ms=9, zorder=9)
        right = x > 20                                                     # D-RIGHT: its label ran off the plot's right edge
        lab = '%s\n%d circuits, %.1f kW connected' % (d['distro'], d['circuits'], d['load_w'] / 1000)
        kw = dict(color='#ffffff', fontsize=8, zorder=12, bbox=dict(fc='#202226', ec='#ffffff', lw=0.6, pad=2))
        if d['distro'] == 'D-STAGE':                                       # its label sat on the circuits C01-C04 labels: move it out, with a leader
            ax.annotate(lab, xy=(x, z), xytext=(-31, 14), ha='left', arrowprops=dict(arrowstyle='-', color='#ffffff', lw=0.6), **kw)
        else:
            ax.text(x - 0.8 if right else x + 0.8, z - 0.8, lab, ha='right' if right else 'left', **kw)
    f = DES['foh']['p']
    ax.plot(f[0], f[2], 's', color='#7f9cff', ms=9, zorder=9)
    ax.text(f[0] + 0.8, f[2], 'FOH (desk, switch, E-stop 1)\n~1.5 kW (v1.0 figure, ASSUMED)', color='#7f9cff', fontsize=8, zorder=9)
    rows = ['%-4s %-8s %-16s %5d W %4.1f A  %5.1f m %3.1f mm2  dV %3.1f %%  %s' % (c['circuit'], c['distro'], c['kind'][:16], c['load_w'], c['amps_230v'], c['cable_m'], c['cable_mm2'], c['vdrop_pct'], c.get('phase', ''))
            for c in P['circuits']]
    fig.text(0.70, 0.88, 'circuit  distro   what             load    amps   cable  section  drop  phase', color='#ffffff', fontsize=7.5, family='monospace')
    for i, r in enumerate(rows):
        fig.text(0.70, 0.865 - i * 0.0135, r, color=pal[i % len(pal)], fontsize=7.5, family='monospace')
    y = 0.865 - len(rows) * 0.0135 - 0.02
    for d in P['distros']:
        fig.text(0.70, y, '%s at x %.1f z %.1f: %d circuits, %.1f kW connected' % (d['distro'], d['at'][0], d['at'][2], d['circuits'], d['load_w'] / 1000), color='#ffffff', fontsize=8)
        y -= 0.016
    for t in ['Runs: the floor along the columns and the hall\'s edges, never across the dance floor;',
              'cable = nearest-neighbour floor run + rises + 10 % (as v1.0); it is the length to order, not a route.',
              'The venue supply lands at D-STAGE (OPEN: where is the board?); D-FAR, D-LEFT, D-RIGHT are 32 A',
              '3-phase sub-feeds from it. FOH ~1.5 kW (desk, switches) on its own 16 A from D-STAGE.',
              'Sound is the organiser\'s (own supply plan).']:
        fig.text(0.70, y, t, color='#c9ccd1', fontsize=7.5)
        y -= 0.014
    s = P['summary']
    ax.set_title('MOXIR v1.1 - POWER NEEDS: where each group needs power, how much (lighting + lasers + smoke; sound = the organiser)', color='#f5f2ea', fontsize=10, loc='left')
    t = ('connected %.1f kW (every unit at its datasheet maximum: what the distros and cables must carry) · running %.1f kW worst look + FOH (ESTIMATE) · cap 30 kW · '
         'per phase %s W · 230 V circuits <= 2944 W, cable H07RN-F, volt drop <= 5 %% (BS 7671 4D2B)' % (sum(c['load_w'] for c in P['circuits']) / 1000, s['running_total_w'] / 1000,
                                                                                                     ' / '.join('%s %d' % kv for kv in P['phases'].items())))
    fig.text(0.07, 0.03, t, color='#c9ccd1', fontsize=7.5, wrap=True)
    for tx in ax.texts:
        tx.set_clip_on(True)
    _declutter(fig, ax)
    fig.savefig(path, facecolor=fig.get_facecolor(), bbox_inches='tight')
    plt.close(fig)


def fig_park(path):
    """Side view (z across, y up) at the press: the cut's high end against the press crown, the v1.0 relation (z 2.15) vs v1.1 (z 0.15)."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.patches import Rectangle
    fig, axs = plt.subplots(1, 2, figsize=(14, 5.6), dpi=130, sharey=True)
    fig.patch.set_facecolor('#0d0e10')
    crown = next(m for m in G_NEW['massing'] if m['id'] == 'press-crown')
    press = next(m for m in G_NEW['massing'] if m['id'] == 'press')
    hung_low = CUT_ENDS[1] - 0.145 - 0.35                  # the high end's bottom chord - a hung PAR's body (stage-line.mjs HUNG_BODY_M)
    for ax, z, tag, verdict in ((axs[0], 2.15, 'v1.0 relation: bridge 1.5 m behind the step (z 2.15)', 'the cut passes 0.27 m over the crown, its hr tie-off 0.14 m: REFUSED (< 0.5 m)'),
                                (axs[1], 0.15, 'v1.1: the bridge 2.0 m further back (z 0.15)', 'line 0.57 m, hr tie-off 0.85 m from the crown: PASSES (>= 0.5 m)')):
        ax.set_facecolor('#141518')
        ax.add_patch(Rectangle((press['z_m'][0], 0), press['z_m'][1] - press['z_m'][0], press['y_m'][1], fc='#2d2d2d', ec='#777', zorder=2))
        ax.add_patch(Rectangle((crown['z_m'][0], crown['y_m'][0]), crown['z_m'][1] - crown['z_m'][0], crown['y_m'][1] - crown['y_m'][0], fc='#454545', ec='#999', zorder=2))
        ax.text(1.7, 4.9, 'press crown\nx 0.1-3.7\n4.2-5.6 m', color='#ddd', fontsize=7, ha='center')
        for dz in (-1.1, 1.1):
            ax.add_patch(Rectangle((z + dz - 0.35, 7.6), 0.7, 0.8, fc='#d8b400', zorder=3))
        ax.add_patch(Rectangle((z - 0.145, CUT_ENDS[1] - 0.145), 0.29, 0.29, fc='#ffb08a', zorder=4))
        ax.plot([z, z], [CUT_ENDS[1] + 0.145, 7.6], color='#ffb08a', lw=1, zorder=3)
        ax.add_patch(Rectangle((z - 0.15, hung_low), 0.3, 0.35, fc='none', ec='#ffb08a', ls='--', zorder=4))
        ax.add_patch(Rectangle((3.65, 0), 2.0, 0.4, fc='#1fa35a', zorder=2))
        ax.text(4.65, 0.55, 'DJ step (at x -6.7..-3.7; drawn for its z)', color='#6fe08f', fontsize=6.5, ha='center')
        ax.set_xlim(-2.5, 7)
        ax.set_ylim(0, 9)
        ax.set_aspect('equal')
        ax.set_title(tag, color='#f5f2ea', fontsize=9, loc='left')
        ax.text(-2.3, 8.6, verdict, color='#ffd166' if 'PASS' in verdict else '#ff6a3a', fontsize=7.5)
        ax.text(z + 0.25, CUT_ENDS[1], "the cut's HIGH end\n(x 0.55, bottom chord %.2f m)" % CUT_ENDS[1], color='#ffb08a', fontsize=7)
        ax.tick_params(colors='#9aa0a8', labelsize=7)
        ax.set_xlabel('z (m): <- far half | entry ->', color='#9aa0a8', fontsize=8)
    axs[0].set_ylabel('y (m)', color='#9aa0a8')
    fig.suptitle("Behind the DJ meets the press: the least change is the crane 2.0 m further back (side view at the press, x 0.1-3.7)", color='#f5f2ea', fontsize=10, x=0.02, ha='left')
    fig.savefig(path, facecolor=fig.get_facecolor(), bbox_inches='tight')
    plt.close(fig)


# ------------------------------------------------------------------ main
CUT_ENDS = (2.89, 6.0)                                      # the v1.1 cut's bottom chord at its ends (stage-line.mjs stageLineRig, ends_b)
TRUSS_NEW_ANGLE = abs(float(np.arctan2(*([math.sin(0.2618), math.cos(0.2618)]))))


def run():
    units, rows = move_units()
    bad = place_checks(units)
    nudged = nudge(units, bad)
    laser_rows = lasers(units)
    n_m, r_nhz = nohd()
    checks = {
        'deltas': {'D_DJ': [R3(v) for v in D_DJ], 'D_CUT': [R3(v) for v in D_CUT]},
        'units': rows, 'nudged': nudged,
        'lasers': laser_rows, 'lasers_pass': all(r['pass'] for r in laser_rows),
        'lasers_min_margin_deg': min(r['margin_after_zone_deg'] for r in laser_rows),
        'lasers_never_over_audience': all(r['max_z_m'] < DES['barrier']['z_m'] for r in laser_rows),
        'laser_count': len(laser_rows), 'laser_beams_per_cube': 1, 'laser_rule_margin_deg_v1_0': 0.5,
        'laser_brightness_6w_one_beam': brightness(units),
        'laser_safety_6w': {'nohd_m': n_m, 'diffuse_nhz_m_off_the_press': r_nhz, 'nohd_unchanged_by_one_beam': True, 'basis': 'IEC 60825-1:2014 Table A.1 (0.25 s aversion, 400-700 nm), 4 mm aperture, 1 mrad; the diffuse figure by the ANSI Z136.1 extended-source formula with rho = the press albedo 0.0407 (hall.json, matte dark; NOT measured). ONE beam carries the whole cube power of 6 W, as the scan-failure case always did, so the NOHD does not change with 1 or 2 beams drawn'},
        'ends_changed': [r for r in rows if 'v1_1_end' in r and r.get('v1_0_end') != r['v1_1_end']],
        'new_blocks': [r for r in rows if r.get('v1_1_end_cls') in ('crane', 'column', 'column head', 'barrier', 'pa', 'stage') and r.get('v1_0_end') != r.get('v1_1_end')],
        'on_the_floor': [u['id'] for u in units if on_floor(u['p']) and u['id'] not in OFF_FLOOR],
        'off_floor_moves': {k: v for k, v in OFF_FLOOR.items()},
        'spotter': spotter(units),
    }
    return units, checks


def rig_file(units, checks, P, net):
    rig = copy.deepcopy(V10)
    rig['snapshot'] = 'moxir-epic-v1-1-2026-10-08'
    rig['version'] = 'MOXIR v1.1'
    rig['what'] = ("MOXIR v1.1: v1.0's lights and lasers (every unit, look, moment, colour, level and DMX unchanged) moved to the owner's new stage at the press end "
                   "(2026-10-08 night), generated by scripts/place/moxir_v1_1.py from rigs/moxir-epic-2026-10-08.json + rigs/moxir-stage-v1-1-2026-10-08.json; the place is hall v9-show-park.")
    rig['plan'] = 'A1 (crane-hung; the cranes move, owner 10-08 night)'
    rig['fallback'] = 'B1 (ground support): a fallback note only'
    rig['cranes'] = {'A1': {'near_z_m': G_NEW['cranes'][0]['z_m'], 'far_z_m': G_NEW['cranes'][1]['z_m'], 'near_as_found_z_m': 42.5}}
    rig['base'] = {'project': 'moxir-v1-0 (MOXIR v1.0) copied to moxir-v1-1', 'hall': 'moxir-hall-2026-10-08-v9-show-park (hall v9 + show-cleared + the v1.1 crane park)',
                   'stage': 'scripts/place/rigs/moxir-stage-v1-1-2026-10-08.json', 'cut': 'scripts/place/rigs/moxir-crane-cut-v1-1-2026-10-08.json'}
    rig['assumed'] = ["the near crane's girder underside: 7.6 m FROM ONE PHOTO (170604, 7.2-8.1), not taped",
                      "the transformer's z (+-3 m) and the press pedestal / press-side cabinets: LOW, tape them (the speaker placeholders were moved off them)",
                      'the press crown 4.2-5.6 m (+-20 %): the park keeps 0.57 m from it', 'the LaserCubes: 6 W (owner 10-08 night) for brightness AND safety',
                      'the hall temperature at night: 0-5 C (measure)', 'the haze reach and sigma (designed for 0.005/m)', 'the distro and FOH places (walk them)']
    rig['fixtures'] = units
    rig['laser_duty'] = 1.0
    rig['lasers_what'] = ("v1.1 (owner 2026-10-09): 6 beams, ONE static beam per LaserCube with the cube's whole 6 W (duty 1); no ash wall, no panel; each beam ends on the hall's "
                          "own press (face z 0.2 or crown z 0.8, >= 3.0 m, z <= 3.3). The 12 beams and the wall of v1.0 are v1.0's record.")
    rig['solids'] = SOLIDS
    rig.pop('plan_b_solids', None)
    rig['stage'] = {'booth_from': list(OLD_BOOTH), 'booth_to': [R3(v) for v in NEW_BOOTH], 'move_booth_by': [R3(v) for v in D_DJ], 'deck_h_m': DES['booth']['deck_h_m'],
                    'design': 'scripts/place/rigs/moxir-stage-v1-1-2026-10-08.json'}
    rig['views'] = {
        'fixedCamera': {'projection': 'perspective', 'position': [-5.2, 1.6, 20.0], 'target': [-5.2, 4.5, -4.0], 'fov': 62, 'zoom': 1, 'near': 0.05, 'far': 400, 'locked': False},
        'viewPresets': [
            {'id': 'floor', 'position': [-5.2, 1.6, 20.0], 'target': [-5.2, 4.5, -4.0], 'fov': 62, 'label': 'Floor z 20'},
            # the viewer's buttons are floor, dj, top, side, rig, crane (smartViewGeometry VIEW_PRESET_IDS); an id outside that list is dropped
            # silently, so the FOH vantage is authored as the Rig button (bug fix 2026-10-09: 'foh' never showed)
            {'id': 'rig', 'position': [-5.2, 2.2, 29.0], 'target': [-5.2, 5.0, -8.0], 'fov': 55, 'label': 'Rig - FOH z 29'},
            {'id': 'dj', 'position': [-5.2, 2.05, 4.6], 'target': [-4.0, 1.6, 18.0], 'fov': 75, 'label': 'DJ'},
            {'id': 'side', 'position': [8.0, 4.5, 12.0], 'target': [-5.2, 3.5, 2.0], 'fov': 60, 'label': 'Side'},
            {'id': 'top', 'position': [-2.0, 70.0, -4.0], 'target': [-2.0, 0.0, -5.0], 'fov': 70, 'label': 'Top'},
            {'id': 'crane', 'position': [-1.0, 8.5, 16.0], 'target': [-5.2, 2.8, 2.0], 'fov': 55, 'label': 'Crane'}]}
    rig['power'] = P
    rig['network'] = dict(V10['network'], links=net['links'])
    rig['checks_v1_1'] = checks
    rig['crew'] = crew_of(checks)
    _retext(rig)
    rig['entrance'] = ENTRANCE
    rig['organiser'] = ORGANISER
    rig['schema'] = V10['schema'] + ' v1.1 adds: stage (the booth move), views (the room buttons), checks_v1_1, crew, entrance, organiser.'
    return rig


def crew_of(checks):
    sp = checks['spotter']['chosen']
    where = 'x %g, z %g' % (sp['at'][0], sp['at'][1])
    return [
        {'who': 'the owner (Dob)', 'role': 'laser content: the scanner programmer (LaserOS cues per moment); not the operator on the E-stop', 'where': 'FOH'},
        {'who': 'Emilya', 'role': 'lights: the lighting operator on the desk (the 13 cues, GO by the music), the looks', 'where': 'FOH'},
        {'who': 'Dima', 'role': 'tech + laser: the laser operator, holds E-STOP 1 at FOH; the cubes, the network, the power-on checks', 'where': 'FOH (E-stop 1); the cubes on the build day'},
        {'who': 'Kira', 'role': 'volunteer: the laser SPOTTER with E-STOP 2 at %s (behind the barrier; with FOH sees >= %d %% of every beam; chosen by the v1.1 sight-line cast, not v1.0\'s x -9, z 12 which is on the v1.1 dance floor)' % (where, int(sp['with_foh_min'] * 100)), 'where': where},
        {'who': 'Eter', 'role': "volunteer: smoke runs (the 4 UP-YZ31P: refill, the burst timer), the barrier line with the organiser's security, the artists' route kept clear", 'where': 'roaming; smoke 4 behind the stage, 1-2 in the far nave, 3 at the press'},
        {'who': "the organiser (MOXIR)", 'role': 'tickets, the event safety lead (and the laser safety officer named on the permit, if not Dima), security, the sound (Poligraf), the power board and the electrician', 'where': '-'}]


def _retext(rig):
    """v1.0's texts that name the 12 lines, the 2 beams per cube or the ash wall: rewritten for v1.1 (the structure of the data is unchanged)."""
    subs = [('all 12 laser lines', 'all 6 laser lines'), ('all 12 lines', 'all 6 lines'), ('never all 12', 'never all 6'),
            ('the cube drawing a single point (duty ~0.9)', 'the cube drawing its one point (duty 1)'), ('duty ~0.9', 'duty 1'),
            ('one beam (6a)', 'its one beam (6a)'), ('to the wall behind the DJ', 'to the press'), ('to graze the ash wall', "to graze the hall's press face"),
            ('the 4 grazers, ember 5-15 %', 'the 4 back grazers on the press face, ember 5-15 %')]
    def walk(o):
        if isinstance(o, dict):
            for k in list(o):
                v = o[k]
                if k == 'ash wall':                                  # a look part / console fader named after the wall
                    o['press graze'] = o.pop(k)
                    v = o['press graze']
                    k = 'press graze'
                o[k] = walk(v)
            return o
        if isinstance(o, list):
            return [walk(x) for x in o]
        if isinstance(o, str):
            for a, b in subs:
                o = o.replace(a, b)
            return 'press graze' if o == 'ash wall' else o
        return o
    for key in ('looks', 'moments', 'arc', 'console', 'concept'):
        rig[key] = walk(rig[key])
    return rig


ENTRANCE = {'owner_2026_10_08': '"not the big door from the video; it\'s the one before and close to the dance floor, not the backstage part"',
            'candidate': 'SUSPECTED: the side gate with the mesh door through a side span (today\'s way in, 20261008_164131.mp4 t=36 s -> t=58 s -> the nave), NOT placed: no fitted view; the 10-08 site layer fixed_not_placed side-gate-mesh-door',
            'needs': 'which long wall and its z: one photo of the gate from inside the nave with two columns in frame, or a tape from the nearest column line; it must open onto the dance floor (z 8-28) side, the press end (z < 8) kept for the artists',
            'keep': 'the artists\' side (the press end, z < 8, the far gate SE) clear of the audience route'}
ORGANISER = ["tickets", "the event safety lead and the crowd-safety plan (the barrier's final line)", "the sound (Poligraf): the speaker boxes are placeholders at the owner's marks",
             "the venue's power board, the electrician, the supply point", "the crane operator, its inspection paper and lock-out", "the laser permit (issuer, number)"]


if __name__ == '__main__':
    units, checks = run()
    if A.check:
        print(json.dumps(checks, indent=1, default=float))
        sys.exit(0)
    P, net = power_and_circuits(units)
    rig = rig_file(units, checks, P, net)
    json.dump(rig, open(os.path.join(REPO, A.rig_out), 'w'), indent=1, default=float)
    print('rig', A.rig_out, '·', len(units), 'units ·', len(SOLIDS), 'solids · lasers pass', checks['lasers_pass'], 'min margin', checks['lasers_min_margin_deg'], 'deg')
    if A.out:
        od = os.path.expanduser(A.out)
        os.makedirs(od, exist_ok=True)
        fig_plan(units, SOLIDS, os.path.join(od, 'v1-1-plan.png'))
        fig_plan(units, SOLIDS, os.path.join(od, 'v1-1-plan-stage.png'), xr=(-14, 8), zr=(-6, 31),
                 keep_labels={'press', 'press-crown', 'press-pedestal', 'transformer', 'press-side-cabinets', 'roller-conveyor', 'machine-line'}, size=(11, 15))
        fig_power(units, P, os.path.join(od, 'v1-1-power-needs.png'))
        fig_park(os.path.join(od, 'v1-1-crane-vs-press.png'))
        json.dump(checks, open(os.path.join(od, 'v1-1-checks.json'), 'w'), indent=1, default=float)
        print('pictures in', od)
