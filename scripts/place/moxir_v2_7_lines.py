"""MOXIR v2.7 — lines left and right of the audience, a laser NET over the whole air, two 40 W lasers to the point above the door.
Owner 2026-10-12 05:2x: "lines of the wash and beams so left right and minimalism ... around the audience like 360; 2 big lasers go up
to the entrance (the two UPlight UP-LA40WF from the Sevan rental); 6 lasers cover the whole air like a matrix; the beams behind the DJ
like a wall stay; the other beams left and right of the audience"; and: "lasers can go 3 m up but from the hand of the audience".

From the v2.6 rig (moxir_v2_5_gathered.py layout), only these change:
  * the 12 island beams (planes 2-4) -> the two SIDE lines at X0 +-14 m (where the side washes stand), z 13..43 every 6 m, between
    the washes (z 10..46); each aimed up 60 deg and in toward the axis, so the audience stands in a corridor of light;
  * the six cubes keep their crane places; their lines are CROSSED (the leftmost cube aims right, the rightmost left) so lines from
    different cubes cross over the floor: a net, not a fan; four lines per cube (pans -27, -9, +9, +27 deg from the heading;
    tilts low / +1.5 / low / +1.5). Rule: the lowest point over any standing area >= HAND_RULE_Y (5.4 m, read from laser-distance.mjs) (a raised hand at 2.4 m
    + the 3 m separation of IEC TR 60825-3, owner 2026-10-12), the entry wall >= 9.0 m (door top 6 m + 3 m), the DJ crane crossing >= 9.2 m;
  * two UP-LA40WF (40 W, 1.3 mrad; fixtures.json kind 'laser', the rental units that ran at Sevan) on the back crane girder top at
    X0 +-5.0 m, each one straight line to ONE POINT above the door (x 0, y 9.8, z 53.8 — v2.3's point raised 0.17 m to clear the DJ crane rule).
Output: scripts/place/rigs/moxir-v2-7-2026-10-12.json; the laser lines' lamp/crane strikes are UNVALIDATED (laser-margin run owed).
  python3 scripts/place/moxir_v2_7_lines.py --repo .
"""
import argparse, json, math, sys, copy
ap = argparse.ArgumentParser(); ap.add_argument('--repo', required=True); ap.add_argument('--src', default='scripts/place/rigs/moxir-v2-6-2026-10-12.json')
ap.add_argument('--out', default='scripts/place/rigs/moxir-v2-7-2026-10-12.json'); ap.add_argument('--version', default='2.7')
ap.add_argument('--headings', default='60,36,12,-12,-36,-60', help='per cube, left to right: crossed (+-60 with pans +-27 keeps every line forward of the crane)'); ap.add_argument('--pans', default='-27,-9,9,27,-18,18')
ap.add_argument('--tilts', default='low,1.5,low,1.5,6,6', help='per pan: low = steepest down that keeps the hand rule; numbers in deg; the +6 pair fills the air up to the roof chords (owner 2026-10-12 05:24: "this area laser not close")')
ap.add_argument('--point', default='0,9.8,53.8', help='the point above the door; 9.8 so the line clears the DJ crane at z 3.2 by the 9.2 m rule (9.63 gave 9.199)')
a = ap.parse_args(); sys.path.insert(0, f'{a.repo}/scripts/place'); import moxir_v2_symmetry as sym
rig = json.load(open(f'{a.repo}/{a.src}')); X0 = sym.X0
WEST_X, EAST_X, WALL_Z, BACK_Z, ROOF_Y = -36.15, 60.15, 53.8, -53.6, 10.3
import laser_rules  # the hand rule's one home: laser-distance.mjs
HAND_RULE_Y = laser_rules.HAND_RULE_M
ENTRY_MIN, NEAR_Z, NEAR_MIN = 9.0, 3.2, 9.2
SIDE_X_OLD, SIDE_X, BEAM_Z = 14.0, 8.2, (13.0, 19.0, 25.0, 31.0, 37.0, 43.0)   # v2.7c (owner 2026-10-12 05:53: the machines on the +x side STAY) ->
# both side lines move in to X0 +-8.2 (x -13.4 / +3.0): the right one clear of the blower, ducts, canopy, tank and gallery (x >= 3.6), the
# left one mirrored for the symmetry round the DJ. Fenced strips as before (moxir_v2_5_gathered.py SIDE_PENS, 2.4 m wide).
def euler_for(d): c = math.asin(max(-1, min(1, d[0]))); return [round(math.atan2(-d[2], -d[1]), 4), 0.0, round(c, 4)]
def first_hit(p, d):
    hits = []
    for name, axis, val in (('east side wall (x +60.2, two spans over)', 0, EAST_X), ('west side wall (x -36.2, one span over)', 0, WEST_X),
                            ('entry (NW) end wall above the door', 2, WALL_Z), ('back end wall', 2, BACK_Z), ('roof bottom chords (y 10.3)', 1, ROOF_Y), ('FLOOR', 1, 0.0)):
        if abs(d[axis]) < 1e-9: continue
        t = (val - p[axis]) / d[axis]
        if t > 0: hits.append((t, name))
    t, name = min(hits); return t, name, [round(p[i] + d[i] * t, 2) for i in range(3)]
def ok(p, d, L, name, T):
    kind = 'entry' if name.startswith('entry') else 'roof' if name.startswith('roof') else 'floor' if name == 'FLOOR' else 'wall'
    if kind == 'floor': return False
    if kind == 'entry' and T[1] < ENTRY_MIN: return False
    if kind == 'wall' and T[1] < HAND_RULE_Y: return False
    if d[2] > 1e-9 and (NEAR_Z - p[2]) / d[2] < L and p[1] + d[1] * (NEAR_Z - p[2]) / d[2] < NEAR_MIN: return False
    return True
def low_tilt(p, pa):
    t = -30.0
    while t < 1.5:
        ti = math.radians(t); d = [math.sin(pa) * math.cos(ti), math.sin(ti), math.cos(pa) * math.cos(ti)]; L, name, T = first_hit(p, d)
        if ok(p, d, L, name, T): return t
        t += 0.5
    return 1.5
# --- 0. the side WASHES move with the lines (they stood at X0 +-14 since v2.5) ----------------------------------------------------------
moved = 0
for f in rig['fixtures']:
    if f['type'] == 'up-pl5403' and f.get('part') in ('hall steel', 'columns') and abs(abs(f['p'][0] - X0) - SIDE_X_OLD) < 0.11:
        s_ = -1 if f['p'][0] < X0 else 1; f['p'][0] = round(X0 + s_ * SIDE_X, 2); moved += 1
        f['position'] = (f.get('position', '').split('; v2.7')[0] + f'; v2.7c: side line moved in to {SIDE_X} m off the axis (the +x machines stay, owner 2026-10-12)')
print(f'side washes moved: {moved}')
# --- 1. the island beams -> the side lines -------------------------------------------------------------------------------------
heads = [f for f in rig['fixtures'] if f['type'] == 'up-b380f']
wall = [f for f in heads if f['part'] == 'plane 1 (behind the DJ)']; islands = sorted([f for f in heads if f not in wall], key=lambda f: (f['p'][0], f['p'][2]))
assert len(wall) == 6 and len(islands) == 12, (len(wall), len(islands))
left, right = islands[:6], islands[6:]
for side, group, s in (('left', left, -1), ('right', right, 1)):
    x = round(X0 + s * SIDE_X, 2)
    for f, z in zip(group, BEAM_Z):
        p = [x, 0.7, z]; e = math.radians(60.0)
        d = sym.unit((-s * math.cos(e), math.sin(e), 0.0))          # up 60 deg, straight in toward the axis
        f['p'] = p; f['r'] = sym.rot_for_dir(d); f['part'] = f'side line {side}'; f['layer'] = 'lines'
        f['position'] = f'v2.7 (moxir_v2_7_lines.py): side line {side}, {SIDE_X:.0f} m off the DJ axis at z {z:+.0f}, between the side washes; up 60 deg, aimed in over the floor'
        f['throw_m'] = None; f['throw_source'] = 'epic-build default (reachOf) until the footprint run'
# --- 2. the net: six cubes, crossed headings, four lines each ------------------------------------------------------------------------
cubes = sorted([f for f in rig['fixtures'] if f['type'] == 'ext-lc-ultra-mk2'], key=lambda f: f['p'][0])
heads_deg = [float(v) for v in a.headings.split(',')]; pans = [float(v) for v in a.pans.split(',')]; tilts = [v if v == 'low' else float(v) for v in a.tilts.split(',')]
tubes, lines = [], []
for n, (f, h) in enumerate(zip(cubes, heads_deg), 1):
    p = f['p']; mid = [math.sin(math.radians(h)) * math.cos(math.radians(6)), math.sin(math.radians(6)), math.cos(math.radians(h)) * math.cos(math.radians(6))]
    f['r'] = euler_for(mid); f['heading_deg'] = h
    f['position'] = f['position'].split('; v2.4')[0] + f'; v2.7 (moxir_v2_7_lines.py): crossed heading {h:+.0f} deg from +z, 4 lines (pans {a.pans}), a net over the audience'
    f['laser']['beams'] = []
    for k, (pan, tilt) in enumerate(zip(pans, tilts)):
        bid = f'{n}{"abcdef"[k]}'; pa = math.radians(h + pan); tl = low_tilt(p, pa) if tilt == 'low' else tilt; ti = math.radians(tl)
        d = [math.sin(pa) * math.cos(ti), math.sin(ti), math.cos(pa) * math.cos(ti)]; L, name, T = first_hit(p, d)
        b = {'id': bid, 'off': False, 'duty': 1.0, 'to': T, 'length_m': round(L, 3), 'r': euler_for(d), 'pan_deg': round(h + pan, 2), 'tilt_deg': tl, 'ends_on': name,
             'end_height_m': T[1], 'lowest_m': round(min(p[1], T[1]), 2), 'over_hand_rule_m': round(min(p[1], T[1]) - HAND_RULE_Y, 2),
             'checks': f'lowest point >= {HAND_RULE_Y} m over standing areas (hand 2.4 m + 3 m, owner 2026-10-12), entry wall >= {ENTRY_MIN} m, DJ crane crossing >= {NEAR_MIN} m; lamp/crane strikes UNVALIDATED'}
        f['laser']['beams'].append(b); tubes.append({'beam': bid, 'cube': f['id'], 'from': p, 'to': T, 'half_fan_deg': 1.008, 'ends_on': name}); lines.append((bid, round(h + pan), tl, name, round(L, 1)))
# --- 3. two UP-LA40WF AT THE ENTRANCE (owner's drawing 2026-10-12 05:26: "lasers from sevan this is entrance") -----------------------
# On the entry wall above the door (y 7.0, door top 6.0), 4 m left and right of the door axis (x 0), each firing UP over the crowd,
# crossed, to the roof chords above the back part of the floor (target the DJ axis -+8 m, y 10.2, z -12): the line rises from 7.0 m
# at the door to the chords; at the DJ crane (z 3.2) it passes at ~9.5 m (rule >= 9.2 m), everywhere >= 5.4 m over heads.
ENTRY_MOUNT = (7.0, 53.3); AIM_Z = -12.0
rig['fixtures'] = [f for f in rig['fixtures'] if f['type'] != 'up-la40wf']
for n, (u, s_) in enumerate(((-4.0, 1), (4.0, -1)), 1):
    p = [u, ENTRY_MOUNT[0], ENTRY_MOUNT[1]]; T0 = (X0 + s_ * 8.0, ROOF_Y - 0.1, AIM_Z)
    d = sym.unit((T0[0] - p[0], T0[1] - p[1], T0[2] - p[2])); L, name, T = first_hit(p, d)
    assert ok(p, d, L, name, T), (name, T)
    rig['fixtures'].append({'id': f'rig-laser40-{n}', 'type': 'up-la40wf', 'part': 'laser', 'layer': 'lines', 'status': 'used', 'p': p, 'r': euler_for(d), 'colour': '#e8e4dc', 'angle_rad': 0.0013,
        'position': f'v2.7 (moxir_v2_7_lines.py): UPlight UP-LA40WF (40 W, from the Sevan rental) on the entry wall above the door, {abs(u):.0f} m {"left" if u < 0 else "right"} of the door axis, {ENTRY_MOUNT[0]} m up; fires up over the crowd, crossed, to the roof above the back of the floor',
        'source': 'owner 2026-10-12 05:2x: "we take also 2 lasers from Sevan and they go up to the entrance"; his drawing 05:26: the units stand AT the entrance; 05:4x "they stay at entrance" (decided)',
        'mount': 'UNVALIDATED: a wall bracket or a tower at the door at 7.0 m; the rigging check is owed (SIDE 2)',
        'laser': {'colour': 'ash white', 'beams': [{'id': f'4{n}', 'off': False, 'duty': 1.0, 'to': T, 'length_m': round(L, 3), 'r': euler_for(d), 'ends_on': name, 'end_height_m': T[1],
                  'lowest_m': round(min(p[1], T[1]), 2), 'over_hand_rule_m': round(min(p[1], T[1]) - HAND_RULE_Y, 2), 'checks': f'static line, no scan; from {ENTRY_MOUNT[0]} m at the door up to the roof chords; DJ crane crossing >= {NEAR_MIN} m; lamp/crane strikes UNVALIDATED'}]}})
    tubes.append({'beam': f'4{n}', 'cube': f'rig-laser40-{n}', 'from': p, 'to': T, 'half_fan_deg': 0.0, 'ends_on': name})
rig.setdefault('kit', {})['UP-LA40WF'] = 2
# --- 4. five scenes, a faster loop (owner 2026-10-12 05:2x: "create 5 scenes and loop a bit faster") --------------------------------------
ASH, EMBER = '#e8e4dc', '#ff3a12'
looks = {l['id']: l for l in rig['looks']}
for lid in ('dark', 'peak'):
    looks[lid]['parts']['side line left'] = [EMBER if lid == 'dark' else ASH, 0.5 if lid == 'dark' else 1.0]
    looks[lid]['parts']['side line right'] = looks[lid]['parts']['side line left']
wall = {'id': 'wall', 'title': 'The wall (beams behind the DJ + the side lines)', 'act': looks['peak'].get('act'),
        'parts': {'plane 1 (behind the DJ)': [EMBER, 1.0], 'side line left': [EMBER, 0.8], 'side line right': [EMBER, 0.8], 'cut down': [EMBER, 0.3]}}
lines_ = {'id': 'lines', 'title': 'The lines (side washes and beams, columns)', 'act': looks['peak'].get('act'),
          'parts': {'side line left': [ASH, 0.9], 'side line right': [ASH, 0.9], 'hall steel': [EMBER, 0.6], 'columns': [EMBER, 0.6], 'stage key': [ASH, 0.3]}}
rig['looks'] = [looks['lasers'], wall, lines_, looks['dark'], looks['peak']]
rig['cues'] = [{'look': 'lasers', 'name': 'the net (lasers only)', 'fade': 2, 'hold': 12}, {'look': 'wall', 'name': 'the wall', 'fade': 2, 'hold': 12},
               {'look': 'lines', 'name': 'the lines', 'fade': 2, 'hold': 12}, {'look': 'dark', 'name': 'dark (one colour)', 'fade': 3, 'hold': 15}, {'look': 'peak', 'name': 'peak', 'fade': 2, 'hold': 15}]
rig['version'] = a.version; rig['title'] = 'MOXIR v2.7 - lines left and right, a laser net, two 40 W lasers to the door'
rig['what'] = 'v2.6 + the 12 island beams on the side lines (X0 +-14, z 13..43), the six cubes crossed into a net (hand rule 5.4 m), two UP-LA40WF to the point above the door'
rig['lasers'].update({'tubes': tubes, 'previous': 'v2.6 fan (moxir-v2-6-2026-10-12.json)',
    'design': 'v2.7 net: six cubes on the far crane, crossed headings +60..-60 (left cube aims right), 4 lines each; two UP-LA40WF to one point above the door',
    'hand_rule': {'lowest_over_standing_m': HAND_RULE_Y, 'basis': 'owner 2026-10-12: 3 m counted from a raised hand (2.4 m) — IEC TR 60825-3 separation above the audience'},
    'arithmetic': {'lines': len(lines) + 2, 'per_cube': 6, 'lowest_point_m': round(min(t['from'][1] if t['from'][1] < t['to'][1] else t['to'][1] for t in tubes), 2), 'ends': sorted(set(l[3] for l in lines)),
                   'length_m_min_max': [min(l[4] for l in lines), max(l[4] for l in lines)], 'basis': 'this script, UNVALIDATED for lamp/crane strikes'}})
json.dump(rig, open(f'{a.repo}/{a.out}', 'w'), indent=1)
print(f'wrote {a.out}: {len(lines)} net lines + 2 x 40 W; lowest {rig["lasers"]["arithmetic"]["lowest_point_m"]} m; ' + '; '.join(f'{b} pan {pa} tilt {ti} -> {nm.split(" (")[0]} {L} m' for b, pa, ti, nm, L in lines))
