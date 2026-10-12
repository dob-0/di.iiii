#!/usr/bin/env python3
"""Fixed metal objects around the white bulk bags (MOXIR hall, x -8..14, z 10..40), placed from several directions.

Method (named, with its error):
1. VGGT-1B (Wang et al., CVPR 2025) on 56 views: the 44 of run vggt-2026-10-07b, plus the sharpest frame
   (Laplacian variance, Pech-Pacheco et al. 2000) within +-0.2 s of 954 t3.6, 958 t0.5/2/3.5 and
   963 t0.5/2/3.5/5/6.5, plus the X-T5 stills 959, 964, 965. Run: vggt-2026-10-07c.
2. Hall frame: the same similarity (Umeyama 1991 + RANSAC) on photo 032's floor pixels as
   `multiview_columns.py align` (032's level camera f 555, cx 624, cy 262, C (-1.7, 6.88, 50.2)).
   Written to <run>/align/init_cams.json; 0.73 m rms on the floor.
3. `plan`: every view's VGGT depth (confidence above its own median) is lifted to the hall frame. Points
   0.6-7 m up and inside the area are binned on a 0.25 m plan grid, one panel per DIRECTION group
   (from the entry side, from the far side, from inside/the sides). A fixed object shows as the same
   footprint in groups that saw it from different directions.
4. `tri`: picked pixels of one feature in two or more views are triangulated by linear DLT
   (Hartley & Zisserman 2004, 12.2) on the aligned VGGT cameras; reported with the per-view
   depth-map point and the ray miss distance. Picks: picks/bags-objects.json.
5. `draw`: the massing boxes (old and new) projected on a view through its aligned camera
   (or 032's own fitted camera).

Run (CPU only; reads the kept predictions):
  MOXIR_HALL_JSON=scripts/place/rigs/moxir-hall-2026-10-07.hall.json \
  ~/tools/vggt/.venv/bin/python scripts/place/bags_multiview.py plan
"""
import argparse, json, os, sys
import numpy as np
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from multiview_columns import Cam  # noqa: E402

RUN = os.environ.get('MOXIR_VGGT_RUN', '/mnt/data/footage/place-moxir-photo-analysis-2026-10-07/vggt-2026-10-07c')
AREA = {'x': (-8.0, 14.0), 'z': (10.0, 40.0), 'y': (0.6, 7.0)}
CELL = 0.25


def load():
    p = np.load(os.path.join(RUN, 'predictions.npz'))
    al = json.load(open(os.path.join(RUN, 'align', 'init_cams.json')))
    names = [str(n) for n in p['names']]
    # A fitted camera replaces the VGGT-initial one for its view (MOXIR_CAM_FITS: comma-separated fit files).
    for path in filter(None, os.environ.get('MOXIR_CAM_FITS', '').split(',')):
        fit = json.load(open(path))
        al['cams'][fit['view']] = {'K': [[fit['f'], 0, fit['cx']], [0, fit['f'], fit['cy']], [0, 0, 1]], 'R': fit['R'],
                                   'C': fit['C'], 'size': [fit['width'], fit['height']]}
    return p, al, names


def lift(p, al, i):
    """Hall-frame points of view i (518-px depth grid), with a confidence mask."""
    s, Q, T = al['scale'], np.array(al['Q']), np.array(al['T'])
    E, K, D, Dc, pad = p['extrinsic'][i], p['intrinsic'][i], p['depth'][i], p['depth_conf'][i], p['pad_map'][i]
    pl, pt, sx, sy = pad
    W, H = p['orig_wh'][i]
    vv, uu = np.mgrid[0:518, 0:518]
    inside = (uu >= pl) & (uu < pl + W * sx) & (vv >= pt) & (vv < pt + H * sy)
    ok = inside & (Dc > np.median(Dc[inside]))
    u, v, d = uu[ok].astype(float), vv[ok].astype(float), D[ok]
    Xc = (np.stack([u, v, np.ones_like(u)], -1) @ np.linalg.inv(K).T) * d[:, None]
    Xv = (Xc - E[:, 3]) @ E[:, :3]
    X = s * Xv @ Q.T + T
    uo, vo = (u + 0.5 - pl) / sx - 0.5, (v + 0.5 - pt) / sy - 0.5
    return X, uo, vo


def group(cam):
    R = np.array(cam['R']); fwd = R[2]; C = cam['C']
    if fwd[2] < -0.5 and C[2] > 28:
        return 'entry side (looking -z)'
    if fwd[2] > 0.5 and C[2] < 12:
        return 'far side (looking +z)'
    return 'inside / sides'


def massing_items(paths):
    """Massing in chain order, applying massing_add and massing_move (same rule as hall.py)."""
    items = []
    for path in paths:
        d = json.load(open(path))
        if isinstance(d.get('massing'), list):
            items = list(d['massing'])
        items += list(d.get('massing_add') or [])
        for mv in d.get('massing_move') or []:
            items = [dict(it, **{k: v for k, v in mv.items() if k != 'id'}) if it.get('id') == mv['id'] else it for it in items]
        drop = set(d.get('massing_drop') or [])
        items = [it for it in items if it.get('id') not in drop]
    return items


def cmd_plan(a):
    p, al, names = load()
    groups = ['entry side (looking -z)', 'far side (looking +z)', 'inside / sides']
    nx = int((AREA['x'][1] - AREA['x'][0]) / CELL); nz = int((AREA['z'][1] - AREA['z'][0]) / CELL)
    grids = {g: np.zeros((nz, nx)) for g in groups}
    hmax = {g: np.zeros((nz, nx)) for g in groups}
    who = {g: [] for g in groups}
    for i, n in enumerate(names):
        cam = al['cams'][n]
        X, _, _ = lift(p, al, i)
        m = ((X[:, 0] > AREA['x'][0]) & (X[:, 0] < AREA['x'][1]) & (X[:, 2] > AREA['z'][0]) & (X[:, 2] < AREA['z'][1])
             & (X[:, 1] > AREA['y'][0]) & (X[:, 1] < AREA['y'][1]))
        if m.sum() < 200:
            continue
        g = group(cam); who[g].append(f'{n[:3]}:{m.sum()}')
        ix = ((X[m, 0] - AREA['x'][0]) / CELL).astype(int); iz = ((AREA['z'][1] - X[m, 2]) / CELL).astype(int)
        np.add.at(grids[g], (iz, ix), 1)
        np.maximum.at(hmax[g], (iz, ix), X[m, 1])
    sc = 24
    panels = []
    items = massing_items(a.dims)
    for g in groups:
        im = np.log1p(grids[g]); im = (255 * im / max(im.max(), 1e-6)).astype(np.uint8)
        im = cv2.applyColorMap(cv2.resize(im, (nx * sc // 4, nz * sc // 4), interpolation=cv2.INTER_NEAREST), cv2.COLORMAP_INFERNO)
        k = sc / 4 / CELL

        def P(x, z):
            return int((x - AREA['x'][0]) * k), int((AREA['z'][1] - z) * k)
        for x in range(int(AREA['x'][0]), int(AREA['x'][1]) + 1, 2):
            cv2.line(im, P(x, AREA['z'][0]), P(x, AREA['z'][1]), (70, 70, 70), 1)
            cv2.putText(im, f'{x}', (P(x, 0)[0] + 2, im.shape[0] - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (200, 200, 200), 1)
        for z in range(int(AREA['z'][0]), int(AREA['z'][1]) + 1, 2):
            cv2.line(im, P(AREA['x'][0], z), P(AREA['x'][1], z), (70, 70, 70), 1)
            cv2.putText(im, f'z{z}', (2, P(0, z)[1] - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (200, 200, 200), 1)
        for it in items:
            (x0, x1), (z0, z1) = it['x_m'], it['z_m']
            col = (255, 255, 0) if it.get('_layer') == 'new' or 'bags-2026' in json.dumps(it.get('photos', '')) else (0, 255, 0)
            cv2.rectangle(im, P(x0, z1), P(x1, z0), col, 1)
            cv2.putText(im, it['id'][:14], (P(x0, z1)[0] + 2, P(x0, z1)[1] + 12), cv2.FONT_HERSHEY_SIMPLEX, 0.38, col, 1)
        cv2.putText(im, g, (6, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        cv2.putText(im, ' '.join(who[g])[:90], (6, 36), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (255, 255, 255), 1)
        panels.append(im)
        np.save(os.path.join(RUN, 'align', f'plan-{groups.index(g)}.npy'), grids[g])
        np.save(os.path.join(RUN, 'align', f'plan-hmax-{groups.index(g)}.npy'), hmax[g])
    out = np.concatenate([np.pad(pp, ((0, 0), (0, 6), (0, 0))) for pp in panels], 1)
    cv2.imwrite(a.out, out)
    print(a.out, out.shape, {g: who[g] for g in groups})


def tri_dlt(cams, uvs):
    A = []
    for c, (u, v) in zip(cams, uvs):
        Pm = c.K @ np.hstack([c.R, -c.R @ c.C[:, None]])
        A += [u * Pm[2] - Pm[0], v * Pm[2] - Pm[1]]
    _, _, Vt = np.linalg.svd(np.array(A))
    X = Vt[-1][:3] / Vt[-1][3]
    miss = []
    for c in cams:
        pass
    return X


def ray_miss(c, uv, X):
    d = np.linalg.inv(c.K) @ np.array([uv[0], uv[1], 1.0]); d = c.R.T @ d; d /= np.linalg.norm(d)
    w = X - c.C
    return float(np.linalg.norm(w - (w @ d) * d))


def cmd_tri(a):
    p, al, names = load()
    picks = json.load(open(a.picks))
    out = {}
    for feat, views in picks['features'].items():
        cams, uvs, depth_pts, used = [], [], [], []
        for vname, uv in views.items():
            n = next(nn for nn in names if nn.startswith(vname))
            i = names.index(n)
            c = Cam.from_json(al['cams'][n])
            cams.append(c); uvs.append(uv); used.append(vname)
            X, uo, vo = lift(p, al, i)
            j = np.argmin((uo - uv[0]) ** 2 + (vo - uv[1]) ** 2)
            depth_pts.append(X[j].round(2).tolist())
        X = tri_dlt(cams, uvs) if len(cams) >= 2 else None
        rec = {'views': used, 'depth_points': depth_pts}
        if X is not None:
            rec['dlt'] = X.round(2).tolist()
            rec['ray_miss_m'] = [round(ray_miss(c, uv, X), 2) for c, uv in zip(cams, uvs)]
        out[feat] = rec
        print(feat, json.dumps(rec))
    for feat, views in (picks.get('floor') or {}).items():
        for vname, uv in views.items():
            n = next(nn for nn in names if nn.startswith(vname)); c = Cam.from_json(al['cams'][n])
            X, t = c.floor_hit(np.array([float(uv[0])]), np.array([float(uv[1])]))
            Xd, uo, vo = lift(p, al, names.index(n)); j = np.argmin((uo - uv[0]) ** 2 + (vo - uv[1]) ** 2)
            out['floor:' + feat] = {'view': vname, 'floor_hit': X[0].round(2).tolist(), 'range_m': round(float(t[0]), 1),
                                    'depth_point': Xd[j].round(2).tolist()}
            print('floor', feat, json.dumps(out['floor:' + feat]))
    for feat, views in (picks.get('lines') or {}).items():
        planes, rec = [], {}
        for vname, (a0, a1) in views.items():
            n = next(nn for nn in names if nn.startswith(vname)); c = Cam.from_json(al['cams'][n])
            Pm = c.K @ np.hstack([c.R, -c.R @ c.C[:, None]])
            l = np.cross([a0[0], a0[1], 1.0], [a1[0], a1[1], 1.0])
            planes.append(Pm.T @ l)  # plane through the camera centre and the image line (H&Z 8.2)
            Xd, uo, vo = lift(p, al, names.index(n))
            pts = [Xd[np.argmin((uo - q[0]) ** 2 + (vo - q[1]) ** 2)].round(2).tolist() for q in (a0, a1)]
            rec[vname + '_depth_points'] = pts
        if len(planes) == 2:
            A = np.array(planes)
            _, _, Vt = np.linalg.svd(A)
            P1, P2 = Vt[-1], Vt[-2]
            # points on the line at x = -2 and x = 10 (the duct runs across the hall)
            pts = []
            for xq in (-2.0, 4.0, 10.0):
                M = np.array([[P1[0] - xq * P1[3], P2[0] - xq * P2[3]]])
                a_, b_ = P2[0] - xq * P2[3], -(P1[0] - xq * P1[3])
                Xh = a_ * P1 + b_ * P2
                pts.append((Xh[:3] / Xh[3]).round(2).tolist())
            rec['line_points_at_x_-2_4_10'] = pts
        out['line:' + feat] = rec
        print('line', feat, json.dumps(rec))
    json.dump(out, open(os.path.join(RUN, 'align', 'tri.json'), 'w'), indent=1)


def box_lines(it):
    (x0, x1), (z0, z1), (y0, y1) = it['x_m'], it['z_m'], it.get('y_m', [0, 2])
    P = np.array([[x, y, z] for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)], float)
    E = [(0, 1), (2, 3), (4, 5), (6, 7), (0, 2), (1, 3), (4, 6), (5, 7), (0, 4), (1, 5), (2, 6), (3, 7)]
    return [(P[i], P[j]) for i, j in E]


def cmd_draw(a):
    img = cv2.imread(a.image)
    H, W = img.shape[:2]
    if a.cam032:
        g = json.load(open(os.environ['MOXIR_HALL_JSON']))['geometry']
        from multiview_columns import cam032
        c = cam032(g)
        sc = W / c.size[0]
        c = Cam(np.diag([sc, sc, 1]) @ c.K, c.R, c.C, (W, H))
    else:
        _, al, names = load()
        n = next(nn for nn in al['cams'] if nn.startswith(a.view))
        cj = al['cams'][n]
        c = Cam.from_json(cj)
        sc = W / cj['size'][0]
        c = Cam(np.diag([sc, sc, 1]) @ c.K, c.R, c.C, (W, H))
    old = {it['id']: it for it in massing_items(a.dims_old)}
    new = {it['id']: it for it in massing_items(a.dims)}
    lw = max(1, W // 900)
    draw = []
    for k, it in old.items():
        if k not in new or new[k] != it:
            draw.append((it, (0, 0, 255), f'OLD {k}'))
    for k, it in new.items():
        draw.append((it, (0, 255, 255) if k not in old or old[k] != it else (0, 255, 0), ('NEW ' if k not in old or old[k] != it else '') + k))
    for it, col, label in draw:
        (x0, x1), (z0, z1) = it['x_m'], it['z_m']
        if x1 < a.xlim[0] or x0 > a.xlim[1] or z1 < a.zlim[0] or z0 > a.zlim[1]:
            continue
        top = None
        for P0, P1 in box_lines(it):
            ts = np.linspace(0, 1, 30)[:, None]
            pts = P0 + ts * (P1 - P0)
            uv, z = c.project(pts)
            for k2 in range(len(pts) - 1):
                if z[k2] > 0.3 and z[k2 + 1] > 0.3:
                    cv2.line(img, tuple(int(q) for q in uv[k2]), tuple(int(q) for q in uv[k2 + 1]), col, lw, cv2.LINE_AA)
            for q, zz in zip(uv, z):
                if zz > 0.3 and (top is None or q[1] < top[1]):
                    top = q
        if top is not None and 0 <= top[0] < W and 0 <= top[1] < H:
            fs = 0.45 * W / 1280
            cv2.putText(img, label, (int(top[0]), int(top[1]) - 4), cv2.FONT_HERSHEY_SIMPLEX, fs, (0, 0, 0), 3 * lw, cv2.LINE_AA)
            cv2.putText(img, label, (int(top[0]), int(top[1]) - 4), cv2.FONT_HERSHEY_SIMPLEX, fs, col, lw, cv2.LINE_AA)
    if a.grid:
        step = int(np.ceil(W / 16 / 50) * 50)
        for gx in range(0, W, step):
            cv2.line(img, (gx, 0), (gx, H), (255, 255, 255), 1)
            cv2.putText(img, str(gx), (gx + 2, int(14 * W / 1000)), cv2.FONT_HERSHEY_SIMPLEX, 0.4 * W / 1000, (255, 255, 255), lw)
        for gy in range(0, H, step):
            cv2.line(img, (0, gy), (W, gy), (255, 255, 255), 1)
            cv2.putText(img, str(gy), (2, gy - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.4 * W / 1000, (255, 255, 255), lw)
    bar = np.zeros((int(34 * W / 1280), W, 3), np.uint8)
    cv2.putText(bar, a.caption, (8, int(23 * W / 1280)), cv2.FONT_HERSHEY_SIMPLEX, 0.5 * W / 1280, (255, 255, 255), lw, cv2.LINE_AA)
    cv2.imwrite(a.out, np.vstack([img, bar]))
    print(a.out)


def main():
    ap = argparse.ArgumentParser()
    sp = ap.add_subparsers(dest='cmd', required=True)
    chain = ['scripts/place/rigs/moxir-hall-dims-2026-09-28.json', 'scripts/place/rigs/moxir-hall-features-2026-09-28.json',
             'scripts/place/rigs/moxir-hall-crane-dj-2026-09-28.json', 'scripts/place/rigs/moxir-hall-dims-2026-10-02.json',
             'scripts/place/rigs/moxir-hall-dims-2026-10-07.json']
    s = sp.add_parser('plan'); s.add_argument('--out', required=True); s.add_argument('--dims', nargs='+', default=chain)
    s = sp.add_parser('tri'); s.add_argument('picks')
    s = sp.add_parser('draw'); s.add_argument('image'); s.add_argument('--view', default=''); s.add_argument('--cam032', action='store_true')
    s.add_argument('--out', required=True); s.add_argument('--caption', default=''); s.add_argument('--grid', action='store_true')
    s.add_argument('--dims', nargs='+', default=chain); s.add_argument('--dims-old', nargs='+', default=chain[:-1] + [chain[-1]])
    s.add_argument('--xlim', type=float, nargs=2, default=[-40, 40]); s.add_argument('--zlim', type=float, nargs=2, default=[-60, 60])
    s = sp.add_parser('fit954'); s.add_argument('image'); s.add_argument('--view', default='954-FXT51128-t03.6.jpg')
    s.add_argument('--f', type=float, default=2004.0); s.add_argument('--out', required=True)
    a = ap.parse_args()
    {'plan': cmd_plan, 'tri': cmd_tri, 'draw': cmd_draw, 'fit954': cmd_fit954}[a.cmd](a)


def vp_fit(img_path, C, f, size, roll_band=(80, 100)):
    """Rotation from the hall-axis vanishing point and the verticals (Caprile & Torre 1990; H&Z 2004, 8.6).
    Long segments: probabilistic Hough (Matas et al. 2000) on Canny edges. VP: RANSAC over pairs of
    non-vertical segments, scored by the angle each segment makes with the line to the VP (< 0.6 deg)."""
    im = cv2.imread(img_path, 0)
    W, H = size
    e = cv2.Canny(cv2.GaussianBlur(im, (3, 3), 0), 60, 160)
    L = cv2.HoughLinesP(e, 1, np.pi / 720, 80, minLineLength=110, maxLineGap=6)[:, 0, :].astype(float)
    ang = np.degrees(np.arctan2(L[:, 3] - L[:, 1], L[:, 2] - L[:, 0])) % 180
    ln = np.hypot(L[:, 2] - L[:, 0], L[:, 3] - L[:, 1])
    obl = L[(np.abs(ang - 90) > 12) & (np.minimum(ang, 180 - ang) > 8)]
    hom = np.cross(np.c_[obl[:, :2], np.ones(len(obl))], np.c_[obl[:, 2:], np.ones(len(obl))])
    mid = (obl[:, :2] + obl[:, 2:]) / 2
    dirs = (obl[:, 2:] - obl[:, :2]); dirs /= np.linalg.norm(dirs, axis=1)[:, None]

    def score(vp):
        to = vp[None] - mid; to /= np.linalg.norm(to, axis=1)[:, None]
        return np.degrees(np.arcsin(np.clip(np.abs(to[:, 0] * dirs[:, 1] - to[:, 1] * dirs[:, 0]), 0, 1)))
    rng = np.random.default_rng(1); best = None
    for _ in range(4000):
        i, j = rng.choice(len(obl), 2, replace=False)
        v = np.cross(hom[i], hom[j])
        if abs(v[2]) < 1e-9:
            continue
        vp = v[:2] / v[2]
        if not (0.2 * W < vp[0] < 0.8 * W and 0.2 * H < vp[1] < 0.9 * H):
            continue
        inl = score(vp) < 0.6
        if best is None or inl.sum() > best[1].sum():
            best = (vp, inl)
    inl = best[1]
    A = hom[inl] / np.linalg.norm(hom[inl][:, :2], axis=1)[:, None]
    _, _, Vt = np.linalg.svd(A); vp = Vt[-1][:2] / Vt[-1][2]
    vert = L[np.abs(ang - 90) < 5]
    va = np.degrees(np.arctan2(vert[:, 2] - vert[:, 0], vert[:, 3] - vert[:, 1]))  # deviation from image vertical
    va = ((va + 90) % 180) - 90
    vl = np.hypot(vert[:, 2] - vert[:, 0], vert[:, 3] - vert[:, 1])
    return vp, int(inl.sum()), float(np.median(score(vp)[inl])), vert, va, vl


def cmd_fit954(a):
    _, al, _ = load()
    n = a.view
    cj = al['cams'][n]
    W, H = cj['size']
    f = a.f
    cx, cy = W / 2, H / 2
    C0 = np.array(cj['C'])
    vp, nin, med, vert, va, vl = vp_fit(a.image, C0, f, (W, H))
    from scipy.optimize import least_squares
    K = np.array([[f, 0, cx], [0, f, cy], [0, 0, 1.0]])

    def Rm(p):
        yaw, pitch, roll = np.radians(p)
        fwd = np.array([np.sin(yaw) * np.cos(pitch), np.sin(pitch), -np.cos(yaw) * np.cos(pitch)])
        right = np.cross(fwd, [0, 1, 0]); right /= np.linalg.norm(right); up = np.cross(right, fwd)
        right, up = np.cos(roll) * right + np.sin(roll) * up, -np.sin(roll) * right + np.cos(roll) * up
        return np.array([right, -up, fwd])

    def res(p):
        R = Rm(p)
        q = K @ R @ np.array([0, 0, -1.0]); r = list(q[:2] / q[2] - vp)
        # verticals: each near-vertical segment should point at the projected vertical VP
        qv = K @ R @ np.array([0, 1.0, 0])
        for s in vert[vl > 70][:80]:
            m = (s[:2] + s[2:]) / 2
            d = s[2:] - s[:2]; d /= np.linalg.norm(d)
            to = qv[:2] / qv[2] - m if abs(qv[2]) > 1e-9 else qv[:2]
            to /= np.linalg.norm(to)
            r.append(3.0 * np.degrees(np.arcsin(np.clip(d[0] * to[1] - d[1] * to[0], -1, 1))))
        return r
    sol = least_squares(res, [0, 2, 0])
    R = Rm(sol.x)
    rv = np.array(sol.fun)
    q = K @ R @ np.array([0, 0, -1.0]); vp_res = float(np.hypot(*(q[:2] / q[2] - vp)))
    out = {'view': n, 'f': f, 'cx': cx, 'cy': cy, 'width': int(W), 'height': int(H), 'C': [round(float(v), 3) for v in C0],
           'R': R.round(6).tolist(), 'yaw_pitch_roll_deg': [round(float(v), 3) for v in sol.x],
           'vanishing_point_px': vp.round(1).tolist(), 'vp_inlier_segments': nin, 'vp_median_angle_deg': round(med, 3),
           'residual_px': round(vp_res, 2), 'vertical_segments': int((vl > 70).sum()),
           'vertical_rms_deg': round(float(np.sqrt(np.mean((rv[1:] / 3) ** 2))), 3) if len(rv) > 1 else None,
           'n_points': 0,
           'method': 'rotation from the hall-axis vanishing point (Hough segments + RANSAC, Caprile & Torre 1990) and the '
                     'verticals; f from EXIF (23 mm on the 2048-px video width, 2004 px), principal point at the centre; '
                     'position C from VGGT-1B aligned to the hall on 032 (run vggt-2026-10-07c, 954 frames spread +-0.7 m).',
           'which_points': 'none: not a point-based PnP. No 4 independent known 3-D points could be read reliably in this '
                           'frame (column feet hidden, heads dense). Rotation is fitted on lines; position is VGGT.',
           'position_error_m': 'x +-0.7, z +-0.7 (spread of the 5 aligned 954 frames and the 0.73 m alignment rms), y +-0.3'}
    json.dump(out, open(a.out, 'w'), indent=1)
    print(json.dumps({k: out[k] for k in ('yaw_pitch_roll_deg', 'vanishing_point_px', 'vp_inlier_segments', 'vp_median_angle_deg', 'residual_px', 'vertical_segments', 'vertical_rms_deg', 'C')}))


if __name__ == '__main__':
    main()
