#!/usr/bin/env python3
# occlusion_sky.py — MOXIR v2 (2026-10-09): where can a beam head stand so its beam runs clear, and how much steel does an
# uplight PAR light? The owner, 2026-10-09: "put the beams right so the look is cool and not blocked".
#
#   python3 -I scripts/place/occlusion_sky.py --repo . --out ~/Downloads/moxir/v2-layouts/occlusion   # JSON + heat maps
#   python3 -I scripts/place/occlusion_sky.py --repo . --check [--quick]                              # the numbers, JSON
#
# (occlusion.py is the 10-08 blocking pass on beta v0.9's plot; this file is the v2 pass: a beam's whole pan/tilt sky.)
#
# INPUTS (every one pinned or committed)
#   the hall: /mnt/data/footage/place-moxir-hall-v9-show-park-2026-10-08/hall.glb (sha256 GLB_SHA below), built by hall.py
#     from rigs/moxir-hall-2026-10-08-v9-show-park.hall.json (its geometry block is identical to the GLB's own hall.json,
#     checked 2026-10-09): the columns (shaft, flared head, upper column), 3656 space-frame members, the roof deck, the
#     lantern glazing, both runway girders per row, BOTH cranes at their v1.1 show park (near z 0.15, far z -41), the press,
#     the machines, the walls, the 25 pendant-lamp envelopes. 55 872 triangles, each NAMED by occlusion_lib.Obstacles.
#   the rig's own solids at v1.1 (rigs/moxir-epic-v1-1-2026-10-08.json + the cut as stage-line.mjs derives it on
#     rigs/moxir-stage-v1-1-2026-10-08.json): the cut (12 m H30V, 0.29 m box, ends x -11.04 at 2.89 m and x 0.55 at 6.00 m
#     bottom chord, plane z 0.15), its 3 picks (bridle + hoist envelopes), the DJ step + the DJ, the organiser's speaker
#     placeholders, the barrier, the FOH riser. The v1.1 ash wall (the stage-ward lasers' stop) is LEFT OUT: the owner moved
#     all 6 cubes to the free crane on 10-09 (ledger N416), so the stage no longer needs that panel (ASSUMED until the laser
#     session's table says otherwise).
#   the audience: the brief's model, a solid volume over the v1.1 dance floor (x -11.0..3.5, z 8.2..28.0) up to 1.9 m (heads)
#     + 0.5 m (raised arms) = 2.4 m. A beam that enters it is a beam INTO the crowd: blocked.
#
# METHOD
#   A B380F's sky: its pan 540 deg / tilt 270 deg (maker, fixtures-exact.md) reach every direction of the upper hemisphere from
#   a base-down head, so the sky is the hemisphere above the head's tilt axis (0.5 m over its base, ASSUMED from the 690 mm
#   body). N directions on it with EQUAL solid angle each (Fibonacci lattice on the sphere, sin(elevation) uniform: Gonzalez,
#   "Measurement of areas on a sphere using Fibonacci and latitude-longitude lattices", Math. Geosci. 42, 2010), each cast to its
#   FIRST hit: ray/triangle Moller & Trumbore (J. Graphics Tools 2(1), 1997), written as matrix products over all rays at once
#   (det = D.(E2xE1), u = D.(E2xs)/det, v = D.(sxE1)/det, t = E2.(sxE1)/det, s = o - V0); ray/box the slab method (Kay &
#   Kajiya 1986). Per position: the share of the sky whose first hit is >= 30 m away ("clear"), the share that ends in the
#   roof steel (space frame, deck, lantern frame) before 30 m, the share blocked by anything else (named: which element), the
#   share that escapes through glass, and the 3 longest throws (azimuth, elevation, metres, what ends them).
#   A 1.8 deg beam is narrower than the lattice step (~4 deg at N=1200): the shares are shares of the SKY, not of one beam; the
#   chosen aims of a layout are checked again beam by beam (axis + a ring at half the beam angle, as occlusion.py).
#   A PAR uplight (UP-PL5403): its 15 deg standard lens (fixtures-exact.md; 25 deg optional, and which lens the rental's units
#   carry is UNKNOWN: both are computed) as 61 rays over equal areas of the cone (occlusion_lib.AREA_RINGS), first hit within
#   the maker's 30 m throw. Lit steel = the rays that end on concrete or steel structure; on a column, the lit LENGTH is the
#   height range those rays land on. Illuminance on the steel E = I / d^2 at each hit (normal incidence, an upper bound),
#   I = 11 000 cd for 15 deg (the EQUIVALENT 11 000 lx at 1 m, full white, an upper estimate: fixtures-exact.md) and
#   11 000 x (15/25)^2 = 3 960 cd for 25 deg (the same flux in the wider cone; ASSUMED scaling).
#   Positions: a grid over the zones the owner allowed (2026-10-09): behind / around the DJ, the column bases, the far end and
#   the entry end, and the machine tops that can carry a head (machine line 2.4 m, press crown 5.6 m, drum tank 3.0 m; NOT the
#   oil transformer, the electrical cabinets, the ducts or the gallery). Each says whether it stands in or within 2 m of the
#   crowd (a pen + steward then).
import argparse, hashlib, json, math, os, re, subprocess, sys, time
from concurrent.futures import ProcessPoolExecutor

# HEAT (owner's rule, 2026-10-09: the CPU package reached 98 C): one BLAS thread per process, at most 2 processes, and wait
# while the package is above 85 C before a heavy run.
for _k in ('OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS'):
    os.environ.setdefault(_k, '1')

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.dont_write_bytecode = True
import numpy as np

GLB = '/mnt/data/footage/place-moxir-hall-v9-show-park-2026-10-08/hall.glb'
GLB_SHA = 'aac5cf55b4cc2e99e903d267e2152c76090505f15a888963e3950ce6d038bda2'
HALL = 'scripts/place/rigs/moxir-hall-2026-10-08-v9-show-park.hall.json'
RIG11 = 'scripts/place/rigs/moxir-epic-v1-1-2026-10-08.json'
STAGE11 = 'scripts/place/rigs/moxir-stage-v1-1-2026-10-08.json'

# The cut at v1.1, as stage-line.mjs stageLineRig derives it on STAGE11 (run 2026-10-09; the test re-derives it).
CUT = {'z_m': 0.15, 'ends': [(-11.04, 2.89), (0.55, 6.00)], 'section_m': 0.29,
       'picks': [(-10.59, 4.16), (-5.52, 5.52), (0.03, 7.01)], 'girder_bottom_m': 7.6}
# The FREE (far) crane carries all 6 LaserCubes (owner 2026-10-09, N416). Its underside is unmeasured: the near crane's 7.6 m
# is the EQUIVALENT (coordinator 10-09; the hall file still draws it at 7.95 from photo 007). A beam must not graze the bridge or
# the cubes hung under it: the envelope runs from 0.3 m under the cubes (bottom ~7.2 m: a 155 mm body + clamp) to the girder top.
FAR_CRANE_HANG = {'z_m': -41.0, 'x_m': (-11.35, 11.35), 'y_m': (6.9, 8.75), 'dz_m': 1.45, 'underside_m': 7.6,
                  'why': 'far crane bridge + the 6 cubes under it, underside 7.6 m EQUIVALENT (near crane), 0.3 m margin under the cubes'}
AUDIENCE = {'x_m': (-11.0, 3.5), 'z_m': (8.2, 28.0), 'y_m': (0.0, 2.4), 'why': 'heads 1.9 m + raised arms 0.5 m over the v1.1 dance floor (the brief)'}
HEAD_Y = 0.5          # a B380F's tilt axis over its base (ASSUMED: 690 mm body, the yoke's axis about 2/3 up)
CLEAR_M = 30.0
PAR_CD = {15: 11000.0, 25: 11000.0 * (15 / 25) ** 2}
PAR_THROW = 30.0
ROOF = {'space frame', 'roof deck', 'lantern frame'}
GLASS = {'lantern glass', 'wall glass'}
STRUCT = {'column', 'column head', 'upper column', 'space frame', 'roof deck', 'lantern frame', 'runway', 'crane', 'steel', 'end wall', 'side wall', 'block wall'}
R3 = lambda v: round(float(v), 3)


MAX_WORKERS = 2
HOT_C = 85.0


def package_c():
    try:
        out = subprocess.run(['sensors'], capture_output=True, text=True, timeout=10).stdout
    except (OSError, subprocess.SubprocessError):
        return None
    m = re.search(r'Package id 0:\s*\+?([0-9.]+)', out)
    return float(m.group(1)) if m else None


def wait_cool(limit=HOT_C, say=lambda m: print(m, file=sys.stderr)):
    while True:
        c = package_c()
        if c is None or c <= limit:
            return c
        say('CPU package %.0f C > %.0f C: waiting 20 s (heat rule)' % (c, limit))
        time.sleep(20)


def sha256(p):
    h = hashlib.sha256()
    with open(p, 'rb') as fh:
        for b in iter(lambda: fh.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()


# ------------------------------------------------------------------ boxes (oriented), vectorised slab test
class OBox:
    def __init__(self, name, cls, centre, half, R=None):
        self.name, self.cls = name, cls
        self.c, self.h = np.asarray(centre, float), np.asarray(half, float)
        self.R = np.eye(3) if R is None else np.asarray(R, float)     # columns = the box's axes in the hall frame

    @staticmethod
    def aabb(name, cls, x, y, z):
        return OBox(name, cls, [(x[0] + x[1]) / 2, (y[0] + y[1]) / 2, (z[0] + z[1]) / 2], [(x[1] - x[0]) / 2, (y[1] - y[0]) / 2, (z[1] - z[0]) / 2])

    def hits(self, o, D, tmin):
        lo = (np.asarray(o, float) - self.c) @ self.R
        ld = D @ self.R
        with np.errstate(divide='ignore', invalid='ignore'):
            ta = (-self.h - lo) / ld
            tb = (self.h - lo) / ld
        t0 = np.nanmax(np.where(np.isnan(ta), -np.inf, np.minimum(ta, tb)), axis=1)
        t1 = np.nanmin(np.where(np.isnan(tb), np.inf, np.maximum(ta, tb)), axis=1)
        par = np.abs(ld) < 1e-12                                       # parallel to a slab: inside it or never
        out = np.any(par & ((lo < -self.h) | (lo > self.h)), axis=1)
        t = np.where((t0 <= t1) & (t1 >= tmin) & ~out, np.maximum(t0, tmin), np.inf)
        return t

    def inside(self, q):
        lq = (np.asarray(q, float) - self.c) @ self.R
        return bool(np.all(np.abs(lq) <= self.h + 1e-9))


def cut_boxes():
    (xa, ya), (xb, yb) = CUT['ends']
    s = CUT['section_m']
    a = np.array([xa, ya + s / 2, CUT['z_m']])
    b = np.array([xb, yb + s / 2, CUT['z_m']])
    u = (b - a) / np.linalg.norm(b - a)
    R = np.column_stack([u, np.cross([0, 0, 1.0], u), [0, 0, 1.0]])
    out = [OBox('the cut (H30V truss)', 'truss', (a + b) / 2, [np.linalg.norm(b - a) / 2, s / 2, s / 2], R)]
    for i, (x, apex) in enumerate(CUT['picks']):
        out.append(OBox.aabb('cut pick %d (bridle + hoist)' % (i + 1), 'rigging', (x - 0.25, x + 0.25), (apex - 0.85, CUT['girder_bottom_m']), (CUT['z_m'] - 0.8, CUT['z_m'] + 0.8)))
    return out


def rig_boxes(repo, keep_ash_wall=False):
    rig = json.load(open(os.path.join(repo, RIG11)))
    st = json.load(open(os.path.join(repo, STAGE11)))
    out = cut_boxes()
    for s in rig['solids']:
        if s['id'] == 'rig-ash-wall' and not keep_ash_wall:
            continue
        if s['id'] == 'rig-tower-cube6':
            continue                                                  # cube 6's tower goes: every cube is on the far crane (N416)
        (x, y, z), (sx, sy, sz) = s['p'], s['s']
        cls = 'pa' if s['id'].startswith('rig-pa-') else {'rig-crowd-barrier': 'barrier', 'rig-foh-riser': 'foh', 'rig-ash-wall': 'ash wall'}.get(s['id'], 'stage')
        out.append(OBox.aabb(s['id'].replace('rig-', ''), cls, (x - sx / 2, x + sx / 2), (y, y + sy), (z - sz / 2, z + sz / 2)))
    b = st['booth']
    cx, fz, d = b['centre_x_m'], b['front_z_m'], b['depth_m']
    out.append(OBox.aabb('the DJ step', 'booth', (cx - b['width_m'] / 2, cx + b['width_m'] / 2), (0, b['deck_h_m']), (fz - d, fz)))
    out.append(OBox.aabb('the DJ', 'dj', (cx - 0.9, cx + 0.9), (b['deck_h_m'], b['deck_h_m'] + 2.0), (fz - d + 0.1, fz - 0.2)))
    a = AUDIENCE
    out.append(OBox.aabb('the audience (1.9 m + 0.5 m arms)', 'audience', a['x_m'], a['y_m'], a['z_m']))
    f = FAR_CRANE_HANG
    out.append(OBox.aabb('far crane + the 6 cubes (laser hang)', 'crane', f['x_m'], f['y_m'], (f['z_m'] - f['dz_m'], f['z_m'] + f['dz_m'])))
    return out


# ------------------------------------------------------------------ the world
class World:
    def __init__(self, repo, glb=GLB, any_glb=False, keep_ash_wall=False):
        if not any_glb and sha256(glb) != GLB_SHA:
            raise SystemExit('%s is not the pinned v9-show-park GLB (sha256 differs); --any-glb to run anyway' % glb)
        import occlusion_lib as O
        import lights_beta_options as L
        H = json.load(open(os.path.join(repo, HALL)))
        self.G = G = H['geometry']
        cr = []
        for c in G['cranes']:
            w = c['girder_w_m'] / 2
            cr += [L.Box.aabb('crane z %g girder' % c['z_m'], (-G['crane_rail_x_m'], G['crane_rail_x_m']), (c['girder_bottom_m'], c['girder_top_m']), (c['z_m'] + dz - w, c['z_m'] + dz + w), 'crane') for dz in c['girders_dz_m']]
            for k in ('trolley', 'cab'):
                q = c[k]
                cr.append(L.Box.aabb('crane z %g %s' % (c['z_m'], k), q['x_m'], q['y_m'], (c['z_m'] + q['dz_m'][0], c['z_m'] + q['dz_m'][1]), 'crane'))
        dummy = L.Box('none', [0, -100, 0], [0.01, 0.01, 0.01])
        ob = O.Obstacles(glb, G, [], dummy, cr)
        self.labels, self.lcls = ob.labels, ob.lcls
        self.lab = ob.lab
        self.cls = np.array(ob.lcls)[ob.lab]
        self.V0, self.E1, self.E2 = ob.V0.astype(np.float64), ob.E1.astype(np.float64), ob.E2.astype(np.float64)
        self.C, self.Rr = ob.C, ob.R
        self.A = np.cross(self.E2, self.E1)                            # det = D . A
        self.n_tris = len(self.V0)
        self.boxes = rig_boxes(repo, keep_ash_wall)
        self.classes = {c: int((self.cls == c).sum()) for c in sorted(set(self.cls))}

    def cast(self, o, D, reach=CLEAR_M, tmin=0.3, skip=()):
        """First hit of every ray in D (n x 3, unit) from o: (t [inf = nothing within reach], name list, class list)."""
        o = np.asarray(o, float)
        D = np.asarray(D, float)
        n = len(D)
        near = np.nonzero(np.linalg.norm(self.C - o, axis=1) - self.Rr <= reach)[0]
        best = np.full(n, np.inf)
        who = np.full(n, -1, dtype=np.int64)
        for k in range(0, len(near), 3000):
            idx = near[k:k + 3000]
            s = o - self.V0[idx]
            A, B, Q = self.A[idx], np.cross(self.E2[idx], s), np.cross(s, self.E1[idx])
            tn = np.einsum('ij,ij->i', self.E2[idx], Q)
            det = D @ A.T
            ok = np.abs(det) > 1e-12
            inv = np.where(ok, 1.0 / np.where(ok, det, 1.0), 0.0)
            u = (D @ B.T) * inv
            v = (D @ Q.T) * inv
            t = tn[None, :] * inv
            hit = ok & (u >= -1e-9) & (v >= -1e-9) & (u + v <= 1 + 1e-9) & (t > tmin) & (t < reach)
            t = np.where(hit, t, np.inf)
            j = np.argmin(t, axis=1)
            tj = t[np.arange(n), j]
            better = tj < best
            best[better] = tj[better]
            who[better] = idx[j[better]]
        names = [None] * n
        clss = [None] * n
        for i in np.nonzero(who >= 0)[0]:
            names[i] = self.labels[self.lab[who[i]]]
            clss[i] = self.lcls[self.lab[who[i]]]
        for b in self.boxes:
            if b.name in skip or b.cls in skip:
                continue
            tb = b.hits(o, D, tmin)
            better = (tb < best) & (tb < reach)
            for i in np.nonzero(better)[0]:
                best[i], names[i], clss[i] = tb[i], b.name, b.cls
        return best, names, clss


# ------------------------------------------------------------------ directions
def hemisphere(n, el_min_deg=0.0):
    """n directions, equal solid angle each, elevation >= el_min (Fibonacci lattice; sin(el) uniform)."""
    s0 = math.sin(math.radians(el_min_deg))
    i = np.arange(n) + 0.5
    sy = s0 + (1 - s0) * i / n
    az = (i * math.pi * (3 - math.sqrt(5))) % (2 * math.pi)
    c = np.sqrt(1 - sy ** 2)
    return np.column_stack([c * np.sin(az), sy, c * np.cos(az)])     # az 0 = +z (toward the entry), 90 = +x (house right)


def az_el(d):
    return R3(math.degrees(math.atan2(d[0], d[2])) % 360), R3(math.degrees(math.asin(max(-1, min(1, d[1])))))


# ------------------------------------------------------------------ the B380F sky of one position
def sky(W, p, n=1200, skip=()):
    D = hemisphere(n)
    o = np.array([p[0], p[1] + HEAD_Y, p[2]])
    t, names, cls = W.cast(o, D, reach=CLEAR_M, skip=skip)
    clear = ~np.isfinite(t)
    roof = np.array([c in ROOF for c in cls]) & ~clear
    glass = np.array([c in GLASS for c in cls]) & ~clear
    blocked = ~clear & ~roof & ~glass
    by = {}
    for i in np.nonzero(blocked)[0]:
        k = cls[i] if cls[i] in ('audience', 'truss', 'rigging', 'crane', 'machine', 'column', 'column head', 'upper column', 'runway', 'dj', 'booth', 'pa', 'barrier', 'foh', 'floor', 'end wall', 'side wall', 'block wall', 'steel', 'stage') else 'other'
        by[k] = by.get(k, 0) + 1
    names_by = {}
    for i in np.nonzero(blocked)[0]:
        names_by[names[i]] = names_by.get(names[i], 0) + 1
    # the longest throws: the clear rays cast again to the end of the building
    long = []
    ci = np.nonzero(clear)[0]
    if len(ci):
        t2, n2, c2 = W.cast(o, D[ci], reach=140.0, skip=skip)
        order = np.argsort(-t2)
        picked = []
        for k in order:
            d = D[ci[k]]
            if any(float(d @ q) > math.cos(math.radians(12)) for q in picked):
                continue                                               # distinct throws, >= 12 deg apart
            picked.append(d)
            a, e = az_el(d)
            long.append({'az_deg': a, 'el_deg': e, 'm': R3(t2[k]) if np.isfinite(t2[k]) else None, 'ends_on': n2[k]})
            if len(long) == 3:
                break
    pct = lambda m: round(100.0 * float(np.sum(m)) / n, 1)
    return {'clear_pct': pct(clear), 'roof_pct': pct(roof), 'glass_pct': pct(glass), 'blocked_pct': pct(blocked),
            'blocked_by_pct': {k: round(100.0 * v / n, 1) for k, v in sorted(by.items(), key=lambda kv: -kv[1])},
            'top_blockers': [{'what': k, 'pct': round(100.0 * v / n, 1)} for k, v in sorted(names_by.items(), key=lambda kv: -kv[1])[:4]],
            'longest': long, 'rays': n}


def beam_check(W, p, d, half_deg=0.9, reach=140.0, skip=()):
    """One aimed beam: axis + a ring of 8 at half the beam angle; the first hit of each."""
    import occlusion_lib as O
    dirs, _ = O.cone_rays(d, half_deg, O.SPEC_RINGS)
    o = np.asarray(p, float)
    t, names, cls = W.cast(o, dirs, reach=reach, skip=skip)
    return {'axis_m': R3(t[0]) if np.isfinite(t[0]) else None, 'axis_ends_on': names[0], 'axis_cls': cls[0],
            'min_m': R3(np.min(t)) if np.isfinite(np.min(t)) else None,
            'rays_clear_30m_pct': round(100.0 * float(np.mean(t >= CLEAR_M)), 1),
            'rays_into_audience': int(sum(c == 'audience' for c in cls)),
            'ends': sorted(set(n for n in names if n))}


# ------------------------------------------------------------------ PAR uplights on steel
def par_on_steel(W, p, d, lens_deg=15, skip=()):
    import occlusion_lib as O
    dirs, _ = O.cone_rays(d, lens_deg / 2, O.AREA_RINGS)
    o = np.asarray(p, float)
    t, names, cls = W.cast(o, dirs, reach=PAR_THROW, skip=skip)
    st = np.array([c in STRUCT for c in cls]) & np.isfinite(t)
    pts = o + dirs * np.where(np.isfinite(t), t, 0)[:, None]
    col = [i for i in range(len(dirs)) if st[i] and cls[i] in ('column', 'column head', 'upper column')]
    roof = [i for i in range(len(dirs)) if st[i] and cls[i] in ROOF]
    I = PAR_CD[lens_deg]
    lux = [I / t[i] ** 2 for i in np.nonzero(st)[0]]
    return {'lens_deg': lens_deg, 'steel_pct': round(100.0 * float(np.mean(st)), 1),
            'column_lit_m': [R3(min(pts[i][1] for i in col)), R3(max(pts[i][1] for i in col))] if col else None,
            'column_lit_length_m': R3(max(pts[i][1] for i in col) - min(pts[i][1] for i in col)) if col else 0.0,
            'roof_pct': round(100.0 * len(roof) / len(dirs), 1),
            'lux_on_steel': [R3(min(lux)), R3(float(np.median(lux))), R3(max(lux))] if lux else None,
            'mean_d_m': R3(float(np.mean(t[st]))) if st.any() else None,
            'ends': sorted(set(names[i] for i in np.nonzero(st)[0]))[:6]}


# ------------------------------------------------------------------ the candidate grid (the owner's zones, 2026-10-09)
def candidates(G, quick=False):
    out = []
    a = AUDIENCE

    def crowd(x, z):
        inside = a['x_m'][0] <= x <= a['x_m'][1] and a['z_m'][0] <= z <= a['z_m'][1]
        near = a['x_m'][0] - 2 <= x <= a['x_m'][1] + 2 and a['z_m'][0] - 2 <= z <= a['z_m'][1] + 2
        return 'in the crowd' if inside else ('within 2 m of the crowd' if near else 'out of the crowd')

    def massing_at(x, z, y):
        return [m['id'] for m in G['massing'] if m['x_m'][0] - 0.35 <= x <= m['x_m'][1] + 0.35 and m['z_m'][0] - 0.35 <= z <= m['z_m'][1] + 0.35 and m['y_m'][0] < y + 0.7 and m['y_m'][1] > y]

    step = 2.0 if quick else 1.0
    # 1. behind / around the DJ (backstage x -10..-0.5, z -6..3.5: behind the near crane's back girder too; the stage wings
    #    x -10.5..-8.5 and -2..0, z 3.6..7.5)
    for x in np.arange(-10.0, -0.4, step):
        for z in np.arange(-6.0, 3.6, step):
            out.append(('behind the DJ', R3(x), 0.0, R3(z)))
    for x in (-10.4, -9.4, -1.4, -0.4):
        for z in (4.0, 5.5, 7.0):
            out.append(('beside the DJ', x, 0.0, z))
    # 2. the column bases: every nave column, on its nave face and its side-span face, 1.0 m toward the stage (-z) of it
    for gz in sorted(set(G['column_grid_z_m'])):
        if abs(gz) < 1:
            continue
        for sx in (-1, 1):
            for off, face in ((1.2, 'nave face'), (-1.2, 'side-span face')):
                x = sx * (12.0 - off)
                out.append(('column base (%s)' % face, R3(x), 0.0, R3(gz - 1.0 if gz > 0 else gz + 1.0)))
    # 3. the far end (behind the stage, the depth) and the entry end
    for x in np.arange(-10.0, 10.1, 2.5 if not quick else 5.0):
        out.append(('far end', R3(x), 0.0, -52.0))
        out.append(('entry end', R3(x), 0.0, 51.0))
    # 4. the machine tops that can carry a head (strapped, a rigger's check): the machine line, the press crown, the drum tank
    for x in (4.0, 5.5, 7.0, 8.5, 10.0):
        out.append(('machine line top', x, 2.4, 1.0))
    out.append(('press crown top', 1.9, 5.6, 1.7))
    out.append(('drum tank top', 9.5, 3.0, 25.0))
    res = []
    for zone, x, y, z in out:
        if y == 0.0:
            hit = massing_at(x, z, 0.0)
            if hit:
                continue                                               # a floor spot inside a machine: not a place
        res.append({'zone': zone, 'p': [x, y, z], 'crowd': crowd(x, z)})
    return res


_W = None


def _init(repo, quick):
    global _W
    _W = World(repo)


def _one(args):
    c, n = args
    r = sky(_W, c['p'], n=n)
    return dict(c, **r)


def par_cases(W):
    """PAR uplights: a nave column's foot (aimed straight up its face, and leaned 12 deg toward the hall's depth through the
    steel), a side-span column, the roof straight up from the floor, and from the cut's top chord."""
    G = W.G
    cases = []
    for gz in (-12.0, -24.0, -36.0, -48.0, 12.0):
        for name, d in (('up the column face', [0.0707, 0.9975, 0.0]), ('leaned 12 deg along the hall', [0.0707, math.cos(math.radians(12)), -math.sin(math.radians(12))])):
            v = np.array(d) / np.linalg.norm(d)
            cases.append(('nave column x -12 z %g: %s' % (gz, name), [-11.157, 0.31, gz], [-v[0], v[1], v[2]]))
    cases.append(('side-span wall column x -36 z -24: up the face', [-34.9, 0.31, -24.0], [0.122, 0.9925, 0.0]))
    cases.append(('floor, straight up to the roof steel (x -6, z -20)', [-6.0, 0.31, -20.0], [0, 1.0, 0]))
    cases.append(('the cut top chord, straight up (x -5, 4.9 m)', [-5.0, 4.9, 0.15], [0, 1.0, 0]))
    out = []
    for name, p, d in cases:
        d = np.asarray(d, float) / np.linalg.norm(d)
        row = {'case': name, 'p': p, 'aim': [R3(v) for v in d]}
        for lens in (15, 25):
            row['lens_%d' % lens] = par_on_steel(W, p, d, lens, skip=('truss',) if 'cut' in name else ())
        out.append(row)
    return out


def run(repo, n=1200, quick=False, workers=MAX_WORKERS):
    workers = min(workers, MAX_WORKERS)
    wait_cool()
    W = World(repo)
    cands = candidates(W.G, quick)
    if quick:
        n = 400
    with ProcessPoolExecutor(max_workers=workers, initializer=_init, initargs=(repo, quick)) as ex:
        rows = list(ex.map(_one, [(c, n) for c in cands], chunksize=4))
    pars = par_cases(W)
    return W, {'tool': 'scripts/place/occlusion_sky.py', 'glb': GLB, 'glb_sha256': GLB_SHA, 'triangles': W.n_tris,
               'classes': W.classes, 'boxes': [b.name for b in W.boxes], 'audience': AUDIENCE, 'clear_m': CLEAR_M,
               'rays_per_position': n, 'positions': rows, 'pars': pars,
               'zones': sorted(set(r['zone'] for r in rows))}


# ------------------------------------------------------------------ pictures
def heat_pictures(R, G, out):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.patches import Rectangle
    rows = R['positions']
    os.makedirs(out, exist_ok=True)
    cmap = plt.get_cmap('inferno')

    def base(ax, xr, zr):
        ax.set_facecolor('#111214')
        for x in G['rows_x_m']:
            for z in sorted(set(G['column_grid_z_m'])):
                if xr[0] - 1 <= x <= xr[1] + 1:
                    ax.add_patch(Rectangle((x - 0.25, z - 0.4), 0.5, 0.8, color='#7d828a', zorder=2))
        for m in G['massing']:
            if m['id'].startswith('pendant'):
                continue
            (x0, x1), (z0, z1) = m['x_m'], m['z_m']
            ax.add_patch(Rectangle((x0, z0), x1 - x0, z1 - z0, fc='#3b342c', ec='#7a6a58', lw=0.5, zorder=2))
        for c in G['cranes']:
            ax.add_patch(Rectangle((-11.35, c['z_m'] - 1.45), 22.7, 2.9, fc='#d8b400', alpha=0.25, ec='#d8b400', zorder=2))
            ax.text(-11.2, c['z_m'] + 1.7, 'crane z %g' % c['z_m'], color='#ffe066', fontsize=6, zorder=6)
        a = AUDIENCE
        ax.add_patch(Rectangle((a['x_m'][0], a['z_m'][0]), a['x_m'][1] - a['x_m'][0], a['z_m'][1] - a['z_m'][0], fill=False, ec='#3b6cff', lw=1.2, ls='--', zorder=3))
        ax.text(a['x_m'][0] + 0.3, a['z_m'][1] - 1.2, 'dance floor (audience 2.4 m)', color='#7f9cff', fontsize=7, zorder=6)
        (xa, ya), (xb, yb) = CUT['ends']
        ax.plot([xa, xb], [CUT['z_m'], CUT['z_m']], color='#ffb08a', lw=2.5, zorder=4)
        ax.text(xa, CUT['z_m'] - 1.6, 'the cut', color='#ffb08a', fontsize=7, zorder=6)
        ax.add_patch(Rectangle((-6.7, 3.65), 3.0, 2.0, fc='#2fbf5a', alpha=0.6, zorder=4))
        ax.text(-6.6, 6.0, 'DJ', color='#6fe08f', fontsize=7, zorder=6)
        ax.set_xlim(*xr)
        ax.set_ylim(*zr)
        ax.set_aspect('equal')
        ax.tick_params(colors='#9aa0a8', labelsize=7)
        ax.set_xlabel('x (m): house left - / + house right', color='#9aa0a8', fontsize=8)
        ax.set_ylabel('z (m): + toward the entry', color='#9aa0a8', fontsize=8)

    for key, title in (('clear_pct', 'B380F: share of its sky that runs clear for >= 30 m'), ('roof_pct', 'B380F: share of its sky that ends in the roof steel (< 30 m)'), ('blocked_pct', 'B380F: share of its sky blocked (columns, cranes, machines, rig, audience)')):
        fig, ax = plt.subplots(figsize=(9, 19), dpi=120)
        fig.patch.set_facecolor('#0b0c0e')
        base(ax, (-16, 16), (-56, 56))
        xs = [r['p'][0] for r in rows]
        zs = [r['p'][2] for r in rows]
        vs = [r[key] for r in rows]
        vmax = max(1.0, max(vs))
        sc = ax.scatter(xs, zs, c=vs, cmap=cmap, vmin=0, vmax=vmax, s=[38 if r['p'][1] > 0 else 22 for r in rows],
                        marker='s', edgecolors=['#00e5ff' if r['p'][1] > 0 else 'none' for r in rows], linewidths=0.8, zorder=5)
        cb = fig.colorbar(sc, ax=ax, fraction=0.03, pad=0.02)
        cb.ax.tick_params(colors='#9aa0a8', labelsize=7)
        cb.set_label('% of the sky', color='#9aa0a8')
        best = sorted(rows, key=lambda r: -r[key])[:6]
        for r in best:
            ax.annotate('%.0f%%' % r[key], (r['p'][0], r['p'][2]), color='#ffffff', fontsize=6, xytext=(4, 2), textcoords='offset points', zorder=7)
        ax.set_title(title + '\n(top view; cyan edge = a machine top; %d positions x %d rays; hall v9-show-park + the v1.1 rig)' % (len(rows), R['rays_per_position']), color='#e8e4dc', fontsize=9)
        fig.savefig(os.path.join(out, 'heat-plan-%s.png' % key.replace('_pct', '')), facecolor=fig.get_facecolor(), bbox_inches='tight')
        plt.close(fig)
    # section: z along, the head's height up; one marker per position, the clear share as colour; the obstacles' heights drawn
    fig, ax = plt.subplots(figsize=(19, 6), dpi=120)
    fig.patch.set_facecolor('#0b0c0e')
    ax.set_facecolor('#111214')
    ax.axhline(G['truss_bottom_m'], color='#7d828a', lw=1)
    ax.text(-55, G['truss_bottom_m'] + 0.2, 'space frame bottom chord 10.8 m', color='#9aa0a8', fontsize=7)
    ax.axhspan(G['runway_bottom_m'], G['runway_top_m'], color='#6b6f75', alpha=0.4)
    ax.text(-55, G['runway_top_m'] + 0.1, 'runway girders 7.06-7.96 m', color='#9aa0a8', fontsize=7)
    for c in G['cranes']:
        ax.add_patch(Rectangle((c['z_m'] - 1.45, c['girder_bottom_m']), 2.9, c['girder_top_m'] - c['girder_bottom_m'], fc='#d8b400', alpha=0.6))
    for z in sorted(set(G['column_grid_z_m'])):
        ax.add_patch(Rectangle((z - 0.4, 0), 0.8, G['column_head']['flare_start_m'], fc='#7d828a', alpha=0.35))
        ax.add_patch(Rectangle((z - 0.95, G['column_head']['flare_start_m']), 1.9, G['column_head']['head_top_m'] - G['column_head']['flare_start_m'], fc='#7d828a', alpha=0.35))
    for m in G['massing']:
        if m['id'].startswith('pendant') or not (-12 <= (m['x_m'][0] + m['x_m'][1]) / 2 <= 12):
            continue
        ax.add_patch(Rectangle((m['z_m'][0], m['y_m'][0]), m['z_m'][1] - m['z_m'][0], m['y_m'][1] - m['y_m'][0], fc='#3b342c', ec='#7a6a58', lw=0.5))
    (xa, ya), (xb, yb) = CUT['ends']
    ax.plot([CUT['z_m'], CUT['z_m']], [ya, yb + 0.29], color='#ffb08a', lw=3)
    ax.add_patch(Rectangle((AUDIENCE['z_m'][0], 0), AUDIENCE['z_m'][1] - AUDIENCE['z_m'][0], 2.4, fill=False, ec='#3b6cff', ls='--'))
    ax.text(AUDIENCE['z_m'][0] + 0.5, 2.6, 'audience 2.4 m', color='#7f9cff', fontsize=7)
    sc = ax.scatter([r['p'][2] for r in rows], [r['p'][1] + HEAD_Y for r in rows], c=[r['clear_pct'] for r in rows], cmap=cmap, vmin=0, s=26, marker='s', zorder=5)
    cb = fig.colorbar(sc, ax=ax, fraction=0.02, pad=0.01)
    cb.ax.tick_params(colors='#9aa0a8', labelsize=7)
    cb.set_label('% of the sky clear >= 30 m', color='#9aa0a8')
    ax.set_xlim(-56, 56)
    ax.set_ylim(0, 14)
    ax.set_aspect('equal')
    ax.set_xlabel('z (m): far end (SE, behind the DJ) <- -> entry (NW)', color='#9aa0a8', fontsize=8)
    ax.set_ylabel('height (m)', color='#9aa0a8', fontsize=8)
    ax.tick_params(colors='#9aa0a8', labelsize=7)
    ax.set_title('Section along the hall: every candidate head (all x projected), coloured by its clear sky; the steel that cuts it drawn behind', color='#e8e4dc', fontsize=9)
    fig.savefig(os.path.join(out, 'heat-section-clear.png'), facecolor=fig.get_facecolor(), bbox_inches='tight')
    plt.close(fig)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', default='.')
    ap.add_argument('--out', default=None)
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--quick', action='store_true')
    ap.add_argument('--rays', type=int, default=1200)
    ap.add_argument('--workers', type=int, default=MAX_WORKERS)
    A = ap.parse_args()
    repo = os.path.abspath(os.path.expanduser(A.repo))
    W, R = run(repo, n=A.rays, quick=A.quick, workers=A.workers)
    if A.out:
        out = os.path.expanduser(A.out)
        os.makedirs(out, exist_ok=True)
        json.dump(R, open(os.path.join(out, 'occlusion-sky.json'), 'w'), indent=1)
        heat_pictures(R, W.G, out)
    if A.check or not A.out:
        json.dump(R, sys.stdout)


if __name__ == '__main__':
    main()
