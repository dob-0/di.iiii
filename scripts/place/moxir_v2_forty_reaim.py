#!/usr/bin/env python3
# moxir_v2_forty_reaim.py — MOXIR v2 cranes, round 2, item 1 (the lead, 2026-10-10): can the two UP-LA40WF (#873, tower-z48) be
# RE-AIMED so every ray clears the near crane's girders and the cut at its park z 3.20 under the cubes' BODY rule (true box + 0.25,
# tube aperture/2 + div s/2 + s tan 1.008 deg, gap >= 0.25) AND keeps #873's own rule (standing levels 3.0 m over / 2.5 m beside,
# the far gate, the other unit, the cubes' keep-out) AND ends on the far wall's matte block?  If not: how far must the park move.
#
#   python3 -I scripts/place/moxir_v2_forty_reaim.py --repo . [--variants base,u7.42,...] > result.json
#
# METHOD: #873's own search, unchanged in kind: the two units side by side on the T-bar (x fixed at the chosen mount, one height y),
#   their two end points on the far wall free; maximise the WORST margin of both beams with the compass (pattern) search of
#   Hooke & Jeeves (J. ACM 8(2) 1961; Kolda, Lewis & Torczon, SIAM Review 45(3) 2003) from a grid of 12 starts (a local search:
#   the grid is how a global answer is approached; the analytic bound below says why the answer cannot be positive).
#   The margins: moxir_v2_cranes.Scene.margins with the 40 W's optics (10 mm + 1.3 mrad, #873) at both near-crane tops 8.92 / 9.02,
#   + #873's own moxir_entry_lasers.margins for the rows the v2 Scene has not got (its places incl. the free cab, the other unit's
#   body, the cubes' keep-out box, the far gate as #873 reads it).
#   'scoped' = what the lead asked (the near crane, the cut, its picks, straps and PARs, by the body rule) + #873's own rule;
#   'full'   = every body by the body rule (the free crane's far girder, the roof, the pendant lamps, every lamp) as the cubes are held.
# ANALYTIC BOUND (why re-aiming cannot pass, x fixed): over the FOH riser (z 28-30, 0.6 m) the axis must be >= 5.6 + R(18) = 5.86;
#   under the near crane's far girder (z 1.75, s 46.25) it must be <= 7.2 - 0.25 - 0.25 - rb(46.25) = 5.85; at the far wall (people
#   on the floor) >= 5.0 + R(101.8) = 6.49. A straight line cannot be >= 5.86 at z 30, <= 5.85 at z 1.75 and >= 6.49 at z -53.8.
import argparse, json, math, os, sys, time

for _k in ('OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS'):
    os.environ.setdefault(_k, '1')
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True
ap = argparse.ArgumentParser()
ap.add_argument('--repo', default='.')
ap.add_argument('--variants', default='base-scoped,base-full,u7.42-scoped,u7.6-scoped,park8-scoped,park10-scoped,park12-scoped,park14-scoped,foh-shift-scoped')
A, _rest = ap.parse_known_args()
sys.argv = [sys.argv[0], '--repo', A.repo]
import numpy as np
import moxir_v2_cranes as M
import moxir_entry_lasers as E

REPO = os.path.abspath(os.path.expanduser(A.repo))
OPT = (E.APERTURE_TUBE, E.PHI)
NEAR_Z_DECIDED = M.NEAR_Z                     # 3.20, the decided park (patched per variant below)
X0 = -8.094                                  # #873's chosen mount tower-z48, unit 01 (unit 02 at +0.7)
THEIR_KEYS = ('place: ', 'end: ', 'the other', 'the six cubes')
SCOPED_GROUPS = ('standing levels', 'end: ', 'near crane', 'the cut')


def world(near_z, near_under):
    M.NEAR_Z, M.NEAR_UNDER = near_z, near_under
    E.NEAR_UNDER = near_under
    E.G['cranes'][0]['z_m'] = near_z
    G = M.rd(REPO, M.HALL_V10)['geometry']
    stage, cutj, rig, entry = M.rd(REPO, M.STAGE_V2C), M.rd(REPO, M.CUT_V2C), M.rd(REPO, M.RIG_V2C), M.rd(REPO, M.ENTRY)
    ev, _ = M.derive(REPO)
    ops = M.openings_of(M.FAR_WALL_OPENINGS)
    rule_ops = [o for k in M.FAR_WALL_OPENINGS['rule_set'] for o in ops[k]]
    L = M.rd(REPO, M.LASERS)
    SC = [M.Scene(REPO, G, stage, rig, ev['truss'], cutj, entry, top='p95', near_top=nt, openings=rule_ops) for nt in M.NEAR_TOP]
    tp = M.FREE_TOP['p95']
    extra = [M.box('free crane far-side girder (the cubes\' mount)', (-11.35, 11.35), (M.FREE_UNDER, tp), M.FAR_GIRDER, 'free crane')]
    extra += [M.cube_box(u['aperture_m']['p95'], 'cube ' + u['id']) for u in L['units']]
    return SC, extra


def margins(SC, extra, p, T, other, scoped):
    out = {}
    for S in SC:
        m = S.margins(p, T, step=0.5, optics=OPT, skip_groups=('the 40 W lasers (#873 keep-out)',), extra_boxes=extra)
        for k, (v, at, g) in m.items():
            if scoped and not (any(g.startswith(s) for s in SCOPED_GROUPS) or k.startswith('body: lamp rig-par-cut')):
                continue
            if k not in out or v < out[k]:
                out[k] = v
    _, _, mt, _ = E.margins(p, T, step=0.5, others=(other,))
    for k, (v, _at) in mt.items():
        if k.startswith(THEIR_KEYS):
            out['#873: ' + k] = min(v, out.get('#873: ' + k, 99.0))
    k = min(out, key=out.get)
    return out[k], k


def layout(v):
    y, xa, ya, xb, yb = v
    return np.array([X0, y, 48.0]), np.array([X0 + E.DX, y, 48.0]), np.array([xa, ya, E.END_Z]), np.array([xb, yb, E.END_Z])


def search(SC, extra, scoped):
    def f(v):
        pa, pb, ta, tb = layout(v)
        return min(margins(SC, extra, pa, ta, pb, scoped)[0], margins(SC, extra, pb, tb, pa, scoped)[0])
    best = None
    for y0 in (5.0, 5.5, 6.0, 6.5):
        for ye in (6.6, 7.1, 7.6):
            v = np.array([y0, -7.2, ye, -6.9, ye])
            fv, step = f(v), 0.4
            while step > 0.01:
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
            if best is None or fv > best[0]:
                best = (fv, v)
    pa, pb, ta, tb = layout(best[1])
    return {'worst_m': round(best[0], 3), 'aperture_y_m': round(best[1][0], 3), 'ends_m': [[round(v, 3) for v in ta], [round(v, 3) for v in tb]],
            'binding': [margins(SC, extra, pa, ta, pb, scoped)[1], margins(SC, extra, pb, tb, pa, scoped)[1]]}


def main():
    res, t0 = {}, time.time()
    for var in A.variants.split(','):
        near_z, under, foh = NEAR_Z_DECIDED, 7.2, False
        name, scope = var.rsplit('-', 1)
        if name.startswith('u'):
            under = float(name[1:])
        elif name.startswith('park'):
            near_z = float(name[4:])
        elif name == 'foh-shift':
            foh = True
        SC, extra = world(near_z, under)
        if foh:                                        # the FOH riser moved 2.5 m house right (x -4.2..-1.2): a what-if for the ground layout
            for S in SC:
                S.parr[[i for i, p in enumerate(S.places) if p[0] == 'FOH riser'][0], 0:2] += 2.5
            E.PLACE_ARR[[i for i, p in enumerate(E.PLACES) if p[0] == 'FOH riser'][0], 0:2] += 2.5
        if name == 'asis':                             # #873's own aims, evaluated, no search
            ent = M.rd(REPO, M.ENTRY)['fixtures']
            P = [(np.array(f['p'], float), np.array(f['laser']['beams'][0]['to'], float)) for f in ent]
            mm = [margins(SC, extra, P[i][0], P[i][1], P[1 - i][0], scope == 'scoped') for i in (0, 1)]
            r = {'worst_m': round(min(m[0] for m in mm), 3), 'per_unit': [[round(m[0], 3), m[1]] for m in mm]}
        else:
            r = search(SC, extra, scope == 'scoped')
        r.update({'near_crane_z_m': near_z, 'near_underside_m': under, 'foh_shifted_2_5_m': foh, 'scope': scope})
        if foh:
            E.PLACE_ARR[[i for i, p in enumerate(E.PLACES) if p[0] == 'FOH riser'][0], 0:2] -= 2.5
        res[var] = r
        print('[%4.0f s] %s %s' % (time.time() - t0, var, json.dumps(r)), file=sys.stderr, flush=True)
    print(json.dumps(res, indent=1))


if __name__ == '__main__':
    main()
