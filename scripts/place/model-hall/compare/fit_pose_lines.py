#!/usr/bin/env python3
"""fit_pose_lines.py - camera pose of a survey frame against a ROOM BOX (shell lines), no frame chain needed.
  fit_pose_lines.py <frame.jpg> --box x0 y0 x1 y1 H [--out pose.json] [--f F]
Prior: pitch/roll and camera height from the MoGe-2 floor plane (lib.floor_up), so only (x, y, yaw) are searched: coarse grid, then
Nelder-Mead on the chamfer distance (px, truncated 25) between the projected box edges (floor/ceiling/corner lines) and Canny edges of the
frame (Hartley-Zisserman ch. 7 style line-model fit; Criminisi 2000 for the level prior). R_wc = rz(yaw) @ L  (L = lib.level_rot: camera -> leveled).
Writes pose json {name,T_wc,f,w,h,cost_px,x,y,yaw_deg,h_cam}. Cost is reported; a pose with cost > 12 px is a failed fit (exit 2)."""
import sys, json, argparse, os, math, numpy as np, cv2
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import lib
from scipy.optimize import minimize

def box_edges(x0, y0, x1, y1, H, n=60):
    c = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]; segs = []
    for z in (0, H):
        for i in range(4): segs.append((c[i] + (z,), c[(i + 1) % 4] + (z,)))
    for i in range(4): segs.append((c[i] + (0,), c[i] + (H,)))
    pts = []
    for a, b in segs:
        a, b = np.array(a, float), np.array(b, float)
        pts.append(a + (b - a) * np.linspace(0, 1, n)[:, None])
    return np.vstack(pts)

def pose_T(x, y, yaw, L, h):
    T = np.eye(4); T[:3, :3] = lib.rz(yaw) @ L; T[:3, 3] = [x, y, h]; return T

def cost(par, pts, L, h, DT, f):
    x, y, yaw = par; T = pose_T(x, y, yaw, L, h); c = (np.linalg.inv(T) @ np.c_[pts, np.ones(len(pts))].T).T[:, :3]
    ok = c[:, 2] > 0.15
    if ok.sum() < 20: return 25.0
    u = f * c[ok, 0] / c[ok, 2] + lib.W / 2; v = f * c[ok, 1] / c[ok, 2] + lib.H / 2
    ins = (u >= 0) & (u < lib.W) & (v >= 0) & (v < lib.H)
    if ins.sum() < 15: return 25.0
    d = DT[v[ins].astype(int), u[ins].astype(int)]
    return float(np.minimum(d, 25).mean() * 0.5 + 12.5 * (1 - ins.sum() / ok.sum()) + 12.5 * (1 - ok.sum() / len(pts)) * 0.5)

def fit(frame, box, f=lib.F, seed_grid=True):
    name = os.path.basename(frame); P, M = lib.load_points(name); up = lib.floor_up(P, M)
    if up is None: raise SystemExit('no floor plane in ' + name)
    L = lib.level_rot(up[0]); h = up[1]
    g = cv2.imread(lib.CMP + '/_work/small/' + name, 0); E = cv2.Canny(cv2.GaussianBlur(g, (5, 5), 0), 40, 110)
    DT = cv2.distanceTransform(255 - E, cv2.DIST_L2, 3); pts = box_edges(*box)
    x0, y0, x1, y1, H = box; best = []
    for x in np.linspace(x0 + 0.2, x1 - 0.2, 6):
        for y in np.linspace(y0 + 0.2, y1 - 0.2, 8 if y1 - y0 < 25 else 24):
            for yaw in np.radians(np.arange(0, 360, 10)):
                best.append((cost((x, y, yaw), pts, L, h, DT, f), x, y, yaw))
    best.sort(); res = None
    for c0, x, y, yaw in best[:12]:
        r = minimize(cost, (x, y, yaw), args=(pts, L, h, DT, f), method='Nelder-Mead', options=dict(xatol=0.01, fatol=0.01, maxiter=300))
        if res is None or r.fun < res.fun: res = r
    x, y, yaw = res.x; T = pose_T(x, y, yaw, L, h)
    return dict(name=name, T_wc=T.tolist(), f=f, w=lib.W, h=lib.H, cost_px=float(res.fun), x=float(x), y=float(y), yaw_deg=float(math.degrees(yaw) % 360), h_cam=float(h))

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('frame'); ap.add_argument('--box', nargs=5, type=float, required=True); ap.add_argument('--out'); ap.add_argument('--f', type=float, default=lib.F)
    a = ap.parse_args(); r = fit(a.frame, a.box, a.f); print(json.dumps({k: v for k, v in r.items() if k != 'T_wc'})); a.out and json.dump(r, open(a.out, 'w'))
    sys.exit(2 if r['cost_px'] > 12 else 0)
