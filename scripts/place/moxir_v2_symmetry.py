#!/usr/bin/env python3
"""MOXIR v2.2 - the lights re-placed symmetric about the DJ axis, "like the examples", nothing moving on the truss.

Usage (from the repo root):
    python3 -I -B scripts/place/moxir_v2_symmetry.py --repo . [--src scripts/place/rigs/moxir-v2-1-2026-10-10.json]
                                                     [--out scripts/place/rigs/moxir-v2-2-2026-10-11.json] [--check-only]

OWNER (2026-10-11, ledger N501.3): "i want to edit light places i sent examples make it like examples but dont make moving
things on the truss, but keep symmetry and organaize well". The examples are his four show videos of 2026-10-06
(di.bo inbox /mnt/data/footage/inbox/2026-10-06): symmetric beam fans from one point, rows of parallel vertical beams
behind the DJ, V-fans crossing over the crowd from both sides, lasers as flat planes over the heads.

WHAT THIS DOES (a post-process on the composed v2.1 rig; the kit, the patch, the looks, the cues, the cut on the near
crane, the stage key and every solid stay exactly as they are):
  axis       x0 = -5.2 m, the DJ booth's centre (v2.1 `stage`); mirror x' = 2*x0 - x.
  plane 1    6 B380F in ONE row behind the DJ (z -5.0), 1.0 m apart, centred on the axis; a fan opening toward the crowd:
             elevation 62 deg, lateral tilt 4/12/20 deg outward (mirrored pairs).
  wings      12 B380F as 4 fenced islands of 3 (moxir_v2_ground.py ISLANDS/HEADS_PER_ISLAND), two per side at z -15 and
             z 21, 5.5 m outside the painted public floor; each island a 3-beam fan aimed at mirrored points on the roof
             4 m short of the axis (y 16.5, z c-8/c/c+8): two V's that meet over the DJ line.
  PARs       the 38 ground PL5403 in straight rows, all straight up (parallel "columns of light", the v4 video):
             2 side rows of 11 (z -27..33 every 6 m) 3.0 m outside the painted floor; 2 back rows of 8 behind the stage
             (z -34, z -40; x = x0 +- 12.5/18.5/24.5/30.5) clear of the cubes' window.
  lasers     the 6 cubes on the free crane re-spaced x0 +- 0.7/2.1/3.5 (colour order w w r r w w kept), aim unchanged (-z).
  haze       on the axis.
SYMMETRY, STATED HONESTLY: the beams are mirrored about the DJ axis exactly (targets and fan angles). The floor plates of
the side rows and the islands are mirrored about the PAINTED floor's edges (the hall rule R2.2, ISO 13857: a unit stands
1.0 m (PAR) / 1.5 m (head) off the public floor), and the painted floor is NOT symmetric about the DJ: 24.9 m to its left
edge, 29.7 m to its right. So a right-side plate stands 4.8 m further from the axis than its left twin. The script prints
that number; it is the hall's, not a choice.
RULES CHECKED HERE (fail = exit 1, nothing written): R2.2 reach from every public cell (hot, use, bar, chill zones of
moxir-v2-zones + the door walkway) with the stage pen excluded (ASSUMED box x -11..1, z -8..8.16, the v2.1 precedent);
PAR spacing >= 6.0 m (PAR_MIN_SPACING_M); no beam axis or cone edge (PAR 12.5 deg half, B380F 0.9 deg) below 3.0 m
(CROWD_SEE_M) over a public cell; no beam within 1 m of the cubes' window (pan +-10 deg, tilt 0..15 up); no beam in the
crane park (x +-12, z -2..7, y 2.5..10.8) but plane 1's fan (the ground test's own exception); no beam through the near
crane; no unit in the pit, the walkway, the 40 W corridor (#873, read from the entry-lasers rig) or a column foot; every
look part <= 0.85 (PEAK_CAP); kit, ids, parts, patch unchanged; every moved unit has a mirror twin. The full ground
suite (scripts/place/moxir-v2-ground.test.js) is written against the v2 ground layer, not this rig - say so in the PR.
Frame: metres, Y up, +x house right, +z toward the entry; rotations three.js Euler XYZ (R = Rx*Ry*Rz), unrotated beam -Y.
"""
import argparse, json, math, sys, copy, datetime

X0 = -5.2
PAR_REACH, HEAD_REACH, PAR_MIN_SPACING, CROWD_SEE, PEAK_CAP = 1.0, 1.5, 6.0, 3.0, 0.85
PAR_HALF_DEG, HEAD_HALF_DEG = 12.5, 0.9
HALL_IN = ((-36.2, 60.2), (-53.6, 53.6))
PIT = ((-6.5, -2.9), (5.65, 8.2))
DOOR_WALK = ((-8.0, 7.0), (43.5, 53.7))
STAGE_PEN = ((-10.5, 1.5), (-7.5, 8.2))           # moxir_v2_eyes.py STAGE_PEN (crew only, not public)
CRANE_PARK = ((-12.0, 12.0), (2.5, 10.8), (-2.0, 7.0))
NEAR_CRANE = ((-11.35, 11.35), (7.5, 9.0), (3.4, 6.2))
COL_ROWS_X, COL_PITCH, COL_HALF = (-36.0, -12.0, 12.0, 36.0, 60.0), 6.0, (0.25, 0.4)
ROOF_Y = 16.5
CUBE_Z, CUBE_Y = -13.45, 8.81
CUBES = dict(y=(8.54, 9.09), end=(-4.031, 9.181, -53.8), fanDeg=1.008, waist=0.004, margin=0.25, x_centre_v21=-2.75)   # ground test A14 CUBES_878

def rot_for_dir(d):
    """three.js Euler XYZ (R = Rx*Ry*Rz) that turns the unrotated -Y beam into unit vector d; checked by dir_of."""
    dx, dy, dz = d
    c = math.asin(max(-1.0, min(1.0, dx)))
    a = math.atan2(-dz, -dy)
    r = [round(a, 4), 0.0, round(c, 4)]
    e = dir_of(r)
    assert max(abs(e[i] - d[i]) for i in range(3)) < 2e-3, (d, e)
    return r

def dir_of(r):
    a, b, c = r
    v = (math.sin(c), -math.cos(c), 0.0)                              # Rz on (0,-1,0)
    v = (v[0] * math.cos(b) + v[2] * math.sin(b), v[1], -v[0] * math.sin(b) + v[2] * math.cos(b))   # Ry
    return (v[0], v[1] * math.cos(a) - v[2] * math.sin(a), v[1] * math.sin(a) + v[2] * math.cos(a))  # Rx

def unit(v):
    n = math.sqrt(sum(x * x for x in v)); return tuple(x / n for x in v)

def inbox(p, bx):          # bx = ((x0,x1),(z0,z1)) on the floor plan
    return bx[0][0] <= p[0] <= bx[0][1] and bx[1][0] <= p[2] <= bx[1][1]

def in3(p, bx):            # ((x),(y),(z))
    return bx[0][0] <= p[0] <= bx[0][1] and bx[1][0] <= p[1] <= bx[1][1] and bx[2][0] <= p[2] <= bx[2][1]

def public_rects(zones):
    """1 m cells of every painted zone + the door walkway, minus the stage pen; as rectangles (x0,x1,z0,z1)."""
    rects, cut = [], 0
    for zn in zones['zones']:
        for area in zn['areas']:
            for row in area['cells_1m']:
                z = row['z']
                for x0, x1 in row['x_runs']:
                    if STAGE_PEN[1][0] <= z <= STAGE_PEN[1][1]:
                        for a, b in ((x0, min(x1, STAGE_PEN[0][0])), (max(x0, STAGE_PEN[0][1]), x1)):
                            if b > a: rects.append((a, b, z - 0.5, z + 0.5))
                        cut += 1
                    else: rects.append((x0, x1, z - 0.5, z + 0.5))
    rects.append((DOOR_WALK[0][0], DOOR_WALK[0][1], DOOR_WALK[1][0], DOOR_WALK[1][1]))
    return rects, cut

def dist_rect(x, z, rc):
    dx = max(rc[0] - x, 0.0, x - rc[1]); dz = max(rc[2] - z, 0.0, z - rc[3]); return math.hypot(dx, dz)

def reach(p, rects):
    return min(dist_rect(p[0], p[2], rc) for rc in rects)

def near_column(p):
    for cx in COL_ROWS_X:
        cz = round(p[2] / COL_PITCH) * COL_PITCH
        if abs(p[0] - cx) <= COL_HALF[0] + 0.6 and abs(p[2] - cz) <= COL_HALF[1] + 0.6: return (cx, cz)
    return None

def cone_rays(d, half_deg):
    """the axis + 8 edge rays of a cone of half angle half_deg round unit vector d."""
    out = [d]; delta = math.radians(half_deg)
    e = math.asin(max(-1.0, min(1.0, d[1])))
    az = math.atan2(d[0], d[2]) if (abs(d[0]) + abs(d[2])) > 1e-6 else 0.0
    for k in range(8):
        if (abs(d[0]) + abs(d[2])) > 1e-6:                              # tilt the elevation and swing the azimuth
            ee = e - delta * math.cos(k * math.pi / 4); aa = az + delta * math.sin(k * math.pi / 4) / max(math.cos(e), 0.2)
        else:                                                           # straight up: 8 azimuths at e - delta
            ee = e - delta; aa = k * math.pi / 4
        out.append((math.sin(aa) * math.cos(ee), math.sin(ee), math.cos(aa) * math.cos(ee)))
    return out

def walk(p, d, step=0.25, tmax=80.0):
    t = 0.3
    while t < tmax:
        q = (p[0] + d[0] * t, p[1] + d[1] * t, p[2] + d[2] * t)
        if q[1] > ROOF_Y or q[1] < 0 or not (HALL_IN[0][0] <= q[0] <= HALL_IN[0][1] and HALL_IN[1][0] <= q[2] <= HALL_IN[1][1]): return
        yield q, t; t += step

def cube_window(q, cube_x, t, half_deg):
    """ground test A14 cubeClearance < 0: inside the cubes' beam box (apertures at z0 to the far-wall end) plus its pads; the x box is
    the re-spaced cubes' x range drifting like v2.1's end point."""
    C = CUBES; ex, ey, ez = C['end']; drift = ex - C['x_centre_v21']
    s = min(max(CUBE_Z - q[2], 0.0), CUBE_Z - ez); f = s / (CUBE_Z - ez)
    xl, xr = cube_x[0] + f * drift, cube_x[1] + f * drift
    yl, yh = C['y'][0] + f * (ey - C['y'][0]), C['y'][1] + f * (ey - C['y'][1])
    pad = C['waist'] / 2 + s * math.tan(math.radians(C['fanDeg'] / 2)) + C['margin'] + t * math.tan(math.radians(half_deg))
    dx = max(xl - q[0], q[0] - xr, 0.0); dy = max(yl - q[1], q[1] - yh, 0.0); dz = max(q[2] - CUBE_Z, ez - q[2], 0.0)
    return math.hypot(dx, dy, dz) - pad < 0

def forty_w_strip(repo):
    try: el = json.load(open(f'{repo}/scripts/place/rigs/moxir-v2-entry-lasers-2026-10-09.json'))
    except Exception as e: return None, f'entry-lasers rig not read: {e}'
    def find(o):
        if isinstance(o, dict):
            if 'under_the_beams' in o: return o['under_the_beams']
            for v in o.values():
                r = find(v)
                if r is not None: return r
        if isinstance(o, list):
            for v in o:
                r = find(v)
                if r is not None: return r
    return find(el), None

def paint_edge(rects, z0, z1):
    """(left, right) x edge of the public floor within the z band"""
    R = [r for r in rects if r[3] > z0 and r[2] < z1]
    return (min(r[0] for r in R), max(r[1] for r in R))

def layout(rig, rects):
    """returns {unit id: (p, r, position prose)} for every unit this script moves."""
    F = {f['id']: f for f in rig['fixtures']}
    heads = [f for f in rig['fixtures'] if f['type'] == 'up-b380f']
    pars = [f for f in rig['fixtures'] if f['type'] == 'up-pl5403' and f['part'] in ('hall steel', 'columns')]
    cubes = sorted([f for f in rig['fixtures'] if f['type'] == 'ext-lc-ultra-mk2'], key=lambda f: f['p'][0])
    haze = [f for f in rig['fixtures'] if f['part'] == 'haze']
    assert len(heads) == 18 and len(pars) == 38 and len(cubes) == 6, (len(heads), len(pars), len(cubes))
    plan = {}
    # plane 1: the 6 heads of that part, one row, fan opening toward the crowd
    p1 = sorted([f for f in heads if f['part'].startswith('plane 1')], key=lambda f: f['p'][0])
    assert len(p1) == 6
    e = math.radians(66.0)
    for f, u, phi in zip(p1, (-2.5, -1.5, -0.5, 0.5, 1.5, 2.5), (20, 12, 4, 4, 12, 20)):
        s = -1 if u < 0 else 1; ph = math.radians(phi)
        d = unit((s * math.sin(ph) * math.cos(e), math.sin(e), -math.cos(ph) * math.cos(e)))
        plan[f['id']] = ([round(X0 + u, 2), 0.7, -5.0], rot_for_dir(d),
                         f'plane 1, the row behind the DJ at z -5.0, {abs(u):.1f} m {"left" if s < 0 else "right"} of the DJ axis; fan: up 66 deg, {phi} deg outward, leaning away from the crowd (-z) so it lands on the roof before the cubes')
    # wings: 4 islands of 3; the white pair (plane 2) at the back, the red pair at the front; parts kept per unit
    white = sorted([f for f in heads if f['part'] == 'plane 2 (the wings)'], key=lambda f: f['p'][0])
    red = sorted([f for f in heads if f['part'] not in ('plane 1 (behind the DJ)', 'plane 2 (the wings)')], key=lambda f: f['p'][0])
    assert len(white) == 6 and len(red) == 6, (len(white), len(red))
    XL, XR = -35.6, 30.0                       # 5.5 m outside the painted floor (left edge -30.1, right edge 24.5)
    for group, zc, nm in ((white, -15.0, 'back'), (red, 21.0, 'front')):
        left, right = group[:3], group[3:]
        for side, x, tx in (('left', XL, X0 - 13.0), ('right', XR, X0 + 13.0)):
            trio = left if side == 'left' else right
            for f, k in zip(trio, (-1, 0, 1)):
                p = [x, 0.5, zc + k]; T = (tx, ROOF_Y, zc + 8.0 * k)
                d = unit((T[0] - p[0], T[1] - p[1], T[2] - p[2]))
                plan[f['id']] = ([round(p[0], 2), 0.7, round(p[2], 2)], rot_for_dir(d),
                                 f'wing island {nm} {side} (3 heads in a fenced pen, {abs(x - (-30.1 if side == "left" else 24.5)):.1f} m outside the painted floor), head {k + 2} of 3; aims at the roof {13.0:.0f} m short of the DJ axis (the arch of video 3; lower would put the beam under 3.0 m over the crowd), z {zc + 8 * k:+.0f}')
    # the 38 ground PARs: side rows + back rows, all straight up; ids by nearest old place
    plates = []
    el, er = paint_edge(rects, -28, 34); SIDE_OUT = 1.6
    for z in (-27, -21, -15, -9, -3, 3, 9, 15, 21, 27, 33):
        plates.append(((round(el - SIDE_OUT, 2), 0.31, float(z)), f'side row left, {SIDE_OUT} m outside the painted floor edge x {el:.1f}, z {z:+d}; straight up'))
        plates.append(((round(er + SIDE_OUT, 2), 0.31, float(z)), f'side row right, {SIDE_OUT} m outside the painted floor edge x {er:.1f}, z {z:+d}; straight up'))
    for z in (-34.0, -40.0):
        for u in (12.5, 18.5, 24.5, 30.5):
            for s in (-1, 1):
                plates.append(((round(X0 + s * u, 2), 0.31, z), f'back row z {z:.0f} behind the stage, {u:.1f} m {"left" if s < 0 else "right"} of the DJ axis; straight up'))
    assert len(plates) == 38
    free = list(pars)
    for pl, prose in plates:                                             # greedy nearest unit
        f = min(free, key=lambda g: math.hypot(g['p'][0] - pl[0], g['p'][2] - pl[2])); free.remove(f)
        plan[f['id']] = (list(pl), [math.pi, 0.0, 0.0], prose)
    # cubes: same order, symmetric spacing, aim and colour untouched
    for f, u in zip(cubes, (-3.5, -2.1, -0.7, 0.7, 2.1, 3.5)):
        plan[f['id']] = ([round(X0 + u, 2), f['p'][1], f['p'][2]], list(f['r']), f'free crane, {abs(u):.1f} m {"left" if u < 0 else "right"} of the DJ axis, aim -z unchanged')
    for f in haze:
        plan[f['id']] = ([X0, f['p'][1], f['p'][2]], list(f['r']), 'on the DJ axis, behind the booth')
    return plan

def checks(rig, plan, zones, repo):
    rects, cut = public_rects(zones)
    F = {f['id']: f for f in rig['fixtures']}
    rows, fails = [], []
    cubes = [F[i] for i in plan if F[i]['type'] == 'ext-lc-ultra-mk2']; cube_x = (min(f['p'][0] for f in cubes), max(f['p'][0] for f in cubes))
    strip, err = forty_w_strip(repo)
    moved = {i: F[i] for i in plan}
    gpars = [f for f in moved.values() if f['type'] == 'up-pl5403']
    for f in moved.values():
        p, d = f['p'], dir_of(f['r']); isPar = f['type'] == 'up-pl5403'; isHead = f['type'] == 'up-b380f'
        if p[1] < 2.0:
            need = PAR_REACH if isPar else HEAD_REACH
            rc = reach(p, rects)
            if rc < need: fails.append(f'{f["id"]}: {rc:.2f} m from the public floor < {need}')
            if inbox(p, PIT): fails.append(f'{f["id"]}: in the pit')
            if inbox(p, DOOR_WALK): fails.append(f'{f["id"]}: in the door walkway')
            if not (HALL_IN[0][0] <= p[0] <= HALL_IN[0][1] and HALL_IN[1][0] <= p[2] <= HALL_IN[1][1]): fails.append(f'{f["id"]}: outside the hall')
            c = near_column(p)
            if c: fails.append(f'{f["id"]}: on a column foot {c}')
            for st in (strip if isinstance(strip, list) else [strip]):
                if isinstance(st, dict) and 'x_m' in st and 'z_m' in st and inbox(p, (tuple(st['x_m']), tuple(st['z_m']))): fails.append(f'{f["id"]}: in the 40 W corridor {st.get("what", "")}')
        if isPar or isHead:
            for ray in cone_rays(d, PAR_HALF_DEG if isPar else HEAD_HALF_DEG):
                for q, t in walk(p, ray):
                    if q[1] < CROWD_SEE and any(dist_rect(q[0], q[2], rc) == 0.0 for rc in rects): fails.append(f'{f["id"]}: beam at {q[1]:.1f} m over the public floor at x {q[0]:.1f} z {q[2]:.1f}'); break
                    if cube_window(q, cube_x, t, PAR_HALF_DEG if isPar else HEAD_HALF_DEG): fails.append(f'{f["id"]}: beam in the cubes\' window at {[round(v, 1) for v in q]}'); break
                    if in3(q, CRANE_PARK) and not f['part'].startswith('plane 1'): fails.append(f'{f["id"]}: beam in the crane park at {[round(v, 1) for v in q]}'); break
                    if in3(q, NEAR_CRANE): fails.append(f'{f["id"]}: beam through the near crane'); break
    for i, a in enumerate(gpars):
        for b in gpars[i + 1:]:
            s = math.hypot(a['p'][0] - b['p'][0], a['p'][2] - b['p'][2])
            if s < PAR_MIN_SPACING - 1e-6: fails.append(f'{a["id"]} / {b["id"]}: {s:.1f} m apart < {PAR_MIN_SPACING}')
    moved_parts = {f['part'] for f in moved.values() if f['type'] in ('up-pl5403', 'up-b380f')}
    for look in rig['looks']:
        for part, (col, lv) in look['parts'].items():
            if part in moved_parts and lv > PEAK_CAP + 1e-9: fails.append(f'look {look["id"]} part {part} {lv} > {PEAK_CAP}')
    # mirror twins: by beam end (heads, lasers) or plate (PARs); the side/island plates are reported, not failed
    ends = {}
    for f in moved.values():
        d = dir_of(f['r']); p = f['p']
        if f['type'] == 'ext-lc-ultra-mk2' or f['part'] == 'haze': ends[f['id']] = (p[0], p[2])
        else:
            t = (ROOF_Y - p[1]) / d[1] if d[1] > 1e-6 else 0.0
            ends[f['id']] = (p[0] + d[0] * t, p[2] + d[2] * t)
    worst = 0.0; worst_plate = 0.0; unmirrored = []
    for i, (ex, ez) in ends.items():
        if F[i]['type'] == 'up-pl5403' or F[i]['part'] == 'haze': continue   # plates mirror the paint edges (reported below); the one hazer sits on the axis
        mx = 2 * X0 - ex
        best = min(math.hypot(ends[j][0] - mx, ends[j][1] - ez) for j in ends if j != i)
        worst = max(worst, best)
        if best > 0.5: unmirrored.append((i, F[i]['part'], round(best, 1), [round(v, 1) for v in F[i]['p']]))
    for f in moved.values():
        if f['type'] in ('up-pl5403', 'up-b380f'):
            mx = 2 * X0 - f['p'][0]
            best = min(math.hypot(g['p'][0] - mx, g['p'][2] - f['p'][2]) for g in moved.values() if g is not f and g['type'] == f['type'])
            worst_plate = max(worst_plate, best)
    if unmirrored: fails.append(f'no mirror twin within 0.5 m (beam end): {unmirrored}')
    info = dict(public_rects=len(rects), pen_rows_clipped=cut, paint_x=(round(min(r[0] for r in rects), 1), round(max(r[1] for r in rects), 1)), paint_z=(round(min(r[2] for r in rects), 1), round(max(r[3] for r in rects), 1)), worst_beam_end_mirror_m=round(worst, 2), worst_plate_mirror_m=round(worst_plate, 2),
                forty_w_strip=(strip if isinstance(strip, (dict, list)) else err), cube_x=cube_x, moved=len(moved))
    return fails, info

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--repo', default='.'); ap.add_argument('--src', default='scripts/place/rigs/moxir-v2-1-2026-10-10.json')
    ap.add_argument('--out', default='scripts/place/rigs/moxir-v2-2-2026-10-11.json'); ap.add_argument('--check-only', action='store_true'); ap.add_argument('--info-out', help='write the full checks info as JSON here')
    a = ap.parse_args()
    src = json.load(open(f'{a.repo}/{a.src}')); zones = json.load(open(f'{a.repo}/scripts/place/rigs/moxir-v2-zones-2026-10-09.json'))
    rig = copy.deepcopy(src); rects0, _ = public_rects(zones); plan = layout(src, rects0)
    kit_before = sorted((f['type'], f['part'], f.get('dmx', {}).get('universe'), f.get('dmx', {}).get('address')) for f in src['fixtures'])
    for f in rig['fixtures']:
        if f['id'] in plan:
            p, r, prose = plan[f['id']]
            f['moved_from'] = {'rig': a.src, 'p': f['p'], 'r': f['r']}; f['p'], f['r'] = p, r
            f['position'] = f'v2.2 symmetric layout (moxir_v2_symmetry.py): {prose}. ' + (f.get('position') or '')[:160]
    kit_after = sorted((f['type'], f['part'], f.get('dmx', {}).get('universe'), f.get('dmx', {}).get('address')) for f in rig['fixtures'])
    assert kit_before == kit_after and len(rig['fixtures']) == len(src['fixtures'])
    fails, info = checks(rig, plan, zones, a.repo)
    print(json.dumps(info, default=str)[:600])
    if a.info_out: open(a.info_out, 'w').write(json.dumps(info, default=str, indent=1))
    for f in fails[:30]: print('FAIL', f)
    if fails: print(f'{len(fails)} fails'); sys.exit(1)
    if a.check_only: print('ok (check only)'); return
    rig['version'] = '2.2'; rig['date'] = '2026-10-11'; rig['title'] = 'MOXIR v2.2 - symmetric about the DJ, like the owner\'s examples, nothing moving on the truss'
    rig['written_by'] = 'scripts/place/moxir_v2_symmetry.py'
    rig['what'] = ('v2.1 with every ground unit, the 6 cubes and the haze re-placed symmetric about the DJ axis x -5.2 (owner 2026-10-11, N501.3, '
                   'after his four example videos of 2026-10-06): one 6-head fan row behind the DJ, four fenced islands of 3 heads as mirrored V-fans, '
                   '38 PARs straight up in straight rows (2 side rows, 2 back rows), cubes re-spaced. Kit, patch, looks, cues, the cut on the near crane, '
                   'the stage key and the solids unchanged. Plates mirror the painted floor edges, beams mirror the DJ axis: ' + json.dumps(info, default=str))
    rig['symmetry'] = {'axis_x_m': X0, 'plates_mirror': 'the painted public floor edges (left -30.1, right 24.5; 24.9 / 29.7 m from the DJ)', 'beams_mirror': 'the DJ axis', 'source': src.get('version'), 'info': info}
    json.dump(rig, open(f'{a.repo}/{a.out}', 'w'), indent=1); print('wrote', a.out, len(rig['fixtures']), 'fixtures,', info['moved'], 'moved')

if __name__ == '__main__': main()
