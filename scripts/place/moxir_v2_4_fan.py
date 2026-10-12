"""MOXIR v2.4 — the six LaserCube Ultra MK2 on the far crane FAN the whole air space (owner 2026-10-11: "lasers beam will go
to close wide ... i want that will cover all air space"; his answers: not the full 360, the whole area; all six on the back
crane; beams end on walls and roof only, never below 3 m over any place people stand - IEC TR 60825-3).

Reads the v2.3 rig (cubes on the far crane girder top, z -42.45, y 8.81, x -4.5..-1.0). Each cube keeps its place and gets a
mount heading across the forward half of the hall (pan -80..+80 deg from +z); its scanned fan is drawn as 4 lines (pan +-18
deg, tilt 1.5 and 24 deg) - a previs of a scan, the real cube fills between. Per heading two lines: one just above horizontal (+1.5 deg) and one 'low' - the steepest downward tilt whose end still meets
the rule (side/back walls >= 3.5 m, the entry wall >= 9.0 m = door top 6 + 3 m, >= 9.2 m where a line crosses the DJ crane at z 3.2),
so the sheet of lines fills the air from 9 m down to 3.5 m along the walls. Each line ends on the first of: a side wall
(x -36.2 / +60.2, the real outer walls one and two spans over; x +-12 are column rows), the entry wall (z 53.8), the back wall (z -53.8) or the roof bottom chords (y 10.3). Scan fan width ASSUMED
+-30 deg (not in fixtures.json; owed from the LaserOS MK2 manual). Lamp/crane strikes along the lines: UNVALIDATED, the
laser-margin Scene run is owed. Output: scripts/place/rigs/moxir-v2-4-2026-10-11.json.
  python3 scripts/place/moxir_v2_4_fan.py --repo . [--headings -80,-48,-16,16,48,80] [--tilts 1.5,24] [--pans -18,18]
"""
import argparse, json, math
ap = argparse.ArgumentParser(); ap.add_argument('--repo', required=True); ap.add_argument('--src', default='scripts/place/rigs/moxir-v2-3-2026-10-11.json')
ap.add_argument('--headings', default='-80,-48,-16,16,48,80'); ap.add_argument('--tilts', default='1.5,low', help='degrees, or "low" = the steepest DOWNWARD tilt whose end still meets the rule (side/back walls >= 3.5 m, entry wall >= 9.0 m = door top 6 + 3, and >= 9.2 m where it crosses the DJ crane at z 3.2)'); ap.add_argument('--pans', default='-18,18')
ap.add_argument('--out', default='scripts/place/rigs/moxir-v2-4-2026-10-11.json'); ap.add_argument('--version', default='2.4')
a = ap.parse_args(); rig = json.load(open(f'{a.repo}/{a.src}'))
WEST_X, EAST_X, WALL_Z, ROOF_Y, RULE_Y = -36.15, 60.15, 53.8, 10.3, 3.0   # the hall is 1+1+2 spans wide: inside x -36.2..60.2 (moxir_v2_symmetry.py HALL_IN); x +-12 are COLUMN ROWS, not walls (v2.4 first build had walls at +-12: WRONG, fixed 2026-10-11)
def euler_for(d): c = math.asin(max(-1, min(1, d[0]))); return [round(math.atan2(-d[2], -d[1]), 4), 0.0, round(c, 4)]
def first_hit(p, d):
    hits = []
    for name, axis, val in (('east side wall (x +60.2, two spans over)', 0, EAST_X), ('west side wall (x -36.2, one span over)', 0, WEST_X), ('entry (NW) end wall above the door', 2, WALL_Z), ('back wall', 2, -WALL_Z), ('roof bottom chords', 1, ROOF_Y), ('FLOOR (never allowed)', 1, 0.0)):
        if abs(d[axis]) < 1e-9: continue
        t = (val - p[axis]) / d[axis]
        if t > 0: hits.append((t, name))
    t, name = min(hits); return t, name, [round(p[i] + d[i] * t, 2) for i in range(3)]
cubes = sorted([f for f in rig['fixtures'] if f.get('type') == 'ext-lc-ultra-mk2'], key=lambda f: f['p'][0])
heads = [float(v) for v in a.headings.split(',')]; tilts = [v if v == 'low' else float(v) for v in a.tilts.split(',')]
pans = [float(v) for v in a.pans.split(',')]
MIN_END = {'entry': 9.0, 'side': 3.5, 'back': 3.5, 'roof': 0.0, 'floor': 999.0}; NEAR_Z, NEAR_MIN = 3.2, 9.2
def ok(p, d, L, name, T):
    kind = 'entry' if name.startswith('entry') else 'roof' if name.startswith('roof') else 'back' if name.startswith('back') else 'floor' if name.startswith('FLOOR') else 'side'
    if T[1] < MIN_END[kind]: return False
    if d[2] > 1e-9 and (NEAR_Z - p[2]) / d[2] < L and p[1] + d[1] * (NEAR_Z - p[2]) / d[2] < NEAR_MIN: return False
    return True
def low_tilt(p, pa):
    t = -30.0
    while t < 1.5:
        ti = math.radians(t); d = [math.sin(pa) * math.cos(ti), math.sin(ti), math.cos(pa) * math.cos(ti)]; L, name, T = first_hit(p, d)
        if ok(p, d, L, name, T): return t
        t += 0.5
    return 1.5; pans = [float(v) for v in a.pans.split(',')]
tubes = []; lines = []
for n, (f, h) in enumerate(zip(cubes, heads), 1):
    p = f['p']; mid = [math.sin(math.radians(h)) * math.cos(math.radians(12)), math.sin(math.radians(12)), math.cos(math.radians(h)) * math.cos(math.radians(12))]
    f['r'] = euler_for(mid); f['heading_deg'] = h
    f['position'] = (f['position'].split(' aimed')[0] + f'; v2.4 (moxir_v2_4_fan.py): mount heading {h:+.0f} deg from +z, scanned fan drawn as {len(tilts)*len(pans)} lines')
    f['laser']['beams'] = []
    k = 0
    for tilt in tilts:
        for pan in pans:
            k += 1; bid = f'{n}{"abcd"[k-1]}'; pa = math.radians(h + pan); tl = low_tilt(p, pa) if tilt == 'low' else tilt; ti = math.radians(tl)
            d = [math.sin(pa) * math.cos(ti), math.sin(ti), math.cos(pa) * math.cos(ti)]
            L, name, T = first_hit(p, d)
            b = {'id': bid, 'off': False, 'duty': 1.0, 'to': T, 'length_m': round(L, 3), 'r': euler_for(d), 'pan_deg': round(h + pan, 2), 'tilt_deg': tl,
                 'ends_on': name, 'end_height_m': T[1], 'lowest_m': round(min(p[1], T[1]), 2), 'over_rule_line_m': round(min(p[1], T[1]) - RULE_Y, 2),
                 'checks': 'end >= 3.5 m on side/back walls, >= 9.0 m on the entry wall, >= 9.2 m crossing the DJ crane (this script); lamp/crane strikes UNVALIDATED - laser-margin Scene run owed (v2.4)'}
            f['laser']['beams'].append(b); tubes.append({'beam': bid, 'cube': f['id'], 'from': p, 'to': T, 'half_fan_deg': 1.008, 'ends_on': name})
            lines.append((bid, round(h + pan), tl, name, round(L, 1)))
rig['version'] = a.version
# previs brightness (owner 2026-10-11: "make lasers too full bright that i can see what that cover"): a lasers-only look at 100 % as the
# first cue, and peak's lasers at 100 %; the measured 0.16 white-out cap (2026-10-09) stays in desk_caps as the show desk's ceiling.
import copy
peak = [l for l in rig['looks'] if l['id'] == 'peak'][0]
if not any(l['id'] == 'lasers' for l in rig['looks']):
    rig['looks'].insert(0, {'id': 'lasers', 'title': 'Lasers only (full, previs)', 'act': peak.get('act'), 'parts': {'laser': ['#e8e4dc', 1.0]},
                            'desk_caps': {'laser': {'fader': 1.0, 'note': 'PREVIS override to see the fan coverage (owner 2026-10-11); the 0.16 cap measured 2026-10-09 (peak.desk_caps) still rules the show desk'}}})
peak['parts']['laser'] = ['#e8e4dc', 1.0]; peak.setdefault('notes', []).append('v2.4 previs: lasers at 1.0 to show the fan (owner 2026-10-11); cap 0.16 stays in desk_caps')
if not any(c.get('look') == 'lasers' for c in rig['cues']):
    c = copy.deepcopy([c for c in rig['cues'] if c.get('look') == 'peak'][0]); c.update({'look': 'lasers', 'name': 'lasers only (full, previs)'}); rig['cues'].insert(0, c)
rig['lasers'].update({'tubes': tubes, 'previous': 'v2.3 one point above the door (moxir-v2-3-2026-10-11.json)',
    'design': 'v2.4 fan: six cubes on the far crane girder top, headings -80..+80 deg across the forward half, each scanning a fan drawn as 4 lines; all lines rise from 8.81 m and end on walls or roof chords (owner 2026-10-11: cover all the air space, not the full 360)',
    'scan_fan_deg': {'value': 60, 'basis': 'ASSUMED +-30 deg, NOT in fixtures.json; read the LaserOS MK2 manual (owed)'},
    'arithmetic': {'lines': len(lines), 'lowest_point_m': round(min(min(b['lowest_m'] for b in f['laser']['beams']) for f in cubes), 2), 'over_rule_line_m': round(min(min(b['lowest_m'] for b in f['laser']['beams']) for f in cubes) - RULE_Y, 2), 'rule': 'IEC TR 60825-3: >= 3.0 m above places where people stand',
                   'ends': sorted(set(l[3] for l in lines)), 'length_m_min_max': [min(l[4] for l in lines), max(l[4] for l in lines)], 'basis': 'this script, UNVALIDATED for lamp/crane strikes'}})
json.dump(rig, open(f'{a.repo}/{a.out}', 'w'), indent=1)
print(f'wrote {a.out}: {len(lines)} lines; ' + '; '.join(f'{b} pan {pa} tilt {ti} -> {nm.split(" (")[0]} {L} m' for b, pa, ti, nm, L in lines))
