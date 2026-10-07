#!/usr/bin/env python3
# back_flip_compare.py — three sections at the same scale, seen FROM THE AUDIENCE (house left on the left), for the
# owner's picture gate of 2026-10-07 ("the truss at the back of the DJ … with the truss flipped"):
#   (a) today's stage-line copy: crane z 24, the cut over the DJ, low house left — `--line-eval` must be the
#       stage-line evaluation of THAT state (stage-line.mjs --evaluate at commit 15e5804a; since the owner chose (b),
#       the stage-line design itself hangs behind the DJ)
#   (b) the cut behind the DJ (crane z 21), NOT flipped — numbers only, no scratch copy
#   (c) the cut behind the DJ (crane z 21), FLIPPED — the scratch copy moxir-known-full-stage-back-flip
# Each panel: the DJ on his step, the PA, the line and its picks, the tie-offs (projected; they run to the z 18 / 24
# columns), the cab, the fixed metal in the section and just behind it, raised hands, and a pass/fail line.
# All numbers come from scripts/rigbuild/stage-line.mjs --evaluate (the two designs) and the copies' documents.
#
#   python3 -I scripts/place/back_flip_compare.py --repo . --line-eval <stage-line evaluate.json> \
#       --back-eval <back-flip evaluate.json> --doc-line <stage24 document.json> --doc-back <back-flip document.json> --out <png>
import argparse, json, os, textwrap
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, Polygon

BG, FG, DIM, GRID = '#0d0f12', '#d8dce2', '#7d8794', '#2a3038'
TEAL, BLUE, ORANGE, YELLOW, STEEL, RED, OK = '#16b8a0', '#4f6bff', '#ff9a5c', '#e2b53a', '#aab2bd', '#ff5a4f', '#46d36e'

ap = argparse.ArgumentParser()
for k in ('repo', 'line-eval', 'back-eval', 'doc-line', 'doc-back', 'out'):
    ap.add_argument('--' + k, required=k != 'repo', default='.' if k == 'repo' else None)
a = ap.parse_args()
J = lambda p: json.load(open(p))
R = lambda p: J(os.path.join(a.repo, p))
line_design = R('scripts/place/rigs/moxir-stage-line-2026-10-07.json')
back_design = R('scripts/place/rigs/moxir-stage-back-flip-2026-10-07.json')
line_hall = R(line_design['crane']['hall_record'])['geometry']
back_hall = R(back_design['crane']['hall_record'])['geometry']
le, be = J(a.line_eval), J(a.back_eval)
docs = {'line': {e['id']: e for e in J(a.doc_line)['document']['entities']}, 'back': {e['id']: e for e in J(a.doc_back)['document']['entities']}}

zb = back_design['crane']['z_m']
behind = {(o['rig'], o['z_m']): o for o in be['behind']}
un, fl = behind[('unflipped', zb)], behind[('design', zb)]
ln = next(o for o in le['options'] if o['z_m'] == line_design['crane']['z_m'])
hr_line = next(t for t in le['truss']['tieoffs'] if t['id'] == 'hr')


def tie_text(o):
    out = []
    for t in o['ties']:
        p = t['pick']
        out.append('%s→z%g @%.2f m (%d° off plane%s), %.2f to %s' % (t['id'], p['grid_z_m'], p['y_m'], p['angle_off_plane_deg'],
                                                                   '' if abs(p['change_m']) < 0.005 else ', CHANGED %+.2f m' % p['change_m'], p['nearest']['gap_m'], p['nearest']['id']))
    return out


fl_hr = next(t for t in fl['ties'] if t['id'] == 'hr')
panels = [
    dict(key='a', title='(a) TODAY — stage line copy: crane z %g, the cut over the DJ, LOW house left' % line_design['crane']['z_m'],
         truss=le['truss'], hall=line_hall, z=line_design['crane']['z_m'], doc='line',
         verdict='PASS — tie-offs straight to z 24: hr %.2f under the cab, 0.20 over pipe-rack-3; low end %.2f over raised hands; hangs 0.7 m in FRONT of the DJ (over the step)'
         % (hr_line['under_cab_m'], le['truss']['clearance']['low_end']['over_raised_hands_m']), ok=True),
    dict(key='b', title='(b) BEHIND the DJ, NOT flipped: crane z %g, LOW house left' % zb, truss=be['unflipped_truss'], hall=back_hall, z=zb, doc='back',
         verdict='PASS, no change — bridle clamps %.2f m behind the step; %s' % (un['gap_m'], ' · '.join(tie_text(un))), ok=not un['hard']),
    dict(key='c', title='(c) BEHIND the DJ, FLIPPED: crane z %g, LOW house RIGHT — the scratch copy' % zb, truss=be['truss'], hall=back_hall, z=zb, doc='back',
         verdict=('PASS with ONE change — clamps %.2f m behind the step; the LOW end\'s tie-off cannot run at its own height (%.2f m: pipe racks) → raised +%.2f m to %.2f m; %s; the low end %.2f m over the blower cyclone'
                  % (fl['gap_m'], fl_hr['from_m'][1], be['truss']['tieoffs'][1]['to_m'][1] - fl_hr['from_m'][1], be['truss']['tieoffs'][1]['to_m'][1],
                     ' · '.join(tie_text(fl)), fl['line_nearest_fixed']['gap_m'])), ok=not fl['hard']),
]

fig, axes = plt.subplots(3, 1, figsize=(17, 19.5), dpi=105)
fig.patch.set_facecolor(BG)
for ax, P in zip(axes, panels):
    ax.set_facecolor(BG)
    for s in ax.spines.values(): s.set_color(GRID)
    ax.tick_params(colors=DIM, labelsize=8)
    g, z, t, D = P['hall'], P['z'], P['truss'], docs[P['doc']]
    crane = next(c for c in g['cranes'] if abs(c['z_m'] - z) < 1e-6)
    ax.axhline(0, color='#55606b', lw=1.5)
    ax.axhline(2.5, color=ORANGE, lw=.8, ls='--', alpha=.7)
    ax.text(-12.3, 2.58, 'raised hands 2.5 m', color=ORANGE, fontsize=7.5)
    for x in g['column_row_x_m']:
        ax.add_patch(Rectangle((x - .4, 0), .8, 10.8, color='#4a525c', zorder=1))
    for x in (-11.35, 11.35):
        ax.add_patch(Rectangle((x - .4, g['runway_bottom_m']), .8, g['runway_top_m'] - g['runway_bottom_m'], color='#6a6f76', zorder=2))
    ax.add_patch(Rectangle((-11.35, crane['girder_bottom_m']), 22.7, crane['girder_top_m'] - crane['girder_bottom_m'], color=YELLOW, alpha=.8, zorder=3))
    ax.text(-11, crane['girder_bottom_m'] + .25, 'crane bridge z %g (girder bottom %.2f — ASSUMED)' % (z, crane['girder_bottom_m']), color='#1a1406', fontsize=7.5, zorder=4)
    cab = crane['cab']
    ax.add_patch(Rectangle((cab['x_m'][0], cab['y_m'][0]), cab['x_m'][1] - cab['x_m'][0], cab['y_m'][1] - cab['y_m'][0], color='#c97a1a', zorder=3))
    ax.text(sum(cab['x_m']) / 2, cab['y_m'][0] + .8, 'cab', color='#1a1406', fontsize=8, ha='center', zorder=4)
    for m in g['massing']:
        (x0, x1), (y0, y1), (z0, z1) = m['x_m'], m['y_m'], m['z_m']
        if x1 < -12.5 or x0 > 12.5: continue
        here = z0 <= z <= z1
        near = (z0 - 3.5 <= z <= z1 + 3.5) and not here
        if not (here or near): continue
        ax.add_patch(Rectangle((x0, y0), x1 - x0, y1 - y0, color='#7a6a58' if here else '#5b5148', alpha=.95 if here else .35, lw=0, zorder=2 if here else 1))
        if here or m['id'].startswith('pipe-rack') or m['id'] in ('blower-cyclone', 'drum-tank'):
            ax.text(x1 + .05 if m['id'].startswith('pipe-rack') else (x0 + x1) / 2, (y0 + y1) / 2 if m['id'].startswith('pipe-rack') else y1 + .06,
                    m['id'] + ('' if here else ' (z %g–%g)' % (z0, z1)), color=FG if here else DIM, fontsize=6.5, ha='left' if m['id'].startswith('pipe-rack') else 'center',
                    va='center' if m['id'].startswith('pipe-rack') else 'bottom', zorder=5)
    # the booth, the DJ, the PA (all at the stage line, in front of the section — drawn in it)
    xs = [D[i]['components']['transform']['position'][0] for i in D if i.startswith('rig-deck-')]
    deck = D['rig-deck-2']['components']['transform']['scale'][1]
    ax.add_patch(Rectangle((min(xs) - .5, 0), max(xs) - min(xs) + 1, deck, color=TEAL, alpha=.9, zorder=4))
    dx = np.mean(xs)
    ax.add_patch(Rectangle((dx - .25, deck), .5, 1.75, color='#e8e8e8', alpha=.85, zorder=5))
    ax.text(dx, deck + 2.0, 'DJ (%.1f m step)' % deck, color=FG, fontsize=7.5, ha='center', zorder=6)
    for side in ('l', 'r'):
        s_ = D['rig-pa-%s-subs' % side]['components']['transform']; t_ = D['rig-pa-%s-tops' % side]['components']['transform']
        ax.add_patch(Rectangle((s_['position'][0] - s_['scale'][0] / 2, 0), s_['scale'][0], s_['scale'][1], color=BLUE, zorder=4))
        ax.add_patch(Rectangle((t_['position'][0] - t_['scale'][0] / 2, t_['position'][1]), t_['scale'][0], t_['scale'][1], color='#7085ff', zorder=4))
    # the cut
    e0, e1 = t['ends']
    th = np.radians(15)
    sgn = 1 if e1['bottom_chord_m'] > e0['bottom_chord_m'] else -1
    xa, xb, ya, yb, sec = e0['x_m'], e1['x_m'], e0['bottom_chord_m'], e1['bottom_chord_m'], .29
    ax.add_patch(Polygon([[xa, ya], [xb, yb], [xb - sgn * sec * np.sin(th), yb + sec * np.cos(th)], [xa - sgn * sec * np.sin(th), ya + sec * np.cos(th)]], color=STEEL, zorder=6))
    for p in t['picks']:
        ax.plot([p['x_m'], p['x_m']], [p['top_chord_m'], crane['girder_bottom_m'] - .15], color='#c9ccd1', lw=1, ls=':', zorder=6)
        ax.plot(p['x_m'], p['apex_m'], 'v', color=FG, ms=4, zorder=7)
        ax.text(p['x_m'] + .12, p['apex_m'] + .1, '%d°' % p['bridle_included_deg'], color=FG, fontsize=7, zorder=7)
    lo = min(t['ends'], key=lambda e: e['bottom_chord_m'])
    ax.annotate('LOW %.2f m' % lo['bottom_chord_m'], xy=(lo['x_m'], lo['bottom_chord_m']), xytext=(lo['x_m'] + (-2.6 if lo['x_m'] < 0 else 1.0), lo['bottom_chord_m'] - .9),
                color=FG, fontsize=8, arrowprops=dict(arrowstyle='->', color=DIM))
    hi = max(t['ends'], key=lambda e: e['bottom_chord_m'])
    ax.text(hi['x_m'], hi['bottom_chord_m'] + .55, 'HIGH %.2f m' % hi['bottom_chord_m'], color=FG, fontsize=8, ha='center')
    for tie in t['tieoffs']:
        if not tie.get('to_m'): continue
        ax.plot([tie['from_m'][0], tie['to_m'][0]], [tie['from_m'][1], tie['to_m'][1]], color=YELLOW, lw=2, zorder=6)
        ax.text(tie['to_m'][0] - np.sign(tie['to_m'][0]) * .2, tie['to_m'][1] + .18, '%.2f m → z %g' % (tie['to_m'][1], tie['to_m'][2]), color=YELLOW, fontsize=7,
                ha='right' if tie['to_m'][0] > 0 else 'left', zorder=7)
    ax.set_xlim(-12.6, 12.6); ax.set_ylim(-.3, 10.0); ax.set_aspect('equal')
    ax.text(-12.4, 9.55, P['title'], color=FG, fontsize=11, fontweight='bold')
    ax.text(-12.4, -1.2, '\n'.join(textwrap.wrap(P['verdict'], 175)), color=OK if P['ok'] else RED, fontsize=8.2, va='top')
    ax.text(12.4, 9.55, 'house left ←  seen from the audience  → house right', color=DIM, fontsize=8, ha='right')
fig.text(.01, .004, 'Sources: %s and %s (hall records); scripts/rigbuild/stage-line.mjs --evaluate (craneCut, behindOptions, safety.mjs); the scratch copies\' documents.\n'
         'Tie-offs drawn projected onto the section; they run diagonally to the column grid line named. Crane heights ASSUMED (far crane, photo 007); pipe racks LOW confidence — tape 2026-10-08.'
         % (os.path.basename(line_design['crane']['hall_record']), os.path.basename(back_design['crane']['hall_record'])), color=DIM, fontsize=7)
fig.subplots_adjust(left=.03, right=.99, top=.99, bottom=.055, hspace=.3)
fig.savefig(a.out, facecolor=BG)
print('wrote', a.out)
