#!/usr/bin/env python3
"""MOXIR site sheet: the hall from above (drawn from the rig + hall json, no hand drawing) and a one-page PDF of docs/moxir/site-sheet.md.

  python3 -B scripts/place/moxir_site_sheet.py [--pdf PATH]     (matplotlib only; pdftoppm to look at it)

Writes docs/moxir/site-sheet-plan.svg and the PDF (default ~/Downloads/moxir/site-sheet/site-sheet.pdf, A4 landscape).
Point positions below are the places the sheet's rows name; every one is a number from the files cited in the md row.
"""
import json, os, re, sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
RIGS = os.path.join(ROOT, 'scripts', 'place', 'rigs')
MD = os.path.join(ROOT, 'docs', 'moxir', 'site-sheet.md')
SVG = os.path.join(ROOT, 'docs', 'moxir', 'site-sheet-plan.svg')
L = json.load(open(os.path.join(RIGS, 'moxir-lasers-on-crane-2026-10-09.json')))
S = json.load(open(os.path.join(RIGS, 'moxir-stage-v2-cranes-2026-10-09.json')))
H = json.load(open(os.path.join(RIGS, 'moxir-hall-2026-10-09-v10-show-park.hall.json')))
G = H['geometry']
ZW = G['end_wall_inner_y_m']                       # 53.8: the entry wall at +z, the far wall at -z
cubes = [u['p'] for u in L['units']]               # cube apertures (x, y, z)
ends = sorted({tuple(u['to']) for u in L['units']})
r3 = L['forty_watt_route_r3']
towerx = [a[0] for a in r3['apertures_m']]
FOHX, FOHZ = S['foh']['p'][0], S['foh']['p'][2]
foh_w, foh_d = S['foh']['size_m']
crane_near, crane_far = S['crane']['z_m'], -12.0
fl, bar = S['floor'], S['barrier']
booth = S['booth']

# point id -> (x, z, label). Positions come from the rows' own sources (J hold_points / M 4.0a / 4.0b).
PTS = {
    'H1': (-1.0, -ZW, 'gate + door posts'), 'H2': (-4.5, -13.45, 'crane top'), 'H3': (8.9, -12.0, 'cart'),
    'H4': (-6.0, -30.0, 'lamps'), 'H5': (4.0, -48.0, 'roof bar'), 'H6': (-6.7, -ZW, '40 W ends'),
    'H7': (1.0, -22.0, 'floor things'), 'H8': (6.0, crane_near, 'near crane underside'),
    'H9': (-11.25, 4.1, 'bay'), 'C1': (-1.0, -10.2, 'cubes aim'), 'O1': (-7.7, 45.0, 'masks'),
    'O4': (FOHX + 2.0, FOHZ, 'FOH riser'), 'O9': (FOHX + 2.0, FOHZ + 4.0, 'riser edge'), 'O10': (-7.7, 41.0, 'aperture'), 'O5': (-9.0, -12.0, 'lamps+crane'), 'O6': (-4.0, 18.0, 'crowd limits'),
    'O8': (-10.25, 48.3, 'tower'),
}

def plan(ax, fs=5.0):
    ax.set_aspect('equal'); ax.set_xlim(-15.5, 15.5); ax.set_ylim(-58, 58)
    ax.add_patch(Rectangle((-12, -ZW), 24, 2 * ZW, fc='#f4f1ea', ec='#333', lw=0.8))
    ax.text(0, -57.2, 'FAR WALL (matte block); blue = gate', ha='center', fontsize=fs, weight='bold')
    ax.text(0, 56.2, 'ENTRY WALL', ha='center', fontsize=fs, weight='bold')
    ax.annotate('', xy=(13.2, -45), xytext=(13.2, -30), arrowprops=dict(arrowstyle='->', lw=0.5))
    ax.text(13.6, -37, 'beams', fontsize=fs - 0.6, rotation=90, va='center')
    gw = G['far_gate']['w_m']
    ax.add_patch(Rectangle((-gw / 2, -ZW - 0.6), gw, 1.2, fc='#fff', ec='#06c', lw=0.8))
    dw = H['geometry']['door']['w_m']
    ax.add_patch(Rectangle((-dw / 2, ZW - 0.6), dw, 1.2, fc='#fff', ec='#06c', lw=0.8))
    ax.text(3.6, ZW + 0.4, 'door (blue)', fontsize=fs - 0.6, color='#06c')
    # stage, barrier, dance floor, FOH
    ax.add_patch(Rectangle((booth['drawn_x_m'][0], booth['front_z_m'] - booth['depth_m']), 2.2, booth['depth_m'], fc='#999', ec='#333', lw=0.5))
    ax.text(-4.0, 1.4, 'STAGE / DJ box', fontsize=fs, weight='bold', ha='center')
    ax.plot([bar['x_m'][0], bar['x_m'][1]], [bar['z_m']] * 2, color='#c00', lw=1.2)
    ax.text(2.4, bar['z_m'] + 0.5, 'barrier z 8.2', fontsize=fs - 0.6, color='#c00')
    ax.add_patch(Rectangle((fl['x_m'][0], fl['z_m'][0]), fl['x_m'][1] - fl['x_m'][0], fl['z_m'][1] - fl['z_m'][0], fc='none', ec='#888', ls=':', lw=0.6))
    ax.text(1.0, 12, 'dance floor', fontsize=fs, color='#666', ha='center')
    ax.add_patch(Rectangle((FOHX - foh_w / 2, FOHZ - 1), foh_w, foh_d, fc='#ccc', ec='#333', lw=0.5))
    ax.add_patch(Rectangle((FOHX + 2.0 - foh_w / 2, FOHZ - 1), foh_w, foh_d, fc='none', ec='#333', ls='--', lw=0.5))
    ax.text(-5.2, 31.2, 'FOH now / +2.0 m (dashed)', fontsize=fs - 0.6, ha='center')
    # cranes: bands across the hall at their parks
    for z, name in ((crane_near, 'NEAR CRANE park z %.2f' % crane_near), (crane_far, 'FREE CRANE park z -12')):
        ax.add_patch(Rectangle((-12, z - 1.1), 24, 2.2, fc='#e8c27a', ec='#a0701a', lw=0.5, alpha=0.7))
        ax.text(-11.8, z + (1.6 if z > 0 else -2.6), name, fontsize=fs - 0.4, color='#6b4a10')
    # cubes + their beams to the ends
    for p in cubes:
        ax.plot(p[0], p[2], 's', ms=2.2, color='#c00')
        for e in ends[:1]:
            ax.plot([p[0], e[0]], [p[2], e[2]], color='#c00', lw=0.4)
    for e in ends:
        ax.plot(e[0], e[2], 'x', color='#c00', ms=3)
    # 40 W tower and beams (route r3 ends; not live)
    ax.add_patch(Rectangle((-10.25, 45.77), 5.01, 5.01, fc='none', ec='#7a2', lw=0.8))
    ax.text(-9.9, 52.2, 'entry tower (40 W)', fontsize=fs - 0.6, color='#4a7a10')
    for x0, e in zip(towerx, r3['ends_m']):
        ax.plot([x0, e[0]], [48, e[2]], color='#4a7a10', lw=0.5, ls='--')
    ax.add_patch(Rectangle((-8.29, -ZW), 3.17, 1.0, fc='#9c6', ec='none', alpha=0.7))   # KO-3 span on the wall
    # points
    for k, (x, z, lab) in PTS.items():
        ax.text(x, z, k, fontsize=fs, ha='center', va='center', weight='bold',
                bbox=dict(boxstyle='circle,pad=0.18', fc='#fff', ec='#000', lw=0.6), zorder=5)
        left = k in ('H2', 'H6', 'O5')
        ax.text(x + (-1.5 if left else 1.5), z - 0.1, lab, fontsize=fs - 1.0, va='center', ha='right' if left else 'left', zorder=5, bbox=dict(fc='white', ec='none', alpha=0.7, pad=0.2))
    ax.text(0, -59.2, 'O2 O3 O7: bench, datasheet, paper - no spot', fontsize=fs - 0.6, ha='center')
    ax.set_xticks([-12, -6, 0, 6, 12]); ax.set_yticks(range(-50, 51, 10))
    ax.tick_params(labelsize=fs - 0.8, length=2, width=0.4)
    ax.set_xlabel('x (m): left <-  house  -> right (looking at the far wall)', fontsize=fs - 0.6, labelpad=1)
    ax.set_ylabel('z (m)  far wall -54 ... entry +54', fontsize=fs - 0.6, labelpad=1)
    for s in ax.spines.values(): s.set_linewidth(0.4)

def parse_md():
    title, rows, notes, intro = '', [], [], []
    for ln in open(MD, encoding='utf-8').read().splitlines():
        if ln.startswith('# '): title = ln[2:]
        elif ln.startswith('|'):
            c = [x.strip() for x in ln.strip().strip('|').split('|')]
            if not set(''.join(c)) <= set('-: '): rows.append(c)
        elif ln.strip() and not ln.startswith('!'):
            (intro if not rows else notes).append(ln.strip())
    return title, rows, intro, notes

def wrap(fig, text, width_in, fs):
    r = fig.canvas.get_renderer(); out, cur = [], ''
    t = fig.text(0, 0, '', fontsize=fs)
    for w in text.split():
        t.set_text((cur + ' ' + w).strip())
        if t.get_window_extent(r).width / fig.dpi > width_in and cur:
            out.append(cur); cur = w
        else: cur = (cur + ' ' + w).strip()
    out.append(cur); t.remove(); return out

def sheet(pdf):
    W, Hh = 11.69, 8.27
    title, rows, intro, notes = parse_md()
    cw = [0.38, 2.75, 1.2, 2.85, 1.9]; x0 = 2.5
    for fs in [8.0, 7.6, 7.2, 6.8, 6.6, 6.4, 6.2, 6.0, 5.8, 5.6, 5.4, 5.2, 5.0, 4.8]:
        fig = plt.figure(figsize=(W, Hh), dpi=100)
        lh = fs / 72 * 1.22
        top = Hh - 0.28
        wi = wrap(fig, ' '.join(intro), W - x0 - 0.2, fs)
        wn = wrap(fig, ' '.join(notes), W - x0 - 0.2, fs - 0.4)
        y = top - 0.22 - len(wi) * lh - 0.06
        hdr = y; y -= lh + 0.05
        cells = []
        for r in rows[1:]:
            cl = [wrap(fig, c, cw[i] - 0.15, fs) for i, c in enumerate(r)]
            cells.append(cl); y -= max(len(c) for c in cl) * lh + 0.05
        y -= len(wn) * lh
        if y > 0.12 or fs == 4.8: break
        plt.close(fig)
    fig.text(x0 / W, top / Hh, title, fontsize=11, weight='bold', va='top')
    yy = top - 0.22
    for l in wi:
        fig.text(x0 / W, yy / Hh, l, fontsize=fs, va='top'); yy -= lh
    yy -= 0.06
    xs = [x0]; [xs.append(xs[-1] + w) for w in cw]
    fig.add_artist(plt.Rectangle((x0 / W, (yy - lh - 0.02) / Hh), sum(cw) / W, (lh + 0.04) / Hh, fc='#ddd', ec='none'))
    for i, h in enumerate(rows[0]):
        fig.text((xs[i] + 0.03) / W, yy / Hh, h, fontsize=fs, weight='bold', va='top')
    yy -= lh + 0.05
    for r, cl in zip(rows[1:], cells):
        n = max(len(c) for c in cl)
        for i, c in enumerate(cl):
            for j, l in enumerate(c):
                fig.text((xs[i] + 0.03) / W, (yy - j * lh) / Hh, l, fontsize=fs, va='top', weight='bold' if i == 0 else 'normal')
        yy -= n * lh + 0.05
        fig.add_artist(plt.Line2D([x0 / W, xs[-1] / W], [(yy + 0.025) / Hh] * 2, color='#aaa', lw=0.3))
    for l in wn:
        fig.text(x0 / W, yy / Hh, l, fontsize=fs - 0.4, va='top', color='#333'); yy -= lh
    ax = fig.add_axes([0.03, 0.035, 2.3 / W, 7.6 / Hh * 0.97]); plan(ax)
    os.makedirs(os.path.dirname(pdf), exist_ok=True)
    fig.savefig(pdf, format='pdf'); plt.close(fig)
    print('pdf', pdf, 'font', fs, 'bottom margin in', round(yy, 2), file=sys.stderr)

def svg():
    fig = plt.figure(figsize=(4.2, 9.2)); ax = fig.add_axes([0.1, 0.04, 0.88, 0.94]); plan(ax, 6.5)
    fig.savefig(SVG, format='svg', metadata={'Date': None}); plt.close(fig)

if __name__ == '__main__':
    pdf = os.path.expanduser('~/Downloads/moxir/site-sheet/site-sheet.pdf')
    if '--pdf' in sys.argv: pdf = sys.argv[sys.argv.index('--pdf') + 1]
    svg(); sheet(pdf)
