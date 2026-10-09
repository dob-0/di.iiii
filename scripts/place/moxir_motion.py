#!/usr/bin/env python3
"""MOXIR motion scenes: 10 MOVING looks, the default favourites of the room (owner 2026-10-09 17:06: "kk so look i want to
10 animated scenes in favorite"; ledger N442; brief agent-reports-2026-10-09/briefs/moxir-motion-scenes.md).

A LOOKS LAYER on top of the work-light layer (scripts/place/moxir_worklight.py): every scene keeps that layer's readable
floor (FLOOR: deep ember on the wall columns, the far wall and the far columns - `motion.still` holds those lamps still, so
the floor never flickers). Writes scripts/place/rigs/moxir-looks-v1-1-motion-2026-10-09.json; scripts/rigbuild/motion-looks.mjs
puts it on a SCRATCH project.

Method: the effect vocabulary is the desk's (serverXR/src/lighting/fx.js, modes chase / comet / breathe / pump / sine /
pingpong / blocks / pulse / glitch), played in the room by src/rigbuild/lookMotion.js from the server's clock. Nothing new.
Kit = what ran at Sevan (owner decision, AGENT_BOARD 10-09 07:2x): only UP-PL5403 (x50) and UP-B380F (x18) MOVE. Truss motion
is LEVEL and COLOUR only: no scene has pan or tilt (a look's motion has no way to say it). Strobe <= 3 Hz (strobeCap.js).
Colours: ash #e8e4dc, ember #ff3a12, deep ember #a3200c (the work-light layer's three).
Levels, tempos and depths are ASSUMED, set by eye on the real GPU in thin haze (sheet: ~/Downloads/moxir/stage/animated/).
Run: python3 scripts/place/moxir_motion.py
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from moxir_worklight import A, E, D, FLOOR, look, looks as WL_LOOKS, CUES as WL_CUES  # noqa: E402

PL, B38 = 'up-pl5403', 'up-b380f'
# thin haze of ONE smoke machine at Sevan (brief B-2026-10-09-moxir-motion-scenes, R8): sigma ~2.7e-4 /m, the brief's figure, EQUIVALENT not measured
HAZE_SIGMA = 0.00027
STILL = 0.35   # a lamp at or under this level in a look holds still: the work-light floor (FLOOR levels are .3 / .35 / .3)

def scene(id, title, why, parts, mode, bpm, spatial, kinds, depth=255):
    l = look(id, title, why, parts)
    l['motion'] = {'mode': mode, 'bpm': bpm, 'depth': depth, 'spatial': spatial, 'kinds': kinds, 'still': STILL}
    return l

# The ten, in the order of the relayed brief (a laser scene cannot be a favourite: shared/laserMoments.cjs, so the brief's
# "laser sweep + floor pulse" became "Floor pulse" - no laser part in any scene).
SCENES = [
 scene('ember_chase', 'Ember chase', 'Warm-up: a line of ember steps across the truss, left to right, then again.',
       {'curtain': [E, 1], 'x': [E, 1], 'halo': [E, .8], 'press graze': [E, .6]}, 'chase', 110, 'x', [PL]),
 scene('white_comet', 'White comet', 'Warm-up: one ash-white comet runs down the hall along the columns, tail behind it.',
       {'span columns': [A, 1], 'far columns': [A, 1], 'arch': [A, .8]}, 'comet', 100, 'y', [PL, B38]),
 scene('slow_breathe', 'Slow breathe', 'Warm-up: the stage swells and falls in ember over six seconds, the whole truss in unison.',
       {'curtain': [E, .7], 'x': [E, .7], 'halo': [E, .9], 'still smoking': [E, .5]}, 'breathe', 40, 'patch', [PL], 200),
 scene('pump_beat', 'Pump on the beat', 'Peak: a full ash hit on every beat that decays to black before the next.',
       {'curtain': [A, 1], 'x': [A, 1], 'fan': [A, 1], 'spine': [A, 1]}, 'pump', 124, 'patch', [PL, B38]),
 scene('ring_out', 'Ring out from the DJ', 'Peak: a ring of light travels outward from the DJ across the whole rig.',
       {'curtain': [A, .8], 'x': [A, .8], 'halo': [E, 1], 'span columns': [A, .8], 'far columns': [A, .8]}, 'sine', 60, 'radial', [PL]),
 scene('ping_pong', 'Ping-pong', 'Build: one head of ash bounces from the left end of the truss to the right and back.',
       {'curtain': [A, 1], 'x': [A, 1], 'press graze': [E, .7], 'halo': [E, .6]}, 'pingpong', 90, 'x', [PL]),
 scene('blocks', 'Blocks', 'Build: five blocks of the rig flip on and off on the beat, ember on the columns.',
       {'span columns': [E, 1], 'far columns': [E, 1], 'curtain': [A, .7], 'halo': [E, .7]}, 'blocks', 60, 'x', [PL]),
 scene('floor_pulse', 'Floor pulse', 'Peak: the DJ, the press and the floor beneath the truss breathe in and out once a second.',
       {'curtain': [A, 1], 'x': [A, 1], 'press graze': [E, 1], 'halo': [E, .8]}, 'pulse', 60, 'patch', [PL], 220),
 scene('sparkle_b380f', 'Sparkle', 'Peak: the B380F beams sparkle, each on its own count. Glitch was tried and measured at 4 flashes a second on a lamp (cap 3): sparkle at the slowest tempo is 3.',
       {'columns of fire': [E, 1], 'fan': [A, 1], 'arch': [A, .9]}, 'sparkle', 20, 'x', [B38], 220),
 scene('dawn_rise', 'Dawn rise', 'Closing: ash and ember swell over twelve seconds and fall back, a slow dawn.',
       {'curtain': [A, .7], 'x': [A, .7], 'halo': [E, .9], 'fan': [A, .6], 'press graze': [E, .5]}, 'breathe', 20, 'patch', [PL, B38], 200),
]
# the night in order: each scene held 24 s (a press holds; the cue list is the clock's demo of the night)
CUES = [{'id': f'mo-{i + 1:02d}-{s["id"].replace("_", "-")}', 'name': f'{i + 1:02d} · {s["title"]}', 'key': '', 'fade': 1, 'hold': 24,
         'lightLook': 'rig-' + s['id'].replace('_', '-'), 'surfaces': {}} for i, s in enumerate(SCENES)]

def main():
    wl = json.load(open(os.path.join(os.path.dirname(__file__), 'rigs', 'moxir-looks-v1-1-worklight-2026-10-09.json')))
    out = {
        'source': 'scripts/place/moxir_motion.py',
        'written': '2026-10-09',
        'kit': 'what ran at Sevan: UP-PL5403 x50, UP-B380F x18, 6 LaserCube Ultra MK2 (never moved here), ONE smoke machine (thin haze ~2.7e-4 /m)',
        'method': 'serverXR/src/lighting/fx.js effect modes, played by src/rigbuild/lookMotion.js from the server clock; level and colour only, no pan or tilt',
        'owner': 'ledger N442 (owner, 2026-10-09 17:06)',
        'colours': [A, E, D],
        'ambient': wl['ambient'],
        'haze_sigma_per_m': HAZE_SIGMA,
        'floor': {k: v for k, v in FLOOR.items()},
        'still': STILL,
        'favourites': [s['id'].replace('_', '-') for s in SCENES],
        'looks': SCENES,
        'cues': CUES,
    }
    p = os.path.join(os.path.dirname(__file__), 'rigs', 'moxir-looks-v1-1-motion-2026-10-09.json')
    json.dump(out, open(p, 'w'), indent=1); print(p, len(SCENES), 'scenes')
if __name__ == '__main__': main()
