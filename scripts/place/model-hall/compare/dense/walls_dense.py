"""walls_dense.py - wall lines per dense frame + short-baseline visual-odometry chain (10 fps) -> wall coordinates in ONE frame per walk segment.
Methods: single-view metrology on MoGe-2 metric points (Criminisi/Reid/Zisserman 2000; same line RANSAC as compare/walls_single2.py), frame-to-frame pose by SIFT
(Lowe 2004) matches + MoGe depth of the earlier frame -> PnP RANSAC (Lepetit 2009 EPnP / OpenCV solvePnPRansac), chained; the chain frame is the leveled
frame of the segment's first frame. Wall coordinate along a room axis = n.x of the wall line (n towards the camera). Chain drift is NOT modelled: a length counts
only with >=3 frames per end wall and is MEASURED only if >=2 separate chain segments agree (see analyse step).
usage: walls_dense.py lines|chain|analyse"""
import sys, os, json, math, numpy as np, cv2, collections
sys.path.insert(0, '/mnt/data/footage/place-cinema-house-2026-10-30/modelled/compare'); import lib
O = lib.M + '/dense'; DEP = O + '/depth'; K = lib.K
KEPT = json.load(open(O + '/kept.json')); FR = KEPT['frames']
rng = np.random.default_rng(3)
TAG = os.environ.get('DENSE_TAG', '')                      # '' = round-5 hall/marble/cafe run; 'coat' = coat-corridor run
NAMES = [l.strip() for l in open(os.environ['DENSE_NAMES'])] if os.environ.get('DENSE_NAMES') else None
def pts(name):
    z = np.load(f'{DEP}/{name}.npz'); return z['points'].astype(np.float32), z['mask']
def lines_xy(Q, zs, n_lines=6):
    out = []; idx = np.arange(len(Q))
    for _ in range(n_lines):
        if len(idx) < 250: break
        best = (0, None, None)
        for _ in range(250):
            a, b = Q[rng.choice(idx, 2, replace=False), :2]; v = b - a; L = np.hypot(*v)
            if L < 0.3: continue
            nrm = np.array([-v[1], v[0]]) / L; c = (np.abs(Q[idx, :2] @ nrm - a @ nrm) < 0.05).sum()
            if c > best[0]: best = (c, nrm, a @ nrm)
        if best[0] < 250: break
        nrm, d0 = best[1], best[2]; inl = idx[np.abs(Q[idx, :2] @ nrm - d0) < 0.05]
        A = Q[inl, :2]; c = A.mean(0); u, s, vt = np.linalg.svd(A - c, full_matrices=False); t = vt[0]; nrm = np.array([-t[1], t[0]]); d0 = c @ nrm
        inl = idx[np.abs(Q[idx, :2] @ nrm - d0) < 0.05]; s_ = Q[inl, :2] @ t; z = zs[inl]
        if len(inl) >= 250 and np.percentile(z, 95) - np.percentile(z, 5) >= 1.0 and np.percentile(s_, 97) - np.percentile(s_, 3) >= 0.8:
            if nrm @ (-c) < 0: nrm = -nrm; d0 = c @ nrm
            ts = np.array([-nrm[1], nrm[0]]); s2 = Q[inl, :2] @ ts
            out.append(dict(phi=math.degrees(math.atan2(nrm[1], nrm[0])), d=float(abs(d0)), s0=float(np.percentile(s2, 3)), s1=float(np.percentile(s2, 97)), n=int(len(inl)), c=[float(c[0]), float(c[1])]))
        idx = np.setdiff1d(idx, inl)
    return out
def frame_lines(name):
    P, Mk = pts(name); up = lib.floor_up(P, Mk)
    if up is None: return None
    L = lib.level_rot(up[0]); h = up[1]
    Pc = P[Mk].reshape(-1, 3); Pc = Pc[np.isfinite(Pc).all(1) & (Pc[:, 2] < 9)]
    U = Pc @ L.T; z = U[:, 2] + h; sel = (z > 0.4) & (z < 2.2)
    ls = lines_xy(U[sel][::2], z[sel][::2]) if sel.sum() > 1000 else []
    return dict(h=float(h), L=L.tolist(), lines=ls)
if sys.argv[1] == 'lines':
    res = {}
    for nm in (NAMES or sorted(KEPT['depth'])):
        if os.path.exists(f'{DEP}/{nm}.npz'):
            r = frame_lines(nm)
            if r: r.update(room=FR[nm]['room'], t=FR[nm]['t_s'], n=FR[nm]['n'], video=FR[nm]['video']); res[nm] = r
    json.dump(res, open(O + '/walls_dense_lines' + TAG + '.json', 'w')); print('frames with lines', len(res), 'with >=1 line', sum(bool(v['lines']) for v in res.values()))
elif sys.argv[1] == 'chain':
    sift = cv2.SIFT_create(1500); bf = cv2.BFMatcher(); skel = sorted(NAMES or KEPT['skeleton'], key=lambda s: (FR[s]['video'], FR[s]['n']))
    skel = [s for s in skel if os.path.exists(f'{DEP}/{s}.npz')]
    def feat(nm):
        g = cv2.imread(f'{O}/small/{nm}.jpg', 0); return sift.detectAndCompute(g, None)
    segs = []; cur = []; prev = None; Tw = np.eye(4); T = {}
    for nm in skel:
        r = FR[nm]; kp, ds = feat(nm); ok = False
        if prev is not None and r['video'] == FR[prev[0]]['video'] and r['n'] - FR[prev[0]]['n'] <= 3 and ds is not None and prev[2] is not None:
            m = [p[0] for p in bf.knnMatch(prev[2], ds, k=2) if len(p) == 2 and p[0].distance < 0.75 * p[1].distance]
            P, Mk = pts(prev[0]); uv = np.float32([prev[1][a.queryIdx].pt for a in m]).reshape(-1, 2); xyz = lib.point_at(P, Mk, uv); good = np.isfinite(xyz).all(1)
            if good.sum() >= 30:
                ip = np.float32([kp[a.trainIdx].pt for a in m])[good]
                okp, rv, tv, inl = cv2.solvePnPRansac(xyz[good].astype(np.float64), ip.astype(np.float64), K, None, reprojectionError=3.0, iterationsCount=300)
                if okp and inl is not None and len(inl) >= 25 and np.linalg.norm(tv) < 1.0:
                    Rm = cv2.Rodrigues(rv)[0]; Tr = np.eye(4); Tr[:3, :3] = Rm; Tr[:3, 3] = tv[:, 0]      # x_cur = Tr x_prev
                    Tw = Tw @ np.linalg.inv(Tr); ok = True; cur.append((nm, Tw.copy(), int(len(inl))))
        if not ok:
            if len(cur) >= 3: segs.append(cur)
            Tw = np.eye(4); cur = [(nm, Tw.copy(), 0)]
        prev = (nm, kp, ds)
    if len(cur) >= 3: segs.append(cur)
    json.dump([[dict(name=a, T=b.tolist(), inl=c) for a, b, c in s] for s in segs], open(O + '/chain_segments' + TAG + '.json', 'w'))
    print('segments', len(segs), 'frames', sum(len(s) for s in segs), [(FR[s[0][0]]['room'], FR[s[0][0]]['video'][-10:-4], FR[s[0][0]]['t_s'], FR[s[-1][0]]['t_s'], len(s)) for s in segs][:60])
elif sys.argv[1] == 'analyse':
    LN = json.load(open(O + '/walls_dense_lines' + TAG + '.json')); SEG = json.load(open(O + '/chain_segments' + TAG + '.json')); out = []
    for si, seg in enumerate(SEG):
        names = [s['name'] for s in seg if s['name'] in LN]
        if len(names) < 5: continue
        L0 = np.array(LN[seg[0]['name']]['L']) if seg[0]['name'] in LN else None
        if L0 is None: continue
        W = []                                                     # (name, t, theta, s, n, room)
        for s in seg:
            v = LN.get(s['name'])
            if not v: continue
            T = np.array(s['T']); Li = np.array(v['L'])
            for l in v['lines']:
                if l['n'] < 900: continue
                a = math.radians(l['phi']); nl = Li.T @ np.array([math.cos(a), math.sin(a), 0]); pl = Li.T @ np.array([l['c'][0], l['c'][1], 0])
                nw = L0 @ (T[:3, :3] @ nl); pw = L0 @ (T[:3, :3] @ pl + T[:3, 3])
                W.append((s['name'], v['t'], math.atan2(nw[1], nw[0]), float(nw[:2] @ pw[:2]) / max(1e-6, np.hypot(*nw[:2])), l['n'], v['room']))
        if len(W) < 8: continue
        th = np.array([w[2] for w in W]); wt = np.array([w[4] for w in W], float)
        z = (wt * np.exp(4j * th)).sum(); th0 = np.angle(z) / 4        # dominant axis mod 90 deg
        cl = collections.defaultdict(list)
        for w in W:
            a = w[2] - th0; k = int(round(a / (math.pi / 2))) % 4; r = a - round(a / (math.pi / 2)) * math.pi / 2
            if abs(r) > math.radians(12): continue
            cl[(k % 2, +1 if k < 2 else -1)].append((-w[3] if k >= 2 else w[3], w[1], w[0], w[4], w[5]))
        res = dict(seg=si, video=FR[seg[0]['name']]['video'][-10:-4], t0=FR[seg[0]['name']]['t_s'], t1=FR[seg[-1]['name']]['t_s'], frames=len(seg), theta0_deg=math.degrees(th0), walls=[])
        for key, L in cl.items():
            L.sort(); g = [[L[0]]]
            for x in L[1:]:
                (g[-1].append(x) if x[0] - g[-1][-1][0] < 0.15 else g.append([x]))
            for G in g:
                ts = sorted(set(round(x[1], 1) for x in G))
                if len(G) >= 3 and ts[-1] - ts[0] >= 0.3:
                    c = np.array([x[0] for x in G]); rm = collections.Counter(x[4] for x in G).most_common(1)[0][0]
                    res['walls'].append(dict(axis=key[0], sign=key[1], coord=round(float(np.median(c)), 3), spread=round(float(c.max() - c.min()), 3), nframes=len(G), t0=ts[0], t1=ts[-1], room=rm, frames=[x[2] for x in G][:8]))
        res['walls'].sort(key=lambda w: (w['axis'], w['coord'])); out.append(res)
    json.dump(out, open(O + '/walls_dense_axes' + TAG + '.json', 'w'), indent=1)
    for r in out:
        print(f"seg{r['seg']} v{r['video']} {r['t0']}-{r['t1']}s frames {r['frames']} th0 {r['theta0_deg']:.0f}")
        for w in r['walls']: print(f"   ax{w['axis']} {'+' if w['sign']>0 else '-'} coord {w['coord']:8.2f} spread {w['spread']:.2f} n {w['nframes']:3d} t {w['t0']}-{w['t1']} {w['room']}")
