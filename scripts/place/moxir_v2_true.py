#!/usr/bin/env python3
# moxir_v2_true.py — MOXIR v2, THE TRUE LOOK WITH ONE SMOKE MACHINE (2026-10-09), and layout B tuned for thin haze.
#
#   python3 -I scripts/place/moxir_v2_true.py plan --repo . --out <dir> [--layouts a,b,bt]   # frame plan (moxir-v2-true-frames.cjs)
#   python3 -I scripts/place/moxir_v2_true.py tune --repo . [--out <dir>]                     # B tuned: rig file + the tunes table
#   python3 -I scripts/place/moxir_v2_true.py page --repo . --out <dir>                       # contact sheet + index.html
#
# THE OWNER (2026-10-09): one smoke machine, not four (kit: 1 UP-YZ31P). He looked at the v2 layouts (rendered at 0.0169 /m,
# v1.0's four-machine figure) and said "idk what is cool". These pictures show the air one machine gives, and B tuned for it.
#
# THE AIR (sim-physics report; src/objectComponents/hazeZones.js, the two-zone near-field / far-field model, Nicas 1996):
#   UNVALIDATED estimate. The hall (186 890 m3) is far thinner than near the machine; the haze in the hall depends mostly on
#   two unknowns, the air change and whether the glycol droplets dry. The pictures use the case the night is planned for, the
#   CLOSED HALL (0.5 air changes/h, droplets that do not dry: `dries: false`): 10 min after the machine starts (~0.0024 /m) and
#   at 40 min, when the 6 L tank is empty (~0.0086 /m). The kit's own assumptions (6 air changes/h, drying 1.5 min: ~2.7e-4 /m
#   at any time) are the FLOOR of the range, shown for B and B tuned. The old pictures' 0.0169 /m is shown for contrast.
#   Near the machine (within ~3 m) the air is ~0.26-0.29 /m in every case: 30-1000x the hall. That is what tuning uses.
#
# THE CAMERA: measurement mode (docs/architecture/MEASUREMENT_MODE.md), EV100 2.84 FIXED for every frame — the room's own
# camera (ACES, exposure 3.5, sceneScale 0.02, three.js's 1/0.6 counted), set in RIG_BUILD §20.1 against club photographs;
# cross-check: a club photographer's ISO 3200, f/2, 1/60 s is EV100 = log2(2^2 x 60) - log2(3200/100) = 2.9. No auto
# exposure, no bloom, no glare veil, no work light; the rig's bounce kept (&bounce=1: the hall's own inter-reflection).
# Limit (the doc's): no screen shows a dark-adapted eye (CIE 191:2010, mesopic); the picture is a camera at a stated EV100.
import argparse, copy, json, math, os, subprocess, sys

for _k in ('OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS'):
    os.environ.setdefault(_k, '1')          # heat rule (owner 10-09): one BLAS thread
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.dont_write_bytecode = True

DATE = '2026-10-09'
EV100 = 2.84
QUERY = 'quality=full&measure&ev100=%.2f&scale=0.02&bounce=1' % EV100
BASE = 'http://moxir-v2-true.diiii.localhost'
HALL_M3 = 186890
RIG_B = 'scripts/place/rigs/moxir-v2-planes-%s.json' % DATE
RIG_A = 'scripts/place/rigs/moxir-v2-corridors-%s.json' % DATE
RIG_BT = 'scripts/place/rigs/moxir-v2-planes-tuned-%s.json' % DATE
HAZE_SOURCE = ('UNVALIDATED estimate: two-zone near-field/far-field model (Nicas 1996, AIHA J 57:542; hazeZones.js), one '
               'UP-YZ31P modelled on an Antari Z-1500 III EQUIVALENT at 150 ml/min continuous (upper bound), hall 186,890 m3. '
               'Air change and drying ASSUMED per state; the decay test + transmissometer decide (simulation-method 3.4 step 8).')


def haze(minutes, ach, dries):
    """One haze state as the document stores it (renderSettings.atmosphere): the kit's two-zone model of ONE machine."""
    h = {'model': 'nf-ff', 'volume_m3': HALL_M3, 'airChangesPerHour': ach, 'calibrate': False, 'kindLevels': {'smoke-machine': 1},
         'nearField': {'radius_m': 3, 'airSpeed_m_s': 0.1}, 'minutes': minutes, 'source': HAZE_SOURCE}
    if not dries:
        h['dries'] = False
    return {'anisotropy': 0.74, 'haze': h}


# label, short line, the atmosphere
STATES = {
    'old': ('old haze 0.0169 /m', 'the old pictures\' air: v1.0\'s four-machine figure, uniform', {'scattering': 0.0169, 'anisotropy': 0.7, 'haze': None}),
    't10': ('10 min after the machine starts', 'closed hall (0.5 air changes/h), droplets do not dry: the hall ~0.0024 /m', haze(10, 0.5, False)),
    't40': ('40 min — the tank is empty', 'closed hall, droplets do not dry: the hall ~0.0086 /m (the most one tank gives)', haze(40, 0.5, False)),
    'dry': ('the floor of the range', 'the kit\'s own assumptions (6 air changes/h, droplets dry in 1.5 min): the hall ~0.00027 /m', haze(40, 6, True)),
}
LAYOUTS = {
    'a': ('A · the nave corridors', 'moxir-v2-corridors', '/moxir/v2-a', RIG_A, ('old', 't10', 't40')),
    'b': ('B · three planes of depth', 'moxir-v2-planes', '/moxir/v2-b', RIG_B, ('old', 't10', 't40', 'dry')),
    'bt': ('B tuned for one machine', 'moxir-v2-planes-tuned', '/moxir/p/moxir-v2-planes-tuned', RIG_BT, ('t10', 't40', 'dry')),
}
LOOKS = ('dark', 'peak')
VIEWS = ('floor', 'entry')


def plan(repo, layouts, out):
    jobs = []
    for key in layouts:
        title, project, path, rig_file, states = LAYOUTS[key]
        rig = json.load(open(os.path.join(repo, rig_file)))
        views = {v['id']: v for v in rig['views']['viewPresets']}
        for st in states:
            for look in LOOKS:
                for view in VIEWS:
                    v = views[view]
                    jobs.append({'name': '%s-%s-%s-%s' % (key, st, look, view), 'layout': key, 'state': st, 'look': look, 'view': view,
                                 'project': project, 'path': path, 'atmosphere': STATES[st][2],
                                 'camera': {'position': v['position'], 'target': v['target'], 'fov': v['fov']}})
    p = {'base': BASE, 'query': QUERY, 'size': [1440, 900], 'settle_s': 15, 'jobs': jobs}
    os.makedirs(out, exist_ok=True)
    json.dump(p, open(os.path.join(out, 'plan.json'), 'w'), indent=1)
    print('%d jobs -> %s' % (len(jobs), os.path.join(out, 'plan.json')))


# ====================================================================== TUNE: B for one machine
# Every tune is a small, labelled data change in B's rig file, never a brightness boost on the room. What each one is worth is
# a DESIGN METRIC, stated: first-order single scattering (the same physics the room draws, beamAir / hazeField):
#     G = ∫ σ(x) · p_HG(θ; g) · exp(−τ_beam(s)) · exp(−σ_fill·|x − eye|) · seen(x) ds        (per unit flux of the beam, 1/sr)
# σ(x) = the hall's fill + the machine's near-field blob + its jet (hazeZones.js / hazeField.js, numbers read from the JS),
# p_HG = Henyey–Greenstein with g 0.74 (the kit's atmosphere), θ = the angle between the beam and the line to the eye,
# τ_beam = the haze the beam has already crossed, seen = no steel between the eye and the point (the audience volume skipped).
# It ranks aims; it is not a luminance (no flux, no width, no tone curve) and it is UNVALIDATED like the haze it rests on.
EYES = {'floor': (-3.75, 1.7, 18.1), 'entry': (0.0, 1.7, 51.5)}
G_HG = 0.74
EMBER, ASH = '#ff3a12', '#e8e4dc'
R3 = lambda v: round(float(v), 3)


def hg(cos_t, g=G_HG):
    return (1 - g * g) / (4 * math.pi * (1 + g * g - 2 * g * cos_t) ** 1.5)


def field_numbers(repo, nozzle, direction, states=('t10', 't40', 'dry')):
    """The machine's near field (blob σ and radius), jet and the hall's fill per state, from the room's own JS."""
    want = {k: STATES[k][2]['haze'] for k in states}
    js = """
import { hazeSettingsOf, buildHazeField, HAZE_KINDS } from '%s/src/objectComponents/hazeField.js'
const want = %s
const out = {}
for (const [k, h] of Object.entries(want)) {
  const m = { id: 'smoke', category: 'smoke-machine', kind: HAZE_KINDS['smoke-machine'], fluid_ml_per_min: 150, nozzle_d_mm: 50, position: %s, direction: %s }
  const f = buildHazeField(hazeSettingsOf({ haze: h }), [m])
  out[k] = { fill: f.fill, blob: f.blobs[0], jet: f.jets[0], zones: f.zones[0] }
}
console.log(JSON.stringify(out))
""" % (repo, json.dumps(want), json.dumps(list(nozzle)), json.dumps(list(direction)))
    r = subprocess.run(['node', '--input-type=module', '-e', js], capture_output=True, text=True, cwd=repo)
    if r.returncode:
        raise SystemExit(r.stderr)
    return json.loads(r.stdout)


def sigma_at(F, x):
    import numpy as np
    s = F['fill']
    b, j = F['blob'], F['jet']
    v = np.asarray(x, float) - np.asarray(j['position'], float)
    rho = float(np.linalg.norm(v)) / b['radius']
    t = min(1.0, max(0.0, (rho - 0.8) / 0.4))
    s += b['sigma'] * (1 - t * t * (3 - 2 * t))
    d = np.asarray(j['direction'], float)
    u = float(v @ d)
    along = max(u, 0.0)
    r2 = max(float(v @ v) - u * u, 0.0)
    w = j['nozzle'] / 2 + j['spread'] * along
    decay = min(1.0, 5 * j['nozzle'] / max(along, 1e-6))
    ramp = min(1.0, max(0.0, (u + j['nozzle'] / 2) / j['nozzle']))
    s += j['sigma0'] * decay * math.exp(-r2 / (w * w)) * math.exp(-along / j['reach']) * ramp
    return s


def glow(W, F, p, d, throw, eye, step=0.5, seen_check=True):
    """The design metric G for one beam seen from one eye (see above). Returns (G, G inside the near field)."""
    import numpy as np
    p, d, e = np.asarray(p, float), np.asarray(d, float), np.asarray(eye, float)
    G = Gin = tau = 0.0
    nz = np.asarray(F['jet']['position'], float)
    n = max(2, int(min(throw, 60.0) / step))
    for k in range(n):
        s = (k + 0.5) * step
        x = p + d * s
        sg = sigma_at(F, x)
        tau += sg * step
        to_eye = e - x
        L = float(np.linalg.norm(to_eye))
        c = float(d @ to_eye) / L
        if seen_check:
            t, _, _ = W.cast(e, (-to_eye / L)[None, :], reach=L + 1, skip=('audience',))
            if t[0] < L - 0.4:
                continue
        g = sg * hg(c) * math.exp(-tau) * math.exp(-F['fill'] * L) * step
        G += g
        if float(np.linalg.norm(x - nz)) <= F['blob']['radius'] * 1.2:
            Gin += g
    return G, Gin


def tune(repo, out, upto='T6'):
    """Apply the tunes in order up to `upto` (T1..T6) and write the file: each tune can be its own commit."""
    import numpy as np
    import moxir_v2 as M
    import occlusion_sky as S
    S.wait_cool()
    W = S.World(repo)
    B = json.load(open(os.path.join(repo, RIG_B)))
    T = copy.deepcopy(B)
    tunes = []
    byid = {f['id']: f for f in T['fixtures']}
    smoke = next(f for f in T['fixtures'] if f['type'] == 'up-yz31p')
    plane1 = [f for f in T['fixtures'] if f['part'].startswith('plane 1')]
    old_smoke = dict(p=list(smoke['p']), r=list(smoke['r']))
    # the old file put the machine at (-8, 1, -3) and SAID "fan into the depth (-z)", but r [0,0,0] blows +Z (the room drew it
    # toward the stage; epic-build ignored r until 40a10bf8). Its field, as the room drew it:
    F_old = field_numbers(repo, [old_smoke['p'][0], old_smoke['p'][1] + 0.1, old_smoke['p'][2]], [0, 0, 1])

    def metric(fx, F, eyes=('floor', 'entry')):
        out = {}
        for e in eyes:
            g = gi = 0.0
            for f in fx:
                p = np.array([f['p'][0], f['p'][1], f['p'][2]])
                d = __import__('lights_beta_options').aim_dir(f['r'])
                a, b = glow(W, F, p, d, f.get('throw_m') or 60.0, EYES[e])
                g, gi = g + a, gi + b
            out[e] = {'G': round(g, 5), 'G_near_field': round(gi, 5)}
        return out

    before = {k: metric(plane1, F_old[k]) for k in ('t10', 't40', 'dry')}
    mid = after = None
    rows = []
    stop = lambda tid: tid == upto
    t4 = []

    def write_file():
        # ---- the file: power and DMX re-run on the moved units (moxir_v2.circuits / patch), checks
        units = [dict(f, type=f['type']) for f in T['fixtures'] if f['type'] in ('up-b380f', 'up-pl5403', 'up-yz31p')]
        branches, slots = M.patch(units)
        circ, ph = M.circuits(units)
        cid = {u: c['circuit'] for c in circ for u in c['units']}
        dm = {u['id']: u['dmx'] for u in units}
        for f in T['fixtures']:
            if f['id'] in cid:
                f['circuit'], f['dmx'] = cid[f['id']], dm[f['id']]
        T['power'] = {'circuits': circ, 'phases_w': ph}
        T['patch'] = {'branches': branches, 'slots': slots}
        T['checks'] = dict(T['checks'], circuits=len(circ), circuits_ok=all(c['ok'] for c in circ), phases_w=ph, branches=branches, slots=slots,
                           beams_into_audience=sum(r.get('rays_into_audience', 0) > 0 for r in rows), plane1_glow=after)
        T.update({'snapshot': 'moxir-v2-planes-tuned-%s' % DATE, 'version': 'MOXIR v2 B tuned · one machine', 'title': 'MOXIR v2 B tuned · three planes, one machine',
                  'what': B['what'] + ' Tuned for ONE smoke machine: the machine under the plane-1 fan, the fan leaning toward the floor, the two columns that frame the stage lit, pre-haze 40 min.',
                  'written_by': 'scripts/place/moxir_v2_true.py tune (from %s)' % RIG_B, 'date': DATE, 'tuned_from': RIG_B, 'tunes': tunes,
                  'design_metric': {'what': 'G = first-order single scattering toward an eye, per unit beam flux (see moxir_v2_true.py)', 'plane1': {'before': before, 'after_T2': mid, 'after_T3': after}}})
        for c in T['cues']:
            c['name'] = c['name'].replace('B · Three planes of depth', 'B tuned · one machine')
        json.dump(T, open(os.path.join(repo, RIG_BT), 'w'), indent=1, default=lambda o: o.item() if hasattr(o, 'item') else (o.tolist() if hasattr(o, 'tolist') else str(o)))
        if out:
            os.makedirs(out, exist_ok=True)
            json.dump({'tunes': tunes, 'plane1_glow': {'before': before, 'after_T2': mid, 'after_T3': after}, 'circuits_ok': T['checks']['circuits_ok']},
                      open(os.path.join(out, 'tunes.json'), 'w'), indent=1, default=str)
        print(json.dumps({'before': before, 'after_T2': mid, 'after_T3': after}, indent=1))
        for r in rows:
            print(r)
        for x in t4:
            print(x)



    # ---- T1 the air: the night is planned on the closed-hall case and the machine is started 40 min before doors
    T['atmosphere'] = dict(STATES['t40'][2], anisotropyWhy='HG g 0.74: lasers-exact.md 3.2 (own Mie computation), ASSUMPTION backed by computation')
    T['haze_plan'] = {
        'state': 'the tank state at doors: closed hall (doors, roof vents and extraction shut while hazing), 0.5 air changes/h, droplets that do not dry',
        'pre_haze': 'start the machine 40 min before doors at full, continuous; refill the 6 L tank at doors (a second tank keeps the hall rising toward ~0.02 /m at ~2 h)',
        'why': 'the hall\'s haze builds with the time the ONE machine has run: ~0.0024 /m at 10 min, ~0.0086 /m at 40 min (two-zone model, UNVALIDATED). Pre-hazing is standard practice; it moves the doors moment from the 10-min picture to the 40-min one (3.6x the air).',
        'owed': 'the decay test + transmissometer on site (simulation-method 3.4 step 8); the venue\'s rule on shutting vents; the machine\'s real output',
    }
    tunes.append({'id': 'T1', 'title': 'The air: pre-haze 40 min with the hall closed', 'change': 'rig file: atmosphere = the one machine\'s two-zone haze (closed hall, no drying, 40 min); haze_plan written',
                  'why': T['haze_plan']['why'], 'kind': 'operation + data (no lamp changed)'})
    if stop('T1'):
        return write_file()

    # ---- T2 the machine: under the plane-1 fan, blowing through it
    xs = [-7.25, -6.25, -5.25, -4.25, -3.25, -2.25]
    for f, x in zip(sorted(plane1, key=lambda f: f['p'][0]), xs):
        f['p'] = [x, f['p'][1], f['p'][2]]
        f['position'] = 'behind the DJ, base down on the floor, 1.0 m pitch (was 1.5 m), the row centred on the smoke machine'
    smoke['p'] = [-4.75, 1.0, -6.2]
    smoke['r'] = [0.0, 0.0, 0.0]          # +Z: toward the stage, through the row of heads
    smoke['position'] = ('on a 1.0 m flight case 1.2 m behind the middle of the plane-1 row (x -4.75, z -6.2), fan at lowest speed blowing +z '
                         'through the six heads toward the back of the stage: the only dense air one machine makes (~0.26 /m within ~3 m) '
                         'is where all six beams start. Refills from behind the stage (crew access along the back wall line). Was (-8.0, -3.0).')
    nozzle = [smoke['p'][0], smoke['p'][1] + 0.1, smoke['p'][2]]
    F = field_numbers(repo, nozzle, [0, 0, 1])
    dist = [round(float(np.linalg.norm(np.array([f['p'][0], 0.7, f['p'][2]]) - np.array(nozzle))), 2) for f in sorted(plane1, key=lambda f: f['p'][0])]
    tunes.append({'id': 'T2', 'title': 'The machine under the fan', 'change': 'smoke machine (-8.0, 1.0, -3.0) -> (-4.75, 1.0, -6.2), blowing +z; plane-1 heads 1.5 m -> 1.0 m pitch, centred on it (x -7.25 ... -2.25, z -5 kept)',
                  'why': 'one machine thickens the air only near itself (near field ~0.26 /m vs the hall 0.0024-0.0086 /m). Before, 2 of the 6 plane-1 heads stood inside it; now all 6 bases are %s m from the nozzle (the field fades from 2.4 to 3.6 m).' % dist,
                  'kind': 'placement (data)'})
    if stop('T2'):
        return write_file()
    mid = {k: metric(plane1, F[k]) for k in ('t10', 't40', 'dry')}

    # ---- T3 plane 1 aimed through the plume and toward the floor (forward scatter), the same safety checks as v2
    fan = [(250, 330, 46, 54), (245, 335, 58, 66), (240, 340, 72, 82), (20, 120, 72, 82), (25, 115, 58, 66), (30, 110, 46, 54)]
    for f, sec in zip(sorted(plane1, key=lambda f: f['p'][0]), fan):
        o = np.array([f['p'][0], S.HEAD_Y, f['p'][2]])
        az0, az1, el0, el1 = sec
        cands = [np.array(M.dir_of(a % 360, e)) for a in np.arange(az0, az1 + 1e-6, 2.0) for e in np.arange(el0, el1 + 1e-6, 1.5)]
        t, names, cls = W.cast(o, np.array(cands), reach=120.0)
        legal = []
        for i, dd in enumerate(cands):
            if cls[i] == 'audience' or cls[i] in S.GLASS or cls[i] == 'lantern frame':
                continue
            ti = 120.0 if not np.isfinite(t[i]) else float(t[i])
            if M.low_over_standing(o, dd, ti) < 0:
                continue
            g, _ = glow(W, F['t40'], o, dd, ti, EYES['floor'], step=1.0, seen_check=False)
            legal.append((g, i, ti))
        best = None
        for g, i, ti in sorted(legal, reverse=True)[:12]:
            chk = S.beam_check(W, o, cands[i], half_deg=0.9)
            if chk['rays_into_audience'] or any('glass' in e or 'lantern frame' in e for e in chk['ends']):
                continue
            gf, _ = glow(W, F['t40'], o, cands[i], ti, EYES['floor'], step=0.5)
            ge, _ = glow(W, F['t40'], o, cands[i], ti, EYES['entry'], step=0.5)
            if best is None or gf + ge > best[0]:
                best = (gf + ge, i, ti, chk)
        old_d = __import__('lights_beta_options').aim_dir(f['r'])
        if best is None:
            rows.append({'id': f['id'], 'kept': 'no legal direction scored better; aim kept'})
            continue
        _, i, ti, chk = best
        d = cands[i]
        az, el = S.az_el(d)
        f['r'] = M.rot_for_dir(d)
        f['throw_m'] = R3(ti) if ti < 120 else None
        f['ends_on'] = names[i]
        f['position'] = f['position'] + '; aim %.0f/%.0f deg (az/el), pen %.1f m' % (az, el, M.pen_radius(o, d) or 0)
        rows.append({'id': f['id'], 'from_dir': [R3(v) for v in old_d], 'to_dir': [R3(v) for v in d], 'az_el': [az, el], 'throw_m': f['throw_m'], 'ends_on': names[i],
                     'lowest_over_standing_m': R3(M.low_over_standing(o, d, ti) + M.CLEAR_OVER) if M.low_over_standing(o, d, ti) < 1e6 else None,
                     'rays_into_audience': chk['rays_into_audience'], 'pen_m': M.pen_radius(o, d)})
    after = {k: metric(plane1, F[k]) for k in ('t10', 't40', 'dry')}
    tunes.append({'id': 'T3', 'title': 'Plane 1 aimed through the plume, leaning toward the floor', 'change': 'the six plane-1 aims re-searched inside the fan\'s sectors (left heads lean -x, right +x, now also toward +z), scored by the metric G',
                  'why': 'haze scatters forward (g 0.74): a beam seen at 90 deg sends ~1/14 of what it sends at 30 deg. Leaning the fan toward the audience lowers the angle the floor sees it at; the search keeps every v2 safety rule (no ray into the crowd or glass, >= 3 m over every standing level, the whole beam checked).',
                  'aims': rows, 'kind': 'aim (data)'})
    if stop('T3'):
        return write_file()

    # ---- T4 steel that reads without haze: three halo PARs graze the columns that frame the stage
    def graze(x_side, gz, y, why):
        a = math.radians(4.05)
        return {'p': [R3(11.157 * x_side), y, gz], 'dir': [math.sin(a) * x_side, math.cos(a), 0.0], 'why': why}
    regraze = {'rig-par-planes-01': graze(-1, 6.0, 0.31, 'floor bracket at the nave column x -12 z 6 (the left column framing the stage from the floor), 0.44 m off its face, leaned 4 deg onto it; in the public half: a guard cage owed'),
               'rig-par-planes-04': graze(1, 6.0, 0.31, 'floor bracket at the nave column x +12 z 6, 0.44 m off its face, leaned 4 deg onto it; in the public half: a guard cage owed'),
               'rig-par-planes-05': graze(1, 0.5, 2.71, 'on the machine line\'s top (2.4 m) at the nave column x +12 z 0.5 (the right column framing the stage from the floor), leaned 4 deg onto it; out of reach; the venue\'s OK to stand on the machine owed')}
    for fid, g in regraze.items():
        f = byid[fid]
        d = np.asarray(g['dir'], float) / np.linalg.norm(g['dir'])
        st = S.par_on_steel(W, g['p'], d, 15)
        t4.append({'id': fid, 'from': {'p': f['p'], 'lux_on_steel_median': f.get('lux_on_steel_median'), 'part': f['part']},
                   'to': {'p': g['p'], 'column_lit_m': st['column_lit_m'], 'lux_on_steel': st['lux_on_steel'], 'steel_pct': st['steel_pct']}})
        f.update({'p': g['p'], 'r': M.rot_for_dir(d), 'part': 'stage columns', 'position': g['why'], 'colour': EMBER,
                  'lit_column_m': st['column_lit_length_m'], 'lux_on_steel_median': (st['lux_on_steel'] or [None, None])[1]})
    tunes.append({'id': 'T4', 'title': 'Steel that reads without haze: the two columns that frame the stage', 'change': 'halo PARs 01, 04, 05 (they lit roof steel neither the floor nor the entry view sees) -> grazing the nave columns at x -12 z 6, x +12 z 6 and x +12 z 0.5',
                  'why': 'a lit surface needs no air. From the floor these two columns are the largest dark shapes either side of the DJ; lit from the foot they frame the stage in every haze state. The halo\'s own job (a glow in the air over the DJ) is what thin haze takes away.',
                  'pars': t4, 'kind': 'placement + aim (data)'})
    if stop('T4'):
        return write_file()

    # ---- T5 the looks: what reads without haze carries the dark look; plane 3 under the same glare budget as before
    for lk in T['looks']:
        parts = lk['parts']
        if lk['id'] == 'dark':
            parts['columns'] = [EMBER, 0.5]
            parts['stage columns'] = [EMBER, 0.6]
        if lk['id'] == 'peak':
            parts['stage columns'] = [EMBER, 0.8]
            parts['plane 3 (the far end)'] = [EMBER, 0.7]
    tunes.append({'id': 'T5', 'title': 'The looks: steel carries the dark; plane 3 at the old glare budget', 'change': 'dark: columns 0.25 -> 0.5, stage columns 0.6 (new); peak: stage columns 0.8, plane 3 0.35 -> 0.7',
                  'why': 'faders, inside each lamp\'s real output, never a gain on the room. Plane 3 runs toward the crowd and was capped at 0.35 against white-out at 0.0169 /m; its forward scatter is proportional to the haze, so at the tank state (~0.0086 /m, half) 0.7 gives the air the same luminance the cap allowed. Checked on the frames: white-out of the floor view at the peak.',
                  'kind': 'look levels (data)'})
    if stop('T5'):
        return write_file()

    # ---- T6 narrow and open: what the kit allows, said
    T['requires'] = {'par_lens': '15 deg (the rental\'s PL5403 lens is UNKNOWN; with 25 deg the columns read about a third as bright: occlusion_sky par_on_steel)',
                     'b380f_optics': 'open beam: no gobo, no prism, no frost in the haze looks',
                     'why': 'in thin air a beam is seen by its flux per width: the B380F\'s fixed 1.8 deg beam is already its narrowest; a gobo or prism takes flux out of the shaft (beamOptics.js: a prism of N facets gives N beams of 1/N the candela), so each shaft gets fainter. The room\'s gobo shapes are ASSUMED (no image of the wheel), so the claim that texture helps the eye in thin haze is not testable here.'}
    tunes.append({'id': 'T6', 'title': 'Narrow and open', 'change': 'rig file `requires`: PARs with the 15 deg lens; B380F open (no gobo, prism or frost) in the haze looks',
                  'why': T['requires']['why'], 'kind': 'spec (data)'})

    return write_file()

# ====================================================================== PAGE: for a theatre director, pictures first
CAPTIONS = {
    'b-old-dark-floor': 'The old picture\'s air: the whole hall glows ember in a red veil. It looks full — but one machine never makes this.',
    'b-old-peak-floor': 'Old air at the peak: roof, columns and beams swim in pink-white fog. Dramatic, but it is four machines\' haze.',
    'b-old-dark-entry': 'From the door, old air: a red tunnel of fog with a bright core at the stage.',
    'b-old-peak-entry': 'From the door at the peak, old air: everything washed in warm haze — atmospheric, and not what we will have.',
    'b-t40-dark-floor': 'B at 40 min: the fog veil is gone and the hall is black; the fan behind the DJ and the red pools on the roof carry it. Strong, but small.',
    'b-t40-peak-floor': 'B at 40 min, peak: beams read as shafts, the roof steel catches red pools, ash beams cut in from the sides. Cool, and harder than before.',
    'b-t40-dark-entry': 'B at 40 min from the door: a glowing stage island at the end of a dark hall; the side spans show as red dashes between columns.',
    'b-t40-peak-entry': 'B at 40 min from the door, peak: the roof steel lit in pieces over the stage; the depth now comes from the columns, not the air.',
    'b-t10-dark-floor': 'B 10 min after the machine starts: the fan is thin, the side spans fade, the hall is mostly black. Not yet epic.',
    'b-t10-peak-floor': 'B at 10 min, peak: roof pools and the side ash beams carry it; the air between them is nearly empty.',
    'b-t10-dark-entry': 'B at 10 min from the door: a small red knot at the far end of a dark hall. Weak.',
    'b-t10-peak-entry': 'B at 10 min from the door, peak: the stage and roof read, the beams only faintly. Thin.',
    'b-dry-dark-floor': 'B at the floor of the range (vents open, the fog dries): only the two beams beside the machine glow. Not enough.',
    'b-dry-peak-floor': 'Floor of the range, peak: lit steel and two glowing stubs; the beams\' shapes are gone. Flat.',
    'b-dry-dark-entry': 'Floor of the range from the door: a faint red spot. Nothing epic.',
    'b-dry-peak-entry': 'Floor of the range from the door, peak: roof steel faintly lit, no beams — what a ventilated hall would give.',
    'bt-t10-dark-floor': 'Tuned B at 10 min: six ember shafts rise out of the smoke behind the DJ and fan toward you; both stage columns glow. It reads already.',
    'bt-t10-peak-floor': 'Tuned B at 10 min, peak: the fan, the lit columns, the roof pools, ash lines on the sides — the hall in layers even in thin air.',
    'bt-t10-dark-entry': 'Tuned B at 10 min from the door: the fan is a bright crown over the stage; the rest stays dark and raw.',
    'bt-t10-peak-entry': 'Tuned B at 10 min from the door, peak: a crown of beams, lit roof, side-span dashes; the depth comes from the steel.',
    'bt-t40-dark-floor': 'Tuned B at 40 min (the tank state): the fan is thick and wide and lands in red pools on the roof; dark all around. The strongest dark frame.',
    'bt-t40-peak-floor': 'Tuned B at 40 min, peak: the full picture — fan, roof, lit columns, ash on the sides, the sheen on the floor. Epic from the floor.',
    'bt-t40-dark-entry': 'Tuned B at 40 min from the door: a burning stage at the end of a black nave. A good first sight.',
    'bt-t40-peak-entry': 'Tuned B at 40 min from the door, peak: stage and roof steel lit, ash lines between the far columns; the depth reads.',
    'bt-dry-dark-floor': 'Tuned B at the floor of the range: five shafts still glow in the plume behind the DJ, and the columns are lit. Still a picture.',
    'bt-dry-peak-floor': 'Floor of the range, peak: the fan and the lit steel survive; the side beams are gone. This is the tune\'s insurance.',
    'bt-dry-dark-entry': 'Floor of the range from the door: a small glowing fan in a black hall. Modest, but alive.',
    'bt-dry-peak-entry': 'Floor of the range from the door, peak: the fan and lit roof steel, no air beyond. The honest minimum.',
    'a-old-dark-floor': 'A with the old air: red fog everywhere, the corridors glow. Pretty — not real with one machine.',
    'a-old-peak-floor': 'A, old air, peak: white-pink haze fills the hall; the corridor beams are lost in it.',
    'a-old-dark-entry': 'A, old air, from the door: a red fog tunnel.',
    'a-old-peak-entry': 'A, old air, from the door at the peak: the whole nave hazy pink.',
    'a-t10-dark-floor': 'A at 10 min: the backlight row reads, the corridors far behind the stage barely show. Mostly dark.',
    'a-t10-peak-floor': 'A at 10 min, peak: white corridor beams through the steel and red roof pools — the steel reads, the air does not.',
    'a-t10-dark-entry': 'A at 10 min from the door: a faint knot at the end. Weak.',
    'a-t10-peak-entry': 'A at 10 min from the door, peak: the roof lit over the stage, a few white lines. Thin.',
    'a-t40-dark-floor': 'A at 40 min: backlight and corridors show behind the stage; its machine stands 20 m back, far from where you look.',
    'a-t40-peak-floor': 'A at 40 min, peak: steel and roof pools, white corridor lines — flatter than tuned B.',
    'a-t40-dark-entry': 'A at 40 min from the door: a dim red depth; the corridors hide behind the stage.',
    'a-t40-peak-entry': 'A at 40 min from the door, peak: roof lit, corridors faint — its depth sits where the floor cannot see it.',
}
VIEW_WORDS = {('dark', 'floor'): 'dark look · on the dance floor, eye 1.7 m', ('peak', 'floor'): 'peak look · on the dance floor, eye 1.7 m',
              ('dark', 'entry'): 'dark look · at the entry, eye 1.7 m', ('peak', 'entry'): 'peak look · at the entry, eye 1.7 m'}
ORDER = [('dark', 'floor'), ('peak', 'floor'), ('dark', 'entry'), ('peak', 'entry')]


def contact_sheet(out):
    from PIL import Image, ImageDraw
    rows = [('b', 'old'), ('b', 't40'), ('b', 't10'), ('b', 'dry'), ('bt', 't40'), ('bt', 't10'), ('bt', 'dry'), ('a', 'old'), ('a', 't40'), ('a', 't10')]
    W, H, pad, lab = 480, 300, 6, 22
    sheet = Image.new('RGB', (4 * (W + pad) + 260, len(rows) * (H + lab + pad) + 40), (12, 12, 13))
    d = ImageDraw.Draw(sheet)
    d.text((10, 12), 'MOXIR v2 · the true look with ONE smoke machine · measurement mode EV100 %.2f fixed · Full quality · RTX 3080 · 2026-10-09' % EV100, fill=(232, 228, 220))
    for c, (look, view) in enumerate(ORDER):
        d.text((260 + c * (W + pad) + 4, 26), VIEW_WORDS[(look, view)], fill=(160, 160, 160))
    for r, (lay, st) in enumerate(rows):
        y = 40 + r * (H + lab + pad)
        d.text((10, y + lab + H // 2 - 14), LAYOUTS[lay][0], fill=(255, 176, 138))
        d.text((10, y + lab + H // 2 + 2), STATES[st][0].replace('\u2014', '-'), fill=(232, 228, 220))
        for c, (look, view) in enumerate(ORDER):
            f = os.path.join(out, 'frames', '%s-%s-%s-%s.png' % (lay, st, look, view))
            if os.path.exists(f):
                sheet.paste(Image.open(f).convert('RGB').resize((W, H)), (260 + c * (W + pad), y + lab))
    sheet.save(os.path.join(out, 'contact-sheet.png'))


def page(repo, out):
    import html
    contact_sheet(out)
    luma = json.load(open(os.path.join(out, 'frame-luma.json')))
    T = json.load(open(os.path.join(repo, RIG_BT)))
    g = T['design_metric']['plane1']
    E = html.escape

    def fig(name, wide=False):
        lay, st, look, view = name.split('-')
        L = luma.get(name, {})
        return ('<figure%s><a href="frames/%s.png"><img src="frames/%s.png" alt="%s" loading="lazy"></a><figcaption><b>%s · %s · %s</b>'
                '<span>%s</span><small>mean luminance %s · white-out %s %%</small></figcaption></figure>') % (
            ' class="wide"' if wide else '', name, name, E(CAPTIONS.get(name, name)), E(LAYOUTS[lay][0]), E(STATES[st][0]), E(VIEW_WORDS[(look, view)]),
            E(CAPTIONS.get(name, '')), L.get('mean_Y', '–'), L.get('white_pct', '–'))

    def pair(a, b):
        return '<div class="pair">%s%s</div>' % (fig(a), fig(b))

    tunes = ''.join('<tr><td>%s</td><td><b>%s</b><br>%s</td><td>%s</td></tr>' % (E(t['id']), E(t['title']), E(t['change']), E(t['why'])) for t in T['tunes'])
    states = ''.join('<tr><td>%s</td><td>%s</td></tr>' % (E(v[0]), E(v[1])) for k, v in STATES.items())
    glow = ''.join('<tr><td>%s</td><td>%.4f → %.4f (×%.1f)</td><td>%.4f → %.4f (×%.1f)</td></tr>' % (
        E(STATES[st][0]), g['before'][st]['floor']['G'], g['after_T3'][st]['floor']['G'], g['after_T3'][st]['floor']['G'] / g['before'][st]['floor']['G'],
        g['before'][st]['entry']['G'], g['after_T3'][st]['entry']['G'], g['after_T3'][st]['entry']['G'] / g['before'][st]['entry']['G']) for st in ('t10', 't40', 'dry'))
    lumarows = ''.join('<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>' % (
        E(STATES[st][0]), E(VIEW_WORDS[(look, view)]), luma.get('b-%s-%s-%s' % (st, look, view), {}).get('mean_Y'), luma.get('bt-%s-%s-%s' % (st, look, view), {}).get('mean_Y'),
        luma.get('bt-%s-%s-%s' % (st, look, view), {}).get('white_pct')) for st in ('t10', 't40', 'dry') for look, view in ORDER)
    sec_bt = ''.join('<h3>%s</h3><p class="note">%s</p>%s' % (E(STATES[st][0]), E(STATES[st][1]), ''.join(pair('b-%s-%s-%s' % (st, l, v), 'bt-%s-%s-%s' % (st, l, v)) for l, v in ORDER)) for st in ('t40', 't10', 'dry'))
    sec_old = ''.join(pair('b-old-%s-%s' % (l, v), 'b-t40-%s-%s' % (l, v)) for l, v in ORDER)
    sec_a = ''.join('<div class="grid">%s</div>' % ''.join(fig('a-%s-%s-%s' % (st, l, v)) for l, v in ORDER) for st in ('old', 't40', 't10'))
    doc = TEMPLATE.format(ev=EV100, hero=pair('b-old-peak-floor', 'bt-t40-peak-floor'), sec_old=sec_old, sec_bt=sec_bt, sec_a=sec_a, tunes=tunes, states=states, glow=glow, lumarows=lumarows)
    open(os.path.join(out, 'index.html'), 'w').write(doc)
    print('page -> %s' % os.path.join(out, 'index.html'))


TEMPLATE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>MOXIR v2 true look</title>
<style>
:root {{ --bg:#0b0c0e; --panel:#141518; --ink:#e8e4dc; --dim:#9aa0a8; --ember:#ff3a12; --ash:#e8e4dc; --line:#2a2c31; }}
* {{ box-sizing:border-box; border-radius:0; }}
body {{ margin:0; background:var(--bg); color:var(--ink); font:15px/1.5 system-ui, sans-serif; }}
main {{ max-width:1500px; margin:0 auto; padding:24px 16px 64px; }}
h1 {{ font-size:26px; margin:0 0 6px; }} h2 {{ font-size:20px; margin:42px 0 8px; border-top:1px solid var(--line); padding-top:18px; }}
h3 {{ font-size:16px; margin:26px 0 4px; color:#ffb08a; }}
.lead {{ font-size:17px; max-width:980px; }} .lead b {{ color:#ffb08a; }}
.note {{ color:var(--dim); max-width:980px; margin:4px 0 10px; }}
.pair {{ display:grid; grid-template-columns:1fr 1fr; gap:10px; margin:10px 0 16px; }}
.grid {{ display:grid; grid-template-columns:repeat(4, 1fr); gap:10px; margin:10px 0; }}
figure {{ margin:0; background:var(--panel); border:1px solid var(--line); }}
figure img {{ width:100%; display:block; }}
figcaption {{ padding:8px 10px 10px; font-size:13.5px; }} figcaption b {{ display:block; color:var(--dim); font-weight:600; font-size:12px; }}
figcaption span {{ display:block; margin:3px 0; }} figcaption small {{ color:#6f747b; }}
table {{ border-collapse:collapse; width:100%; margin:10px 0; font-size:13.5px; }}
td, th {{ border:1px solid var(--line); padding:6px 8px; vertical-align:top; text-align:left; }} th {{ color:var(--dim); font-weight:600; }}
.reco {{ background:var(--panel); border-left:3px solid var(--ember); padding:12px 16px; max-width:1100px; }}
code, pre {{ font:13px ui-monospace, monospace; }} pre {{ background:var(--panel); padding:10px; overflow:auto; border:1px solid var(--line); }}
@media (max-width: 800px) {{ .pair, .grid {{ grid-template-columns:1fr; }} }}
</style></head><body><main>
<h1>MOXIR v2 — what ONE smoke machine really shows</h1>
<p class="lead">The pictures you saw on 10-09 were drawn with the air of <b>four</b> machines. With the one machine we have,
the hall does <b>not</b> fill with glowing fog: it stays dark, and what reads is the beams near the smoke, the steel they
land on, and the columns we light. Layout B, tuned for that, still makes a strong picture from the dance floor —
left: the old picture, right: B tuned, 40 minutes after the machine starts.</p>
{hero}
<div class="reco"><b>Recommendation.</b> Take <b>B tuned</b>. Start the machine <b>40 minutes before doors</b> with the hall
closed (doors, roof vents, extraction shut while hazing) and refill the tank at doors. Then the fan of six ember shafts
behind the DJ, the lit columns and the red pools on the roof steel carry the night, even if the air stays thinner than
planned. Do not expect the soft red fog of the old pictures: one machine cannot make it in this hall. Measure the real
haze on site before the show (a lux meter through 20 m of haze); if you ever want the full-hall glow back, it
takes more machine output, not a lighting change.</div>

<h2>Old air vs the true air — layout B</h2>
<p class="note">Left: the old pictures' air (0.0169 /m everywhere). Right: one machine, 40 min in, the closed hall (~0.0086 /m in
the hall, much denser right around the machine). Same lamps, same camera, same exposure.</p>
{sec_old}

<h2>B vs B tuned — three moments of the night</h2>
<p class="note">Left: B as it was drawn on 10-09. Right: B tuned for one machine. The haze is the same on both sides of each pair.</p>
{sec_bt}

<h2>A (the nave corridors), for contrast</h2>
<p class="note">Rows: old air, 40 min, 10 min. Columns: dark on the floor, peak on the floor, dark at the entry, peak at the entry.</p>
{sec_a}

<h2>What changed in B tuned</h2>
<p class="note">Each change is a small, labelled change in B's rig file (scripts/place/rigs/moxir-v2-planes-tuned-2026-10-09.json, one
commit each). None of them makes the room brighter by itself: no gain, no exposure change.</p>
<table><tr><th></th><th>change</th><th>why</th></tr>{tunes}</table>

<h2>Numbers</h2>
<p class="note">The air, as the model gives it (UNVALIDATED: the two-zone model of one machine; nothing has been measured in the hall yet).</p>
<table><tr><th>state</th><th>what it is</th></tr>{states}</table>
<p class="note">Plane 1's glow in the air as seen from each eye — a design metric (first-order single scattering: the haze, the
forward-scatter of the droplets, the steel in the way), per unit of beam light. It ranks aims; it is not a brightness.</p>
<table><tr><th>state</th><th>floor eye: B → tuned</th><th>entry eye: B → tuned</th></tr>{glow}</table>
<p class="note">Frame brightness (mean relative luminance of the picture, interface strips excluded, frame_luma.py) and white-out
(share of near-white pixels) — a measure of the render, not of the hall.</p>
<table><tr><th>state</th><th>view</th><th>B mean</th><th>B tuned mean</th><th>B tuned white-out %</th></tr>{lumarows}</table>

<h2>How these pictures were made, and their limits</h2>
<ul class="note">
<li><b>Camera: EV100 {ev:.2f}, fixed</b> for every frame (measurement mode, docs/architecture/MEASUREMENT_MODE.md): the room's own
camera, set against club photographs (RIG_BUILD §20.1); a club photographer's ISO 3200, f/2, 1/60 s is EV100 2.9. No auto
exposure, no bloom, no glare veil, no work light; the hall's own bounce kept. No screen can show a dark-adapted eye
(CIE 191:2010): in the hall, your eyes will open up the dark parts more than these pictures do.</li>
<li><b>Full quality</b> (every lamp a real light, shadows). The room opens in Lite by default, where only 4 lamps light
surfaces: in Lite no PAR lights any steel.</li>
<li><b>The air</b> is the two-zone model of one machine (hazeZones.js), modelled on an equivalent machine at full output.
Its two big unknowns — how fast the hall's air changes and whether the fog dries — move the hall's haze over a range of
about 30×; the frames show the closed-hall case at 10 and 40 min and the floor of the range.</li>
<li>The floor shows mirror-like streaks of the beams under the stage: the room's floor model, more polished than this
concrete will be.</li>
<li><b>No lasers</b> in these pictures: the laser session's table of the six cubes on the free crane did not exist when this
was made, and no aim was invented.</li>
<li>Rendered on aylmo's RTX 3080 in the agent screen, on a scratch copy; nothing was written to dev, live or your own di.</li>
</ul>
<p class="note">Contact sheet of all 40 frames: <a href="contact-sheet.png">contact-sheet.png</a> · every number: <a href="tunes.json">tunes.json</a>,
<a href="frame-luma.json">frame-luma.json</a>, <a href="frames/frames.json">frames/frames.json</a>.</p>
</main></body></html>
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['plan', 'tune', 'page'])
    ap.add_argument('--repo', default='.')
    ap.add_argument('--out', default=os.path.expanduser('~/Downloads/moxir/v2-true'))
    ap.add_argument('--layouts', default='a,b,bt')
    ap.add_argument('--upto', default='T6', choices=['T1', 'T2', 'T3', 'T4', 'T5', 'T6'])
    A = ap.parse_args()
    repo = os.path.abspath(os.path.expanduser(A.repo))
    out = os.path.abspath(os.path.expanduser(A.out))
    if A.cmd == 'plan':
        plan(repo, A.layouts.split(','), out)
    elif A.cmd == 'tune':
        tune(repo, out, A.upto)
    elif A.cmd == 'page':
        page(repo, out)


if __name__ == '__main__':
    main()
