#!/usr/bin/env python3
# moxir_v2_h1_reaim.py — MOXIR v2 cranes, round 2, item 3 (the lead, 2026-10-10): ONE far-wall end point for the six LaserCubes
# (B-L, sitting on the free crane's far-side girder) such that EVERY reading of the far gate clears at >= 0 m — the hall model's
# centred gate (G0), photo 007's safe-end jambs (G2) and the laser judge's G3 / G4 / G7 — while every other rule of
# moxir_v2_cranes.Scene.margins still holds (standing levels 3.0 m over / 2.5 m beside, every body + 0.25 m at the 1.008 deg tube,
# the pendant lamps, the roof, the other cubes, the 40 W keep-out).
#
#   python3 -I scripts/place/moxir_v2_h1_reaim.py --repo . > result.json
#
# METHOD: the same search the design used (laser-margin/laser_margin.py: compass / pattern search, Hooke & Jeeves, J. ACM 8(2) 1961;
#   Kolda, Lewis & Torczon, SIAM Review 45(3) 2003), over the end point (x, y) on the far wall (z -53.8), maximising the WORST margin
#   over 6 beams x 3 free-crane tops (p05/p50/p95) x 2 near-crane tops (8.92 / 9.02) x {the z -54 roof row not counted, counted
#   (the judge's reading)}; 12 starts on a grid (a local search; the grid is how the global answer is approached). The six cubes
#   stay where they sit (x -4.5..-1.0); only the aim changes. The result is then written into LASER_END and checked in full by
#   `moxir_v2_cranes.py build` (casts on the hall triangles, setup sheet, mounts).
# WHY THE END MUST MOVE LEFT: the gate readings' top is 7.47 m; 3.0 m over it (10.47 + the tube) is above the roof chord (10.6 low
#   end) at the wall, so the beam must pass 2.5 m + the tube BESIDE every reading: left of G7's left jamb (x -4.7) means x_end <=
#   about -7.8; right of G4's right jamb (4.31) would cross the whole gate. The pendant-lamp row at x -11.2 bounds it on the left.
import argparse, json, os, sys, time

for _k in ('OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS'):
    os.environ.setdefault(_k, '1')
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True
ap = argparse.ArgumentParser()
ap.add_argument('--repo', default='.')
ap.add_argument('--starts', default='-7.9,-8.6,-9.3', help='start x values (m); each with y 7.2/7.8/8.4/9.0')
ap.add_argument('--skip', default='', help='a what-if: leave out the bodies of these groups (comma list), e.g. the 40 W keep-out')
ap.add_argument('--step', type=float, default=0.5, help='the margins\' sampling step along the beam during the search (m)')
A, _ = ap.parse_known_args()
import numpy as np
import moxir_v2_cranes as M

SKIP = tuple(g for g in A.skip.split(',') if g)
REPO = os.path.abspath(os.path.expanduser(A.repo))
os.chdir(REPO)


def world():
    G = M.rd(REPO, M.HALL_V10)['geometry']
    stage, cutj, rig, entry = M.rd(REPO, M.STAGE_V2C), M.rd(REPO, M.CUT_V2C), M.rd(REPO, M.RIG_V2C), M.rd(REPO, M.ENTRY)
    ev, _ = M.derive(REPO)
    ops = M.openings_of(M.FAR_WALL_OPENINGS)
    rule_ops = [o for k in M.FAR_WALL_OPENINGS['rule_set'] + M.FAR_WALL_OPENINGS['h1_hold_set'] for o in ops[k]]
    scenes = [(top, M.Scene(REPO, G, stage, rig, ev['truss'], cutj, entry, top=top, near_top=nt, openings=rule_ops, z54=z54))
              for top in M.TOPS for nt in M.NEAR_TOP for z54 in (False, True)]
    return scenes, M.rd(REPO, M.LASERS)['units']


def worst_of(scenes, units, T, step):
    w = (99.0, None, None)
    for u in units:
        oth = [o for o in units if o['id'] != u['id']]
        for top, S in scenes:
            m = S.margins(u['aperture_m'][top], T, others=[o['aperture_m'][top] for o in oth], step=step, skip_groups=SKIP)
            k = min(m, key=lambda q: m[q][0])
            if m[k][0] < w[0]:
                w = (m[k][0], u['id'], k)
    return w


def compass(f, v, step=0.4, tol=0.01):
    fv = f(v)
    while step > tol:
        imp = False
        for i in range(len(v)):
            for sg in (1, -1):
                w = v.copy()
                w[i] += sg * step
                fw = f(w)
                if fw > fv + 1e-7:
                    v, fv, imp = w, fw, True
                    break
        if not imp:
            step /= 2
    return v, fv


def main():
    t0 = time.time()
    scenes, units = world()
    Z = M.LASER_END[2]
    f = lambda v: worst_of(scenes, units, (v[0], v[1], Z), A.step)[0]
    before = worst_of(scenes, units, M.LASER_END, 0.25)
    print('[%4.0f s] the design end %s: %+.3f (%s, %s)' % (time.time() - t0, M.LASER_END, before[0], before[1], before[2]), file=sys.stderr, flush=True)
    runs = []
    for x0 in [float(x) for x in A.starts.split(',')]:
        for y0 in (7.2, 7.8, 8.4, 9.0):
            v, fv = compass(f, np.array([x0, y0]))
            runs.append((fv, v))
            print('[%4.0f s] start (%g, %g) -> (%.3f, %.3f) %+.3f' % (time.time() - t0, x0, y0, v[0], v[1], fv), file=sys.stderr, flush=True)
    fv, v = max(runs, key=lambda r: r[0])
    T = (round(float(v[0]), 3), round(float(v[1]), 3), Z)
    after = worst_of(scenes, units, T, 0.25)
    print(json.dumps({'design_end_m': list(M.LASER_END), 'design_worst_all_readings_m': round(before[0], 3), 'design_binding': before[1:],
                      'end_m': list(T), 'worst_m': round(after[0], 3), 'binding': after[1:],
                      'starts': [[round(float(r[1][0]), 3), round(float(r[1][1]), 3), round(r[0], 3)] for r in runs],
                      'readings': M.FAR_WALL_OPENINGS['rule_set'] + M.FAR_WALL_OPENINGS['h1_hold_set'], 'search_step_m': A.step, 'what_if_skipped_groups': list(SKIP), 'final_step_m': 0.25}, indent=1))


if __name__ == '__main__':
    main()
