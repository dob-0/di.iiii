#!/usr/bin/env python3
"""rectify.py - cut real-surface textures out of video frames (image-based modelling).

Reads the `textures` list of a plan JSON and writes one PNG per entry plus
textures/provenance.json (frame, method, numbers). No OpenCV needed: the
homography is solved with the standard DLT (Hartley & Zisserman, Multiple View
Geometry, 2nd ed., alg. 4.1) in numpy and applied with PIL's projective warp.

Entry kinds:
  quad    4 image points (TL, TR, BR, BL, frame pixels) of a plane rectangle
          w_m x h_m metres -> fronto-parallel texture at px_per_m.
  floor   pinhole camera model (f, cx, cy, pitch_deg down, height_m) maps a floor
          rectangle [x0,x1] x [z0,z1] metres (lateral, ahead) to the image.
Options: fill   [[x0,y0,x1,y1],...] frame-pixel boxes replaced row by row by a linear
                blend of the clean columns either side (removes a person or a
                reflection BEFORE the warp; every box is listed in provenance).
         flatten  sigma_px: divide out low-frequency light (flat field) so the
                texture holds the surface, not one moment's light.
         pad_m  [left, right] metres added by each row's mean of the clean texture
                (a surface seen only in part; said in provenance as EXTENDED).
         albedo  0..1: scale so the mean equals a published reflectance for the material
                 (the phone's exposure is not the surface's colour; values in DIMENSIONS.md).
         mirror_tile  true: 2x2 mirror so the texture tiles without seams.
Usage: python3 rectify.py <plan.json> <images_dir> <out_dir>
"""
import json, sys, os
import numpy as np
from PIL import Image, ImageFilter


def dlt(src, dst):
    A = []
    for (x, y), (u, v) in zip(src, dst):
        A.append([-x, -y, -1, 0, 0, 0, u * x, u * y, u])
        A.append([0, 0, 0, -x, -y, -1, v * x, v * y, v])
    _, _, vt = np.linalg.svd(np.asarray(A, float))
    H = vt[-1].reshape(3, 3)
    return H / H[2, 2]


def fill_boxes(arr, boxes, band=60):
    for x0, y0, x1, y1 in boxes:
        L = arr[y0:y1, max(0, x0 - band):x0].mean(axis=1)
        R = arr[y0:y1, x1:x1 + band].mean(axis=1)
        t = np.linspace(0, 1, x1 - x0)[None, :, None]
        arr[y0:y1, x0:x1] = L[:, None, :] * (1 - t) + R[:, None, :] * t
    return arr


def floor_points(e):
    f, cx, cy, p, h = e['f'], e['cx'], e['cy'], np.radians(e['pitch_deg']), e['height_m']
    out = []
    for X, Z in [(e['x0'], e['z1']), (e['x1'], e['z1']), (e['x1'], e['z0']), (e['x0'], e['z0'])]:
        # camera frame: x right, y down, z forward; world point on floor at (X, h below, Z ahead)
        yc = h * np.cos(p) - Z * np.sin(p)
        zc = h * np.sin(p) + Z * np.cos(p)
        out.append((cx + f * X / zc, cy + f * yc / zc))
    return out, e['x1'] - e['x0'], e['z1'] - e['z0']


def main(plan_path, img_dir, out_dir):
    plan = json.load(open(plan_path))
    os.makedirs(out_dir, exist_ok=True)
    prov = []
    for e in plan['textures']:
        src = Image.open(os.path.join(img_dir, e['frame'])).convert('RGB')
        arr = np.asarray(src, float)
        if e.get('fill'):
            arr = fill_boxes(arr.copy(), e['fill'])
        src = Image.fromarray(arr.clip(0, 255).astype(np.uint8))
        if e['kind'] == 'quad':
            pts, w_m, h_m = e['quad'], e['w_m'], e['h_m']
        else:
            pts, w_m, h_m = floor_points(e)
        ppm = e['px_per_m']
        W, H = int(round(w_m * ppm)), int(round(h_m * ppm))
        Hm = dlt([(0, 0), (W, 0), (W, H), (0, H)], pts)  # output -> source
        out = src.transform((W, H), Image.PERSPECTIVE, tuple(Hm.flatten()[:8]), Image.BICUBIC)
        a = np.asarray(out, float)
        if e.get('flatten'):
            low = np.asarray(out.filter(ImageFilter.GaussianBlur(e['flatten'])), float) + 1
            a = a / low * low.reshape(-1, 3).mean(0)
        if e.get('pad_m'):
            l, r = (int(round(v * ppm)) for v in e['pad_m'])
            prof = Image.fromarray(a.mean(axis=1, keepdims=True).clip(0, 255).astype(np.uint8))
            prof = prof.resize((1, a.shape[0])).filter(ImageFilter.BoxBlur(25))
            rowmean = np.asarray(prof, float)  # vertical light profile, smoothed: no text streaks
            rng = np.random.default_rng(0)
            noise = lambda n: rng.normal(0, 1.5, (a.shape[0], n, 3))
            a = np.concatenate([np.repeat(rowmean, l, 1) + noise(l), a, np.repeat(rowmean, r, 1) + noise(r)], 1)
        if e.get('albedo'):
            a = a * (e['albedo'] * 255.0 / a.reshape(-1, 3).mean())
        if e.get('mirror_tile'):
            a = np.concatenate([a, a[:, ::-1]], 1)
            a = np.concatenate([a, a[::-1]], 0)
        img = Image.fromarray(a.clip(0, 255).astype(np.uint8))
        p = os.path.join(out_dir, e['name'] + '.png')
        img.save(p)
        prov.append({'texture': e['name'] + '.png', 'frame': e['frame'], 'kind': e['kind'],
                     'image_points': [list(map(float, q)) for q in pts], 'metres': [w_m, h_m],
                     'px_per_m': ppm, 'filled_boxes': e.get('fill', []), 'extended_m': e.get('pad_m'),
                     'flatten_sigma': e.get('flatten'), 'albedo': e.get('albedo'), 'size_px': list(img.size), 'note': e.get('note', '')})
        print(e['name'], img.size)
    json.dump({'tool': 'scripts/place/model-hall/rectify.py', 'plan': plan_path, 'textures': prov},
              open(os.path.join(out_dir, 'provenance.json'), 'w'), indent=1)


if __name__ == '__main__':
    main(*sys.argv[1:4])
