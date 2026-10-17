#!/usr/bin/env python3
"""scenes_v7_add20.py — MOXIR v7 = the 100 v6 scenes + 20 the owner described (2026-10-18 01:2x, verbatim in the ledger):
red beams, amber washes, some white; pairs with and without lasers (laser = DOTS: the cubes' net, the 40 W static dots); truss washes
on first, then strobe; every name says what is in the scene. Truss washes = UP-PL5403 cut up / cut down / dj kicker (3-5.7 m);
beams = UP-B380F (side lines, plane 1, wheel slot Red or Open); floor washes = the other UP-PL5403 parts. Flash rule kept (<= 3/s).
    python3 -I -B scenes_v7_add20.py V6_SCENES.json OUT.json
"""
import copy, json, sys
src, out = sys.argv[1:3]; d = json.load(open(src))
RED, AMBER, WHITE = '#ff3a12', '#ffa000', '#ffffff'
TRUSS = ['cut up', 'cut down', 'dj kicker']; FLOOR = ['line L', 'line R', 'line A', 'line B', 'road', 'dj back']; BEAMS = ['side line left', 'side line right', 'plane 1']
def heads(p, period, pan, tilt): return {'pattern': p, 'period_s': period, 'pan_deg': pan, 'tilt_deg': tilt, 'spatial': 'left-right', 'kinds': ['up-b380f']}
def motion(mode, bpm, kinds): return {'mode': mode, 'bpm': bpm, 'depth': 255, 'spatial': 'patch', 'kinds': kinds, 'still': 0.0}
W, B = ['up-pl5403'], ['up-b380f']
# (name, {part group: colour}, motion, heads, laser colour or None, hold)
S = [('Truss washes amber · on',                {'truss': AMBER},                    motion('breathe', 20, W), None, None, 16),
     ('Truss washes amber · strobe',            {'truss': AMBER},                    motion('strobe', 132, W), None, None, 10),
     ('Red beams · amber washes',               {'beams': RED, 'floor': AMBER, 'truss': AMBER}, motion('breathe', 33, W), heads('wave', 7.272, 60, 25), None, 20),
     ('Red beams · amber washes · laser dots',  {'beams': RED, 'floor': AMBER, 'truss': AMBER}, motion('breathe', 33, W), heads('wave', 7.272, 60, 25), RED, 20),
     ('Red beams · white washes',               {'beams': RED, 'floor': WHITE, 'truss': WHITE}, motion('pulse', 66, W), heads('circle', 14.544, 120, 25), None, 18),
     ('Red beams · white washes · laser dots',  {'beams': RED, 'floor': WHITE, 'truss': WHITE}, motion('pulse', 66, W), heads('circle', 14.544, 120, 25), RED, 18),
     ('White beams · amber washes',             {'beams': WHITE, 'floor': AMBER, 'truss': AMBER}, motion('sine', 33, W), heads('figure8', 14.544, 90, 25), None, 18),
     ('White beams · amber washes · laser dots', {'beams': WHITE, 'floor': AMBER, 'truss': AMBER}, motion('sine', 33, W), heads('figure8', 14.544, 90, 25), AMBER, 18),
     ('Red beams only · sweep',                 {'beams': RED},                      motion('chase', 66, B), heads('wave', 3.636, 170, 25), None, 16),
     ('Red beams only · sweep · laser dots',    {'beams': RED},                      motion('chase', 66, B), heads('wave', 3.636, 170, 25), RED, 16),
     ('Amber washes only · breathe',            {'floor': AMBER, 'truss': AMBER},    motion('breathe', 20, W), None, None, 20),
     ('Amber washes only · laser dots',         {'floor': AMBER, 'truss': AMBER},    motion('breathe', 20, W), None, AMBER, 20),
     ('Truss washes white · on',                {'truss': WHITE},                    motion('breathe', 20, W), None, None, 14),
     ('Truss washes white · strobe',            {'truss': WHITE},                    motion('strobe', 132, W), None, None, 10),
     ('Red beams · amber truss · fan',          {'beams': RED, 'truss': AMBER},      motion('comet', 66, W), heads('nod', 7.272, 0, 40), None, 18),
     ('Red beams · amber truss · fan · laser dots', {'beams': RED, 'truss': AMBER},  motion('comet', 66, W), heads('nod', 7.272, 0, 40), RED, 18),
     ('Everything red and amber · full',        {'beams': RED, 'floor': AMBER, 'truss': AMBER}, motion('pump', 132, W + B), heads('circle', 7.272, 170, 30), None, 16),
     ('Everything red and amber · full · laser dots', {'beams': RED, 'floor': AMBER, 'truss': AMBER}, motion('pump', 132, W + B), heads('circle', 7.272, 170, 30), AMBER, 16),
     ('Red beams · amber washes · strobe',      {'beams': RED, 'floor': AMBER, 'truss': AMBER}, motion('strobe', 132, W + B), heads('wave', 3.636, 120, 25), None, 10),
     ('Red beams · amber washes · strobe · laser dots', {'beams': RED, 'floor': AMBER, 'truss': AMBER}, motion('strobe', 132, W + B), heads('wave', 3.636, 120, 25), RED, 10)]
donor = next(s for s in d['scenes'] if s.get('laser') and s['laser'].get('pattern') == 'net')
tmpl = d['scenes'][0]; new = []
for i, (name, groups, mo, hd, lc, hold) in enumerate(S, start=101):
    parts = {}
    for g, col in groups.items():
        for p in {'truss': TRUSS, 'floor': FLOOR, 'beams': BEAMS}[g]: parts[p] = [col, 1.0]
    s = {k: copy.deepcopy(tmpl[k]) for k in tmpl}
    s.update({'id': f'v7-{i:03d}', 'title': name, 'act': 6, 'intent': name, 'parts': parts, 'motion': mo,
              'heads': hd or {'pattern': 'nod', 'period_s': 29.088, 'pan_deg': 0, 'tilt_deg': 3, 'spatial': 'all', 'kinds': ['up-b380f']},
              'cue': {'fade_s': 2, 'hold_s': hold}, 'notes': 'owner 2026-10-18 01:2x (v7 add 20)', 'family': ['red-amber'],
              'laser_colour': lc, 'laser_lines': None, 'laser40': None, 'energy': 1.0})
    if lc:
        L = copy.deepcopy(donor['laser']); L.update({'colour': lc, 'pattern': 'net', 'pitch_deg': 0, 'amplitude_deg': 3, 'cubes': 'all', 'level': 1.0, 'breathe': None, 'hits': None})
        L['why'] = 'owner: laser scenes are DOTS'; s['laser'] = L; parts['laser'] = [lc, 1.0]
    else: s['laser'] = None
    new.append(s)
d['scenes'] += new
if not any(p.get('hex') == AMBER for p in d['palette']):
    d['palette'].append({'key': 'AM', 'name': 'amber (washes, lasers)', 'hex': AMBER, 'how': 'the owner, 2026-10-18 01:2x: "amber washes"', 'sampled': None})
d['version'] = '7.0'; d['what'] = 'MOXIR v7: v6 (100) + 20 red/amber scenes named by content (owner 01:2x)'
json.dump(d, open(out, 'w'), indent=1); print(len(d['scenes']), 'scenes')
