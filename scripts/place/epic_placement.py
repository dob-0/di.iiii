#!/usr/bin/env python3
# epic_placement.py — MOXIR beta v0.9, the epic plot, PHASE 1: where every device goes (2026-10-08).
# Sketches + measured placement options; the owner picks one option per group before the looks are made (phase 2).
# Pictures and numbers only; nothing is built.
#
#   python3 -I scripts/place/epic_placement.py --repo . --out ~/Downloads/moxir/stage/epic    # placement.html + PNGs
#   python3 -I scripts/place/epic_placement.py --repo . --check                               # the numbers, JSON
#
# INPUTS: rigs/moxir-epic-placement-2026-10-08.json (the groups, their options, the notes per option), the lasers as he
# repainted them (lasers_v2.py, rigs/moxir-lasers-v2-2026-10-08.json), everything else from the painted design
# (design_paint.py), the hall GLB's 55 000 triangles + the rig's solids (occlusion_lib.py).
#
# METHOD (every check is the existing engine's, run per option)
#   - Blocking: occlusion.analyse_beam (axis + a ring at half the beam angle, and an equal-area set of rays; Moller &
#     Trumbore ray/triangle, the slab method for the rig's boxes) against the hall WITH the goal-post truss (option b),
#     since the advice keeps it. A ray is blocked when something that is not its target stops it short.
#   - Lasers: lasers_v2.check_beam per option (25 rays over each beam's controller zone; its stop, >= 3 m over floors,
#     never past z 21, 0.3 m from other steel, the mirror worst case). NOHD: IEC 60825-1:2014 Table A.1 at 10 W.
#   - What the floor sees of a laser: single scattering in haze (lasers_v2.visibility's formula; Beer-Lambert; Henyey &
#     Greenstein 1941) at the 6 W unit's power, and per BEAM: a cube drawing 2 static beams is a 2-point scan, each beam
#     on for <= half the time less blanking (duty 0.45, the record's laser_model); the eye sees the time average
#     (Talbot-Plateau law). The NOHD keeps the full power (scan failure, IEC TR 60825-3).
#   - Glare: every audience eye (x +-5.35, z 25.8-48, every 0.5 x 1 m, 1.6 m) inside a lamp's field (the full beam angle)
#     with a clear line of sight; lux = I / d^2 (half outside the cone). Front row: z <= 27.8.
#   - Seen from the floor: the centre of the dance floor (0, 1.6, 38) has a clear line to where each ray lands.
#   - Haze: share of each beam's length within the record's ASSUMED reach of a hazer (haze_model).
import argparse, json, math, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.dont_write_bytecode = True
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('--repo', default='.')
ap.add_argument('--rec', default='scripts/place/rigs/moxir-epic-placement-2026-10-08.json')
ap.add_argument('--out', default=None)
ap.add_argument('--check', action='store_true')
A3 = ap.parse_known_args()[0]

import lasers_v2 as LV      # noqa: E402  (imports design_paint: the painted design, the obstacle model)
D, L, OC = LV.D, LV.L, LV.OC
G = D.G
REC = json.load(open(os.path.join(A3.repo, A3.rec)))
GRP = {g['id']: g for g in REC['groups']}
EYE = np.array([0.0, 1.6, 38.0])
LM = REC['laser_model']
CHOSEN = LV.V2['chosen_far']
OPT_B = [o for o in LV.V2['options_far'] if o['id'] == 'b'][0]
BASE_OB = OC.OB                      # the hall + the rig, as occlusion.py built it
OB = LV.option_model(OPT_B)          # + the goal post (option b): every non-laser check runs against it
OC.OB = OB
D.OB = OB
RESO = {}                            # (group, option) -> {fixture id: analysis}: the same ids recur across options


def unit(v):
    v = np.asarray(v, float)
    return v / (np.linalg.norm(v) or 1.0)


# ------------------------------------------------------------------ lasers: the three far homes, per-beam power
def beam_vis(b, res, ob, variant=None, duty=None, n=9):
    """lasers_v2.visibility with the power per BEAM: the colour's power at the visibility variant x the beam's duty."""
    variant = variant or LM['visibility_variant']
    duty = LM['duty_per_beam'] if duty is None else duty
    sig, g = LV.V2['haze']['sigma_per_m'], LV.V2['haze']['g']
    Pc, lm = LV.colour_power(b['colour_name'], variant)
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
        Lr = sig * LV.p_hg(th, g) * P0 * math.exp(-sig * s) / (w * max(math.sin(th), 1e-3)) * math.exp(-sig * dist)
        pts.append({'s_m': round(float(s), 1), 'seen': h[0] is None, 'cd_m2': round(Lr * eff, 1)})
    seen = [p for p in pts if p['seen']]
    return {'seen_share': round(len(seen) / len(pts), 2), 'cd_m2': round(float(np.median([p['cd_m2'] for p in seen])), 1) if seen else 0.0}


def lasers():
    out = {}
    for o in LV.V2['options_far']:
        OC.OB = BASE_OB              # option_model builds on OC.OB: the bare hall, never another option's goal post
        ob = LV.option_model(o)
        OC.OB = OB
        bs = LV.beams_for(o)
        res = [LV.check_beam(b, ob) for b in bs]
        vis = {b['id']: beam_vis(b, r, ob) for b, r in zip(bs, res)}
        vis_old = {b['id']: beam_vis(b, r, ob, '10W', 1.0) for b, r in zip(bs, res)}
        far = [r for r in res if r['cube'] <= 3]
        out[o['id']] = {'bs': bs, 'res': res, 'vis': vis,
                        'far_pass': sum(r['pass'] for r in far), 'far_beams': len(far),
                        'far_errors': sorted({e for r in far for e in r['errors']})[:3],
                        'far_seen': round(float(np.mean([vis[r['id']]['seen_share'] for r in far])), 2),
                        'far_cd': round(float(np.median([vis[r['id']]['cd_m2'] for r in far])), 1),
                        'far_cd_old_model': round(float(np.median([vis_old[r['id']]['cd_m2'] for r in far])), 1),
                        'far_len': round(float(np.mean([r['length_m'] for r in far])), 1),
                        'mid_pass': sum(r['pass'] for r in res if r['cube'] > 3), 'mid_beams': sum(1 for r in res if r['cube'] > 3),
                        'mid_cd': round(float(np.median([vis[r['id']]['cd_m2'] for r in res if r['cube'] > 3])), 1),
                        'mid_seen': round(float(np.mean([vis[r['id']]['seen_share'] for r in res if r['cube'] > 3])), 2)}
    return out


# ------------------------------------------------------------------ the non-laser fixtures and the options
BASE = [dict(f) for f in D.FX if f['kind'] != 'laser']
BY_GROUP = {}
for f in BASE:
    BY_GROUP.setdefault(f['groupName'], []).append(f)
WALL_FACE = 36.0 - 0.4                 # the outer rows' inner face (column depth 0.8 m in x)
NAVE_FACE = G['column_inner_face_x_m']
GIRDER = G['column_head']['girder_offset_m']


def members(gid):
    return [f for g in GRP[gid].get('members', []) for f in BY_GROUP[g]]


def with_aim(f, p, T=None, d=None):
    f = dict(f)
    f['p'] = np.array(p, float)
    if T is not None:
        T = np.array(T, float)
        f['d'] = unit(T - f['p'])
        f['aim'], f['aim_i'] = {'rule': 'targets', 'targets': [T.tolist()]}, 0
    else:
        f['d'] = unit(d)
        f['aim'], f['aim_i'] = {'rule': 'up'}, 0
    f['r'] = L.rot_for_dir(f['d'])
    return f


def face_x(f):
    return math.copysign(WALL_FACE if abs(f['p'][0]) > 30 else NAVE_FACE, f['p'][0])


def opt_columns(oid):
    out = []
    for f in members('columns'):
        s = math.copysign(1.0, f['p'][0])
        fx_ = face_x(f)
        if oid == 'feet':
            out.append(dict(f))
        elif oid == 'col35':
            out.append(with_aim(f, [f['p'][0], 3.5, f['p'][2]], [fx_, 7.0, f['p'][2]]))
        elif oid == 'runway':
            row = min(G['rows_x_m'], key=lambda r: abs(r - f['p'][0]))
            gc = row + (GIRDER if f['p'][0] > row else -GIRDER)          # the girder on the lit side of the column
            side = 1.0 if f['p'][0] > row else -1.0
            out.append(with_aim(f, [gc + side * 0.5, 7.5, f['p'][2]], [fx_, 0.5, f['p'][2]]))   # clamped 0.3 m off the girder's 0.4 m web
    return out


def opt_roof(oid):
    out = []
    for f in members('roof'):
        if oid == 'floor':
            out.append(dict(f))
        else:
            s = math.copysign(1.0, f['p'][0])
            out.append(with_aim(f, [s * (36.0 - GIRDER), 8.2, f['p'][2]], d=[0, 1, 0]))
    return out


GP_X = (-4.5, -1.5, 1.5, 4.5)


def opt_farwall(oid):
    out = []
    for i, f in enumerate(members('farwall')):
        if oid == 'floor':
            out.append(dict(f))
        else:
            T = f['aim']['targets'][f['aim_i']] if f['aim'].get('targets') else [f['p'][0], 7.0, -53.8]
            out.append(with_aim(f, [GP_X[i], OPT_B['height_m'] - 0.29 - 0.45, OPT_B['z'] - 0.4], T))
    return out


DEPTH_MOVE = {'rig-beam380-columns-07': (-10.0, -27.0), 'rig-beam380-columns-08': (10.0, -27.0),
              'rig-beam380-columns-09': (-10.0, -33.0), 'rig-beam380-columns-10': (10.0, -33.0)}


def opt_beams(oid):
    out = []
    for f in members('beams'):
        if oid == 'depth' and f['id'] in DEPTH_MOVE:
            x, z = DEPTH_MOVE[f['id']]
            g = dict(f, groupName='the depth comb (far nave floor)')
            out.append(with_aim(g, [x, 0.7, z], d=[0, 1, 0]))
        else:
            out.append(dict(f))
    return out


def truss_at(u):
    """A point on the cut's axis, u in 0..1 from its low end."""
    return L.TRUSS_A + (L.TRUSS_B - L.TRUSS_A) * u


def flash_units(oid):
    ph = REC['photometry']
    kinds = ['strobe'] * 6 + ['blinder'] * 8
    order = [0, 7, 1, 8, 2, 9, 3, 10, 4, 11, 5, 12, 6, 13]          # alternate along the line
    kinds = [kinds[i] for i in order]
    out = []
    for k, kind in enumerate(kinds):
        u = 0.08 + 0.84 * k / 13
        if oid == 'front':
            q = truss_at(u)
            p = [q[0], q[1] - 0.35, 21.0 + 0.35]
            T = [q[0] * 0.5, 1.6, 33.0]
            d = None
        elif oid == 'behind':
            x = -6.0 + 12.0 * k / 13
            p, T, d = [x, 0.3, 20.35], None, [0.0, math.cos(math.radians(20)), -math.sin(math.radians(20))]
        else:
            x = -6.0 + 12.0 * k / 13
            p, T, d = [x, 7.55, 22.1], [x, 0.0, 28.5], None
        f = {'id': 'new-%s-%02d' % (kind, k + 1), 'type': 'ext-' + kind, 'kind': 'spot', 'flash': kind, 'groupName': 'flash: %s' % kind,
             'layer': 'flash', 'spare': False, 'beam_deg': ph[kind + '_beam_deg'], 'reach': 40.0, 'I_cd': ph[kind + '_cd']['value'],
             'colour': '#e0ff4f'}
        out.append(with_aim(f, p, T, d))
    return out


HAZE = {'now': None,
        'plus2': {'move': {'rig-hazer-hall-03': (-10.6, -4.0), 'rig-hazer-hall-04': (10.6, -4.0)}, 'add': [(-6.0, -37.0), (6.0, -37.0)]},
        'spread': {'move': {'rig-hazer-hall-03': (-10.6, -4.0), 'rig-hazer-hall-04': (10.6, -4.0),
                            'rig-hazer-hall-01': (-6.0, -37.0), 'rig-hazer-hall-02': (6.0, -37.0)}, 'add': []}}


def haze_units(oid):
    hz = [dict(f) for f in BY_GROUP['hazers']]
    h = HAZE[oid]
    if h:
        for f in hz:
            if f['id'] in h['move']:
                x, z = h['move'][f['id']]
                f['p'] = np.array([x, 0.23, z])
        for i, (x, z) in enumerate(h['add']):
            hz.append(dict(hz[0], id='new-hazer-far-%02d' % (i + 1), p=np.array([x, 0.23, z])))
    return hz


BUILD = {'columns': opt_columns, 'roof': opt_roof, 'farwall': opt_farwall, 'beams': opt_beams, 'flash': flash_units}


# ------------------------------------------------------------------ the checks
def intensity(f):
    return f['I_cd'] if 'I_cd' in f else D.intensity(f)


def glare(f):
    if f['d'] is None:
        return None
    half = OC.half_of(f)
    v = L.EYES - f['p'][None, :]
    dist = np.linalg.norm(v, axis=1)
    ang = np.degrees(np.arccos(np.clip((v @ f['d']) / dist, -1, 1)))
    eyes = []
    per = np.zeros(len(L.EYES))
    incone = np.zeros(len(L.EYES), bool)
    for i in np.where(ang <= 2 * half)[0]:
        if OB.cast(f['p'], v[i] / dist[i], 0.35, dist[i] - 0.05)[0] is not None:
            continue
        cone = bool(ang[i] <= half)
        per[i] = intensity(f) / dist[i] ** 2 * (1.0 if cone else 0.5)
        incone[i] = cone
        eyes.append((bool(L.EYES[i][2] <= 27.8), cone, per[i]))
    return {'eyes': len(eyes), 'cone': sum(e[1] for e in eyes), 'front_lux': round(max([e[2] for e in eyes if e[0]], default=0.0), 1),
            'max_lux': round(max([e[2] for e in eyes], default=0.0), 1), '_per': per, '_cone': incone}


def own_column(f):
    rx = min(G['rows_x_m'], key=lambda r: abs(r - f['p'][0]))
    gz = min(G['column_grid_z_m'], key=lambda g: abs(g - f['p'][2]))
    return 'column x %g z %g' % (rx, gz)


def land(f, r):
    t = r['first']['t'] if r['first'] else r['t_target']
    return f['p'] + np.asarray(r['d']) * t


def seen(q):
    v = q - EYE
    dd = float(np.linalg.norm(v))
    return OB.cast(EYE, v / dd, 0.3, dd - 0.3)[0] is None


def check_fixtures(fx, key):
    rows = []
    store = RESO.setdefault(key, {})
    for f in fx:
        a = OC.analyse_beam(f)
        store[f['id']] = a
        g = glare(f)
        pts = [land(f, r) for r in a['_spec']]
        col = own_column(f)
        band = [float((f['p'] + np.asarray(r['d']) * r['first']['t'])[1]) for r in a['_rays']
                if r['first'] and r['first']['what'].startswith(col)]
        roof = [land(f, r) for r in a['_rays'] if land(f, r)[1] > 10.0]
        wall = [float(land(f, r)[1]) for r in a['_rays'] if r['first'] and r['first']['cls'] == 'end wall']
        rows.append({'id': f['id'], 'group': f['groupName'], 'p': [round(float(v), 2) for v in f['p']],
                     'blocked_pct': a['blocked_pct'], 'blocked_area_pct': a['blocked_area_pct'],
                     'blockers': [b['what'] for b in a['blockers'][:2]], 'glare': g,
                     'seen': round(sum(seen(q) for q in pts) / len(pts), 2),
                     'column_band_m': [round(min(band), 1), round(max(band), 1)] if band else None,
                     'pool_m': round(float(max(np.ptp([q[0] for q in roof]), np.ptp([q[2] for q in roof]))), 1) if len(roof) > 3 else None,
                     'wall_band_m': [round(min(wall), 1), round(max(wall), 1)] if wall else None})
    return rows


def summarise(rows):
    if not rows:
        return {}
    gl = [r['glare'] for r in rows if r['glare']]
    per = np.sum([g['_per'] for g in gl], axis=0) if gl else np.zeros(len(L.EYES))
    cone = np.any([g['_cone'] for g in gl], axis=0) if gl else np.zeros(len(L.EYES), bool)
    front = L.EYES[:, 2] <= 27.8
    for g in gl:
        g.pop('_per', None)
        g.pop('_cone', None)
    bands = [r['column_band_m'] for r in rows if r['column_band_m']]
    pools = [r['pool_m'] for r in rows if r['pool_m']]
    walls = [r['wall_band_m'] for r in rows if r['wall_band_m']]
    bl = [r for r in rows if r['blocked_pct'] > 0]
    out = {'n': len(rows), 'blocked': len(bl), 'blocked_mean_pct': round(float(np.mean([r['blocked_pct'] for r in rows])), 1),
           'blockers': sorted({b for r in bl for b in r['blockers']})[:3],
           'eyes_total': int(len(L.EYES)), 'eyes': int((per > 0).sum()), 'eyes_in_cone': int(cone.sum()),
           'front_lux': round(float(per[front].max()), 1), 'max_lux': round(float(per.max()), 1),
           'lands_on': sorted({b for r in rows for b in r['blockers']})[:4],
           'seen': round(float(np.mean([r['seen'] for r in rows])), 2)}
    if bands:
        out['column_band_m'] = [round(float(np.median([b[0] for b in bands])), 1), round(float(np.median([b[1] for b in bands])), 1)]
        out['column_lit_share'] = round(len(bands) / len(rows), 2)
    else:
        out['column_band_m'], out['column_lit_share'] = None, 0.0
    out['pool_m'] = round(float(np.median(pools)), 1) if pools else None
    out['wall_band_m'] = [round(float(np.median([b[0] for b in walls])), 1), round(float(np.median([b[1] for b in walls])), 1)] if walls else None
    return out


def verdict(gid, oid, S):
    """One short line per option, from the numbers."""
    if gid == 'columns':
        b = S['column_band_m']
        return ('%d of %d units blocked (%s); ' % (S['blocked'], S['n'], ', '.join(S['blockers'][:2])) if S['blocked'] else 'clear; ') + \
            ('lights its column from %.1f to %.1f m (median; %d %% of units reach it)' % (b[0], b[1], round(100 * S['column_lit_share'])) if b else 'no unit lights its own column') + \
            '; %d eyes in a field' % S['eyes']
    if gid == 'roof':
        return ('%d of %d blocked; ' % (S['blocked'], S['n']) if S['blocked'] else 'clear; ') + ('pool on the roof %.0f m wide (median)' % S['pool_m'] if S['pool_m'] else 'no pool on the roof') + '; %d eyes' % S['eyes']
    if gid == 'farwall':
        w = S['wall_band_m']
        return ('%d of %d blocked (%s); ' % (S['blocked'], S['n'], ', '.join(S['blockers'][:2])) if S['blocked'] else 'clear; ') + \
            ('lights the far wall %.1f-%.1f m' % (w[0], w[1]) if w else 'does not reach the wall') + '; %d %% seen from the floor' % round(100 * S['seen'])
    if gid == 'beams' and S.get('moved_seen') is not None:
        return ('%d of %d blocked (%s); ' % (S['blocked'], S['n'], ', '.join(S['blockers'][:2])) if S['blocked'] else 'all %d clear; ' % S['n']) + \
            'front row %.0f lux; the floor sees %d %% of the 4 depth beams\' length (0.7 m to the roof)' % (S['front_lux'], round(100 * S['moved_seen']))
    if gid == 'beams':
        return ('%d of %d blocked (%s); ' % (S['blocked'], S['n'], ', '.join(S['blockers'][:2])) if S['blocked'] else 'all %d clear; ' % S['n']) + \
            'front row %.0f lux; %d %% of the landing points seen from the floor' % (S['front_lux'], round(100 * S['seen']))
    if gid == 'flash':
        return ('%d of %d floor eyes in a field (%d in a cone); front row %.0f lux with all 14 at once; the light lands on %s' % (
            S['eyes'], S['eyes_total'], S['eyes_in_cone'], S['front_lux'], ', '.join(S['lands_on'][:3])) if S['eyes'] else
                '0 of %d floor eyes in any field: front row 0 lux; the light lands on %s' % (S['eyes_total'], ', '.join(S['lands_on'][:3])))
    return ''


# ------------------------------------------------------------------ haze coverage
def path_pts(p, d, t, step=1.0):
    return [p + d * s for s in np.arange(0.5, t, step)]


def haze_cover(hz, laser_run, beams_rows_fx):
    R = REC['haze_model']['reach_m']
    H = np.array([[f['p'][0], f['p'][2]] for f in hz])

    def share(pts):
        P = np.array([[q[0], q[2]] for q in pts])
        dmin = np.min(np.linalg.norm(P[:, None, :] - H[None, :, :], axis=2), axis=1)
        return round(float(np.mean(dmin <= R)), 2), P, dmin <= R
    far = [q for b, r in zip(laser_run['bs'], laser_run['res']) if b['cube'] <= 3 for q in path_pts(b['p'], b['d'], r['length_m'])]
    mid = [q for b, r in zip(laser_run['bs'], laser_run['res']) if b['cube'] > 3 for q in path_pts(b['p'], b['d'], r['length_m'])]
    bm = [q for f in beams_rows_fx for q in path_pts(f['p'], f['d'], min(RESO[('beams', GRP['beams']['advice'])][f['id']]['axis_first_hit']['t'] or 12.0, 14.0))]
    first20 = [q for b, r in zip(laser_run['bs'], laser_run['res']) if b['cube'] <= 3 for q in path_pts(b['p'], b['d'], 20.0)]
    return {'far_lasers': share(far)[0], 'far_lasers_first_20m': share(first20)[0], 'mid_lasers': share(mid)[0], 'floor_beams': share(bm)[0],
            'units': len(hz), 'm3_per_unit_nave': round(REC['haze_model']['nave_volume_m3'] / max(1, sum(1 for f in hz if abs(f['p'][0]) < 12)))}


# ------------------------------------------------------------------ the pass
def run():
    LZ = lasers()
    out = {'lasers': {k: {kk: vv for kk, vv in v.items() if kk not in ('bs', 'res', 'vis')} for k, v in LZ.items()},
           'nohd': LV.nohd(), 'groups': {}}
    out['crane_as_photographed'] = LV.crane_as_photographed(LZ[CHOSEN]['bs'])
    FXO = {}
    for gid, fn in BUILD.items():
        out['groups'][gid] = {}
        for o in GRP[gid]['options']:
            fx = fn(o['id'])
            rows = check_fixtures(fx, (gid, o['id']))
            S = summarise(rows)
            if gid == 'beams':
                mv = [f for f in fx if f['groupName'] == 'the depth comb (far nave floor)']
                S['moved_seen'] = round(float(np.mean([seen(f['p'] + f['d'] * s_) for f in mv for s_ in np.linspace(1.0, 10.0, 10)])), 2) if mv else None
            S['verdict'] = verdict(gid, o['id'], S)
            out['groups'][gid][o['id']] = {'summary': S, 'rows': rows}
            FXO[(gid, o['id'])] = fx
    for gid in ('truss', 'stagefloor'):
        fx = [f for f in BASE if f['groupName'] in {
            'truss': ('the X (truss)', 'the curtain (truss)', 'the bridge-up PARs (truss top)'),
            'stagefloor': ('the halo PARs (floor, behind the riser)', 'the backlight fan (floor, behind the riser)', 'the spine (floor, behind the truss)',
                           'the press crown (floor, in front of the press)')}[gid]]
        rows = check_fixtures(fx, (gid, 'kept'))
        S = summarise(rows)
        S['verdict'] = ('%d of %d blocked (%s); ' % (S['blocked'], S['n'], ', '.join(S['blockers'][:2])) if S['blocked'] else 'all %d clear; ' % S['n']) + \
            '%d eyes in a field, front row %.0f lux' % (S['eyes'], S['front_lux'])
        out['groups'][gid] = {'kept': {'summary': S, 'rows': rows}}
        FXO[(gid, 'kept')] = fx
    out['groups']['haze'] = {}
    for o in GRP['haze']['options']:
        hz = haze_units(o['id'])
        hc = haze_cover(hz, LZ[CHOSEN], FXO[('beams', GRP['beams']['advice'])])
        hc['verdict'] = 'lasers 1-3: %d %% of their length fed (first 20 m: %d %%); lasers 4-6: %d %%; floor beams: %d %%' % (
            round(100 * hc['far_lasers']), round(100 * hc['far_lasers_first_20m']), round(100 * hc['mid_lasers']), round(100 * hc['floor_beams']))
        out['groups']['haze'][o['id']] = {'summary': hc, 'units': [[round(float(v), 2) for v in f['p']] for f in hz]}
        FXO[('haze', o['id'])] = hz
    for oid, v in LZ.items():
        out['groups'].setdefault('far', {})[oid] = {'summary': {'verdict': '%d of %d beams pass; the floor sees %d %% of them; %.0f cd/m2 per beam (6 W, 2 beams per cube)' % (
            v['far_pass'], v['far_beams'], round(100 * v['far_seen']), v['far_cd']), **out['lasers'][oid]}}
    m = LZ[CHOSEN]
    out['groups']['mid'] = {'his': {'summary': {'verdict': '%d of %d beams pass; the floor sees %d %%; %.0f cd/m2 per beam (6 W, 2 beams per cube)' % (
        m['mid_pass'], m['mid_beams'], round(100 * m['mid_seen']), m['mid_cd'])}}}
    out['flash_truss_load'] = flash_load()
    out['goalpost_load'] = goalpost_load()
    return out, LZ, FXO


def flash_load():
    """The cut with 14 flash units on it ('front'): the H30V table the cut was planned on."""
    pars = 17 * 8.0
    flash = 6 * 7.8 + 8 * 8.7 + 14 * 1.0
    return {'pars_kg': pars, 'flash_kg': round(flash, 1), 'total_kg': round(pars + flash, 1), 'per_m_kg': round((pars + flash) / 12.0, 1),
            'allowable_kg_per_m': 321.6, 'basis': 'Prolyte H30V, 6 m span, uniformly distributed 321.6 kg/m allowable (rigs/moxir-crane-cut-2026-09-29.json picks_why; the cut hangs on 3 picks, spans 5.25 / 5.75 m). The crane\'s own rated load is still owed.'}


def goalpost_load():
    base = 20.1
    bsw = 4 * (13.5 + 1.0) + 4.0
    return {'lasers_kg': base, 'with_far_wall_heads_kg': round(base + bsw, 1), 'allowable_third_points_kg': 289.5,
            'basis': 'rigs/moxir-lasers-v2-2026-10-08.json options_far b load_check (Prolyte H30V 12 m span table, x 0.85 for BS 7905-2 / ANSI E1.2); UP-250BSW 13.5 kg (fixtures.json bsw250.specs.weight_kg) + 1 kg clamp and safety each, 4 kg cable'}


# ------------------------------------------------------------------ drawing
BG, FG, DIM = D.BG, D.FG, D.DIM
GC = {g['id']: g['colour'] for g in REC['groups']}
FONT = 'DejaVu Sans Mono'
CRANE_Y = '#c9a200'


def plt_():
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    return plt


def advised(FXO, gid):
    return FXO[(gid, GRP[gid]['advice'])]


def placement_set(FXO):
    """(group id, label, fixtures) for the advised plot."""
    return [('truss', 'the cut: 17 PARs', FXO[('truss', 'kept')]),
            ('stagefloor', 'stage floor: halo, fan, spine, press', FXO[('stagefloor', 'kept')]),
            ('columns', 'column washes', advised(FXO, 'columns')),
            ('roof', 'roof pools', advised(FXO, 'roof')),
            ('farwall', 'far wall', advised(FXO, 'farwall')),
            ('farwall', 'span far ends + beside the floor', BY_GROUP["wash: the side spans' far ends (BSW250)"] + BY_GROUP['wash: beside the audience (BSW250, up)']),
            ('beams', 'floor beams', [f for f in advised(FXO, 'beams') if f['groupName'] not in ('the backlight fan (floor, behind the riser)', 'the spine (floor, behind the truss)')]),
            ('flash', 'strobes + blinders', advised(FXO, 'flash')),
            ('haze', 'hazers', advised(FXO, 'haze')),
            ('haze', 'smoke', BY_GROUP['smoke'])]


def cube_points(LZ):
    bs = LZ[CHOSEN]['bs']
    return {c['n']: [b for b in bs if b['cube'] == c['n']][0]['p'] for c in LV.V2['cubes']}


MK = {'par': 'o', 'beam': 'D', 'wash': 's', 'spot': 's', 'haze': 'h', 'smoke': 'h'}


def marker(f):
    return '*' if f.get('flash') else MK.get(f['kind'], 'o')


def clip_texts(ax):
    for t in ax.texts:
        t.set_clip_on(True)


def tag(ax, x, y, t, c, size=7.6, ha='left', bold=True):
    ax.text(x, y, t, color=c, fontsize=size, fontweight='bold' if bold else 'normal', family=FONT, ha=ha, va='center', zorder=12,
            bbox=dict(boxstyle='square,pad=0.2', fc=BG, ec='none', alpha=0.78))


def foot(ax, b, c, alpha=0.9, lw=0.6, fc='none', z=4):
    from matplotlib.patches import Rectangle
    k = b.corners()
    ax.add_patch(Rectangle((k[:, 0].min(), k[:, 2].min()), np.ptp(k[:, 0]), np.ptp(k[:, 2]), fc=fc, ec=c, lw=lw, alpha=alpha, zorder=z))


def fig_plan(LZ, FXO, path):
    plt = plt_()
    from matplotlib.patches import Rectangle
    fig = plt.figure(figsize=(16.0, 15.2), dpi=100)
    fig.patch.set_facecolor(BG)
    ax = fig.add_axes([0.04, 0.03, 0.60, 0.88])
    D.plan_hall(ax)
    ax.add_patch(Rectangle((-OPT_B['span_m'] / 2, OPT_B['z'] - 0.25), OPT_B['span_m'], 0.5, fc=GC['far'], ec=GC['far'], alpha=0.55, zorder=5))
    run = LZ[CHOSEN]
    for b, r in zip(run['bs'], run['res']):
        ax.plot([b['p'][0], r['to'][0]], [b['p'][2], r['to'][2]], color=GC['far'] if b['cube'] <= 3 else GC['mid'], lw=0.7, alpha=0.75, zorder=6)
    for n, p in cube_points(LZ).items():
        c = GC['far'] if n <= 3 else GC['mid']
        ax.plot(p[0], p[2], marker='^', ms=10, mfc=c, mec='#000', mew=0.6, zorder=10)
        ax.text(p[0] + (0.9 if n != 4 else -0.9), p[2] + 0.4, str(n), color='#ffffff', fontsize=11, fontweight='bold', ha='left' if n != 4 else 'right', zorder=11)
    for gid, lab, fx in placement_set(FXO):
        c = GC[gid]
        for f in fx:
            sm = f['kind'] == 'smoke'
            ax.plot(f['p'][0], f['p'][2], marker=marker(f), ms=5.2 if f['kind'] not in ('haze', 'smoke') else 7,
                    mfc='none' if sm else c, mec=c if sm else '#000', mew=1.0 if sm else 0.4, zorder=8)
            if f['d'] is not None and abs(f['d'][1]) < 0.97:
                q = f['p'] + unit([f['d'][0], 0, f['d'][2]]) * 2.2
                ax.plot([f['p'][0], q[0]], [f['p'][2], q[2]], color=c, lw=0.8, zorder=7)
    ax.add_patch(Rectangle((-8.5, 16.5), 17.0, 10.5, fc='none', ec='#e3e6ea', lw=0.8, ls='--', zorder=11))
    tag(ax, -8.3, 15.6, 'stage detail (right)', '#e3e6ea', 7)
    for gid, t, (x, z) in [('far', 'LASERS 1-3 (his places)\non the goal post, z -41.5', (-17.5, -45.5)),
                           ('mid', 'LASERS 4, 5 (his places)\nnave column corners, 5.0 m', (-33.0, -21.0)),
                           ('mid', 'LASER 6 (his place)\n6.5 m tower', (2.2, -6.5)),
                           ('truss', 'THE CUT (FIXED), z 21', (9.5, 14.5)),
                           ('stagefloor', 'press crown', (-15.5, 9.0)),
                           ('columns', 'wall columns, uplit from the feet', (-35.0, -51.5)),
                           ('columns', 'far nave columns', (13.2, -43.0)),
                           ('roof', 'roof pools (up)', (-29.0, -30.0)), ('roof', 'roof pools (up)', (22.0, -17.0)),
                           ('farwall', 'far wall + span ends', (14.0, -51.5)), ('farwall', 'beside the floor (up)', (21.0, 47.5)),
                           ('beams', 'arches: 3 crossing pairs', (-26.0, 33.0)), ('beams', 'depth comb: 4 beams up', (-27.0, -37.0)),
                           ('haze', 'hazers', (-17.0, -2.0))]:
        tag(ax, x, z, t, GC[gid])
    ax.text(0, 50.5, 'DANCE FLOOR', color='#7f9cff', fontsize=7, ha='center')
    # legend
    lx = fig.add_axes([0.67, 0.43, 0.31, 0.48])
    lx.set_axis_off()
    lx.set_xlim(0, 1)
    lx.set_ylim(0, 1)
    y = 0.99
    lx.text(0, y, 'WHAT GOES WHERE', color=FG, fontsize=10, fontweight='bold', family=FONT, va='top')
    y -= 0.05
    counts = {'far': '3 LaserCube', 'mid': '3 LaserCube', 'truss': '17 UP-PL5403', 'stagefloor': '10 PL5403 + 8 B380F',
              'columns': '23 UP-PL5403', 'roof': '8 UP-HK1915', 'farwall': '12 UP-250BSW', 'beams': '10 UP-B380F',
              'flash': '6 strobe + 8 blinder', 'haze': '8 hazer + 4 smoke'}
    for g in REC['groups']:
        fixed = g['id'] in ('far', 'mid', 'truss', 'stagefloor')
        lx.plot(0.03, y - 0.012, marker='s', ms=9, mfc=g['colour'], mec='#000')
        lx.text(0.09, y, g['title'].split(' (')[0], color=g['colour'], fontsize=8, fontweight='bold', family=FONT, va='top')
        lx.text(0.09, y - 0.026, counts[g['id']] + ('   FIXED' if fixed else '   advised: ' + g['advice']), color=DIM, fontsize=7, family=FONT, va='top')
        y -= 0.062
    y -= 0.005
    for m, t in (('^', 'LaserCube'), ('o', 'PAR'), ('D', 'beam (B380F)'), ('s', 'wash / spot head'), ('*', 'strobe / blinder'), ('h', 'hazer; ring = smoke')):
        lx.plot(0.03, y - 0.009, marker=m, ms=7, mfc='#cfd3d8', mec='#000')
        lx.text(0.09, y, t, color=DIM, fontsize=7.4, family=FONT, va='top')
        y -= 0.034
    lx.text(0, y - 0.005, 'tick = aim, seen from above\nthin lines = laser beams\nhatched = lantern glass\nyellow bars = the cranes', color=DIM, fontsize=7, family=FONT, va='top')
    # the stage detail
    ix = fig.add_axes([0.67, 0.04, 0.31, 0.34])
    D.plan_hall(ix, xl=(-8.5, 8.5), zl=(28.6, 15.2))
    for b in L.rig_boxes():
        foot(ix, b, '#8a929b', 0.8, 0.5, '#16191d')
    for gid, lab, fx in placement_set(FXO):
        for f in fx:
            if -8.5 < f['p'][0] < 8.5 and 15.2 < f['p'][2] < 28.6:
                sm = f['kind'] == 'smoke'
                ix.plot(f['p'][0], f['p'][2], marker=marker(f), ms=6, mfc='none' if sm else GC[gid], mec=GC[gid] if sm else '#000', mew=1.0 if sm else 0.4, zorder=8)
                if f['d'] is not None and abs(f['d'][1]) < 0.97:
                    q = f['p'] + unit([f['d'][0], 0, f['d'][2]]) * 0.9
                    ix.plot([f['p'][0], q[0]], [f['p'][2], q[2]], color=GC[gid], lw=0.8, zorder=7)
    for t_ in list(ix.texts):
        t_.remove()
    hz = [f for f in advised(FXO, 'haze') if 15 < f['p'][2] < 28]
    fl = advised(FXO, 'flash')
    for (x, z), (tx, tz), t, c in ((((-6.0, 19.9)), (-8.2, 16.2), 'near crane, back girder', CRANE_Y),
                                   ((hz[0]['p'][0], hz[0]['p'][2]), (-1.2, 16.2), 'hazer', GC['haze']),
                                   ((fl[9]['p'][0], fl[9]['p'][2]), (2.4, 16.2), '14 strobes + blinders', GC['flash']),
                                   ((4.6, 21.0), (4.4, 17.4), 'the cut + 17 PARs', GC['truss']),
                                   ((-2.8, 21.55), (-8.2, 27.9), 'halo PARs', GC['stagefloor']),
                                   ((-3.15, 22.1), (-4.8, 27.9), 'fan, 7 beams', GC['stagefloor']),
                                   ((0.13, 23.6), (-0.4, 27.9), 'step + DJ', '#cfd3d8'),
                                   ((5.2, 22.9), (3.2, 27.9), 'smoke', GC['haze']),
                                   ((-5.4, 23.8), (-8.2, 26.6), 'PA', '#8a929b')):
        ix.annotate(t, xy=(x, z), xytext=(tx, tz), color=c, fontsize=7.4, fontweight='bold', family=FONT, va='center', zorder=12,
                    arrowprops=dict(arrowstyle='-', color=c, lw=0.7, shrinkA=0, shrinkB=3), bbox=dict(boxstyle='square,pad=0.15', fc=BG, ec='none', alpha=0.85))
    ix.set_title('stage detail (x -8.5..8.5, z 15..29)', color=FG, fontsize=9, family=FONT, loc='left')
    fig.text(0.04, 0.975, 'MOXIR epic plot, phase 1: where every device goes (the advised option of each group)', color=FG, fontsize=14, fontweight='bold', family=FONT, va='top')
    fig.text(0.04, 0.952, 'from above, the whole building: 4 spans, 108 m, far gate at the top. FIXED = your decisions (the laser places, the stage, the truss). The rest: options below.',
             color=DIM, fontsize=8.4, family=FONT, va='top')
    fig.savefig(path, facecolor=BG)
    plt.close(fig)
    return path


def view_entries(LZ, FXO):
    cp = cube_points(LZ)
    by = {lab: (gid, fx) for gid, lab, fx in placement_set(FXO)}
    P = lambda fx: [f['p'] for f in fx]
    col = by['column washes'][1]
    roof = by['roof pools'][1]
    bm = by['floor beams'][1]
    fl = by['strobes + blinders'][1]
    return [('lasers 1-3: the goal post, 64 m away', 'far', [cp[1], cp[2], cp[3]]), ('laser 4 (5.0 m)', 'mid', [cp[4]]), ('laser 5 (5.0 m)', 'mid', [cp[5]]),
            ('laser 6 (6.5 m tower)', 'mid', [cp[6]]), ('the cut: X, curtain, bridge-up', 'truss', P(by['the cut: 17 PARs'][1])),
            ('halo + fan + spine + press crown', 'stagefloor', P(by['stage floor: halo, fan, spine, press'][1])),
            ('wall columns L', 'columns', [f['p'] for f in col if f['p'][0] < -30]), ('wall columns R', 'columns', [f['p'] for f in col if f['p'][0] > 30]),
            ('far nave columns', 'columns', [f['p'] for f in col if abs(f['p'][0]) < 13]),
            ('roof pools L', 'roof', [f['p'] for f in roof if f['p'][0] < 0]), ('roof pools R', 'roof', [f['p'] for f in roof if f['p'][0] > 0]),
            ('far wall', 'farwall', P(by['far wall'][1])), ('span ends + beside the floor', 'farwall', P(by['span far ends + beside the floor'][1])),
            ('arches (3 pairs)', 'beams', [f['p'] for f in bm if f['p'][2] > 20]), ('depth comb', 'beams', [f['p'] for f in bm if f['p'][2] < 0]),
            ('strobes + blinders', 'flash', P(fl)), ('hazers', 'haze', P(by['hazers'][1])), ('smoke', 'haze', P(by['smoke'][1]))]


def fig_view(LZ, FXO, path, W=1600, H=900):
    plt = plt_()
    from matplotlib.collections import PolyCollection
    cam = L.Camera(EYE.copy(), np.array([0.0, 6.0, -20.0]), 66.0, W, H)
    items = []
    D.hall_items(cam, items, fade=0.5)
    for b in L.CROWD:
        if b.p[2] < EYE[2] - 1.0:
            L.add_box(items, cam, b, '#020304', '#14181d', 1, lw=0.5)
    items.sort(key=lambda it: -it[0])
    fig = plt.figure(figsize=(W / 100, H / 100 + 0.8), dpi=100)
    fig.patch.set_facecolor(BG)
    ax = fig.add_axes([0, 0, 1, H / (H + 80)])
    ax.set_xlim(0, W)
    ax.set_ylim(H, 0)
    ax.set_facecolor('#0b0d10')
    ax.set_xticks([])
    ax.set_yticks([])
    ax.add_collection(PolyCollection([it[1] for it in items], facecolors=[it[2] for it in items], edgecolors=[it[3] for it in items],
                                     linewidths=[it[4] for it in items], antialiaseds=True))
    ents = []
    for lab, gid, pts in view_entries(LZ, FXO):
        scr = []
        for p in pts:
            q = cam.cam(np.asarray(p, float))
            if q[2] < 0.5:
                continue
            s = cam.scr(q)
            if not (0 <= s[0] <= W and 0 <= s[1] <= H):
                continue
            vis = seen(np.asarray(p, float))
            m = '^' if gid in ('far', 'mid') else ('*' if gid == 'flash' else ('h' if gid == 'haze' else ('D' if gid == 'beams' else ('s' if gid in ('roof', 'farwall') else 'o'))))
            ax.plot(s[0], s[1], marker=m, ms=11 if m == '^' else 7, mfc=GC[gid] if vis else 'none', mec='#000' if vis else GC[gid], mew=0.5 if vis else 1.1, zorder=5)
            scr.append((s, vis))
        if scr:
            S_ = np.array([s for s, _ in scr])
            med = np.median(S_, 0)
            pick = min(scr, key=lambda sv: (not sv[1], np.linalg.norm(sv[0] - med)))[0]
            hi = np.mean([p[1] for p in pts]) > 2.5
            ents.append((lab, gid, pick, hi))
    for hi, y0, dy in ((True, 118, 30), (False, 742, 30)):
        row = sorted([e for e in ents if e[3] == hi], key=lambda e: e[2][0])
        n = len(row)
        for i, (lab, gid, pick, _) in enumerate(row):
            tx = 40 + (W - 300) * (i / max(1, n - 1))
            ty = y0 + (i % 3) * dy if hi else y0 + (i % 4) * dy
            ax.annotate(lab, xy=(pick[0], pick[1]), xytext=(tx, ty), color=GC[gid], fontsize=9.2, fontweight='bold', family=FONT, ha='left', va='center',
                        arrowprops=dict(arrowstyle='-', color=GC[gid], lw=0.7, alpha=0.85, shrinkA=0, shrinkB=4), zorder=7,
                        bbox=dict(boxstyle='square,pad=0.2', fc=BG, ec='none', alpha=0.8))
    fig.text(0.012, 1 - 0.28 / (H / 100 + 0.8), 'From the dance floor: WHERE things are (no looks yet)', color=FG, fontsize=15, fontweight='bold', family=FONT, va='center')
    fig.text(0.012, 1 - 0.58 / (H / 100 + 0.8), 'eye 1.6 m at z 38, the centre of the floor, looking at the DJ; filled = in plain sight, ring = behind something (a column, the truss, a crane); the hall model\'s triangles, no WebGL',
             color=DIM, fontsize=9, family=FONT, va='center')
    fig.savefig(path, facecolor=BG)
    plt.close(fig)
    return path


def xsec(ax, xl, yl, crane=True):
    """A cross-section of the hall (x across, y up) from hall.json: floor, columns with their flared heads, the runway
    girders, the space frame, the deck, the lanterns; the nave crane's bridge where it parks."""
    from matplotlib.patches import Rectangle, Polygon
    ax.set_facecolor(BG)
    ax.set_xlim(*xl)
    ax.set_ylim(*yl)
    ax.set_aspect('equal')
    ax.tick_params(colors=DIM, labelsize=7)
    for sp in ax.spines.values():
        sp.set_color('#2a2e33')
    hd = G['column_head']
    W0, W1 = G['walls_x_m']
    ax.add_patch(Rectangle((W0, -0.4), W1 - W0, 0.4, fc='#1a1e23', ec='none'))
    ax.add_patch(Rectangle((W0, G['truss_bottom_m']), W1 - W0, G['deck_m'] - G['truss_bottom_m'], fc='#2b3036', ec='#3b4148', lw=0.6, hatch='xx', alpha=0.8))
    for l in G['lanterns'][:4:2]:
        ax.add_patch(Rectangle((l['x_m'][0], G['deck_m']), 12, G['lantern_top_m'] - G['deck_m'], fc='#24384a', ec='#3d5a73', hatch='////', lw=0.6))
    for wx in G['walls_x_m']:
        ax.add_patch(Rectangle((wx - (0.3 if wx < 0 else 0), 0), 0.3, G['deck_m'], fc='#262b31', ec='none'))
    for rx in G['rows_x_m']:
        ax.add_patch(Rectangle((rx - 0.4, 0), 0.8, hd['flare_start_m'], fc='#3a3f45', ec='none'))
        ax.add_patch(Polygon([(rx - 0.4, hd['flare_start_m']), (rx + 0.4, hd['flare_start_m']), (rx + hd['head_w_m'] / 2, hd['head_top_m']), (rx - hd['head_w_m'] / 2, hd['head_top_m'])], fc='#41464c', ec='none'))
        ax.add_patch(Rectangle((rx - hd['upper_d_m'] / 2, hd['head_top_m']), hd['upper_d_m'], G['truss_bottom_m'] - hd['head_top_m'], fc='#3a3f45', ec='none'))
        for gx in (rx - hd['girder_offset_m'], rx + hd['girder_offset_m']):
            if W0 < gx < W1:
                ax.add_patch(Rectangle((gx - 0.2, G['runway_bottom_m']), 0.4, G['runway_top_m'] - G['runway_bottom_m'], fc='#4a4e54', ec='none'))
    if crane:
        c = G['cranes'][0]
        ax.add_patch(Rectangle((-G['crane_rail_x_m'], c['girder_bottom_m']), 2 * G['crane_rail_x_m'], c['girder_top_m'] - c['girder_bottom_m'], fc='none', ec=CRANE_Y, ls='--', lw=0.8))


def zsec(ax, zl, yl):
    D.section_ax(ax, [], lasers_only=True)
    ax.set_xlim(*zl)
    ax.set_ylim(*yl)
    clip_texts(ax)
    if zl[0] > -55.5:
        ax.text(zl[0] + 0.4, yl[1] - 0.6, 'far gate <', color=DIM, fontsize=7, va='top')
    if zl[1] < 55.5:
        ax.text(zl[1] - 0.4, yl[1] - 0.6, '> entry', color=DIM, fontsize=7, va='top', ha='right')


def plan_strip(ax, zl, xl):
    """The plan turned so the hall runs left to right like the sections: z across (far gate left), x up (house right up)."""
    from matplotlib.patches import Rectangle
    ax.set_facecolor(BG)
    ax.set_xlim(*zl)
    ax.set_ylim(*xl)
    ax.set_aspect('equal')
    ax.tick_params(colors=DIM, labelsize=7)
    for sp in ax.spines.values():
        sp.set_color('#2a2e33')
    ez = G['end_wall_inner_y_m']
    for wz in (-ez, ez):
        ax.plot([wz, wz], [max(xl[0], G['walls_x_m'][0]), min(xl[1], G['walls_x_m'][1])], color='#c8ccd2', lw=1.4)
    for wx in G['walls_x_m']:
        ax.plot([-ez, ez], [wx, wx], color='#c8ccd2', lw=1.4)
    for l in G['lanterns']:
        ax.add_patch(Rectangle((l['z_m'][0], l['x_m'][0]), l['z_m'][1] - l['z_m'][0], 12, fc='none', ec='#3d5a73', hatch='////', lw=0.6, alpha=0.6))
    for rx in G['rows_x_m']:
        for z in G['column_grid_z_m']:
            ax.add_patch(Rectangle((z - 0.25, rx - 0.4), 0.5, 0.8, fc='#59616b', ec='none', zorder=3))
    for m in G['massing']:
        ax.add_patch(Rectangle((m['z_m'][0], m['x_m'][0]), m['z_m'][1] - m['z_m'][0], m['x_m'][1] - m['x_m'][0], fc='#5b5148', alpha=0.5, ec='none', zorder=2))
    for c in G['cranes']:
        for dz in c['girders_dz_m']:
            ax.add_patch(Rectangle((c['z_m'] + dz - c['girder_w_m'] / 2, -G['crane_rail_x_m']), c['girder_w_m'], 2 * G['crane_rail_x_m'], fc=CRANE_Y, alpha=0.7, ec='none', zorder=3))
    ax.plot([21.0, 21.0], [L.TRUSS_A[0], L.TRUSS_B[0]], color='#e8ebee', lw=2.2, zorder=4)
    ax.add_patch(Rectangle((L.RISER['z'][0], L.RISER['x'][0]), L.RISER['z'][1] - L.RISER['z'][0], L.RISER['x'][1] - L.RISER['x'][0], fc='#454b53', ec='none', zorder=4))
    ax.add_patch(Rectangle((L.AUD['z'][0], L.AUD['x'][0]), L.AUD['z'][1] - L.AUD['z'][0], L.AUD['x'][1] - L.AUD['x'][0], fc='#2f6bff', alpha=0.18, ec='none', zorder=1))
    ax.add_patch(Rectangle((OPT_B['z'] - 0.25, -OPT_B['span_m'] / 2), 0.5, OPT_B['span_m'], fc=GC['far'], alpha=0.55, ec='none', zorder=4))
    ax.text(zl[0] + 0.5, xl[1] - 0.8, 'far gate <', color=DIM, fontsize=7, va='top', clip_on=True)
    ax.text(zl[1] - 0.5, xl[1] - 0.8, '> entry', color=DIM, fontsize=7, va='top', ha='right', clip_on=True)
    ax.text(37.0, 0.0, 'dance floor', color='#7f9cff', fontsize=7, ha='center', va='center', zorder=5, clip_on=True)
    ax.set_ylabel('x (house right up)', color=DIM, fontsize=7)


def draw_rays(ax, f, proj, colour_ok, key, n_skip=1, mark_block=True):
    """The fixture's spec rays (axis + ring): solid to where they land or are stopped; a red x where blocked."""
    a = RESO[key].get(f['id'])
    if not a:
        return
    P = {'plan': lambda q: (q[0], q[2]), 'x': lambda q: (q[0], q[1]), 'z': lambda q: (q[2], q[1]), 'strip': lambda q: (q[2], q[0])}[proj]
    for k, r in enumerate(a['_spec']):
        if k % n_skip:
            continue
        e = land(f, r)
        blk = r['blocked'] and mark_block
        p0, p1 = P(f['p']), P(e)
        ax.plot([p0[0], p1[0]], [p0[1], p1[1]], color='#ff5a4f' if blk else colour_ok, lw=0.8 if k else 1.3, alpha=0.85, zorder=6)
        if blk:
            ax.plot(*P(r['blocked']['at']), marker='x', ms=6, color='#ff5a4f', mew=1.6, zorder=8)
    ax.plot(*P(f['p']), marker=marker(f), ms=7, mfc=colour_ok, mec='#000', zorder=9)


def area_lands(f, key):
    a = RESO[key].get(f['id'])
    return [land(f, r) for r in a['_rays']] if a else []


def grid_fig(n, title, sub, w, h, rows=False, top=0.86, bottom=0.04, gap=0.07):
    """n panels in a row (or a column with rows=True). Returns (plt, fig, axes)."""
    plt = plt_()
    fig = plt.figure(figsize=(w, h), dpi=100)
    fig.patch.set_facecolor(BG)
    if rows:
        hh = (top - bottom - gap * (n - 1)) / n
        axs = [fig.add_axes([0.06, top - (i + 1) * hh - i * gap, 0.92, hh]) for i in range(n)]
    else:
        ww = (0.96 - 0.04 * (n - 1)) / n
        axs = [fig.add_axes([0.03 + i * (ww + 0.04), bottom + 0.14, ww, top - bottom - 0.2]) for i in range(n)]
    fig.text(0.03, 1 - 0.32 / h, title, color=FG, fontsize=13, fontweight='bold', family=FONT, va='center')
    fig.text(0.03, 1 - 0.62 / h, sub, color=DIM, fontsize=8.4, family=FONT, va='center')
    return plt, fig, axs


def caption(fig, ax, o, verdict_txt, gid, rows=False):
    import textwrap
    adv = GRP[gid]['advice'] == o['id']
    bb = ax.get_position()
    head = ('ADVISED  ' if adv else '') + '%s: %s' % (o['id'], o['title'])
    if rows:
        fig.text(bb.x0, bb.y1 + 0.022, head, color=GC[gid] if adv else FG, fontsize=10, fontweight='bold', family=FONT, va='bottom')
        fig.text(bb.x0, bb.y1 + 0.004, verdict_txt, color='#c4c9cf', fontsize=8.4, family=FONT, va='bottom')
    else:
        fig.text(bb.x0, bb.y1 + 0.015, '\n'.join(textwrap.wrap(head, 46)), color=GC[gid] if adv else FG, fontsize=9.6, fontweight='bold', family=FONT, va='bottom')
        fig.text(bb.x0, bb.y0 - 0.06, '\n'.join(textwrap.wrap(verdict_txt, 56)), color='#c4c9cf', fontsize=8.2, family=FONT, va='top')


def fig_far(LZ, path):
    from matplotlib.patches import Rectangle
    opts = GRP['far']['options']
    plt, fig, axs = grid_fig(len(opts), 'Lasers 1-3: where they hang (his places fixed; 3 homes measured)',
                             'side section along the nave, true scale; beams to their stop on the near crane\'s back girder (z 19.55); 6 W unit, power split between each cube\'s 2 beams',
                             15.0, 10.5, rows=True, top=0.84, gap=0.09)
    for ax, o in zip(axs, opts):
        run = LZ[o['far']]
        zsec(ax, (-56, 24), (-0.5, 12.5))
        oo = [x for x in LV.V2['options_far'] if x['id'] == o['far']][0]
        if oo['mount'] == 'truss':
            ax.add_patch(Rectangle((oo['z'] - 0.15, 0), 0.3, oo['height_m'], fc=GC['far'], ec='none', alpha=0.85, zorder=5))
            tag(ax, oo['z'] + 0.8, oo['height_m'] + 0.9, 'goal post %.1f m' % oo['height_m'], GC['far'], 7.2)
        else:
            ax.add_patch(Rectangle((oo['z'] - 1.45, 7.95), 2.9, 0.8, fc=CRANE_Y, ec='none', zorder=5))
            tag(ax, oo['z'] + 1.8, 9.4, 'far crane rolled here', CRANE_Y, 7.2)
        for b, r in zip(run['bs'], run['res']):
            if b['cube'] > 3:
                continue
            ax.plot([b['p'][2], r['to'][2]], [b['p'][1], r['to'][1]], color=GC['far'] if r['pass'] else '#ff5a4f', lw=0.9, zorder=6)
            ax.plot(b['p'][2], b['p'][1], marker='^', ms=8, mfc=GC['far'], mec='#000', zorder=7)
        tag(ax, 19.2, 10.2, 'beam stop', CRANE_Y, 7.2, ha='right')
        caption(fig, ax, o, '%d/%d beams pass · the floor sees %d %% of them · %.0f cd/m2 per beam (median; a dark club ~0.01) · beams %.0f m long' % (
            run['far_pass'], run['far_beams'], round(100 * run['far_seen']), run['far_cd'], run['far_len']), 'far', rows=True)
    fig.savefig(path, facecolor=BG)
    plt.close(fig)
    return path


def band(ax, x, y0, y1, c, lw=5):
    ax.plot([x, x], [y0, y1], color=c, lw=lw, alpha=0.9, solid_capstyle='butt', zorder=7)


def fig_columns(FXO, res, path):
    opts = GRP['columns']['options']
    plt, fig, axs = grid_fig(len(opts), 'Column washes: three ways to light the building\'s columns',
                             'cross-section at one wall column (left span, x -36); the 9 checking rays of one PAR; the thick bar = the part of the column it lights; red x = stopped short',
                             16.0, 8.4)
    for ax, o in zip(axs, opts):
        xsec(ax, (-38.5, -28.5), (-0.5, 14.5), crane=False)
        key = ('columns', o['id'])
        for f in [f for f in FXO[key] if abs(f['p'][2] - (-24.0)) < 0.1 and f['p'][0] < -30]:
            draw_rays(ax, f, 'x', GC['columns'], key)
            row = [r for r in res[o['id']]['rows'] if r['id'] == f['id']][0]
            if row['column_band_m']:
                band(ax, WALL_FACE * -1 - 0.06, row['column_band_m'][0], row['column_band_m'][1], GC['columns'], 6)
            tag(ax, f['p'][0] + 0.4, f['p'][1] + 0.3, 'PAR %.1f m' % f['p'][1], GC['columns'], 8)
        tag(ax, -31.0, 12.1, 'space frame', DIM, 7, bold=False)
        tag(ax, -34.4, 7.5, 'runway girder', DIM, 7, bold=False)
        tag(ax, -34.4, 6.5, 'flared head', DIM, 7, bold=False)
        caption(fig, ax, o, res[o['id']]['summary']['verdict'], 'columns')
    fig.savefig(path, facecolor=BG)
    plt.close(fig)
    return path


def fig_roof(FXO, res, path):
    opts = GRP['roof']['options']
    plt, fig, axs = grid_fig(len(opts), 'Roof pools: 8 x UP-HK1915 in the side spans',
                             'cross-section of the left span (x -36 to -12); the checking rays of one unit at z -24; the thick bar = its pool on the space frame', 16.0, 7.2)
    for ax, o in zip(axs, opts):
        xsec(ax, (-37.5, -10.5), (-0.5, 17.0), crane=False)
        key = ('roof', o['id'])
        for f in [f for f in FXO[key] if abs(f['p'][2] - (-24.0)) < 0.1 and f['p'][0] < 0]:
            draw_rays(ax, f, 'x', GC['roof'], key)
            pts = [q for q in area_lands(f, key) if q[1] > 10.0]
            if pts:
                xs = [q[0] for q in pts]
                ax.plot([min(xs), max(xs)], [10.75, 10.75], color=GC['roof'], lw=6, alpha=0.9, solid_capstyle='butt', zorder=7)
            tag(ax, f['p'][0] + 0.5, f['p'][1] + 0.4, 'HK1915 %.1f m' % f['p'][1], GC['roof'], 8)
        caption(fig, ax, o, res[o['id']]['summary']['verdict'], 'roof')
    fig.savefig(path, facecolor=BG)
    plt.close(fig)
    return path


def fig_farwall(FXO, res, path):
    from matplotlib.patches import Rectangle
    opts = GRP['farwall']['options']
    plt, fig, axs = grid_fig(len(opts), 'The far end wall: 4 x UP-250BSW in the nave',
                             'side section of the far end (z -56 to -36); the checking rays of one unit; the thick bar = the wall it lights; the goal post in red', 16.0, 7.2)
    for ax, o in zip(axs, opts):
        zsec(ax, (-56, -36), (-0.5, 14))
        ax.add_patch(Rectangle((OPT_B['z'] - 0.15, 0), 0.3, OPT_B['height_m'], fc=GC['far'], ec='none', alpha=0.7, zorder=4))
        key = ('farwall', o['id'])
        for f in FXO[key][1:2]:
            draw_rays(ax, f, 'z', GC['farwall'], key)
            row = [r for r in res[o['id']]['rows'] if r['id'] == f['id']][0]
            if row['wall_band_m']:
                band(ax, -53.7, row['wall_band_m'][0], row['wall_band_m'][1], GC['farwall'], 6)
            tag(ax, f['p'][2] + 0.5, f['p'][1] - 0.6, '250BSW %.1f m' % f['p'][1], GC['farwall'], 8)
        tag(ax, OPT_B['z'] + 0.5, OPT_B['height_m'] + 0.6, 'goal post', GC['far'], 7)
        caption(fig, ax, o, res[o['id']]['summary']['verdict'], 'farwall')
    fig.savefig(path, facecolor=BG)
    plt.close(fig)
    return path


def fig_beams(FXO, res, path):
    opts = GRP['beams']['options']
    plt, fig, axs = grid_fig(len(opts), 'Floor beams: 18 x UP-B380F (the fan of 7 and the spine stay behind the DJ)',
                             'from above, the hall turned to run left to right (far gate left); a line = a beam\'s aim seen from above, a ringed dot = a beam straight up',
                             15.0, 9.4, rows=True, top=0.84, gap=0.1)
    for ax, o in zip(axs, opts):
        plan_strip(ax, (-56, 56), (-15, 15))
        key = ('beams', o['id'])
        for f in FXO[key]:
            if f['d'][1] > 0.97:
                ax.plot(f['p'][2], f['p'][0], marker='o', ms=12, mfc='none', mec=GC['beams'], mew=1.3, zorder=8)
            a = RESO[key][f['id']]
            t = a['_spec'][0]['first']['t'] if a['_spec'][0]['first'] else a['_spec'][0]['t_target']
            q = f['p'] + f['d'] * t
            ax.plot([f['p'][2], q[2]], [f['p'][0], q[0]], color=GC['beams'], lw=1.1, zorder=7)
            ax.plot(f['p'][2], f['p'][0], marker='D', ms=5, mfc=GC['beams'], mec='#000', zorder=9)
        if o['id'] == 'depth':
            tag(ax, -30.0, -13.0, 'depth comb: 4 beams straight up, z -27 / -33', GC['beams'], 7.6)
        tag(ax, 26.0, -13.0, 'arches: each pair crosses over the axis at 10 m', GC['beams'], 7.6)
        tag(ax, 23.5, 13.0, 'fan + spine (behind the DJ)', GC['beams'], 7.6, ha='right')
        caption(fig, ax, o, res[o['id']]['summary']['verdict'], 'beams', rows=True)
    fig.savefig(path, facecolor=BG)
    plt.close(fig)
    return path


def fig_haze(LZ, res, path):
    from matplotlib.patches import Circle
    opts = GRP['haze']['options']
    R = REC['haze_model']['reach_m']
    plt, fig, axs = grid_fig(len(opts), 'Haze: where the beams have air to show in',
                             'from above, the hall turned (far gate left); circles = each hazer\'s ASSUMED reach (%g m, to measure on site); laser beams dotted where no hazer reaches' % R,
                             15.0, 13.6, rows=True, top=0.86, gap=0.075)
    run = LZ[CHOSEN]
    for ax, o in zip(axs, opts):
        plan_strip(ax, (-56, 56), (-22, 22))
        hz = res[o['id']]['units']
        for p in hz:
            ax.add_patch(Circle((p[2], p[0]), R, fc=GC['haze'], ec=GC['haze'], alpha=0.10, lw=0.6, zorder=3))
            ax.plot(p[2], p[0], marker='h', ms=9, mfc=GC['haze'], mec='#000', zorder=8)
        H = np.array([[p[0], p[2]] for p in hz])
        for b, r in zip(run['bs'], run['res']):
            pts = path_pts(b['p'], b['d'], r['length_m'], 0.5)
            for q0, q1 in zip(pts[:-1], pts[1:]):
                fed = np.min(np.linalg.norm(H - [q0[0], q0[2]], axis=1)) <= R
                ax.plot([q0[2], q1[2]], [q0[0], q1[0]], color=GC['far'] if b['cube'] <= 3 else GC['mid'], lw=1.1 if fed else 0.7,
                        alpha=0.95 if fed else 0.5, ls='-' if fed else ':', zorder=6)
        caption(fig, ax, o, res[o['id']]['summary']['verdict'], 'haze', rows=True)
    fig.savefig(path, facecolor=BG)
    plt.close(fig)
    return path


def fig_flash(FXO, res, path):
    from matplotlib.patches import Rectangle
    opts = GRP['flash']['options']
    plt, fig, axs = grid_fig(len(opts), 'Strobes and blinders: 6 + 8 (other supplier)',
                             'side section at the stage (z 14 to 50), true scale; the checking rays of one strobe and one blinder; blue = standing eyes over the dance floor (1.6 m)',
                             13.0, 12.4, rows=True, top=0.86, gap=0.085)
    for ax, o in zip(axs, opts):
        zsec(ax, (14, 50), (-0.5, 11.5))
        ax.add_patch(Rectangle((L.AUD['z'][0], 0), L.AUD['z'][1] - L.AUD['z'][0], 1.6, fc='#2f6bff', ec='none', alpha=0.28, zorder=2))
        key = ('flash', o['id'])
        fx = FXO[key]
        for f in (fx[6], fx[7]):
            draw_rays(ax, f, 'z', GC['flash'], key, mark_block=False)
        tag(ax, 22.8, 9.6, 'near crane (beam stop)', CRANE_Y, 7)
        tag(ax, 21.4, 2.0, 'the cut', GC['truss'], 7)
        caption(fig, ax, o, res[o['id']]['summary']['verdict'], 'flash', rows=True)
    fig.savefig(path, facecolor=BG)
    plt.close(fig)
    return path


def fig_section(LZ, FXO, path):
    """Heights: a long section of the nave and a cross-section of the whole width, every group at its height."""
    from matplotlib.patches import Rectangle
    plt = plt_()
    fig = plt.figure(figsize=(18.0, 8.4), dpi=100)
    fig.patch.set_facecolor(BG)
    ax1 = fig.add_axes([0.03, 0.535, 0.95, 0.36])
    zsec(ax1, (-56, 56), (-0.5, 17.5))
    ax1.add_patch(Rectangle((OPT_B['z'] - 0.15, 0), 0.3, OPT_B['height_m'], fc=GC['far'], ec='none', alpha=0.8, zorder=5))
    p6 = cube_points(LZ)[6]
    ax1.add_patch(Rectangle((p6[2] - 0.15, 0), 0.3, p6[1], fc=GC['mid'], ec='none', alpha=0.8, zorder=5))
    run = LZ[CHOSEN]
    for b, r in zip(run['bs'], run['res']):
        if abs(b['p'][0]) < 12.5:
            ax1.plot([b['p'][2], r['to'][2]], [b['p'][1], r['to'][1]], color=GC['far'] if b['cube'] <= 3 else GC['mid'], lw=0.6, alpha=0.7, zorder=6)
    for gid, l_, fx in placement_set(FXO):
        for f in fx:
            if abs(f['p'][0]) <= 12.5:
                ax1.plot(f['p'][2], f['p'][1], marker=marker(f), ms=5, mfc=GC[gid], mec='#000', mew=0.3, zorder=8)
    for n, p in cube_points(LZ).items():
        if abs(p[0]) < 12.5:
            ax1.plot(p[2], p[1], marker='^', ms=9, mfc=GC['far'] if n <= 3 else GC['mid'], mec='#000', zorder=9)
    for z, y, t, c in ((OPT_B['z'] + 0.6, OPT_B['height_m'] + 0.9, 'goal post 7.0 m; cubes 1-3 at 6.6 m', GC['far']), (p6[2] + 0.6, p6[1] + 0.9, 'cube 6, 6.5 m tower', GC['mid']),
                       (-24.0, 3.6, 'cubes 4/5 at 5.0 m (x +-11.25)', GC['mid']), (21.6, 2.2, 'the cut 3.24-6.35 m', GC['truss']),
                       (-34.0, 9.6, 'far crane 7.95-8.75 m (stays at z -22.2)', CRANE_Y), (19.2, 9.6, 'near crane = the beam stop', CRANE_Y),
                       (-33.0, 1.3, 'depth comb + far nave columns (floor)', GC['beams']), (30.0, 3.2, 'arches (floor, x +-9.6)', GC['beams'])):
        tag(ax1, z, y, t, c, 7.4, ha='right' if 'near crane' in t else 'left')
    ax1.set_title('Along the nave (seen from house left; |x| <= 12.5 projected)', color=FG, fontsize=10, loc='left', family=FONT)
    ax2 = fig.add_axes([0.03, 0.04, 0.95, 0.40])
    xsec(ax2, (-37.5, 61.0), (-0.5, 17.5))
    for gid, l_, fx in placement_set(FXO):
        for f in fx:
            if f['p'][2] <= 25:
                ax2.plot(f['p'][0], f['p'][1], marker=marker(f), ms=5, mfc=GC[gid], mec='#000', mew=0.3, zorder=8)
    for n, p in cube_points(LZ).items():
        ax2.plot(p[0], p[1], marker='^', ms=9, mfc=GC['far'] if n <= 3 else GC['mid'], mec='#000', zorder=9)
    for x, y, t, c in ((-36.0, 9.2, 'runway girders 7.06-7.96', DIM), (-35.0, 14.2, 'space frame 10.8-13.35, deck 13.35', DIM), (-5.5, 17.0, 'lantern glass to 16.7', DIM),
                       (-11.0, 4.2, '4: 5.0 m', GC['mid']), (7.6, 4.2, '5: 5.0 m', GC['mid']), (-28.0, 1.3, 'roof pools, up', GC['roof']),
                       (-35.6, 2.4, 'column feet', GC['columns']), (-8.0, 9.4, 'crane bridge (near z 21, far z -22.2)', CRANE_Y), (38.0, 15.4, 'span 4: not lit (outside his paint)', DIM),
                       (-6.0, 6.9, 'cubes 1-3, 6.6 m', GC['far']), (2.0, 2.4, 'the cut', GC['truss'])):
        tag(ax2, x, y, t, c, 7.2, bold=c != DIM)
    ax2.set_title('Across the whole width, looking toward the far gate (every fixture from z 25 back, projected)', color=FG, fontsize=10, loc='left', family=FONT)
    fig.text(0.03, 0.975, 'Heights: where every device sits', color=FG, fontsize=14, fontweight='bold', family=FONT, va='top')
    fig.savefig(path, facecolor=BG)
    plt.close(fig)
    return path


# ------------------------------------------------------------------ the page
PAGE = r"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>MOXIR epic placement</title>
<style>:root{color-scheme:dark}html,body{background:#0b0c0d}</style></head><body><main id="root"></main>
<script>
"use strict";
const C={bg:"#0b0c0d",panel:"#121416",line:"#2a2e33",fg:"#e3e6ea",sub:"#a3aab1",dim:"#8f969e",ok:"#3cff3c",bad:"#ff5a4f",warn:"#ffb36b",accent:"#ff6a2a",fixed:"#c9a200"};
const D=__DATA__;const F="ui-monospace,'DejaVu Sans Mono',monospace";
const el=(t,s,h)=>{const e=document.createElement(t);if(s)Object.assign(e.style,s);if(h!=null)e.innerHTML=h;return e;};
const esc=s=>String(s).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
const wrap=t=>{const w=el("div",{overflowX:"auto",maxWidth:"100%"});w.appendChild(t);return w;};
const td=(t,s)=>el("td",Object.assign({border:"1px solid "+C.line,padding:"6px 8px",verticalAlign:"top"},s||{}),t);
const table=(head,rows)=>{const t=el("table",{borderCollapse:"collapse",width:"100%",font:"12.5px/1.45 "+F,color:"#c4c9cf"});
  const h=el("tr");for(const k of head)h.appendChild(td(esc(k),{color:C.fg}));t.appendChild(h);
  for(const r of rows){const tr=el("tr");for(const c of r)tr.appendChild(typeof c==="object"&&c&&c.html!=null?td(c.html,c.style):td(esc(c)));t.appendChild(tr);}return wrap(t);};
const img=(src,alt)=>{const i=el("img",{display:"block",width:"100%",height:"auto",background:"#000",margin:"8px 0 4px"});i.src=src;i.alt=alt;return i;};
Object.assign(document.body.style,{margin:"0",background:C.bg,color:C.fg,font:"16px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif"});
const root=document.getElementById("root");Object.assign(root.style,{maxWidth:"1240px",margin:"0 auto",padding:"32px 16px 60px",boxSizing:"border-box"});
const h2=(n,t)=>root.appendChild(el("h2",{font:"600 18px/1.3 "+F,margin:"36px 0 10px"},"<span style='color:"+C.accent+";margin-right:10px'>"+n+"</span>"+t));
const p=(t,s)=>root.appendChild(el("p",Object.assign({color:C.sub,margin:"0 0 10px"},s||{}),t));
const note=t=>root.appendChild(el("div",{color:C.dim,font:"12px/1.5 "+F,margin:"4px 0 12px"},t));
const S=D.S,R=D.R;
root.appendChild(el("h1",{font:"600 22px/1.25 "+F,margin:"0 0 6px"},"MOXIR beta v0.9 &middot; the epic plot, phase 1: placement"));
note("Sketches and measured options, 2026-10-08. Nothing is built. You pick one option per group; then the looks, cues, schedule and crew sheet (phase 2).");
h2("1","The answer");
const ans=el("div",{background:C.panel,border:"1px solid "+C.line,padding:"14px 16px",font:"15px/1.6 system-ui,sans-serif"});
ans.innerHTML=D.answer.map((a,i)=>"<b>"+(i+1)+".</b> "+a).join("<br>");root.appendChild(ans);
h2("2","Fixed by your decisions");
root.appendChild(table(["what","decided","record"],R.fixed.map(f=>[{html:"<b style='color:"+C.fixed+"'>FIXED</b> "+esc(f.what)},f.by,f.src])));
h2("3","From above: the whole building");root.appendChild(img(D.png.plan,"top plan"));note(esc(D.pngName.plan));
h2("4","From the dance floor: where things are");root.appendChild(img(D.png.view,"view from the floor"));note(esc(D.pngName.view));
h2("5","Heights");root.appendChild(img(D.png.section,"sections"));note(esc(D.pngName.section));
h2("6","Each group: the options, measured");
p("Per option: what it shows, what the checks found (the hall model's 55 000 triangles + the rig's solids + the goal post), the rigging, the safety, the cost. The advised option is marked. Short verdicts; the numbers are in placement.json.");
let k=0;
for(const g of R.groups){k++;
  root.appendChild(el("h3",{font:"600 16px/1.3 "+F,margin:"30px 0 6px",color:g.colour},"6."+k+" "+esc(g.title)));
  if(g.fixed)note("<b style='color:"+C.fixed+"'>FIXED:</b> "+esc(g.fixed));
  if(D.png["opt_"+g.id]){root.appendChild(img(D.png["opt_"+g.id],g.title));note(esc(D.pngName["opt_"+g.id]));}
  const res=S.groups[g.id]||{};
  root.appendChild(table(["option","what it shows","measured","rigging","safety","cost / rental"],g.options.map(o=>{const adv=o.id===g.advice;const v=((res[o.id]||{}).summary||{}).verdict||"";
    return [{html:(adv?"<b style='color:"+g.colour+"'>ADVISED</b><br>":"")+"<b>"+esc(o.id)+"</b>: "+esc(o.title)},o.shows,{html:esc(v),style:{color:adv?C.fg:"#c4c9cf"}},o.rigging,o.safety,o.cost];})));
  if(g.options.length>1||g.why)p("<b style='color:"+g.colour+"'>Advice: "+esc(g.advice)+".</b> "+esc(g.why));
}
h2("7","Laser safety and power, honestly");
root.appendChild(table(["unit","colour","power","static-beam NOHD (scan failure)"],S.nohd.table.map(r=>[r.variant+(r.variant==="10W"?" (safety basis)":" (visibility basis)"),r.colour,r.power_w+" W",r.nohd_m+" m"])));
p(esc(R.laser_model.duty_why));
p("Per beam, 6 W unit, 2 beams per cube (median of what the floor sees, far trio): "+Object.entries(S.lasers).map(([k,v])=>k+" "+v.far_cd+" cd/m&sup2;").join(", ")+". The 10-07/10-08 figures (10 W, one beam per cube's full power): "+Object.entries(S.lasers).map(([k,v])=>k+" "+v.far_cd_old_model).join(", ")+". A dark club is about 0.01 cd/m&sup2; (ASSUMED). Every beam ends on steel; none over the audience; nothing below 3 m over a floor.");
if(S.crane_as_photographed){const over=S.crane_as_photographed.filter(x=>x.end_z>21);if(over.length)root.appendChild(el("p",{color:C.bad,font:"600 14px/1.5 "+F,margin:"6px 0 10px"},"HARD PRECONDITION: the near crane at z 21 is the beam stop. With it where every photo shows it (z 4.8), "+over.map(x=>x.beam).join(", ")+" would cross the dance floor. No stage-ward emission until it is seen parked at z 21."));}
note(esc(S.nohd.basis)+". "+esc(S.nohd.maker_warning||""));
h2("8","Loads touched by the options");
root.appendChild(table(["structure","with","load","allowed","source"],[["goal post (H30V, 12 m)","lasers 1-3",S.goalpost_load.lasers_kg+" kg","289.5 kg (third points)",S.goalpost_load.basis],["goal post","+ 4 far-wall heads (farwall: goalpost)",S.goalpost_load.with_far_wall_heads_kg+" kg","289.5 kg",""],["the cut (H30V, 3 picks)","17 PARs + 14 flash units (flash: front)",S.flash_truss_load.total_kg+" kg = "+S.flash_truss_load.per_m_kg+" kg/m",S.flash_truss_load.allowable_kg_per_m+" kg/m (6 m span, UDL)",S.flash_truss_load.basis]]));
note("Towers (goal post, cube 6) and the crane's rated load: owed from the rental house and the venue.");
h2("9","Your picks");
root.appendChild(table(["group","options","advised"],R.groups.filter(g=>g.options.length>1).map(g=>[g.title,g.options.map(o=>o.id+": "+o.title).join(" | "),{html:"<b style='color:"+g.colour+"'>"+esc(g.advice)+"</b>"}])));
h2("10","Limits");
p(esc(D.limits));
root.appendChild(el("div",{color:C.dim,font:"12px/1.55 "+F,marginTop:"26px",borderTop:"1px solid "+C.line,paddingTop:"12px"},"Generated by scripts/place/epic_placement.py (PR #823) from rigs/moxir-epic-placement-2026-10-08.json, on top of lasers_v2.py and design_paint.py; the hall GLB pinned by sha256 in occlusion_lib.py."));
</script></body></html>
"""

LIMITS = ('The hall model carries hall.json\'s confidence: the near crane\'s girder height ASSUMED (7.95 m, the far crane\'s), the side spans and the far half '
          'never photographed for clutter, the pendant lamps at 7.5-8.7 m over the nave not in the model (on today\'s shot list). Lamp intensities are borrowed '
          'equivalents (fixtures.json). The haze reach is ASSUMED. Strobe and blinder units are equivalents (Martin Atomic 3000 LED, Chauvet STRIKE 4) until the '
          'other supplier is chosen. Pictures are sketches from the model\'s triangles, not renders.')


def answer(out):
    lz = out['lasers'][GRP['far']['advice']]
    g = out['groups']
    return [
        'Your 6 laser places stay. Lasers 1-3 on the <b>goal-post truss</b> (b): %d of %d beams pass, the floor sees %d %% of them at %.0f cd/m&sup2; per beam even as a 6 W cube splitting its power between 2 beams. Everything else is placed around them.' % (
            lz['far_pass'], lz['far_beams'], round(100 * lz['far_seen']), lz['far_cd']),
        'The building is the set: <b>column feet</b> uplit (%s), <b>roof pools from the floor</b> (%s), the far wall from the floor; 4 of the 18 beams move to the far nave as a <b>depth comb</b>; <b>2 more hazers</b> at the far end and 2 moved to the press, so the lasers are born in haze (%s).' % (
            g['columns']['feet']['summary']['verdict'].split(';')[1].strip(), g['roof']['floor']['summary']['verdict'].split(';')[1].strip(),
            g['haze']['plus2']['summary']['verdict'].split(';')[0]),
        'Strobes and blinders <b>behind the DJ, aimed up</b>: %s. To pick: 7 groups, one option each (section 9); the stage, the truss and the laser places are fixed.' % (
            g['flash']['behind']['summary']['verdict'].split(';')[0])]


def main():
    out, LZ, FXO = run()
    if A3.check or not A3.out:
        print(json.dumps(out, indent=1, default=lambda v: v.tolist() if hasattr(v, 'tolist') else str(v)))
        return
    od = os.path.expanduser(A3.out)
    os.makedirs(od, exist_ok=True)
    P = lambda n: os.path.join(od, 'placement-%s.png' % n)
    G_ = out['groups']
    pngs = {'plan': fig_plan(LZ, FXO, P('plan')), 'view': fig_view(LZ, FXO, P('view')), 'section': fig_section(LZ, FXO, P('section')),
            'opt_far': fig_far(LZ, P('opt-lasers-1-3')), 'opt_columns': fig_columns(FXO, G_['columns'], P('opt-columns')),
            'opt_roof': fig_roof(FXO, G_['roof'], P('opt-roof')), 'opt_farwall': fig_farwall(FXO, G_['farwall'], P('opt-farwall')),
            'opt_beams': fig_beams(FXO, G_['beams'], P('opt-beams')), 'opt_haze': fig_haze(LZ, G_['haze'], P('opt-haze')),
            'opt_flash': fig_flash(FXO, G_['flash'], P('opt-flash'))}
    import base64
    data = {'S': out, 'R': {k: REC[k] for k in ('fixed', 'groups', 'laser_model')}, 'answer': answer(out), 'limits': LIMITS,
            'png': {k: 'data:image/png;base64,' + base64.b64encode(open(v, 'rb').read()).decode() for k, v in pngs.items()},
            'pngName': {k: os.path.basename(v) for k, v in pngs.items()}}
    html = PAGE.replace('__DATA__', json.dumps(data, default=lambda v: v.tolist() if hasattr(v, 'tolist') else str(v)))
    open(os.path.join(od, 'placement.html'), 'w').write(html)
    with open(os.path.join(od, 'placement.json'), 'w') as fh:
        json.dump(out, fh, indent=1, default=lambda v: v.tolist() if hasattr(v, 'tolist') else str(v))
    for v in list(pngs.values()) + [os.path.join(od, 'placement.html'), os.path.join(od, 'placement.json')]:
        print('wrote', v)


if __name__ == '__main__':
    main()
