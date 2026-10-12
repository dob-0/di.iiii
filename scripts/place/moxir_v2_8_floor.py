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
ap.add_argument('--comb-x', default='-17,6', help='matrix: the comb spans these x (abs, m) on the entry wall, evenly')
ap.add_argument('--comb-per-cube', type=int, default=4); ap.add_argument('--diag-z', default='20,40', help='matrix: z of the diagonals\' ends on the side walls')
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
    diag_zs = [float(v) for v in a.diag_z.split(',')]
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
# --- 3. the record -----------------------------------------------------------------------------------------------------------------
rig['version'] = a.version; rig['date'] = '2026-10-13'; rig['written_by'] = 'scripts/place/moxir_v2_8_floor.py'
rig['title'] = {'crane': 'MOXIR v2.8 - from the dance floor: the lasers down to the rules from the far crane, the red tent', 'matrix': 'MOXIR v2.8 - a laser matrix over the dance floor from the far crane, the red tent'}.get(a.lasers) or 'MOXIR v2.8 columns try (not asked) - lasers on the column brackets'
rig['what'] = ('v2.7 with the six cubes on the far crane fanning a comb of lines over the dance floor (9.2-9.65 m, the lowest the rules allow) plus diagonals to the side walls at 5.5 m, and the 14 side washes tilted in as a red tent' if a.lasers == 'matrix' else 'v2.7 with every laser line from the far crane at its steepest down tilt under the rules (side walls 5.4-5.7 m, entry wall 9.0-9.8 m) and the 14 side washes tilted in as a red tent; everything else as v2.7' if a.lasers == 'crane' else 'v2.7 with the six LaserCubes moved from the far crane to the nave column brackets (6.0 m, x ±11.5, z 18/30/42) fanning a LID of 36 lines across the floor '
               f'(lowest 6.0 m, 4.3 m over a head), and the 14 side washes tilted {a.tent:.0f} deg in as a red tent; everything else as v2.7')
rig['symmetry'] = {'axis_x_m': X0, 'plates_mirror': 'the DJ axis (plates AND aims, v2.5) for every lamp; the laser lid mirrors about the column rows (x 0) because the columns are where it hangs', 'source': '2.8'}
rig.setdefault('owed', []).extend(['v2.8: lamp/crane strikes along all 36 lines (laser-margin run)'] + (['v2.8 columns try: brackets at 6.0 m (rigging), east lines over the kept machines'] if a.lasers == 'columns' else []))
rig['from_rig'] = a.src
json.dump(rig, open(f'{a.repo}/{a.out}', 'w'), indent=1)
print(f'wrote {a.out} ({a.lasers}): {len(lines)} lines, {pulled} pulled/unchanged; lowest {rig["lasers"]["arithmetic"]["lowest_point_m"]} m; tent {len(side)} washes at {a.tent:.0f} deg')
for bid, pan, nm, L, h in lines: print(f'  {bid} pan {pan:+4d} -> {nm} {L:5.1f} m, end {h:.1f} m')
