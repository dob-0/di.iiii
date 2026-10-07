#!/usr/bin/env python3
# design_paint.py — MOXIR beta v0.9 from the owner's painted plan (2026-10-08): the lasers behind the stage, the
# building washed, and a FULL blocking audit against every piece of evidence we hold. Pictures only; nothing is built.
#
#   python3 -I scripts/place/design_paint.py --repo . --out ~/Downloads/moxir/stage/occlusion   # pictures, page, audit
#   python3 -I scripts/place/design_paint.py --repo . --check                                   # the numbers, JSON (no photos)
#
# INPUTS
#   rigs/moxir-design-paint-2026-10-08.json   the design: what stays from the mix, the 6 lasers, the washes, the looks
#   rigs/moxir-lights-beta-mix-2026-10-08-blocking.json   the mix after the blocking pass (the kept groups come from it)
#   the hall GLB + the rig's solids (occlusion_lib.py), the VGGT point cloud and its alignment to the hall, the photos'
#   fitted cameras (vggt-2026-10-07c/align/init_cams.json), the analysis docs (their findings are rules below)
#
# THE AUDIT, per fixture (method; every source named)
#   (1) the model: occlusion.py's tracer (hall GLB triangles + rig boxes), axis + ring at half the beam angle.
#   (2) the point cloud: VGGT (Wang et al., CVPR 2025) depth maps of 56 photos and frames, back-projected and moved into
#       the hall by the committed Umeyama + RANSAC alignment (scale, Q, T; 0.73 m rms on 15 784 floor inliers). A cloud
#       point inside a beam's cone, between the lens (+0.5 m) and the model's first surface (-0.7 m), and more than 0.7 m
#       from every model triangle, is CLUTTER THE MODEL LACKS. Limits: only what the photos saw has points; the depth is
#       VGGT's (no metric ground truth beyond the alignment), +-0.7 m; points thin out with distance from the cameras.
#   (3) the photos: every beam's path (lens to its first surface) and every fixture are projected with each photo's
#       fitted camera (pinhole, no lens distortion: the fisheye 959 and the ultra-wide 024 are approximate). A photo
#       SEES a stretch of the path when the stretch is in frame, in front of the camera and not hidden behind a model
#       surface. The best photo per fixture goes on a contact sheet, the beam drawn on it, for a person to look.
#   (4) the docs: PHOTO_ANALYSIS_2026-10-07.md, MODEL_VS_REAL_2026-10-07.md (di.iiii-moxir-survey), AERIAL_2026-10-07.md:
#       the suspected open roof bands (rules in the design record), the solar panels on the lanterns, the clutter the
#       photos found that the model does not hold (named below, with where).
#   Verdict per fixture: BLOCKED (the model, or the cloud's clutter) / CLEAR (model and cloud clear, and a photo sees
#   >= 50 % of the path) / UNKNOWN (no photo sees half of the path: a shot to take on 2026-10-08).
import argparse, json, math, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.dont_write_bytecode = True
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('--repo', default='.')
ap.add_argument('--design', default='scripts/place/rigs/moxir-design-paint-2026-10-08.json')
ap.add_argument('--vggt', default='/mnt/data/footage/place-moxir-photo-analysis-2026-10-07/vggt-2026-10-07c')
ap.add_argument('--paint', default='~/Downloads/moxir/stage/occlusion/paint-zones-full-place.json')
ap.add_argument('--out', default=None)
ap.add_argument('--check', action='store_true')
ap.add_argument('--no-photos', action='store_true')
A = ap.parse_known_args()[0]

import occlusion as OC     # noqa: E402  (the obstacle model, the tracer, MX = lights_beta_mix, L = lights_beta_options)
O, L, MX, OB, G = OC.O, OC.L, OC.MX, OC.OB, OC.G
REC = json.load(open(os.path.join(A.repo, A.design)))
WT = REC['wash_types']
EYE_FLOOR = np.array([0.0, 1.6, 38.0])
COLD = '#dfe8ff'
for w in REC['washes']:
    if w.get('intent') == 'own column':
        OC.INTENT[w['name']] = 'own column'


# ------------------------------------------------------------------ the fixtures
def wash_dir(w, p, i):
    a = w['aim']
    r = a['rule']
    if r == 'up':
        return np.array([0.0, 1.0, 0.0])
    if r in ('lean_x', 'lean_x_signed'):          # lean away from the nave axis
        t = math.radians(a['deg'])
        s = 1.0 if p[0] > 0 else -1.0
        return L.unit([s * math.sin(t), math.cos(t), 0.0])
    if r == 'column_face':
        return L.unit(np.array([a['x_face'], a['y'], p[2]]) - p)
    if r == 'targets':
        return L.unit(np.array(a['targets'][i], float) - p)
    raise SystemExit('unknown wash aim %s' % r)


def build():
    plot, base = OC.load_plot(REC['base_plot'])
    by = {f['id']: f for f in base}
    keep = set(REC['keep_groups'])
    fx = [dict(f, layer=f['layer']) for f in base if f['groupName'] in keep]
    placed = {f['id'] for f in fx}
    moves = {fid: p for m in REC['moves'] if 'positions' in m for fid, p in zip(m['ids'], m['positions'])}
    for m in REC['moves']:
        for fid in m['ids']:
            f = dict(by[fid])
            if fid in moves:
                f['p'] = np.array(moves[fid], float)
            f['groupName'], f['layer'], f['why'] = 'hazers', 'air', m.get('why', f.get('why', ''))
            fx.append(f)
            placed.add(fid)
    for c in REC['lasers']['cubes']:
        p = np.array(c['p'], float)
        d = L.unit(np.array(c['target'], float) - p)
        f = dict(by[c['id']], p=p, d=d, r=L.rot_for_dir(d), fan=tuple(c['fan_deg']), groupName=c['group'], layer='laser',
                 why=c['mount'], mount=c['mount'], name=c['name'], colour='#3cff3c', spare=False,
                 aim={'rule': 'laser', 'target': [c['target']]}, aim_i=0)
        fx.append(f)
        placed.add(c['id'])
    for w in REC['washes']:
        t = WT[w['type']]
        for i, fid in enumerate(w['ids']):
            p = np.array(w['positions'][i], float)
            d = wash_dir(w, p, i)
            base_f = by.get(fid, {})
            aim = {'rule': 'targets', 'targets': w['aim']['targets']} if w['aim']['rule'] == 'targets' else \
                ({'rule': 'targets', 'targets': [[w['aim']['x_face'], w['aim']['y'], q[2]] for q in w['positions']]} if w['aim']['rule'] == 'column_face' else {'rule': 'up'})
            f = {'id': fid, 'type': w['type'], 'kind': t['kind'], 'p': p, 'p0': base_f.get('p0', p), 'd': d, 'd0': base_f.get('d0'),
                 'r': L.rot_for_dir(d), 'colour': COLD, 'groupName': w['name'], 'layer': w['layer'], 'why': w['why'], 'spare': False,
                 'beam_deg': float(w.get('beam_deg', t['beam_deg_default'])), 'reach': float(t['reach_m']), 'aim': aim, 'aim_i': i,
                 'new': fid.startswith('new-')}
            fx.append(f)
            placed.add(fid)
    missing = [f['id'] for f in base if f['id'] not in placed]
    if missing:
        raise SystemExit('the design leaves out %s' % ', '.join(missing))
    ids = [f['id'] for f in fx]
    if len(ids) != len(set(ids)):
        raise SystemExit('a fixture is placed twice')
    for f in fx:
        f['spare'] = bool(f.get('spare'))
    return fx


FX = build()


def counts(fx):
    c = {}
    for f in fx:
        c[f['type']] = c.get(f['type'], 0) + 1
    return c


# ------------------------------------------------------------------ (1) the model: blocking, lasers, glare
def in_band(q):
    return [b['why'].split(':')[0] for b in REC['rules']['suspected_open_roof'] if b['x_m'][0] <= q[0] <= b['x_m'][1] and b['z_m'][0] <= q[2] <= b['z_m'][1]]


def check_laser(f):
    r = OC.analyse_laser(f)
    behind = REC['rules']['lasers_behind']
    extra = []
    for ray in r['_rays']:
        zmax = max(f['p'][2], ray['end'][2])
        if zmax > behind:
            ray['errors'].append('reaches z %.1f, past the truss plane (over the crowd side)' % zmax)
        if ray['cls'] == 'roof deck' and in_band(ray['end']):
            ray['errors'].append('ends on the deck in a SUSPECTED open band (%s)' % in_band(ray['end'])[0])
        extra += ray['errors']
    r['pass'] = all(not ray['errors'] for ray in r['_rays'])
    r['zmax'] = round(max(max(f['p'][2], ray['end'][2]) for ray in r['_rays']), 2)
    r['name'], r['mount'] = f.get('name'), f.get('mount')
    r['seen_from_floor'] = seen_from_floor(f, r)
    return r


def seen_from_floor(f, r, n=12):
    """Share of the field's length a standing eye at the centre of the dance floor (z 38) has a clear line to."""
    ok = tot = 0
    for ray in r['_rays'][::4]:
        d = np.array(ray['dir'])
        for s in np.linspace(0.5, ray['t'] - 0.3, n):
            q = f['p'] + d * s
            v = q - EYE_FLOOR
            Ld = float(np.linalg.norm(v))
            h = OB.cast(EYE_FLOOR, v / Ld, 0.3, Ld - 0.3)
            ok += h[0] is None
            tot += 1
    return round(ok / max(tot, 1), 2)


def intensity(f):
    k = f['kind']
    if k == 'par':
        return L.INTENSITY_CD['par']
    if k == 'beam':
        return L.INTENSITY_CD['beam']
    t = WT[f['type']]
    if f['type'] == 'up-hk1915':
        return t['intensity_cd_at_4deg'] * (4.0 / f['beam_deg']) ** 2       # the same flux spread over the zoomed cone
    return t['intensity_cd_at_13deg'] * (13.0 / f['beam_deg']) ** 2


def glare(f):
    """Audience eyes (x +-5.35, z 25.8-48, 1.6 m) in the lamp's field (the full beam angle) with a clear line of sight."""
    if f['d'] is None or f['kind'] not in ('par', 'beam', 'wash', 'spot'):
        return []
    half = OC.half_of(f)
    v = L.EYES - f['p'][None, :]
    dist = np.linalg.norm(v, axis=1)
    ang = np.degrees(np.arccos(np.clip((v @ f['d']) / dist, -1, 1)))
    out = []
    for i in np.where(ang <= 2 * half)[0]:
        dd = v[i] / dist[i]
        h = OB.cast(f['p'], dd, 0.35, dist[i] - 0.05)
        if h[0] is not None:
            continue
        cone = bool(ang[i] <= half)
        out.append({'eye': [round(float(c), 2) for c in L.EYES[i]], 'front_row': bool(L.EYES[i][2] <= 27.8), 'cone': cone,
                    'lux': round(float(intensity(f) / dist[i] ** 2 * (1.0 if cone else 0.5)), 1)})
    return out


def model_pass(fx):
    beams, lasers, gl = [], [], {}
    for f in fx:
        if f['spare'] or f['d'] is None:
            continue
        if f['kind'] == 'laser':
            lasers.append(check_laser(f))
            continue
        if f['kind'] not in ('par', 'beam', 'wash', 'spot'):
            continue
        b = OC.analyse_beam(f)
        b['new'] = bool(f.get('new'))
        b['type'] = f['type']
        beams.append(b)
        g = glare(f)
        if g:
            gl[f['id']] = {'eyes_in_field': len(g), 'eyes_in_cone': sum(e['cone'] for e in g), 'front_row': sum(e['front_row'] for e in g),
                           'max_lux': max(e['lux'] for e in g), 'front_row_max_lux': max([e['lux'] for e in g if e['front_row']], default=0.0)}
    return beams, lasers, gl


# ------------------------------------------------------------------ the far trio: the options, measured
def far_options():
    out = []
    trio = [c for c in REC['lasers']['cubes'] if 'far' in c['name']]
    for tag, dz in (('A: far crane as parked, z -22.2', 0.0), ('B/C: crane moved to z -33, or a truss there', -10.8)):
        rows = []
        for c in trio:
            p = np.array(c['p'], float) + [0, 0, dz]
            # the whole trio slides with the crane; the backward cube keeps its end on the far deck (z -50)
            T = np.array(c['target'], float) + ([0, 0, 0] if 'backward' in c['name'] else [0, 0, dz])
            f = {'id': c['id'], 'p': p, 'd': L.unit(T - p), 'fan': tuple(c['fan_deg']), 'kind': 'laser', 'groupName': tag}
            r = check_laser(f)
            rows.append({'cube': c['name'], 'at': [round(v, 2) for v in p], 'pass': r['pass'], 'seen_from_floor': r['seen_from_floor'],
                         'ends': r['ends'], 'errors': sorted({e for ray in r['_rays'] for e in ray['errors']})[:3]})
        out.append({'option': tag, 'cubes': rows, 'all_pass': all(x['pass'] for x in rows),
                    'mean_seen': round(float(np.mean([x['seen_from_floor'] for x in rows])), 2)})
    return out


# ------------------------------------------------------------------ the near crane where the photos show it
GLB_AS_PHOTOGRAPHED = '/mnt/data/footage/place-moxir-hall-v8-show-2026-10-07'


def crane_as_photographed(fx):
    """The lasers against the hall as PHOTOGRAPHED: the near crane parked at z 4.8 (hall v8-show), not at z 21 where
    beta v0.9 moves it. Says which cubes depend on that move."""
    if not os.path.exists(os.path.join(GLB_AS_PHOTOGRAPHED, 'hall.glb')):
        return None
    g = json.load(open(os.path.join(GLB_AS_PHOTOGRAPHED, 'hall.json')))['geometry']
    ob = O.Obstacles(os.path.join(GLB_AS_PHOTOGRAPHED, 'hall.glb'), g, L.rig_boxes(), L.TRUSS, L.crane_boxes())
    keep, OC.OB = OC.OB, ob
    try:
        out = []
        for f in fx:
            if f['kind'] == 'laser' and not f['spare']:
                r = OC.analyse_laser(f)
                out.append({'id': f['id'], 'name': f.get('name'), 'pass': r['pass'], 'errors': sorted({e for x in r['_rays'] for e in x['errors']})[:2]})
        return out
    finally:
        OC.OB = keep


# ------------------------------------------------------------------ (2) the point cloud
def cloud_cam_centres():
    d = np.load(os.path.join(A.vggt, 'predictions.npz'))
    al = json.load(open(os.path.join(A.vggt, 'align', 'init_cams.json')))
    s, Q, T = al['scale'], np.array(al['Q']), np.array(al['T'])
    E = d['extrinsic'].astype(float)
    return np.array([s * Q @ (-E[i, :, :3].T @ E[i, :, 3]) + T for i in range(len(E))])


def load_cloud(cache):
    if cache and os.path.exists(cache):
        z = np.load(cache)
        return z['pts'], z['cam']
    d = np.load(os.path.join(A.vggt, 'predictions.npz'))
    al = json.load(open(os.path.join(A.vggt, 'align', 'init_cams.json')))
    s, Q, T = al['scale'], np.array(al['Q']), np.array(al['T'])
    pts, cam = [], []
    for i in range(len(d['names'])):
        dep, conf = d['depth'][i].astype(float), d['depth_conf'][i].astype(float)
        if dep.ndim == 3:
            dep, conf = dep[..., 0], conf[..., 0] if conf.ndim == 3 else conf
        K, E = d['intrinsic'][i].astype(float), d['extrinsic'][i].astype(float)
        H, W = dep.shape
        vv, uu = np.mgrid[0:H:2, 0:W:2]
        dd, cc = dep[::2, ::2], conf[::2, ::2]
        keep = (dd > 0) & (cc >= np.percentile(cc, 50))       # the better half of each map by VGGT's own confidence
        u, v, z = uu[keep], vv[keep], dd[keep]
        xc = np.stack([(u - K[0, 2]) / K[0, 0] * z, (v - K[1, 2]) / K[1, 1] * z, z], 1)
        R, t = E[:, :3], E[:, 3]
        xw = (xc - t) @ R                                         # R^T (x - t)
        pts.append(s * xw @ Q.T + T)
        cam.append(np.full(len(xw), i, np.int16))
    pts, cam = np.concatenate(pts).astype(np.float32), np.concatenate(cam)
    if cache:
        os.makedirs(os.path.dirname(cache), exist_ok=True)
        np.savez_compressed(cache, pts=pts, cam=cam)
    return pts, cam


def closest_on_tris(q, V0, E1, E2):
    """Distance from a point to each triangle (Ericson, Real-Time Collision Detection, 5.1.5), vectorised."""
    a, b, c = V0, V0 + E1, V0 + E2
    ab, ac, ap_ = E1, E2, q - a
    d1, d2 = np.einsum('ij,ij->i', ab, ap_), np.einsum('ij,ij->i', ac, ap_)
    bp = q - b
    d3, d4 = np.einsum('ij,ij->i', ab, bp), np.einsum('ij,ij->i', ac, bp)
    cp = q - c
    d5, d6 = np.einsum('ij,ij->i', ab, cp), np.einsum('ij,ij->i', ac, cp)
    va, vb, vc = d3 * d6 - d5 * d4, d5 * d2 - d1 * d6, d1 * d4 - d3 * d2
    res = np.empty_like(a)
    den = va + vb + vc
    den = np.where(np.abs(den) < 1e-12, 1e-12, den)
    v_, w_ = vb / den, vc / den
    res[:] = a + ab * v_[:, None] + ac * w_[:, None]
    m = (d1 <= 0) & (d2 <= 0); res[m] = a[m]
    m = (d3 >= 0) & (d4 <= d3); res[m] = b[m]
    m = (d6 >= 0) & (d5 <= d6); res[m] = c[m]
    m = (vc <= 0) & (d1 >= 0) & (d3 <= 0) & ~((d1 <= 0) & (d2 <= 0)) & ~((d3 >= 0) & (d4 <= d3))
    t_ = d1 / np.where(np.abs(d1 - d3) < 1e-12, 1e-12, d1 - d3); res[m] = (a + ab * t_[:, None])[m]
    m = (vb <= 0) & (d2 >= 0) & (d6 <= 0) & ~((d1 <= 0) & (d2 <= 0)) & ~((d6 >= 0) & (d5 <= d6))
    t_ = d2 / np.where(np.abs(d2 - d6) < 1e-12, 1e-12, d2 - d6); res[m] = (a + ac * t_[:, None])[m]
    m = (va <= 0) & ((d4 - d3) >= 0) & ((d5 - d6) >= 0) & ~((d3 >= 0) & (d4 <= d3)) & ~((d6 >= 0) & (d5 <= d6))
    t_ = (d4 - d3) / np.where(np.abs((d4 - d3) + (d5 - d6)) < 1e-12, 1e-12, (d4 - d3) + (d5 - d6)); res[m] = (b + (c - b) * t_[:, None])[m]
    return np.linalg.norm(q - res, axis=1)


def model_distance(q):
    near = np.nonzero(np.linalg.norm(OB.C - q, axis=1) <= OB.R + 0.75)[0]
    dm = float(closest_on_tris(q, OB.V0[near], OB.E1[near], OB.E2[near]).min()) if len(near) else 9.0
    for b, _, _ in OB.boxes:
        dm = min(dm, b.dist(q))
    return dm


CLOUD_NEAR_CAM_M = 25.0     # VGGT depth error grows with distance; points seen from farther are not used as evidence
CLOUD_OFF_MODEL_M = 1.5     # 2 x the alignment's 0.73 m rms: closer to a model surface is that surface
CLOUD_MIN_PTS, CLOUD_MIN_VIEWS = 15, 2


def cloud_pass(f, t_end, pts, cam_of=None, cam_c=None):
    """Cloud points inside the beam's cone (+0.35 m), between the lens + 0.5 m and the model's surface - 0.7 m,
    farther than 0.7 m from every model surface: clutter the model lacks. Also the cloud's density along the path."""
    p, d = f['p'], f['d']
    half = math.radians(OC.half_of(f)) if f['kind'] != 'laser' else math.radians(max(f['fan']))
    v = pts - p
    s = v @ d
    rad = np.linalg.norm(v - s[:, None] * d[None, :], axis=1)
    near_path = (s > 0.5) & (s < t_end) & (rad < 2.0)
    inside = (s > 0.5) & (s < t_end - 0.7) & (rad <= s * math.tan(half) + 0.35)
    idx = np.nonzero(inside)[0]
    if len(idx) > 200:                                   # a sample of 200 is enough to say "something is there"
        idx = idx[np.argsort(s[idx])][:: max(1, len(idx) // 200)]
    if cam_of is not None:
        idx = idx[np.linalg.norm(pts[idx] - cam_c[cam_of[idx]], axis=1) <= CLOUD_NEAR_CAM_M]
    clutter = [i for i in idx if model_distance(pts[i].astype(float)) > CLOUD_OFF_MODEL_M]
    views = len(set(cam_of[clutter].tolist())) if (cam_of is not None and clutter) else 0
    out = {'cloud_points_within_2m_of_path': int(near_path.sum()), 'in_cone': int(inside.sum()), 'clutter': len(clutter), 'clutter_views': views}
    if clutter:
        cq = pts[clutter].astype(float)
        out['clutter_at'] = [round(float(x), 1) for x in np.median(cq, 0)]
        out['clutter_s_m'] = [round(float(np.min(s[clutter])), 1), round(float(np.max(s[clutter])), 1)]
    return out


# ------------------------------------------------------------------ (3) the photos
def photo_cams():
    al = json.load(open(os.path.join(A.vggt, 'align', 'init_cams.json')))
    views = [l.strip() for l in open(os.path.join(A.vggt, 'views.txt')) if l.strip()]
    paths = {os.path.basename(v): v for v in views}
    out = []
    for name, c in al['cams'].items():
        path = paths.get(name) or os.path.join(A.vggt, 'frames', name)
        if not os.path.exists(path):
            continue
        out.append({'name': name, 'path': path, 'K': np.array(c['K']), 'R': np.array(c['R']), 'C': np.array(c['C']), 'size': c['size'],
                    'approx': name.startswith(('959', '024'))})
    return out


def project(cam, X):
    x = (np.atleast_2d(X) - cam['C']) @ cam['R'].T
    z = x[:, 2]
    uv = (x @ cam['K'].T)
    uv = uv[:, :2] / np.where(np.abs(uv[:, 2:3]) < 1e-9, 1e-9, uv[:, 2:3])
    return uv, z


def path_points(f, t_end, n=24):
    return np.array([f['p'] + f['d'] * s for s in np.linspace(0.3, t_end, n)])


PHOTO_MAX_M = 35.0          # beyond this a 4032 px phone photo resolves ~1.5 cm/px at best and haze/dark hides clutter: not evidence


def photo_pass(f, t_end, cams, n=12):
    """The photo that sees the most of the path (share of n points along it that are in frame, in front of the camera
    and not behind a model surface). Line-of-sight casts are cone-culled per camera."""
    P = path_points(f, t_end, n)
    best = None
    for cam in cams:
        uv, z = project(cam, P)
        W, H = cam['size']
        inframe = (z > 0.5) & (uv[:, 0] >= 0) & (uv[:, 0] < W) & (uv[:, 1] >= 0) & (uv[:, 1] < H)
        if inframe.sum() < 2 or (best and inframe.sum() / len(P) <= best['seen']):
            continue
        if np.linalg.norm(P[inframe].mean(0) - cam['C']) > PHOTO_MAX_M:
            continue            # too far to show what is on the path
        Q = P[inframe]
        v = Q - cam['C']
        dist = np.linalg.norm(v, axis=1)
        axis = L.unit(v.mean(0))
        spread = float(np.max(np.arccos(np.clip((v / dist[:, None]) @ axis, -1, 1))))
        sub = OB.subset(cam['C'], axis, spread + 0.01, float(dist.max()))
        seen = sum(1 for q, Ld in zip(v, dist) if OB.cast(cam['C'], q / Ld, 0.3, Ld - 0.4, sub)[0] is None)
        frac = seen / len(P)
        if best is None or frac > best['seen']:
            best = {'photo': cam['name'], 'seen': round(frac, 2), 'distance_m': round(float(np.linalg.norm(P.mean(0) - cam['C'])), 1), 'approx': cam['approx']}
    return best or {'photo': None, 'seen': 0.0}


# ------------------------------------------------------------------ the audit, per fixture
DOC_FINDINGS = [
    {'what': 'solar panels on and inside the lantern frames (2024-08-22 capture)', 'where': 'the nave and right-span lanterns', 'status': 'SUSPECTED', 'rule': 'no laser ends in a lantern (already: glass); the HK1915 roof pools stay off the right-span lantern', 'src': 'AERIAL_2026-10-07.md'},
    {'what': 'a dark lattice band along the x +12 row and across the nave and right span at the joint', 'where': 'x 10-14, all z; z -3..3', 'status': 'SUSPECTED (deck stripped, or walkways)', 'rule': 'no laser ends on the deck inside it', 'src': 'AERIAL_2026-10-07.md'},
    {'what': 'box 39: a full-height vertical by the stair to the runway', 'where': 'right row, z about 32.1', 'status': 'SUSPECTED extra column / stair post', 'rule': 'none of this design\'s beams passes there (right-span washes stand at x 32-35, the arch beam at x 9.6 z 30 rises inward)', 'src': 'PHOTO_ANALYSIS §0.1(a)'},
    {'what': 'slender wall posts between the windows', 'where': 'outer walls x -36.4 / 60.4', 'status': 'SUSPECTED, not modelled', 'rule': 'the wall-column PAR uplights stand on the inner face of x +-36 columns: a post beside a column can take an edge of the cone', 'src': 'PHOTO_ANALYSIS §0.1(c)'},
    {'what': 'the prefab cabin and cabinets', 'where': 'house left, x -9..-12, z 31-36', 'status': 'CONFIRMED in 032 (removed in the show hall v8-show)', 'rule': 'the arch beam at (-9.6, 0.7, 30/36) stands beside it: removal must be confirmed on 10-08', 'src': 'PHOTO_ANALYSIS §0.2'},
    {'what': 'a long pipe stack lying on the floor', 'where': 'x 5-10, z 25-38', 'status': 'CONFIRMED by eye, position SUSPECTED', 'rule': 'the house-right arch beams at x 9.6 z 30 and 36 stand in it: clear it or move them 0.5 m', 'src': 'PHOTO_ANALYSIS §0.2'},
    {'what': 'five loose pressure vessels lying on the floor', 'where': 'x -6..0, z -2..8', 'status': 'CONFIRMED by eye, position SUSPECTED', 'rule': 'under the mid lasers\' crossing (>= 5 m above): no beam effect; trip hazard for the crew', 'src': 'PHOTO_ANALYSIS §0.3'},
    {'what': 'the near crane girder underside never measured (7.95 m is the far crane\'s)', 'where': 'z 21', 'status': 'ASSUMED', 'rule': 'the truss and the bridge-up PARs move 1:1 with it', 'src': 'MODEL_VS_REAL §0.2'},
    {'what': 'loose stock on the floor in the photos: bulk bags, scrap, pipes, cylinders', 'where': 'all over the nave, z 0-40 (contact sheets)', 'status': 'CONFIRMED in the photos', 'rule': 'every floor fixture and every low path assumes the show hall cleared as moxir-hall-show-cleared-2026-10-17.json lists it: the clear-out is a precondition, not a given', 'src': 'the contact sheets, PHOTO_ANALYSIS §0.2'},
    {'what': 'no file says how far the cranes can travel; the far half was never photographed for a second crane', 'where': 'z -54..-10', 'status': 'UNKNOWN', 'rule': 'the far trio hangs on the far crane as parked; the owner saw cranes at about z -33 and -18 (his yellow): count and place them on 10-08', 'src': 'MODEL_VS_REAL §0.4, the painted plan'},
]


def audit(fx, beams, lasers, pts, cams, cam_of=None, cam_c=None):
    rows = []
    byb = {b['id']: b for b in beams}
    byl = {l['id']: l for l in lasers}
    for f in fx:
        if f['spare'] or f['d'] is None or f['kind'] not in ('par', 'beam', 'wash', 'spot', 'laser'):
            continue
        if f['kind'] == 'laser':
            l = byl[f['id']]
            t_end = float(np.median([r['t'] for r in l['_rays']]))
            model = 'clear' if l['pass'] else 'BLOCKED: ' + '; '.join(sorted({e for r in l['_rays'] for e in r['errors']})[:2])
            blk = not l['pass']
        else:
            b = byb[f['id']]
            t_end = (b['axis_first_hit']['t'] or OC.reach_of(f))
            model = 'clear' if b['blocked_pct'] == 0 else 'BLOCKED %.0f %%: %s' % (b['blocked_pct'], b['blockers'][0]['what'])
            blk = b['blocked_pct'] > 0
        cl = cloud_pass(f, t_end, pts, cam_of, cam_c) if pts is not None else None
        ph = photo_pass(f, t_end, cams) if cams else {'photo': None, 'seen': 0.0}
        if blk:
            verdict = model
        elif cl and cl['clutter'] >= CLOUD_MIN_PTS and cl['clutter_views'] >= CLOUD_MIN_VIEWS:
            verdict = 'CHECK: %d cloud points (%d photos) in the cone that the model lacks, %s-%s m from the lens, about %s' % (cl['clutter'], cl['clutter_views'], cl['clutter_s_m'][0], cl['clutter_s_m'][1], cl['clutter_at'])
        elif ph['seen'] >= 0.5:
            verdict = 'CLEAR (model + cloud; photo %s sees %d %% of the path)' % (ph['photo'], round(100 * ph['seen']))
        else:
            verdict = 'UNKNOWN: no photo sees half of the path (best %s %d %%)' % (ph['photo'] or 'none', round(100 * ph['seen']))
        eye = REC.get('eye_review', {}).get(f['id'])
        if eye and not blk:
            verdict = '%s: by eye on the contact sheet, %s (the automatic verdict was: %s)' % (eye['verdict'], eye['note'], verdict)
        rows.append({'id': f['id'], 'group': f['groupName'], 'type': f['type'], 'at': [round(v, 2) for v in f['p']], 'path_m': round(t_end, 1),
                     'model': model, 'cloud': cl, 'photo': ph, 'verdict': verdict})
    return rows


# ------------------------------------------------------------------ the shot list
def yaw_pitch(frm, to):
    v = np.asarray(to, float) - np.asarray(frm, float)
    yaw = math.degrees(math.atan2(v[0], -v[2]))       # 0 = toward the far gate (-z), + toward house right (+x)
    pitch = math.degrees(math.atan2(v[1], math.hypot(v[0], v[2])))
    return round(yaw), round(pitch)


def shot_list(rows, fx):
    by = {f['id']: f for f in fx}
    groups = {}
    for r in rows:
        if not r['verdict'].startswith(('UNKNOWN', 'CHECK')):
            continue
        groups.setdefault(r['group'] + (' (check)' if r['verdict'].startswith('CHECK') else ''), []).append(r)
    shots = []
    for g, rs in groups.items():
        fs = [by[r['id']] for r in rs]
        mids = np.array([f['p'] + f['d'] * min(r['path_m'], 12) * 0.5 for f, r in zip(fs, rs)])
        c = mids.mean(0)
        lo, hi = mids.min(0), mids.max(0)
        stand = np.array([c[0] + (6.0 if c[0] < 0 else -6.0) * (abs(c[0]) > 14), 1.6, c[2] + 10.0])   # 10 m toward the entry, in the open
        if abs(c[0]) <= 14:
            stand[0] = c[0] * 0.5
        ez = G['end_wall_inner_y_m'] - 1.5                        # stay inside the hall
        stand[2] = float(np.clip(stand[2], -ez, ez))
        stand[0] = float(np.clip(stand[0], G['walls_x_m'][0] + 1.5, G['walls_x_m'][1] - 1.5))
        yaw, pitch = yaw_pitch(stand, c)
        kind = rs[0]['type']
        look = {'ext-lc-ultra-mk2': 'the whole path from the cube\'s mount to the roof: the crane girder or column it hangs on, anything hung under the roof, and the END: deck (corrugated, solid) or glass / panels / open sky',
                'up-hk1915': 'the floor where the unit stands (free? cables, scrap) and the roof above it: space frame + deck (solid) or glazing, panels, open sky',
                'up-250bsw': 'the floor spot, the wall it washes (windows, doors, posts), anything stacked against the wall',
                'up-pl5403': 'the column base (is there room for a PAR, 0.7 m off the face?) and the column face up to the roof: posts, pipes, boxes on it',
                'up-b380f': 'the floor spot and the beam path up to the roof'}.get(kind, 'the path')
        checks = [r for r in rs if r['verdict'].startswith('CHECK')]
        if checks:
            at = [r['cloud']['clutter_at'] for r in checks if r.get('cloud') and r['cloud'].get('clutter_at')]
            look = ('WHAT IS THERE: %s. ' % ('the cloud shows points the model lacks at about ' + '; '.join('(%g, %g, %g)' % tuple(a) for a in at[:3])
                    if at else checks[0]['verdict'].split(': ', 1)[-1][:220])) + 'then the whole beam path from the fixture to where it lands'
        shots.append({'for': g, 'fixtures': [SHORT(r['id']) for r in rs], 'stand_m': [round(float(v), 1) for v in stand],
                      'point_yaw_deg': yaw, 'point_pitch_deg': pitch, 'aim_at_m': [round(float(v), 1) for v in c],
                      'covers_x_m': [round(float(lo[0]), 1), round(float(hi[0]), 1)], 'covers_z_m': [round(float(lo[2]), 1), round(float(hi[2]), 1)],
                      'look_for': look,
                      'how': 'landscape, wide (no zoom), then one step left and one right (for depth); one photo straight UP from the same spot'})
    shots += [
        {'for': 'the far cranes (the owner\'s yellow)', 'fixtures': ['far crane trio'], 'stand_m': [0, 1.6, -10], 'point_yaw_deg': 0, 'point_pitch_deg': 12, 'aim_at_m': [0, 8, -40],
         'covers_x_m': [-12, 12], 'covers_z_m': [-54, -10], 'look_for': 'how many cranes in the far half and where each is parked (pace or tape from a column line); the girder underside height of each; the cab side; any hook or load hanging', 'how': 'one wide photo, then one per crane square to it; tape a column line to the bridge'},
        {'for': 'the suspected open roof bands (aerial)', 'fixtures': ['mid lasers, side laser, right-span washes'], 'stand_m': [12, 1.6, 0], 'point_yaw_deg': 0, 'point_pitch_deg': 90, 'aim_at_m': [12, 13.35, 0],
         'covers_x_m': [10, 14], 'covers_z_m': [-3, 3], 'look_for': 'sky through the roof along the x +12 row and across the joint? deck missing? walkways or cable trays?', 'how': 'straight up at x +12 z 0, then straight up at x 0 z 0 and x +24 z 0'},
        {'for': 'the lanterns (panels on them?)', 'fixtures': ['every laser, the right-span roof washes'], 'stand_m': [0, 1.6, -26], 'point_yaw_deg': 0, 'point_pitch_deg': 70, 'aim_at_m': [0, 15, -30],
         'covers_x_m': [-6, 6], 'covers_z_m': [-46.9, -6], 'look_for': 'is the lantern glass clear, painted, covered by panels from above, or open?', 'how': 'up into the nave lantern behind the stage, and the right span\'s at x 24'},
    ]
    return shots


SHORT = lambda i: i.replace('rig-', '').replace('beam380-', 'beam ').replace('par-', 'PAR ').replace('lasercube-cut-', 'cube ').replace('new-', '')


# ------------------------------------------------------------------ drawing (matplotlib, no WebGL)
BG, FG, DIM = '#07090c', '#e3e6ea', '#8f969e'
CLS_COL = {'floor': '#121518', 'roof deck': '#2a3038', 'space frame': '#3b4148', 'lantern glass': '#24384a', 'lantern frame': '#33404c',
           'wall glass': '#1f3140', 'end wall': '#262b31', 'side wall': '#22272d', 'column': '#3a3f45', 'column head': '#41464c',
           'upper column': '#3a3f45', 'runway': '#4a4e54', 'crane': '#b89400', 'machine': '#4d4339', 'steel': '#3f444a', 'block wall': '#30353b',
           'truss': '#e8ebee', 'rigging': '#8a929b', 'pa': '#16191d', 'booth': '#454b53', 'barrier': '#2c3138', 'stage': '#454b53', 'other': '#333333'}
LIGHT = L.unit([0.35, 0.8, 0.45])


def hall_items(cam, items, fade=1.0):
    """Every hall triangle, clipped at the near plane, shaded by its normal: (depth, polygon, colour)."""
    V = np.stack([OB.V0, OB.V0 + OB.E1, OB.V0 + OB.E2], 1)
    C = cam.cam(V.reshape(-1, 3)).reshape(-1, 3, 3)
    front = (C[:, :, 2] >= L.NEAR).all(1)
    some = (C[:, :, 2] >= L.NEAR).any(1) & ~front
    shade = 0.55 + 0.45 * np.abs(OB.N @ LIGHT)
    dist = np.linalg.norm(V.mean(1) - cam.E, axis=1)
    far_cls = {'floor', 'roof deck', 'end wall', 'side wall'}
    for i in np.nonzero(front | some)[0]:
        cls = OB.cls[i]
        if front[i]:
            poly = cam.scr(C[i])
        else:
            cc = L.clip_near(list(C[i]))
            if len(cc) < 3:
                continue
            poly = cam.scr(np.array(cc))
        if np.abs(poly).max() > 1e5:
            continue
        col = L.rgba(CLS_COL.get(cls, '#333333'), 1.0, shade[i] * fade)
        dep = (np.linalg.norm(V[i] - cam.E, axis=1).max() + 5.0) if cls in far_cls else dist[i]
        items.append((float(dep), poly, col, (0, 0, 0, 0), 0))
    for b, name, cls in OB.boxes:
        L.add_box(items, cam, b, CLS_COL.get(cls, '#555555'), None, 1.0, lw=0, maxlen=1.0)


def cone_items(items, cam, p, d, t1, half_deg, colour, a0, fall=30.0, ap0=0.1, step=0.8):
    half = math.radians(half_deg)
    ss = np.append(np.arange(0.0, t1, step), t1)
    for s0, s1 in zip(ss[:-1], ss[1:]):
        pts = []
        for s in (s0, s1):
            c = cam.cam(p + s * d)
            if c[2] < L.NEAR:
                break
            pts.append((cam.scr(c), max((ap0 + s * math.tan(half)) * cam.F / c[2], 0.6)))
        if len(pts) < 2:
            continue
        (sa, ra), (sb, rb) = pts
        v = sb - sa
        n = np.array([-v[1], v[0]]) / (np.hypot(*v) or 1)
        alpha = min(1.0, a0 * math.exp(-(s0 + s1) / 2 / fall))
        items.append((float(np.linalg.norm(p + (s0 + s1) / 2 * d - cam.E)), np.array([sa + n * ra, sb + n * rb, sb - n * rb, sa - n * ra]),
                      L.rgba(colour, alpha), (0, 0, 0, 0), 0))


def pool_items(items, cam, pts3, colour, alpha):
    c = cam.cam(np.array(pts3))
    if (c[:, 2] < L.NEAR).any():
        return
    items.append((float(np.linalg.norm(np.mean(pts3, 0) - cam.E)) - 0.3, cam.scr(c), L.rgba(colour, alpha), (0, 0, 0, 0), 0))


RES = {}       # id -> analysis (filled by main): beams' rays, lasers' rays


def fixture_items(items, cam, f, lit):
    k = f['kind']
    c = cam.cam(f['p'])
    if c[2] > L.NEAR:
        sp = cam.scr(c)
        r = max(0.12 * cam.F / c[2], 1.8)
        ang = np.linspace(0, 2 * np.pi, 10)
        items.append((float(np.linalg.norm(f['p'] - cam.E)) - 0.2, np.stack([sp[0] + r * np.cos(ang), sp[1] + r * np.sin(ang)], 1),
                      L.rgba(f['colour'] if lit else '#30353c', 0.95), (0, 0, 0, 0), 0))
    if not lit or f['d'] is None:
        return
    a = RES.get(f['id'])
    if k == 'laser':
        for k, ray in enumerate(a['_rays']):
            if k % 5 != 2:            # the field's middle row of rays (9 of 45): the web as it reads
                continue
            cone_items(items, cam, f['p'], np.array(ray['dir']), ray['t'], 0.06, '#3cff3c', 0.75, fall=200, ap0=0.006, step=2.0)
        return
    t = (a['axis_first_hit']['t'] or OC.reach_of(f)) if a else OC.reach_of(f)
    half = OC.half_of(f)
    if k in ('wash', 'spot') or (k == 'par' and f['groupName'].startswith('wash')):
        cone_items(items, cam, f['p'], f['d'], t, half, f['colour'], 0.07 if k == 'wash' else 0.1, fall=25)
        if a:
            rim = [r for r in a['_rays'][1:]][-24:]
            pool_items(items, cam, [r['blocked']['at'] if r['blocked'] else r['land'] for r in rim], f['colour'], 0.55 if k != 'par' else 0.7)
        return
    lay = {'par': (0.11, 11.0), 'beam': (0.6, 40.0)}.get(k, (0.1, 20))
    cone_items(items, cam, f['p'], f['d'], t, half, f['colour'], lay[0], fall=lay[1], ap0=0.1 if k == 'par' else 0.07, step=0.5 if k == 'par' else 1.0)


def render_view(fx, lit, path, title, sub, eye, look, vfov=66.0, W=1600, H=900):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.collections import PolyCollection
    cam = L.Camera(np.array(eye, float), np.array(look, float), vfov, W, H)
    items = []
    hall_items(cam, items, fade=0.42)       # the hall dark, as at night: what is lit reads
    for f in fx:
        if f['spare'] or f['kind'] not in ('par', 'beam', 'laser', 'wash', 'spot'):
            continue
        fixture_items(items, cam, f, f['id'] in lit)
    for b in L.CROWD:
        if b.p[2] < eye[2] - 1.0:
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
    fig.text(0.012, 1 - 0.28 / (H / 100 + 0.8), title, color=FG, fontsize=15, fontweight='bold', family='DejaVu Sans Mono', va='center')
    fig.text(0.012, 1 - 0.58 / (H / 100 + 0.8), sub, color=DIM, fontsize=9, family='DejaVu Sans Mono', va='center')
    fig.savefig(path, facecolor=BG)
    plt.close(fig)
    return path


def plan_hall(ax, xl=(-38, 62), zl=(57, -57), zones=None):
    from matplotlib.patches import Rectangle, Polygon
    ax.set_facecolor(BG)
    ax.set_xlim(*xl)
    ax.set_ylim(*zl)
    ax.set_aspect('equal')
    ax.tick_params(colors=DIM, labelsize=7)
    for sp in ax.spines.values():
        sp.set_color('#2a2e33')
    R_ = lambda x, z, c, a=1, fill=True, lw=0.8, ls='-', zo=1, hatch=None: ax.add_patch(Rectangle((x[0], z[0]), x[1] - x[0], z[1] - z[0], fc=c if fill else 'none', ec=c, alpha=a, lw=lw, ls=ls, zorder=zo, hatch=hatch))
    wx, ez = G['walls_x_m'], G['end_wall_inner_y_m']
    R_(wx, (-ez, ez), '#c8ccd2', 1, fill=False, lw=1.4, zo=2)
    if zones:
        zc = {'teal': '#1ec8a0', 'green': '#7cff3a', 'yellow': '#e8e030'}
        for z in zones['zones']:
            if z['colour'] in zc and len(z['hull_m']) >= 3:
                ax.add_patch(Polygon(z['hull_m'], closed=True, fc=zc[z['colour']], ec=zc[z['colour']], alpha=0.13, lw=0.6, zorder=0))
    for l in G['lanterns']:
        R_(l['x_m'], l['z_m'], '#3d5a73', 0.6, fill=False, lw=0.7, ls='--', zo=1, hatch='////')
    for b in REC['rules']['suspected_open_roof']:
        R_(b['x_m'], b['z_m'], '#ff8a3d', 0.35, fill=False, lw=0.6, ls=':', zo=1)
    hd = G['column_head']
    for rx in G['rows_x_m']:
        for z in G['column_grid_z_m']:
            R_((rx - 0.4, rx + 0.4), (z - 0.25, z + 0.25), '#59616b', zo=3)
        if rx > wx[0] + 1 and rx < wx[1] - 1:
            for gx in (rx - hd['girder_offset_m'], rx + hd['girder_offset_m']):
                ax.plot([gx, gx], [-ez, ez], color='#3a3f45', lw=0.5, zorder=1)
    for m in G['massing']:
        R_(m['x_m'], m['z_m'], '#5b5148', 0.6, zo=2)
    for c in G['cranes']:
        for dz in c['girders_dz_m']:
            R_((-G['crane_rail_x_m'], G['crane_rail_x_m']), (c['z_m'] + dz - c['girder_w_m'] / 2, c['z_m'] + dz + c['girder_w_m'] / 2), '#c9a200', 0.7, zo=3)
        ax.text(-11.5, c['z_m'] - 1.7, 'crane z %g' % c['z_m'], color='#c9a200', fontsize=6)
    ax.plot([L.TRUSS_A[0], L.TRUSS_B[0]], [21.0, 21.0], color=L.COL['truss'], lw=2.2, zorder=4)
    R_(L.RISER['x'], L.RISER['z'], L.COL['riser'], 1, zo=4)
    R_(L.AUD['x'], L.AUD['z'], '#2f6bff', 0.18, zo=1)
    ax.text(0, 37, 'dance\nfloor', color='#7f9cff', fontsize=7, ha='center', va='center', zorder=5)
    ax.text(0, ez + 1.6, 'ENTRY', color=DIM, fontsize=7, ha='center')
    ax.text(0, -ez - 1.0, 'far gate', color=DIM, fontsize=7, ha='center')
    for xs, lab in ((-24, 'left span'), (0, 'nave'), (24, 'right span'), (48, 'span 4')):
        ax.text(xs, -ez + 2.0, lab, color='#6b737c', fontsize=7, ha='center')


def plan_fixtures(ax, fx, lasers_only=False):
    from matplotlib.patches import Polygon
    mk = {'par': 'o', 'beam': 'D', 'laser': '^', 'wash': 's', 'spot': 'p', 'haze': 'h', 'smoke': 'h'}
    for f in fx:
        k = f['kind']
        if f['spare'] or (lasers_only and k != 'laser'):
            continue
        a = RES.get(f['id'])
        if k == 'laser' and a:
            for ray in a['_rays']:
                if abs(ray['dir'][1] - f['d'][1]) < 0.02:
                    ax.plot([f['p'][0], ray['end'][0]], [f['p'][2], ray['end'][2]], color='#3cff3c', lw=0.7, alpha=0.85, zorder=6)
                ax.plot(ray['end'][0], ray['end'][2], marker='.', ms=1.6, color='#3cff3c', zorder=6)
            ax.text(f['p'][0] + 0.6, f['p'][2] - 0.6, f.get('name', ''), color='#9dff9d', fontsize=6.2, zorder=8)
        elif a and k in ('wash', 'spot') or (a and f['groupName'].startswith('wash')):
            rim = a['_rays'][-24:]
            pts = [((r['blocked']['at'] if r['blocked'] else r['land'])[0], (r['blocked']['at'] if r['blocked'] else r['land'])[2]) for r in rim]
            import paint_zones as PZ
            pts = PZ.hull([(round(a, 2), round(b, 2)) for a, b in pts])
            ax.add_patch(Polygon(pts, closed=True, fc=f['colour'], ec='#9fb4d8', alpha=0.25, lw=0.4, zorder=5))
            ax.plot([f['p'][0], np.mean([q[0] for q in pts])], [f['p'][2], np.mean([q[1] for q in pts])], color='#9fb4d8', lw=0.5, alpha=0.6, zorder=5)
        elif a and k in ('par', 'beam') and f['d'] is not None:
            t = min(a['axis_first_hit']['t'] or 10, 14)
            q = f['p'] + f['d'] * t
            ax.plot([f['p'][0], q[0]], [f['p'][2], q[2]], color=f['colour'], lw=0.6, alpha=0.6, zorder=5)
        if k in mk:
            ax.plot(f['p'][0], f['p'][2], marker=mk[k], ms=3.4 if k != 'laser' else 5, mfc=f['colour'] if k not in ('haze', 'smoke') else '#7fb2ff',
                    mec='#000', mew=0.3, zorder=7)


def fig_plan(fx, zones, path):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig = plt.figure(figsize=(13.0, 14.6), dpi=100)
    fig.patch.set_facecolor(BG)
    ax = fig.add_axes([0.05, 0.04, 0.92, 0.88])
    plan_hall(ax, zones=zones)
    plan_fixtures(ax, fx)
    fig.text(0.05, 0.975, 'The design from his painted plan, from above: the whole building', color=FG, fontsize=14, fontweight='bold', family='DejaVu Sans Mono', va='top')
    fig.text(0.05, 0.952, 'his paint underneath (teal: wash, green: where lasers can be, yellow: crane bridges) · ^ laser + its field · pools: the washes where they land\n'
             'o PAR · <> beam · s HK1915 · p 250BSW · hatched: lantern glass · dotted orange: SUSPECTED open roof (aerial)', color=DIM, fontsize=7.6, family='DejaVu Sans Mono', va='top')
    fig.savefig(path, facecolor=BG)
    plt.close(fig)
    return path


def section_ax(ax, fx, lasers_only=False):
    from matplotlib.patches import Rectangle
    ax.set_facecolor(BG)
    ax.set_xlim(-56, 56)
    ax.set_ylim(-0.5, 17.5)
    ax.set_aspect('equal')
    ax.tick_params(colors=DIM, labelsize=7)
    for sp in ax.spines.values():
        sp.set_color('#2a2e33')
    R_ = lambda z, y, c, a=1, fill=True, zo=1, hatch=None, lw=0.8: ax.add_patch(Rectangle((z[0], y[0]), z[1] - z[0], y[1] - y[0], fc=c if fill else 'none', ec=c, alpha=a, zorder=zo, hatch=hatch, lw=lw))
    ez = G['end_wall_inner_y_m']
    ax.plot([-ez, ez], [0, 0], color='#3a4048', lw=1.2)
    R_((-ez, ez), (G['truss_bottom_m'], G['deck_m']), '#2b3036', 0.6)
    for l in G['lanterns'][:2]:
        R_(l['z_m'], (G['deck_m'], G['lantern_top_m']), '#3d5a73', 0.6, fill=False, hatch='////')
    for z in G['column_grid_z_m']:
        R_((z - 0.25, z + 0.25), (0, G['truss_bottom_m']), '#262b31', 1, zo=0)
    R_((-ez, ez), (G['runway_bottom_m'], G['runway_top_m']), '#30353b', 1, zo=0)
    for x in (-ez, ez):
        ax.plot([x, x], [0, G['deck_m']], color='#5a616b', lw=1.4)
    for c in G['cranes']:
        R_((c['z_m'] - 1.45, c['z_m'] + 1.45), (c['girder_bottom_m'], c['girder_top_m']), '#c9a200', 0.8, zo=3)
    for m in G['massing']:
        if -12 < (m['x_m'][0] + m['x_m'][1]) / 2 < 12:
            R_(m['z_m'], m['y_m'], '#5b5148', 0.5, zo=2)
    R_((20.855, 21.145), (3.2, 6.4), L.COL['truss'], 0.9, zo=4)
    R_(L.AUD['z'], (0, 1.75), '#0d1220', 1, zo=2)
    ax.plot([-ez, ez], [3, 3], color='#ff5a4f', lw=0.6, ls='--', alpha=0.6)
    ax.axvline(21.0, color='#ff8a80', lw=0.8, ls=':')
    ax.text(21.3, 16.6, 'truss plane z 21: no laser past it', color='#ff8a80', fontsize=7)
    for f in fx:
        k = f['kind']
        if f['spare'] or (lasers_only and k != 'laser') or abs(f['p'][0]) > 13 and k != 'laser':
            continue
        a = RES.get(f['id'])
        if k == 'laser' and a:
            for ray in a['_rays']:
                ax.plot([f['p'][2], ray['end'][2]], [f['p'][1], ray['end'][1]], color='#3cff3c', lw=0.5, alpha=0.6, zorder=6)
        elif a and f['d'] is not None and k in ('par', 'beam', 'wash', 'spot'):
            t = a['axis_first_hit']['t'] or OC.reach_of(f)
            q = f['p'] + f['d'] * t
            ax.plot([f['p'][2], q[2]], [f['p'][1], q[1]], color=f['colour'], lw=0.7, alpha=0.45, zorder=5)
        if k in ('par', 'beam', 'laser', 'wash', 'spot'):
            ax.plot(f['p'][2], f['p'][1], marker={'laser': '^', 'wash': 's', 'spot': 'p', 'beam': 'D'}.get(k, 'o'), ms=4, mfc=f['colour'], mec='#000', mew=0.3, zorder=7)
    ax.text(-55.5, 16.6, 'FAR GATE', color=DIM, fontsize=7)
    ax.text(55.5, 16.6, 'ENTRY', color=DIM, fontsize=7, ha='right')


def fig_section(fx, path, lasers_only=False, title=''):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig = plt.figure(figsize=(18.0, 4.6), dpi=100)
    fig.patch.set_facecolor(BG)
    ax = fig.add_axes([0.03, 0.1, 0.95, 0.75])
    section_ax(ax, fx, lasers_only)
    fig.text(0.03, 0.95, title, color=FG, fontsize=12, fontweight='bold', family='DejaVu Sans Mono', va='center')
    fig.savefig(path, facecolor=BG)
    plt.close(fig)
    return path


def fig_lasers(fx, path):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig = plt.figure(figsize=(18.0, 11.0), dpi=100)
    fig.patch.set_facecolor(BG)
    ax1 = fig.add_axes([0.03, 0.05, 0.36, 0.86])
    plan_hall(ax1, xl=(-16, 38), zl=(26, -56))
    plan_fixtures(ax1, fx, lasers_only=True)
    ax2 = fig.add_axes([0.42, 0.55, 0.56, 0.34])
    section_ax(ax2, fx, lasers_only=True)
    ax2.set_xlim(-56, 26)
    fig.text(0.03, 0.965, 'The 6 lasers, all behind the stage: every ray of every field (9 x 5) to where it ends', color=FG, fontsize=13, fontweight='bold', family='DejaVu Sans Mono')
    y = 0.47
    for l in RES['_lasers']:
        ab = lambda k: k.replace('space frame diagonals / top chord', 'frame diag').replace('space frame bottom chord', 'frame chord').replace('roof deck', 'deck')
        fig.text(0.42, y, '%-26s at (%s)  ends: %s  max z %.1f  floor sees %d %%  %s' % (
            l['name'], ', '.join('%g' % v for v in l['at']), ', '.join('%s %d' % (ab(k), v) for k, v in l['ends'].items()), l['zmax'], round(100 * l['seen_from_floor']),
            'PASS' if l['pass'] else 'FAIL'), color='#c4c9cf' if l['pass'] else '#ff5a4f', fontsize=7.6, family='DejaVu Sans Mono')
        y -= 0.033
    fig.text(0.42, y - 0.01, 'Static-beam NOHD %d m (LaserCube Ultra MK2 10 W, 4 mm, 1 mrad; IEC 60825-1:2014 Table A.1, MPE %.1f W/m2 at 0.25 s): no beam may reach an eye.' % (round(L.NOHD_M), L.MPE_E),
             color='#c4c9cf', fontsize=7.6, family='DejaVu Sans Mono')
    fig.text(0.42, y - 0.045, 'Planning, not a sign-off: a laser safety officer signs (IEC 60825-1, IEC TR 60825-3) before any emission; the crane clamps need the rigging sign-off.',
             color='#ff8a80', fontsize=7.6, family='DejaVu Sans Mono')
    fig.savefig(path, facecolor=BG)
    plt.close(fig)
    return path


# ------------------------------------------------------------------ contact sheets (the photos, the beams drawn on them)
VCOL = {'BLOCKED': (255, 70, 60), 'CHECK': (255, 170, 60), 'CLEAR': (60, 255, 90), 'UNKNOWN': (150, 155, 165)}


def verdict_key(v):
    return v.split(':')[0].split(' (')[0].split(' ')[0]


def contact_sheets(rows, fx, cams, out_dir, per=16, cols=4, tw=480, th=320):
    from PIL import Image, ImageDraw, ImageFont
    try:
        font = ImageFont.truetype('/usr/share/fonts/TTF/DejaVuSansMono.ttf', 13)
        fontb = ImageFont.truetype('/usr/share/fonts/TTF/DejaVuSansMono-Bold.ttf', 15)
    except OSError:
        font = fontb = ImageFont.load_default()
    by = {f['id']: f for f in fx}
    cm = {c['name']: c for c in cams}
    tiles = []
    cache = {}
    for r in rows:
        ph = r['photo']
        if not ph.get('photo'):
            continue
        cam, f = cm[ph['photo']], by[r['id']]
        if cam['path'] not in cache:
            im = Image.open(cam['path'])
            W0, H0 = im.size
            im.draft('RGB', (W0 // 4, H0 // 4))
            im = im.convert('RGB')
            cache.clear()
            cache[cam['path']] = (im, im.size[0] / cam['size'][0])
        im, k = cache[cam['path']]
        P = path_points(f, r['path_m'], 40)
        uv, z = project(cam, P)
        ok = z > 0.5
        if ok.sum() < 2:
            continue
        uv = uv[ok] * k
        W, H = im.size
        x0, y0 = np.clip(uv.min(0) - 120 * k * 4, 0, [W, H])
        x1, y1 = np.clip(uv.max(0) + 120 * k * 4, 0, [W, H])
        if x1 - x0 < 60 or y1 - y0 < 40:
            continue
        ar = tw / th
        cw, ch = x1 - x0, y1 - y0
        if cw / ch < ar:
            cx = (x0 + x1) / 2; cw = ch * ar; x0, x1 = max(0, cx - cw / 2), min(W, cx + cw / 2)
        else:
            cy = (y0 + y1) / 2; ch = cw / ar; y0, y1 = max(0, cy - ch / 2), min(H, cy + ch / 2)
        crop = im.crop((int(x0), int(y0), int(x1), int(y1))).resize((tw, th))
        d = ImageDraw.Draw(crop)
        sx, sy = tw / max(1, x1 - x0), th / max(1, y1 - y0)
        pts = [((u - x0) * sx, (v - y0) * sy) for u, v in uv]
        col = VCOL.get(verdict_key(r['verdict']), (200, 200, 200))
        d.line(pts, fill=(0, 0, 0), width=7)
        d.line(pts, fill=col, width=3)
        d.ellipse([pts[0][0] - 6, pts[0][1] - 6, pts[0][0] + 6, pts[0][1] + 6], outline=col, width=3)
        d.rectangle([0, th - 44, tw, th], fill=(0, 0, 0))
        d.text((6, th - 42), '%s  %s' % (SHORT(r['id']), verdict_key(r['verdict'])), fill=col, font=fontb)
        d.text((6, th - 22), 'photo %s, sees %d %% of the path%s' % (ph['photo'][:22], round(100 * ph['seen']), ' (approx. lens)' if ph.get('approx') else ''), fill=(220, 220, 225), font=font)
        tiles.append(crop)
    paths = []
    for s0 in range(0, len(tiles), per):
        chunk = tiles[s0:s0 + per]
        rws = (len(chunk) + cols - 1) // cols
        sheet = Image.new('RGB', (cols * tw + (cols + 1) * 6, rws * th + (rws + 1) * 6 + 40), (7, 9, 12))
        dd = ImageDraw.Draw(sheet)
        dd.text((8, 10), 'MOXIR design from the painted plan: every beam drawn on the photo that sees most of it (green clear, red blocked, orange check, grey unknown). Sheet %d' % (s0 // per + 1),
                fill=(227, 230, 234), font=fontb)
        for i, t in enumerate(chunk):
            sheet.paste(t, (6 + (i % cols) * (tw + 6), 46 + (i // cols) * (th + 6)))
        p = os.path.join(out_dir, 'audit-sheet-%d.jpg' % (s0 // per + 1))
        sheet.save(p, quality=84, optimize=True)            # photos: JPEG keeps the page under 16 MB
        paths.append(p)
    return paths


# ------------------------------------------------------------------ the looks
def looks(fx, gl):
    out = []
    for lk in REC['looks']:
        lit = {f['id'] for f in fx if not f['spare'] and any(f['groupName'].startswith(g) for g in lk['groups'])}
        out.append({'id': lk['id'], 'title': lk['title'], 'layers': lk['layers'], 'n_layers': len(lk['layers']), 'lit': len(lit),
                    'eyes_in_field': sum(gl[i]['eyes_in_field'] for i in lit if i in gl), '_lit': lit})
    return out


def summary(fx, beams, lasers, gl, lks, opts):
    return {'counts': counts(fx), 'inventory': REC['inventory'],
            'beams': len(beams), 'beams_blocked': [b['id'] for b in beams if b['blocked_pct'] > 0],
            'lasers': len(lasers), 'lasers_pass': sum(l['pass'] for l in lasers), 'laser_rays': sum(l['rays'] for l in lasers),
            'laser_rays_in_glass': sum(l['in_glass'] for l in lasers), 'laser_max_z': max(l['zmax'] for l in lasers),
            'laser_min_over_floor_m': min(l['min_over_floor_m'] for l in lasers),
            'laser_seen_from_floor': {l['id']: l['seen_from_floor'] for l in lasers},
            'eyes_in_any_field': sum(v['eyes_in_field'] for v in gl.values()), 'front_row_max_lux': max([v['front_row_max_lux'] for v in gl.values()], default=0.0),
            'looks': [{k: v for k, v in lk.items() if not k.startswith('_')} for lk in lks], 'far_options': opts,
            'nohd_m': round(L.NOHD_M), 'mpe_w_m2': round(L.MPE_E, 1)}


# ------------------------------------------------------------------ the page
def write_page(out, S, rows, shots, pngs, sheets):
    import base64
    b64 = lambda p: 'data:image/%s;base64,' % ('jpeg' if p.endswith('.jpg') else 'png') + base64.b64encode(open(p, 'rb').read()).decode()
    data = {'S': S, 'rows': rows, 'shots': shots, 'docs': DOC_FINDINGS, 'png': {k: b64(v) for k, v in pngs.items()}, 'pngName': {k: os.path.basename(v) for k, v in pngs.items()},
            'sheets': [b64(p) for p in sheets], 'sheetNames': [os.path.basename(p) for p in sheets], 'rec': {k: REC[k] for k in ('owner', 'lasers', 'washes', 'inventory', 'rules')}}
    html = PAGE.replace('__DATA__', json.dumps(data, default=lambda v: v.tolist() if hasattr(v, 'tolist') else str(v)))
    p = os.path.join(out, 'design-paint.html')
    open(p, 'w').write(html)
    return p


PAGE = r"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>MOXIR painted design</title></head><body><main id="root"></main>
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
const p=(t)=>root.appendChild(el("p",{color:C.sub,margin:"0 0 10px"},t));
const note=(t)=>root.appendChild(el("div",{color:C.dim,font:"12px/1.5 "+F,margin:"4px 0 12px"},t));
const S=D.S;const vk=v=>v.split(":")[0].split(" (")[0].split(" ")[0];
const vcol={BLOCKED:C.bad,CHECK:C.warn,CLEAR:C.ok,UNKNOWN:C.dim};
const cnt={};for(const r of D.rows){const k=vk(r.verdict);cnt[k]=(cnt[k]||0)+1;}
root.appendChild(el("h1",{font:"600 22px/1.25 "+F,margin:"0 0 14px"},"MOXIR beta v0.9 &middot; the design from your painted plan, and the full blocking audit"));
h2("1","The answer");
const ans=el("div",{background:C.panel,border:"1px solid "+C.line,padding:"14px 16px",font:"15px/1.6 system-ui,sans-serif"});
ans.innerHTML=["<b>1.</b> 6 lasers, all behind the stage, never over the crowd: 3 on the far crane where it is parked (z &minus;22), 2 on the nave columns at z &minus;6, 1 on the x +12 column at the joint, into the right span. "+S.lasers_pass+" of "+S.lasers+" pass every ray of their field ("+S.laser_rays+" rays): none in glass, none past the truss plane, lowest "+S.laser_min_over_floor_m+" m over any floor.",
 "<b>2.</b> The building washed, as you painted it: both side spans end to end, the far end wall, the nave columns behind the stage, beside the dance floor: 8 UP-HK1915 + 12 UP-250BSW from the rental order (not in the beta yet: confirm they are booked) and 15 of the beta's PARs, re-used.",
 "<b>3.</b> Kept: the silhouette, the truss wall, the arches. 0 eyes in any lamp's field (front row 0 lux). Every look &le; 3 layers.",
 "<b>4.</b> The audit: "+Object.entries(cnt).map(([k,v])=>v+" "+k).join(", ")+" of "+D.rows.length+" beams. UNKNOWN = no photo sees that path yet: the shot list (section 10) is for today's visit."].join("<br>");
root.appendChild(ans);note("Pictures only: nothing is built into any project. Laser numbers are planning, not a safety sign-off.");
h2("2","Your paint, read back");
p("The painted file, compared pixel by pixel with the clean plan you started from (your canvas was 13 px lower: registered back), colours named, your typed notes masked out. The outlines are the zones in hall metres; the design takes them as written below.");
root.appendChild(img(D.png.paint,"the painted plan, zones outlined"));note(esc(D.pngName.paint));
h2("3","From the dance floor");
for(const k of ["hallset","web","plot"]){if(D.png["view_"+k]){root.appendChild(img(D.png["view_"+k],k));note(esc(D.pngName["view_"+k]));}}
p("Drawn from the hall model's own 55 000 triangles (matplotlib, painter's sort, no WebGL): a picture of intent, not a render or a lux plot.");
h2("4","From above, the whole building");root.appendChild(img(D.png.plan,"plan"));note(esc(D.pngName.plan));
h2("5","Side section");root.appendChild(img(D.png.section,"section"));note(esc(D.pngName.section));
h2("6","The lasers");
root.appendChild(img(D.png.lasers,"lasers"));
root.appendChild(table(["cube","at","mount","rays end on","floor sees","verdict"],D.rec.lasers.cubes.map(c=>{const r=D.rows.find(x=>x.id===c.id)||{};const l=(S.laser_seen_from_floor||{})[c.id];return [c.name,"("+c.p.join(", ")+")",c.mount,"",l==null?"":Math.round(100*l)+" %",{html:esc(r.verdict||""),style:{color:vcol[vk(r.verdict||"UNKNOWN")]}}];})));
p("<b>The far three: the options, measured.</b> "+esc(D.rec.lasers.option_far));
root.appendChild(table(["option","all pass","mean share seen from the floor","per cube"],S.far_options.map(o=>[o.option,o.all_pass?"yes":"no",Math.round(100*o.mean_seen)+" %",o.cubes.map(c=>c.cube+": "+(c.pass?"pass":"FAIL ("+c.errors.join("; ")+")")+", seen "+Math.round(100*c.seen_from_floor)+" %").join(" | ")])));
if(S.lasers_with_the_crane_as_photographed){const bad=S.lasers_with_the_crane_as_photographed.filter(x=>!x.pass);root.appendChild(el("p",{color:bad.length?C.warn:C.sub,margin:"6px 0"},"<b>Depends on the near crane moving.</b> Every photo shows the near crane parked at z 4.8; beta v0.9 moves it to z 21. Against the hall as photographed (hall v8-show, crane at z 4.8): "+(bad.length?bad.map(x=>esc(x.name)+" FAILS ("+esc(x.errors.join("; "))+")").join("; ")+". So the mid pair needs the crane moved, as the beta has it (the venue's OK and its operator).":"all 6 still pass.")));}
note("Static-beam NOHD "+S.nohd_m+" m (LaserCube Ultra MK2 10 W, 4 mm, 1 mrad; IEC 60825-1:2014 Table A.1, MPE "+S.mpe_w_m2+" W/m&sup2; at 0.25 s): longer than the hall, so no beam may ever reach an eye. Rules held per ray: mounted &ge; 3 m, rising, &ge; 3 m over any floor, ends on roof structure (deck or space frame) and never glass, never on the deck inside the aerial's SUSPECTED open bands, &ge; 0.3 m from steel, and every point at z &le; "+D.rec.rules.lasers_behind+" (the truss plane).");
root.appendChild(el("p",{color:C.laser,font:"600 14px/1.5 "+F},"Planning, not a sign-off: a laser safety officer signs (IEC 60825-1, IEC TR 60825-3) before any emission. Cranes move on their runway only with the venue's OK; the clamps need the rigging sign-off."));
h2("7","The washes, counted");
root.appendChild(table(["group","type","n","zoom","why"],D.rec.washes.map(w=>[w.name,w.type.toUpperCase(),w.ids.length,(w.beam_deg||"")+(w.beam_deg?"°":""),w.why])));
const inv=D.rec.inventory;note("Fixtures in this design: "+Object.entries(S.counts).map(([k,v])=>k.toUpperCase()+" "+v).join(", ")+". The beta has "+Object.entries(inv.beta_v0_9).map(([k,v])=>k.toUpperCase()+" "+v).join(", ")+"; HK1915 and 250BSW come from the rental order ("+esc(inv.order_source)+"). "+esc(inv.not_used));
h2("8","Looks, layers, eyes");
root.appendChild(table(["look","layers","fixtures lit","eyes in a lamp's field"],S.looks.map(l=>[l.title,l.layers.join(" + ")+" ("+l.n_layers+")",l.lit,l.eyes_in_field])));
note("Eyes: every 0.5 m x 1 m over the dance floor (x ±5.35, z 25.8-48) at 1.6 m, line of sight tested; field = the full beam angle. Front row: "+S.front_row_max_lux+" lux.");
h2("9","The audit: every beam against every piece of evidence");
p("(1) the hall model's triangles + the rig's solids; (2) the VGGT point cloud of 56 photos and frames, in the hall frame (0.73 m rms): cloud points inside a cone, short of the model's surface and &gt; 0.7 m from every model surface, are clutter the model lacks; (3) the photos: each path projected with each photo's fitted camera, seen where in frame and not behind a model surface; (4) the analysis docs (below).");
root.appendChild(table(["fixture","group","path m","model","cloud (points near path / clutter)","best photo","verdict"],D.rows.map(r=>[r.id.replace("rig-",""),r.group,r.path_m,r.model,r.cloud?(r.cloud.cloud_points_within_2m_of_path+" / "+r.cloud.clutter):"",r.photo.photo?(r.photo.photo+" "+Math.round(100*r.photo.seen)+" %"):"none",{html:esc(r.verdict),style:{color:vcol[vk(r.verdict)]}}])));
for(let i=0;i<D.sheets.length;i++){root.appendChild(img(D.sheets[i],"contact sheet"));note(esc(D.sheetNames[i]));}
root.appendChild(el("h3",{font:"600 15px/1.3 "+F,margin:"18px 0 8px"},"(4) from the analysis docs"));
root.appendChild(table(["what","where","status","what it means for the lights","source"],D.docs.map(d=>[d.what,d.where,d.status,d.rule,d.src])));
h2("10","Shots to take today (2026-10-08)");
p("Every UNKNOWN or CHECK path, grouped, as a place to stand and a way to point (yaw 0 = toward the far gate, + toward house right; pitch + up). Also added to a local copy of the survey page, beside this one.");
root.appendChild(table(["#","for","stand at (x, y, z)","point: yaw / pitch","covers","look for","how"],D.shots.map((s,i)=>["L"+(i+1),s.for+" ("+s.fixtures.length+")","("+s.stand_m.join(", ")+")",s.point_yaw_deg+"° / "+s.point_pitch_deg+"°","x "+s.covers_x_m.join("..")+", z "+s.covers_z_m.join(".."),s.look_for,s.how])));
h2("11","Limits");
p("The hall model's numbers carry hall.json's confidence (the near crane girder ASSUMED; the pipe racks LOW; the far half and the side spans never photographed). The cloud is VGGT's depth (&plusmn;0.7 m) and only where photos looked. The photos' cameras are pinhole fits with no lens distortion (959 fisheye and 024 ultra-wide approximate). PAR / beam / wash intensities are borrowed equivalents. Pictures, not renders.");
root.appendChild(el("div",{color:C.dim,font:"12px/1.55 "+F,marginTop:"26px",borderTop:"1px solid "+C.line,paddingTop:"12px"},"Generated by scripts/place/design_paint.py (PR #823) from rigs/moxir-design-paint-2026-10-08.json, the blocking-fixed mix, the hall GLB (sha256 pinned in occlusion_lib.py), vggt-2026-10-07c and its alignment, and the owner's painted plan."));
</script></body></html>
"""


# ------------------------------------------------------------------ main
if __name__ == '__main__':
    beams, lasers, gl = model_pass(FX)
    for b in beams:
        RES[b['id']] = b
    for l in lasers:
        RES[l['id']] = l
    RES['_lasers'] = lasers
    opts = far_options()
    lks = looks(FX, gl)
    S = summary(FX, beams, lasers, gl, lks, opts)
    S['lasers_with_the_crane_as_photographed'] = crane_as_photographed(FX)
    if A.check or not A.out:
        print(json.dumps({'summary': S, 'beams': [{k: v for k, v in b.items() if not k.startswith('_')} for b in beams],
                          'lasers': [{k: v for k, v in l.items() if not k.startswith('_')} for l in lasers]}, indent=1, default=lambda v: v.tolist() if hasattr(v, 'tolist') else str(v)))
        sys.exit(0)
    od = os.path.expanduser(A.out)
    os.makedirs(od, exist_ok=True)
    pts, cam_of = (None, None) if A.no_photos else load_cloud(os.path.join(od, 'cache', 'vggt-cloud-hall.npz'))
    cams = [] if A.no_photos else photo_cams()
    rows = audit(FX, beams, lasers, pts, cams, cam_of, None if A.no_photos else cloud_cam_centres())
    shots = shot_list(rows, FX)
    zones = json.load(open(os.path.expanduser(A.paint))) if os.path.exists(os.path.expanduser(A.paint)) else None
    P = lambda n: os.path.join(od, 'design-paint-%s.png' % n)
    pngs = {}
    eye, look_at = [0.0, 1.6, 47.0], [0.0, 6.5, -14.0]
    for lk in lks:
        if lk['id'] in ('hallset', 'web'):
            pngs['view_' + lk['id']] = render_view(FX, lk['_lit'], P('view-' + lk['id']), '%s (%s)' % (lk['title'], ' + '.join(lk['layers'])),
                                                   'from the back of the dance floor, eye 1.6 m, z 47 (the hall model\'s triangles, matplotlib, no WebGL): a picture of intent, not a render', eye, look_at)
    pngs['view_plot'] = render_view(FX, {f['id'] for f in FX if not f['spare']}, P('view-plot'), 'The whole design at home aims (a checking picture, never a show state)',
                                    'every fixture lit at once so every place and aim can be seen; in the show at most 3 layers burn', eye, look_at)
    pngs['plan'] = fig_plan(FX, zones, P('plan'))
    pngs['section'] = fig_section(FX, P('section'), title='Side section, the whole length (seen from house left; everything projected onto one plane)')
    pngs['lasers'] = fig_lasers(FX, P('lasers'))
    pz = os.path.join(od, 'paint-zones-full-place.png')
    if os.path.exists(pz):
        from PIL import Image
        im = Image.open(pz).convert('RGB')
        im.thumbnail((1400, 1600))
        im.save(P('paint'))
        pngs['paint'] = P('paint')
    sheets = contact_sheets(rows, FX, cams, od) if cams else []
    import csv
    with open(os.path.join(od, 'audit-table.csv'), 'w', newline='') as fh:
        w = csv.writer(fh)
        w.writerow(['fixture', 'group', 'type', 'at', 'path m', 'model', 'cloud points within 2 m of the path', 'cloud clutter points', 'clutter where', 'best photo', 'share of path seen', 'verdict'])
        for r in rows:
            c = r['cloud'] or {}
            w.writerow([r['id'], r['group'], r['type'], r['at'], r['path_m'], r['model'], c.get('cloud_points_within_2m_of_path', ''), c.get('clutter', ''),
                        c.get('clutter_at', ''), r['photo'].get('photo') or '', r['photo'].get('seen'), r['verdict']])
    with open(os.path.join(od, 'shot-list.json'), 'w') as fh:
        json.dump(shots, fh, indent=1)
    with open(os.path.join(od, 'design-paint.json'), 'w') as fh:
        json.dump({'summary': S, 'audit': rows, 'shots': shots}, fh, indent=1, default=lambda v: v.tolist() if hasattr(v, 'tolist') else str(v))
    page = write_page(od, S, rows, shots, pngs, sheets)
    for v in list(pngs.values()) + sheets + [page]:
        print('wrote', v)
