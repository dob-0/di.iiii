#!/usr/bin/env python3
# moxir_v2_spread.py — MOXIR v2 after the owner's look at B tuned (2026-10-09): light on the stage from the audience side, the
# cut's count decided, the six LaserCubes on the free crane at z -12 (the laser session's aims), and every light spread over
# the owner's painted HOT ZONE, placed from the audience's view positions (moxir_v2_eyes.py; rigs/moxir-v2-zones-2026-10-09.json).
#
#   python3 -I scripts/place/moxir_v2_spread.py build --repo . [--out <dir>] [--placement <dir>/placement.json]  # rig + checks (~25 min; reuse = minutes)
#   python3 -I scripts/place/moxir_v2_spread.py plan  --repo . --out <dir>       # the frame plan (moxir-v2-true-frames.cjs)
#   python3 -I scripts/place/moxir_v2_spread.py page  --repo . --out <dir>       # contact sheet + index.html
#   python3 -I scripts/place/moxir_v2_spread.py candidates --repo . --out <dir>  # task 2 input: audience-half places, sky clear %
#
# THE OWNER (2026-10-09, on draft PR #853, B tuned): "look what stage is totally dark i think we need to use area right you closed
#   in one area so check the lasers place on the other crane there 2 cranes one with truss one with the lasers and we not worked on
#   lights i mean how much light goes to truss?" — and (to the coordinator, 17:3x) "yes the crane can move".
# MEASURED on B tuned before this change (the coordinator, rig file): the audience stands between the barrier (z 8.2) and the
#   entry (z ~51) facing -z; 61 of 69 units stood at z <= 6, the audience half had ONE PAR; nothing lit the DJ or the stage from
#   the front: the cut (z 0.15) is BEHIND him, so the DJ and the speakers were silhouettes.
#
# METHOD (each number computed here or named)
#   STAGE FRONT LIGHT: two keys on the DJ from either side of the audience, the McCandless pair (S. McCandless, "A Method of
#     Lighting the Stage", 1932: two lights ~45 deg off the centre line, ~45 deg up) as far as the hall allows: house left on the
#     nave column x -12 z 12 (a column bracket at 6.0 m, under the flared head at 6.21 m), house right on a stand in the pit (the
#     barrier's crew side; the right row's column has the gallery and pipes in front of it). Two more on the same two mounts light
#     the speaker faces and the booth front. Their light is MEASURED in the room (measurement mode, lux probe on a vertical
#     plane at the DJ's face; docs/architecture/MEASUREMENT_MODE.md) and computed here (E = I cos(i) / d^2, three.js's spot cone
#     (smoothstep from the angle to angle x (1 - penumbra)), the hall cast for shadow), at the room's PAR candela (epic-build:
#     609.56 / 0.02 = 30 478 cd, "beta's own PAR figure", source not recorded) AND at the EQUIVALENT spec figure 11 000 cd
#     (fixtures-exact.md: 11 000 lx at 1 m, another maker, an upper estimate). The two differ by 2.77x: stated, not hidden.
#   THE DJ'S EYES: no lamp whose lens he sees lit (his eye inside its cone) may stand within 20 deg of his eye line toward the
#     crowd (the brief's rule). Each lens he sees is reported with its disability-glare veil L_v = 10 E / theta^2 (Stiles-Holladay,
#     CIE 146:2002 / CIE 135, theta in degrees, E at his eye in lx). DJ eye: the step 0.4 m + 1.63 m (adult standing eye height,
#     50th percentile, Pheasant & Haslegrave, Bodyspace 3rd ed.), at x -5.2 z 4.3, looking +z, level.
#   OUT OF REACH: every unit added in the public half stands with its body >= 2.7 m over the floor (ISO 13857:2019 Table 2, upward
#     reach where the risk is high), so it needs no guard cage; the floor units at the stage columns keep their guard owed.
#   EVERY B380F RE-CHECKED (occlusion_sky.beam_check, moxir_v2.low_over_standing: no ray into the people, no glass, >= 3 m over
#     every standing level along the whole beam) in the world of the night: the people over the WHOLE public half (x -36.4..60.4,
#     z 8.2..53.8, up to 2.4 m), the far crane at z -12 with the laser hang, the old z -41 crane gone.
#   AUDIENCE-HALF CANDIDATES (task 2 input only): occlusion_sky.sky (1200 equal-solid-angle rays, the share clear >= 30 m) and
#     par_on_steel (15 deg lens) at the column feet, column brackets (3.0 m), side-span walls, the entry end and the machine tops.
#   THE CUT: cut-count.mjs's own table for 10 and 12 (picks, headroom, shafts that stay separate with the 15 / 25 deg lens), the
#     light the cut gives the DJ's face (computed: it hangs behind him), and the 12-lamp places checked against the laser tubes.
#   LASERS: the laser session's data USED AS GIVEN, never re-aimed: git cf954908 (PR #844, fix/moxir-v1-1-bugs-2026-10-09)
#     scripts/place/rigs/moxir-epic-v1-1-2026-10-08.json — the 6 cube units and the laser bar — cross-checked against the
#     session's table aerial-far-crane.json (every from / to equal). The crane travel to z -12 is the owner's decision
#     (2026-10-09). The CHECK: every unit of this rig (and the pit stand, the smoke machine) against every laser tube: the axis
#     from the cube to its end on the wall, the tube's radius the beam's 4 mm + the fan's half angle 1.008 deg (the table's
#     half_fan_deg) x the distance, a body radius per unit (PAR 0.25 m, B380F 0.45 m with its head's sweep, smoke 0.5 m, ASSUMED
#     from the maker sizes). A margin under the laser session's own tightest lamp-body margin (0.37 m) is flagged.
#   POWER / DMX: moxir_v2.circuits / patch on the moved units (16 A radials <= 2 944 W, BS 7671 4D2B volt drop; branches <= 32).
import argparse, copy, hashlib, json, math, os, subprocess, sys

for _k in ('OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS'):
    os.environ.setdefault(_k, '1')          # heat rule (owner 10-09): one BLAS thread

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.dont_write_bytecode = True

DATE = '2026-10-09'
ZONES_SRC = 'scripts/place/rigs/moxir-v2-zones-2026-10-09.json (the owner\'s paint, 17:42; read_paint.py, commit 465b57e7)'
RIG_BT = 'scripts/place/rigs/moxir-v2-planes-tuned-%s.json' % DATE
RIG_SP = 'scripts/place/rigs/moxir-v2-spread-%s.json' % DATE
LASER_COMMIT = 'cf954908'
LASER_RIG = 'scripts/place/rigs/moxir-epic-v1-1-2026-10-08.json'
LASER_TABLE = '/tmp/claude-1000/-home-dob/f28555fe-b198-4163-85d9-cbd2b3df47ba/scratchpad/aerial-far-crane.json'
LASER_TABLE_SHA = '56826b0dea8b8e03b9ea704434e4eb34a58052db62b6e819210dbd5d90c8fefa'
EMBER, ASH, DEEP = '#ff3a12', '#e8e4dc', '#a3200c'
R3 = lambda v: round(float(v), 3)
JD = lambda o: o.item() if hasattr(o, 'item') else (o.tolist() if hasattr(o, 'tolist') else str(o))

PAR_CD_ROOM = 609.56 / 0.02          # epic-build candelaOf('up-pl5403'): the room's own PAR
PAR_CD_SPEC = 11000.0                # fixtures-exact.md EQUIVALENT, 15 deg, an upper estimate
B380_CD_ROOM = 1004000 / 0.02
DJ_EYE = (-5.2, 2.03, 4.3)
DJ_RULE_DEG = 20.0
REACH_M = 2.7                        # ISO 13857:2019 Table 2, high risk
TARGETS = {                           # vertical planes facing the crowd (+z): what must read from the floor
    'DJ face': ([-5.2, 1.9, 4.6], [0, 0, 1]),
    'booth front': ([-5.2, 1.0, 5.3], [0, 0, 1]),
    'PA L face': ([-8.25, 1.0, 6.75], [0, 0, 1]),
    'PA R face': ([-1.5, 1.0, 7.25], [0, 0, 1]),
}
# the public half's people: the whole floor from the barrier to the entry wall, heads 1.9 m + arms 0.5 m
PUBLIC = {'x_m': (-36.4, 60.4), 'z_m': (8.2, 53.8), 'y_m': (0.0, 2.4)}
FAR_CRANE_Z = -12.0
FAR_CRANE_UNDERSIDE = 7.69           # aerial-far-crane.json bridge.underside_used_m (photo 007, the LOW end of 7.69-8.24)
BODY_R = {'up-pl5403': 0.25, 'up-b380f': 0.45, 'up-yz31p': 0.5}
LASER_TIGHTEST_M = 0.37              # the laser session's own tightest lamp-body margin (4a, aerial-report.md)
PIT_STAND = {'p': [0.4, 0.0, 7.3], 'top_m': 4.5, 'what': 'a wind-up lighting stand (one PAR at 4.5 m) in the pit, 0.9 m behind the barrier, right of the PA R box, base weighted and tied off (crew side)'}
K_COL = [-11.35, 6.0, 11.6]           # the nave column x -12 z 12, stage-facing side: a column bracket (3 PARs, 5.1-6.0 m) under the flared head (6.21 m)


def sha256(p):
    h = hashlib.sha256()
    with open(p, 'rb') as fh:
        h.update(fh.read())
    return h.hexdigest()


def unit(v):
    import numpy as np
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)


# ====================================================================== the world as the night will be
def night_world(repo):
    """occlusion_sky.World with the free crane moved to z -12 (owner 2026-10-09), its laser hang, and the people over the
    WHOLE public half."""
    import numpy as np
    import occlusion_sky as S
    W = S.World(repo)
    gone = [i for i, n in enumerate(W.labels) if n.startswith('crane z -41')]
    idx = np.nonzero(np.isin(W.lab, gone))[0]
    W.V0[idx] = [0.0, -1000.0, 0.0]
    W.C[idx] = [0.0, -1000.0, 0.0]                                    # the crane is no longer at z -41
    W.boxes = [b for b in W.boxes if b.cls != 'crane']
    z = FAR_CRANE_Z
    G = W.G['cranes'][1]
    top = G['girder_top_m']
    for dz in G['girders_dz_m']:
        W.boxes.append(S.OBox.aabb('far crane z -12 girder', 'crane', (-11.35, 11.35), (FAR_CRANE_UNDERSIDE, top), (z + dz - 0.35, z + dz + 0.35)))
    W.boxes.append(S.OBox.aabb('far crane z -12 trolley', 'crane', tuple(G['trolley']['x_m']), (top, top + 1.0), (z - 1.6, z + 1.6)))
    drop = G['girder_bottom_m'] - FAR_CRANE_UNDERSIDE
    W.boxes.append(S.OBox.aabb('far crane z -12 cab', 'crane', tuple(G['cab']['x_m']), (G['cab']['y_m'][0] - drop, G['cab']['y_m'][1] - drop), (z - 1.0, z + 1.0)))
    W.boxes.append(S.OBox.aabb('laser hang z -12 (bar + drop frame + 6 cubes)', 'crane', (-6.0, 4.5), (4.75, FAR_CRANE_UNDERSIDE), (z - 0.4, z + 0.4)))
    W.boxes.append(S.OBox.aabb('the public half (1.9 m + 0.5 m arms)', 'audience', PUBLIC['x_m'], PUBLIC['y_m'], PUBLIC['z_m']))
    return W


# ====================================================================== lasers: the laser session's data, as given
def lasers(repo, table_path):
    rig = json.loads(subprocess.run(['git', 'show', '%s:%s' % (LASER_COMMIT, LASER_RIG)], capture_output=True, text=True, cwd=repo, check=True).stdout)
    cubes = [f for f in rig['fixtures'] if f['type'] == 'ext-lc-ultra-mk2']
    bar = next(s for s in rig['solids'] if s['id'] == 'rig-crane-bar')
    check = {'table': table_path, 'table_sha256': None, 'equal': None}
    if table_path and os.path.exists(table_path):
        T = json.load(open(table_path))
        check['table_sha256'] = sha256(table_path)
        rows = {l['cube']: l for l in T['lasers']}
        check['equal'] = all(rows[c['id']]['from'] == c['p'] and rows[c['id']]['to'] == c['laser']['beams'][0]['to'] for c in cubes)
        if not check['equal']:
            raise SystemExit('the committed laser units (git %s) differ from the laser session\'s table: stop, ask the laser session' % LASER_COMMIT)
        half_fan = {c['id']: rows[c['id']]['half_fan_deg'] for c in cubes}
    else:
        half_fan = {c['id']: 1.008 for c in cubes}
    tubes = [{'beam': c['laser']['beams'][0]['id'], 'cube': c['id'], 'from': c['p'], 'to': c['laser']['beams'][0]['to'], 'half_fan_deg': half_fan[c['id']]} for c in cubes]
    return cubes, bar, tubes, check


def tube_clearance(tubes, q, body_r):
    """The smallest gap between a body (a sphere at q) and any laser tube: distance to the axis - the tube radius there - the body."""
    import numpy as np
    q = np.asarray(q, float)
    best = (1e9, None)
    for t in tubes:
        a, b = np.asarray(t['from'], float), np.asarray(t['to'], float)
        L = float(np.linalg.norm(b - a))
        u = (b - a) / L
        s = min(L, max(0.0, float((q - a) @ u)))
        d = float(np.linalg.norm(q - (a + u * s)))
        r = 0.002 + s * math.tan(math.radians(t['half_fan_deg']))
        g = d - r - body_r
        if g < best[0]:
            best = (g, t['beam'])
    return best


# ====================================================================== light on a plane, from one lamp
def smooth(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def e_on(W, f, tgt, n, cd):
    """lx on a plane (point tgt, normal n) from lamp f at full, candela cd (three.js spot cone, the hall's shadow)."""
    import numpy as np
    import lights_beta_options as L
    p = np.asarray(f['p'], float)
    ax = L.aim_dir(f['r'])
    v = np.asarray(tgt, float) - p
    d = float(np.linalg.norm(v))
    u = v / d
    half = f['angle_rad']
    pen = {'up-pl5403': 0.5, 'up-b380f': 0.1}.get(f['type'], 0.4)
    att = smooth(math.cos(half), math.cos(half * (1 - pen)), float(ax @ u))
    cosi = max(0.0, float(-u @ np.asarray(n, float)))
    if att <= 0 or cosi <= 0:
        return 0.0
    t, _, _ = W.cast(p, u[None, :], reach=d - 0.15, tmin=0.35, skip=('dj', 'audience', 'booth', 'the public half (1.9 m + 0.5 m arms)'))
    if np.isfinite(t[0]):
        return 0.0
    return att * cd * cosi / d ** 2


def lum_factor(colour):
    """Rec. 709 luminance of a lamp colour (linear sRGB): the share of white a coloured lamp's lx carries."""
    c = [int(colour[i:i + 2], 16) / 255.0 for i in (1, 3, 5)]
    lin = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]


def stage_light(W, rig, look_id, cd_par=PAR_CD_ROOM):
    lk = next(l for l in rig['looks'] if l['id'] == look_id)
    out = {}
    for tn, (tp, n) in TARGETS.items():
        tot, by = 0.0, {}
        for f in rig['fixtures']:
            if f['type'] not in ('up-pl5403', 'up-b380f') or f['part'] not in lk['parts']:
                continue
            col, lev = lk['parts'][f['part']]
            cd = cd_par if f['type'] == 'up-pl5403' else B380_CD_ROOM
            e = e_on(W, f, tp, n, cd) * lev * lum_factor(col or f.get('colour') or ASH)
            if e > 0.05:
                by[f['part']] = by.get(f['part'], 0.0) + e
                tot += e
        out[tn] = {'lx': R3(tot), 'by_part': {k: R3(v) for k, v in sorted(by.items(), key=lambda kv: -kv[1])}}
    return out


def dj_glare(rig, look_id):
    """Every lens the DJ sees lit in a look: its angle from his eye line, lx at his eye, the Stiles-Holladay veil."""
    import numpy as np
    import lights_beta_options as L
    lk = next(l for l in rig['looks'] if l['id'] == look_id)
    e0 = np.asarray(DJ_EYE, float)
    rows = []
    for f in rig['fixtures']:
        if f['type'] not in ('up-pl5403', 'up-b380f') or f['part'] not in lk['parts']:
            continue
        p = np.asarray(f['p'], float)
        to_eye = e0 - p
        d = float(np.linalg.norm(to_eye))
        if float(L.aim_dir(f['r']) @ (to_eye / d)) < math.cos(f['angle_rad']):
            continue                                                   # his eye is outside its cone: he does not see it lit
        th = math.degrees(math.acos(max(-1.0, min(1.0, float(-to_eye[2] / d)))))
        col, lev = lk['parts'][f['part']]
        cd = (PAR_CD_ROOM if f['type'] == 'up-pl5403' else B380_CD_ROOM) * lev * lum_factor(col or f.get('colour') or ASH)
        E = cd / d ** 2
        rows.append({'id': f['id'], 'part': f['part'], 'deg_from_eye_line': R3(th), 'lx_at_eye_room': R3(E),
                     'veil_cd_m2': R3(10 * E / max(th, 1.0) ** 2) if th <= 30 else None, 'inside_20deg_at_full': th < DJ_RULE_DEG})
    return {'lenses_seen': sorted(rows, key=lambda r: r['deg_from_eye_line']), 'ok': not any(r['inside_20deg_at_full'] for r in rows)}


# ====================================================================== zones
def zone_of(f, Z=None):
    """The owner's painted zones (rigs/moxir-v2-zones-2026-10-09.json): the stage pen, the two wings, the rest of the hot zone
    (in front of / beside / behind the stage), outside it."""
    import moxir_v2_eyes as EY
    x, z = f['p'][0], f['p'][2]
    if f['type'] == 'ext-lc-ultra-mk2':
        return 'free crane z -12 (lasers)'
    if f['part'].startswith('cut'):
        return 'the cut (truss)'
    (px0, px1), (pz0, pz1) = EY.STAGE_PEN['x_m'], EY.STAGE_PEN['z_m']
    if px0 <= x <= px1 and pz0 <= z <= pz1:
        return 'stage pen (DJ, pit, backstage)'
    if Z.inside('use', x, z, 1.0):
        return 'wing house left (use)' if x < 0 else 'wing house right (use)'
    if Z.inside('hot', x, z, 2.0):
        return 'hot zone, in front of the stage' if z > pz1 else ('hot zone, behind the stage' if z < pz0 else 'hot zone, beside the stage')
    return 'OUTSIDE the hot zone'


ZONE_ORDER = ['the cut (truss)', 'stage pen (DJ, pit, backstage)', 'hot zone, beside the stage', 'hot zone, in front of the stage', 'hot zone, behind the stage',
              'wing house left (use)', 'wing house right (use)', 'free crane z -12 (lasers)', 'OUTSIDE the hot zone']


def zone_counts(rig, Z):
    out = {k: {} for k in ZONE_ORDER}
    for f in rig['fixtures']:
        k = zone_of(f, Z)
        t = {'up-pl5403': 'PAR', 'up-b380f': 'B380F', 'up-yz31p': 'smoke', 'ext-lc-ultra-mk2': 'LaserCube'}[f['type']]
        out[k][t] = out[k].get(t, 0) + 1
    out = {k: v for k, v in out.items() if v}
    out['at z <= 6 (the coordinator\'s count)'] = sum(1 for f in rig['fixtures'] if f['p'][2] <= 6.0)
    out['units'] = len(rig['fixtures'])
    return out


# ====================================================================== build
def build(repo, out, table_path, placement_file=None):
    import numpy as np
    import occlusion_sky as S
    import moxir_v2 as M
    import lights_beta_options as L
    S.wait_cool()
    W = night_world(repo)
    BT = json.load(open(os.path.join(repo, RIG_BT)))
    T = copy.deepcopy(BT)
    by = {f['id']: f for f in T['fixtures']}
    moves = []

    def move(fid, **kw):
        f = by[fid]
        rec = {'id': fid, 'from': {'p': f['p'], 'part': f['part'], 'position': f['position']}}
        f.update(kw)
        f['moved_from'] = {'p': rec['from']['p'], 'part': rec['from']['part']}
        rec['to'] = {'p': f['p'], 'part': f['part'], 'position': f['position']}
        moves.append(rec)
        return f

    # ---- 1. the stage from the front: the McCandless pair on the DJ + the speaker faces / booth front
    pit = [PIT_STAND['p'][0], PIT_STAND['top_m'], PIT_STAND['p'][2]]
    # the four come from the far end (the fewest moves, undone when the painted plan places the hall): the column pair at z -54
    # (beside the far wall, which its own grazers still light) and the far wall's two outer PARs (x +-6; x +-2 stay)
    KEY_AIM = [-5.2, 1.5, 4.9]          # between his face (1.9 m) and the booth's front (1.0 m): the room's 15 deg PAR has a full-level
                                        # core of only 3.75 deg (penumbra 0.5), so one aim point must hold both (tested 10-09: face 465 lx,
                                        # booth 324 lx at full, vs 471 / 53 aimed at the face)
    front = [('rig-par-planes-23', K_COL, KEY_AIM, 'stage key', 'key, house left: column bracket on the nave column x -12 z 12 at 6.0 m (under the flared head at 6.21 m), out of reach; aimed between the DJ\'s face and the booth\'s front'),
             ('rig-par-planes-25', pit, KEY_AIM, 'stage key', 'key, house right: %s; aimed between the DJ\'s face and the booth\'s front' % PIT_STAND['what']),
             ('rig-par-planes-24', [K_COL[0], 5.1, K_COL[2]], TARGETS['PA L face'][0], 'speaker face L', 'the same column bracket, 0.9 m lower: the PA L face'),
             ('rig-par-planes-28', [K_COL[0], 5.55, K_COL[2] - 0.35], TARGETS['PA R face'][0], 'speaker face R', 'the same column bracket: across to the PA R face (the pit stand stands in its plane and cannot light it)')]
    for fid, p, tgt, part, why in front:
        d = unit(np.asarray(tgt) - np.asarray(p))
        move(fid, p=[R3(v) for v in p], r=M.rot_for_dir(d), part=part, position=why, colour=ASH, aim_at=[R3(v) for v in tgt],
             lit_column_m=None, lux_on_steel_median=None)

    # ---- 2. the whole hall, placed from the audience's view positions inside the owner's painted hot zone (moxir_v2_eyes.py):
    #         every unit B tuned had OUTSIDE the hot zone, and every column PAR (now all among people: out of reach on brackets),
    #         is re-placed: 26 PARs (the column grazers, the far wall's inner two, the 8 side-span PARs) and 12 B380F (planes 2, 3)
    import moxir_v2_eyes as EY
    import moxir_v2_true as V
    Z = EY.Zones(repo)
    W.boxes += Z.boxes(S)
    sm = by['rig-smoke-planes']
    F = V.field_numbers(repo, [sm['p'][0], sm['p'][1] + 0.1, sm['p'][2]], [0, 0, 1], states=('t40',))['t40']
    free_par = ['rig-par-planes-%02d' % i for i in list(range(7, 23)) + [26, 27] + list(range(29, 37))]
    free_beam = ['rig-beam-planes-%02d' % i for i in range(7, 19)]
    taken = {'col -12 z 12 nave', 'col -12 z 6 nave', 'col +12 z 6 nave', 'col +12 z 0.5 nave'}
    if placement_file and os.path.exists(placement_file):
        E = json.load(open(placement_file))          # a previous build's placement (deterministic; it takes ~25 min on one core)
        print('placement reused from %s' % placement_file, file=sys.stderr)
    else:
        E = EY.place(repo, W, F, Z, taken, len(free_par), len(free_beam), log=lambda m: print(m, file=sys.stderr))
    if len(E['pars']) != len(free_par) or len(E['beams']) != len(free_beam):
        raise SystemExit('placement found %d PARs / %d B380F, needs %d / %d' % (len(E['pars']), len(E['beams']), len(free_par), len(free_beam)))
    for fid, c in zip(free_par, sorted(E['pars'], key=lambda c: (c['p'][2], c['p'][0]))):
        graze = c['kind'] == 'graze'
        move(fid, p=c['p'], r=M.rot_for_dir(unit(c['dir'])), part='columns' if graze else 'roof', colour=EMBER if graze else ASH,
             position='%s: column bracket, body at %.1f m (out of reach), %s; seen from the eyes: %s' % (
                 c['place'], c['p'][1], 'leaned 4 deg onto its own face' if graze else 'leaned 25 deg out into the roof steel',
                 ', '.join('%s %.2f' % (k, v) for k, v in sorted(c['eyes'].items(), key=lambda kv: -kv[1])[:3])),
             lit_column_m=None, lux_on_steel_median=None, eye_lux=c['eyes'], steel_pct=c['steel_pct'])
    for fid, b in zip(free_beam, sorted(E['beams'], key=lambda b: (b['p'][2], b['p'][0]))):
        back = b['p'][2] <= -15.0
        move(fid, p=[b['p'][0], R3(b['p'][1] - S.HEAD_Y + 0.7), b['p'][2]], r=M.rot_for_dir(unit(b['dir'])),
             part='plane 3 (behind the stage)' if back else 'plane 2 (the wings)', colour=EMBER if back else ASH,
             position='%s: column bracket, base at 3.0 m (out of reach, no pen); aim %.0f/%.0f deg (az/el), throw %s m to %s; no eye within %.0f deg of looking down it' % (
                 b['place'], b['az_el'][0], b['az_el'][1], b['throw_m'], b['ends_on'], b['glare_min_deg']),
             throw_m=b['throw_m'], ends_on=b['ends_on'], sky_clear_pct=None, eye_G=b['eyes'])
    placement = {k: v for k, v in E.items() if k not in ('par_candidates', 'beam_candidates')}
    if out and not placement_file:
        os.makedirs(out, exist_ok=True)
        json.dump(E, open(os.path.join(out, 'placement.json'), 'w'), indent=1, default=JD)

    # ---- 4. the six cubes and the far crane, as given
    cubes, bar, tubes, lcheck = lasers(repo, table_path)
    for c in cubes:
        c = copy.deepcopy(c)
        c['source'] = 'git %s:%s (PR #844, the laser session; aims USED AS GIVEN, never recomputed here)' % (LASER_COMMIT, LASER_RIG)
        c['circuit'] = 'C-LASER'
        T['fixtures'].append(c)
    crane = G = W.G['cranes'][1]
    T['solids'] = [s for s in T['solids'] if s['id'] not in ('rig-crane-bar',)] + [
        dict(bar, source='git %s:%s' % (LASER_COMMIT, LASER_RIG)),
        {'id': 'rig-far-crane-z-12-girder-a', 'name': 'the free (far) crane at its show park z -12: bridge girder (stage side); the hall model still draws it at z -41 (hall v10 owed)', 'kind': 'box',
         'p': [0.0, FAR_CRANE_UNDERSIDE, FAR_CRANE_Z + G['girders_dz_m'][1]], 'r': [0, 0, 0], 's': [22.7, R3(G['girder_top_m'] - FAR_CRANE_UNDERSIDE), G['girder_w_m']]},
        {'id': 'rig-far-crane-z-12-girder-b', 'name': 'the free (far) crane at z -12: bridge girder (far side)', 'kind': 'box',
         'p': [0.0, FAR_CRANE_UNDERSIDE, FAR_CRANE_Z + G['girders_dz_m'][0]], 'r': [0, 0, 0], 's': [22.7, R3(G['girder_top_m'] - FAR_CRANE_UNDERSIDE), G['girder_w_m']]},
    ]
    T['far_crane'] = {'show_z_m': FAR_CRANE_Z, 'was_z_m': -41.0, 'underside_used_m': FAR_CRANE_UNDERSIDE,
                      'decision': 'owner 2026-10-09, crane travel confirmed ("yes the crane can move", to the coordinator, 17:3x): the free crane parks at z -12 for the show and carries the six cubes',
                      'why': 'aerial-far-crane.json: from z -41 no aim passes for six cubes (best worst margin -0.70 m); at z -12 every beam passes with +0.23 m (the laser session, PR #844)',
                      'owed': ['the on-site check (the crane seen moving to z -12, its end trucks clear)', 'the crane\'s inspection and lock-out in the show position',
                               'the hall model update (v10: the crane drawn at z -12; the room still draws it at z -41 and this rig adds the bridge at z -12 as two boxes)',
                               'the laser bar\'s drop frame (2.49 m under the bridge): the rigger\'s design']}
    T['lasers'] = {'source': 'git %s:%s (PR #844, branch fix/moxir-v1-1-bugs-2026-10-09; the laser session)' % (LASER_COMMIT, LASER_RIG),
                   'table': lcheck, 'aims': 'USED AS GIVEN: not re-aimed, not recomputed (the laser session owns them)',
                   'tubes': tubes}

    # ---- 5. the looks: the new parts
    for lk in T['looks']:
        p = lk['parts']
        for gone in ('plane 2 (mid-hall, side spans)', 'plane 3 (the far end)', 'side spans', 'far wall'):
            p.pop(gone, None)
        if lk['id'] == 'dark':
            p['plane 2 (the wings)'] = [EMBER, 0.8]
            p['plane 3 (behind the stage)'] = [EMBER, 0.35]
            p['stage key'] = [EMBER, 0.44]
            p['speaker face L'] = [EMBER, 0.38]
            p['speaker face R'] = [EMBER, 1.0]
        if lk['id'] == 'peak':
            p['plane 2 (the wings)'] = [ASH, 1.0]
            p['plane 3 (behind the stage)'] = [EMBER, 0.7]
            p['roof'] = [ASH, 0.6]
            p['stage key'] = [ASH, 0.14]
            p['speaker face L'] = [ASH, 0.12]
            p['speaker face R'] = [ASH, 0.54]
    for c in T['cues']:
        c['name'] = c['name'].replace('B tuned · one machine', 'B tuned + stage + lasers')

    # ---- 6. power + DMX on the moved units; the cubes on their own circuit from the nearest distro
    units = [dict(f) for f in T['fixtures'] if f['type'] in ('up-b380f', 'up-pl5403', 'up-yz31p')]
    branches, slots = M.patch(units)
    circ, ph = M.circuits(units)
    cid = {u: c['circuit'] for c in circ for u in c['units']}
    dm = {u['id']: u['dmx'] for u in units}
    for f in T['fixtures']:
        if f['id'] in cid:
            f['circuit'], f['dmx'] = cid[f['id']], dm[f['id']]
    site = min(M.SITES, key=lambda k: abs(M.SITES[k][0] - (-0.75)) + abs(M.SITES[k][2] - FAR_CRANE_Z))
    laser_circuit = {'circuit': 'C-LASER', 'distro': site, 'units': [c['id'] for c in cubes], 'load_w': 6 * 120, 'amps_230v': round(720 / 230.0, 1),
                     'note': '6 x 120 W (the adapters), one 16 A radial up the crane\'s festoon to the laser bar; the run along the crane is the rigger\'s'}
    T['power'] = {'circuits': circ + [laser_circuit], 'phases_w': ph}
    T['patch'] = {'branches': branches, 'slots': slots}

    # ---- 7. checks
    beams = []
    for f in T['fixtures']:
        if f['type'] != 'up-b380f':
            continue
        head = np.array([f['p'][0], f['p'][1] - 0.7 + S.HEAD_Y, f['p'][2]])
        d = L.aim_dir(f['r'])
        chk = S.beam_check(W, head, d, half_deg=0.9)
        t = chk['axis_m'] or 120.0
        pen = EY.pen_of(head, d)
        low = EY.low_over_floor(head, d, t, pen)
        end = head + d * t
        in_pen = (EY.STAGE_PEN['x_m'][0] <= head[0] - pen and head[0] + pen <= EY.STAGE_PEN['x_m'][1] and EY.STAGE_PEN['z_m'][0] <= head[2] - pen and head[2] + pen <= EY.STAGE_PEN['z_m'][1]) if pen > 0 else True
        g, worst = EY.beam_glow(W, F, head, d, t, ('audience',), step=1.0)
        xs = np.array([head + d * k for k in np.arange(0.5, min(t, 60.0), 1.0)])
        v = np.asarray(DJ_EYE) - xs
        dj_deg = math.degrees(math.acos(max(-1.0, min(1.0, float(((v / np.linalg.norm(v, axis=1)[:, None]) @ d).max())))))
        crane_hit = [e for e in chk['ends'] if 'z -12' in e]
        bad_end = Z.inside('bar', end[0], end[2], 0.5) or Z.inside('chill', end[0], end[2], 0.5)
        ok = chk['rays_into_audience'] == 0 and low >= -1e-6 and not crane_hit and not bad_end and in_pen and not any('glass' in e for e in chk['ends'])
        beams.append({'id': f['id'], 'part': f['part'], 'rays_into_people': chk['rays_into_audience'], 'ends': chk['ends'], 'into_crane_or_laser_hang': crane_hit,
                      'pen_m': pen, 'pen_inside_the_stage_pen': in_pen, 'lowest_over_floor_m': R3(low + 3.0) if low < 1e6 else None,
                      'ends_in_bar_or_chill': bad_end, 'glare_min_deg_to_an_eye': R3(worst), 'glare_min_deg_to_the_dj': R3(dj_deg), 'eye_G': {k: round(v, 5) for k, v in g.items()}, 'ok': ok})
    outside = [f['id'] for f in T['fixtures'] if not Z.inside('hot', f['p'][0], f['p'][2], 2.0)]
    within_reach = [f['id'] for f in T['fixtures'] if f['type'] in ('up-pl5403', 'up-b380f', 'up-yz31p') and not f['part'].startswith('cut')
                    and f['p'][1] - (0.7 if f['type'] == 'up-b380f' else 0.0) < REACH_M
                    and not (EY.STAGE_PEN['x_m'][0] <= f['p'][0] <= EY.STAGE_PEN['x_m'][1] and EY.STAGE_PEN['z_m'][0] <= f['p'][2] <= EY.STAGE_PEN['z_m'][1])]
    clear = []
    for f in T['fixtures']:
        if f['type'] == 'ext-lc-ultra-mk2':
            continue
        g, beam = tube_clearance(tubes, f['p'], BODY_R[f['type']])
        clear.append({'id': f['id'], 'part': f['part'], 'margin_m': R3(g), 'nearest_beam': beam, 'enters': g < 0, 'under_the_laser_sessions_tightest': g < LASER_TIGHTEST_M})
    for k in range(0, 46):                                             # the pit stand: its pole and T-bar, every 0.1 m
        q = [PIT_STAND['p'][0], k * 0.1, PIT_STAND['p'][2]]
        g, beam = tube_clearance(tubes, q, 0.1)
        if k == 0 or g < clear[-1]['margin_m']:
            row = {'id': 'pit stand (pole + T-bar)', 'part': 'stand', 'margin_m': R3(g), 'nearest_beam': beam, 'enters': g < 0, 'under_the_laser_sessions_tightest': g < LASER_TIGHTEST_M}
            if k == 0:
                clear.append(row)
            else:
                clear[-1] = row
    cut12 = cut_alternatives(repo, M, tubes, W)
    smoke = by['rig-smoke-planes']
    def to_bridge(q):
        """the gap from a point to the crane envelope at z -12 (girders x +-11.35, underside 7.69 m, +-1.45 m in z, the laser hang)"""
        dz = max(0.0, abs(q[2] - FAR_CRANE_Z) - 1.45)
        dx = max(0.0, abs(q[0]) - 11.35)
        dy = max(0.0, 4.75 - q[1]) if abs(q[0]) <= 6.0 else max(0.0, FAR_CRANE_UNDERSIDE - q[1])
        return R3(math.sqrt(dx * dx + dy * dy + dz * dz))
    crane_vs = {'B380F heads within 6 m of the bridge at z -12 (and every beam\'s first hits)': [
                    {'id': f['id'], 'head': f['p'], 'body_to_the_crane_envelope_m': to_bridge(f['p']), 'beam_ends': next(b['ends'] for b in beams if b['id'] == f['id']),
                     'into_crane_or_laser_hang': next(b['into_crane_or_laser_hang'] for b in beams if b['id'] == f['id'])}
                    for f in T['fixtures'] if f['type'] == 'up-b380f' and abs(f['p'][2] - FAR_CRANE_Z) <= 6.0],
                'beams_into_the_crane_or_laser_hang': [b['id'] for b in beams if b['into_crane_or_laser_hang']],
                'smoke machine': {'p': smoke['p'], 'laser_margin_m': next(c['margin_m'] for c in clear if c['id'] == smoke['id']),
                                  'to_the_laser_hang_m': R3(math.hypot(max(0.0, abs(smoke['p'][2] - FAR_CRANE_Z) - 0.4), 4.75 - smoke['p'][1] - 0.5)),
                                  'note': 'the plume rises from 1.1 m at z -6.2 and blows +z toward the stage, away from the crane at z -12; haze is what makes the lasers seen'}}
    sl = {lk: {'room_30478cd': stage_light(W, T, lk), 'spec_11000cd': stage_light(W, T, lk, PAR_CD_SPEC)} for lk in ('dark', 'peak')}
    sl_before = {lk: {'room_30478cd': stage_light(W, BT, lk), 'spec_11000cd': stage_light(W, BT, lk, PAR_CD_SPEC)} for lk in ('dark', 'peak')}
    glare = {lk: dj_glare(T, lk) for lk in ('dark', 'peak')}
    glare_full = dj_glare(dict(T, looks=[{'id': 'full', 'parts': {p: [ASH, 1.0] for p in set(f['part'] for f in T['fixtures'])}}]), 'full')
    checks = dict(T['checks'])
    checks.update({
        'beams': len(beams), 'beams_ok': sum(b['ok'] for b in beams), 'beams_into_people': sum(b['rays_into_people'] > 0 for b in beams),
        'pars': sum(f['type'] == 'up-pl5403' for f in T['fixtures']), 'pars_cut': sum(f['part'].startswith('cut') for f in T['fixtures']),
        'circuits': len(circ) + 1, 'circuits_ok': all(c['ok'] for c in circ), 'phases_w': ph, 'branches': branches, 'slots': slots,
        'connected_w': sum(c['load_w'] for c in circ) + 720,
        'units_outside_the_hot_zone': outside, 'units_within_reach_outside_the_stage_pen': within_reach,
        'stage_pen': EY.STAGE_PEN, 'placement': placement,
        'counts': {}, 'laser_tubes_entered': [c['id'] for c in clear if c['enters']],
    })
    for f in T['fixtures']:
        if f['type'] in ('up-pl5403', 'up-b380f'):
            k = ('PAR · ' if f['type'] == 'up-pl5403' else 'B380F · ') + f['part']
            checks['counts'][k] = checks['counts'].get(k, 0) + 1
    if sum(f['type'] == 'up-pl5403' for f in T['fixtures']) != 50 or sum(f['type'] == 'up-b380f' for f in T['fixtures']) != 18:
        raise SystemExit('the kit is 18 B380F + 50 PL5403')
    T['checks'] = checks
    T['not_hung'] = [dict(r, hung=6, not_hung=0) if r['code'] == 'EXT-LC-ULTRA-MK2' else r for r in T['not_hung']]
    zb, za = zone_counts(BT, Z), zone_counts(T, Z)
    eyes_ba = {'before': EY.eye_totals(W, F, BT), 'after': EY.eye_totals(W, F, T), 'eyes': EY.EYES,
               'what': 'every unit at full, the placement metric (moxir_v2_eyes.py): PAR = lx at the eye from the lit steel (rho 0.2867, an upper bound), beams = G per unit flux'}
    T['review'] = {
        'from': RIG_BT, 'owner': 'look what stage is totally dark ... you closed in one area ... check the lasers place on the other crane ... how much light goes to truss? (on PR #853, 2026-10-09)',
        'moves': moves, 'zones': ZONES_SRC, 'eyes_before_after': eyes_ba, 'zones_before': zb, 'zones_after': za,
        'stage_light_before': sl_before, 'stage_light_after': sl, 'dj_glare': glare, 'dj_glare_all_at_full': glare_full,
        'laser_clearance': sorted(clear, key=lambda c: c['margin_m']), 'crane_and_smoke': crane_vs, 'beam_checks': beams,
        'cut': cut12, 'stand': PIT_STAND,
    }
    T.update({'snapshot': 'moxir-v2-spread-%s' % DATE, 'version': 'MOXIR v2 B spread · the hot zone', 'title': 'MOXIR v2 B spread · the owner\'s hot zone, one machine',
              'what': 'B tuned, after the owner\'s look (10-09, PR #853) and his painted plan (17:42): the DJ, the booth and the speaker faces lit from the audience side; every light inside his hot zone, placed from the audience\'s eyes (both wings and behind the stage, column brackets out of reach); the cut kept at 10 PARs; the six cubes on the free crane at z -12. Three planes kept: the ember fan behind the DJ, the wings, behind the stage.',
              'written_by': 'scripts/place/moxir_v2_spread.py build (from %s)' % RIG_BT, 'date': DATE, 'from_rig': RIG_BT})
    T['kit'] = BT['kit']
    for k in ('tunes', 'design_metric', 'tuned_from'):
        T.pop(k, None)
    T['requires'] = dict(BT['requires'], stage_front='a column bracket (3 PARs, 5.1-6.0 m) on the nave column x -12 z 12 and one wind-up stand in the pit (the venue\'s OK for the bracket, the rigger\'s check of both owed); the levels are set for the room\'s PAR (30 478 cd): with the spec figure 11 000 cd the same lx needs the fader x 2.77 (the dark look\'s ember key then tops out near 41 lx at full)')
    json.dump(T, open(os.path.join(repo, RIG_SP), 'w'), indent=1, default=JD)
    if out:
        os.makedirs(out, exist_ok=True)
        json.dump(T['review'], open(os.path.join(out, 'checks.json'), 'w'), indent=1, default=JD)
    print(json.dumps({'zones_before': zb, 'zones_after': za, 'stage_before': {k: {t: v['lx'] for t, v in sl_before[k]['room_30478cd'].items()} for k in sl_before},
                      'stage_after': {k: {t: v['lx'] for t, v in sl[k]['room_30478cd'].items()} for k in sl},
                      'stage_after_spec': {k: {t: v['lx'] for t, v in sl[k]['spec_11000cd'].items()} for k in sl},
                      'glare_ok': {k: v['ok'] for k, v in glare.items()}, 'glare_full_ok': glare_full['ok'],
                      'beams_ok': '%d/%d' % (checks['beams_ok'], checks['beams']), 'beam_rows': beams,
                      'laser_tightest': sorted(clear, key=lambda c: c['margin_m'])[:5], 'tubes_entered': checks['laser_tubes_entered'],
                      'crane_and_smoke': crane_vs, 'cut': {k: {kk: vv for kk, vv in v.items() if kk != 'places'} for k, v in cut12.items()},
                      'circuits_ok': checks['circuits_ok'], 'outside_hot': outside, 'within_reach': within_reach, 'per_eye_par_lux': placement['per_eye_par_lux'], 'per_eye_beam_G': placement['per_eye_beam_G']}, indent=1, default=JD))


def cut_alternatives(repo, M, tubes, W):
    """10 vs 12 on the cut: cut-count.mjs's own numbers, the lx it gives the DJ's face (it hangs behind him), the laser tubes."""
    out = {}
    for n in (10, 12):
        cc = M.cut_places(n)
        pars = M.cut_pars(cc)
        face = 0.0
        back = 0.0
        for q in pars:
            f = {'p': q['p'], 'r': M.rot_for_dir(unit(q['dir'])), 'angle_rad': 0.1309, 'type': 'up-pl5403'}
            face += e_on(W, f, TARGETS['DJ face'][0], [0, 0, 1], PAR_CD_ROOM)
            back += e_on(W, f, [-5.2, 2.2, 4.1], [0, 1, 0], PAR_CD_ROOM)
        margins = []
        for q in pars:
            g, beam = tube_clearance(tubes, q['p'], BODY_R['up-pl5403'])
            margins.append({'u_m': q['position'].split('u ')[1].split(' m')[0], 'p': q['p'], 'margin_m': R3(g), 'beam': beam})
        lk = {l['lens_deg']: l for l in cc['look']}
        out[str(n)] = {'worst_pick_kg': cc['worst_pick_kg'], 'headroom_kg': cc['headroom_kg'], 'shafts_separate_pct_15': lk[15]['shafts_separate_pct'],
                       'shafts_separate_pct_25': lk[25]['shafts_separate_pct'], 'reads_as_25': lk[25]['reads_as'], 'power_w': cc['power']['w'],
                       'dj_face_lx_full': R3(face), 'dj_head_top_lx_full': R3(back), 'laser_min_margin_m': min(m['margin_m'] for m in margins),
                       'laser_tightest': sorted(margins, key=lambda m: m['margin_m'])[:2], 'places': margins}
    return out


# ====================================================================== task 2 input: the audience half's candidate places
def candidates(repo, out):
    """Every place a unit could stand in the audience half (z >= 8.2), with its B380F sky (share of the upper hemisphere clear
    >= 30 m from the head, occlusion_sky.sky, 1200 rays) and, for a PAR leaned onto the nearest steel, the lit column length and
    lx (par_on_steel, 15 deg). The people are NOT an obstacle here (a head in the public half stands in a pen or above them;
    its beam's people check comes with its aim). No layout is chosen: that waits for the owner's painted plan."""
    import numpy as np
    import occlusion_sky as S
    S.wait_cool()
    W = night_world(repo)
    skip = ('audience',)
    zs = [12.0, 18.0, 24.0, 30.0, 36.0, 42.0, 48.0]
    places = []
    for z in zs:
        for s in (-1, 1):
            for base in (0.0, 3.0):
                places.append(('nave face of the column x %+d' % (12 * s), [10.8 * s, base, z], [math.sin(math.radians(4.05)) * s, math.cos(math.radians(4.05)), 0.0], [11.157 * s, base + 0.31 if base == 0 else 2.8, z]))
                places.append(('side-span face of the column x %+d' % (12 * s), [13.2 * s, base, z], [-math.sin(math.radians(4.05)) * s, math.cos(math.radians(4.05)), 0.0], [12.843 * s, base + 0.31 if base == 0 else 2.8, z]))
        places.append(('side-span wall column x -36', [-34.6, 0.0, z], [-math.sin(math.radians(7)), math.cos(math.radians(7)), 0.0], [-34.9, 0.31, z]))
        places.append(('side-span column x +36', [34.6, 0.0, z], [math.sin(math.radians(7)), math.cos(math.radians(7)), 0.0], [34.9, 0.31, z]))
    for x in (-9.0, -3.0, 3.0, 9.0):
        places.append(('entry end (z 51), x %+g' % x, [x, 0.0, 51.0], [0.0, math.cos(math.radians(14)), math.sin(math.radians(14))], [x, 0.31, 52.6]))
    for name, p in (('drum tank top (3.0 m)', [9.5, 3.0, 25.0]), ('lean-to canopy top (3.2 m)', [9.5, 3.2, 18.0]), ('cyclone hood top (3.6 m)', [10.5, 3.6, 40.7]), ('blower top (1.7 m)', [6.9, 1.7, 19.5])):
        places.append((name, p, [0.0, 1.0, 0.0], [p[0], p[1] + 0.31, p[2]]))
    rows = []
    for i, (name, p, pdir, pp) in enumerate(places):
        if i % 10 == 0:
            S.wait_cool()
        sk = S.sky(W, p, skip=skip)
        st = S.par_on_steel(W, pp, unit(pdir), 15, skip=skip)
        rows.append({'place': name, 'head_base_m': p, 'b380f_sky_clear_pct': sk['clear_pct'], 'roof_pct': sk['roof_pct'], 'blocked_pct': sk['blocked_pct'],
                     'top_blockers': sk['top_blockers'][:3], 'longest': sk['longest'][:2], 'par': {'p': pp, 'lean_dir': [R3(v) for v in unit(pdir)], 'steel_pct': st['steel_pct'],
                     'column_lit_m': st['column_lit_m'], 'lux_on_steel_11000cd': st['lux_on_steel'], 'ends': st['ends'][:3]},
                     'out_of_reach': p[1] >= REACH_M})
        print('%-40s base %4.1f z %5.1f  sky clear %5.1f %%  PAR steel %5.1f %%' % (name, p[1], p[2], sk['clear_pct'], st['steel_pct']), flush=True)
    os.makedirs(out, exist_ok=True)
    doc = {'what': 'task 2 input (the owner paints the areas; 17:4x): candidate places in the audience half, measured, no layout chosen', 'date': DATE,
           'method': 'occlusion_sky.sky (1200 rays, clear >= 30 m) + par_on_steel (15 deg, 11 000 cd EQUIVALENT), in the night\'s world (far crane at z -12 + the laser hang, the z -41 crane gone); people not counted as obstacles',
           'zones_before': zone_counts(json.load(open(os.path.join(repo, RIG_BT))), __import__('moxir_v2_eyes').Zones(repo)), 'rows': rows}
    json.dump(doc, open(os.path.join(out, 'candidates.json'), 'w'), indent=1, default=JD)
    print('%d places -> %s' % (len(rows), os.path.join(out, 'candidates.json')))


# ====================================================================== frames (moxir-v2-true-frames.cjs) and the page
VIEWS = {
    'floor': {'position': [-3.75, 1.7, 18.1], 'target': [-3.75, 5.0, -20.0], 'fov': 70, 'label': 'Dance floor 1.7 m (z 18)'},
    'wingL': {'position': [-20.0, 1.7, 8.0], 'target': [-4.0, 4.0, -2.0], 'fov': 70, 'label': 'Wing house left 1.7 m (x -20 z 8)'},
    'wingR': {'position': [18.0, 1.7, 8.0], 'target': [-5.0, 4.0, -2.0], 'fov': 70, 'label': 'Wing house right 1.7 m (x 18 z 8)'},
    'behind': {'position': [-4.0, 1.7, -22.0], 'target': [-4.0, 4.5, 10.0], 'fov': 70, 'label': 'Behind the stage 1.7 m (z -22)'},
    'mid': {'position': [-2.0, 1.7, 35.0], 'target': [-4.5, 4.0, -10.0], 'fov': 65, 'label': 'Mid-audience 1.7 m (z 35)'},
    'dj': {'position': list(DJ_EYE), 'target': [-4.0, 3.0, 40.0], 'fov': 75, 'label': 'The DJ\'s eye toward the crowd'},
}
VORDER = ('floor', 'wingL', 'wingR', 'behind', 'mid', 'dj')
VIEWS_BY_STATE = {'t40': VORDER, 't10': ('floor', 'wingL', 'behind')}
LAYOUTS = {'bt': ('B tuned (old, PR #853)', 'moxir-v2-planes-tuned', '/moxir/p/moxir-v2-planes-tuned', RIG_BT),
           'sl': ('B spread (new)', 'moxir-v2-stage-lasers', '/moxir/p/moxir-v2-stage-lasers', RIG_SP)}
STATES = ('t40', 't10')
LOOKS = ('dark', 'peak')


def plan(repo, out):
    import moxir_v2_true as V
    jobs = []
    for key, (title, project, path, _) in LAYOUTS.items():
        for st in STATES:
            for look in LOOKS:
                for view in VIEWS_BY_STATE[st]:
                    v = VIEWS[view]
                    jobs.append({'name': '%s-%s-%s-%s' % (key, st, look, view), 'layout': key, 'state': st, 'look': look, 'view': view, 'project': project, 'path': path,
                                 'atmosphere': V.STATES[st][2], 'camera': {'position': v['position'], 'target': v['target'], 'fov': v['fov']}})
    p = {'base': 'http://moxir-v2-spread.diiii.localhost', 'query': V.QUERY, 'size': [1440, 900], 'settle_s': 15, 'jobs': jobs}
    os.makedirs(out, exist_ok=True)
    json.dump(p, open(os.path.join(out, 'plan.json'), 'w'), indent=1)
    print('%d jobs -> %s' % (len(jobs), os.path.join(out, 'plan.json')))


def contact_sheet(out):
    from PIL import Image, ImageDraw
    W_, H_, pad, lab = 384, 240, 6, 20
    rows = [(k, st, lk) for st in STATES for lk in LOOKS for k in ('bt', 'sl')]
    sheet = Image.new('RGB', (len(VORDER) * (W_ + pad) + 230, len(rows) * (H_ + lab + pad) + 40), (12, 12, 13))
    d = ImageDraw.Draw(sheet)
    d.text((10, 12), 'MOXIR v2 - B tuned (old) vs B spread (new) - measurement mode EV100 2.84 fixed - Full quality - RTX 3080 - 2026-10-09', fill=(232, 228, 220))
    for c, v in enumerate(VORDER):
        d.text((230 + c * (W_ + pad) + 4, 26), VIEWS[v]['label'].replace('’', "'"), fill=(160, 160, 160))
    for r, (k, st, lk) in enumerate(rows):
        y = 40 + r * (H_ + lab + pad)
        d.text((10, y + lab + H_ // 2 - 20), LAYOUTS[k][0], fill=(255, 176, 138) if k == 'sl' else (200, 200, 200))
        d.text((10, y + lab + H_ // 2 - 4), '%s look' % lk, fill=(232, 228, 220))
        d.text((10, y + lab + H_ // 2 + 12), 'haze %s min' % st[1:], fill=(160, 160, 160))
        for c, v in enumerate(VORDER):
            f = os.path.join(out, 'frames', '%s-%s-%s-%s.png' % (k, st, lk, v))
            if os.path.exists(f):
                sheet.paste(Image.open(f).convert('RGB').resize((W_, H_)), (230 + c * (W_ + pad), y + lab))
    sheet.save(os.path.join(out, 'contact-sheet.png'))


def page(repo, out):
    import html
    contact_sheet(out)
    E = html.escape
    luma = json.load(open(os.path.join(out, 'frame-luma.json')))
    probe = json.load(open(os.path.join(out, 'probe.json'))) if os.path.exists(os.path.join(out, 'probe.json')) else {}
    T = json.load(open(os.path.join(repo, RIG_SP)))
    sp = T['review']
    cap = json.load(open(os.path.join(out, 'captions.json'))) if os.path.exists(os.path.join(out, 'captions.json')) else {}

    def fig(name):
        k, st, lk, v = name.split('-')
        L = luma.get(name, {})
        return ('<figure><a href="frames/%s.png"><img src="frames/%s.png" alt="%s" loading="lazy"></a><figcaption><b>%s · %s look · haze %s min · %s</b>'
                '<span>%s</span><small>mean luminance %s · white-out %s %%</small></figcaption></figure>') % (
            name, name, E(cap.get(name, name)), E(LAYOUTS[k][0]), lk, st[1:], E(VIEWS[v]['label']), E(cap.get(name, '')), L.get('mean_Y', '–'), L.get('white_pct', '–'))
    pairs = ''.join('<h3>%s · %s look · haze %s min</h3>%s' % (E(VIEWS[v]['label']), lk, st[1:], '<div class="pair">%s%s</div>' % (fig('bt-%s-%s-%s' % (st, lk, v)), fig('sl-%s-%s-%s' % (st, lk, v))))
                    for st in STATES for v in VIEWS_BY_STATE[st] for lk in LOOKS)
    zb, za = sp['zones_before'], sp['zones_after']
    zk = [k for k in za if isinstance(za[k], dict)] + [k for k in zb if isinstance(zb[k], dict) and k not in za]
    fmt = lambda d: ', '.join('%d %s' % (v, t) for t, v in d.items()) if d else '0'
    zones = ''.join('<tr><td>%s</td><td>%s</td><td>%s</td></tr>' % (E(k), fmt(zb.get(k, {})), fmt(za.get(k, {}))) for k in zk)
    zones += '<tr><td>units at z ≤ 6</td><td>%s</td><td>%s</td></tr>' % (zb["at z <= 6 (the coordinator's count)"], za["at z <= 6 (the coordinator's count)"])
    pr = lambda k, lk, t: (probe.get(k, {}).get(lk, {}).get(t) or {}).get('E_lx')
    stage = ''.join('<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>' % (
        E(t), lk, pr('bt', lk, t) if pr('bt', lk, t) is not None else '–', pr('sl', lk, t) if pr('sl', lk, t) is not None else '–',
        sp['stage_light_after'][lk]['room_30478cd'][t]['lx'], sp['stage_light_after'][lk]['spec_11000cd'][t]['lx']) for lk in LOOKS for t in TARGETS)
    cut = sp['cut']
    cutrows = ''.join('<tr><td>%s</td><td>%s kg (headroom %s kg)</td><td>%s %% / %s %%</td><td>%s lx</td><td>%s m</td></tr>' % (
        n, c['worst_pick_kg'], c['headroom_kg'], c['shafts_separate_pct_15'], c['shafts_separate_pct_25'], c['dj_face_lx_full'], c['laser_min_margin_m']) for n, c in cut.items())
    lz = ''.join('<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>' % (E(c['id']), E(c['part']), c['margin_m'], c['nearest_beam']) for c in sp['laser_clearance'][:8])
    eb = sp['eyes_before_after']
    eyes = ''.join('<tr><td>%s</td><td>%.2f</td><td>%.2f</td><td>%.3f</td><td>%.3f</td></tr>' % (E(e), eb['before']['par_steel_lux_at_eye'][e], eb['after']['par_steel_lux_at_eye'][e],
                   eb['before']['beam_G'][e], eb['after']['beam_G'][e]) for e in eb['eyes'])
    doc = TEMPLATE.format(eyes=eyes, pairs=pairs, zones=zones, stage=stage, cutrows=cutrows, lz=lz, hero='<div class="pair">%s%s</div>' % (fig('bt-t40-peak-floor'), fig('sl-t40-peak-floor')),
                          hero2='<div class="pair">%s%s</div><div class="pair">%s%s</div>' % (fig('bt-t40-peak-wingL'), fig('sl-t40-peak-wingL'), fig('bt-t40-peak-behind'), fig('sl-t40-peak-behind')))
    open(os.path.join(out, 'index.html'), 'w').write(doc)
    print('page -> %s' % os.path.join(out, 'index.html'))


TEMPLATE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>MOXIR v2 spread</title>
<style>
:root {{ --bg:#0b0c0e; --panel:#141518; --ink:#e8e4dc; --dim:#9aa0a8; --ember:#ff3a12; --line:#2a2c31; }}
* {{ box-sizing:border-box; border-radius:0; }}
body {{ margin:0; background:var(--bg); color:var(--ink); font:15px/1.5 system-ui, sans-serif; }}
main {{ max-width:1500px; margin:0 auto; padding:24px 16px 64px; }}
h1 {{ font-size:26px; margin:0 0 6px; }} h2 {{ font-size:20px; margin:42px 0 8px; border-top:1px solid var(--line); padding-top:18px; }}
h3 {{ font-size:15px; margin:22px 0 4px; color:#ffb08a; }}
.lead {{ font-size:17px; max-width:1000px; }} .lead b {{ color:#ffb08a; }}
.note {{ color:var(--dim); max-width:1000px; margin:4px 0 10px; }}
.pair {{ display:grid; grid-template-columns:1fr 1fr; gap:10px; margin:8px 0 14px; }}
figure {{ margin:0; background:var(--panel); border:1px solid var(--line); }}
figure img {{ width:100%; display:block; }}
figcaption {{ padding:8px 10px 10px; font-size:13.5px; }} figcaption b {{ display:block; color:var(--dim); font-weight:600; font-size:12px; }}
figcaption span {{ display:block; margin:3px 0; }} figcaption small {{ color:#6f747b; }}
table {{ border-collapse:collapse; width:100%; margin:10px 0; font-size:13.5px; }}
td, th {{ border:1px solid var(--line); padding:6px 8px; vertical-align:top; text-align:left; }} th {{ color:var(--dim); font-weight:600; }}
.reco {{ background:var(--panel); border-left:3px solid var(--ember); padding:12px 16px; max-width:1100px; }}
.wrap {{ overflow-x:auto; }}
@media (max-width: 800px) {{ .pair {{ grid-template-columns:1fr; }} }}
</style></head><body><main>
<h1>MOXIR v2 — B spread over your hot zone</h1>
<p class="lead">You said the stage was totally dark and everything was closed into one area. Left: <b>B tuned</b> as you saw it.
Right: <b>B spread</b>. The DJ, the booth and the speaker faces are lit from the audience side. Every light now stands inside
the hot zone you painted. The lights were placed from where people will stand: both wings and behind the stage, on brackets
out of reach. The six lasers hang on the <b>free crane, moved to z −12</b>.</p>
{hero}
{hero2}
<div class="reco"><b>The truss: 10 PARs, nothing else.</b> No moving beams on it. It is behind the DJ, so it cannot light his
face (0 lx from either 10 or 12). Twelve would add 9.8 kg on the middle pick. With the 25° lens a third of the shafts would merge.
The two spare PARs light his face from the front instead.</div>
<div class="reco"><b>Why B tuned had to move, not just grow:</b> with people in the wings and behind the stage, B tuned's six
plane-2 heads stand on the floor among them. Nine of its beams point at someone standing in the hot zone (within 30°). In the
spread every beam passes: no ray into people, at least 3 m over the floor everywhere, no beam ending in the bar or the chill
area, and nobody within 30° of looking down a beam.</div>

<h2>What each place in the hot zone sees — before and after</h2>
<p class="note">Every unit at full. The light the lit steel sends to that eye (lx, an upper bound), and the beams' glow in the
haze toward it (G, a design metric). The drop in G is the glare that was removed: B tuned's beams pointed at people now
standing there.</p>
<div class="wrap"><table><tr><th>eye (1.7 m)</th><th>lit steel, B tuned</th><th>lit steel, spread</th><th>beam glow G, B tuned</th><th>beam glow G, spread</th></tr>{eyes}</table></div>

<h2>Where the lamps are — your zones, before and after</h2>
<div class="wrap"><table><tr><th>zone</th><th>B tuned</th><th>B spread</th></tr>{zones}</table></div>

<h2>The stage from the floor — light on a vertical plane facing the crowd</h2>
<p class="note">Measured in the room (measurement mode, lux probe, Full quality, the look held), and computed: E = I cos i / d², the
room's spot cone and the hall's shadows. The room draws a PAR at 30 478 cd. The spec figure we can name is 11 000 cd, another
maker's, an upper estimate. The target is 30–80 lx at EV100 2.84.</p>
<div class="wrap"><table><tr><th>where</th><th>look</th><th>B tuned, probe lx</th><th>spread, probe lx</th><th>spread, computed (room 30 478 cd)</th><th>spread, computed (spec 11 000 cd)</th></tr>{stage}</table></div>

<h2>How many on the truss — 10 or 12</h2>
<div class="wrap"><table><tr><th>PARs on the cut</th><th>worst pick (cap 146 kg)</th><th>shafts separate, 15° / 25° lens</th><th>light on the DJ's face (full)</th><th>closest lamp body to a laser tube</th></tr>{cutrows}</table></div>

<h2>The lasers — used as given, then checked</h2>
<p class="note">The six cubes and the laser bar come from the laser session's data, unchanged (git cf954908, PR #844). The free
crane travels to z −12: the owner's decision, 2026-10-09. The check: every lamp body, the pit stand and the smoke machine against
every laser tube. The tube is the axis plus the fan's 1.008° half angle. The 8 closest are listed below.</p>
<div class="wrap"><table><tr><th>unit</th><th>part</th><th>gap to the tube (m)</th><th>beam</th></tr>{lz}</table></div>

<h2>All frames — old left, new right</h2>
<p class="note">Measurement mode, EV100 2.84 fixed for every frame, Full quality, the hall's bounce kept, one smoke machine
(two-zone model, UNVALIDATED until the haze is measured on site). Lasers on in the peak look of B spread (7.5 W cubes, one static beam each); B tuned had none.</p>
{pairs}
<p class="note">Contact sheet: <a href="contact-sheet.png">contact-sheet.png</a> · every number: <a href="checks.json">checks.json</a>, <a href="candidates.json">candidates.json</a>,
<a href="probe.json">probe.json</a>, <a href="frame-luma.json">frame-luma.json</a>, <a href="frames/frames.json">frames/frames.json</a>.</p>
</main></body></html>
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['build', 'plan', 'page', 'candidates'])
    ap.add_argument('--repo', default='.')
    ap.add_argument('--out', default=os.path.expanduser('~/Downloads/moxir/v2-spread'))
    ap.add_argument('--lasers', default=LASER_TABLE)
    ap.add_argument('--placement', default=None, help='reuse a previous build\'s placement.json (same inputs)')
    A, _ = ap.parse_known_args()
    repo = os.path.abspath(os.path.expanduser(A.repo))
    out = os.path.abspath(os.path.expanduser(A.out))
    if A.cmd == 'build':
        build(repo, out, A.lasers, A.placement)
    elif A.cmd == 'plan':
        plan(repo, out)
    elif A.cmd == 'candidates':
        candidates(repo, out)
    else:
        page(repo, out)


if __name__ == '__main__':
    main()
