#!/usr/bin/env python3
"""Lay scanned facade pieces out as ONE building, an elevation (di.iiii; first used for Aren's wall, spaces/dilijan/aren).

Owner, 2026-10-21 (N1145): "look walls parallel, windows parallel it the one building … fix wall windows here".

Each step is a published method; nothing is stretched or drawn in:
1. Facade plane: sequential RANSAC of vertical planes (Fischler & Bolles 1981) on area-weighted surface samples (4 cm),
   refined by the total-least-squares plane (PCA) of the inliers, so a lean is kept.
2. Photographed side: the winding normals of the facade's triangles. A mesh keeps one convention (`ground_winding`: its
   ground normals point up). A piece is shown only from that side; from the other its photo reads mirrored.
3. Level: the roll that makes the facade's horizontal edges (sills, foot, joints) and vertical edges (seams, jambs)
   sharpest in their projection profiles (document skew estimation, Postl 1986); the foot's Theil-Sen line (Sen 1968)
   when the picture has too few edges. Windows (reported, not used to level): white unsaturated frames, connected
   components after a closing, kept when they repeat in one row (segment and repetition cues of facade parsing, Lee &
   Nevatia CVPR 2004, Mueller et al. SIGGRAPH 2007).
4. Scan pose of a piece reconstructed apart (another scale): its elevation matched on the scan's own facade by masked
   NCC over scale and shift, refined by trimmed ICP with scale (Umeyama 1991). Only a uniform scale, as registration
   of two reconstructions needs.
5. Layout, the developed (unfolded) elevation of architectural drawing: every facade turned onto the reference facade's
   plane and levelled (true horizontal), its photographed side to the viewer, its foot on one level ground line, in order, with
   the gaps measured between the pieces' ends along the plan of the scan (a corner is measured round the corner).
   The reference piece does not move.
CLI: python3 -I spaces/dilijan/aren/elevation.py --api http://dilijan-test.diiii.localhost/serverXR [--write] [--json out]
"""
import argparse, json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import texfit as tf

UP = np.array([0.0, 1.0, 0.0])


def frame_of(n):
    """Horizontal axis u (screen right when seen from the n side) and in-plane up v of a facade with normal n."""
    u = np.cross(UP, n); u /= np.linalg.norm(u); return u, np.cross(n, u)


def sample(P, I, UV, n, rng, faces=None):
    """Area-weighted surface samples: positions and UVs (optionally on a subset of faces)."""
    I2 = I if faces is None else I[faces]
    f, S, uv = tf.surface_samples(P, I2, UV, n, rng)
    return S, uv


def vertical_planes(X, rng, thr=0.04, iters=3000, min_share=0.06, max_planes=4, sub=15000):
    """Sequential RANSAC of vertical planes (lines in plan x-z), refined by PCA. -> [(normal, centroid, inlier mask)]."""
    out, left = [], np.ones(len(X), bool); above = X[:, 1] > np.percentile(X[:, 1], 2) + 0.25
    for _ in range(max_planes):
        idx = np.flatnonzero(left & above)
        if len(idx) < min_share*len(X): break
        s = rng.choice(idx, min(len(idx), sub), replace=False); XS = X[s][:, [0, 2]]
        a, b = rng.choice(idx, iters), rng.choice(idx, iters); best, bc = None, 0
        for i, j in zip(a, b):
            d = X[j, [0, 2]] - X[i, [0, 2]]; L = np.hypot(*d)
            if L < 0.5: continue
            nn = np.array([-d[1], d[0]])/L; c = np.count_nonzero(np.abs((XS - X[i, [0, 2]]) @ nn) < thr)
            if c > bc: bc, best = c, (i, nn)
        if best is None or bc*len(idx)/len(s) < min_share*len(X): break
        i, nn = best
        # the line in plan -> a 3D plane: PCA of the inliers above the ground, refit on the 3D distance (lean kept)
        inl = left & above & (np.abs((X[:, [0, 2]] - X[i, [0, 2]]) @ nn) < thr)
        for _ in range(4):
            Y = X[inl]; c0 = Y.mean(0); n3 = np.linalg.svd(Y - c0, full_matrices=False)[2][2]; n3 /= np.linalg.norm(n3)
            inl = left & above & (np.abs((X - c0) @ n3) < thr*0.75)
        full = left & (np.abs((X - c0) @ n3) < thr)        # with the foot: the low points on the plane count too
        out.append((n3, c0, full)); left &= ~full
    return out


def ground_winding(P, I):
    """Area-weighted mean n_y of the low near-horizontal triangles: about +1 when the winding faces the cameras."""
    t = P[I]; fn = np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0]); a = np.linalg.norm(fn, axis=1) + 1e-12
    low = (t[:, :, 1].mean(1) < np.percentile(P[:, 1], 2) + 0.15) & (np.abs(fn[:, 1]/a) > 0.9)
    return float(fn[low, 1].sum()/a[low].sum()) if low.any() else 0.0


def photographed_side(P, I, n, c):
    """+1 when the facade's triangles (within 4 cm of the plane) face along n, -1 against it; with the share."""
    t = P[I]; fn = np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0]); cen = t.mean(1)
    on = np.abs((cen - c) @ n) < 0.04; a = np.linalg.norm(fn[on], axis=1).sum()
    m = float((fn[on] @ n).sum()/max(a, 1e-12))
    return (1.0 if m >= 0 else -1.0), m


def theil_sen(x, y, rng, n=6000, groups=None):
    """Median of pair slopes (Sen 1968); with groups, only pairs inside one group (shared slope, own intercepts)."""
    i, j = rng.integers(0, len(x), n), rng.integers(0, len(x), n)
    ok = np.abs(x[i] - x[j]) > 0.05
    if groups is not None: ok &= groups[i] == groups[j]
    s = float(np.median((y[j] - y[i])[ok]/(x[j] - x[i])[ok])) if ok.any() else 0.0
    return s, float(np.median(y - s*x))


def components(mask):
    """4-connected components by run-length union-find -> [(x0, y0, x1, y1, pixels)]."""
    H, W = mask.shape; parent, runs, prev = [], [], []
    def find(a):
        while parent[a] != a: parent[a] = parent[parent[a]]; a = parent[a]
        return a
    for y in range(H):
        d = np.diff(np.concatenate([[0], mask[y].astype(np.int8), [0]])); cur = []
        for a, b in zip(np.flatnonzero(d == 1), np.flatnonzero(d == -1)):
            k = len(parent); parent.append(k); runs.append((y, a, b)); cur.append((a, b, k))
            for pa, pb, pk in prev:
                if pa < b and a < pb: parent[find(k)] = find(pk)
        prev = cur
    comp = {}
    for k, (y, a, b) in enumerate(runs):
        c = comp.setdefault(find(k), [W, H, -1, -1, 0]); c[0] = min(c[0], a); c[1] = min(c[1], y); c[2] = max(c[2], b - 1); c[3] = max(c[3], y); c[4] += b - a
    return [tuple(v) for v in comp.values()]


def elevation(P, I, UV, tex, c, n, rng, res=0.01, depth=0.25, per_px=4.0):
    """Orthographic picture of the facade seen from its n side: u to the right, world y up. -> dict(img, cov, u0, y1)."""
    u, _ = frame_of(n); t = P[I]; cen = t.mean(1)
    near = np.abs((cen - c) @ n) < depth + 0.1
    fn = np.cross(t[near, 1] - t[near, 0], t[near, 2] - t[near, 0]); area = 0.5*np.linalg.norm(fn, axis=1).sum()
    S, uv = sample(P, I, UV, int(min(4e6, max(2e4, per_px*area/res**2))), rng, faces=np.flatnonzero(near))
    col = tf.sample_tex(tex, uv, True); d = (S - c) @ n; k = np.abs(d) < depth; S, col, d = S[k], col[k], d[k]
    uu, yy = (S - c) @ u, S[:, 1]; u0, y1 = uu.min() - 0.05, yy.max() + 0.05
    W, H = int((uu.max() + 0.05 - u0)/res) + 1, int((y1 - yy.min() + 0.05)/res) + 1
    img = np.zeros((H, W, 3)); cov = np.zeros((H, W), bool); px = ((uu - u0)/res).astype(int); py = ((y1 - yy)/res).astype(int)
    o = np.argsort(d); img[py[o], px[o]] = col[o]; cov[py, px] = True
    return {'img': img, 'cov': cov, 'u0': u0, 'y1': y1, 'res': res, 'u': u}


def dilate(m, r=1):
    out = m.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1): out |= np.roll(np.roll(m, dy, 0), dx, 1)
    return out


def skew_deg(el, span=4.0, step=0.05, band=None):
    """Roll of the facade in its elevation: the angle that makes the horizontal edges (sills, foot, panel joints) and the
    vertical edges (seams, jambs) sharpest in their projection profiles (the profile method of document skew
    estimation, Postl 1986), refined by a parabola through the best three angles. Positive = the level line rises right."""
    L = el['img'].mean(2); cov = el['cov']
    inner = cov & np.roll(cov, 1, 0) & np.roll(cov, -1, 0) & np.roll(cov, 1, 1) & np.roll(cov, -1, 1)
    inner = ~dilate(~inner, 2)
    if band is not None:            # only the wall between its foot and its eave: a sloping roof edge is no level line
        H, W = L.shape; uu = el['u0'] + np.arange(W)*el['res']; yy = el['y1'] - np.arange(H)*el['res']
        lo, hi = band; inner &= (yy[:, None] > lo(uu)[None, :]) & (yy[:, None] < hi(uu)[None, :])
    gy = np.zeros_like(L); gy[1:-1] = (L[2:] - L[:-2])/2; gx = np.zeros_like(L); gx[:, 1:-1] = (L[:, 2:] - L[:, :-2])/2
    th = np.percentile(np.abs(np.concatenate([gy[inner], gx[inner]])), 85) if inner.any() else 0
    ry, cy = np.nonzero(inner & (np.abs(gy) > th) & (np.abs(gy) > np.abs(gx))); wy = np.abs(gy[ry, cy])
    rx, cx = np.nonzero(inner & (np.abs(gx) > th) & (np.abs(gx) > np.abs(gy))); wx = np.abs(gx[rx, cx])
    if len(ry) + len(rx) < 200: return None
    angs = np.arange(-span, span + 1e-9, step); sc = []
    for a in np.radians(angs):
        # image rows grow downward: a world slope +a is a row slope -a
        qh = ry*np.cos(a) + cy*np.sin(a); qv = cx*np.cos(a) - rx*np.sin(a)
        hh = np.bincount(np.round(qh - qh.min()).astype(int), wy); hv = np.bincount(np.round(qv - qv.min()).astype(int), wx)
        sc.append((hh**2).sum() + (hv**2).sum())
    sc = np.array(sc); k = int(np.argmax(sc))
    if 0 < k < len(sc) - 1:
        d = sc[k - 1] - 2*sc[k] + sc[k + 1]; off = 0.5*(sc[k - 1] - sc[k + 1])/d if d != 0 else 0.0
        return float(angs[k] + np.clip(off, -1, 1)*step)
    return float(angs[k])


def windows(el, facade_h, rng):
    """Window frames: white unsaturated components that repeat in a row. -> list of windows and the row's slope."""
    img, cov, res = el['img'], el['cov'], el['res']; L = img.mean(2); sat = (img.max(2) - img.min(2))/np.maximum(1, img.max(2))
    white = cov & (L > 150) & (sat < 0.25); cand = []
    closed = ~dilate(~dilate(white, 2), 2)                  # bridge the strings and flowers that cross a frame
    for x0, y0, x1, y1, cnt in components(closed):
        w, h = (x1 - x0 + 1)*res, (y1 - y0 + 1)*res
        if 0.2*facade_h <= w <= 1.5*facade_h and 0.2*facade_h <= h <= 0.9*facade_h and cnt/((x1 - x0 + 1)*(y1 - y0 + 1)) < 0.75 and y0 > 3:
            cand.append((x0, y0, x1, y1))
    # repetition: keep a frame when another frame has its height (25 %) and its sill (10 % of the facade)
    keep = [a for a in cand if any(b is not a and abs((b[3] - b[1]) - (a[3] - a[1])) <= 0.25*(a[3] - a[1]) and abs(b[3] - a[3])*res <= 0.1*facade_h for b in cand)]
    rows_ = []                                              # the main row: the sill cluster with the most window width
    for a in sorted(keep, key=lambda b: b[3]):
        if rows_ and abs(a[3] - rows_[-1][-1][3])*res <= 0.05*facade_h: rows_[-1].append(a)
        else: rows_.append([a])
    keep = max(rows_, key=lambda r_: sum(b[2] - b[0] for b in r_)) if rows_ else []
    if len(keep) < 2: keep = []
    out, xs, ys, gs = [], [], [], []
    for g, (x0, y0, x1, y1) in enumerate(keep):
        out.append({'u0': el['u0'] + x0*res, 'u1': el['u0'] + (x1 + 1)*res, 'head': el['y1'] - y0*res, 'sill': el['y1'] - (y1 + 1)*res})
        for col in range(x0 + (x1 - x0)//8, x1 - (x1 - x0)//8 + 1):      # sill and head edges, column by column
            rows = np.flatnonzero(white[y0:y1 + 1, col])
            if len(rows) < 2: continue
            for r, e in ((rows.max(), 0), (rows.min(), 1)):
                xs.append(el['u0'] + col*res); ys.append(el['y1'] - (y0 + r)*res); gs.append(2*g + e)
    slope = theil_sen(np.array(xs), np.array(ys), rng, groups=np.array(gs))[0] if len(set(gs)) >= 2 else None
    return out, slope


def measure(m, s, R, t, rng, name='', n=300000, iters=3000, per_px=4.0):
    """A piece at its pose (X = s R p + t): facade plane, photographed side, level frame, foot, extent and windows."""
    P = s*m['P'] @ R.T + t; I = m['I']
    X, _ = sample(P, I, m['UV'], n, rng)
    pl = vertical_planes(X, rng, iters=iters)
    if not pl: raise ValueError(f'{name}: no vertical plane')
    # the facade: the plane with the most area (the first RANSAC plane)
    n, c, inl = pl[0]; side, share = photographed_side(P, I, n, c); n = n*side
    u, v = frame_of(n)
    on = X[inl]; a = (on - c) @ u; y = on[:, 1]
    cols = np.floor(a/0.05).astype(int); ks, cnt = np.unique(cols, return_counts=True); ks = ks[cnt > 30]
    foot = np.array([[k*0.05 + 0.025, np.percentile(y[cols == k], 2)] for k in ks]); top = np.array([[k*0.05 + 0.025, np.percentile(y[cols == k], 98)] for k in ks])
    fs, fb = theil_sen(foot[:, 0], foot[:, 1], rng); es, eb = theil_sen(top[:, 0], top[:, 1], rng)
    el = elevation(P, I, m['UV'], m['tex'], c, n, rng, per_px=per_px)
    a0, a1 = float(np.percentile(a, 0.5)), float(np.percentile(a, 99.5))
    fh = float((eb + es*(a0 + a1)/2) - (fb + fs*(a0 + a1)/2))
    wins, _ = windows(el, fh, rng)
    sk = skew_deg(el, band=(lambda x: fb + fs*x + 0.05*fh, lambda x: eb + es*x - 0.15*fh))
    rho, by = (np.radians(sk), 'edges') if sk is not None else (np.arctan(fs), 'foot')
    h = np.cos(rho)*u + np.sin(rho)*v; w = -np.sin(rho)*u + np.cos(rho)*v
    # the foot and the extent in the level frame (a along h, b along w)
    A = (on - c) @ h; B = (on - c) @ w
    colsh = np.floor(A/0.05).astype(int); kk, cc = np.unique(colsh, return_counts=True); kk = kk[cc > 30]
    footb = np.array([np.percentile(B[colsh == k], 2) for k in kk])
    return {'name': name, 'n': n, 'c': c, 'u': u, 'h': h, 'w': w, 'side_share': share, 'level_by': by, 'roll_deg': float(np.degrees(rho)),
            'tilt_deg': float(np.degrees(np.arcsin(abs(n[1])))), 'yaw_deg': float(np.degrees(np.arctan2(n[0], n[2]))),
            'a0': float(np.percentile(A, 0.5)), 'a1': float(np.percentile(A, 99.5)), 'foot': float(np.median(footb)),
            'foot_slope_deg': float(np.degrees(np.arctan(fs))) - float(np.degrees(rho)), 'eave_slope_deg': float(np.degrees(np.arctan(es))) - float(np.degrees(rho)),
            'windows': wins, 'facade_h': fh, 'el': el}


def segment(f):
    """Plan segment (x, z) of a facade: its two ends along h."""
    e0, e1 = f['c'] + f['a0']*f['h'], f['c'] + f['a1']*f['h']
    return np.array([e0[0], e0[2]]), np.array([e1[0], e1[2]])


def gap_along(fa, fb, corner_deg=10.0):
    """Distance between two facades' nearest ends measured along the walls (round a corner when they meet at one)."""
    A, B = segment(fa), segment(fb)
    ia, ib = min(((i, j) for i in range(2) for j in range(2)), key=lambda ij: np.linalg.norm(A[ij[0]] - B[ij[1]]))
    ea, eb = A[ia], B[ib]
    da, db = A[1] - A[0], B[1] - B[0]; da /= np.linalg.norm(da); db /= np.linalg.norm(db)
    ang = np.degrees(np.arccos(np.clip(abs(da @ db), -1, 1)))
    if ang < corner_deg:          # one line: the distance between the two intervals along it (0 when they overlap)
        pa, pb = sorted([A[0] @ da, A[1] @ da]), sorted([B[0] @ da, B[1] @ da])
        return float(max(0.0, max(pa[0], pb[0]) - min(pa[1], pb[1]))), float(ang), None
    M = np.array([da, -db]).T; s, r = np.linalg.solve(M, B[0] - A[0]); K = A[0] + s*da
    # ends past the corner (the walls overlap there) count as touching
    # an end short of the corner adds its distance to it; an end past the corner (the walls overlap there) takes it off
    short = lambda e, other: np.linalg.norm(K - e)*np.sign((K - e) @ (e - other))
    return float(max(0.0, short(ea, A[1 - ia]) + short(eb, B[1 - ib]))), float(ang), K


def layout(F, order, ref, gaps):
    """Developed elevation. F: name -> measure(); order: names left to right as seen; ref: the piece that stays;
    gaps: list of len(order)-1 distances. -> name -> (M rotation, shift) such that X' = M X + shift for scan-frame X."""
    r = F[ref]; u0, v0 = frame_of(r['n']); B = np.array([u0, v0, r['n']]).T     # level (gravity), on the reference's plane
    yfoot = r['foot']*(r['w'] @ v0)
    L = {k: F[k]['a1'] - F[k]['a0'] for k in order}; start = {ref: r['a0']}; i0 = order.index(ref)
    for i in range(i0 - 1, -1, -1): start[order[i]] = start[order[i + 1]] - gaps[i] - L[order[i]]
    for i in range(i0 + 1, len(order)): start[order[i]] = start[order[i - 1]] + L[order[i - 1]] + gaps[i - 1]
    out = {}
    for k in order:
        f = F[k]
        if k == ref: out[k] = (np.eye(3), np.zeros(3), start[k]); continue      # the reference does not move
        A = np.array([f['h'], f['w'], f['n']]).T; M = B @ A.T
        shift = r['c'] - M @ f['c'] + (start[k] - f['a0'])*u0 + (yfoot - f['foot'])*v0
        out[k] = (M, shift, start[k])
    return out


def compose(s, R, t, M, shift):
    """Fragment-local p -> X' = M (s R p + t) + shift as (scale, quaternion x y z w, position)."""
    return s, tf.quat_from_R(M @ R), M @ t + shift


def view_frame(r, S, order, world):
    """The frame the page's camera fits, in the reference's level frame. theta: the yaw of the reference's facade normal (the
    camera faces it). Width: EVERY drawn vertex of every piece along the level line, because a fragment reaches past its
    facade (the courtyard's divider and tent): fitted to the facades alone, the right end was cut off on a phone (N1145,
    seen 2026-10-21). Height: the ground line to the tallest facade. world: name -> the piece's vertices at its laid-out pose."""
    u0, _ = frame_of(r['n']); A = np.concatenate([(X - r['c']) @ u0 for X in world.values()])
    lo, hi = float(A.min()), float(A.max()); tall = max(S[k]['facade_h'] for k in order)
    centre = r['c'] + (lo + hi)/2*u0 + (r['foot'] + tall/2)*r['w']
    return {'theta': round(float(np.arctan2(r['n'][0], r['n'][2])), 5), 'centre': [round(float(x), 3) for x in centre],
            'width': round(hi - lo, 3), 'height': round(float(tall), 3)}


def umeyama(X, Y):
    """Similarity (c, R, t) minimising |Y - (c R X + t)| (Umeyama 1991)."""
    mx, my = X.mean(0), Y.mean(0); Xc, Yc = X - mx, Y - my; U, D, Vt = np.linalg.svd(Yc.T @ Xc/len(X))
    E = np.eye(3); E[2, 2] = np.sign(np.linalg.det(U @ Vt)); R = U @ E @ Vt; c = float(np.trace(np.diag(D) @ E)/(Xc**2).sum(1).mean())
    return c, R, my - c*R @ mx


def register_apart(frag, part, rng, s_range=(0.6, 1.6), span=0.15, **kw):
    """Scan pose (s, R, t) of a fragment reconstructed apart, on the scan part that shows the same facade.
    Init: masked NCC of the photographed-side elevations over scale and shift; refine: trimmed ICP with scale."""
    Ff = measure(frag, 1.0, np.eye(3), np.zeros(3), rng, 'fragment', **kw); Fp = measure(part, 1.0, np.eye(3), np.zeros(3), rng, 'part', **kw)
    ea, eb = Ff['el'], Fp['el']; LA, MA = ea['img'].mean(2), ea['cov']; LB, MB = eb['img'].mean(2), eb['cov']
    # scale about the two pictures' centres, so a change of scale needs no change of shift
    cA, cB = np.array(LA.shape[::-1])/2, np.array(LB.shape[::-1])/2
    def ncc(sc, dx, dy, step):
        ys, xs = np.mgrid[0:LA.shape[0]:step, 0:LA.shape[1]:step]
        xb = np.round(sc*(xs - cA[0]) + cB[0] + dx).astype(int); yb = np.round(sc*(ys - cA[1]) + cB[1] + dy).astype(int)
        ok = MA[ys, xs] & (xb >= 0) & (xb < LB.shape[1]) & (yb >= 0) & (yb < LB.shape[0]); ok[ok] &= MB[yb[ok], xb[ok]]
        if ok.sum() < 2000/step**2: return -1.0
        return float(np.corrcoef(LA[ys, xs][ok], LB[yb[ok], xb[ok]])[0, 1])
    # coarse: scale from the facade heights, then a grid; fine: 1 px, 0.002
    s0 = Fp['facade_h']/Ff['facade_h']; best = (-2.0, s0, 0, 0)
    for sc in np.arange(max(s_range[0], s0*(1 - span)), min(s_range[1], s0*(1 + span)), 0.01):
        for dx in range(-80, 81, 4):
            for dy in range(-40, 41, 4):
                r = ncc(sc, dx, dy, 3)
                if r > best[0]: best = (r, sc, dx, dy)
    _, s1, x1, y1 = best
    for sc in np.arange(s1 - 0.012, s1 + 0.0121, 0.002):
        for dx in range(x1 - 4, x1 + 5):
            for dy in range(y1 - 4, y1 + 5):
                r = ncc(sc, dx, dy, 1)
                if r > best[0]: best = (r, sc, dx, dy)
    r, sc, dx, dy = best
    dx, dy = cB[0] - sc*cA[0] + dx, cB[1] - sc*cA[1] + dy          # back to xb = sc*x + dx
    # pixel map -> 3D map of the fragment's own frame onto the part's frame
    def to_part(X):
        a = (X - Ff['c']) @ ea['u']; y = X[:, 1]; d = (X - Ff['c']) @ Ff['n']
        ub = eb['u0'] + sc*(a - ea['u0']) + dx*eb['res']; yb = eb['y1'] - sc*(ea['y1'] - y) - dy*eb['res']
        return Fp['c'] + np.outer(ub, eb['u']) + np.outer(d*sc, Fp['n']) + np.outer(yb - Fp['c'][1], UP)
    S, _ = sample(frag['P'], frag['I'], frag['UV'], 60000, rng); T, _ = sample(part['P'], part['I'], part['UV'], 120000, rng)
    G = tf.Grid(T, 0.06); cur = to_part(S); c_t, R_t, t_t = 1.0, np.eye(3), np.zeros(3)
    for _ in range(20):
        d, idx = G.query(cur, 0.06); ok = idx >= 0; keep = ok & (d <= np.percentile(d[ok], 80))
        c, R, t = umeyama(cur[keep], T[idx[keep]]); cur = c*cur @ R.T + t; c_t, R_t, t_t = c*c_t, R @ R_t, c*R @ t_t + t
    d, idx = G.query(cur, 0.06); ok = idx >= 0
    s, R, t = umeyama(frag['P'], c_t*to_part(frag['P']) @ R_t.T + t_t)
    return {'s': s, 'R': R, 't': t, 'ncc': r, 'median_cm': float(np.median(d[ok])*100), 'p90_cm': float(np.percentile(d[ok], 90)*100),
            'within_3cm': float((d[ok] < 0.03).mean()), 'matched': float(ok.mean())}


def angle(a, b):
    return float(np.degrees(np.arccos(np.clip(a @ b/np.linalg.norm(a)/np.linalg.norm(b), -1, 1))))


def pose_dict(s, q, t):
    return {'s': round(float(s), 5), 'q': [round(float(x), 6) for x in q], 't': [round(float(x), 4) for x in t]}


def report_pieces(F, order):
    """Pairwise facade-normal angles, rolls, window sills/heads and feet of measured pieces (world heights)."""
    names = [k for k in order if k in F]
    ang = max((angle(F[a]['n'], F[b]['n']) for i, a in enumerate(names) for b in names[i + 1:]), default=0.0)
    sills = {k: [w_['sill'] for w_ in F[k]['windows']] for k in names}; heads = {k: [w_['head'] for w_ in F[k]['windows']] for k in names}
    allS = [x for k in names for x in sills[k]]
    feet = {k: float(F[k]['c'][1] + F[k]['foot']*F[k]['w'][1]) for k in names}
    return {'max_normal_angle_deg': ang, 'roll_deg': {k: F[k]['roll_deg'] for k in names}, 'level_by': {k: F[k]['level_by'] for k in names},
            'sills': sills, 'heads': heads, 'sill_spread_cm': (max(allS) - min(allS))*100 if allS else None,
            'sill_spread_in_piece_cm': {k: (max(v) - min(v))*100 for k, v in sills.items() if v}, 'feet': feet,
            'feet_spread_cm': (max(feet.values()) - min(feet.values()))*100, 'foot_slope_deg': {k: F[k]['foot_slope_deg'] for k in names},
            'yaw_deg': {k: F[k]['yaw_deg'] for k in names}, 'tilt_deg': {k: F[k]['tilt_deg'] for k in names}}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--api'); ap.add_argument('--blobs', help='a folder of assets named by id (offline)')
    ap.add_argument('--page', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'yard.html'))
    ap.add_argument('--order', default='wall,cabin,courtyard', help='pieces left to right as seen in the elevation')
    ap.add_argument('--ref', default='courtyard', help='the piece that stays where it is')
    ap.add_argument('--apart', default='cabin=wall_mid', help='piece=scan part: a piece reconstructed apart, registered on that part')
    ap.add_argument('--seed', type=int, default=7); ap.add_argument('--json'); ap.add_argument('--write', action='store_true')
    a = ap.parse_args()
    if not (a.api or a.blobs): ap.error('--api or --blobs')
    rng = np.random.default_rng(a.seed); html = open(a.page).read()
    cloud, yard, pack = tf.load(tf.fetcher(a.api, a.blobs)); inyard = tf.page_poses(html)
    order = a.order.split(','); apart = dict(x.split('=') for x in a.apart.split(',') if x)
    scan, notes = {}, {}
    for k in order:
        if k in inyard: scan[k] = (1.0, inyard[k][0], inyard[k][1]); notes[k] = 'IN_YARD (texfit UV fit)'
        elif k in apart:
            r = register_apart(pack[k], yard[apart[k]], rng); scan[k] = (r['s'], r['R'], r['t'])
            notes[k] = (f"registered on {apart[k]}: scale {r['s']:.4f}, image NCC {r['ncc']:.2f}, residual median {r['median_cm']:.2f} cm "
                        f"p90 {r['p90_cm']:.2f} cm, {r['within_3cm']*100:.0f}% within 3 cm")
        else: raise SystemExit(f'{k}: no scan pose (not in IN_YARD and not --apart)')
    # before: the page's wall arrangement as it is (the wall page's layout: centre + OFF, upright)
    off = inyard[a.ref][1] - np.array(pack[a.ref]['center'])
    before = {k: measure(pack[k], 1.0, np.eye(3), np.array(pack[k]['center']) + off, rng, k) for k in order}
    S = {k: measure(pack[k], *scan[k], rng, k) for k in order}
    gaps, gnote = [], []
    for x, y in zip(order, order[1:]):
        g, ang, K = gap_along(S[x], S[y]); gaps.append(g); gnote.append(f'{x}|{y}: {g*100:.1f} cm ' + (f'round the corner ({ang:.1f} deg)' if K is not None else f'along the line ({ang:.1f} deg apart)'))
    L = layout(S, order, a.ref, gaps); IN_WALL, after, moved, world = {}, {}, {}, {}
    for k in order:
        M, shift, start = L[k]; s, q, t = compose(*scan[k], M, shift); IN_WALL[k] = pose_dict(s, q, t)
        IN_WALL[k]['face'] = [round(float(x), 5) for x in (M @ scan[k][1]).T @ S[a.ref]['n']]   # its facade, own frame
        Rw = tf.R_from_quat(q); after[k] = measure(pack[k], s, Rw, np.array(t), rng, k); world[k] = s*pack[k]['P'] @ Rw.T + np.array(t)
        cs = S[k]['c']; cw = M @ cs + shift; dv = cw - cs
        moved[k] = {'turn_deg': float(np.degrees(np.arccos(np.clip((np.trace(M) - 1)/2, -1, 1)))), 'move_m': float(np.linalg.norm(dv)),
                    'up_cm': float((r := (after[k]['c'][1] + after[k]['foot']*after[k]['w'][1]) - (S[k]['c'][1] + S[k]['foot']*S[k]['w'][1]))*100),
                    'start_along_m': float(start)}
    # the elevation's frame: every drawn vertex along the reference's level line, from the ground line to the tallest eave
    r = S[a.ref]; view = view_frame(r, S, order, world)
    lo = min(L[k][2] for k in order); hi = max(L[k][2] + S[k]['a1'] - S[k]['a0'] for k in order)    # the facades alone, for the report
    out = {'scan_pose': notes, 'gaps': gnote, 'before': report_pieces(before, order), 'scan': report_pieces(S, order), 'after': report_pieces(after, order),
           'moved': moved, 'IN_WALL': IN_WALL, 'WALL_VIEW': view, 'facades_width_m': round(float(hi - lo), 3), 'view_normal': [round(float(x), 6) for x in r['n']]}
    print(json.dumps({k: v for k, v in out.items() if k != 'IN_WALL'}, indent=1, default=float)[:6000])
    line = 'const IN_WALL=' + json.dumps(IN_WALL, separators=(',', ':')) + ';'
    view = 'const WALL_VIEW=' + json.dumps(out['WALL_VIEW'], separators=(',', ':')) + ';'
    print(line); print(view)
    if a.json: json.dump(out, open(a.json, 'w'), indent=1, default=float)
    if a.write:
        new = re.sub(r'const IN_WALL=\{.*?\};', line, html, count=1) if 'const IN_WALL=' in html else html
        new = re.sub(r'const WALL_VIEW=\{.*?\};', view, new, count=1) if 'const WALL_VIEW=' in new else new
        if new == html: raise SystemExit('the page has no IN_WALL / WALL_VIEW line to write')
        open(a.page, 'w').write(new); print('written', a.page)


if __name__ == '__main__':
    main()
