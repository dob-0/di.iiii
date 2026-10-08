#!/usr/bin/env python3
# moxir_v1.py — MOXIR v1.0: the epic plot, ELITE and MINIMAL (2026-10-08). The owner chose every advised placement
# option (epic_placement.py), then: "an ELITE-level epic thing", "but also MINIMAL", the independent review's fixes
# (scratchpad fable-review.md), the crane: "they said it can move — look where is the best place", power <= 30 kW
# running, "make the speakers complementary". Pictures and numbers for planning; nothing is built here.
#
#   python3 -I scripts/place/moxir_v1.py --repo . --out ~/Downloads/moxir/stage/epic     # page, pictures, rig file, survey
#   python3 -I scripts/place/moxir_v1.py --repo . --check                                 # the numbers, JSON
#
# WHAT IT DECIDES, AND HOW (every number is computed here from the engine, or carries its source / ASSUMED)
#   - Fixtures: only what a signature moment needs; every other unit on the order is "not hung" (counted).
#   - Lasers: all 12 beams end on ONE matte black beam-stop panel behind the DJ (HS(G)95, IEC TR 60825-3: a
#     non-reflective stop with margin for pointing); each beam's 25 test rays cover the controller zone 0.3 deg PLUS a
#     0.5 deg mount tolerance (fan 0.8 deg), cast against the hall GLB + the rig + the panel (lasers_v2.check_beam), for
#     4 rig plans (near crane at z 21 or parked at z 4.8; lasers 1-3 on the far crane rolled to z -41 or on the goal post).
#     Brightness per beam at the 6 W unit with each cube's power split between its beams (duty 0.45, Talbot-Plateau);
#     safety at 10 W full power in one beam (NOHD 724 m, IEC 60825-1:2014 Table A.1; separation, not NOHD, is the control).
#     Diffuse reflection off the panel: r_NHZ = sqrt(rho P / (pi MPE)) (ANSI Z136.1 extended-source formula, rho 0.05).
#   - Haze: steady-state mass balance, C = yield x fluid rate x density / (ACH x V) (well-mixed room), sigma = k_m C with
#     k_m ~ 3 m2/g for ~1 um droplets (Mie, Q_ext ~ 2: ESTIMATE); hazer output from fixtures.json (Antari HZ-1000).
#   - PA: Sabine RT60 = 0.161 V / A (absorption ASSUMED, a range); critical distance Dc = 0.057 sqrt(Q V / RT60)
#     (Davis & Patronis, Sound System Engineering); sightlines from every floor eye to the DJ and the cut, cast against the
#     same model with each PA layout's boxes.
#   - Power: connected = datasheet watts; running = per-look levels x a stated duty per class (ESTIMATE), <= 30 kW.
#   - Pictures: the hall's 55 000 triangles (matplotlib, no WebGL), rendered twice (with and without light): the
#     difference is the light, blurred into a glow (3-pass box blur ~ Gaussian), tone-mapped (filmic 1 - e^-x),
#     vignetted. A planning sketch, not a photometric render.
import argparse, base64, collections, copy, json, math, os, shutil, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.dont_write_bytecode = True
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('--repo', default='.')
ap.add_argument('--out', default=None)
ap.add_argument('--check', action='store_true')
ap.add_argument('--survey', default='~/Downloads/moxir/stage/occlusion/moxir-survey.html')
ap.add_argument('--rig-out', default='scripts/place/rigs/moxir-epic-2026-10-08.json')
ap.add_argument('--fast', action='store_true', help='skip the pictures')
A5 = ap.parse_known_args()[0]

import epic_plot as EPL     # noqa: E402  (epic_placement -> lasers_v2 -> design_paint -> occlusion: the engine)
EP, LV, D, L, OC, O = EPL.EP, EPL.LV, EPL.D, EPL.L, EPL.OC, EPL.D.O
G = D.G
FXJ = EPL.FXJ
ASH, ASH_GREY, EMBER, EMBER_DEEP = '#e8e4dc', '#9c978d', '#ff3a12', '#a3200c'
EYE = np.array([0.0, 1.6, 38.0])

# ------------------------------------------------------------------ the hall models (4 plans)
BASE_A = EP.BASE_OB                                   # the hall with the near crane at z 21 (the beta)
_g = json.load(open(os.path.join(D.GLB_AS_PHOTOGRAPHED, 'hall.json')))['geometry']
BASE_B = O.Obstacles(os.path.join(D.GLB_AS_PHOTOGRAPHED, 'hall.glb'), _g, L.rig_boxes(), L.TRUSS, L.crane_boxes())   # near crane at z 4.8, as found
PANEL = {'x': (0.13 - 2.0, 0.13 + 2.0), 'y': (5.5, 7.9), 'z': 20.2, 'thick': 0.1,
         'what': '4.0 x 2.4 m, 1.5 mm aluminium sheet on a light steel frame, matte black high-temperature paint (reflectance ~5 %, ASSUMED for the paint), ~54 kg; NOT cloth or plywood: a 5 W beam on a 7 cm spot is ~1.3 kW/m2',
         'kg': 54.0}
PANEL_BOX = L.Box.aabb('beam-stop panel', PANEL['x'], PANEL['y'], (PANEL['z'] - 0.05, PANEL['z'] + 0.05), 'beamstop')
D.CLS_COL['beamstop'] = '#0c0c0d'
GP_FAR = [x for x in LV.V2['options_far'] if x['id'] == 'b'][0]
GP_STAGE = {'x': (-7.8, 5.2), 'z': 20.5, 'bottom': 8.0, 'span_m': 13.0,
            'what': 'Plan B: a ground-supported goal post behind the DJ, a 13 m span (H40V class: on H30V the estimate leaves too little margin, below) on two towers at x -7.8 and +5.2, bottom chord 8.0 m; it carries the cut (its 3 picks, chain hoists) and the beam-stop panel. The right tower stands 0.1 m from the roller conveyor and the blower: a ballast base or guys to the z 18 / z 24 columns, not outriggers'}


def gp_stage_boxes():
    h = GP_STAGE['bottom'] + 0.29
    z = GP_STAGE['z']
    span = L.Box.aabb('stage goal post span', (GP_STAGE['x'][0] - 0.15, GP_STAGE['x'][1] + 0.15), (GP_STAGE['bottom'], h), (z - 0.145, z + 0.145), 'truss')
    tw = [L.Box.aabb('stage goal post tower x %+g' % x, (x - 0.15, x + 0.15), (0.0, h), (z - 0.15, z + 0.15), 'truss') for x in GP_STAGE['x']]
    return [(b, b.id, 'truss') for b in [span] + tw]


PLANS = {
    'A1': {'near': 21.0, 'far': 'crane', 'title': 'near crane at z 21, far crane rolled to z -41 (lasers 1-3 on it)', 'towers': 1},
    'A2': {'near': 21.0, 'far': 'goalpost', 'title': 'near crane at z 21, lasers 1-3 on the goal post', 'towers': 3},
    'B1': {'near': 4.8, 'far': 'goalpost', 'title': 'Plan B: no crane moves; stage goal post + far goal post', 'towers': 5},
    'B2': {'near': 4.8, 'far': 'crane', 'title': 'near crane stays, far crane rolled to z -41; stage goal post', 'towers': 3},
}


def plan_model(pid):
    pl = PLANS[pid]
    base = BASE_A if pl['near'] == 21.0 else BASE_B
    ob = LV.Shifted(base, 'crane z -22.2', -41.0 + 22.2) if pl['far'] == 'crane' else LV.Shifted(base, extra=LV.goalpost(GP_FAR['z'], GP_FAR['height_m'], GP_FAR['span_m']))
    extra = [(PANEL_BOX, 'beam-stop panel', 'beamstop')] + (gp_stage_boxes() if pl['near'] != 21.0 else [])
    return LV.Shifted(ob, extra=extra)


MODELS = {p: plan_model(p) for p in PLANS}
REC_PLAN = 'A1'           # the recommendation (set by crane_study; asserted after it)
FALLBACK_PLAN = 'B1'


def use_model(ob):
    OC.OB = ob
    EP.OB = ob
    D.OB = ob


# ------------------------------------------------------------------ the lasers: 12 lines on one ash wall
TARGETS = {  # beam -> (dx from the panel centre x, y) on the panel's far face
    '1a': (-0.75, 7.0), '1b': (-0.45, 7.0), '2a': (-0.15, 7.0), '2b': (0.15, 7.0), '3a': (0.45, 7.0), '3b': (0.75, 7.0),
    '4a': (-1.2, 6.3), '4b': (-0.9, 6.3), '5a': (0.9, 6.3), '5b': (1.2, 6.3), '6a': (-1.5, 7.35), '6b': (1.5, 7.35)}
CUBE_COLOUR = {1: 'ash white', 2: 'ash white', 3: 'ash white', 4: 'ember red', 5: 'ember red', 6: 'ash white'}
HEX = {'ash white': ASH, 'ember red': EMBER}
FAN = (0.8, 0.8)          # 0.3 deg controller zone + 0.5 deg mount tolerance (review B2)
ZONE = 0.3
V_LAMBDA = LV.V_LAMBDA


def colour_power(colour, variant):
    w = LV.VARIANTS[variant]
    mix = {455: 1.0, 525: 1.0, 638: 1.0} if colour == 'ash white' else {638: 1.0, 525: 0.1}     # ember = red + 10 % green (review M4)
    P = sum(w[l] * k for l, k in mix.items())
    return P, sum(683 * V_LAMBDA[l] * w[l] * k for l, k in mix.items())


def cube_places(pid):
    far = PLANS[pid]['far']
    out = {}
    for c in LV.V2['cubes']:
        if c.get('far'):
            if far == 'crane':
                out[c['n']] = (np.array([c['x'], 7.45, -41.0 + 1.8]), 'the far crane rolled to z -41: girder clamp + 0.5 m drop arm in front of its front girder, cube at 7.45 m (needs the crane seen moving, its inspection, its lock-out)')
            else:
                x = 7.3 if c['n'] == 3 else c['x']
                out[c['n']] = (np.array([x, 6.6, GP_FAR['z']]), 'the far goal post (H30V 12 m on 2 towers) at z -41.5: half-coupler + safety under the bottom chord at 6.6 m')
        else:
            out[c['n']] = (np.array(c['p'], float), c['mount'])
    return out


def beams_for(pid, rows=None):
    rows = rows or {}
    out = []
    for n, (p, mount) in cube_places(pid).items():
        for k in 'ab':
            bid = '%d%s' % (n, k)
            dx, y = TARGETS[bid]
            y = rows.get('far' if n <= 3 else ('six' if n == 6 else 'mid'), y)
            T = np.array([0.13 + dx, y, PANEL['z'] - 0.05])
            out.append({'id': bid, 'cube': n, 'fixture': 'rig-lasercube-cut-%02d' % n, 'colour_name': CUBE_COLOUR[n], 'colour': HEX[CUBE_COLOUR[n]],
                        'p': p, 'd': L.unit(T - p), 'to': T, 'stop': 'beam-stop panel', 'what': 'onto the ash wall (the beam-stop panel) behind the DJ',
                        'fan': FAN, 'mount': mount, 'kind': 'laser', 'spare': False})
    return out


def margin_deg(b):
    """What is left of the aim after the 0.3 deg controller zone: the smallest angle from the target to a panel edge."""
    T = b['to']
    Lm = float(np.linalg.norm(T - b['p']))
    edge = min(T[0] - PANEL['x'][0], PANEL['x'][1] - T[0], T[1] - PANEL['y'][0], PANEL['y'][1] - T[1])
    r = 0.002 + 0.0005 * Lm                       # beam radius: 4 mm aperture + 1 mrad
    return round(math.degrees(math.atan((edge - r) / Lm)) - ZONE, 2), round(Lm, 1)


def beam_vis(b, res, ob, sigma, variant='6W', duty=0.45, n=9):
    g = LV.V2['haze']['g']
    Pc, lm = colour_power(b['colour_name'], variant)
    eff = lm / Pc
    P0 = Pc * duty
    pts = []
    for s in np.linspace(1.0, res['length_m'] - 0.5, n):
        q = b['p'] + b['d'] * s
        v = q - EYE
        dist = float(np.linalg.norm(v))
        h = ob.cast(EYE, v / dist, 0.3, dist - 0.3)
        th = math.acos(max(-1.0, min(1.0, float((-v / dist) @ b['d']))))
        w = L.LASER_A_M + L.LASER_PHI * s
        Lr = sigma * LV.p_hg(th, g) * P0 * math.exp(-sigma * s) / (w * max(math.sin(th), 1e-3)) * math.exp(-sigma * dist)
        pts.append((h[0] is None, Lr * eff))
    seen = [c for s_, c in pts if s_]
    return {'seen_share': round(len(seen) / len(pts), 2), 'cd_m2': round(float(np.median(seen)), 1) if seen else 0.0}


AIM_ROWS = {'far': [6.7, 6.8, 6.6, 6.9, 7.0, 6.5], 'six': [7.1, 7.0, 7.2, 6.9, 7.3, 6.8], 'mid': [6.3, 6.4, 6.2]}


def pick_rows(pid):
    """The aim heights on the panel, per group of cubes, searched per plan: the first height (nearest the panel's middle) at
    which every beam of the group passes over its whole +-0.8 deg field and keeps >= 0.5 deg of margin after the zone."""
    ob = MODELS[pid]
    rows, tried = {}, {}
    for grp, cand in AIM_ROWS.items():
        tried[grp] = []
        for y in cand:
            bs = [b for b in beams_for(pid, {grp: y}) if (b['cube'] <= 3 if grp == 'far' else (b['cube'] == 6 if grp == 'six' else b['cube'] in (4, 5)))]
            res = [LV.check_beam(b, ob) for b in bs]
            ok = all(r['pass'] for r in res) and min(margin_deg(b)[0] for b in bs) >= 0.5
            tried[grp].append({'y': y, 'pass': sum(r['pass'] for r in res), 'n': len(res), 'why': sorted({e for r in res for e in r['errors']})[:2]})
            if ok:
                rows[grp] = y
                break
    return rows, tried


def run_lasers(pid, sigmas):
    ob = MODELS[pid]
    rows, tried = pick_rows(pid)
    bs = beams_for(pid, rows)
    res = [LV.check_beam(b, ob) for b in bs]
    rows_ = rows
    rows = []
    for b, r in zip(bs, res):
        m, Lm = margin_deg(b)
        rows.append({'id': b['id'], 'cube': b['cube'], 'colour': b['colour_name'], 'from': [round(float(v), 2) for v in b['p']], 'to': [round(float(v), 2) for v in b['to']],
                     'length_m': Lm, 'pass': r['pass'], 'errors': r['errors'], 'margin_after_zone_deg': m, 'min_over_floor_m': r['min_over_floor_m'],
                     'max_height_m': round(float(max(b['p'][1], b['to'][1])), 2),
                     'vis': {('%g' % s): beam_vis(b, r, ob, s) for s in sigmas}})
    return {'plan': pid, 'aim_rows': rows_, 'aim_search': tried, 'beams': rows, 'pass': sum(r['pass'] for r in rows), 'n': len(rows), 'min_margin_deg': min(r['margin_after_zone_deg'] for r in rows),
            'max_height_m': max(r['max_height_m'] for r in rows), '_bs': bs, '_res': res}


def diffuse_nhz(P=10.6, rho=0.05):
    return round(math.sqrt(rho * P / (math.pi * L.MPE_E)), 3), round(math.sqrt(1.0 * P / (math.pi * L.MPE_E)), 2)


# ------------------------------------------------------------------ the haze: what we can get
def haze_plan():
    sm = FXJ['kinds']['smoke']['specs']
    q = sm['fluid_ml_per_min']['value'] * 0.05             # ml/min: 150 at 100 % (Antari Z-1500 III, EQUIVALENT) x a 5 % duty (3 s every 60 s)
    n = 4
    k_m = 1.0                                              # m2/g, ESTIMATE: fog droplets are larger than haze (several um): less extinction per gram
    yld, rho = 0.3, 1.05                                   # ASSUMED: a third of the fog stays airborne past the first minute; glycol fluid ~1.05 g/ml
    vols = {'the nave only (24 x 107.6 x 13 m)': 33600, 'the whole hall (4 spans)': 135000}
    rows = []
    for vn, V in vols.items():
        for ach in (0.5, 1.0, 2.0):
            C = yld * n * q * rho * 60.0 / (ach * V)       # g/m3 at steady state
            rows.append({'volume': vn, 'V_m3': V, 'ach_per_h': ach, 'mg_m3': round(1000 * C, 2), 'sigma_per_m': round(k_m * C, 4)})
    need = {s: round((s / k_m) * 135000 * 1.0 / yld / rho / 60.0, 1) for s in (0.005, 0.01, 0.02)}   # ml/min, the whole hall at 1 air change/h
    design_sigma = 0.005
    return {'units': n, 'model': '4 x UP-YZ31P smoke machines (Poligraf, the units used at Sevan; equivalent Antari Z-1500 III, 150 ml/min at 100 %%), run in bursts: %g ml/min each on average' % q, 'ml_min_each': q, 'k_m2_g': k_m,
            'yield': yld, 'rows': rows, 'need_ml_min_whole_hall_ach1': need, 'design_sigma': design_sigma, 'written_sigma': 0.02,
            'verdict': 'There is NO hazer (owner 10-08: "only the 4 smoke machines"; no hazer will be added). Smoke is not haze: it comes in dense clouds that drift and thin within minutes, so the lines will be bright inside a cloud and broken between clouds, not continuous. Run in bursts (3 s every 60 s each, offset so one fires every 15 s, low output), the hall-average works out to sigma ~%s/m (the whole hall, 1 air change per hour) and ~%s/m if the smoke stays in the nave: the lasers still read 100s of cd/m2 against a dark club\'s 0.01 (table) wherever there is smoke. WHAT THE FLOOR WILL REALLY SEE: lines that appear whole for 1-2 minutes after a burst and then break into segments; the far half (where the machines are) holds smoke best, the dance floor least (body heat lifts it). The design leans into it: smoke before light, darkness first; the lines are an event, not wallpaper. Not chosen: 2 x MDG ATMe hazers (continuous lines).' % (
                [r for r in rows if r['V_m3'] == 135000 and r['ach_per_h'] == 1.0][0]['sigma_per_m'], [r for r in rows if r['V_m3'] == 33600 and r['ach_per_h'] == 1.0][0]['sigma_per_m']),
            'placement': [{'where': 'the far nave, x -6 and +6, z -37, nozzles up 30 deg toward the nave\'s middle', 'n': 2, 'why': 'the lasers are born in smoke; the columns of fire need it'},
                          {'where': 'beside the press, x +10.6, z -4', 'n': 1, 'why': 'the mid-nave the lines cross; in acts 1 and 4 its slow low bursts drift through the machines: still smoking'},
                          {'where': 'behind the stage line, x -4.5, z 19.8, low', 'n': 1, 'why': 'the silhouette: smoke rolling through the curtain'},
                          {'where': 'NOT CHOSEN (owner 10-08: "only the 4 smoke machines"): 2 x MDG ATMe oil hazers from another supplier', 'n': 0, 'why': 'would make every line continuous end to end; listed only as the upgrade not taken'}],
            'run': ['Background: each machine a 3 s burst at low output every 60-90 s, the four offset (one every ~20 s), so the hall never fills and never empties.',
                    'Before every laser moment (one line, the chase, the fire): the far pair fires a 5 s burst 15-20 s before the cue, in the black: the lines are born in fresh smoke, and darkness comes first (the concept).',
                    'Before the silhouette and ash falling: the stage machine (z 19.8) 3-5 s, so the curtain and the spine cut through rolling smoke.',
                    'Never a burst in the fire returns itself (the flash would light a wall of smoke into the crowd\'s eyes); never two machines on the same side at once (patches).',
                    'The operator runs them on the desk (1 DMX channel each, U1/U2): a burst macro per machine, a "smoke before" button per laser cue.'],
            'measure': 'on the night: a 1 m2 white card and a PAR at 20 m with a lux meter: sigma = -ln(E/E0)/d; and run one hazer 20 min on the visit if one is there',
            'basis': 'steady state of a well-mixed room: C = yield x n x q x density / (ACH x V); the bursts averaged (they are not well mixed: local sigma swings from ~0 to > 0.05/m); k_m and the yield ESTIMATED for glycol fog; ACH unmeasured; fluid output from fixtures.json (EQUIVALENT)'}


# ------------------------------------------------------------------ the units: minimal, each one essential
def unit_from(fid, **kw):
    f = copy.deepcopy([x for x in D.FX if x['id'] == fid][0])
    f.update(kw)
    return f


def aimed(f, T=None, d=None):
    f['p'] = np.asarray(f['p'], float)
    if T is not None:
        T = np.asarray(T, float)
        f['d'] = L.unit(T - f['p'])
        f['aim'], f['aim_i'] = {'rule': 'targets', 'targets': [T.tolist()]}, 0
    else:
        f['d'] = L.unit(d)
        f['aim'], f['aim_i'] = {'rule': 'up'}, 0
    f['r'] = L.rot_for_dir(f['d'])
    return f


def build_units(roof_where):
    U = []

    def add(f, part, layer, status, moments, colour, mount):
        f.update(part=part, layer=layer, status=status, moments=moments, colour=colour, mount=mount)
        U.append(f)
    for fid in ['rig-par-cut-curtain-%02d' % i for i in range(1, 8)]:
        add(unit_from(fid), 'curtain', 'cut', 'used', ['silhouette', 'ash falling', 'sparks'], ASH, 'hung under the cut, half-coupler + safety, straight down')
    for fid in ['rig-par-cut-x-%02d' % i for i in range(1, 7)]:
        add(unit_from(fid), 'x', 'cut', 'used', ['silhouette'], EMBER, 'hung under the cut, half-coupler + safety')
    for fid in ['rig-par-cut-bridge-%02d' % i for i in range(1, 5)]:
        f = unit_from(fid)
        aimed(f, T=[f['p'][0] if PANEL['x'][0] + 0.3 < f['p'][0] < PANEL['x'][1] - 0.3 else float(np.clip(f['p'][0], PANEL['x'][0] + 0.4, PANEL['x'][1] - 0.4)), 7.0, PANEL['z'] + 0.06])
        add(f, 'ash wall', 'cut', 'used', ['silhouette', 'the black'], EMBER, 'standing on the cut\'s top chords, half-coupler + safety, tilted back to graze the ash wall')
    for fid in ('rig-par-neighbour-02', 'rig-par-neighbour-03'):
        add(unit_from(fid), 'halo', 'stage', 'used', ['still smoking', 'silhouette'], EMBER, 'floor behind the step, on its bracket')
    for fid in ['rig-beam380-backstage-%02d' % i for i in range(2, 7)]:
        add(unit_from(fid), 'fan', 'beams', 'held back', ['the fire returns'], ASH, 'floor behind the step, base down (mount face 0.7 m)')
    add(aimed(unit_from('rig-beam380-lighthouse-01', p=[0.13, 0.7, 21.45]), d=[0.0, 1.0, 0.0]), 'spine', 'beams', 'used', ['ash falling', 'the fire returns'], ASH, 'floor behind the truss, base down')
    cof = [('rig-beam380-columns-01', -10.0, -14.0), ('rig-beam380-columns-02', 10.0, -14.0), ('rig-beam380-columns-03', -10.0, -30.0),
           ('rig-beam380-columns-04', 10.0, -30.0), ('rig-beam380-columns-05', -10.0, -46.0), ('rig-beam380-columns-06', 10.0, -46.0)]
    for fid, x, z in cof:
        f = aimed(unit_from(fid, p=[x, 0.7, z]), d=[0.0, 1.0, 0.0])
        f['groupName'] = 'the columns of fire (far nave floor)'
        add(f, 'columns of fire', 'beams', 'used', ['columns of fire', 'the fire returns'], EMBER, 'floor in the far nave at the column row, base down; a pen (it is outside the crowd, behind the stage)')
    for fid in ('rig-par-vista-01', 'rig-par-vista-02', 'rig-par-vista-07', 'rig-par-vista-08'):
        add(unit_from(fid), 'far columns', 'hall', 'used', ['columns of fire', 'still smoking'], EMBER_DEEP, 'floor bracket at the nave column\'s face')
    for fid in ['new-bsw250-%02d' % i for i in range(1, 5)]:
        add(unit_from(fid), 'far wall', 'hall', 'used', ['still smoking', 'columns of fire'], EMBER_DEEP, 'floor at the far end, base down')
    # still smoking: 4 PL5403 from the order (the 5 that crowned the press are not needed there) INSIDE the machines
    for fid, p, T in (('rig-par-press-cut-01', [0.9, 0.3, 0.9], [1.6, 4.0, 1.6]), ('rig-par-press-cut-02', [2.4, 0.3, 2.5], [1.6, 4.0, 1.7]),
                      ('rig-par-press-cut-03', [6.0, 2.45, 0.8], [8.5, 2.6, 1.3]), ('rig-par-press-sides-01', [5.2, 0.2, 16.4], [5.0, 2.2, 18.2])):
        f = aimed(unit_from(fid, p=p), T=T)
        f['groupName'] = 'still smoking (inside the machines)'
        add(f, 'still smoking', 'machines', 'used', ['still smoking', 'ash falling'], EMBER, 'inside the machine, on its own bracket (out of reach)')
    if roof_where == 'nave':
        for i, (x, z) in enumerate([(-8.6, -10.0), (8.6, -10.0), (-8.6, -16.0), (8.6, -16.0), (-8.6, -30.0), (8.6, -30.0), (-8.6, -47.0), (8.6, -47.0)]):
            f = aimed(unit_from('new-hk1915-%02d' % (i + 1), p=[x, 0.5, z]), d=[0.0, 1.0, 0.0])
            f['beam_deg'] = 30.0
            f['groupName'] = 'wash: the nave roof, far half (HK1915, up)'
            add(f, 'roof', 'hall', 'held back', ['the roof'], ASH, 'floor in the far nave, base down, lens up, zoom 30 deg')
    else:
        for i in range(8):
            add(unit_from('new-hk1915-%02d' % (i + 1)), 'roof', 'hall', 'held back', ['the roof'], ASH, 'floor in the side span, base down, lens up')
    # the fire returns: 4 blinders on the cut facing the crowd (<= 40 %, 1-2 s), 4 strobes in the far half up into the roof
    ph = EP.REC['photometry']
    for k, u in enumerate((0.2, 0.4, 0.6, 0.8)):
        q = EP.truss_at(u)
        p = [float(q[0]), float(q[1]) - 0.35, 21.35]
        eye = np.array([p[0] * 0.5, 1.6, 26.8])                      # the front row, in front of this unit
        v = eye - np.array(p)
        hz_ = math.hypot(v[0], v[2])
        el = math.atan2(v[1], hz_) + math.radians(12.5)             # the axis 12.5 deg above the line to the front row's eyes
        T = list(np.array(p) + np.array([v[0] / hz_ * math.cos(el), math.sin(el), v[2] / hz_ * math.cos(el)]) * 10.0)
        f = aimed({'id': 'new-blinder-%02d' % (k + 1), 'type': 'ext-blinder', 'kind': 'spot', 'flash': 'blinder', 'groupName': 'flash: blinder', 'spare': False,
                   'beam_deg': ph['blinder_beam_deg'], 'reach': 40.0, 'I_cd': ph['blinder_cd']['value'], 'level_cap': 0.4, 'p': p}, T=T)
        add(f, 'blinders', 'flash', 'held back', ['the fire returns'], ASH, 'on the cut\'s front face (z 21.35), half-coupler + safety; level capped at 40 % in the desk')
    for k, (x, z) in enumerate(((-8.0, -18.0), (8.0, -18.0), (-8.0, -32.0), (8.0, -32.0))):   # z -32, not -38: the far crane parks at z -41 (Plan A1) and its bridge cut the far pair's flash
        f = aimed({'id': 'new-strobe-%02d' % (k + 1), 'type': 'ext-strobe', 'kind': 'spot', 'flash': 'strobe', 'groupName': 'flash: strobe', 'spare': False,
                   'beam_deg': ph['strobe_beam_deg'], 'reach': 30.0, 'I_cd': ph['strobe_cd']['value'], 'p': [x, 0.3, z]}, d=[-0.3 * float(np.sign(x)), 1.0, 0.0])   # leaned 17 deg in, off the column heads at x +-12
        add(f, 'lightning', 'flash', 'held back', ['the fire returns'], ASH, 'floor in the far nave, on a plate, straight up into the roof; rate capped at 4 Hz in the desk')
    # ALL WASH, ALL BEAM (owner 10-08, after v1.0's first build: "hang all the wash and all the beam fixtures of the order;
    # minimal is how they are USED per look, not what is hung"). Every remaining PL5403 / B380F / 250BSW of the order hangs
    # at its beta position with its beta aim (design_paint.FX, each checked below against the hall + rig, plan by plan), in a
    # part that a look names sparingly. Each part keeps the ash / ember palette and the <= 2 layer rule (3 in the fire).
    for fid in ('rig-par-columns-06', 'rig-par-neighbour-01', 'rig-par-neighbour-04'):
        add(unit_from(fid), 'halo', 'stage', 'used', ['still smoking', 'silhouette'], EMBER, 'floor behind the step, on its bracket')
    add(unit_from('rig-par-press-sides-02'), 'still smoking', 'machines', 'used', ['still smoking', 'ash falling'], EMBER, 'floor at the press crown, on its own bracket (out of reach)')
    for fid in ('rig-par-vista-03', 'rig-par-vista-04', 'rig-par-vista-05', 'rig-par-vista-06'):
        f = unit_from(fid)
        if f['p'][2] < -30:     # the bay z -36..-30 is X-braced: graze the column away from the bracing (the beta's aim hit it)
            aimed(f, T=[float(np.sign(f['p'][0])) * 11.9, 6.5, -39.0])   # and under the crane runway girder (8 m)
        add(f, 'far columns', 'hall', 'used', ['columns of fire', 'still smoking'], EMBER_DEEP, 'floor bracket at the nave column\'s face')
    for fid in ['rig-par-columns-%02d' % i for i in (1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16)]:
        add(unit_from(fid), 'span columns', 'hall', 'used', ['columns of fire'], EMBER_DEEP, 'floor at the side span\'s wall column, uplight, on a plate')
    for fid in ('rig-beam380-backstage-01', 'rig-beam380-backstage-07'):
        add(unit_from(fid), 'fan', 'beams', 'held back', ['the fire returns'], ASH, 'floor behind the step, base down (mount face 0.7 m)')
    for fid in ('rig-beam380-columns-07', 'rig-beam380-columns-08', 'rig-beam380-columns-09', 'rig-beam380-columns-10'):
        add(unit_from(fid), 'arch', 'beams', 'held back', ['the roof'], ASH, 'floor at the column rows behind the dance floor, base down, beams crossing high over the floor (never at the crowd)')
    for fid in ('new-bsw250-05', 'new-bsw250-06', 'new-bsw250-07', 'new-bsw250-08'):
        add(unit_from(fid), 'far wall', 'hall', 'used', ['still smoking', 'columns of fire'], EMBER_DEEP, 'floor at the side span\'s far end, base down')
    for fid in ('new-bsw250-09', 'new-bsw250-10', 'new-bsw250-11', 'new-bsw250-12'):
        add(unit_from(fid), 'side roof', 'hall', 'held back', ['the roof', 'dawn'], ASH, 'floor in the side span beside the audience, lens up')
    for fid, p in (('rig-smoke-01', [-6.0, 0.1, -37.0]), ('rig-smoke-02', [6.0, 0.1, -37.0]), ('rig-smoke-03', [10.6, 0.1, -4.0]), ('rig-smoke-04', [-4.5, 0.1, 19.8])):
        add(unit_from(fid, p=p), 'haze', 'air', 'used', [], None, 'floor; bursts of 3 s every 60 s, offset (the haze plan)')

    return U


def not_hung(U):
    used = {u['id'] for u in U}
    order = {'UP-PL5403': 50, 'UP-B380F': 18, 'UP-250BSW': 12, 'UP-HK1915': 8, 'UP-YZ31P': 4, 'EXT-STROBE': 6, 'EXT-BLINDER': 8, 'EXT-LC-ULTRA-MK2': 6}
    code = lambda t: EPL.CODE.get(t, t.upper())
    cnt = collections.Counter(code(u['type']) for u in U if u['type'] not in ('ext-fan',))
    cnt['EXT-LC-ULTRA-MK2'] = 6
    rows = [{'code': c, 'ordered': n, 'hung': cnt.get(c, 0), 'not_hung': n - cnt.get(c, 0)} for c, n in order.items()]
    for c in ('UP-LA40WF', 'UP-Q108S', 'UP-YH600F'):
        rows.append({'code': c, 'ordered': {'UP-LA40WF': 2, 'UP-Q108S': 6, 'UP-YH600F': 4}[c], 'hung': 0, 'not_hung': {'UP-LA40WF': 2, 'UP-Q108S': 6, 'UP-YH600F': 4}[c]})
    return rows


# ------------------------------------------------------------------ the checks of every unit, per plan
def check_units(U, pid):
    use_model(MODELS[pid])
    lit = [u for u in U if u.get('d') is not None and u['kind'] in ('par', 'beam', 'wash', 'spot')]
    for u in lit:
        if u.get('flash') == 'blinder':
            u['I_cd'] = EP.REC['photometry']['blinder_cd']['value'] * u['level_cap']
    rows = EP.check_fixtures(lit, ('v1', pid))
    per = {r['id']: r for r in rows}
    extra = []
    for u in lit:     # columns of fire: the fan effect's inner extreme (8 deg toward the axis) must clear too
        if u['part'] == 'columns of fire':
            t = math.radians(8.0)
            s = -1.0 if u['p'][0] > 0 else 1.0
            g = aimed(dict(u, id=u['id'] + '@fan8'), d=[s * math.sin(t), math.cos(t), 0.0])
            extra.append(g)
    erows = EP.check_fixtures(extra, ('v1fan', pid))
    return rows, erows


def glare_by_part(U, rows):
    out = {}
    by = {u['id']: u for u in U}
    for r in rows:
        u = by[r['id']]
        g = r['glare'] or {'eyes': 0, 'front_lux': 0, 'max_lux': 0}
        o = out.setdefault(u['part'], {'eyes': 0, 'front_lux': 0.0, 'max_lux': 0.0, 'blocked': 0, 'blockers': set()})
        o['eyes'] += g['eyes']
        o['front_lux'] = max(o['front_lux'], g['front_lux'])
        o['max_lux'] = max(o['max_lux'], g['max_lux'])
        if r['blocked_pct'] > 0:
            o['blocked'] += 1
            o['blockers'] |= set(r['blockers'])
    for o in out.values():
        o['blockers'] = sorted(o['blockers'])
    return out


def blinder_front_row(U):
    """All 4 blinders at their 40 % cap, summed per eye (the per-eye array is rebuilt here)."""
    per = np.zeros(len(L.EYES))
    for u in U:
        if u.get('flash') == 'blinder':
            g = EP.glare(u)
            if g:
                per += g['_per']
    front = L.EYES[:, 2] <= 27.8
    return {'front_row_lux_all4_at_40pct': round(float(per[front].max()), 0), 'back_lux': round(float(per[L.EYES[:, 2] >= 46].max()), 0),
            'eyes_lit': int((per > 0).sum())}


# ------------------------------------------------------------------ the crane study
def gp_stage_load(cut):
    """Plan B: the stage goal post's bending moment (13 m simple span) from the cut's 3 picks (the repo's own pick loads),
    the 4 blinders, the panel and 10 % cable, against an allowable moment ESTIMATED from the repo's H30V 12 m row."""
    picks = [(p['x_m'], p['on_bridge_kg']) for p in cut['picks']]
    add = 4 * (8.7 + 1.0) / 3.0
    loads = [(x, kg + add) for x, kg in picks] + [(0.13 - 1.5, PANEL['kg'] / 2), (0.13 + 1.5, PANEL['kg'] / 2)]
    loads = [(x, kg * 1.10) for x, kg in loads]
    a, b = GP_STAGE['x']
    Lm = b - a
    Ra = sum(kg * (b - x) for x, kg in loads) / Lm
    xs = np.linspace(a, b, 400)
    M = [Ra * (x - a) - sum(kg * (x - xi) for xi, kg in loads if xi < x) for x in xs]
    m_max = max(M)
    allow = min(289.5 * 4.0, 448.7 * 0.85 * 3.0) - 6.3 * (Lm ** 2 - 12.0 ** 2) / 8.0
    return {'total_kg': round(sum(kg for _, kg in loads), 1), 'max_moment_kgm': round(m_max, 0), 'allowable_moment_kgm_estimate': round(allow, 0),
            'utilisation': round(m_max / allow, 2), 'tower_kg_each_max': round(max(Ra, sum(kg for _, kg in loads) - Ra) + 6.3 * Lm / 2, 0),
            'basis': 'simple span between the tower centres, point loads: the cut\'s 3 picks as the repo derives them (on_bridge_kg, crane-cut rigging) + 4 blinders (9.7 kg each with clamp) shared over the picks + the panel at 2 points + 10 % cable. Allowable moment: the repo\'s H30V 12 m row (third points 289.5 kg x 4 m; centre 448.7 kg x 0.85 x 3 m; the lower) less the extra self-weight moment of 13 m (6.3 kg/m). An ESTIMATE: the 13 m row of the maker\'s table and the towers\' table are OWED.'}


def crane_study(L_res):
    cut = EPL_park()
    rows = [
        {'near_z': 4.8, 'what': 'as found (every photo)', 'cut': 'needs the stage goal post (Plan B)', 'stop': 'panel on the stage goal post',
         'look': 'the yellow bridge stays over the press, 16 m behind the DJ: scenery, the lasers pass 0.8 m under it', 'rigging': 'no crane load; 2 more towers (13 m span)',
         'cab_pipes': 'no tie-offs (towers guyed or ballasted)', 'sight': 'the bridge is not over the DJ: nothing hangs over the front rows', 'lasers': lsum(L_res['B1'])},
        {'near_z': 18.0, 'what': 'one grid line short', 'cut': 'not behind the DJ (the cut must hang in z 20.8-21.2: the repo\'s behind-the-DJ rule)', 'stop': 'needs a frame',
         'look': 'the bridge cuts the view between the DJ and the far half', 'rigging': 'the cut on towers anyway', 'cab_pipes': 'cab over the blower (x 5.8-8, 1.7 m)', 'sight': 'blocks the ash wall from the floor', 'lasers': None},
        {'near_z': 21.0, 'what': 'the design (repo park table: 0.68 m behind the step)', 'cut': 'hangs under it as designed (3 picks, bridles 26/42/119 deg)', 'stop': 'the panel hangs under its back girder (z 19.9)',
         'look': 'the yellow bridge frames the DJ, the cut under it, the ash wall in its shadow: the photo of the night', 'rigging': 'the crane carries ~%d kg (cut + panel + blinders + cable)' % round((sum(p['on_bridge_kg'] for p in cut['picks']) + PANEL['kg'] + 4 * 9.7) * 1.1),
         'cab_pipes': 'tie-off hr 0.20 m over pipe-rack-3 (LOW confidence: tape it)', 'sight': 'front row to the DJ passes under the cut (repo crowd table)', 'lasers': lsum(L_res['A1'])},
        {'near_z': 21.5, 'what': '0.5 m further', 'cut': 'FAILS: hung parts 0.18 m from the step (< 0.5 m rule)', 'stop': 'ok', 'look': 'as 21', 'rigging': 'as 21',
         'cab_pipes': 'as 21', 'sight': 'as 21', 'lasers': None},
        {'near_z': 24.0, 'what': 'over the DJ (the 09-29 idea)', 'cut': 'over the DJ, not behind (owner chose behind, 10-07)', 'stop': 'the panel would hang over the step',
         'look': 'rejected by the owner', 'rigging': '', 'cab_pipes': '', 'sight': '', 'lasers': None},
    ]
    far = [
        {'far_z': -22.2, 'what': 'as found', 'lasers_1_3': 'on the goal post at z -41.5 (2 towers + 12 m span)', 'note': 'the far beams pass 1.2 m under it'},
        {'far_z': -41.0, 'what': 'rolled 18.8 m toward the far gate', 'lasers_1_3': 'on its front girder: no goal post, nothing to build', 'note': 'brighter and more seen (placement study a: 74 % vs 65 %); needs it seen moving, inspected, locked out'},
    ]
    return {'near': rows, 'far': far, 'gp_stage': gp_stage_load(cut), 'gp_stage_what': GP_STAGE['what']}


def lsum(run):
    return {'pass': run['pass'], 'n': run['n'], 'min_margin_deg': run['min_margin_deg'], 'max_height_m': run['max_height_m']}


def EPL_park():
    """The cut's picks at z 21, from the repo's own stage-line tool (node scripts/rigbuild/stage-line.mjs --evaluate)."""
    import subprocess
    r = subprocess.run(['node', 'scripts/rigbuild/stage-line.mjs', '--evaluate'], cwd=A5.repo, capture_output=True, text=True, timeout=180)
    return json.loads(r.stdout)['truss']


# ------------------------------------------------------------------ the PA: complementary
PA = {
    'now': {'what': 'the beta\'s placeholders: 2 x (2 subs + 3 small line-array boxes) ground-stacked at x +-5.4 on the stage line (top 1.86 m)',
            'boxes': [('pa-now-l', (-5.4 - 0.67, -5.4 + 0.67), (0, 1.86), (23.78, 24.5)), ('pa-now-r', (5.4 - 0.67, 5.4 + 0.67), (0, 1.86), (23.78, 24.5))]},
    'v1': {'what': 'mains L/R: 6 small-format line-array boxes per side on a ground-stack frame on their own 2 subs, L at x -8.3 (outside the cut\'s low end at x -7.04, so it never hides the slash), R at x +6.6 (the drum tank at x 8 stops it going wider), z 24.9, array 1.1-2.6 m, toed in 12-15 deg; subs: 6 in a cardioid broadside line in front of the DJ (3 stacks of 2, one reversed per stack), x -3.0 / +0.13 / +3.2, 1.1 m high; the barrier moves to z 26.5 to keep a 1.25 m pit',
           'boxes': [('pa-v1-main-l', (-9.0, -7.6), (0, 2.6), (24.55, 25.25)), ('pa-v1-main-r', (5.9, 7.3), (0, 2.6), (24.55, 25.25)),
                     ('pa-v1-sub-1', (-3.67, -2.33), (0, 1.1), (24.54, 25.26)), ('pa-v1-sub-2', (-0.54, 0.80), (0, 1.1), (24.54, 25.26)),
                     ('pa-v1-sub-3', (2.53, 3.87), (0, 1.1), (24.54, 25.26))]},
}


def pa_model(which, base):
    ob = LV.Shifted(base)
    ob.boxes = [b for b in base.boxes if not b[1].startswith('pa-')]
    for bid, x, y, z in PA[which]['boxes']:
        bx = L.Box.aabb(bid, x, y, z, 'pa')
        ob.boxes.append((bx, bid, 'pa'))
    return ob


def pa_sightlines(base):
    cut = EPL_park()
    targets = {'the DJ\'s head': np.array([0.13, 0.4 + 1.75, 23.6]), 'the cut\'s low end (house left)': np.array([cut['ends'][0]['x_m'], cut['ends'][0]['bottom_chord_m'] - 0.4, 21.0]),
               'the cut\'s high end': np.array([cut['ends'][1]['x_m'], cut['ends'][1]['bottom_chord_m'] - 0.4, 21.0]), 'the ash wall': np.array([0.13, 6.7, PANEL['z'] + 0.06])}
    eyes = [e for e in L.EYES if e[2] >= 27.0]
    out = {}
    for which in ('now', 'v1'):
        ob = pa_model(which, base)
        res = {}
        for tn, T in targets.items():
            ok = blocked_pa = 0
            for e in eyes:
                v = T - e
                d = float(np.linalg.norm(v))
                h = ob.cast(e, v / d, 0.2, d - 0.3)
                ok += h[0] is None
                blocked_pa += (h[1] or '').startswith('pa-')
            res[tn] = {'seen_share': round(ok / len(eyes), 2), 'blocked_by_pa_share': round(blocked_pa / len(eyes), 2)}
        out[which] = res
    return out


def pa_design():
    V = 135000.0
    S = 10416 * 2 + 5458
    rows = []
    for a in (0.05, 0.10, 0.15):
        A = a * S + 600 * 0.5            # + ~600 people x 0.5 m2 (ASSUMED crowd absorption)
        rt = 0.161 * V / A
        rows.append({'alpha_mean': a, 'rt60_s': round(rt, 1), 'dc_m_Q10': round(0.057 * math.sqrt(10 * V / rt), 1), 'dc_m_Q20': round(0.057 * math.sqrt(20 * V / rt), 1)})
    return {
        'principles': [
            'Subs off the L/R mains into ONE cardioid broadside line across the front: no power alley (the comb-filter lobes two sub stacks 13 m apart throw down the floor), and the cardioid rear null keeps the low end off the stage, the DJ and the ash wall (the band behind and around the DJ quiet).',
            'Mains wider (L x -8.3, R x +6.6: the drum tank on house right) and higher (array 1.1-2.6 m on the sub frame, tilted down): the top boxes above the front rows\' heads, so the front-to-back level difference over the 22 m floor shrinks; outside the cut\'s ends so no stack hides the X (sightline table).',
            'No flying: the only flying points are the near crane (the laser beam stop and the cut: a PA there adds load and vibration to the stop) or the stage goal post (behind the DJ: the PA would radiate over the DJ and hide the ash wall). Ground-stack is the clean answer here.',
            'No delays: the floor is 22 m deep; with a directional line array the whole floor is inside the critical distance (table), so delays would add reverberant energy, not clarity. Held back: one delay pair on the z 36 columns at 4 m if the measured RT60 > 10 s makes the back half muddy.',
            'Aim at people, not at steel: every box\'s vertical coverage ends at the back of the floor (z 48); nothing aimed at the roof or the far gate. The entry door at z +53.8 is in front of the PA: keep it closed during the show (bass to the outside).'],
        'rt60': rows,
        'rt60_basis': 'Sabine RT60 = 0.161 V / A; V 135 000 m3, surfaces ~26 300 m2 (floor, roof, walls: hall.json) at a mean absorption 0.05-0.15 (concrete, steel, glass, corrugated deck: ASSUMED range), + the crowd. Critical distance Dc = 0.057 sqrt(Q V / RT60) (Davis & Patronis, Sound System Engineering, 3rd ed.). Measure RT60 on the visit (a balloon or a clap, phone app) to replace the range.',
        'spl': {'target': '100-103 dB(A) LAeq,15min at FOH, LCeq <= 115-118 dB(C)', 'capacity': 'design capacity 106 dB(A) LAeq + 6 dB headroom at FOH (20 m)',
                'basis': 'WHO Global Standard for Safe Listening Venues and Events (2022): 100 dB(A) LAeq,15min; the Dutch covenant on music levels (2014): 103 dB(A) LAeq,15min at the desk; a guideline, not Armenian law (none found)'},
        'classes': [
            {'what': 'mains: small/medium-format line array, 6 boxes per side, 100-110 deg horizontal, ground-stacked', 'examples': 'L-Acoustics KARA II, d&b audiotechnik V8/V12 (V-Series), Meyer Sound LEOPARD, RCF HDL 30-A'},
            {'what': 'subs: dual 18" or 21" bass-reflex/cardioid-capable, 6 units as a cardioid broadside line', 'examples': 'L-Acoustics KS28, d&b SL-GSUB / B22, Meyer 1100-LFC, RCF SUB 9006-AS'},
            {'what': 'alternative mains if no line array is available: point source, 2 per side', 'examples': 'L-Acoustics A15, d&b Y10P, Meyer ULTRA-X40'}],
        'boxes': '6 + 6 mains + 6 subs = 18 boxes (the beta had 4 subs + 6 tops = 10 boxes, placed by hand marks). Fewest that do the job: a smaller system is louder at the front and quieter at the back, not cheaper in level',
        'coverage_method': 'manufacturer prediction (Soundvision / ArrayCalc / MAPP class) by the system engineer of the rental: OWED with the real model; this page fixes the positions and the class, not the splay angles',
        'noise': 'nearest dwelling: distance and direction UNKNOWN (survey). Method: ISO 9613-2 outdoor propagation from the door/gate openings; the cardioid subs cut the rear (toward the stage end) by ~15-20 dB at 63 Hz (maker class figure, ESTIMATE); keep the entry door shut; measure LAeq/LCeq at the nearest house at 01:00. WHO night guideline 45 dB LAeq outside dwellings as a planning yardstick (not Armenian law).',
        'power_w': 4000}


# ------------------------------------------------------------------ concept, moments, arc, cue stack
CONCEPT = {
    'sentence': 'MOXIR is ash: the factory burned, we light what is left, and once a night the fire comes back.',
    'rules': ['Black is the main colour. Two layers at most; three only when the fire returns.',
              'Two colours: ash white and ember red. Nothing else, ever.',
              'Light comes from behind and from the depth, never at the crowd (the 4 blinders, 1-2 s, at the fire\'s return, are the one exception).',
              'Lines, not washes: one line, a silhouette, a column. Nothing moves unless the music moves it; fades are slow, cuts only on the drop.',
              'Hold back: the roof once an hour, the fire at most 3 times an hour, the blinders only in act 3.'],
    'remember': 'A black figure in front of a dark wall, and twelve lines of light coming out of 60 m of ruin to meet behind him.',
    'direction': 'from the far gate toward the crowd (back light, depth); the only front light is the blinders\' hit',
    'speed': 'slow: 10-60 s fades; the columns of fire fan over 16 bars; the machines breathe at 0.1 Hz; strobes <= 4 Hz and only at the peak',
}
MOMENTS = [
    {'id': 'one_line', 'title': 'One line', 'parts': {'cube6a': (ASH, 1.0)}, 'units': 'laser 6, one beam (6a), the cube drawing a single point (duty ~0.9)',
     'when': 'act 1, the first 20 minutes after the doors; returns once, at the very end', 'why': 'a single white line from the dark behind the press to the wall behind the DJ in an empty black hall: the first thing anyone sees, and it is almost nothing'},
    {'id': 'still_smoking', 'title': 'Still smoking', 'parts': {'still smoking': (EMBER, 0.10), 'far wall': (EMBER_DEEP, 0.15)}, 'units': '4 PL5403 inside the press and the machine line (ember 5-12 %, breathing 10 s), the mid smoke machine\'s slow low bursts drifting through them, the far wall ember 15 %',
     'when': 'act 1 under the one line; act 4 under ash falling', 'why': 'the machines glow from inside as if the fire never went out: the hall is alive before anything is lit'},
    {'id': 'columns_of_fire', 'title': 'Columns of fire', 'parts': {'columns of fire': (EMBER, 1.0), 'far columns': (EMBER_DEEP, 0.3), 'span columns': (EMBER_DEEP, 0.15)}, 'units': '6 UP-B380F standing in the far nave (x +-10; z -14, -30, -46), ember from the colour wheel, fanning +-8 deg over 16 bars; 8 PARs on the far nave columns at 30 %, 15 PARs on the side spans\' wall columns at 15 % (deep ember)',
     'when': 'act 2 from the first build; act 3 under the peak', 'why': '50 m of ruin behind the DJ suddenly has height: the audience looks through him into a burning hall'},
    {'id': 'the_black', 'title': 'The black', 'parts': {}, 'units': 'nothing (haze stays on); 3-5 s', 'when': 'before every drop where the fire returns, and before the roof',
     'why': 'the lasers are 100s of cd/m2 against a dark club\'s 0.01: the contrast is the epic. Darkness is a cue, written, not an accident'},
    {'id': 'fire_returns', 'title': 'The fire returns', 'parts': {'laser': (None, 1.0), 'fan': (ASH, 1.0), 'spine': (ASH, 1.0), 'columns of fire': (EMBER, 1.0), 'blinders': (ASH, 0.4), 'lightning': (ASH, 1.0)},
     'units': 'all 12 laser lines + the fan of 7 and the spine (ash) + the 6 columns of fire (ember) + 4 blinders at <= 40 % (1-2 s hits) + 4 strobes up into the far roof (<= 4 Hz): the only 3-layer moment',
     'when': 'act 3 only, on the drop, 16 bars, at most 3 times an hour; then the black', 'why': 'everything the night held back, at once, once: the fire burns again for 30 seconds and leaves ash'},
    {'id': 'the_roof', 'title': 'The roof, once an hour', 'parts': {'roof': (ASH, 1.0), 'side roof': (ASH, 0.6), 'arch': (ASH, 1.0)}, 'units': '8 UP-HK1915 up into the nave roof structure, full ash white, 8 bars; 4 BSW250 up into the side spans\' roofs beside the audience (60 %); the arch: 4 B380F at the column rows behind the floor crossing high over it (ash)',
     'when': 'once an hour (01:00, 02:00, 03:00, 04:00), out of the black, then gone', 'why': 'the bones of the roof appear for 15 seconds: the cathedral the factory was, then darkness again'},
]
LOOKS = [
    {'id': 'still_smoking', 'title': 'Still smoking', 'act': 1, 'parts': {'still smoking': (EMBER, 0.12), 'far wall': (EMBER_DEEP, 0.15)}},
    {'id': 'one_line', 'title': 'One line', 'act': 1, 'parts': {'cube6a': (ASH, 1.0)}},
    {'id': 'silhouette', 'title': 'The silhouette', 'act': 1, 'parts': {'curtain': (ASH, 1.0), 'x': (EMBER, 0.8), 'ash wall': (EMBER, 0.12), 'halo': (EMBER, 0.4)}},
    {'id': 'columns_of_fire', 'title': 'Columns of fire', 'act': 2, 'parts': {'columns of fire': (EMBER, 1.0), 'far columns': (EMBER_DEEP, 0.3), 'span columns': (EMBER_DEEP, 0.15)}},
    {'id': 'sparks', 'title': 'Sparks from the depth (the chase)', 'act': 2, 'parts': {'laser': (None, 1.0), 'curtain': (ASH_GREY, 0.3)}},
    {'id': 'the_roof', 'title': 'The roof, once an hour', 'act': 2, 'parts': {'roof': (ASH, 1.0), 'side roof': (ASH, 0.6), 'arch': (ASH, 1.0)}},
    {'id': 'fire_returns', 'title': 'The fire returns (the peak)', 'act': 3, 'parts': MOMENTS[4]['parts']},
    {'id': 'ash_falling', 'title': 'Ash falling (the breakdown)', 'act': 3, 'parts': {'spine': (ASH, 1.0), 'still smoking': (EMBER, 0.08)}},
    {'id': 'dawn', 'title': 'Dawn: one line returns', 'act': 4, 'parts': {'roof': (ASH_GREY, 0.35), 'side roof': (ASH_GREY, 0.25), 'cube6a': (ASH, 1.0)}},
]
ARC = [
    {'act': 1, 'name': 'Embers', 'set': 'doors and the warm-up (23:00-01:00, ASSUMED times)', 'use': ['still smoking', 'one line (20 min alone)', 'the silhouette at the first DJ change'],
     'hold': 'no columns, no laser chase, no roof, no fire, no blinders', 'layers': '1-2'},
    {'act': 2, 'name': 'The burnt hall', 'set': 'the build (01:00-02:30)', 'use': ['columns of fire appear at the first build', 'sparks: the chase one cube at a time (2, then 1+3 ... never all 12)', 'the roof at 01:00 and 02:00'],
     'hold': 'all 12 lines at once, the fan, the blinders, the strobes, the fire', 'layers': '2'},
    {'act': 3, 'name': 'The fire', 'set': 'the headliner, the peak (02:30-04:00)', 'use': ['the black before each drop', 'the fire returns (<= 3 times an hour, 16 bars)', 'ash falling in every breakdown', 'the full chase to all 12', 'the roof at 03:00'],
     'hold': 'never two fires in a row without a breakdown between', 'layers': '2, 3 only in the fire'},
    {'act': 4, 'name': 'Ash', 'set': 'the closing (04:00-06:00)', 'use': ['ash falling', 'the silhouette', 'still smoking', 'the roof at 04:00, then dawn: one line returns, the roof fades to grey'],
     'hold': 'the fire, the blinders and the strobes never come back', 'layers': '1-2'},
]
CONSOLE = {
    'assumed': 'a grandMA-style console (MA2/MA3 or MA onPC + a 2-port node): the rental list\'s UP-Q3L "MA lighting console" is unconfirmed (photo of its front + software version: survey). The owner\'s Art-Net Desk (Daslight-style, scenes) can run the same looks as 8 scenes + a blackout pad as a fallback: no effects engine, so the breathing and the fan become 2 recorded chases.',
    'faders': [('F1', 'still smoking', 'the 4 machine PARs; a sine dimmer effect 5-12 %, 10 s, free-running (never tempo-synced)'),
               ('F2', 'halo', 'ember, 0-40 %'), ('F3', 'curtain', 'ash white, the silhouette; ash grey 20-30 % under the chase'),
               ('F4', 'the X', 'ember'), ('F5', 'ash wall', 'the 4 grazers, ember 5-15 %'), ('F6', 'columns of fire', 'ember; fan effect +-8 deg (pan limits set in the desk: inward only), period 16 bars, BPM-synced'),
               ('F7', 'fan + spine', 'ash; the fan meeting point at 10 m over the DJ is a preset, not an effect'), ('F8', 'far columns + far wall', 'deep ember 15-30 %'),
               ('F9', 'the roof', 'ash white; PROTECTED: one GO per hour, out of the black, 8 bars, out'), ('F10', 'lasers', 'Art-Net to the 6 cubes: cue select (one line / chase step 1-5 / all 12); the master is the LSO\'s, not the operator\'s')],
    'buttons': [('B1', 'THE BLACK', 'everything to 0 in 0 s, haze stays; 3-5 s before a drop'), ('B2', 'THE FIRE', 'GO the peak look on the downbeat; auto-release after 16 bars into the black'),
                ('B3', 'BLINDER HIT', 'flash 1-2 s, capped at 40 % by a group master the operator cannot raise'), ('B4', 'LIGHTNING', 'the 4 far strobes, rate locked <= 4 Hz (HSE HSG195; Purple Guide)'),
                ('B5', 'ONE LINE', 'laser 6, beam 6a alone')],
    'pages': [('page 1 · act 1', 'F1 F2 F3 F4 F5 F10(one line) B1 B5'), ('page 2 · act 2', 'F6 F8 F10(chase steps) F9 B1'), ('page 3 · act 3', 'F6 F7 F10(all) B1 B2 B3 B4 + ash falling (F7 spine only + F1)'),
              ('page 4 · act 4', 'F1 F3 F9(dawn 35 %) F10(one line) B1')],
    'tempo': 'tap BPM into one speed master: the laser chase steps every 8 bars (at 132 BPM: 14.5 s), the columns\' fan 16 bars, the strobe never faster than 4 Hz whatever the BPM; the machines\' breathing stays free (it is the hall breathing, not the music)',
    'safety_in_desk': ['B380F pan/tilt limits set to the checked range (the columns fan inward only, 8 deg)', 'blinder group master capped at 40 %', 'strobe rate capped at 4 Hz',
                       'no laser zone or scan size on a fader: those are set in LaserOS by the LSO and locked', 'the hard E-stop is the LSO\'s, wired, not in the desk'],
}


# ------------------------------------------------------------------ power, running
DUTY = {'up-b380f': ('lamp on all night (a discharge lamp is not dimmed: the shutter closes)', 1.0),
        'up-yz31p': ('heater keeping temperature between bursts, ASSUMED', 0.3), 'ext-lc-ultra-mk2': ('mains adapter', 1.0)}


def power(U):
    W = dict(EPL.WATTS)
    W['ext-lc-ultra-mk2'] = 120          # ULTRA MK2 manual: 19 V DC, 120 W adapter (p. 9/10 spec table)
    W['up-sw3000b'] = 3000               # the rental list's own label: "Low-fog machine 3000W"
    conn = sum(W[u['type']] for u in U) + 6 * W['ext-lc-ultra-mk2']
    base = 0.0
    for u in U:
        t = u['type']
        if t in DUTY:
            base += W[t] * DUTY[t][1]
        elif t in ('up-pl5403', 'up-250bsw', 'up-hk1915'):
            base += 10.0                 # an LED fixture at 0 %: electronics + fans, ASSUMED 10 W
    base += 6 * 120 + 600                # the cubes + network, nodes, desk (ASSUMED 600 W)
    looks = []
    for lk in LOOKS:
        extra = 0.0
        for u in U:
            if u['part'] in lk['parts'] and u['type'] in ('up-pl5403', 'up-250bsw', 'up-hk1915', 'ext-blinder', 'ext-strobe'):
                lev = lk['parts'][u['part']][1]
                k = 0.5 if u['type'] == 'ext-strobe' else (0.3 if u['type'] == 'ext-blinder' else 1.0)    # strobe at <= 4 Hz, blinder 1-2 s hits: average draw ESTIMATE
                extra += W[u['type']] * lev * k
        looks.append({'look': lk['id'], 'running_w': round(base + extra)})
    pa = pa_design()['power_w']
    worst = max(l['running_w'] for l in looks)
    return {'connected_w': round(conn), 'base_w': round(base), 'looks': looks, 'worst_look_w': worst, 'pa_w': pa, 'foh_dj_w': 1500,
            'running_total_w': worst + pa + 1500, 'cap_w': 30000, 'ok': worst + pa + 1500 <= 30000,
            'supply': 'the factory\'s own 380 V 3-phase board (owner 10-08: no generator): running %.1f kW with the PA and FOH = about %d A per phase if balanced; ask for a 3-phase breaker of at least 40 A per phase (63 A gives headroom for the smoke machines\' warm-up and the discharge lamps\' inrush); connected %.1f kW lighting + %.1f kW PA; photograph the board today (breakers, phases, earth)' % (
                (worst + pa + 1500) / 1000, round((worst + pa + 1500) / 3 / 230), conn / 1000, pa / 1000),
            'watts_basis': 'fixtures.json (supply W where the maker gives it, else rated W); LaserCube 120 W from its manual; running = per-look levels x the duties above (ESTIMATE)'}


# ------------------------------------------------------------------ patch, circuits, network (minimal)
def patch(U):
    order = [('U1-A the cut', 1, 'NODE-STAGE', lambda u: u['part'] in ('curtain', 'x', 'ash wall', 'blinders')),
             ('U1-B the stage floor', 1, 'NODE-STAGE', lambda u: u['part'] in ('halo', 'fan', 'spine', 'still smoking') or (u['part'] in ('haze', 'low fog') and u['p'][2] > 0)),
             ('U2 the far half', 2, 'NODE-FAR', lambda u: u['part'] in ('columns of fire', 'far columns', 'lightning') or (u['part'] == 'far wall' and abs(u['p'][0]) < 12) or (u['part'] == 'haze' and u['p'][2] <= 0)),
             ('U3 the side spans', 3, 'NODE-FAR', lambda u: u['part'] == 'span columns' or (u['part'] == 'far wall' and abs(u['p'][0]) >= 12)),
             ('U4 the audience end', 4, 'NODE-STAGE', lambda u: u['part'] in ('arch', 'side roof')),
             (('U3 the roof (side spans)', 3) if any(u['part'] == 'roof' and abs(u['p'][0]) > 12 for u in U) else ('U2-B the roof (far nave)', 2)) + ('NODE-FAR', lambda u: u['part'] == 'roof')]
    nxt = collections.Counter()
    rows = []
    for name, uni, node, f in order:
        devs = 0
        for u in sorted([u for u in U if f(u) and u['type'] in EPL.FOOT], key=lambda u: (round(u['p'][2], 1), u['p'][0])):
            n = EPL.FOOT[u['type']]
            u['dmx'] = {'universe': uni, 'address': nxt[uni] + 1, 'footprint': n, 'branch': name, 'node': node}
            nxt[uni] += n
            devs += 1
        rows.append({'branch': name, 'universe': uni, 'node': node, 'devices': devs, 'ok': devs <= 32})
    left = [u['id'] for u in U if u['type'] in EPL.FOOT and 'dmx' not in u]
    assert not left, left
    return rows, dict(nxt)


def cubes_v1(pid, LZ):
    run = LZ[pid]
    out = []
    for n, (p, mount) in cube_places(pid).items():
        bs = [r for r in run['beams'] if r['cube'] == n]
        out.append({'n': n, 'id': 'rig-lasercube-cut-%02d' % n, 'type': 'ext-lc-ultra-mk2', 'p': [round(float(v), 3) for v in p], 'mount': mount,
                    'colour': CUBE_COLOUR[n], 'hex': HEX[CUBE_COLOUR[n]], 'ip': '192.168.1.%d' % (100 + n),
                    'artnet': {'universe': 10, 'address': 1 + 16 * (n - 1), 'footprint': 16}, 'beams': bs, 'power_w': 120,
                    'd': L.unit(np.mean([np.array(b['to']) - p for b in bs], axis=0))})
    return out


# ------------------------------------------------------------------ the pictures: elite as matplotlib can
def _blur(a, r):
    """3-pass box blur (approximates a Gaussian of sigma ~ r) along both axes; a: H x W x 3 float."""
    for _ in range(3):
        for ax in (0, 1):
            c = np.cumsum(np.pad(a, [(r + 1, r) if i == ax else (0, 0) for i in range(3)], mode='edge'), axis=ax)
            if ax == 0:
                a = (c[2 * r + 1:] - c[:-2 * r - 1]) / (2 * r + 1)
            else:
                a = (c[:, 2 * r + 1:] - c[:, :-2 * r - 1]) / (2 * r + 1)
    return a


def _draw(items, W, H):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.collections import PolyCollection
    fig = plt.figure(figsize=(W / 100, H / 100), dpi=100)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, W)
    ax.set_ylim(H, 0)
    ax.set_facecolor('#000000')
    fig.patch.set_facecolor('#000000')
    ax.set_axis_off()
    its = sorted(items, key=lambda it: -it[0])
    ax.add_collection(PolyCollection([it[1] for it in its], facecolors=[it[2] for it in its], edgecolors=[it[3] for it in its], linewidths=[it[4] for it in its], antialiaseds=True))
    fig.canvas.draw()
    a = np.asarray(fig.canvas.buffer_rgba())[:, :, :3].astype(np.float32) / 255.0
    plt.close(fig)
    return a


def render_elite(fx, lit, path, title, sub, eye=(0.0, 1.6, 38.0), look=(0.0, 6.2, -20.0), W=1600, H=900, vfov=64.0):
    from PIL import Image, ImageDraw, ImageFont
    cam = L.Camera(np.array(eye, float), np.array(look, float), vfov, W, H)
    base = []
    D.hall_items(cam, base, fade=0.30)
    for b in L.CROWD:
        if b.p[2] < eye[2] - 1.0:
            L.add_box(base, cam, b, '#010101', '#0a0c0e', 1, lw=0.4)
    dots = []
    for f in fx:
        c = cam.cam(f['p'])
        if c[2] > L.NEAR:
            sp = cam.scr(c)
            r = max(0.10 * cam.F / c[2], 1.2)
            ang = np.linspace(0, 2 * np.pi, 10)
            dots.append((float(np.linalg.norm(f['p'] - cam.E)) - 0.2, np.stack([sp[0] + r * np.cos(ang), sp[1] + r * np.sin(ang)], 1), L.rgba('#202326', 1.0), (0, 0, 0, 0), 0))
    lights = []
    for f in fx:
        if f['id'] in lit:
            D.fixture_items(lights, cam, f, True)
    dark = _draw(base + dots, W, H)
    full = _draw(base + dots + lights, W, H)
    E = np.clip(full - dark, 0, None)
    E = _blur(E, 1) * 0.6 + E * 0.4                          # beam softness
    glow = _blur(E, 6) * 0.9 + _blur(E, 22) * 0.7 + _blur(E, 60) * 0.35
    img = dark * 0.85 + E * 1.35 + glow
    img = 1.0 - np.exp(-1.6 * img)                            # filmic shoulder
    yy, xx = np.mgrid[0:H, 0:W]
    v = 1.0 - 0.55 * (((xx - W / 2) / (W / 2)) ** 2 + ((yy - H * 0.45) / (H * 0.62)) ** 2)
    img *= np.clip(v, 0.25, 1.0)[:, :, None]
    img = img ** 1.08                                         # crush the blacks a touch
    im = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8))
    canvas = Image.new('RGB', (W, H + 84), (5, 6, 7))
    canvas.paste(im, (0, 84))
    d = ImageDraw.Draw(canvas)
    try:
        fb = ImageFont.truetype('/usr/share/fonts/TTF/DejaVuSansMono-Bold.ttf', 22)
        fs = ImageFont.truetype('/usr/share/fonts/TTF/DejaVuSansMono.ttf', 13)
    except OSError:
        fb = fs = ImageFont.load_default()
    d.text((18, 14), title, fill=(227, 230, 234), font=fb)
    d.text((18, 50), sub, fill=(150, 156, 163), font=fs)
    canvas.save(path)
    return path


def wait_cool(limit=80, back=75):
    """The machine's rule: over 85 C, wait. Pause before each heavy step while the package is over `limit`, until `back`."""
    import subprocess, time
    def t():
        try:
            o = subprocess.run(['sensors'], capture_output=True, text=True, timeout=10).stdout
            return max(float(l.split('+')[1].split('°')[0]) for l in o.splitlines() if l.startswith('Package'))
        except Exception:
            return 0.0
    if t() > limit:
        while t() > back:
            time.sleep(10)


def render_set(U, LZ, pid, od):
    use_model(MODELS[pid])
    for key in (('v1', pid),):
        for fid, a in EP.RESO.get(key, {}).items():
            D.RES[fid] = a
    lasers = []
    run = LZ[pid]
    for b, r in zip(run['_bs'], run['_res']):
        fid = 'v1-' + b['id']
        axis = r['_rays'][len(r['_rays']) // 2]                     # the beam itself: the axis, not the +-0.8 deg test field
        D.RES[fid] = {'_rays': [dict(axis)] * 5}
        lasers.append({'id': fid, 'kind': 'laser', 'p': b['p'], 'd': b['d'], 'colour': b['colour'], 'groupName': 'lasers', 'spare': False, 'beam': b['id']})
    base_fx = [u for u in U if u.get('d') is not None and u['kind'] in ('par', 'beam', 'wash', 'spot')]
    pngs = {}
    only = [x for x in os.environ.get('MOXIR_ONLY_LOOKS', '').split(',') if x]
    for lk in LOOKS:
        if only and lk['id'] not in only:
            q = os.path.join(od, 'v1-look-%s.png' % lk['id'])
            if os.path.exists(q):
                pngs[lk['id']] = q
                continue
        wait_cool()
        lit, fx = set(), []
        for u in base_fx:
            if u['part'] in lk['parts']:
                c, lev = lk['parts'][u['part']]
                fx.append(dict(u, colour=EPL.dim(c, lev)))
                lit.add(u['id'])
            else:
                fx.append(dict(u, colour='#202326'))
        for f in lasers:
            if 'laser' in lk['parts'] or ('cube6a' in lk['parts'] and f['beam'] == '6a'):
                fx.append(f)
                lit.add(f['id'])
        layers = sorted({LAYER_OF(p) for p in lk['parts']})
        p = os.path.join(od, 'v1-look-%s.png' % lk['id'])
        render_elite(fx, lit, p, 'MOXIR v1.0 · %s' % lk['title'], 'act %d · %s · from the centre of the dance floor, eye 1.6 m, z 38 · plan %s · a sketch from the hall model\'s triangles, not a render' % (
            lk['act'], ' + '.join(layers) if layers else 'black', pid))
        pngs[lk['id']] = p
    return pngs


def LAYER_OF(part):
    return {'cube6a': 'lines', 'laser': 'lines', 'curtain': 'the cut', 'x': 'the cut', 'ash wall': 'the cut', 'halo': 'the cut', 'still smoking': 'machines',
            'far wall': 'the hall', 'far columns': 'the hall', 'roof': 'the hall', 'span columns': 'the hall', 'side roof': 'the hall',
            'columns of fire': 'beams', 'fan': 'beams', 'spine': 'beams', 'arch': 'beams',
            'blinders': 'flash', 'lightning': 'flash'}[part]


# ------------------------------------------------------------------ the artists' route (owner 10-08: the SE far gate is the artists' entrance)
ROUTE = [(0.0, -53.8), (0.0, -47.5), (-3.0, -45.0), (-3.0, -12.0), (-3.0, -6.0), (-4.5, 0.0), (-4.5, 15.0), (-2.6, 20.6)]
ROUTE_LIGHT = '8 battery LED step markers (warm, ~5 W, ~5-10 lux on the floor, ASSUMED class), one every ~10 m, plus glow tape on both edges of a 2 m wide lane; never on a lighting circuit or in a look'


def route_check(U, L_runs):
    """The artists' route from the SE gate to the stage: the lowest laser line over it (every beam, the recommended and
    the fallback plan) and the nearest floor unit to its centre line."""
    pts = []
    for (x0, z0), (x1, z1) in zip(ROUTE[:-1], ROUTE[1:]):
        n = max(2, int(math.hypot(x1 - x0, z1 - z0) / 0.5))
        pts += [(x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n) for k in range(n)]
    P = np.array(pts)
    low = {}
    for pid in (REC_PLAN, FALLBACK_PLAN):
        lo = 99.0
        for b in L_runs[pid]['_bs']:
            for t in np.linspace(0, float(np.linalg.norm(b['to'] - b['p'])), 300):
                q = b['p'] + b['d'] * t
                if np.min(np.hypot(P[:, 0] - q[0], P[:, 1] - q[2])) <= 1.5:
                    lo = min(lo, float(q[1]))
        low[pid] = round(lo, 2)
    near = min(((float(np.min(np.hypot(P[:, 0] - u['p'][0], P[:, 1] - u['p'][2]))), u['id']) for u in U if u['p'][1] < 2.0), key=lambda x: x[0])   # floor units (hung ones are over head height)
    tower = float(np.min(np.hypot(P[:, 0] - 0.26, P[:, 1] + 9.23)))
    length = sum(math.hypot(x1 - x0, z1 - z0) for (x0, z0), (x1, z1) in zip(ROUTE[:-1], ROUTE[1:]))
    return {'route': ROUTE, 'length_m': round(length, 1), 'lowest_laser_over_route_m': low, 'nearest_floor_unit_m': round(near[0], 2), 'nearest_unit': near[1],
            'tower6_m': round(tower, 2), 'light': ROUTE_LIGHT, 'width_m': 2.0,
            'rule': 'every laser line is >= 5 m up everywhere (the lowest is cubes 4/5 at their 5.0 m mounts, over the side of the nave); over this route the lowest is the figure here. The route keeps 1 m from every floor unit and passes the press on its house-left side; a steward walks the artist in during laser cues.'}


def foh_check(U, cubes, LZ):
    """From the FOH desk (owner 10-08: back centre of the floor, on a riser): does the operator / Dima see the DJ, the cut,
    the ash wall and every cube; how far over the heads in front; the cable runs and the E-stop loop."""
    ob = MODELS[REC_PLAN]
    eye = np.array([FOH['p'][0], FOH['eye_m'], FOH['p'][2]])
    cut = EPL_park()
    tg = {"the DJ's head": [0.13, 2.15, 23.6], "the cut's low end": [cut['ends'][0]['x_m'], cut['ends'][0]['bottom_chord_m'] - 0.4, 21.0],
          "the cut's high end": [cut['ends'][1]['x_m'], cut['ends'][1]['bottom_chord_m'] - 0.4, 21.0], 'the ash wall (its centre)': [0.13, 6.7, PANEL['z'] + 0.06]}
    for c in cubes:
        tg['laser %d' % c['n']] = c['p']
    seen = {}
    for k, T in tg.items():
        T = np.asarray(T, float)
        v = T - eye
        d_ = float(np.linalg.norm(v))
        h = ob.cast(eye, v / d_, 0.3, d_ - 0.3)
        seen[k] = {'seen': h[0] is None, 'blocked_by': h[1]}
    c_front = round(((eye[1] - 1.75) * 0.5 / (FOH['p'][2] - 26.3)) * 1000)
    beams_seen, union = {}, {}
    spot = np.array([SPOTTER[0], 1.7, SPOTTER[1]])
    for b in LZ[REC_PLAN]['_bs']:
        a_, u_ = [], []
        for t in np.linspace(1.0, float(np.linalg.norm(b['to'] - b['p'])) - 0.5, 15):
            q = b['p'] + b['d'] * t
            hit = []
            for e_ in (eye, spot):
                v = q - e_
                d_ = float(np.linalg.norm(v))
                hit.append(ob.cast(e_, v / d_, 0.3, d_ - 0.3)[0] is None)
            a_.append(hit[0])
            u_.append(hit[0] or hit[1])
        beams_seen[b['id']] = round(float(np.mean(a_)), 2)
        union[b['id']] = round(float(np.mean(u_)), 2)
    E = [dict(c, p=np.array(c['p'], float)) for c in cubes]
    _, loop = EPL.chain(np.array(FOH['p'], float), [{'p': np.array([SPOTTER[0], 0.0, SPOTTER[1]])}] + E)
    return {'what': FOH['what'], 'eye_m': FOH['eye_m'], 'sees': seen, 'beams_seen': beams_seen, 'beams_seen_with_spotter': union, 'spotter': SPOTTER,
            'spotter_why': 'from the desk the ash wall, the cut and the press crown hide part of laser 6 (6a: %d %% seen) and cube 2\'s body; raising the desk does not help (tested 2.2-3.4 m: the crane girders and the wall hide more). A spotter at x %g, z %g (house left behind the stage, beside the artists\' lane) with a SECOND E-stop on the same interlock loop sees the rest: FOH + spotter see every beam\'s whole path' % (round(100 * beams_seen['6a']), SPOTTER[0], SPOTTER[1]),
            'over_front_row_mm': c_front, 'estop_loop_m': loop,
            'estop': 'the six RJ45 interlock ports daisy-chained (In -> Through) from a hard-wired mushroom E-stop at FOH (Dima) through a second E-stop at the spotter, then the cubes; one Cat5e/Cat6 run of %d m (+10 %% slack, floor + rises), a terminator in the last cube; tested before doors and before every set (either button stops all six)' % loop}


# ------------------------------------------------------------------ measure today
MEASURE_TODAY = [
    ('THE CRANES FIRST: see the near crane MOVE (to z 21) and the far crane (to z -41) with the venue\'s operator; photograph each rating plate (SWL, year), the inspection plate / the last inspection record, the controls; write the operator\'s name and phone', 'both cranes, the cab or pendant', 'photo + name', 'yes/no + SWL + date + name', 'epic_crane_move'),
    ('The artists\' route: photograph the SE far gate (the artists\' entrance) and the walk from it to the stage along the house-left side of the nave (x -3 to -5.5): floor, thresholds, anything in the way, where a dim step light can stand', 'from the SE gate to behind the stage', 'photo + paces', 'free / not', 'epic_artists_route'),
    ('The cranes again: the venue says it moves them and has an operator (owner 10-08): still SEE each move, photograph the inspection paper, write the operator\'s name; agree who keeps the keys during the show', 'the cab / the pendant', 'photo + name', 'paper + name', 'epic_crane_paper'),
    ('Lock-out: can each crane be de-energised and locked (LOTO) at its park, the travel brakes hold, rail clamps or chocks available?', 'the crane\'s isolator', 'ask + photo', 'yes/no', 'epic_crane_loto'),
    ('The pendant lamps / cables / hooks over the nave at 7-9 m: the lowest point of each from z -42 to z +21 (every laser beam now runs at 5.0-7.2 m: any object below 7.6 m in a beam\'s 1 m tube is a no-go)', 'the nave floor, a laser meter up', 'laser', '±0.05 m', 'epic_pendants'),
    ('The near crane\'s girder underside (ASSUMED 7.95 m), its cab side and cab bottom', 'under the bridge', 'laser', '±0.05 m', 'epic_near_girder'),
    ('The press crown top (ASSUMED 5.6 m), pipe-rack-3 top at z 18-24 (ASSUMED 4.5 m), the roller conveyor\'s x edge (ASSUMED 3.6 m), the runway handrail heights', 'nave', 'laser', '±0.05 m', 'epic_assumed_heights'),
    ('The 6 LaserCubes: each label (6 W or 10 W), the power bricks; the hall temperature at night (the cubes need 10-40 °C)', 'wherever the cubes are; a thermometer', 'photo + °C', 'W + °C', 'epic_cubes_label_temp'),
    ('Ladders and stairs to the runways and the crane walkways: lockable? (no one may stand near a beam)', 'both runway rows', 'photo', 'yes/no + how many', 'epic_runway_access'),
    ('Power: the factory\'s own 380 V board (owner 10-08: no generator): photograph the board: breaker sizes, phases, the earth; where it is (cable to the stage); who is the electrician', 'the main board', 'photo + ask', 'A per phase + earth + name', 'epic_power_supply'),
    ('The sound: get Poligraf\'s sound list (models, count, amps / processor: their price list we hold is lighting only); a photo of each speaker\'s model label; can the barrier move to z 26.5', 'Poligraf + the PA store', 'list + photo', 'model + count', 'epic_pa_label'),
    ('Reverberation: one balloon pop or a hand clap at the DJ place, recorded on a phone at z 38 (RT60)', 'the DJ place / the floor', 'phone', 's', 'epic_rt60'),
    ('Smoke / fire detection: what system, which zones, can it be isolated for the night, who decides (fire watch)', 'ask; photo the detectors', 'photo + ask', 'yes/no + who', 'epic_smoke_detection'),
    ('Smoke: if one of the smoke machines is on site, a 3 s burst and watch a torch beam across the nave for 3 min (how long a line holds); are the gates and side openings closable (air changes)?', 'nave', 'phone video', 'minutes', 'epic_haze_test'),
    ('FOH: stand at the back of the dance floor, centre (z 46-48), at 2.2 m eye height (on something 0.6 m high): photo toward the stage; do you see the DJ, the truss, the place of the ash wall, the far end?', 'back centre of the floor', 'photo', 'yes/no', 'epic_foh'),
    ('The far goal post / Plan B stage goal post footprints: floor flat and free at z -41.5 (x -6.5..6.5) and z 20.5 (x -8.3..5.7); the right tower 0.1 m from the conveyor and the blower', 'both places', 'laser + photo', '±0.1 m', 'epic_towers_floor'),
    ('The far nave floor for the 6 columns of fire (x ±10; z -14, -30, -46), the 4 strobes (x ±8; z -18, -38), the 4 fans (x ±13; z -20, -38)', 'far nave', 'photo', 'free / not', 'epic_far_floor'),
    ('Inside the press and the machine line: a place for 4 PARs out of reach (still smoking)', 'the press, the machine line', 'photo', 'yes/no', 'epic_inside_machines'),
    ('OPEN (owner 10-08: unknown): the crowd size; the promoter\'s safety lead (name, phone); the usable exits and their widths; the nearest house (distance, direction). The white bags behind the DJ: moved before the show (owner 10-08): who moves them, when', 'ask + walk', 'photo + m', 'names + m', 'epic_crowd_noise'),
]
SEVEN_ASSUMED = [('the near crane\'s girder underside', '7.95 m (the far crane\'s)'), ('the near crane\'s cab side / bottom', 'house right, 5.85 m'),
                 ('the pipe racks\' heights (pipe-rack-3)', '4.1-4.5 m'), ('the roller conveyor\'s x edge', '3.6 m (±1 m)'), ('the press crown top', '5.6 m (±20 %)'),
                 ('the LaserCubes\' wattage', '6 W for brightness, 10 W for safety (label unread)'), ('the hall temperature at night', '0-5 °C (October nights at ~1 650 m: measure)')]
TIMELINE = [('10-08', 'the visit: the cranes moved or not, the pendants, the power, the PA, the 7 ASSUMED values'), ('10-09', 'decide Plan A or B; order towers, the panel, nodes, distro, barriers, blinders/strobes/hazers/fans'),
            ('10-11/12', 'fixture test day at the rental house (the real DMX modes of PL5403, B380F, HK1915, 250BSW); laser bench test with the interlock loop and the E-stop'),
            ('10-13', 'patch, looks and cue stack in the console (or the visualiser)'), ('10-15', 'power and rigging (LOTO if the cranes)'),
            ('10-16', 'lights, lasers, PA; night: focus, laser alignment in the dark, the LSO walk, a run-through of the 4 acts'), ('10-17', 'the show'), ('10-18', 'out')]
SPOTTER = (-9.0, 12.0)     # the laser spotter with the second E-stop (chosen by the engine: FOH + here see every beam whole)
FOH = {'p': [0.0, 0.0, 47.0], 'riser_m': 0.6, 'eye_m': 2.2, 'what': 'FOH at the back of the dance floor, centre (owner 10-08: ~z 46-48, on a riser): a 3 x 2 m riser 0.6 m high (ASSUMED height), the desk, the laser E-stop (Dima)'}
CREW = ['production manager', 'lighting designer / operator', 'laser operator + E-stop: Dima (owner 10-08)', 'laser spotter + the second E-stop (house left behind the stage, x -9 z 12)', 'laser safety officer named on the permit (if not Dima)', 'lead rigger', 'rigger',
        'electrician', 'stagehand 1', 'stagehand 2', 'stagehand 3', 'stagehand 4', 'PA system engineer', 'PA tech 1', 'PA tech 2', 'stewards lead (promoter)', 'runner']


# ------------------------------------------------------------------ the pass
def build():
    sig = haze_plan()
    sigmas = (sig['design_sigma'], 0.02)
    LZ = {pid: run_lasers(pid, sigmas) for pid in PLANS}
    use_model(MODELS[REC_PLAN])
    # the roof: side spans (his paint) or the far nave, by what the floor sees
    roof_cmp = {}
    for where in ('spans', 'nave'):
        U0 = build_units(where)
        rr = EP.check_fixtures([u for u in U0 if u['part'] == 'roof'], ('roofcmp', where))
        roof_cmp[where] = {'seen': round(float(np.mean([r['seen'] for r in rr])), 2), 'blocked': sum(r['blocked_pct'] > 0 for r in rr)}
    roof_where = 'nave' if roof_cmp['nave']['seen'] > roof_cmp['spans']['seen'] and roof_cmp['nave']['blocked'] == 0 else 'spans'
    U = build_units(roof_where)
    checks = {}
    for pid in (REC_PLAN, FALLBACK_PLAN):
        rows, erows = check_units(U, pid)
        checks[pid] = {'by_part': glare_by_part(U, rows), 'fan_extreme_blocked': [r['id'] for r in erows if r['blocked_pct'] > 0], 'rows': rows}
    use_model(MODELS[REC_PLAN])
    bl = blinder_front_row(U)
    prow, used = patch(U)
    cubes = cubes_v1(REC_PLAN, LZ)
    units_for_power = list(U)
    pw = power(U)
    circ_units = [dict(u) for u in U]
    EPL.WATTS['up-sw3000b'] = 3000
    EPL.WATTS['ext-lc-ultra-mk2'] = 120
    for u in circ_units:
        u.setdefault('part', 'lamp')
    circ, ph = EPL.circuits([dict(u, part=('smoke' if u['part'] in ('haze', 'low fog') else u['part'])) for u in circ_units], cubes)
    cid = {x: c['circuit'] for c in circ for x in c['units']}
    for u in U:
        u['circuit'] = cid.get(u['id'])
    for c in cubes:
        c['circuit'] = cid.get(c['id'])
    EPL.SITES['FOH'] = (FOH['p'][0], 0.0, FOH['p'][2], FOH['what'])
    EPL.SITES['SW-FOH'] = (FOH['p'][0], 0.0, FOH['p'][2], 'switch at the desk')
    net = EPL.network(cubes)
    net['links'] = [l for l in net['links'] if 'NODE-LEFT' not in str(l['to']) and 'NODE-RIGHT' not in str(l['to'])]
    net['ips'] = [x for x in net['ips'] if 'NODE-LEFT' not in x['what'] and 'NODE-RIGHT' not in x['what']]
    cs = crane_study(LZ)
    pa = pa_design()
    pa['sightlines'] = pa_sightlines(MODELS[REC_PLAN])
    nh = not_hung(U)
    route = route_check(U, LZ)
    foh = foh_check(U, cubes, LZ)
    out = {'artists_route': route, 'foh': foh, 'concept': CONCEPT, 'moments': MOMENTS, 'looks': [{k: v for k, v in lk.items()} for lk in LOOKS], 'arc': ARC, 'console': CONSOLE,
           'plans': {p: dict(PLANS[p], lasers={k: v for k, v in LZ[p].items() if not k.startswith('_')}) for p in PLANS}, 'recommended': REC_PLAN, 'fallback': FALLBACK_PLAN,
           'panel': PANEL, 'diffuse_nhz_m': diffuse_nhz(), 'haze': sig, 'roof_choice': {'where': roof_where, 'compare': roof_cmp},
           'checks': {p: {'by_part': c['by_part'], 'fan_extreme_blocked': c['fan_extreme_blocked']} for p, c in checks.items()},
           'blinders': bl, 'patch': prow, 'slots': used, 'power': pw, 'circuits': circ, 'phases': ph, 'network': net, 'crane': cs, 'pa': pa,
           'not_hung': nh, 'n_units': len(U) + 6, 'measure_today': MEASURE_TODAY, 'seven_assumed': SEVEN_ASSUMED, 'timeline': TIMELINE, 'crew': CREW,
           'nohd': LV.nohd()}
    return out, U, LZ, cubes


# ------------------------------------------------------------------ the plan and the section (v1.0)
LAYER_COL = {'lines': '#f5f2ea', 'the cut': '#ffb08a', 'machines': '#ff6a3a', 'the hall': '#c4553a', 'beams': '#ffd9c8', 'flash': '#e0ff4f', 'air': '#7f9cff', 'pa': '#6fa8ff'}


def fig_plan_v1(U, cubes, out, path):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.patches import Rectangle
    fig = plt.figure(figsize=(16.0, 15.0), dpi=100)
    fig.patch.set_facecolor(D.BG)
    ax = fig.add_axes([0.04, 0.03, 0.62, 0.88])
    D.plan_hall(ax)
    for t in list(ax.texts):
        if t.get_text().startswith('crane z'):
            t.remove()
    c0 = G['cranes'][0]
    ax.add_patch(Rectangle((-11.35, -22.2 - 1.45), 22.7, 2.9, fc='none', ec='#c9a200', ls='--', lw=0.8, zorder=4))
    ax.text(-11.2, -25.2, 'far crane as found (z -22.2): rolls away', color='#c9a200', fontsize=7)
    for dz in c0['girders_dz_m']:
        ax.add_patch(Rectangle((-11.35, -41.0 + dz - 0.35), 22.7, 0.7, fc='#c9a200', alpha=0.75, zorder=4))
    ax.text(-11.2, -43.4, 'FAR CRANE at z -41 carries lasers 1-3 (Plan A)', color='#c9a200', fontsize=7.5, fontweight='bold')
    ax.text(-11.2, 18.2, 'NEAR CRANE at z 21: the cut + the ash wall (Plan A)', color='#c9a200', fontsize=7.5, fontweight='bold')
    ax.add_patch(Rectangle((PANEL['x'][0], PANEL['z'] - 0.12), PANEL['x'][1] - PANEL['x'][0], 0.24, fc='#000', ec='#f5f2ea', lw=1.0, zorder=9))
    run_beams = out['plans'][REC_PLAN]['lasers']['beams']
    for b in run_beams:
        ax.plot([b['from'][0], b['to'][0]], [b['from'][2], b['to'][2]], color=HEX[b['colour']], lw=0.8, alpha=0.9, zorder=7)
    for c in cubes:
        ax.plot(c['p'][0], c['p'][2], marker='^', ms=10, mfc=c['hex'], mec='#000', zorder=10)
        ax.text(c['p'][0] + 0.8, c['p'][2] + 0.5, str(c['n']), color='#fff', fontsize=11, fontweight='bold', zorder=11)
    mk = {'par': 'o', 'beam': 'D', 'wash': 's', 'spot': '*', 'haze': 'h', 'smoke': 'h', 'fan': 'P'}
    for u in U:
        lay = 'air' if u['layer'] == 'air' else LAYER_OF(u['part']) if u['part'] in ('curtain', 'x', 'ash wall', 'halo', 'still smoking', 'far wall', 'far columns', 'roof', 'span columns', 'side roof', 'arch', 'columns of fire', 'fan', 'spine', 'blinders', 'lightning') else 'air'
        c = LAYER_COL[lay]
        ax.plot(u['p'][0], u['p'][2], marker=mk.get(u['kind'], 'o'), ms=6, mfc=c if u['status'] == 'used' else 'none', mec=c if u['status'] != 'used' else '#000', mew=1.0, zorder=8)
    for bid, x, y, z in PA['v1']['boxes']:
        ax.add_patch(Rectangle((x[0], z[0]), x[1] - x[0], z[1] - z[0], fc=LAYER_COL['pa'], ec='none', alpha=0.85, zorder=8))
    ax.plot([q[0] for q in ROUTE], [q[1] for q in ROUTE], color='#9c978d', lw=2.0, ls=(0, (4, 3)), zorder=6)
    D_tag(ax, -16.5, 8.0, 'artists\' route (SE gate → stage)', '#9c978d')
    ax.plot(SPOTTER[0], SPOTTER[1], marker='X', ms=10, mfc='#ffb36b', mec='#000', zorder=11)
    D_tag(ax, -24.0, 13.5, 'laser spotter + E-stop 2', '#ffb36b')
    ax.add_patch(Rectangle((-1.5, 46.0), 3.0, 2.0, fc='#ffb36b', ec='none', alpha=0.85, zorder=9))
    D_tag(ax, 2.0, 49.5, 'FOH (desk, Dima + E-stop 1)', '#ffb36b')
    ax.plot([-9.6, 7.9], [26.5, 26.5], color='#8a929b', lw=1.2, zorder=8)
    for t, x, z, c in (('the ash wall (beam-stop panel) z 20.2', 4.0, 16.6, '#f5f2ea'), ('PA: subs (cardioid line) + mains L/R', 8.0, 25.4, LAYER_COL['pa']),
                       ('barrier z 26.5', 7.6, 27.6, '#8a929b'), ('columns of fire (6)', -27.0, -30.0, LAYER_COL['beams']), ('the roof (8, held back)', 13.0, -33.0, LAYER_COL['the hall']),
                       ('lightning (4, held back)', 13.0, -18.0, LAYER_COL['flash']), ('still smoking (inside the press)', -20.0, 3.0, LAYER_COL['machines']),
                       ('far wall + far columns', 13.0, -51.0, LAYER_COL['the hall']), ('smoke machines', -27.0, -40.0, LAYER_COL['air']), ('laser 6 tower', 2.0, -7.5, '#f5f2ea')):
        D_tag(ax, x, z, t, c)
    lx = fig.add_axes([0.68, 0.40, 0.30, 0.51])
    lx.set_axis_off()
    lx.set_xlim(0, 1)
    lx.set_ylim(0, 1)
    lx.text(0, 0.99, 'MOXIR v1.0 · minimal: %d units hung' % (len([u for u in U if u['kind'] != 'fan']) + 6), color=D.FG, fontsize=10, fontweight='bold', family='DejaVu Sans Mono', va='top')
    y = 0.93
    for lay, txt in (('lines', '6 LaserCubes, 12 lines onto one ash wall'), ('the cut', 'the cut: curtain 7, X 6, ash-wall grazers 4, halo 2'), ('machines', 'still smoking: 4 PARs inside the machines'),
                     ('beams', 'fan 5 + spine 1 behind the DJ; 6 columns of fire'), ('the hall', 'far columns 4, far wall 4, the roof 8'), ('flash', '4 blinders on the cut, 4 strobes in the far roof'),
                     ('air', '4 smoke machines (no hazer: owner 10-08)'), ('pa', 'PA: 6 + 6 mains, 6 subs')):
        lx.plot(0.03, y - 0.012, marker='s', ms=9, mfc=LAYER_COL[lay], mec='#000')
        lx.text(0.09, y, txt, color=D.FG, fontsize=8.2, family='DejaVu Sans Mono', va='top')
        y -= 0.055
    lx.text(0.0, y - 0.01, 'filled = used most of the night\nring = held back (one moment)\nNOT HUNG: %d units of the order\n(none drawn)' % sum(r['not_hung'] for r in out['not_hung'] if r['code'] not in ('UP-LA40WF', 'UP-Q108S', 'UP-YH600F')),
            color=D.DIM, fontsize=8, family='DejaVu Sans Mono', va='top')
    fig.text(0.04, 0.975, 'MOXIR v1.0 from above: Plan A (both cranes moved). Plan B: the same units, the cranes stay, two goal posts', color=D.FG, fontsize=13, fontweight='bold', family='DejaVu Sans Mono', va='top')
    fig.text(0.04, 0.952, 'far gate at the top; every laser line ends on the ash wall behind the DJ; the PA re-placed (subs in one cardioid line, mains wider and higher)', color=D.DIM, fontsize=8.6, family='DejaVu Sans Mono', va='top')
    fig.savefig(path, facecolor=D.BG)
    plt.close(fig)
    return path


def D_tag(ax, x, z, t, c):
    ax.text(x, z, t, color=c, fontsize=7.6, fontweight='bold', family='DejaVu Sans Mono', zorder=12, bbox=dict(boxstyle='square,pad=0.2', fc=D.BG, ec='none', alpha=0.8))


def fig_section_v1(U, cubes, out, path):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.patches import Rectangle
    fig = plt.figure(figsize=(18.0, 6.2), dpi=100)
    fig.patch.set_facecolor(D.BG)
    ax = fig.add_axes([0.03, 0.08, 0.95, 0.78])
    D.section_ax(ax, [], lasers_only=True)
    ax.set_xlim(-56, 50)
    ax.set_ylim(-0.5, 17.5)
    for t in list(ax.texts):
        t.set_clip_on(True)
    ax.add_patch(Rectangle((-41.0 - 1.45, 7.95), 2.9, 0.8, fc='#c9a200', ec='none', zorder=5))
    ax.add_patch(Rectangle((PANEL['z'] - 0.05, PANEL['y'][0]), 0.1, PANEL['y'][1] - PANEL['y'][0], fc='#000', ec='#f5f2ea', lw=1.0, zorder=7))
    ax.add_patch(Rectangle((7.5 - 0.1, 7.6), 0.0, 0.0))
    ax.fill_between([-42, 21], [7.5, 7.5], [8.7, 8.7], color='#ffb36b', alpha=0.10, zorder=1)
    ax.text(-30, 8.85, 'the pendant-lamp layer the model lacks (7.5-8.7 m, cloud): every beam stays under it, measure today', color='#ffb36b', fontsize=7.4)
    for b in out['plans'][REC_PLAN]['lasers']['beams']:
        ax.plot([b['from'][2], b['to'][2]], [b['from'][1], b['to'][1]], color=HEX[b['colour']], lw=0.7, alpha=0.9, zorder=6)
    for c in cubes:
        ax.plot(c['p'][2], c['p'][1], marker='^', ms=9, mfc=c['hex'], mec='#000', zorder=9)
    for u in U:
        if abs(u['p'][0]) <= 12.5 and u['kind'] != 'fan':
            ax.plot(u['p'][2], u['p'][1], marker='o', ms=4.5, mfc=LAYER_COL.get(LAYER_OF(u['part']) if u['layer'] != 'air' else 'air', '#888'), mec='#000', mew=0.3, zorder=8)
    for bid, x, y, z in PA['v1']['boxes']:
        ax.add_patch(Rectangle((z[0], y[0]), z[1] - z[0], y[1] - y[0], fc=LAYER_COL['pa'], ec='none', alpha=0.8, zorder=7))
    for z, y, t, c in ((-41.0, 9.5, 'far crane at z -41: cubes 1-3 at 7.45 m', '#c9a200'), (-24.6, 3.8, 'cubes 4/5 at 5.0 m', '#ff3a12'), (-9.2, 7.4, 'cube 6, 6.5 m tower', '#f5f2ea'),
                       (12.0, 7.3, 'ash wall 5.5-7.9 m, z 20.2', '#f5f2ea'), (21.6, 9.3, 'near crane z 21 (7.95-8.75)', '#c9a200'), (25.2, 3.0, 'PA 2.6 m / subs 1.1 m', LAYER_COL['pa']),
                       (-30.0, 1.4, 'columns of fire, far columns, hazers, strobes (floor)', LAYER_COL['beams'])):
        D_tag(ax, z, y, t, c)
    fig.text(0.03, 0.95, 'MOXIR v1.0 along the nave (Plan A): every line from 5.0-7.45 m down or up to the ash wall at 6.25-7.15 m; nothing over the crowd', color=D.FG, fontsize=12, fontweight='bold', family='DejaVu Sans Mono', va='center')
    fig.savefig(path, facecolor=D.BG)
    plt.close(fig)
    return path


# ------------------------------------------------------------------ the page
PAGE_V1 = r"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>MOXIR v1.0</title><style>:root{color-scheme:dark}*{box-sizing:border-box}html,body{background:#060708}</style></head><body><main id="root"></main>
<script>
"use strict";
const C={bg:"#060708",panel:"#101214",line:"#24282d",fg:"#e8e4dc",sub:"#a3a39b",dim:"#7d817f",ok:"#7bd88f",bad:"#ff5a4f",warn:"#ffb36b",ash:"#e8e4dc",ember:"#ff3a12",fixed:"#c9a200"};
const D=__DATA__;const F="ui-monospace,'DejaVu Sans Mono',monospace";
const el=(t,s,h)=>{const e=document.createElement(t);if(s)Object.assign(e.style,s);if(h!=null)e.innerHTML=h;return e;};
const esc=s=>String(s==null?"":s).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
const wrap=t=>{const w=el("div",{overflowX:"auto",maxWidth:"100%"});w.appendChild(t);return w;};
const td=(t,s)=>el("td",Object.assign({borderBottom:"1px solid "+C.line,padding:"6px 8px",verticalAlign:"top"},s||{}),t);
const table=(head,rows,small)=>{const t=el("table",{borderCollapse:"collapse",width:"100%",font:(small?"11.5px":"12.5px")+"/1.45 "+F,color:"#c9c6be"});
  const h=el("tr");for(const k of head)h.appendChild(td(esc(k),{color:C.fg,borderBottom:"1px solid "+C.dim}));t.appendChild(h);
  for(const r of rows){const tr=el("tr");for(const c of r)tr.appendChild(typeof c==="object"&&c&&c.html!=null?td(c.html,c.style):td(esc(c)));t.appendChild(tr);}return wrap(t);};
const img=(src,alt)=>{const i=el("img",{display:"block",width:"100%",height:"auto",background:"#000",margin:"10px 0 4px"});i.src=src;i.alt=alt;return i;};
Object.assign(document.body.style,{margin:"0",background:C.bg,color:C.fg,font:"16px/1.55 system-ui,-apple-system,'Segoe UI',sans-serif"});
const root=document.getElementById("root");Object.assign(root.style,{maxWidth:"1240px",margin:"0 auto",padding:"36px 16px 64px"});
const h2=(n,t)=>root.appendChild(el("h2",{font:"600 18px/1.3 "+F,margin:"44px 0 12px",letterSpacing:".02em"},"<span style='color:"+C.ember+";margin-right:12px'>"+n+"</span>"+t));
const h3=(t,c)=>root.appendChild(el("h3",{font:"600 15px/1.3 "+F,margin:"26px 0 6px",color:c||C.fg},t));
const p=(t,s)=>root.appendChild(el("p",Object.assign({color:C.sub,margin:"0 0 10px"},s||{}),t));
const note=t=>root.appendChild(el("div",{color:C.dim,font:"12px/1.5 "+F,margin:"4px 0 12px"},t));
const ok=b=>({html:b==="owed"?"<b style='color:"+C.warn+"'>OWED</b>":b?"<b style='color:"+C.ok+"'>PASS</b>":"<b style='color:"+C.bad+"'>FAIL</b>"});
const sw=c=>c?"<span style='display:inline-block;width:10px;height:10px;background:"+c+";margin-right:6px;vertical-align:middle'></span>":"";
const S=D.S;
root.appendChild(el("div",{font:"12px "+F,color:C.dim,letterSpacing:".18em"},"MOXIR · 17.10.2026 · CHARENTSAVAN · v1.0"));
root.appendChild(el("h1",{font:"600 30px/1.2 "+F,margin:"8px 0 6px"},esc(S.concept.sentence)));
note("մոխիր = ash, the remains of a fire. Planning document: pictures and numbers, not a build, not a laser-safety or rigging sign-off.");
h2("1","The answer");
const ans=el("div",{background:C.panel,borderLeft:"3px solid "+C.ember,padding:"14px 18px",font:"15px/1.65 system-ui,sans-serif"});ans.innerHTML=D.answer.map((a,i)=>"<b>"+(i+1)+".</b> "+a).join("<br>");root.appendChild(ans);
h2("2","The concept");
p("<b style='color:"+C.fg+"'>The rules (the operator keeps these live):</b>");
root.appendChild(el("ol",{color:C.fg,margin:"0 0 12px 20px",padding:"0",font:"15px/1.7 system-ui,sans-serif"},S.concept.rules.map(r=>"<li>"+esc(r)+"</li>").join("")));
p("<b style='color:"+C.fg+"'>Palette:</b> "+sw(C.ash)+"ash white "+sw(C.ember)+"ember red, and black. <b style='color:"+C.fg+"'>Direction:</b> "+esc(S.concept.direction)+". <b style='color:"+C.fg+"'>Speed:</b> "+esc(S.concept.speed)+".");
p("<b style='color:"+C.fg+"'>What the audience must remember:</b> "+esc(S.concept.remember));
h2("3","Signature moments: what only this hall can give");
for(const m of S.moments){h3(esc(m.title),C.ember);
  if(D.png[m.id])root.appendChild(img(D.png[m.id],m.title));else root.appendChild(el("div",{background:"#000",height:"120px",border:"1px solid "+C.line,margin:"10px 0",display:"flex",alignItems:"center",justifyContent:"center",color:C.dim,font:"12px "+F},"(black: 3-5 s of nothing, haze on)"));
  root.appendChild(table(["fixtures","when","why it hits"],[[m.units,m.when,m.why]]));}
h2("4","The show arc: 4 acts, and what is held back");
root.appendChild(table(["act","set","uses","holds back","layers"],S.arc.map(a=>[a.act+" · "+a.name,a.set,a.use.join(" · "),a.hold,a.layers])));
h3("Every look");
for(const lk of S.looks){if(["one_line","still_smoking","columns_of_fire","fire_returns","the_roof"].includes(lk.id))continue;h3(esc(lk.title)+" <span style='color:"+C.dim+";font-weight:400'>· act "+lk.act+"</span>");if(D.png[lk.id])root.appendChild(img(D.png[lk.id],lk.title));}
h2("5","The cue stack");
note(esc(S.console.assumed));
root.appendChild(table(["fader","what","how"],S.console.faders));
root.appendChild(table(["button","what","how"],S.console.buttons));
root.appendChild(table(["page","on it"],S.console.pages));
p("<b style='color:"+C.fg+"'>Tempo:</b> "+esc(S.console.tempo)+".");
p("<b style='color:"+C.fg+"'>Locked in the desk:</b> "+S.console.safety_in_desk.map(esc).join(" · ")+".");
h2("6","The rig: where the cranes go");
root.appendChild(img(D.png.plan,"plan"));root.appendChild(img(D.png.section,"section"));
h3("The near crane: every park position along its runway");
root.appendChild(table(["z","what","the cut","the stop","the look","rigging","cab / pipes","sightlines","lasers (12 lines)"],S.crane.near.map(r=>[r.near_z,r.what,r.cut,r.stop,r.look,r.rigging,r.cab_pipes,r.sight,r.lasers?(r.lasers.pass+"/"+r.lasers.n+" pass · margin ≥ "+r.lasers.min_margin_deg+"° after the zone · max "+r.lasers.max_height_m+" m"):"not run"]),true));
h3("The far crane");
root.appendChild(table(["z","what","lasers 1-3","note"],S.crane.far.map(r=>[r.far_z,r.what,r.lasers_1_3,r.note])));
h3("The four plans");
root.appendChild(table(["plan","what","towers to build","lasers pass","smallest margin after the 0.3° zone","highest beam"],Object.entries(S.plans).map(([k,v])=>[{html:"<b>"+k+"</b>"+(k===S.recommended?" <b style='color:"+C.ok+"'>RECOMMENDED</b>":k===S.fallback?" <b style='color:"+C.warn+"'>FALLBACK</b>":"")},v.title,v.towers,v.lasers.pass+"/"+v.lasers.n,v.lasers.min_margin_deg+"°",v.lasers.max_height_m+" m"])));
p("<b style='color:"+C.fg+"'>Why not A2:</b> with the near crane at z 21 and lasers 1–3 on the goal post, the search found no aim height that clears both the near crane's girder (above the wall) and the press crown (under the lines) over ±0.8°: so if the near crane moves, the far one moves too, or it is Plan B1.");
p("<b style='color:"+C.fg+"'>Recommendation:</b> Plan A1, both cranes moved: the near crane to z 21 carries the cut and the ash wall, the far crane to z −41 carries lasers 1–3. One tower to build (laser 6). <b>Only if</b> both are seen moving today, their inspection record exists and an operator locks them out (top of today's list). <b>Otherwise Plan B1</b>: nothing moves; the stage goal post carries the cut and the wall, the far goal post carries lasers 1–3. Same units, same look, two more structures.");
note("Plan B stage goal post: "+esc(S.crane.gp_stage_what)+". Load: "+S.crane.gp_stage.total_kg+" kg; bending "+S.crane.gp_stage.max_moment_kgm+" kg·m of an estimated "+S.crane.gp_stage.allowable_moment_kgm_estimate+" kg·m ("+Math.round(100*S.crane.gp_stage.utilisation)+" %); "+esc(S.crane.gp_stage.basis));
h2("7","The lasers: 12 lines onto one ash wall");
root.appendChild(table(["beam","colour","from","to (the wall)","length","passes","margin after the zone","cd/m² seen (σ "+S.haze.design_sigma+")","cd/m² (σ 0.02)","floor sees"],S.plans[S.recommended].lasers.beams.map(b=>[b.id,{html:sw(b.colour==="ash white"?C.ash:C.ember)+esc(b.colour)},"("+b.from.join(", ")+")","("+b.to.join(", ")+")",b.length_m+" m",ok(b.pass),b.margin_after_zone_deg+"°",b.vis[String(S.haze.design_sigma)].cd_m2,b.vis["0.02"].cd_m2,Math.round(100*b.vis["0.02"].seen_share)+" %"]),true));
note("Brightness basis, every number: the 6 W unit (2700/1500/1800 mW), each cube's power split between its 2 beams (duty 0.45; Talbot–Plateau), single scattering in haze (Henyey–Greenstein g 0.7), seen from z 38. Ember = 638 nm + 10 % of 525 nm. A dark club is ~0.01 cd/m² (ASSUMED). These replace the 907 cd/m² of 10-08 (10 W, one beam: superseded).");
p("<b style='color:"+C.fg+"'>Safety:</b> each beam's 25 test rays cover ±0.8° (the controller zone 0.3° + a 0.5° mount tolerance) and all end on the panel; every line stays 5.0–7.45 m up (≥ 3 m over any floor, HS(G)95), never past z 21, under the pendant-lamp layer (7.5–8.7 m: measure it today; if anything hangs lower in a beam's 1 m tube, that beam is re-aimed or the lamp removed). NOHD "+S.nohd.nohd_m+" m at 10 W (IEC 60825-1:2014 Table A.1): longer than the hall, so separation, not distance, is the control. The panel is matte: a diffuse reflection is hazardous only within "+S.diffuse_nhz_m[0]+" m of the spot ("+S.diffuse_nhz_m[1]+" m even if it were white; ANSI Z136.1 extended-source formula). The panel: "+esc(S.panel.what)+".");
p("<b style='color:"+C.fg+"'>The cubes in the cold:</b> the maker rates them 10–40 °C (ULTRA MK2 manual: \"such temperatures WILL cause a diode failure\"); the hall at night is ASSUMED 0–5 °C. Each cube on its 120 W mains adapter (not the battery), kept in a warm case until load-in, then in a small ventilated enclosure with a 20 W heating pad, a thermostat and a thermometer, ≥ 10 °C before power-on; the reading goes in the LSO log at doors; below 0 °C in the hall the LSO decides no-go. <b style='color:"+C.fg+"'>E-stop:</b> the six RJ45 interlock ports daisy-chained (In/Through) to one hard-wired mushroom E-stop at FOH, where the LSO stands (the jumper the cube ships with is removed); keys with the LSO; LaserOS zones ON as the second barrier, never the first; each cube's Beam Block set so it cannot emit below the wall.");
root.appendChild(table(["laser operator + E-stop (owner 10-08)","laser safety officer on the permit (if not Dima)","the permit: issuer, number, date (copy in the production file)","signed"],[["Dima","______________________","______________________","______"]]));
h3("FOH: the desk and the E-stops");
p(esc(S.foh.what)+". From an eye at "+S.foh.eye_m+" m: "+Object.entries(S.foh.sees).map(([k,v])=>esc(k)+" "+(v.seen?"<b style='color:"+C.ok+"'>seen</b>":"<b style='color:"+C.warn+"'>hidden by "+esc(v.blocked_by)+"</b>")).join(" · ")+". Its line to the front row clears each head in front by "+S.foh.over_front_row_mm+" mm per 0.5 m row (the riser). "+esc(S.foh.spotter_why)+". "+esc(S.foh.estop)+".");
h3("The artists' route (SE far gate → behind the stage)");
p("A "+S.artists_route.width_m+" m lane, "+S.artists_route.length_m+" m long, along the house-left side of the nave: the lowest laser line over it is "+S.artists_route.lowest_laser_over_route_m[S.recommended]+" m (Plan "+S.recommended+"), "+S.artists_route.lowest_laser_over_route_m[S.fallback]+" m (Plan "+S.fallback+"); the nearest floor unit is "+S.artists_route.nearest_floor_unit_m+" m from its centre line. "+esc(S.artists_route.rule)+" Light: "+esc(S.artists_route.light)+".");
h2("8","The PA, complementary");
note("Poligraf brings the sound system (owner 10-08); the price list we hold is lighting only, so the models are OPEN: the design is by class, and Poligraf's sound list is on today's list.");
for(const x of S.pa.principles)p("· "+esc(x));
root.appendChild(table(["layout","the DJ's head","the cut's low end","the cut's high end","the ash wall"],["now","v1"].map(w=>[w==="now"?"beta placeholders (±5.4)":"v1.0",...["the DJ's head","the cut's low end (house left)","the cut's high end","the ash wall"].map(t=>Math.round(100*S.pa.sightlines[w][t].seen_share)+" % seen ("+Math.round(100*S.pa.sightlines[w][t].blocked_by_pa_share)+" % blocked by the PA)")])));
note("Every floor eye from z 27 back, 1.6 m, cast against the hall model with each PA layout's boxes (the rest blocks too: the barrier, the DJ table, the crane).");
root.appendChild(table(["class","examples (rental)"],S.pa.classes.map(c=>[c.what,c.examples])));
root.appendChild(table(["mean absorption","RT60 (Sabine)","critical distance Q 10","Q 20"],S.pa.rt60.map(r=>[r.alpha_mean,r.rt60_s+" s",r.dc_m_Q10+" m",r.dc_m_Q20+" m"])));
note(esc(S.pa.rt60_basis)+" · Level: "+esc(S.pa.spl.target)+"; "+esc(S.pa.spl.capacity)+" ("+esc(S.pa.spl.basis)+"). "+esc(S.pa.boxes)+". Coverage: "+esc(S.pa.coverage_method)+". Noise: "+esc(S.pa.noise));
h2("9","Haze: designed for the haze we can get");
root.appendChild(table(["volume","air changes / h","mg/m³","σ /m"],S.haze.rows.map(r=>[r.volume,r.ach_per_h,r.mg_m3,r.sigma_per_m])));
p(esc(S.haze.verdict)+" Fluid needed for the whole hall at 1 air change/h: "+Object.entries(S.haze.need_ml_min_whole_hall_ach1).map(([k,v])=>"σ "+k+": "+v+" ml/min").join(", ")+" (6 units give "+(6*S.haze.ml_min_each).toFixed(1)+").");
root.appendChild(table(["where","n","why"],S.haze.placement.map(x=>[x.where,x.n,x.why])));
p("<b style='color:"+C.fg+"'>How they run:</b> "+S.haze.run.map(esc).join(" "));
note(esc(S.haze.basis)+". Measure: "+esc(S.haze.measure)+".");
h2("10","Every unit: used, held back, not hung");
root.appendChild(table(["code","on the order","hung","NOT hung"],S.not_hung.map(r=>[r.code+(r.code==="EXT-HAZER"?" (no supplier: none on the list, owner 10-08)":""),r.ordered,r.hung,{html:"<b>"+r.not_hung+"</b>"}])));
p("<b style='color:"+C.fg+"'>"+D.notHung+" units of the order are not hung</b>: less rigging, less power, less to go wrong. Release them from the order, or keep a few as hot spares in their cases.");
root.appendChild(table(["id","model","status","part","x","y","z","mount","aim","colour","DMX","W","circuit"],D.sched.map(r=>[r.id.replace("rig-",""),r.model,{html:r.status==="used"?"used":"<span style='color:"+C.warn+"'>"+esc(r.status)+"</span>"},r.part,r.p[0],r.p[1],r.p[2],r.mount,r.aim,{html:sw(r.colour)+esc(r.colour||"")},r.dmx,r.w,r.circuit||""]),true));
h2("11","Power, DMX, network");
root.appendChild(table(["look","running W (lighting, effects, lasers, network)"],S.power.looks.map(l=>[l.look,l.running_w])));
p("<b style='color:"+C.fg+"'>Running, worst look + PA ("+S.power.pa_w+" W) + FOH/DJ ("+S.power.foh_dj_w+" W): "+(S.power.running_total_w/1000).toFixed(1)+" kW</b> of the 30 kW cap "+(S.power.ok?"(PASS)":"(FAIL)")+". Connected (every unit at its datasheet watts): "+(S.power.connected_w/1000).toFixed(1)+" kW. The venue must give: "+esc(S.power.supply)+".");
note(esc(S.power.watts_basis));
root.appendChild(table(["circuit","distro","kind","units","load","cable","drop","check"],S.circuits.map(c=>[c.circuit,c.distro,c.kind,c.n,c.load_w+" W",c.cable_m+" m · "+c.cable_mm2+" mm²",c.vdrop_pct+" %",ok(c.ok)])));
root.appendChild(table(["DMX branch","universe","node","devices (≤ 32)"],S.patch.map(r=>[r.branch,r.universe,r.node,r.devices])));
note("Slots: "+Object.entries(S.slots).map(([u,n])=>"U"+u+" "+n+"/512").join(", ")+"; the 6 cubes on Art-Net universe 10 (16 ch each). DMX512-A (ANSI E1.11): ≤ 32 unit loads per segment. Network "+esc(S.network.subnet)+".");
root.appendChild(table(["IP","what"],S.network.ips.map(x=>[x.ip,x.what])));
root.appendChild(table(["link","length","≤ 100 m (TIA-568)"],S.network.links.map(l=>[l.what,l.length_m+" m",ok(l.ok)])));
h2("12","The checks");
root.appendChild(table(["check","result","pass"],D.checks.map(c=>[c[0],c[1],ok(c[2])])));
h2("13","Measure today (top first)");
root.appendChild(table(["#","what","where","how","key"],S.measure_today.map((m,i)=>[i+1,{html:i===0?"<b style='color:"+C.warn+"'>"+esc(m[0])+"</b>":esc(m[0])},m[1],m[2],m[4]])));
h3("The 7 values still ASSUMED (each moves the rig)");
root.appendChild(table(["value","taken as"],S.seven_assumed));
note("Also merged into the survey copy (occlusion/moxir-survey.html), the cranes first; the page before the merge is kept beside it.");
h2("14","The crew and the nine days");
root.appendChild(table(["role","name","phone"],S.crew.map(r=>[r,r.includes("Dima")?"Dima":"______________","__________"]).concat([["crowd size (OPEN, owner 10-08)","______________",""],["the promoter's safety lead (OPEN)","______________","__________"]])));
root.appendChild(table(["day","what"],S.timeline));
root.appendChild(el("div",{color:C.dim,font:"12px/1.55 "+F,marginTop:"30px",borderTop:"1px solid "+C.line,paddingTop:"12px"},"Generated by scripts/place/moxir_v1.py (PR #823): the hall model (sha256 pinned), lasers_v2 / occlusion engine, the review (fable-review.md) applied; rig file rigs/moxir-epic-2026-10-08.json."));
</script></body></html>
"""


def schedule_rows(U, cubes):
    rows = []
    for u in U:
        y, e = (EPL.yaw_el(u['d']) if u.get('d') is not None else (None, None))
        T = (u.get('aim') or {}).get('targets')
        aim = ('at (%.1f, %.1f, %.1f)' % tuple(T[u.get('aim_i', 0)])) if T else (None if y is None else ('straight up' if e > 85 else 'yaw %+.0f°, up %.0f°' % (y, e)))
        dm = u.get('dmx')
        rows.append({'id': u['id'], 'model': EPL.CODE.get(u['type'], u['type'].upper()), 'status': u['status'], 'part': u['part'], 'p': [round(float(v), 2) for v in u['p']],
                     'mount': u['mount'], 'aim': aim or '', 'colour': u.get('colour'), 'dmx': ('U%d / %d (%d ch)' % (dm['universe'], dm['address'], dm['footprint'])) if dm else '—',
                     'w': {'ext-fan': 150}.get(u['type'], EPL.WATTS.get(u['type'])), 'circuit': u.get('circuit')})
    for c in cubes:
        rows.append({'id': c['id'], 'model': 'EXT-LC-ULTRA-MK2', 'status': 'used', 'part': 'laser %d' % c['n'], 'p': c['p'], 'mount': c['mount'],
                     'aim': '; '.join('%s → wall (%.2f, %.2f)' % (b['id'], b['to'][0], b['to'][1]) for b in c['beams']), 'colour': c['hex'],
                     'dmx': 'Art-Net 10 / %d · %s' % (c['artnet']['address'], c['ip']), 'w': 120, 'circuit': c.get('circuit')})
    return rows


def check_rows(out, U):
    rec = out['plans'][REC_PLAN]['lasers']
    fb = out['plans'][FALLBACK_PLAN]['lasers']
    bp = out['checks'][REC_PLAN]['by_part']
    non_flash_eyes = sum(v['eyes'] for k, v in bp.items() if k not in ('blinders',))
    blocked = {k: v for k, v in bp.items() if v['blocked'] and k not in ('blinders', 'lightning', 'ash wall', 'still smoking')}
    looks_layers = [(lk['id'], len({LAYER_OF(p) for p in lk['parts']})) for lk in LOOKS]
    pal_ok = all(c in (ASH, ASH_GREY, EMBER, EMBER_DEEP, None) for lk in LOOKS for c, _ in lk['parts'].values())
    return [
        ['lasers, Plan A1: 12 lines end on the panel over ±0.8°, behind z 21, ≥ 3 m over floors', '%d/%d; smallest margin after the zone %s°; highest %s m' % (rec['pass'], rec['n'], rec['min_margin_deg'], rec['max_height_m']), rec['pass'] == rec['n'] and rec['min_margin_deg'] >= 0.5],
        ['lasers, Plan B1 (the fallback)', '%d/%d; margin %s°' % (fb['pass'], fb['n'], fb['min_margin_deg']), fb['pass'] == fb['n'] and fb['min_margin_deg'] >= 0.5],
        ['every lamp beam: nothing blocks it (hall model + rig + panel)', ('none blocked' if not blocked else '; '.join('%s: %s' % (k, ', '.join(v['blockers'][:2])) for k, v in blocked.items())), not blocked],
        ['columns of fire: the fan effect\'s 8° inner extreme clears', ', '.join(out['checks'][REC_PLAN]['fan_extreme_blocked']) or 'clear', not out['checks'][REC_PLAN]['fan_extreme_blocked']],
        ['no audience eye in any lamp\'s field (all but the blinders)', '%d eyes' % non_flash_eyes, non_flash_eyes == 0],
        ['blinders: 4 at the 40 %% cap, 12.5° above the front row\'s eye line, 1-2 s hits, act 3 only', 'front row %d lux with all 4; back of the floor %d lux' % (out['blinders']['front_row_lux_all4_at_40pct'], out['blinders']['back_lux']), True],
        ['looks: ≤ 2 layers, 3 only in the fire', ', '.join('%s %d' % x for x in looks_layers), all(n <= 2 or i == 'fire_returns' for i, n in looks_layers) and all(n <= 3 for _, n in looks_layers)],
        ['palette: ash white and ember red only', 'every look', pal_ok],
        ['running power ≤ 30 kW (lighting + PA + FOH)', '%.1f kW (connected %.1f kW)' % (out['power']['running_total_w'] / 1000, out['power']['connected_w'] / 1000), out['power']['ok']],
        ['DMX: ≤ 512 slots, ≤ 32 devices per branch', ', '.join('U%s %d' % (k, v) for k, v in out['slots'].items()), all(v <= 512 for v in out['slots'].values()) and all(r['ok'] for r in out['patch'])],
        ['circuits: ≤ 2944 W, voltage drop ≤ 5 %', '%d circuits, worst drop %s %%' % (len(out['circuits']), max(c['vdrop_pct'] for c in out['circuits'])), all(c['ok'] for c in out['circuits'])],
        ['network: every Cat6 link ≤ 100 m', 'longest %s m' % max(l['length_m'] for l in out['network']['links']), all(l['ok'] for l in out['network']['links'])],
        ['PA: the cut and the DJ no more hidden than with the placeholders', 'see section 8', all(out['pa']['sightlines']['v1'][t]['blocked_by_pa_share'] <= out['pa']['sightlines']['now'][t]['blocked_by_pa_share'] + 1e-9 for t in out['pa']['sightlines']['v1'])],
        ['the artists\' route: every laser line >= 5 m over it, every floor unit >= 1 m from it', 'lowest line %s m (A1) / %s m (B1); nearest unit %s m' % (out['artists_route']['lowest_laser_over_route_m'][REC_PLAN], out['artists_route']['lowest_laser_over_route_m'][FALLBACK_PLAN], out['artists_route']['nearest_floor_unit_m']),
         min(out['artists_route']['lowest_laser_over_route_m'].values()) >= 5.0 and out['artists_route']['nearest_floor_unit_m'] >= 1.0],
        ['the laser watch: FOH (Dima, E-stop) sees the DJ, the cut and the ash wall; FOH + the spotter (second E-stop) see every beam\'s whole path (HS(G)95: the operator sees the beams)', 'from FOH alone min %d %% (%s); with the spotter min %d %%' % (round(100 * min(out['foh']['beams_seen'].values())), min(out['foh']['beams_seen'], key=out['foh']['beams_seen'].get), round(100 * min(out['foh']['beams_seen_with_spotter'].values()))),
         all(out['foh']['sees'][k]['seen'] for k in out['foh']['sees'] if not k.startswith('laser')) and min(out['foh']['beams_seen_with_spotter'].values()) >= 0.9],
        ['Plan B stage goal post, 13 m span', 'H30V: %d %% of an ESTIMATED allowable moment: too close to call safe, so Plan B specifies an H40V-class span (Prolyte H40V / Global Truss F44 class); its 13 m row and the towers\' table are OWED from the rental house' % round(100 * out['crane']['gp_stage']['utilisation']), 'owed'],
    ]


def answer_v1(out):
    rec = out['plans'][REC_PLAN]['lasers']
    nh = sum(r['not_hung'] for r in out['not_hung'] if r['code'] not in ('UP-LA40WF', 'UP-Q108S', 'UP-YH600F'))
    return ['<b>%s</b> Six signature moments only this hall can give (one line, still smoking, columns of fire, the black, the fire returns, the roof once an hour), over 4 acts with the fire held back to act 3; two colours, two layers, black as the main colour.' % esc_(CONCEPT['sentence']),
            '<b>Minimal: %d units hung (lights and the 6 cubes; + 4 smoke machines), %d of the order not hung.</b> All 12 laser lines end on one matte ash wall behind the DJ (%d/%d pass with ≥ %s° to spare after the zone); running %.1f kW with the PA (cap 30). The PA re-placed: subs in one cardioid line, mains wider and higher.' % (
                out['n_units'] - 4, nh, rec['pass'], rec['n'], rec['min_margin_deg'], out['power']['running_total_w'] / 1000),
            '<b>The cranes decide the build:</b> Plan A1 (near crane to z 21, far crane to z −41: one tower to build) only if both are seen moving, inspected and locked out today; otherwise Plan B1, ground support (the same look). That is the first line of today\'s list.']


def esc_(s):
    import html as H
    return H.escape(str(s))


def crew_sheet(out, U, cubes, sched):
    import html as H
    e = lambda s: H.escape(str(s if s is not None else ''))
    groups = collections.OrderedDict()
    for r in sched:
        groups.setdefault(r['part'], []).append(r)
    rows = ''.join('<tr><td><b>%s</b></td><td>%d</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>' % (
        e(k), len(v), e(v[0]['model']), e('; '.join('(%g, %g, %g)' % tuple(x['p']) for x in v[:6]) + (' …' if len(v) > 6 else '')), e(v[0]['mount']), e(v[0]['aim'][:90]),
        e(', '.join(sorted({x['dmx'] for x in v}))[:80])) for k, v in groups.items())
    body = """<h2>1 · Positions (hall frame: x + house right, z + toward the entry, y up, m) — Plan %s; Plan B1 if the cranes do not move</h2>
<div class="w"><table><tr><th>part</th><th>n</th><th>model</th><th>where</th><th>mount</th><th>aim</th><th>DMX</th></tr>%s</table></div>
<div class="cols"><div><h2>2 · The ash wall (beam-stop panel)</h2><p>%s. Centre x 0.13, y 6.7, face z 20.2 (5.5-7.9 m). Plan A: hung under the near crane's back girder; Plan B: from the stage goal post.</p>
<h2>3 · Network (closed, static, Wi-Fi OFF on the cubes)</h2><table><tr><th>IP</th><th>what</th></tr>%s</table>
<h2>4 · DMX</h2><table><tr><th>branch</th><th>U</th><th>node</th><th>devices</th></tr>%s</table>
<h2>5 · Power</h2><p>Supply: %s. Heaters never on a lamp circuit; the cubes and the network on their own circuit.</p></div>
<div><h2>6 · Safety steps (in this order)</h2><ol>%s</ol><h2>7 · Laser test (the LSO leads)</h2><ol>%s</ol>
<p><b>LSO / laser operator:</b> ____________________ &nbsp; <b>Permit (issuer, no., date):</b> ____________________</p></div></div>""" % (
        REC_PLAN, rows, e(PANEL['what']), ''.join('<tr><td>%s</td><td>%s</td></tr>' % (e(x['ip']), e(x['what'])) for x in out['network']['ips']),
        ''.join('<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>' % (e(r['branch']), r['universe'], e(r['node']), r['devices']) for r in out['patch']), e(out['power']['supply']),
        ''.join('<li>%s</li>' % e(x) for x in SAFETY_V1), ''.join('<li>%s</li>' % e(x) for x in LASER_TEST_V1))
    page = EPL.CREW_PAGE.replace('__BODY__', body).replace('Generated by scripts/place/epic_plot.py', 'Generated by scripts/place/moxir_v1.py')
    i = page.index('<p class="warn">')
    j = page.index('</p>', i) + 4
    return page[:i] + '<p class="warn">BEFORE ANY LASER EMISSION: the ash wall (the matte beam-stop panel) is hung and checked, every beam walked with a card, the E-stop at FOH tested, every cube at 10 °C or more. Plan A: both cranes seen moved, inspected, locked out; otherwise Plan B1.</p>' + page[j:]


SAFETY_V1 = [
    'Plan A only: the venue\'s operator moves the near crane to z 21 and the far crane to z -41, then de-energises and locks out both (LOTO); rail clamps or chocks; the rating plates and the inspection record photographed. If any of that is missing: Plan B1.',
    'Floor cleared as the show hall lists it; cable routes ramped; the barrier at z 26.5.',
    'Towers (laser 6; in Plan B the two goal posts): base plates level, ballast or guys per the maker\'s tower table; the rigger signs the stability check before anything is hung.',
    'The cut: round slings basket-hitched over the full girder section (Plan A) or the goal-post span (Plan B), steel safeties on separate points, picks shackled to the chords, tie-offs ≥ 0.5 m from anything and 1.0 m from the cab.',
    'Every hung unit: half-coupler + a rated safety; cubes 4/5 brackets strapped at 5.0 m and bonded; the ash wall on 2 rated wire ropes + safeties.',
    'Ladders and stairs to the runways and the crane walkways chained and padlocked; a steward checks before doors.',
    'Power: the factory board\'s breakers and earth checked by the electrician; RCDs (30 mA) on every socket circuit, tested; the smoke machines\' warm-up staggered.',
    'Smoke detection: isolated (or not) only by the venue, with a named fire watch.',
    'Strobes ≤ 4 flashes per second, blinders capped at 40 % in the desk; the photosensitivity notice at the door.',
]
LASER_TEST_V1 = [
    'The LSO present, the permit on site, the keys with the LSO; the six interlocks daisy-chained to the E-stop at FOH and tested (press it: all six stop).',
    'Each cube\'s label read (6 W or 10 W) and its enclosure at ≥ 10 °C before power-on (thermometer in the log).',
    'Each cube on its fixed IP, Wi-Fi off; one Art-Net test cue each.',
    'Beam Block set with the power off so the aperture cannot emit below the wall; LaserOS zones limit the scan to the two beam points.',
    'Align at the lowest power, one beam at a time, house lights off: each spot on its mark on the ash wall, ≥ 0.75 m from any edge, a drift goes up, never down.',
    'Walk each beam from the cube to the wall with a card: nothing in its 1 m tube (pendant lamps, cables, hooks, the cranes\' hooks).',
    'Raise to show power only when all 12 pass; record the power per cube; during the show the LSO keeps the E-stop and sight of the far half; any crane movement = lasers OFF.',
]


def rig_file_v1(out, U, cubes):
    def fx(u):
        r = L.rot_for_dir(u['d']) if u.get('d') is not None else (0.0, 0.0, 0.0)
        return {'id': u['id'], 'type': u['type'], 'position': u['mount'], 'part': u['part'], 'layer': LAYER_OF(u['part']) if u['layer'] != 'air' else 'air',
                'status': u['status'], 'moments': u['moments'], 'p': [round(float(v), 3) for v in u['p']], 'r': [round(float(v), 6) for v in r], 'colour': u.get('colour'),
                'angle_rad': round(math.radians(OC.half_of(u)), 4) if u.get('d') is not None and u['kind'] in ('par', 'beam', 'wash', 'spot') else None,
                'dmx': u.get('dmx'), 'power_w': {'ext-fan': 150}.get(u['type'], EPL.WATTS.get(u['type'])), 'circuit': u.get('circuit')}
    fixtures = [fx(u) for u in U]
    for c in cubes:
        fixtures.append({'id': c['id'], 'type': 'ext-lc-ultra-mk2', 'position': c['mount'], 'part': 'laser', 'layer': 'lines', 'status': 'used', 'p': c['p'],
                         'r': [round(float(v), 6) for v in L.rot_for_dir(c['d'])], 'colour': c['hex'], 'angle_rad': 0.0105,
                         'laser': {'colour': c['colour'], 'ip': c['ip'], 'artnet': c['artnet'],
                                   'beams': [dict({k: b[k] for k in ('id', 'to', 'length_m', 'pass', 'margin_after_zone_deg')},
                                                  r=[round(float(v), 6) for v in L.rot_for_dir(L.unit(np.array(b['to'], float) - np.array(c['p'], float)))]) for b in c['beams']]},
                         'power_w': 120, 'circuit': c.get('circuit')})
    solids = [{'id': 'rig-ash-wall', 'name': 'the ash wall: beam-stop panel, matte black, %s' % PANEL['what'][:60], 'kind': 'box',
               'p': [0.13, PANEL['y'][0], PANEL['z']], 'r': [0, 0, 0], 's': [PANEL['x'][1] - PANEL['x'][0], PANEL['y'][1] - PANEL['y'][0], PANEL['thick']]},
              {'id': 'rig-tower-cube6', 'name': 'tower for laser 6 (H30V), base plate + ballast', 'kind': 'tower', 'p': [0.26, 0.0, -9.23], 'r': [0, 0, 0], 's': [1, round(6.25 / 6.0, 4), 1]},
              {'id': 'rig-crowd-barrier', 'name': 'Crowd barrier 17.5 m (x -9.6 to +7.9), moved to z 26.5: a 1.25 m pit in front of the sub line, the mains behind it', 'kind': 'box', 'p': [-0.85, 0.0, 26.5], 'r': [0, 0, 0], 's': [17.5, 1.1, 0.08]}]
    for bid, x, y, z in PA['v1']['boxes']:
        solids.append({'id': 'rig-' + bid, 'name': 'PA v1.0 (by class, model owed): ' + bid, 'kind': 'box', 'p': [(x[0] + x[1]) / 2, y[0], (z[0] + z[1]) / 2], 'r': [0, 0, 0],
                       's': [round(x[1] - x[0], 3), round(y[1] - y[0], 3), round(z[1] - z[0], 3)]})
    plan_b = [{'id': 'rig-stage-goalpost-span-%d' % (i + 1), 'name': 'Plan B stage goal post (H30V)', 'kind': 'truss-3m' if i < 4 else 'truss-1m',
               'p': [GP_STAGE['x'][0] + 1.5 + 3.0 * i if i < 4 else GP_STAGE['x'][1] - 0.5, GP_STAGE['bottom'] + 0.145, GP_STAGE['z']], 'r': [0, 0, 0], 's': [1, 1, 1]} for i in range(5)]
    plan_b += [{'id': 'rig-stage-goalpost-tower-%s' % k, 'name': 'Plan B stage goal post tower', 'kind': 'tower', 'p': [x, 0.0, GP_STAGE['z']], 'r': [0, 0, 0], 's': [1, round((GP_STAGE['bottom'] + 0.29) / 6.0, 4), 1]}
               for k, x in (('l', GP_STAGE['x'][0]), ('r', GP_STAGE['x'][1]))]
    plan_b += [{'id': 'rig-goalpost-far-%d' % (i + 1), 'name': 'Plan B far goal post (H30V L300)', 'kind': 'truss-3m', 'p': [-4.5 + 3.0 * i, GP_FAR['height_m'] - 0.145, GP_FAR['z']], 'r': [0, 0, 0], 's': [1, 1, 1]} for i in range(4)]
    plan_b += [{'id': 'rig-goalpost-far-tower-%s' % k, 'name': 'Plan B far goal post tower', 'kind': 'tower', 'p': [x, 0.0, GP_FAR['z']], 'r': [0, 0, 0], 's': [1, round((GP_FAR['height_m'] - 0.29) / 6.0, 4), 1]} for k, x in (('l', -6.0), ('r', 6.0))]
    return {'snapshot': 'moxir-epic-2026-10-08', 'version': 'MOXIR v1.0', 'plan': REC_PLAN, 'fallback': FALLBACK_PLAN,
            'what': 'Every unit of MOXIR v1.0 (elite + minimal, the review applied): position, rotation, colour, cone, status (used / held back), moments, DMX, watts, circuit; the solids it adds (the ash wall, the tower for laser 6, the PA re-placed, the barrier moved); Plan B\'s solids apart. Generated by scripts/place/moxir_v1.py: never edit by hand.',
            'schema': 'the beta v0.9 snapshot schema (rigs/moxir-beta-v0.9-lights-2026-10-07.json: fixtures[{id,type,position,p,r,colour,angle_rad}] + solids[{id,name,kind,p,r,s}]), with status/moments/dmx/power_w/circuit per fixture and laser per cube. versions.mjs\'s rule schema places by mount rules and cannot hold per-unit positions; the build loads this file into a copy of beta as ops.',
            'frame': 'hall frame: metres, Y up, +x house right, +z toward the entry; rotations three.js Euler XYZ radians, a spot\'s unrotated beam points -Y; angle_rad = half the beam angle; box solids base-anchored; truss origin at the section centre, tower at the base plate (src/rigbuild/pieces.js), a tower\'s s[1] scales the 6 m catalogue tower.',
            'cranes': {'A1': {'near_z_m': 21.0, 'far_z_m': -41.0}, 'B1': {'near_z_m': 4.8, 'far_z_m': -22.2}},
            'base': {'project': 'moxir-known-full-stage-back (MOXIR beta v0.9)', 'hall': 'moxir-hall-2026-10-07-v8-show-back21 (Plan A); v8-show (Plan B)'},
            'assumed': [a + ': ' + b for a, b in SEVEN_ASSUMED] + ['the haze reach and sigma (designed for 0.005/m)', 'FOH and distro places', 'strobe/blinder/hazer equivalents', 'PA by class, model owed'],
            'fixtures': fixtures, 'solids': solids, 'plan_b_solids': plan_b, 'not_hung': out['not_hung'],
            'looks': LOOKS, 'moments': MOMENTS, 'arc': ARC, 'console': CONSOLE, 'concept': CONCEPT,
            'patch': {'branches': out['patch'], 'slots': out['slots']}, 'network': out['network'], 'power': {'circuits': out['circuits'], 'summary': {k: v for k, v in out['power'].items() if k != 'looks'}}}


def merge_survey_v1(path):
    path = os.path.expanduser(path)
    if not os.path.exists(path):
        return None
    s = open(path).read()
    k0 = s.index('const ITEMS=') + len('const ITEMS=')
    items, k1 = json.JSONDecoder().raw_decode(s, k0)
    old = [i for i in items if not str(i.get('key', '')).startswith('epic_')]
    new = [{'n': j + 1, 'what': ('[v1.0] ' if j else '[v1.0 · FIRST] ') + w, 'where': wh, 'tool': t, 'tol': tl, 'key': k} for j, (w, wh, t, tl, k) in enumerate(MEASURE_TODAY)]
    for j, i in enumerate(old):
        i['n'] = len(new) + j + 1
    bak = path.replace('.html', '.before-v1.html')
    if not os.path.exists(bak):
        shutil.copy2(path, bak)
    s2 = s[:k0] + json.dumps(new + old, ensure_ascii=False) + s[k1:]
    a = s2.find('<div class="item top"><div class="row"><span class="n">!</span><span class="what">Which door')
    if a >= 0:
        b_ = s2.index('</div></div>', a) + len('</div></div>')
        s2 = s2[:a] + '<div class="item done"><div class="row"><span class="n">✓</span><span class="what">The entrance is decided (owner, 2026-10-08): the public comes in at the NW entry door (the audience end, z +54); the SE far gate behind the stage is the artists\' entrance only. Photograph the artists\' route (item 2).</span></div></div>' + s2[b_:]
    open(path, 'w').write(s2)
    return {'path': path, 'backup': bak, 'first': len(new), 'total': len(new) + len(old)}


def fix_state(path='~/Downloads/moxir/stage/occlusion/STATE.md'):
    path = os.path.expanduser(path)
    if not os.path.exists(path):
        return None
    s = open(path).read()
    mark = '## SUPERSEDED NUMBERS (2026-10-08, MOXIR v1.0)'
    if mark in s:
        return 'already'
    note = mark + '\n- The brightness figures below (option b 907 cd/m², 1061 cd/m² and the like) were for a 10 W cube putting its FULL power into ONE beam. They are superseded.\n- The one number set now: brightness at the 6 W unit, each cube\'s power split between its 2 beams (duty 0.45), at the haze we can get (σ 0.005/m) and at the written σ 0.02/m. Safety at 10 W, full power in one beam (NOHD 724 m).\n- v1.0 also moves every beam onto one matte beam-stop panel behind the DJ (no beam ends on crane steel or a runway any more).\n- The source is ~/Downloads/moxir/stage/epic/epic.html (scripts/place/moxir_v1.py). This file is kept as the record of 10-08.\n\n'
    i = s.index('\n', s.index('# ')) + 1
    open(path, 'w').write(s[:i] + '\n' + note + s[i:])
    return 'fixed'


def b64(p):
    return 'data:image/png;base64,' + base64.b64encode(open(p, 'rb').read()).decode()


def main():
    out, U, LZ, cubes = build()
    pub = json.loads(json.dumps(out, default=lambda v: v.tolist() if hasattr(v, 'tolist') else (sorted(v) if isinstance(v, set) else str(v))))
    sched = schedule_rows(U, cubes)
    if A5.check or not A5.out:
        pub['schedule'] = sched
        pub['check_rows'] = check_rows(pub, U)
        print(json.dumps(pub, indent=1, default=str))
        return
    od = os.path.expanduser(A5.out)
    os.makedirs(od, exist_ok=True)
    rig = rig_file_v1(pub, U, cubes)
    with open(os.path.join(A5.repo, A5.rig_out), 'w') as fh:
        json.dump(rig, fh, indent=1, ensure_ascii=False, default=lambda v: v.tolist() if hasattr(v, 'tolist') else str(v))
        fh.write('\n')
    pngs = {}
    pngs['plan'] = fig_plan_v1(U, cubes, pub, os.path.join(od, 'v1-plan.png'))
    pngs['section'] = fig_section_v1(U, cubes, pub, os.path.join(od, 'v1-section.png'))
    if not A5.fast:
        pngs.update(render_set(U, LZ, REC_PLAN, od))
    else:
        for lk in LOOKS:
            q = os.path.join(od, 'v1-look-%s.png' % lk['id'])
            if os.path.exists(q):
                pngs[lk['id']] = q
    nh = sum(r['not_hung'] for r in pub['not_hung'] if r['code'] not in ('UP-LA40WF', 'UP-Q108S', 'UP-YH600F'))
    data = {'S': pub, 'answer': answer_v1(pub), 'png': {k: b64(v) for k, v in pngs.items()}, 'sched': sched, 'checks': check_rows(pub, U), 'notHung': nh}
    open(os.path.join(od, 'epic.html'), 'w').write(PAGE_V1.replace('__DATA__', json.dumps(data, default=lambda v: v.tolist() if hasattr(v, 'tolist') else str(v))))
    open(os.path.join(od, 'crew-setup.html'), 'w').write(crew_sheet(pub, U, cubes, sched))
    json.dump(dict(pub, schedule=sched, check_rows=data['checks']), open(os.path.join(od, 'v1.json'), 'w'), indent=1, default=str)
    print('survey', merge_survey_v1(A5.survey))
    print('state', fix_state())
    for k, v in pngs.items():
        print('wrote', v)
    print('wrote', os.path.join(od, 'epic.html'), os.path.join(od, 'crew-setup.html'), os.path.join(A5.repo, A5.rig_out))


if __name__ == '__main__':
    main()
