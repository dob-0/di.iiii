#!/usr/bin/env python3
"""Read the owner's painted plan into hall areas (2026-10-09, MOXIR v2).

He paints closed loops in colours on a plan made by paint_plan.py and writes what each one is. This reads them back:
  1. his strokes = the pixels that differ from the clean plan (so the plan's own drawing never counts);
  2. per colour (nearest of the --colour list, RGB distance), the strokes are thickened to close small gaps;
  3. an area = what a closed loop encloses: the pixels not reachable from the image border without crossing a stroke;
     enclosed bits under ~--min-m2 (the holes inside his letters) are dropped;
  4. each area is written in HALL METRES with the plan's own mapping (its di-plan-map PNG text chunk), as 1 m cells:
     per z row, the x runs inside the area. A cell is in when its centre is.
Limits: a loop he left open is not an area (the reading picture shows it); words are not read (the names come from
--colour); colours closer than ~70 RGB merge.

  python3 -I scripts/place/read_paint.py --plan clean.png --painted his.png --colour 'hot=224,64,0=hot zone' \\
      --colour 'use=0,224,64=we can use this area' --out zones.json --picture my-reading.png
"""
import argparse, json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

def label4(mask):
    """4-connected components of a boolean grid (two-pass union-find, Rosenfeld & Pfaltz 1966); 0 = background."""
    h, w = mask.shape; lab = np.zeros((h, w), np.int32); parent = [0]
    def find(a):
        while parent[a] != a: parent[a] = parent[parent[a]]; a = parent[a]
        return a
    m = mask.tolist(); L = [[0] * w for _ in range(h)]
    for y in range(h):
        row, up, Lr, Lu = m[y], (m[y - 1] if y else None), L[y], (L[y - 1] if y else None)
        for x in range(w):
            if not row[x]: continue
            a = Lr[x - 1] if x and row[x - 1] else 0; b = Lu[x] if up and up[x] else 0
            if a and b:
                ra, rb = find(a), find(b); Lr[x] = min(ra, rb)
                if ra != rb: parent[max(ra, rb)] = min(ra, rb)
            elif a or b: Lr[x] = a or b
            else: parent.append(len(parent)); Lr[x] = len(parent) - 1
    roots = np.array([find(i) for i in range(len(parent))], np.int32)
    return roots[np.array(L, np.int32)]

def main():
    a = argparse.ArgumentParser()
    a.add_argument('--plan', required=True); a.add_argument('--painted', required=True)
    a.add_argument('--colour', action='append', required=True, help="id=R,G,B=name (his words)")
    a.add_argument('--out', required=True); a.add_argument('--picture')
    a.add_argument('--min-m2', type=float, default=15.0); a.add_argument('--work-ppm', type=float, default=5.0); a.add_argument('--close-px', type=int, default=3)
    o = a.parse_args()
    clean = Image.open(o.plan); m = json.loads(clean.text['di-plan-map'])
    A = np.asarray(clean.convert('RGB')).astype(np.int16); B = np.asarray(Image.open(o.painted).convert('RGB')).astype(np.int16)
    if A.shape != B.shape: raise SystemExit(f'the painted picture is {B.shape[1]}x{B.shape[0]}, the plan {A.shape[1]}x{A.shape[0]}: not the same plan')
    changed = np.abs(A - B).sum(2) > 60
    cols = []
    for c in o.colour:
        cid, rgb, name = c.split('=', 2); cols.append((cid, np.array([int(v) for v in rgb.split(',')]), name))
    dist = np.stack([np.abs(B - c[1].astype(np.int16)).sum(2) for c in cols])          # L1 distance to each colour
    near = dist.argmin(0); ok = changed & (dist.min(0) < 110)
    M, P, x0, z0 = m['margin_px'], m['px_per_m'], m['x0'], m['z0']
    H, W = changed.shape
    zones, pic = [], (B.astype(np.uint8).copy() if o.picture else None)
    for i, (cid, rgb, name) in enumerate(cols):
        s = ok & (near == i)
        if not s.any(): zones.append({'id': cid, 'name': name, 'areas': [], 'note': 'no strokes in this colour'}); continue
        # work at 1 px = 1/k m (k = --work-ppm): the loops are metres wide, his letters' holes vanish, and it runs in seconds;
        # the block 'any' plus a 3 px max filter closes gaps up to ~0.6 m in his strokes
        f = max(1, int(round(P / o.work_ppm))); hh, ww = H // f, W // f
        s = s[:hh * f, :ww * f].reshape(hh, f, ww, f).any(axis=(1, 3))
        s = np.asarray(Image.fromarray((s * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(o.close_px))) > 0
        lab = label4(~s)                                                  # regions between his strokes
        border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}   # outside = touches the edge
        ids, counts = np.unique(lab[lab > 0], return_counts=True)
        areas = []
        for rid, px_n in zip(ids, counts):
            if rid in border: continue
            if px_n * f * f / P / P < o.min_m2: continue
            reg = lab == rid
            Pp, Mp = P / f, M / f   # this grid's own scale
            # 1 m cells: a cell is in when its centre pixel is in the region
            rows = []
            for zc in np.arange(np.floor(z0) + 0.5, z0 + (H - 2 * M) / P, 1.0):
                yp = int((Mp + (zc - z0) * Pp))
                if not 0 <= yp < hh: continue
                xin = [xc for xc in np.arange(np.floor(x0) + 0.5, x0 + (W - 2 * M) / P, 1.0) if 0 <= int(Mp + (xc - x0) * Pp) < ww and reg[yp, int(Mp + (xc - x0) * Pp)]]
                runs, start, prev = [], None, None
                for xc in xin:
                    if start is None: start = prev = xc
                    elif xc - prev > 1.01: runs.append([start - 0.5, prev + 0.5]); start = xc
                    prev = xc
                if start is not None: runs.append([start - 0.5, prev + 0.5])
                if runs: rows.append({'z': float(zc), 'x_runs': [[float(r[0]), float(r[1])] for r in runs]})
            ys2, xs2 = np.nonzero(reg)
            areas.append({'m2': round(px_n / Pp / Pp, 1), 'x_m': [round(x0 + (xs2.min() - Mp) / Pp, 1), round(x0 + (xs2.max() + 1 - Mp) / Pp, 1)],
                          'z_m': [round(z0 + (ys2.min() - Mp) / Pp, 1), round(z0 + (ys2.max() + 1 - Mp) / Pp, 1)], 'cells_1m': rows})
            if pic is not None:
                big = np.zeros((H, W), bool); big[:hh * f, :ww * f] = np.repeat(np.repeat(reg, f, 0), f, 1)
                pic[big] = (0.55 * pic[big] + 0.45 * rgb).astype(np.uint8)
        areas.sort(key=lambda r: r['x_m'][0])
        zones.append({'id': cid, 'name': name, 'colour_rgb': rgb.tolist(), 'areas': areas})
    rec = {'what': 'the owner\'s painted areas, read into hall metres', 'painted': o.painted, 'plan': o.plan, 'map': m,
           'method': 'scripts/place/read_paint.py (diff against the clean plan, nearest colour, closed loops, 1 m cells)', 'zones': zones}
    json.dump(rec, open(o.out, 'w'), indent=1)
    if pic is not None:
        im = Image.fromarray(pic); d = ImageDraw.Draw(im)
        for z in zones:
            for k, ar in enumerate(z['areas']):
                cx = M + ((ar['x_m'][0] + ar['x_m'][1]) / 2 - x0) * P; cy = M + ((ar['z_m'][0] + ar['z_m'][1]) / 2 - z0) * P
                t = f"{z['id']}{k + 1 if len(z['areas']) > 1 else ''}: {z['name']} · {ar['m2']:g} m²"
                bb = d.textbbox((cx, cy), t, anchor='mm'); d.rectangle([bb[0] - 4, bb[1] - 3, bb[2] + 4, bb[3] + 3], fill=(0, 0, 0)); d.text((cx, cy), t, fill=tuple(int(v) for v in z['colour_rgb']), anchor='mm')
        im.save(o.picture)
    for z in zones: print(z['id'], z['name'], [(a_['m2'], a_['x_m'], a_['z_m']) for a_ in z['areas']] or z.get('note'))

if __name__ == '__main__':
    main()
