#!/usr/bin/env python3
"""vp_camera.py - camera of a corridor frame from its vanishing points (camera first, as the artist does).

Method: line segments by LSD (von Gioi et al., IPOL 2012; cv2.createLineSegmentDetector). Vanishing point 1 (corridor axis) =
RANSAC intersection of the long non-vertical segments (angle-residual score, Tardif ICCV 2009 style J-linkage reduced to a single
dominant point); vanishing point 2 (vertical) = same on the segments that do not fit VP1 and are within 35 deg of the image
vertical. For zero skew and principal point at the centre, orthogonal directions give f^2 = -(v1-c).(v2-c) (Hartley & Zisserman
ch. 8.8, Caprile & Torre 1990), an estimate of f independent of any EXIF; R follows from K^-1 v1, K^-1 v2 (columns: corridor x, up z).

  python3 vp_camera.py <frame.jpg> [--f 2500] [--out overlay.png]      -> JSON: vp1, vp2, f_from_vps, R (world<-camera), lines used
Call as a module for `solve(img_gray, f=None)`.
"""
import sys, json, argparse
import numpy as np, cv2


def segments(gray, min_len=60):
    lsd = cv2.createLineSegmentDetector(cv2.LSD_REFINE_STD)
    lines = lsd.detect(gray)[0]
    if lines is None:
        return np.zeros((0, 4))
    L = lines[:, 0, :]
    ln = np.hypot(L[:, 2] - L[:, 0], L[:, 3] - L[:, 1])
    return L[ln >= min_len]


def homog_line(s):
    p = np.array([s[0], s[1], 1.0]); q = np.array([s[2], s[3], 1.0]); l = np.cross(p, q)
    return l / (np.hypot(l[0], l[1]) + 1e-12)


def resid_deg(s, v):
    """Angle between the segment and the line from its midpoint to the vanishing point v (homogeneous)."""
    m = np.array([(s[0] + s[2]) / 2, (s[1] + s[3]) / 2])
    vv = v[:2] / v[2] if abs(v[2]) > 1e-9 else None
    d = np.array([s[2] - s[0], s[3] - s[1]]); d = d / (np.linalg.norm(d) + 1e-12)
    t = (vv - m) if vv is not None else v[:2]
    t = t / (np.linalg.norm(t) + 1e-12)
    return np.degrees(np.arccos(min(1.0, abs(d @ t))))


def ransac_vp(S, w, tol=1.5, iters=4000, seed=1):
    if len(S) < 2:
        return np.array([0, 0, 1.0]), np.zeros(len(S), bool)
    rng = np.random.default_rng(seed); best, bi = None, -1
    Ls = np.array([homog_line(s) for s in S])
    for _ in range(iters):
        i, j = rng.choice(len(S), 2, replace=False)
        v = np.cross(Ls[i], Ls[j])
        if np.linalg.norm(v) < 1e-9:
            continue
        v = v / np.linalg.norm(v)
        r = np.array([resid_deg(s, v) for s in S])
        sc = (w * (r < tol)).sum()
        if sc > bi:
            best, bi = (v, r < tol), sc
    v, inl = best
    # refine: least squares of the inlier lines' intersection
    A = Ls[inl]; _, _, vt = np.linalg.svd(A); v = vt[-1]
    return v / np.linalg.norm(v), np.array([resid_deg(s, v) < tol for s in S])


def solve(gray, f=None):
    h, w = gray.shape
    S = segments(gray)
    ln = np.hypot(S[:, 2] - S[:, 0], S[:, 3] - S[:, 1])
    ang = np.degrees(np.arctan2(S[:, 3] - S[:, 1], S[:, 2] - S[:, 0])) % 180
    near_vert = np.abs(ang - 90) < 35
    horiz_like = ~near_vert & (np.abs(ang - 0) > 4) & (np.abs(ang - 180) > 4)  # skip exactly horizontal (picture rails seen frontally)
    S1 = S[horiz_like]; w1 = ln[horiz_like]
    v1, in1 = ransac_vp(S1, w1)
    rest = S[near_vert]; wr = ln[near_vert]
    v2, in2 = ransac_vp(rest, wr, tol=1.0)
    c = np.array([w / 2, h / 2])
    p1 = v1[:2] / v1[2]; p2 = v2[:2] / v2[2] if abs(v2[2]) > 1e-9 else None
    f_est = None
    if p2 is not None:
        d = -(p1 - c) @ (p2 - c)
        f_est = float(np.sqrt(d)) if d > 0 else None
    # f: the VP-orthogonality estimate is noisy when the vertical VP is far away (seen: 1378..1853 px at half res vs 1228 assumed);
    # the caller's f is used for R, f_from_vps is reported as a check, not used
    ff = f or (f_est if f_est else 1228.5)
    v2_ok = p2 is not None and in2.sum() >= 6
    K = np.array([[ff, 0, c[0]], [0, ff, c[1]], [0, 0, 1.0]])
    r1 = np.linalg.solve(K, np.array([p1[0], p1[1], 1.0])); r1 /= np.linalg.norm(r1)
    r3 = np.linalg.solve(K, np.array([p2[0], p2[1], 1.0])) if v2_ok else np.array([0, -1, 0.0]); r3 /= np.linalg.norm(r3)
    # sign: world x (corridor, away) must point forward (z_cam > 0); world up must point to image-up (y_cam < 0)
    if r1[2] < 0: r1 = -r1
    if r3[1] > 0: r3 = -r3
    r3 = r3 - (r3 @ r1) * r1; r3 /= np.linalg.norm(r3)
    r2 = np.cross(r3, r1)  # world y (left-handed check by caller): y = z x x
    Rwc = np.stack([r1, r2, r3])  # rows = world axes expressed in camera coordinates: x_w = R @ x_c ... (camera -> world)
    return dict(vp1=p1.tolist(), vp2=(p2.tolist() if p2 is not None else None), f_from_vps=f_est, f_used=ff, K=K.tolist(),
                R_world_from_cam=Rwc.tolist(), n_lines=int(len(S)), n_vp1=int(in1.sum()), n_vp2=int(in2.sum()), vertical_from='vp2' if v2_ok else 'image up (roll 0 assumed)'), S1[in1], rest[in2]


if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('frame'); ap.add_argument('--f', type=float); ap.add_argument('--out')
    a = ap.parse_args()
    img = cv2.imread(a.frame); half = cv2.resize(img, (img.shape[1] // 2, img.shape[0] // 2))
    g = cv2.cvtColor(half, cv2.COLOR_BGR2GRAY)
    res, L1, L2 = solve(g, a.f / 2 if a.f else None)
    for k in ('vp1', 'vp2'):
        if res[k]: res[k] = [x * 2 for x in res[k]]
    for k in ('f_from_vps', 'f_used'):
        if res[k]: res[k] *= 2
    print(json.dumps({k: v for k, v in res.items() if k not in ('K',)}, indent=0)[:900])
    if a.out:
        o = half.copy()
        for s in L1: cv2.line(o, (int(s[0]), int(s[1])), (int(s[2]), int(s[3])), (0, 255, 255), 2)
        for s in L2: cv2.line(o, (int(s[0]), int(s[1])), (int(s[2]), int(s[3])), (255, 0, 255), 2)
        cv2.imwrite(a.out, o)
