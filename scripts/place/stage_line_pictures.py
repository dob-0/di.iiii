#!/usr/bin/env python3
# stage_line_pictures.py — the three check pictures of MOXIR's stage on the owner's stage line (2026-10-07), drawn from
# the committed records and the scratch copy's own document (no render, no WebGL):
#   <out>/stage24-plan.png          top view: grid, massing (the show hall), zones, the line, booth, PA, barrier, crane,
#                                   cut + tie-offs, the audience; the old place ghosted; the park candidates
#   <out>/stage24-side.png          section across the hall at the crane's z, seen from the audience: the cut's heights vs
#                                   the cab, girders, pipe racks, drum tank, the ducts behind, raised hands, the DJ
#   <out>/stage24-on-frame-954.png  the new positions projected onto the owner's frame 954 with its fitted camera
#
#   python3 -I scripts/place/stage_line_pictures.py --repo . --doc <copy document.json> --ref <reference document.json> \
#       --evaluate <stage-line.mjs --evaluate output> --frame ~/Downloads/moxir/bags-from-video-954.jpg --out <dir>
import argparse, json, os
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, Polygon

BG, FG, DIM, GRID = '#0d0f12', '#d8dce2', '#7d8794', '#2a3038'
GREEN, TEAL, BLUE, ORANGE, YELLOW, STEEL, RED, GHOST = '#3cff3c', '#16b8a0', '#4f6bff', '#ff9a5c', '#e2b53a', '#aab2bd', '#ff5a4f', '#5d6670'

ap = argparse.ArgumentParser()
ap.add_argument('--repo', default='.')
ap.add_argument('--doc', required=True)
ap.add_argument('--ref', required=True)
ap.add_argument('--evaluate', required=True)
ap.add_argument('--frame', required=True)
ap.add_argument('--out', required=True)
a = ap.parse_args()
J = lambda p: json.load(open(p))
R = lambda p: J(os.path.join(a.repo, p))
design = R('scripts/place/rigs/moxir-stage-line-2026-10-07.json')
hall = R(design['crane']['hall_record'])
g = hall['geometry']
v6 = R('scripts/place/rigs/moxir-hall-2026-10-07-v6.hall.json')['geometry']
ev = J(a.evaluate)
truss = ev['truss']
doc = {e['id']: e for e in J(a.doc)['document']['entities']}
ref = {e['id']: e for e in J(a.ref)['document']['entities']}
crane = g['cranes'][0]
CZ = crane['z_m']
pos = lambda d, i: d[i]['components']['transform']['position']
os.makedirs(a.out, exist_ok=True)
FOOT = ('Sources: hall record %s (hall.py, show hall: cabin out); design scripts/place/rigs/moxir-stage-line-2026-10-07.json; '
        'cut derived by scripts/rigbuild/stage-line.mjs (versions.mjs craneCut); positions read back from the scratch copy. '
        'Crane heights ASSUMED from the far crane (photo 007) — tape on 2026-10-08.' % os.path.basename(design['crane']['hall_record']))


def style(ax):
    ax.set_facecolor(BG)
    for s in ax.spines.values(): s.set_color(GRID)
    ax.tick_params(colors=DIM, labelsize=8)


# ---------------------------------------------------------------- (a) plan
fig, ax = plt.subplots(figsize=(17, 9.2), dpi=110)
fig.patch.set_facecolor(BG); style(ax)
# plot axes: z across (press end left, entry right), x up (house right up)
for x in g['column_row_x_m']:
    ax.plot([-4, 55], [x, x], color=GRID, lw=1)
    for z in g['column_grid_z_m']:
        if -4 <= z <= 55: ax.add_patch(Rectangle((z - .25, x - .4), .5, .8, color='#4a525c', zorder=2))
for m in g['massing']:
    (x0, x1), (z0, z1) = m['x_m'], m['z_m']
    if z1 < -4 or z0 > 55: continue
    ax.add_patch(Rectangle((max(z0, -4), x0), min(z1, 55) - max(z0, -4), x1 - x0, color='#5b5148', alpha=.75, lw=0, zorder=1))
for lab, z, x in [('press', 1.7, 1.6), ('machines', 1, 7.5), ('blower + ducts', 18.5, 6.4), ('canopy', 18, 10.6), ('drum tank', 27.2, 8.6), ('pipe racks (x 10–12, y 3–4.5)', 40, 11.0)]:
    ax.text(z, x, lab, color=DIM, fontsize=8, ha='center', va='center', zorder=3)
cab0 = [m for m in v6['massing'] if m['id'] == 'prefab-cabin'][0]
(x0, x1), (z0, z1) = cab0['x_m'], cab0['z_m']
ax.add_patch(Rectangle((z0, x0), z1 - z0, x1 - x0, fill=False, ls=':', ec=DIM, lw=1.2, zorder=3))
ax.text((z0 + z1) / 2, (x0 + x1) / 2, 'prefab cabin\nMOVED OUT for the show', color=DIM, fontsize=7.5, ha='center', va='center')
# zones
dz = g['zones']['dance']['used']
ax.add_patch(Rectangle((dz['z_m'][0], dz['x_m'][0]), dz['z_m'][1] - dz['z_m'][0], dz['x_m'][1] - dz['x_m'][0], fill=False, hatch='//', ec=ORANGE, lw=.8, alpha=.55, zorder=2))
ax.text(37, -4.2, 'AUDIENCE · dance floor x −5.35…5.35, z %.1f…%.0f' % tuple(dz['z_m']), color=ORANGE, fontsize=10, ha='center', zorder=6,
        bbox=dict(fc=BG, ec='none', alpha=.8))
# old place, ghosted
oz = 4.8
ax.add_patch(Rectangle((oz - 1.45, -11.35), 2.9, 22.7, color=GHOST, alpha=.18, lw=0))
ax.plot([oz, oz], [-6.04, 5.55], color=GHOST, lw=3, alpha=.6)
ax.add_patch(Rectangle((4.2, -1.5), 2.0, 3.0, fill=False, ec=GHOST, ls='--', lw=1))
ax.plot([7.5, 7.5], [-4.5, 4.5], color=GHOST, lw=1.5, ls='--')
ax.text(oz, -13.4, 'OLD (ghost): crane + cut z 4.8, booth z 4.2–6.2,\nbarrier z 7.5, floor from 7.5', color=GHOST, fontsize=8, ha='center')
# candidates
for o in ev['options']:
    if o['z_m'] == CZ: continue
    ax.plot([o['z_m'], o['z_m']], [-11.35, 11.35], color=RED, lw=.8, ls=(0, (2, 3)), alpha=.7)
    left = o['z_m'] < CZ
    ax.text(o['z_m'] + (-.3 if left else .3), 12.9 if left else 13.5, 'z %g ✗ %s' % (o['z_m'], '; '.join(f.split(' (')[0] for f in o['fails'])), color=RED, fontsize=7.5, ha='right' if left else 'left')
# crane bridge at CZ
for s in (-1, 1):
    zc = CZ + s * abs(crane['girders_dz_m'][1])
    ax.add_patch(Rectangle((zc - crane['girder_w_m'] / 2, -11.35), crane['girder_w_m'], 22.7, color=YELLOW, alpha=.35, lw=0, zorder=3))
cab = crane['cab']
ax.add_patch(Rectangle((CZ + cab['dz_m'][0], cab['x_m'][0]), cab['dz_m'][1] - cab['dz_m'][0], cab['x_m'][1] - cab['x_m'][0], color='#c97a1a', alpha=.85, zorder=4))
ax.text(CZ + 1.3, 9.35, 'cab', color=FG, fontsize=7.5, va='center', zorder=6)
# the cut and its tie-offs (from the copy's own entities)
ends = truss['ends']
ax.plot([CZ, CZ], [ends[0]['x_m'], ends[1]['x_m']], color=STEEL, lw=4.5, zorder=5, solid_capstyle='butt')
for p in truss['picks']:
    ax.plot(CZ, p['x_m'], 's', color=FG, ms=5, zorder=6)
for tie in truss['tieoffs']:
    ax.plot([tie['from_m'][2], tie['to_m'][2]], [tie['from_m'][0], tie['to_m'][0]], color=YELLOW, lw=1.8, ls='--', zorder=5)
ax.text(CZ - 0.6, -9.0, 'tie-off hl → column x −11.6\n@ %.2f m, straight' % truss['tieoffs'][0]['to_m'][1], color=YELLOW, fontsize=7.5, ha='right', va='center')
ax.text(CZ - 0.6, 7.6, 'tie-off hr → x +11.6\n@ %.2f m: %.2f under cab' % (truss['tieoffs'][1]['to_m'][1], truss['tieoffs'][1]['under_cab_m']), color=YELLOW, fontsize=7.5, ha='right', va='center')
# stage line, booth, PA, barrier (positions read back from the copy)
L = design['stage_line']['z_m']
ax.plot([L, L], [-11.6, 11.6], color=GREEN, lw=3, zorder=6)
ax.text(L + .25, -7.6, 'STAGE LINE z %.1f' % L, color=GREEN, fontsize=10, fontweight='bold', zorder=7)
xs = [pos(doc, i)[0] for i in doc if i.startswith('rig-deck-')]
zs = [pos(doc, i)[2] for i in doc if i.startswith('rig-deck-')]
ax.add_patch(Rectangle((min(zs) - 1, min(xs) - .5), 2, max(xs) - min(xs) + 1, color=TEAL, alpha=.9, zorder=6))
ax.text(min(zs), (min(xs) + max(xs)) / 2, 'DJ\n3×2 m\n1.2 m', color='#04130f', fontsize=8, ha='center', va='center', fontweight='bold', zorder=7)
for side in ('l', 'r'):
    e = doc['rig-pa-%s-subs' % side]['components']['transform']
    (x, _, z), (w, _, d) = e['position'], e['scale']
    ax.add_patch(Rectangle((z - d / 2, x - w / 2), d, w, color=BLUE, zorder=6))
    ax.text(z - d / 2 - .3, x, 'PA %s' % side.upper(), color=BLUE, fontsize=8.5, ha='right', va='center', zorder=7)
b = doc['rig-crowd-barrier']['components']['transform']
ax.plot([b['position'][2]] * 2, [b['position'][0] - b['scale'][0] / 2, b['position'][0] + b['scale'][0] / 2], color=FG, lw=2, zorder=6)
ax.text(b['position'][2] + .3, b['position'][0] + b['scale'][0] / 2 + .2, 'barrier z %.1f (1.3 m pit)' % b['position'][2], color=FG, fontsize=7.5)
# camera 954
cam = R('scripts/place/picks/cam-954-3.6.json')
ax.plot(cam['C'][2], cam['C'][0], 'o', color='white', ms=6, zorder=7)
ax.text(cam['C'][2] + .5, cam['C'][0] + .6, 'video 954 camera', color=FG, fontsize=7.5)
ax.set_xlim(-4, 55); ax.set_ylim(-14.5, 13.8)
ax.set_aspect('equal')
ax.set_xlabel('z, metres from the press end (joint) → entry', color=DIM)
ax.set_ylabel('x  (house left ↓ · house right ↑)', color=DIM)
ax.set_title('STAGE ON YOUR LINE — top view · crane parked at z %g (picked of 22 / 24 / 26), the cut unchanged in shape, tie-offs straight to the z 24 columns' % CZ,
             color=FG, fontsize=11.5, loc='left')
fig.text(.01, .012, FOOT, color=DIM, fontsize=7)
fig.savefig(os.path.join(a.out, 'stage24-plan.png'), facecolor=BG, bbox_inches='tight')
plt.close(fig)

# ---------------------------------------------------------------- (b) section at the crane's z, seen from the audience
fig, ax = plt.subplots(figsize=(17, 8.6), dpi=110)
fig.patch.set_facecolor(BG); style(ax)
ax.axhline(0, color='#55606b', lw=1.5)
ax.axhspan(0, 2.5, xmin=0, xmax=1, color=ORANGE, alpha=.06)
ax.axhline(2.5, color=ORANGE, lw=.8, ls='--', alpha=.7)
ax.text(-11.3, 2.58, 'raised hands 2.5 m', color=ORANGE, fontsize=8)
for x in g['column_row_x_m']:
    ax.add_patch(Rectangle((x - .4 if x > 0 else x - .4, 0), .8, 10.8, color='#4a525c', zorder=1))
for x in (-11.35, 11.35):
    ax.add_patch(Rectangle((x - .4, g['runway_bottom_m']), .8, g['runway_top_m'] - g['runway_bottom_m'], color='#6a6f76', zorder=2))
ax.add_patch(Rectangle((-11.35, crane['girder_bottom_m']), 22.7, crane['girder_top_m'] - crane['girder_bottom_m'], color=YELLOW, alpha=.8, zorder=3))
ax.text(-6, crane['girder_bottom_m'] + .25, 'crane bridge (girder bottom %.2f m — ASSUMED, the far crane\'s photo value)' % crane['girder_bottom_m'], color='#1a1406', fontsize=8, zorder=4)
tr = crane['trolley']
ax.add_patch(Rectangle((tr['x_m'][0], tr['y_m'][0]), tr['x_m'][1] - tr['x_m'][0], tr['y_m'][1] - tr['y_m'][0], color='#a07d1c', zorder=3))
ax.add_patch(Rectangle((cab['x_m'][0], cab['y_m'][0]), cab['x_m'][1] - cab['x_m'][0], cab['y_m'][1] - cab['y_m'][0], color='#c97a1a', zorder=3))
ax.text(sum(cab['x_m']) / 2, cab['y_m'][0] + .9, 'cab\nbottom %.2f' % cab['y_m'][0], color='#1a1406', fontsize=8, ha='center', zorder=4)
# fixed massing: in the section (z range holds CZ) solid, behind it (toward the press) ghosted
for m in g['massing']:
    (x0, x1), (y0, y1), (z0, z1) = m['x_m'], m['y_m'], m['z_m']
    if x1 < -12.5 or x0 > 12.5: continue
    here = z0 <= CZ <= z1
    behind = z1 < CZ and z1 > CZ - 9
    if not (here or behind): continue
    ax.add_patch(Rectangle((x0, y0), x1 - x0, y1 - y0, color='#7a6a58' if here else '#5b5148', alpha=.95 if here else .35, lw=0, zorder=2 if here else 1))
    if m['id'].startswith('pipe-rack'):
        ax.text(x0 - .1, (y0 + y1) / 2, m['id'], color=FG, fontsize=7, ha='right', va='center', zorder=5)
    elif here:
        ax.text((x0 + x1) / 2, y1 - .3, m['id'], color='#1a1406', fontsize=7.5, ha='center', va='top', zorder=5)
    elif m['id'] == 'duct-upper':
        ax.text((x0 + x1) / 2, y1 + .08, m['id'] + ('' if here else ' (behind, z %g–%g)' % (z0, z1)), color=FG if here else DIM, fontsize=7, ha='center', va='bottom', zorder=5)
# booth, DJ, PA (on the line, 0.5 m in front of the section — drawn in it)
xs = [pos(doc, i)[0] for i in doc if i.startswith('rig-deck-')]
ax.add_patch(Rectangle((min(xs) - .5, 0), max(xs) - min(xs) + 1, 1.2, color=TEAL, alpha=.85, zorder=4))
djx = design['booth']['centre_x_m']
ax.add_patch(Rectangle((djx - .25, 1.2), .5, 1.75, color='#e8e8e8', alpha=.8, zorder=5))
ax.add_patch(Rectangle((djx - .3, 2.95), .6, .6, color='#e8e8e8', alpha=.5, zorder=5, ls='--', fill=False))
ax.text(djx, 3.65, 'DJ (raised hands %.2f)' % (1.2 + 2.5), color=FG, fontsize=7.5, ha='center')
for side in ('l', 'r'):
    s = doc['rig-pa-%s-subs' % side]['components']['transform']; t = doc['rig-pa-%s-tops' % side]['components']['transform']
    ax.add_patch(Rectangle((s['position'][0] - s['scale'][0] / 2, 0), s['scale'][0], s['scale'][1], color=BLUE, zorder=4))
    ax.add_patch(Rectangle((t['position'][0] - t['scale'][0] / 2, t['position'][1]), t['scale'][0], t['scale'][1], color='#7085ff', zorder=4))
    ax.text(s['position'][0], t['position'][1] + t['scale'][1] + .1, 'PA %s (placeholder)' % side.upper(), color=BLUE, fontsize=7.5, ha='center')
# the cut: bottom chord line + section
th = np.radians(15)
(e0, e1) = ends
sec = .29
xa, xb = e0['x_m'], e1['x_m']
ya, yb = e0['bottom_chord_m'], e1['bottom_chord_m']
ax.add_patch(Polygon([[xa, ya], [xb, yb], [xb - sec * np.sin(th), yb + sec * np.cos(th)], [xa - sec * np.sin(th), ya + sec * np.cos(th)]], color=STEEL, zorder=6))
for p in truss['picks']:
    for s in (-1, 1):
        pass
    ax.plot([p['x_m'], p['x_m']], [p['top_chord_m'], p['apex_m']], color='#8a8e95', lw=1.2, zorder=6)
    ax.plot([p['x_m'], p['x_m']], [p['apex_m'], crane['girder_bottom_m'] - .15], color='#c9ccd1', lw=1, ls=':', zorder=6)
    ax.plot(p['x_m'], p['apex_m'], 'v', color=FG, ms=5, zorder=7)
    ax.text(p['x_m'] + .15, p['apex_m'] + .15, 'pick %.2f m\nbridle %d°' % (p['x_m'], p['bridle_included_deg']), color=FG, fontsize=7, zorder=7)
# lamps on the cut as read back
for i, e in doc.items():
    if (i.startswith('rig-par-cut-') or i.startswith('rig-lasercube-cut-')) and e['type'] == 'spotLight':
        x, y, _ = e['components']['transform']['position']
        ax.add_patch(Rectangle((x - .12, y - .3 if 'curtain' in i else y - .05), .24, .3, color='#ff8a2a' if 'par' in i else '#27ff4a', alpha=.9, zorder=7))
for tie in truss['tieoffs']:
    ax.plot([tie['from_m'][0], tie['to_m'][0]], [tie['from_m'][1], tie['to_m'][1]], color=YELLOW, lw=2, zorder=6)
lo = truss['clearance']['low_end']
ax.annotate('low end %.2f m bottom chord\n%.2f over raised hands (house left)' % (e0['bottom_chord_m'], lo['over_raised_hands_m']), xy=(xa, ya), xytext=(xa - 4.5, ya - 1.6),
            color=FG, fontsize=8, arrowprops=dict(arrowstyle='->', color=DIM))
ax.annotate('high end %.2f m' % e1['bottom_chord_m'], xy=(xb, yb), xytext=(xb - 3.4, yb + 1.0), color=FG, fontsize=8, arrowprops=dict(arrowstyle='->', color=DIM))
hr = truss['tieoffs'][1]
ax.annotate('tie-off hr to the column at %.2f m:\n%.2f under the cab · 0.20 over pipe-rack-3\n(window 4.60–4.8 m — TAPE cab + pipes 10-08)' % (hr['to_m'][1], hr['under_cab_m']),
            xy=(9.2, 5.25), xytext=(-10.9, 6.55), color=YELLOW, fontsize=7.5, arrowprops=dict(arrowstyle='->', color=YELLOW, alpha=.6))
ax.text(-11.3, 9.9, 'Section at z %g (the crane\'s bridge plane), seen FROM THE AUDIENCE: house left ←  → house right. Same cut as today: ends %.2f / %.2f m, bridles %s°, trim %.2f.'
        % (CZ, ya, yb, '/'.join(str(p['bridle_included_deg']) for p in truss['picks']), truss['trim_m']), color=FG, fontsize=10)
ax.set_xlim(-12.6, 12.6); ax.set_ylim(-.3, 10.4); ax.set_aspect('equal')
ax.set_xlabel('x (m)', color=DIM); ax.set_ylabel('height (m)', color=DIM)
fig.text(.01, .012, FOOT, color=DIM, fontsize=7)
fig.savefig(os.path.join(a.out, 'stage24-side.png'), facecolor=BG, bbox_inches='tight')
plt.close(fig)

# ---------------------------------------------------------------- (c) on frame 954
from PIL import Image
im = np.asarray(Image.open(a.frame).convert('RGB'))
H, W = im.shape[:2]
Rm, C, f, cx, cy = np.array(cam['R']), np.array(cam['C']), cam['f'], cam['cx'], cam['cy']


def proj(P):
    q = Rm @ (np.asarray(P, float) - C)
    return None if q[2] <= .3 else (f * q[0] / q[2] + cx, f * q[1] / q[2] + cy)


def seg(ax, a3, b3, n=40, **kw):
    pts = [proj(np.asarray(a3) + (np.asarray(b3) - np.asarray(a3)) * t) for t in np.linspace(0, 1, n)]
    pts = [p for p in pts if p is not None]
    if len(pts) > 1:
        ax.plot([p[0] for p in pts], [p[1] for p in pts], **kw)


def boxw(ax, x0, x1, y0, y1, z0, z1, **kw):
    c = [(x, y, z) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
    for i in range(8):
        for j in range(i + 1, 8):
            if sum(c[i][k] != c[j][k] for k in range(3)) == 1: seg(ax, c[i], c[j], n=12, **kw)


fig, ax = plt.subplots(figsize=(W / 100, H / 100), dpi=100)
fig.subplots_adjust(0, 0, 1, 1)
ax.imshow(im); ax.set_xlim(0, W); ax.set_ylim(H, 0); ax.axis('off')
seg(ax, (-11.6, 0, L), (11.6, 0, L), color=GREEN, lw=3)
bx0, bx1 = min(xs) - .5, max(xs) + .5
boxw(ax, bx0, bx1, 0, 1.2, L - 2, L, color=TEAL, lw=2)
boxw(ax, djx - .9, djx + .9, 1.2, 2.15, L - 1.0, L - 0.2, color=TEAL, lw=1)
for side in ('l', 'r'):
    for part in ('subs', 'tops'):
        t = doc['rig-pa-%s-%s' % (side, part)]['components']['transform']
        (x, y, z), (w, h, d) = t['position'], t['scale']
        boxw(ax, x - w / 2, x + w / 2, y, y + h, z - d / 2, z + d / 2, color=BLUE, lw=2)
bb = doc['rig-crowd-barrier']['components']['transform']
boxw(ax, bb['position'][0] - bb['scale'][0] / 2, bb['position'][0] + bb['scale'][0] / 2, 0, 1.1, bb['position'][2] - .04, bb['position'][2] + .04, color=FG, lw=1, alpha=.7)
seg(ax, (xa, ya, CZ), (xb, yb, CZ), color=STEEL, lw=4)
for tie in truss['tieoffs']: seg(ax, tie['from_m'], tie['to_m'], color=YELLOW, lw=2, ls='--')
for s in (-1, 1):
    seg(ax, (-11.35, crane['girder_bottom_m'], CZ + s * 1.1), (11.35, crane['girder_bottom_m'], CZ + s * 1.1), color=YELLOW, lw=3)
boxw(ax, cab['x_m'][0], cab['x_m'][1], cab['y_m'][0], cab['y_m'][1], CZ - 1, CZ + 1, color='#c97a1a', lw=1.5)
seg(ax, (-11.35, 7.95, 4.8), (11.35, 7.95, 4.8), color=GHOST, lw=2, ls=':')
up = proj((0, 6.0, CZ))
def label(P, s, col, dy=0):
    p = proj(P)
    if p and 0 < p[0] < W and 0 < p[1] < H:
        ax.text(p[0], p[1] + dy, s, color=col, fontsize=13, fontweight='bold', ha='center', bbox=dict(fc='black', ec='none', alpha=.55))
label((-6, 0, L + 3), 'stage line z 24.5', GREEN)
label((djx, 1.4, L), 'DJ booth', TEAL, -40)
label((-1.8, 2.1, L), 'PA L', BLUE, -10)
label((6.05, 2.1, L), 'PA R', BLUE, -10)
for k in np.linspace(0, 1, 60):  # the first point of the cut inside the frame carries its label
    P = (xa + (xb - xa) * k, ya + (yb - ya) * k + .15, CZ)
    q = proj(P)
    if q and 40 < q[0] < W - 40 and 90 < q[1] < H - 40:
        ax.text(q[0] + 10, q[1] + 30, 'the cut (z 24), rising to house right', color=STEEL, fontsize=13, fontweight='bold', bbox=dict(fc='black', ec='none', alpha=.55))
        break
ax.text(20, 40, 'Projected with cam-954-3.6.json (rotation from the vanishing point; position VGGT ±0.7 m). The crane bridge (7.95 m) and the cut\'s high end are above this frame '
        '(it sees up to ≈ %.1f m at the crane\'s z). Old crane z 4.8 dotted grey.' % (cam['C'][1] + (cam['C'][2] - CZ) * np.tan(np.arctan(cy / f) + np.radians(cam['yaw_pitch_roll_deg'][1]))),
        color='white', fontsize=11, bbox=dict(fc='black', ec='none', alpha=.6))
fig.savefig(os.path.join(a.out, 'stage24-on-frame-954.png'), dpi=100)
plt.close(fig)
print('wrote', a.out)
