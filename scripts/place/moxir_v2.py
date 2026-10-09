#!/usr/bin/env python3
# moxir_v2.py — MOXIR v2 (2026-10-09): three layouts of the fixed kit in INDUSTRIAL DEPTH, every beam placed and aimed by the
# occlusion numbers (occlusion_sky.py), written as rig files the room can build (scripts/rigbuild/epic-build.mjs --rig).
#
#   python3 -I scripts/place/moxir_v2.py --repo . [--out ~/Downloads/moxir/v2-layouts]     # rig files + checks + pictures
#   python3 -I scripts/place/moxir_v2.py --repo . --check                                    # the checks, JSON, no files
#
# THE OWNER (2026-10-09): "how much on the truss, how much on the ground. I don't want moving beams on the truss. Find what is
#   right and cool, an epic one, and put the beams right so the look is cool and not blocked." His answers: TRUSS = only the cut;
#   EPIC = INDUSTRIAL DEPTH (beams from the depth and through the steel, the structure seen in pieces, sources hidden low, dark,
#   raw, huge; NOT a commercial beam wall); ash white + ember red; ground places: behind / around the DJ, column bases, the far
#   and entry ends, on the machines where safe. KIT (fixed): 18 UP-B380F (all on the ground / machines), 50 UP-PL5403, 6
#   LaserCube Ultra MK2 (all on the FREE crane, owner 10-09 N416: their table is the laser session's, used as given), 1 smoke.
#
# METHOD (each number computed here or named)
#   Places: from the occlusion grid (occlusion_sky.py: the share of each candidate's sky that runs clear >= 30 m). A layout's
#     heads stand where that share is high in their zone, and the report carries each head's %.
#   Aims: for each head, every direction in its SECTOR (azimuth / elevation box; the layout's idea) on a 2 deg x 1.5 deg grid is
#     cast to its first hit (the same world). A direction is refused when (a) it enters the audience volume, (b) it ends in
#     glass (the beam leaves the building), or (c) anywhere over a standing area (the stage, the DJ step 0.4 m, the floor, the
#     FOH riser 0.6 m, the whole public half z >= -1) it runs lower than 3.0 m over that level (the laser rule HS(G)95 applied to
#     the 1.8 deg beams as a GLARE control; the B380F has no MPE rule: this is our choice, stricter than practice B2's
#     HYPOTHESIS ">= 20 deg tilt within 30 m of the crowd"). Of the rest the LONGEST clear throw wins (to 120 m), a hit on
#     steel or concrete preferred over open air at equal length. The chosen aim is then checked as a beam (axis + a ring of 8
#     at half the 1.8 deg beam angle).
#   Pens: each head's beam is below 2.4 m (a raised hand) for its first metres; that horizontal distance is the pen it needs
#     (Purple Guide OWED; practice B10 "1 m clear" is the floor).
#   PARs: occlusion_sky.par_on_steel (15 deg standard lens, 25 deg as the alternative; the lit length of the column, the lux on
#     the steel from the EQUIVALENT 11 000 cd).
#   The cut: cut-count.mjs's recommended count and places (the 10 PARs at its clamp points), alternating DOWN / UP.
#   Power: 500 W per B380F (maker page), 200 W per PAR (the rig files' figure), 1 500 W the smoke machine (Antari Z-1500 III
#     EQUIVALENT), 120 W per cube (adapter); 16 A circuits <= 2 944 W from the nearest of v1.1's distros; cable = a
#     nearest-neighbour chain, floor Manhattan + rises + 10 % (v1.0's method); volt drop BS 7671 Table 4D2B, 2.5 mm2 = 18 mV/A/m.
#   DMX: B380F 16 ch, PAR 8 ch, smoke 1 ch; branches <= 32 devices (ANSI E1.11 / EIA-485).
import argparse, copy, json, math, os, subprocess, sys

for _k in ('OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS'):
    os.environ.setdefault(_k, '1')          # heat rule (owner 10-09): one BLAS thread

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.dont_write_bytecode = True
import numpy as np

import occlusion_sky as S

ap = argparse.ArgumentParser()
ap.add_argument('--repo', default='.')
ap.add_argument('--out', default=None)
ap.add_argument('--check', action='store_true')
ap.add_argument('--lasers', default=None, help='the laser session\'s far-crane table (aerial-far-crane.json)')
A = ap.parse_known_args()[0]
REPO = os.path.abspath(os.path.expanduser(A.repo))
J = lambda p: json.load(open(os.path.join(REPO, p)))
R3 = S.R3
JD = lambda o: o.item() if hasattr(o, 'item') else (o.tolist() if hasattr(o, 'tolist') else str(o))   # numpy scalars in JSON
ASH, EMBER, DEEP = '#e8e4dc', '#ff3a12', '#a3200c'
V11 = J(S.RIG11)
DATE = '2026-10-09'
HALF_B = math.radians(0.9)          # half of the 1.8 deg beam (maker, EXACT; definition unstated)
AIM_TOL = math.radians(0.5)         # a floor head on an unlevelled base / its focus: +-0.5 deg (ASSUMED), counted on the lower edge
STAND = [  # standing levels (x range, z range, floor height): where a beam must stay >= 3 m above
    ((-36.4, 60.4), (-1.0, 53.8), 0.0, 'the floor from the stage line to the entry (public + stage)'),
    ((-6.7, -3.7), (3.65, 5.65), 0.4, 'the DJ step'),
    ((-6.7, -3.7), (27.0, 31.0), 0.6, 'the FOH riser'),
]
CLEAR_OVER = 3.0
HAND = 2.4


def lamp_unit(d):
    return np.asarray(d, float) / np.linalg.norm(d)


def rot_for_dir(d):
    import lights_beta_options as L
    return L.rot_for_dir(d)


def dir_of(az, el):
    a, e = math.radians(az), math.radians(el)
    return np.array([math.cos(e) * math.sin(a), math.sin(e), math.cos(e) * math.cos(a)])


def low_over_standing(p, d, t):
    """The lowest margin (beam height - level - 3 m) over a standing area along the axis to t, the beam's lower edge counted
    (the axis dropped by t x tan(0.9 deg))."""
    worst = 1e9
    n = max(4, int(t / 0.5))
    for k in range(n + 1):
        s = t * k / n
        q = p + d * s
        low = q[1] - s * math.tan(HALF_B + AIM_TOL)
        for (x0, x1), (z0, z1), h, _ in STAND:
            if x0 <= q[0] <= x1 and z0 <= q[2] <= z1:
                worst = min(worst, low - h - CLEAR_OVER)
    return worst


def pen_radius(p, d):
    """Horizontal distance over which the beam's lower edge is below a raised hand (2.4 m)."""
    if d[1] <= 0:
        return None
    el = math.asin(d[1])
    lo = el - HALF_B
    if lo <= 0:
        return 99.0
    return R3((HAND - p[1]) / math.tan(lo)) if p[1] < HAND else 0.0


def best_aim(W, p, sector, prefer='long'):
    """Search the sector (az0, az1, el0, el1 deg) for the longest clear, legal throw. Returns (dir, row)."""
    az0, az1, el0, el1 = sector
    azs = np.arange(az0, az1 + 1e-6, 2.0)
    els = np.arange(el0, el1 + 1e-6, 1.5)
    D = np.array([dir_of(a % 360, e) for a in azs for e in els])
    t, names, cls = W.cast(p, D, reach=120.0)
    cand = []
    for i in range(len(D)):
        c = cls[i]
        if c == 'audience' or c in S.GLASS or c == 'lantern frame':
            continue
        ti = 120.0 if not np.isfinite(t[i]) else t[i]
        if low_over_standing(p, D[i], ti) < 0:
            continue
        score = ti + (2.0 if c in S.STRUCT else 0.0)
        if prefer == 'steep':
            score = ti * 0.3 + math.degrees(math.asin(D[i][1]))
        cand.append((score, i))
    # the best few by the axis, then the whole beam (axis + a ring of 8 at half the beam angle): no ray into the crowd or glass
    for score, i in sorted(cand, reverse=True)[:30]:
        chk = S.beam_check(W, p, D[i], half_deg=0.9)
        if chk['rays_into_audience'] or any('glass' in e or 'lantern frame' in e for e in chk['ends']):
            continue
        return D[i], {'throw_m': R3(t[i]) if np.isfinite(t[i]) else None, 'ends_on': names[i], 'end_cls': cls[i]}
    return None, {'refused': 'no legal direction in sector %s (%d axis candidates, none whose whole beam passes)' % (sector, len(cand))}


# ------------------------------------------------------------------ the cut (cut-count.mjs)
def cut_places(n):
    out = subprocess.run(['node', os.path.join(REPO, 'scripts/place/cut-count.mjs'), '--n', str(n)], capture_output=True, text=True, cwd=REPO)
    if out.returncode:
        raise SystemExit(out.stderr)
    return json.loads(out.stdout)


def cut_table():
    out = subprocess.run(['node', os.path.join(REPO, 'scripts/place/cut-count.mjs')], capture_output=True, text=True, cwd=REPO)
    if out.returncode:
        raise SystemExit(out.stderr)
    return json.loads(out.stdout)


CUT_N = 10           # the recommendation (cut-count.mjs table, the report): see RECOMMEND below
TRIM, SLOPE = 4.51, math.radians(15)
AXIS_X = -11.04 + 6.25 * math.cos(SLOPE)


def cut_pars(cc):
    out = []
    for i, u in enumerate(cc['places_u_m']):
        x = AXIS_X + u * math.cos(SLOPE)
        bot = TRIM + u * math.sin(SLOPE)
        down = i % 2 == 0
        p = [R3(x), R3(bot - 0.33 if down else bot + 0.29 + 0.1), 0.15]
        d = [0, -1.0, 0] if down else [0, 1.0, 0]
        out.append({'id': 'rig-par-cut-%02d' % (i + 1), 'type': 'up-pl5403', 'part': 'cut down' if down else 'cut up',
                    'position': 'the cut, u %+.1f m: %s' % (u, 'hung under the bottom chords, half coupler + safety, a shaft straight down' if down else 'standing on the top chords, half coupler + safety, straight up into the crane bridge\'s girders (7.6 m)'),
                    'p': p, 'dir': d, 'lens': 15})
    return out


# ------------------------------------------------------------------ the layouts
def col_up(x_side, gz, part, lean_deg=4.05):
    """A PAR at a nave column's foot, 0.44 m off its face, leaned toward it (v1.1's vista bracket, 0.0707 rad)."""
    x = 11.157 * x_side
    a = math.radians(lean_deg)
    return {'type': 'up-pl5403', 'part': part, 'p': [R3(x), 0.31, gz], 'dir': [math.sin(a) * x_side, math.cos(a), 0.0], 'lens': 15,
            'position': 'floor bracket at the nave column x %+g z %g, 0.44 m off its face, leaned %.0f deg onto it' % (12 * x_side, gz, lean_deg)}


def span_up(x_side, gz, part):
    a = math.radians(7.0)
    return {'type': 'up-pl5403', 'part': part, 'p': [R3(34.9 * x_side), 0.31, gz], 'dir': [math.sin(a) * x_side, math.cos(a), 0.0], 'lens': 15,
            'position': 'floor plate at the side span\'s wall column x %+g z %g, leaned 7 deg onto it' % (36 * x_side, gz)}


def roof_up(x, z, part):
    return {'type': 'up-pl5403', 'part': part, 'p': [x, 0.31, z], 'dir': [0, 1.0, 0], 'lens': 15,
            'position': 'floor plate, straight up into the space frame (the roof steel in pieces)'}


def v11_unit(fid, part):
    f = next(u for u in V11['fixtures'] if u['id'] == fid)
    import lights_beta_options as L
    return {'type': f['type'], 'part': part, 'p': list(f['p']), 'dir': list(L.aim_dir(f['r'])), 'lens': 15, 'position': f['position'] + ' (as v1.1)', 'from_v11': fid}


def far_wall(x, part):
    return {'type': 'up-pl5403', 'part': part, 'p': [x, 0.31, -52.6], 'dir': [0, math.cos(math.radians(14)), -math.sin(math.radians(14))], 'lens': 15,
            'position': 'floor at the far (SE) end wall, 1.2 m off it, grazing up the wall'}


EMBERS = ['rig-par-press-cut-01', 'rig-par-press-cut-02', 'rig-par-press-cut-03', 'rig-par-press-sides-01', 'rig-par-press-sides-02']
HALO = ['rig-par-neighbour-01', 'rig-par-neighbour-02', 'rig-par-columns-06', 'rig-par-neighbour-03', 'rig-par-neighbour-04']


def far_cols(zs):
    return [col_up(s, z, 'columns') for z in zs for s in (-1, 1)]


Z1 = [(x, -5.0) for x in (-8.5, -7.0, -5.5, -4.0, -2.5, -1.0)]          # behind the near crane's back girder (sky 20-24 %)
# A steep fan ACROSS the hall behind the DJ (the silhouette): the outer heads lean out to the side spans, the middle ones stand
# near vertical. Not back into the depth: the nave's glazed lantern runs x -6..6 from z -6 back, and a beam leaning back lands
# in its glass (found 10-09 run 2). Sectors (az0, az1, el0, el1): house left heads lean -x (az ~270), house right +x (~90).
Z1_FAN = [(255, 285, 46, 54), (250, 290, 58, 66), (240, 300, 72, 82), (60, 120, 72, 82), (70, 110, 58, 66), (75, 105, 46, 54)]


def z1(part, colour):
    return [{'p': [x, 0.0, z], 'part': part, 'sector': sec, 'zone': 'behind the DJ', 'colour': colour} for (x, z), sec in zip(Z1, Z1_FAN)]


def layouts():
    L = {}
    # A ---------------------------------------------------------------------------------------------------------------
    beams = z1('backlight', EMBER)
    for z in (-5.0, -11.0, -17.0, -23.0, -29.0, -35.0):
        for s in (-1, 1):
            # along its own corridor toward the depth, up through the steel; leaning a little inward (the nave's air)
            beams.append({'p': [10.8 * s, 0.0, z], 'part': 'corridors', 'sector': ((160, 195, 12, 45) if s < 0 else (165, 200, 12, 45)), 'zone': 'column base (nave face)', 'colour': ASH})
    pars = far_cols([-6.0, -12.0, -18.0, -24.0, -30.0, -36.0, -42.0, -48.0, -54.0]) + [col_up(-1, -0.5, 'columns'), col_up(1, -0.5, 'columns')]
    pars += [span_up(s, z, 'side spans') for s in (-1, 1) for z in (-12.0, -24.0, -36.0, -48.0)]
    pars += [v11_unit(f, 'embers') for f in EMBERS] + [roof_up(0.0, -47.0, 'roof')]
    pars += [roof_up(x, z, 'roof') for x, z in ((-5.0, -15.0), (5.0, -21.0), (-5.0, -27.0), (5.0, -33.0), (0.0, -9.0), (-3.0, -3.0))]
    L['corridors'] = {
        'title': 'A · The nave corridors', 'slug': 'v2-a-corridors',
        'idea': 'Twelve beams rise from the column feet down the far half and run along their own 6 m corridors into the depth, cut into pieces by the steel; six more stand low behind the DJ as his backlight. The columns glow ember from below.',
        'beams': beams, 'pars': pars,
        'smoke': {'p': [0.0, 1.0, -20.0], 'fan': {'p': [0.0, 1.0, -21.5], 'aim': 'toward the stage (+z), lowest speed'},
                  'why': 'in the middle of the corridors the beams cross (z -5..-35), on a 1 m flight case (practice: elevated); the fan pushes the cloud toward the stage so the backlight row and the first corridors read first, and the far crane\'s lasers (z -41) fly through it'},
    }
    # B ---------------------------------------------------------------------------------------------------------------
    beams = z1('plane 1 (behind the DJ)', EMBER)
    for z in (-11.0, -17.0, -23.0):
        for s in (-1, 1):
            beams.append({'p': [13.2 * s, 0.0, z], 'part': 'plane 2 (mid-hall, side spans)', 'sector': ((282, 300, 12, 40) if s < 0 else (60, 78, 12, 40)), 'zone': 'column base (side-span face)', 'colour': ASH})
    # off the artists' SE gate (4.8 m wide at x 0): heads at |x| >= 5, a 2.5 m walkway either side of the gate kept clear
    for x in (-10.0, -7.5, -5.0, 5.0, 7.5, 10.0):
        beams.append({'p': [x, 0.0, -52.0], 'part': 'plane 3 (the far end)', 'sector': (-25, 25, 15, 40), 'zone': 'far end', 'colour': EMBER})
    pars = [v11_unit(f, 'halo') for f in HALO] + [roof_up(-5.2, -2.6, 'halo')]
    pars += far_cols([-6.0, -12.0, -18.0, -24.0, -30.0, -36.0])
    pars += far_cols([-42.0, -48.0, -54.0]) + [far_wall(x, 'far wall') for x in (-6.0, -2.0, 2.0, 6.0)]
    pars += [span_up(s, z, 'side spans') for s in (-1, 1) for z in (-12.0, -24.0, -36.0, -48.0)]
    pars += [v11_unit(f, 'embers') for f in EMBERS[:4]]
    L['planes'] = {
        'title': 'B · Three planes of depth', 'slug': 'v2-b-planes',
        'idea': 'The hall read in three layers: an ember fan right behind the DJ, ash beams across the dark side spans in the middle, and an ember wall of beams rising from the far end 56 m back. The eye counts the planes into the depth.',
        'beams': beams, 'pars': pars,
        'smoke': {'p': [-8.0, 1.0, -3.0], 'fan': {'p': [-8.0, 1.0, -4.5], 'aim': 'into the depth (-z), lowest speed'},
                  'why': 'behind the stage beside D-STAGE (crew access for refills: Eter), on a 1 m case; the fan sends the cloud down the nave so plane 1 is dense and planes 2-3 thinner (the far end is read as a silhouette when the haze is thin)'},
    }
    # C ---------------------------------------------------------------------------------------------------------------
    beams = z1('backlight', EMBER)
    for z in (-11.0, -17.0, -23.0, -29.0, -35.0):
        for s in (-1, 1):
            beams.append({'p': [10.8 * s, 0.0, z], 'part': 'long lines', 'sector': ((0, 40, 3, 20) if s < 0 else (320, 360, 3, 20)), 'zone': 'column base (nave face)', 'colour': ASH})
    for x in (-5.0, 5.0):          # off the artists' SE gate (|x| >= 5)
        beams.append({'p': [x, 0.0, -52.0], 'part': 'the spine', 'sector': (-10, 10, 3, 20), 'zone': 'far end', 'colour': ASH})
    pars = far_cols([-6.0, -12.0, -18.0, -24.0, -30.0, -36.0, -42.0, -48.0, -54.0]) + [col_up(-1, -0.5, 'columns'), col_up(1, -0.5, 'columns')]
    pars += [roof_up(x, z, 'roof') for x in (-7.0, 7.0) for z in (-9.0, -15.0, -21.0, -27.0, -33.0, -47.0)]
    pars += [v11_unit(f, 'embers') for f in EMBERS] + [far_wall(x, 'far wall') for x in (-4.0, 4.0)] + [roof_up(0.0, -15.0, 'roof')]
    L['lines'] = {
        'title': 'C · Long lines from the depth', 'slug': 'v2-c-lines',
        'idea': 'Ten beams from the column feet 11-35 m behind the DJ throw their longest clear lines back over the stage and the crowd (>= 3 m over every head) into the roof steel at the entry end; two more run the spine from the far wall. The roof is lit in pieces above.',
        'beams': beams, 'pars': pars,
        'smoke': {'p': [0.0, 1.0, -14.0], 'fan': {'p': [0.0, 1.0, -12.5], 'aim': 'toward the audience (+z), lowest speed'},
                  'why': 'where the long lines start, on a 1 m case, the fan toward the crowd: these beams cross the stage and the floor, so the haze must reach the floor end (z 8-28); thin haze far behind is acceptable here'},
    }
    return L


# ------------------------------------------------------------------ evaluate one layout
SKY = None


def sky_of(p):
    """The candidate's row from occlusion_sky's grid (same place), else computed now."""
    for r in SKY['positions']:
        if abs(r['p'][0] - p[0]) < 0.05 and abs(r['p'][2] - p[2]) < 0.05 and abs(r['p'][1] - p[1]) < 0.05:
            return r
    return None


def evaluate(W, name, lay, cc):
    units, beams_out, pars_out = [], [], []
    for i, b in enumerate(lay['beams']):
        p = np.array([b['p'][0], b['p'][1] + S.HEAD_Y, b['p'][2]])
        d, row = best_aim(W, p, b['sector'])
        sk = sky_of(b['p']) or dict(S.sky(W, b['p']), zone=b['zone'])
        rec = {'id': 'rig-beam-%s-%02d' % (name, i + 1), 'part': b['part'], 'zone': b['zone'], 'p': [R3(v) for v in p],
               'sky_clear_pct': sk['clear_pct'], 'sky_roof_pct': sk['roof_pct'], 'sky_blocked_pct': sk['blocked_pct'], 'sky_top_blockers': sk['top_blockers'][:3],
               'crowd': sk.get('crowd') or 'out of the crowd', 'sector': b['sector'], 'colour': b['colour']}
        if d is None:
            rec.update(row)
            rec['ok'] = False
        else:
            chk = S.beam_check(W, p, d, half_deg=0.9)
            az, el = S.az_el(d)
            t = chk['axis_m'] or 120.0
            glass_ring = [e for e in chk['ends'] if 'glass' in e or 'lantern frame' in e]
            rec.update({'aim_az_deg': az, 'aim_el_deg': el, 'dir': [R3(v) for v in d], **row, 'ring': chk, 'ring_in_glass': glass_ring,
                        'lowest_over_standing_m': R3(low_over_standing(p, d, t) + CLEAR_OVER), 'pen_m': pen_radius(p, d),
                        'ok': chk['rays_into_audience'] == 0 and low_over_standing(p, d, t) >= -1e-6 and not glass_ring})
            if rec['lowest_over_standing_m'] > 1e6:
                rec['lowest_over_standing_m'] = None          # its path crosses no standing area (the closed far half)
        beams_out.append(rec)
    for i, q in enumerate(cut_pars(cc) + [dict(x, id='rig-par-%s-%02d' % (name, j + 1)) for j, x in enumerate(lay['pars'])]):
        d = lamp_unit(q['dir'])
        st15 = S.par_on_steel(W, q['p'], d, 15, skip=('truss', 'rigging') if q['part'].startswith('cut') else ())
        st25 = S.par_on_steel(W, q['p'], d, 25, skip=('truss', 'rigging') if q['part'].startswith('cut') else ())
        pars_out.append(dict(q, dir=[R3(v) for v in d], steel_15=st15, steel_25=st25))
    return beams_out, pars_out


# ------------------------------------------------------------------ power, DMX
SITES = {k: v for k, v in V11['power']['sites'].items() if k.startswith('D-')}
WATTS = {'up-b380f': 500, 'up-pl5403': 200, 'up-yz31p': 1500, 'ext-lc-ultra-mk2': 120}


def circuits(units):
    """16 A radials from the nearest distro, one kind and one side of the hall per circuit, <= 2 944 W. Cable = the chain
    distro -> nearest unit -> next nearest (floor Manhattan + the rise to each unit + 0.5 m, +10 %). Volt drop per segment with
    the current still flowing past it (a daisy chain: each lamp takes its share off), BS 7671 Table 4D2B 2.5 mm2 18 mV/A/m,
    4 mm2 11 mV/A/m; the limit 5 % (BS 7671 Appendix 4, 6.4: final circuits, other than lighting 5 %; lighting 3 % is the
    stricter figure, reported too)."""
    by = {}
    for u in units:
        if u['type'] == 'ext-lc-ultra-mk2':
            continue
        dist = min(SITES, key=lambda k: abs(SITES[k][0] - u['p'][0]) + abs(SITES[k][2] - u['p'][2]))
        kind = 'smoke' if u['type'] == 'up-yz31p' else ('beams' if u['type'] == 'up-b380f' else 'pars')
        side = 'L' if u['p'][0] < (SITES[dist][0] if dist in ('D-LEFT', 'D-RIGHT') else 0.0) else 'R'
        by.setdefault((dist, kind, side), []).append(u)
    out, n = [], 0
    for (dist, kind, side), us in sorted(by.items()):
        s = SITES[dist]
        cur, load, groups = [], 0, []
        for u in sorted(us, key=lambda u: abs(u['p'][0] - s[0]) + abs(u['p'][2] - s[2])):
            w = WATTS[u['type']]
            if load + w > 2944 and cur:
                groups.append(cur)
                cur, load = [], 0
            cur.append(u)
            load += w
        if cur:
            groups.append(cur)
        for g in groups:
            n += 1
            pts, at, chain = list(g), np.array([s[0], 0.0, s[2]]), []
            while pts:
                k = min(range(len(pts)), key=lambda j: abs(pts[j]['p'][0] - at[0]) + abs(pts[j]['p'][2] - at[2]))
                q = pts.pop(k)
                seg = (abs(q['p'][0] - at[0]) + abs(q['p'][2] - at[2]) + q['p'][1] + 0.5) * 1.1
                chain.append((seg, q))
                at = np.array(q['p'], float)
            w = sum(WATTS[u['type']] for u in g)
            length = sum(c[0] for c in chain)

            def vd(mv):
                left, v = w, 0.0
                for seg, q in chain:
                    v += mv / 1000.0 * (left / 230.0) * seg
                    left -= WATTS[q['type']]
                return 100.0 * v / 230.0
            mm2, pct = 2.5, vd(18)
            if pct > 5.0:
                mm2, pct = 4.0, vd(11)
            out.append({'circuit': 'C%02d' % n, 'distro': dist, 'kind': kind, 'side': side, 'units': [u['id'] for u in g], 'load_w': w, 'amps_230v': round(w / 230.0, 1),
                        'cable_m': round(length, 1), 'first_run_m': round(chain[0][0], 1), 'cable_mm2': mm2, 'vdrop_pct': round(pct, 1),
                        'ok': w <= 2944 and pct <= 5.0})
    ph = {'L1': 0, 'L2': 0, 'L3': 0}
    for c in sorted(out, key=lambda c: -c['load_w']):
        k = min(ph, key=ph.get)
        c['phase'] = k
        ph[k] += c['load_w']
    return out, ph


def patch(units):
    rows, uni, addr, branch = [], 1, 1, {}
    order = sorted([u for u in units if u['type'] in ('up-b380f', 'up-pl5403', 'up-yz31p')], key=lambda u: (u['p'][2] < -8, u['type'], u['p'][2], u['p'][0]))
    for u in order:
        fp = {'up-b380f': 16, 'up-pl5403': 8, 'up-yz31p': 1}[u['type']]
        if addr + fp - 1 > 512:
            uni, addr = uni + 1, 1
        near = u['p'][2] >= -8
        br = 'U%d-%s' % (uni, 'stage' if near else 'far')
        node = 'NODE-STAGE' if near else 'NODE-FAR'
        branch.setdefault(br, 0)
        branch[br] += 1
        u['dmx'] = {'universe': uni, 'address': addr, 'footprint': fp, 'branch': br, 'node': node}
        addr += fp
    return [{'branch': k, 'devices': v, 'ok': v <= 32} for k, v in branch.items()], {str(u): max(x['dmx']['address'] + x['dmx']['footprint'] - 1 for x in order if x['dmx']['universe'] == u) for u in sorted(set(x['dmx']['universe'] for x in order))}


# ------------------------------------------------------------------ lasers (the laser session's table, used as given)
def lasers_from_table(path):
    if not path or not os.path.exists(path):
        return None, {'status': 'NOT YET: the laser session\'s far-crane table (%s) did not exist when this ran' % path}
    T = json.load(open(path))
    return T, {'status': 'from the laser session\'s table', 'file': path}


# ------------------------------------------------------------------ the rig file
def rig_file(name, lay, beams, pars, smoke_unit, cc, circ, ph, branches, slots, laser_units, checks):
    fixtures = []
    for b in beams:
        if not b.get('ok') and b.get('dir') is None:
            continue
        fixtures.append({'id': b['id'], 'type': 'up-b380f', 'position': '%s, base down on the floor (a pen %.1f m: the beam is below a raised hand that far)' % (b['zone'], b['pen_m'] or 0),
                         'part': b['part'], 'layer': 'beams', 'status': 'used', 'moments': [], 'p': [b['p'][0], R3(b['p'][1] - S.HEAD_Y + 0.7), b['p'][2]],
                         'r': rot_for_dir(b['dir']), 'colour': b['colour'], 'angle_rad': 0.0157,
                         'sky_clear_pct': b['sky_clear_pct'], 'throw_m': b.get('throw_m'), 'ends_on': b.get('ends_on'),
                         'dmx': b.get('dmx'), 'power_w': 500, 'circuit': b.get('circuit')})
    for q in pars:
        fixtures.append({'id': q['id'], 'type': 'up-pl5403', 'position': q['position'], 'part': q['part'], 'layer': 'the cut' if q['part'].startswith('cut') else 'pars',
                         'status': 'used', 'moments': [], 'p': q['p'], 'r': rot_for_dir(q['dir']), 'colour': EMBER if q['part'] in ('columns', 'embers', 'halo', 'far wall', 'side spans') else ASH,
                         'angle_rad': 0.1309, 'lit_column_m': q['steel_15']['column_lit_length_m'], 'lux_on_steel_median': (q['steel_15']['lux_on_steel'] or [None, None])[1],
                         'dmx': q.get('dmx'), 'power_w': 200, 'circuit': q.get('circuit')})
    fixtures.append(smoke_unit)
    fixtures += laser_units or []
    solids = [s for s in V11['solids'] if s['id'] not in ('rig-ash-wall', 'rig-tower-cube6')]
    parts = sorted(set(f['part'] for f in fixtures if f.get('angle_rad')))
    beams_parts = sorted(set(b['part'] for b in beams))
    dark = {p: [EMBER, 0.8] for p in beams_parts}
    dark.update({'columns': [EMBER, 0.25], 'cut down': [EMBER, 0.45]})
    peak = {p: [ASH, 1.0] for p in beams_parts}
    for p in beams_parts:
        if 'behind' in p or 'backlight' in p or 'plane 3' in p:
            peak[p] = [EMBER, 1.0]
    peak.update({'cut down': [ASH, 1.0], 'cut up': [ASH, 0.9], 'columns': [EMBER, 0.8], 'roof': [ASH, 0.6], 'embers': [EMBER, 0.6],
                 'halo': [EMBER, 0.5], 'far wall': [DEEP, 0.7], 'side spans': [EMBER, 0.5], 'laser': [ASH, 1.0]})
    looks = [{'id': 'dark', 'title': 'Dark (one colour: ember)', 'act': 1, 'parts': {k: v for k, v in dark.items() if k in parts}},
             {'id': 'peak', 'title': 'Peak (ash + ember, all on)', 'act': 3, 'parts': {k: v for k, v in peak.items() if k in parts or k == 'laser'}}]
    cues = [{'look': 'dark', 'name': '%s · dark (one colour)' % lay['title'], 'fade': 0, 'hold': 30}, {'look': 'peak', 'name': '%s · peak' % lay['title'], 'fade': 0, 'hold': 30}]
    views = {'fixedCamera': {'projection': 'perspective', 'position': [-3.75, 1.7, 18.1], 'target': [-3.75, 5.0, -20.0], 'fov': 70, 'zoom': 1, 'near': 0.05, 'far': 400, 'locked': False},
             'viewPresets': [
                 {'id': 'floor', 'position': [-3.75, 1.7, 18.1], 'target': [-3.75, 5.0, -20.0], 'fov': 70, 'label': 'Floor centre 1.7 m'},
                 {'id': 'entry', 'position': [0.0, 1.7, 51.5], 'target': [-3.0, 5.0, -10.0], 'fov': 60, 'label': 'Entry 1.7 m'},
                 {'id': 'top', 'position': [-2.0, 85.0, -6.0], 'target': [-2.0, 0.0, -7.0], 'fov': 70, 'label': 'Top plan'},
                 {'id': 'side', 'position': [32.0, 6.0, -12.0], 'target': [0.0, 5.0, -12.0], 'fov': 100, 'label': 'Side section'}]}
    return {
        'snapshot': 'moxir-v2-%s-%s' % (name, DATE), 'version': 'MOXIR v2 %s' % lay['title'], 'title': 'MOXIR v2 %s' % lay['title'],
        'what': lay['idea'], 'written_by': 'scripts/place/moxir_v2.py', 'date': DATE,
        'schema': V11['schema'], 'frame': V11['frame'], 'base': 'MOXIR v1.1 (rigs/moxir-epic-v1-1-2026-10-08.json): the stage, the cut, the cranes, the PA placeholders, FOH, the barrier; the ash wall and cube 6\'s tower removed (all 6 cubes on the free crane, owner 10-09 N416)',
        'kit': {'UP-B380F': 18, 'UP-PL5403': 50, 'EXT-LC-ULTRA-MK2': 6, 'UP-YZ31P': 1},
        'not_hung': [{'code': 'UP-PL5403', 'ordered': 50, 'hung': 50, 'not_hung': 0}, {'code': 'UP-B380F', 'ordered': 18, 'hung': 18, 'not_hung': 0},
                     {'code': 'UP-YZ31P', 'ordered': 1, 'hung': 1, 'not_hung': 0}, {'code': 'EXT-LC-ULTRA-MK2', 'ordered': 6, 'hung': len(laser_units or []), 'not_hung': 6 - len(laser_units or [])}],
        'fixtures': fixtures, 'solids': solids, 'looks': looks, 'cues': cues, 'loop': False, 'views': views,
        'stage': {'booth_from': V11['stage']['booth_to'], 'booth_to': V11['stage']['booth_to'], 'deck_h_m': 0.4, 'design': V11['stage']['design']},
        'cut': {'pars': cc['n'], 'places_u_m': cc['places_u_m'], 'picks_kg': [p['line_kg'] for p in cc['picks']], 'source': 'scripts/place/cut-count.mjs'},
        'power': {'circuits': circ, 'phases_w': ph}, 'patch': {'branches': branches, 'slots': slots}, 'checks': checks,
    }


def smoke(name, lay):
    s = lay['smoke']
    return {'id': 'rig-smoke-%s' % name, 'type': 'up-yz31p', 'position': 'on a 1.0 m flight case; %s; fan at %s %s' % (s['why'], s['fan']['p'], s['fan']['aim']),
            'part': 'haze', 'layer': 'air', 'status': 'used', 'moments': [], 'p': [s['p'][0], R3(s['p'][1]), s['p'][2]], 'r': [0, 0, 0], 'colour': None, 'angle_rad': None, 'power_w': 1500}


# ------------------------------------------------------------------ pictures (plan + section per layout)
def pictures(name, lay, beams, pars, smoke_u, lasers, out, G):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.patches import Rectangle, Circle
    fig, ax = plt.subplots(figsize=(13, 17), dpi=110)
    fig2, bx = plt.subplots(figsize=(22, 4.2), dpi=110)
    for f_ in (fig, fig2):
        f_.patch.set_facecolor('#0b0c0e')
    for a in (ax, bx):
        a.set_facecolor('#111214')
        a.tick_params(colors='#9aa0a8', labelsize=7)
    # plan (x across, z along: the long axis up the page)
    for x in G['rows_x_m']:
        for z in sorted(set(G['column_grid_z_m'])):
            if -40 <= x <= 40:
                ax.add_patch(Rectangle((x - 0.25, z - 0.4), 0.5, 0.8, color='#7d828a', zorder=2))
    for m in G['massing']:
        if m['id'].startswith('pendant'):
            continue
        (x0, x1), (z0, z1) = m['x_m'], m['z_m']
        ax.add_patch(Rectangle((x0, z0), x1 - x0, z1 - z0, fc='#3b342c', ec='#7a6a58', lw=0.5, zorder=2))
    for c in G['cranes']:
        ax.add_patch(Rectangle((-11.35, c['z_m'] - 1.45), 22.7, 2.9, fc='#d8b400', alpha=0.22, ec='#d8b400', zorder=2))
        ax.text(-11.0, c['z_m'] + 1.7, 'crane z %g' % c['z_m'], color='#ffe066', fontsize=7)
    a = S.AUDIENCE
    ax.add_patch(Rectangle((a['x_m'][0], a['z_m'][0]), a['x_m'][1] - a['x_m'][0], a['z_m'][1] - a['z_m'][0], fill=False, ec='#3b6cff', lw=1.2, ls='--', zorder=3))
    ax.text(a['x_m'][0] + 0.3, a['z_m'][1] - 1.5, 'dance floor', color='#7f9cff', fontsize=8)
    ax.plot([-11.04, 0.55], [0.15, 0.15], color='#ffb08a', lw=3, zorder=4)
    ax.add_patch(Rectangle((-6.7, 3.65), 3.0, 2.0, fc='#2fbf5a', alpha=0.7, zorder=4))
    ax.text(-6.6, 6.0, 'DJ', color='#6fe08f', fontsize=8)
    ax.text(-36, 53.0, 'ENTRY (NW, public)', color='#9aa0a8', fontsize=8)
    ax.text(-36, -53.5, 'FAR END (SE, artists)', color='#9aa0a8', fontsize=8)
    cols = {}
    pal = ['#ffd9c8', '#ff8a5a', '#ffe066', '#9fd0ff', '#c8ffb0']
    for b in beams:
        if b.get('dir') is None:
            continue
        c = cols.setdefault(b['part'], pal[len(cols) % len(pal)])
        p, d = np.array(b['p']), np.array(b['dir'])
        t = b.get('throw_m') or 120.0
        q = p + d * t
        ax.plot([p[0], q[0]], [p[2], q[2]], color=c, lw=1.1, alpha=0.9, zorder=5)
        bx.plot([p[2], q[2]], [p[1], q[1]], color=c, lw=1.1, alpha=0.9, zorder=5)
        ax.add_patch(Circle((p[0], p[2]), max(0.6, min(b['pen_m'] or 0, 6.0)), fill=False, ec=c, lw=0.6, ls=':', zorder=4))
        ax.plot(p[0], p[2], 's', color=c, ms=5, zorder=6)
        ax.annotate('%.0f%%' % b['sky_clear_pct'], (p[0], p[2]), color='#ffffff', fontsize=6, xytext=(3, -8), textcoords='offset points', zorder=7)
    for q in pars:
        ax.plot(q['p'][0], q['p'][2], 'o', color='#ff3a12' if not q['part'].startswith('cut') else '#ffb08a', ms=3.5, zorder=6)
    ax.plot(smoke_u['p'][0], smoke_u['p'][2], '*', color='#cfd8ff', ms=14, zorder=7)
    ax.text(smoke_u['p'][0] + 0.8, smoke_u['p'][2], 'smoke + fan', color='#cfd8ff', fontsize=8, zorder=7)
    if lasers:
        for lb in lasers.get('beams_plan', []):
            ax.plot([lb['from'][0], lb['to'][0]], [lb['from'][2], lb['to'][2]], color='#7cff6a', lw=0.9, zorder=5)
            bx.plot([lb['from'][2], lb['to'][2]], [lb['from'][1], lb['to'][1]], color='#7cff6a', lw=0.9, zorder=5)
        for hz in lasers.get('hazard_plan', []):
            ax.fill(hz['x'], hz['z'], color='#7cff6a', alpha=0.08, zorder=3)
        for hz in lasers.get('hazard_section', []):
            bx.fill(hz['z'], hz['y'], color='#7cff6a', alpha=0.08, zorder=3)
    handles = [plt.Line2D([], [], color=c, lw=2, label='%s (%d)' % (k, sum(1 for b in beams if b['part'] == k))) for k, c in cols.items()]
    handles += [plt.Line2D([], [], marker='o', ls='', color='#ff3a12', label='PAR on the ground (%d)' % sum(1 for q in pars if not q['part'].startswith('cut'))),
                plt.Line2D([], [], marker='o', ls='', color='#ffb08a', label='PAR on the cut (%d)' % sum(1 for q in pars if q['part'].startswith('cut')))]
    if lasers:
        handles.append(plt.Line2D([], [], color='#7cff6a', lw=2, label='laser lines + hazard zone (the laser session\'s table)'))
    ax.legend(handles=handles, loc='lower right', fontsize=7, facecolor='#1a1b1e', labelcolor='#e8e4dc')
    ax.set_xlim(-37, 37)
    ax.set_ylim(-55, 55)
    ax.set_aspect('equal')
    ax.set_title('%s — plan (beam lines to their first hit; dotted ring = the pen a head needs; %% = its clear sky)' % lay['title'], color='#e8e4dc', fontsize=10)
    # section
    bx.axhline(G['truss_bottom_m'], color='#7d828a', lw=1)
    bx.axhline(3.0, color='#3b6cff', lw=0.8, ls=':')
    bx.text(-54, 3.15, '3 m over the floor', color='#7f9cff', fontsize=7)
    bx.axhspan(G['runway_bottom_m'], G['runway_top_m'], color='#6b6f75', alpha=0.4)
    for c in G['cranes']:
        bx.add_patch(Rectangle((c['z_m'] - 1.45, c['girder_bottom_m']), 2.9, c['girder_top_m'] - c['girder_bottom_m'], fc='#d8b400', alpha=0.6))
    for z in sorted(set(G['column_grid_z_m'])):
        bx.add_patch(Rectangle((z - 0.4, 0), 0.8, G['column_head']['head_top_m'], fc='#7d828a', alpha=0.25))
    bx.plot([0.15, 0.15], [2.89, 6.29], color='#ffb08a', lw=3)
    bx.add_patch(Rectangle((8.2, 0), 19.8, 2.4, fill=False, ec='#3b6cff', ls='--'))
    bx.set_xlim(-55, 55)
    bx.set_ylim(0, 14)
    bx.set_aspect('equal')
    bx.set_xlabel('z (m): far end (SE, behind the DJ) <- -> entry (NW)', color='#9aa0a8', fontsize=8)
    bx.set_title('%s — section along the hall, heights true (the 3 m line: no beam lower over a standing area)' % lay['title'], color='#e8e4dc', fontsize=10)
    os.makedirs(out, exist_ok=True)
    fig.savefig(os.path.join(out, 'plan-%s.png' % name), facecolor=fig.get_facecolor(), bbox_inches='tight')
    fig2.savefig(os.path.join(out, 'section-%s.png' % name), facecolor=fig2.get_facecolor(), bbox_inches='tight')
    plt.close(fig)
    plt.close(fig2)


# ------------------------------------------------------------------ main
def main():
    global SKY
    S.wait_cool()
    sky_path = os.path.expanduser('~/Downloads/moxir/v2-layouts/occlusion/occlusion-sky.json')
    W = S.World(REPO)
    if os.path.exists(sky_path):
        SKY = json.load(open(sky_path))
    else:
        _, SKY = S.run(REPO)
    table = cut_table()
    cc = cut_places(CUT_N)
    T, laser_note = lasers_from_table(A.lasers)
    out = {'cut_table': table, 'cut_recommended': CUT_N, 'lasers': laser_note, 'layouts': {}}
    for name, lay in layouts().items():
        beams, pars = evaluate(W, name, lay, cc)
        sm = smoke(name, lay)
        units = [dict(b, type='up-b380f') for b in beams if b.get('dir') is not None] + [dict(q, type='up-pl5403') for q in pars] + [sm]
        branches, slots = patch(units)
        circ, ph = circuits(units)
        cid = {u: c['circuit'] for c in circ for u in c['units']}
        dm = {u['id']: u['dmx'] for u in units}
        for b in beams:
            b['circuit'], b['dmx'] = cid.get(b['id']), dm.get(b['id'])
        for q in pars:
            q['circuit'], q['dmx'] = cid.get(q['id']), dm.get(q['id'])
        sm['circuit'], sm['dmx'] = cid.get(sm['id']), dm.get(sm['id'])
        ok_beams = [b for b in beams if b.get('ok')]
        counts = {}
        for q in pars:
            counts['PAR · ' + q['part']] = counts.get('PAR · ' + q['part'], 0) + 1
        for b in beams:
            counts['B380F · ' + b['part']] = counts.get('B380F · ' + b['part'], 0) + 1
        in_crowd = [b['id'] for b in beams if b['crowd'] != 'out of the crowd'] + [q['id'] for q in pars if not q['part'].startswith('cut') and S.AUDIENCE['x_m'][0] - 2 <= q['p'][0] <= S.AUDIENCE['x_m'][1] + 2 and S.AUDIENCE['z_m'][0] - 2 <= q['p'][2] <= S.AUDIENCE['z_m'][1] + 2]
        if len(beams) != 18 or len(pars) != 50:
            raise SystemExit('%s: the kit is 18 B380F + 50 PL5403, this layout has %d + %d' % (name, len(beams), len(pars)))
        checks = {
            'beams': len(beams), 'beams_ok': len(ok_beams), 'beams_into_audience': sum(b.get('ring', {}).get('rays_into_audience', 0) > 0 for b in beams),
            'mean_sky_clear_pct': round(float(np.mean([b['sky_clear_pct'] for b in beams])), 1),
            'min_sky_clear_pct': min(b['sky_clear_pct'] for b in beams),
            'mean_throw_m': round(float(np.mean([b.get('throw_m') or 120 for b in beams if b.get('dir') is not None])), 1),
            'aim_rays_clear_30m_pct': round(float(np.mean([b['ring']['rays_clear_30m_pct'] for b in beams if 'ring' in b])), 1),
            'pars': len(pars), 'pars_cut': sum(q['part'].startswith('cut') for q in pars), 'pars_ground': sum(not q['part'].startswith('cut') for q in pars),
            'par_column_lit_m_15': round(float(np.mean([q['steel_15']['column_lit_length_m'] for q in pars if q['part'] == 'columns'])), 2) if any(q['part'] == 'columns' for q in pars) else None,
            'par_column_lux_median_15': round(float(np.median([q['steel_15']['lux_on_steel'][1] for q in pars if q['part'] == 'columns' and q['steel_15']['lux_on_steel']])), 0) if any(q['part'] == 'columns' for q in pars) else None,
            'par_on_steel_pct_15': round(float(np.mean([q['steel_15']['steel_pct'] for q in pars])), 1),
            'units_in_or_near_crowd': in_crowd, 'pens_m': sorted(set(round(b['pen_m'] or 0, 1) for b in beams if b.get('pen_m') is not None)),
            'counts': counts, 'circuits': len(circ), 'circuits_ok': all(c['ok'] for c in circ), 'phases_w': ph,
            'connected_w': sum(c['load_w'] for c in circ) + (6 * 120), 'branches': branches, 'slots': slots,
        }
        rig = rig_file(name, lay, beams, pars, sm, table['rows'][0] if False else cc, circ, ph, branches, slots, None, checks)
        out['layouts'][name] = {'title': lay['title'], 'slug': lay['slug'], 'idea': lay['idea'], 'checks': checks, 'beams': beams, 'pars': pars, 'smoke': sm,
                                'rig_file': 'scripts/place/rigs/moxir-v2-%s-%s.json' % (name, DATE)}
        if A.out:
            json.dump(rig, open(os.path.join(REPO, out['layouts'][name]['rig_file']), 'w'), indent=1, default=JD)
            pictures(name, lay, beams, pars, sm, None, os.path.expanduser(A.out), W.G)
    if A.out:
        json.dump(out, open(os.path.join(os.path.expanduser(A.out), 'v2-layouts.json'), 'w'), indent=1, default=JD)
    if A.check or not A.out:
        json.dump(out, sys.stdout, default=JD)


if __name__ == '__main__':
    main()
