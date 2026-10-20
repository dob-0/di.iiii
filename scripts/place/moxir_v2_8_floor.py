"""MOXIR v2.8 — designed from the dance floor (owner 2026-10-12 ~20:0x: "imagine you are in the dance floor, what show
you want to see that affects you as epic"), after his two asks of 10-12 19:4x: (1) "lasers … close over the heads of the
audience, keep the position but change the angle" and (2) "ground fixtures … no logic and asymmetric — analyse once more
and re-arrange".

What the walk pictures of v2.7 showed from the floor (~/Downloads/moxir/walk-v2-7, spots 7, 15, 16, 12): the white B380F
side beams are the epic frame; the 14 red washes on the ground read as scattered small lamps (straight up from 0.31 m);
the laser net sits 9–10 m up, far over the heads.

Measured first (scratchpad lid_probe.py on moxir-v2-7-2026-10-12.json): with the six cubes on the far crane (z -42.45)
every line over the dance floor runs along the hall and ends on the entry wall, so the rules hold it at 9.0–9.3 m
(entry wall >= 9.0 m, DJ-crane crossing >= 9.2 m); the hand rule alone allows 5.4 m. Keeping the cubes' position gains
at most 1 m. The owner chose the floor's view over the position ("yes …"), so:

From the v2.7 rig only these change:
  * LASER LID (owner 2026-10-13 00:2x, repeated after the measured concern: "keep the place of the lasers and change the
    direction … move the fixture back to the crane and change angles like it is now") — the six cubes STAY on the far
    crane (z -42.45, 8.81 m); every one of the v2.7 net's 36 lines (same crossed headings, same pans) takes the STEEPEST
    DOWN tilt that still meets the rules (hand rule 5.4 m on the side walls, entry wall >= 9.0 m, DJ-crane crossing
    >= 9.2 m, no line through the crane park, never the floor). Measured result below (the script prints it): lines to the
    side walls end at 5.4-5.7 m, lines along the hall to the entry wall stay at 9.0-9.8 m — the entry-wall rule, not the
    cube place, holds those; the owner knows (ledger N533).
    `--lasers columns` builds the 2026-10-13 00:0x try instead (kept as rigs/moxir-v2-8-columns-try-2026-10-13.json, not
    asked): the six cubes on the nave columns (rows x ±12, hall record v13,
    pitch 6 m): three per side on column brackets at 6.0 m (the same mount the stage key uses, column x -12 z 12),
    at z 18, 30, 42, facing across the floor. Each fans six lines in the horizontal plane (pans ±6, ±18, ±30 of the
    assumed ±30 scan), every line rising TILT_UP so it clears the opposite bracket by >= 0.5 m, and ends on the far
    side wall >= 5.4 m. Lines are the SAME on both sides (mirror about x 0 = the column rows); a line that would end
    on the entry wall (< 9.0 m), enter the crane park (x ±12, z -2..7, y 2.5..10.8: "no beam through it"), or hit the
    floor, has its pan pulled toward the heading in 1 deg steps until it passes. Lowest point over a dancer: 6.0 m
    (4.3 m over a 1.7 m head; hand rule 5.4 m kept with 0.6 m to spare).
  * RED TENT — the 14 PL5403 side washes (±8.2 m off the DJ axis, z 10..46) keep their places and tilt TENT_DEG in
    toward the axis, so the two red fans meet over the middle of the floor under the roof chords: one readable shape
    from every dance spot, mirrored about the DJ axis, instead of 14 small glows.
  * Everything else as v2.7: the 6 B380F behind the DJ, the 2×7 B380F side lines at 60 deg, the backstage block, the
    two 40 W lasers on the entry wall (owner 10-12: "they stay at entrance"), the outside 8+2 washes (another item:
    "the outside from the video"), the cut truss, the kicker and the stage key (in the air — not in this ask).
Output: scripts/place/rigs/moxir-v2-8-2026-10-13.json. UNVALIDATED: the column brackets (rigging check, SIDE 2), the
right-side lines crossing the kept machines (gallery/canopy heights not in the record), lamp strikes (laser-margin run).
  python3 -I -B scripts/place/moxir_v2_8_floor.py --repo .
"""
import argparse, json, math, sys, copy
ap = argparse.ArgumentParser(); ap.add_argument('--repo', required=True)
ap.add_argument('--src', default='scripts/place/rigs/moxir-v2-7-2026-10-12.json')
ap.add_argument('--out', default=None); ap.add_argument('--version', default='2.8')
ap.add_argument('--lasers', default='crane', choices=('crane', 'columns', 'matrix'))
ap.add_argument('--comb-x', default='-10,0', help='matrix: the comb spans these x (abs, m) on the entry wall, evenly — the dance bay between the column rows (owner 2026-10-13 18:2x: every line over the audience; was -17,6)')
ap.add_argument('--comb-per-cube', type=int, default=6); ap.add_argument('--diag-z', default='', help='matrix: z of the diagonals\' ends on the side walls; empty = no diagonals (owner 2026-10-13: "the left/right ones look only at the walls" — all six lines per cube go into the comb)')
ap.add_argument('--cube-z', default='18,30,42', help='z of the three brackets per side (column pitch 6 m)')
ap.add_argument('--cube-y', type=float, default=6.0, help='bracket height, m (stage key precedent 6.0)')
ap.add_argument('--pans', default='-30,-18,-6,6,18,30', help='deg from the heading, + toward the entry (+z)')
ap.add_argument('--tilt', type=float, default=1.2, help='deg up: clears the opposite bracket (24 m) by 0.5 m')
ap.add_argument('--tent', type=float, default=30.0, help='side washes: deg in from vertical toward the axis')
a = ap.parse_args(); a.out = a.out or {'crane': 'scripts/place/rigs/moxir-v2-8-2026-10-13.json', 'columns': 'scripts/place/rigs/moxir-v2-8-columns-try-2026-10-13.json', 'matrix': 'scripts/place/rigs/moxir-v2-8-matrix-2026-10-13.json'}[a.lasers]; sys.path.insert(0, f'{a.repo}/scripts/place'); import moxir_v2_symmetry as sym
rig = json.load(open(f'{a.repo}/{a.src}')); X0 = sym.X0
WEST_X, EAST_X, WALL_Z, BACK_Z, ROOF_Y = -36.4, 60.4, 53.8, -53.6, 10.3
HAND_RULE_Y, ENTRY_MIN, NEAR_Z, NEAR_MIN = 5.4, 9.0, 3.2, 9.2
COL_X, COL_FACE = 12.0, 0.5                        # column rows x ±12 (hall record), bracket 0.5 m off the face toward the floor
PARK = {'x': (-12.0, 12.0), 'z': (-2.0, 7.0), 'y': (2.5, 10.8)}   # ground_rules.crane_park: no beam through it
SIDE_X = 8.2
def euler_for(d): c = math.asin(max(-1, min(1, d[0]))); return [round(math.atan2(-d[2], -d[1]), 4), 0.0, round(c, 4)]
def first_hit(p, d):
    hits = []
    for name, axis, val in (('east side wall (x +60.4)', 0, EAST_X), ('west side wall (x -36.4)', 0, WEST_X),
                            ('entry (NW) end wall above the door', 2, WALL_Z), ('back end wall', 2, BACK_Z), ('roof bottom chords (y 10.3)', 1, ROOF_Y), ('FLOOR', 1, 0.0)):
        if abs(d[axis]) < 1e-9: continue
        t = (val - p[axis]) / d[axis]
        if t > 0: hits.append((t, name))
    t, name = min(hits); return t, name, [round(p[i] + d[i] * t, 2) for i in range(3)]
def through_park(p, d, L):
    t = 0.0
    while t <= L:
        q = [p[i] + d[i] * t for i in range(3)]
        if PARK['x'][0] <= q[0] <= PARK['x'][1] and PARK['z'][0] <= q[2] <= PARK['z'][1] and PARK['y'][0] <= q[1] <= PARK['y'][1]: return True
        t += 0.25
    return False
def ok(p, d, L, name, T):
    kind = 'entry' if name.startswith('entry') else 'roof' if name.startswith('roof') else 'floor' if name == 'FLOOR' else 'wall'
    if kind == 'floor': return False
    if kind == 'entry' and T[1] < ENTRY_MIN: return False
    if kind == 'wall' and T[1] < HAND_RULE_Y: return False
    if d[2] > 1e-9 and (NEAR_Z - p[2]) / d[2] < L and p[1] + d[1] * (NEAR_Z - p[2]) / d[2] < NEAR_MIN and abs(p[0] + d[0] * (NEAR_Z - p[2]) / d[2]) <= COL_X: return False
    if a.lasers == 'columns' and through_park(p, d, L): return False   # the park box is a ground-beam rule; the v2.7 laser rules are the four above
    return True
def line(p, heading_deg, pan_deg, tilt_deg):
    pa = math.radians(heading_deg + pan_deg); ti = math.radians(tilt_deg)
    d = [math.sin(pa) * math.cos(ti), math.sin(ti), math.cos(pa) * math.cos(ti)]; L, name, T = first_hit(p, d); return d, L, name, T
# --- 1. the laser lid: six cubes to the column brackets -----------------------------------------------------------------------------
cubes = sorted([f for f in rig['fixtures'] if f['type'] == 'ext-lc-ultra-mk2'], key=lambda f: f['p'][0])
assert len(cubes) == 6, len(cubes)
def low_tilt(p, pa):
    t = -30.0
    while t < 8.0:
        ti = math.radians(t); d = [math.sin(pa) * math.cos(ti), math.sin(ti), math.cos(pa) * math.cos(ti)]; L, name, T = first_hit(p, d)
        if ok(p, d, L, name, T): return t
        t += 0.25
    return None
tubes = [t for t in rig['lasers']['tubes'] if not t['cube'].startswith('rig-lasercube')]   # keep the 40 W tubes
lines, pulled = [], 0
if a.lasers == 'crane':
    for n, f in enumerate(cubes, 1):
        p = f['p']; h = f['heading_deg']; old_beams = f['laser']['beams']; f['laser']['beams'] = []
        f['position'] = f['position'].split('; v2.8')[0] + '; v2.8 (moxir_v2_8_floor.py): same place and heading, every line at its steepest down tilt under the rules (owner 2026-10-13: keep the place, change the angle)'
        for b0 in old_beams:
            pan_total = b0['pan_deg']; pa = math.radians(pan_total); tl = low_tilt(p, pa)
            if tl is None: tl = b0['tilt_deg']; pulled += 1
            ti = math.radians(tl); d = [math.sin(pa) * math.cos(ti), math.sin(ti), math.cos(pa) * math.cos(ti)]; L, name, T = first_hit(p, d)
            b = dict(b0); b.update({'to': T, 'length_m': round(L, 3), 'r': euler_for(d), 'tilt_deg': tl, 'ends_on': name, 'end_height_m': T[1], 'lowest_m': round(min(p[1], T[1]), 2),
                      'over_hand_rule_m': round(min(p[1], T[1]) - HAND_RULE_Y, 2), 'was_tilt_deg_v2_7': b0['tilt_deg'],
                      'checks': f'steepest down under: lowest point >= {HAND_RULE_Y} m over standing areas (hand 2.4 m + 3 m, owner 2026-10-12), entry wall >= {ENTRY_MIN} m, DJ crane crossing >= {NEAR_MIN} m, no line through the crane park; lamp/crane strikes UNVALIDATED'})
            f['laser']['beams'].append(b); tubes.append({'beam': b['id'], 'cube': f['id'], 'from': p, 'to': T, 'half_fan_deg': 1.008, 'ends_on': name})
            lines.append((b['id'], round(pan_total), name.split(' (')[0], round(L, 1), T[1]))
    rig['lasers'].update({'tubes': tubes, 'previous': 'v2.7 net from the far crane (moxir-v2-7-2026-10-12.json)',
        'design': 'v2.8: the v2.7 net (six cubes on the far crane, crossed headings, 36 lines) with every line at its steepest down tilt under the rules; the two UP-LA40WF unchanged',
        'arithmetic': {'lines': len(lines), 'lowest_point_m': round(min(min(b['lowest_m'] for b in f['laser']['beams']) for f in cubes), 2),
                       'over_rule_line_m': round(min(min(b['lowest_m'] for b in f['laser']['beams']) for f in cubes) - HAND_RULE_Y, 2), 'unchanged_lines': pulled,
                       'lines_ending_on_the_entry_wall_m': sorted(set(round(T[1], 1) for _, _, nm, _, T1 in [(0, 0, l[2], 0, l[4]) for l in lines] for T in [[0, T1]] if nm.startswith('entry')))},
        'why_not_lower': 'measured 2026-10-12 (lid_probe.py): a line from the far crane that reaches the dance floor runs along the hall and ends on the entry wall (>= 9.0 m rule: door top 6 m + 3 m); only lines to the side walls can come down to 5.4 m, and those pass beside the floor. The owner was told and chose this (ledger N533).'})
if a.lasers == 'matrix':
    # owner 2026-10-13 00:4x: "lasers from the crane make like it will matrix on the dance floor". From one cluster 7 m wide the
    # lines over a floor 50-90 m away are near-parallel, so the matrix is a COMB: per cube COMB_PER lines to evenly spaced points
    # on the entry wall (x from --comb-x), at the lowest height the rules allow (DJ-crane crossing 9.2 m -> 9.65 m at the wall);
    # plus two diagonals per cube to its own side wall (left three cubes -> west, right three -> east) ending at 5.5 m, framing
    # the floor; the two 40 W from the door cross the comb. Lowest over a dancer: 9.2 m (the entry-wall and crane rules).
    x_lo, x_hi = [float(v) for v in a.comb_x.split(',')]; n_comb = len(cubes) * a.comb_per_cube
    comb_xs = [x_lo + (x_hi - x_lo) * i / (n_comb - 1) for i in range(n_comb)]
    diag_zs = [float(v) for v in a.diag_z.split(',') if v.strip()]
    def aim(p, T):
        d = sym.unit((T[0] - p[0], T[1] - p[1], T[2] - p[2])); L, name, Th = first_hit(p, d); return d, L, name, Th
    def lowest_ok(p, T0):
        y = T0[1]
        while y < 10.2:
            d, L, name, T = aim(p, (T0[0], y, T0[2]))
            if ok(p, d, L, name, T): return d, L, name, T
            y += 0.05
        return None
    # the comb: cube i takes every 6th target (interleaved, so neighbours come from different cubes and the comb reads even)
    for n, f in enumerate(cubes, 1):
        p = f['p']; f['laser']['beams'] = []
        f['position'] = f['position'].split('; v2.8')[0] + '; v2.8 matrix (moxir_v2_8_floor.py --lasers matrix): same place; a comb over the dance floor + two diagonals (owner 2026-10-13: "matrix on the dance floor")'
        targets = [(comb_xs[j], 9.0, WALL_Z) for j in range(n - 1, n_comb, len(cubes))]
        side = -1 if n <= 3 else 1
        targets += [((WEST_X if side < 0 else EAST_X), HAND_RULE_Y + 0.1, z) for z in diag_zs]
        for k, T0 in enumerate(targets):
            r = lowest_ok(p, T0)
            if r is None: pulled += 1; continue
            d, L, name, T = r; bid = f'{n}{"abcdefgh"[k]}'
            pan = math.degrees(math.atan2(d[0], d[2])); tilt = math.degrees(math.asin(d[1]))
            b = {'id': bid, 'off': False, 'duty': 1.0, 'to': T, 'length_m': round(L, 3), 'r': euler_for(d), 'pan_deg': round(pan, 2), 'tilt_deg': round(tilt, 2), 'ends_on': name, 'end_height_m': T[1],
                 'lowest_m': round(min(p[1], T[1]), 2), 'over_hand_rule_m': round(min(p[1], T[1]) - HAND_RULE_Y, 2), 'family': 'comb' if k < a.comb_per_cube else 'diagonal',
                 'checks': f'lowest allowed: hand rule {HAND_RULE_Y} m on the side walls, entry wall >= {ENTRY_MIN} m, DJ crane crossing >= {NEAR_MIN} m; lamp/crane strikes UNVALIDATED'}
            f['laser']['beams'].append(b); tubes.append({'beam': bid, 'cube': f['id'], 'from': p, 'to': T, 'half_fan_deg': 1.008, 'ends_on': name})
            lines.append((bid, round(pan), name.split(' (')[0], round(L, 1), T[1]))
    rig['lasers'].update({'tubes': tubes, 'previous': 'v2.8 crane lines (moxir-v2-8-2026-10-13.json)',
        'design': f'v2.8 MATRIX: six cubes on the far crane; a comb of {n_comb} lines over the dance floor ({a.comb_per_cube} per cube, interleaved, x {a.comb_x} on the entry wall, {round((x_hi - x_lo) / (n_comb - 1), 2)} m apart) at the lowest height the rules allow, plus {len(diag_zs)} diagonals per cube to its side wall at {HAND_RULE_Y + 0.1} m; the two UP-LA40WF unchanged (they cross the comb)',
        'arithmetic': {'lines': len(lines), 'comb_lines': n_comb, 'comb_spacing_m': round((x_hi - x_lo) / (n_comb - 1), 2), 'lowest_point_m': round(min(min(b['lowest_m'] for b in f['laser']['beams']) for f in cubes), 2),
                       'comb_height_over_the_floor_m': [9.2, 9.65], 'dropped_lines': pulled},
        'why_not_lower': 'the comb runs along the hall and ends on the entry wall (>= 9.0 m rule) after crossing the DJ crane (>= 9.2 m); a true lattice of crossings over the floor would need sources far apart (the cubes sit within 7 m)'})
zs = [float(v) for v in a.cube_z.split(',')]; pans = [float(v) for v in a.pans.split(',')]
if a.lasers == 'columns':
    places = [(-1, z) for z in zs] + [(1, z) for z in zs]          # side -1 = west column row (x -12) firing +x; +1 = east row firing -x
    for n, (f, (s, z)) in enumerate(zip(cubes, places), 1):
        x = s * (COL_X - COL_FACE); p = [round(x, 2), a.cube_y, z]; heading = 90.0 if s < 0 else -90.0   # heading +x / -x; pan + turns toward +z
        f['p'] = p; f['heading_deg'] = heading; f['layer'] = 'lines'
        d0 = [-s, 0.0, 0.0]; f['r'] = euler_for([-s * math.cos(math.radians(a.tilt)), math.sin(math.radians(a.tilt)), 0.0])
        f['mount'] = f'UNVALIDATED: column bracket on the nave column x {s * COL_X:+.0f} z {z:.0f} at {a.cube_y} m (the stage key precedent), facing across the floor; the rigging check is owed (SIDE 2)'
        f['position'] = (f['position'].split('; v2.4')[0].split('; v2.7')[0] + f'; v2.8 (moxir_v2_8_floor.py): off the far crane onto the {"west" if s < 0 else "east"} column row, bracket at {a.cube_y} m, z {z:.0f}, the laser LID over the floor (owner 2026-10-12: close over the heads, from the floor)')
        f['laser']['beams'] = []
        for k, pan0 in enumerate(pans):
            pan = pan0 * (1 if s < 0 else -1)      # mirror: + = toward the entry on both sides
            tries = 0
            while True:
                d, L, name, T = line(p, heading, pan, a.tilt)
                if ok(p, d, L, name, T) or abs(pan) < 0.5: break
                pan -= math.copysign(1.0, pan); tries += 1
            if tries: pulled += 1
            bid = f'{n}{"abcdef"[k]}'
            b = {'id': bid, 'off': False, 'duty': 1.0, 'to': T, 'length_m': round(L, 3), 'r': euler_for(d), 'pan_deg': round(heading + pan, 2), 'tilt_deg': a.tilt, 'ends_on': name,
                 'end_height_m': T[1], 'lowest_m': round(min(p[1], T[1]), 2), 'over_hand_rule_m': round(min(p[1], T[1]) - HAND_RULE_Y, 2),
                 'checks': f'lowest point {min(p[1], T[1]):.2f} m >= {HAND_RULE_Y} m (hand 2.4 m + 3 m, owner 2026-10-12); entry wall >= {ENTRY_MIN} m; no line through the crane park; DJ crane crossing >= {NEAR_MIN} m; lamp/machine strikes UNVALIDATED'}
            f['laser']['beams'].append(b); tubes.append({'beam': bid, 'cube': f['id'], 'from': p, 'to': T, 'half_fan_deg': 1.008, 'ends_on': name})
            lines.append((bid, round(heading + pan), name.split(' (')[0], round(L, 1), T[1]))
    rig['lasers'].update({'tubes': tubes, 'previous': 'v2.7 net from the far crane (moxir-v2-7-2026-10-12.json)',
        'design': f'v2.8 LID: six cubes on the nave column brackets at {a.cube_y} m (x ±{COL_X - COL_FACE}, z {a.cube_z}), six lines each in the horizontal plane rising {a.tilt} deg, across the floor to the far side wall; the two UP-LA40WF unchanged',
        'arithmetic': {'lines': len(lines), 'lowest_point_m': round(min(min(b['lowest_m'] for b in f['laser']['beams']) for f in cubes), 2),
                       'over_rule_line_m': round(min(min(b['lowest_m'] for b in f['laser']['beams']) for f in cubes) - HAND_RULE_Y, 2),
                       'over_a_1_7_m_head_m': round(a.cube_y - 1.7, 2), 'pans_pulled_in': pulled},
        'why_moved': 'measured 2026-10-12 (lid_probe.py): from the far crane the lowest line over the floor is 9.27 m (9.04 with the crane rule off) because every such line ends on the entry wall (>= 9.0 m rule); the owner chose the floor view over the crane position'})

# --- 2. the red tent: the 14 side washes tilt in ------------------------------------------------------------------------------------
side = [f for f in rig['fixtures'] if f['type'] == 'up-pl5403' and f['p'][1] < 1.5 and abs(abs(f['p'][0] - X0) - SIDE_X) < 0.3 and 9 <= f['p'][2] <= 47]
assert len(side) == 14, len(side)
e = math.radians(a.tent)
for f in side:
    s = -1 if f['p'][0] < X0 else 1
    d = sym.unit((-s * math.sin(e), math.cos(e), 0.0)); f['r'] = sym.rot_for_dir(d)
    f['part'] = f'red tent {"left" if s < 0 else "right"}'; f['layer'] = 'lines'
    f['position'] = f['position'].split('; v2.7')[0] + f'; v2.8 (moxir_v2_8_floor.py): the red tent — tilted {a.tent:.0f} deg in over the floor so the two fans meet under the roof chords (from the floor: one shape, not 14 glows)'
    f['throw_m'] = None; f['throw_source'] = 'epic-build default (reachOf) until the footprint run'
# the looks: the tent parts take what the side washes had (the parts they were in: columns / hall steel), explicitly, same colour and level
for look in rig['looks']:
    parts = look.get('parts', {})
    base = parts.get('columns') or parts.get('hall steel')
    if base is not None:
        parts.setdefault('red tent left', list(base)); parts.setdefault('red tent right', list(base))
# --- 2b. the moving heads (owner 2026-10-13 16:5x: "almost in the middle of the stage … left/right as lines as now, check the
#   audience's look and the blocking … not on the stage"). Measured by the lead (ledger N558.1, floor grid at eye height 1.6 m,
#   columns r 0.45 at x ±12 pitch 6, deck + PA as boxes): the two side lines were mirrored about the DJ axis (X0 -5.2), so the
#   right line stood 2.9 m from the hall's centre and the left one outside the west row (seen from 71 % of the floor); plane 1
#   stood on the stage pen (seen from 51 %). Now: the side lines on the column rows, x = ∓(COL_X - COL_FACE) = ∓11.5 (hall
#   symmetry; 100 % seen; pan free of columns 88 %), same z and tilt; plane 1 behind the pen at z = PLANE1_Z, same x and aim.
PLANE1_Z = -9.0
HEADS_EAST_X = 3.0   # the dance floor's east edge (zones.dance x -11..3.5; the roller conveyor at 3.6)
heads = [f for f in rig['fixtures'] if f['type'] == 'up-b380f']
assert len(heads) == 18, len(heads)
import right_line_clear as rlc  # noqa: E402  (scripts/place is on sys.path)
HALL = f'{a.repo}/scripts/place/rigs/moxir-hall-2026-10-11-v11-show-park-far41.hall.json'
EAST_CLEAR = rlc.clear_x_by_z(json.load(open(HALL)), [f for f in heads if f.get('part') == 'side line right'], x_min=HEADS_EAST_X, x_max=9.0)
for f in heads:
    if f.get('part') in ('side line left', 'side line right'):
        s_ = -1 if f['p'][0] < X0 else 1
        # The east row (x +11.5) is NOT free: the hall record's massing (moxir-hall-…v11.hall.json dims.massing) puts the
        # inclined gallery at x 10-11.6, z 6-40, 3.2-7.4 m high, the long pipe at x 10-10.7, the drum tank, the canopy
        # and the blower at x 5.8-11 — the owner saw the beams blocked (16:40). The used dance floor ends at the roller
        # conveyor, x 3.6 (dims.zones.dance x -11..3.5), so the right line stands at HEADS_EAST_X = 3.0, the floor's edge,
        # where v2.7 had it; the left line on the west row, x -11.5 (free: the transformer and cabinets sit at z < 4).
        # Right line, per head (owner 10-13 17:4x: 'analyze where is the right perfect place'): the largest clear x east of the
        # floor's edge, every massing box grown by its stated error, the beam cast along the head's own rotation
        # (right_line_clear.py, ledger N564); no clear place (z 19: conveyor, hopper, blower, tank) -> the floor's edge.
        x_ = -(COL_X - COL_FACE) if s_ < 0 else (EAST_CLEAR[f['p'][2]][0] or HEADS_EAST_X)
        f['p'] = [round(x_, 2), f['p'][1], f['p'][2]]
        # Owner 10-13 19:1x: 'make the beams straight up so they are easy to edit now' — the side lines start vertical; he aims
        # them by hand in the Studio (Work light), and the looks are rebuilt from the document (epic-build --looks-only).
        f['r'] = [-3.1416, 0.0, 0.0]
        f['position'] = f['position'].split('; v2.10')[0] + f'; v2.10 (moxir_v2_8_floor.py 2b): {"on the west column row" if s_ < 0 else "at the dance floor\'s east edge (the roller conveyor at x 3.6; the east row is under the inclined gallery)"}, x {f["p"][0]:+.1f}; same z, same 30 deg tilt in'
    elif f.get('part') == 'plane 1 (behind the DJ)':
        f['p'] = [f['p'][0], f['p'][1], PLANE1_Z]
        f['position'] = f['position'].split('; v2.10')[0] + f'; v2.10 (moxir_v2_8_floor.py 2b): off the stage pen (z {PLANE1_Z}), behind the DJ, same x and aim'
rig['heads_2026_10_13'] = {'side_lines_x': [-(COL_X - COL_FACE), {str(z): (x or HEADS_EAST_X) for z, (x, _) in EAST_CLEAR.items()}], 'plane1_z': PLANE1_Z,
                           'right_line_rule': 'right_line_clear.py: largest clear x in 3..9 with every massing box grown by its stated error, beam along the head rotation; none -> 3.0',
                           'right_line_blockers': {str(z): b for z, (_, b) in EAST_CLEAR.items()}, 'why': 'owner 2026-10-13 16:5x and 17:4x; lead measured N558.1, N564'}

# --- 3. the record -----------------------------------------------------------------------------------------------------------------
rig['version'] = a.version; rig['date'] = '2026-10-13'; rig['written_by'] = 'scripts/place/moxir_v2_8_floor.py'
rig['title'] = {'crane': 'MOXIR v2.8 - from the dance floor: the lasers down to the rules from the far crane, the red tent', 'matrix': 'MOXIR v2.8 - a laser matrix over the dance floor from the far crane, the red tent'}.get(a.lasers) or 'MOXIR v2.8 columns try (not asked) - lasers on the column brackets'
rig['what'] = ('v2.7 with the six cubes on the far crane fanning a comb of lines over the dance floor (9.2-9.65 m, the lowest the rules allow) plus diagonals to the side walls at 5.5 m, and the 14 side washes tilted in as a red tent' if a.lasers == 'matrix' else 'v2.7 with every laser line from the far crane at its steepest down tilt under the rules (side walls 5.4-5.7 m, entry wall 9.0-9.8 m) and the 14 side washes tilted in as a red tent; everything else as v2.7' if a.lasers == 'crane' else 'v2.7 with the six LaserCubes moved from the far crane to the nave column brackets (6.0 m, x ±11.5, z 18/30/42) fanning a LID of 36 lines across the floor '
               f'(lowest 6.0 m, 4.3 m over a head), and the 14 side washes tilted {a.tent:.0f} deg in as a red tent; everything else as v2.7')
rig['symmetry'] = {'axis_x_m': X0, 'plates_mirror': 'the DJ axis (plates AND aims, v2.5) for every lamp; the laser lid mirrors about the column rows (x 0) because the columns are where it hangs', 'source': '2.8'}
rig.setdefault('owed', []).extend(['v2.8: lamp/crane strikes along all 36 lines (laser-margin run)'] + (['v2.8 columns try: brackets at 6.0 m (rigging), east lines over the kept machines'] if a.lasers == 'columns' else []))
rig['from_rig'] = a.src
# --- 3. more scenes (owner 2026-10-13 01:3x: "before I edit you can write some more scenes") ------------------------------------
# Six looks on the v2.8/v2.9 parts, in the show's two colours (ember #ff3a12, ash #e8e4dc), each one a single idea seen from
# the floor; appended to the loop after 'peak' with the loop's own fade/hold. Idempotent: a look already there is left alone.
EMBER, ASH = '#ff3a12', '#e8e4dc'
# LASER COLOUR RULE (2026-10-13, ledger N559; owner 17:2x: "make lasers too like real lasers - there are not lasers"). A show
# laser is a pure line of ONE wavelength: it reads saturated, never as a white lamp. Of the cube's three lines the green is the
# brightest per watt: V(525 nm) 0.793 against 0.048 at 455 nm and 0.191 at 638 nm (CIE photopic V(lambda), laserLine.js vLambda),
# so the laser scenes drive the green line alone:
#   'lasers', 'matrix', 'lasers-breathe', 'storm'  -> full green #00ff00 (drive [0, 1, 0]) on every line, the 40 W pair too;
#   'peak', 'white' (the owner's "everything on")    -> unchanged: each cube keeps its own colour (v1Looks), as he has seen them;
#   a laser in an ice scene -> the blue line alone #0000ff; in a fire scene -> the red line alone #ff0000. Today no ice or
#   fire scene drives the lasers ('ice-fire', 'ice-rings', 'embers' light no laser part).
# Carried by the look's `laser_colour` (epic-build.mjs v1Looks); applied after step 3b to every look that drives the lasers, and a
# look that drives them without a line here stops the build.
GREEN, BLUE, RED = '#00ff00', '#0000ff', '#ff0000'
LASER_COLOUR = {'lasers': GREEN, 'matrix': GREEN, 'lasers-breathe': GREEN, 'storm': GREEN, 'peak': None, 'white': None}
# What each scene IS, from the floor, in one line (owner 2026-10-13 15:5x: "scenes that I can understand well"); shown in
# the pickers as the explanation under the name.
INTENT = {
    'lasers': 'Only the lasers: the matrix over the dance floor, the hall dark.',
    'wall': 'The red wall: six beams behind the DJ and the side lines, all ember.',
    'lines': 'The white side lines; the hall steel, the columns and the tent low in ember.',
    'dark': 'One colour, ember, low everywhere: the hall breathes, nothing shouts.',
    'peak': 'Everything on at once: the side lines white, the lasers in, the rest ember.',
    'tent': 'The red tent alone: the two fans of side washes meet under the roof.',
    'dj': 'The DJ alone: the red plane behind him and a white kicker, the hall dark.',
    'columns': 'The hall in ash: the columns and the steel white, the floor dark.',
    'cut': 'The cut truss in ember, the side lines low: the ceiling is the picture.',
    'matrix': 'The laser matrix over a red floor: the tent at half, the lasers full.',
    'white': 'White out for seconds: everything in ash, the lasers in.',
    'frame': 'The white frame alone: the twelve B380F side beams, nothing else.',
    'red-floor': 'The whole floor red: the tent, the side lines and the DJ plane in ember, the walls dark.',
    'breath': 'Almost dark: a red breath behind the DJ, the back of the stage just lit.',
    'storm': 'The storm: lasers, white side lines and the cut truss at full, the tent red under them.',
}
MORE_LOOKS = [
    {'id': 'tent', 'title': 'The tent (the red fans alone meet under the roof)', 'act': 2,
     'parts': {'red tent left': [EMBER, 1.0], 'red tent right': [EMBER, 1.0], 'hall steel': [EMBER, 0.25], 'dj back': [EMBER, 0.1]}},
    {'id': 'dj', 'title': 'The DJ (the plane behind him, the kicker, nothing else)', 'act': 1,
     'parts': {'plane 1 (behind the DJ)': [EMBER, 1.0], 'dj kicker': [ASH, 0.3], 'dj back': [EMBER, 0.2], 'stage key': [ASH, 0.2]}},
    {'id': 'columns', 'title': 'The columns (the hall in ash, the floor dark)', 'act': 2,
     'parts': {'columns': [ASH, 0.7], 'hall steel': [ASH, 0.4], 'cut up': [ASH, 0.5]}},
    {'id': 'cut', 'title': 'The cut (the cut truss in ember, the side lines low)', 'act': 2,
     'parts': {'cut up': [EMBER, 1.0], 'cut down': [EMBER, 1.0], 'side line left': [EMBER, 0.4], 'side line right': [EMBER, 0.4], 'dj back': [EMBER, 0.1]}},
    {'id': 'matrix', 'title': 'The matrix (the lasers over a red floor)', 'act': 3,
     'parts': {'laser': [ASH, 1.0], 'red tent left': [EMBER, 0.5], 'red tent right': [EMBER, 0.5], 'plane 1 (behind the DJ)': [EMBER, 0.3]}},
    {'id': 'white', 'title': 'White out (everything in ash, the lasers in)', 'act': 3,
     'parts': {p: [ASH, 1.0] for p in ('laser', 'hall steel', 'columns', 'red tent left', 'red tent right', 'plane 1 (behind the DJ)',
                                       'side line left', 'side line right', 'cut up', 'cut down', 'dj back', 'dj kicker', 'stage key')}},
    {'id': 'frame', 'title': 'The frame (the twelve white side beams alone)', 'act': 2,
     'parts': {'side line left': [ASH, 1.0], 'side line right': [ASH, 1.0]}},
    {'id': 'red-floor', 'title': 'Red floor (tent, side lines and the DJ plane in ember)', 'act': 2,
     'parts': {'red tent left': [EMBER, 1.0], 'red tent right': [EMBER, 1.0], 'side line left': [EMBER, 0.6], 'side line right': [EMBER, 0.6],
               'plane 1 (behind the DJ)': [EMBER, 0.5]}},
    {'id': 'breath', 'title': 'Breath (almost dark, a red breath behind the DJ)', 'act': 1,
     'parts': {'plane 1 (behind the DJ)': [EMBER, 0.35], 'dj back': [EMBER, 0.1], 'stage key': [EMBER, 0.15]}},
    {'id': 'storm', 'title': 'The storm (lasers, white lines and the cut at full over a red tent)', 'act': 3,
     'parts': {'laser': [ASH, 1.0], 'side line left': [ASH, 1.0], 'side line right': [ASH, 1.0], 'cut up': [ASH, 1.0], 'cut down': [ASH, 1.0],
               'red tent left': [EMBER, 1.0], 'red tent right': [EMBER, 1.0]}},
]
for l in MORE_LOOKS: l['intent'] = INTENT[l['id']]
for l in rig['looks']: l.setdefault('intent', INTENT.get(l['id'], ''))
MORE_CUES = [('tent', 'the tent', 2, 12), ('dj', 'the DJ', 2, 10), ('columns', 'the columns', 2, 12),
             ('cut', 'the cut', 2, 10), ('matrix', 'the matrix', 2, 12), ('white', 'white out', 1, 6),
             ('frame', 'the frame', 2, 10), ('red-floor', 'red floor', 2, 12), ('breath', 'breath', 3, 14), ('storm', 'the storm', 1, 8)]
have = {l['id'] for l in rig['looks']}
parts_in_rig = {f.get('part') for f in rig['fixtures']}
for l in MORE_LOOKS:
    missing = set(l['parts']) - parts_in_rig
    assert not missing, (l['id'], missing)
    if l['id'] not in have: rig['looks'].append(copy.deepcopy(l))
have_cues = {c['look'] for c in rig['cues']}
for look, name, fade, hold in MORE_CUES:
    if look not in have_cues: rig['cues'].append({'look': look, 'name': name, 'fade': fade, 'hold': hold})
print(f"looks {len(rig['looks'])}, cues {len(rig['cues'])} (six scenes added 2026-10-13)")

# --- 3b. other colours and moving scenes (owner 2026-10-13 16:3x: "i need to other colorts and animations there also";
# brief B-2026-10-13-scenes-colour) ----------------------------------------------------------------------------------------------
# Eight looks, each ONE idea seen from the dance floor; seven MOVE through the existing motion layer: a look's `motion`
# {mode, bpm, depth, spatial, kinds, still} names a desk effect (serverXR/src/lighting/fx.js), played in the room by
# src/rigbuild/lookMotion.js. What it can say (code read 2026-10-13): one effect per look, a LEVEL multiplier on every lit lamp
# of its `kinds` (a lamp at or under `still` holds); 13 modes; spread over the lamps by patch order, across (x), along the
# hall (y) or out from the DJ table (radial), each reversible ('-'). It cannot pan, tilt or change a colour.
# PALETTE RULE. The show is ember + ash (owner). Both sit on the fire's own colour line, the blackbody (_fire below:
# Planck's law, CIE 1931 2 deg observer, sRGB): ember #ff3a12 has the hue of a ~1,000 K glow (nearest: 980 K), ash
# #e8e4dc is a white near 6,000 K. New colours come only FROM that fire or AGAINST it, two of them:
#   FLAME = the fire line at 2,000 K (a candle burns at ~1,900 K): the warm step from ember toward ash, for fire scenes.
#   ICE   = the complement of ember (hue +180 deg, same saturation and value): the strongest contrast to the show's red
#           (J. Itten, The Art of Color, 1961: complementary and cold-warm contrast; the warm/cool pair of stage light since
#           S. McCandless, A Method of Lighting the Stage, 1932). ICE is lit only beside ember, never as a mood of its own.
# At most two hues (plus ash) in one look. New colours go on the UP-PL5403 (RGBW, mixes them); the UP-B380F wheel's 14 slots
# are unpublished (agent-reports-2026-10-09/devices/fixtures-exact.md:27), so the beams keep ash (open) and ember. Lasers keep
# their cubes' colours (epic-build v1Looks). Strobe: the engine caps it under 3 Hz (strobeCap.js; WCAG 2.3.1 three-flash
# threshold), a strobe look holds <= 6 s. Tempi, depths and levels are ASSUMED (no beat sync in the room; the night is busked).
import colorsys  # noqa: E402


def _fire(T):
    """sRGB hex of a blackbody at T kelvin, brightest channel 1: Planck x CIE 1931 2 deg (Wyman, Sloan & Shirley 2013, JCGT 2(2),
    multi-lobe fit), XYZ -> linear sRGB (IEC 61966-2-1 D65 matrix), negatives clipped, sRGB transfer curve. 6,500 K -> #fff9fe."""
    g = lambda l, m, s1, s2: math.exp(-0.5 * ((l - m) / (s1 if l < m else s2)) ** 2)  # noqa: E731
    X = Y = Z = 0.0
    for l in range(380, 781, 5):
        p = l ** -5 / (math.exp(1.4388e7 / (l * T)) - 1)
        X += p * (1.056 * g(l, 599.8, 37.9, 31.0) + 0.362 * g(l, 442.0, 16.0, 26.7) - 0.065 * g(l, 501.1, 20.4, 26.2))
        Y += p * (0.821 * g(l, 568.8, 46.9, 40.5) + 0.286 * g(l, 530.9, 16.3, 31.1))
        Z += p * (1.217 * g(l, 437.0, 11.8, 36.0) + 0.681 * g(l, 459.0, 26.0, 13.8))
    rgb = [max(0.0, v) for v in (3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.2040 * Y + 1.0570 * Z)]
    enc = lambda v: 12.92 * v if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055  # noqa: E731
    return '#' + ''.join(f'{round(255 * enc(v / max(rgb))):02x}' for v in rgb)


def _complement(hexc):
    h, s, v = colorsys.rgb_to_hsv(*(int(hexc[i:i + 2], 16) / 255 for i in (1, 3, 5)))
    return '#' + ''.join(f'{round(255 * c):02x}' for c in colorsys.hsv_to_rgb((h + 0.5) % 1, s, v))


FLAME, ICE = _fire(2000), _complement(EMBER)
assert (FLAME, ICE) == ('#ff8d15', '#12d7ff'), (FLAME, ICE)  # the values the scenes were designed and measured with
PL, B38, LZ = 'up-pl5403', 'up-b380f', ['ext-lc-ultra-mk2', 'up-la40wf']
EVERY_LAMP = ('hall steel', 'columns', 'red tent left', 'red tent right', 'plane 1 (behind the DJ)', 'side line left', 'side line right',
              'cut up', 'cut down', 'dj back', 'dj kicker', 'stage key')


def _moves(mode, bpm, spatial, kinds, depth=255, still=0.0):
    return {'mode': mode, 'bpm': bpm, 'depth': depth, 'spatial': spatial, 'kinds': list(kinds), 'still': still}


INTENT.update({
    'ice-fire': 'Ice and fire: the wall behind the DJ burns red, the hall around you goes ice blue.',
    'red-wave': 'A red wave rolls along the tent, away from the DJ to the back of the hall, one every three seconds.',
    'embers': 'Embers: the steel and the columns glow low and spark in flame and red, each lamp on its own, like a fire going down.',
    'ice-rings': 'Ice-blue rings run out from the DJ across the hall, one a second; the wall behind the DJ stays red.',
    'run': 'The white side beams run toward the DJ, one run every two seconds; the tent glows low red.',
    'left-right': 'Left, right: the two white side lines answer each other on every beat.',
    'flash': 'Flash: the whole hall strobes white for five seconds, under three flashes a second.',
    'lasers-breathe': 'The laser roof breathes: it fades down and back up every eight seconds over a low red tent.',
})
MOTION_LOOKS = [
    {'id': 'ice-fire', 'title': 'Ice and fire (the DJ wall red, the hall ice blue)', 'act': 2,
     'parts': {'plane 1 (behind the DJ)': [EMBER, 1.0], 'dj back': [EMBER, 0.5], 'hall steel': [ICE, 0.6], 'columns': [ICE, 0.6],
               'red tent left': [ICE, 0.5], 'red tent right': [ICE, 0.5]}},
    {'id': 'red-wave', 'title': 'The red wave (along the tent, away from the DJ)', 'act': 2,
     'parts': {'red tent left': [EMBER, 1.0], 'red tent right': [EMBER, 1.0], 'plane 1 (behind the DJ)': [EMBER, 0.3]},
     'motion': _moves('sine', 20, 'y-', [PL])},
    {'id': 'embers', 'title': 'Embers (the steel sparks in flame and red)', 'act': 1,
     'parts': {'hall steel': [FLAME, 1.0], 'columns': [EMBER, 1.0], 'red tent left': [EMBER, 0.6], 'red tent right': [EMBER, 0.6]},
     'motion': _moves('sparkle', 20, 'patch', [PL], depth=150)},
    {'id': 'ice-rings', 'title': 'Ice rings (out from the DJ, the DJ wall red)', 'act': 2,
     'parts': {'hall steel': [ICE, 1.0], 'columns': [ICE, 1.0], 'red tent left': [ICE, 0.8], 'red tent right': [ICE, 0.8],
               'plane 1 (behind the DJ)': [EMBER, 0.8]},
     'motion': _moves('sine', 60, 'radial-', [PL])},
    {'id': 'run', 'title': 'Run to the DJ (a chase down the white side lines)', 'act': 3,
     'parts': {'side line left': [ASH, 1.0], 'side line right': [ASH, 1.0], 'plane 1 (behind the DJ)': [EMBER, 0.3],
               'red tent left': [EMBER, 0.25], 'red tent right': [EMBER, 0.25]},
     'motion': _moves('chase', 128, 'y-', [B38], still=0.35)},
    {'id': 'left-right', 'title': 'Left, right (the side lines answer each other)', 'act': 3,
     'parts': {'side line left': [ASH, 1.0], 'side line right': [ASH, 1.0], 'plane 1 (behind the DJ)': [EMBER, 0.3],
               'red tent left': [EMBER, 0.2], 'red tent right': [EMBER, 0.2]},
     'motion': _moves('bars', 64, 'x', [B38], still=0.35)},
    {'id': 'flash', 'title': 'Flash (the whole hall strobes white, 5 s)', 'act': 3,
     'parts': {p: [ASH, 1.0] for p in EVERY_LAMP},
     'motion': _moves('strobe', 128, 'patch', [PL, B38])},
    {'id': 'lasers-breathe', 'title': 'The lasers breathe (over a low red tent)', 'act': 3,
     'parts': {'laser': [ASH, 1.0], 'red tent left': [EMBER, 0.3], 'red tent right': [EMBER, 0.3], 'plane 1 (behind the DJ)': [EMBER, 0.3]},
     'motion': _moves('breathe', 30, 'patch', LZ, depth=200)},
]
# in the loop after 'storm': a calm contrast, three slow moves, the drive, the 5 s flash, the lasers breathing back into cue 1 'lasers'
MOTION_CUES = [('ice-fire', 'ice and fire', 2, 10), ('red-wave', 'the red wave', 2, 12), ('embers', 'embers', 3, 12),
               ('ice-rings', 'ice rings', 2, 10), ('run', 'run to the DJ', 1, 10), ('left-right', 'left, right', 1, 8),
               ('flash', 'flash', 0, 5), ('lasers-breathe', 'the lasers breathe', 2, 16)]
mode_of = {l['id']: (l.get('motion') or {}).get('mode') for l in MOTION_LOOKS}
for l in MOTION_LOOKS:
    l['intent'] = INTENT[l['id']]
    missing = set(l['parts']) - parts_in_rig
    assert not missing, (l['id'], missing)
    if l['id'] not in have: rig['looks'].append(copy.deepcopy(l)); have.add(l['id'])
for look, name, fade, hold in MOTION_CUES:
    assert look in have and (mode_of[look] != 'strobe' or hold <= 6), (look, hold)
    if look not in have_cues: rig['cues'].append({'look': look, 'name': name, 'fade': fade, 'hold': hold}); have_cues.add(look)
print(f"looks {len(rig['looks'])} ({sum(1 for l in rig['looks'] if l.get('motion'))} moving), cues {len(rig['cues'])} "
      f"(+{len(MOTION_LOOKS)} colour/motion scenes 2026-10-13; FLAME {FLAME}, ICE {ICE})")

# the laser colour rule (top of step 3) on every look that drives the lasers
for l in rig['looks']:
    if 'laser' not in l.get('parts', {}):
        continue
    assert l['id'] in LASER_COLOUR, ('a look drives the lasers without a laser colour rule', l['id'])
    if LASER_COLOUR[l['id']]:
        l['laser_colour'] = LASER_COLOUR[l['id']]; l['parts']['laser'] = [LASER_COLOUR[l['id']], l['parts']['laser'][1]]
print('laser colour rule: ' + ', '.join(f"{l['id']} {l.get('laser_colour', 'own')}" for l in rig['looks'] if 'laser' in l.get('parts', {})))

json.dump(rig, open(f'{a.repo}/{a.out}', 'w'), indent=1)
print(f'wrote {a.out} ({a.lasers}): {len(lines)} lines, {pulled} pulled/unchanged; lowest {rig["lasers"]["arithmetic"]["lowest_point_m"]} m; tent {len(side)} washes at {a.tent:.0f} deg')
for bid, pan, nm, L, h in lines: print(f'  {bid} pan {pan:+4d} -> {nm} {L:5.1f} m, end {h:.1f} m')
