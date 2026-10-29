#!/usr/bin/env python3
# lasers_v2.py — MOXIR beta v0.9: the 6 lasers as the owner repainted them (2026-10-08), every beam toward the stage
# ending on steel behind the DJ. Pictures and numbers only; nothing is built.
#
#   python3 -I scripts/place/lasers_v2.py --repo . --out ~/Downloads/moxir/stage/occlusion    # page lasers-v2.html + PNGs
#   python3 -I scripts/place/lasers_v2.py --repo . --check                                    # the numbers, JSON
#
# INPUTS: rigs/moxir-lasers-v2-2026-10-08.json (his places, the beams, the far-trio options, colours, looks), the
# painted design (design_paint.py: washes, core, the obstacle model, the cloud and photo audit), his painted file.
#
# METHOD
#   - Each beam is one static point of its cube's scan, held by the controller to +-az/el (the record's fan_deg): the
#     test casts 5 x 5 rays over that zone against the hall GLB's triangles + the rig's boxes (occlusion_lib.py).
#     A ray PASSES when its first hit is the beam's named STOP (the near crane's back girder, a span's runway girder),
#     it stays >= 3 m over every floor and at z <= 21 (behind the truss plane: never over the crowd), and no other
#     steel is within 0.3 m (tube test, the mount and the stop excepted). The worst case of a mirror bounce off the stop
#     is traced: it must stay behind z 21 and >= 3 m over floors.
#   - Ocular hazard: IEC 60825-1:2014 Table A.1 MPE for a visible CW beam at 0.25 s and the static-beam NOHD, the cube's
#     10 W / 4 mm / 1 mrad (LASEROS-MK2): the same figures as the 10-07 report. Planning, not a sign-off.
#   - Visibility of a beam in haze (single scattering; Beer-Lambert extinction; Henyey & Greenstein, ApJ 93, 70, 1941):
#     a beam of power P(s) = P0 exp(-sigma s) and width w(s) = a + phi s, seen at angle theta from its axis, has radiance
#         L = sigma * p_HG(theta, g) * P(s) / (w(s) * sin theta) * exp(-sigma d)          [W m^-2 sr^-1]
#     (the line of sight crosses the beam over w / sin theta; d = eye to beam). There is no inverse-square fall-off with
#     the eye's distance (radiance is conserved): a collimated beam 80 m away is as bright as at 10 m but for the haze's
#     own transmission exp(-sigma d) on the way. Photometric: x 683 lm/W x V(lambda) (CIE 1924) per diode, with the
#     datasheet's per-colour power (fixtures.json lasercube.specs.variants_mw). sigma = 0.02 /m is the rig's written haze.
import argparse, json, math, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.dont_write_bytecode = True
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('--repo', default='.')
ap.add_argument('--v2', default='scripts/place/rigs/moxir-lasers-v2-2026-10-08.json')
ap.add_argument('--out', default=None)
ap.add_argument('--check', action='store_true')
ap.add_argument('--no-photos', action='store_true')
A2 = ap.parse_known_args()[0]

import design_paint as D     # noqa: E402  (builds the painted design; its obstacle model, cloud and photo audit)
O, OC, L, MX, G = D.O, D.OC, D.L, D.MX, D.G
V2 = json.load(open(os.path.join(A2.repo, A2.v2)))
R = V2['rules']
EYE = np.array([0.0, 1.6, 38.0])
V_LAMBDA = {455: 0.048, 525: 0.786, 638: 0.193}          # CIE 1924 photopic V(lambda), linear between the 10 nm table values
FX_SPECS = json.load(open(os.path.join(A2.repo, 'scripts/place/fixtures/fixtures.json')))['kinds']['lasercube']['specs']
VARIANTS = {k: {int(c.rstrip('nm')): mw / 1000.0 for c, mw in v.items()} for k, v in FX_SPECS['variants_mw']['value'].items()}   # W per wavelength
VARIANT = '10W'            # the owner's cubes taken as the 10 W unit: NOT confirmed (shot list: a cube's label)


def colour_power(colour, variant=VARIANT):
    """(watts, lumens) of a beam: ember red = the 638 nm diode alone; ash white = all three diodes."""
    w = VARIANTS[variant]
    lam = [638] if colour == 'ember red' else [455, 525, 638]
    return sum(w[l] for l in lam), sum(683 * V_LAMBDA[l] * w[l] for l in lam)


def nohd_for(P):
    return (math.sqrt(4 * P / (math.pi * L.MPE_E)) - L.LASER_A_M) / L.LASER_PHI


# ------------------------------------------------------------------ obstacle models per option for the far trio
class Shifted(O.Obstacles):
    """The same triangles with one crane rolled along z, and extra boxes (a goal-post truss)."""

    def __init__(self, base, crane_label=None, dz=0.0, extra=()):
        self.__dict__.update(base.__dict__)
        if crane_label:
            idx = np.nonzero(np.char.startswith(np.array(base.labels)[base.lab], crane_label) & (np.abs(base.C[:, 0]) < 12.5))[0]   # the nave's crane only
            self.V0 = base.V0.copy()
            self.C = base.C.copy()
            self.V0[idx, 2] += dz
            self.C[idx, 2] += dz
        self.boxes = list(base.boxes) + list(extra)


def goalpost(z, h, span=12.0):
    """A goal post: a 0.29 m square truss span at height h (top), two towers to the floor at x +-span/2."""
    t = L.Box.aabb('goal-post truss z %g' % z, (-span / 2 - 0.15, span / 2 + 0.15), (h - 0.29, h), (z - 0.145, z + 0.145))
    towers = [L.Box.aabb('goal-post tower x %+g' % x, (x - 0.15, x + 0.15), (0.0, h), (z - 0.15, z + 0.15)) for x in (-span / 2, span / 2)]
    return [(b, b.id, 'truss') for b in [t] + towers]


def option_model(o):
    if o['mount'] == 'crane':
        return Shifted(OC.OB, 'crane z -22.2', o['z'] - (-22.2))
    return Shifted(OC.OB, extra=goalpost(o['z'], o['height_m'], o['span_m']))


# ------------------------------------------------------------------ the beams
def beams_for(o):
    out = []
    for c in V2['cubes']:
        if c.get('far'):
            x = (o.get('moves') or {}).get(str(c['n']), {}).get('x', c['x'])
            p = np.array([x, o['y'], o['z'] + (1.1 + 0.35 + 0.35 if o['mount'] == 'crane' else 0.0)], float)
            mount = (o['name'] + (': girder clamp + 0.5 m drop arm, in front of the front girder' if o['mount'] == 'crane' else ': half-coupler + safety under the bottom chord'))
        else:
            p = np.array(c['p'], float)
            mount = c['mount']
        for k, b in enumerate(c['beams']):
            T = np.array((o.get('targets') or {}).get('%d%s' % (c['n'], 'ab'[k]), b['to']) if c.get('far') else b['to'], float)
            out.append({'id': '%d%s' % (c['n'], 'ab'[k]), 'cube': c['n'], 'fixture': c['id'], 'colour_name': c['colour'], 'colour': V2['colours'][c['colour']],
                        'p': p, 'd': L.unit(T - p), 'to': T, 'stop': b['stop'], 'what': b.get('what', 'toward the stage, onto the near crane\'s back girder'),
                        'fan': tuple(c['fan_deg']), 'mount': mount, 'kind': 'laser', 'spare': False})
    return out


def zone_rays(b, n=5):
    f = dict(b)
    return MX.fan_rays(f, n, n)


def check_beam(b, ob):
    """Every ray of the beam's zone: first hit, the floor and crowd rules, steel clearance, the mirror worst case."""
    keep = OC.OB
    OC.OB = ob
    try:
        rays = []
        sub = ob.subset(b['p'], b['d'], math.radians(max(b['fan']) + 0.5), 130.0)
        for d in zone_rays(b):
            t, what, cls, n = ob.cast(b['p'], d, 0.35, 130.0, sub)
            if t is None:
                t, what, cls, n = 130.0, 'open air', 'air', None
            end = b['p'] + d * t
            lo_floor, lo_aud = OC.path_heights(b['p'], d, t)
            errs = []
            if not (what or '').startswith(b['stop']):
                errs.append('ends on %s at %.1f m, not on its stop (%s)' % (what, t, b['stop']))
            if lo_floor < R['min_over_floor_m']:
                errs.append('%.2f m over a floor' % lo_floor)
            zmax = max(b['p'][2], end[2])
            if zmax > R['behind_z']:
                errs.append('reaches z %.1f: past the truss plane' % zmax)
            u = np.cross(d, [0.0, 1.0, 0.0])
            u /= np.linalg.norm(u)
            w = np.cross(d, u)
            near = None
            for off in (u, -u, w, -w):
                o2 = b['p'] + 0.3 * off
                t2, what2, cls2, _ = ob.cast(o2, d, 0.6, t - 0.4, sub)
                if t2 is not None and not (what2 or '').startswith(b['stop']) and not (what2 or '').startswith('goal-post') and cls2 not in ('floor',):
                    near = {'what': what2, 't': round(t2, 2)}
                    break
            if near:
                errs.append('passes within 0.3 m of %s at %.1f m' % (near['what'], near['t']))
            mirror = None
            if n is not None:
                r = d - 2 * (d @ n) * n
                q = end - d * 0.01
                t3, what3, cls3, _ = ob.cast(q, r, 0.05, 150.0)
                t3 = t3 if t3 is not None else 150.0
                ts = np.arange(0.0, t3, 0.1)
                pts = q[None, :] + ts[:, None] * r[None, :]
                inside = (pts[:, 2] > L.ENDS[0]) & (pts[:, 2] < L.ENDS[1]) & (pts[:, 0] > L.WALLS[0]) & (pts[:, 0] < L.WALLS[1])
                mirror = {'ends_on': what3 or 'open air', 'zmax': round(float(pts[inside, 2].max()) if inside.any() else float(q[2]), 2),
                          'lowest_m': round(float(pts[inside, 1].min()) if inside.any() else float(q[1]), 2)}
                if mirror['zmax'] > R['behind_z'] or mirror['lowest_m'] < R['min_over_floor_m']:
                    errs.append('mirror worst case: the bounce reaches z %.1f / %.1f m high' % (mirror['zmax'], mirror['lowest_m']))
            rays.append({'dir': [round(v, 5) for v in d], 'ends_on': what, 'cls': cls, 't': round(t, 2), 'end': [round(v, 2) for v in end],
                         'min_over_floor_m': round(lo_floor, 2), 'mirror': mirror, 'errors': errs})
        errs = sorted({e.split(' at ')[0] if 'within' in e else e for r in rays for e in r['errors']})
        return {'id': b['id'], 'cube': b['cube'], 'fixture': b['fixture'], 'colour': b['colour_name'], 'from': [round(v, 2) for v in b['p']], 'to': [round(v, 2) for v in b['to']],
                'stop': b['stop'], 'what': b['what'], 'mount': b['mount'], 'rays': len(rays), 'pass': not errs, 'errors': errs[:4],
                'length_m': round(float(np.median([r['t'] for r in rays])), 1), 'min_over_floor_m': min(r['min_over_floor_m'] for r in rays),
                'ends': {k: sum(1 for r in rays if r['ends_on'] == k) for k in sorted({r['ends_on'] for r in rays})},
                'mirror_zmax': max((r['mirror']['zmax'] for r in rays if r['mirror']), default=None),
                'mirror_lowest_m': min((r['mirror']['lowest_m'] for r in rays if r['mirror']), default=None), '_rays': rays}
    finally:
        OC.OB = keep


# ------------------------------------------------------------------ visibility in haze
def p_hg(theta, g):
    return (1 - g * g) / (4 * math.pi * (1 + g * g - 2 * g * math.cos(theta)) ** 1.5)


def visibility(b, res, ob, n=9):
    """Luminance (cd/m2) of the beam as the floor eye (z 38) sees it at n points, with the line of sight tested."""
    sig, g = V2['haze']['sigma_per_m'], V2['haze']['g']
    P0, lm = colour_power(b['colour_name'])                                  # the datasheet's per-colour watts
    eff = lm / P0
    t_end = res['length_m']
    pts = []
    for s in np.linspace(1.0, t_end - 0.5, n):
        q = b['p'] + b['d'] * s
        v = q - EYE
        dist = float(np.linalg.norm(v))
        h = ob.cast(EYE, v / dist, 0.3, dist - 0.3)
        theta = math.acos(max(-1.0, min(1.0, float((-v / dist) @ b['d']))))    # angle between the beam and the line back to the eye
        w = L.LASER_A_M + L.LASER_PHI * s
        Lr = sig * p_hg(theta, g) * P0 * math.exp(-sig * s) / (w * max(math.sin(theta), 1e-3)) * math.exp(-sig * dist)
        pts.append({'s_m': round(float(s), 1), 'at': [round(float(c), 1) for c in q], 'eye_m': round(dist, 1), 'theta_deg': round(math.degrees(theta), 1),
                    'seen': h[0] is None, 'cd_m2': round(Lr * eff, 1)})
    seen = [p for p in pts if p['seen']]
    return {'points': pts, 'seen_share': round(len(seen) / len(pts), 2), 'cd_m2_seen_median': round(float(np.median([p['cd_m2'] for p in seen])), 1) if seen else 0.0,
            'farthest_seen_m': max((p['eye_m'] for p in seen), default=None)}


def nohd():
    """Static-beam NOHD per variant and colour. The visible wavelengths act on the same retinal hazard, so the powers add."""
    rows = []
    for v in ('10W', '6W'):
        for colour in ('ash white', 'ember red'):
            P, _ = colour_power(colour, v)
            rows.append({'variant': v, 'colour': colour, 'power_w': round(P, 2), 'nohd_m': round(nohd_for(P))})
    return {'mpe_w_m2': round(L.MPE_E, 1), 'nohd_m': round(nohd_for(colour_power('ash white')[0])), 'nohd_10w_nominal_m': round(L.NOHD_M), 'table': rows,
            'check': 'the 703 m of the 10-07 report is the 10 W nominal total; the 10 W unit\'s three diodes add to %.1f W (5.0 + 2.8 + 2.8): %d m' % (colour_power('ash white')[0], round(nohd_for(colour_power('ash white')[0]))),
            'basis': 'IEC 60825-1:2014 Table A.1, visible CW, t = 0.25 s, H = 18 t^0.75 J/m2 -> MPE 25.5 W/m2; NOHD = (sqrt(4P/(pi E)) - a)/phi with a 4 mm, phi 1 mrad (fixtures.json lasercube.specs); the static-beam (scanner-failure) case IEC TR 60825-3 asks the show to plan for',
            'maker_warning': V2.get('maker_warning')}


# ------------------------------------------------------------------ the pass
def run_option(o):
    ob = option_model(o)
    bs = beams_for(o)
    res = [check_beam(b, ob) for b in bs]
    vis = {b['id']: visibility(b, r, ob) for b, r in zip(bs, res)}
    return ob, bs, res, vis


def option_summary(o, res, vis):
    far = [r for r in res if r['cube'] in (1, 2, 3)]
    return {'id': o['id'], 'name': o['name'], 'needs': o.get('needs') or o.get('load_check', ''), 'far_pass': sum(r['pass'] for r in far), 'far_beams': len(far),
            'far_errors': sorted({e for r in far for e in r['errors']})[:4],
            'far_seen_share': round(float(np.mean([vis[r['id']]['seen_share'] for r in far])), 2),
            'far_cd_m2': round(float(np.median([vis[r['id']]['cd_m2_seen_median'] for r in far])), 1),
            'far_length_m': round(float(np.mean([r['length_m'] for r in far])), 1)}


def as_fixtures(bs, res):
    """The beams as pseudo-fixtures for design_paint's drawing (one per beam, its rays in D.RES)."""
    out = []
    for b, r in zip(bs, res):
        f = dict(b, id='v2-' + b['id'], type='ext-lc-ultra-mk2', groupName='lasers v2', name='%s' % b['id'], colour=b['colour'])
        D.RES[f['id']] = {'_rays': [dict(x, dir=x['dir']) for x in r['_rays']]}
        out.append(f)
    return out


# ------------------------------------------------------------------ the near crane where every photo shows it
def crane_as_photographed(bs):
    """The beams against the hall as photographed (hall v8-show: the near crane parked at z 4.8, not at z 21). The
    stage-ward beams END on the near crane: if it is not moved, they stop over the press instead of behind the DJ."""
    path = os.path.join(D.GLB_AS_PHOTOGRAPHED, 'hall.glb')
    if not os.path.exists(path):
        return None
    g = json.load(open(os.path.join(D.GLB_AS_PHOTOGRAPHED, 'hall.json')))['geometry']
    ob = O.Obstacles(path, g, L.rig_boxes(), L.TRUSS, L.crane_boxes())
    o = [x for x in V2['options_far'] if x['id'] == V2['chosen_far']][0]
    ob = Shifted(ob, extra=goalpost(o['z'], o['height_m'], o['span_m']))
    out = []
    for b in bs:
        t, what, cls, _ = ob.cast(b['p'], b['d'], 0.35, 130.0)
        out.append({'beam': b['id'], 'first_hit': what or 'open air', 'at_m': round(t, 1) if t else None, 'end_z': round(float((b['p'] + b['d'] * (t or 0))[2]), 1)})
    return out


# ------------------------------------------------------------------ the audit of the chosen option's beams
def audit_beams(bs, res, pts, cam_of, cam_c, cams):
    rows = []
    for b, r in zip(bs, res):
        f = dict(b, id='v2-' + b['id'], groupName='lasers v2: cube %d' % b['cube'], type='ext-lc-ultra-mk2')
        t_end = r['length_m']
        cl = D.cloud_pass(f, t_end, pts, cam_of, cam_c) if pts is not None else None
        ph = D.photo_pass(f, t_end, cams) if cams else {'photo': None, 'seen': 0.0}
        if not r['pass']:
            verdict = 'BLOCKED: ' + '; '.join(r['errors'][:2])
        elif cl and cl['clutter'] >= D.CLOUD_MIN_PTS and cl['clutter_views'] >= D.CLOUD_MIN_VIEWS:
            verdict = 'CHECK: %d cloud points (%d photos) in the zone that the model lacks, %s-%s m from the cube, about %s' % (cl['clutter'], cl['clutter_views'], cl['clutter_s_m'][0], cl['clutter_s_m'][1], cl['clutter_at'])
        elif ph['seen'] >= 0.5:
            verdict = 'CLEAR (model + cloud; photo %s sees %d %% of the path)' % (ph['photo'], round(100 * ph['seen']))
        else:
            verdict = 'UNKNOWN: no photo sees half of the path (best %s %d %%)' % (ph['photo'] or 'none', round(100 * ph['seen']))
        rows.append({'id': f['id'], 'group': f['groupName'], 'type': 'ext-lc-ultra-mk2', 'at': [round(v, 2) for v in b['p']], 'path_m': t_end,
                     'model': 'clear' if r['pass'] else 'BLOCKED', 'cloud': cl, 'photo': ph, 'verdict': verdict})
    return rows


# ------------------------------------------------------------------ pictures
def recolour(fx):
    pal = V2['palette']['washes']
    return [dict(f, colour=pal.get(f['groupName'], f['colour'])) for f in fx]


def fig_plan(bs, res, zones, path, opts):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.patches import Rectangle
    fig = plt.figure(figsize=(13.0, 13.4), dpi=100)
    fig.patch.set_facecolor(D.BG)
    ax = fig.add_axes([0.06, 0.04, 0.9, 0.86])
    D.plan_hall(ax, xl=(-38, 40), zl=(26, -56), zones=zones)
    for o in opts:
        if o['mount'] == 'truss':
            ax.add_patch(Rectangle((-o['span_m'] / 2, o['z'] - 0.2), o['span_m'], 0.4, fc='#d0d4da' if o['id'] == V2['chosen_far'] else 'none',
                                   ec='#d0d4da', lw=0.8, ls='-' if o['id'] == V2['chosen_far'] else '--', zorder=5))
            ax.text(o['span_m'] / 2 + 0.6, o['z'] + 0.3, 'option %s%s' % (o['id'], ' (chosen): goal post' if o['id'] == V2['chosen_far'] else ''), color='#d0d4da', fontsize=7, zorder=6)
        else:
            ax.add_patch(Rectangle((-11.35, o['z'] - 1.45), 22.7, 2.9, fc='none', ec='#c9a200', lw=0.8, ls='--', zorder=5))
            ax.text(-11.2, o['z'] - 1.9, 'option a: the far crane rolled here', color='#c9a200', fontsize=7, zorder=6)
    for b, r in zip(bs, res):
        for k, ray in enumerate(r['_rays']):
            if k == 12:
                ax.plot([b['p'][0], ray['end'][0]], [b['p'][2], ray['end'][2]], color=b['colour'], lw=1.1, alpha=0.9, zorder=7)
            ax.plot(ray['end'][0], ray['end'][2], marker='.', ms=1.5, color=b['colour'], zorder=7)
        q = b['p'] + b['d'] * r['length_m'] * (0.28 if b['id'].endswith('a') else 0.42)
        ax.text(q[0] + 0.4, q[2], b['id'], color=b['colour'], fontsize=7.5, zorder=8, fontweight='bold')
    for c in V2['cubes']:
        p = [b['p'] for b in bs if b['cube'] == c['n']][0]
        ax.plot(p[0], p[2], marker='^', ms=8, mfc=V2['colours'][c['colour']], mec='#000', zorder=9)
        ax.text(p[0] - 0.4, p[2] - 0.9, str(c['n']), color='#ffffff', fontsize=11, fontweight='bold', ha='right', zorder=9)
        lp = V2['paint']['loops_m'][str(c['n'])]
        ax.plot(lp[0], lp[1], marker='o', ms=9, mfc='none', mec='#1ec8a0', mew=1.2, zorder=8)
    fig.text(0.06, 0.975, 'Lasers v2 from above: his paint (teal), his loops (rings), the cubes (triangles), every beam to its stop',
             color=D.FG, fontsize=12.5, fontweight='bold', family='DejaVu Sans Mono', va='top')
    fig.text(0.06, 0.952, 'ash white: 1, 3, 6 · ember red: 2, 4, 5 · every beam toward the stage ends on the near crane\'s back girder (z 19.55); 4a / 5a end on the side spans\' far runway girders',
             color=D.DIM, fontsize=8, family='DejaVu Sans Mono', va='top')
    fig.savefig(path, facecolor=D.BG)
    plt.close(fig)
    return path


def fig_section(fx, path):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig = plt.figure(figsize=(18.0, 5.4), dpi=100)
    fig.patch.set_facecolor(D.BG)
    ax = fig.add_axes([0.03, 0.1, 0.95, 0.72])
    D.section_ax(ax, fx, lasers_only=True)
    ax.set_xlim(-56, 52)
    o = [x for x in V2['options_far'] if x['id'] == V2['chosen_far']][0]
    ax.add_patch(__import__('matplotlib.patches', fromlist=['Rectangle']).Rectangle((o['z'] - 0.15, 0), 0.3, o['height_m'], fc='#d0d4da', ec='#d0d4da', zorder=4))
    ax.text(o['z'] + 0.4, o['height_m'] + 0.3, 'goal post z %g, %g m' % (o['z'], o['height_m']), color='#d0d4da', fontsize=7)
    ax.text(19.0, 9.4, 'beam stop: the near crane\'s back girder', color='#c9a200', fontsize=7, ha='right')
    ax.text(30, 2.4, 'audience', color='#7f9cff', fontsize=7)
    fig.text(0.03, 0.95, 'Lasers v2, side section along the nave: beam heights against the floors, the 3 m line and the beam stops (everything projected onto one plane)',
             color=D.FG, fontsize=11.5, fontweight='bold', family='DejaVu Sans Mono', va='center')
    fig.savefig(path, facecolor=D.BG)
    plt.close(fig)
    return path


# ------------------------------------------------------------------ the page
PAGE = r"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>MOXIR lasers v2</title></head><body><main id="root"></main>
<script>
"use strict";
const C={bg:"#0b0c0d",panel:"#121416",line:"#2a2e33",fg:"#e3e6ea",sub:"#a3aab1",dim:"#8f969e",ok:"#3cff3c",bad:"#ff5a4f",warn:"#ffb36b",accent:"#27ff4a",laser:"#ff8a80"};
const D=__DATA__;const F="ui-monospace,'DejaVu Sans Mono',monospace";
const el=(t,s,h)=>{const e=document.createElement(t);if(s)Object.assign(e.style,s);if(h!=null)e.innerHTML=h;return e;};
const esc=s=>String(s).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
const wrap=t=>{const w=el("div",{overflowX:"auto",maxWidth:"100%"});w.appendChild(t);return w;};
const td=(t,s)=>el("td",Object.assign({border:"1px solid "+C.line,padding:"5px 8px",verticalAlign:"top"},s||{}),t);
const table=(head,rows)=>{const t=el("table",{borderCollapse:"collapse",width:"100%",font:"12.5px/1.45 "+F,color:"#c4c9cf"});
  const h=el("tr");for(const k of head)h.appendChild(td(esc(k),{color:C.fg}));t.appendChild(h);
  for(const r of rows){const tr=el("tr");for(const c of r)tr.appendChild(typeof c==="object"&&c&&c.html!=null?td(c.html,c.style):td(esc(c)));t.appendChild(tr);}return wrap(t);};
const img=(src,alt)=>{const i=el("img",{display:"block",width:"100%",height:"auto",background:"#000",margin:"8px 0 4px"});i.src=src;i.alt=alt;return i;};
Object.assign(document.documentElement.style,{background:C.bg});
Object.assign(document.body.style,{margin:"0",background:C.bg,color:C.fg,font:"16px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif"});
const root=document.getElementById("root");Object.assign(root.style,{maxWidth:"1240px",margin:"0 auto",padding:"36px 16px 60px",boxSizing:"border-box"});
const h2=(n,t)=>root.appendChild(el("h2",{font:"600 18px/1.3 "+F,margin:"34px 0 10px"},"<span style='color:"+C.accent+";margin-right:10px'>"+n+"</span>"+t));
const p=(t,s)=>root.appendChild(el("p",Object.assign({color:C.sub,margin:"0 0 10px"},s||{}),t));
const note=(t)=>root.appendChild(el("div",{color:C.dim,font:"12px/1.5 "+F,margin:"4px 0 12px"},t));
const vk=v=>v.split(":")[0].split(" (")[0].split(" ")[0];const vcol={BLOCKED:C.bad,CHECK:C.warn,CLEAR:C.ok,UNKNOWN:C.dim};
const S=D.S,V=D.V2;
root.appendChild(el("h1",{font:"600 22px/1.25 "+F,margin:"0 0 14px"},"MOXIR beta v0.9 &middot; lasers v2, as you repainted them"));
const open=el("div",{background:"#1d1608",border:"1px solid "+C.warn,padding:"10px 14px",margin:"0 0 12px",color:C.warn,font:"14px/1.5 system-ui,sans-serif"});
open.innerHTML=V.open.map(o=>"<b>OPEN &middot; "+esc(o.what)+"</b> "+esc(o.why)+" <i>"+esc(o.status)+"</i>").join("<br>");root.appendChild(open);
h2("1","The answer");
const ans=el("div",{background:C.panel,border:"1px solid "+C.line,padding:"14px 16px",font:"15px/1.6 system-ui,sans-serif"});
ans.innerHTML=["<b>1.</b> Your 6 places kept: 3 in a row at the far end, 4 and 5 at the nave columns by the far crane, 6 in the middle of the nave. Every beam toward the stage ends on the <b>near crane's back girder</b>, right behind the DJ: steel that faces away from the crowd. "+S.pass+" of "+S.beams+" beams pass every ray of their zone.",
 "<b>2.</b> 1&ndash;3 hang on a <b>goal-post truss at z &minus;41.5</b> (your lean): two towers + a 12 m Prolyte H30V span, 20 kg on a span rated 290&ndash;450 kg. The far crane can stay. One move forced by safety: <b>cube 3 slides 2.5 m house left</b>, or its beams hit the far crane's cab.",
 "<b>3.</b> Power is not the limit, even 'far, far away': in the rig's haze a beam seen from the dance floor reads at "+S.options.map(o=>o.id+" "+Math.round(o.far_cd_m2)+" cd/m&sup2;").join(", ")+" (a dark club is ~0.01). What limits the far options is how much of the beam the floor can see past the truss and the cranes.",
 "<b>4.</b> Ash: ash-white and ember-red lines rising out of the dark far half toward the DJ, through the smoke."].join("<br>");
root.appendChild(ans);note("Pictures and numbers only: nothing is built. Laser numbers are planning, not a sign-off: a laser safety officer signs (IEC 60825-1, IEC TR 60825-3) before any emission.");
h2("2","From the dance floor (z 38)");root.appendChild(img(D.png.view,"audience view"));note(esc(D.pngName.view));
h2("3","From above, with your paint");root.appendChild(img(D.png.plan,"plan"));note(esc(D.pngName.plan));
h2("4","Along the nave: heights and the beam stops");root.appendChild(img(D.png.section,"section"));note(esc(D.pngName.section));
h2("5","Where 1&ndash;3 hang: the three options, measured");
root.appendChild(table(["option","1-3 beams passing","seen from the floor","luminance seen (median)","beam length","what it needs"],S.options.map(o=>[o.name+(o.id===V.chosen_far?"  (CHOSEN)":""),o.far_pass+" of "+o.far_beams,Math.round(100*o.far_seen_share)+" %",o.far_cd_m2+" cd/m²",o.far_length_m+" m",o.needs])));
p(V.options_far.filter(o=>o.moves).map(o=>"<b>Option "+o.id+":</b> "+esc(o.moves["3"].why)).slice(0,1).join(" "));
p("<b>Why b.</b> It does not depend on the venue rolling a crane (a needs that; no file says how far the cranes travel), it is what you lean to, and it is cheap on the truss (20 kg of 290&ndash;450 kg). a is a little brighter and keeps cube 3 on your loop: keep it as the plan if the venue rolls the far crane anyway. c works on power but the floor sees only about half of each beam, and the sources sit ~90 m from the dance floor.");
note(esc(V.options_far[1].hardware)+". Load: "+esc(V.options_far[1].load_check)+" Sources: "+esc(V.options_far[1].sources)+".");
if(S.with_the_crane_as_photographed){const bad=S.with_the_crane_as_photographed.filter(x=>!x.first_hit.startsWith("crane girder z 19.90")&&!x.first_hit.startsWith("runway"));root.appendChild(el("p",{color:C.warn,margin:"6px 0 10px"},"<b>Depends on the near crane being at z 21.</b> It is the beam stop. Every photo shows it parked at z 4.8; against the hall as photographed, "+bad.length+" of "+S.with_the_crane_as_photographed.length+" beams stop elsewhere ("+bad.slice(0,4).map(x=>x.beam+" on "+esc(x.first_hit)+" at "+x.at_m+" m, z "+x.end_z).join("; ")+"&hellip;). The beta already moves it to z 21 (the venue's OK and its operator): with it there, all pass."));
 const over=S.with_the_crane_as_photographed.filter(x=>x.end_z>21);if(over.length)root.appendChild(el("p",{color:C.bad,font:"600 14px/1.5 "+F,margin:"0 0 10px"},"HARD PRECONDITION: without the near crane at z 21, "+over.map(x=>x.beam).join(", ")+" would cross the whole dance floor to the entry end ("+over.map(x=>esc(x.first_hit)).join(", ")+"). No emission of any stage-ward beam until the crane is seen parked at z 21 and the stop checked: written for the laser safety officer, with the controller's zones as the second barrier."));}
h2("6","Every beam");
root.appendChild(table(["beam","colour","from","to (stop)","what it does","length","rays","lowest over a floor","mirror worst case","seen from floor","cd/m² seen","verdict"],D.beams.map(b=>[b.id,b.colour,"("+b.from.join(", ")+")","("+b.to.join(", ")+") "+b.stop,b.what,b.length_m+" m",b.rays,b.min_over_floor_m+" m",b.mirror_zmax==null?"":"back to z "+b.mirror_zmax+", "+b.mirror_lowest_m+" m up",Math.round(100*D.vis[b.id].seen_share)+" %",D.vis[b.id].cd_m2_seen_median,{html:esc((D.rows.find(r=>r.id==="v2-"+b.id)||{}).verdict||(b.pass?"pass":"FAIL")),style:{color:vcol[vk((D.rows.find(r=>r.id==="v2-"+b.id)||{}).verdict||"UNKNOWN")]}}])));
note("Each beam is one static point of its cube's scan, held by the controller to &plusmn;"+V.cubes[0].fan_deg[0]+"&deg; (5 x 5 rays tested). Rules per ray: its first hit is its stop; &ge; 3 m over every floor; never past z "+V.rules.behind_z+" (the truss plane); no other steel within 0.3 m; the mirror worst case off the stop stays behind z 21 and &ge; 3 m up. Mounts: "+V.cubes.filter(c=>c.mount).map(c=>c.n+": "+esc(c.mount)).join(" | "));
root.appendChild(table(["unit","colour","power","static-beam NOHD"],S.nohd.table.map(r=>[r.variant+(r.variant===S.variant?" (assumed)":" (if the label says so)"),r.colour,r.power_w+" W",r.nohd_m+" m"])));
note(esc(S.nohd.check)+". "+esc(S.nohd.basis)+".");
root.appendChild(el("p",{color:C.laser,font:"600 14px/1.5 "+F},"Every beam stops on steel; no beam reaches the dance floor. Planning, not a sign-off. "+esc(S.nohd.maker_warning||"")));
h2("7","Can the far beams be seen? (power vs haze)");
p("Method: single scattering of a collimated beam in haze. Radiance seen across the beam L = &sigma; &middot; p<sub>HG</sub>(&theta;) &middot; P(s) / (w(s) sin&theta;) &middot; e<sup>&minus;&sigma;d</sup> (Beer&ndash;Lambert; Henyey &amp; Greenstein 1941). It does not fall with the square of the eye's distance: a beam 80 m away is as bright as at 10 m, but for the haze's own transmission on the way. Haze: &sigma; = "+V.haze.sigma_per_m+" /m ("+esc(V.haze.source)+"); g = "+V.haze.g+" ("+esc(V.haze.g_basis)+"). Width w = 4 mm + 1 mrad &middot; s. Power per colour from the datasheet (fixtures.json): ash white = 455 + 525 + 638 nm, ember red = 638 nm alone; the haze is taken as the same at the three wavelengths. Unit taken: "+S.variant+" (not confirmed). If the cubes are the 6 W unit, every figure below scales by "+S.six_watt_ratio["ash white"]+" for ash white and "+S.six_watt_ratio["ember red"]+" for ember red: still far above a dark club.");
root.appendChild(table(["beam","eye distance m","angle to the beam","seen","cd/m²"],D.beams.filter(b=>b.cube<=3).flatMap(b=>D.vis[b.id].points.filter((x,i)=>i%2===0).map(x=>[b.id,x.eye_m,x.theta_deg+"°",x.seen?"yes":"hidden",x.cd_m2]))));
note("Looking back toward the cubes (beams coming toward the crowd) is forward scatter: the brightest view. A dark club background is about 0.01 cd/m&sup2; (ASSUMED): every seen point is far above it. What limits the far options is coverage: haze has to fill the far half too (the 2 hazers moved to z &minus;18 in the painted design; the far half needs its own, owed).");
h2("8","My advice on top of your placement");for(const a of V.advice)p("&middot; "+esc(a));
h2("9","Ash (moxir): the palette and the looks");p(esc(V.palette.key));
root.appendChild(table(["what","colour","why"],[["lasers","ash white / ember red",V.palette.lasers]].concat(Object.entries(V.palette.washes).map(([k,v])=>[k,v,""])).concat([["washes","",V.palette.washes_why]])));
note(esc(V.colour_note));
root.appendChild(table(["look","layers","how it serves ash"],V.looks.map(l=>[l.title,l.layers.join(" + ")+" ("+l.layers.length+")",l.ash])));
h2("10","The audit of every beam (model, point cloud, photos)");
root.appendChild(table(["beam","path m","cloud near path / clutter","best photo","verdict"],D.rows.map(r=>[r.id.replace("v2-",""),r.path_m,r.cloud?(r.cloud.cloud_points_within_2m_of_path+" / "+r.cloud.clutter):"",r.photo.photo?(r.photo.photo+" "+Math.round(100*r.photo.seen)+" %"):"none",{html:esc(r.verdict),style:{color:vcol[vk(r.verdict)]}}])));
h2("11","Shots for today");
root.appendChild(table(["#","for","stand (x, y, z)","yaw / pitch","look for"],D.shots.map((s,i)=>["V"+(i+1),s.for,"("+s.stand_m.join(", ")+")",s.point_yaw_deg+"° / "+s.point_pitch_deg+"°",s.look_for])));
note("Also in the local copy of the survey page (occlusion/moxir-survey.html), with the entrance question at the top.");
root.appendChild(el("div",{color:C.dim,font:"12px/1.55 "+F,marginTop:"26px",borderTop:"1px solid "+C.line,paddingTop:"12px"},"Generated by scripts/place/lasers_v2.py (PR #823) from rigs/moxir-lasers-v2-2026-10-08.json on top of the painted design; his painted file read by paint_zones.py."));
</script></body></html>
"""


def main():
    opts = V2['options_far']
    runs = {o['id']: run_option(o) for o in opts}
    osum = [option_summary(o, runs[o['id']][2], runs[o['id']][3]) for o in opts]
    ob, bs, res, vis = runs[V2['chosen_far']]
    S = {'beams': len(res), 'pass': sum(r['pass'] for r in res), 'options': osum, 'nohd': nohd(),
         'mirror_zmax': max(r['mirror_zmax'] for r in res if r['mirror_zmax'] is not None),
         'mirror_lowest_m': min(r['mirror_lowest_m'] for r in res if r['mirror_lowest_m'] is not None),
         'min_over_floor_m': min(r['min_over_floor_m'] for r in res), 'max_z': max(max(x['end'][2] for x in r['_rays']) for r in res),
         'moved': {o['id']: o.get('moves') for o in opts}}
    S['with_the_crane_as_photographed'] = crane_as_photographed(bs)
    S['variant'] = VARIANT
    S['six_watt_ratio'] = {c: round(colour_power(c, '6W')[1] / colour_power(c, '10W')[1], 2) for c in ('ash white', 'ember red')}
    pub = lambda r: {k: v for k, v in r.items() if not k.startswith('_')}
    if A2.check or not A2.out:
        print(json.dumps({'summary': S, 'beams': [pub(r) for r in res], 'vis': {k: {kk: vv for kk, vv in v.items() if kk != 'points'} for k, v in vis.items()}}, indent=1))
        return
    od = os.path.expanduser(A2.out)
    os.makedirs(od, exist_ok=True)
    pts = cam_of = cam_c = None
    cams = []
    if not A2.no_photos:
        pts, cam_of = D.load_cloud(os.path.join(od, 'cache', 'vggt-cloud-hall.npz'))
        cam_c = D.cloud_cam_centres()
        cams = D.photo_cams()
    keep = OC.OB
    OC.OB = ob
    try:
        rows = audit_beams(bs, res, pts, cam_of, cam_c, cams)
    finally:
        OC.OB = keep
    pfx = as_fixtures(bs, res)
    shots = D.shot_list(rows, pfx)[:-3]           # the 3 standing shots are already in the design's list
    shots.append({'for': 'anything hanging at 7-9 m across the nave (pendant work lamps, cables, the near crane where it is)', 'fixtures': ['every v2 beam toward the stage'],
                  'stand_m': [0.0, 1.6, 12.0], 'point_yaw_deg': 0, 'point_pitch_deg': 15, 'aim_at_m': [0.0, 8.0, -20.0], 'covers_x_m': [-10, 10], 'covers_z_m': [-41, 20],
                  'look_for': 'the v2 beams run at 6.5-8.4 m down the whole nave. The point cloud shows a layer at 7.5-8.7 m over z 2-48 that the model lacks (2-6 photos agree), and photo 953 shows pendant lamps. Photograph the nave from the floor, level and 15 deg up, both ways; note the lowest point of every lamp, cable and hook, and where the near crane is parked',
                  'how': 'from z +12 toward the far gate, then from z -20 toward the stage; a laser-meter reading to the lowest lamp'})
    shots.append({'for': 'the LaserCubes themselves: 10 W or 6 W?', 'fixtures': ['all 6 cubes'], 'stand_m': [0.0, 1.6, 0.0], 'point_yaw_deg': 0, 'point_pitch_deg': -60,
                  'aim_at_m': [0.0, 0.5, -1.0], 'covers_x_m': [0, 0], 'covers_z_m': [0, 0],
                  'look_for': 'the label on the back of each cube (model, output power, class): the plan takes 10 W (455 nm 5000 / 525 nm 2800 / 638 nm 2800 mW); a 6 W unit (2700 / 1500 / 1800 mW) changes the NOHD and the brightness',
                  'how': 'one sharp photo of each label, wherever the cubes are'})
    zp = os.path.join(od, 'paint-zones-lasers-v2.json')
    zones = json.load(open(zp)) if os.path.exists(zp) else None
    P = lambda n: os.path.join(od, 'lasers-v2-%s.png' % n)
    pngs = {'plan': fig_plan(bs, res, zones, P('plan'), opts), 'section': fig_section(pfx, P('section'))}
    fx = recolour([f for f in D.FX if f['kind'] != 'laser']) + pfx
    lit = {f['id'] for f in fx if f['kind'] == 'laser' or f['groupName'] in ('the halo PARs (floor, behind the riser)', 'the spine (floor, behind the truss)',
                                                                           'wash: the far end wall (BSW250)', 'wash: the side spans\' far ends (BSW250)')}
    D.OB = ob
    try:
        pngs['view'] = D.render_view(fx, lit, P('view'), 'Sparks through the smoke: lasers v2 from the dance floor (laser + A + hall)',
                                     'eye 1.6 m at z 38, the centre of the dance floor; the halo glow, the spine and the ember-red far walls lit with the 12 beams; the hall model\'s triangles, no WebGL',
                                     [0.0, 1.6, 38.0], [0.0, 6.5, -20.0])
    finally:
        D.OB = OC.OB
    beams_pub = [pub(r) for r in res]
    data = {'S': S, 'V2': {k: V2[k] for k in ('open', 'options_far', 'chosen_far', 'cubes', 'colours', 'colour_note', 'haze', 'advice', 'palette', 'looks', 'rules', 'maker_warning')},
            'beams': beams_pub, 'vis': vis, 'rows': rows, 'shots': shots}
    import base64
    data['png'] = {k: 'data:image/png;base64,' + base64.b64encode(open(v, 'rb').read()).decode() for k, v in pngs.items()}
    data['pngName'] = {k: os.path.basename(v) for k, v in pngs.items()}
    html = PAGE.replace('__DATA__', json.dumps(data, default=lambda v: v.tolist() if hasattr(v, 'tolist') else str(v)))
    open(os.path.join(od, 'lasers-v2.html'), 'w').write(html)
    with open(os.path.join(od, 'lasers-v2.json'), 'w') as fh:
        json.dump({'summary': S, 'beams': beams_pub, 'vis': vis, 'audit': rows, 'shots': shots}, fh, indent=1, default=lambda v: v.tolist() if hasattr(v, 'tolist') else str(v))
    with open(os.path.join(od, 'lasers-v2-shot-list.json'), 'w') as fh:
        json.dump(shots, fh, indent=1)
    for v in list(pngs.values()) + [os.path.join(od, 'lasers-v2.html')]:
        print('wrote', v)


if __name__ == '__main__':
    main()
