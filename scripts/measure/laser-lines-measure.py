#!/usr/bin/env python3
"""laser-lines-measure.py — how a room's laser lines read in a screenshot: width, brightness, separability.

    python3 -I scripts/measure/laser-lines-measure.py --doc document.json --shots shots.json --dir <png dir> [--out m.json]

shots.json is the plan light-env-shots.cjs ran ([{ name, camera: { position, target, fov } }]; a shot with camera null is
skipped). Every laser line of the document (an entity whose beam holds `laser`; a frame's lit points each their own line,
laserLine.js fieldDirection) is projected into the 1600×900 picture with the shot's camera (three.js PerspectiveCamera.lookAt,
up +Y, vertical fov), and along it at s = 5, 10, 20, 40 m from the aperture this reads, on the Rec.709 luma of the sRGB pixels:
  peak       the brightest pixel within 2 px of the projected point (0..255),
  bg         the median of a ring 12..20 px around it,
  fwhm_px    the full width at half maximum (above bg) across the projected line, in pixels, and in metres at that point's
             distance from the camera (the vertical pixel angle × distance; the picture is square-pixel).
And per shot, on the row through the cube fan at s = 20 m, the number of separate peaks (a local maximum whose drop to the
lower neighbouring minimum is ≥ 6 luma levels) — how many of the lines can be told apart there.
Read-only. Units: metres, degrees, 8-bit luma. Method written 2026-10-15 for the laser-look job (no published method for
"lines in a screenshot"; marked unvalidated beyond the stated arithmetic).
"""
import argparse
import json
import math
import os

import numpy as np
from PIL import Image

W, H = 1600, 900


def euler_xyz(r):
    x, y, z = r
    cx, sx, cy, sy, cz, sz = math.cos(x), math.sin(x), math.cos(y), math.sin(y), math.cos(z), math.sin(z)
    rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return rx @ ry @ rz  # three.js Euler order 'XYZ'


def field_dir(x, y, half):
    tx, ty = math.tan(x * half * math.pi / 180), math.tan(y * half * math.pi / 180)
    n = math.sqrt(tx * tx + ty * ty + 1)
    return np.array([tx / n, -1 / n, ty / n])


def lines_of(doc):
    out = []
    for e in doc.get('entities', []):
        c = e.get('components') or {}
        laser = (c.get('beam') or {}).get('laser')
        if not laser:
            continue
        t = c.get('transform') or {}
        p, R = np.array(t.get('position', [0, 0, 0]), float), euler_xyz(t.get('rotation', [0, 0, 0]))
        half = float(laser.get('fieldHalfDeg', 18.5))
        frame = laser.get('frame') or ((laser.get('frames') or {}).get('list') or [None])[0] or [[0, 0, 1, 1, 1]]
        lit = [pt for pt in frame if any(v > 0 for v in pt[2:5])] or [[0, 0, 1, 1, 1]]
        seen = set()
        for pt in lit:
            key = (round(pt[0], 4), round(pt[1], 4))
            if key in seen:
                continue
            seen.add(key)
            out.append({'id': e['id'], 'watts': round(sum(laser['mW']) / 1000, 2), 'p': p, 'd': R @ field_dir(pt[0], pt[1], half)})
    return out


def camera(cam):
    pos, tgt = np.array(cam['position'], float), np.array(cam['target'], float)
    f = tgt - pos
    f /= np.linalg.norm(f)
    r = np.cross(f, [0, 1, 0])
    r /= np.linalg.norm(r)
    u = np.cross(r, f)
    k = (H / 2) / math.tan(math.radians(cam.get('fov', 50)) / 2)
    return pos, f, r, u, k


def project(cm, x):
    pos, f, r, u, k = cm
    v = x - pos
    z = v @ f
    if z < 0.2:
        return None
    return (W / 2 + k * (v @ r) / z, H / 2 - k * (v @ u) / z, z)


def luma(img):
    a = img[..., :3].astype(float) / 255
    return 255 * (0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2])


def sample(L, cm, line, s):
    a = project(cm, line['p'] + line['d'] * s)
    b = project(cm, line['p'] + line['d'] * (s + 0.5))
    if not a or not b or not (25 <= a[0] < W - 25 and 25 <= a[1] < H - 25):
        return None
    x, y = int(round(a[0])), int(round(a[1]))
    peak = float(L[y - 2:y + 3, x - 2:x + 3].max())
    yy, xx = np.mgrid[-20:21, -20:21]
    ring = (yy * yy + xx * xx >= 144) & (yy * yy + xx * xx <= 400)
    bg = float(np.median(L[y - 20:y + 21, x - 20:x + 21][ring]))
    t = np.array([b[0] - a[0], b[1] - a[1]])
    n = np.array([-t[1], t[0]]) / max(np.linalg.norm(t), 1e-9)
    prof = []
    for o in np.arange(-15, 15.25, 0.25):
        px, py = a[0] + n[0] * o, a[1] + n[1] * o
        prof.append(L[min(H - 1, max(0, int(round(py)))), min(W - 1, max(0, int(round(px))))])
    prof = np.array(prof) - bg
    m = prof.max()
    fw = float((prof >= m / 2).sum() * 0.25) if m > 3 else None
    px_angle = 2 * math.tan(math.radians(cm_fov(cm)) / 2) / H
    return {'s': s, 'px': [x, y], 'peak': round(peak, 1), 'bg': round(bg, 1), 'fwhm_px': fw,
            'fwhm_m': round(fw * px_angle * a[2], 4) if fw else None, 'dist_m': round(a[2], 2)}


def cm_fov(cm):
    return math.degrees(2 * math.atan((H / 2) / cm[4]))


def peaks_on_row(L, row, x0, x1, drop=6):
    v = L[row, max(0, x0):min(W, x1)]
    n = 0
    for i in range(1, len(v) - 1):
        if v[i] >= v[i - 1] and v[i] > v[i + 1]:
            left = v[max(0, i - 25):i].min()
            right = v[i + 1:i + 26].min()
            if v[i] - max(left, right) >= drop:
                n += 1
    return n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--doc', required=True)
    ap.add_argument('--shots', required=True)
    ap.add_argument('--dir', required=True)
    ap.add_argument('--out')
    a = ap.parse_args()
    doc = json.load(open(a.doc))
    doc = doc.get('document', doc)
    lines = lines_of(doc)
    res = {'lines': len(lines), 'shots': {}}
    shots = json.load(open(a.shots))
    for shot in (shots['shots'] if isinstance(shots, dict) else shots):
        f = os.path.join(a.dir, shot.get('file') or shot['name'] + '.png')
        if not shot.get('camera') or not os.path.exists(f):
            continue
        L = luma(np.asarray(Image.open(f).convert('RGB')))
        cm = camera(shot['camera'])
        per = {}
        for ln in lines:
            key = ln['id'] if ln['watts'] < 5 else f"{ln['id']}@{len([k for k in per if k.startswith(ln['id'])])}"
            per[key] = {'watts': ln['watts'], 'at': [x for x in (sample(L, cm, ln, s) for s in (5, 10, 20, 40)) if x]}
        cubes = [ln for ln in lines if ln['watts'] < 5]
        pts = [project(cm, ln['p'] + ln['d'] * 20) for ln in cubes]
        pts = [p for p in pts if p and 0 <= p[1] < H]
        sep = None
        if pts:
            row = int(round(np.median([p[1] for p in pts])))
            xs = [p[0] for p in pts]
            sep = {'row': row, 'peaks': peaks_on_row(L, row, int(min(xs)) - 10, int(max(xs)) + 10), 'of': len(cubes)}

        def agg(sel, s):
            v = [x for k, r in per.items() if sel(r) for x in r['at'] if x['s'] == s]
            if not v:
                return None
            fw = [x['fwhm_m'] for x in v if x['fwhm_m']]
            fp = [x['fwhm_px'] for x in v if x['fwhm_px']]
            return {'n': len(v), 'peak_median': round(float(np.median([x['peak'] for x in v])), 1),
                    'bg_median': round(float(np.median([x['bg'] for x in v])), 1),
                    'fwhm_px_median': round(float(np.median(fp)), 2) if fp else None,
                    'fwhm_m_median': round(float(np.median(fw)), 4) if fw else None}
        res['shots'][shot['name']] = {
            'separable_at_20m': sep,
            'cube': {s: agg(lambda r: r['watts'] < 5, s) for s in (5, 10, 20, 40)},
            'forty': {s: agg(lambda r: r['watts'] >= 5, s) for s in (5, 10, 20, 40)},
            'mean_luma': round(float(L.mean()), 2)}
    txt = json.dumps(res, indent=1)
    if a.out:
        open(a.out, 'w').write(txt)
    print(txt)


if __name__ == '__main__':
    main()
