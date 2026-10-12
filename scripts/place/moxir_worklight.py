#!/usr/bin/env python3
"""MOXIR work light + the grown set of looks (owner 2026-10-09: "I don't like the lights - we can't see anything and can't
work; fix it so we can work normally, and I need more scenes").

A LOOKS LAYER, kept apart from moxir_v1_1.py so it folds in cleanly: it writes
scripts/place/rigs/moxir-looks-v1-1-worklight-2026-10-09.json = {ambient, looks, cues}; scripts/rigbuild/worklight-looks.mjs
puts it on a scratch project. Fixtures are the rig's own `part` groups (nothing new hung). Colours: ash #e8e4dc, ember
#ff3a12, deep ember #a3200c only. Levels are fractions of each part's photometric maximum. Lasers: the desk keeps writing 0.
KIT ONLY (owner 10-09, N410.6-8, lead's call on #858): the looks drive only parts hung with the Sevan kit, UP-PL5403,
UP-B380F, the 6 LaserCubes, 1 smoke machine. The v1.1 rig still lists off-kit parts (far wall + side roof UP-250BSW,
roof UP-HK1915, blinders, strobes): main() reads the rig and refuses to write if a look names one.
Every look keeps a readable floor: a deep-ember floor of the wall-column PARs, near and far (no look is pure black); a test
(worklight.test.js) checks it. Levels are ASSUMED, set by eye on the real GPU in Lite (sheet: ~/Downloads/moxir/stage/v1-1-work/).
Run: python3 scripts/place/moxir_worklight.py
"""
import json, os
A, E, D = '#e8e4dc', '#ff3a12', '#a3200c'
AMBIENT = 0.6   # house spill, ASSUMED (v1.0/v1.1: 0.3, read as unusable on the night's check 10-09)
L = None        # the laser part takes [None, 1.0]
# (id, title, purpose, parts)
G = {}
def g(name, *rows): G[name] = rows
# THE ONE READABLE FLOOR (json key `floor`): a look with floor=true gets it UNDER its own parts (its own part wins). Motion layers reuse it.
# floor of every dark look: deep ember on the wall columns + far wall keeps the building readable
FLOOR = {'span columns': [D, .3], 'far columns': [D, .35]}
KIT = {'up-pl5403', 'up-b380f', 'ext-lc-ultra-mk2', 'up-yz31p'}   # what ran at Sevan (AGENT_BOARD 10-09 07:2x)
RIG = os.path.join(os.path.dirname(__file__), 'rigs', 'moxir-epic-v1-1-2026-10-08.json')
def look(id, title, why, parts, floor=True):
    return {'id': id, 'title': title, 'intent': why, 'floor': floor, 'parts': parts}
WORK = {'curtain': [A, 1], 'x': [A, 1], 'halo': [A, 1], 'press graze': [A, .6], 'arch': [A, 1], 'fan': [A, .5],
        'far columns': [A, 1], 'span columns': [A, 1], 'still smoking': [A, .6]}
looks = [
 look('work_light', 'WORK LIGHT', 'Everything lit evenly so the hall, truss, DJ and floor can be seen and worked in: walk, place, judge positions. No lasers, no strobes.', WORK, False),
 look('house_low', 'House light, low', 'Half the work light: the hall readable between sets or while the crowd comes in.', {k: [v[0], v[1] * .5] for k, v in WORK.items()}, False),
 look('black', 'The black (ember)', 'Dark but not black: deep ember on the columns, near and far, the machines glowing. 3-5 s before a drop.', {'still smoking': [E, .2], 'span columns': [D, .35], 'far columns': [D, .4]}, False),
 look('still_smoking', 'Still smoking', 'Warm-up: the machines glow from inside, the hall alive before anything is lit.', {'still smoking': [E, .35], 'far columns': [D, .45]}),
 look('embers_wide', 'Embers, wide', 'Warm-up: the whole ruin in deep ember, low.', {'span columns': [D, .55], 'far columns': [D, .55], 'still smoking': [E, .25]}),
 look('halo_glow', 'Halo glow', 'Warm-up: a soft ember halo behind the DJ.', {'halo': [E, .6], 'press graze': [E, .3], 'still smoking': [E, .3]}),
 look('one_line', 'One line', 'Warm-up: a single white line in the ember hall; the first thing anyone sees.', {'cube6a': [A, 1], 'still smoking': [E, .25], 'press graze': [E, .15]}),
 look('silhouette', 'The silhouette', 'Warm-up to build: the DJ as a black shape against an ash curtain and an ember X.', {'curtain': [A, 1], 'x': [E, .8], 'press graze': [E, .25], 'halo': [E, .4]}),
 look('build_ash', 'Build, ash', 'Build: the DJ and the truss lit in soft ash.', {'curtain': [A, .6], 'x': [A, .5], 'far columns': [D, .45]}),
 look('columns_of_fire', 'Columns of fire', 'Build: ember columns give the far hall height.', {'columns of fire': [E, 1], 'far columns': [D, .4], 'span columns': [D, .3]}),
 look('fan_rise', 'Fan rises', 'Build: the fan of beams opens behind the DJ.', {'fan': [A, 1]}),
 look('sparks', 'Sparks from the depth', 'Build: the laser chase over a pale curtain.', {'laser': [L, 1], 'curtain': [A, .4]}),
 look('arch_over', 'Arch over the floor', 'Build: ash beams arch high over the dance floor.', {'arch': [A, 1], 'curtain': [A, .3]}),
 look('fire_returns', 'The fire returns', 'Peak: everything at once, once: lasers, fan, spine, columns of fire, the press.', {'laser': [L, 1], 'fan': [A, 1], 'spine': [A, 1], 'columns of fire': [E, 1], 'press graze': [E, .8]}),
 look('wall_of_ember', 'Wall of ember', 'Peak: all the ember columns at full, the ash wall burning.', {'columns of fire': [E, 1], 'far columns': [E, .6], 'span columns': [D, .5], 'press graze': [E, .5]}),
 look('press_burns', 'The press burns', 'Peak: the press and the halo at full ember, the machine as the altar.', {'press graze': [E, 1], 'halo': [E, .7], 'columns of fire': [D, .5]}),
 look('ash_falling', 'Ash falling', 'Breakdown: the spine drops ash on the dark.', {'spine': [A, .9], 'still smoking': [E, .2]}),
 look('ash_low', 'Ash, low', 'Breakdown: the curtain and halo barely there.', {'curtain': [A, .25], 'halo': [E, .3], 'span columns': [D, .4]}),
 look('laser_chase', 'Laser chase', 'Laser moment: all lines over a dim curtain.', {'laser': [L, 1], 'curtain': [A, .25]}),
 look('laser_fan', 'Laser and fan', 'Laser moment: lines under the fan of beams.', {'laser': [L, 1], 'fan': [A, 1]}),
 look('laser_ember', 'Laser in embers', 'Laser moment: lines through the ember columns.', {'laser': [L, 1], 'columns of fire': [E, .6], 'far columns': [D, .4]}),
 look('hit_fan', 'Hit, fan', 'Hit: 1-2 s, the B380F fan full ash over the crowd (no blinders in the kit).', {'fan': [A, 1], 'spine': [A, 1]}),
 look('hit_columns', 'Hit, columns', 'Hit: 1-2 s, every column full ash at once (no strobes in the kit).', {'columns of fire': [A, 1], 'span columns': [A, 1], 'far columns': [A, 1]}),
 look('dawn', 'Dawn: one line returns', 'Closing: the arch fades to grey, one line returns.', {'arch': [A, .35], 'cube6a': [A, 1]}),
 look('close_ember', 'Closing ember', 'Closing: the machines and the ember halo, a quiet end.', {'still smoking': [E, .35], 'halo': [E, .25], 'span columns': [D, .45]}),
 look('house_up', 'House up', 'Closing: the house lights, the hall readable to leave.', {k: [v[0], v[1] * .8] for k, v in WORK.items()}, False),
]
# (look, cue name, fade s, hold s)  the night in order, WORK/HOUSE first
CUES = [('work_light', 'WORK · work light', 2, 30), ('house_low', 'WORK · house light low', 2, 20),
 ('black', 'Warm-up · the black (ember)', 3, 6), ('still_smoking', 'Warm-up · still smoking', 6, 20), ('embers_wide', 'Warm-up · embers wide', 6, 16),
 ('halo_glow', 'Warm-up · halo glow', 5, 14), ('one_line', 'Warm-up · one line', 4, 20), ('silhouette', 'Warm-up · the silhouette', 3, 16),
 ('build_ash', 'Build · ash', 4, 14), ('columns_of_fire', 'Build · columns of fire', 4, 16), ('fan_rise', 'Build · the fan rises', 3, 14),
 ('sparks', 'Build · sparks from the depth', 0, 18), ('arch_over', 'Build · arch over the floor', 3, 14),
 ('black', 'the black', 0, 4), ('fire_returns', 'Peak · THE FIRE RETURNS', 0, 14), ('wall_of_ember', 'Peak · wall of ember', 2, 14),
 ('black', 'the black', 0, 4), ('press_burns', 'Peak · the press burns', 2, 12),
 ('ash_falling', 'Breakdown · ash falling', 1, 16), ('ash_low', 'Breakdown · ash, low', 3, 12),
 ('laser_chase', 'Laser · chase', 0, 14), ('laser_fan', 'Laser · and fan', 2, 14), ('laser_ember', 'Laser · in embers', 2, 14),
 ('hit_fan', 'Hit · fan', 0, 3), ('hit_columns', 'Hit · columns', 0, 3),
 ('dawn', 'Closing · dawn: one line returns', 10, 20), ('close_ember', 'Closing · ember', 6, 16), ('house_up', 'Closing · house up', 4, 20)]
def main():
    ids = {l['id'] for l in looks}
    kit_parts = {f['part'] for f in json.load(open(RIG))['fixtures'] if f['type'] in KIT} | {'cube6a', 'laser'}
    for l in [*looks, {'id': 'floor', 'parts': FLOOR}]:
        off = set(l['parts']) - kit_parts
        assert not off, f"{l['id']}: off-kit parts {sorted(off)}"
    cues = []
    for i, (lk, name, fade, hold) in enumerate(CUES):
        assert lk in ids, lk
        cues.append({'id': f'wl-{i + 1:02d}-{lk.replace("_", "-")}', 'name': name, 'key': '', 'fade': fade, 'hold': hold, 'lightLook': 'rig-' + lk.replace('_', '-'), 'surfaces': {}})
    out = {'source': 'scripts/place/moxir_worklight.py', 'written': '2026-10-09', 'ambient': AMBIENT, 'colours': [A, E, D], 'floor': FLOOR, 'looks': looks, 'cues': cues}
    p = os.path.join(os.path.dirname(__file__), 'rigs', 'moxir-looks-v1-1-worklight-2026-10-09.json')
    json.dump(out, open(p, 'w'), indent=1); print(p, len(looks), 'looks', len(cues), 'cues')
if __name__ == '__main__': main()
