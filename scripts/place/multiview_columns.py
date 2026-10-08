#!/usr/bin/env python3
"""MOXIR multi-view column count: VGGT poses -> hall frame -> solvePnP refit on picked points -> per-row count.

Steps (each is a subcommand; data dir = /mnt/data/footage/place-moxir-photo-analysis-2026-10-07):
  align   VGGT predictions (vggt_poses.py) -> hall frame. Similarity (Umeyama, PAMI 1991) with RANSAC on
          3-D/3-D pairs: photo 032's floor pixels (OneFormer ADE 'floor', id 3) hit on y = 0 by 032's fitted
          camera (hall json geometry.cameras.photo-032, rms 3 px) <-> the same pixels unprojected with VGGT's
          depth and VGGT's 032 camera. Writes multiview/init_cams.json (initial camera per view).
  sheet   picking sheet for one view: the photo with a pixel grid and the model's columns / runway / lanterns /
          gate projected from the initial camera (identities only; picks are read on the photo itself).
  fit     OpenCV solvePnP (SOLVEPNP_SQPNP, then SOLVEPNP_ITERATIVE Levenberg-Marquardt refine) on hand-picked
          2-D/3-D correspondences (picks/<view>.json), intrinsics from EXIF (stated per view), no distortion
          term. Reports the rms reprojection error at the image's own resolution. Accept if rms <= 8 px.
  count   with an accepted camera: for each column row, sweep a column template (0.8 x 0.5 m shaft, y 1.5-5.5 m)
          along z every 0.1 m; score = mean |Sobel-x| on the template's two projected silhouette edges, normalised
          by the median score of the row. Peaks (scipy find_peaks, distance 2 m, prominence 0.25) are column
          candidates; a candidate within 1.2 m of a model grid z is 'model has it' (green), else red. Writes
          ~/Downloads/moxir/photo-analysis/columns-<view>-count.png and multiview/count-<view>.json.
          Every box is then checked by eye; the doc records what each red box is.
Hall frame: metres, x across (+ house right), y up, z along (0 = expansion joint, + toward the entry door).
"""
import argparse, json, os, sys
import numpy as np
import cv2

DATA = '/mnt/data/footage/place-moxir-photo-analysis-2026-10-07'
OUT = os.path.join(DATA, 'multiview')
PNG = os.path.expanduser('~/Downloads/moxir/photo-analysis')
HALL = os.environ.get('MOXIR_HALL_JSON', '')

# EXIF intrinsics. iPhone 14 Pro Max: 35 mm-equivalent focal referred to the full 4:3 frame diagonal
# (4032 x 3024 -> 5040 px; 43.27 mm): f_px = feq * 5040 / 43.267. The 3:2 frames are a crop of it.
# X-T5: FocalLength 23 mm x FocalPlaneXResolution 3289 px/cm = 7565 px.
F_EXIF = {'iphone-24': 24 * 5040 / 43.267, 'iphone-77': 77 * 5040 / 43.267, 'xt5-23': 23 * 328.9}


def load_hall():
    g = json.load(open(HALL))
    return g['geometry']


def model_points(g):
    """Named 3-D points that can be picked: column shaft feet/heads, runway, lantern and gate corners."""
    P = {}
    for x in g['rows_x_m']:
        for z in g['column_grid_z_m'] if abs(x) == 12 else [zz for zz in g['column_grid_z_m'] if abs(zz) != 0.5] + [0.0]:
            k = f'c{x:+.0f}/{z:+.1f}'
            P[k + '/foot'] = (x, 0.0, z)
            P[k + '/flare'] = (x, g['column_head']['flare_start_m'], z)
            P[k + '/head'] = (x, g['column_head']['head_top_m'], z)
    for l in g['lanterns']:
        for xx in l['x_m']:
            for zz in l['z_m']:
                P[f'lantern/{xx:+.0f}/{zz:+.2f}'] = (xx, g['deck_m'], zz)
    fg = g['far_gate']
    for sx in (-1, 1):
        P[f'gate/{sx:+d}/top'] = (sx * fg['w_m'] / 2, fg['h_m'], fg['z_m'])
        P[f'gate/{sx:+d}/foot'] = (sx * fg['w_m'] / 2, 0.0, fg['z_m'])
    d = g['door']
    for sx in (-1, 1):
        P[f'door/{sx:+d}/top'] = (sx * d['w_m'] / 2, d['h_m'], d['z_m'])
    return P


class Cam:
    """OpenCV pinhole: x_cam = R (X - C); u = K x_cam / z."""

    def __init__(self, K, R, C, size):
        self.K, self.R, self.C, self.size = np.array(K, float), np.array(R, float), np.array(C, float), tuple(size)

    def project(self, X):
        pc = (np.asarray(X, float) - self.C) @ self.R.T
        uv = pc @ self.K.T
        return uv[..., :2] / uv[..., 2:3], pc[..., 2]

    def floor_hit(self, u, v):
        d = np.stack([u, v, np.ones_like(u)], -1) @ np.linalg.inv(self.K).T @ self.R
        t = -self.C[1] / d[..., 1]
        return self.C + d * t[..., None], t

    def to_json(self):
        return {'K': self.K.tolist(), 'R': self.R.tolist(), 'C': self.C.tolist(), 'size': list(self.size)}

    @staticmethod
    def from_json(j):
        return Cam(j['K'], j['R'], j['C'], j['size'])


def cam032(g):
    c = g['cameras']['photo-032']
    K = [[555, 0, 624], [0, 555, 262], [0, 0, 1]]
    R = [[1, 0, 0], [0, -1, 0], [0, 0, -1]]  # level, looking -z (hall json note)
    return Cam(K, R, c['position_m'], (1280, 720))


def umeyama(A, B):
    """B ~ s Q A + T (Umeyama 1991)."""
    ma, mb = A.mean(0), B.mean(0)
    a, b = A - ma, B - mb
    U, S, Vt = np.linalg.svd(b.T @ a / len(A))
    D = np.eye(3); D[2, 2] = np.sign(np.linalg.det(U @ Vt))
    Q = U @ D @ Vt
    s = np.trace(np.diag(S) @ D) / (a ** 2).sum(1).mean()
    return s, Q, mb - s * Q @ ma


def cmd_align(a):
    g = load_hall()
    p = np.load(os.path.join(DATA, os.environ.get('MOXIR_VGGT', 'vggt-2026-10-07'), 'predictions.npz'))
    names = [str(n) for n in p['names']]
    i32 = [i for i, n in enumerate(names) if n.startswith('032-')][0]
    E, Kv, D, Dc, pad, wh = p['extrinsic'], p['intrinsic'], p['depth'], p['depth_conf'], p['pad_map'], p['orig_wh']
    sem = np.load(os.path.join(DATA, 'masks/032-file_76/sem.npy'))
    c = cam032(g)
    vv, uu = np.nonzero(sem == 3)
    sel = np.arange(len(uu))[::7]
    uu, vv = uu[sel].astype(float), vv[sel].astype(float)
    Xh, t = c.floor_hit(uu, vv)
    ok = (t > 11) & (t < 42)
    pl, pt, sx, sy = pad[i32]
    u5, v5 = pl + (uu + 0.5) * sx - 0.5, pt + (vv + 0.5) * sy - 0.5
    iu, iv = np.clip(np.round(u5).astype(int), 0, 517), np.clip(np.round(v5).astype(int), 0, 517)
    d = D[i32][iv, iu]
    ok &= Dc[i32][iv, iu] > np.percentile(Dc[i32], 30)
    Xc = (np.stack([u5, v5, np.ones_like(u5)], -1) @ np.linalg.inv(Kv[i32]).T) * d[:, None]
    Rv, tv = E[i32][:, :3], E[i32][:, 3]
    Xv = (Xc - tv) @ Rv
    A, B = Xv[ok], Xh[ok]
    rng = np.random.default_rng(0)
    best = None
    for _ in range(2000):
        idx = rng.choice(len(A), 3, replace=False)
        s, Q, T = umeyama(A[idx], B[idx])
        r = np.linalg.norm((s * A @ Q.T + T) - B, axis=1)
        inl = r < 1.5
        if best is None or inl.sum() > best.sum():
            best = inl
    s, Q, T = umeyama(A[best], B[best])
    r = np.linalg.norm((s * A[best] @ Q.T + T) - B[best], axis=1)
    os.makedirs(OUT, exist_ok=True)
    cams = {}
    for i, n in enumerate(names):
        W, H = wh[i]
        pl, pt, sx, sy = pad[i]
        Rv, tv = E[i][:, :3], E[i][:, 3]
        Cv = -Rv.T @ tv
        Rh = Rv @ Q.T
        Ch = s * Q @ Cv + T
        K = Kv[i].copy()
        K = np.array([[K[0, 0] / sx, 0, (K[0, 2] - pl + 0.5) / sx - 0.5], [0, K[1, 1] / sy, (K[1, 2] - pt + 0.5) / sy - 0.5], [0, 0, 1]])
        fwd = Rh[2]
        cams[n] = {**Cam(K, Rh, Ch, (int(W), int(H))).to_json(),
                   'yaw_deg': float(np.degrees(np.arctan2(fwd[0], -fwd[2]))), 'pitch_deg': float(np.degrees(np.arcsin(fwd[1])))}
    json.dump({'method': 'VGGT poses -> hall frame by Umeyama+RANSAC on 032 floor pixels (thr 1.5 m)',
               'scale': s, 'Q': Q.tolist(), 'T': T.tolist(), 'pairs': int(len(A)), 'inliers': int(best.sum()),
               'inlier_rms_m': float(np.sqrt((r ** 2).mean())), 'cams': cams},
              open(os.path.join(OUT, 'init_cams.json'), 'w'), indent=1)
    print(f'pairs {len(A)} inliers {best.sum()} rms {np.sqrt((r**2).mean()):.2f} m scale {s:.3f}')
    for n, cj in cams.items():
        C = cj['C']
        print(f"{n[:12]:12s} C ({C[0]:6.1f},{C[1]:5.1f},{C[2]:6.1f}) yaw {cj['yaw_deg']:7.1f} pitch {cj['pitch_deg']:6.1f} f {cj['K'][0][0]:7.0f} size {cj['size']}")


def draw_model(img, cam, g, scale, label=True, rows=None):
    P = model_points(g)
    H, W = img.shape[:2]
    for k, X in P.items():
        if rows and not any(k.startswith(f'c{r:+.0f}/') for r in rows) and k.startswith('c'):
            continue
        uv, z = cam.project(np.array(X))
        if z <= 0.5:
            continue
        u, v = uv * scale
        if not (-50 < u < W + 50 and -50 < v < H + 50):
            continue
        col = (0, 255, 255) if k.endswith('/foot') else (255, 0, 255) if k.endswith('/head') else (0, 160, 255)
        if k.endswith('/flare'):
            continue
        cv2.circle(img, (int(u), int(v)), 4, col, -1)
        if label and (k.endswith('/foot') or not k.startswith('c')):
            cv2.putText(img, k.replace('/foot', ''), (int(u) + 4, int(v) - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.38, col, 1, cv2.LINE_AA)
    for x in g['rows_x_m']:
        for z in g['column_grid_z_m']:
            a, za = cam.project(np.array([x, 0, z])); b, zb = cam.project(np.array([x, 7.06, z]))
            if za > 0.5 and zb > 0.5:
                cv2.line(img, tuple((a * scale).astype(int)), tuple((b * scale).astype(int)), (0, 220, 0), 1, cv2.LINE_AA)


def read_img(name):
    from PIL import Image, ImageOps
    for root in ('/mnt/data/footage/moxir-2026-10-17', '/mnt/data/footage/inbox/2026-09-29', '/mnt/data/footage/inbox/2026-10-07',
                 os.path.join(DATA, 'video-954'), os.path.join(DATA, 'undistort')):
        p = os.path.join(root, name)
        if os.path.exists(p):
            return cv2.cvtColor(np.array(ImageOps.exif_transpose(Image.open(p)).convert('RGB')), cv2.COLOR_RGB2BGR)
    raise FileNotFoundError(name)


def cam_for(name, prefer_fit=True):
    fp = os.path.join(OUT, f'fit-{name.split("-")[0]}.json')
    if prefer_fit and os.path.exists(fp):
        return Cam.from_json(json.load(open(fp))['cam'])
    return Cam.from_json(json.load(open(os.path.join(OUT, 'init_cams.json')))['cams'][name])


def cmd_sheet(a):
    g = load_hall()
    img = read_img(a.name)
    cam = cam_for(a.name, prefer_fit=a.fit)
    if a.f:
        cam.K[0, 0] = cam.K[1, 1] = a.f
        cam.K[0, 2], cam.K[1, 2] = cam.size[0] / 2, cam.size[1] / 2
    s = a.width / img.shape[1]
    sm = cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    if a.crop:
        x0, y0, x1, y1 = a.crop
        sm = cv2.resize(img[y0:y1, x0:x1], None, fx=a.width / (x1 - x0), fy=a.width / (x1 - x0), interpolation=cv2.INTER_CUBIC)
        s = a.width / (x1 - x0)
        cam = Cam(cam.K.copy(), cam.R, cam.C, cam.size); cam.K[0, 2] -= x0; cam.K[1, 2] -= y0
    if not a.nomodel:
        draw_model(sm, cam, g, s)
    step = a.grid
    x0, y0 = (a.crop[0], a.crop[1]) if a.crop else (0, 0)
    for u in range((x0 // step + 1) * step, x0 + int(sm.shape[1] / s), step):
        X = int((u - x0) * s); cv2.line(sm, (X, 0), (X, sm.shape[0]), (255, 255, 255), 1)
        cv2.putText(sm, str(u), (X + 2, 12), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (255, 255, 255), 1)
    for v in range((y0 // step + 1) * step, y0 + int(sm.shape[0] / s), step):
        Y = int((v - y0) * s); cv2.line(sm, (0, Y), (sm.shape[1], Y), (255, 255, 255), 1)
        cv2.putText(sm, str(v), (2, Y - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (255, 255, 255), 1)
    out = a.out or os.path.join(OUT, f'sheet-{a.name.split("-")[0]}.jpg')
    cv2.imwrite(out, sm, [cv2.IMWRITE_JPEG_QUALITY, 88])
    print(out, sm.shape)


def cmd_strips(a):
    """The band v0..v1 at native resolution, cut into n vertical strips stacked, model drawn thin from the
    current camera (identities only), ticks every 50 px in native coordinates."""
    g = load_hall()
    img = read_img(a.name)
    cam = cam_for(a.name, prefer_fit=a.fit)
    W = img.shape[1]
    band = img[a.v0:a.v1].copy()
    c2 = Cam(cam.K.copy(), cam.R, cam.C, cam.size); c2.K[1, 2] -= a.v0
    if not a.nomodel:
        draw_model(band, c2, g, 1.0)
    for u in range(0, W, 50):
        cv2.line(band, (u, 0), (u, 14 if u % 200 else 30), (255, 255, 255), 1)
        if u % 200 == 0:
            cv2.putText(band, str(u), (u + 2, 44), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
    for v in range(a.v0 - a.v0 % 50 + 50, a.v1, 50):
        cv2.line(band, (0, v - a.v0), (14 if v % 200 else 30, v - a.v0), (255, 255, 255), 1)
        if v % 200 == 0:
            for u in range(0, W, 400):
                cv2.putText(band, str(v), (u + 4, v - a.v0 - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
    sw = -(-W // a.n)
    strips = [band[:, i * sw:(i + 1) * sw] for i in range(a.n)]
    strips = [cv2.copyMakeBorder(t, 0, 6, 0, sw - t.shape[1], cv2.BORDER_CONSTANT, value=(0, 0, 255)) for t in strips]
    out = os.path.join(OUT, f'strips-{a.name.split("-")[0]}.jpg')
    cv2.imwrite(out, np.vstack(strips), [cv2.IMWRITE_JPEG_QUALITY, 90])
    print(out, 'strip width', sw)


def cmd_crops(a):
    """Native-resolution crops around given centres, tiled, with ticks in native pixels (for precise picks)."""
    img = read_img(a.name)
    r, tiles = a.size // 2, []
    for i in range(0, len(a.centres), 2):
        cu, cv_ = a.centres[i], a.centres[i + 1]
        x0, y0 = max(0, cu - r), max(0, cv_ - r)
        t = cv2.copyMakeBorder(img[y0:y0 + a.size, x0:x0 + a.size], 0, 0, 0, 0, cv2.BORDER_CONSTANT)
        t = cv2.resize(t, None, fx=a.zoom, fy=a.zoom, interpolation=cv2.INTER_CUBIC)
        t = cv2.copyMakeBorder(t, 0, a.size * a.zoom - t.shape[0], 0, a.size * a.zoom - t.shape[1], cv2.BORDER_CONSTANT)
        for k in range(0, a.size, a.tick):
            c = (255, 255, 255) if (x0 + k) % (a.tick * 4) else (0, 255, 255)
            cv2.line(t, (k * a.zoom, 0), (k * a.zoom, 8), c, 1); cv2.line(t, (0, k * a.zoom), (8, k * a.zoom), c, 1)
            cv2.line(t, (k * a.zoom, t.shape[0] - 8), (k * a.zoom, t.shape[0]), c, 1)
        cv2.putText(t, f'#{i//2} u{x0}-{x0+a.size} v{y0}-{y0+a.size} tick {a.tick}', (10, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
        cv2.rectangle(t, (0, 0), (t.shape[1] - 1, t.shape[0] - 1), (0, 0, 255), 1)
        tiles.append(t)
    while len(tiles) % a.cols:
        tiles.append(np.zeros_like(tiles[0]))
    rows_ = [np.hstack(tiles[i:i + a.cols]) for i in range(0, len(tiles), a.cols)]
    out = os.path.join(OUT, f'crops-{a.name.split("-")[0]}.jpg')
    cv2.imwrite(out, np.vstack(rows_), [cv2.IMWRITE_JPEG_QUALITY, 90])
    print(out)


def guard_ultrawide(name):
    """Refuse a pinhole fit on a raw ultra-wide frame. 024 (Galaxy S24 ultra-wide, 13 mm-eq) was fitted raw on
    2026-09-28 and came out at 37 px: its lines curve. Undistort first (undistort_plumb.py -> <stem>-undist.png)."""
    if '-undist' in name:
        return
    from PIL import Image
    for root in ('/mnt/data/footage/moxir-2026-10-17', '/mnt/data/footage/inbox/2026-09-29', '/mnt/data/footage/inbox/2026-10-07'):
        p = os.path.join(root, name)
        if os.path.exists(p):
            ex = Image.open(p).getexif().get_ifd(0x8769)
            feq = ex.get(41989)
            if feq is not None and feq < 20:
                raise SystemExit(f'REFUSED: {name} is ultra-wide (EXIF {feq} mm-eq). Undistort it first with scripts/place/undistort_plumb.py '
                                 f'and fit <stem>-undist.png.')


def cmd_fit(a):
    g = load_hall()
    P = model_points(g)
    pk = json.load(open(a.picks))
    name = pk['photo']
    guard_ultrawide(name)
    init = cam_for(name, prefer_fit=False)
    W, H = init.size
    f = pk['f_px']
    K = np.array([[f, 0, W / 2], [0, f, H / 2], [0, 0, 1]], float)
    X, x, keys = [], [], []
    for k, uv in pk['points'].items():
        X.append(P[k] if k in P else pk['extra_3d'][k]); x.append(uv); keys.append(k)
    X, x = np.array(X, float), np.array(x, float)
    ok, rv, tv = cv2.solvePnP(X, x, K, None, flags=cv2.SOLVEPNP_SQPNP)
    ok, rv, tv = cv2.solvePnP(X, x, K, None, rv, tv, useExtrinsicGuess=True, flags=cv2.SOLVEPNP_ITERATIVE)
    R = cv2.Rodrigues(rv)[0]
    C = (-R.T @ tv).ravel()
    cam = Cam(K, R, C, (W, H))
    uv, _ = cam.project(X)
    res = np.linalg.norm(uv - x, axis=1)
    rms = float(np.sqrt((res ** 2).mean()))
    # leave-one-out: how well each point is predicted when it is not used (a check against overfitting)
    loo = []
    for i in range(len(X)):
        m = np.arange(len(X)) != i
        _, r2, t2 = cv2.solvePnP(X[m], x[m], K, None, rv.copy(), tv.copy(), useExtrinsicGuess=True, flags=cv2.SOLVEPNP_ITERATIVE)
        c2 = Cam(K, cv2.Rodrigues(r2)[0], (-cv2.Rodrigues(r2)[0].T @ t2).ravel(), (W, H))
        loo.append(float(np.linalg.norm(c2.project(X[i])[0] - x[i])))
    fwd = R[2]
    out = {'photo': name, 'method': 'cv2.solvePnP SQPNP -> ITERATIVE (LM), no distortion', 'f_px': f, 'f_source': pk['f_source'],
           'n': len(X), 'rms_px': rms, 'max_px': float(res.max()), 'loo_rms_px': float(np.sqrt(np.mean(np.square(loo)))),
           'accepted': rms <= 8.0, 'C': C.tolist(), 'yaw_deg': float(np.degrees(np.arctan2(fwd[0], -fwd[2]))),
           'pitch_deg': float(np.degrees(np.arcsin(fwd[1]))), 'roll_deg': float(np.degrees(np.arctan2(-R[0, 1], R[1, 1]))),
           'residuals': {k: round(float(r), 2) for k, r in zip(keys, res)}, 'cam': cam.to_json()}
    json.dump(out, open(os.path.join(OUT, f'fit-{name.split("-")[0]}.json'), 'w'), indent=1)
    print(f"{name}: n {len(X)} rms {rms:.2f} px max {res.max():.1f} loo {out['loo_rms_px']:.1f} C {np.round(C,2)} yaw {out['yaw_deg']:.1f} pitch {out['pitch_deg']:.1f} roll {out['roll_deg']:.1f} accepted {out['accepted']}")
    for k, r in sorted(out['residuals'].items(), key=lambda kv: -kv[1])[:4]:
        print(f'   {k}: {r}')


def snap_edge(gx, p0, p1, snap, n=40):
    """Sample n rows between the picked ends of a vertical edge; at each, the |d/dx| maximum within +-snap px."""
    out = []
    for t in np.linspace(0, 1, n):
        u, v = p0[0] + t * (p1[0] - p0[0]), int(round(p0[1] + t * (p1[1] - p0[1])))
        lo, hi = int(u - snap), int(u + snap) + 1
        prof = gx[v, lo:hi]
        k = int(np.argmax(prof))
        if 0 < k < len(prof) - 1 and prof[k] > 8:
            d = prof[k - 1] - 2 * prof[k] + prof[k + 1]
            off = 0.5 * (prof[k - 1] - prof[k + 1]) / d if d != 0 else 0.0  # parabolic sub-pixel peak
            out.append((lo + k + off, v))
    return np.array(out)


def cmd_fit2(a):
    """Pose from vertical column edges (lines) + points, intrinsics from EXIF, LM from the VGGT pose.
    Residuals: for every snapped edge sample, the horizontal distance to the projected 3-D vertical edge (x, z
    known from the grid and the 0.8 x 0.5 m shaft); for every point, the reprojection error. An optional shared
    unknown height (the runway underside, 'y': 'h') is solved alongside when a floor point fixes the gauge."""
    from scipy.optimize import least_squares
    pk = json.load(open(a.picks))
    name = pk['photo']
    guard_ultrawide(name)
    img = read_img(name)
    gray = cv2.GaussianBlur(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), 1.2)
    gx = np.abs(cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)) / 4
    init = cam_for(name, prefer_fit=False)
    W, H = init.size
    f = pk['f_px']
    K = np.array([[f, 0, W / 2], [0, f, H / 2], [0, 0, 1]], float)
    E, CHK = [], []
    for e in pk.get('edges', []):
        smp = snap_edge(gx, e['p0'], e['p1'], pk.get('snap', 10))
        (CHK if e.get('check') else E).append((e, smp))
    Pts = [p for p in pk.get('points', []) if not p.get('check')]
    free_h = any(isinstance(p['X'][1], str) for p in Pts)
    rv0 = cv2.Rodrigues(init.R)[0].ravel()
    x0 = np.r_[rv0, init.C, [pk.get('h0', 7.06)] if free_h else []]

    def unpack(x):
        return cv2.Rodrigues(x[:3])[0], x[3:6], (x[6] if free_h else None)

    def resid(x, split=False):
        R, C, h = unpack(x)
        cam = Cam(K, R, C, (W, H))
        re, rp = [], []
        for e, smp in E:
            if len(smp) == 0:
                continue
            a_, _ = cam.project(np.array([e['x'], 0.0, e['z']])); b_, _ = cam.project(np.array([e['x'], 8.0, e['z']]))
            t = (smp[:, 1] - a_[1]) / (b_[1] - a_[1])
            re.append(smp[:, 0] - (a_[0] + t * (b_[0] - a_[0])))
        for p in Pts:
            X = [p['X'][0], h if isinstance(p['X'][1], str) else p['X'][1], p['X'][2]]
            uv, _ = cam.project(np.array(X, float))
            rp.append(uv - np.array(p['uv'], float))
        re = np.concatenate(re) if re else np.zeros(0)
        rp = np.concatenate(rp) if rp else np.zeros(0)
        pri = [(C[1] - pk['prior_cy'][0]) / pk['prior_cy'][1]] if 'prior_cy' in pk else []  # gauge: camera height prior (m, sd)
        return (re, rp) if split else np.r_[re, rp, pri]

    r = least_squares(resid, x0, loss='soft_l1', f_scale=3.0, x_scale='jac')
    # outlier edges (snapped onto a pipe or a neighbour): drop an edge whose rms > max(15 px, 2.5 x median), refit once
    re_, _ = resid(r.x, split=True)
    k, per = 0, []
    for e, smp in E:
        per.append(np.sqrt(np.mean(re_[k:k + len(smp)] ** 2)) if len(smp) else np.inf); k += len(smp)
    lim = max(15.0, 2.5 * float(np.median(per)))
    dropped = [e.get('col') for (e, smp), q in zip(E, per) if q > lim or len(smp) < 5]
    if dropped:
        E[:] = [(e, smp) for (e, smp), q in zip(E, per) if not (q > lim or len(smp) < 5)]
        r = least_squares(resid, r.x, loss='soft_l1', f_scale=3.0, x_scale='jac')
        print('   dropped edges:', dropped)
    r = least_squares(resid, r.x, method='lm', x_scale='jac') if len(resid(r.x)) > len(x0) else r
    re, rp = resid(r.x, split=True)
    R, C, h = unpack(r.x)
    cam = Cam(K, R, C, (W, H))
    allr = np.r_[re, np.linalg.norm(rp.reshape(-1, 2), axis=1) if len(rp) else []]
    rms = float(np.sqrt(np.mean(allr ** 2)))
    J = r.jac
    try:
        cov = np.linalg.inv(J.T @ J) * (np.sum(r.fun ** 2) / max(1, len(r.fun) - len(r.x)))
        sd = np.sqrt(np.diag(cov))
    except np.linalg.LinAlgError:
        sd = np.full(len(r.x), np.nan)
    fwd = R[2]
    out = {'photo': name, 'method': 'VGGT pose (Umeyama-aligned) -> LM on column-edge lines (Lowe 1991; Kumar & Hanson 1994) + points; EXIF intrinsics, no distortion',
           'f_px': f, 'f_source': pk['f_source'], 'n_edge_samples': int(len(re)), 'n_edges': len(E), 'n_points': len(Pts),
           'rms_px': rms, 'rms_edges_px': float(np.sqrt(np.mean(re ** 2))) if len(re) else None,
           'rms_points_px': float(np.sqrt(np.mean(np.sum(rp.reshape(-1, 2) ** 2, 1)))) if len(rp) else None,
           'mrad_per_px': 1000 / f, 'accepted': rms <= 8.0, 'C': C.tolist(), 'C_sd_m': sd[3:6].tolist(),
           'h_fitted_m': h, 'h_sd_m': float(sd[6]) if free_h else None,
           'yaw_deg': float(np.degrees(np.arctan2(fwd[0], -fwd[2]))), 'pitch_deg': float(np.degrees(np.arcsin(fwd[1]))),
           'cam': cam.to_json()}
    json.dump(out, open(os.path.join(OUT, f'fit-{name.split("-")[0]}.json'), 'w'), indent=1)
    print(f"{name}: edges {len(E)} ({len(re)} samples) points {len(Pts)} rms {rms:.2f} px (edges {out['rms_edges_px']}, points {out['rms_points_px']}) "
          f"C {np.round(C, 2)} sd {np.round(sd[3:6], 2)} yaw {out['yaw_deg']:.1f} pitch {out['pitch_deg']:.1f} h {h} accepted {out['accepted']}")
    k = 0
    for e, smp in E:
        n = len(smp)
        print(f"   edge x {e['x']} z {e['z']}: {n} samples, rms {np.sqrt(np.mean(re[k:k+n]**2)) if n else float('nan'):.1f}")
        k += n
    for p, d in zip(Pts, np.linalg.norm(rp.reshape(-1, 2), axis=1) if len(rp) else []):
        print(f"   point {p['X']}: {d:.1f}")
    # held-out edges: where along the row does the fitted camera put them? (independent of the fit)
    chk = []
    for e, smp in CHK:
        best = None
        for z in np.arange(e['z'] - 4, e['z'] + 4, 0.01):
            a_, _ = cam.project(np.array([e['x'], 0.0, z])); b_, _ = cam.project(np.array([e['x'], 8.0, z]))
            t = (smp[:, 1] - a_[1]) / (b_[1] - a_[1])
            rr = np.sqrt(np.mean((smp[:, 0] - (a_[0] + t * (b_[0] - a_[0]))) ** 2))
            if best is None or rr < best[1]:
                best = (z, rr)
        chk.append({'what': e.get('col'), 'model_z': e['z'], 'measured_z': round(float(best[0]), 2), 'rms_px': round(float(best[1]), 1), 'n': int(len(smp))})
        print(f"   CHECK {e.get('col')}: model z {e['z']} -> measured z {best[0]:.2f} (line rms {best[1]:.1f} px, {len(smp)} samples)")
    out['held_out_edges'] = chk
    out['dropped_edges'] = dropped
    json.dump(out, open(os.path.join(OUT, f'fit-{name.split("-")[0]}.json'), 'w'), indent=1)


def cmd_count(a):
    from scipy.signal import find_peaks
    g = load_hall()
    name = a.name
    fit = json.load(open(os.path.join(OUT, f'fit-{name.split("-")[0]}.json')))
    cam = Cam.from_json(fit['cam'])
    img = read_img(name)
    gray = cv2.GaussianBlur(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), 1.5)
    gx = np.abs(cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3))
    H, W = gray.shape
    grid = np.array(g['column_grid_z_m'])
    rows = a.rows
    boxes, curves = [], {}
    ys = np.linspace(1.5, 5.5, 40)
    for x in rows:
        zs = np.arange(-54.5, 54.6, 0.1)
        sc = np.full(len(zs), np.nan)
        for j, z in enumerate(zs):
            # the 4 vertical edges of the shaft; the silhouette = the extreme two in u
            corners = [(x + dx, z + dz) for dx in (-0.4, 0.4) for dz in (-0.25, 0.25)]
            uvs = []
            for cx_, cz_ in corners:
                uv, d = cam.project(np.stack([np.full_like(ys, cx_), ys, np.full_like(ys, cz_)], -1))
                if (d <= 1).any():
                    break
                uvs.append(uv)
            if len(uvs) < 4:
                continue
            mu = [u[:, 0].mean() for u in uvs]
            vals = []
            for e in (int(np.argmin(mu)), int(np.argmax(mu))):
                u, v = np.round(uvs[e][:, 0]).astype(int), np.round(uvs[e][:, 1]).astype(int)
                m = (u >= 2) & (u < W - 2) & (v >= 0) & (v < H)
                if m.mean() < 0.8:
                    vals = []
                    break
                vals.append(np.max([gx[v[m], u[m] + k] for k in (-1, 0, 1)], 0).mean())
            if len(vals) == 2:
                sc[j] = min(vals)  # both silhouette edges must be present
        ok = np.isfinite(sc)
        if ok.sum() < 30:
            continue
        nrm = sc / np.nanmedian(sc)
        curves[str(x)] = {'z': zs[ok].round(2).tolist(), 'score': nrm[ok].round(3).tolist()}
        y = np.where(ok, nrm, 0)
        pk, pr = find_peaks(y, distance=20, prominence=a.prom)
        for i in pk:
            z = float(zs[i])
            near = float(grid[np.argmin(np.abs(grid - z))])
            dist = abs(near - z)
            uv, d = cam.project(np.array([[x - 0.4, 0, z], [x + 0.4, 0, z], [x - 0.4, 7.06, z], [x + 0.4, 7.06, z],
                                          [x, 0, z - 0.25], [x, 0, z + 0.25], [x, 7.06, z - 0.25], [x, 7.06, z + 0.25]]))
            boxes.append({'row_x': x, 'z': round(z, 2), 'score': round(float(y[i]), 2), 'nearest_grid_z': near,
                          'dz': round(dist, 2), 'model_has': dist <= 1.2, 'range_m': round(float(np.linalg.norm(cam.C - [x, 2, z])), 1),
                          'box_px': [int(uv[:, 0].min()), int(uv[:, 1].min()), int(uv[:, 0].max()), int(uv[:, 1].max())]})
    auto = boxes
    if a.eye:
        # the boxes the owner sees are the eye-checked columns; the automatic peaks are kept in the json only
        # (the sweep also fires on wall posts, window mullions and pipes, so a peak is a candidate, not a column)
        boxes = []
        for b in json.load(open(a.eye))['columns']:
            x, z = b['row_x'], b['z']
            uv, d = cam.project(np.array([[x - 0.4, 0, z], [x + 0.4, 0, z], [x - 0.4, 7.06, z], [x + 0.4, 7.06, z],
                                          [x, 0, z - 0.25], [x, 0, z + 0.25], [x, 7.06, z - 0.25], [x, 7.06, z + 0.25]]))
            boxes.append({**b, 'box_px': [int(uv[:, 0].min()), int(uv[:, 1].min()), int(uv[:, 0].max()), int(uv[:, 1].max())]})
    vis = img.copy()
    lw = max(2, W // 900)
    for n, b in enumerate(boxes, 1):
        b['n'] = n
        x0, y0, x1, y1 = b['box_px']
        col = (0, 200, 0) if b['model_has'] else (0, 0, 255)
        cv2.rectangle(vis, (x0, y0), (x1, y1), col, lw)
        cv2.putText(vis, str(n), (x0, max(12, y0 - 4)), cv2.FONT_HERSHEY_SIMPLEX, 0.45 * lw, col, lw, cv2.LINE_AA)
    # model grid feet as small yellow ticks (what the model has), so a missing real column is visible too
    for x in rows:
        for z in grid:
            uv, d = cam.project(np.array([[x, 0, z], [x, 7.06, z]]))
            if (d > 1).all():
                cv2.line(vis, tuple(uv[0].astype(int)), tuple(uv[1].astype(int)), (0, 230, 230), max(1, lw // 2), cv2.LINE_AA)
    cv2.putText(vis, f"{name}  rms {fit['rms_px']:.1f} px  green = model has it, red = model lacks it, yellow = model grid line",
                (10, H - 15), cv2.FONT_HERSHEY_SIMPLEX, 0.5 * lw, (255, 255, 255), lw, cv2.LINE_AA)
    s = min(1.0, 2400 / W)
    os.makedirs(PNG, exist_ok=True)
    out = os.path.join(PNG, f'columns-{name.split("-")[0]}-count.png')
    cv2.imwrite(out, cv2.resize(vis, None, fx=s, fy=s, interpolation=cv2.INTER_AREA))
    json.dump({'photo': name, 'rms_px': fit['rms_px'], 'rows': rows, 'boxes': boxes, 'auto_candidates': auto, 'curves': curves,
               'params': {'ys_m': [1.5, 5.5], 'shaft_m': [0.8, 0.5], 'peak_distance_m': 2.0, 'prominence': a.prom, 'grid_tol_m': 1.2}},
              open(os.path.join(OUT, f'count-{name.split("-")[0]}.json'), 'w'), indent=1)
    print(out)
    for b in boxes:
        print(f"  {b['n']:2d} row {b['row_x']:+.0f} z {b['z']:6.2f} score {b.get('score', '-')} grid {b.get('nearest_grid_z', '-')} dz {b.get('dz', '-')} D {b.get('range_m', '-')} {'GREEN' if b['model_has'] else 'RED'} px {b['box_px']}")


def main():
    global HALL
    ap = argparse.ArgumentParser()
    ap.add_argument('--hall', default=HALL)
    sp = ap.add_subparsers(dest='cmd', required=True)
    sp.add_parser('align')
    s = sp.add_parser('sheet'); s.add_argument('name'); s.add_argument('--width', type=int, default=1800)
    s.add_argument('--grid', type=int, default=200); s.add_argument('--crop', type=int, nargs=4); s.add_argument('--out')
    s.add_argument('--f', type=float); s.add_argument('--fit', action='store_true'); s.add_argument('--nomodel', action='store_true')
    s = sp.add_parser('strips'); s.add_argument('name'); s.add_argument('v0', type=int); s.add_argument('v1', type=int)
    s.add_argument('--n', type=int, default=3); s.add_argument('--fit', action='store_true'); s.add_argument('--nomodel', action='store_true')
    s = sp.add_parser('crops'); s.add_argument('name'); s.add_argument('centres', type=int, nargs='+')
    s.add_argument('--size', type=int, default=240); s.add_argument('--zoom', type=int, default=2); s.add_argument('--tick', type=int, default=10)
    s.add_argument('--cols', type=int, default=4)
    s = sp.add_parser('fit'); s.add_argument('picks')
    s = sp.add_parser('fit2'); s.add_argument('picks')
    s = sp.add_parser('count'); s.add_argument('name'); s.add_argument('--rows', type=float, nargs='+', default=[-12, 12, -36, 36])
    s.add_argument('--prom', type=float, default=0.25); s.add_argument('--eye')
    a = ap.parse_args()
    HALL = a.hall
    {'align': cmd_align, 'sheet': cmd_sheet, 'crops': cmd_crops, 'strips': cmd_strips, 'fit2': cmd_fit2, 'fit': cmd_fit, 'count': cmd_count}[a.cmd](a)


if __name__ == '__main__':
    main()
