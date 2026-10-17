#!/usr/bin/env python3
"""scenes_v2.py — MOXIR scenes v2.0 (2026-10-17): the underground loop, every device, measured against the brand.
Owner on v1 (= v6 data, live in the hall): "too much white … keep it underground, look to line-up, posters and the mood";
"use all fixed devices … write the coolest scenes ever"; "make everything in 3D and in the hall exactly the same".
Concept (the arc, the palette rules with their numbers, every device's role): agent-reports-2026-10-17/scenes-v2/CONCEPT.md.
The 50 scenes are DATA below (SCENES); this script turns them into the scenes file the rig generator reads:
    python3 -I scenes_v2.py BASE_V6.json OUT.json
BASE = scripts/place/rigs/moxir-scenes-50-v6-2026-10-17.json: the schema, the surfaces, the OUTSIDE parts (road, entrance: the
owner's rule, copied scene by scene) and the LASERS (laser part, laser, laser_lines, laser_colour, desk_caps of the laser
session's current design: v2 scene k keeps v6 scene k's laser, so the zone work of the laser session is kept exactly).
Rules kept from v3/v6: floor (line L, line R) held still, never red, desaturated; strobes carry no colour over HSV S 0.25; red
and green never together under motion; beams only in B380F slots seen; sparkle never above 20 bpm; moves need tilt.
New in v2: no blue, no violet, no mint, no lavender (the place has none, the posters are monochrome); white is a strike, never a
fill; the back-wall floor washes (line A-D) are the furnace floor; the hazer is a part of every scene."""
import json, sys, copy
BASE, OUT = sys.argv[1], sys.argv[2]
# palette v2 (hex -> name): the room's own colours + the brand's word
ASH, COLD, ICE, WARM, AMBER, DARKAMBER, EMBER, DEEP, GREEN = '#e8e4dc', '#eefdfd', '#d1eeff', '#ffbe7a', '#ffad4d', '#e04e00', '#ff3a12', '#a3200c', '#33ff47'
PALETTE = [(ASH, 'ash'), (COLD, 'cold white'), (ICE, 'ice'), (WARM, 'warm white'), (AMBER, 'amber'), (DARKAMBER, 'dark amber'),
           (EMBER, 'ember'), (DEEP, 'deep ember'), (GREEN, 'poster green'), ('#a5ff0f', 'toxic green'), ('#00ff00', 'laser green')]
# B380F wheel slots SEEN (fixtureTypes.js B380F_SLOTS_SEEN); never light blue in v2
W, WW, R, RO, A, O, G = '#ffffff', '#fff0c0', '#ff2a0a', '#ff5a1e', '#ffb000', '#ff7a00', '#00d12a'
SLOTS = {W: 'open white', WW: 'warm white', R: 'red', RO: 'red-orange', A: 'amber', O: 'orange', G: 'green'}
WASH, BEAM = 'up-pl5403', 'up-b380f'
HAZE = {'haze': ['#e8e4dc', 0.5]}
def lines(c, l, which='ABCD'): return {f'line {k}': [c, l] for k in which}
def floor(l): return {'line L': [ASH, l], 'line R': [ASH, l]} if l > 0 else {}
def cut(up=None, down=None): return ({'cut up': list(up)} if up else {}) | ({'cut down': list(down)} if down else {})
def beams(c, l, plane=True, sides=True): return ({'plane 1': [c, l]} if plane else {}) | ({'side line left': [c, l], 'side line right': [c, l]} if sides else {})
def mo(mode, bpm, depth=255, spatial='patch', kinds=(WASH,), still=0.3): return {'mode': mode, 'bpm': bpm, 'depth': depth, 'spatial': spatial, 'kinds': list(kinds), 'still': still}
def hd(pattern, tilt, period, spatial='ripple'): return {'pattern': pattern, 'period_s': period, 'pan_deg': 0, 'tilt_deg': tilt, 'spatial': spatial, 'kinds': [BEAM]}
BOTH = (WASH, BEAM)
# the laser session's colours that v2's palette has no place for (no blue, violet, rose): colour only; pattern, cubes, level, tempo,
# phase, pitch and the lines (the zone work) stay exactly as they are
LASER_MAP = {'#b699ff': ('#00ff00', 'G'), '#26bcff': ('#00ff00', 'G'), '#66faff': ('#eefdfd', 'CW'), '#ff9180': ('#eefdfd', 'CW')}
# (id, title, act, energy, parts, motion, heads, fade_s, hold_s, intent)
SCENES = [
 # ACT 1 — Cold furnace: sodium and rust from the floor; the walls in pieces; the DJ a silhouette; no beam until scene 6
 ('cold-furnace', 'Cold furnace', 1, .15, lines(DARKAMBER, .12, 'AB') | {'dj back': [DARKAMBER, .15]} | floor(.06), mo('breathe', 33, 100), None, 6, 30,
  'The hall as found: two rust glows on the back wall, the DJ a shadow, the floor barely there. Washes breathe.'),
 ('sodium', 'Sodium', 1, .2, lines(AMBER, .18) | {'dj back': [DARKAMBER, .2]} | floor(.06), mo('sine', 33, 120, 'y-'), None, 6, 28,
  'The sodium lamps of the yard come on along the back wall and roll toward the DJ.'),
 ('rust-on-the-wall', 'Rust on the wall', 1, .25, lines(DARKAMBER, .3, 'CD') | cut(up=(DARKAMBER, .1)) | {'dj back': [DARKAMBER, .2]} | floor(.06), mo('breathe', 33, 100), None, 5, 28,
  'One half of the wall in rust, the truss a faint rust up into the haze.'),
 ('silhouette', 'Silhouette', 1, .2, {'dj back': [AMBER, .45]} | floor(.05), mo('none', 60, 0), None, 5, 26,
  'Only the DJ, from behind, in amber. Everything else dark.'),
 ('first-piece', 'First piece', 1, .3, lines(DEEP, .4, 'AD') | floor(.08), mo('pulse', 66, 160, 'x'), None, 4, 26,
  'Two pieces of the back wall in deep ember, pulsing left to right; the middle stays dark.'),
 ('one-ray', 'One ray', 1, .35, beams(WW, .35, sides=False) | {'dj back': [DARKAMBER, .2]} | floor(.06), mo('breathe', 33, 100), hd('wave', 12, 24), 4, 26,
  'The first beam: warm white behind the DJ, a slow lean wave in a ripple. Rust stays behind him.'),
 ('the-wall-wakes', 'The wall wakes', 1, .5, lines(DARKAMBER, .6) | floor(.05), mo('comet', 66, 255, 'y-', still=0), None, 4, 26,
  'SIGNATURE: a comet of dark amber runs the whole back wall toward the DJ; nothing else is on.'),
 ('columns-of-rust', 'Columns of rust', 1, .45, beams(A, .4, plane=False) | lines(DARKAMBER, .25, 'BC') | floor(.06), mo('breathe', 33, 100), hd('nod', 15, 16, 'alternate'), 4, 24,
  'The side beams in amber lean toward the floor and back, neighbours opposite; the wall keeps its rust.'),
 ('ash-rays', 'Ash rays', 1, .4, lines(ASH, .3) | cut(up=(ICE, .15)) | floor(.08), mo('sine', 33, 120, 'y-'), None, 4, 24,
  'The first cold light: ash rays up the back wall, ice on the truss. Monochrome, like the posters.'),
 ('first-net', 'First net', 1, .55, beams(WW, .5, sides=False) | beams(A, .4, plane=False) | lines(DARKAMBER, .3) | floor(.08), mo('breathe', 33, 100), hd('circle', 15, 20), 5, 26,
  'Warm white behind the DJ, amber on the sides, a bow-tie turn in a ripple; the cubes draw their first net.'),
 # ACT 2 — Ignition: the rays come, white in pieces; the floor runs toward the DJ; the first green word
 ('ignition', 'Ignition', 2, .6, lines(AMBER, .5) | {'dj kicker': [WARM, .4]} | beams(RO, .5, plane=False) | floor(.1), mo('chase', 132, 200, 'y-'), hd('nod', 20, 12, 'all'), 3, 24,
  'Amber chases along the back wall toward the DJ; the sides in red-orange nod together.'),
 ('run-to-the-dj', 'Run to the DJ', 2, .7, lines(ASH, .5) | cut(down=(ASH, .3)) | beams(W, .6, sides=False) | floor(.1), mo('chase', 132, 255, 'y-'), hd('nod', 20, 8), 2, 24,
  'Ash chases the hall toward the DJ; open white behind him nods in a ripple.'),
 ('white-in-pieces', 'White in pieces', 2, .65, lines(COLD, .6, 'BD') | cut(up=(COLD, .3)) | beams(WW, .4, plane=False) | floor(.1), mo('blocks', 132, 255, 'x'), hd('figure8', 20, 14, 'left-right'), 3, 22,
  'Cold white on two pieces of the wall, flipping in blocks; the sides draw an X in warm white.'),
 ('rust-bars', 'Rust bars', 2, .7, lines(DARKAMBER, .6) | cut(down=(AMBER, .4)) | beams(O, .6, sides=False) | {'dj kicker': [WARM, .4]} | floor(.1), mo('bars', 132, 255, 'x'), hd('nod', 25, 10, 'alternate'), 3, 24,
  'Dark amber bars flip across the wall; orange behind the DJ nods, neighbours opposite.'),
 ('the-word', 'The word', 2, .8, lines(GREEN, .7) | cut((GREEN, .5), (GREEN, .5)) | {'dj back': [GREEN, .4]} | beams(G, .8), mo('pulse', 66, 120), hd('wave', 15, 16), 2, 20,
  'SIGNATURE: everything green at once, the teaser\'s wordmark; floor off. A lean wave in a ripple.'),
 ('glow-comet', 'Glow comet', 2, .6, lines(AMBER, .5) | cut(up=(ICE, .2)) | beams(A, .5, plane=False) | floor(.1), mo('comet', 132, 255, 'y'), hd('nod', 18, 12), 3, 22,
  'An amber comet runs the wall toward the entrance; the sides in amber nod in a ripple.'),
 ('scissors', 'Scissors', 2, .75, beams(WW, .7, plane=False) | beams(WW, .5, sides=False) | lines(DARKAMBER, .4, 'BC') | floor(.1), mo('breathe', 66, 120), hd('nod', 25, 6, 'alternate'), 3, 24,
  'Warm white scissors: the sides lean fast, neighbours opposite; rust in the middle of the wall.'),
 ('green-comb', 'Green comb', 2, .65, lines(GREEN, .5) | beams(G, .6, sides=False), mo('pingpong', 132, 255, 'x'), hd('wave', 15, 10), 3, 22,
  'Green ping-pongs along the wall, green behind the DJ waves; floor off; the cubes comb the air.'),
 ('pingpong-rust', 'Ping-pong rust', 2, .75, lines(DARKAMBER, .7) | cut((AMBER, .5), (AMBER, .5)) | beams(O, .6, plane=False) | {'dj kicker': [WARM, .5]} | floor(.12), mo('pingpong', 132, 255, 'x'), hd('nod', 20, 8), 3, 22,
  'Dark amber ping-pongs the wall; the truss amber; orange sides nod in a ripple.'),
 ('riser', 'Riser', 2, .9, lines(ASH, .8) | cut((COLD, .6), (COLD, .6)) | {'dj back': [WARM, .5]} | beams(W, .9) | floor(.15), mo('pulse', 132, 200), hd('circle', 20, 6), 2, 16,
  'Everything up: ash wall, cold truss, open white turning fast in a ripple. The rise before the first drop.'),
 # ACT 3 — The instrument: every device hits; dark between hits
 ('white-cathedral', 'White cathedral', 3, 1., beams(W, 1.) | cut(up=(COLD, .8)) | lines(COLD, .5) | {'dj kicker': [WARM, .6]} | floor(.2), mo('pump', 132, 180), hd('circle', 20, 8), 0, 18,
  'The cathedral: 18 open-white beams turning in a ripple, the truss cold, the wall cold. Pumps on the beat.'),
 ('strobe-hit', 'Strobe hit', 3, 1., beams(W, 1.) | lines(ASH, .8) | cut((ASH, .6), (ASH, .6)) | floor(.1), mo('strobe', 132, 255, kinds=BOTH), None, 0, 6,
  'Six seconds of strobe: beams straight up, the wall ash. No colour. Then dark.'),
 ('red-room', 'Red room', 3, 1., lines(EMBER, .7) | cut(down=(EMBER, .4)) | {'dj back': [DEEP, .5]} | beams(R, .8), mo('pump', 132, 160), hd('nod', 25, 8, 'all'), 0, 20,
  'SIGNATURE: the room red from the floor; red beams nod together; no white at all; floor off.'),
 ('the-storm', 'The storm', 3, 1., beams(W, 1.) | lines(ASH, .7) | cut((COLD, .6), (COLD, .6)) | {'dj kicker': [WARM, .5]} | floor(.15), mo('bars', 132, 255, 'x'), hd('figure8', 15, 4, 'left-right'), 1, 20,
  'Open white draws fast X\'s, mirrored; ash bars flip across the wall.'),
 ('the-word-two', 'The word, again', 3, .9, lines(GREEN, .8) | cut((GREEN, .6), (GREEN, .6)) | {'dj back': [GREEN, .5]} | beams(G, 1.), mo('breathe', 66, 120), hd('circle', 20, 10), 1, 20,
  'SIGNATURE: green, whole rig, the beams turning; floor off.'),
 ('dark-between', 'Dark between', 3, .2, {'dj back': [DARKAMBER, .3]} | beams(WW, .3, sides=False) | floor(.08), mo('none', 60, 0), None, 0, 8,
  'The gap inside the peak: rust behind the DJ, one warm beam straight up. Eight seconds of almost nothing.'),
 ('radar', 'Radar', 3, .85, beams(W, .9, plane=False) | lines(ASH, .7) | cut(up=(COLD, .4)) | floor(.12), mo('radar', 132, 255, 'x'), hd('nod', 20, 6), 1, 20,
  'A radar line sweeps the wall; the side beams open white nod in a ripple.'),
 ('blinders', 'Blinders', 3, 1., beams(W, 1.) | lines(COLD, 1.) | cut((COLD, 1.), (COLD, 1.)) | {'dj kicker': [WARM, .8], 'stage key': [ASH, .8]} | floor(.3), mo('pump', 132, 220, kinds=BOTH), None, 0, 8,
  'SIGNATURE: the instrument. Every lamp open, straight up, pumping on the beat. Eight seconds, then dark.'),
 ('copper-bars', 'Copper bars', 3, .95, lines(AMBER, .8) | cut(down=(DARKAMBER, .6)) | beams(RO, .9) | {'dj kicker': [WARM, .6]} | floor(.15), mo('bars', 132, 255, 'x'), hd('nod', 25, 6, 'alternate'), 0, 18,
  'Amber bars across the wall, red-orange beams scissoring. The furnace at full heat.'),
 ('sparkle-peak', 'Sparkle peak', 3, .95, beams(W, .9) | lines(ASH, .8) | cut(up=(COLD, .6)) | floor(.15), mo('sparkle', 20, 255, 'x'), hd('wave', 25, 8), 1, 20,
  'Ash sparkles across the wall (never above 20 bpm); open white waves in a ripple.'),
 # ACT 4 — Ash: near-black, haze, the ember floor, one beam; the cubes draw slow lines; then the second rise
 ('drop-to-ash', 'Drop to ash', 4, .25, lines(DARKAMBER, .2) | {'dj back': [DARKAMBER, .15]} | floor(.05), mo('breathe', 33, 100), None, 6, 28,
  'The drop: the wall down to a rust ember, the DJ a shadow again.'),
 ('one-beam-back', 'One beam back', 4, .2, beams(WW, .3, sides=False) | floor(.05), mo('none', 60, 0), hd('wave', 22, 30), 6, 28,
  'One warm white beam behind the DJ, a slow lean wave; nothing else.'),
 ('ash', 'Ash', 4, .15, lines(DARKAMBER, .06, 'AD') | beams(WW, .2, sides=False), mo('none', 60, 0), None, 6, 30,
  'SIGNATURE: the darkest scene. Two embers just visible in the haze, one beam, the cubes one slow line.'),
 ('ember-floor', 'Ember floor', 4, .2, lines(DARKAMBER, .1) | {'dj back': [DARKAMBER, .1]} | floor(.04), mo('sine', 33, 120, 'y-'), None, 6, 28,
  'The ember floor rolls slowly toward the DJ.'),
 ('slow-line', 'Slow line', 4, .25, beams(WW, .25, plane=False) | lines(DARKAMBER, .08, 'BC') | floor(.05), mo('none', 60, 0), hd('figure8', 25, 40, 'left-right'), 5, 30,
  'The sides in warm white draw one slow X over forty seconds.'),
 ('cold-mist', 'Cold mist', 4, .3, cut((ICE, .3), (ICE, .15)) | lines(ASH, .12) | floor(.05), mo('sparkle', 20, 200, 'x'), None, 5, 26,
  'Ice on the truss, ash sparkling faintly on the wall. The haze reads.'),
 ('deep-tent', 'Deep tent', 4, .4, beams(WW, .4, plane=False) | lines(DARKAMBER, .25) | {'dj back': [DARKAMBER, .2]} | floor(.06), mo('breathe', 33, 100), hd('wave', 12, 20), 6, 28,
  'A tent of warm white from the sides over a rust floor; the 40 W lasers draw the roof.'),
 ('green-breath', 'Green breath', 4, .3, lines(GREEN, .3), mo('breathe', 33, 150), None, 6, 26,
  'Green breathes on the wall, floor off; the cubes breathe with it.'),
 ('cold-rise', 'Cold rise', 4, .65, lines(ASH, .5) | cut(up=(COLD, .4)) | beams(W, .5, sides=False) | floor(.1), mo('comet', 132, 255, 'y-'), hd('nod', 25, 10), 4, 24,
  'An ash comet toward the DJ; open white nods behind him. The second rise begins.'),
 ('riser-two', 'Riser two', 4, .9, lines(AMBER, .8) | cut((WARM, .6), (WARM, .6)) | beams(WW, .9) | floor(.15), mo('pulse', 132, 200), hd('circle', 20, 6), 2, 16,
  'The warm riser: amber wall, warm truss, warm white beams turning fast.'),
 # ACT 5 — Last furnace: red and green alternate (never together under motion), the last strobe, embers out, one beam to loop
 ('second-drop', 'Second drop', 5, 1., beams(W, 1.) | lines(COLD, .8) | cut((COLD, .7), (COLD, .7)) | {'dj kicker': [WARM, .6]} | floor(.2), mo('pump', 132, 200), hd('figure8', 15, 4, 'left-right'), 0, 20,
  'The second drop: open white X\'s, the wall cold, pumping.'),
 ('ash-strobe', 'Ash strobe', 5, 1., beams(W, 1.) | lines(ASH, .8) | cut((ASH, .5), (ASH, .5)) | floor(.1), mo('strobe', 132, 255, kinds=BOTH), None, 0, 6,
  'Strobe, no colour, six seconds.'),
 ('the-word-three', 'The word, last', 5, 1., lines(GREEN, .8) | cut((GREEN, .6), (GREEN, .6)) | {'dj back': [GREEN, .5]} | beams(G, 1.), mo('pump', 132, 160), hd('circle', 20, 8), 1, 20,
  'SIGNATURE: the word at full: green rig, green cubes, beams turning, pumping.'),
 ('red-room-two', 'Red room, last', 5, 1., lines(EMBER, .8) | cut(down=(EMBER, .5)) | {'dj back': [DEEP, .6]} | beams(R, .9), mo('bars', 132, 255, 'x'), hd('nod', 25, 6, 'alternate'), 1, 20,
  'SIGNATURE: red from the floor, red beams scissoring, red bars across the wall; no white; floor off.'),
 ('ash-and-rust', 'Ash and rust', 5, .95, lines(ASH, .7, 'AC') | lines(DARKAMBER, .7, 'BD') | cut((COLD, .5), (DARKAMBER, .5)) | beams(W, .8, plane=False) | beams(O, .8, sides=False) | floor(.15), mo('blocks', 132, 255, 'x'), hd('figure8', 20, 8, 'left-right'), 1, 20,
  'The two temperatures of the posters: ash and rust in alternate pieces, flipping in blocks; white sides, orange behind the DJ.'),
 ('last-strobe', 'Last strobe', 5, 1., beams(W, 1.) | lines(COLD, 1.) | cut((COLD, .8), (COLD, .8)) | {'dj kicker': [ASH, .8]} | floor(.2), mo('strobe', 132, 255, kinds=BOTH), None, 0, 8,
  'The last strobe: everything open, eight seconds, then the afterglow.'),
 ('afterglow', 'Afterglow', 5, .5, lines(DARKAMBER, .4) | cut(up=(ICE, .15)) | {'dj back': [DARKAMBER, .3]} | beams(WW, .4, plane=False) | floor(.08), mo('breathe', 33, 120), hd('wave', 20, 16), 4, 26,
  'The furnace cooling: rust breathing, ice on the truss, warm white waving from the sides.'),
 ('the-last-run', 'The last run', 5, .55, lines(AMBER, .5) | beams(A, .5, sides=False) | {'dj kicker': [WARM, .3]} | floor(.08), mo('chase', 132, 255, 'y-'), hd('nod', 10, 8), 4, 24,
  'Amber chases toward the DJ one last time; amber behind him nods low.'),
 ('embers-out', 'Embers out', 5, .3, lines(DARKAMBER, .25) | {'dj back': [DARKAMBER, .15]} | floor(.05), mo('sparkle', 20, 255, 'x'), None, 5, 26,
  'Rust sparkling out across the wall, the DJ a shadow.'),
 ('one-beam-loop', 'One beam (loop)', 5, .2, beams(WW, .3, sides=False) | {'dj back': [DARKAMBER, .12]} | floor(.05), mo('breathe', 33, 80), hd('nod', 18, 28), 6, 26,
  'SIGNATURE: one warm white beam on the DJ from behind, everything else dark; it ties to scene 1.'),
]
assert len(SCENES) == 50, len(SCENES)
base = json.load(open(BASE))
out = copy.deepcopy(base)
name = dict(PALETTE) | SLOTS
TIERS = ((0.85, 'full'), (0.5, 'mid'), (0.0, 'low'))
scenes, uses, loop_s = [], {}, 0
for k, (sid, title, act, energy, parts, motion, heads, fade, hold, intent) in enumerate(SCENES):
    b6 = base['scenes'][k]
    parts = {p: [c, float(l)] for p, (c, l) in parts.items()} | HAZE
    for p in ('road', 'entrance', 'laser'):                      # the outside rule and the laser session's levels, unchanged
        if p in b6['parts']: parts[p] = list(b6['parts'][p])
    for p in ('plane 1', 'side line left', 'side line right'):
        if p in parts:
            assert parts[p][0] in SLOTS, f'{sid}: beam colour {parts[p][0]} is not a seen slot'
            uses[SLOTS[parts[p][0]]] = uses.get(SLOTS[parts[p][0]], 0) + 1
    if (motion or {}).get('mode') == 'strobe':                   # eye rule: a strobe carries no colour over HSV S 0.25
        for p, v in parts.items():
            if p not in ('road', 'entrance', 'laser', 'haze'): assert v[0] in (ASH, COLD, ICE, W), f'{sid}: strobe with colour {v[0]} on {p}'
    if (heads or {}).get('pattern') in ('sweep', 'cross', 'fan'): raise SystemExit(f'{sid}: pan-only pattern turns nothing (heads_check.mjs)')
    if (motion or {}).get('mode') == 'sparkle': assert motion['bpm'] <= 20, f'{sid}: sparkle over 20 bpm'
    laser, laser_colour, laser_lines = copy.deepcopy(b6.get('laser')), b6.get('laser_colour'), copy.deepcopy(b6.get('laser_lines'))
    if laser_colour in LASER_MAP:
        hx, key = LASER_MAP[laser_colour]
        if 'laser' in parts: parts['laser'][0] = hx
        if laser: laser['colour'], laser['colour_key'] = hx, key
        if laser_lines:
            for ln in (laser_lines if isinstance(laser_lines, list) else laser_lines.get('lines', [])):
                if isinstance(ln, dict) and ln.get('colour') == laser_colour: ln['colour'] = hx
        laser_colour = hx
    s = {'id': sid, 'title': title, 'act': act, 'intent': intent, 'parts': parts, 'motion': motion, 'heads': heads,
         'laser_colour': laser_colour, 'desk_caps': b6.get('desk_caps'), 'cue': {'fade_s': fade, 'hold_s': hold},
         'notes': f'v2.0 scene {k + 1}; outside = the owner\'s rule (copied from v6 scene {k + 1}); laser = the laser session\'s design of v6 scene {k + 1} ({b6["id"]}), unchanged',
         'laser': laser, 'energy': energy, 'energy_tier': next(n for t, n in TIERS if energy >= t), 'laser_lines': laser_lines,
         'intent_v1': b6['intent']}
    scenes.append(s); loop_s += fade + hold
out['scenes'], out['loop'], out['loop_s'] = scenes, True, loop_s
out['version'] = 'v2.0-underground-2026-10-17'
out['palette'] = [{'hex': h, 'name': n} for h, n in PALETTE]
out['what'] = ('MOXIR scenes v2.0 (2026-10-17): the underground loop, 50 scenes in 5 acts (cold furnace, ignition, the instrument, ash, last furnace), '
               'every device (the 40 washes incl. the back-wall floor washes as the furnace floor, 18 beams in seen slots, 2 x 40 W + 6 cubes from the laser '
               'session unchanged, the hazer). Palette measured against the posters (monochrome), the teaser (green word) and the place (rust/sodium): no blue, '
               'white as a strike only. Concept: agent-reports-2026-10-17/scenes-v2/CONCEPT.md. v1 = the v6 data, live in the hall, untouched.')
out['source'] = base['source'] + ' · v2.0 2026-10-17 by Fable (lead), docs/moxir/scenes-v2-2026-10-17/scenes_v2.py from this file (outside parts and lasers kept scene by scene)'
out['beam_wheel_seen'] = {h: {'slot': n, 'hex': h} for h, n in SLOTS.items()}
out['rules']['heads_patterns'] = ['nod', 'wave', 'circle', 'figure8']
out['rules']['beam_colours'] = 'B380F_SLOTS_SEEN only: open white, warm white, red, red-orange, amber, orange, green; never light blue'
out['rules']['palette_v2'] = 'no blue, violet, mint or lavender (the place and the posters have none); white = strike (rays, strobes, blinders, cathedral), never a fill; floor ash only, <= 0.3'
out['rules']['targets'] = {'dark_share_mean_min': 0.55, 'white_share_of_glow_max': 0.45, 'method': 'scripts/place/picture_palette.py on the 50 renders; CONCEPT.md section 1'}
out['rules']['floor'] = 'line L + line R ash, held still (still 0.3), 0.04..0.3; red never on the floor; act 4 <= 0.06'
json.dump(out, open(OUT, 'w'), indent=1, ensure_ascii=False)
print('scenes', len(scenes), '| loop_s', loop_s, '| beam slot uses', uses, '| lasers kept in', sum(1 for s in scenes if s['laser']))
