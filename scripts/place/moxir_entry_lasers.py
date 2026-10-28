#!/usr/bin/env python3
# moxir_entry_lasers.py — MOXIR v2 (2026-10-09): the two Poligraf UP-LA40WF lasers UP at the ENTRY end, aimed back toward the stage.
#
#   python3 -I scripts/place/moxir_entry_lasers.py --repo . [--out ~/Downloads/moxir/v2-entry-lasers]   # rig json + setup sheet + pictures
#   python3 -I scripts/place/moxir_entry_lasers.py --repo . --check                                       # the numbers as JSON, no files
#
# THE OWNER (2026-10-09 ~20:30, ledger N460.2 / N462): "2 lasers from poli goes to the up to the entrance, where audience will enter,
#   so 2 from one side 6 from other". So 2 x UP-LA40WF (Poligraf rental, 40 W full colour) go UP at the entry end (the audience door,
#   z +54), aimed back toward the stage; the 6 LaserCubes stay on the free crane at z -12, aimed toward the entry.
# THE OWNER AGAIN (21:1x, N464, via the lead): "we dont need to hange laser put on the crane": the cubes sit ON TOP of the free crane's
#   bridge (aperture about 8.9 m, range 8.5-9.0), no bar and no drop frame under it; their new aims (over the near crane, ending on the
#   entry wall above 10.2 m) are being designed elsewhere. So here: no laser hang under the bridge; the cubes are a KEEP-OUT box on the
#   bridge top (the whole bridge length, y 8.3-9.4); the old cube tubes (aerial-far-crane.json) are NOT used; this script hands back
#   the KEEP-OUT ENVELOPE of the two units, their mount and their beams, for the cube terminations to stay >= 0.25 m clear of.
#
# THE RULE: the cubes' rule set, unchanged (moxir_v1_1.py "the lasers", docs/moxir/MOXIR.md 4.0a; owner N411 + N412):
#   IEC 60825-1 (MPE 25.5 W/m2 at 0.25 s), IEC TR 60825-3 (laser shows), the ILDA audience-scanning guidance, HSE HS(G)95.
#   A person = the standing surface + 2.0 m. The beam is >= 3.0 m above every place a person can stand OR >= 2.5 m beside its
#   footprint (the same 13 places as the cubes: the whole floor, the DJ step 0.4, the FOH riser 0.6, the entry platform + stairs,
#   galleries 1-4, the roller conveyor, both runway walkways, the near crane's cab). The beam is a TUBE: the 0.8 deg fan (0.3 deg
#   controller zone + 0.5 deg mount tolerance, review B2) + the unit's own aperture and divergence. Heights are the SAFE ends of the
#   model's ranges: near crane underside 7.2 (7.2-8.1), free crane underside 7.69 (7.69-8.24), lowest pendant lamp 9.0 (9.0-10.0).
#   Every ray of the axis + 60 rays over the fan (occlusion_lib.AREA_RINGS) is cast against the hall's 55 728 triangles
#   (Moller & Trumbore 1997) + the rig's boxes, and must FIRST hit matte block: never glass, skylight, steel, a crane, the truss,
#   a lamp, a cube, the other unit or people.
# WHAT THESE TWO ADD TO IT (each named; each on the safe side):
#   - the end is on the FAR (SE) end wall (z -53.8), 105 m away: the artists' gate (4.8 x 5.4 m, x -2.4..2.4) is treated like a
#     place: the whole fan ends >= 2.5 m beside its opening, or >= 3.0 m over its top (8.4 m);
#   - the free crane's cab (z -12, x 8.35..10.35, floor 7.69 - 2.1 = 5.59) is a standing place, as the near crane's is;
#   - lamp bodies (the v2 spread rig, #864): a sphere of max(0.25 m, the v2 per-type radius: PAR 0.25, B380F 0.45, smoke 0.5)
#     and a margin >= 0.25 m (the conservative model agreed 2026-10-09); the six cubes ON the free crane's bridge (N464): a box
#     x -11.35..11.35, y 8.3..9.4, z -13.45..-10.55, margin >= 0.25 m; the cut's two tie-offs (stage-line.mjs anchorWindows, the
#     v1.1 crane-cut json: a 2 t ratchet strap or a 6 mm steel, a strap would burn), margin >= 0.25 m; the other UP-LA40WF: its
#     body box, margin >= 0.25 m;
#   - the tube carries the UP-LA40WF's optics: divergence 1.3 mrad (fixtures.json kinds.laser, EQUIVALENT "< 1.3 mrad", taken
#     as the full angle), aperture 10 mm ASSUMED (the maker prints none; fixtures.json's photometry note says 6-10 mm: the larger
#     is the safe end for clearance, the smaller for the NOHD).
# THE SEARCH: per mount option (a place a unit can hang), the two units side by side (centres 0.7 m apart, one height) and their
#   two end points on the far wall are chosen to make the WORST margin of both beams as large as possible: a compass (pattern)
#   search, Hooke & Jeeves, J. ACM 8(2) 1961 / Kolda, Lewis & Torczon, SIAM Review 45(3) 2003, from several starts. The two ends are
#   NOT forced apart (safety margin first: forcing them >= 0.5 m apart costs 0.11 m, ends_apart_tradeoff). The result is then cast on
#   the triangles; the setup sheet is the v1.1 method
#   (the window where the rule holds for the beam alone, stepped 0.02 deg).
# NOHD: IEC 60825-1:2014 Table A.1 (visible, 0.25 s): NOHD = (sqrt(4 P / (pi MPE)) - a) / phi (the moxir_v1_1.nohd() formula).
import argparse, copy, hashlib, json, math, os, subprocess, sys

for _k in ('OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS'):
    os.environ.setdefault(_k, '1')          # heat rule (owner 10-09): one BLAS thread

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.dont_write_bytecode = True
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('--repo', default='.')
ap.add_argument('--out', default=None)
ap.add_argument('--check', action='store_true')
ap.add_argument('--spread-commit', default='cbfc0c1d')
ap.add_argument('--rig-out', default='scripts/place/rigs/moxir-v2-entry-lasers-2026-10-09.json')
A = ap.parse_known_args()[0]
REPO = os.path.abspath(os.path.expanduser(A.repo))
os.chdir(REPO)                              # lights_beta_options (imported by occlusion_sky) reads its files from '.'
J = lambda p: json.load(open(os.path.join(REPO, p)))
R3 = lambda v: round(float(v), 3)

DATE = '2026-10-09'
HALL = 'scripts/place/rigs/moxir-hall-2026-10-08-v9-show-park.hall.json'
STAGE = 'scripts/place/rigs/moxir-stage-v1-1-2026-10-08.json'
RIG11 = 'scripts/place/rigs/moxir-epic-v1-1-2026-10-08.json'           # the cubes (PR #844) + the v1.1 lamps
TUNED = 'scripts/place/rigs/moxir-v2-planes-tuned-2026-10-09.json'      # v2 B tuned (#853), on this branch
ZONES = 'scripts/place/rigs/moxir-v2-zones-2026-10-09.json'             # the owner's painted zones (17:42)
FIXTURES = 'scripts/place/fixtures/fixtures.json'
SPREAD = 'scripts/place/rigs/moxir-v2-spread-2026-10-09.json'           # v2 B spread (#864), read from git at --spread-commit
G = J(HALL)['geometry']
DES = J(STAGE)
R11 = J(RIG11)
KIND = J(FIXTURES)['kinds']['laser']

# ------------------------------------------------------------------ the rule (moxir_v1_1.py constants, unchanged)
PERSON_M, VERT_M, LAT_M = 2.0, 3.0, 2.5
FAN_DEG, ZONE_DEG = 0.8, 0.3
NEAR_UNDER, FAR_UNDER = 7.2, 7.69
FAR_Z = -12.0
LAMP_LOW = 9.0
BODY_MARGIN = 0.25
CUBE_BODY_R = 0.25
BODY_R = {'up-pl5403': 0.25, 'up-b380f': 0.45, 'up-yz31p': 0.5}       # moxir_v2_spread.py BODY_R (ASSUMED from maker sizes)
BODY_R_OTHER = 0.45                                                     # any other type (v1.1's BSW, HK1915, strobes, blinders): the larger
END_Z = -G['end_wall_inner_y_m']                                        # -53.8, the far (SE) end wall, the artists' side
ROOF_FRAME_AT_END = 10.3                                                # the space frame's lowest member at the end walls (GLB hall-frame y 10.3-11.2)

# ------------------------------------------------------------------ the unit (fixtures.json kinds.laser)
P_W = {638: 10.0, 520: 15.0, 445: 16.0}                                 # LA-CN, EXACT
P_TOTAL = sum(P_W.values())                                             # 41 W
PHI = KIND['specs']['divergence_mrad']['value'] / 1000.0                # 1.3 mrad, EQUIVALENT ("< 1.3")
APERTURE_TUBE = 0.010                                                   # ASSUMED: the safe end for clearance
APERTURE_NOHD = 0.006                                                   # ASSUMED: the safe end for the NOHD
BODY = [v / 1000.0 for v in KIND['specs']['size_mm']['value']]          # 0.42 W x 0.555 L x 0.235 H (EQUIVALENT)
UNIT_W, UNIT_L, UNIT_H = BODY[0], BODY[1], BODY[2]
UNIT_KG = KIND['specs']['weight_kg']['value']                           # 35 (EQUIVALENT)
UNIT_POWER_W = KIND['specs']['power_w']['value']                        # 1200 (EQUIVALENT)
DX = 0.7                                                                # the two units side by side: 0.42 m bodies + U-brackets + hands' room
END_APART = 0.0                                                         # no look constraint on the two ends: measured, ends >= 0.5 m apart cost 0.11 m of margin (ends_apart_tradeoff)


def tube_r(s, half=FAN_DEG):
    return s * math.tan(math.radians(half)) + (APERTURE_TUBE + PHI * s) / 2


# ------------------------------------------------------------------ the places (moxir_v1_1.standing_places, + the free crane's cab)
def standing_places():
    E = G['end_wall_inner_y_m']
    b = DES['booth']
    bx, bz, bd = b['centre_x_m'], b['front_z_m'] - b['depth_m'] / 2, b['depth_m']
    f = DES['foh']
    rail = G['crane_rail_x_m']
    c0, c1 = G['cranes'][0], G['cranes'][1]
    mass = {m['id']: m for m in G['massing']}
    DW = G['door']['w_m']
    out = [('hall floor (dance floor, backstage, everywhere)', G['walls_x_m'][0], G['walls_x_m'][1], -E, E, 0.0, 'hall.json walls_x_m / end walls'),
           ('DJ step', bx - b['width_m'] / 2, bx + b['width_m'] / 2, bz - bd / 2, bz + bd / 2, b['deck_h_m'], 'stage json booth'),
           ('FOH riser', f['p'][0] - f['size_m'][0] / 2, f['p'][0] + f['size_m'][0] / 2, f['p'][2] - f['size_m'][1] / 2, f['p'][2] + f['size_m'][1] / 2, f['riser_m'], 'stage json foh (riser 0.6 m, ASSUMED there)'),
           ('entry platform', DW / 2 + 0.6, DW / 2 + 7.6, E - 3.0, E, 2.4, 'hall.py entry_platform (size a GUESS)'),
           ('entry stairs', DW / 2 + 7.6, DW / 2 + 7.6 + 3.6, E - 1.2, E, 2.4, 'hall.py entry_platform (12 steps of 0.3 m)')]
    for k in (1, 2, 3, 4):
        m = mass['pipe-rack-gallery-%d' % k]
        out.append(('gallery %d' % k, m['x_m'][0], m['x_m'][1], m['z_m'][0], m['z_m'][1], m['y_m'][1], 'hall.json massing pipe-rack-gallery-%d (top)' % k))
    m = mass['roller-conveyor']
    out.append(('conveyor gallery (roller conveyor)', m['x_m'][0], m['x_m'][1], m['z_m'][0], m['z_m'][1], m['y_m'][1], 'hall.json massing roller-conveyor (top)'))
    for sgn, row in ((-1, 'left'), (1, 'right')):
        xa, xb = sorted((sgn * (rail - 0.35), sgn * (rail + 1.3)))
        out.append(('runway walkway %s row (ladders: right)' % row, xa, xb, -E, E, G['runway_top_m'], 'hall.json runway_top_m 7.96, crane_rail_x_m'))
    cab = c0['cab']
    out.append(('crane cab (parked z %g)' % c0['z_m'], cab['x_m'][0], cab['x_m'][1], c0['z_m'] + cab['dz_m'][0], c0['z_m'] + cab['dz_m'][1], NEAR_UNDER - 2.1, 'hall.json cranes[0].cab, floor = safe underside - 2.1'))
    cab = c1['cab']
    out.append(('free crane cab (parked z %g) [added for these beams]' % FAR_Z, cab['x_m'][0], cab['x_m'][1], FAR_Z + cab['dz_m'][0], FAR_Z + cab['dz_m'][1], FAR_UNDER - 2.1,
                'hall.json cranes[1].cab at the show park z -12, floor = safe underside 7.69 - 2.1'))
    return out


PLACES = standing_places()
PLACE_ARR = np.array([p[1:6] for p in PLACES], float)
PENDANTS = np.array([[m['x_m'][0], m['x_m'][1], m['z_m'][0], m['z_m'][1]] for m in G['massing'] if m['id'].startswith('pendant-lamp')], float)
GATE = {'x_m': (-G['far_gate']['w_m'] / 2, G['far_gate']['w_m'] / 2), 'top_m': G['far_gate']['h_m']}
CUBES_TOP = {'lo': np.array([-G['crane_rail_x_m'], 8.3, FAR_Z - 1.45]), 'hi': np.array([G['crane_rail_x_m'], 9.4, FAR_Z + 1.45]),
             'what': 'the six LaserCubes ON the free crane\'s bridge at z -12 (owner N464, 21:1x): aperture about 8.9 m (8.5-9.0), bodies + clamps 8.3-9.4; their x and aims are being redesigned, so the whole bridge (both girders) is kept out'}
# the cut's tie-offs (rigs/moxir-crane-cut-v1-1-2026-10-08.json rigging.tieoffs: level at each end's own height, to the nave columns' inner faces)
TIEOFFS = [('cut tie-off hl (2 t ratchet strap or 6 mm steel)', np.array([-11.04, 3.04, 0.15]), np.array([-11.6, 3.04, -0.5])),
           ('cut tie-off hr (2 t ratchet strap or 6 mm steel)', np.array([0.55, 6.15, 0.15]), np.array([11.6, 6.15, -6.0]))]
TIE_R = 0.05
# the cut at v1.1 (occlusion_sky.CUT, as stage-line.mjs derives it): ends (x, bottom chord y), 0.29 m section, plane z 0.15
CUT_ENDS = [(-11.04, 2.89), (0.55, 6.00)]
CUT_SEC = 0.29
CUT_Z = 0.15
CUT_PICKS = [(-10.59, 4.16), (-5.52, 5.52), (0.03, 7.01)]


def git_json(commit, path):
    out = subprocess.run(['git', 'show', '%s:%s' % (commit, path)], capture_output=True, text=True, cwd=REPO)
    if out.returncode:
        raise SystemExit('git show %s:%s failed (%s): fetch origin feat/moxir-v2-spread-2026-10-09 first' % (commit, path, out.stderr.strip()))
    return json.loads(out.stdout)


SP = git_json(A.spread_commit, SPREAD)
SPREAD_SHA = subprocess.run(['git', 'rev-parse', A.spread_commit], capture_output=True, text=True, cwd=REPO).stdout.strip()
TU = J(TUNED)


def lamp_set(rig):
    rows = [(u['id'], u['type'], np.array(u['p'], float), max(0.25, BODY_R.get(u['type'], BODY_R_OTHER))) for u in rig['fixtures'] if u['type'] != 'ext-lc-ultra-mk2']
    return {'ids': [r[0] for r in rows], 'types': [r[1] for r in rows], 'P': np.array([r[2] for r in rows]), 'r': np.array([r[3] for r in rows])}


LAMP_SETS = {'v2 spread (#864, %s)' % A.spread_commit: lamp_set(SP), 'v2 B tuned (#853)': lamp_set(TU), 'v1.1 (#844)': lamp_set(R11)}
SHOW_SET = 'v2 spread (#864, %s)' % A.spread_commit


# ------------------------------------------------------------------ geometry helpers
def _box_dist(Q, lo, hi):
    return np.linalg.norm(np.maximum(np.maximum(lo - Q, Q - hi), 0), axis=1)


def _seg_dist(Q, a, b):
    ab = b - a
    t = np.clip(((Q - a) @ ab) / (ab @ ab), 0, 1)
    return np.linalg.norm(Q - (a + t[:, None] * ab), axis=1)


CUT_A = np.array([CUT_ENDS[0][0], CUT_ENDS[0][1] + CUT_SEC / 2, CUT_Z])
CUT_B = np.array([CUT_ENDS[1][0], CUT_ENDS[1][1] + CUT_SEC / 2, CUT_Z])
CUT_HALF_DIAG = CUT_SEC / 2 * math.sqrt(2)


def unit_box(c, toward=(0.0, 0.0, -1.0)):
    """the UP-LA40WF's body behind its aperture c (the front face), its length along -toward (~ +z: the units face the stage)"""
    lo = np.array([c[0] - UNIT_W / 2, c[1] - UNIT_H / 2, c[2]])
    hi = np.array([c[0] + UNIT_W / 2, c[1] + UNIT_H / 2, c[2] + UNIT_L])
    return lo, hi


def margins(p, T, half=FAN_DEG, step=0.25, others=(), lamp_sets=None):
    """Every margin of the tube p -> T (m; >= 0 passes). others: the other unit's aperture(s)."""
    p, T = np.asarray(p, float), np.asarray(T, float)
    L = float(np.linalg.norm(T - p))
    d = (T - p) / L
    s = np.arange(0.3, L, step)
    Q = p + s[:, None] * d
    R = s * math.tan(math.radians(half)) + (APERTURE_TUBE + PHI * s) / 2
    m = {}
    for k, (x0, x1, z0, z1, h) in enumerate(PLACE_ARR):
        hg = np.hypot(np.maximum(np.maximum(x0 - Q[:, 0], Q[:, 0] - x1), 0), np.maximum(np.maximum(z0 - Q[:, 2], Q[:, 2] - z1), 0)) - R
        top = h + PERSON_M
        vg = np.where(Q[:, 1] > top, Q[:, 1] - top, np.where(Q[:, 1] < h, h - Q[:, 1], 0.0)) - R
        c = np.maximum(hg - LAT_M, vg - VERT_M)
        j = int(c.argmin())
        m['place: ' + PLACES[k][0]] = (float(c[j]), Q[j])
    for nm, cz, under in (('near crane bridge (safe underside 7.2)', G['cranes'][0]['z_m'], NEAR_UNDER), ('free crane bridge z -12 (safe underside 7.69)', FAR_Z, FAR_UNDER)):
        zc = np.zeros(len(Q), bool)
        for dz in G['cranes'][0]['girders_dz_m']:
            zc |= (Q[:, 2] >= cz + dz - 0.35 - R) & (Q[:, 2] <= cz + dz + 0.35 + R)
        zc &= np.abs(Q[:, 0]) <= G['crane_rail_x_m'] + R
        if zc.any():
            g = under - (Q[zc, 1] + R[zc])
            j = int(g.argmin())
            m[nm] = (float(g[j]), Q[zc][j])
        else:
            m[nm] = (99.0, None)
    g = _box_dist(Q, CUBES_TOP['lo'], CUBES_TOP['hi']) - R - BODY_MARGIN
    j = int(g.argmin())
    m['the six cubes on the free crane (N464, margin 0.25)'] = (float(g[j]), Q[j])
    for nm, a, b in TIEOFFS:
        g = _seg_dist(Q, a, b) - TIE_R - R - BODY_MARGIN
        j = int(g.argmin())
        m[nm + ' (margin 0.25)'] = (float(g[j]), Q[j])
    g = _seg_dist(Q, CUT_A, CUT_B) - CUT_HALF_DIAG - R
    j = int(g.argmin())
    m['the cut (H30V truss)'] = (float(g[j]), Q[j])
    for i, (x, apex) in enumerate(CUT_PICKS):
        g = _box_dist(Q, np.array([x - 0.25, apex - 0.85, CUT_Z - 0.8]), np.array([x + 0.25, 7.6, CUT_Z + 0.8])) - R
        j = int(g.argmin())
        m['cut pick %d (bridle + hoist)' % (i + 1)] = (float(g[j]), Q[j])
    gap = np.hypot(np.maximum(np.maximum(PENDANTS[:, 0][None, :] - Q[:, 0:1], Q[:, 0:1] - PENDANTS[:, 1][None, :]), 0),
                   np.maximum(np.maximum(PENDANTS[:, 2][None, :] - Q[:, 2:3], Q[:, 2:3] - PENDANTS[:, 3][None, :]), 0))
    vg = LAMP_LOW - Q[:, 1:2]
    m['pendant lamps (low end 9.0)'] = (float(np.min(np.where(gap > 0, np.maximum(gap, vg), vg) - R[:, None])), None)
    # bodies: the lamps (per rig), the other unit
    for name, S in (lamp_sets or {SHOW_SET: LAMP_SETS[SHOW_SET]}).items():
        v = S['P'] - p
        t = v @ d
        ok = (t >= 0) & (t <= L)
        g = np.linalg.norm(v - t[:, None] * d, axis=1) - (np.abs(t) * math.tan(math.radians(half)) + (APERTURE_TUBE + PHI * np.abs(t)) / 2) - S['r'] - BODY_MARGIN
        g = np.where(ok, g, 99.0)
        j = int(g.argmin())
        m['lamp bodies, %s (margin 0.25)' % name] = (float(g[j]), S['ids'][j])
    for o in others:
        lo, hi = unit_box(o)
        ss = np.arange(0.0, min(L, 4.0), 0.02)
        QQ = p + ss[:, None] * d
        RR = ss * math.tan(math.radians(half)) + (APERTURE_TUBE + PHI * ss) / 2
        g = _box_dist(QQ, lo, hi) - RR - BODY_MARGIN
        m['the other UP-LA40WF body (margin 0.25)'] = (float(g.min()), None)
    rE = tube_r(L, half)
    lat = max(abs(T[0]) - GATE['x_m'][1], 0.0) - rE
    m['end: the far gate opening (2.5 m beside, or 3.0 m over its 5.4 m top)'] = (max(lat - LAT_M, (T[1] - rE) - (GATE['top_m'] + VERT_M)), None)
    m['end: under the space frame at the end wall (10.3)'] = (ROOF_FRAME_AT_END - (T[1] + rE), None)
    worst = min(m, key=lambda k: m[k][0])
    return m[worst][0], worst, m, L


def worst_of(p, T, **kw):
    return margins(p, T, step=kw.pop('step', 0.5), **kw)[0]


def half_fan_for(p, T, others=(), hi=2.0):
    """the largest fan half angle (deg) for which every analytic check holds (bisection), None if it fails with none (v1.1 method)."""
    if worst_of(p, T, half=0.0, others=others, step=0.25) < 0:
        return None
    lo = 0.0
    for _ in range(12):
        mid = (lo + hi) / 2
        if worst_of(p, T, half=mid, others=others, step=0.25) >= 0:
            lo = mid
        else:
            hi = mid
    return lo


# ------------------------------------------------------------------ the search (two units on one mount)
def layout(v, z, fixed_x=None):
    xa, y, xea, yea, xeb, yeb = v
    if fixed_x is not None:
        xa = fixed_x
    pa, pb = np.array([xa, y, z]), np.array([xa + DX, y, z])
    return pa, pb, np.array([xea, yea, END_Z]), np.array([xeb, yeb, END_Z])


def objective(v, z, fixed_x=None, y_range=None, single=False):
    pa, pb, ta, tb = layout(v, z, fixed_x)
    pen = 0.0
    if y_range and not (y_range[0] <= v[1] <= y_range[1]):
        pen = -abs(v[1] - min(max(v[1], y_range[0]), y_range[1])) - 1.0
    if single:
        return worst_of(pa, ta) + pen
    wa = worst_of(pa, ta, others=(pb,))
    wb = worst_of(pb, tb, others=(pa,))
    apart = float(np.linalg.norm(ta - tb)) - END_APART
    return min(wa, wb, apart) + pen


def compass(v0, z, step=0.4, tol=0.005, **kw):
    """compass / pattern search (Hooke & Jeeves 1961; Kolda, Lewis & Torczon 2003): maximise the objective."""
    v = np.array(v0, float)
    fv = objective(v, z, **kw)
    while step > tol:
        improved = False
        for i in range(len(v)):
            if kw.get('fixed_x') is not None and i == 0:
                continue
            for sg in (1, -1):
                w = v.copy()
                w[i] += sg * step
                fw = objective(w, z, **kw)
                if fw > fv + 1e-7:
                    v, fv, improved = w, fw, True
                    break
        if not improved:
            step /= 2
    return fv, v


STARTS = ([-8.1, 5.95, -6.6, 6.7, -7.0, 6.7], [-8.3, 6.0, -6.5, 6.8, -7.0, 6.6], [-8.0, 5.9, -6.9, 6.7, -6.45, 6.7], [-8.4, 5.85, -6.45, 6.75, -6.95, 6.75])


def best_layout(z, starts=STARTS, **kw):
    best = None
    for v0 in starts:
        r = compass(v0, z, **kw)
        if best is None or r[0] > best[0]:
            best = r
    return best


# ------------------------------------------------------------------ the cast (occlusion_sky.World as the v2 night world, + the safe ends)
_W = None


def night_world():
    """occlusion_sky.World (hall v9-show-park GLB, pinned sha) as moxir_v2_spread.night_world builds it: the free crane at its show park
    z -12 (the GLB still draws it at z -41: those triangles are taken out), its girders at the safe underside 7.69, its cab, the laser
    hang; PLUS here: the near crane's girders at its safe underside 7.2 (the GLB draws 7.6), the pendant lamps from their safe low end
    9.0, people over the WHOLE floor (2.0 m + raised arms 0.4 m), the v2 spread lamps as 0.5 m boxes. Each triangle keeps its mesh name."""
    global _W
    if _W is not None:
        return _W
    import occlusion_sky as S
    import occlusion_lib as O
    W = S.World(REPO)
    gone = [i for i, n in enumerate(W.labels) if n.startswith('crane z -41')]
    idx = np.nonzero(np.isin(W.lab, gone))[0]
    W.V0[idx] = [0.0, -1000.0, 0.0]
    W.C[idx] = [0.0, -1000.0, 0.0]
    W.boxes = [b for b in W.boxes if b.cls not in ('crane', 'audience') and b.name != 'crane-bar']   # N464: no bar, no hang
    c1 = W.G['cranes'][1]
    top = c1['girder_top_m']
    for dz in c1['girders_dz_m']:
        W.boxes.append(S.OBox.aabb('free crane z -12 girder (safe underside 7.69)', 'crane', (-11.35, 11.35), (FAR_UNDER, top), (FAR_Z + dz - 0.35, FAR_Z + dz + 0.35)))
    W.boxes.append(S.OBox.aabb('free crane z -12 trolley', 'crane', tuple(c1['trolley']['x_m']), (top, top + 1.0), (FAR_Z - 1.6, FAR_Z + 1.6)))
    drop = c1['girder_bottom_m'] - FAR_UNDER
    W.boxes.append(S.OBox.aabb('free crane z -12 cab', 'crane', tuple(c1['cab']['x_m']), (c1['cab']['y_m'][0] - drop, c1['cab']['y_m'][1] - drop), (FAR_Z - 1.0, FAR_Z + 1.0)))
    W.boxes.append(S.OBox.aabb('the six cubes on the free crane (N464)', 'laser', (CUBES_TOP['lo'][0], CUBES_TOP['hi'][0]), (CUBES_TOP['lo'][1], CUBES_TOP['hi'][1]), (CUBES_TOP['lo'][2], CUBES_TOP['hi'][2])))
    for nm, a, b in TIEOFFS:
        u = (b - a) / np.linalg.norm(b - a)
        w = np.cross([0.0, 1.0, 0.0], u)
        w /= np.linalg.norm(w)
        W.boxes.append(S.OBox(nm, 'rigging', (a + b) / 2, [np.linalg.norm(b - a) / 2, TIE_R, TIE_R], np.column_stack([u, [0.0, 1.0, 0.0], w])))
    c0 = W.G['cranes'][0]
    for dz in c0['girders_dz_m']:
        W.boxes.append(S.OBox.aabb('near crane girder (safe underside 7.2)', 'crane', (-11.35, 11.35), (NEAR_UNDER, c0['girder_top_m']), (c0['z_m'] + dz - 0.35, c0['z_m'] + dz + 0.35)))
    drop0 = c0['girder_bottom_m'] - NEAR_UNDER
    W.boxes.append(S.OBox.aabb('near crane cab (safe drop)', 'crane', tuple(c0['cab']['x_m']), (c0['cab']['y_m'][0] - drop0, c0['cab']['y_m'][1] - drop0), (c0['z_m'] - 1.0, c0['z_m'] + 1.0)))
    for m in G['massing']:
        if m['id'].startswith('pendant-lamp'):
            W.boxes.append(S.OBox.aabb(m['id'] + ' (from 9.0)', 'lamp', tuple(m['x_m']), (LAMP_LOW, m['y_m'][1]), tuple(m['z_m'])))
    S_ = LAMP_SETS[SHOW_SET]
    for lid, q in zip(S_['ids'], S_['P']):
        W.boxes.append(S.OBox.aabb(lid, 'lamp', (q[0] - 0.25, q[0] + 0.25), (q[1] - 0.25, q[1] + 0.25), (q[2] - 0.25, q[2] + 0.25)))
    W.boxes.append(S.OBox.aabb('people (the whole floor, 2.0 m + arms 0.4 m)', 'audience', tuple(G['walls_x_m']), (0.0, 2.4), (-G['end_wall_inner_y_m'], G['end_wall_inner_y_m'])))
    names = []
    for k, t in O.read_glb(S.GLB).items():
        if not k.startswith('hall-zone'):
            names += [k] * len(t)
    W.mesh = np.array(names)
    assert len(W.mesh) == W.n_tris
    _W = W
    return W


def cast_first(W, o, D, reach=140.0, extra=(), skip_cls=()):
    """first hit of each ray (the occlusion_sky.World Moller-Trumbore, chunked) + the rig boxes (minus classes in skip_cls); with the triangle's mesh name."""
    o = np.asarray(o, float)
    D = np.atleast_2d(np.asarray(D, float))
    n = len(D)
    near = np.nonzero(np.linalg.norm(W.C - o, axis=1) - W.Rr <= reach)[0]
    best = np.full(n, np.inf)
    who = np.full(n, -1, dtype=np.int64)
    for k in range(0, len(near), 3000):
        idx = near[k:k + 3000]
        s = o - W.V0[idx]
        Bm, Q = np.cross(W.E2[idx], s), np.cross(s, W.E1[idx])
        tn = np.einsum('ij,ij->i', W.E2[idx], Q)
        det = D @ W.A[idx].T
        ok = np.abs(det) > 1e-12
        inv = np.where(ok, 1.0 / np.where(ok, det, 1.0), 0.0)
        u = (D @ Bm.T) * inv
        v = (D @ Q.T) * inv
        t = tn[None, :] * inv
        hit = ok & (u >= -1e-9) & (v >= -1e-9) & (u + v <= 1 + 1e-9) & (t > 0.3) & (t < reach)
        t = np.where(hit, t, np.inf)
        j = np.argmin(t, axis=1)
        tj = t[np.arange(n), j]
        better = tj < best
        best[better] = tj[better]
        who[better] = idx[j[better]]
    out = [[best[i], W.labels[W.lab[who[i]]], W.lcls[W.lab[who[i]]], str(W.mesh[who[i]])] if who[i] >= 0 else [np.inf, None, None, None] for i in range(n)]
    for b in list(W.boxes) + list(extra):
        if b.cls in skip_cls:
            continue
        tb = b.hits(o, D, 0.3)
        cur = np.array([r[0] for r in out])
        for i in np.nonzero((tb < cur) & (tb < reach))[0]:
            out[i] = [float(tb[i]), b.name, b.cls, None]
    return out


def other_unit_box(o):
    import occlusion_sky as S
    lo, hi = unit_box(o)
    return S.OBox.aabb('the other UP-LA40WF', 'laser', (lo[0], hi[0]), (lo[1], hi[1]), (lo[2], hi[2]))


def fan_cast(p, T, others=(), half=FAN_DEG):
    """the axis + 60 rays over the fan (occlusion_lib.AREA_RINGS), each first hit; ok = every ray ends on the far wall's matte block."""
    import occlusion_lib as O
    W = night_world()
    p, T = np.asarray(p, float), np.asarray(T, float)
    d = (T - p) / np.linalg.norm(T - p)
    dirs, _ = O.cone_rays(d, half, O.AREA_RINGS)
    hits = cast_first(W, p, dirs, extra=[other_unit_box(o) for o in others])
    rows = []
    for q, h in zip(dirs, hits):
        at = (p + h[0] * q) if np.isfinite(h[0]) else None
        rows.append({'name': h[1], 'cls': h[2], 'mesh': h[3], 'at': None if at is None else [R3(v) for v in at]})
    good = [r['name'] == 'end wall z -54' and r['mesh'] == 'hall-block' for r in rows]
    ys = [r['at'][1] for r in rows if r['at']]
    xs = [r['at'][0] for r in rows if r['at']]
    return {'rays': len(rows), 'all_on_matte_block': bool(all(good)), 'first_hits': sorted(set('%s [%s]' % (r['name'], r['mesh']) for r in rows)),
            'end_y_m': [R3(min(ys)), R3(max(ys))] if ys else None, 'end_x_m': [R3(min(xs)), R3(max(xs))] if xs else None, 'bad': [r for r, g in zip(rows, good) if not g]}


def single_ok(p, T, others=()):
    """one ray p -> T: the rule with no fan (the beam alone) and its first hit the far wall's matte block (the v1.1 setup-sheet test)."""
    if worst_of(p, T, half=0.0, others=others, step=0.25) < 0:
        return False
    W = night_world()
    d = (np.asarray(T, float) - p)
    d /= np.linalg.norm(d)
    h = cast_first(W, p, d[None, :], extra=[other_unit_box(o) for o in others])[0]
    return h[1] == 'end wall z -54' and h[3] == 'hall-block'


def pan_tilt(p, T):
    v = np.asarray(T, float) - np.asarray(p, float)
    ln = float(np.linalg.norm(v))
    return math.degrees(math.atan2(v[0], -v[2])), math.degrees(math.asin(v[1] / ln)), ln


def setup_row(uid, p, T, others):
    """the v1.1 setup sheet: aim as pan (from the hall axis toward the STAGE, + toward +x) / tilt (above level); the window in which the rule
    holds for the beam alone (stepped 0.02 deg, cap 3 deg); the hard stop (an aperture mask on the output) = aim +- 0.3 deg, which must sit
    inside the window shrunk by the 0.5 deg mount tolerance; the beam block's floor = the window's lowest tilt."""
    pan, tilt, ln = pan_tilt(p, T)

    def at(dp, dt):
        pa, ti = math.radians(pan + dp), math.radians(tilt + dt)
        dd = np.array([math.cos(ti) * math.sin(pa), math.sin(ti), -math.cos(ti) * math.cos(pa)])
        return np.asarray(p, float) + dd * (END_Z - p[2]) / dd[2]             # where that ray meets the far wall's plane

    def edge(axis, sign):
        last = 0.0
        for k in range(1, 151):
            dv = sign * 0.02 * k
            q = at(dv, 0.0) if axis == 'pan' else at(0.0, dv)
            if not single_ok(np.asarray(p, float), q, others):
                return round(last, 2)
            last = dv
        return round(last, 2)
    lp, hp, lt, ht = edge('pan', -1), edge('pan', 1), edge('tilt', -1), edge('tilt', 1)
    inside = min(-lp, hp, -lt, ht) >= FAN_DEG
    return {'unit': uid, 'aim': {'end_m': [R3(v) for v in T], 'pan_deg_from_hall_axis_toward_the_stage_plus_toward_x': round(pan, 2), 'tilt_deg_above_level': round(tilt, 2), 'range_m': round(ln, 1)},
            'window_rule_holds_deg': {'pan': [round(pan + lp, 2), round(pan + hp, 2)], 'tilt': [round(tilt + lt, 2), round(tilt + ht, 2)], 'half_widths_pan_tilt': [lp, hp, lt, ht]},
            'hard_stop_aperture_mask_deg': {'pan': [round(pan - ZONE_DEG, 2), round(pan + ZONE_DEG, 2)], 'tilt': [round(tilt - ZONE_DEG, 2), round(tilt + ZONE_DEG, 2)],
                                            'why': 'the aim +-%.1f deg (the controller zone, made physical: the UP-LA40WF has no software safety zone, it takes DMX); the window minus the %.1f deg mount tolerance must still contain it: %s' % (ZONE_DEG, FAN_DEG - ZONE_DEG, 'yes' if inside else 'NO')},
            'beam_block': {'lowest_ray_allowed_tilt_deg': round(tilt + lt, 2), 'setting': 'block everything below %.2f deg above level (the window floor); set with the unit off, a spirit level on the block edge' % (tilt + lt)}}


# ------------------------------------------------------------------ NOHD (IEC 60825-1:2014 Table A.1, 400-700 nm)
def nohd(P, a=APERTURE_NOHD, phi=PHI, t=0.25):
    mpe = 18 * t ** 0.75 / t                    # W/m2: 25.46 at 0.25 s, 10.1 at 10 s
    return max(0.0, (math.sqrt(4 * P / (math.pi * mpe)) - a) / phi)


def nohd_table():
    mpe = 18 * 0.25 ** 0.75 / 0.25
    rows = {'mpe_w_m2_0_25s': round(mpe, 2),
            'all_colours_41w_0_25s_m': round(nohd(P_TOTAL)),
            'all_colours_41w_10s_m': round(nohd(P_TOTAL, t=10.0)),
            'if_10mm_1_3mrad_are_1_e2_values_m': round(nohd(P_TOTAL, a=APERTURE_NOHD / math.sqrt(2), phi=PHI / math.sqrt(2))),
            'per_colour_0_25s_m': {'blue 445 nm 16 W': round(nohd(P_W[445])), 'green 520 nm 15 W': round(nohd(P_W[520])), 'red 638 nm 10 W': round(nohd(P_W[638]))},
            'dimming_0_25s_m': {'100 %': round(nohd(P_TOTAL)), '10 %': round(nohd(0.1 * P_TOTAL)), '1 %': round(nohd(0.01 * P_TOTAL)), '0.1 %': round(nohd(0.001 * P_TOTAL))},
            'eye_safe_power_at_5_m_from_the_aperture_mw': round(1000 * mpe * math.pi / 4 * (APERTURE_NOHD + PHI * 5.0) ** 2, 1),
            'diffuse_hazard_off_the_block_m': {'albedo 0.5': R3(math.sqrt(0.5 * P_TOTAL / (math.pi * mpe))), 'albedo 0.9': R3(math.sqrt(0.9 * P_TOTAL / (math.pi * mpe))),
                                               'both units on one spot, albedo 0.9': R3(math.sqrt(0.9 * 2 * P_TOTAL / (math.pi * mpe)))},
            'basis': 'IEC 60825-1:2014 Table A.1 (MPE = 18 t^0.75 J/m2, visible, t 0.25 s blink / 10 s), NOHD = (sqrt(4P/(pi MPE)) - a)/phi with a = 6 mm (ASSUMED, the safe end for NOHD), phi = 1.3 mrad full angle (EQUIVALENT); '
                     'the 1/e2 line converts both by 1/sqrt(2). Diffuse: sqrt(rho P / (pi MPE)) (ANSI Z136.1 extended-source simplification, as moxir_v1_1.nohd()). The hall is 108 m long: every beam is hazardous wherever it is; '
                     'separation (3.0 m / 2.5 m) and the hard stop are the control, not distance or dimming.'}
    return rows


# ------------------------------------------------------------------ the keep-out envelope (for the cubes' new terminations, N464)
TBAR = {'drop_m': 0.12, 'bar_h_m': 0.29, 'bracket_m': 0.05, 'tower_sec_m': 0.29, 'pen_m': 1.0, 'outrigger_half_m': 1.5}


def keep_out(units):
    """Boxes (x, y, z ranges, m) of what these two units put in the hall: the units + U-brackets + T-bar, the tower and its pen, and the
    two beams' tubes per z segment (the 0.8 deg fan + optics). The cube beams' new ends (and their tubes) keep >= 0.25 m clear of each.
    The T-bar sizes are an H30V section (0.29 m) hung 0.12 m over the units' tops (ESTIMATE); the pen 1.0 m round the outriggers."""
    pa, pb = units[0]['p'], units[1]['p']
    x0, x1 = min(pa[0], pb[0]) - UNIT_W / 2 - TBAR['bracket_m'], max(pa[0], pb[0]) + UNIT_W / 2 + TBAR['bracket_m']
    ytop = max(pa[1], pb[1]) + UNIT_H / 2 + TBAR['drop_m'] + TBAR['bar_h_m']
    z0, z1 = min(pa[2], pb[2]) - TBAR['bracket_m'], max(pa[2], pb[2]) + UNIT_L + TBAR['bracket_m']
    xc, zc = (pa[0] + pb[0]) / 2, (z0 + z1) / 2
    out = [{'id': 'KO-1 the two UP-LA40WF + U-brackets + T-bar', 'x_m': [R3(x0 - 0.3), R3(x1 + 0.3)], 'y_m': [R3(min(pa[1], pb[1]) - UNIT_H / 2 - TBAR['bracket_m']), R3(ytop)], 'z_m': [R3(z0), R3(z1)],
            'note': 'the T-bar runs 0.3 m past the outer brackets'},
           {'id': 'KO-2 the tower (mast, base, outriggers) and its pen on the floor', 'x_m': [R3(xc - TBAR['outrigger_half_m'] - TBAR['pen_m']), R3(xc + TBAR['outrigger_half_m'] + TBAR['pen_m'])],
            'y_m': [0.0, R3(ytop)], 'z_m': [R3(zc - TBAR['outrigger_half_m'] - TBAR['pen_m']), R3(zc + TBAR['outrigger_half_m'] + TBAR['pen_m'])],
            'note': 'the mast (0.29 m) stands under the T-bar\'s middle; the footprint is the outriggers (ESTIMATE 3 x 3 m) + a 1 m pen'}]
    segs = [(units[0]['p'][2], 40.0), (40.0, 20.0), (20.0, 0.0), (0.0, -12.0), (-12.0, -30.0), (-30.0, END_Z)]
    for (za, zb) in segs:
        X, Y = [], []
        for u in units:
            p, T = u['p'], u['T']
            d = (T - p) / u['length']
            for zz in np.linspace(za, zb, 12):
                sv = (zz - p[2]) / d[2]
                if sv < 0:
                    continue
                q = p + sv * d
                r = tube_r(sv)
                X += [q[0] - r, q[0] + r]
                Y += [q[1] - r, q[1] + r]
        out.append({'id': 'KO-3 the two beams z %g..%g' % (R3(zb), R3(za)), 'x_m': [R3(min(X)), R3(max(X))], 'y_m': [R3(min(Y)), R3(max(Y))], 'z_m': [R3(zb), R3(za)]})
    return out


def under_the_beams(units):
    """The rule counts the floor, the step, the riser, the platform: furniture is not in the model. Per stretch of the hall, the highest surface a
    person could stand on under the beams (the fan's bottom - 2.0 - 3.0) and the x strip it applies to: the crowd plan keeps anything higher out."""
    out = []
    for za, zb, what in ((30.0, units[0]['p'][2], 'the entry end: the chill zone, the bar side, the door\'s flow'), (20.0, 30.0, 'the back of the floor, FOH'), (8.2, 20.0, 'the dance floor'),
                         (-31.0, 8.2, 'the stage, backstage and the hot zone behind it (to z -31)'), (END_Z, -31.0, 'the far end')):
        low, xs = 9e9, []
        for u in units:
            p, T, L = u['p'], u['T'], u['length']
            for zz in np.arange(za, zb + 1e-9, 0.1):
                t = (zz - p[2]) / (T[2] - p[2])
                q = p + t * (T - p)
                r = tube_r(t * L)
                low = min(low, q[1] - r - (PERSON_M + VERT_M))
                xs += [q[0] - r - LAT_M, q[0] + r + LAT_M]
        out.append({'z_m': [R3(za), R3(zb)], 'what': what, 'highest_standing_surface_m': math.floor(low * 100) / 100, 'x_strip_m': [math.floor(min(xs) * 100) / 100, math.ceil(max(xs) * 100) / 100]})
    return out


# ------------------------------------------------------------------ the mount options
MOUNTS = [
    {'id': 'tower-z48', 'what': 'a ground-supported truss tower with a T-bar at the column line z 48, house left: both units under the bar, 0.7 m apart',
     'z': 48.0, 'kind': 'search'},
    {'id': 'tower-z50', 'what': 'the same tower 2 m nearer the door (z 50)', 'z': 50.0, 'kind': 'search'},
    {'id': 'tower-z46', 'what': 'the same tower 2 m further in (z 46)', 'z': 46.0, 'kind': 'search'},
    {'id': 'tower-z44', 'what': 'the same tower 4 m further in (z 44)', 'z': 44.0, 'kind': 'search'},
    {'id': 'wall-z53', 'what': 'a steel bracket on the entry end wall (block, inner face z 53.8), house left: aperture z 53.1 (0.15 m bracket + the 0.555 m body)',
     'z': 53.1, 'kind': 'search'},
    {'id': 'column-x-12-z48', 'what': 'a bracket on the nave column x -12, z 48 (its inner face x -11.6; under the flared head 6.21 m): aperture x -11.29',
     'z': 48.0, 'kind': 'fixed_x', 'x': -11.29, 'y_range': (4.5, 6.1)},
    {'id': 'column-x-12-z54', 'what': 'a bracket on the end-wall column x -12, z 54: aperture x -11.29, z 53.1', 'z': 53.1, 'kind': 'fixed_x', 'x': -11.29, 'y_range': (4.5, 6.1)},
    {'id': 'entry-platform', 'what': 'a stand on the entry platform (2.4 m, x 3.6..10.6, z 50.8..53.8, house right): people stand on it, so the beam >= 7.4 m there',
     'z': 52.0, 'kind': 'single', 'starts': ([6.0, 7.6, 6.0, 7.0, 0, 0], [4.5, 7.5, 6.0, 6.8, 0, 0], [8.0, 7.6, 6.5, 6.8, 0, 0], [5.0, 7.8, -6.5, 7.0, 0, 0]), 'y_range': (7.4, 9.0)},
    {'id': 'tower-right-z48', 'what': 'a tower at z 48 house RIGHT (x 2..7, by the bar): any line on the right side (re-tested after N464 took the hang away)',
     'z': 48.0, 'kind': 'single', 'starts': ([5.0, 6.0, 5.0, 6.7, 0, 0], [4.0, 6.0, 6.5, 6.8, 0, 0], [6.5, 6.2, 6.8, 6.8, 0, 0], [3.0, 6.3, 4.5, 6.9, 0, 0]), 'y_range': (5.0, 7.5)},
    {'id': 'tower-centre-z48', 'what': 'a tower at z 48 on the nave axis (in the door\'s flow): a line over the middle of the floor',
     'z': 48.0, 'kind': 'single', 'starts': ([0.0, 6.0, 0.0, 9.5, 0, 0], [-1.5, 6.3, -3.5, 7.0, 0, 0], [-3.0, 6.2, -5.0, 6.8, 0, 0], [1.5, 6.4, 3.5, 7.0, 0, 0]), 'y_range': (5.0, 7.5)},
    {'id': 'door-frame', 'what': 'the steel frame of the entry door (x +-3, to 6.0 m)', 'z': 53.1, 'kind': 'fixed_x', 'x': -2.75, 'y_range': (4.5, 6.0)},
]


def eval_mount(mo):
    z = mo['z']
    if mo['kind'] == 'search':
        f, v = best_layout(z)
        return f, v, True
    if mo['kind'] == 'fixed_x':
        best = None
        for v0 in ([mo['x'], 5.6, -6.6, 6.7, 0, 0], [mo['x'], 5.2, -6.9, 6.6, 0, 0], [mo['x'], 6.0, -6.5, 6.9, 0, 0]):
            r = compass(v0, z, fixed_x=mo['x'], y_range=mo['y_range'], single=True)
            if best is None or r[0] > best[0]:
                best = r
        return best[0], best[1], False
    best = None
    for v0 in mo['starts']:
        r = compass(v0, z, y_range=mo['y_range'], single=True)
        if best is None or r[0] > best[0]:
            best = r
    return best[0], best[1], False


# ------------------------------------------------------------------ sight lines (the E-stops)
def seen_share(eye, p, T, step=1.0, samples=False):
    W = night_world()
    e = np.asarray(eye, float)
    p, T = np.asarray(p, float), np.asarray(T, float)
    n = max(2, int(np.linalg.norm(T - p) / step))
    seen = []
    for k in range(n + 1):
        q = p + (T - p) * (k / n) * 0.995
        v = q - e
        dist = float(np.linalg.norm(v))
        h = cast_first(W, e, (v / dist)[None, :], reach=dist - 0.3, skip_cls=('audience',))[0]   # the eye stands inside the people volume: people do not block here (as v1.1's seen_whole)
        seen.append(not np.isfinite(h[0]))
    return np.array(seen) if samples else round(sum(seen) / (n + 1), 2)


# ------------------------------------------------------------------ run
def run():
    rows = []
    chosen = None
    for mo in MOUNTS:
        f, v, two = eval_mount(mo)
        if two:
            pa, pb, ta, tb = layout(v, mo['z'])
            wa, ka, _, _ = margins(pa, ta, others=(pb,), step=0.1)
            wb, kb, _, _ = margins(pb, tb, others=(pa,), step=0.1)
            row = {'id': mo['id'], 'what': mo['what'], 'units': 2, 'worst_margin_m': R3(min(wa, wb)), 'binding': ka if wa <= wb else kb,
                   'mount_apertures': [[R3(c) for c in pa], [R3(c) for c in pb]], 'ends': [[R3(c) for c in ta], [R3(c) for c in tb]], 'passes': bool(min(wa, wb) >= 0)}
        else:
            pa, _, ta, _ = layout(v, mo['z'], mo.get('x'))
            wa, ka, _, _ = margins(pa, ta, step=0.1)
            row = {'id': mo['id'], 'what': mo['what'], 'units': 1, 'worst_margin_m': R3(wa), 'binding': ka, 'mount_apertures': [[R3(c) for c in pa]], 'ends': [[R3(c) for c in ta]],
                   'passes': bool(wa >= 0), 'note': 'one unit alone already fails: two cannot pass' if wa < 0 else 'one unit passes'}
        rows.append(row)
        print('mount %-18s worst %+.3f m (%s)' % (mo['id'], row['worst_margin_m'], row['binding']), file=sys.stderr, flush=True)
        if mo['id'] == 'tower-z48':
            chosen = (mo, v)
    mo, v = chosen
    pa, pb, ta, tb = layout(v, mo['z'])
    units = []
    for uid, p, T, other in (('rig-la40wf-entry-01', pa, ta, pb), ('rig-la40wf-entry-02', pb, tb, pa)):
        w, k, m, L = margins(p, T, others=(other,), step=0.1, lamp_sets=LAMP_SETS)
        hf = half_fan_for(p, T, others=(other,))
        cast = fan_cast(p, T, others=(other,))
        sheet = setup_row(uid, p, T, (other,))
        units.append({'id': uid, 'p': p, 'T': T, 'other': other, 'worst': w, 'binding': k, 'margins': m, 'length': L, 'half_fan': hf, 'cast': cast, 'sheet': sheet})
        print('unit %s worst %+.3f (%s) fan %.3f deg cast %s' % (uid, w, k, hf or -1, cast['all_on_matte_block']), file=sys.stderr, flush=True)
    foh = [DES['foh']['p'][0], DES['foh']['riser_m'] + 1.6, DES['foh']['p'][2]]
    spot = [-7.0, 1.7, -4.5]
    for u in units:
        a_, b_ = seen_share(foh, u['p'], u['T'], samples=True), seen_share(spot, u['p'], u['T'], samples=True)
        u['seen'] = {'foh': round(float(a_.mean()), 2), 'spotter_e_stop_2': round(float(b_.mean()), 2), 'either': round(float((a_ | b_).mean()), 2),
                     'method': 'each beam sampled every 1 m; a sample is seen if the sight line from the eye (FOH riser + 1.6 m; the spotter at x -7.0, z -4.5, 1.7 m) reaches it with nothing in between (hall triangles + rig boxes; people not counted), as moxir_v1_1.seen_whole'}
    global END_APART
    trade = {}
    for apart in (0.0, 0.25, 0.5):                               # what a look choice would cost: the two ends forced apart
        END_APART = apart
        f_, v_ = best_layout(mo['z'])
        q = layout(v_, mo['z'])
        trade['%.2f' % apart] = {'worst_margin_m': R3(min(margins(q[0], q[2], others=(q[1],), step=0.1)[0], margins(q[1], q[3], others=(q[0],), step=0.1)[0])), 'ends_apart_m': R3(np.linalg.norm(q[2] - q[3]))}
    END_APART = 0.0
    units[0]['tradeoff'] = trade
    global NEAR_UNDER                                             # what the tape of the near crane would buy (the model draws 7.6)
    NEAR_UNDER = 7.6
    f_, v_ = best_layout(mo['z'])
    q = layout(v_, mo['z'])
    ma, mb = margins(q[0], q[2], others=(q[1],), step=0.1), margins(q[1], q[3], others=(q[0],), step=0.1)
    units[0]['what_if'] = {'near crane underside taped at the model 7.6 (re-aimed)': {'worst_margin_m': R3(min(ma[0], mb[0])), 'binds': ma[1] if ma[0] <= mb[0] else mb[1]}}
    NEAR_UNDER = 7.2
    return rows, units, (mo, v)


def fixture_of(u, colour):
    import lights_beta_options as L
    p, T = u['p'], u['T']
    d = (T - p) / np.linalg.norm(T - p)
    m = u['margins']
    pick = lambda key: R3(m[key][0])
    lamp = {k.replace('lamp bodies, ', '').replace(' (margin 0.25)', ''): {'margin_m': R3(v[0]), 'nearest': v[1]} for k, v in m.items() if k.startswith('lamp bodies')}
    places = {k.replace('place: ', ''): {'margin_m': R3(v[0]), 'at': [R3(c) for c in v[1]]} for k, v in m.items() if k.startswith('place: ')}
    worst_place = min(places, key=lambda k: places[k]['margin_m'])
    beam = {'id': u['id'].replace('rig-la40wf-entry-0', 'P') + 'a', 'to': [R3(v) for v in T], 'length_m': round(u['length'], 1), 'r': L.rot_for_dir(d), 'off': False, 'pass': bool(u['worst'] >= 0 and u['cast']['all_on_matte_block']),
            'ends_on': 'the far (SE) end wall, matte block (hall-block), z %g' % END_Z, 'worst_margin_m': R3(u['worst']), 'binding': u['binding'],
            'half_fan_deg': R3(u['half_fan']), 'margin_after_zone_deg': R3(u['half_fan'] - FAN_DEG),
            'worst_place': worst_place, 'worst_place_margin_m': places[worst_place]['margin_m'], 'places': places,
            'near_crane_under_margin_m': pick('near crane bridge (safe underside 7.2)'), 'free_crane_under_margin_m': pick('free crane bridge z -12 (safe underside 7.69)'),
            'cubes_on_the_free_crane_margin_m': pick('the six cubes on the free crane (N464, margin 0.25)'), 'cut_truss_margin_m': pick('the cut (H30V truss)'),
            'cut_picks_margin_m': min(pick('cut pick %d (bridle + hoist)' % i) for i in (1, 2, 3)), 'cut_tieoffs_margin_m': min(pick(nm + ' (margin 0.25)') for nm, _, _ in TIEOFFS),
            'pendant_lamp_margin_m': pick('pendant lamps (low end 9.0)'), 'lamp_bodies': lamp, 'other_unit_margin_m': pick('the other UP-LA40WF body (margin 0.25)'),
            'end_gate_margin_m': pick('end: the far gate opening (2.5 m beside, or 3.0 m over its 5.4 m top)'), 'end_under_roof_frame_margin_m': pick('end: under the space frame at the end wall (10.3)'),
            'end_fan_y_m': [R3(T[1] - tube_r(u['length'])), R3(T[1] + tube_r(u['length']))], 'end_fan_x_m': [R3(T[0] - tube_r(u['length'])), R3(T[0] + tube_r(u['length']))],
            'cast': {k: v for k, v in u['cast'].items() if k != 'bad'}, 'cast_bad_rays': u['cast']['bad'], 'seen_share': u['seen'],
            'all_margins_m': {k: R3(v[0]) for k, v in sorted(m.items(), key=lambda kv: kv[1][0])}}
    return {'id': u['id'], 'name': 'UP-LA40WF entry laser %s (Poligraf rental, 40 W full colour)' % u['id'][-2:], 'type': 'up-la40wf', 'code': 'UP-LA40WF', 'part': 'entry laser',
            'layer': 'lasers', 'status': 'used', 'p': [R3(v) for v in p], 'r': L.rot_for_dir(d), 'colour': colour,
            'position': 'aperture (the output window) at x %.2f, y %.2f, z %.2f: under the T-bar of a ground-supported truss tower at the column line z 48, house left (mount option tower-z48)' % tuple(p),
            'laser': {'beams': [beam], 'duty': 1.0, 'off': False, 'signed_off': False, 'desk': 'held at 0 by deskLookValues.js until the IEC 60825-1 sign-off',
                      'universe': 'U1 (owner 2026-10-09, dob-09 note: 2 x UP-LA40WF 32 ch in U1)', 'mode_channels': 32}}


def build(rows, units, chosen):
    mo, v = chosen
    fx = [fixture_of(units[0], 'set by the desk (held at 0)'), fixture_of(units[1], 'set by the desk (held at 0)')]
    sheet = [u['sheet'] for u in units]
    for s_, u in zip(sheet, units):
        s_['mount'] = {'on': 'the T-bar of a ground-supported truss tower (mount option tower-z48)', 'aperture_m': [R3(c) for c in u['p']], 'unit_body': 'x +-%.2f, y +-%.3f, z %.2f..%.2f (0.42 x 0.235 x 0.555 m EQUIVALENT)' % (UNIT_W / 2, UNIT_H / 2, u['p'][2], u['p'][2] + UNIT_L),
                       'roll_deg': 0.0, 'clamp': 'the U-bracket bolted to the T-bar (the rental house\'s hardware) + a safety steel (secondary suspension)'}
    worst = min(units, key=lambda u: u['worst'])
    rig = {
        'snapshot': 'moxir-v2-entry-lasers-2026-10-09', 'version': 'MOXIR v2 · the entry lasers', 'date': DATE,
        'what': 'The two Poligraf UP-LA40WF (40 W full colour) UP at the entry end, house left, aimed back over the audience toward the stage, ending on the far (SE) end wall\'s matte block; written by scripts/place/moxir_entry_lasers.py. The six LaserCubes sit ON the free crane at z -12 (N464) and are not aimed here.',
        'owner': {'words': '"2 lasers from poli goes to the up to the entrance, where audience will enter, so 2 from one side 6 from other"', 'when': '2026-10-09 ~20:30', 'ledger': ['N460.2', 'N462', 'N464 (the cubes on the crane, 21:1x)'],
                  'note': '~/work/agent-reports-2026-10-09/moxir-lead/dob-09-c3896f.md'},
        'result': 'PASSES THESE CHECKS (not "safe"): both beams, worst margin %+.3f m (%s) over the cubes\' rule set with the 0.8 deg fan; every one of the 2 x 61 rays first-hits the far end wall\'s hall-block. Only house left has a line (the mount options table); the cubes passed with +0.22 m.' % (worst['worst'], worst['binding']),
        'standards': ['IEC 60825-1:2014 (MPE, NOHD; Table A.1)', 'IEC TR 60825-3 (laser shows: 3.0 m above and 2.5 m beside audience-accessible places)', 'ILDA audience-scanning / laser show safety guidance (the same separations; dimming is not a control)', 'HSE HS(G)95 (>= 3 m and a matte beam stop)',
                      'ANSI E1.21-2013 (temporary ground-supported structures: the tower\'s stability)', 'EN 17206 / DGUV V17 (machinery for stages; the rigging sign-off)'],
        'rule': {'person_m': PERSON_M, 'vertical_m': VERT_M, 'lateral_m': LAT_M, 'fan_deg': FAN_DEG, 'zone_deg': ZONE_DEG, 'near_crane_underside_used_m': NEAR_UNDER, 'free_crane_underside_used_m': FAR_UNDER, 'free_crane_z_m': FAR_Z,
                 'lamp_low_used_m': LAMP_LOW, 'body_margin_m': BODY_MARGIN, 'lamp_body_r_m': {**BODY_R, 'other': BODY_R_OTHER, 'floor': 0.25},
                 'end_z_m': END_Z, 'end_rule': 'the whole fan on the far end wall\'s matte block, >= 2.5 m beside the artists\' gate opening (x -2.4..2.4) or >= 3.0 m over its 5.4 m top, under the space frame at 10.3 m, and (the floor rule) >= 5.0 m over the floor',
                 'same_as_the_cubes': 'moxir_v1_1.py standing_places() / beam_path_checks() / the full cast; the test checks the 13 places are the cubes\' 13',
                 'added': ['the free crane\'s cab at z -12 as a standing place', 'the far gate as a place for the end', 'lamp bodies max(0.25, v2 radius) with 0.25 m margin (v1.1 used 0.15 m and 0)',
                           'the six cubes on the free crane\'s bridge (N464) as a keep-out box, 0.25 m margin', 'the cut\'s two tie-offs (strap or steel), 0.25 m margin', 'the other unit as a body, 0.25 m margin', 'people over the whole floor in the cast (2.4 m)'],
                 'places': [{'name': n, 'x_m': [R3(a_), R3(b_)], 'z_m': [R3(c_), R3(d_)], 'surface_m': R3(h_), 'source': src} for (n, a_, b_, c_, d_, h_, src) in PLACES]},
        'unit_kind': {'code': 'UP-LA40WF', 'source': 'scripts/place/fixtures/fixtures.json kinds.laser', 'power_w_by_nm': {str(k): v_ for k, v_ in P_W.items()}, 'total_w': P_TOTAL, 'divergence_mrad': PHI * 1000,
                      'divergence_basis': 'EQUIVALENT (Blue Sea BLLO-RGB40, "< 1.3 mrad"; full angle assumed; 1/e or 1/e2 not stated)', 'aperture_m': {'tube (clearance)': APERTURE_TUBE, 'nohd': APERTURE_NOHD, 'basis': 'ASSUMED: the maker prints none; fixtures.json photometry note "6-10 mm"'},
                      'body_m': [UNIT_W, UNIT_H, UNIT_L], 'weight_kg': UNIT_KG, 'power_draw_w': UNIT_POWER_W, 'weight_power_basis': 'EQUIVALENT', 'dmx': '32 ch (TESTED at Sevan): ch 2 mode 25 auto / 75 sound / 250 manual; it scans graphics: a static beam is a chosen graphic, not a guarantee',
                      'scan_angle': 'not published (owed): the hard stop (an aperture mask) contains whatever the scanner does'},
        'world': {'glb': '/mnt/data/footage/place-moxir-hall-v9-show-park-2026-10-08/hall.glb', 'glb_sha256': 'aac5cf55b4cc2e99e903d267e2152c76090505f15a888963e3950ce6d038bda2', 'hall': HALL,
                  'v2_spread_rig': '%s at %s (%s)' % (SPREAD, A.spread_commit, SPREAD_SHA),
                  'changes': ['the free crane moved from z -41 (the GLB) to its show park z -12: girders at the safe underside 7.69, its cab dropped with it; NO laser bar or drop frame under it (N464)',
                              'the six cubes as a keep-out box on the free crane\'s bridge top (N464)', 'the near crane girders at the safe underside 7.2 (the GLB draws 7.6), its cab dropped with it',
                              'the cut\'s two tie-offs as 0.1 m bars', 'pendant lamps from 9.0 (the GLB draws 9.5)', 'the v2 spread lamps as 0.5 m boxes', 'people over the whole floor (2.4 m)', 'the other UP-LA40WF as a box']},
        'mount_options': rows,
        'mount': {'chosen': mo['id'], 'what': mo['what'], 'apertures_m': [[R3(c) for c in u['p']] for u in units],
                  'load_kg_estimate': {'units': 2 * UNIT_KG, 't_bar_clamps_safeties_cable': 20, 'sum_kg': 2 * UNIT_KG + 20, 'basis': '2 x 35 kg EQUIVALENT + ~20 kg ESTIMATE (a ~1.5 m truss T-bar, two U-brackets, clamps, two safety steels, cables)'},
                  'owed': ['the rental house\'s tower + T-bar: model, its load table at this height and this offset (2 x 35 kg on a T-bar), base, outriggers and ballast; a stability check to ANSI E1.21-2013',
                           'the pen around the tower base (a barrier 1 m clear of the outriggers), at the chill zone\'s edge (x -7.5): the organiser\'s crowd plan decides it',
                           'a rigger\'s sign-off of the tower, the T-bar, the U-brackets and the safety steels (EN 17206 / DGUV V17)',
                           'the aim held to 0.5 deg: the tower must not sway more than that (ballast, guys or a tie-off to the column x -12 z 48: the rigger\'s call)']},
        'margins_by_mount': {r['id']: r['worst_margin_m'] for r in rows},
        'under_the_beams': under_the_beams(units),
        'ends_apart_tradeoff': {'at': mo['id'], 'forced_apart_m': units[0]['tradeoff'], 'chosen': 'not forced (0.00): safety margin first; the two beams meet near one spot on the far wall'},
        'what_if': units[0]['what_if'],
        'search_limit': 'a compass search from 4 starts finds a good layout, not a proven optimum: a relaxed constraint can return a slightly worse number (seen once in a what-if); the layout written here is checked in full either way',
        'keep_out': {'boxes': keep_out(units), 'rule': 'the cube beams\' new ends and tubes keep >= 0.25 m clear of every box (lead, N464); the two units leave the upper entry wall (y >= 9, x -6..4) free: they are not on that wall at all',
                     'tubes_highest_y_m': R3(max(b_['y_m'][1] for b_ in keep_out(units) if b_['id'].startswith('KO-3')))},
        'fixtures': fx,
        'setup_sheet': sheet,
        'nohd': nohd_table(),
        'cubes': {'n464': 'the six cubes sit ON the free crane at z -12 (aperture 8.5-9.0), new aims being designed elsewhere; the old cube tubes (aerial-far-crane.json, hung at 5.2 m) are NOT used here',
                  'keep_out_box_used': {'x_m': [R3(CUBES_TOP['lo'][0]), R3(CUBES_TOP['hi'][0])], 'y_m': [R3(CUBES_TOP['lo'][1]), R3(CUBES_TOP['hi'][1])], 'z_m': [R3(CUBES_TOP['lo'][2]), R3(CUBES_TOP['hi'][2])], 'what': CUBES_TOP['what']}},
        'e_stops': {'e_stop_1': 'FOH (Dima): cuts the UP-LA40WF output (its interlock or a contactor on its supply, whichever the bench test shows stops the beam in < 0.5 s)',
                    'e_stop_2': 'the spotter (Kira) at x -7.0, z -4.5, as for the cubes', 'seen_share': {u['id']: u['seen'] for u in units}},
        'owed': ['THE HARD STOP: an aperture mask on each unit\'s output (non-combustible, rated for 41 W continuous) that lets out only the aim +-0.3 deg; nothing in this design works without it, because the UP-LA40WF takes DMX and has no software safety zone',
                 'the unit\'s behaviour when DMX is lost (hold, blackout or auto mode 25 / sound 75): bench test; the mask contains it either way',
                 'the unit\'s interlock / key switch and how E-stop 1 cuts it (bench test, < 0.5 s)', 'the aperture (mm) and the divergence definition from Poligraf or the label; the scan angle',
                 'nothing to stand on under the beams higher than under_the_beams says (tables, benches, crates, cases in the strip it names: 0.80 m at the entry end, 0.17 m at the far end): the crowd plan',
                 'the near crane underside taped (7.2-8.1 m; 7.2 used): it binds',
                 'the far half\'s pendant lamps (z -42..-5, not seen on 10-08, not in the model): nothing may hang lower than the beams\' tube top + 0.25 m over their strip (keep_out KO-3: 8.17 + 0.25 = 8.42 m at the far end)', 'the FOH riser height and place (0.6 m ASSUMED at x -6.7..-3.7, z 28-30): it binds',
                 'the free crane seen at z -12 with the cubes on its top (N464)', 'the LSO\'s walk with the beams at alignment power, and the permit\'s issuer + number'],
        'assumed': ['aperture 10 mm (tube) / 6 mm (NOHD)', 'divergence 1.3 mrad full angle', 'body 0.42 x 0.235 x 0.555 m and 35 kg (EQUIVALENT)', 'the entry platform and the FOH riser as in the v1.1 files',
                    'the far wall is block where the model says so (no window, no door other than the gate)', 'the T-bar, pen and outrigger sizes in the keep-out boxes (ESTIMATE)'],
    }
    return rig


# ------------------------------------------------------------------ pictures (matplotlib, no browser)
ASH, EMBER, POLI = '#e8e4dc', '#ff3a12', '#4fd1ff'
BG, PANEL, TXT, MUTED = '#0d0e10', '#141518', '#f5f2ea', '#9aa0a8'


def _ax(ax):
    ax.set_facecolor(PANEL)
    ax.tick_params(colors=MUTED, labelsize=8)
    for s in ax.spines.values():
        s.set_color('#3a3d44')


def hot_zone_cells():
    Z = J(ZONES)
    out = {}
    for z in Z['zones']:
        cells = []
        for a in z['areas']:
            for c in a['cells_1m']:
                for x0, x1 in c['x_runs']:
                    cells.append((x0, x1, c['z'] - 0.5, c['z'] + 0.5))
        out[z['id']] = cells
    return out


def fig_plan(rig, units, path):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.patches import Rectangle, Polygon
    fig, ax = plt.subplots(figsize=(11, 20), dpi=120)
    fig.patch.set_facecolor(BG)
    _ax(ax)
    zc = hot_zone_cells()
    for k, col in (('hot', '#5a2a14'), ('chill', '#3a2a40'), ('bar', '#40401a')):
        for (x0, x1, z0, z1) in zc.get(k, []):
            if -16 <= x0 <= 16 or -16 <= x1 <= 16:
                ax.add_patch(Rectangle((x0, z0), x1 - x0, z1 - z0, fc=col, ec='none', alpha=0.55, zorder=1))
    ax.text(-15.6, -29.5, 'hot zone (owner\'s paint 17:42):\npeople, to z -31 behind the stage', color='#ff9a6a', fontsize=7, zorder=8)
    ax.text(-15.6, 51.0, 'chill zone + food', color='#d7a8e0', fontsize=7, zorder=8)
    ax.text(6.6, 40.0, 'bar', color='#e0e07a', fontsize=7, zorder=8)
    for x in (-12.0, 12.0):
        for z in G['column_grid_z_m']:
            ax.add_patch(Rectangle((x - 0.4, z - 0.25), 0.8, 0.5, color='#8a8f98', zorder=3))
    for sgn in (-1, 1):
        xa, xb = sorted((sgn * 11.0, sgn * 12.65))
        ax.add_patch(Rectangle((xa, -53.8), xb - xa, 107.6, fc='#6b5a48', alpha=0.5, ec='none', zorder=2))
        ax.plot([sgn * 8.5] * 2, [-53.8, 53.8], color='#c77d2e', ls=':', lw=1.0, zorder=3)
    ax.text(-12.6, -38.0, 'runway walkway (person 7.96 + 2.0)', color='#d9b38a', fontsize=6.5, zorder=8, rotation=90)
    ax.text(-8.35, -38.0, '2.5 m from the walkway', color='#c77d2e', fontsize=6.5, zorder=8, rotation=90)
    for m in G['massing']:
        if m['id'].startswith('pendant-lamp'):
            continue
        (x0, x1), (z0, z1) = m['x_m'], m['z_m']
        ax.add_patch(Rectangle((x0, z0), x1 - x0, z1 - z0, fc='#3b342c', ec='#7a6a58', lw=0.5, zorder=3))
    for c, zz, lab in ((G['cranes'][0], G['cranes'][0]['z_m'], 'near crane z 0.15 (the cut), underside 7.2 safe'), (G['cranes'][1], FAR_Z, 'FREE crane z -12 (6 LaserCubes), underside 7.69 safe')):
        ax.add_patch(Rectangle((-11.35, zz - 1.45), 22.7, 2.9, fc='#d8b400', alpha=0.28, ec='#d8b400', zorder=4))
        ax.text(1.2, zz + 1.7, lab, color='#ffe066', fontsize=7, zorder=9, bbox=dict(fc=PANEL, ec='none', alpha=0.85, pad=1))
    ax.add_patch(Rectangle((CUBES_TOP['lo'][0], CUBES_TOP['lo'][2]), CUBES_TOP['hi'][0] - CUBES_TOP['lo'][0], CUBES_TOP['hi'][2] - CUBES_TOP['lo'][2], fill=False, ec='#ffffff', hatch='///', lw=0.6, zorder=6))
    for nm, a_, b_ in TIEOFFS:
        ax.plot([a_[0], b_[0]], [a_[2], b_[2]], color='#ffb08a', lw=1.0, ls='-', zorder=7)
    ax.text(1.0, -5.3, 'cut tie-off hr (6.15 m)', color='#ffb08a', fontsize=6.5, zorder=9)
    ax.plot([CUT_ENDS[0][0], CUT_ENDS[1][0]], [CUT_Z, CUT_Z], color='#ffb08a', lw=4, zorder=7)
    ax.text(-15.6, -2.6, 'the cut: x -11.04 (2.89 m) -> 0.55 (6.0 m)', color='#ffb08a', fontsize=7, zorder=9)
    b = DES['booth']
    ax.add_patch(Rectangle((b['centre_x_m'] - 1.5, b['front_z_m'] - 2.0), 3.0, 2.0, fc='#1fa35a', ec='#6fe08f', zorder=7))
    ax.text(b['centre_x_m'], b['front_z_m'] - 1.0, 'DJ', color=BG, fontsize=7, ha='center', va='center', zorder=8)
    f = DES['foh']
    ax.add_patch(Rectangle((f['p'][0] - 1.5, f['p'][2] - 1.0), 3.0, 2.0, fc='#7f9cff', zorder=7))
    ax.text(f['p'][0], f['p'][2], 'FOH', color=BG, fontsize=7, ha='center', va='center', zorder=8)
    ax.plot([-11.6, 2.0], [8.2, 8.2], color='#ff4a3a', lw=1.5, zorder=6)
    ax.text(-15.6, 8.6, 'barrier z 8.2', color='#ff8a7a', fontsize=7, zorder=8)
    ax.plot([-3, 3], [53.8, 53.8], color='#ffffff', lw=6, zorder=8)
    ax.text(-2.6, 54.3, 'audience door (NW), z 53.8', color='#ffffff', fontsize=7, zorder=9)
    ax.plot([-2.4, 2.4], [-53.8, -53.8], color='#c4553a', lw=6, zorder=8)
    ax.text(-2.4, -55.4, 'artists\' gate (SE)', color='#ff8a7a', fontsize=7, zorder=9)
    ax.add_patch(Rectangle((3.6, 50.8), 7.0, 3.0, fc='#555', ec='#999', zorder=5))
    ax.text(4.0, 49.6, 'entry platform 2.4 m', color='#bbb', fontsize=6.5, zorder=8)
    ax.text(1.2, -16.6, '6 LaserCubes ON the free crane (N464), 8.5-9.0 m:\ntheir new aims are designed elsewhere (not drawn)', color=ASH, fontsize=7, zorder=9, bbox=dict(fc=PANEL, ec='none', alpha=0.85, pad=1))
    ax.plot([-6.0, 4.0], [53.5, 53.5], color=ASH, lw=3, ls=':', zorder=9)
    ax.text(-6.0, 51.9, 'cubes\' new ends: NW wall, y >= 10.2, x -6..4', color=ASH, fontsize=6.5, zorder=9)
    for ko in keep_out(units)[:2]:
        ax.add_patch(Rectangle((ko['x_m'][0], ko['z_m'][0]), ko['x_m'][1] - ko['x_m'][0], ko['z_m'][1] - ko['z_m'][0], fill=False, ec='#ff66cc', lw=1.0, ls='-', zorder=11))
    ax.text(-4.9, 45.6, 'keep-out KO-1 (units + T-bar)\nand KO-2 (tower + pen): magenta', color='#ff66cc', fontsize=7, zorder=11, bbox=dict(fc=PANEL, ec='none', alpha=0.85, pad=1))
    for u in units:
        p, T = u['p'], u['T']
        L_ = u['length']
        s = np.linspace(0, L_, 60)
        x = p[0] + s * (T - p)[0] / L_
        z = p[2] + s * (T - p)[2] / L_
        r = np.array([tube_r(v) for v in s])
        ax.fill(np.r_[x - r, (x + r)[::-1]], np.r_[z, z[::-1]], color=POLI, alpha=0.16, lw=0, zorder=6)
        ax.plot([p[0], T[0]], [p[2], T[2]], color=POLI, lw=1.2, zorder=7)
        lo, hi = unit_box(p)
        ax.add_patch(Rectangle((lo[0], lo[2]), hi[0] - lo[0], hi[2] - lo[2], fc=POLI, ec='#ffffff', lw=0.6, zorder=10))
        ax.plot(T[0], T[2], '*', color=POLI, ms=9, zorder=10)
    pa = units[0]['p']
    ax.text(pa[0] - 0.9, pa[2] + 1.6, 'tower + T-bar, z %.0f\n2 x UP-LA40WF, y %.2f' % (pa[2], pa[1]), color=POLI, fontsize=7.5, zorder=11, bbox=dict(fc=PANEL, ec='none', alpha=0.85, pad=1))
    ax.text(-15.6, -45.0, 'the 2 entry beams end on the\nfar wall\'s matte block (SE)', color=POLI, fontsize=7.5, zorder=11, bbox=dict(fc=PANEL, ec='none', alpha=0.85, pad=1))
    ax.set_xlim(-16, 16)
    ax.set_ylim(-56.5, 56.5)
    ax.set_aspect('equal')
    ax.set_xlabel('x (m): house left <- -> house right (facing the stage from the door: left is -x)', color=MUTED, fontsize=8)
    ax.set_ylabel('z (m): -> toward the audience door (NW)', color=MUTED, fontsize=8)
    ax.set_title('MOXIR v2 - the 2 Poligraf UP-LA40WF at the entry (house left) and the 6 LaserCubes: plan\n'
                 'bands = each beam\'s 0.8 deg fan + its own optics; worst margin %+.2f m over the cubes\' rule (passes these checks, not "safe")' % min(u['worst'] for u in units), color=TXT, fontsize=10, loc='left')
    fig.savefig(path, facecolor=BG, bbox_inches='tight')
    plt.close(fig)


def fig_section(rig, units, path):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.patches import Rectangle
    fig, ax = plt.subplots(figsize=(20, 8), dpi=120)
    fig.patch.set_facecolor(BG)
    _ax(ax)
    ax.add_patch(Rectangle((-56, -0.3), 112, 0.3, fc='#555'))
    ax.axhline(PERSON_M + VERT_M, color='#ffd166', ls='--', lw=1)
    ax.text(-55.5, 4.6, '5.0 m = person 2.0 + 3.0 over the floor (the whole hall; people to z -31 behind the stage)', color='#ffd166', fontsize=8)
    ax.add_patch(Rectangle((-31.2, 0), 31.2 + 43.8, 2.0, fc='#5a2a14', alpha=0.45))
    b = DES['booth']
    ax.add_patch(Rectangle((b['front_z_m'] - 2.0, 0), 2.0, b['deck_h_m'], fc='#1fa35a'))
    ax.plot([b['front_z_m'] - 2.0 - 2.5, b['front_z_m'] + 2.5], [5.4, 5.4], color='#6fe08f', ls=':', lw=1.2)
    ax.text(b['front_z_m'] + 0.2, 5.0, 'DJ step 0.4 -> 5.4', color='#6fe08f', fontsize=7)
    f = DES['foh']
    ax.add_patch(Rectangle((f['p'][2] - 1.0, 0), 2.0, f['riser_m'], fc='#7f9cff'))
    ax.plot([f['p'][2] - 1.0 - 2.5, f['p'][2] + 1.0 + 2.5], [5.6, 5.6], color='#7f9cff', ls=':', lw=1.2)
    ax.text(f['p'][2] - 3.0, 5.0, 'FOH 0.6 -> 5.6', color='#7f9cff', fontsize=7)
    for cz, under, top, lab in ((G['cranes'][0]['z_m'], NEAR_UNDER, G['cranes'][0]['girder_top_m'], 'near crane\nunderside 7.2 safe'), (FAR_Z, FAR_UNDER, G['cranes'][1]['girder_top_m'], 'free crane\nunderside 7.69 safe')):
        for dz in (-1.1, 1.1):
            ax.add_patch(Rectangle((cz + dz - 0.35, under), 0.7, top - under, fc='#d8b400'))
        ax.text(cz + 1.8, under + 0.1, lab, color='#ffe066', fontsize=7)
    ax.add_patch(Rectangle((CUBES_TOP['lo'][2], CUBES_TOP['lo'][1]), CUBES_TOP['hi'][2] - CUBES_TOP['lo'][2], CUBES_TOP['hi'][1] - CUBES_TOP['lo'][1], fill=False, ec='#ffffff', hatch='///', lw=0.6))
    ax.text(FAR_Z - 13.0, 9.7, '6 cubes ON the free crane (N464): 8.3-9.4 kept out; no bar under it', color='#dddddd', fontsize=7)
    xb = float(np.mean([u['p'][0] for u in units]) + 0.6)                        # the beams' x at the cut plane (about -7.5)
    ycut = CUT_ENDS[0][1] + (xb - CUT_ENDS[0][0]) * (CUT_ENDS[1][1] - CUT_ENDS[0][1]) / (CUT_ENDS[1][0] - CUT_ENDS[0][0]) + CUT_SEC
    ax.add_patch(Rectangle((CUT_Z - 0.15, CUT_ENDS[0][1]), 0.3, CUT_ENDS[1][1] + CUT_SEC - CUT_ENDS[0][1], fc='#ffb08a', alpha=0.18))
    ax.add_patch(Rectangle((CUT_Z - 0.15, CUT_ENDS[0][1]), 0.3, ycut - CUT_ENDS[0][1], fc='#ffb08a', alpha=0.85))
    ax.text(CUT_Z + 0.4, 3.0, 'the cut: at the beams\' x (about %.1f) its top is %.1f m;\nfaint = its high end x 0.55 (6.3 m), 7 m to the right' % (xb, ycut), color='#ffb08a', fontsize=7)
    for lz in range(0, 25, 6):
        ax.add_patch(Rectangle((lz - 0.3, LAMP_LOW), 0.6, 1.6, fc='#888', alpha=0.8))
    ax.text(25, 9.3, 'pendant lamps from 9.0 (safe)', color='#aaa', fontsize=7)
    ax.axhline(G['truss_bottom_m'], color='#888', lw=0.8)
    ax.text(-55.5, 10.95, 'roof bottom chord 10.8', color='#888', fontsize=7)
    for zz in (53.8, -53.8):
        ax.add_patch(Rectangle((zz if zz > 0 else zz - 0.4, 0), 0.4, 14.0, fc='#6b5a48'))
    ax.add_patch(Rectangle((53.8, 0), 0.4, G['door']['h_m'], fc=BG))
    ax.add_patch(Rectangle((-54.2, 0), 0.4, GATE['top_m'], fc='#c4553a'))
    ax.text(-53.3, 2.0, 'gate 5.4 (x -2.4..2.4:\nthe fans end >= 2.5 m beside it)', color='#ff8a7a', fontsize=7)
    ax.plot([54.3, 54.3], [10.2, 13.3], color=ASH, lw=3, ls=':')
    ax.text(44.5, 12.6, 'the cubes\' new ends\n(N464): y >= 10.2', color=ASH, fontsize=7)
    for ko in keep_out(units):
        if ko['id'].startswith('KO-3'):
            ax.add_patch(Rectangle((ko['z_m'][0], ko['y_m'][0]), ko['z_m'][1] - ko['z_m'][0], ko['y_m'][1] - ko['y_m'][0], fill=False, ec='#ff66cc', lw=0.7, ls='--'))
        else:
            ax.add_patch(Rectangle((ko['z_m'][0], ko['y_m'][0]), ko['z_m'][1] - ko['z_m'][0], ko['y_m'][1] - ko['y_m'][0], fill=False, ec='#ff66cc', lw=1.0))
    ax.text(30.0, 8.0, 'magenta = the keep-out envelope (KO-1..3)', color='#ff66cc', fontsize=7)
    for u in units:
        p, T = u['p'], u['T']
        L_ = u['length']
        s = np.linspace(0, L_, 80)
        zz = p[2] + s * (T - p)[2] / L_
        yy = p[1] + s * (T - p)[1] / L_
        r = np.array([tube_r(v) for v in s])
        ax.fill_between(zz, yy - r, yy + r, color=POLI, alpha=0.16, lw=0)
        ax.plot(zz, yy, color=POLI, lw=1.1)
        ax.plot(T[2], T[1], '*', color=POLI, ms=8)
        ax.add_patch(Rectangle((p[2], p[1] - UNIT_H / 2), UNIT_L, UNIT_H, fc=POLI, ec='#fff', lw=0.5))
    p = units[0]['p']
    ax.add_patch(Rectangle((p[2] + 0.1, 0), 0.3, p[1] - 0.2, fc='#4a5a66'))
    ax.text(p[2] - 6.5, 7.0, 'tower + T-bar z %.0f\nunits at y %.2f' % (p[2], p[1]), color=POLI, fontsize=8)
    for u in units:
        for key in ('near crane bridge (safe underside 7.2)', 'free crane bridge z -12 (safe underside 7.69)', 'place: FOH riser', 'place: DJ step', 'place: hall floor (dance floor, backstage, everywhere)'):
            g, q = u['margins'][key][0], u['margins'][key][1]
            if q is not None and u is units[0]:
                ax.annotate('%+.2f' % g, (q[2], q[1]), xytext=(q[2] + 1.5, q[1] + (1.2 if 'crane' in key else -1.4)), color='#ffffff', fontsize=7, arrowprops=dict(arrowstyle='-', color='#aaa', lw=0.6))
    ax.set_xlim(-56, 56)
    ax.set_ylim(0, 14.5)
    ax.set_xlabel('z (m): far (SE) wall, artists\' gate <- stage (z 0) ... audience door (NW) ->', color=MUTED)
    ax.set_ylabel('y (m)', color=MUTED)
    ax.set_title('MOXIR v2 - the entry lasers: long section (x collapsed; the band = the 0.8 deg fan + the unit\'s 10 mm / 1.3 mrad); numbers = margin (m) over the rule at the binding points of beam P1a',
                 color=TXT, fontsize=10, loc='left')
    fig.savefig(path, facecolor=BG, bbox_inches='tight')
    plt.close(fig)


def fig_cuts(rig, units, path):
    """cross-sections x-y at the planes that bind: the free crane z -12, the near crane / the cut z 0.15, the FOH z 29, the far wall z -53.8."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.patches import Rectangle, Circle
    fig, axs = plt.subplots(2, 2, figsize=(16, 9.5), dpi=120)
    fig.patch.set_facecolor(BG)
    planes = [(FAR_Z, 'the free crane, z -12: its bridge (7.69 safe), the cubes on its top (N464), the left walkway\'s 2.5 m'),
              (G['cranes'][0]['z_m'] - 1.3, 'the near crane, z -1.3 (its stage-side girder edge) and the cut, z 0.15'),
              (DES['foh']['p'][2], 'the FOH riser, z 29 (surface 0.6 -> beam >= 5.6 within 2.5 m)'),
              (END_Z + 0.05, 'the far (SE) end wall, z -53.8: the fans end on the block, beside the gate')]
    for ax, (zp, title) in zip(axs.flat, planes):
        _ax(ax)
        ax.add_patch(Rectangle((-14, -0.3), 28, 0.3, fc='#555'))
        ax.axhline(5.0, color='#ffd166', ls='--', lw=1)
        for sgn in (-1, 1):
            xa, xb = sorted((sgn * 11.0, sgn * 12.65))
            ax.add_patch(Rectangle((xa, 7.96), xb - xa, 0.15, fc='#6b5a48'))
            ax.add_patch(Rectangle((xa, 7.96), xb - xa, 2.0, fill=False, ec='#c77d2e', ls=':', lw=0.8))
            ax.plot([sgn * 8.5] * 2, [0, 12], color='#c77d2e', ls=':', lw=1.0)
        ax.text(-12.9, 10.2, 'walkway\n7.96+2.0', color='#d9b38a', fontsize=7)
        if abs(zp - FAR_Z) < 0.5:
            ax.add_patch(Rectangle((-11.35, FAR_UNDER), 22.7, 1.06, fc='#d8b400', alpha=0.8))
            ax.add_patch(Rectangle((CUBES_TOP['lo'][0], CUBES_TOP['lo'][1]), CUBES_TOP['hi'][0] - CUBES_TOP['lo'][0], CUBES_TOP['hi'][1] - CUBES_TOP['lo'][1], fill=False, ec='#ffffff', hatch='///', lw=0.6))
            ax.text(-11.0, 9.6, 'the 6 cubes on the bridge top (N464): 8.3-9.4 kept out', color='#dddddd', fontsize=7)
            cab = G['cranes'][1]['cab']
            ax.add_patch(Rectangle((cab['x_m'][0], FAR_UNDER - 2.1), 2.0, 2.1, fc='#8f7a00'))
            ax.text(cab['x_m'][0], FAR_UNDER - 2.5, 'cab (a place)', color='#ffe066', fontsize=7)
        elif zp < 1 and zp > -2:
            ax.add_patch(Rectangle((-11.35, NEAR_UNDER), 22.7, G['cranes'][0]['girder_top_m'] - NEAR_UNDER, fc='#d8b400', alpha=0.8))
            ax.plot([CUT_ENDS[0][0], CUT_ENDS[1][0]], [CUT_ENDS[0][1] + CUT_SEC / 2, CUT_ENDS[1][1] + CUT_SEC / 2], color='#ffb08a', lw=5)
            for (x, apex) in CUT_PICKS:
                ax.add_patch(Rectangle((x - 0.25, apex - 0.85), 0.5, 7.6 - apex + 0.85, fc='#ffb08a', alpha=0.25))
            for lid, q, r in zip(LAMP_SETS[SHOW_SET]['ids'], LAMP_SETS[SHOW_SET]['P'], LAMP_SETS[SHOW_SET]['r']):
                if abs(q[2] - CUT_Z) < 0.5:
                    ax.add_patch(Circle((q[0], q[1]), r, fc='#ffb08a', ec='none', alpha=0.8))
            m = {mm['id']: mm for mm in G['massing']}['press-crown']
            ax.add_patch(Rectangle((m['x_m'][0], m['y_m'][0]), m['x_m'][1] - m['x_m'][0], m['y_m'][1] - m['y_m'][0], fc='#3b342c', ec='#7a6a58'))
            ax.text(m['x_m'][0], m['y_m'][1] + 0.1, 'press crown 5.6', color='#c9b8a2', fontsize=7)
            bb = DES['booth']
            ax.add_patch(Rectangle((bb['centre_x_m'] - 1.5, 0), 3.0, bb['deck_h_m'], fc='#1fa35a'))
            ax.plot([bb['centre_x_m'] - 1.5 - 2.5, bb['centre_x_m'] + 1.5 + 2.5], [5.4, 5.4], color='#6fe08f', ls=':', lw=1)
            ax.text(-13.6, 1.0, 'DJ step 0.4 -> the 5.4 rule (dotted green)', color='#6fe08f', fontsize=7)
            cab = G['cranes'][0]['cab']
            ax.add_patch(Rectangle((cab['x_m'][0], NEAR_UNDER - 2.1), 2.0, 2.1, fc='#8f7a00'))
        elif zp > 20:
            f = DES['foh']
            ax.add_patch(Rectangle((f['p'][0] - 1.5, 0), 3.0, f['riser_m'], fc='#7f9cff'))
            ax.plot([f['p'][0] - 1.5 - 2.5, f['p'][0] + 1.5 + 2.5], [5.6, 5.6], color='#7f9cff', ls=':', lw=1)
            ax.text(f['p'][0] - 1.4, 5.7, 'FOH 5.6 rule', color='#7f9cff', fontsize=7)
            ax.add_patch(Rectangle((10.0, 0), 1.6, 6.3, fc='#3b342c', ec='#7a6a58'))
            ax.text(9.0, 6.5, 'gallery 3', color='#c9b8a2', fontsize=7)
        else:
            ax.add_patch(Rectangle((-14, 0), 28, 14, fc='#6b5a48', alpha=0.6))
            ax.add_patch(Rectangle((GATE['x_m'][0], 0), 4.8, GATE['top_m'], fc='#c4553a'))
            ax.add_patch(Rectangle((GATE['x_m'][0] - 2.5, 0), 4.8 + 5.0, GATE['top_m'] + 3.0, fill=False, ec='#ff8a7a', ls=':', lw=1))
            ax.text(-2.3, 2.5, 'artists\' gate', color=BG, fontsize=8)
            ax.text(-13.5, 11.3, 'hall-block (matte): the end', color='#e8d5bf', fontsize=8)
        for u in units:
            p, T = u['p'], u['T']
            d = (T - p) / u['length']
            s = (zp - p[2]) / d[2]
            q = p + s * d
            r = tube_r(s)
            ax.add_patch(Circle((q[0], q[1]), r, fc=POLI, alpha=0.22, ec=POLI, lw=1.0))
            ax.plot(q[0], q[1], '+', color=POLI, ms=8)
        keys = {FAR_Z: ['free crane bridge z -12 (safe underside 7.69)', 'place: runway walkway left row (ladders: right)', 'the six cubes on the free crane (N464, margin 0.25)'],
                'near': ['near crane bridge (safe underside 7.2)', 'place: DJ step', 'cut pick 2 (bridle + hoist)', 'the cut (H30V truss)'],
                'foh': ['place: FOH riser'], 'end': ['end: the far gate opening (2.5 m beside, or 3.0 m over its 5.4 m top)', 'place: hall floor (dance floor, backstage, everywhere)']}
        k = FAR_Z if abs(zp - FAR_Z) < 0.5 else ('near' if -2 < zp < 1 else ('foh' if zp > 20 else 'end'))
        lines = ['%-34s %s' % (kk.replace('place: ', '').split(' (')[0], ' / '.join('%+.2f' % u['margins'][kk][0] for u in units)) for kk in keys[k]]
        ax.text(0.99, 0.03, 'margins m (P1a / P2a):\n' + '\n'.join(lines), transform=ax.transAxes, ha='right', va='bottom', color='#ffffff', fontsize=7, family='monospace',
                bbox=dict(fc=PANEL, ec='#3a3d44', alpha=0.9, pad=3), zorder=20)
        ax.set_xlim(-14, 14)
        ax.set_ylim(0, 12)
        ax.set_aspect('equal')
        ax.set_title(title, color=TXT, fontsize=9, loc='left')
        ax.set_xlabel('x (m), house left <- -> house right', color=MUTED, fontsize=8)
        ax.set_ylabel('y (m)', color=MUTED, fontsize=8)
    fig.suptitle('MOXIR v2 - the entry lasers: cross-sections where the corridor binds (blue circles = the two UP-LA40WF fans with the 0.8 deg fan; dotted = the 2.5 m / 3.0 m rule lines)', color=TXT, fontsize=11, x=0.01, ha='left')
    fig.tight_layout(rect=[0, 0, 1, 0.97])
    fig.savefig(path, facecolor=BG, bbox_inches='tight')
    plt.close(fig)


# ------------------------------------------------------------------ the setup sheet (markdown)
def sheet_md(rig):
    L = []
    L.append('# MOXIR v2 - the two Poligraf UP-LA40WF at the entry (2026-10-09): setup sheet')
    L.append('')
    L.append('Owner (2026-10-09 ~20:30, N460.2 / N462): *"2 lasers from poli goes to the up to the entrance, where audience will enter, so 2 from one side 6 from other"*; '
             'the cubes ON the free crane (N464, 21:1x). Written by `scripts/place/moxir_entry_lasers.py` (branch feat/moxir-entry-lasers-2026-10-09); numbers: `scripts/place/rigs/moxir-v2-entry-lasers-2026-10-09.json`.')
    L.append('')
    L.append('**Result:** %s' % rig['result'])
    L.append('')
    L.append('## Mount options (the best aims found for each; two units side by side 0.7 m apart where "2")')
    L.append('')
    L.append('| Option | What | Units | Worst margin (m) | Binds | Verdict |')
    L.append('|---|---|---|---|---|---|')
    for r in rig['mount_options']:
        L.append('| %s | %s | %d | %+.3f | %s | %s |' % (r['id'], r['what'], r['units'], r['worst_margin_m'], r['binding'], ('passes' if r['passes'] else '**FAILS**') + ('' if r['units'] == 2 else ' (%s)' % r.get('note', ''))))
    L.append('')
    L.append('## Per beam (mount option tower-z48)')
    L.append('')
    L.append('| Beam | Aperture (x, y, z) | Aim pan / tilt (deg) | Ends (x, y, z) | Length | Worst margin (m), where | Fan margin (deg) | Lowest place (m over the rule) | Near crane / free crane / cubes on it / cut / tie-offs (m) | Lamp bodies v2 / other unit (m) | 61 rays on the far wall\'s block |')
    L.append('|---|---|---|---|---|---|---|---|---|---|---|')
    for f, s_ in zip(rig['fixtures'], rig['setup_sheet']):
        b = f['laser']['beams'][0]
        lb = next(iter(b['lamp_bodies'].values()))
        L.append('| %s | %s | %+.2f / %+.2f | %s | %.1f m | %+.3f, %s | %+.3f | %+.3f (%s) | %+.2f / %+.2f / %+.2f / %+.2f / %+.2f | %+.2f (%s) / %+.2f | %s, y %s |' % (
            b['id'], f['p'], s_['aim']['pan_deg_from_hall_axis_toward_the_stage_plus_toward_x'], s_['aim']['tilt_deg_above_level'], b['to'], b['length_m'], b['worst_margin_m'], b['binding'],
            b['margin_after_zone_deg'], b['worst_place_margin_m'], b['worst_place'], b['near_crane_under_margin_m'], b['free_crane_under_margin_m'], b['cubes_on_the_free_crane_margin_m'], b['cut_truss_margin_m'],
            b['cut_tieoffs_margin_m'], lb['margin_m'], lb['nearest'], b['other_unit_margin_m'], 'yes' if b['cast']['all_on_matte_block'] else 'NO', b['cast']['end_y_m']))
    L.append('')
    L.append('## Setup (pan from the hall axis toward the STAGE, + toward +x / house right; tilt above level; roll 0)')
    L.append('')
    L.append('| Beam | Mount | Aim | Window (the rule holds, the beam alone) | Hard stop: aperture mask keep-in | Beam block |')
    L.append('|---|---|---|---|---|---|')
    for s_ in rig['setup_sheet']:
        L.append('| %s | %s, aperture %s | pan %+.2f / tilt %+.2f | pan %s, tilt %s | pan %s, tilt %s (fits after the 0.5 deg mount tolerance: %s) | below %+.2f deg |' % (
            s_['unit'], s_['mount']['on'], s_['mount']['aperture_m'], s_['aim']['pan_deg_from_hall_axis_toward_the_stage_plus_toward_x'], s_['aim']['tilt_deg_above_level'],
            s_['window_rule_holds_deg']['pan'], s_['window_rule_holds_deg']['tilt'], s_['hard_stop_aperture_mask_deg']['pan'], s_['hard_stop_aperture_mask_deg']['tilt'],
            s_['hard_stop_aperture_mask_deg']['why'].split(': ')[-1], s_['beam_block']['lowest_ray_allowed_tilt_deg']))
    L.append('')
    L.append('## Keep-out envelope (for the cubes\' new ends, N464): keep >= 0.25 m clear of every box')
    L.append('')
    L.append('| Box | x (m) | y (m) | z (m) |')
    L.append('|---|---|---|---|')
    for k in rig['keep_out']['boxes']:
        L.append('| %s | %s | %s | %s |' % (k['id'], k['x_m'], k['y_m'], k['z_m']))
    L.append('')
    L.append(rig['keep_out']['rule'] + '; the beams\' tubes never rise above y %.2f m.' % rig['keep_out']['tubes_highest_y_m'])
    L.append('')
    n = rig['nohd']
    L.append('## NOHD (IEC 60825-1:2014 Table A.1; aperture 6 mm ASSUMED, 1.3 mrad EQUIVALENT)')
    L.append('')
    L.append('41 W, 0.25 s: **%d m**; 10 s: %d m; if 1/e2 values: %d m. Per colour: %s. Dimming: %s. Eye-safe at 5 m from the aperture: %.1f mW. Diffuse off the block: %s m. The hall is 108 m: separation and the hard stop are the control.' % (
        n['all_colours_41w_0_25s_m'], n['all_colours_41w_10s_m'], n['if_10mm_1_3mrad_are_1_e2_values_m'], ', '.join('%s %d m' % kv for kv in n['per_colour_0_25s_m'].items()),
        ', '.join('%s %d m' % kv for kv in n['dimming_0_25s_m'].items()), n['eye_safe_power_at_5_m_from_the_aperture_mw'], n['diffuse_hazard_off_the_block_m']))
    L.append('')
    L.append('## Owed before any emission')
    L.append('')
    for o in rig['owed'] + rig['mount']['owed']:
        L.append('- ' + o)
    L.append('')
    return '\n'.join(L)


if __name__ == '__main__':
    rows, units, chosen = run()
    rig = build(rows, units, chosen)
    if A.check:
        print(json.dumps(rig, indent=1, default=lambda o: o.tolist() if hasattr(o, 'tolist') else str(o)))
        sys.exit(0)
    json.dump(rig, open(os.path.join(REPO, A.rig_out), 'w'), indent=1, default=lambda o: o.tolist() if hasattr(o, 'tolist') else str(o))
    print('rig', A.rig_out, '· worst margin', min(u['worst'] for u in units), '· casts', [u['cast']['all_on_matte_block'] for u in units])
    if A.out:
        od = os.path.expanduser(A.out)
        os.makedirs(od, exist_ok=True)
        fig_plan(rig, units, os.path.join(od, 'entry-lasers-plan.png'))
        fig_section(rig, units, os.path.join(od, 'entry-lasers-section.png'))
        fig_cuts(rig, units, os.path.join(od, 'entry-lasers-cross-sections.png'))
        open(os.path.join(od, 'setup-sheet.md'), 'w').write(sheet_md(rig))
        print('pictures + setup sheet in', od)
