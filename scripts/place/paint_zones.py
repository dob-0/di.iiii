#!/usr/bin/env python3
"""Read the owner's painted plan back as zones in hall coordinates (2026-10-08).

He paints, in GIMP, on a clean top plan that scripts/place/paint_plan.py draws (the nave plan or --full): the areas
where lasers can be, and what we can light. This turns his colours into zones the next pass can use.

  python3 -I scripts/place/paint_zones.py --painted '<his file>.png' --clean <the clean plan he started from>.png \
      --out zones.json [--overlay zones.png]

METHOD
  - What he painted = the pixels that differ from the clean plan (sum of |dR|+|dG|+|dB| > --threshold, default 60:
    PNG is lossless, so the clean plan's own pixels come back exactly; GIMP's soft brush edges below the threshold are
    dropped). The clean plan is the very file he opened: keep a copy before he paints (paint_plan.py's drawing has
    changed since, by 1038 px, so a regenerated plan is only the fallback: --regenerate).
  - Pixel <-> hall: the PNG's text chunk 'di-plan-map' (x0, z0, margin_px, px_per_m) from the painted file, else the
    clean one: x = x0 + (u - M) / ppm, z = z0 + (v - M) / ppm. GIMP may drop text chunks on export, hence the fallback.
  - Colours: each painted pixel is named by its hue (HSV, 12 named sectors) or as white/grey/black when its
    saturation is low; a colour with fewer than --min-px pixels is noise (a stray click) and is dropped.
  - Registration: GIMP can offset the layer (his 2026-10-08 file came 13 px low, the top rows transparent): the shift
    that makes the most unpainted pixels equal is found and undone; transparent pixels are never paint.
  - Zones: 8-connected components of each colour on a grid of --cell px (default 4 px = 0.1-0.16 m), after closing
    gaps of up to 3 cells (a quick brush loop is one zone). A component made of 4+ separate small marks (each under
    1 m2) is his typed note, not a zone: counted under small_marks. A stroke that
    closes a loop also ENCLOSES an area: the cells it surrounds (not reachable from the component's bounding box edge)
    are reported as 'encloses', so "a green loop around the back half" reads as that area, not only the line.
  - Each zone: colour, pixels, painted area m2, enclosed area m2, bounding box and centroid in hall metres, and the
    convex hull of the zone (+ its enclosed cells) as a polygon in hall metres (Andrew's monotone chain).
"""
import argparse, json, math, os, subprocess, sys

import numpy as np
from PIL import Image

NAMES = [(15, 'red'), (40, 'orange'), (70, 'yellow'), (150, 'green'), (195, 'teal'), (250, 'blue'), (290, 'purple'), (335, 'magenta'), (360, 'red')]


def plan_map(*imgs):
    for im in imgs:
        if im is not None and 'di-plan-map' in im.info:
            m = json.loads(im.info['di-plan-map'])
            return {'x0': m['x0'], 'z0': m['z0'], 'M': m['margin_px'], 'ppm': m['px_per_m'], 'source': 'png text chunk'}
    return None


def colour_name(rgb):
    r, g, b = (c / 255.0 for c in rgb)
    mx, mn = max(r, g, b), min(r, g, b)
    s = 0 if mx == 0 else (mx - mn) / mx
    if s < 0.25 or mx < 0.15:
        return 'black' if mx < 0.25 else ('white' if mx > 0.75 else 'grey')
    if mx == r:
        h = (60 * ((g - b) / (mx - mn)) + 360) % 360
    elif mx == g:
        h = 60 * ((b - r) / (mx - mn)) + 120
    else:
        h = 60 * ((r - g) / (mx - mn)) + 240
    return next(n for lim, n in NAMES if h <= lim)


def hull(pts):
    pts = sorted(set(map(tuple, pts)))
    if len(pts) <= 2:
        return pts
    cross = lambda o, a, b: (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, up = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0:
            lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(up) >= 2 and cross(up[-2], up[-1], p) <= 0:
            up.pop()
        up.append(p)
    return lo[:-1] + up[:-1]


def components(grid):
    """8-connected labelling of a boolean grid (iterative flood fill). Returns a list of (rows, cols) arrays."""
    seen = np.zeros_like(grid, bool)
    H, W = grid.shape
    out = []
    for r0, c0 in zip(*np.nonzero(grid)):
        if seen[r0, c0]:
            continue
        stack, rr, cc = [(r0, c0)], [], []
        seen[r0, c0] = True
        while stack:
            r, c = stack.pop()
            rr.append(r)
            cc.append(c)
            for dr in (-1, 0, 1):
                for dc in (-1, 0, 1):
                    a, b = r + dr, c + dc
                    if 0 <= a < H and 0 <= b < W and grid[a, b] and not seen[a, b]:
                        seen[a, b] = True
                        stack.append((a, b))
        out.append((np.array(rr), np.array(cc)))
    return out


def enclosed(rr, cc):
    """Cells inside a closed stroke: inside its bounding box (+1), not the stroke, not reachable from the box edge."""
    r0, r1, c0, c1 = rr.min() - 1, rr.max() + 1, cc.min() - 1, cc.max() + 1
    box = np.zeros((r1 - r0 + 1, c1 - c0 + 1), bool)
    box[rr - r0, cc - c0] = True
    free = ~box
    out = np.zeros_like(box)
    stack = [(i, j) for i in range(box.shape[0]) for j in (0, box.shape[1] - 1)] + [(i, j) for j in range(box.shape[1]) for i in (0, box.shape[0] - 1)]
    for i, j in stack:
        out[i, j] = True
    while stack:
        i, j = stack.pop()
        for a, b in ((i + 1, j), (i - 1, j), (i, j + 1), (i, j - 1)):      # 4-connected outside: a diagonal gap in a stroke still closes it
            if 0 <= a < box.shape[0] and 0 <= b < box.shape[1] and free[a, b] and not out[a, b]:
                out[a, b] = True
                stack.append((a, b))
    ins = free & ~out
    ir, ic = np.nonzero(ins)
    return ir + r0, ic + c0


def register(p, c, r=40):
    """The integer shift (dx, dy) with painted[y + dy, x + dx] == clean[y, x] on the most pixels: coarse (every 4 px of
    shift, an 8-px sample) then fine (+-4 px, a 4-px sample). Painting covers a minority of the canvas, so the
    unpainted plan decides."""
    H, W = c.shape[:2]

    def score(dx, dy, st):
        a = p[r + dy:H - r + dy:st, r + dx:W - r + dx:st]
        b = c[r:H - r:st, r:W - r:st]
        return float((np.abs(a - b).sum(-1) == 0).mean())
    best = max((score(dx, dy, 8), dx, dy) for dy in range(-r, r + 1, 4) for dx in range(-r, r + 1, 4))
    best = max((score(dx, dy, 4), dx, dy) for dy in range(best[2] - 4, best[2] + 5) for dx in range(best[1] - 4, best[1] + 5)
               if abs(dx) <= r and abs(dy) <= r)
    return best[1], best[2], round(best[0], 3)


def dilate(g, k):
    out = g.copy()
    for _ in range(k):
        o = out.copy()
        o[1:] |= out[:-1]
        o[:-1] |= out[1:]
        o[:, 1:] |= out[:, :-1]
        o[:, :-1] |= out[:, 1:]
        out = o
    return out


def read_zones(painted_path, clean_path, threshold=60, min_px=200, cell=4, min_zone_px=80, min_zone_m2=1.5, gap_cells=3):
    P = Image.open(painted_path)
    C = Image.open(clean_path)
    m = plan_map(P, C)
    if m is None:
        raise SystemExit('neither PNG carries the di-plan-map text chunk; pass the clean plan paint_plan.py wrote')
    if P.size != C.size:
        raise SystemExit('the painted file is %s px, the clean plan %s px: cropped or scaled in GIMP? (the map needs the same canvas)' % (P.size, C.size))
    pa = np.asarray(P.convert('RGBA')).astype(int)
    c = np.asarray(C.convert('RGB')).astype(int)
    dx, dy, agree = register(pa[..., :3], c)
    # move the painted canvas back onto the clean one (GIMP can offset a layer: 2026-10-08's file came 13 px low)
    p = np.zeros_like(c)
    al = np.zeros(c.shape[:2], int)
    H, W = c.shape[:2]
    ys0, ys1, xs0, xs1 = max(0, -dy), min(H, H - dy), max(0, -dx), min(W, W - dx)
    p[ys0:ys1, xs0:xs1] = pa[ys0 + dy:ys1 + dy, xs0 + dx:xs1 + dx, :3]
    al[ys0:ys1, xs0:xs1] = pa[ys0 + dy:ys1 + dy, xs0 + dx:xs1 + dx, 3]
    diff = (np.abs(p - c).sum(-1) > threshold) & (al >= 128)
    M, ppm, x0, z0 = m['M'], m['ppm'], m['x0'], m['z0']
    hall = lambda u, v: (round(x0 + (u - M) / ppm, 2), round(z0 + (v - M) / ppm, 2))
    ys, xs = np.nonzero(diff)
    names = np.array([colour_name(tuple(p[y, x])) for y, x in zip(ys, xs)]) if len(ys) else np.array([])
    zones, colours, marks, notes = [], {}, {}, []
    H, W = (diff.shape[0] + cell - 1) // cell, (diff.shape[1] + cell - 1) // cell
    # His typed notes are GIMP text with a white outline: the white marks, grown by a few cells, are the note boxes.
    # Coloured paint inside a note box is the lettering, not a zone.
    wg = np.zeros((H, W), bool)
    wsel = (p[ys, xs].min(-1) > 220) if len(ys) else np.zeros(0, bool)      # pure white: the outline GIMP put round his letters
    wg[ys[wsel] // cell, xs[wsel] // cell] = True
    notebox = dilate(wg, gap_cells + 1)
    for rr, cc in components(notebox):
        if (cc.max() - cc.min() + 1) * cell / ppm >= 4.0:          # a line of words is at least 4 m wide on the plan
            keepbox = True
        else:
            notebox[rr, cc] = False                                  # a short white mark: a crossing, not a note
            keepbox = False
        if keepbox:
            notes.append({'bbox_x_m': [hall(cc.min() * cell, 0)[0], hall((cc.max() + 1) * cell, 0)[0]],
                          'bbox_z_m': [hall(0, rr.min() * cell)[1], hall(0, (rr.max() + 1) * cell)[1]]})
    in_note = notebox[ys // cell, xs // cell] if len(ys) else np.zeros(0, bool)
    for name in sorted(set(names.tolist())):
        sel = (names == name) & ~in_note
        if name in ('white', 'grey', 'black'):
            colours[name] = {'px': int((names == name).sum()), 'kept': False, 'note': 'note outlines / plan marks, not a zone'}
            continue
        n = int(sel.sum())
        colours[name] = {'px': n, 'in_notes_px': int(((names == name) & in_note).sum()), 'kept': n >= min_px,
                         'mean_rgb': [int(v) for v in p[ys[sel], xs[sel]].mean(0)] if n else None}
        if n < min_px:
            continue
        grid = np.zeros((H, W), bool)
        grid[ys[sel] // cell, xs[sel] // cell] = True
        raw = components(grid)
        rawlab = np.full((H, W), -1)
        for k, (rr, cc) in enumerate(raw):
            rawlab[rr, cc] = k
        cellid = ys[sel] // cell * W + xs[sel] // cell
        for rr, cc in components(dilate(grid, gap_cells)):     # a brush loop with small gaps stays one zone
            keep = grid[rr, cc]
            rr, cc = rr[keep], cc[keep]
            inside = np.isin(cellid, rr * W + cc)
            px = int(inside.sum())
            if px < min_zone_px:
                continue
            parts = np.unique(rawlab[rr, cc])
            sizes = [len(raw[k][0]) * cell * cell / ppm ** 2 for k in parts]
            text = len(parts) >= 4 and max(sizes) < 1.0          # many small separate marks: the letters of a typed note
            if px / ppm ** 2 < min_zone_m2 or text:
                marks[name] = marks.get(name, 0) + 1
                continue
            er, ec = enclosed(rr, cc)
            us = np.concatenate([cc, ec]) * cell + cell / 2
            vs = np.concatenate([rr, er]) * cell + cell / 2
            hpts = [hall(u, v) for u, v in hull(list(zip(us.round(1), vs.round(1))))]
            uu, vv = xs[sel][inside], ys[sel][inside]
            zones.append({'colour': name, 'mean_rgb': [int(v) for v in p[vv, uu].mean(0)], 'px': px,
                          'painted_m2': round(px / ppm ** 2, 1), 'encloses_m2': round(len(er) * cell * cell / ppm ** 2, 1),
                          'bbox_x_m': [hall(uu.min(), 0)[0], hall(uu.max(), 0)[0]], 'bbox_z_m': [hall(0, vv.min())[1], hall(0, vv.max())[1]],
                          'centroid_m': list(hall(uu.mean(), vv.mean())),
                          'hull_m': hpts, 'kind': 'loop (encloses an area)' if len(er) * cell * cell > px else ('stroke' if px < 0.35 * max(1, (np.ptp(uu) + 1) * (np.ptp(vv) + 1)) else 'filled area')})
    zones.sort(key=lambda z: (z['colour'], -z['px']))
    # per colour, all its zones together: a loop his notes cut into pieces still reads as one outline
    for name in sorted({z['colour'] for z in zones}):
        pts = [q for z in zones if z['colour'] == name for q in z['hull_m']]
        colours[name]['all_zones_hull_m'] = [list(q) for q in hull(pts)]
        colours[name]['all_zones_bbox_x_m'] = [min(q[0] for q in pts), max(q[0] for q in pts)]
        colours[name]['all_zones_bbox_z_m'] = [min(q[1] for q in pts), max(q[1] for q in pts)]
    return {'painted': os.path.abspath(painted_path), 'clean': os.path.abspath(clean_path), 'map': m, 'threshold': threshold,
            'shift_px': [dx, dy], 'registration_equal_share': agree,
            'painted_px': int(diff.sum()), 'colours': colours, 'small_marks': marks, 'notes': notes, 'min_zone_m2': min_zone_m2, 'zones': zones}


def overlay(res, painted_path, out_png):
    from PIL import ImageDraw, ImageFont
    im = Image.open(painted_path).convert('RGB')
    d = ImageDraw.Draw(im)
    m = res['map']
    sx, sy = res['shift_px']
    px = lambda x, z: (m['M'] + (x - m['x0']) * m['ppm'] + sx, m['M'] + (z - m['z0']) * m['ppm'] + sy)
    try:
        f = ImageFont.truetype('/usr/share/fonts/TTF/DejaVuSans-Bold.ttf', 18)
    except OSError:
        f = ImageFont.load_default()
    for k, z in enumerate(res['zones']):
        pts = [px(*q) for q in z['hull_m']]
        if len(pts) >= 3:
            d.polygon(pts, outline=(255, 255, 255))
        cx, cy = px(*z['centroid_m'])
        t = '%d %s %s m2%s' % (k + 1, z['colour'], z['painted_m2'], (' / encl %s' % z['encloses_m2']) if z['encloses_m2'] else '')
        bb = d.textbbox((cx, cy), t, font=f, anchor='mm')
        d.rectangle([bb[0] - 3, bb[1] - 2, bb[2] + 3, bb[3] + 2], fill=(0, 0, 0))
        d.text((cx, cy), t, fill=(255, 255, 255), font=f, anchor='mm')
    im.save(out_png)


def main():
    a = argparse.ArgumentParser()
    a.add_argument('--painted', required=True)
    a.add_argument('--clean', help='the clean plan he started from (keep a copy before he paints)')
    a.add_argument('--regenerate', action='store_true', help='no clean copy: redraw it with paint_plan.py (needs --hall, --stage)')
    a.add_argument('--hall')
    a.add_argument('--stage')
    a.add_argument('--threshold', type=int, default=60)
    a.add_argument('--min-px', type=int, default=200)
    a.add_argument('--cell', type=int, default=4)
    a.add_argument('--out', required=True)
    a.add_argument('--overlay')
    o = a.parse_args()
    clean = o.clean
    if o.regenerate:
        m = plan_map(Image.open(o.painted))
        if not (o.hall and o.stage and m):
            raise SystemExit('--regenerate needs --hall, --stage and the map in the painted PNG')
        clean = os.path.splitext(o.out)[0] + '-clean-regenerated.png'
        cmd = [sys.executable, '-I', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'paint_plan.py'), '--hall', o.hall, '--stage', o.stage,
               '--out', clean, '--ppm', str(m['ppm'])] + (['--full'] if m['x0'] < -14.5 else [])
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL)
    if not clean:
        raise SystemExit('pass --clean <the plan he started from> or --regenerate')
    res = read_zones(o.painted, clean, o.threshold, o.min_px, o.cell)
    with open(o.out, 'w') as fh:
        json.dump(res, fh, indent=1)
    if o.overlay:
        overlay(res, o.painted, o.overlay)
    print('%d painted px, %d zones: %s' % (res['painted_px'], len(res['zones']), ', '.join('%s %sm2' % (z['colour'], z['painted_m2']) for z in res['zones'])))


if __name__ == '__main__':
    main()
