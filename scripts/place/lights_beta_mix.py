#!/usr/bin/env python3
# lights_beta_mix.py — MOXIR beta v0.9: ONE mixed light plot, every fixture re-placed (2026-10-07/08), as pictures.
# Nothing is built: it reads committed records, places and aims every fixture of the plot, checks it, and draws.
#
#   python3 -I scripts/place/lights_beta_mix.py --repo . --out ~/Downloads/moxir/stage       # pictures + page
#   python3 -I scripts/place/lights_beta_mix.py --repo . --check                             # the checks, JSON
#
# INPUTS (all in git):
#   rigs/moxir-lights-beta-mix-2026-10-07.json      the plot: every fixture's place, home aim, colour and why
#   rigs/moxir-beta-v0.9-lights-2026-10-07.json     today's fixtures (scratch doc v61), the "from" of every move
#   rigs/moxir-hall-2026-10-07-v8-show-back21.hall.json   the hall
#   lights_beta_options.py                           the shared geometry, ray casting, glare and laser maths (imported)
#
# METHOD (sources named; nothing measured on site):
#   - Geometry, aims, ray ends, glare (E = I/d^2), the ground-mover and DJ rules: as lights_beta_options.py.
#     Added: the crane runways (x +-11.35, 7.06-7.96 m) as steel every ray is tested against.
#   - Lasers: a LaserCube is a scanner, so a laser is checked as its whole FIELD, not one axis: 5 x 3 rays across
#     +-fan_az_deg (azimuth) and +-fan_el_deg (elevation) about the axis, each ray held to the planning rules
#     (mounted >= 3 m, rising, >= 3 m over any floor people stand on, ending on the SOLID roof deck, >= 0.3 m from
#     steel/chain/hoist). The field is a controller limit (projection zone) the laser operator sets and proves.
#     Ocular hazard: IEC 60825-1:2014 Table A.1 MPE for a visible CW beam at t = 0.25 s, H = 18 t^0.75 J/m^2, and
#     the static-beam NOHD (scanner-failure case, IEC TR 60825-3) — the same figures as the 10-07 report.
#     3 m vertical / 2.5 m lateral separation: the usual audience-separation terms of US FDA/CDRH laser-show
#     variances; here every ray is held >= 3 m over EVERY floor, which contains the 2.5 m lateral band.
#   - Front-row glare: eyes x +-5.35, z 25.8-27.8, 1.6 m. In a lamp's cone (half the beam angle) E = I/d^2; in the
#     field but outside the cone the intensity is below half the peak by the definition of beam angle (the 50 % points;
#     field angle at 10 %: the IES definition makers' datasheets use), so E <= 0.5 I/d^2 is stated as the bound.
#   - "Not overloaded": no more than 3 layers lit at once, counted by eye on the reference stills (method and
#     counts on the page); each look below is checked against it.
import argparse, base64, io, json, math, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.dont_write_bytecode = True   # importing the library must not leave a __pycache__ in the tree
import numpy as np
import lights_beta_options as L   # noqa: E402  (the shared library; its own drawing does not run on import)

ap = argparse.ArgumentParser()
ap.add_argument('--repo', default='.')
ap.add_argument('--plot', default='scripts/place/rigs/moxir-lights-beta-mix-2026-10-07.json')
ap.add_argument('--out', default=None)
ap.add_argument('--refs', default=None, help='folder of the private reference stills (linked, never embedded)')
ap.add_argument('--check', action='store_true')
a = ap.parse_args()
PLOT = json.load(open(os.path.join(a.repo, a.plot)))
G = L.G

# ------------------------------------------------------------------ extra steel: the crane runways
RUNWAYS = [L.Box.aabb('crane runway x %+.2f' % x, (x - 0.3, x + 0.3), (G['runway_bottom_m'], G['runway_top_m']),
                      (L.ENDS[0], L.ENDS[1]), 'crane') for x in (-G['crane_rail_x_m'], G['crane_rail_x_m'])]
L.SOLIDS.extend(RUNWAYS)
LANTERN_NAVE = G['lanterns'][0]

# ------------------------------------------------------------------ the plot
BODY = {'par': (0.30, 0.30, 0.30), 'beam': (0.46, 0.69, 0.31), 'laser': (0.155, 0.155, 0.155),
        'haze': (0.60, 0.35, 0.35), 'smoke': (0.55, 0.30, 0.30)}


def resolve(aim, f, i):
    r = aim['rule']
    p = f['p']
    if r == 'keep':
        return f['d0']
    if r == 'down':
        return np.array([0.0, -1.0, 0.0])
    if r == 'up':
        return np.array([0.0, 1.0, 0.0])
    if r == 'point':
        return L.unit(np.array(aim['target'], float) - p)
    if r == 'targets':
        return L.unit(np.array(aim['targets'][i], float) - p)
    if r == 'lean':   # tilt from vertical by deg, toward the nave axis (x) or toward the house (+z)
        t = math.radians(aim['deg'])
        if aim['toward'] == 'axis':
            s = -1.0 if p[0] > 0 else 1.0
            return L.unit([s * math.sin(t), math.cos(t), 0.0])
        return L.unit([0.0, math.cos(t), math.sin(t)])
    if r == 'crossz':
        return L.unit(np.array([aim['target_x'], aim['y'], p[2]]) - p)
    if r == 'laser':
        return L.unit(np.array(aim['target'][i], float) - p)
    if r == 'comb':
        return np.array([0.0, 1.0, 0.0])
    if r == 'splay':   # mirrored fans: lean out from the axis by deg (+ a small lean toward the house)
        s = 1.0 if p[0] > 0.05 else (-1.0 if p[0] < -0.05 else 0.0)
        t = math.radians(aim['deg'])
        return L.unit([s * math.sin(t), math.cos(t), math.tan(math.radians(aim.get('fwd_deg', 0)))])
    raise SystemExit('unknown aim rule %s' % r)


def build(look=None):
    """Every fixture of the plot. look: {group name: {aim, colour}} overrides for a cue state (positions never change)."""
    fx = L.today()
    by = {f['id']: f for f in fx}
    seen = set()
    for g in PLOT['groups']:
        ids = g['ids']
        for i, fid in enumerate(ids):
            if fid not in by:
                raise SystemExit('plot names %s, which the beta does not have' % fid)
            if fid in seen:
                raise SystemExit('%s is placed twice' % fid)
            seen.add(fid)
            f = by[fid]
            f['groupName'], f['layer'], f['why'] = g['name'], g['layer'], g['why']
            f['spare'] = bool(g.get('spare'))
            if 'positions' in g:
                f['p'] = np.array(g['positions'][i], float)
            ov = (look or {}).get(g['name'], {})
            aim = ov.get('aim', g.get('aim'))
            if f['d0'] is not None and aim:
                f['d'] = resolve(aim, f, i)
                f['r'] = L.rot_for_dir(f['d'])
            if ov.get('colour') or g.get('colour'):
                f['colour'] = ov.get('colour') or g['colour']
            if f['kind'] == 'laser' and not f['spare']:
                f['fan'] = (g['aim'].get('fan_az_deg', 0), g['aim'].get('fan_el_deg', 0))
                f['mount'] = g.get('mount', '')
            f['moved'] = bool(np.linalg.norm(f['p'] - f['p0']) > 0.01)
            f['reaimed'] = bool(f['d'] is not None and f['d0'] is not None and
                                math.degrees(math.acos(max(-1.0, min(1.0, float(f['d'] @ f['d0']))))) > 1.0)
    missing = [f['id'] for f in fx if f['id'] not in seen]
    if missing:
        raise SystemExit('the plot leaves out %s' % ', '.join(missing))
    return fx


def fan_rays(f, n_az=5, n_el=3):
    """The laser's field as rays: azimuth and elevation offsets about its axis."""
    d = f['d']
    az0 = math.atan2(d[0], d[2])
    el0 = math.asin(max(-1, min(1, d[1])))
    A, E = (math.radians(v) for v in f['fan'])
    out = []
    for da in np.linspace(-A, A, n_az) if A else [0.0]:
        for de in np.linspace(-E, E, n_el) if E else [0.0]:
            az, el = az0 + da, el0 + de
            out.append(np.array([math.cos(el) * math.sin(az), math.sin(el), math.cos(el) * math.cos(az)]))
    return out


def ray_fx(f, d, k):
    return dict(f, d=d, id='%s#%d' % (f['id'], k))


# ------------------------------------------------------------------ checks
EYES = L.EYES
FRONT = (EYES[:, 2] <= 27.8)


def glare_eyes(f):
    """Per eye: in the cone (E = I/d^2) or in the field only (E <= 0.5 I/d^2), with the line of sight tested."""
    if f['kind'] not in ('par', 'beam') or f['d'] is None:
        return None
    v = EYES - f['p'][None, :]
    dist = np.linalg.norm(v, axis=1)
    ang = np.degrees(np.arccos(np.clip((v @ f['d']) / dist, -1, 1)))
    half = L.BEAM_DEG[f['kind']] / 2
    I = L.INTENSITY_CD[f['kind']]
    out = []
    for i in np.where(ang <= 2 * half)[0]:
        dd = L.unit(EYES[i] - f['p'])
        blocked = any(b.cls != 'column' and (h := b.ray(f['p'], dd, 0.35)) is not None and h < dist[i] - 0.05 for b in L.SOLIDS + [L.DJ])
        if blocked:
            continue
        cone = bool(ang[i] <= half)
        out.append({'eye': [round(float(c), 2) for c in EYES[i]], 'front_row': bool(FRONT[i]), 'cone': cone,
                    'lux': round(float(I / dist[i] ** 2 * (1.0 if cone else 0.5)), 1)})
    return out


def body_box(f):
    w, h, d = BODY.get(f['kind'], (0.3, 0.3, 0.3))
    base = f['p'][1] - h / 2 if f['p'][1] > 2 else 0.0      # floor fixtures stand on the floor; hung ones are centred
    return L.Box.aabb('body ' + f['id'], (f['p'][0] - w / 2, f['p'][0] + w / 2), (base, base + h), (f['p'][2] - d / 2, f['p'][2] + d / 2))


def overlaps(b, c, gap=0.0):
    lo1, hi1 = b.corners().min(0), b.corners().max(0)
    lo2, hi2 = c.corners().min(0), c.corners().max(0)
    return bool(np.all(lo1 < hi2 + gap) and np.all(lo2 < hi1 + gap))


FLOOR_STUFF = [b for b in L.SOLIDS if b.cls in ('machine', 'riser', 'stage', 'column')]


def placement(f):
    """Inside a machine / the stage furniture / a column, or outside the hall."""
    if f.get('spare'):
        return {'inside': None, 'outside_hall': False}
    bb = body_box(f)
    hit = [b.id for b in FLOOR_STUFF if overlaps(bb, b)]
    if f['p'][1] > 2.5:  # hung fixtures sit on their own mount; the mount is the point
        hit = [h for h in hit if not h.startswith('column')]
    p = f['p']
    out = not (L.ENDS[0] < p[2] < L.ENDS[1] and L.WALLS[0] < p[0] < L.WALLS[1])
    return {'inside': hit or None, 'outside_hall': bool(out)}


def laser_rays_check(f):
    rays = []
    for k, d in enumerate(fan_rays(f)):
        r = L.laser_check(ray_fx(f, d, k))
        rays.append(r)
    worst_floor = min(r['min_over_floor_m'] for r in rays)
    aud = [r['min_over_audience_m'] for r in rays if r['min_over_audience_m'] is not None]
    steel = min(rays, key=lambda r: r['nearest_steel']['m'])['nearest_steel']
    ends = sorted({r['ends_on'] for r in rays})
    errs = sorted({e for r in rays for e in r['errors']})
    return {'id': f['id'], 'group': f['groupName'], 'why': f['why'], 'mount': f.get('mount', ''), 'at': [round(v, 2) for v in f['p']], 'rays': len(rays),
            'fan_deg': list(f['fan']), 'ends_on': ends, 'min_over_floor_m': worst_floor,
            'min_over_audience_m': min(aud) if aud else None, 'nearest_steel': steel,
            'axis_to': [round(v, 2) for v in f['p'] + L.beam_end(f['p'], f['d'], L.REACH['laser'])[0] * f['d']],
            'path_m': [min(r['path_m'] for r in rays), max(r['path_m'] for r in rays)],
            'errors': errs, 'pass': not errs}


def check(fx):
    res = {'counts': {}, 'hung_lasers': 0, 'spare_lasers': 0, 'lasers': [], 'glare': {}, 'front_row': {}, 'dj_narrow': [],
           'mover_eye_zone': [], 'placement': {}, 'ends': {}, 'blocked_by_machine': [], 'on_truss': []}
    for f in fx:
        res['counts'][f['type']] = res['counts'].get(f['type'], 0) + 1
        pl = placement(f)
        if pl['inside'] or pl['outside_hall']:
            res['placement'][f['id']] = pl
        if f['kind'] == 'laser':
            if f['spare']:
                res['spare_lasers'] += 1
                continue
            res['hung_lasers'] += 1
            if abs(f['p'][2] - 21.0) < 0.3 and 3.0 < f['p'][1] < 7.0:
                res['on_truss'].append(f['id'])
            res['lasers'].append(laser_rays_check(f))
            for d in fan_rays(f):
                if L.DJ.ray(f['p'], d, 0.3) is not None:
                    res['dj_narrow'].append(f['id'])
                    break
            continue
        if f['kind'] in ('par', 'beam') and f['d'] is not None:
            t, what, cls = L.beam_end(f['p'], f['d'], L.REACH[f['kind']], skip=('truss',) if f['p'][1] > 3 else ())
            res['ends'][f['id']] = {'ends_on': what, 'at': [round(v, 2) for v in f['p'] + t * f['d']], 'm': round(t, 1)}
            intended = f.get('groupName', '').startswith(('the machine reveal', 'the press crown'))
            if cls == 'machine' and t < 3.5 and not intended:
                res['blocked_by_machine'].append(f['id'])
            g = glare_eyes(f)
            if g:
                res['glare'][f['id']] = {'eyes_in_cone': sum(e['cone'] for e in g), 'eyes_in_field': len(g),
                                         'max_lux': max(e['lux'] for e in g)}
                fr = [e for e in g if e['front_row']]
                if fr:
                    res['front_row'][f['id']] = max(fr, key=lambda e: e['lux'])
            if f['kind'] == 'beam':
                if L.mover_eye_zone(f):
                    res['mover_eye_zone'].append(f['id'])
                t2, _, _ = L.beam_end(f['p'], f['d'], L.REACH['beam'], skip=('truss', 'the DJ'))
                h = L.DJ.ray(f['p'], f['d'], 0.3)
                if h is not None and h < t2:
                    res['dj_narrow'].append(f['id'])
    Ls = res['lasers']
    res['laser_pass'] = bool(Ls) and all(l['pass'] for l in Ls)
    res['laser_min_over_floor_m'] = min(l['min_over_floor_m'] for l in Ls)
    over = [l['min_over_audience_m'] for l in Ls if l['min_over_audience_m'] is not None]
    res['laser_min_over_audience_m'] = min(over) if over else None
    res['laser_min_steel_m'] = min(l['nearest_steel']['m'] for l in Ls)
    res['eyes_in_any_cone'] = sum(v['eyes_in_cone'] for v in res['glare'].values())
    res['front_row_max_lux'] = max([v['lux'] for v in res['front_row'].values()], default=0.0)
    res['front_row_in_cone'] = sorted(k for k, v in res['front_row'].items() if v['cone'])
    return res


def visible_ends(fx, chk):
    """Is the lit point of each floor PAR seen from the centre of the floor (z 38, eye 1.6)?"""
    out = {}
    for f in fx:
        if f['kind'] != 'par' or f['p'][1] > 2.5 or f['id'] not in chk['ends']:
            continue
        e = chk['ends'][f['id']]
        q = np.array(e['at'], float)
        v = L.visible(q - 0.15 * f['d'], skip=e['ends_on'])
        out.setdefault(f['groupName'], []).append(v is True)
    return {k: '%d of %d' % (sum(v), len(v)) for k, v in out.items()}


# ------------------------------------------------------------------ the looks (cue states; positions never change)
LOOKS = [
    {'id': 'plot', 'title': 'The plot: every fixture at its home aim', 'lit': 'all',
     'note': 'A checking picture, never a show state: everything burns at once here so every place and aim can be seen.'},
    {'id': 'silhouette', 'title': 'Home look: the silhouette', 'layers': ['A', 'B'],
     'lit': ['the X (truss)', 'the curtain (truss)', 'the bridge-up PARs (truss top)', 'the backlight fan (floor, behind the riser)',
             'the halo PARs (floor, behind the riser)', 'the press crown (floor, in front of the press)'],
     'note': 'The backlit core (A) in front of the truss wall (B). The hall is dark. 2 layers.'},
    {'id': 'ref4', 'title': 'Video 4: one meeting point and the combs', 'layers': ['A', 'B', 'C'],
     'lit': ['the backlight fan (floor, behind the riser)', 'the curtain (truss)', 'the column arch (floor, column rows)'],
     'over': {'the column arch (floor, column rows)': {'aim': {'rule': 'comb'}}},
     'note': 'Fan meeting 10 m over the DJ, the column beams standing as two combs, the curtain behind him. 3 layers.'},
    {'id': 'ref1', 'title': 'Video 1: the laser web', 'layers': ['laser', 'A'],
     'lit': ['lasers: the bridge pair', 'lasers: the column pair', 'the spine (floor, behind the truss)'],
     'note': 'Four lasers make two crossings over the crowd; one white spine behind the DJ. 2 layers.'},
    {'id': 'ref3', 'title': 'Video 3: mirrored, one colour', 'layers': ['A', 'C'],
     'lit': ['the backlight fan (floor, behind the riser)', 'the column arch (floor, column rows)'],
     'only': {'the column arch (floor, column rows)': ['rig-beam380-columns-01', 'rig-beam380-columns-02'],
              'the backlight fan (floor, behind the riser)': ['rig-beam380-backstage-0%d' % i for i in (1, 2, 3, 5, 6, 7)]},
     'over': {'the backlight fan (floor, behind the riser)': {'aim': {'rule': 'splay', 'deg': 28, 'fwd_deg': 8}, 'colour': '#ff2a1a'},
              'the column arch (floor, column rows)': {'aim': {'rule': 'splay', 'deg': 18, 'fwd_deg': 8}, 'colour': '#ff2a1a'}},
     'note': 'Two mirrored red fans either side of the DJ (the fan split, its centre beam dark, + the pit pair), everything else black. 2 layers.'},
    {'id': 'ref2', 'title': 'Video 2: the arch, drawn from the floor', 'layers': ['C', 'B'],
     'lit': ['the column arch (floor, column rows)', 'the curtain (truss)'],
     'note': 'The column beams meet in pointed arches down the floor; the curtain behind the DJ. No overhead movers (the owner\'s rule). 2 layers.'},
]


def look_fx(lk):
    fx = build(lk.get('over'))
    if lk['lit'] == 'all':
        lit = {f['id'] for f in fx if not f['spare']}
    else:
        lit = set()
        for f in fx:
            if f.get('groupName') in lk['lit']:
                only = (lk.get('only') or {}).get(f['groupName'])
                if only is None or f['id'] in only:
                    lit.add(f['id'])
    return fx, lit


# ------------------------------------------------------------------ drawing
COL = L.COL
DIM = '#8f969e'


def view(ax, fx, lit, title=None, labels=True):
    cam = L.Camera(L.CAM['eye'], L.CAM['look'], L.CAM['vfov'], L.CAM['W'], L.CAM['H'])
    W, H = L.CAM['W'], L.CAM['H']
    ax.set_xlim(0, W)
    ax.set_ylim(H, 0)
    ax.set_facecolor(COL['bg'])
    ax.set_xticks([])
    ax.set_yticks([])
    for s in ax.spines.values():
        s.set_color('#2a2e33')
    items = []
    zfar, znear = L.ENDS[0], L.CAM['eye'][2] - 0.5
    for z in np.arange(-54, 38, 6.0):
        L.add_seg(items, cam, np.array([-12, 0, z]), np.array([12, 0, z]), COL['grid'], 1, 1.0)
        L.add_seg(items, cam, np.array([-12, L.DECK_Y, z]), np.array([-6, L.DECK_Y, z]), COL['roof'], 1, 1.0)
        L.add_seg(items, cam, np.array([6, L.DECK_Y, z]), np.array([12, L.DECK_Y, z]), COL['roof'], 1, 1.0)
        L.add_seg(items, cam, np.array([-12, G['truss_bottom_m'], z]), np.array([12, G['truss_bottom_m'], z]), COL['roof'], 0.6, 0.8)
    for x in np.arange(-12, 12.01, 3.0):
        L.add_seg(items, cam, np.array([x, 0, zfar]), np.array([x, 0, znear]), COL['grid'], 1, 1.0)
    l = LANTERN_NAVE
    for x in l['x_m']:
        L.add_seg(items, cam, np.array([x, L.DECK_Y, max(l['z_m'][0], zfar)]), np.array([x, L.DECK_Y, min(l['z_m'][1], znear)]), '#3d5a73', 1, 1.4)
        L.add_seg(items, cam, np.array([x, L.LANTERN_TOP, max(l['z_m'][0], zfar)]), np.array([x, L.LANTERN_TOP, min(l['z_m'][1], znear)]), '#3d5a73', 0.7, 1.0)
    for x in (-12, 12):
        L.add_seg(items, cam, np.array([x, L.DECK_Y, zfar]), np.array([x, L.DECK_Y, znear]), COL['roof'], 1, 1.2)
    for x in (L.AUD['x'][0], L.AUD['x'][1]):
        L.add_seg(items, cam, np.array([x, L.LASER_MIN, L.AUD['z'][0]]), np.array([x, L.LASER_MIN, 31.0]), COL['laserLine'], 0.5, 1.3)
    L.add_seg(items, cam, np.array([L.AUD['x'][0], L.LASER_MIN, L.AUD['z'][0]]), np.array([L.AUD['x'][1], L.LASER_MIN, L.AUD['z'][0]]), COL['laserLine'], 0.5, 1.3)
    for b in L.column_boxes():
        if abs(b.p[0]) < 13 and b.p[2] < 36.5:
            L.add_box(items, cam, b, COL['col'], '#4c545e', 0.95, maxlen=2.5)
    for b in RUNWAYS:
        L.add_box(items, cam, L.Box.aabb('rw', (b.p[0] - 0.3, b.p[0] + 0.3), (G['runway_bottom_m'], G['runway_top_m']), (zfar, 36.0)), COL['col'], '#4c545e', 0.9)
    for m in L.massing_boxes():
        L.add_box(items, cam, m, COL['press'] if m.id.startswith('press') and 'side' not in m.id and 'pedestal' not in m.id else COL['machine'], '#5a5249', 0.95)
    for b in L.crane_boxes():
        L.add_box(items, cam, b, COL['cab'] if 'cab' in b.id else COL['steel'], '#6e5800', 0.95, maxlen=2.0)
    for b in L.rig_boxes():
        if b.cls == 'riser':
            L.add_box(items, cam, b, COL['riser'], '#5d646d')
        elif b.cls == 'rigging':
            L.add_box(items, cam, b, COL['rig'], None, 0.9, lw=0)
        elif 'pa-' in b.id:
            L.add_box(items, cam, b, COL['pa'], '#3a4048')
        elif 'barrier' in b.id:
            L.add_box(items, cam, b, COL['barrier'], None, 0.85)
        elif 'table' in b.id:
            L.add_box(items, cam, b, COL['table'], '#3a4048')
        else:
            L.add_box(items, cam, b, COL['rig'], None)
    L.add_box(items, cam, L.TRUSS, COL['truss'], '#9aa1a8', 1, maxlen=1.0)
    L.add_box(items, cam, L.Box.aabb('dj body', (-0.12, 0.38), (0.4, 1.95), (22.95, 23.25)), COL['dj'], COL['djEdge'], 1, lw=0.8, bias=-0.3)
    L.add_box(items, cam, L.Box.aabb('dj head', (0.03, 0.23), (1.95, 2.2), (23.0, 23.2)), COL['dj'], COL['djEdge'], 1, lw=0.8, bias=-0.3)
    for b in L.CROWD:
        L.add_box(items, cam, b, COL['crowd'], COL['crowdEdge'], 1, lw=0.6)
    for f in fx:
        if f['spare'] or f['kind'] not in ('par', 'beam', 'laser'):
            continue
        s = 0.13 if f['kind'] != 'beam' else 0.2
        L.add_box(items, cam, L.Box('fx', f['p'] - [0, s, 0], [2 * s] * 3, anchor='base'), '#30353c', None, 1, lw=0)
        if f['id'] not in lit:
            continue
        if f['kind'] == 'laser':
            for k, d in enumerate(fan_rays(f, 5, 1)):
                L.add_beam(items, cam, ray_fx(f, d, k))
        else:
            L.add_beam(items, cam, f)
    items.sort(key=lambda it: -it[0])
    from matplotlib.collections import PolyCollection
    ax.add_collection(PolyCollection([it[1] for it in items], facecolors=[it[2] for it in items], edgecolors=[it[3] for it in items],
                                     linewidths=[it[4] for it in items], antialiaseds=True))
    if not labels:
        return

    def lab(P, text, dx=0, dy=0, ha='center', c=None):
        cc = cam.cam(np.array(P, float))
        if cc[2] < L.NEAR:
            return
        sx, sy = cam.scr(cc)
        ax.text(sx + dx, sy + dy, text, color=c or DIM, fontsize=8.5, ha=ha, va='center', family='DejaVu Sans Mono')
    lab([0.13, 2.45, 23.1], 'DJ', 0, -12, c=COL['fg'])
    lab([-5.4, 2.1, 24.3], 'PA L')
    lab([5.4, 2.1, 24.3], 'PA R')
    lab([-7.0, 3.0, 21.0], 'the cut, LOW 3.24 m', -6, 6, 'right')
    lab([4.6, 6.8, 21.0], 'HIGH 6.35 m', 8, 0, 'left')
    lab([-10.6, 8.35, 22.1], 'crane bridge z 21', 0, -14)
    lab([-5.3, 3.0, 26.0], '3 m: no laser under it', -4, -8, 'right', '#ff8a80')
    lab([0, 14.9, 30.0], 'lantern 1 (glazed)', 0, 0, c='#6f8fab')


def plan(ax, fx, lit=None, only_kind=None):
    from matplotlib.patches import Rectangle, Circle
    ax.set_facecolor(COL['bg'])
    ax.set_xlim(-14, 14)
    ax.set_ylim(52, -4)
    ax.set_aspect('equal')
    ax.tick_params(colors=DIM, labelsize=7)
    for s in ax.spines.values():
        s.set_color('#2a2e33')
    R_ = lambda x, z, c, a=1, fill=True, ls='-', lw=0.8, zo=1, hatch=None: ax.add_patch(Rectangle((x[0], z[0]), x[1] - x[0], z[1] - z[0], fc=c if fill else 'none', ec=c, alpha=a, ls=ls, lw=lw, zorder=zo, hatch=hatch))
    R_(L.AUD['x'], L.AUD['z'], COL['aud'], 0.12, zo=0)
    ax.text(0, 46.6, 'dance floor', color='#7f9cff', fontsize=7.5, ha='center')
    for l in G['lanterns']:
        if l['x_m'][0] < 14 and l['z_m'][1] > -4:
            ax.add_patch(Rectangle((max(l['x_m'][0], -14), max(l['z_m'][0], -4)), min(l['x_m'][1], 14) - max(l['x_m'][0], -14),
                                   min(l['z_m'][1], 52) - max(l['z_m'][0], -4), fc='none', ec='#3d5a73', lw=0.7, ls='--', hatch='////', alpha=0.45, zorder=0))
    ax.text(0, 7.4, 'lantern 1: glass, no laser may end here', color='#6f8fab', fontsize=6, ha='center')
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
    for b in L.crane_boxes():
        c = b.corners()
        R_((c[:, 0].min(), c[:, 0].max()), (c[:, 2].min(), c[:, 2].max()), COL['cab'] if 'cab' in b.id else COL['steel'], 0.35, zo=2)
    ax.plot([L.TRUSS_A[0], L.TRUSS_B[0]], [21.0, 21.0], color=COL['truss'], lw=2.4, zorder=4)
    R_(L.RISER['x'], L.RISER['z'], COL['riser'], 1, zo=3)
    R_((-0.772, 1.028), (23.49, 24.29), '#1b1f24', 1, zo=4)
    ax.add_patch(Circle((0.13, 23.1), 0.28, fc='#000', ec=COL['djEdge'], lw=0.8, zorder=5))
    for x in (-5.4, 5.4):
        R_((x - 0.67, x + 0.67), (23.78, 24.5), '#3a4048', 1, zo=3)
    R_((-7.07, 7.07), (25.75, 25.83), COL['barrier'], 1, zo=3)
    ax.text(-13.6, 20.6, 'truss + crane z 21', color=COL['fg'], fontsize=6.2, va='center')
    kcol = {'haze': '#7fb2ff', 'smoke': '#a9c8ff'}
    for f in fx:
        k = f['kind']
        if only_kind and k not in only_kind:
            continue
        if f['p'][2] < -4 or abs(f['p'][0]) > 14 or f['p'][2] > 52:
            continue
        if f['moved'] and not f['spare']:
            ax.plot([f['p0'][0], f['p'][0]], [f['p0'][2], f['p'][2]], color=COL['ghost'], lw=0.6, ls='--', zorder=5)
            ax.plot(f['p0'][0], f['p0'][2], marker='s', ms=3, mfc='none', mec=COL['ghost'], zorder=5)
        if f['spare']:
            ax.plot(f['p0'][0], f['p0'][2], marker='x', ms=4, mec='#ff5a4f', zorder=7)
            continue
        mk = {'par': 'o', 'beam': 'D', 'laser': '^', 'haze': 'h', 'smoke': 'h'}.get(k, 'o')
        ax.plot(f['p'][0], f['p'][2], marker=mk, ms=4.2 if k == 'laser' else (3.6 if k != 'beam' else 3.2),
                mfc=f['colour'] if k in ('par', 'beam', 'laser') else kcol[k], mec='#000', mew=0.3, zorder=7)
        if f['d'] is None or (lit is not None and f['id'] not in lit):
            continue
        dirs = fan_rays(f, 5, 1) if k == 'laser' else [f['d']]
        for d in dirs:
            t, _, _ = L.beam_end(f['p'], d, L.REACH[k], skip=('truss',) if f['p'][1] > 3 else ())
            q = f['p'] + d * t
            if math.hypot(d[0], d[2]) < 0.2:
                ax.plot(f['p'][0], f['p'][2], marker='o', ms=6.5 if d[1] > 0 else 5, mfc='none', mec=f['colour'], mew=0.6, alpha=0.7, zorder=6)
            else:
                ax.plot([f['p'][0], q[0]], [f['p'][2], q[2]], color=f['colour'], lw=0.8 if k != 'par' else 1.1,
                        alpha=0.8 if k == 'laser' else (0.7 if k == 'beam' else 0.45), zorder=6)
                if k == 'laser':
                    ax.plot(q[0], q[2], marker='x', ms=3.5, mec=f['colour'], zorder=6)
    ax.text(0, -3.0, 'BACK (press end)', color=DIM, fontsize=7, ha='center')
    ax.text(0, 51.6, 'ENTRY', color=DIM, fontsize=7, ha='center')
    ax.text(-13.6, 50.8, 'off the plan, kept:\n8 vista PARs z -12..-48', color=DIM, fontsize=5.8, va='bottom')
    ax.text(13.6, -3.0, 'house right', color=DIM, fontsize=6.5, ha='right')
    ax.text(-13.6, -3.0, 'house left', color=DIM, fontsize=6.5)


def section(ax, fx, lit=None, only_kind=None):
    """Side section: the hall seen from house left, z across, height up. Everything projected onto one plane."""
    from matplotlib.patches import Rectangle
    ax.set_facecolor(COL['bg'])
    ax.set_xlim(-4, 54)
    ax.set_ylim(-0.5, 17.5)
    ax.set_aspect('equal')
    ax.tick_params(colors=DIM, labelsize=7)
    for s in ax.spines.values():
        s.set_color('#2a2e33')
    R_ = lambda z, y, c, a=1, fill=True, ls='-', lw=0.8, zo=1, hatch=None: ax.add_patch(Rectangle((z[0], y[0]), z[1] - z[0], y[1] - y[0], fc=c if fill else 'none', ec=c, alpha=a, ls=ls, lw=lw, zorder=zo, hatch=hatch))
    ax.plot([-4, 54], [0, 0], color='#3a4048', lw=1.2)
    ax.plot([-4, 54], [L.DECK_Y, L.DECK_Y], color=COL['roof'], lw=2.0)
    ax.plot([-4, 54], [G['truss_bottom_m'], G['truss_bottom_m']], color=COL['roof'], lw=0.8, ls=':')
    l = LANTERN_NAVE
    R_(l['z_m'], (L.DECK_Y, L.LANTERN_TOP), '#3d5a73', 0.5, fill=False, hatch='////', zo=1)
    ax.text(26.5, 15.2, 'lantern 1: glass (no laser ends here)', color='#6f8fab', fontsize=6.5, ha='center')
    ax.text(50.3, 13.75, 'solid deck', color=DIM, fontsize=6, ha='center')
    ax.text(2.5, 13.75, 'solid deck', color=DIM, fontsize=6, ha='center')
    ax.plot([53.8, 53.8], [0, L.DECK_Y], color='#3a4048', lw=1.2)
    ax.text(53.6, 6.5, 'entry wall', color=DIM, fontsize=6, rotation=90, ha='right')
    for z in G['column_grid_z_m']:
        if -4 <= z <= 54:
            R_((z - 0.25, z + 0.25), (0, G['column_head']['head_top_m']), '#262b31', 1, zo=0)
    R_((-4, 54), (G['runway_bottom_m'], G['runway_top_m']), '#2b3036', 1, zo=0)
    for m in G['massing']:
        if m['z_m'][1] < -4 or m['x_m'][0] > 12 or m['x_m'][1] < -12:
            continue
        R_(m['z_m'], m['y_m'], '#5b5148', 0.35, zo=1)
    for b in L.crane_boxes():
        c = b.corners()
        R_((c[:, 2].min(), c[:, 2].max()), (c[:, 1].min(), c[:, 1].max()), COL['cab'] if 'cab' in b.id else COL['steel'], 0.75, zo=3)
    tc = L.TRUSS.corners()
    R_((20.855, 21.145), (tc[:, 1].min(), tc[:, 1].max()), COL['truss'], 0.9, zo=4)
    ax.text(20.4, 2.6, 'the cut\n3.24-6.35 m', color=COL['fg'], fontsize=6, ha='right')
    R_(L.RISER['z'], (0, L.RISER['y']), COL['riser'], 1, zo=4)
    R_((22.95, 23.25), (0.4, 2.2), '#000', 1, zo=5)
    ax.text(23.1, 2.5, 'DJ', color=COL['fg'], fontsize=6.5, ha='center')
    R_((23.78, 24.5), (0, 1.86), '#3a4048', 1, zo=4)
    R_((25.75, 25.83), (0, 1.1), '#5a616b', 1, zo=4)
    R_(L.AUD['z'], (0, 1.75), '#0d1220', 1, zo=2)
    ax.plot(L.AUD['z'], [1.6, 1.6], color='#2f6bff', lw=0.8, ls=':', zorder=3)
    ax.text(37, 0.7, 'audience (eye 1.6 m)', color='#7f9cff', fontsize=6.5, ha='center', zorder=4)
    ax.plot([-4, 54], [L.LASER_MIN, L.LASER_MIN], color=COL['laserLine'], lw=0.8, ls='--', alpha=0.7, zorder=3)
    ax.text(-3.6, 3.15, '3 m: no laser under it, over any floor', color='#ff8a80', fontsize=6, va='bottom')
    for f in fx:
        k = f['kind']
        if f['spare'] or (only_kind and k not in only_kind) or f['p'][2] < -4 or abs(f['p'][0]) > 12.5:
            continue
        ax.plot(f['p'][2], f['p'][1], marker={'par': 'o', 'beam': 'D', 'laser': '^'}.get(k, 'h'), ms=3.6 if k != 'laser' else 4.5,
                mfc=f['colour'] if k in ('par', 'beam', 'laser') else '#7fb2ff', mec='#000', mew=0.3, zorder=7)
        if f['d'] is None or (lit is not None and f['id'] not in lit):
            continue
        dirs = fan_rays(f) if k == 'laser' else [f['d']]
        for d in dirs:
            t, _, _ = L.beam_end(f['p'], d, L.REACH[k], skip=('truss',) if f['p'][1] > 3 else ())
            q = f['p'] + d * t
            ax.plot([f['p'][2], q[2]], [f['p'][1], q[1]], color=f['colour'], lw=0.7 if k != 'par' else 1.0,
                    alpha=0.75 if k == 'laser' else (0.6 if k == 'beam' else 0.35), zorder=6)
    ax.text(-3.6, 16.8, 'BACK (press end)', color=DIM, fontsize=7)
    ax.text(53.6, 16.8, 'ENTRY', color=DIM, fontsize=7, ha='right')
    ax.set_title('side section (seen from house left; every fixture projected onto one plane), metres', color=DIM, fontsize=8, loc='left')


def save_fig(fig, path):
    fig.savefig(path, facecolor=COL['bg'])
    import matplotlib.pyplot as plt
    plt.close(fig)
    return path


def fig_view(fx, lit, path, title, sub):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig = plt.figure(figsize=(16.0, 9.0 + 0.7), dpi=100)
    fig.patch.set_facecolor(COL['bg'])
    ax = fig.add_axes([0, 0, 1, 9.0 / 9.7])
    view(ax, fx, lit)
    fig.text(0.012, 1 - 0.3 / 9.7, title, color=COL['fg'], fontsize=15, fontweight='bold', family='DejaVu Sans Mono', va='center')
    fig.text(0.012, 1 - 0.58 / 9.7, sub, color=DIM, fontsize=9, family='DejaVu Sans Mono', va='center')
    return save_fig(fig, path)


def fig_small_view(fx, lit, path, title):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig = plt.figure(figsize=(9.6, 5.4 + 0.35), dpi=100)
    fig.patch.set_facecolor(COL['bg'])
    ax = fig.add_axes([0, 0, 1, 5.4 / 5.75])
    view(ax, fx, lit, labels=False)
    fig.text(0.012, 1 - 0.18 / 5.75, title, color=COL['fg'], fontsize=11, family='DejaVu Sans Mono', va='center')
    return save_fig(fig, path)


def fig_plan(fx, path, lit=None, only_kind=None, title=''):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig = plt.figure(figsize=(7.2, 12.4), dpi=110)
    fig.patch.set_facecolor(COL['bg'])
    ax = fig.add_axes([0.07, 0.03, 0.9, 0.9])
    plan(ax, fx, lit, only_kind)
    fig.text(0.07, 0.975, title, color=COL['fg'], fontsize=11, fontweight='bold', family='DejaVu Sans Mono', va='top')
    fig.text(0.07, 0.955, 'o PAR   <> beam (moving head, floor)   ^ laser   x laser not hung   hex haze/smoke   [] old place',
             color=DIM, fontsize=7, family='DejaVu Sans Mono', va='top')
    return save_fig(fig, path)


def fig_section(fx, path, lit=None, only_kind=None, title=''):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig = plt.figure(figsize=(16.0, 6.4), dpi=100)
    fig.patch.set_facecolor(COL['bg'])
    ax = fig.add_axes([0.04, 0.08, 0.94, 0.78])
    section(ax, fx, lit, only_kind)
    fig.text(0.04, 0.95, title, color=COL['fg'], fontsize=12, fontweight='bold', family='DejaVu Sans Mono', va='center')
    return save_fig(fig, path)


def fig_lasers(fx, path):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig = plt.figure(figsize=(18.0, 9.6), dpi=100)
    fig.patch.set_facecolor(COL['bg'])
    ax1 = fig.add_axes([0.02, 0.05, 0.28, 0.86])
    plan(ax1, fx, None, ('laser',))
    ax2 = fig.add_axes([0.33, 0.3, 0.66, 0.6])
    section(ax2, fx, None, ('laser',))
    fig.text(0.02, 0.965, 'The lasers: 4 hung, 2 not hung. Every ray of each field drawn (5 x 3), each ending on the solid deck.',
             color=COL['fg'], fontsize=13, fontweight='bold', family='DejaVu Sans Mono', va='center')
    lines = []
    for l in CHK['lasers']:
        lines.append('%-22s at %-20s  lowest over any floor %.1f m, over the audience %s, nearest steel %.2f m (%s): %s' % (
            l['id'].replace('rig-lasercube-cut-', 'cube '), '(%.2f, %.2f, %.2f)' % tuple(l['at']), l['min_over_floor_m'],
            '%.1f m' % l['min_over_audience_m'] if l['min_over_audience_m'] is not None else 'never over it',
            l['nearest_steel']['m'], l['nearest_steel']['what'], 'PASS' if l['pass'] else 'FAIL ' + '; '.join(l['errors'])))
    lines.append('NOHD (static beam, 10 W, 4 mm, 1 mrad; IEC 60825-1:2014 Table A.1 MPE %.1f W/m2 at 0.25 s) = %.0f m: longer than the 108 m hall.' % (L.MPE_E, L.NOHD_M))
    lines.append('Limit: the space frame (10.8-13.35 m) is not modelled member by member; a ray may stop on a chord before the deck: structure, not glass, but steel (LSO checks reflections on site).')
    lines.append('Planning, not a safety sign-off: a laser safety officer signs (IEC 60825-1, IEC TR 60825-3) before any emission.')
    for i, t in enumerate(lines):
        fig.text(0.33, 0.24 - i * 0.03, t, color='#ff8a80' if i == len(lines) - 1 else '#c4c9cf', fontsize=8.6, family='DejaVu Sans Mono', va='top')
    return save_fig(fig, path)


# ------------------------------------------------------------------ the page
REF_FINDINGS = [
    # Counted by eye on numbered 1 fps contact sheets (every 2nd frame of an ffmpeg fps=2 extraction, CPU), one still per second.
    # A "layer" = a visually separate light element (e.g. combs, a fan, a laser web, a floor glow). Phone video: auto-exposure and the
    # filmer's choice of moment bias every count (a clip is filmed at a peak); they are counts of these clips, not of the shows.
    {'n': 1, 'file': 'AQMihb…z4.mp4 (msg 933, 52.6 s)', 'stills': ['ref1-a-backlight-12.5s.jpg', 'ref1-b-laser-lines-24.5s.jpg', 'ref1-c-laser-web-46.0s.jpg'],
     'finding': 'A very large hall, thousands of people. The lasers are STATIC beams, not scanned pictures: straight lines from points at the sides and on the delay towers, at about the towers\' lower-box height, crossing into a web over the crowd; one beam is aimed back toward the filmer. The stage itself shows as one soft white cone rising from behind the DJ into thick haze. Red flashes high up. Lasers lit in 35 of 53 seconds (mostly the second half: the clip was filmed for them); near-black in 6 of 53.',
     'groups': '1-3 layers at once, most often 2 (backlight cone; laser web; red flashes or white floods)',
     'took': 'the laser web from the sides of the stage end (the column pair), lasers as a layer for the peaks, and the single backlight cone (the spine)',
     'look': 'ref1'},
    {'n': 2, 'file': 'AQO_81…dxx.mp4 (msg 931, 14.6 s)', 'stills': ['ref2-a-arch-fans-1.0s.jpg', 'ref2-b-overhead-rig-6.0s.jpg'],
     'finding': 'An arena club stage: dozens of moving heads overhead in symmetric fans, a back wall where beams draw pointed (gothic) arches, monochrome blue/violet, then white. Never dark: 0 of 15 seconds near black. The big commercial end: everything on.',
     'groups': '4 layers in 15 of 15 seconds (overhead fans, arch wall, hot-spot row, floor oval): the overload',
     'took': 'only the arch, drawn from the floor by the column beams. Not taken: the overhead mover rig (movers stay on the ground, owner 30 Sep) and the always-on density',
     'look': 'ref2'},
    {'n': 3, 'file': 'AQMpi9…cwB.mp4 (msg 932, 16.9 s)', 'stills': ['ref3-a-mirrored-white-4.5s.jpg', 'ref3-b-static-sheet-8.5s.jpg', 'ref3-c-red-1.0s.jpg'],
     'finding': 'A club: two mirrored clusters of beams, one each side, fanning from two points; one beam colour per part (white, red, blue, amber); full blackouts between parts (4 of 17 seconds black); one part is a static sheet of horizontal white beams over the heads.',
     'groups': '1-2 layers at once (the two clusters as one; the red floor ring)',
     'took': 'mirrored symmetry, one colour per look, real blackouts: the backlight fan split into two mirrored fans with the pit pair, all red',
     'look': 'ref3'},
    {'n': 4, 'file': 'AQP8if…XXV.mp4 (msg 930, 32.1 s, portrait)', 'stills': ['ref4-b-combs-6.0s.jpg', 'ref4-c-fan-from-above-0.0s.jpg'],
     'finding': 'The closest to MOXIR: a steel-roofed warehouse, white only. Rows of upright white bars either side of the DJ (combs), beams converging to ONE point behind and above him, a curtain of beams from a line of heads overhead, a low blue glow at the booth. The DJ is a black silhouette against it. No lasers (0 of 32 seconds). Medium haze, cool white.',
     'groups': '1-4 layers at once, most often 2-3 (combs; meeting-point fan or the overhead curtain; low glow; a side beam at the peaks)',
     'took': 'the meeting point (the 7 backlight beams meet 10 m over the DJ), the combs (the column beams standing upright), the silhouette, white only, the low glow (the halo PARs, in MOXIR red)',
     'look': 'ref4'},
]


def page(pngs, out):
    def b64(p):
        with open(p, 'rb') as fh:
            return 'data:image/png;base64,' + base64.b64encode(fh.read()).decode()
    moves = []
    for f in FX:
        what = []
        if f['spare']:
            what.append('NOT HUNG (to the case)')
        elif f['moved']:
            what.append('MOVE')
        if f['reaimed'] and not f['spare']:
            what.append('re-aim')
        moves.append({'id': f['id'], 'type': f['type'], 'group': f['groupName'], 'from': [round(v, 2) for v in f['p0']],
                      'to': None if f['spare'] else [round(v, 2) for v in f['p']], 'what': ', '.join(what) or 'keep',
                      'colour': f['colour'] if f['kind'] in ('par', 'beam', 'laser') else ''})
    groups = []
    for g in PLOT['groups']:
        lamps = [f for f in FX if f['id'] in g['ids']]
        groups.append({'name': g['name'], 'n': len(lamps), 'type': lamps[0]['type'], 'layer': g['layer'],
                       'moved': sum(f['moved'] and not f['spare'] for f in lamps), 'reaimed': sum(f['reaimed'] and not f['spare'] for f in lamps),
                       'spare': sum(f['spare'] for f in lamps), 'why': g['why'], 'mount': g.get('mount', '')})
    data = {'png': {k: b64(v) for k, v in pngs.items()}, 'pngName': {k: os.path.basename(v) for k, v in pngs.items()},
            'checks': CHECKS_PAGE, 'lasers': CHK['lasers'], 'groups': groups, 'moves': moves, 'refs': REF_FINDINGS,
            'looks': [{'id': lk['id'], 'title': lk['title'], 'note': lk['note'], 'layers': lk.get('layers', [])} for lk in LOOKS],
            'nohd': round(L.NOHD_M), 'mpe': round(L.MPE_E, 1), 'frontLux': CHK['front_row_max_lux'], 'summary': SUMMARY}
    with open(out, 'w') as fh:
        fh.write(PAGE.replace('__DATA__', json.dumps(data, default=float)))


PAGE = r"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>MOXIR beta light plot</title></head><body><main id="root"></main>
<script>
"use strict";
// Colours are JS constants on purpose: CSS variables came back empty inside di's frame.
const C={bg:"#0b0c0d",panel:"#121416",line:"#2a2e33",fg:"#e3e6ea",sub:"#a3aab1",dim:"#8f969e",ok:"#3cff3c",bad:"#ff5a4f",warn:"#ffb36b",accent:"#27ff4a",laser:"#ff8a80"};
const D=__DATA__;
const F="ui-monospace,'DejaVu Sans Mono',monospace";
const el=(t,s,h)=>{const e=document.createElement(t);if(s)Object.assign(e.style,s);if(h!=null)e.innerHTML=h;return e;};
const esc=s=>String(s).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
const wrap=t=>{const w=el("div",{overflowX:"auto",maxWidth:"100%"});w.appendChild(t);return w;};
const td=(t,s)=>el("td",Object.assign({border:"1px solid "+C.line,padding:"5px 8px",verticalAlign:"top"},s||{}),t);
const table=(head,rows,font)=>{const t=el("table",{borderCollapse:"collapse",width:"100%",font:(font||"12.5px/1.45 ")+F,color:"#c4c9cf"});
  if(head){const h=el("tr");for(const k of head)h.appendChild(td(esc(k),{color:C.fg}));t.appendChild(h);}
  for(const r of rows){const tr=el("tr");for(const c of r)tr.appendChild(typeof c==="object"&&c&&c.html!=null?td(c.html,c.style):td(esc(c)));t.appendChild(tr);}return wrap(t);};
const img=(src,alt,s)=>{const i=el("img",Object.assign({display:"block",width:"100%",height:"auto",background:"#000"},s||{}));i.src=src;i.alt=alt;return i;};
Object.assign(document.documentElement.style,{background:C.bg});
Object.assign(document.body.style,{margin:"0",background:C.bg,color:C.fg,font:"16px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif"});
const root=document.getElementById("root");
Object.assign(root.style,{maxWidth:"1240px",margin:"0 auto",padding:"36px 16px 60px",boxSizing:"border-box"});
const h2=(n,t)=>root.appendChild(el("h2",{font:"600 18px/1.3 "+F,margin:"34px 0 10px"},"<span style='color:"+C.accent+";margin-right:10px'>"+n+"</span>"+t));
const p=(t,s)=>root.appendChild(el("p",Object.assign({color:C.sub,margin:"0 0 10px"},s||{}),t));
const note=(t)=>root.appendChild(el("div",{color:C.dim,font:"12px/1.5 "+F,margin:"6px 0 12px"},t));

root.appendChild(el("h1",{font:"600 22px/1.25 "+F,margin:"0 0 14px"},"MOXIR beta v0.9 &middot; one light plot, every fixture re-placed"));
// 1 the answer
h2("1","The answer");
const ans=el("div",{background:C.panel,border:"1px solid "+C.line,padding:"14px 16px",margin:"0 0 8px",font:"15px/1.6 system-ui,sans-serif"});
ans.innerHTML=["<b>1.</b> The DJ in silhouette: 7 floor beams behind him meet 10 m over his head, a red glow behind him, the truss a lit wall behind that.",
 "<b>2.</b> The crowd gets the column beams as arches overhead. No lamp reaches a front-row eye: "+D.frontLux+" lux.",
 "<b>3.</b> 4 lasers, none on the truss: 2 on the crane bridge, 2 on the stage-end columns, crossing over the crowd (lowest "+D.summary.laser_min_over_audience_m.toFixed(1)+" m) onto solid roof. 2 stay in the case."].join("<br>");
root.appendChild(ans);
note("Pictures only: nothing is built into any project. The laser numbers are planning, not a safety sign-off: a laser safety officer signs.");
// 2 audience view
h2("2","The view from the dance floor");
p("Centre of the floor, eye 1.6 m, z 38, looking at the DJ. Drawn in matplotlib (pinhole, 62&deg; vertical), not a WebGL render. This is the PLOT: every fixture at its home aim at once, a checking picture. In the show no more than 3 layers burn together (section 6).");
root.appendChild(img(D.png.view,"audience view, the whole plot"));
note("PNG beside this page: "+esc(D.pngName.view));
root.appendChild(img(D.png.silhouette,"audience view, the home look: the silhouette",{marginTop:"14px"}));
note("The home look, as it would run: the silhouette (layers A + B), the hall dark. PNG: "+esc(D.pngName.silhouette));
// 3 plan
h2("3","Top plan");
p("Every fixture where it goes, its aim, and the old place it came from (grey square, dashed line). Lasers are drawn as their fields.");
const pr=el("div",{display:"flex",flexWrap:"wrap",gap:"14px"});const pl=el("div",{flex:"1 1 420px",maxWidth:"620px"});pl.appendChild(img(D.png.plan,"top plan"));pr.appendChild(pl);
const pt=el("div",{flex:"1 1 320px",font:"13px/1.55 "+F,color:"#c4c9cf"});
pt.innerHTML=D.groups.map(g=>"<div style='margin:0 0 8px'><b style='color:"+C.fg+"'>"+esc(g.name)+"</b> &middot; "+g.n+" &times; "+esc(g.type.toUpperCase())+" &middot; layer "+esc(g.layer)+"</div>").join("");
pr.appendChild(pt);root.appendChild(pr);note("PNG: "+esc(D.pngName.plan));
// 4 section
h2("4","Side section");
p("Seen from house left: the stage end on the left, the entry on the right. Every fixture is projected onto one plane, so beams at different x overlap. The glazed lantern is hatched; the dashed red line is 3 m, the lowest any laser may pass over a floor.");
root.appendChild(img(D.png.section,"side section"));note("PNG: "+esc(D.pngName.section));
// 5 lasers
h2("5","The lasers: where, and why");
p("The owner's rule: no laser on the truss. From the references: lasers are a peak-moment layer, static beams that form a web over the heads, seen best looking back toward their source. MOXIR's dance floor is 10.7 &times; 22 m, so <b>4 cubes</b>, as two crossing pairs, carry it; the other 2 stay in the case as hot spares (a third pair could only hang behind most of the crowd, where beams read dim).");
const lr=D.lasers.map(l=>{
  return [l.id.replace("rig-lasercube-cut-","cube "),"("+l.at.join(", ")+")",l.mount,l.why,l.fan_deg[0]+"&deg; &times; "+l.fan_deg[1]+"&deg;",
   l.ends_on.join(", "),l.min_over_audience_m==null?"never over it":l.min_over_audience_m+" m",l.min_over_floor_m+" m",l.nearest_steel.what+" "+l.nearest_steel.m+" m",
   {html:l.pass?"PASS":"FAIL: "+esc(l.errors.join("; ")),style:{color:l.pass?C.ok:C.bad}}];});
const sp=D.moves.filter(m=>m.what.startsWith("NOT HUNG")).map(m=>[m.id.replace("rig-lasercube-cut-","cube "),"in the case","not hung","hot spare (or return it)","-","-","-","-","-",{html:"not hung",style:{color:C.dim}}]);
root.appendChild(table(["cube","at (x, y, z)","mount","why here","field (\u00b1az \u00d7 \u00b1el)","every ray ends on","lowest over the audience","lowest over any floor","nearest steel","planning rules"],lr.concat(sp).map(r=>r.map(c=>typeof c==="string"&&c.includes("&")?{html:c}:c))));
root.appendChild(img(D.png.lasers,"laser placement: plan and section",{marginTop:"12px"}));
note("Rules each of 15 rays per cube is held to: mounted &ge; 3 m; rising; &ge; 3 m over any floor people stand on (contains the 3 m vertical / 2.5 m lateral audience separation of US FDA/CDRH show variances); ends on the solid roof deck, never a lantern's glass; &ge; 0.3 m from steel, chain or hoist (the crane runways included). The field is a limit set in the laser controller and proved by the operator. Ocular hazard: LaserCube Ultra MK2, 10 W, 4 mm, 1 mrad (maker's spec) &rarr; MPE "+D.mpe+" W/m&sup2; at 0.25 s (IEC 60825-1:2014 Table A.1) &rarr; static-beam NOHD &asymp; "+D.nohd+" m, longer than the hall: no beam may ever reach an eye. ");
root.appendChild(el("p",{color:C.laser,font:"600 14px/1.5 "+F,margin:"4px 0 0"},"Planning, not a safety sign-off: a laser safety officer signs (IEC 60825-1, IEC TR 60825-3) before any emission. The bridge clamps also need the rigging sign-off the crane already needs."));
// 6 references
h2("6","What we took from each reference");
p("His stills (left) are third-party footage of other events: on this machine only, loaded from <code>refs/</code> beside this page, not embedded, never published. Our view (right) is the same plot, lit as that look: positions never change, only the cue.");
for(const r of D.refs){const s=el("section",{background:C.panel,border:"1px solid "+C.line,margin:"0 0 16px",padding:"12px 14px"});
  s.appendChild(el("div",{font:"600 16px/1.3 "+F,margin:"0 0 6px"},"Video "+r.n+" <span style='color:"+C.dim+";font-weight:400;font-size:12px'>"+esc(r.file)+"</span>"));
  s.appendChild(el("p",{margin:"0 0 6px",color:"#c4c9cf"},esc(r.finding)));
  s.appendChild(el("div",{font:"12.5px/1.5 "+F,color:C.dim,margin:"0 0 4px"},"layers: "+esc(r.groups)));
  s.appendChild(el("div",{font:"13px/1.5 "+F,color:C.fg,margin:"0 0 10px"},"we took: "+esc(r.took)));
  const row=el("div",{display:"flex",flexWrap:"wrap",gap:"10px",alignItems:"flex-start"});
  const his=el("div",{flex:"1 1 300px",display:"flex",gap:"6px",flexWrap:"wrap"});
  for(const f of r.stills){const i=img("refs/"+f,"reference still (private)",{width:"auto",maxWidth:"100%",maxHeight:"200px",flex:"0 1 auto"});i.onerror=()=>{i.replaceWith(el("div",{color:C.dim,font:"12px "+F,padding:"8px",border:"1px dashed "+C.line},"refs/"+esc(f)+" (private still, not on this machine)"));};his.appendChild(i);}
  const ours=el("div",{flex:"1 1 420px"});ours.appendChild(img(D.png["look_"+r.look],"our view"));
  const lk=D.looks.find(x=>x.id===r.look);ours.appendChild(el("div",{font:"12px/1.5 "+F,color:C.dim,marginTop:"4px"},esc(lk.title+": "+lk.note)));
  row.appendChild(his);row.appendChild(ours);s.appendChild(row);root.appendChild(s);}
// 7 moves
h2("7","What moves, against today");
p("Today = beta v0.9 as built (scratch document v61). Every fixture is listed once.");
root.appendChild(table(["group","n","type","moved","re-aimed","not hung","why"],D.groups.map(g=>[g.name,g.n,g.type.toUpperCase(),g.moved,g.reaimed,g.spare,g.why]),"12.5px/1.45 "));
const det=el("details",{marginTop:"10px"});det.appendChild(el("summary",{cursor:"pointer",color:C.sub,font:"13px "+F},"every fixture, from &rarr; to"));
det.appendChild(table(["id","group","from (x, y, z)","to (x, y, z)","what","colour"],D.moves.map(m=>[m.id,m.group,m.from.join(", "),m.to?m.to.join(", "):"in the case",m.what,m.colour]),"12px/1.4 "));
root.appendChild(det);
// 8 checks
h2("8","The checks");
root.appendChild(table(["check","result","how"],D.checks.map(c=>[c.what,{html:esc(c.result),style:{color:c.ok?C.ok:C.bad}},c.how]),"12.5px/1.45 "));
root.appendChild(el("div",{color:C.dim,font:"12px/1.55 "+F,marginTop:"26px",borderTop:"1px solid "+C.line,paddingTop:"12px"},"Generated by scripts/place/lights_beta_mix.py (branch feat/moxir-stage-line-2026-10-07, PR #823) from rigs/moxir-lights-beta-mix-2026-10-07.json, the beta's fixtures (rigs/moxir-beta-v0.9-lights-2026-10-07.json, scratch document v61) and hall v8-show-back21. Crane heights are ASSUMED (the far crane's photo value) and the pipe racks are LOW confidence: the 10-08 tape changes numbers, not the plot. PAR and beam intensities are borrowed equivalents (types/moxir.json, basis EQUIVALENT). Not a render, not a lux plot, not a laser safety assessment, not a rigging sign-off."));
</script></body></html>
"""

# ------------------------------------------------------------------ main
FX = build()
CHK = check(FX)
VIS = visible_ends(FX, CHK)
LOOK_LAYERS = {lk['id']: lk.get('layers') for lk in LOOKS if lk['lit'] != 'all'}
ROUNDTRIP = round(max(math.degrees(math.acos(max(-1.0, min(1.0, float(L.aim_dir(f['r']) @ f['d'])))))
                      for f in FX if f['d'] is not None and not f['spare']), 6)
LOOK_CHECK = {}
for lk in LOOKS:
    if lk['lit'] == 'all':
        continue
    fx_l, lit_l = look_fx(lk)
    sub = [f for f in fx_l if f['id'] in lit_l and f['kind'] in ('par', 'beam')]
    LOOK_CHECK[lk['id']] = {'lit': len(lit_l), 'layers': len(lk['layers']),
                            'eyes_in_cone': sum(e['cone'] for f in sub for e in (glare_eyes(f) or [])),
                            'mover_eye_zone': [f['id'] for f in sub if f['kind'] == 'beam' and L.mover_eye_zone(f)],
                            'dj_narrow': [f['id'] for f in sub if f['kind'] == 'beam' and L.DJ.ray(f['p'], f['d'], 0.3) is not None],
                            'ends_on_pipe_racks': [f['id'] for f in sub if L.beam_end(f['p'], f['d'], L.REACH[f['kind']], skip=('truss',) if f['p'][1] > 3 else ())[1].startswith('pipe-rack')]}
SUMMARY = {
    'counts': CHK['counts'], 'hung_lasers': CHK['hung_lasers'], 'spare_lasers': CHK['spare_lasers'], 'on_truss_lasers': CHK['on_truss'],
    'laser_pass': CHK['laser_pass'], 'laser_min_over_floor_m': CHK['laser_min_over_floor_m'],
    'laser_min_over_audience_m': CHK['laser_min_over_audience_m'], 'laser_min_steel_m': CHK['laser_min_steel_m'],
    'laser_ends': sorted({e for l in CHK['lasers'] for e in l['ends_on']}),
    'nohd_m': round(L.NOHD_M), 'mpe_w_m2': round(L.MPE_E, 1),
    'eyes_in_any_cone': CHK['eyes_in_any_cone'], 'front_row_max_lux': CHK['front_row_max_lux'], 'front_row_in_cone': CHK['front_row_in_cone'],
    'dj_narrow': CHK['dj_narrow'], 'mover_eye_zone': CHK['mover_eye_zone'],
    'inside_or_outside': CHK['placement'],
    'today_inside_or_outside': {f['id']: pl for f in L.today() for pl in [placement(dict(f, spare=False))] if pl['inside'] or pl['outside_hall']}, 'blocked_by_machine': CHK['blocked_by_machine'],
    'ends_on_pipe_racks': sorted(k for k, v in CHK['ends'].items() if v['ends_on'].startswith('pipe-rack')),
    'today_ends_on_pipe_racks': sorted(f['id'] for f in L.today() if f['kind'] in ('par', 'beam') and
                                       L.beam_end(f['p'], f['d'], L.REACH[f['kind']], skip=('truss',) if f['p'][1] > 3 else ())[1].startswith('pipe-rack')),
    'seen_from_floor': VIS, 'looks': LOOK_CHECK, 'aim_roundtrip_max_deg': ROUNDTRIP,
    'moved': sum(1 for f in FX if f['moved'] and not f['spare']), 'reaimed': sum(1 for f in FX if f['reaimed'] and not f['spare']),
    'fixtures': len(FX)}


def yes(b, t_ok, t_bad):
    return (bool(b), t_ok if b else t_bad)


def _checks_page():
    S = SUMMARY
    rows = []

    def add(what, okres, how):
        rows.append({'what': what, 'ok': okres[0], 'result': okres[1], 'how': how})
    c = S['counts']
    add('only the order\'s fixtures, all of them', yes(c.get('up-pl5403') == 50 and c.get('up-b380f') == 18 and c.get('ext-lc-ultra-mk2') == 6 and c.get('ext-hazer') == 6 and c.get('up-yz31p') == 4 and S['fixtures'] == 84,
        '50 PAR, 18 beam, 6 laser (4 hung, 2 in the case), 6 hazer, 4 smoke = %d; no new type' % S['fixtures'], 'counts wrong: %s' % c),
        'every id of the beta named once in the plot record (the script refuses a missing or doubled id)')
    add('no laser on the truss', yes(not S['on_truss_lasers'], 'none (was 6)', 'ON THE TRUSS: %s' % S['on_truss_lasers']), 'owner 2026-10-07')
    add('lasers end on solid structure, never glass', yes(S['laser_ends'] == ['roof deck (solid)'], 'all %d rays: roof deck (solid)' % (15 * S['hung_lasers']), 'ends: %s' % S['laser_ends']),
        'ray against the hall: floor, deck, lantern openings (glazed) up to their top, walls, columns, crane, runways, rig')
    add('lasers over the audience', yes(CHK['laser_pass'], 'lowest %.1f m over the audience, %.1f m over any floor (rule 3 m)' % (S['laser_min_over_audience_m'], S['laser_min_over_floor_m']), 'FAILS'),
        'every 5 cm of every ray inside the hall; the riser counts at its deck height')
    add('lasers clear of steel', yes(S['laser_min_steel_m'] >= L.STEEL_CLEAR, 'nearest %.2f m (rule 0.3 m)' % S['laser_min_steel_m'], '%.2f m' % S['laser_min_steel_m']),
        'distance from each ray to every crane, runway, column, hoist, chain, bridle, tie-off and truss box')
    add('static-beam NOHD', (True, '%d m (MPE %.1f W/m2): no beam may reach an eye' % (S['nohd_m'], S['mpe_w_m2'])), 'IEC 60825-1:2014 Table A.1 at 0.25 s; NOHD = (sqrt(4P/(pi E)) - a)/phi')
    add('front-row glare', yes(not S['front_row_in_cone'] and S['eyes_in_any_cone'] == 0,
        '0 eyes in any lamp\'s cone; worst front-row eye %.1f lux (in no field)' % S['front_row_max_lux'] if S['front_row_max_lux'] == 0 else '0 eyes in any cone; worst front-row eye <= %.1f lux, in a field edge only' % S['front_row_max_lux'],
        'front-row eyes in cones: %s' % S['front_row_in_cone']),
        'eyes every 0.5 m x 1 m over x +-5.35, z 25.8-48 at 1.6 m (front row z <= 27.8); E = I/d^2, I borrowed (PAR 11 000 cd, beam 50.2 Mcd)')
    add('no narrow beam through the DJ', yes(not S['dj_narrow'], 'none', ', '.join(S['dj_narrow'])), 'rig-lib performerBox against every beam axis and laser ray')
    add('ground movers over the dance zone', yes(not S['mover_eye_zone'], 'no beam under 2.5 m in the dance zone', ', '.join(S['mover_eye_zone'])), 'moxir-ground-movers rule, 10 cm steps')
    add('nothing inside a machine or outside the hall', yes(not S['inside_or_outside'], 'none (today: %s)' % '; '.join('%s %s' % (k.replace('rig-', ''), 'outside the hall' if v['outside_hall'] else 'inside ' + ', '.join(v['inside'])) for k, v in S['today_inside_or_outside'].items()),
        json.dumps(S['inside_or_outside'])), 'each fixture\'s body box against the v8 massing, riser, table, PA, barrier, columns; hall bounds')
    add('nothing lights the pipe racks or a machine it was not aimed at', yes(not S['ends_on_pipe_racks'] and not S['blocked_by_machine'], 'none (today %d do: %s)' % (len(S['today_ends_on_pipe_racks']), ', '.join(i.replace('rig-', '') for i in S['today_ends_on_pipe_racks'])),
        'racks: %s; blocked: %s' % (S['ends_on_pipe_racks'], S['blocked_by_machine'])), 'the beam axis\'s first hit; the machine reveal and press crown are meant to land on machines')
    add('lit points seen from the floor', (True, '; '.join('%s %s' % (k, v) for k, v in S['seen_from_floor'].items())), 'line of sight from the floor eye (0, 1.6, 38) to each floor PAR\'s lit point')
    add('every look: no eye in a cone, no beam on the pipe racks, none through the DJ',
        yes(all(not v['eyes_in_cone'] and not v['ends_on_pipe_racks'] and not v['dj_narrow'] and not v['mover_eye_zone'] for v in S['looks'].values()),
            'holds in all %d looks' % len(S['looks']), json.dumps(S['looks'])), 'the same checks, run on each cue state (aims change between looks, places never)')
    add('not overloaded', yes(all(v['layers'] <= 3 for v in S['looks'].values()), '; '.join('%s: %d layers, %d fixtures' % (k, v['layers'], v['lit']) for k, v in S['looks'].items()), 'a look over 3 layers'),
        'max 3 layers at once, counted by eye on the reference stills (section 6)')
    add('stored rotations give back the aims', yes(S['aim_roundtrip_max_deg'] < 0.01, '%.6f deg' % S['aim_roundtrip_max_deg'], ''), 'Euler XYZ, -Y beam (spotLightAim.js)')
    return rows


CHECKS_PAGE = _checks_page()

if a.check:
    print(json.dumps({'summary': SUMMARY, 'lasers': CHK['lasers'], 'checks': CHECKS_PAGE, 'front_row': CHK['front_row'], 'glare': CHK['glare']}, indent=1, default=float))
    sys.exit(0)

out = os.path.expanduser(a.out or '~/Downloads/moxir/stage')
os.makedirs(out, exist_ok=True)
P = lambda n: os.path.join(out, 'lights-beta-mix-%s.png' % n)
pngs = {}
allfx, alllit = look_fx(LOOKS[0])
pngs['view'] = fig_view(allfx, alllit, P('view'), 'MOXIR beta v0.9 - the plot from the dance floor (every fixture at its home aim)',
                        'centre of the floor, eye 1.6 m, z 38 (pinhole, 62 deg vertical). A checking picture: in the show no more than 3 layers burn at once.')
for lk in LOOKS[1:]:
    fx_l, lit_l = look_fx(lk)
    if lk['id'] == 'silhouette':
        pngs['silhouette'] = fig_view(fx_l, lit_l, P('silhouette'), 'Home look: the silhouette', lk['note'])
    else:
        pngs['look_' + lk['id']] = fig_small_view(fx_l, lit_l, P('look-' + lk['id']), '%s  (%s)' % (lk['title'], ' + '.join(lk['layers'])))
pngs['look_silhouette'] = pngs['silhouette']
pngs['plan'] = fig_plan(FX, P('plan'), title='MOXIR beta v0.9 - the mixed plot, top plan')
pngs['section'] = fig_section(FX, P('section'), title='MOXIR beta v0.9 - the mixed plot, side section')
pngs['lasers'] = fig_lasers(FX, P('lasers'))
for k, v in sorted(pngs.items()):
    print('wrote', v)
with open(os.path.join(out, 'lights-beta-mix-checks.json'), 'w') as fh:
    json.dump({'summary': SUMMARY, 'lasers': CHK['lasers'], 'checks': CHECKS_PAGE, 'front_row': CHK['front_row'], 'glare': CHK['glare'], 'ends': CHK['ends']}, fh, indent=1, default=float)
page(pngs, os.path.join(out, 'lights-beta-mix.html'))
print('wrote', os.path.join(out, 'lights-beta-mix.html'))
