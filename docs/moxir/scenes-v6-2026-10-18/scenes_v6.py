#!/usr/bin/env python3
"""scenes_v6.py — MOXIR scenes v6 (2026-10-18): 100 new scenes designed from the dance floor, every light and every laser in every scene.
Owner 2026-10-18 00:5x: "imagine you are in the position of the audience, make it more crazy, update, new 100 scenes, full use all lights
all lasers". Still in force: full power (every lit part 1.0, contrast from motion, never from dimming), underground mood, techno palette
(lime, ember, ash white; red only as an accent), strobes only white, wild head movement, lines not shapes, haze as v2.2.
    python3 -I -B scenes_v6.py BASE_V5.json V4_SCENES.json PLAN40_V4.json OUT.json PLAN40_OUT.json
Every scene lights ALL wash parts (line L/R, cut up/down, dj back, dj kicker, road, line A, line B = every PL5403 of the hall), ALL beam
parts (plane 1, both side lines = the 18 B380F) and `laser` (6 cubes + the 40 W dimmers), one colour family. Darkness inside a scene comes
only from its fx (chase, bars, blocks, pump, strobe...: lamps dark for a beat by the motion). The heads move in every scene (tilt 25 =
over the heads, never at eye level; pan up to 170). Cubes: `net` (pitch 0, ±3°, all cubes; the only pattern that passes the hall rules,
v5), the scene colour, `breathe` {min 0.15} on slow scenes, `hits` {per_beat 1, duty 0.5} on drops; tempo 8 beats at 132 or 4 at 66
(one cycle = 3.64 s). 40 W: every scene, every graphic except 74-75, 78-79, 166-167, 246-253, own start, colour 8/25/42 by family,
`anim` from the v4 plan's five kinds (x, zoom, rot, paint, xwave; Y never set)."""
import json, sys, copy
BASE, V4, PLAN_IN, OUT, PLAN_OUT = sys.argv[1:6]
WASH_OF = {'e': '#ff3a12', 'g': '#9cff00', 'w': '#ffffff'}
BEAM_OF = {'e': '#ff5a1e', 'g': '#8cff3a', 'w': '#ffffff'}
LASER_OF = {'e': '#ff3a12', 'g': '#00ff00', 'w': '#eefdfd'}
LA40_COLOUR = {'e': 25, 'g': 42, 'w': 8}
FAMILY_NAME = {'e': 'ember', 'g': 'lime', 'w': 'white'}
WASH, BEAM = 'up-pl5403', 'up-b380f'
WASHES = ('line L', 'line R', 'cut up', 'cut down', 'dj back', 'dj kicker', 'road', 'line A', 'line B')
BEAMS = ('plane 1', 'side line left', 'side line right')
BAR = 3.636
B1, B2, B4, B8 = BAR, 2 * BAR, 4 * BAR, 8 * BAR
ARTIST = {1: 'Cloistral', 2: 'Innersha', 3: 'Kerrie', 4: 'Éléktra b2b Kogeno', 5: 'Mixtinct'}
NEVER40 = {74, 75, 78, 79, 166, 167} | set(range(246, 254))
ANIM = {'T': 'slow turn + small wave', 'S': 'sideways sweep + line drawing', 'Z': 'sweep + zoom loop', 'J': 'jump + zoom loop', 'P': 'spin'}
def mo(mode, bpm, spatial='patch'): return {'mode': mode, 'bpm': bpm, 'depth': 255, 'spatial': spatial, 'kinds': [WASH, BEAM], 'still': 0.0}
def hd(pattern, period, pan, tilt, spatial): return {'pattern': pattern, 'period_s': round(period, 3), 'pan_deg': pan, 'tilt_deg': tilt, 'spatial': spatial, 'kinds': [BEAM]}
def ride(p, pan=170, sp='ripple', pat='circle'): return hd(pat, p, pan, 25, sp)
def scan(p, pan=150, sp='alternate', pat='figure8'): return hd(pat, p, pan, 25, sp)
def nod(p, sp='alternate'): return hd('nod', p, 0, 25, sp)
def wave(p): return hd('wave', p, 0, 25, 'ripple')
# (title, family, fx, heads, fade_s, hold_s, cubes: '' | 'b' breathe | 'h' hits, 40 W anim kind)
SETS = {
 1: [  # Cloistral — the cold opening, already moving: slow wide rides, comets and radars at 66, building to 132
  ('Cold iron', 'w', mo('comet', 66, 'y-'), ride(B8, 170, 'left-right'), 4, 20, '', 'T'),
  ('Rust drift', 'e', mo('sine', 66, 'x'), scan(B4, 150, 'ripple'), 3, 18, 'b', 'S'),
  ('Lime vein', 'g', mo('radar', 66, 'x'), wave(B2), 3, 18, '', 'Z'),
  ('Ash gate', 'w', mo('pingpong', 66, 'x'), ride(B4), 0, 16, 'h', 'J'),
  ('Ember lattice', 'e', mo('chase', 66, 'radial-'), nod(B2), 3, 18, 'b', 'T'),
  ('Lime fog cut', 'g', mo('breathe', 33), scan(B2, 150, 'left-right'), 4, 20, 'b', 'P'),
  ('White tide', 'w', mo('sine', 66, 'y'), ride(B8, 170, 'ripple', 'figure8'), 3, 20, '', 'S'),
  ('Ember hook', 'e', mo('comet', 66, 'x-'), wave(B1), 0, 14, 'h', 'J'),
  ('Lime crossfire', 'g', mo('bars', 66, 'x'), ride(B4, 150, 'left-right'), 2, 16, '', 'Z'),
  ('Ghost floor', 'w', mo('pulse', 66, 'radial'), nod(B4, 'ripple'), 3, 18, 'b', 'T'),
  ('Rust orbit', 'e', mo('radar', 66, 'x-'), ride(B2), 2, 16, '', 'P'),
  ('Lime rain', 'g', mo('chase', 132, 'y-'), wave(B2), 0, 14, 'h', 'S'),
  ('White scaffold', 'w', mo('blocks', 66, 'x'), scan(B1), 0, 14, 'h', 'J'),
  ('Ember breath', 'e', mo('breathe', 33), ride(B8, 170, 'left-right', 'figure8'), 4, 22, 'b', 'T'),
  ('Lime switch', 'g', mo('pingpong', 132, 'x'), nod(B1), 0, 14, 'h', 'Z'),
  ('Bone light', 'w', mo('comet', 132, 'radial-'), ride(B4), 2, 16, '', 'S'),
  ('Ember tunnel', 'e', mo('chase', 132, 'y'), scan(B2, 150, 'ripple', 'circle'), 2, 16, '', 'P'),
  ('Lime pressure', 'g', mo('pump', 132), wave(B1), 0, 12, 'h', 'J'),
  ('White sweep', 'w', mo('radar', 132, 'x'), ride(B2, 170, 'left-right', 'figure8'), 1, 14, '', 'Z'),
  ('First furnace', 'e', mo('pump', 132), ride(B2), 0, 16, 'h', 'J'),
 ],
 2: [  # Innersha — ignition: chases and scans at 132, the beams never rest
  ('Spark line', 'g', mo('chase', 132, 'x'), scan(B1, 150, 'left-right'), 0, 14, 'h', 'S'),
  ('White rush', 'w', mo('comet', 132, 'y-'), ride(B2), 1, 14, '', 'Z'),
  ('Ember shutter', 'e', mo('bars', 132, 'x-'), nod(B1), 0, 12, 'h', 'J'),
  ('Lime spiral', 'g', mo('radar', 132, 'radial'), ride(B4), 1, 16, 'b', 'P'),
  ('White grid', 'w', mo('blocks', 132, 'x'), scan(B1, 150, 'ripple', 'circle'), 0, 12, 'h', 'J'),
  ('Rust run', 'e', mo('chase', 132, 'y-'), wave(B1), 1, 14, '', 'S'),
  ('Lime ladder', 'g', mo('pingpong', 132, 'y'), nod(B2, 'left-right'), 1, 14, '', 'Z'),
  ('White engine', 'w', mo('pump', 132), ride(B2, 170, 'left-right', 'figure8'), 0, 14, 'h', 'J'),
  ('Ember spokes', 'e', mo('comet', 132, 'radial'), scan(B2), 1, 14, '', 'P'),
  ('Lime blades', 'g', mo('bars', 132, 'x'), ride(B1), 0, 12, 'h', 'S'),
  ('Flash pan', 'w', mo('strobe', 132), scan(B1, 170, 'left-right', 'circle'), 0, 10, 'h', 'J'),
  ('Rust pendulum', 'e', mo('pingpong', 132, 'x'), wave(B2), 1, 14, 'b', 'T'),
  ('Lime surge', 'g', mo('pump', 132), ride(B2, 170, 'ripple', 'figure8'), 0, 14, 'h', 'Z'),
  ('White comb', 'w', mo('chase', 132, 'x-'), nod(B1), 1, 12, '', 'S'),
  ('Ember gearbox', 'e', mo('blocks', 132, 'x'), ride(B4, 150, 'left-right'), 0, 14, 'h', 'J'),
  ('Lime sonar', 'g', mo('radar', 132, 'x'), scan(B1, 150, 'ripple'), 1, 14, '', 'P'),
  ('White pistons', 'w', mo('pump', 132), nod(B1, 'all'), 0, 12, 'h', 'Z'),
  ('Ember wake', 'e', mo('comet', 132, 'y'), ride(B2, 170, 'left-right'), 1, 14, '', 'S'),
  ('Lime throttle', 'g', mo('chase', 132, 'radial-'), scan(B2, 170, 'alternate', 'circle'), 0, 14, 'h', 'J'),
  ('Full ignition', 'w', mo('blocks', 132, 'x-'), ride(B1), 0, 12, 'h', 'Z'),
 ],
 3: [  # Kerrie — the instrument: strobes, hits, blocks; every change on a cut
  ('Shock white', 'w', mo('strobe', 132), scan(B1, 170), 0, 10, 'h', 'J'),
  ('Ember stamp', 'e', mo('pump', 132), nod(B1, 'all'), 0, 12, 'h', 'Z'),
  ('Lime shrapnel', 'g', mo('sparkle', 20, 'x'), ride(B1), 0, 12, '', 'P'),
  ('White block hit', 'w', mo('blocks', 132, 'x-'), wave(B1), 0, 10, 'h', 'J'),
  ('Rust hammer', 'e', mo('bars', 132, 'x'), scan(B1, 170, 'left-right', 'circle'), 0, 12, 'h', 'S'),
  ('Lime stutter', 'g', mo('pump', 132), nod(B1), 0, 10, 'h', 'J'),
  ('Blind spot', 'w', mo('strobe', 132), ride(B2, 170, 'left-right', 'figure8'), 0, 10, 'h', 'Z'),
  ('Ember scatter', 'e', mo('sparkle', 20, 'x'), scan(B1, 150, 'ripple'), 0, 12, '', 'P'),
  ('Lime gates', 'g', mo('blocks', 132, 'x'), ride(B1, 170, 'alternate'), 0, 12, 'h', 'S'),
  ('White hammer', 'w', mo('pump', 132), scan(B1, 170, 'left-right'), 0, 10, 'h', 'J'),
  ('Ember chop', 'e', mo('chase', 132, 'x-'), nod(B1, 'left-right'), 0, 12, 'h', 'Z'),
  ('Lime cage', 'g', mo('bars', 132, 'x-'), ride(B2, 170, 'ripple', 'figure8'), 0, 12, 'h', 'J'),
  ('Strobe wall', 'w', mo('strobe', 132), nod(B1, 'all'), 0, 10, 'h', 'S'),
  ('Ember crossfire', 'e', mo('pingpong', 132, 'x'), scan(B1, 170, 'alternate', 'circle'), 0, 12, 'h', 'P'),
  ('Lime punch', 'g', mo('pump', 132), ride(B1, 170, 'left-right'), 0, 10, 'h', 'J'),
  ('White radar storm', 'w', mo('radar', 132, 'x'), scan(B1, 170, 'ripple', 'circle'), 0, 12, '', 'Z'),
  ('Ember breaker', 'e', mo('blocks', 132, 'x'), wave(B1), 0, 10, 'h', 'J'),
  ('Lime fracture', 'g', mo('chase', 132, 'y-'), scan(B1, 170, 'left-right'), 0, 12, 'h', 'S'),
  ('White static', 'w', mo('strobe', 132), ride(B1, 170, 'alternate', 'figure8'), 0, 10, 'h', 'P'),
  ('Kerrie peak', 'e', mo('pump', 132), ride(B2), 0, 14, 'h', 'J'),
 ],
 4: [  # Éléktra b2b Kogeno — deep: slow breath and huge slow rides, then the second rise
  ('Undertow', 'e', mo('breathe', 33), ride(B8, 170, 'left-right'), 5, 22, 'b', 'T'),
  ('Ash drift', 'w', mo('sine', 33, 'y-'), scan(B4, 150, 'ripple'), 5, 22, 'b', 'S'),
  ('Lime deep', 'g', mo('radar', 66, 'x'), ride(B8, 170, 'ripple', 'figure8'), 4, 20, 'b', 'P'),
  ('Ember slow wall', 'e', mo('sine', 66, 'x'), wave(B4), 4, 20, 'b', 'T'),
  ('Pale orbit', 'w', mo('breathe', 33), ride(B4, 170, 'left-right'), 4, 22, 'b', 'Z'),
  ('Lime tow', 'g', mo('comet', 66, 'y-'), nod(B4, 'ripple'), 4, 20, '', 'S'),
  ('Ember slow ride', 'e', mo('pulse', 66, 'radial'), ride(B8), 4, 22, 'b', 'T'),
  ('Ash wave', 'w', mo('sine', 66, 'x-'), wave(B2), 3, 20, '', 'P'),
  ('Lime hollow', 'g', mo('breathe', 33), scan(B4, 170), 4, 24, 'b', 'Z'),
  ('Rust slow cut', 'e', mo('radar', 66, 'x-'), ride(B4, 170, 'left-right', 'figure8'), 0, 18, '', 'S'),
  ('White hollow', 'w', mo('pulse', 66, 'radial-'), nod(B2), 3, 20, 'b', 'T'),
  ('Lime long ride', 'g', mo('sine', 33, 'y'), ride(B8, 170, 'left-right', 'figure8'), 5, 25, 'b', 'P'),
  ('Ember current', 'e', mo('comet', 66, 'x'), scan(B2, 150, 'ripple', 'circle'), 3, 18, '', 'Z'),
  ('Ash break', 'w', mo('blocks', 66, 'x'), ride(B4), 0, 16, 'h', 'J'),
  ('Lime sink', 'g', mo('breathe', 33), wave(B4), 4, 22, 'b', 'T'),
  ('Ember pull', 'e', mo('chase', 66, 'y-'), ride(B2, 170, 'left-right'), 2, 18, '', 'S'),
  ('Bone rise', 'w', mo('comet', 132, 'y-'), scan(B2, 170, 'ripple'), 2, 16, '', 'Z'),
  ('Lime climb', 'g', mo('chase', 132, 'y'), ride(B2), 1, 16, 'h', 'J'),
  ('Ember climb', 'e', mo('pump', 132), scan(B1, 170, 'alternate', 'circle'), 0, 14, 'h', 'P'),
  ('Second rise', 'w', mo('strobe', 132), ride(B1, 170, 'ripple', 'figure8'), 0, 12, 'h', 'J'),
 ],
 5: [  # Mixtinct — the last furnace: everything at once, then cooling into the loop
  ('Furnace door', 'e', mo('pump', 132), ride(B1, 170, 'left-right'), 0, 14, 'h', 'J'),
  ('Lime engine', 'g', mo('bars', 132, 'x'), scan(B1, 170, 'ripple'), 0, 14, 'h', 'Z'),
  ('White frenzy', 'w', mo('strobe', 132), nod(B1), 0, 10, 'h', 'S'),
  ('Ember spin', 'e', mo('radar', 132, 'radial'), ride(B2), 1, 14, '', 'P'),
  ('Lime gridlock', 'g', mo('blocks', 132, 'x-'), wave(B1), 0, 12, 'h', 'J'),
  ('White sprint', 'w', mo('chase', 132, 'y-'), scan(B1, 170, 'left-right', 'circle'), 0, 12, 'h', 'Z'),
  ('Ember lash', 'e', mo('comet', 132, 'x'), nod(B1, 'left-right'), 0, 12, 'h', 'S'),
  ('Lime thunder', 'g', mo('pump', 132), ride(B1, 170, 'alternate', 'figure8'), 0, 12, 'h', 'J'),
  ('White vortex', 'w', mo('radar', 132, 'radial-'), ride(B2, 170, 'ripple', 'figure8'), 1, 14, '', 'P'),
  ('Ember sirens', 'e', mo('pingpong', 132, 'x'), scan(B1, 170), 0, 12, 'h', 'Z'),
  ('Lime overload', 'g', mo('chase', 132, 'radial'), ride(B1), 0, 12, 'h', 'S'),
  ('Last flash', 'w', mo('strobe', 132), scan(B1, 170, 'ripple', 'circle'), 0, 10, 'h', 'J'),
  ('Ember collapse', 'e', mo('blocks', 132, 'x'), ride(B2, 170, 'left-right', 'figure8'), 0, 12, 'h', 'Z'),
  ('Lime final word', 'g', mo('pump', 132), nod(B1, 'all'), 0, 14, 'h', 'J'),
  ('White all in', 'w', mo('strobe', 132), ride(B1, 170, 'left-right'), 0, 12, 'h', 'P'),
  ('Ember cooling', 'e', mo('sine', 66, 'x'), ride(B4, 170, 'ripple', 'figure8'), 3, 18, 'b', 'T'),
  ('Lime cinders', 'g', mo('sparkle', 20, 'x'), scan(B4, 150, 'alternate', 'circle'), 3, 18, '', 'S'),
  ('Ash settle', 'w', mo('breathe', 33), wave(B4), 4, 20, 'b', 'T'),
  ('Ember last ride', 'e', mo('comet', 66, 'y'), ride(B8, 170, 'left-right'), 4, 22, 'b', 'Z'),
  ('Return (loop)', 'w', mo('comet', 66, 'y-'), scan(B4, 150, 'ripple'), 4, 22, '', 'T'),
 ],
}
assert all(len(v) == 20 for v in SETS.values()), {k: len(v) for k, v in SETS.items()}
FX_SAY = {'comet': 'a comet runs', 'sine': 'a slow roll runs', 'radar': 'a radar line sweeps', 'pingpong': 'light ping-pongs', 'chase': 'a chase runs',
          'breathe': 'everything breathes', 'bars': 'bars flip', 'pulse': 'pulses run', 'blocks': 'blocks slam on and off', 'pump': 'everything pumps on the kick',
          'strobe': 'every lamp strobes white (3 a second)', 'sparkle': 'lamps sparkle at random'}
SP_SAY = {'patch': '', 'x': ' across the hall', 'x-': ' back across the hall', 'y': ' from the DJ to the door', 'y-': ' from the door to the DJ',
          'radial': ' out from the DJ', 'radial-': ' in toward the DJ'}
HEAD_SAY = {'circle': 'ride wide circles', 'figure8': 'scan figure eights', 'nod': 'scissor over the crowd', 'wave': 'roll a wave over the crowd'}
HSP_SAY = {'ripple': 'in a ripple', 'left-right': 'mirrored left/right', 'alternate': 'crossing each other', 'all': 'all together'}
def floor_line(fam, m, h, cub, kind):
    pace = 'every bar' if abs(h['period_s'] - B1) < 0.01 else f"every {round(h['period_s'] / BAR)} bars"
    sweep = f", {h['pan_deg']}° wide" if h['pan_deg'] else ''
    c = {'': 'net', 'b': 'net breathing', 'h': 'net hitting on the beat'}[cub]
    return (f"All 37 lamps {FAMILY_NAME[fam]}; {FX_SAY[m['mode']]}{SP_SAY[m['spatial']]} ({m['bpm']} bpm); the 18 beams {HEAD_SAY[h['pattern']]} "
            f"{HSP_SAY[h['spatial']]}{sweep}, {pace}, cutting just over your head; cubes: {LASER_OF[fam]} {c}; 40 W: {ANIM[kind]}.")
base = json.load(open(BASE))
old = {s['title'].split(' · ', 1)[-1].lower() for f in (BASE, V4) for s in json.load(open(f))['scenes']}
v2 = json.load(open('scripts/place/rigs/moxir-scenes-50-v2-2-2026-10-17.json'))
old |= {s['title'].split(' · ', 1)[-1].lower() for s in v2['scenes']}
donor = {}
for s in base['scenes']:
    if s.get('laser') and s['laser'].get('pattern') == 'net': donor.setdefault(s['laser']['colour'], s)
assert set(donor) == set(LASER_OF.values()), sorted(donor)
plan_base = json.load(open(PLAN_IN))
anim_t = {}
for e in plan_base['cues'].values(): anim_t.setdefault(e['anim']['kind'], e['anim'])
assert set(anim_t) == set(ANIM.values()), sorted(anim_t)
ALLOWED = [g for g in range(256) if g not in NEVER40]
scenes, errors, plan, n = [], [], {}, 0
for act, rows in SETS.items():
    for title, fam, m, h, fade, hold, cub, kind in rows:
        n += 1
        sid = f'v6-{n:03d}'
        parts = {p: [WASH_OF[fam], 1.0] for p in WASHES}
        parts.update({p: [BEAM_OF[fam], 1.0] for p in BEAMS})
        parts['laser'] = [LASER_OF[fam], 1.0]
        if title.lower() in old: errors.append(f'{sid}: name "{title}" was used in v2/v4')
        if m['mode'] == 'strobe' and fam != 'w': errors.append(f'{sid}: strobe in colour (strobes only white)')
        if m['mode'] in ('glitch', 'none'): errors.append(f'{sid}: fx {m["mode"]} not allowed here')
        if m['mode'] == 'sparkle' and m['bpm'] > 20: errors.append(f'{sid}: sparkle over 20 bpm')
        if h['pattern'] not in ('nod', 'wave', 'circle', 'figure8'): errors.append(f'{sid}: pan-only pattern')
        if abs(h['period_s'] / BAR - round(h['period_s'] / BAR)) > 0.01: errors.append(f'{sid}: head period not whole bars')
        if not 15 <= h['tilt_deg'] <= 25: errors.append(f'{sid}: tilt outside 15..25')
        if not 10 <= hold <= 25 or fade > hold: errors.append(f'{sid}: hold {hold} / fade {fade}')
        if cub == 'h' and m['bpm'] / 60 > 3: errors.append(f'{sid}: hits over 3 a second')
        d = donor[LASER_OF[fam]]
        L = copy.deepcopy(d['laser'])
        L.update({'tempo': {'clock': 'master', 'bpm': 132, 'beats': 8} if m['bpm'] >= 132 else {'clock': 'master', 'bpm': 66, 'beats': 4},
                  'breathe': {'min': 0.15} if cub == 'b' else None, 'hits': {'per_beat': 1, 'duty': 0.5} if cub == 'h' else None,
                  'why': 'v6: the net (the only cube pattern that passes the hall rules, v5) in the scene colour; ' + {'': 'steady', 'b': 'breathing', 'h': 'hits on the drop'}[cub]})
        s = {'id': sid, 'title': f'{ARTIST[act]} · {title}', 'act': act, 'intent': floor_line(fam, m, h, cub, kind), 'parts': parts, 'motion': m, 'heads': h,
             'laser_colour': d['laser_colour'], 'desk_caps': copy.deepcopy(d.get('desk_caps')), 'cue': {'fade_s': fade, 'hold_s': hold},
             'notes': f'v6 scene {n}; family {FAMILY_NAME[fam]}; all parts lit at 1.0 ({len(parts)}); darkness only from the fx',
             'laser': L, 'energy': 1.0, 'laser_lines': None, 'laser40': copy.deepcopy(d.get('laser40')), 'family': [FAMILY_NAME[fam]]}
        start = (n * 37) % len(ALLOWED)
        g = ALLOWED[start:] + ALLOWED[:start]
        an = copy.deepcopy(anim_t[ANIM[kind]]); an['g2'] = g[len(g) // 2:] + g[:len(g) // 2]
        if 'y' in an: errors.append(f'{sid}: 40 W anim sets Y')
        plan[str(n)] = {'graphics': g, 'colour': LA40_COLOUR[fam], 'every': 4 if act in (2, 3, 5) else 6, 'anim': an,
                        'note': f'{s["title"]}: every allowed value, its own start ({g[0]}), {ANIM[kind]}'}
        scenes.append(s)
assert len(scenes) == 100
def carriers(s): return ((s['motion']['mode'], s['motion']['spatial'], s['motion']['bpm']), (s['heads']['pattern'], s['heads']['period_s'], s['heads']['spatial']), s['cue']['fade_s'] == 0, s['family'][0])
for i in range(1, 100):
    if sum(a != b for a, b in zip(carriers(scenes[i]), carriers(scenes[i - 1]))) < 2: errors.append(f'{scenes[i]["id"]} ~ {scenes[i - 1]["id"]}: neighbours differ in < 2 carriers')
if len({s['title'] for s in scenes}) != 100: errors.append('duplicate titles')
if errors: sys.exit('\n'.join(errors) + f'\n{len(errors)} rule failures, nothing written')
out = copy.deepcopy(base)
loop_s = sum(s['cue']['fade_s'] + s['cue']['hold_s'] for s in scenes)
out['scenes'], out['loop'], out['loop_s'] = scenes, True, loop_s
out['version'] = 'v6-100-crazy-all-lights-2026-10-18'
out['what'] = ('MOXIR scenes v6 (2026-10-18): 100 new scenes from the dance floor, 20 per set (Cloistral, Innersha, Kerrie, Éléktra b2b Kogeno, Mixtinct). '
               'Every part lit at 1.0 in every scene (all washes, all beams, cubes + 40 W); darkness only from the fx; heads always moving. v2.2 palette; haze = the hang\'s.')
out['source'] = 'docs/moxir/scenes-v6-2026-10-18/scenes_v6.py from scripts/place/rigs/moxir-scenes-100-v5-2026-10-18.json (schema, palette, the cube net by colour)'
out['rules'].update({'levels': 'full power: every part lit at 1.0 in every scene (owner 2026-10-18 00:5x "full use all lights all lasers")', 'holds': 'per scene, 10..25 s'})
json.dump(out, open(OUT, 'w'), indent=1, ensure_ascii=False)
pl = copy.deepcopy(plan_base)
pl.update({'show': 'moxir-scenes-v6-0', 'made': '2026-10-18 01:xx', 'allowStatic': True, 'cues': plan,
           'why': 'MOXIR scenes v6, 100 scenes (owner 2026-10-18 00:5x "full use all lights all lasers"): the 40 W in every scene; every graphic except 74-75, 78-79, '
                  '166-167, 246-253; each scene its own start; colour from the family (8 white, 25 red, 42 green); anim one of the v4 plan\'s five kinds (Y never set). '
                  'Cue numbers are 1-based in the v6 cue list, valid ONLY with the desk loaded with moxir-scenes-v6-0.'})
json.dump(pl, open(PLAN_OUT, 'w'), indent=1)
fams = {f: sum(1 for s in scenes if s['family'] == [f]) for f in FAMILY_NAME.values()}
print(f'scenes 100 | loop_s {loop_s} | lit parts below 1.0: {sum(1 for s in scenes for c, l in s["parts"].values() if l < 1.0)} | families {fams} '
      f'| parts lit per scene {sorted({len(s["parts"]) for s in scenes})} | heads moving {sum(1 for s in scenes if s["heads"])} | cubes {sum(1 for s in scenes if s["laser"])} '
      f'(breathe {sum(1 for s in scenes if s["laser"]["breathe"])}, hits {sum(1 for s in scenes if s["laser"]["hits"])}) | 40 W in {len(plan)}')
