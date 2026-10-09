#!/usr/bin/env python3
# moxir_v2_eyes.py — MOXIR v2 (2026-10-09): place the hall's lights FROM THE AUDIENCE'S VIEW POSITIONS, inside the owner's
# painted hot zone (rigs/moxir-v2-zones-2026-10-09.json, read_paint.py). Used by moxir_v2_spread.py build.
#
# THE OWNER (17:42): "place the lights from view position of the audience ... ill paint what area is what". He painted a HOT ZONE
#   (x -30..25, z -31..44: the area we can use, people + light, "can be a bit wider"), two wings inside it (use: house left and
#   right), a bar (entry, house right) and a chill + food area (entry, house left). People can stand on ALL sides of the stage.
#
# METHOD (a stated design metric; it ranks places, it is not a luminance of the hall)
#   EYES: 8 standing eyes (1.7 m) spread over the hot zone — the dance floor, mid, the front edge, behind the stage, and the
#     front and back of each wing — each checked to lie inside the painted cells.
#   A PAR candidate (UP-PL5403, 15 deg, 11 000 cd EQUIVALENT) is scored by the light its lit steel sends to each eye: its cone as
#     61 equal-area rays (occlusion_lib.AREA_RINGS), each ray's flux Phi = I x dOmega landing on structure within 30 m, reflected
#     as a Lambertian surface with the hall's column albedo rho 0.2867 (hall json): E_eye = rho Phi / (pi d^2) for every hit the
#     eye sees (a cast from the eye to the hit, nothing in between; the people are not an obstacle). The view cosine is left
#     out (no surface normals here): an upper bound per hit, the same for every candidate.
#   A B380F candidate is scored per eye by G, first-order single scattering toward the eye per unit beam flux (moxir_v2_true.glow:
#     the one machine's two-zone haze at 40 min, HG g 0.74, the beam's own extinction, occlusion by the hall), along the beam to
#     its first hit. Its aim: every direction az 0..350 / el 12..78 (10 x 6 deg) that passes the rules, the best by the sum of
#     sqrt(G_eye) (balance: a beam seen a little by many beats one seen a lot by one).
#   RULES on every aim (refused if broken): no ray of the whole beam (axis + 8 at half the 1.8 deg) into people (the hot zone, the
#     bar, the chill area and the whole public half, up to 2.4 m) or glass; >= 3 m over the floor ANYWHERE (the whole floor is a
#     standing level now; the lower edge counted, 0.9 + 0.5 deg) except inside the head's own pen; no beam ending in the bar or
#     the chill area; GLARE: no eye may look down a beam — the angle between the beam and the line from any beam point to any eye
#     >= 30 deg (forward scatter: at g 0.74 HG(30 deg) is ~1/5 of HG(15 deg); layout C's lines toward the crowd whited out the floor).
#   OUT OF REACH: every new head and PAR on a column bracket (B380F base 3.0 m, PAR body 2.8 m: ISO 13857:2019 Table 2, 2.7 m).
#   SELECTION: greedy, maximising sum over eyes of sqrt(total per eye) (diminishing returns per eye, so the wings and the back are
#     not starved by the dance floor), one unit per bracket place, B380F heads >= 6 m apart.
import json, math, os, sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.dont_write_bytecode = True

ZONES = 'scripts/place/rigs/moxir-v2-zones-2026-10-09.json'
EYES = {
    'dance floor': (-3.75, 1.7, 18.1), 'mid': (-2.0, 1.7, 30.0), 'front edge': (0.0, 1.7, 40.0), 'behind the stage': (-4.0, 1.7, -20.0),
    'wing L front': (-20.0, 1.7, 14.0), 'wing L back': (-20.0, 1.7, -14.0), 'wing R front': (18.0, 1.7, 14.0), 'wing R back': (18.0, 1.7, -14.0),
}
RHO = 0.2867
PAR_I = 11000.0
PAR_BODY_Y = 2.8
B_BASE_Y = 3.0
HEAD_Y = 0.5
GLARE_DEG = 30.0
# the stage pen: the DJ's step, the pit to the barrier, backstage and the plane-1 row with the smoke machine (crew only, a barrier
# around it: OWED). v1.1's stage zone (x -10.3..-0.1, z 3.65..8.2) + backstage (x -9.4..-0.6, z -1..3.6), extended to z -7.5 for the
# plane-1 heads (z -5, pens <= 1.9 m) and the machine (z -6.2), and to x 1.5 for the pit stand.
STAGE_PEN = {'x_m': (-10.5, 1.5), 'z_m': (-7.5, 8.2)}
R3 = lambda v: round(float(v), 3)


class Zones:
    def __init__(self, repo):
        self.doc = json.load(open(os.path.join(repo, ZONES)))
        self.areas = {}
        for z in self.doc['zones']:
            self.areas.setdefault(z['id'], [])
            for a in z['areas']:
                self.areas[z['id']] += a['cells_1m']

    def inside(self, zid, x, z, margin=0.0):
        for row in self.areas[zid]:
            if abs(row['z'] - z) <= 0.5 + margin:
                for x0, x1 in row['x_runs']:
                    if x0 - margin <= x <= x1 + margin:
                        return True
        return False

    def boxes(self, S, zids=('hot', 'bar', 'chill')):
        """The people as 1 m rows up to 2.4 m (1.9 m heads + 0.5 m arms), the stage pen carved out (STAGE_PEN: crew only)."""
        out = []
        (px0, px1), (pz0, pz1) = STAGE_PEN['x_m'], STAGE_PEN['z_m']
        for zid in zids:
            for row in self.areas[zid]:
                for x0, x1 in row['x_runs']:
                    a, b = x0 - 0.5, x1 + 0.5
                    runs = [(a, b)]
                    if pz0 <= row['z'] <= pz1:
                        runs = [r for r in ((a, min(b, px0)), (max(a, px1), b)) if r[1] > r[0]]
                    for r0, r1 in runs:
                        out.append(S.OBox.aabb('people (%s)' % zid, 'audience', (r0, r1), (0.0, 2.4), (row['z'] - 0.5, row['z'] + 0.5)))
        return out


def low_over_floor(p, d, t, pen):
    """The lowest margin (lower edge - 3 m) over the floor (the whole floor stands now), the DJ step 0.4 and the FOH riser 0.6,
    outside the head's own pen (horizontal radius `pen`)."""
    lo = math.radians(0.9 + 0.5)
    worst = 1e9
    n = max(4, int(t / 0.5))
    for k in range(n + 1):
        s = t * k / n
        q = p + d * s
        if math.hypot(q[0] - p[0], q[2] - p[2]) <= pen:
            continue
        h = 0.0
        if -6.7 <= q[0] <= -3.7 and 3.65 <= q[2] <= 5.65:
            h = 0.4
        elif -6.7 <= q[0] <= -3.7 and 27.0 <= q[2] <= 31.0:
            h = 0.6
        worst = min(worst, q[1] - s * math.tan(lo) - h - 3.0)
    return worst


def pen_of(p, d):
    """Horizontal distance until the beam's lower edge is 3 m over the floor (0 for a head that starts above it)."""
    lo = math.asin(max(-1.0, min(1.0, d[1]))) - math.radians(1.4)
    if p[1] >= 3.0 + 1e-9:
        return 0.0
    if lo <= 0:
        return 99.0
    return R3((3.0 - p[1]) / math.tan(lo))


def eye_lux_from_par(W, p, d, skip):
    import occlusion_lib as O
    import occlusion_sky as S
    dirs, _ = O.cone_rays(d, 7.5, O.AREA_RINGS)
    o = np.asarray(p, float)
    t, names, cls = W.cast(o, dirs, reach=30.0, skip=skip)
    hit = np.array([c in S.STRUCT for c in cls]) & np.isfinite(t)
    omega = 2 * math.pi * (1 - math.cos(math.radians(7.5)))
    phi = PAR_I * omega / len(dirs)
    pts = o + dirs * np.where(np.isfinite(t), t, 0)[:, None]
    pts = pts[hit]
    out = {}
    for name, e in EYES.items():
        if not len(pts):
            out[name] = 0.0
            continue
        e = np.asarray(e, float)
        v = pts - e
        dist = np.linalg.norm(v, axis=1)
        u = v / dist[:, None]
        te, _, _ = W.cast(e, u, reach=float(dist.max()) + 1.0, tmin=0.3, skip=skip)
        seen = te >= dist - 0.35
        out[name] = float(np.sum(RHO * phi / (math.pi * dist[seen] ** 2)))
    return out, {'steel_pct': round(100.0 * float(hit.mean()), 1), 'ends': sorted(set(names[i] for i in np.nonzero(hit)[0]))[:4]}


def beam_glow(W, F, p, d, throw, skip, step=1.0):
    """G per eye (moxir_v2_true.glow, vectorised per eye: one cast from the eye to every sample of the beam)."""
    import moxir_v2_true as V
    p, d = np.asarray(p, float), np.asarray(d, float)
    n = max(2, int(min(throw, 60.0) / step))
    xs = np.array([p + d * (k + 0.5) * step for k in range(n)])
    sg = np.array([V.sigma_at(F, x) for x in xs])
    tau = np.cumsum(sg * step)
    out, worst = {}, 180.0
    for name, e in EYES.items():
        e = np.asarray(e, float)
        v = e - xs
        L = np.linalg.norm(v, axis=1)
        u = v / L[:, None]
        c = u @ d
        worst = min(worst, math.degrees(math.acos(max(-1.0, min(1.0, float(c.max()))))))
        te, _, _ = W.cast(e, -u, reach=float(L.max()) + 1.0, tmin=0.3, skip=skip)
        seen = te >= L - 0.4
        g = sg * np.array([V.hg(ci) for ci in c]) * np.exp(-tau) * np.exp(-F['fill'] * L) * step
        out[name] = float(np.sum(g[seen]))
    return out, worst


def bracket_places(Z, S):
    """Every column bracket in or at the edge (2 m) of the hot zone, not in the bar or the chill area: (id, column x, z, face)."""
    zs = [-30.0, -24.0, -18.0, -12.0, -6.0, 0.5, 6.0, 12.0, 18.0, 24.0, 30.0, 36.0, 42.0]
    out = []
    for s in (-1, 1):
        for z in zs:
            for face in ('nave', 'span'):
                x = s * (11.157 if face == 'nave' else 12.843)
                if not Z.inside('hot', x, z, 2.0) or Z.inside('bar', x, z, 1.0) or Z.inside('chill', x, z, 1.0):
                    continue
                out.append(('col %+d z %g %s' % (12 * s, z, face), s, x, z, face))
    return out


def place(repo, W, F, Z, taken, n_par, n_beam, log=print):
    import occlusion_sky as S
    import moxir_v2 as M
    skip = ('audience',)
    places = [b for b in bracket_places(Z, S) if b[0] not in taken]
    # ---- PAR candidates: graze its own column face (4 deg onto it) or lean 25 deg out into the roof steel over the wing/nave
    pc = []
    for pid, s, x, z, face in places:
        toward = s if face == 'nave' else -s
        for kind, lean, sign in (('graze', 4.05, toward), ('roof', 25.0, -toward)):
            a = math.radians(lean)
            d = np.array([math.sin(a) * sign, math.cos(a), 0.0])
            p = [R3(x), PAR_BODY_Y, z]
            ev, info = eye_lux_from_par(W, p, d, skip)
            pc.append({'place': pid, 'kind': kind, 'p': p, 'dir': [R3(v) for v in d], 'eyes': ev, **info})
        if len(pc) % 20 == 0:
            S.wait_cool()
    log('PAR candidates: %d' % len(pc))
    # ---- B380F candidates: a head on the bracket (base 3.0 m), the best legal aim by sum sqrt(G)
    bc = []
    D = np.array([M.dir_of(az, el) for az in range(0, 360, 10) for el in range(12, 79, 6)])
    for i, (pid, s, x, z, face) in enumerate(places):
        if i % 6 == 0:
            S.wait_cool()
        head = np.array([x + (0.3 * s if face == 'span' else -0.3 * s), B_BASE_Y + HEAD_Y, z])
        t, names, cls = W.cast(head, D, reach=120.0)
        cand = []
        for k, d in enumerate(D):
            if cls[k] == 'audience' or cls[k] in S.GLASS or cls[k] == 'lantern frame' or (names[k] or '').startswith('people'):
                continue
            tk = 120.0 if not np.isfinite(t[k]) else float(t[k])
            end = head + d * tk
            if Z.inside('bar', end[0], end[2], 0.5) or Z.inside('chill', end[0], end[2], 0.5):
                continue
            if low_over_floor(head, d, tk, 0.0) < 0:
                continue
            cand.append((k, tk))
        scored = []
        for k, tk in cand:
            g, worst = beam_glow(W, F, head, D[k], tk, skip, step=2.0)
            if worst < GLARE_DEG:
                continue
            scored.append((sum(math.sqrt(v) for v in g.values()), k, tk))
        best = None
        for sc, k, tk in sorted(scored, reverse=True)[:6]:
            chk = S.beam_check(W, head, D[k], half_deg=0.9)
            if chk['rays_into_audience'] or any('glass' in e or 'lantern frame' in e or e.startswith('people') for e in chk['ends']):
                continue
            g, worst = beam_glow(W, F, head, D[k], tk, skip, step=1.0)
            if worst < GLARE_DEG:
                continue
            best = {'place': pid, 'p': [R3(v) for v in head], 'dir': [R3(v) for v in D[k]], 'az_el': list(S.az_el(D[k])), 'throw_m': R3(tk) if tk < 120 else None,
                    'ends_on': chk['axis_ends_on'], 'eyes': g, 'glare_min_deg': R3(worst), 'rays_clear_30m_pct': chk['rays_clear_30m_pct'],
                    'lowest_over_floor_m': R3(low_over_floor(head, D[k], tk, 0.0) + 3.0)}
            break
        if best:
            bc.append(best)
    log('B380F candidates with a legal aim: %d of %d places' % (len(bc), len(places)))

    def greedy(cands, n, keyf, spacing=None):
        tot = {e: 0.0 for e in EYES}
        chosen, used = [], set()
        for _ in range(n):
            best, bi = None, None
            base = sum(math.sqrt(v) for v in tot.values())
            for i, c in enumerate(cands):
                if keyf(c) in used:
                    continue
                if spacing and any(math.hypot(c['p'][0] - o['p'][0], c['p'][2] - o['p'][2]) < spacing for o in chosen):
                    continue
                gain = sum(math.sqrt(tot[e] + c['eyes'][e]) for e in EYES) - base
                if best is None or gain > best:
                    best, bi = gain, i
            if bi is None:
                break
            c = cands[bi]
            chosen.append(dict(c, gain=R3(best)))
            used.add(keyf(c))
            for e in EYES:
                tot[e] += c['eyes'][e]
        return chosen, tot
    beams, gtot = greedy(bc, n_beam, lambda c: c['place'], spacing=6.0)
    used = {b['place'] for b in beams}
    pars, ptot = greedy([c for c in pc if c['place'] not in used], n_par, lambda c: c['place'])
    return {'eyes': EYES, 'par_candidates': pc, 'beam_candidates': bc, 'pars': pars, 'beams': beams,
            'per_eye_par_lux': {k: R3(v) for k, v in ptot.items()}, 'per_eye_beam_G': {k: round(v, 5) for k, v in gtot.items()}}
