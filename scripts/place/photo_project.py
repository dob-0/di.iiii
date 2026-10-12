"""photo_project.py — the CPU stage of photo_analyse.py (call it through `photo_analyse.py project`).

Reads the masks and depth from `photo_analyse.py infer`, the hall json (geometry: columns, zones, massing,
cameras), and writes: overlays (model drawn on the photos), a floor occupancy grid (hall frame, y = 0,
0.5 m cells), a plan PNG, the column table and the features layer. numpy/OpenCV/matplotlib only: no WebGL.

Cameras (hall frame, metres; x across, +x house right; y up; z along, +z toward the entry):
  photo 032: the level-camera perspective fit stored in the hall json (f 555 px, principal point = vanishing
             point u 624 / horizon v 262, camera (-1.7, 6.88, 50.2), optical axis along -z).
  photo 024: the solvePnP fit (position, yaw, pitch, vfov 90 on the square S24 frame; roll not fitted).
"""
import json
from pathlib import Path
import numpy as np
import cv2

CELL = 0.5
GX = (-16.0, 16.0)
GZ = (-55.0, 55.0)
FLOOR_ADE = {'floor', 'road', 'earth, ground', 'rug, carpet, carpeting', 'path', 'field', 'sand', 'dirt track',
             'land, ground, soil', 'sidewalk, pavement'}
IGNORE_ADE = {'ceiling', 'sky'}
COLUMN_ADE = {'column, pillar'}
MOVABLE_ADE = {'person, individual, someone, somebody, mortal, soul', 'bag', 'box', 'barrel, cask', 'basket, handbasket',
               'bottle', 'chair', 'stool', 'ashcan, trash can, garbage can, wastebin, ash bin, ash-bin, ashbin, dustbin, trash barrel, trash bin'}
WALL_ADE = {'wall', 'building, edifice', 'door', 'double door', 'windowpane, window', 'fence, fencing', 'railing, rail',
            'stairway, staircase', 'stairs, steps', 'house', 'shed', 'hovel, hut, hutch, shack, shanty'}
FIXED_PROMPTS = {'industrial machine', 'metal tank', 'electrical cabinet', 'pipe', 'concrete column', 'brick wall',
                 'transformer', 'workbench'}
MOVABLE_PROMPTS = {'white sack', 'scrap metal pile', 'wooden pallet', 'person', 'forklift'}
# pixel classes
FREE, FIXED, MOVABLE, MASS, COLUMN, NONE = 1, 2, 3, 4, 5, 0
COLORS = {FREE: (60, 200, 60), FIXED: (40, 40, 230), MOVABLE: (0, 210, 255), MASS: (200, 60, 200), COLUMN: (255, 200, 0)}


class Cam:
    """Pinhole: u = cx + f*xc/zc, v = cy - f*yc/zc, camera basis rows R = (right, up, forward)."""

    def __init__(self, C, R, f, cx, cy, size):
        self.C, self.R, self.f, self.cx, self.cy, self.size = np.array(C, float), np.array(R, float), f, cx, cy, size

    def to_cam(self, P):
        return (np.asarray(P, float) - self.C) @ self.R.T

    def project(self, P):
        pc = self.to_cam(P)
        return np.stack([self.cx + self.f * pc[..., 0] / pc[..., 2], self.cy - self.f * pc[..., 1] / pc[..., 2]], -1), pc[..., 2]

    def rays(self, u, v):
        d = np.stack([(u - self.cx) / self.f, -(v - self.cy) / self.f, np.ones_like(u, float)], -1)
        return d @ self.R  # world direction with forward component 1 (so t = optical-axis depth)

    def floor_hit(self, u, v):
        d = self.rays(u, v)
        with np.errstate(divide='ignore', invalid='ignore'):
            t = -self.C[1] / d[..., 1]
        t = np.where(d[..., 1] < -1e-6, t, np.nan)
        return self.C + d * t[..., None], t


def cam_level(c, f, cx, cy, size):
    return Cam(c, [[1, 0, 0], [0, 1, 0], [0, 0, -1]], f, cx, cy, size)


def cam_yaw_pitch(c, yaw_deg, pitch_deg, vfov_deg, size, roll_deg=0.0):
    y, p = np.radians(yaw_deg), np.radians(pitch_deg)
    fwd = np.array([np.sin(y) * np.cos(p), np.sin(p), -np.cos(y) * np.cos(p)])  # rig-look.mjs convention
    right = np.cross(fwd, [0, 1, 0]); right /= np.linalg.norm(right)
    up = np.cross(right, fwd)
    r = np.radians(roll_deg); right, up = np.cos(r) * right + np.sin(r) * up, -np.sin(r) * right + np.cos(r) * up
    f = size[1] / 2 / np.tan(np.radians(vfov_deg) / 2)
    return Cam(c, [right, up, fwd], f, size[0] / 2, size[1] / 2, size)


def cameras(g, sizes, roll024=0.0):
    cams = {}
    c32 = g['cameras']['photo-032']
    s = sizes.get('032-file_76', (1280, 720))[0] / 1280
    cams['032-file_76'] = cam_level(c32['position_m'], 555 * s, 624 * s, 262 * s, sizes.get('032-file_76', (1280, 720)))
    c24 = g['cameras']['photo-024']
    sz = sizes.get('024-file_69', (1600, 1600))
    cams['024-file_69'] = cam_yaw_pitch(c24['position_m'], c24['yaw_deg'], c24['pitch_deg'], c24['vfov_deg'], sz, roll024)
    return cams


# ---------- model geometry as line segments (hall frame) ----------
def box_edges(x, y, z):
    xs, ys, zs = x, y, z
    P = np.array([[a, b, c] for a in xs for b in ys for c in zs], float)
    E = [(0, 1), (2, 3), (4, 5), (6, 7), (0, 2), (1, 3), (4, 6), (5, 7), (0, 4), (1, 5), (2, 6), (3, 7)]
    return [(P[i], P[j]) for i, j in E]


def column_segments(g, d):
    rows = [x for x in g['rows_x_m'] if abs(x) <= 40]; hd = g['column_head']
    cw, cd = d['column_w_m'], d['column_d_m']; hw = hd['head_w_m'] / 2
    fs, top = hd['flare_start_m'], hd['head_top_m']; flare = hw - cd / 2
    cols = []
    for ax in rows:
        for z in g['column_grid_z_m']:
            segs = box_edges((ax - cd / 2, ax + cd / 2), (0.0, fs), (z - cw / 2, z + cw / 2))
            prof = [(ax - cd / 2, fs), (ax - hw, fs + flare), (ax - hw, top), (ax + hw, top), (ax + hw, fs + flare), (ax + cd / 2, fs)]
            for zz in (z - cw / 2, z + cw / 2):
                for i in range(len(prof) - 1):
                    segs.append((np.array([prof[i][0], prof[i][1], zz]), np.array([prof[i + 1][0], prof[i + 1][1], zz])))
            cols.append({'x': ax, 'z': z, 'segs': segs, 'main': ax in g['column_row_x_m']})
    return cols


def draw_segs(img, cam, segs, color, thick=1, n=24):
    for a, b in segs:
        t = np.linspace(0, 1, n)[:, None]
        P = a + (b - a) * t
        uv, zc = cam.project(P)
        ok = zc > 0.3
        for i in range(n - 1):
            if ok[i] and ok[i + 1]:
                p, q = uv[i], uv[i + 1]
                if np.all(np.abs(np.r_[p, q]) < 1e5):
                    cv2.line(img, tuple(np.round(p).astype(int)), tuple(np.round(q).astype(int)), color, thick, cv2.LINE_AA)


def rect_floor(x, z, y=0.02):
    c = [(x[0], z[0]), (x[1], z[0]), (x[1], z[1]), (x[0], z[1])]
    return [(np.array([c[i][0], y, c[i][1]]), np.array([c[(i + 1) % 4][0], y, c[(i + 1) % 4][1]])) for i in range(4)]


# ---------- pixel classes ----------
def pixel_classes(sem, inst, id2label):
    lab = np.array([id2label.get(str(i), '') for i in range(256)], dtype=object)
    names = lab[sem]
    cls = np.full(sem.shape, NONE, np.uint8)
    cls[np.isin(names, list(FLOOR_ADE))] = FREE
    cls[np.isin(names, list(WALL_ADE))] = MASS
    other = (cls == NONE) & ~np.isin(names, list(IGNORE_ADE))
    cls[other] = FIXED
    cls[np.isin(names, list(MOVABLE_ADE))] = MOVABLE
    cls[np.isin(names, list(COLUMN_ADE))] = COLUMN
    order = np.argsort(inst['scores'])  # high score drawn last
    for i in order:
        words = set(str(inst['labels'][i]).split(' '))
        lbl = str(inst['labels'][i])
        m = inst['masks'][i]
        if m.sum() > 0.25 * m.size:  # a box swallowing the scene is not an object
            continue
        if any(p in lbl for p in MOVABLE_PROMPTS):
            cls[m] = MOVABLE
        elif 'column' in lbl:
            cls[m] = COLUMN
        elif any(p in lbl for p in FIXED_PROMPTS):
            cls[m] = FIXED
    return cls


def align_depth(cam, disp, cls, max_d=45.0):
    """Least-squares scale+shift of DA-V2 inverse depth to the floor-plane inverse depth (Ranftl et al. 2020)."""
    h, w = disp.shape
    v, u = np.mgrid[0:h, 0:w]
    _, t = cam.floor_hit(u.astype(float), v.astype(float))
    m = (cls == FREE) & np.isfinite(t) & (t > 2) & (t < max_d)
    m[: int(h * 0.0)] = False
    x, y = disp[m], 1.0 / t[m]
    keep = np.ones_like(x, bool)
    for _ in range(3):
        A = np.c_[x[keep], np.ones(keep.sum())]
        (a, b), *_ = np.linalg.lstsq(A, y[keep], rcond=None)
        r = np.abs((a * x + b) - y) / y
        keep = r < max(0.15, np.percentile(r, 80))
    depth = 1.0 / np.clip(a * disp + b, 1e-4, None)
    rel = np.abs(1.0 / (a * x + b) - t[m]) / t[m]
    return depth, {'a': float(a), 'b': float(b), 'floor_px': int(m.sum()), 'median_rel_err': float(np.median(rel)),
                   'p90_rel_err': float(np.percentile(rel, 90))}


def grid_index(x, z):
    i = np.floor((x - GX[0]) / CELL).astype(int); j = np.floor((z - GZ[0]) / CELL).astype(int)
    ok = (i >= 0) & (i < int((GX[1] - GX[0]) / CELL)) & (j >= 0) & (j < int((GZ[1] - GZ[0]) / CELL))
    return i, j, ok


def accumulate(cam, cls, depth, votes, max_d, min_d=11.0):
    """Depth points are NOT used for the grid (measured: DA-V2 Small aligned on the floor has a median 16 %, p90 43 %
    range error in photo 032, too coarse for 0.5 m cells); pass depth=None. min_d drops the contacts made by the
    near crane girder that cuts the bottom of photo 032 (floor visible from D 10.5 m)."""
    h, w = cls.shape
    v, u = np.mgrid[0:h, 0:w]
    P, t = cam.floor_hit(u.astype(float), v.astype(float))
    seen = np.isfinite(t) & (t < max_d)
    # FREE: floor pixels on the plane
    m = (cls == FREE) & seen
    i, j, ok = grid_index(P[..., 0][m], P[..., 2][m]); np.add.at(votes['free'], (i[ok], j[ok]), 1)
    # ground contact (stixel bottom): a non-floor pixel with floor directly below it
    below = np.zeros_like(cls); below[:-1] = cls[1:]
    contact = (cls != FREE) & (cls != NONE) & (below == FREE) & seen & (t > min_d)
    for c, key in ((FIXED, 'fixed'), (MOVABLE, 'movable'), (MASS, 'mass'), (COLUMN, 'column')):
        mm = contact & (cls == c)
        i, j, ok = grid_index(P[..., 0][mm], P[..., 2][mm]); np.add.at(votes[key + '_contact'], (i[ok], j[ok]), 1)
    # depth points of standing objects (0.15-4 m above the floor)
    if depth is not None:
        d3 = cam.C + cam.rays(u.astype(float), v.astype(float)) * depth[..., None]
        stand = (d3[..., 1] > 0.15) & (d3[..., 1] < 4.0) & (depth < max_d) & (cls != FREE) & (cls != NONE)
        for c, key in ((FIXED, 'fixed'), (MOVABLE, 'movable'), (MASS, 'mass'), (COLUMN, 'column')):
            mm = stand & (cls == c)
            i, j, ok = grid_index(d3[..., 0][mm], d3[..., 2][mm]); np.add.at(votes[key + '_depth'], (i[ok], j[ok]), 1)
    return seen


def largest_rect(ok):
    """Largest all-True axis-aligned rectangle in a boolean grid (histogram method)."""
    H = np.zeros(ok.shape[1], int); best = (0, None)
    for r in range(ok.shape[0]):
        H = np.where(ok[r], H + 1, 0)
        st = []
        for c in range(len(H) + 1):
            h = H[c] if c < len(H) else 0
            s = c
            while st and st[-1][1] >= h:
                s, hh = st.pop()
                area = hh * (c - s)
                if area > best[0]:
                    best = (area, (r - hh + 1, r, s, c - 1))
            st.append((s, h))
    return best


def load_rgb(src, size):
    from PIL import Image, ImageOps
    im = ImageOps.exif_transpose(Image.open(src)).convert('RGB').resize(tuple(size), Image.LANCZOS)
    return cv2.cvtColor(np.array(im), cv2.COLOR_RGB2BGR)


def label(img, text, org, color=(255, 255, 255), s=0.45):
    cv2.putText(img, text, org, cv2.FONT_HERSHEY_SIMPLEX, s, (0, 0, 0), 3, cv2.LINE_AA)
    cv2.putText(img, text, org, cv2.FONT_HERSHEY_SIMPLEX, s, color, 1, cv2.LINE_AA)


def model_layers(g, d):
    z = g['zones']
    lw = []
    for w in d.get('low_walls', []):
        x = -12.0 if w['row'] == 'left' else 12.0
        z0, z1 = 54.0 - w['from_door_m'][1], 54.0 - w['from_door_m'][0]
        lw += box_edges((x - 0.15, x + 0.15), (0.0, w['h_m']), (z0, z1))
    mass = []
    for m in g['massing']:
        mass += box_edges(tuple(m['x_m']), tuple(m['y_m']), tuple(m['z_m']))
    return {'dance': rect_floor(z['dance']['used']['x_m'], z['dance']['used']['z_m']),
            'stage': rect_floor(z['stage']['used']['x_m'], z['stage']['used']['z_m']),
            'backstage': rect_floor(z['backstage']['used']['x_m'], z['backstage']['used']['z_m']),
            'lowwall': lw, 'massing': mass}


def column_check(cam, cls, col, d, depth_ok_max=45.0):
    """Predicted shaft at y 1-5 m vs COLUMN pixels; returns offsets in px and m."""
    cd, cw = d['column_d_m'], d['column_w_m']
    xs = [col['x'] - cd / 2, col['x'] + cd / 2]; zs = [col['z'] - cw / 2, col['z'] + cw / 2]
    corners = np.array([[x, 3.0, z] for x in xs for z in zs])
    uv, zc = cam.project(corners)
    if np.any(zc < 1) or np.min(zc) > depth_ok_max:
        return None
    u0, u1 = uv[:, 0].min(), uv[:, 0].max()
    vb, _ = cam.project(np.array([col['x'], 1.0, col['z']])); vt, _ = cam.project(np.array([col['x'], 5.0, col['z']]))
    h, w = cls.shape
    if u1 < 0 or u0 >= w:
        return None
    vv = np.clip(np.arange(int(vt[1]), int(vb[1]) + 1), 0, h - 1)
    lo, hi = int(max(0, u0 - 3 * (u1 - u0) - 6)), int(min(w, u1 + 3 * (u1 - u0) + 6))
    band = (cls[vv][:, lo:hi] == COLUMN)
    prof = band.mean(0)
    res = {'pred_u_px': [round(float(u0), 1), round(float(u1), 1)], 'pred_w_px': round(float(u1 - u0), 1),
           'depth_m': round(float(np.mean(zc)), 1), 'm_per_px': round(float(np.mean(zc)) / cam.f, 4)}
    on = prof > 0.5
    if on.sum() < 2:
        res['seen'] = 'no column mask near the prediction'
        return res
    # the run of column pixels nearest the predicted centre
    idx = np.nonzero(on)[0]; runs = np.split(idx, np.where(np.diff(idx) > 1)[0] + 1)
    pc = (u0 + u1) / 2 - lo
    run = min(runs, key=lambda r: abs((r[0] + r[-1]) / 2 - pc))
    mu0, mu1 = run[0] + lo, run[-1] + lo + 1
    res.update({'mask_u_px': [int(mu0), int(mu1)], 'mask_w_px': int(mu1 - mu0),
                'centre_offset_px': round(float((mu0 + mu1) / 2 - (u0 + u1) / 2), 1),
                'centre_offset_m': round(float(((mu0 + mu1) / 2 - (u0 + u1) / 2) * np.mean(zc) / cam.f), 2),
                'width_ratio': round(float((mu1 - mu0) / max(1.0, u1 - u0)), 2)})
    return res


def project(args):
    hall = json.load(open(args.hall)); g = hall['geometry']; d = hall['dims']
    mdir = Path(args.masks); man = json.load(open(mdir / 'manifest.json')); id2 = man['ade20k_labels']
    sizes = {k: tuple(v['size_px']) for k, v in man['photos'].items()}
    cams = cameras(g, sizes, getattr(args, 'roll024', 0.0))
    out = Path(args.overlays); out.mkdir(parents=True, exist_ok=True)
    nx, nz = int((GX[1] - GX[0]) / CELL), int((GZ[1] - GZ[0]) / CELL)
    keys = ['free'] + [k + s for k in ('fixed', 'movable', 'mass', 'column') for s in ('_contact', '_depth')]
    votes = {k: np.zeros((nx, nz), int) for k in keys}
    cols = column_segments(g, d); layers = model_layers(g, d)
    rep = {'manifest': man['models'], 'photos': {}, 'columns': {}}
    used = {'032-file_76': 42.0}  # D 42 m = z 8.2; beyond it the 3 px fit error is > 1.3 m along z  # photo 024: camera 1.0 m up, +-2 deg -> floor range error > 30 %: overlay only
    for stem, cam in cams.items():
        src = man['photos'][stem]['source']; size = sizes[stem]
        img = load_rgb(src, size)
        sem = np.load(mdir / stem / 'sem.npy'); inst = dict(np.load(mdir / stem / 'inst.npz'))
        disp = np.load(mdir / stem / 'disp.npy')
        cls = pixel_classes(sem, inst, id2)
        depth, al = align_depth(cam, disp, cls, max_d=used.get(stem, 12.0))
        info = {'source': src, 'size_px': list(size), 'depth_alignment': al,
                'class_share': {n: round(float((cls == c).mean()), 3) for n, c in
                                (('free', FREE), ('fixed', FIXED), ('movable', MOVABLE), ('mass', MASS), ('column', COLUMN))}}
        if stem in used:
            accumulate(cam, cls, None, votes, used[stem]); info['occupancy'] = f'used, floor rays to {used[stem]} m'
        else:
            info['occupancy'] = 'not used (camera fit too coarse for floor projection); overlay only'
        rep['photos'][stem] = info
        # overlay A: the model on the photo
        a = (img * 0.8).astype(np.uint8)
        draw_segs(a, cam, layers['massing'], (0, 140, 255), 1)
        draw_segs(a, cam, layers['lowwall'], (255, 0, 255), 2)
        for c in cols:
            draw_segs(a, cam, c['segs'], (255, 255, 0) if c['main'] else (80, 255, 80), 1)
        draw_segs(a, cam, layers['dance'], (255, 80, 0), 2)
        draw_segs(a, cam, layers['stage'], (0, 255, 0), 2)
        draw_segs(a, cam, layers['backstage'], (0, 0, 255), 2)
        for c in cols:
            uv, zc = cam.project(np.array([c['x'], 0.0, c['z']]))
            if zc > 1 and 0 <= uv[0] < size[0] and 0 <= uv[1] < size[1] + 40:
                label(a, f"z{c['z']:g}", (int(uv[0]) - 12, min(size[1] - 4, int(uv[1]) + 12)), (255, 255, 0), 0.33)
        label(a, f'{stem}: MODEL (hall 10-02) drawn on the photo. cyan columns (main rows x +-12), green = neighbour rows x +-36, orange massing, magenta low wall,', (8, 18))
        label(a, 'blue = model dance floor, green = stage, red = backstage. Camera: hall json fit.', (8, 36))
        cv2.imwrite(str(out / f'{stem[:3]}-model-on-photo.png'), a)
        # overlay B: the masks
        b = img.copy()
        col = np.zeros_like(img)
        for c, bgr in COLORS.items():
            col[cls == c] = bgr
        b = np.where((cls > 0)[..., None], (0.45 * img + 0.55 * col).astype(np.uint8), (img * 0.6).astype(np.uint8))
        for c in cols:
            draw_segs(b, cam, c['segs'], (255, 255, 255), 1)
        label(b, f'{stem}: MASKS green floor, red fixed object, yellow movable, magenta wall/mass (unsplit), cyan column', (8, 18))
        label(b, 'OneFormer ADE20K + Grounding DINO/SAM 2.1; white = model columns', (8, 36))
        cv2.imwrite(str(out / f'{stem[:3]}-masks.png'), b)
        rep['columns'][stem] = {f"{'L' if c['x'] < 0 else 'R'}{c['z']:g}": column_check(cam, cls, c, d) for c in cols}
    # unfitted photos: masks only
    for stem in getattr(args, 'masks_only', []) or []:
        if stem not in man['photos']:
            continue
        img = load_rgb(man['photos'][stem]['source'], sizes[stem])
        cls = pixel_classes(np.load(mdir / stem / 'sem.npy'), dict(np.load(mdir / stem / 'inst.npz')), id2)
        col = np.zeros_like(img)
        for c, bgr in COLORS.items():
            col[cls == c] = bgr
        b = np.where((cls > 0)[..., None], (0.45 * img + 0.55 * col).astype(np.uint8), (img * 0.6).astype(np.uint8))
        label(b, f'{stem}: MASKS only (no fitted camera) green floor, red fixed, yellow movable, magenta wall/mass, cyan column', (8, 22), s=0.6)
        cv2.imwrite(str(out / f'{stem[:3]}-masks.png'), b)
        rep['photos'][stem] = {'source': man['photos'][stem]['source'], 'occupancy': 'not used (no camera)',
                               'class_share': {n: round(float((cls == c).mean()), 3) for n, c in
                                               (('free', FREE), ('fixed', FIXED), ('movable', MOVABLE), ('mass', MASS), ('column', COLUMN))}}
    # ---------- occupancy ----------
    V = votes
    fixed = (V['fixed_contact'] + V['column_contact'] >= 2) | (V['fixed_depth'] + V['column_depth'] >= 30)
    mass = ((V['mass_contact'] >= 2) | (V['mass_depth'] >= 30)) & ~fixed
    movable = ((V['movable_contact'] >= 2) | (V['movable_depth'] >= 30)) & ~fixed & ~mass
    free = (V['free'] >= 3) & ~fixed & ~mass & ~movable
    occ = np.zeros((nx, nz), np.uint8)
    occ[free] = FREE; occ[movable] = MOVABLE; occ[mass] = MASS; occ[fixed] = FIXED
    xc = GX[0] + (np.arange(nx) + 0.5) * CELL; zc = GZ[0] + (np.arange(nz) + 0.5) * CELL

    def zone_stats(x, z):
        ii = (xc >= x[0]) & (xc <= x[1]); jj = (zc >= z[0]) & (zc <= z[1])
        sub = occ[np.ix_(ii, jj)]; n = sub.size
        return {k: round(float((sub == c).sum() * CELL * CELL), 1) for k, c in
                (('free', FREE), ('movable', MOVABLE), ('fixed', FIXED), ('mass', MASS), ('unseen', NONE))} | {'area_m2': n * CELL * CELL}

    zd = g['zones']['dance']['used']
    rep['model_dance_floor'] = {'x_m': zd['x_m'], 'z_m': zd['z_m'], 'cells_m2': zone_stats(zd['x_m'], zd['z_m'])}
    # recommended: largest rectangle of FREE or MOVABLE (clearable) cells in the nave, in front of the DJ
    ii = (xc >= -11.2) & (xc <= 11.2); jj = (zc >= 7.5) & (zc <= 50.0)
    sub = occ[np.ix_(ii, jj)]
    okc = (sub == FREE) | (sub == MOVABLE)
    # allow 1-cell specks: a cell that is not ok but has >= 6 of 8 ok neighbours is a mask speck
    k = cv2.filter2D(okc.astype(np.float32), -1, np.ones((3, 3), np.float32), borderType=cv2.BORDER_CONSTANT)
    okc2 = okc | ((k - okc) >= 6)
    area, (r0, r1, c0, c1) = largest_rect(okc2)
    X = xc[ii]; Z = zc[jj]
    rec = {'x_m': [round(X[r0] - CELL / 2, 2), round(X[r1] + CELL / 2, 2)], 'z_m': [round(Z[c0] - CELL / 2, 2), round(Z[c1] + CELL / 2, 2)]}
    rec['area_m2'] = round((rec['x_m'][1] - rec['x_m'][0]) * (rec['z_m'][1] - rec['z_m'][0]), 1)
    rec['cells_m2'] = zone_stats(rec['x_m'], rec['z_m'])
    rep['largest_clear_rect'] = rec
    rep['votes_total'] = {k: int(v.sum()) for k, v in V.items()}
    # polygons of occupied cells (hall frame)
    polys = []
    for c, name in ((FIXED, 'fixed'), (MASS, 'wall_or_mass'), (MOVABLE, 'movable')):
        m = (occ == c).astype(np.uint8)
        cs, _ = cv2.findContours(m.T.copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)  # rows = z, cols = x
        for cnt in cs:
            if cv2.contourArea(cnt) < 1:  # < 0.25 m2 in cells: a speck
                continue
            cnt = cv2.approxPolyDP(cnt, 1.0, True)[:, 0, :]
            pts = [[round(GX[0] + (p[0] + 0.5) * CELL, 2), round(GZ[0] + (p[1] + 0.5) * CELL, 2)] for p in cnt]
            zz = [p[1] for p in pts]
            polys.append({'class': name, 'xz_m': pts, 'z_span_m': [min(zz), max(zz)]})
    rep['polygons'] = polys
    np.savez_compressed(Path(args.masks) / 'occupancy-grid.npz', occ=occ,
                        cell=CELL, gx=np.array(GX), gz=np.array(GZ), **V)
    (Path(args.masks) / 'analysis.json').write_text(json.dumps(rep, indent=1, default=float))
    return rep, occ, (xc, zc), cams, layers



def plan_png(path, occ, g, d, rec=None, speakers=None, cams=None, title=''):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.colors import ListedColormap
    from matplotlib.patches import Rectangle
    cmap = ListedColormap(['#e9e9e9', '#7fd37f', '#d62728', '#ffd21f', '#b04fc0', '#1f9ad6'])
    fig, ax = plt.subplots(figsize=(18, 6.6), dpi=110)
    ax.imshow(occ, origin='lower', extent=(GZ[0], GZ[1], GX[0], GX[1]), cmap=cmap, vmin=0, vmax=5, interpolation='nearest', aspect='equal')
    for ax_x in g['column_row_x_m']:
        for z in g['column_grid_z_m']:
            ax.add_patch(Rectangle((z - d['column_w_m'] / 2, ax_x - d['column_d_m'] / 2), d['column_w_m'], d['column_d_m'], fc='#1f9ad6', ec='k', lw=0.4))
    for m in g['massing']:
        ax.add_patch(Rectangle((m['z_m'][0], m['x_m'][0]), m['z_m'][1] - m['z_m'][0], m['x_m'][1] - m['x_m'][0], fc='none', ec='#ff8c00', lw=1, ls='--'))
        ax.text(m['z_m'][0] + 0.2, min(m['x_m'][1], 15.5) - 0.6, m['id'], fontsize=6, color='#c06000')
    for w in d.get('low_walls', []):
        x = -12.0 if w['row'] == 'left' else 12.0
        ax.plot([54 - w['from_door_m'][1], 54 - w['from_door_m'][0]], [x - 0.6, x - 0.6], color='m', lw=3)
    zz = g['zones']
    for k, c in (('dance', 'blue'), ('stage', 'green'), ('backstage', 'red')):
        u = zz[k]['used']
        ax.add_patch(Rectangle((u['z_m'][0], u['x_m'][0]), u['z_m'][1] - u['z_m'][0], u['x_m'][1] - u['x_m'][0], fc='none', ec=c, lw=2, label=f'model {k}'))
    if rec:
        ax.add_patch(Rectangle((rec['z_m'][0], rec['x_m'][0]), rec['z_m'][1] - rec['z_m'][0], rec['x_m'][1] - rec['x_m'][0], fc='none', ec='#00a000', lw=3, ls='-.', label='recommended dance floor'))
    for s in speakers or []:
        ax.add_patch(Rectangle((s['z_m'][0], s['x_m'][0]), s['z_m'][1] - s['z_m'][0], s['x_m'][1] - s['x_m'][0], fc='black', ec='white', lw=1))
        ax.text(s['z_m'][1] + 0.3, s['x_m'][0], s['id'], fontsize=8, weight='bold')
    if cams:
        for n, c in cams.items():
            ax.plot(c.C[2], c.C[0], 'k^', ms=8); ax.text(c.C[2] + 0.5, c.C[0] + 0.5, n[:3], fontsize=8)
    ax.axvline(0, color='k', lw=0.6, ls=':'); ax.text(0.2, -15.5, 'joint z 0', fontsize=7)
    ax.set_xlabel('z along the hall (m)   <- far gate (-z)          entry door (+z) ->'); ax.set_ylabel('x across (m), +x = house right')
    ax.set_xlim(-30, 55); ax.set_ylim(GX[0], GX[1])
    from matplotlib.patches import Patch
    hand = [Patch(color='#e9e9e9', label='unseen'), Patch(color='#7fd37f', label='free floor (seen)'), Patch(color='#d62728', label='fixed object (seen)'),
            Patch(color='#ffd21f', label='movable / clearable'), Patch(color='#b04fc0', label='wall or mass (unsplit)')]
    h2, l2 = ax.get_legend_handles_labels()
    ax.legend(handles=hand + h2, loc='upper left', fontsize=7, ncol=5, framealpha=0.9)
    ax.set_title(title, fontsize=10)
    fig.tight_layout(); fig.savefig(path); plt.close(fig)


# ---------- standing objects: SAM automatic masks + single-view metrology ----------
def standing_objects(cam, auto, disp, sem_cls, h_cam, horizon_v, min_d=11.0, max_d=42.0):
    """For each SAM mask touching the floor: contact row v_b, top row v_t, height above the floor
    h = h_cam (v_b - v_t) / (v_b - v_h) (level camera; Criminisi, Reid & Zisserman, IJCV 2000), and
    verticality from relative depth: a floor patch's inverse depth falls toward its top in proportion to
    (v - v_h); an upright object's stays flat. s = (r - r_floor) / (1 - r_floor), r = disp(top)/disp(bottom)."""
    shape = tuple(auto['shape']); masks = np.unpackbits(auto['masks'], axis=-1)[..., :shape[2]].astype(bool)
    objs = []
    for k, m in enumerate(masks):
        ys, xs = np.nonzero(m)
        if len(ys) < 60:
            continue
        v_b, v_t = np.percentile(ys, 98), np.percentile(ys, 2)
        if v_b <= horizon_v + 5:
            continue
        D = cam.f * h_cam / (v_b - horizon_v)
        if not (min_d <= D <= max_d):
            continue
        hgt = h_cam * (v_b - v_t) / (v_b - horizon_v)
        top = ys <= np.percentile(ys, 20); bot = ys >= np.percentile(ys, 80)
        r = np.median(disp[ys[top], xs[top]]) / max(1e-6, np.median(disp[ys[bot], xs[bot]]))
        r_floor = max(0.0, (np.median(ys[top]) - horizon_v) / max(1.0, np.median(ys[bot]) - horizon_v))
        s = (r - r_floor) / max(1e-3, 1 - r_floor)
        floor_share = float((sem_cls[m] == FREE).mean())
        movable_share = float((sem_cls[m] == MOVABLE).mean())
        # bottom edge pixels: the lowest pixel of the mask in each image column
        cols = np.unique(xs); vb = np.array([ys[xs == c].max() for c in cols])
        P, t = cam.floor_hit(cols.astype(float), vb.astype(float))
        objs.append({'id': k, 'v_b': float(v_b), 'v_t': float(v_t), 'D_m': round(float(D), 1), 'h_m': round(float(hgt), 2),
                     'vert': round(float(s), 2), 'floor_share': round(floor_share, 2), 'movable_share': round(movable_share, 2),
                     'u_px': [int(cols.min()), int(cols.max())],
                     'foot_xz': np.c_[P[:, 0], P[:, 2]][np.isfinite(t)].round(2).tolist(),
                     'standing': bool(s >= 0.5 and hgt >= 0.4 and hgt <= 8.0 and floor_share < 0.9)})
    return objs


# ---------- column count along each row ----------
def column_scan(cam, gray, row_x, z_range, y_band=(1.5, 5.5), step=0.05):
    """Vertical-structure profile along one column row seen in a fitted photo. For each z the vertical segment
    (row_x, y_band, z) is sampled in the image; the profile is the mean horizontal intensity gradient (Sobel)
    along that segment, smoothed over the predicted column width; peaks = column candidates."""
    from scipy.signal import find_peaks
    gx = np.abs(cv2.Sobel(gray.astype(np.float32), cv2.CV_32F, 1, 0, ksize=3))
    zs = np.arange(z_range[0], z_range[1], step)
    ys = np.linspace(*y_band, 24)
    prof = np.full(len(zs), np.nan); u_at = np.full(len(zs), np.nan)
    H, W = gray.shape
    for i, z in enumerate(zs):
        P = np.c_[np.full(len(ys), row_x), ys, np.full(len(ys), z)]
        uv, zc = cam.project(P)
        if np.any(zc < 2):
            continue
        u = np.round(uv[:, 0]).astype(int); v = np.round(uv[:, 1]).astype(int)
        ok = (u >= 1) & (u < W - 1) & (v >= 0) & (v < H)
        if ok.sum() < 12:
            continue
        prof[i] = gx[v[ok], u[ok]].mean(); u_at[i] = uv[len(ys) // 2, 0]
    good = np.isfinite(prof)
    if good.sum() < 20:
        return None
    p = np.interp(np.arange(len(zs)), np.nonzero(good)[0], prof[good])
    # smooth over ~0.8 m (the column face) so the two edges of one column make one peak
    k = max(3, int(0.8 / step)); p = np.convolve(p, np.ones(k) / k, mode='same')
    base = cv2.blur(p.reshape(1, -1).astype(np.float32), (int(6 / step) | 1, 1)).ravel()
    q = p - base
    pk, prop = find_peaks(q, distance=int(1.5 / step), prominence=np.nanstd(q) * 0.8)
    return {'z': zs, 'profile': q, 'u': u_at, 'valid': good,
            'peaks': [{'z_m': round(float(zs[j]), 2), 'u_px': round(float(u_at[j]), 1) if np.isfinite(u_at[j]) else None,
                       'prominence': round(float(prop['prominences'][n]), 1)} for n, j in enumerate(pk)]}


REC = {'x_m': [-6.0, 6.0], 'z_m': [8.5, 40.0]}  # recommended dance floor (why: docs/moxir/PHOTO_ANALYSIS_2026-10-07.md)
SPEAKERS = [{'id': 'S1 main L', 'x_m': [-8.0, -6.5], 'z_m': [6.0, 8.0]}, {'id': 'S2 main R', 'x_m': [6.5, 8.0], 'z_m': [6.0, 8.0]},
            {'id': 'S3 delay L', 'x_m': [-8.0, -6.5], 'z_m': [26.0, 28.0]}, {'id': 'S4 delay R', 'x_m': [6.5, 8.0], 'z_m': [26.0, 28.0]}]


def column_components(cls, min_h_frac=0.12, min_aspect=2.5):
    """Real columns in any photo, no camera needed: connected COLUMN-class regions, tall and thin."""
    n, lab, st, cen = cv2.connectedComponentsWithStats((cls == COLUMN).astype(np.uint8), 8)
    H = cls.shape[0]; out = []
    for k in range(1, n):
        x, y, w, h, a = st[k]
        if h >= min_h_frac * H and h >= min_aspect * w * 0.5:
            out.append({'u_px': int(x + w / 2), 'u_range_px': [int(x), int(x + w)], 'v_range_px': [int(y), int(y + h)]})
    return sorted(out, key=lambda r: r['u_px'])


def run(args):
    rep, occ, (xc, zc), cams, layers = project(args)
    hall = json.load(open(args.hall)); g = hall['geometry']; d = hall['dims']
    mdir = Path(args.masks); out = Path(args.overlays)
    man = json.load(open(mdir / 'manifest.json')); id2 = man['ade20k_labels']
    cam = cams['032-file_76']; stem = '032-file_76'
    img = load_rgb(man['photos'][stem]['source'], (1280, 720)); gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    sem = np.load(mdir / stem / 'sem.npy'); cls = pixel_classes(sem, dict(np.load(mdir / stem / 'inst.npz')), id2)
    # --- standing objects (SAM auto masks + metrology) -> occupancy
    objs = standing_objects(cam, dict(np.load(mdir / stem / 'auto.npz')), np.load(mdir / stem / 'disp.npy'), cls, cam.C[1], cam.cy)
    st = [o for o in objs if o['standing']]
    for o in st:
        P = np.array(o['foot_xz'])
        if not len(P):
            continue
        i, j, ok = grid_index(P[:, 0], P[:, 1])
        occ[i[ok], j[ok]] = MOVABLE if o['movable_share'] > 0.5 else FIXED
    rep['standing_objects_032'] = [{k: o[k] for k in ('id', 'D_m', 'h_m', 'vert', 'u_px', 'movable_share')} |
                                   {'x_m': [round(min(p[0] for p in o['foot_xz']), 1), round(max(p[0] for p in o['foot_xz']), 1)],
                                    'z_m': [round(min(p[1] for p in o['foot_xz']), 1), round(max(p[1] for p in o['foot_xz']), 1)]}
                                   for o in st if o['foot_xz']]

    def zone_stats(x, z):
        ii = (xc >= x[0]) & (xc <= x[1]); jj = (zc >= z[0]) & (zc <= z[1]); sub = occ[np.ix_(ii, jj)]
        return {k: round(float((sub == c).sum() * CELL * CELL), 1) for k, c in
                (('free', FREE), ('movable', MOVABLE), ('fixed', FIXED), ('mass', MASS), ('unseen', NONE))}
    zd = g['zones']['dance']['used']
    rep['model_dance_floor']['cells_m2'] = zone_stats(zd['x_m'], zd['z_m'])
    rep['recommended'] = REC | {'cells_m2': zone_stats(REC['x_m'], REC['z_m']),
                                'area_m2': (REC['x_m'][1] - REC['x_m'][0]) * (REC['z_m'][1] - REC['z_m'][0])}
    rep['speakers'] = [sp | {'cells_m2': zone_stats(sp['x_m'], sp['z_m'])} for sp in SPEAKERS]
    # --- column count along each row in 032
    scans = {}; boxes = []
    for rx in [x for x in g['rows_x_m'] if abs(x) <= 40]:
        sc = column_scan(cam, gray, rx, (-10.0, 39.5))
        if not sc:
            continue
        grid = np.array(g['column_grid_z_m']); vis = sc['z'][sc['valid']]
        model_in = [float(z) for z in grid if vis.min() + 0.5 <= z <= vis.max() - 0.5]
        peaks = []
        for pk in sc['peaks']:
            dz = float(grid[np.argmin(np.abs(grid - pk['z_m']))] - pk['z_m'])
            pk['nearest_model_z_m'] = round(pk['z_m'] + dz, 2); pk['dz_m'] = round(-dz, 2); pk['in_model'] = abs(dz) <= 1.5
            peaks.append(pk)
        missed = [z for z in model_in if not any(abs(p['z_m'] - z) <= 1.5 for p in peaks)]
        scans[f'x{rx:g}'] = {'z_visible_m': [round(float(vis.min()), 1), round(float(vis.max()), 1)], 'model_columns_in_view': len(model_in),
                             'peaks': peaks, 'model_without_peak_z_m': missed}
        for pk in peaks:
            boxes.append((rx, pk))
    rep['column_scan_032'] = scans
    big = cv2.resize(img, None, fx=1.5, fy=1.5, interpolation=cv2.INTER_CUBIC)
    for n, (rx, pk) in enumerate(boxes, 1):
        P = np.array([[rx - 0.4, 0, pk['z_m']], [rx + 0.4, 0, pk['z_m']], [rx - 0.4, 7.0, pk['z_m']], [rx + 0.4, 7.0, pk['z_m']]])
        uv, _ = cam.project(P); uv *= 1.5
        x0, x1 = int(uv[:, 0].min()) - 3, int(uv[:, 0].max()) + 3; y0, y1 = int(uv[:, 1].min()), int(uv[:, 1].max())
        colr = (0, 220, 0) if pk['in_model'] else (0, 0, 255)
        cv2.rectangle(big, (x0, y0), (x1, y1), colr, 2); pk['n'] = n
        label(big, str(n), (x0, y0 - 4), colr, 0.55)
    label(big, '032: column candidates from the vertical-edge scan along each row (x -36, -12, +12, +36). green = at a model grid line (+-1.5 m), red = NOT in the model', (8, 22), s=0.55)
    cv2.imwrite(str(out / 'columns-032-extra.png'), big)
    # --- per-photo column components (all analysed photos, no camera)
    comp = {}
    for md in [mdir] + [Path(p) for p in getattr(args, 'more_masks', [])]:
        mm = json.load(open(md / 'manifest.json'))
        for st_ in mm['photos']:
            c2 = pixel_classes(np.load(md / st_ / 'sem.npy'), dict(np.load(md / st_ / 'inst.npz')), mm['ade20k_labels'])
            cc = column_components(c2)
            comp[st_] = {'n': len(cc), 'u_px': [c['u_px'] for c in cc], 'size_px': mm['photos'][st_]['size_px'],
                         'share': {n_: round(float((c2 == c).mean()), 3) for n_, c in (('free', FREE), ('fixed', FIXED), ('movable', MOVABLE), ('mass', MASS), ('column', COLUMN))}}
    rep['column_components'] = comp
    # --- owner's marks (847 = 032 with his lines) with the model and the recommendation
    p847 = Path('/mnt/data/footage/inbox/2026-09-29/photo-847.jpg')
    if p847.exists():
        m = cv2.imread(str(p847))
        draw_segs(m, cam, rect_floor(zd['x_m'], zd['z_m']), (255, 80, 0), 2)
        draw_segs(m, cam, rect_floor(REC['x_m'], REC['z_m']), (0, 255, 0), 2)
        for sp in SPEAKERS:
            draw_segs(m, cam, box_edges(tuple(sp['x_m']), (0.0, 2.5), tuple(sp['z_m'])), (0, 0, 0), 3)
            draw_segs(m, cam, box_edges(tuple(sp['x_m']), (0.0, 2.5), tuple(sp['z_m'])), (255, 255, 255), 1)
            uv, _ = cam.project(np.array([np.mean(sp['x_m']), 2.8, sp['z_m'][1]])); label(m, sp['id'].split()[0], (int(uv[0]) - 8, int(uv[1])), (255, 255, 255))
        label(m, "847 = the owner's marks on 032. blue = model dance floor, green = recommended (x -6..6, z 8.5..40), white boxes = speaker candidates", (8, 18))
        cv2.imwrite(str(out / '847-marks-model-recommended.png'), m)
    plan_png(out / 'plan-occupancy.png', occ, g, d, REC, SPEAKERS, {'032': cam},
             'MOXIR floor occupancy from photo 032 (fitted camera, rays 11-42 m = z 8.2-39.7); SAM 2 / OneFormer / SAM standing objects; 0.5 m cells')
    (mdir / 'analysis.json').write_text(json.dumps(rep, indent=1, default=float))
    # --- features layer (new keys only; hall.py does not read them yet)
    polys = []
    for c, name in ((FIXED, 'standing_object'), (MASS, 'wall_or_mass'), (MOVABLE, 'movable')):
        mk = (occ == c).astype(np.uint8)
        cs, _ = cv2.findContours(mk.T.copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for cnt in cs:
            if cv2.contourArea(cnt) < 1:
                continue
            cnt = cv2.approxPolyDP(cnt, 1.0, True)[:, 0, :]
            polys.append({'class': name, 'xz_m': [[round(GX[0] + (q[0] + 0.5) * CELL, 2), round(GZ[0] + (q[1] + 0.5) * CELL, 2)] for q in cnt]})
    feat = {'site': 'MOXIR hall, Charentsavan', 'date': '2026-10-07',
            'layer': 'PHOTO ANALYSIS layer. NOT for dimsFiles yet: hall.py does not read these keys (floor_occupancy, column_check, zone_suggestions). No massing/cameras key, so it cannot replace an earlier list. Read with docs/moxir/PHOTO_ANALYSIS_2026-10-07.md.',
            'source': 'photo 032-file_76.jpg (the owner\'s 0387927a; camera = hall json geometry.cameras.photo-032), segmentation + depth by scripts/place/photo_analyse.py',
            'frame': 'HALL FRAME: metres, y up, x across (+x house right), z along (+z toward the entry), z 0 = expansion joint',
            'models': man['models'],
            'floor_occupancy': {'method': 'occupancy grid on y = 0, 0.5 m cells: OneFormer ADE20K floor pixels -> free; contacts of non-floor masks and SAM standing objects (single-view metrology height >= 0.4 m, verticality from DA-V2 relative depth) -> occupied',
                                'photo': '032-file_76.jpg', 'seen_z_m': [8.2, 39.7], 'confidence': 'medium for z 10-35 (fit rms 3 px -> +-0.2..0.8 m), low for z 8.2-10 and 35-40; "free" = no standing object, lying debris is NOT separated',
                                'polygons': polys},
            'column_check': {'method': 'vertical-edge scan along each row in photo 032 + manual reading of the zoomed photo', 'photo': '032-file_76.jpg', 'rows': scans,
                             'corrections': 'none applied: see the doc table; values are SUSPECTED until the 10-08 survey'},
            'zone_suggestions': {'dance_floor_recommended': REC | {'confidence': 'medium (seen free in 032, z 8.5-10 low)'},
                                 'speaker_candidates': SPEAKERS, 'basis': 'docs/moxir/PHOTO_ANALYSIS_2026-10-07.md'}}
    Path(args.features).write_text(json.dumps(feat, indent=1, default=float))
    summ = {k: rep[k] for k in ('model_dance_floor', 'recommended', 'speakers')}
    print(json.dumps(summ, indent=0)[:2500])
    print('standing', len(rep['standing_objects_032']), json.dumps(rep['standing_objects_032'])[:1500])
    print(json.dumps(scans)[:3000])
    print({k: (v['n'], v['u_px']) for k, v in comp.items()})
