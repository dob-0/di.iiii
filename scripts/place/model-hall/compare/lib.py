"""lib.py - shared helpers for the pose/compare tools (walls agent, round 5, ledger N1812/N1815).
Camera: S24 main lens, f = 2457 px at 2160 px width (ASSUMED, no EXIF focal; same value as gallery A). Frames are used at 720x1280
(f = 819 px). Depth = MoGe-2 ViT-L metric point maps (Wang et al., arXiv 2507.02546) with that fov, stored every 4th pixel (180x320).
World frame = floor.json frame: x across gallery A (0 = left wall), y along it (0 = glass front), z up from the floor.
Camera convention in files: OpenCV (x right, y down, z forward); a pose is T_wc (camera -> world) as 4x4.
"""
import os, json, re, math
import numpy as np, cv2
D = '/mnt/data/footage/place-cinema-house-2026-10-30'
M = D + '/modelled'
FR = M + '/survey/frames'
CMP = M + '/compare'
W, H, F = 720, 1280, 2457.0 * 720 / 2160
K = np.array([[F, 0, W / 2], [0, F, H / 2], [0, 0, 1.0]])


def frames_index():
    return json.load(open(M + '/survey/index.json'))['frames']


def load_gray(name, small=True):
    p = (CMP + '/_work/small/' if small else FR + '/') + name
    return cv2.imread(p, cv2.IMREAD_GRAYSCALE)


def load_points(name):
    """(180,320,3) camera-frame points (m) + valid mask of one frame."""
    z = np.load(CMP + '/depth_all/' + name.replace('.jpg', '.npz'))
    return z['points'].astype(np.float32), z['mask']


def point_at(P, M_, uv):
    """3D points for pixel coords uv (N,2) in the 720x1280 image by nearest grid sample; NaN where masked."""
    g = np.round(uv / 4.0 - 0.5).astype(int)
    gx = np.clip(g[:, 0], 0, P.shape[1] - 1); gy = np.clip(g[:, 1], 0, P.shape[0] - 1)
    out = P[gy, gx].copy(); ok = M_[gy, gx] & np.isfinite(out).all(1) & (out[:, 2] > 0.3) & (out[:, 2] < 12)
    out[~ok] = np.nan
    return out


def floor_up(P, M_, iters=300, seed=0):
    """Per-frame up vector in camera coords + camera height from a RANSAC floor plane on the lower image half. None if not found."""
    rng = np.random.default_rng(seed)
    pts = P[P.shape[0] // 2:][M_[P.shape[0] // 2:]].reshape(-1, 3)
    pts = pts[np.isfinite(pts).all(1) & (pts[:, 2] < 8)]
    if len(pts) < 500: return None
    best = (0, None)
    for _ in range(iters):
        a, b, c = pts[rng.choice(len(pts), 3, replace=False)]
        n = np.cross(b - a, c - a); nn = np.linalg.norm(n)
        if nn < 1e-6: continue
        n /= nn
        if n[1] > 0: n = -n                       # up is -y in camera
        if n[1] > -0.85: continue                 # within ~32 deg of the image vertical
        d = -n @ a; inl = np.abs(pts @ n + d) < 0.04
        if inl.sum() > best[0]: best = (inl.sum(), (n, d, inl))
    if best[1] is None or best[0] < 0.12 * len(pts): return None
    n, d, inl = best[1]
    Q = pts[inl]; c = Q.mean(0); u, s, vt = np.linalg.svd(Q - c, full_matrices=False); n = vt[2]
    if n[1] > 0: n = -n
    return n / np.linalg.norm(n), float(abs(n @ c)), float(inl.mean())


def level_rot(up):
    """Rotation L (3x3) taking camera coords to leveled coords (x right, y forward, z up) given up in camera coords."""
    z = up / np.linalg.norm(up)
    x = np.array([1.0, 0, 0]); x = x - (x @ z) * z; x /= np.linalg.norm(x)
    y = np.cross(z, x)
    return np.stack([x, y, z])     # rows: leveled axes in camera coords


def rz(t):
    c, s = math.cos(t), math.sin(t)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1.0]])


def wrap(a): return (a + np.pi) % (2 * np.pi) - np.pi
