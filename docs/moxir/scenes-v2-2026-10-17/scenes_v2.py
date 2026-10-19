#!/usr/bin/env python3
"""scenes_v2.py — MOXIR scenes v2.0 (2026-10-17): the underground loop, every device, the techno gamut, strobes, rides and scans.
Owner 10:4x on v1 (= v6 data, live in the hall): "too much white … keep it underground"; 11:2x: "hall and real 3d exact same … not many
bright, use the contrast of the dark and bright … keep colors techno, we have color gamut so use that … beams full power, skip the gobos";
12:0x: "strobes is good and cool crazy movements rides scans, yes lineup right, washes colourful that I can see".
Rules = LEAD-BRIEF-addendum.md (agent-reports-2026-10-17/lead), section (g) winning; concept = scenes-v2/CONCEPT.md.
The 50 scenes are DATA below (SCENES); this script turns them into the scenes file the rig generator reads:
    python3 -I -B scenes_v2.py BASE_V6.json OUT.json [--laser40 on]
BASE = scripts/place/rigs/moxir-scenes-50-v6-2026-10-17.json: schema, surfaces, the OUTSIDE parts (road, entrance: the owner's rule, copied
scene by scene; road hex made clean #a5ff00, B2), the LASERS (laser part, laser, laser_colour, desk_caps: the laser session's design, v2
scene k = v6 scene k, colours untouched) and the HOLDS (hold_s of scene k = v6 scene k: the laser frames' loop, 1116 s).
40 W layer: the 40 W lines (v6 `laser_lines`) are written under `laser40` per scene and `laser_lines` is null unless --laser40 on
(owner 12:0x: "what we have from 40w is enough" → off tonight). Their dimmer still follows the rig part `laser` (one part for cubes + 40 W
in the hang); a part of their own is a hang change, owed.
Techno gamut (B1/B2): washes only #ff0000 red, #00ff00 green, #ffffff white (clean recipes, W emitter driven by the neutral hex only);
beams only seen slots open, warm white, red, red-orange, green, lime. One colour family per scene (+ white); red and green never together;
strobes only white; beams 0 or >= 0.95; head periods multiples of one bar at 132 bpm; every wash lit in every scene but the blackout cuts."""
import json, sys, copy, colorsys
BASE, OUT = sys.argv[1], sys.argv[2]
LASER40 = '--laser40' in sys.argv and sys.argv[sys.argv.index('--laser40') + 1] == 'on'
RED, GRN, WHT = '#ff3a12', '#9cff00', '#ffffff'                 # v2.2 wash palette (lead 20:15, owner 20:1x 'lime one is better'): ember, lime, white
W, RO, LIME = '#ffffff', '#ff5a1e', '#8cff3a'                    # v2.2 beam palette: open, red-orange, lime (the only slots tonight)
WW, R, G = W, RO, LIME                                           # the v2.1 variants collapse onto the three slots
SLOTS = {W: 'open', RO: 'red-orange', LIME: 'lime'}
FAMILY = {RED: 'red', RO: 'red', GRN: 'lime', LIME: 'lime', WHT: 'white', W: 'white'}
PALETTE = [(RED, 'ember (washes)'), (GRN, 'lime (washes)'), (WHT, 'white (washes)')]
LASER_PALETTE = ['#eefdfd', '#00ff00', '#ff3a12', '#b699ff', '#26bcff', '#66faff', '#ff9180']   # the laser session's colours, theirs to change
WASH, BEAM = 'up-pl5403', 'up-b380f'
BOTH = (WASH, BEAM)
WASHES = ('line L', 'line R', 'cut up', 'cut down', 'dj back', 'dj kicker')   # the hall tonight (lead 20:1x): no line A-D, road, entrance, stage key
HALL_MAP = {'line A': 'line L', 'line B': 'line L', 'line C': 'line R', 'line D': 'line R', 'stage key': 'dj kicker'}   # v2.1 leads on lamps that left the hall
BEAMS = ('plane 1', 'side line left', 'side line right')
BAR = 3.636                                                     # one bar at 132 bpm (addendum E2: period = k x 3.636 s)
B1, B2, B4, B8 = BAR, 2 * BAR, 4 * BAR, 8 * BAR
ARTIST = {1: 'Cloistral', 2: 'Innersha', 3: 'Kerrie', 4: 'Éléktra b2b Kogeno', 5: 'Mixtinct'}   # the teaser's line-up (owner 12:0x "yes lineup right")
def washes(colour, lead, rest=0.25):
    """every wash part lit (owner 12:0x) in ONE colour: the lead parts at their level, the rest at `rest`."""
    led = {}
    for p, l in lead.items(): q = HALL_MAP.get(p, p); led[q] = max(led.get(q, 0), l)
    return {p: [colour, float(led.get(p, rest))] for p in WASHES if led.get(p, rest) > 0}
def beams(plane=None, left=None, right=None):
    out = {}
    for p, c in (('plane 1', plane), ('side line left', left), ('side line right', right)):
        if c: out[p] = [c, 1.0]
    return out
def mo(mode, bpm, depth=255, spatial='patch', kinds=(WASH,), still=0.0): return {'mode': mode, 'bpm': bpm, 'depth': depth, 'spatial': spatial, 'kinds': list(kinds), 'still': still}
def hd(pattern, period, pan=0, tilt=0, spatial='ripple'): return {'pattern': pattern, 'period_s': round(period, 3), 'pan_deg': pan, 'tilt_deg': tilt, 'spatial': spatial, 'kinds': [BEAM]}
def ride(period=B4, pan=120, tilt=25, spatial='left-right', pattern='circle'): return hd(pattern, period, pan, tilt, spatial)     # wide slow pan+tilt across the hall
def scan(period=B1, pan=90, tilt=20, spatial='alternate', pattern='figure8'): return hd(pattern, period, pan, tilt, spatial)     # fast
ALL = {p: 1.0 for p in WASHES}
# (id, title, act, energy, parts, motion, heads, fade_s, intent)   hold_s comes from v6 scene k
SCENES = [
 # ACT 1 — Cloistral · Cold furnace: red from the back wall, the first rides, the DJ in red
 ('cold-furnace', 'Cold furnace', 1, .2, washes(RED, {'line A': .8, 'line B': .8}, .2), mo('breathe', 33, 120), None, 6,
  'The hall as found: the back wall red, two pieces bright, every other wash a red ember. Washes breathe.'),
 ('red-wall', 'Red wall', 1, .3, washes(RED, {'line C': .8, 'line D': .8, 'dj back': .6}) | beams(plane=R), mo('sine', 33, 200, 'y-'), hd('nod', B8, 0, 20), 6,
  'Red rolls along the wall toward the DJ; the red beams behind him lean slowly.'),
 ('first-ride', 'First ride', 1, .35, washes(WHT, {'cut up': .9}, .2) | beams(left=W, right=W), mo('breathe', 33, 150), ride(B4, 120, 25), 5,
  'White: the truss up into the haze, the side beams open white ride across the hall, mirrored.'),
 ('silhouette', 'Silhouette', 1, .3, washes(RED, {'dj back': 1.0, 'dj kicker': .6}, .2), mo('pulse', 66, 255, 'radial'), None, 5,
  'The DJ a silhouette in red from behind, the kicker as counter-light; red pulses out from him.'),
 ('green-pieces', 'Green pieces', 1, .4, washes(GRN, {'line A': .9, 'line D': .9}) | beams(plane=G), mo('blocks', 132, 255, 'x'), scan(B1, 90, 20), 4,
  'Green: two pieces of the wall, flipping in blocks; green behind the DJ scans fast, neighbours opposite.'),
 ('one-ray', 'One ray', 1, .35, washes(WHT, {'line L': .8, 'line R': .8}, .2) | beams(plane=WW), mo('comet', 66, 255, 'y-'), hd('wave', B2, 0, 15), 4,
  'White floor lines, a comet toward the DJ; warm white behind him waves.'),
 ('the-wall-wakes', 'The wall wakes', 1, .5, washes(RED, {'line A': .9, 'line B': .9, 'line C': .9, 'line D': .9}) | beams(left=R, right=RO), mo('comet', 66, 255, 'y-'), ride(B4, 150, 25), 4,
  'SIGNATURE: a red comet runs the whole back wall toward the DJ; the sides ride wide across the hall.'),
 ('columns', 'Columns', 1, .45, washes(GRN, {'cut down': .8}) | beams(left=G, right=LIME), mo('breathe', 33, 150), hd('nod', B2, 0, 20, 'alternate'), 4,
  'Green columns: the sides lean toward the floor and back, left green, right lime; the truss green down on the floor.'),
 ('white-rays', 'White rays', 1, .45, washes(WHT, {'line A': .7, 'line B': .7, 'line C': .7, 'line D': .7, 'cut up': .7}, .2) | beams(plane=W), mo('sine', 33, 200, 'y-'), scan(B1, 120, 25, 'ripple'), 4,
  'White rays up the back wall rolling toward the DJ; open white behind him scans in a ripple.'),
 ('first-net', 'First net', 1, .55, washes(RED, {'dj back': .8}, .3) | beams(R, R, R), mo('pulse', 66, 200), ride(B8, 120, 25, 'ripple'), 5,
  'All 18 beams red, a slow wide ride in a ripple; the cubes draw their first net.'),
 # ACT 2 — Innersha · Ignition: the rig joins the beat; left and right never the same
 ('ignition', 'Ignition', 2, .6, washes(RED, {'line A': 1, 'line B': 1, 'line C': 1, 'line D': 1, 'dj kicker': .8}, .3) | beams(left=R), mo('chase', 132, 255, 'y-', BOTH), ride(B4, 120, 25, 'ripple'), 3,
  'Red chases along the wall toward the DJ; only the left side rides; the kicker counter-lights.'),
 ('run-to-the-dj', 'Run to the DJ', 2, .7, washes(WHT, {'cut up': 1, 'cut down': 1, 'stage key': .8}, .3) | beams(plane=W, left=WW), mo('pump', 132, 255, 'patch', BOTH), scan(B1, 90, 20), 2,
  'White pumps on the beat, the truss full, the stage key on the DJ; open white scans behind him, warm white left only.'),
 ('green-bars', 'Green bars', 2, .65, washes(GRN, {'line B': 1, 'line D': 1}, .3) | beams(G, LIME, G), mo('bars', 132, 255, 'x', BOTH), hd('nod', B2, 0, 25, 'left-right'), 3,
  'Green bars flip across the hall; the beams nod mirrored, lime on the left.'),
 ('red-out', 'Red out from the DJ', 2, .7, washes(RED, {'cut down': 1, 'dj kicker': .8}, .3) | beams(RO, R, RO), mo('chase', 132, 255, 'radial-', BOTH), ride(B2, 150, 25), 3,
  'Red chases out from the DJ through the hall; red-orange behind him, red sides on a fast wide ride.'),
 ('the-word', 'The word', 2, .8, washes(GRN, {}, .15) | beams(G, G, LIME), mo('pump', 132, 255, 'patch', BOTH), None, 2,
  'SIGNATURE: the teaser\'s column — 18 green beams straight up, pumping on the beat; the washes a green ember.'),
 ('white-comet', 'White comet', 2, .65, washes(WHT, {'line L': 1, 'line R': 1}, .3) | beams(left=W, right=WW), mo('comet', 132, 255, 'y', BOTH), scan(B1, 120, 20, 'ripple', 'circle'), 3,
  'A white comet runs the floor lines toward the entrance; open white sides scan in circles.'),
 ('scissors', 'Scissors', 2, .75, washes(RED, {'dj back': 1}, .3) | beams(left=R, right=RO), mo('pump', 132, 255, 'patch', BOTH), hd('nod', B1, 0, 25, 'alternate'), 3,
  'Red scissors: the sides lean fast, neighbours opposite, red left, red-orange right; red behind the DJ.'),
 ('green-comb', 'Green comb', 2, .7, washes(GRN, {'line A': 1, 'line B': 1, 'line C': 1, 'line D': 1}, .3) | beams(plane=G), mo('pingpong', 132, 255, 'x', BOTH), ride(B4, 120, 25, 'ripple', 'figure8'), 3,
  'Green ping-pongs along the wall; green behind the DJ rides a wide figure eight.'),
 ('white-bars', 'White bars', 2, .75, washes(WHT, {'cut up': 1, 'cut down': 1, 'dj kicker': .8}, .3) | beams(W, WW, W), mo('bars', 132, 255, 'x', BOTH), scan(B1, 90, 25, 'left-right'), 3,
  'White bars flip across the hall; the beams scan mirrored, warm white on the left.'),
 ('riser', 'Riser', 2, .9, washes(RED, ALL, .9) | beams(R, R, RO), mo('pump', 132, 255, 'patch', BOTH), ride(B2, 150, 25, 'ripple'), 2,
  'Everything red, pumping; all 18 beams ride wide and fast in a ripple. The rise before the first drop.'),
 # ACT 3 — Kerrie · The instrument: strobes, hits, a blackout
 ('white-cathedral', 'White cathedral', 3, 1., washes(WHT, ALL) | beams(W, W, WW), mo('strobe', 132, 255, 'patch', BOTH), scan(B1, 120, 25, 'ripple', 'circle'), 0,
  'The cathedral: every lamp open white, strobing at 3 a second, the 18 beams scanning circles in a ripple.'),
 ('blackout', 'Blackout', 3, 0., {}, None, None, 0,
  'Six seconds of nothing. The deliberate blackout cut before the red room.'),
 ('red-room', 'Red room', 3, 1., washes(RED, {'line A': 1, 'line B': 1, 'line C': 1, 'line D': 1, 'dj back': 1}, .3) | beams(R, R, RO), mo('pump', 132, 255, 'patch', BOTH), hd('nod', B2, 0, 25, 'all'), 0,
  'SIGNATURE: the room red from the floor; red beams nod together; pumping.'),
 ('green-storm', 'Green storm', 3, 1., washes(GRN, {'cut up': 1, 'cut down': 1}, .3) | beams(G, LIME, G), mo('bars', 132, 255, 'x', BOTH), scan(B1, 120, 25, 'left-right'), 1,
  'Green bars across the hall; the beams scan fast, mirrored, lime left.'),
 ('radar', 'Radar', 3, .9, washes(WHT, {'line L': 1, 'line R': 1, 'stage key': 1}, .3) | beams(W, W, WW), mo('radar', 132, 255, 'x', BOTH), ride(B4, 150, 25), 1,
  'A white radar line sweeps the hall; the beams ride wide, warm white on the right; the stage key on the DJ.'),
 ('red-blocks', 'Red blocks', 3, .8, washes(RED, {'dj kicker': 1, 'dj back': .8}) | beams(plane=RO), mo('blocks', 132, 255, 'x', BOTH), None, 1,
  'Red blocks flip; the kicker counter-lights the DJ; red-orange straight up behind him, still.'),
 ('green-scan', 'Green scan', 3, .9, washes(GRN, {'line A': 1, 'line B': 1, 'line C': 1, 'line D': 1}, .3) | beams(left=G), mo('pingpong', 132, 255, 'x', BOTH), scan(B1, 90, 20), 1,
  'Green ping-pongs the wall; only the left side scans, fast, neighbours opposite.'),
 ('blinders', 'Blinders', 3, 1., washes(WHT, ALL) | beams(W, W, WW), mo('strobe', 132, 255, 'patch', BOTH), None, 0,
  'SIGNATURE: the instrument. Every lamp open white straight up, strobing. Eight seconds.'),
 ('red-bars', 'Red bars', 3, 1., washes(RED, {'cut down': 1, 'line A': 1, 'line D': 1}, .3) | beams(R, RO, R), mo('bars', 132, 255, 'x', BOTH), ride(B2, 150, 25, 'ripple'), 0,
  'Red bars across the hall, red-orange on the left; the beams ride wide and fast in a ripple.'),
 ('green-sparkle', 'Green sparkle', 3, .9, washes(GRN, {'cut up': 1, 'line B': 1, 'line C': 1}, .3) | beams(G, LIME, G), mo('sparkle', 20, 255, 'x', BOTH), hd('nod', B1, 0, 25, 'left-right'), 1,
  'Green sparkles across the hall (20 a minute, never more); the beams nod fast, mirrored.'),
 # ACT 4 — Éléktra b2b Kogeno · Ash: slow, deep, one colour at a time; the cubes draw
 ('drop', 'Drop', 4, .25, washes(RED, {'dj back': .8}, .2), mo('breathe', 33, 200), None, 6,
  'The drop: red embers everywhere, the DJ from behind; everything breathes to black.'),
 ('one-beam-back', 'One beam back', 4, .2, washes(WHT, {}, .2) | beams(plane=WW), mo('none', 60, 0), hd('wave', B8, 0, 22), 6,
  'Warm white behind the DJ, a slow lean wave; the washes a white ember.'),
 ('green-ash', 'Green ash', 4, .2, washes(GRN, {'line A': .6, 'line D': .6}, .15), mo('sine', 33, 255, 'y-'), None, 6,
  'SIGNATURE: the darkest scene. Green rolls to black along the wall; the cubes one slow line.'),
 ('ember-floor', 'Ember floor', 4, .3, washes(RED, {'line L': .7, 'line R': .7}, .2) | beams(left=R, right=R), mo('sine', 33, 200, 'y-'), ride(B8, 120, 25), 6,
  'The floor lines red rolling toward the DJ; red sides ride slowly across the hall.'),
 ('slow-line', 'Slow line', 4, .3, washes(WHT, {}, .2) | beams(left=WW, right=WW), mo('none', 60, 0), ride(B8, 150, 25, 'left-right', 'figure8'), 5,
  'Warm white sides draw one slow wide figure eight over the hall; the washes a white ember, still.'),
 ('green-mist', 'Green mist', 4, .35, washes(GRN, {'cut up': .7, 'cut down': .7}, .2), mo('sparkle', 20, 255, 'x'), None, 5,
  'Green on the truss, sparkling faintly; the haze reads.'),
 ('deep-tent', 'Deep tent', 4, .4, washes(RED, {'line A': .6, 'line B': .6, 'line C': .6, 'line D': .6, 'dj back': .6}) | beams(left=R, right=RO), mo('breathe', 33, 150), hd('wave', B4, 0, 15), 6,
  'A tent of red from the sides over a red wall; the 40 W layer is off tonight.'),
 ('green-breath', 'Green breath', 4, .35, washes(GRN, {'line A': .5, 'line B': .5, 'line C': .5, 'line D': .5}, .2) | beams(plane=G), mo('breathe', 33, 200), hd('nod', B8, 0, 20), 6,
  'Green breathes on the wall; green behind the DJ leans slowly; the cubes breathe with it.'),
 ('cold-rise', 'Cold rise', 4, .7, washes(WHT, {'cut up': 1, 'line A': .8, 'line B': .8, 'line C': .8, 'line D': .8}, .3) | beams(plane=W), mo('comet', 132, 255, 'y-'), scan(B1, 120, 25, 'ripple'), 4,
  'A white comet toward the DJ; open white scans behind him. The second rise begins.'),
 ('riser-two', 'Riser two', 4, .9, washes(RED, ALL, .9) | beams(R, R, R), mo('pump', 132, 255, 'patch', BOTH), ride(B2, 150, 25, 'ripple'), 2,
  'The red riser: everything red, pumping, 18 beams riding wide and fast.'),
 # ACT 5 — Mixtinct · Last furnace: the last strobes, the word at full, one beam to loop
 ('second-drop', 'Second drop', 5, 1., washes(WHT, ALL) | beams(W, W, WW), mo('pump', 132, 255, 'patch', BOTH), scan(B1, 120, 25, 'left-right'), 0,
  'The second drop: every lamp white, pumping; the beams scan fast, mirrored.'),
 ('blackout-two', 'Blackout II', 5, 0., {}, None, None, 0,
  'Six seconds of nothing before the word.'),
 ('the-word-last', 'The word, last', 5, 1., washes(GRN, {'cut up': 1, 'cut down': 1}, .3) | beams(G, G, LIME), mo('pump', 132, 255, 'patch', BOTH), ride(B2, 150, 25, 'ripple'), 1,
  'SIGNATURE: the word at full: green rig, 18 green beams riding wide, pumping.'),
 ('red-room-last', 'Red room, last', 5, 1., washes(RED, {'line A': 1, 'line B': 1, 'line C': 1, 'line D': 1, 'dj back': 1, 'cut down': 1}, .3) | beams(R, RO, R), mo('bars', 132, 255, 'x', BOTH), hd('nod', B1, 0, 25, 'alternate'), 1,
  'SIGNATURE: red from the floor, red bars, the beams scissoring fast, red-orange left.'),
 ('white-blocks', 'White blocks', 5, .95, washes(WHT, {'line L': 1, 'line R': 1, 'cut up': 1}, .3) | beams(WW, W, None), mo('blocks', 132, 255, 'x', BOTH), scan(B1, 90, 20, 'ripple'), 1,
  'White blocks flip across the hall; warm white behind the DJ, open white left only, scanning.'),
 ('last-strobe', 'Last strobe', 5, 1., washes(WHT, ALL) | beams(W, W, WW), mo('strobe', 132, 255, 'patch', BOTH), None, 0,
  'The last strobe: everything open white, eight seconds.'),
 ('afterglow', 'Afterglow', 5, .5, washes(RED, {'line A': .6, 'line B': .6, 'line C': .6, 'line D': .6, 'dj back': .6}) | beams(left=RO, right=R), mo('breathe', 33, 150, 'patch', BOTH), hd('wave', B4, 0, 20), 4,
  'The furnace cooling: red breathing, red-orange sides waving.'),
 ('the-last-run', 'The last run', 5, .6, washes(GRN, {'line A': .8, 'line B': .8, 'line C': .8, 'line D': .8, 'dj kicker': .6}) | beams(G, LIME, None), mo('chase', 132, 255, 'y-', BOTH), ride(B4, 120, 25, 'ripple'), 4,
  'Green chases toward the DJ one last time; green behind him and lime on the left ride wide.'),
 ('embers-out', 'Embers out', 5, .3, washes(RED, {'dj back': .6}, .2) | beams(plane=R), mo('sparkle', 20, 255, 'x', BOTH), None, 5,
  'Red sparkling out across the hall, the DJ a shadow.'),
 ('one-beam-loop', 'One beam (loop)', 5, .2, washes(WHT, {}, .15) | beams(plane=WW), mo('breathe', 33, 100, 'patch', BOTH), hd('nod', B8, 0, 18), 6,
  'SIGNATURE: one warm white beam on the DJ from behind, the washes a white ember; it ties to scene 1.'),
]
assert len(SCENES) == 50, len(SCENES)
def sat(hx): r, g, b = (int(hx[i:i + 2], 16) / 255 for i in (1, 3, 5)); return colorsys.rgb_to_hsv(r, g, b)[1]
base = json.load(open(BASE))
out = copy.deepcopy(base)
TIERS = ((0.85, 'full'), (0.5, 'mid'), (0.0, 'low'))
scenes, uses, errors = [], {}, []
for k, (sid, title, act, energy, parts, motion, heads, fade, intent) in enumerate(SCENES):
    b6 = base['scenes'][k]
    hold = b6['cue']['hold_s']                                   # A1: hold_s of scene k = v6 scene k (the laser frames' loop)
    parts = {p: [c, float(l)] for p, (c, l) in parts.items()}
    if 'laser' in b6['parts']: parts['laser'] = list(b6['parts']['laser'])   # the laser session's level (the lead raises the cubes to full separately)
    whole = all(p in parts and parts[p][1] >= 0.95 for p in BEAMS) and len(parts) >= len(WASHES) + 3   # a whole-rig hit is symmetric by design
    if act in (2, 3, 5) and not whole and 'side line right' in parts and parts.get('side line left') == parts['side line right']:
        del parts['side line right']                                # one bright group at a time (R: one group): the left side alone
    fams = set()
    for p, (c, l) in parts.items():
        if p in ('road', 'entrance', 'laser'): continue
        if p in BEAMS:
            if c not in SLOTS: errors.append(f'{sid}: beam colour {c} is not a seen slot')
            if not (l == 0 or l >= 0.95): errors.append(f'{sid}: beam {p} at {l} (A9: 0 or >= 0.95)')
            uses[SLOTS.get(c, c)] = uses.get(SLOTS.get(c, c), 0) + 1
        else:
            if c not in (RED, GRN, WHT): errors.append(f'{sid}: wash colour {c} is not a clean recipe (B2)')
            if c == WHT and sat(c) > 0.10 or c != WHT and sat(c) < 0.85: errors.append(f'{sid}: {c} is a pastel (R6)')
        if l >= 0.3: fams.add(FAMILY[c])
    colour_fams = fams - {'white'}
    if len(colour_fams) > 1: errors.append(f'{sid}: two colour families {sorted(colour_fams)} (R4)')
    if colour_fams and 'white' in fams:                          # R5: a colour scene carries no white lamp over 0.1
        for p, (c, l) in parts.items():
            if p not in ('road', 'entrance', 'laser') and FAMILY[c] == 'white' and l > 0.1: errors.append(f'{sid}: white {p} at {l} in a {colour_fams.pop()} scene (R5)')
    if (motion or {}).get('mode') == 'strobe':
        for p, (c, l) in parts.items():
            if p not in ('road', 'entrance', 'laser') and FAMILY[c] != 'white': errors.append(f'{sid}: strobe with colour {c} on {p} (C3)')
    if (motion or {}).get('mode') == 'glitch': errors.append(f'{sid}: glitch measured 16 flashes/s by scenes_flash.cjs (2026-10-17): never')
    if (motion or {}).get('mode') == 'sparkle' and motion['bpm'] > 20: errors.append(f'{sid}: sparkle over 20 bpm (C3)')
    if heads:
        if heads['pattern'] in ('sweep', 'cross', 'fan'): errors.append(f'{sid}: pan-only pattern turns nothing on upright beams (heads_check.mjs)')
        if abs(heads['period_s'] / BAR - round(heads['period_s'] / BAR)) > 0.01: errors.append(f'{sid}: head period {heads["period_s"]} is not whole bars')
        if not (15 <= heads['tilt_deg'] <= 25): errors.append(f'{sid}: tilt {heads["tilt_deg"]} outside 15..25')
    if fade > hold: errors.append(f'{sid}: fade {fade} > hold {hold}')
    if act in (2, 3, 5) and motion and motion['mode'] != 'none' and BEAM not in motion['kinds']: errors.append(f'{sid}: act {act} motion without the beams in kinds (E2)')
    if act in (2, 3, 5) and parts and not whole and parts.get('side line left') == parts.get('side line right') and parts.get('side line left'): errors.append(f'{sid}: side line left == right in act {act} (E1)')
    laser_lines = copy.deepcopy(b6.get('laser_lines'))
    s = {'id': sid, 'title': f'{ARTIST[act]} · {title}', 'act': act, 'intent': intent, 'parts': parts, 'motion': motion, 'heads': heads,
         'laser_colour': b6.get('laser_colour'), 'desk_caps': b6.get('desk_caps'), 'cue': {'fade_s': fade, 'hold_s': hold},
         'notes': f'v2.0 scene {k + 1}; family {"+".join(sorted(fams)) or "blackout"}; outside = the owner\'s rule (v6 scene {k + 1}); laser = the laser session\'s design of v6 scene {k + 1} ({b6["id"]}), colours theirs; hold = v6',
         'laser': copy.deepcopy(b6.get('laser')), 'energy': energy, 'energy_tier': next(n for t, n in TIERS if energy >= t),
         'laser_lines': laser_lines if LASER40 else None, 'laser40': laser_lines, 'family': sorted(fams), 'intent_v1': b6['intent']}
    scenes.append(s)
# A12: each scene differs from both neighbours in >= 2 of the 6 carriers, hex ignored
def carriers(s):
    lit = frozenset(p for p, (c, l) in s['parts'].items() if l > 0.3 and p not in ('road', 'entrance', 'laser'))
    m = s['motion'] or {}; h = s['heads'] or {}
    lvls = [l for p, (c, l) in s['parts'].items() if p not in ('road', 'entrance', 'laser')]
    return (lit, (m.get('mode'), m.get('spatial')), (h.get('pattern'), h.get('period_s')), s['cue']['fade_s'] == 0,
            s['parts'].get('side line left', [0, 0])[1] != s['parts'].get('side line right', [0, 0])[1], round(sum(l >= 0.6 for l in lvls) / max(1, len(lvls)), 1))
equal_neighbours = 0
for i in range(50):
    for j in (i - 1, i + 1):
        if 0 <= j < 50:
            diff = sum(a != b for a, b in zip(carriers(scenes[i]), carriers(scenes[j])))
            if diff < 2: equal_neighbours += 1; errors.append(f'{scenes[i]["id"]} ~ {scenes[j]["id"]}: only {diff} carrier differs (A12)')
if errors: sys.exit('\n'.join(errors) + f'\n{len(errors)} rule failures, nothing written')
loop_s = sum(s['cue']['fade_s'] + s['cue']['hold_s'] for s in scenes)
holds = sum(s['cue']['hold_s'] for s in scenes); assert holds == 1116, holds
def peak(s): return max([l for p, (c, l) in s['parts'].items() if p not in ('road', 'entrance', 'laser')] or [0])
bright_t = sum(s['cue']['hold_s'] for s in scenes if peak(s) >= 0.85) / holds
dark_t = sum(s['cue']['hold_s'] for s in scenes if peak(s) <= 0.35) / holds
beams_full = sum(1 for s in scenes if any(p in s['parts'] for p in BEAMS))
moving = sum(1 for s in scenes if s['heads']); strobing = sum(1 for s in scenes if (s['motion'] or {}).get('mode') in ('strobe', 'pump', 'bars', 'glitch'))
cover = {p: sum(1 for s in scenes if p in s['parts'] and s['parts'][p][1] > 0) for p in WASHES + BEAMS}
out['scenes'], out['loop'], out['loop_s'] = scenes, True, loop_s
out['version'] = 'v2.2-lime-2026-10-17'
out['palette'] = [{'hex': h, 'name': n} for h, n in PALETTE] + [{'hex': h, 'name': 'laser (the laser session\'s colour)'} for h in LASER_PALETTE]
out['beam_wheel_seen'] = {h: {'slot': n, 'hex': h} for h, n in SLOTS.items()}
out['what'] = ('MOXIR scenes v2.0 (2026-10-17): the underground loop, 50 scenes in 5 acts named by the line-up (Cloistral, Innersha, Kerrie, Éléktra b2b Kogeno, '
               'Mixtinct); the techno gamut (washes clean red / green / white, beams in seen slots), one colour family per scene, beams at full power or off, '
               'strobes / pumps / bars as the peaks, rides (wide slow pan+tilt) and scans (fast) on the 18 heads, every wash lit in every scene but two blackout cuts; '
               'holds = v6 (the laser frames\' loop); lasers = the laser session\'s design, colours theirs; 40 W lines under laser40, off unless --laser40 on. '
               'Rules: agent-reports-2026-10-17/lead/LEAD-BRIEF-addendum.md (section (g) wins); concept: scenes-v2/CONCEPT.md. v1 = the v6 data, live in the hall, untouched.')
out['source'] = base['source'] + ' · v2.0 2026-10-17 by Fable (lead), docs/moxir/scenes-v2-2026-10-17/scenes_v2.py from this file (outside parts, lasers, holds kept scene by scene)'
out['rules'].update({'heads_patterns': ['nod', 'wave', 'circle', 'figure8'], 'beam_colours': 'v2.2: open, red-orange, lime only (owner 20:1x: lime, not regular colours)',
    'beam_levels': '0 or >= 0.95 (A9)', 'wash_colours': 'v2.2: ember #ff3a12, lime #9cff00, white #ffffff only (lead 20:15); beams open #ffffff, red-orange #ff5a1e, lime #8cff3a only; no other colour',
    'family': 'one colour family per scene (+ white at <= 0.1 in a colour scene); red and green never together (R4, R5)',
    'holds': 'hold_s of scene k = v6 scene k, sum 1116 s (A1)', 'head_period': 'whole bars at 132 bpm (3.636 s)', 'tilt': '15..25 deg',
    'floor': 'line L + line R lit in the scene\'s family colour like every wash (owner 12:0x); the v3 "floor never red" rule is withdrawn by that word',
    'laser40': 'the 40 W lines are a layer: laser40 per scene, laser_lines null unless --laser40 on (owner 12:0x: enough); graphics never 74,75,78,79,166,167,246-253',
    'targets': {'dark_share_mean_min': 0.55, 'per_render_dark_min': 0.45, 'white_share_loop_max': 0.45, 'method': 'picture_palette.py on the 50 renders'},
    'numbers': {'bright_time_share': round(bright_t, 3), 'dark_time_share': round(dark_t, 3), 'scenes_with_beams_full': beams_full, 'structure_equal_neighbours': equal_neighbours,
                'scenes_heads_moving': moving, 'scenes_strobing_or_pumping': strobing, 'part_coverage_scenes': cover}})
json.dump(out, open(OUT, 'w'), indent=1, ensure_ascii=False)
print(f'scenes 50 | holds {holds} | loop_s {loop_s} | bright time {bright_t:.2f} (addendum E1 asks <= 0.20; the owner\'s 12:0x "washes colourful in every scene" wins) '
      f'| dark time {dark_t:.2f} | beams full in {beams_full} | heads moving in {moving} | strobe/pump/bars/glitch in {strobing} | equal neighbours {equal_neighbours}')
print('beam slot uses', uses); print('coverage', cover); print('laser40 layer', 'ON' if LASER40 else 'off')
