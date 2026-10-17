#!/usr/bin/env python3
"""scenes_v4.py — MOXIR scenes v4 (2026-10-18): 100 new scenes at FULL POWER, 20 per set of the line-up.
Owner 2026-10-18 00:2x: "i think we need to other new v4 100 scenes" · "new 100 use full power". Still in force: underground mood, contrast
dark/bright (not brightness), techno colours (lime, rust/ember, ash white; red only as an accent), strobes and wild beam movement (rides,
scans) on the moving heads, lines, never cheesy shapes.
Full power = every part lit in a scene is at level 1.0; contrast comes from WHICH parts are lit and from movement, never from dimming.
    python3 -I -B scenes_v4.py BASE_V2_2.json OUT.json PLAN40_BASE.json PLAN40_OUT.json
BASE = scripts/place/rigs/moxir-scenes-50-v2-2-2026-10-17.json (v2.2, the scenes playing on 10-17: schema, palette, rules, the cube lasers'
designs). Palette and checks = v2.2's (scenes_v2.py, branch feat/moxir-scenes-v2, commit 10cee292): washes ember #ff3a12 / lime #9cff00 /
white; beams red-orange #ff5a1e / lime #8cff3a / open; one colour family per scene; strobes only white; sparkle <= 20 bpm; head patterns
nod wave circle figure8, tilt 15..25, periods in whole bars at 132 bpm. Haze = the hang's, as in v2.2 (no part here).
40 W: a scene marked X lights the part `laser` (cubes + 40 W dimmer, one part in the hang) and gets a 40 W plan entry (la40-player.mjs
--plan): every graphic except 74-75, 78-79, 166-167, 246-253, its own start, allowStatic, colour from the scene (8 white, 25 red, 42 green)."""
import json, sys, copy, colorsys
BASE, OUT, PLAN_IN, PLAN_OUT = sys.argv[1:5]
EMB, LIM, WHT = '#ff3a12', '#9cff00', '#ffffff'                 # washes
RO, LIME, OPEN = '#ff5a1e', '#8cff3a', '#ffffff'                # beams (seen slots)
WASH_OF = {'e': EMB, 'g': LIM, 'w': WHT}
BEAM_OF = {'e': RO, 'g': LIME, 'w': OPEN}
LASER_OF = {'e': '#ff3a12', 'g': '#00ff00', 'w': '#eefdfd'}     # the laser session's colours
LA40_COLOUR = {'e': 25, 'g': 42, 'w': 8}
FAMILY_NAME = {'e': 'ember', 'g': 'lime', 'w': 'white'}
SLOTS = {OPEN: 'open', RO: 'red-orange', LIME: 'lime'}
WASH, BEAM = 'up-pl5403', 'up-b380f'
BOTH = (WASH, BEAM)
WCODE = {'L': 'line L', 'R': 'line R', 'U': 'cut up', 'D': 'cut down', 'B': 'dj back', 'K': 'dj kicker'}
BCODE = {'P': 'plane 1', 'l': 'side line left', 'r': 'side line right'}
WASHES, BEAMS = tuple(WCODE.values()), tuple(BCODE.values())
ALLW = 'LRUDBK'
BAR = 3.636
B1, B2, B4, B8 = BAR, 2 * BAR, 4 * BAR, 8 * BAR
ARTIST = {1: 'Cloistral', 2: 'Innersha', 3: 'Kerrie', 4: 'Éléktra b2b Kogeno', 5: 'Mixtinct'}
NEVER40 = {74, 75, 78, 79, 166, 167} | set(range(246, 254))
def mo(mode, bpm, spatial='patch', kinds=(WASH,), depth=255): return {'mode': mode, 'bpm': bpm, 'depth': depth, 'spatial': spatial, 'kinds': list(kinds), 'still': 0.0}
def hd(pattern, period, pan=0, tilt=20, spatial='ripple'): return {'pattern': pattern, 'period_s': round(period, 3), 'pan_deg': pan, 'tilt_deg': tilt, 'spatial': spatial, 'kinds': [BEAM]}
def ride(period=B4, pan=120, tilt=25, spatial='left-right', pattern='circle'): return hd(pattern, period, pan, tilt, spatial)
def scan(period=B1, pan=90, tilt=20, spatial='alternate', pattern='figure8'): return hd(pattern, period, pan, tilt, spatial)
def nod(period, tilt=20, spatial='ripple'): return hd('nod', period, 0, tilt, spatial)
def wave(period, tilt=20): return hd('wave', period, 0, tilt)
X = 'X'
# (title, family, washes lit, beams lit, motion, heads, fade_s, hold_s, intent[, X = the 40 W + cubes])   family '-' = blackout
SETS = {
 1: [  # Cloistral — the cold opening: one or two things lit, slow rides, the room black around them
  ('Ash door', 'w', 'B', '', mo('breathe', 33), None, 6, 22, 'One white wash behind the DJ, nothing else; the hall black around him.'),
  ('Rust line', 'e', 'L', '', mo('sine', 33, 'y-'), None, 6, 20, 'Only the left floor line, ember, rolling toward the DJ.'),
  ('First beam', 'w', '', 'P', mo('none', 60, depth=0), wave(B8, 20), 5, 22, 'One plane of open white beams behind the DJ leaning slowly; no wash at all.'),
  ('Lime seam', 'g', 'R', 'l', mo('breathe', 33), nod(B4, 18), 5, 20, 'The right floor line lime; the left side beams lime, leaning across it.'),
  ('Truss smoke', 'w', 'U', '', mo('breathe', 33), None, 5, 18, 'The truss up into the haze, white; the 40 W draw white lines above the heads.', X),
  ('Ember ride', 'e', '', 'lr', mo('none', 60, depth=0), ride(B8, 150, 25, 'left-right'), 5, 22, 'Both side beams ember, one slow wide ride across the hall, mirrored; no wash.'),
  ('Back and kicker', 'w', 'BK', '', mo('pulse', 66, 'radial'), None, 4, 18, 'The DJ from behind and the kicker in front, white pulses out from him.'),
  ('Lime columns', 'g', 'D', 'lr', mo('breathe', 33), nod(B2, 20, 'alternate'), 4, 20, 'The truss down lime on the floor; the side beams lean in scissors.'),
  ('Cold ray', 'w', '', 'P', mo('comet', 66, 'y-', BOTH), scan(B1, 90, 20), 4, 18, 'Open white behind the DJ scanning fast; the 40 W white lines over the floor.', X),
  ('Ember wall', 'e', 'LR', '', mo('comet', 66, 'y-'), None, 4, 18, 'Both floor lines ember, a comet runs toward the DJ.'),
  ('Green line', 'g', '', 'P', mo('none', 60, depth=0), ride(B4, 120, 25, 'ripple', 'figure8'), 4, 20, 'Lime beams behind the DJ ride a wide figure eight; 40 W green lines.', X),
  ('Black cut', '-', '', '', None, None, 0, 4, 'Four seconds of nothing.'),
  ('White silhouette', 'w', 'B', 'l', mo('breathe', 33), wave(B4, 18), 5, 20, 'The DJ white from behind; the left side beams alone, waving.'),
  ('Ember kicker', 'e', 'K', 'P', mo('pulse', 66, 'radial'), nod(B4, 20), 4, 18, 'The kicker ember on the DJ; ember beams behind him nod slowly.'),
  ('Lime truss', 'g', 'UD', '', mo('sine', 33, 'y'), None, 4, 20, 'The truss lime up and down, rolling; the 40 W green lines above.', X),
  ('White sides', 'w', '', 'lr', mo('none', 60, depth=0), ride(B4, 150, 25, 'ripple'), 4, 18, 'Both side beams open white riding circles in a ripple; no wash.'),
  ('Ember net', 'e', '', 'Plr', mo('pulse', 66, 'patch', BOTH), ride(B8, 120, 25, 'ripple'), 4, 20, 'All 18 beams ember in one slow ripple ride; the 40 W red.', X),
  ('Lime floor', 'g', 'LR', '', mo('pingpong', 66, 'x'), None, 4, 18, 'Both floor lines lime, ping-ponging across the hall.'),
  ('White room', 'w', ALLW, '', mo('breathe', 33), None, 5, 16, 'Every wash white, breathing: the first full room, no beam.'),
  ('Cold furnace', 'e', 'B', 'P', mo('sine', 33), nod(B8, 18), 5, 18, 'Ember from behind the DJ and his beams leaning slowly; the 40 W red over the floor.', X),
 ],
 2: [  # Innersha — ignition: the rig joins the beat, chases and scans, left and right never the same
  ('Ignition', 'e', 'LR', 'l', mo('chase', 132, 'y-', BOTH), ride(B4, 120, 25, 'ripple'), 3, 16, 'Ember chases the floor lines toward the DJ; only the left side rides.'),
  ('White pump', 'w', 'UD', 'P', mo('pump', 132, 'patch', BOTH), scan(B1, 90, 20), 2, 14, 'The truss white pumping on the beat; white behind the DJ scans fast.', X),
  ('Lime bars', 'g', 'LR', 'r', mo('bars', 132, 'x', BOTH), nod(B2, 25, 'left-right'), 3, 16, 'Lime bars flip across the floor; the right side nods.'),
  ('Ember out', 'e', 'DK', 'P', mo('chase', 132, 'radial-', BOTH), ride(B2, 150, 25), 3, 16, 'Ember chases out from the DJ; his beams on a fast wide ride.'),
  ('The word', 'g', '', 'Plr', mo('pump', 132, 'patch', BOTH), None, 2, 16, 'The teaser\'s column: 18 lime beams straight up, pumping; the 40 W green.', X),
  ('White comet', 'w', 'LR', 'l', mo('comet', 132, 'y', BOTH), scan(B1, 120, 20, 'ripple', 'circle'), 3, 14, 'A white comet runs the floor lines toward the door; the left side scans circles.'),
  ('Ember scissors', 'e', 'B', 'r', mo('pump', 132, 'patch', BOTH), nod(B1, 25, 'alternate'), 3, 14, 'Ember from behind the DJ; the right side beams scissor fast.'),
  ('Lime comb', 'g', 'UD', 'P', mo('pingpong', 132, 'x', BOTH), ride(B4, 120, 25, 'ripple', 'figure8'), 3, 16, 'The truss lime ping-pongs; lime behind the DJ rides a figure eight.', X),
  ('White bars', 'w', 'BK', 'Plr', mo('bars', 132, 'x', BOTH), scan(B1, 90, 25, 'left-right'), 3, 14, 'White bars; all beams scan mirrored, the DJ lit both sides.'),
  ('Black cut II', '-', '', '', None, None, 0, 4, 'Four seconds of nothing.'),
  ('Ember run', 'e', 'L', 'P', mo('chase', 132, 'y-', BOTH), scan(B2, 90, 20, 'ripple'), 2, 14, 'The left floor line ember runs; ember behind the DJ scans; 40 W red.', X),
  ('Lime riser line', 'g', 'R', 'l', mo('comet', 132, 'y-', BOTH), ride(B2, 150, 25), 2, 14, 'The right floor line a lime comet; the left side rides fast and wide.'),
  ('White kicker', 'w', 'K', 'r', mo('pulse', 132, 'radial', BOTH), nod(B1, 25, 'alternate'), 2, 14, 'Only the kicker white on the DJ; the right side scissors.'),
  ('Lime net', 'g', '', 'Plr', mo('chase', 132, 'x', BOTH), ride(B4, 150, 25, 'ripple'), 3, 16, 'All 18 beams lime chasing, riding circles in a ripple; 40 W green.', X),
  ('Ember blocks', 'e', 'LRUD', '', mo('blocks', 132, 'x', BOTH), None, 2, 14, 'Ember blocks flip on the floor and the truss; no beam.'),
  ('White radar', 'w', 'UD', 'Plr', mo('radar', 132, 'x', BOTH), ride(B4, 150, 25), 2, 16, 'A white radar line sweeps; all beams ride wide; 40 W white.', X),
  ('Lime pump', 'g', 'BK', 'P', mo('pump', 132, 'patch', BOTH), scan(B1, 120, 25, 'ripple'), 2, 14, 'The DJ lime from both sides, pumping; his beams scan in a ripple.'),
  ('Ember side', 'e', '', 'l', mo('bars', 132, 'x', BOTH), ride(B2, 120, 25, 'left-right', 'figure8'), 2, 14, 'Only the left side ember, a fast figure eight; nothing else lit.'),
  ('White chase', 'w', 'LR', 'P', mo('chase', 132, 'y', BOTH), wave(B2, 20), 2, 14, 'White chases the floor lines; white behind the DJ waves.'),
  ('Riser', 'e', ALLW, 'Plr', mo('pump', 132, 'patch', BOTH), ride(B2, 150, 25, 'ripple'), 2, 16, 'Everything ember, pumping; all 18 beams ride fast; 40 W red. The rise.', X),
 ],
 3: [  # Kerrie — the instrument: strobes, hits, blackouts
  ('White cathedral', 'w', ALLW, 'Plr', mo('strobe', 132, 'patch', BOTH), scan(B1, 120, 25, 'ripple', 'circle'), 0, 12, 'Every lamp open white strobing at 3 a second; the beams scan circles; 40 W white.', X),
  ('Blackout', '-', '', '', None, None, 0, 4, 'The cut.'),
  ('Lime storm', 'g', 'UD', 'Plr', mo('bars', 132, 'x', BOTH), scan(B1, 120, 25, 'left-right'), 1, 14, 'Lime bars on the truss; all beams scan fast, mirrored; 40 W green.', X),
  ('Ember one', 'e', 'B', '', mo('pump', 132, 'patch', BOTH), None, 0, 10, 'Only the back of the DJ, ember, pumping. Everything else black.'),
  ('Blinders', 'w', ALLW, '', mo('strobe', 132, 'patch', BOTH), None, 0, 8, 'Every wash open white strobing; no beam. Eight seconds.'),
  ('Lime scan', 'g', '', 'l', mo('pingpong', 132, 'x', BOTH), scan(B1, 90, 20), 1, 12, 'Only the left side lime, scanning fast in figure eights.'),
  ('Ember room', 'e', ALLW, 'Plr', mo('pump', 132, 'patch', BOTH), nod(B2, 25, 'all'), 0, 14, 'The room ember from the floor, every beam nodding together; 40 W red.', X),
  ('Blackout II', '-', '', '', None, None, 0, 3, 'The cut.'),
  ('White radar line', 'w', 'LR', 'r', mo('radar', 132, 'x', BOTH), ride(B4, 150, 25), 1, 12, 'A white radar on the floor lines; the right side rides wide.'),
  ('Lime sparkle', 'g', 'LRUD', 'P', mo('sparkle', 20, 'x', BOTH), nod(B1, 25, 'left-right'), 1, 14, 'Lime sparkles over the floor and truss; the DJ\'s beams nod fast; 40 W green.', X),
  ('Ember bars', 'e', 'UD', 'l', mo('bars', 132, 'x', BOTH), ride(B2, 150, 25, 'ripple'), 0, 12, 'Ember bars on the truss; the left side rides fast.'),
  ('White beams strobe', 'w', '', 'Plr', mo('strobe', 132, 'patch', BOTH), None, 0, 8, 'Only the 18 beams, open white, straight up, strobing.'),
  ('Lime blocks', 'g', 'BK', 'r', mo('blocks', 132, 'x', BOTH), scan(B1, 120, 20, 'ripple', 'circle'), 1, 12, 'Lime blocks on the DJ; the right side scans circles.'),
  ('Hit', 'w', 'U', 'P', mo('pump', 132, 'patch', BOTH), wave(B1, 25), 0, 10, 'The truss up and the DJ\'s beams, white, pumping hits.'),
  ('Ember scissors II', 'e', 'K', 'l', mo('pump', 132, 'patch', BOTH), nod(B1, 25, 'alternate'), 0, 12, 'The kicker ember; the left side scissors fast.'),
  ('Lime cathedral', 'g', ALLW, 'Plr', mo('pump', 132, 'patch', BOTH), scan(B1, 120, 25, 'ripple', 'circle'), 0, 14, 'Everything lime, pumping; all beams scanning circles; 40 W green.', X),
  ('Floor strobe', 'w', 'LR', '', mo('strobe', 132, 'patch', BOTH), None, 0, 8, 'Only the floor lines, white, strobing.'),
  ('Ember radar', 'e', '', 'Plr', mo('radar', 132, 'x', BOTH), ride(B4, 150, 25, 'ripple'), 1, 12, 'All 18 beams ember, a radar sweep, riding wide; 40 W red.', X),
  ('Blackout III', '-', '', '', None, None, 0, 4, 'The cut.'),
  ('The instrument', 'w', ALLW, 'Plr', mo('strobe', 132, 'patch', BOTH), ride(B2, 150, 25, 'ripple'), 0, 12, 'Every lamp white strobing while all beams ride wide and fast; 40 W white.', X),
 ],
 4: [  # Éléktra b2b Kogeno — ash: slow, deep, one thing at a time, then the second rise
  ('Drop', 'e', 'B', '', mo('breathe', 33), None, 6, 20, 'The drop: only ember from behind the DJ, breathing.'),
  ('One beam back', 'w', '', 'P', mo('none', 60, depth=0), wave(B8, 22), 6, 22, 'Open white beams behind the DJ, a slow lean wave; nothing else.'),
  ('Green ash', 'g', 'L', '', mo('sine', 33, 'y-'), None, 6, 22, 'The darkest: the left floor line lime, rolling to black.'),
  ('Ember floor', 'e', 'R', 'lr', mo('sine', 33, 'y-'), ride(B8, 120, 25), 6, 20, 'The right floor line ember; both sides ride slowly across the hall.'),
  ('Slow line', 'w', '', 'lr', mo('none', 60, depth=0), ride(B8, 150, 25, 'left-right', 'figure8'), 5, 22, 'Both sides white draw one slow wide figure eight; 40 W white lines.', X),
  ('Lime mist', 'g', 'U', '', mo('sparkle', 20, 'x'), None, 5, 20, 'The truss lime up into the haze, sparkling faintly.'),
  ('Deep tent', 'e', 'D', 'lr', mo('breathe', 33), wave(B4, 15), 6, 20, 'A tent of ember sides over the truss down; 40 W red.', X),
  ('Green breath', 'g', 'BK', 'P', mo('breathe', 33), nod(B8, 20), 6, 20, 'The DJ lime from both sides, breathing; his beams lean slowly.'),
  ('White kicker alone', 'w', 'K', '', mo('pulse', 66, 'radial'), None, 5, 18, 'Only the kicker, white, pulsing on the DJ.'),
  ('Ember line ride', 'e', '', 'P', mo('none', 60, depth=0), ride(B8, 120, 25, 'ripple'), 5, 20, 'Ember beams behind the DJ ride slow circles; nothing else.'),
  ('Lime cross', 'g', 'LR', '', mo('pingpong', 33, 'x'), None, 5, 20, 'Both floor lines lime, slowly crossing.'),
  ('White truss down', 'w', 'D', 'l', mo('breathe', 33), wave(B4, 18), 5, 18, 'The truss down white; the left side waves; 40 W white.', X),
  ('Ash cut', '-', '', '', None, None, 0, 6, 'Six seconds of nothing.'),
  ('Ember comet', 'e', 'LR', 'P', mo('comet', 66, 'y-'), scan(B2, 90, 20), 5, 18, 'An ember comet along both floor lines; the DJ\'s beams scan.'),
  ('Lime one side', 'g', '', 'l', mo('none', 60, depth=0), ride(B8, 150, 25, 'left-right'), 5, 22, 'Only the left side lime, a slow wide ride.'),
  ('White ash', 'w', 'UD', '', mo('sine', 33, 'y'), None, 5, 20, 'The truss white up and down, rolling.'),
  ('Ember slow net', 'e', '', 'Plr', mo('pulse', 66, 'patch', BOTH), ride(B8, 120, 25, 'ripple', 'figure8'), 5, 20, 'All 18 beams ember, a slow figure-eight ripple; 40 W red.', X),
  ('Lime back', 'g', 'B', 'r', mo('breathe', 33), nod(B4, 18), 5, 18, 'Lime from behind the DJ; the right side nods.'),
  ('Cold rise', 'w', 'LR', 'P', mo('comet', 132, 'y-'), scan(B1, 120, 25, 'ripple'), 4, 16, 'A white comet toward the DJ; his beams scan; 40 W white. The second rise.', X),
  ('Riser two', 'g', ALLW, 'Plr', mo('pump', 132, 'patch', BOTH), ride(B2, 150, 25, 'ripple'), 2, 14, 'Everything lime, pumping; 18 beams ride wide and fast; 40 W green.', X),
 ],
 5: [  # Mixtinct — the last furnace: the last strobes, the word at full, one beam to loop
  ('Second drop', 'w', ALLW, 'Plr', mo('pump', 132, 'patch', BOTH), scan(B1, 120, 25, 'left-right'), 0, 14, 'Every lamp white, pumping; the beams scan fast, mirrored; 40 W white.', X),
  ('Blackout IV', '-', '', '', None, None, 0, 4, 'The cut before the word.'),
  ('The word, last', 'g', 'UD', 'Plr', mo('pump', 132, 'patch', BOTH), ride(B2, 150, 25, 'ripple'), 1, 16, 'The word at full: the truss lime, 18 lime beams riding wide; 40 W green.', X),
  ('Ember room, last', 'e', 'LRB', 'l', mo('bars', 132, 'x', BOTH), nod(B1, 25, 'alternate'), 1, 14, 'Ember from the floor and behind the DJ in bars; the left side scissors.'),
  ('White blocks', 'w', 'LRU', 'P', mo('blocks', 132, 'x', BOTH), scan(B1, 90, 20, 'ripple'), 1, 14, 'White blocks flip; white behind the DJ scans.'),
  ('Last strobe', 'w', ALLW, '', mo('strobe', 132, 'patch', BOTH), None, 0, 8, 'Every wash white, strobing. Eight seconds.'),
  ('Lime out', 'g', 'DK', 'r', mo('chase', 132, 'radial-', BOTH), ride(B2, 150, 25), 1, 14, 'Lime chases out from the DJ; the right side rides fast.'),
  ('Ember one beam', 'e', '', 'P', mo('pump', 132, 'patch', BOTH), scan(B1, 90, 20), 0, 12, 'Only the DJ\'s beams, ember, pumping and scanning; 40 W red.', X),
  ('White bars wide', 'w', 'LR', 'Plr', mo('bars', 132, 'x', BOTH), ride(B4, 150, 25, 'ripple'), 1, 14, 'White bars on the floor; all beams ride circles; 40 W white.', X),
  ('Lime sparkle out', 'g', 'B', '', mo('sparkle', 20, 'x', BOTH), None, 1, 14, 'Only lime from behind the DJ, sparkling.'),
  ('Ember storm', 'e', 'UD', 'Plr', mo('bars', 132, 'x', BOTH), scan(B1, 120, 25, 'left-right'), 0, 14, 'Ember bars on the truss; all beams scan fast, mirrored; 40 W red.', X),
  ('White radar, last', 'w', '', 'l', mo('radar', 132, 'x', BOTH), ride(B4, 150, 25), 1, 14, 'Only the left side white, a radar ride.'),
  ('Blackout V', '-', '', '', None, None, 0, 4, 'The cut.'),
  ('Lime cathedral, last', 'g', ALLW, 'Plr', mo('pump', 132, 'patch', BOTH), nod(B2, 25, 'all'), 0, 14, 'Everything lime, every beam nodding together; 40 W green.', X),
  ('Final strobe', 'w', ALLW, 'Plr', mo('strobe', 132, 'patch', BOTH), scan(B1, 120, 25, 'ripple', 'circle'), 0, 10, 'The last instrument: every lamp white strobing, the beams scanning circles; 40 W white.', X),
  ('Afterglow', 'e', 'LR', 'l', mo('breathe', 33, 'patch', BOTH), wave(B4, 20), 4, 18, 'The furnace cooling: the floor lines ember breathing; the left side waves.'),
  ('The last run', 'g', 'LR', 'P', mo('chase', 132, 'y-', BOTH), ride(B4, 120, 25, 'ripple'), 4, 16, 'Lime chases toward the DJ one last time; his beams ride wide.'),
  ('Embers out', 'e', 'B', 'P', mo('sparkle', 20, 'x', BOTH), None, 5, 16, 'Ember behind the DJ sparkling out; his beams straight up.'),
  ('White ash out', 'w', 'UD', '', mo('breathe', 33, 'patch', BOTH), None, 5, 18, 'The truss white, breathing out.'),
  ('One beam (loop)', 'w', '', 'P', mo('breathe', 33, 'patch', BOTH), nod(B8, 18), 6, 22, 'Open white beams behind the DJ leaning slowly; it ties to scene 1.'),
 ],
}
assert all(len(v) == 20 for v in SETS.values()), {k: len(v) for k, v in SETS.items()}
def sat(hx): r, g, b = (int(hx[i:i + 2], 16) / 255 for i in (1, 3, 5)); return colorsys.rgb_to_hsv(r, g, b)[1]
base = json.load(open(BASE))
donor = {}                                                        # the cube lasers' design per colour, from v2.2 (the laser session's)
for s in base['scenes']:
    if s.get('laser') and s.get('laser_colour') in LASER_OF.values(): donor.setdefault(s['laser_colour'], s)
assert set(donor) == set(LASER_OF.values()), sorted(donor)
plan_base = json.load(open(PLAN_IN))
ALLOWED = [g for g in range(256) if g not in NEVER40]
out = copy.deepcopy(base)
scenes, errors, plan, n = [], [], {}, 0
for act, rows in SETS.items():
    for k, row in enumerate(rows):
        title, fam, wl, bl, motion, heads, fade, hold, intent = row[:9]
        x40 = len(row) > 9 and row[9] == X
        n += 1
        sid = f'v4-{n:03d}'
        parts = {}
        if fam != '-':
            for c in wl: parts[WCODE[c]] = [WASH_OF[fam], 1.0]
            for c in bl: parts[BCODE[c]] = [BEAM_OF[fam], 1.0]
            if x40: parts['laser'] = [LASER_OF[fam], 1.0]
        elif wl or bl or x40: errors.append(f'{sid}: a blackout lights something')
        if fam != '-' and not parts: errors.append(f'{sid}: nothing lit')
        if heads and not bl: errors.append(f'{sid}: heads move with no beam lit')
        if bl and heads is None and (motion or {}).get('mode') == 'none': errors.append(f'{sid}: beams lit, nothing moves')
        if (motion or {}).get('mode') == 'strobe' and fam != 'w': errors.append(f'{sid}: strobe in colour (strobes only white)')
        if (motion or {}).get('mode') == 'glitch': errors.append(f'{sid}: glitch is 16 flashes/s: never')
        if (motion or {}).get('mode') == 'sparkle' and motion['bpm'] > 20: errors.append(f'{sid}: sparkle over 20 bpm')
        if heads:
            if heads['pattern'] not in ('nod', 'wave', 'circle', 'figure8'): errors.append(f'{sid}: pan-only pattern turns nothing on upright beams')
            if abs(heads['period_s'] / BAR - round(heads['period_s'] / BAR)) > 0.01: errors.append(f'{sid}: head period not whole bars')
            if not 15 <= heads['tilt_deg'] <= 25: errors.append(f'{sid}: tilt outside 15..25')
        if fade > hold: errors.append(f'{sid}: fade > hold')
        if act in (2, 3, 5) and motion and motion['mode'] != 'none' and bl and BEAM not in motion['kinds']: errors.append(f'{sid}: act {act} motion without the beams (E2)')
        if act in (2, 3, 5) and 'l' in bl and 'r' in bl and 'P' not in bl: errors.append(f'{sid}: both sides the same in act {act} without the plane (E1)')
        for p, (c, l) in parts.items():
            if l != 1.0: errors.append(f'{sid}: {p} at {l} — full power is 1.0')
            if p in BEAMS and c not in SLOTS: errors.append(f'{sid}: beam colour {c} not a seen slot')
            if p in WASHES and (c == WHT and sat(c) > 0.10 or c != WHT and sat(c) < 0.85): errors.append(f'{sid}: {c} pastel')
        s = {'id': sid, 'title': f'{ARTIST[act]} · {title}', 'act': act, 'intent': intent, 'parts': parts, 'motion': motion, 'heads': heads,
             'laser_colour': None, 'desk_caps': None, 'cue': {'fade_s': fade, 'hold_s': hold},
             'notes': f'v4 scene {n}; family {FAMILY_NAME.get(fam, "blackout")}; full power: every lit part 1.0; lit {len(parts)}',
             'laser': None, 'energy': round(len(parts) / 10, 2), 'laser_lines': None, 'laser40': None, 'family': [FAMILY_NAME[fam]] if fam != '-' else []}
        if x40:
            d = donor[LASER_OF[fam]]
            s['laser_colour'], s['desk_caps'] = d['laser_colour'], copy.deepcopy(d.get('desk_caps'))
            s['laser'], s['laser40'] = copy.deepcopy(d['laser']), copy.deepcopy(d.get('laser40'))
            start = (n * 37) % len(ALLOWED)                          # its own start in the list
            plan[str(n)] = {'graphics': ALLOWED[start:] + ALLOWED[:start], 'colour': LA40_COLOUR[fam], 'every': 6 if act in (2, 3, 5) else 8,
                            'note': f'{s["title"]}: every allowed value, its own start ({ALLOWED[start]})'}
        scenes.append(s)
assert len(scenes) == 100
def carriers(s):
    m = s['motion'] or {}; h = s['heads'] or {}
    return (frozenset(s['parts']), (m.get('mode'), m.get('spatial')), (h.get('pattern'), h.get('period_s')), s['cue']['fade_s'] == 0)
for i in range(100):
    for j in (i - 1, i + 1):
        if 0 <= j < 100 and sum(a != b for a, b in zip(carriers(scenes[i]), carriers(scenes[j]))) < 2: errors.append(f'{scenes[i]["id"]} ~ {scenes[j]["id"]}: neighbours differ in < 2 carriers')
ids = [s['title'] for s in scenes]
if len(set(ids)) != 100: errors.append('duplicate titles')
if errors: sys.exit('\n'.join(errors) + f'\n{len(errors)} rule failures, nothing written')
loop_s = sum(s['cue']['fade_s'] + s['cue']['hold_s'] for s in scenes)
below = sum(1 for s in scenes for p, (c, l) in s['parts'].items() if l < 1.0)
fams = {f: sum(1 for s in scenes if s['family'] == [f]) for f in FAMILY_NAME.values()}
out['scenes'], out['loop'], out['loop_s'] = scenes, True, loop_s
out['version'] = 'v4-100-full-power-2026-10-18'
out['what'] = ('MOXIR scenes v4 (2026-10-18): 100 new scenes at full power, 20 per set (Cloistral, Innersha, Kerrie, Éléktra b2b Kogeno, Mixtinct). '
               'Every lit part at 1.0; contrast from which parts are lit and from movement. v2.2 palette and rules; haze = the hang\'s.')
out['source'] = 'docs/moxir/scenes-v4-2026-10-18/scenes_v4.py from scripts/place/rigs/moxir-scenes-50-v2-2-2026-10-17.json (v2.2: palette, rules, the cube lasers\' designs by colour)'
out['rules'].update({'levels': 'full power: every lit part 1.0 (owner 2026-10-18 00:2x "new 100 use full power")', 'holds': 'per scene, free (v4 does not follow the v6 laser frames\' loop)'})
out['rules'].pop('numbers', None)
json.dump(out, open(OUT, 'w'), indent=1, ensure_ascii=False)
pl = copy.deepcopy(plan_base)
pl.update({'show': 'moxir-scenes-v4-0', 'made': '2026-10-18 00:4x', 'allowStatic': True, 'cues': plan,
           'why': 'MOXIR scenes v4, 100 scenes (owner 2026-10-18 00:2x): one entry per scene with the 40 W (part laser lit); every graphic except 74-75, 78-79, '
                  '166-167, 246-253; each scene its own start; colour from the scene family (8 white, 25 red, 42 green); allowStatic on the owner\'s yes (10-18 00:1x). '
                  'Cue numbers are 1-based in the v4 cue list, valid ONLY with the desk loaded with moxir-scenes-v4-0.'})
json.dump(pl, open(PLAN_OUT, 'w'), indent=1)
print(f'scenes 100 | loop_s {loop_s} | lit parts below 1.0: {below} | families {fams} | blackouts {sum(1 for s in scenes if not s["parts"])} '
      f'| beams lit in {sum(1 for s in scenes if any(p in s["parts"] for p in BEAMS))} | heads moving {sum(1 for s in scenes if s["heads"])} | 40 W in {len(plan)}')
