"""openings.py - width/height of door/arch openings from MoGe-2 point maps of frontal dense frames (round 5 dense pass, ledger N1834).
Method: single-view metrology (Criminisi/Reid/Zisserman 2000). Per frame: floor plane -> leveled points (x right, y forward, z up, camera at origin, height h);
frontal wall = the wall line (walls_dense_lines.json) whose normal faces the camera (|phi+90|<12 deg) at distance d (>=2 m); the opening = connected region of
pixels inside the wall's lateral span whose leveled y exceeds d+0.45 m (points seen THROUGH the wall) and that sits between wall pixels left and right.
Edges are taken from the viewing rays at the wall plane: x = d*rx/ry, height = h + d*rz/ry (a hole seen through a plane is bounded by the plane's rays, not by far points).
usage: openings.py -> openings/openings_frames.json"""
import sys, json, math, numpy as np, cv2
sys.path.insert(0, '/mnt/data/footage/place-cinema-house-2026-10-30/modelled/compare'); import lib
O = lib.M + '/dense'; KEPT = json.load(open(O + '/kept.json')); FR = KEPT['frames']
LN = json.load(open(O + '/walls_dense_lines.json'))
out = {}
for name in KEPT['depth']:
    f = FR[name]
    if not (f.get('frontal') or f.get('opening')) or name not in LN: continue
    z = np.load(f'{O}/depth/{name}.npz'); P = z['points'].astype(np.float32); Mk = z['mask']
    L = np.array(LN[name]['L']); h = LN[name]['h']
    fr = [l for l in LN[name]['lines'] if abs(((l['phi'] + 90 + 180) % 360) - 180) < 12 and l['d'] > 2.0 and l['n'] >= 600]
    if not fr: continue
    w = max(fr, key=lambda l: l['n']); d = w['d']
    ok = Mk & np.isfinite(P).all(2) & (P[..., 2] > 0.3)
    U = P @ L.T                              # leveled
    far = ok & (U[..., 1] > d + 0.45) & (U[..., 1] < 12)
    ray = U / np.maximum(np.abs(U[..., 1:2]), 1e-3)          # (rx/ry, 1, rz/ry)
    X = d * ray[..., 0]; Zh = h + d * ray[..., 2]
    on = ok & (np.abs(U[..., 1] - d) < 0.12)                  # wall pixels
    # wall lateral span from the line itself (leveled x of wall points)
    xs = X[on]
    if len(xs) < 300: continue
    lo, hi = np.percentile(xs, 2), np.percentile(xs, 98)
    cand = far & (X > lo) & (X < hi) & (Zh > 0.0) & (Zh < 3.6)
    cand = cv2.morphologyEx(cand.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(cand)
    best = None
    for i in range(1, n):
        a = st[i, 4]
        if a < 120: continue
        m = lab == i; x = X[m]; zz = Zh[m]
        x0, x1 = np.percentile(x, 2), np.percentile(x, 98); z1 = np.percentile(zz, 98); z0 = np.percentile(zz, 2)
        # wall pixels on both sides within 0.6 m of the hole
        left = (on & (X > x0 - 0.6) & (X < x0)).sum(); right = (on & (X < x1 + 0.6) & (X > x1)).sum()
        if left < 40 or right < 40: continue            # not framed by wall: a view past the wall edge, not an opening
        if (x1 - x0) < 0.8 or z1 < 1.6: continue
        c = dict(width=float(x1 - x0), x0=float(x0), x1=float(x1), top=float(z1), bottom=float(z0), area=int(a), d=float(d), nwall=int(on.sum()))
        if best is None or a > best['area']: best = c
    if best: best.update(room=f['room'], t=f['t_s'], video=f['video'][9:15] if False else f['video'], opening_flag=bool(f.get('opening'))); out[name] = best
json.dump(out, open(O + '/openings/openings_frames.json', 'w'))
print(len(out), 'frames with an opening candidate')
