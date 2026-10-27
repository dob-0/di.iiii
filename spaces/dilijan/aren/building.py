#!/usr/bin/env python3
"""Recollect Aren's scan pieces as the ONE building they are, on the map (di.iiii; owner 2026-10-22, N1145.3).

Owner: "the scans are arranged wrong, check the maps and fix the scans … recollect the building, I don't want it in one line,
I want it full like a building". The 10-21 elevation (elevation.py, N1145.2) laid the pieces on one plane; this puts each
piece back where the yard scan holds it (all three were photographed in one reconstruction; the cabin, scanned apart at
1.19x, is registered on its part wall_mid) and registers that one frame on the building's footprint from OpenStreetMap
(building-footprint.json) with a similarity transform. Nothing of a piece is bent, stretched or parallelised.

Method (published, cited):
1. Facade planes and ends: elevation.measure (RANSAC + PCA planes, Fischler & Bolles 1981; ends at the 0.5/99.5 % of the
   levelled facade samples). Plan corners: intersections of neighbouring facade lines.
2. Map registration: least squares similarity (Umeyama 1991) of the scan's plan corners on the footprint's vertices,
   refined (Gauss-Newton) on the point-to-line distance of every facade sample to the map edge it belongs to; the scale
   comes from the map (the scan has no metric scale of its own: a door measured ~0.6 units).
3. Height: the same scale; the ground is the scan's ground (y = 0); the yard scan is levelled (main tilt 0.02 deg).
CLI: python3 -I spaces/dilijan/aren/building.py --api URL [--spec spaces/dilijan/building-pieces.spec.json] [--write]
"""
import argparse, datetime, json, os, re, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import texfit as tf, elevation as el

HERE = os.path.dirname(os.path.abspath(__file__))


def line_x(p, d, q, e):
    """Intersection of the lines p + a d and q + b e (plan)."""
    a, _ = np.linalg.solve(np.array([d, -e]).T, q - p); return p + a*d


def cross2(u, v):
    return float(u[0]*v[1] - u[1]*v[0])


def sim_apply(s, th, t, X):
    c, si = np.cos(th), np.sin(th); return s*(X @ np.array([[c, si], [-si, c]])) + t


def fit(corners_scan, corners_map, samples, edges):
    """Umeyama on the corners, then Gauss-Newton on corners + point-to-line distances. -> s, theta, t, residuals."""
    X, Y = np.array(corners_scan), np.array(corners_map); mx, my = X.mean(0), Y.mean(0)
    S = (Y - my).T @ (X - mx)/len(X); U, D, Vt = np.linalg.svd(S); E = np.diag([1, np.sign(np.linalg.det(U @ Vt))]); R = U @ E @ Vt
    s = np.trace(np.diag(D) @ E)/((X - mx)**2).sum(1).mean(); th = np.arctan2(R[1, 0], R[0, 0]); t = my - s*R @ mx
    def res(p):
        s, th, tx, ty = p; r = [(sim_apply(s, th, np.array([tx, ty]), X) - Y).ravel()]
        for k, P in samples.items():
            a, b = edges[k]; d = (b - a)/np.linalg.norm(b - a); nrm = np.array([-d[1], d[0]])
            r.append(((sim_apply(s, th, np.array([tx, ty]), P) - a) @ nrm)/np.sqrt(len(P)/50))   # each piece weighs like 50 points
        return np.concatenate(r)
    p = np.array([s, th, *t])
    for _ in range(20):
        r0 = res(p); J = np.array([(res(p + dp) - r0)/1e-6 for dp in np.eye(4)*1e-6]).T
        step = np.linalg.lstsq(J, -r0, rcond=None)[0]; p = p + step
        if np.abs(step).max() < 1e-9: break
    return p[0], p[1], p[2:], X, Y


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--api'); ap.add_argument('--blobs'); ap.add_argument('--page', default=os.path.join(HERE, 'yard.html'))
    ap.add_argument('--footprint', default=os.path.join(HERE, '..', 'building-footprint.json'))
    ap.add_argument('--out', default=os.path.join(HERE, '..', 'building-pieces.json'))
    ap.add_argument('--seed', type=int, default=7); ap.add_argument('--write', action='store_true')
    a = ap.parse_args(); rng = np.random.default_rng(a.seed); html = open(a.page).read()
    cloud, yard, pack = tf.load(tf.fetcher(a.api, a.blobs)); iny = tf.page_poses(html); fp = json.load(open(a.footprint))
    M = np.array(fp['local_m'])
    # 1. the scan's own plan: facades of the yard's parts (one reconstruction, one frame)
    F = {k: el.measure(yard[k], 1.0, np.eye(3), np.zeros(3), rng, k, iters=2000) for k in ('main', 'wall_mid', 'wall_right')}
    seg = {k: el.segment(f) for k, f in F.items()}
    pl = lambda v: np.array([v[0], -v[1]])            # scan plan (x, z) -> (x, -z): a top view, east-right/north-up handedness
    dirs = {k: pl(seg[k][1] - seg[k][0])/np.linalg.norm(seg[k][1] - seg[k][0]) for k in seg}
    K = line_x(pl(seg['main'][0]), dirs['main'], pl(seg['wall_mid'][0]), dirs['wall_mid'])     # the bend of the long face
    C = line_x(pl(seg['wall_mid'][0]), dirs['wall_mid'], pl(seg['wall_right'][0]), dirs['wall_right'])   # its end, where the yard wall starts
    # the long face's far end: main's end away from the bend
    A = max((pl(e) for e in seg['main']), key=lambda e: np.linalg.norm(e - K))
    # map: the north-west face, ring vertices 4 (west corner) -> 5 (bend) -> 0 (north corner)
    mA, mK, mC = M[4], M[5], M[0]
    samples = {}
    for k, part in (('main', 'main'), ('wall_mid', 'wall_mid')):
        f = F[k]; X, _ = el.sample(yard[part]['P'], yard[part]['I'], yard[part]['UV'], 20000, rng)
        d = np.abs((X - f['c']) @ f['n']) < 0.04; X = X[d]
        samples[k] = np.c_[X[:, 0], -X[:, 2]]
    edges = {'main': (mA, mK), 'wall_mid': (mK, mC)}
    s, th, t, Xc, Yc = fit([K, C], [mK, mC], samples, edges)
    # checks: every facade sample's distance to its map edge (m), corners, lengths, heights
    chk = {}
    for k in samples:
        P = sim_apply(s, th, t, samples[k]); a_, b_ = edges[k]; d = (b_ - a_)/np.linalg.norm(b_ - a_); nrm = np.array([-d[1], d[0]])
        off = (P - a_) @ nrm; along = (P - a_) @ d; L = np.linalg.norm(b_ - a_); inside = (along > -0.5) & (along < L + 0.5)
        chk[k] = {'edge_m': round(float(L), 2), 'piece_len_m': round(float(np.linalg.norm(seg[k][1] - seg[k][0])*s), 2),
                  'off_median_m': round(float(np.median(np.abs(off[inside]))), 3), 'off_p90_m': round(float(np.percentile(np.abs(off[inside]), 90)), 3),
                  'within_0_3m': round(float((np.abs(off[inside]) < 0.3).mean()), 3), 'past_edge_end_m': round(float(max(0, along.max() - L, -along.min())), 2),
                  'angle_to_edge_deg': round(float(np.degrees(np.arcsin(min(1.0, abs(cross2(sim_apply(s, th, 0*t, dirs[k][None])[0]/s, d)))))), 2)}
    corners = {'bend': np.round(sim_apply(s, th, t, K[None])[0] - mK, 3).tolist(), 'north': np.round(sim_apply(s, th, t, C[None])[0] - mC, 3).tolist()}
    wr = sim_apply(s, th, 0*t, dirs['wall_right'][None])[0]/s; bearing = lambda v: float(np.degrees(np.arctan2(v[0], v[1])) % 360)
    hts = {k: {'eave_above_foot_m': round(F[k]['facade_h']*s, 2), 'foot_m': round(float(F[k]['c'][1] + F[k]['foot']*F[k]['w'][1])*s, 2),
               'sills_above_foot_m': sorted({round(float(w['sill'] - F[k]['foot'])*s, 2) for w in F[k]['windows']}), 'heads_above_foot_m': sorted({round(float(w['head'] - F[k]['foot'])*s, 2) for w in F[k]['windows']})} for k in F}
    # 2. the pieces: each where the yard scan holds it (the cabin on its part wall_mid)
    pieces = {}
    for k in ('wall', 'courtyard'):
        R_, t_ = iny[k]; pieces[k] = (1.0, R_, np.array(t_), f'IN_YARD (UV fit on the yard part, texfit.py)')
    r = el.register_apart(pack['cabin'], yard['wall_mid'], rng)
    pieces['cabin'] = (r['s'], r['R'], r['t'], f"on wall_mid: scale {r['s']:.4f}, residual median {r['median_cm']:.2f} cm p90 {r['p90_cm']:.2f} cm")
    IN_WALL, out_p, allv = {}, {}, []
    for k, (sc, R_, t_, how) in pieces.items():
        s2, q, t2 = el.compose(sc, R_, t_, np.eye(3), np.zeros(3)); IN_WALL[k] = el.pose_dict(s2, q, t2)
        W = sc*pack[k]['P'] @ np.asarray(R_).T + t_; allv.append(W)
        ctr = sim_apply(s, th, t, pl(W.mean(0))[None])[0]
        out_p[k] = {'scan_pose': IN_WALL[k], 'how': how, 'map_centre_m': np.round(ctr, 2).tolist(), 'height_m': round(float((W[:, 1].max() - W[:, 1].min())*s), 2)}
    V = np.vstack(allv); lo, hi = V.min(0), V.max(0); centre = (lo + hi)/2
    # the view: from the side most photographed faces look to (area-weighted normals of the three pieces' facades)
    nsum = sum(F[k]['n']*(F[k]['a1'] - F[k]['a0']) for k in F); theta = float(np.arctan2(nsum[0], nsum[2]))
    right = np.array([np.cos(theta), 0, -np.sin(theta)]); wv = float(np.ptp(V @ right))
    WALL_VIEW = {'theta': round(theta, 5), 'phi': 0.42, 'centre': np.round(centre, 3).tolist(), 'width': round(wv, 3), 'height': round(float(hi[1] - lo[1]), 3),
                 'foot': round(float(np.median([F[k]['c'][1] + F[k]['foot']*F[k]['w'][1] for k in F])), 4)}   # the footprint is drawn on the facades' ground line
    inv = lambda P: (P - t) @ np.array([[np.cos(th), np.sin(th)], [-np.sin(th), np.cos(th)]]).T/s   # map -> scan plan
    FOOT = [[round(float(x), 4), round(float(-z), 4)] for x, z in inv(M)]
    out = {'about': 'Aren\'s scan pieces as one building on the map (N1145.3); written by spaces/dilijan/aren/building.py', 'date': datetime.date.today().isoformat(),
           'footprint': os.path.relpath(a.footprint, os.path.join(HERE, '..')), 'map_from_scan': {'scale_m_per_unit': round(float(s), 4), 'rotation_deg': round(float(np.degrees(th)), 3),
           'translation_m': np.round(t, 3).tolist(), 'plan': 'map (east, north) = scale * Rot(rotation) * (scan x, -scan z) + translation; height m = scale * scan y'},
           'correspondence': {'main': 'footprint edge 4->5 (north-west face, south-west half)', 'wall_mid (and the cabin)': 'edge 5->0 (north-west face, north-east half)',
                              'bend': 'vertex 5', 'north corner': 'vertex 0 (where the yard wall starts)'},
           'checks': {'facade_to_edge': chk, 'corner_error_m': corners, 'yard_wall_bearing_deg': round(bearing(wr), 1), 'heights': hts},
           'pieces': out_p, 'IN_WALL': IN_WALL, 'WALL_VIEW': WALL_VIEW, 'FOOT_scan': FOOT}
    json.dump(out, open(a.out, 'w'), indent=1, ensure_ascii=False, default=float)
    print(json.dumps({k: out[k] for k in ('map_from_scan', 'checks', 'pieces', 'WALL_VIEW')}, indent=0, ensure_ascii=False, default=float)[:5000])
    if a.write:
        new = re.sub(r'const IN_WALL=.*?;\n', 'const IN_WALL=' + json.dumps(IN_WALL, separators=(',', ':')) + ';\n', html, count=1)
        new = re.sub(r'const WALL_VIEW=.*?;\n', 'const WALL_VIEW=' + json.dumps(WALL_VIEW, separators=(',', ':')) + ';\n', new, count=1)
        foot = 'const FOOT=' + json.dumps(FOOT, separators=(',', ':')) + ';\n'
        new = re.sub(r'const FOOT=.*?;\n', foot, new, count=1) if 'const FOOT=' in new else new.replace('const WALL_VIEW=', foot + 'const WALL_VIEW=', 1)
        open(a.page, 'w').write(new); print('written', a.page)


if __name__ == '__main__':
    main()
