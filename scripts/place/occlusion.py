#!/usr/bin/env python3
# occlusion.py — the BLOCKING pass on MOXIR beta v0.9's mixed light plot (2026-10-08).
# The owner, 2026-10-08: "the analysis is good but not enough — the place has permanent things and blocking areas,
# take them into account."
#
#   python3 -I scripts/place/occlusion.py --repo . --out ~/Downloads/moxir/stage/occlusion    # pictures, table, JSON
#   python3 -I scripts/place/occlusion.py --repo . --check                                    # the numbers, JSON
#
# INPUTS
#   the hall GLB (occlusion_lib.GLB_DEFAULT, sha256 pinned there), built by scripts/place/hall.py from the committed
#     hall record rigs/moxir-hall-2026-10-07-v8-show-back21.hall.json (its geometry block is identical to the GLB's
#     own hall.json, checked 2026-10-08)
#   the plot before: rigs/moxir-lights-beta-mix-2026-10-07.json (commit c33b3d4b)
#   the plot after:  rigs/moxir-lights-beta-mix-2026-10-08-blocking.json (this pass's fixes)
#   the rig's own solids and today's fixtures: rigs/moxir-beta-v0.9-lights-2026-10-07.json (scratch doc v61)
#   beam angles: src/rigbuild/types/moxir.json optics (UP-PL5403 15 deg, UP-B380F 1.8 deg: borrowed EQUIVALENT
#     datasheets, named there); LaserCube Ultra MK2 1 mrad (maker's spec, EXACT)
#
# METHOD (what is measured, and how)
#   Obstacles: occlusion_lib.py (why triangles, and how each is named).
#   A beam: the axis plus a ring of 8 rays at HALF the beam angle (the 50 % intensity edge: the beam angle is the
#     full angle between the 50 % points, IES / the makers' datasheets) — the owner's sampling; "% blocked" is the
#     share of those 9 rays stopped before the target. A second figure, "% of the beam area", uses 61 rays (axis + 4
#     rings, rays in proportion to the ring's circumference, so each stands for an equal area of the beam's section).
#   The target: the point the plot aims at (the meeting point, the arch's crossing, a machine's face), or, for a
#     beam with no target point (up, leaned, kept), the building's skin it would reach: the roof structure (the space
#     frame or the deck above it), the floor or a wall. A PAR's target is capped at its reach (24 m, the room's light
#     distance). Something hit before the target is a BLOCK; the fixture's own carrier (the truss, within 0.6 m) is
#     not. Anything met first that is part of the target surface is the target.
#   A laser: its whole field as 9 x 5 rays (azimuth x elevation), each traced to its FIRST hit. A ray passes if it
#     ends on the roof structure (deck or space frame: solid, not glass), was >= 3 m over every floor people stand on
#     until then (rig-lib LASER_MIN_HEIGHT_M), and nothing else stood in its way. A ray that meets steel that is not
#     its termination (the crane, a runway, a column head, the truss, a chain) is a REFLECTION HAZARD: the distance
#     from the cube is stated. A tube test (4 rays offset 0.3 m) gives the 0.3 m steel clearance the plot already
#     holds against its boxes. The worst case of a mirror bounce off the termination is traced too (painted, dusty
#     steel is mostly diffuse; a mirror is the bound, not the expectation).
#   Shadows: for the three key looks, every beam's 61 rays are traced twice: to the first permanent thing, and to
#     the skin with nothing in the way. Where the second lands while the first is stopped is the SHADOW: drawn on
#     the plan (floor and roof) and on the backdrop (the vertical plane of the stage end, seen from the floor).
#   Cross-check: every beam's axis is also cast against the plot's own box model (lights_beta_options.beam_end):
#     agreement within 0.5 m is counted, every disagreement listed.
#   NOT measured: light inside the haze (a beam's visible length), reflections other than the laser bound, the DJ
#     (a person, not a permanent thing), the crowd. All positions of permanent things carry hall.json's confidence
#     (the crane girder height ASSUMED, the pipe racks LOW): the 10-08 tape changes numbers, not the method.
import argparse, json, math, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.dont_write_bytecode = True
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('--repo', default='.')
ap.add_argument('--glb', default=None)
ap.add_argument('--any-glb', action='store_true', help='accept a GLB whose sha256 is not the pinned one')
ap.add_argument('--before', default='scripts/place/rigs/moxir-lights-beta-mix-2026-10-07.json')
ap.add_argument('--after', default='scripts/place/rigs/moxir-lights-beta-mix-2026-10-08-blocking.json')
ap.add_argument('--out', default=None)
ap.add_argument('--check', action='store_true')
A = ap.parse_known_args()[0]

import occlusion_lib as O          # noqa: E402
import lights_beta_mix as MX       # noqa: E402  (imports lights_beta_options as MX.L; draws nothing on import)

L = MX.L
G = L.G
GLB = A.glb or O.GLB_DEFAULT
if not os.path.exists(GLB):
    raise SystemExit('the hall GLB is not here: %s (build it: blender -b -P scripts/place/hall.py -- --out <dir> --dims ...; '
                     'or pass --glb)' % GLB)
GLB_SHA = O.sha256(GLB)
if GLB_SHA != O.GLB_SHA256 and not A.any_glb:
    raise SystemExit('the hall GLB %s has sha256 %s, not the pinned %s: pass --any-glb to measure it anyway' % (GLB, GLB_SHA, O.GLB_SHA256))
OB = O.Obstacles(GLB, G, L.rig_boxes(), L.TRUSS, L.crane_boxes())
ALL_CLS = sorted(set(OB.lcls) | {c for _, _, c in OB.boxes})
NON_SHELL = [c for c in ALL_CLS if c not in O.SHELL]
HALF = {'par': L.BEAM_DEG['par'] / 2, 'beam': L.BEAM_DEG['beam'] / 2}
TOL = 0.05


def load_plot(rel):
    MX.PLOT = json.load(open(os.path.join(A.repo, rel)))
    fx = MX.build()
    aims = {}
    for g in MX.PLOT['groups']:
        for i, fid in enumerate(g['ids']):
            aims[fid] = (g.get('aim') or {'rule': 'keep'}, i)
    for f in fx:
        f['aim'], f['aim_i'] = aims[f['id']]
    return MX.PLOT, fx


def mount_of(f):
    return ('truss', 0.6) if L.TRUSS.dist(f['p']) < 0.6 else None


def target_point(f):
    a, i = f['aim'], f['aim_i']
    r = a['rule']
    p = f['p']
    if r == 'point':
        return np.array(a['target'], float)
    if r in ('targets', 'laser'):
        return np.array((a.get('targets') or a.get('target'))[i], float)
    if r == 'crossz':
        return np.array([a['target_x'], a['y'], p[2]])
    return None


def unit_(v):
    return np.asarray(v, float) / (np.linalg.norm(v) or 1.0)


def shell_t(o, d, sub):
    t, what, cls, _ = OB.cast(o, d, 0.35, 1e9, sub, skip_cls=NON_SHELL)
    return (t, what, cls) if t is not None else (None, 'open air', 'air')


# ------------------------------------------------------------------ a PAR's or a beam's blocking
def half_of(f):
    """Half the beam angle: the fixture's own (a zoom set in the plot) or its type's datasheet value."""
    return f.get('beam_deg', L.BEAM_DEG.get(f['kind'], 0.0)) / 2


def reach_of(f):
    return f.get('reach', L.REACH.get(f['kind'], 30.0))


def beam_rays(f, rings):
    return O.cone_rays(f['d'], half_of(f), rings)[0]


# What a beam is FOR, where the plot names no target point: the vista PARs uplight their own column (10-07 report).
INTENT = {'the vista (far columns)': 'own column'}


def family(f, T):
    """Names that ARE the target: the machine (and the parts hall.py draws for it) a target point sits on, or the
    fixture's own column for a column uplight. A hit on any of them is the beam arriving, not a block."""
    fam = set()
    if T is not None:
        for m in G['massing']:
            if all(m[k][0] - 0.6 <= T[i] <= m[k][1] + 0.6 for i, k in enumerate(('x_m', 'y_m', 'z_m'))):
                fam |= {m['id'], m.get('drawn_by') or m['id']}
        if 'press' in fam:
            fam |= {'press', 'press-crown', 'press (detail)'}
    if INTENT.get(f['groupName']) == 'own column':
        rx = min(G['rows_x_m'], key=lambda r: abs(r - f['p'][0]))
        gz = min(G['column_grid_z_m'], key=lambda g: abs(g - f['p'][2]))
        fam.add('column x %g z %g' % (rx, gz))
    return fam


def in_family(what, fam):
    return bool(what) and any(what == n or what.startswith(n + ' (') for n in fam)


def trace_beam(f, dirs, sub):
    """Per ray: the target distance, the first thing hit, whether it stops the beam before the target, and the
    skin point the ray would reach with nothing in the way (for the shadow drawing)."""
    p = f['p']
    T = target_point(f)
    fam = family(f, T)
    reach = reach_of(f)
    mount = mount_of(f)
    t_fam = None
    fam_cls = set()
    if T is not None:
        # a target ON the building's skin (a wall, the deck): any hit on that same skin is the beam arriving
        ta = OB.cast(p, unit_(T - p), 0.35, 1e9, sub, skip_cls=NON_SHELL)
        if ta[0] is not None and abs(ta[0] - float(np.linalg.norm(T - p))) < 0.6:
            fam_cls.add(ta[2])
    if fam and T is None:
        h = OB.cast(p, f['d'], 0.35, reach, sub, mount=mount)
        t_fam = h[0] if in_family(h[1], fam) else None
    out = []
    for d in dirs:
        ts, swhat, scls = shell_t(p, d, sub)
        if T is not None:
            tt = float(np.linalg.norm(T - p))
            if ts is not None and tt - 0.6 <= ts < tt:
                tt = ts                      # the target sits on that surface: reaching the surface is reaching it
            tol = 0.5                        # a target point on a machine's face: its last 0.5 m is the target
        elif t_fam is not None:
            tt, tol = t_fam, TOL             # an uplit column: the column's face
        else:
            tt = ts if ts is not None else reach
            tol = TOL
        tt = min(tt, reach)
        hit = OB.cast(p, d, 0.35, min(reach, ts if ts is not None else reach) + 0.01, sub, mount=mount)
        land = p + d * (ts if ts is not None else reach)
        rec = {'t_target': round(tt, 2), 'skin': swhat, 'skin_cls': scls, 'land': land, 'd': d,
               'first': None if hit[0] is None else {'what': hit[1], 'cls': hit[2], 't': round(hit[0], 2)}}
        blocked = hit[0] is not None and hit[0] < tt - tol and not in_family(hit[1], fam) and hit[2] not in fam_cls
        if blocked and T is None and t_fam is None and hit[2] in O.SHELL:
            blocked = False
        rec['blocked'] = {'what': hit[1], 'cls': hit[2], 't': round(hit[0], 2), 'at': p + d * hit[0]} if blocked else None
        # the shadow: the whole path to the skin, past the target too (a permanent thing in the way anywhere)
        sh = hit[0] is not None and hit[2] not in O.SHELL and not in_family(hit[1], fam) and hit[2] not in fam_cls
        rec['shadow'] = {'what': hit[1], 'cls': hit[2], 't': round(hit[0], 2), 'at': p + d * hit[0]} if sh else None
        out.append(rec)
    return out


def analyse_beam(f):
    half = math.radians(half_of(f))
    T = target_point(f)
    reach = reach_of(f)
    sub = OB.subset(f['p'], f['d'], half * 1.05, reach + 1.0)
    spec = trace_beam(f, beam_rays(f, O.SPEC_RINGS), sub)
    area = trace_beam(f, beam_rays(f, O.AREA_RINGS), sub)
    blockers = {}
    for tag, rays in (('spec', spec), ('area', area)):
        for r in rays:
            b = r['blocked']
            if not b:
                continue
            e = blockers.setdefault(b['what'], {'what': b['what'], 'cls': b['cls'], 'spec': 0, 'area': 0, 't_min': 1e9, 't_max': 0})
            e[tag] += 1
            e['t_min'] = min(e['t_min'], b['t'])
            e['t_max'] = max(e['t_max'], b['t'])
    ax = OB.cast(f['p'], f['d'], 0.35, reach, sub, mount=mount_of(f))
    bt, bwhat, _ = L.beam_end(f['p'], f['d'], reach, skip=('truss',) if f['p'][1] > 3 else ()) if f['kind'] in L.BEAM_DEG else (reach, 'n/a (type not in the box model)', None)
    return {'id': f['id'], 'group': f['groupName'], 'kind': f['kind'], 'beam_deg': 2 * half_of(f),
            'at': [round(v, 2) for v in f['p']], 'aim': f['aim']['rule'],
            'target': ([round(v, 2) for v in T] if T is not None else ('its own column' if INTENT.get(f['groupName']) else 'the building skin (%s)' % spec[0]['skin'])),
            'target_is': sorted(family(f, T)),
            't_target_m': spec[0]['t_target'],
            'blocked_pct': round(100.0 * sum(1 for r in spec if r['blocked']) / len(spec), 1),
            'blocked_area_pct': round(100.0 * sum(1 for r in area if r['blocked']) / len(area), 1),
            'blockers': sorted(({**v, 't_min': round(v['t_min'], 2), 't_max': round(v['t_max'], 2)} for v in blockers.values()), key=lambda v: v['t_min']),
            'axis_first_hit': {'what': ax[1] or 'open air', 'cls': ax[2] or 'air', 't': round(ax[0], 2) if ax[0] else None},
            'box_model_axis': {'what': bwhat, 't': round(bt, 2)},
            '_rays': area, '_spec': spec}


# ------------------------------------------------------------------ lasers
AUDX = (-G['column_inner_face_x_m'], G['column_inner_face_x_m'])


def path_heights(o, d, t):
    ts = np.arange(0.0, t, 0.05)
    pts = o[None, :] + ts[:, None] * d[None, :]
    inside = (pts[:, 0] > L.WALLS[0]) & (pts[:, 0] < L.WALLS[1]) & (pts[:, 2] > L.ENDS[0]) & (pts[:, 2] < L.ENDS[1])
    floor = np.where((pts[:, 0] >= L.RISER['x'][0]) & (pts[:, 0] <= L.RISER['x'][1]) & (pts[:, 2] >= L.RISER['z'][0]) & (pts[:, 2] <= L.RISER['z'][1]), L.RISER['y'], 0.0)
    clear = (pts[:, 1] - floor)[inside]
    aud = (pts[:, 0] >= AUDX[0]) & (pts[:, 0] <= AUDX[1]) & (pts[:, 2] >= L.AUD['z'][0]) & (pts[:, 2] <= L.ENDS[1])
    return (float(clear.min()) if len(clear) else 99.0), (float(pts[aud, 1].min()) if aud.any() else None)


def mirror_bounce(q, d, n):
    """Worst case: the termination is a mirror. Where does the bounce go, and does it come under 3 m over people?"""
    r = d - 2 * (d @ n) * n
    sub = OB.subset(q, r, 0.01, 200)
    t, what, cls, _ = OB.cast(q, r, 0.05, 200, sub)
    t = t if t is not None else 120.0
    ts = np.arange(0.0, t, 0.1)
    pts = q[None, :] + ts[:, None] * r[None, :]
    people = (pts[:, 0] >= L.WALLS[0]) & (pts[:, 0] <= L.WALLS[1]) & (pts[:, 2] >= L.ENDS[0]) & (pts[:, 2] <= L.ENDS[1]) & (pts[:, 1] < L.LASER_MIN)
    aud = people & (pts[:, 0] >= AUDX[0]) & (pts[:, 0] <= AUDX[1]) & (pts[:, 2] >= L.AUD['z'][0])
    return {'ends_on': what or 'open air', 'under_3m_anywhere': bool(people.any()), 'under_3m_over_audience': bool(aud.any()),
            'lowest_m': round(float(pts[:, 1].min()), 2)}


def analyse_laser(f):
    rays = MX.fan_rays(f, 9, 5)
    p = f['p']
    fan = math.radians(max(f['fan']) + 1.0)
    sub = OB.subset(p, f['d'], fan, 130.0)
    out = []
    for d in rays:
        t, what, cls, n = OB.cast(p, d, 0.35, 130.0, sub)
        if t is None:
            t, what, cls = 130.0, 'open air', 'air'
        lo_floor, lo_aud = path_heights(p, d, t)
        u = np.cross(d, [0.0, 1.0, 0.0])
        u /= np.linalg.norm(u)
        w = np.cross(d, u)
        near = None
        for off in (u, -u, w, -w):
            o2 = p + 0.3 * off
            t2, what2, cls2, _ = OB.cast(o2, d, 0.35, t - 0.3, sub)
            if t2 is not None and cls2 not in O.ROOF and (near is None or t2 < near['t']):
                near = {'what': what2, 'cls': cls2, 't': round(t2, 2)}
        r = {'dir': [round(v, 4) for v in d], 'ends_on': what, 'cls': cls, 't': round(t, 2), 'end': [round(v, 2) for v in p + d * t],
             'min_over_floor_m': round(lo_floor, 2), 'min_over_audience_m': None if lo_aud is None else round(lo_aud, 2),
             'within_0_3m_of': near}
        errs = []
        if cls in O.GLASS:
            errs.append('ends in glass (%s)' % what)
        elif cls not in O.ROOF:
            errs.append('stopped by %s at %.1f m%s' % (what, t, ' (steel: reflection hazard)' if cls in O.STEEL or cls in ('column head', 'upper column') else ''))
        if lo_floor < L.LASER_MIN:
            errs.append('%.2f m over a floor' % lo_floor)
        if near:
            errs.append('passes within 0.3 m of %s at %.1f m' % (near['what'], near['t']))
        r['errors'] = errs
        if cls in O.ROOF and n is not None:
            r['mirror'] = mirror_bounce(p + d * (t - 0.01), d, n)
        out.append(r)
    ends = {}
    for r in out:
        ends[r['ends_on']] = ends.get(r['ends_on'], 0) + 1
    steel = [r for r in out if r['cls'] not in O.ROOF and r['cls'] not in O.GLASS and r['cls'] != 'air']
    return {'id': f['id'], 'group': f['groupName'], 'at': [round(v, 2) for v in p], 'rays': len(out), 'ends': ends,
            'blocked_pct': round(100.0 * sum(1 for r in out if r['errors']) / len(out), 1),
            'in_glass': sum(1 for r in out if r['cls'] in O.GLASS),
            'steel_hits': [{'what': r['ends_on'], 't': r['t']} for r in steel],
            'nearest_steel_hit_m': min((r['t'] for r in steel), default=None),
            'within_0_3m': sorted({r['within_0_3m_of']['what'] for r in out if r['within_0_3m_of']}),
            'min_over_audience_m': min((r['min_over_audience_m'] for r in out if r['min_over_audience_m'] is not None), default=None),
            'min_over_floor_m': min(r['min_over_floor_m'] for r in out),
            'termination_m': [min(r['t'] for r in out), max(r['t'] for r in out)],
            'mirror_worst_case_under_3m_over_audience': sum(1 for r in out if r.get('mirror', {}).get('under_3m_over_audience')),
            'mirror_worst_case_under_3m_anywhere': sum(1 for r in out if r.get('mirror', {}).get('under_3m_anywhere')),
            'pass': all(not r['errors'] for r in out), '_rays': out}


# ------------------------------------------------------------------ the pass
LOOKS = [
    {'id': 'silhouette', 'title': 'the silhouette backlight', 'groups': ['the backlight fan (floor, behind the riser)', 'the halo PARs (floor, behind the riser)']},
    {'id': 'truss_wall', 'title': 'the truss wall', 'groups': ['the X (truss)', 'the curtain (truss)', 'the bridge-up PARs (truss top)']},
    {'id': 'arches', 'title': 'the crowd arches', 'groups': ['the column arch (floor, column rows)']},
]


def run(rel):
    plot, fx = load_plot(rel)
    beams, lasers = [], []
    for f in fx:
        if f.get('spare') or f['d'] is None:
            continue
        if f['kind'] in ('par', 'beam'):
            beams.append(analyse_beam(f))
        elif f['kind'] == 'laser':
            lasers.append(analyse_laser(f))
    agree = [b for b in beams if abs((b['axis_first_hit']['t'] or L.REACH[b['kind']]) - b['box_model_axis']['t']) <= 0.5]
    disagree = [{'id': b['id'], 'triangles': b['axis_first_hit'], 'boxes': b['box_model_axis']} for b in beams if b not in agree]
    groups = {}
    for b in beams:
        g = groups.setdefault(b['group'], {'group': b['group'], 'n': 0, 'blocked': 0, 'worst_pct': 0.0, 'what': set()})
        g['n'] += 1
        g['blocked'] += b['blocked_pct'] > 0
        g['worst_pct'] = max(g['worst_pct'], b['blocked_pct'])
        g['what'] |= {x['what'] for x in b['blockers']}
    for g in groups.values():
        g['what'] = sorted(g['what'])
    return {'plot': rel, 'fx': fx, 'beams': beams, 'lasers': lasers, 'groups': list(groups.values()),
            'box_agree': len(agree), 'box_n': len(beams), 'box_disagree': disagree}


def run_looks(rel):
    """Every cue state of the page (aims change between looks, places never): the lit beams' blocking."""
    MX.PLOT = json.load(open(os.path.join(A.repo, rel)))
    gaim = {g['name']: g.get('aim') or {'rule': 'keep'} for g in MX.PLOT['groups']}
    gidx = {fid: i for g in MX.PLOT['groups'] for i, fid in enumerate(g['ids'])}
    out = {}
    for lk in MX.LOOKS[1:]:
        fx, lit = MX.look_fx(lk)
        rows = []
        for f in fx:
            if f['id'] not in lit or f['d'] is None or f['kind'] not in ('par', 'beam'):
                continue
            f['aim'] = (((MX.PLOT.get('look_overrides') or {}).get(lk['id'], {}).get(f['groupName'], {}).get('aim'))
                        or ((lk.get('over') or {}).get(f['groupName'], {}).get('aim')) or gaim[f['groupName']])
            f['aim_i'] = gidx[f['id']]
            rows.append(analyse_beam(f))
        bl = [r for r in rows if r['blocked_pct'] > 0]
        out[lk['id']] = {'title': lk['title'], 'lit_beams': len(rows), 'blocked': len(bl),
                         'blocked_ids': ['%s %.0f %% (%s)' % (r['id'].replace('rig-', ''), r['blocked_pct'], ', '.join(b['what'] for b in r['blockers'])) for r in bl]}
    return out


def summary(res):
    bl = [b for b in res['beams'] if b['blocked_pct'] > 0]
    return {'n_beams': len(res['beams']), 'beams_blocked': len(bl), 'beams_blocked_ids': [b['id'] for b in bl],
            'n_lasers': len(res['lasers']), 'lasers_pass': sum(l['pass'] for l in res['lasers']),
            'laser_rays': sum(l['rays'] for l in res['lasers']),
            'laser_rays_in_glass': sum(l['in_glass'] for l in res['lasers']),
            'laser_rays_on_steel_not_roof': sum(len(l['steel_hits']) for l in res['lasers']),
            'laser_rays_within_0_3m': sum(1 for l in res['lasers'] for r in l['_rays'] if r['within_0_3m_of']),
            'laser_min_over_audience_m': min((l['min_over_audience_m'] for l in res['lasers'] if l['min_over_audience_m'] is not None), default=None),
            'laser_mirror_worst_case_under_3m_over_audience': sum(l['mirror_worst_case_under_3m_over_audience'] for l in res['lasers']),
            'box_model_agree': '%d of %d' % (res['box_agree'], res['box_n'])}


def public(res):
    def clean(v):
        if isinstance(v, dict):
            return {k: clean(x) for k, x in v.items() if not k.startswith('_')}
        if isinstance(v, list):
            return [clean(x) for x in v]
        if isinstance(v, np.ndarray):
            return [round(float(x), 3) for x in v]
        return v
    return {'plot': res['plot'], 'beams': clean(res['beams']),
            'lasers': [dict(clean(l), rays=clean(l['_rays'])) for l in res['lasers']],
            'groups': res['groups'], 'box_model': {'agree': res['box_agree'], 'n': res['box_n'], 'disagree': res['box_disagree']}}


# ------------------------------------------------------------------ drawing (matplotlib, no WebGL)
RED, LOST, DIM, FG, BG = '#ff3b30', '#5a1a16', '#8f969e', '#e3e6ea', L.COL['bg']
SHORT = lambda i: i.replace('rig-', '').replace('beam380-', 'beam ').replace('par-', 'PAR ').replace('lasercube-cut-', 'cube ')


def cone(items, cam, p, d, t0, t1, kind, colour, mul):
    half = math.radians(L.BEAM_DEG[kind] / 2)
    apr = {'par': 0.1, 'beam': 0.07, 'laser': 0.004}[kind]
    step = 0.5 if kind == 'par' else 1.0
    ss = np.append(np.arange(t0, t1, step), t1)
    for fac, a0, fall, minpx in L.beam_layers(kind):
        for s0, s1 in zip(ss[:-1], ss[1:]):
            pts = []
            for s in (s0, s1):
                c = cam.cam(p + s * d)
                if c[2] < L.NEAR:
                    break
                pts.append((cam.scr(c), max((apr + s * math.tan(half)) * fac * cam.F / c[2], minpx)))
            if len(pts) < 2:
                continue
            (sa, ra), (sb, rb) = pts
            v = sb - sa
            n = np.array([-v[1], v[0]]) / (np.hypot(*v) or 1)
            alpha = min(1.0, a0 * mul * math.exp(-(s0 + s1) / 2 / fall))
            items.append((float(np.linalg.norm(p + (s0 + s1) / 2 * d - cam.E)), np.array([sa + n * ra, sb + n * rb, sb - n * rb, sa - n * ra]),
                          L.rgba(colour, alpha), (0, 0, 0, 0), 0))


# The blocked view stands at the BACK of the dance floor (z 47.5), so the arches over the floor are in front of the eye.
VIEW_EYE, VIEW_LOOK, VIEW_FOV = np.array([0.0, 1.6, 47.5]), np.array([0.0, 7.0, 21.0]), 66.0


def view_blocked(res, path, title, sub):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    by = {b['id']: b for b in res['beams']}
    lz = {l['id']: l for l in res['lasers']}
    orig = L.add_beam

    def patched(items, cam, f, lit=True):
        fid = f['id'].split('#')[0]
        if f['kind'] == 'laser':
            k = int(f['id'].split('#')[1]) if '#' in f['id'] else 0
            bad = lz.get(fid) and not lz[fid]['pass']
            return orig(items, cam, dict(f, colour=RED if bad else f['colour']))
        b = by.get(fid)
        if b is None:
            return
        tend = b['axis_first_hit']['t'] or L.REACH[f['kind']]
        if b['blocked_pct'] == 0:
            cone(items, cam, f['p'], f['d'], 0.0, tend, f['kind'], '#9aa3ad', 0.55)
            return
        tb = b['blockers'][0]['t_min']
        cone(items, cam, f['p'], f['d'], 0.0, tb, f['kind'], RED, 2.2)
        cone(items, cam, f['p'], f['d'], tb, max(b['t_target_m'], tb + 0.5), f['kind'], RED, 0.5)
    L.add_beam = patched
    cam0 = L.CAM
    L.CAM = dict(cam0, eye=VIEW_EYE, look=VIEW_LOOK, vfov=VIEW_FOV)
    try:
        fig = plt.figure(figsize=(16.0, 9.0 + 0.9), dpi=100)
        fig.patch.set_facecolor(BG)
        ax = fig.add_axes([0, 0, 1, 9.0 / 9.9])
        fx = res['fx']
        MX.view(ax, fx, {f['id'] for f in fx if not f['spare']}, labels=False)
        cam = L.Camera(L.CAM['eye'], L.CAM['look'], L.CAM['vfov'], L.CAM['W'], L.CAM['H'])
    finally:
        L.add_beam = orig
        L.CAM = cam0
    seen = set()
    for b in res['beams']:
        if b['blocked_pct'] == 0:
            continue
        f = next(f for f in fx if f['id'] == b['id'])
        bl = b['blockers'][0]
        q = f['p'] + f['d'] * bl['t_min']
        c = cam.cam(q)
        if c[2] < L.NEAR:
            continue
        sx, sy = cam.scr(c)
        if not (0 <= sx <= L.CAM['W'] and 0 <= sy <= L.CAM['H']):
            continue
        ax.plot(sx, sy, marker='x', ms=9, mew=2, color=RED, zorder=9)
        key = (b['group'], bl['what'])
        if key in seen:
            continue
        seen.add(key)
        dy = -8 - 44 * (len(seen) % 3)
        ax.plot([sx, sx + 8], [sy, sy + dy], color=RED, lw=0.6, zorder=9)
        ax.text(sx + 8, sy + dy, '%s: %.0f %% blocked\nby %s at %.1f m' % (SHORT(b['id']), b['blocked_pct'], bl['what'], bl['t_min']),
                color='#ffb3ad', fontsize=8.5, family='DejaVu Sans Mono', zorder=10,
                bbox=dict(fc='#1a0d0c', ec=RED, lw=0.6, alpha=0.85))
    fig.text(0.012, 1 - 0.3 / 9.9, title, color=FG, fontsize=15, fontweight='bold', family='DejaVu Sans Mono', va='center')
    fig.text(0.012, 1 - 0.62 / 9.9, sub, color=DIM, fontsize=9, family='DejaVu Sans Mono', va='center')
    fig.savefig(path, facecolor=BG)
    plt.close(fig)
    return path


def rays_2d(ax, b, fx, axes, colour, label=None, dy=-0.45):
    f = next(f for f in fx if f['id'] == b['id'])
    i, j = axes
    for r in b['_spec']:
        d = r['d']
        if r['blocked']:
            q = r['blocked']['at']
            ax.plot([f['p'][i], q[i]], [f['p'][j], q[j]], color=RED, lw=1.1, zorder=5)
            q2 = f['p'] + d * r['t_target']
            ax.plot([q[i], q2[i]], [q[j], q2[j]], color=RED, lw=0.8, ls=':', zorder=5)
            ax.plot(q[i], q[j], marker='x', ms=6, mew=1.6, color=RED, zorder=6)
        else:
            q = f['p'] + d * r['t_target']
            ax.plot([f['p'][i], q[i]], [f['p'][j], q[j]], color=colour, lw=0.9, alpha=0.9, zorder=4)
    ax.plot(f['p'][i], f['p'][j], marker='o', ms=4, color=colour, mec='#000', zorder=7)
    if label:
        ax.text(f['p'][i], f['p'][j] + dy, label, color=colour, fontsize=7, ha='center', va='top', family='DejaVu Sans Mono')


def frame_axes(ax, xl, yl, xlabel, ylabel, title):
    ax.set_facecolor(BG)
    ax.set_xlim(*xl)
    ax.set_ylim(*yl)
    ax.set_aspect('equal')
    ax.tick_params(colors=DIM, labelsize=7)
    for sp in ax.spines.values():
        sp.set_color('#2a2e33')
    ax.set_xlabel(xlabel, color=DIM, fontsize=8)
    ax.set_ylabel(ylabel, color=DIM, fontsize=8)
    ax.set_title(title, color=FG, fontsize=9.5, loc='left', family='DejaVu Sans Mono')


def rect(ax, x, y, c, a=1.0, fill=True, lw=0.8, ls='-', z=1, hatch=None):
    from matplotlib.patches import Rectangle
    ax.add_patch(Rectangle((x[0], y[0]), x[1] - x[0], y[1] - y[0], fc=c if fill else 'none', ec=c, alpha=a, lw=lw, ls=ls, zorder=z, hatch=hatch))


def fig_details(B, Af, path):
    """The two blocks, close up: the arch against the space frame (section across the hall at z 30) and the press
    crown's outer beam against the side cabinets (section along the hall, x ignored)."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig = plt.figure(figsize=(17.0, 5.6), dpi=100)
    fig.patch.set_facecolor(BG)
    for k, (res, tag) in enumerate(((B, 'BEFORE (c33b3d4b): crossing at 11.0 m'), (Af, 'AFTER: crossing at 10.0 m'))):
        ax = fig.add_axes([0.04 + k * 0.31, 0.1, 0.28, 0.76])
        frame_axes(ax, (-13, 13), (0, 14.5), 'x (m), seen from the entry', 'height (m)', 'arch pair z 30, %s' % tag)
        hd = G['column_head']
        for sx in (-1, 1):
            rect(ax, (sx * 12 - 0.4, sx * 12 + 0.4), (0, hd['flare_start_m']), '#4a525c')
            rect(ax, (sx * 12 - hd['head_w_m'] / 2, sx * 12 + hd['head_w_m'] / 2), (hd['flare_start_m'], hd['head_top_m']), '#4a525c')
            rect(ax, (sx * 12 - hd['upper_d_m'] / 2, sx * 12 + hd['upper_d_m'] / 2), (hd['head_top_m'], G['truss_bottom_m']), '#4a525c')
            for gx in (sx * 11.35, sx * 12.65):
                rect(ax, (gx - 0.3, gx + 0.3), (G['runway_bottom_m'], G['runway_top_m']), '#6b6f75')
        for m in G['massing']:
            if m['id'].startswith('pipe-rack'):
                rect(ax, m['x_m'], m['y_m'], '#7a4b2a', 0.8)
        rect(ax, (-13, 13), (G['truss_bottom_m'], G['truss_bottom_m'] + 0.24), '#c9a200', 0.95, z=3)
        ax.text(-12.6, G['truss_bottom_m'] + 0.45, 'space frame bottom chord 10.8-11.04 m (runs along x at z 30, in the beam plane)', color='#e0c040', fontsize=7)
        rect(ax, (-13, 13), (G['deck_m'], G['deck_m'] + 0.15), '#3a4048', z=2)
        ax.text(-12.6, G['deck_m'] + 0.35, 'roof deck 13.35 m', color=DIM, fontsize=7)
        for b in res['beams']:
            if b['id'] in ('rig-beam380-columns-03', 'rig-beam380-columns-04'):
                rays_2d(ax, b, res['fx'], (0, 1), '#ffffff', '%s  %.0f %%' % (SHORT(b['id']), b['blocked_pct']))
        tgt = next(b for b in res['beams'] if b['id'] == 'rig-beam380-columns-03')['target']
        ax.plot(tgt[0], tgt[1], marker='+', ms=12, color='#27ff4a', zorder=8)
        ax.text(tgt[0] + 0.4, tgt[1] - 0.6, 'meeting point y %.1f' % tgt[1], color='#27ff4a', fontsize=7.5)
    # the press
    ax = fig.add_axes([0.67, 0.1, 0.31, 0.76])
    frame_axes(ax, (0, 10.5), (0, 7), 'z (m), toward the entry', 'height (m)', 'press crown, outer beam (sides-02), side view')
    for m in G['massing']:
        if m['id'] in ('press', 'press-crown', 'press-pedestal', 'press-side-cabinets'):
            rect(ax, m['z_m'], m['y_m'], '#a0522d' if 'cabinet' in m['id'] else '#5b5148', 0.55 if 'cabinet' in m['id'] else 0.8)
            ax.text((m['z_m'][0] + m['z_m'][1]) / 2, m['y_m'][1] + 0.12, m['id'] + (' (x 2-5)' if 'cabinet' in m['id'] else ''), color='#d9c3a5', fontsize=7, ha='center')
    for res, col, lab in ((B, RED, 'before x 1.4'), (Af, '#9ad0ff', 'after x 1.0')):
        b = next(b for b in res['beams'] if b['id'] == 'rig-par-press-sides-02')
        rays_2d(ax, b, res['fx'], (2, 1), col if res is Af else '#ffd0cc', '%s: %.0f %%' % (lab, b['blocked_pct']), dy=-0.35 if res is B else 0.25)
    ax.text(0.3, 6.6, 'the 9 rays (axis + ring at half the 15 deg beam) of the outermost PAR; the cabinets sit at x 2-5,\n'
            'so in this view they overlap only the rays that pass over x > 2', color=DIM, fontsize=7, va='top')
    fig.text(0.04, 0.94, 'The blocks, close up: the axis + a ring at half the beam angle (9 rays), cast against the hall\'s triangles',
             color=FG, fontsize=13, fontweight='bold', family='DejaVu Sans Mono')
    fig.savefig(path, facecolor=BG)
    plt.close(fig)
    return path


LOOK_COL = {'silhouette': '#ffffff', 'truss_wall': '#eef3ff', 'arches': '#9ad0ff'}


def look_beams(res, lk):
    return [b for b in res['beams'] if b['group'] in lk['groups']]


def fig_shadows_plan(B, Af, path):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig = plt.figure(figsize=(19.5, 15.4), dpi=90)
    fig.patch.set_facecolor(BG)
    for row, (res, tag) in enumerate(((B, 'before (c33b3d4b)'), (Af, 'after the fixes'))):
        for k, lk in enumerate(LOOKS):
            ax = fig.add_axes([0.03 + k * 0.325, 0.49 - row * 0.465, 0.3, 0.405])
            MX.plan(ax, res['fx'], set(), ('none',))
            ax.set_xlim(-13.5, 13.5)
            ax.set_ylim(50, 12)
            for t in list(ax.texts):
                if not (12 <= t.get_position()[1] <= 50):
                    t.set_visible(False)
            bs = look_beams(res, lk)
            n = sh = 0
            what = {}
            for b in bs:
                f = next(f for f in res['fx'] if f['id'] == b['id'])
                ax.plot(f['p'][0], f['p'][2], marker='o', ms=4, mfc=f['colour'], mec='#000', zorder=8)
                for r in b['_rays']:
                    n += 1
                    q = r['land']
                    roof = q[1] > 8
                    if r['shadow']:
                        sh += 1
                        what[r['shadow']['what']] = what.get(r['shadow']['what'], 0) + 1
                        ax.plot(q[0], q[2], marker='x', ms=4.5, mew=1.2, color=RED, zorder=9)
                        a = r['shadow']['at']
                        ax.plot(a[0], a[2], marker='s', ms=2.5, color='#ffb3ad', zorder=9)
                    else:
                        ax.plot(q[0], q[2], marker='^' if roof else 'o', ms=2.2, color=LOOK_COL[lk['id']], alpha=0.8, zorder=7, mew=0)
            ax.set_title('%s, %s\n%d rays, %d in shadow%s' % (lk['title'], tag, n, sh,
                         (': ' + '; '.join('%s %d' % (w, c) for w, c in sorted(what.items(), key=lambda kv: -kv[1])[:3])) if what else ''),
                         color=RED if sh else FG, fontsize=8.5, loc='left', family='DejaVu Sans Mono')
    fig.text(0.03, 0.985, 'Shadows of the permanent things, from above: where each beam lands (dot: floor, triangle: roof structure) '
             'and, red x, where it would land but a permanent thing stops it (small square: the stopping point)',
             color=FG, fontsize=11.5, fontweight='bold', family='DejaVu Sans Mono', va='top')
    fig.text(0.03, 0.962, 'Every beam\'s 61 rays (axis + 4 rings to half the beam angle, equal areas) traced to the hall\'s triangles + the rig\'s solids. '
             'Past the target too: a shadow anywhere on the path counts.', color=DIM, fontsize=9, family='DejaVu Sans Mono', va='top')
    fig.savefig(path, facecolor=BG)
    plt.close(fig)
    return path


def fig_shadows_backdrop(B, Af, path):
    """The backdrop: the stage end seen from the floor (x across, height up, every ray projected along z)."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig = plt.figure(figsize=(19.5, 12.6), dpi=90)
    fig.patch.set_facecolor(BG)
    hd = G['column_head']
    for row, (res, tag) in enumerate(((B, 'before (c33b3d4b)'), (Af, 'after the fixes'))):
        for k, lk in enumerate(LOOKS):
            ax = fig.add_axes([0.03 + k * 0.325, 0.52 - row * 0.47, 0.3, 0.38])
            frame_axes(ax, (-13, 13), (0, 15), 'x (m), house left at left', 'height (m)', '')
            for sx in (-1, 1):
                rect(ax, (sx * 12 - 0.4, sx * 12 + 0.4), (0, hd['flare_start_m']), '#3a4048')
                rect(ax, (sx * 12 - hd['head_w_m'] / 2, sx * 12 + hd['head_w_m'] / 2), (hd['flare_start_m'], hd['head_top_m']), '#3a4048')
                rect(ax, (sx * 12 - hd['upper_d_m'] / 2, sx * 12 + hd['upper_d_m'] / 2), (hd['head_top_m'], G['truss_bottom_m']), '#3a4048')
            rect(ax, (-11.35, 11.35), (G['cranes'][0]['girder_bottom_m'], G['cranes'][0]['girder_top_m']), '#c9a200', 0.35)
            ax.text(-11, 8.95, 'crane bridge z 21 (girders 7.95-8.75 m)', color='#c9a200', fontsize=7)
            rect(ax, (-13, 13), (G['truss_bottom_m'], G['truss_bottom_m'] + 0.24), '#8a7a30', 0.7)
            rect(ax, (-13, 13), (G['deck_m'], G['deck_m'] + 0.12), '#3a4048')
            rect(ax, (-6, 6), (G['deck_m'], G['lantern_top_m']), '#3d5a73', 0.5, fill=False, hatch='////')
            ax.plot([L.TRUSS_A[0], L.TRUSS_B[0]], [L.TRUSS_A[1], L.TRUSS_B[1]], color=L.COL['truss'], lw=3, zorder=3)
            rect(ax, L.RISER['x'], (0, L.RISER['y']), L.COL['riser'], z=3)
            for x in (-5.4, 5.4):
                rect(ax, (x - 0.67, x + 0.67), (0, 1.86), '#3a4048', z=3)
            n = sh = 0
            for b in look_beams(res, lk):
                f = next(f for f in res['fx'] if f['id'] == b['id'])
                for r in b['_rays']:
                    n += 1
                    q = r['land']
                    if r['shadow']:
                        sh += 1
                        a = r['shadow']['at']
                        ax.plot([f['p'][0], a[0]], [f['p'][1], a[1]], color=RED, lw=0.5, alpha=0.6, zorder=5)
                        ax.plot([a[0], q[0]], [a[1], q[1]], color=LOST, lw=0.6, ls=':', zorder=4)
                    else:
                        ax.plot([f['p'][0], q[0]], [f['p'][1], q[1]], color=LOOK_COL[lk['id']], lw=0.35, alpha=0.25, zorder=4)
            ax.set_title('%s, %s: %d of %d rays shadowed' % (lk['title'], tag, sh, n), color=RED if sh else FG, fontsize=9, loc='left', family='DejaVu Sans Mono')
    fig.text(0.03, 0.975, 'Shadows on the backdrop: the key looks seen from the dance floor (every ray projected along the hall). '
             'Red: lit part of a ray that a permanent thing stops; dotted: the light that never arrives.',
             color=FG, fontsize=11.5, fontweight='bold', family='DejaVu Sans Mono', va='top')
    fig.text(0.03, 0.952, 'A shadow = a ray stopped by a permanent thing that is not the skin (floor, roof structure, walls). The roof\'s space frame IS the skin here, '
             'so the arches cut by its chord (before) show as arriving: that block is in blocked-details.png. The truss wall\'s red rays are the 3 low X PARs '
             'PAST their crossing (2.6 m), landing on the blower, drum tank and conveyor on house right instead of the floor: spill, not a block of the look.',
             color=DIM, fontsize=8.6, family='DejaVu Sans Mono', va='top', wrap=True)
    fig.savefig(path, facecolor=BG)
    plt.close(fig)
    return path


def blockers_str(b):
    return '; '.join('%s at %.1f-%.1f m (%d of 9 rays, %d of 61)' % (x['what'], x['t_min'], x['t_max'], x['spec'], x['area']) for x in b['blockers'])


def write_tables(B, Af, out):
    import csv
    pa = os.path.join(out, 'blocking-table.csv')
    with open(pa, 'w', newline='') as fh:
        w = csv.writer(fh)
        w.writerow(['plot', 'fixture', 'group', 'kind', 'beam angle deg', 'target', 'target distance m', '% blocked (9 rays: axis + ring at half the beam angle)',
                    '% of beam area blocked (61 rays)', 'what blocks it, where (distance from the lens)', 'axis first hit (triangles)', 'axis first hit (the plot\'s boxes)'])
        for res, tag in ((B, 'before c33b3d4b'), (Af, 'after')):
            for b in res['beams']:
                w.writerow([tag, b['id'], b['group'], b['kind'], b['beam_deg'], b['target'] if isinstance(b['target'], str) else '(%s)' % ', '.join('%g' % v for v in b['target']),
                            b['t_target_m'], b['blocked_pct'], b['blocked_area_pct'], blockers_str(b) or 'nothing',
                            '%s %.1f m' % (b['axis_first_hit']['what'], b['axis_first_hit']['t'] or 0), '%s %.1f m' % (b['box_model_axis']['what'], b['box_model_axis']['t'])])
            for l in res['lasers']:
                w.writerow([tag, l['id'], l['group'], 'laser', '0.057 (1 mrad)', 'roof structure', '%.1f-%.1f' % tuple(l['termination_m']), l['blocked_pct'], '',
                            'ends: ' + '; '.join('%s %d' % kv for kv in l['ends'].items()) + '; steel not roof: %d; within 0.3 m of steel: %s' % (len(l['steel_hits']), ', '.join(l['within_0_3m']) or 'none'), '', ''])
    bb = {b['id']: b for b in B['beams']}
    ab = {b['id']: b for b in Af['beams']}
    rows = []
    for ch in Af['plot_record'].get('changes', []):
        for fid in ch['ids']:
            rows.append({'fixture': fid, 'group': ch['group'], 'change': ch['what'], 'why': ch['why'],
                         'before': '%.0f %% (%s)' % (bb[fid]['blocked_pct'], blockers_str(bb[fid]) or 'nothing'),
                         'after': '%.0f %% (%s)' % (ab[fid]['blocked_pct'], blockers_str(ab[fid]) or 'nothing')})
    for fid, b in ab.items():
        if b['blocked_pct'] > 0:
            rows.append({'fixture': fid, 'group': b['group'], 'change': 'NOT FIXED: kept', 'why': NOT_FIXED.get(fid, 'no fix found'),
                         'before': '%.0f %% (%s)' % (bb[fid]['blocked_pct'], blockers_str(bb[fid])), 'after': '%.0f %% (%s)' % (b['blocked_pct'], blockers_str(b))})
    pf = os.path.join(out, 'fixes.csv')
    with open(pf, 'w', newline='') as fh:
        w = csv.DictWriter(fh, fieldnames=['fixture', 'group', 'change', 'why', 'before', 'after'])
        w.writeheader()
        w.writerows(rows)
    return pa, pf, rows


NOT_FIXED = {
    'rig-par-vista-05': 'its column\'s X bracing (bay z -36..-30) takes the top edge of the cone at 5.5 m: 1 of 9 rays, 1.6 % of the beam area. '
                        'The PAR uplights that column; the brace beside it is lit with it. Re-aiming 0.3-0.8 m off the brace or moving the PAR 0.3 m '
                        'loses the column (the cone then runs into the runway girders at 6.8 m: 23-43 % of its area, measured). Kept.',
    'rig-par-vista-06': 'as vista-05, mirrored (house right).',
}


if __name__ == '__main__':
    BEFORE = run(A.before)
    BEFORE['plot_record'] = MX.PLOT
    out = {'glb': GLB, 'glb_sha256': GLB_SHA, 'triangles': OB.n_tris, 'rig_boxes': len(OB.boxes),
           'classes': {c: int((OB.cls == c).sum()) for c in sorted(set(OB.lcls))},
           'before': dict(summary(BEFORE), looks=run_looks(A.before), **public(BEFORE))}
    AFTER = None
    if os.path.exists(os.path.join(A.repo, A.after)):
        AFTER = run(A.after)
        AFTER['plot_record'] = MX.PLOT
        out['after'] = dict(summary(AFTER), looks=run_looks(A.after), changes=AFTER['plot_record'].get('changes', []), not_fixed=NOT_FIXED, **public(AFTER))
    if A.check or not A.out:
        print(json.dumps(out, indent=1))
        sys.exit(0)
    od = os.path.expanduser(A.out)
    os.makedirs(od, exist_ok=True)
    wrote = [view_blocked(BEFORE, os.path.join(od, 'blocked.png'), 'BLOCKED beams, the mix as committed (c33b3d4b): red = stopped by a permanent thing before its target',
                          'eye at the back of the floor (z 47.5, 1.6 m), every fixture at home aim; grey = reaches its target. '
                          'Hall GLB (55 000 triangles) + rig solids; axis + ring at half the beam angle.')]
    if AFTER:
        wrote += [view_blocked(AFTER, os.path.join(od, 'blocked-fixed.png'), 'AFTER the fixes: the same view, the same test',
                               'red = still stopped (the 2 vista PARs at z -36 are kept: 1.6 % of their beam on the X bracing beside their own column).'),
                  fig_details(BEFORE, AFTER, os.path.join(od, 'blocked-details.png')),
                  fig_shadows_plan(BEFORE, AFTER, os.path.join(od, 'shadows-plan.png')),
                  fig_shadows_backdrop(BEFORE, AFTER, os.path.join(od, 'shadows-backdrop.png'))]
        wrote += list(write_tables(BEFORE, AFTER, od)[:2])
    with open(os.path.join(od, 'blocking.json'), 'w') as fh:
        json.dump(out, fh, indent=1)
    wrote.append(os.path.join(od, 'blocking.json'))
    for w in wrote:
        print('wrote', w)
