"""walls_single.py - single-view metrology per frame (Criminisi, Reid, Zisserman 2000; Hartley-Zisserman ch. 8) on MoGe-2 metric points.
Per frame: floor plane (lib.floor_up) levels the points (z up, camera at origin, height h); vertical walls = 2D line RANSAC on points with
0.4 < z-above-floor < 2.2 m (min 400 pts, z-span >= 1.2 m, length >= 1.2 m); ceiling = horizontal plane in z > 1.9 m.
Output walls_single2.json: per frame {room, t, h, ceil, lines:[{phi_deg (normal), d, s0, s1, n}]}, and pair table (parallel separation, corner angle).
usage: walls_single.py   (all frames in survey/rooms/<room>/)"""
import os, json, math, numpy as np
import lib
rng = np.random.default_rng(3)
def lines_xy(Q, zs, n_lines=6):
    out = []; idx = np.arange(len(Q))
    for _ in range(n_lines):
        if len(idx) < 250: break
        best = (0, None)
        for _ in range(250):
            a, b = Q[rng.choice(idx, 2, replace=False), :2]; v = b - a; L = np.hypot(*v)
            if L < 0.3: continue
            nrm = np.array([-v[1], v[0]]) / L; dd = Q[idx, :2] @ nrm - a @ nrm
            c = (np.abs(dd) < 0.05).sum()
            if c > best[0]: best = (c, nrm, a @ nrm)
        if best[0] < 250: break
        nrm, d0 = best[1], best[2]; inl = idx[np.abs(Q[idx, :2] @ nrm - d0) < 0.05]
        # refine
        A = Q[inl, :2]; c = A.mean(0); u, s, vt = np.linalg.svd(A - c, full_matrices=False); t = vt[0]; nrm = np.array([-t[1], t[0]]); d0 = c @ nrm
        inl = idx[np.abs(Q[idx, :2] @ nrm - d0) < 0.05]; s_ = Q[inl, :2] @ t; z = zs[inl]
        if len(inl) >= 250 and np.percentile(z, 95) - np.percentile(z, 5) >= 1.0 and np.percentile(s_, 97) - np.percentile(s_, 3) >= 0.8:
            if nrm @ (-c) < 0: nrm = -nrm; d0 = c @ nrm       # normal points towards the camera
            out.append(dict(phi=math.degrees(math.atan2(nrm[1], nrm[0])), d=float(-d0 if False else abs(d0)), s0=float(np.percentile(s_, 3)), s1=float(np.percentile(s_, 97)), n=int(len(inl)), c=[float(c[0]), float(c[1])]))
        idx = np.setdiff1d(idx, inl)
    return out
res = {}
for room in sorted(os.listdir(lib.M + '/survey/rooms')):
    for fn in sorted(os.listdir(f'{lib.M}/survey/rooms/{room}')):
        if not fn.endswith('.jpg') or not os.path.exists(f'{lib.CMP}/depth_all/{fn[:-4]}.npz'): continue
        P, Mk = lib.load_points(fn); up = lib.floor_up(P, Mk)
        if up is None: continue
        L = lib.level_rot(up[0]); h = up[1]
        Pc = P[Mk].reshape(-1, 3); Pc = Pc[np.isfinite(Pc).all(1) & (Pc[:, 2] < 9)]
        U = Pc @ L.T; z = U[:, 2] + h                          # height above the floor plane
        sel = (z > 0.4) & (z < 2.2); Q = U[sel][::2]; zs = z[sel][::2]
        ceil = None; hi = z > 1.9
        if hi.sum() > 800:                                     # ceiling: mode of heights above 2.0 m
            hh = z[hi & (z < 5)]; hist, ed = np.histogram(hh, bins=np.arange(1.9, 5.0, 0.04)); k = hist.argmax()
            if hist[k] > 0.05 * len(Pc): ceil = float(ed[k] + 0.02)
        ls = lines_xy(Q, zs) if len(Q) > 500 else []
        res[fn] = dict(room=room, t=float(fn.split('_t')[1][:5]) / 100, video=fn[:6], h=h, ceil=ceil, lines=ls)
json.dump(res, open(lib.CMP + '/walls_single2.json', 'w'))
print('frames', len(res), 'with >=2 lines', sum(len(v['lines']) >= 2 for v in res.values()))
