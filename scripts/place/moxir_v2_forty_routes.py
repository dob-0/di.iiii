#!/usr/bin/env python3
# moxir_v2_forty_routes.py — MOXIR v2 cranes, round 3, item 1 (the lead, 2026-10-10): three routes for the two UP-LA40WF (#873) that keep
# BOTH the near crane parked at z 3.20 (N463) AND the 40 W at the entry (tower-z48 or the same tower moved along the entry wall):
#   (a) the FOH riser moved out from under the fan (house right, x + dx);
#   (b) the fan narrowed: #873's rule tube is 0.8 deg = 0.3 deg controller zone (the hard-stop aperture mask, pan AND tilt) + 0.5 deg
#       mount tolerance (review B2); the body tube 1.008 deg. Two readings: zone only (the mask), and the total;
#   (c) the tower moved along the entry wall (the mount x; z 48 and the 0.7 m T-bar kept).
#
#   python3 -B scripts/place/moxir_v2_forty_routes.py --repo . bound            # the analytic bound, itemized (the 5.86 etc.)
#   python3 -B scripts/place/moxir_v2_forty_routes.py --repo . run a2.5,b0.15  # searches; JSON on stdout, progress on stderr
#   python3 -B scripts/place/moxir_v2_forty_routes.py --repo . diag <variant> <y> <xa> <ya> <xb> <yb>   # the 12 worst rows of one layout
#
# METHOD, unchanged from round 2 (moxir_v2_forty_reaim.py): #873's search (two units 0.7 m apart on one T-bar, one height, both far-wall
# ends free), the compass search of Hooke & Jeeves (J. ACM 8(2) 1961; Kolda, Lewis & Torczon, SIAM Review 45(3) 2003) from a grid of
# starts, maximising the WORST margin of both beams over EVERY row: the v2 Scene's levels (#873's 3.0 m over / 2.5 m beside a person
# = surface + 2.0 m), every body by the cubes' body rule (true box + 0.25, gap >= 0.25, the 40 W's own optics 10 mm + 1.3 mrad), the
# far-wall end rows, + #873's own rows (its places, the other unit, the cubes' keep-out, the far gate). The rules and margins are
# #873's and the branch's, unchanged; only the route's one change (FOH x, the fan, or the mount x) is varied.
import argparse, json, math, os, sys, time

for _k in ('OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS'):
    os.environ.setdefault(_k, '1')
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True
ap = argparse.ArgumentParser()
ap.add_argument('--repo', default='.')
ap.add_argument('cmd', choices=['bound', 'run', 'diag', 'sight'])
ap.add_argument('rest', nargs='*')
A = ap.parse_args()
sys.argv = [sys.argv[0], '--repo', A.repo]
import numpy as np
import moxir_v2_forty_reaim as FR
M, E = FR.M, FR.E

REPO = FR.REPO
ZONE, TOL = E.ZONE_DEG, E.FAN_DEG - E.ZONE_DEG          # 0.3 + 0.5 = 0.8 (#873)
BODY_EXTRA = M.FAN_BODY - M.FAN                        # 1.008 - 0.8: the body tube's extra over the rule fan (the cubes' 1.008, kept)
X0 = FR.X0                                             # -8.094, tower-z48 unit 01


def foh_index(S=None):
    pl = S.places if S is not None else E.PLACES
    return [i for i, p in enumerate(pl) if p[0] == 'FOH riser'][0]


def world(var):
    """var: one route or several joined by '+': ('a', dx) FOH riser + dx house right | ('b', fan_deg) the rule fan (body tube = fan + 0.208)
    | ('B', fan_deg) the rule fan, the body tube held at the cubes' 1.008 (the body rule unchanged) | ('c', x0) the mount x | ('base', 0)"""
    vs = var if isinstance(var, list) else [var]
    SC, extra = FR.world(3.2, 7.2)
    E.PLACE_ARR[:] = np.array([p[1:6] for p in E.PLACES], float)
    fan, fanb, x0 = E.FAN_DEG, M.FAN + BODY_EXTRA, X0
    for v in vs:
        if v[0] == 'a':
            for S in SC:
                S.parr[foh_index(S), 0:2] += v[1]
            E.PLACE_ARR[foh_index(), 0:2] += v[1]
        elif v[0] in ('b', 'B'):
            fan = v[1]
            fanb = 1.008 if v[0] == 'B' else fan + BODY_EXTRA
        elif v[0] == 'c':
            x0 = v[1]
    return SC, extra, fan, fanb, x0


STEP = [0.5]                                      # the search samples the tube every 0.5 m; the reported margin is re-taken at 0.02 m


def rows(SC, extra, p, T, other, fan, fanb):
    M.FAN, M.FAN_BODY = fan, fanb
    out = {}
    for S in SC:
        m = S.margins(p, T, step=STEP[0], optics=FR.OPT, skip_groups=('the 40 W lasers (#873 keep-out)',), extra_boxes=extra)
        for k, (v, at, g) in m.items():
            if k not in out or v < out[k]:
                out[k] = v
    _, _, mt, _ = E.margins(p, T, half=fan, step=STEP[0], others=(other,))
    for k, (v, _at) in mt.items():
        if k.startswith(FR.THEIR_KEYS):
            out['#873: ' + k] = min(v, out.get('#873: ' + k, 99.0))
    M.FAN, M.FAN_BODY = 0.8, 1.008
    return out


def layout(x0, v):
    y, xa, ya, xb, yb = v
    return np.array([x0, y, 48.0]), np.array([x0 + E.DX, y, 48.0]), np.array([xa, ya, E.END_Z]), np.array([xb, yb, E.END_Z])


def worst2(SC, extra, fan, fanb, x0, v):
    pa, pb, ta, tb = layout(x0, v)
    ra, rb = rows(SC, extra, pa, ta, pb, fan, fanb), rows(SC, extra, pb, tb, pa, fan, fanb)
    ka, kb = min(ra, key=ra.get), min(rb, key=rb.get)
    return min(ra[ka], rb[kb]), (ka, kb), ra, rb


def search(SC, extra, fan, fanb, x0, starts):
    f = lambda v: worst2(SC, extra, fan, fanb, x0, v)[0]
    best = None
    for v in starts:
        v = np.array(v, float)
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
    w, keys, ra, rb = worst2(SC, extra, fan, fanb, x0, best[1])
    both = {k: min(ra.get(k, 99), rb.get(k, 99)) for k in set(ra) | set(rb)}
    top = sorted(both.items(), key=lambda kv: kv[1])[:6]
    pa, pb, ta, tb = layout(x0, best[1])
    return {'worst_m': round(w, 3), 'apertures_m': [[round(q, 3) for q in pa], [round(q, 3) for q in pb]],
            'ends_m': [[round(q, 3) for q in ta], [round(q, 3) for q in tb]], 'binding': list(keys), 'next_rows': [[k, round(v, 3)] for k, v in top]}


def starts_for(x0):
    out = []
    for y0 in (5.0, 5.5, 6.0, 6.5):
        for ye in (6.6, 7.1, 7.6):
            out.append([y0, x0 + 0.894, ye, x0 + 1.194, ye])
    if x0 > -6.0:                                          # a mount nearer the axis: also the ends right of the far gate
        for y0 in (5.5, 6.5):
            for ye in (6.6, 7.6):
                out.append([y0, 7.0, ye, 7.3, ye])
    return out


def parse(tok):
    out = [('base', 0.0) if t == 'base' else (t[0], float(t[1:])) for t in tok.split('+')]
    return out if len(out) > 1 else out[0]


def bound():
    """the straight-line bound at x fixed, itemized from the files: what the 5.86 / 5.85 / 6.49 are made of"""
    f = E.DES['foh']
    zf = f['p'][2] + f['size_m'][1] / 2                    # 30.0, the riser's entry-side edge (nearest the mount: the lowest point of a rising line)
    s_f = 48.0 - zf
    R = lambda s, h=E.FAN_DEG: s * math.tan(math.radians(h)) + (E.APERTURE_TUBE + E.PHI * s) / 2
    cz = 3.2
    gz = cz + min(M.G['cranes'][0]['girders_dz_m']) if hasattr(M, 'G') else 2.1
    out = {'foh': {'riser_m (stage json foh.riser_m, ASSUMED)': f['riser_m'], 'person_m (PERSON_M, #873)': E.PERSON_M, 'over_m (VERT_M 3.0, IEC TR 60825-3)': E.VERT_M,
                   'fan_s_tan_0.8deg (0.3 zone + 0.5 mount tol, #873 FAN_DEG)': round(s_f * math.tan(math.radians(E.FAN_DEG)), 4),
                   'aperture_half (10 mm ASSUMED, #873)': E.APERTURE_TUBE / 2, 'divergence_s_half (1.3 mrad, fixtures.json)': round(E.PHI * s_f / 2, 4),
                   'at_z_m (the riser edge nearest the mount)': zf, 's_m': s_f},
           }
    out['foh']['sum_m'] = round(f['riser_m'] + E.PERSON_M + E.VERT_M + R(s_f), 3)
    zg = 1.75
    s_g = 48.0 - zg
    rb = E.APERTURE_TUBE / 2 + E.PHI * s_g / 2 + s_g * math.tan(math.radians(M.FAN_BODY))
    out['girder'] = {'safe_underside_m (NEAR_UNDER, photo 170604)': M.NEAR_UNDER, 'pad_m (true box + 0.25)': M.PAD, 'gap_m (LASER_GAP_MIN)': M.LASER_GAP_MIN,
                     'body_tube_m (s tan 1.008 + 5 mm + 1.3 mrad s/2)': round(rb, 4), 'at_z_m (far girder z 2.10 - 0.35)': zg, 's_m': s_g,
                     'max_m': round(M.NEAR_UNDER - M.PAD - M.LASER_GAP_MIN - rb, 3)}
    s_w = 48.0 - E.END_Z
    out['far_wall'] = {'floor + person + over': 5.0, 'tube_m': round(R(s_w), 4), 's_m': s_w, 'min_m': round(5.0 + R(s_w), 3)}
    a = (zf - zg) / (zf - E.END_Z)
    lo = (1 - a) * out['foh']['sum_m'] + a * out['far_wall']['min_m']
    out['line'] = {'lowest_y_at_girder_through_foh_and_far_wall_m': round(lo, 3), 'shortfall_m': round(out['girder']['max_m'] - lo, 3)}
    return out


HEAD_M = 1.75   # a standing head in the crowd: moxir_v1.py foh_check's figure (adult stature, ISO 7250-1 / PeopleSize order of size), kept


def sight(dxs):
    """the FOH operator's eye (stage json foh: x -5.2, z 29, eye_m 2.2 = riser 0.6 + standing eye 1.6) to the DJ: the method of moxir_v1.py
    foh_check, unchanged in kind: (1) a ray cast (Moller & Trumbore 1997) eye -> target against hall v10's triangles + the stage's boxes
    (the PA placeholders, the crowd barrier, the cut's parts, every rig lamp body, the pendant lamps); the crowd is NOT a box here:
    (2) the sight line's height over a 1.75 m standing head at the front row (the barrier z 8.2) and at the FOH's own first row,
    and the C-value at the FOH's first row the way v1 counted it ((eye - 1.75) x 0.5 m row / distance, Green Guide (SGSA) C-value form)"""
    st = M.rd(REPO, M.STAGE_V2C)
    f, b = st['foh'], st['booth']
    ev, _ = M.derive(REPO)
    seg0 = M.cut_parts(ev['truss'], M.rd(REPO, M.CUT_V2C))
    rig = M.rd(REPO, M.RIG_V2C)
    boxes = [M.obox('PA ' + x['id'], 'pa', x['x_m'], (0.0, x['h_m']), x['z_m']) for x in st['pa']['boxes']]
    bar = st['barrier']
    boxes += [M.obox('crowd barrier', 'barrier', bar['x_m'], (0.0, bar['h_m']), (bar['z_m'] - 0.04, bar['z_m'] + 0.04))]
    boxes += [M.obox(q['name'], 'rigging', (q['lo'][0], q['hi'][0]), (q['lo'][1], q['hi'][1]), (q['lo'][2], q['hi'][2])) for q in seg0[1]]
    boxes += [M.obox(q['name'], 'lamp', (q['lo'][0], q['hi'][0]), (q['lo'][1], q['hi'][1]), (q['lo'][2], q['hi'][2])) for q in M.pendant_lamps()]
    boxes += [M.obox(q['id'], 'lamp', (q['p'][0] - 0.25, q['p'][0] + 0.25), (q['p'][1] - 0.25, q['p'][1] + 0.25), (q['p'][2] - 0.25, q['p'][2] + 0.25))
              for q in rig['fixtures'] if q['type'] in M.BODY_R]
    C = M.Cast(M.GLB_V10, boxes)
    bz = b['front_z_m'] - b['depth_m'] / 2
    deck = b['deck_h_m']
    targets = {"the DJ's head (deck + 1.75)": (b['centre_x_m'], deck + 1.75), "the DJ's hands on the decks (deck + 1.0)": (b['centre_x_m'], deck + 1.0)}
    out = {}
    for dx in dxs:
        eye = np.array([f['p'][0] + dx, f['eye_m'], f['p'][2]])
        row = {}
        for k, (tx, ty) in targets.items():
            T = np.array([tx, ty, bz])
            v = T - eye
            dl = float(np.linalg.norm(v))
            t, names, cls, _mesh = C.cast(eye, v / dl, reach=dl + 1.0, tmin=0.3)
            hit = bool(np.isfinite(t[0]) and t[0] < dl - 0.3)
            yb = lambda z: eye[1] + (ty - eye[1]) * (eye[2] - z) / (eye[2] - bz)
            row[k] = {'clear_of_hall_and_rig': not hit, 'first_hit': (str(names[0]) if hit else None), 'distance_m': round(dl, 2),
                      'over_heads_at_the_barrier_m': round(yb(bar['z_m']) - HEAD_M, 3), 'over_heads_at_the_foh_first_row_m': round(yb(f['p'][2] - f['size_m'][1] / 2 - 0.5) - HEAD_M, 3)}
        row['c_value_first_row_mm (v1 form)'] = round((eye[1] - HEAD_M) * 0.5 / (f['size_m'][1] / 2 + 0.5) * 1000)
        row['riser_x_m'] = [round(f['p'][0] + dx - f['size_m'][0] / 2, 2), round(f['p'][0] + dx + f['size_m'][0] / 2, 2)]
        out['dx %+.1f' % dx] = row
    return out


def main():
    if A.cmd == 'sight':
        print(json.dumps(sight([float(q) for q in A.rest] or [0.0]), indent=1, default=str))
        return
    if A.cmd == 'bound':
        print(json.dumps(bound(), indent=1))
        return
    if A.cmd == 'diag':
        var = parse(A.rest[0])
        SC, extra, fan, fanb, x0 = world(var)
        v = [float(q) for q in A.rest[1:6]]
        w, keys, ra, rb = worst2(SC, extra, fan, fanb, x0, v)
        both = {k: min(ra.get(k, 99), rb.get(k, 99)) for k in set(ra) | set(rb)}
        for k, val in sorted(both.items(), key=lambda kv: kv[1])[:12]:
            print('%7.3f  %s' % (val, k[:150]))
        return
    res, t0 = {}, time.time()
    for tok in A.rest:
        var = parse(tok)
        SC, extra, fan, fanb, x0 = world(var)
        r = search(SC, extra, fan, fanb, x0, starts_for(x0))
        v = [r['apertures_m'][0][1], r['ends_m'][0][0], r['ends_m'][0][1], r['ends_m'][1][0], r['ends_m'][1][1]]
        STEP[0] = 0.02
        wf, kf, ra, rb = worst2(SC, extra, fan, fanb, x0, v)
        STEP[0] = 0.5
        both = {k: min(ra.get(k, 99), rb.get(k, 99)) for k in set(ra) | set(rb)}
        r.update({'worst_fine_m': round(wf, 3), 'fine_rows': [[k, round(q, 3)] for k, q in sorted(both.items(), key=lambda kv: kv[1])[:6]]})
        r.update({'route': tok, 'fan_deg': round(fan, 3), 'body_fan_deg': round(fanb, 3), 'mount_x_m': x0, 'near_crane_z_m': 3.2})
        res[tok] = r
        print('[%4.0f s] %s %s' % (time.time() - t0, tok, json.dumps(r)), file=sys.stderr, flush=True)
    print(json.dumps(res, indent=1))


if __name__ == '__main__':
    main()
