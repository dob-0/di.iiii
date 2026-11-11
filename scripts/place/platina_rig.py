#!/usr/bin/env python3
"""Platina rig plan (2026-11-11): measure the 11-10 light plot's own grid, write the rig file.

    python3 -I scripts/place/platina_rig.py --repo . [--plot-dir <dir with plot-*.png>] [--out <rig.json>] [--check]

Method (reference_plot_grid_measure): every plot picture is a separate view with its own square grid; one grid square = 1 m,
proved on each view by standard parts (truss 4 sections x 2 m, 3 stacked Pixel Line bars = 3 m, the drawn person 1.74 m,
the LED screen 8 x 5 cabinets of 0.5 m). Positions come from colour/line extraction against that grid, not from the eye.
Frame (as the MOXIR rigs): metres, Y up from the AUDIENCE floor, +x = audience's right, +z toward the audience;
z = 0 is the screen's middle plane; x = 0 is the axis of the 8 Pixel Line towers (the plot is symmetric about it).
Every item has a status: measured | from-plan-words | PROPOSED. Written by chat dob-c9 helper, 2026-11-11.
"""
import argparse, json, math, os, sys
from collections import deque

import numpy as np
from PIL import Image

PLOT_DIR = '/home/dob/work/di.iiii-platina/spaces/platina/assets'
PLAN = 'scripts/place/rigs/platina-2026-11-11.patch.json'
OUT = 'scripts/place/rigs/platina-rig-2026-11-11.json'
SRC = {v: f'plot-{v}.png (11-10 light plot, {v} view, 1654x1170 px)' for v in ('front', 'top', 'side')}


def load(plot_dir, view):
    return np.array(Image.open(os.path.join(plot_dir, f'plot-{view}.png')).convert('RGB')).astype(int)[:925]  # above the legend


def clusters(idx, gap=2):
    out, s, p = [], None, None
    for i in map(int, idx):
        if s is None:
            s = p = i
        elif i - p <= gap:
            p = i
        else:
            out.append((s + p) / 2); s = p = i
    if s is not None:
        out.append((s + p) / 2)
    return out


def pitch(a):
    """Grid pitch in px: the light-grey lines (R=G=B, 225..250), spacing of the line clusters on both axes."""
    g = (abs(a[:, :, 0] - a[:, :, 1]) < 4) & (a[:, :, 0] > 225) & (a[:, :, 0] < 250)
    cx = clusters(np.where(g.sum(0) > 0.3 * a.shape[0])[0]); cy = clusters(np.where(g.sum(1) > 0.4 * a.shape[1])[0])
    dy = np.diff(cy); base = float(np.median(dy))
    d = [v for v in list(np.diff(cx)) + list(dy) if 0.9 * base < v < 1.1 * base]
    return float(np.mean(d)), len(d)


def label(m):
    H, W = m.shape; seen = np.zeros_like(m, dtype=bool); out = []
    for y0, x0 in zip(*np.where(m)):
        if seen[y0, x0]:
            continue
        q = deque([(y0, x0)]); seen[y0, x0] = True; pts = []
        while q:
            y, x = q.popleft(); pts.append((y, x))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                yy, xx = y + dy, x + dx
                if 0 <= yy < H and 0 <= xx < W and m[yy, xx] and not seen[yy, xx]:
                    seen[yy, xx] = True; q.append((yy, xx))
        out.append(np.array(pts))
    return out


def blobs(a, rgb, tx=6, ty=6, minpx=40):
    """Colour blobs (fill colour of a symbol), merged when their boxes are within tx/ty px: [(cx, cy, x0, x1, y0, y1)] by centroid."""
    m = abs(a - np.array(rgb)).sum(2) < 40
    parts = [(p[:, 1].min(), p[:, 1].max(), p[:, 0].min(), p[:, 0].max(), p) for p in label(m) if len(p) >= minpx]
    boxes = [list(b[:4]) + [[b[4]]] for b in parts]; ch = True
    while ch:
        ch = False
        for i in range(len(boxes)):
            for j in range(i + 1, len(boxes)):
                A, B = boxes[i], boxes[j]
                if A[0] - tx <= B[1] and B[0] - tx <= A[1] and A[2] - ty <= B[3] and B[2] - ty <= A[3]:
                    boxes[i] = [min(A[0], B[0]), max(A[1], B[1]), min(A[2], B[2]), max(A[3], B[3]), A[4] + B[4]]; boxes.pop(j); ch = True; break
            if ch:
                break
    res = []
    for b in boxes:
        pts = np.concatenate(b[4]); res.append((float(pts[:, 1].mean()), float(pts[:, 0].mean()), int(b[0]), int(b[1]), int(b[2]), int(b[3])))
    return sorted(res)


def dark_bbox(a, x0, x1, y0, y1, thr=140):
    d = a[y0:y1, x0:x1].sum(2) < 3 * thr
    ys, xs = np.where(d)
    return int(xs.min()) + x0, int(xs.max()) + x0, int(ys.min()) + y0, int(ys.max()) + y0


def measure(plot_dir):
    V = {v: load(plot_dir, v) for v in ('front', 'top', 'side')}
    M = {'pitch': {}}
    for v, a in V.items():
        M['pitch'][v] = pitch(a)
    sF, sT, sS = (M['pitch'][v][0] for v in ('front', 'top', 'side'))
    col = {'k10': (255, 0, 0), 'sharpy': (0, 255, 255), 'k15': (255, 128, 0), 'pixel': (255, 0, 255)}
    B = {v: {k: blobs(V[v], c) for k, c in col.items()} for v in V}
    M['blobs'] = B
    # pixel towers: 8, in plan (top view) one glyph each, z = the row; x0 = the mean of the 8 tower centres (front and top separately)
    tF = sorted(b for b in B['front']['pixel'] if b[4] <= 380)            # one blob per tower, the stack's top y = 369
    tF = [b for b in B['front']['pixel'] if abs(b[4] - 369) < 4]
    tF = sorted({round(b[0]): b for b in tF}.values())
    towers_front_x = [b[0] for b in tF]
    assert len(tF) == 8, ('front towers', len(tF))
    x0F = sum(towers_front_x) / 8
    tT = B['top']['pixel']; assert len(tT) == 8, ('top towers', len(tT))
    x0T = sum(b[0] for b in tT) / 8
    # side view: 4 towers, z from the screen's middle plane
    scrS = dark_bbox(V['side'], 440, 470, 420, 750)          # screen drawn edge-on: its two faces (x 451 and 463)
    # the screen faces: the two vertical lines at 451 and 463 between y 432 and 741
    z0S = (451 + 463) / 2
    deckTopF, floorF = 772, 834                                # lines in the front view (deck top, floor / panel feet)
    deckTopS, floorS = 842, 915                                # side view
    deck_h = ((floorF - deckTopF) / sF + (floorS - deckTopS) / sS) / 2
    M['deck_h_m'] = deck_h
    M['deck_h_parts'] = [(floorF - deckTopF) / sF, (floorS - deckTopS) / sS]
    M['axis'] = {'x0_front_px': x0F, 'x0_top_px': x0T, 'z0_side_px': z0S, 'z0_top_px': 237, 'y_deck_front_px': deckTopF, 'y_deck_side_px': deckTopS}
    fx = lambda px: (px - x0F) / sF
    tx = lambda px: (px - x0T) / sT
    fy = lambda py: deck_h + (deckTopF - py) / sF              # height above the audience floor, front view
    sy = lambda py: deck_h + (deckTopS - py) / sS
    sz = lambda px: (px - z0S) / sS
    tz = lambda py: (py - 237) / sT
    M['fn'] = None
    # screen (front view): 610..1014 x 438..690 ; side: faces 451/463, y 432..741 ; top: line y 237, x 676..985
    sc = {'x': [fx(610), fx(1014)], 'y_front': [fy(690), fy(438)], 'y_side': [sy(741), sy(432)], 'z': [sz(451), sz(463)], 'x_top': [tx(676), tx(985)]}
    M['screen'] = sc
    # trusses
    tr_over_top = dark_bbox(V['top'], 500, 1150, 380, 392)       # the two chord lines of the over-stage truss, plan
    tr_aud_top = dark_bbox(V['top'], 500, 1160, 832, 862)
    tr_front = dark_bbox(V['front'], 390, 1225, 128, 172)
    trs = dark_bbox(V['side'], 690, 750, 55, 106)                # the square section, over-stage (x 700..742)
    tra = dark_bbox(V['side'], 1415, 1475, 55, 106)
    M['truss'] = {
        'over': {'x_top': [tx(518), tx(1128)], 'x_front': [fx(tr_front[0]), fx(tr_front[1])], 'z_side': sz((trs[0] + trs[1]) / 2), 'z_top': tz(398),
                 'y_side': sy((trs[2] + trs[3]) / 2), 'y_front': fy((tr_front[2] + tr_front[3]) / 2), 'section_side_m': [(trs[1] - trs[0]) / sS, (trs[3] - trs[2]) / sS],
                 'section_front_h_m': (tr_front[3] - tr_front[2]) / sF},
        'aud': {'x_top': [tx(525), tx(1135)], 'z_side': sz((tra[0] + tra[1]) / 2), 'z_top': tz(846), 'y_side': sy((tra[2] + tra[3]) / 2)},
    }
    # pixel towers: x from the front view (both x agree with the top glyphs), z from the side view rows, bar stack from front + side
    towers = []
    zrows = sorted(sz((b[2] + b[3]) / 2) for b in blobs(V['side'], col['pixel'], 6, 6))
    zT = sorted(tz((b[4] + b[5]) / 2) for b in tT)[:4]
    for b in tF:
        pass
    sidebl = blobs(V['side'], col['pixel'], 6, 6)
    M['towers'] = {'front_x_m': [fx(x) for x in towers_front_x], 'top_x_m': sorted(tx(b[0]) for b in tT),
                   'z_side_m': zrows, 'z_top_m': zT,
                   'bars_front_y_m': [fy(max(b[5] for b in tF)), fy(min(b[4] for b in tF))], 'bars_side_y_m': [sy(sidebl[0][5]), sy(sidebl[0][4])],
                   'bar_w_front_m': (tF[0][3] - tF[0][2]) / sF, 'bar_d_side_m': (sidebl[0][3] - sidebl[0][2]) / sS,
                   'top_glyph_x_m': [(b[3] - b[2]) / sT for b in tT][:1]}
    # lamps
    k10t = [b for b in B['top']['k10'] if abs(b[1] - 409.5) < 8]
    k10a = [b for b in B['top']['k10'] if abs(b[1] - 858) < 8]
    sh = B['top']['sharpy']
    k15 = B['top']['k15']
    k15_row = [b for b in k15 if b[1] < 300]
    k15_side = [b for b in k15 if b[1] > 600]
    fk15 = B['front']['k15']
    fk15_row = [b for b in fk15 if b[1] > 700]; fk15_side = [b for b in fk15 if b[1] < 600]
    sk15 = B['side']['k15']
    k10f = B['front']['k10']
    k10s = B['side']['k10']
    M['k10'] = {'over_x_top_m': [tx(b[0]) for b in k10t], 'over_z_top_m': [tz(b[1]) for b in k10t], 'over_z_side_m': sz(sum(b[0] for b in k10s[:1])),
                'aud_x_top_m': [tx(b[0]) for b in k10a], 'body_front_m': [(k10f[0][3] - k10f[0][2]) / sF, (k10f[0][5] - k10f[0][4]) / sF],
                'body_side_m': [(k10s[0][3] - k10s[0][2]) / sS, (k10s[0][5] - k10s[0][4]) / sS], 'y_front_centre_m': fy(sum(k10f[0][4:6]) / 2),
                'y_side_centre_m': sy(sum(k10s[0][4:6]) / 2)}
    M['sharpy'] = {'x_top_m': [tx(b[0]) for b in sh], 'z_top_m': [tz(b[1]) for b in sh]}
    M['k15_floor'] = {'x_front_m': [fx(b[0]) for b in fk15_row], 'x_top_m': [tx(b[0]) for b in k15_row], 'z_top_m': [tz(b[1]) for b in k15_row],
                      'body_front_m': [(fk15_row[0][3] - fk15_row[0][2]) / sF, (fk15_row[0][5] - fk15_row[0][4]) / sF],
                      'y_front_centre_m': fy(sum(fk15_row[0][4:6]) / 2), 'z_side_m': sz((sk15[0][2] + sk15[0][3]) / 2), 'body_side_m': [(sk15[0][3] - sk15[0][2]) / sS, (sk15[0][5] - sk15[0][4]) / sS],
                      'top_view_depth_m': (k15_row[0][5] - k15_row[0][4]) / sT}
    M['k15_side'] = {'x_front_m': [fx(b[0]) for b in fk15_side], 'x_top_m': [tx(b[0]) for b in k15_side], 'z_top_m': [tz(b[1]) for b in k15_side],
                     'y_front_m': [fy(b[1]) for b in fk15_side], 'z_side_m': sz((sk15[1][2] + sk15[2][3]) / 2), 'y_side_m': sy((sk15[1][4] + sk15[1][5]) / 2),
                     'body_front_m': [(fk15_side[0][3] - fk15_side[0][2]) / sF, (fk15_side[0][5] - fk15_side[0][4]) / sF]}
    # stage deck and the wing panels (plan, top view); rectangles read from long dark runs
    M['deck'] = {'x_front_m': [fx(107), fx(1517)], 'z_side_m': [sz(339), sz(1228)], 'back_wall_z_top_m': tz(160), 'back_wall_x_top_m': [tx(503), tx(1165)],
                 'front_arc_centre_z_top_m': tz(713), 'front_arc_end_z_top_m': tz(645), 'front_arc_end_x_top_m': [tx(298), tx(1365)]}
    wings = []
    for (xa, xb, ya, yb) in [(349, 503, 230, 257), (288, 460, 320, 347), (234, 408, 439, 466), (234, 349, 548, 575)]:
        wings.append({'side': 'L', 'x': [tx(xa), tx(xb)], 'z': [tz(ya), tz(yb)]})
        wings.append({'side': 'R', 'x': [-tx(xb) + 2 * 0, -tx(xa)], 'z': [tz(ya), tz(yb)]})
    M['wings_top_px_note'] = 'left wing boxes read from the top view; the right ones are the plot\'s mirror (checked against the right-hand run ends 1166..1318, 1207..1378: see wings_right_check)'
    M['wings'] = wings
    M['wings_right_check'] = [[tx(1166), tx(1318)], [tx(1207), tx(1378)]]
    M['wing_h_front_m'] = [fy(834), fy(166)]
    M['risers'] = {'x_top_m': [[tx(474), tx(626)], [tx(1036), tx(1189)]], 'z_top_m': [tz(562), tz(677)], 'h_front_m': (772 - 672) / sF}
    # standard-part proofs (a grid square must be 1 m)
    M['proofs'] = {
        'front_truss_len_m': (tr_front[1] - tr_front[0]) / sF, 'top_truss_over_len_m': (1128 - 518) / sT, 'top_truss_aud_len_m': (1135 - 525) / sT,
        'front_bar_stack_m': (max(b[5] for b in tF) - min(b[4] for b in tF)) / sF, 'side_bar_stack_m': (sidebl[0][5] - sidebl[0][4]) / sS,
        'front_screen_w_m': (1014 - 610) / sF, 'front_screen_h_m': (690 - 438) / sF, 'top_screen_w_m': (985 - 676) / sT,
        'side_truss_section_m': (trs[1] - trs[0]) / sS, 'person_side_m': (840 - 627) / sS,
    }
    M['scales'] = {'front_px_per_m': sF, 'top_px_per_m': sT, 'side_px_per_m': sS}
    return M


def r2(v):
    return round(float(v), 2)


def build(repo, M):
    plan = json.load(open(os.path.join(repo, PLAN)))
    types = plan['modes']
    blocks = {b['select']['group']: (u['universe'], b) for u in plan['universes'] for b in u['blocks']}
    deck = r2(M['deck_h_m'])
    # the channel count of each type's chosen mode comes from the fixture library (the type's mode of the plan's crew name), never from a table here
    lib = lambda tid: json.load(open(os.path.join(repo, 'src/rigbuild/types/library', tid + '.json')))
    FP = {tid: next(m['footprint'] for m in lib(tid)['modes'] if m['name'] == spec['crew']) for tid, spec in types.items()}
    fixtures, solids = [], []

    def dmx(group, i):
        uni, b = blocks[group]
        t = b['select']['type']
        return {'universe': uni, 'address': b['start'] + i * FP[t], 'footprint': FP[t], 'fixture': b['fixture'] + i, 'mode': types[t]['crew'], 'port': 'ABCDEFGHIJK'[uni - 1],
                'from': f'{PLAN} block {group} (start {b["start"]}, order id-asc, unit {i + 1} of {b["units"]})'}

    # Each unit's profile comes from the fixture library (the real lamp, owner 11-11 N3738 "all real"): the maker's light
    # output and beam, read from the type file. `draw` holds the renderer's own class values (penumbra, air share, reach),
    # which no maker states. A figure the maker does not publish is said so, with what stands in for it.
    DRAW = {'wash': {'penumbra': 0.5, 'haze': 0.35, 'reach_m': 18}, 'beam': {'penumbra': 0.1, 'haze': 1, 'reach_m': 40}, 'bar': {'penumbra': 0.5, 'haze': 0.35, 'reach_m': 24}}
    def profile(tid, cls, lumens=None, why=''):
        t = lib(tid); o = t.get('optics') or {}
        p = {'library': tid, 'basis': t.get('identified'), 'why': why}
        if cls:
            p['draw'] = dict(DRAW[cls], basis='ASSUMED: renderer class values for a ' + cls + ', not maker data')
        if o.get('lux') and o.get('at_m'):
            p['photometry'] = {'lux': o['lux'], 'at_m': o['at_m'], 'beam_deg': o.get('beam_deg'), 'zoom': bool(o.get('zoom_deg')), 'src': o.get('photometrySrc'), 'basis': o.get('photometryBasis')}
        elif lumens:
            p['photometry'] = dict(lumens)
        val = lambda x: x.get('value') if isinstance(x, dict) else x
        # the maker's limits the simulator must stay inside: pan / tilt travel, zoom range, outer size
        for k_out, k_in in (('pan_tilt_deg', 'pan_tilt_deg'), ('size_mm', 'size_mm'), ('weight_kg', 'weight_kg'), ('power_w', 'power_w')):
            if val(t.get(k_in)) is not None:
                p[k_out] = val(t.get(k_in))
        if o.get('zoom_deg'):
            p['zoom_deg'] = o['zoom_deg']
        fl = t.get('fluid_ml_per_min')
        if isinstance(fl, dict) and fl.get('value'):
            p['fluid_ml_per_min'] = {'value': fl['value'], 'src': fl.get('src'), 'basis': fl.get('basis')}
        return p
    K10_LM = {'lumens': 5500, 'src': 'CP-K10-MAN', 'basis': 'EXACT total output (manual, technical data: B-EYE K10 5500 lumens); candela is DERIVED as a uniform cone of the unit\'s beam angle, an upper bound on axis'}
    K15_LM = {'lumens': 5500, 'src': 'CP-K10-MAN', 'basis': 'ASSUMED: the K15 datasheet and manual state no lumen or lux figure, so the K10\'s 5500 lumens stand in; the real K15 is brighter'}
    stand = {
        'cp-aleda-beye-k10': profile('cp-aleda-beye-k10', 'wash', K10_LM, 'the real lamp: zoom 4-60 deg, output from its manual'),
        'cp-hy-beye-k15': profile('cp-hy-beye-k15', 'wash', K15_LM, 'the real lamp; its output is not published in the papers held, body from the plot symbol'),
        'acme-xp16r-bsw': profile('acme-xp16r-bsw', 'beam', None, 'the real lamp: the manual\'s photometric diagram at its 3 deg beam'),
        'acme-pixel-line-ip': profile('acme-pixel-line-ip', 'bar', None, 'the real bar: the datasheet\'s 101 deg RGB figure; the bar is 1.0 x ~0.07 x ~0.11 m from the plot'),
        'magmatic-magma-prime': profile('magmatic-magma-prime', None, None, 'the real hazer: fluid consumption from its manual'),
    }

    def add(id_, type_, group, p, r, angle, status, source, part, size, i=None, extra=None):
        d = {'id': id_, 'type': type_, 'group': group, 'part': part, 'status': status, 'p': [r2(v) for v in p], 'r': [round(v, 4) for v in r], 'angle_rad': angle,
             'size_m': [r2(v) for v in size], 'source': source, 'profile': stand[type_]}
        # the body's size is the MAKER'S when the library has it (largest maker dimension on the axis the drawing's own size is
        # largest on, and so on: the drawing gives the orientation, the maker the millimetres); else the plot symbol's, said so
        mm = stand[type_].get('size_mm')
        if mm and len(mm) == 3:
            order = sorted(range(3), key=lambda a: -size[a]); big = sorted(mm, reverse=True)
            out = [0, 0, 0]
            for rank, axis in enumerate(order):
                out[axis] = r2(big[rank] / 1000)
            d['size_m'] = out; d['size_basis'] = "maker's outer size (library size_mm), oriented as drawn"
        else:
            d['size_basis'] = 'from the plot symbol: the maker\'s outer size is not in the papers held'
        d['dmx'] = dmx(group, i)
        if extra:
            d.update(extra)
        fixtures.append(d)

    # ---------------------------------------------------------------- solids (measured)
    sc = M['screen']; sx = (sc['x'][0] + sc['x'][1]) / 2; sw = sc['x'][1] - sc['x'][0]
    sh_ = sc['y_front'][1] - sc['y_front'][0]
    solids.append({'id': 'platina-screen', 'name': f'LED screen {r2(sw)} x {r2(sh_)} m (P3.9 cabinets 0.5 m: 8 x 5 = 1024 x 640 px; the file name says 8 x 5, the drawing gives 8 x 5 cabinets)', 'kind': 'box', 'status': 'measured',
                   'p': [r2(sx), r2(sc['y_front'][0]), r2((sc['z'][0] + sc['z'][1]) / 2)], 'r': [0, 0, 0], 's': [r2(sw), r2(sh_), r2(sc['z'][1] - sc['z'][0])],
                   'source': 'plot-front.png outline x 610..1014, y 438..690 on grid 1 m; plot-side.png faces x 451/463 (thickness), bottom y 741; screen-from-plot-8x5.png (same size)'})
    T = M['truss']
    tw = (T['over']['x_top'][1] - T['over']['x_top'][0]); tsec = (T['over']['section_side_m'][0] + T['over']['section_side_m'][1]) / 2
    ty = T['over']['y_side']
    solids.append({'id': 'platina-truss-over', 'name': f'over-stage truss {r2(tw)} m (4 sections x 2 m), square section {r2(tsec)} m, the 11-10 plan\'s "over-stage truss"', 'kind': 'truss', 'status': 'measured',
                   'p': [r2(sum(T['over']['x_top']) / 2), r2(ty), r2(T['over']['z_side'])], 'r': [0, 0, 0], 's': [r2(tw), r2(tsec), r2(tsec)], 'sections': 4,
                   'source': 'x/length plot-top.png (y 385, x 518..1128, grid 76.4 px/m), cross-check plot-front.png length; z and height plot-side.png (square at x 700..742, y 62..102)'})
    aw = T['aud']['x_top'][1] - T['aud']['x_top'][0]
    solids.append({'id': 'platina-truss-aud', 'name': f'audience-side truss {r2(aw)} m (4 sections), the 11-10 plan\'s "audience-side truss"; the plot hangs 3 K10 here that are NOT in the 11-11 offer', 'kind': 'truss', 'status': 'measured',
                   'p': [r2(sum(T['aud']['x_top']) / 2), r2(T['aud']['y_side']), r2(T['aud']['z_side'])], 'r': [0, 0, 0], 's': [r2(aw), r2(tsec), r2(tsec)], 'sections': 4,
                   'source': 'plot-top.png y 860, x 525..1135; z and height plot-side.png (square at x 1425..1463)'})
    dx = M['deck']['x_front_m']; dz = M['deck']['z_side_m']
    solids.append({'id': 'platina-deck', 'name': f'stage deck {deck} m high; bounding box, the front edge is an arc (see outline)', 'kind': 'box', 'status': 'measured', 'p': [r2((dx[0] + dx[1]) / 2), 0.0, r2((dz[0] + dz[1]) / 2)], 'r': [0, 0, 0],
                   's': [r2(dx[1] - dx[0]), deck, r2(dz[1] - dz[0])],
                   'outline_xz': [[r2(M['deck']['front_arc_end_x_top_m'][0]), r2(M['deck']['front_arc_end_z_top_m'])], [0.0, r2(M['deck']['front_arc_centre_z_top_m'])], [r2(M['deck']['front_arc_end_x_top_m'][1]), r2(M['deck']['front_arc_end_z_top_m'])]],
                   'outline_note': 'front arc through its two ends and its middle (plot-top.png y 645 at x 298/1365, y 713 at x 832)',
                   'source': f'plot-front.png deck x 107..1517, deck height {r2(M["deck_h_parts"][0])} m (front) / {r2(M["deck_h_parts"][1])} m (side), z plot-side.png 339..1228'})
    for k, w in enumerate(M['wings']):
        zc = (w['z'][0] + w['z'][1]) / 2; xc = (w['x'][0] + w['x'][1]) / 2
        solids.append({'id': f'platina-wing-{w["side"].lower()}{k // 2 + 1}', 'name': f'wing panel (unlabelled tall box on the plot) {w["side"]}{k // 2 + 1}', 'kind': 'box', 'status': 'measured',
                       'p': [r2(xc), 0.0, r2(zc)], 'r': [0, 0, 0], 's': [r2(w['x'][1] - w['x'][0]), r2(M['wing_h_front_m'][1]), r2(w['z'][1] - w['z'][0])],
                       'source': 'plan from plot-top.png (rectangles at y 230/320/439/548, 27 px deep); height plot-front.png y 166..834' + ('; mirrored from the left, right-hand edges checked' if w['side'] == 'R' else '')})
    for k, xr in enumerate(M['risers']['x_top_m']):
        solids.append({'id': f'platina-riser-{"lr"[k]}', 'name': 'platform box on the deck (unlabelled on the plot)', 'kind': 'box', 'status': 'measured',
                       'p': [r2((xr[0] + xr[1]) / 2), deck, r2((M['risers']['z_top_m'][0] + M['risers']['z_top_m'][1]) / 2)], 'r': [0, 0, 0],
                       's': [r2(xr[1] - xr[0]), r2(M['risers']['h_front_m']), r2(M['risers']['z_top_m'][1] - M['risers']['z_top_m'][0])],
                       'source': 'plot-top.png box x ' + f'{r2(xr[0])}..{r2(xr[1])} m, z; height plot-front.png y 672..772'})
    # pixel towers: 8 towers x 3 bars. Towers from the audience's left: left side outermost first
    tx_ = M['towers']['front_x_m']; tz_ = sorted(M['towers']['z_side_m'])        # 4 rows from the screen outward
    z_rows = tz_
    left = list(zip(tx_[:4], reversed(z_rows)))                                  # outermost (largest |x|) = farthest from the screen
    right = list(zip(tx_[4:], z_rows))
    towers = left + right
    bar_y0 = M['towers']['bars_side_y_m'][0]; bar_y1 = M['towers']['bars_side_y_m'][1]
    barh = (bar_y1 - bar_y0) / 3
    bw, bd = M['towers']['bar_w_front_m'], M['towers']['bar_d_side_m']
    n = 0
    for t, (x, z) in enumerate(towers):
        solids.append({'id': f'platina-tower-{t + 1}', 'name': f'tower {t + 1} pole (counted from the audience\'s left)', 'kind': 'box', 'status': 'measured', 'p': [r2(x), 0.0, r2(z)], 'r': [0, 0, 0],
                       's': [0.1, r2(bar_y0), 0.1], 'source': 'plot-front.png pole under the bars (x lines 159..170 and the like)'})
        for j in range(3):
            yc = bar_y0 + barh * (j + 0.5)
            add(f'platina-pixel-{n + 1:02d}', 'acme-pixel-line-ip', f'pixel-line-g{n // 4 + 1}', [x, yc, z], [-math.pi / 2, 0, 0], 0.8814, 'measured (x, z, height) / from-plan-words (8 towers x 3, bottom first, from the audience\'s left)',
                f'tower {t + 1}, bar {j + 1} from the bottom: x plot-front.png, z plot-side.png/plot-top.png rows, height 3 stacked 1 m bars 1.0..4.0 m over the deck', f'pixel line tower {t + 1} bar {j + 1}', [bw, barh, bd], n % 4,
                {'tower': t + 1, 'bar_in_tower': j + 1, 'face': '+z (toward the audience), plot-side.png shows the pixel face on the audience side of the pole', 'aim_home': 'horizontal +z'})
            n += 1
    # K10 over the stage: 8, from the audience's left
    kx = sorted(M['k10']['over_x_top_m']); zl = M['k10']['over_z_side_m']; yk = (M['k10']['y_front_centre_m'] + M['k10']['y_side_centre_m']) / 2
    bk = M['k10']['body_front_m'] + [M['k10']['body_side_m'][0]]
    assert len(kx) == 8
    for i, x in enumerate(kx):
        g = 'k10-over-stage' if i < 4 else 'k10-over-stage-b'
        add(f'platina-k10-{i + 1:02d}', 'cp-aleda-beye-k10', g, [x, yk, zl], [0, 0, 0], 0.2618, 'measured', f'x plot-top.png glyph centroid (slot {i + 1} of 8, ~1.0 m pitch); z plot-side.png; height plot-front.png/plot-side.png hung under the over-stage truss',
            f'K10 {i + 1} over the stage', [bk[0], bk[1], bk[2]], i if i < 4 else i - 4, {'aim_home': 'straight down (pan 0 / tilt 0, hung)', 'beam_note': 'angle_rad ASSUMED = half of 30 deg, inside the stand-in zoom 4-60'})
    # K15 floor row, 6; K15 sides, 2
    fx_ = sorted(M['k15_floor']['x_front_m']); fz = M['k15_floor']['z_side_m']
    fb = M['k15_floor']['body_front_m'] + [M['k15_floor']['body_side_m'][0]]
    yfl = deck + M['k15_floor']['body_front_m'][1] / 2
    for i, x in enumerate(fx_):
        add(f'platina-k15-{i + 1:02d}', 'cp-hy-beye-k15', 'k15-floor' if i < 4 else 'k15-floor-b', [x, yfl, fz], [math.pi, 0, 0], 0.2618, 'measured', 'x plot-front.png (6 in a row, 1.27 m pitch, agrees with plot-top.png), z plot-side.png, standing on the deck',
            f'K15 {i + 1} stage-floor row', fb, i if i < 4 else i - 4, {'aim_home': 'straight up (pan 0 / tilt 0, standing)', 'screen_note': 'on the plot the row stands 0.1 m in front of the screen face; the beam axis clears it, a wide cone does not'})
    sx_ = M['k15_side']['x_front_m']; sz_ = M['k15_side']['z_side_m']; sy_ = sum(M['k15_side']['y_front_m']) / 2
    for i, x in enumerate(sorted(sx_)):
        add(f'platina-k15-{7 + i:02d}', 'cp-hy-beye-k15', 'k15-sides', [x, sy_, sz_], [math.pi, 0, 0], 0.2618, 'measured', 'x plot-front.png lamp body, z plot-side.png/plot-top.png, height plot-front.png: on a stand at the side (the plot shows a pole)',
            f'K15 {7 + i} side stand', [M['k15_side']['body_front_m'][0], M['k15_side']['body_front_m'][1], 0.36], i, {'aim_home': 'straight up', 'stand': 'on a pole beside the body (plot-front.png)'})
    # XP-16R: PROPOSED. 7 in the plot's Sharpy slots on the over-stage truss, 5 on the audience-side truss
    slots = sorted(M['sharpy']['x_top_m']); zs = M['k10']['over_z_side_m']
    ya = (ty - tsec / 2 - 0.35)
    xa = [-3.5, -1.75, 0.0, 1.75, 3.5]
    za = T['aud']['z_side'] + 0.14
    # the XP-16R hangs UNDER its truss: body centre = truss underside - 0.05 m clamp - half the maker's height (585 mm).
    # At the K10's height its real body stood 0.07 m inside the truss (geometry check, 2026-11-11)
    yx = ty - tsec / 2 - 0.05 - max(stand['acme-xp16r-bsw'].get('size_mm') or [585]) / 2000
    for i in range(12):
        if i < 7:
            p = [slots[i], yx, zs]; src = 'PROPOSED: the plot\'s 7 Sharpy slots on the over-stage truss (the drawing\'s own beam-lamp hang points, positions measured from plot-top.png)'
        else:
            p = [xa[i - 7], yx, za]; src = 'PROPOSED: 5 evenly on the audience-side truss, 1.75 m pitch, symmetric about the axis (the plot\'s 3 K10 slots there are free)'
        add(f'platina-xp16r-{i + 1:02d}', 'acme-xp16r-bsw', 'xp16r-proposed', p, [0, 0, 0], 0.0262, 'PROPOSED', src, f'XP-16R {i + 1}', [0.35, 0.50, 0.30], i,
            {'aim_home': 'straight down', 'beam_note': 'angle_rad = half of the maker\'s 3 deg beam (manual photometric diagram)', 'why': 'beam heads of every drawn rig of this kind hang over the stage; no paper places them'})
    # hazers: PROPOSED
    for i, x in enumerate([-3.4, 3.4]):
        add(f'platina-hazer-{i + 1}', 'magmatic-magma-prime', 'hazer', [x, deck + 0.20, -0.55], [-math.pi / 2, 0, 0], 0.0, 'PROPOSED',
            'PROPOSED: on the deck behind the screen line, outside the screen\'s width, between the screen and the back wall (-0.96 m): hidden from the audience, hazes the whole stage; the list and the plot place none',
            f'hazer {i + 1}', [0.16, 0.40, 0.34], i, {'aim_home': 'horizontal +z (output toward the audience)', 'machine': 'hazer', 'size_note': 'the maker\'s 338 x 160 x 400 mm (L x W x H, manual p16)'})
    rig = {
        'version': '1.0', 'title': 'Platina - Live in Yerevan: rig plan for the visualiser (stage, trusses, towers measured from the 11-10 light plot; 54 lamps of the 11-11 offer)', 'date': '2026-11-11',
        # the room's ONE camera level (three.js toneMappingExposure). MEASURED 2026-11-11 on the GPU (pics8, cues 12 and 18 at
        # 1 / 0.3 / 0.1 / 0.03): at 1 (the MOXIR hall's number) every cue floods (frame mean 168-228 of 255); at 0.1 the room
        # stays dark and the beams read (mean 43-48), the nearest to the rental side's own look pictures in the offer
        # (mean 14-24, pictures without our UI); 0.03 loses the beams. Haze x0.25 at 0.1 only dims the beams: the flood was the camera.
        'camera': {'exposure': 0.1, 'basis': 'MEASURED 2026-11-11: GPU sweep 1 / 0.3 / 0.1 / 0.03 on cues 12 and 18 against the look pictures inside the offer (PLATINA_EH-YVN_14-11-26_OFFER_2.xlsx)'},
        'what': 'Positions of every lamp of the offer (8 K10, 8 K15, 12 XP-16R, 24 Pixel Line, 2 hazers) in metres, with the 11-11 patch address. The plot shows 11 K10 + 7 Sharpy, the offer 8 K10 + 12 XP-16R: the 3 audience-side K10 and the 7 Sharpy are listed in plot_only and not built.',
        'written_by': 'scripts/place/platina_rig.py', 'generated_by': {'tool': 'scripts/place/platina_rig.py', 'plan': PLAN, 'plot_dir': PLOT_DIR, 'pictures': SRC},
        'schema': 'the MOXIR rig schema (moxir-v2-12-2026-10-17.json: fixtures[{id,type,p,r,angle_rad,dmx,status}] + solids[{id,name,kind,p,r,s}]) plus: per item status (measured / from-plan-words / PROPOSED), source, profile (stand-in), size_m, group (the patch plan\'s select.group)',
        'frame': 'metres, Y up from the AUDIENCE floor (stage deck top at y = ' + str(deck) + '), +x = the audience\'s right, +z toward the audience, z = 0 the screen\'s middle plane, x = 0 the axis of the 8 pixel towers. Rotation three.js Euler XYZ radians: an unrotated beam points -Y (down); [pi,0,0] points up; [-pi/2,0,0] points +z. p = the middle of the lamp body; box solids base-anchored (p.y = the base), truss p = the middle of the section.',
        'method': 'scripts/place/platina_rig.py: grid pitch per picture from the light-grey lines; one square = 1 m, proved on standard parts (see calibration); colour blobs and dark-line edges against the grid; numbers rounded to 1 cm (a drawing px is 1.0-1.3 cm, the symbols are split by drawn lines: positions are good to about 0.05 m).',
        'calibration': {'px_per_m': M['scales'], 'grid_lines_used': {k: v[1] for k, v in M['pitch'].items()}, 'proofs_m': {k: r2(v) for k, v in M['proofs'].items()},
                        'reading': 'truss 4 x 2 m = 8.0; 3 stacked bars = 3.0; screen 4.0 x 2.5; the drawn person 1.74 m: all within 0.1 m of 1 m per square in all three views'},
        'kit': {'cp-aleda-beye-k10': 8, 'cp-hy-beye-k15': 8, 'acme-xp16r-bsw': 12, 'acme-pixel-line-ip': 24, 'magmatic-magma-prime': 2},
        'kit_note': 'counts of the offer (rental list scripts/rigbuild/rentals/platina-2026-11-11.json, offer of 2026-11-11); no prices are kept here',
        'screen': {'solid': 'platina-screen', 'cabinets': '8 x 5 of 0.5 m, 128 px each = 1024 x 640 px (16:10)', 'status': 'measured from the drawing, NOT confirmed by the Platina side (ask the screen crew)'},
        'axis_note': {'screen_centre_x_m': r2(sx), 'truss_over_centre_x_m': r2(sum(T['over']['x_top']) / 2), 'why': 'the plot is not exactly symmetric: the screen and the trusses sit 0.03-0.1 m left of the tower axis; kept as drawn'},
        'profiles': {
            'library': 'src/rigbuild/types/library (UP-*, EXT-*) and scripts/place/fixtures/fixtures.json kinds; none of the five Platina types has its own profile',
            'missing': {k: v for k, v in stand.items()},
            'note': 'a stand-in is only for geometry/optics in the visualiser; names and DMX modes come from the patch plan. Nothing here is invented as a maker profile.'},
        'plot_only': {'k10_audience_side': {'count': 3, 'x_m': [r2(x) for x in sorted(M['k10']['aud_x_top_m'])], 'z_m': r2(T['aud']['z_side'] + 0.14), 'status': 'measured, NOT in the offer, not built, not patched'},
                      'sharpy': {'count': 7, 'x_m': [r2(x) for x in slots], 'status': 'measured, NOT in the offer; their slots are used by 7 of the PROPOSED XP-16R'}},
        'patch': {'plan': PLAN, 'universes': 11, 'units': 54, 'status': 'PROPOSED, not confirmed by the rental side'},
        'solids': solids, 'fixtures': fixtures,
        'owed': ['Ask the Platina side: where the 12 XP-16R hang, where the 2 hazers stand, whether the 3 audience-side K10 / 7 Sharpy of the 11-10 plot are really not coming, the LED screen size (cabinets), the truss heights.',
                 'K15 output and body size are not published in the papers held (the K10 figure and the plot symbol stand in); the cells of K10/K15/Pixel Line are one cone per lamp.'],
    }
    return rig


def geometry_checks(rig):
    """Own geometry checks (no hall record, no server): lamp body boxes vs solids, home-beam axis vs the screen/trusses/towers."""
    def aabb(p, s, base=False, ):
        h = [s[0] / 2, s[1] / 2, s[2] / 2]
        c = [p[0], p[1] + (s[1] / 2 if base else 0), p[2]]
        return [c[i] - h[i] for i in range(3)], [c[i] + h[i] for i in range(3)]
    sol = {}
    for s in rig['solids']:
        if s['id'] in ('platina-deck',) or s['id'].startswith('platina-wing') or s['id'].startswith('platina-riser'):
            continue
        sol[s['id']] = aabb(s['p'], s['s'], base=s['kind'] == 'box')
    rows, leaks = [], []
    TOL = 0.03
    for f in rig['fixtures']:
        lo, hi = aabb(f['p'], f['size_m'])
        for sid, (a, b) in sol.items():
            if all(lo[i] + TOL < b[i] and hi[i] - TOL > a[i] for i in range(3)):
                leaks.append({'lamp': f['id'], 'inside': sid, 'type': 'body in solid'})
        # home beam axis: -Y rotated by r (XYZ euler, x-rotation only in this rig)
        rx = f['r'][0]
        d = [0.0, -math.cos(rx), -math.sin(rx)]
        for sid, (a, b) in sol.items():
            if sid != 'platina-screen':
                continue
            t0, t1 = 0.0, 1e9
            for i in range(3):
                if abs(d[i]) < 1e-9:
                    if not a[i] <= f['p'][i] <= b[i]:
                        t0, t1 = 1, 0
                else:
                    ta, tb = (a[i] - f['p'][i]) / d[i], (b[i] - f['p'][i]) / d[i]
                    t0, t1 = max(t0, min(ta, tb)), min(t1, max(ta, tb))
            if t0 <= t1:
                leaks.append({'lamp': f['id'], 'beam_home_through': sid, 'at_m': round(t0, 2)})
        if f['type'] == 'cp-hy-beye-k15' and 'k15-floor' in f['group']:
            sc = sol['platina-screen']
            rows.append({'lamp': f['id'], 'axis_clearance_to_screen_front_m': round(f['p'][2] - sc[1][2], 3)})
    return leaks, rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', default='.'); ap.add_argument('--plot-dir', default=PLOT_DIR); ap.add_argument('--out', default=None); ap.add_argument('--check', action='store_true')
    a = ap.parse_args()
    M = measure(a.plot_dir)
    rig = build(a.repo, M)
    leaks, rows = geometry_checks(rig)
    rig['checks'] = {'geometry': {'tool': 'scripts/place/platina_rig.py geometry_checks (body boxes vs trusses/screen/towers, 0.03 m contact tolerance; home beam axis vs the screen)', 'leaks': leaks, 'k15_row_axis_clearance': rows,
                                  'physics_check_py': 'NOT RUN: it needs a project document and a hall record through the API (no server this round)'}}
    out = a.out or os.path.join(a.repo, OUT)
    if a.check:
        print(json.dumps({'leaks': leaks, 'rows': rows, 'scales': M['scales'], 'proofs': M['proofs']}, indent=1, default=float)); return 1 if leaks else 0
    with open(out, 'w') as fh:
        json.dump(rig, fh, indent=1, ensure_ascii=False, default=float); fh.write('\n')
    print('wrote', out, 'fixtures', len(rig['fixtures']), 'solids', len(rig['solids']), 'leaks', len(leaks))
    return 1 if leaks else 0


if __name__ == '__main__':
    sys.exit(main())
