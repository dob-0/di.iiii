#!/usr/bin/env python3
"""A clean top plan of MOXIR beta for the owner to paint on (2026-10-08).

He asked: "open the stage plan from above in GIMP so I can paint the areas where lasers can be and what we can light".
No fixtures, no beams: only what is fixed (columns, the permanent objects with their heights, the glazed lanterns),
the stage as built (stage line, DJ step, PA, crane bridge + truss, barrier, dance floor) and a 6 m grid. Oriented as
the dance floor sees it: the stage at the top, the entry at the bottom, house left on the LEFT.

  python3 scripts/place/paint_plan.py --hall <hall.json> --stage <moxir-stage-line.json> --out plan.png [--ppm 40]
Pixel ↔ hall: x_px = M + (x - X0) * ppm, y_px = M + (z - Z0) * ppm (written into the PNG's text chunk too).
"""
import argparse, json
from PIL import Image, ImageDraw, ImageFont, PngImagePlugin

M = 70
X0, X1, Z0, Z1 = -14.0, 14.0, -2.0, 55.0   # the nave only; --full takes the whole building from hall.json

def main():
    a = argparse.ArgumentParser()
    a.add_argument('--hall', required=True); a.add_argument('--stage', required=True)
    a.add_argument('--out', required=True); a.add_argument('--ppm', type=float, default=40.0)
    a.add_argument('--full', action='store_true', help='the whole building, wall to wall and end to end')
    a.add_argument('--title', default='MOXIR beta v0.9 — from above. Paint: where lasers can be, and what we light.')
    a.add_argument('--lasers', help="aerial json (bridge + lasers): draw the free crane where the show parks it, the cubes and their lines")
    a.add_argument('--views', help='rig json: mark its eye-height views (y < 3 m) as audience view points')
    a.add_argument('--quiet-lamps', action='store_true', help='pendant lamps as small marks, one legend line, no label each')
    a.add_argument('--key', help='one line under the title: what to paint')
    o = a.parse_args()
    g = json.load(open(o.hall))['geometry']; st = json.load(open(o.stage))
    global X0, X1, Z0, Z1
    if o.full:
        (X0, X1), (Z0, Z1) = (g['walls_x_m'][0] - 1.5, g['walls_x_m'][1] + 1.5), (-g['end_wall_outer_y_m'] - 1.5, g['end_wall_outer_y_m'] + 1.5)
    P = o.ppm
    W, H = int(2 * M + (X1 - X0) * P), int(2 * M + (Z1 - Z0) * P)
    px = lambda x, z: (M + (x - X0) * P, M + (z - Z0) * P)
    rect = lambda x0, x1, z0, z1: [px(min(x0, x1), min(z0, z1)), px(max(x0, x1), max(z0, z1))]
    im = Image.new('RGB', (W, H), (30, 32, 36)); d = ImageDraw.Draw(im)
    try:
        f = ImageFont.truetype('/usr/share/fonts/TTF/DejaVuSans.ttf', 18); fb = ImageFont.truetype('/usr/share/fonts/TTF/DejaVuSans-Bold.ttf', 24)
        fs = ImageFont.truetype('/usr/share/fonts/TTF/DejaVuSans.ttf', 14)
    except OSError:
        f = fb = fs = ImageFont.load_default()
    # grid every 6 m along, every 6 m across
    for z in (range(-54, 55, 6) if o.full else range(0, 55, 6)):
        d.line([px(X0, z), px(X1, z)], fill=(48, 52, 58), width=1); d.text((8, px(0, z)[1] - 9), f'{z} m', fill=(140, 146, 156), font=fs)
    for x in (range(-36, 61, 12) if o.full else (-12, -6, 0, 6, 12)):
        d.line([px(x, Z0), px(x, Z1)], fill=(48, 52, 58), width=1); d.text((px(x, 0)[0] - 10, H - M + 12), f'{x:+d}' if x else '0', fill=(140, 146, 156), font=fs)
    if o.full:
        wx0, wx1 = g['walls_x_m']; ez = g['end_wall_inner_y_m']
        d.rectangle(rect(wx0, wx1, -ez, ez), outline=(200, 200, 210), width=4)
        dr = g['door']; d.rectangle(rect(-dr['w_m'] / 2, dr['w_m'] / 2, ez - 0.4, ez + 0.4), fill=(30, 32, 36)); d.text(px(0, ez + 1.0), 'ENTRY door', fill=(220, 220, 225), font=fs, anchor='mm')
        fg = g['far_gate']; d.rectangle(rect(-fg['w_m'] / 2, fg['w_m'] / 2, -ez - 0.4, -ez + 0.4), fill=(30, 32, 36)); d.text(px(0, -ez - 1.0), 'far gate', fill=(220, 220, 225), font=fs, anchor='mm')
        rows = g['rows_x_m']
        for a_, b_ in zip(rows[:-1], rows[1:]):
            d.text(px((a_ + b_) / 2, -ez + 1.5), 'NAVE (the show)' if a_ == -12 else 'span', fill=(120, 126, 136), font=f, anchor='mm')
        d.line([px(wx0, g.get('expansion_joint_z_m', 0)), px(wx1, g.get('expansion_joint_z_m', 0))], fill=(70, 74, 80), width=1)
        d.text((px(wx0, 0)[0] + 6, px(0, 0)[1] - 18), 'expansion joint', fill=(120, 126, 136), font=fs)
    # glazed lanterns (no laser may end in glass)
    for L in g['lanterns']:
        (x0, x1), (z0, z1) = L['x_m'], L['z_m']
        x0, x1 = max(x0, X0), min(x1, X1); z0, z1 = max(z0, Z0), min(z1, Z1)
        if x0 < x1 and z0 < z1:
            d.rectangle(rect(x0, x1, z0, z1), outline=(80, 120, 170), width=2)
            d.text((px(x0, z0)[0] + 6, px(x0, z0)[1] + 6), 'roof glass above (lantern) — no laser ends here', fill=(110, 150, 200), font=fs)
    # columns
    for x in (g.get('rows_x_m') if o.full else g['column_row_x_m']):
        for z in g['column_grid_z_m']:
            if Z0 <= z <= Z1: d.rectangle(rect(x - 0.35, x + 0.35, z - 0.35, z + 0.35), fill=(150, 156, 166))
    d.text((px(-12, 52)[0] - 40, px(-12, 52)[1]), 'columns', fill=(170, 176, 186), font=fs)
    # permanent objects with their height
    # the three pipe racks share one footprint: one box, one label
    items, racks = [], [m for m in g['massing'] if m['id'].startswith('pipe-rack')]
    lamps = [m for m in g['massing'] if o.quiet_lamps and m['id'].startswith('pendant-lamp')]
    for m in lamps:
        (x0, x1), (z0, z1) = m['x_m'], m['z_m']; d.rectangle(rect(x0, x1, z0, z1), fill=(200, 170, 90))
    for m in g['massing']:
        if m['id'].startswith('pipe-rack') or m in lamps: continue
        items.append((m['id'].replace('-', ' '), m['x_m'], m['z_m'], m['y_m']))
    if racks:
        items.append(('pipe racks ×3', racks[0]['x_m'], racks[0]['z_m'], [min(r['y_m'][0] for r in racks), max(r['y_m'][1] for r in racks)]))
    items = [(n, x, z, y) for n, x, z, y in items if not (z[1] < Z0 or z[0] > Z1)]
    items.sort(key=lambda it: -(it[1][1] - it[1][0]) * (it[2][1] - it[2][0]))   # big first, small on top
    for n, (x0, x1), (z0, z1), y in items:
        d.rectangle(rect(max(x0, X0), min(x1, X1), z0, z1), fill=(96, 78, 62), outline=(170, 135, 100), width=2)
    for n, (x0, x1), (z0, z1), (y0, y1) in items:
        cx, cz = px((max(x0, X0) + min(x1, X1)) / 2, (z0 + z1) / 2)
        t = f'{n}  {y0:g}–{y1:g} m'
        bb = d.textbbox((cx, cz), t, font=fs, anchor='mm')
        d.rectangle([bb[0] - 3, bb[1] - 2, bb[2] + 3, bb[3] + 2], fill=(40, 32, 26))
        d.text((cx, cz), t, fill=(240, 225, 205), font=fs, anchor='mm')
    # crane bridge + truss
    cr = st['crane']['z_m']
    for dz in (-1.1, 1.1): d.rectangle(rect(-12, 12, cr + dz - 0.35, cr + dz + 0.35), fill=(150, 125, 30))
    d.text((px(-11.5, cr - 1.6)[0], px(0, cr - 1.6)[1] - 12), f'crane bridge (girders 7.95–8.75 m)  z {cr:g}', fill=(220, 190, 70), font=fs)
    ax = st['truss'].get('axis_x_m', 0.0)
    d.line([px(ax - 6.04, cr), px(ax + 5.55, cr)], fill=(225, 228, 235), width=6)
    d.text((px(ax - 6.04, cr)[0] - 4, px(0, cr)[1] + 6), 'truss LOW 3.24 m', fill=(225, 228, 235), font=fs, anchor='ra')
    d.text((px(ax + 5.55, cr)[0] + 4, px(0, cr)[1] + 6), 'HIGH 6.35 m', fill=(225, 228, 235), font=fs)
    # stage
    b = st['booth']; zf = b['front_z_m']; bw = b.get('width_m', 3.0); bc = b.get('centre_x_m', 0.0)
    d.rectangle(rect(bc - bw / 2, bc + bw / 2, zf - b.get('depth_m', 2.0), zf), fill=(20, 150, 135))
    d.text(px(bc, zf - 1.0), f"DJ step {b.get('deck_h_m', 0.4):g} m", fill=(10, 20, 20), font=f, anchor='mm')
    if isinstance(st.get('pa'), dict) and st['pa'].get('boxes'):   # v1.1+: the organiser's speaker boxes at his marks
        for bx_ in st['pa']['boxes']:
            (x0, x1), (z0, z1) = bx_['x_m'], bx_['z_m']; d.rectangle(rect(x0, x1, z0, z1), fill=(70, 90, 240)); d.text(px((x0 + x1) / 2, (z0 + z1) / 2), f"speaker {bx_['id']}", fill=(255, 255, 255), font=fs, anchor='mm')
    else:
        for sx in (-5.4, 5.4): d.rectangle(rect(sx - 0.67, sx + 0.67, zf - 0.72, zf), fill=(70, 90, 240)); d.text(px(sx, zf - 0.36), 'PA', fill=(255, 255, 255), font=fs, anchor='mm')
    d.line([px(-12, zf), px(12, zf)], fill=(60, 255, 60), width=3); d.text((px(12, zf)[0], px(0, zf)[1] + 4), 'stage line', fill=(60, 255, 60), font=fs, anchor='ra')
    bz = st['barrier']['z_m']; bx = st['barrier'].get('x_m', [-5.35, 5.35])
    d.line([px(bx[0], bz), px(bx[1], bz)], fill=(235, 235, 235), width=3)
    if st.get('floor'):   # v1.1+: the dance floor as the stage record draws it, and the FOH riser
        (x0, x1), (z0, z1) = st['floor']['x_m'], st['floor']['z_m']
        d.rectangle(rect(x0, x1, z0, z1), outline=(255, 160, 100), width=2)
        d.text(px((x0 + x1) / 2, z0 + 2.5), 'dance floor (today)', fill=(255, 170, 120), font=fb, anchor='mm', align='center')
        if st.get('foh'):
            fx, _, fz_ = st['foh']['p']; sw, sd = st['foh']['size_m']
            d.rectangle(rect(fx - sw / 2, fx + sw / 2, fz_ - sd / 2, fz_ + sd / 2), fill=(90, 90, 100)); d.text(px(fx, fz_), 'FOH', fill=(255, 255, 255), font=fs, anchor='mm')
    else:
        d.rectangle(rect(-5.35, 5.35, bz, 48), outline=(255, 160, 100), width=2)
        d.text(px(0, 40), 'AUDIENCE\n(dance floor)', fill=(255, 170, 120), font=fb, anchor='mm', align='center')
    if lamps: d.text((M + 900, 50), f'small yellow marks = the hall\'s pendant lamps ({len(lamps)}), 9.5–10.6 m', fill=(200, 170, 90), font=fs)
    if o.lasers:   # the free crane at its show park + the six cubes and their beams (data from the aerial json, as given)
        A = json.load(open(o.lasers)); br = A['aerial']['bridge']; fz = br['z']
        for dz in (-1.1, 1.1): d.rectangle(rect(-12, 12, fz + dz - 0.35, fz + dz + 0.35), fill=(150, 125, 30))
        d.text((px(-11.5, fz - 1.6)[0], px(0, fz - 1.6)[1] - 12), f"FREE crane, moved to z {fz:g} (was {br.get('as_found_rig_z', '?'):g}) · the 6 lasers hang under it at {br['y']:g} m", fill=(220, 190, 70), font=fs)
        for L in A['lasers']:
            f0 = L['from']
            d.line([px(f0[0], f0[2]), px(L['to'][0], L['to'][2])], fill=(255, 80, 60), width=3)
            d.rectangle(rect(f0[0] - 0.3, f0[0] + 0.3, f0[2] - 0.3, f0[2] + 0.3), fill=(255, 255, 255))
        d.text((px(6, fz)[0] + 10, px(0, fz)[1] + 14), f"laser lines run over the audience to the entry wall, end {A['lasers'][0].get('end_height_m', '?')} m up", fill=(255, 120, 100), font=fs)
    if o.views:   # audience eye points from the rig's own view presets
        for v in json.load(open(o.views))['views']['viewPresets']:
            x, y, z = v['position']
            if y < 3:
                c = px(x, z); d.ellipse([c[0] - 9, c[1] - 9, c[0] + 9, c[1] + 9], outline=(255, 255, 255), width=3)
                t = px(*[v['target'][0], v['target'][2]]); dx, dy = t[0] - c[0], t[1] - c[1]; n = max((dx * dx + dy * dy) ** 0.5, 1)
                d.line([c, (c[0] + dx / n * 60, c[1] + dy / n * 60)], fill=(255, 255, 255), width=3)
                d.text((c[0] + 14, c[1] + 4), f"eye: {v['label']}", fill=(255, 255, 255), font=fs)
    # titles
    d.text((M, 18), o.title, fill=(235, 235, 240), font=fb)
    if o.key: d.text((M, 46), o.key, fill=(255, 210, 120), font=f)
    d.text((M, H - 34), 'stage at the top, entry at the bottom, house left on the LEFT (as the dance floor sees it) · grid 6 m · heights = permanent objects', fill=(160, 166, 176), font=fs)
    if not o.full: d.text(px(0, Z1 - 0.6), 'ENTRY', fill=(200, 200, 205), font=f, anchor='mm')
    meta = PngImagePlugin.PngInfo()
    meta.add_text('di-plan-map', json.dumps({'x0': X0, 'z0': Z0, 'x1': X1, 'z1': Z1, 'margin_px': M, 'px_per_m': P, 'x_px': 'M+(x-x0)*ppm', 'y_px': 'M+(z-z0)*ppm'}))
    im.save(o.out, pnginfo=meta)
    print(o.out, im.size)

if __name__ == '__main__':
    main()
