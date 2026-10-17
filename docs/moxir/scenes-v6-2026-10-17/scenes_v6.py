#!/usr/bin/env python3
"""scenes_v6.py — MOXIR scenes v6 (2026-10-17, show day): the underground colours back, the new moves kept, lasers at 0.
Owner 09:0x on v5: "lol now its color full make back underground plz". So: every scene's PARTS (washes, colours, levels, floor,
outside) are the accepted v3-palette3 ones (base file); the 18 beams' v3 colours are mapped to the slot of the B380F wheel SEEN
(fixtureTypes.js B380F_SLOTS_SEEN) that keeps the same intent; HEADS are v5's (fan, sweep, cross, circle, figure8, nod, wave);
MOTION is v5's unless it is over the flash limit (scenes_flash.cjs), then v3's. LASERS: the v4 design unchanged (owner 08:2x: lasers
are updated later, when ready; 09:4x: "laser cubes in 3d not visible" after v5/v6 had dropped them).
    python3 -I scenes_v6.py BASE_V3.json V5.json OUT.json FLASH_OVER_IDS"""
import json, sys, copy
BASE, V5, OUT, OVER = sys.argv[1], sys.argv[2], sys.argv[3], set(filter(None, sys.argv[4].split(',')))
BEAM_MAP = {  # v3 beam colour -> seen wheel slot (hex, name); lavender slot is "unsure" on the seen wheel (no colour), so light blue
    '#eefdfd': ('#ffffff', 'open white'), '#f4fcf4': ('#ffffff', 'open white'), '#e8e4dc': ('#ffffff', 'open white'),
    '#d1eeff': ('#ffffff', 'open white'), '#73bdff': ('#a8d8ff', 'light blue'), '#66faff': ('#a8d8ff', 'light blue'),
    '#26bcff': ('#a8d8ff', 'light blue'), '#8f73ad': ('#a8d8ff', 'light blue'), '#33ff47': ('#00d12a', 'green'),
    '#ff9180': ('#fff0c0', 'warm white'), '#ffbe7a': ('#fff0c0', 'warm white'), '#ff3a12': ('#ff2a0a', 'red')}
BEAMS = ('plane 1', 'side line left', 'side line right')
base, v5 = json.load(open(BASE)), {s['id']: s for s in json.load(open(V5))['scenes']}
name = {p['hex']: p['name'] for p in base['palette']}
name.update({'#a5ff0f': 'toxic green', '#e04e00': 'dark amber'})
PAT = {'nod': 'lean toward the floor and back', 'wave': 'a lean wave', 'circle': 'a bow-tie turn', 'figure8': 'an X',
       'sweep': 'a sweep side to side', 'cross': 'scissors', 'fan': 'a still fan'}
SPN = {'all': 'together', 'alternate': 'neighbours opposite', 'left-right': 'mirrored', 'ripple': 'in a ripple'}
FX = {'breathe': 'breathe', 'pulse': 'pulse', 'sine': 'roll in a wave', 'chase': 'chase', 'comet': 'run a comet', 'sparkle': 'sparkle',
      'bars': 'flip in bars', 'blocks': 'flip in blocks', 'pingpong': 'ping-pong', 'radar': 'sweep a radar line', 'pump': 'pump on the beat',
      'strobe': 'strobe (under 3 a second)', 'none': 'hold still', 'glitch': 'glitch'}
def cname(parts, k): return name.get(parts[k][0], parts[k][0]) if k in parts else None
def story(parts, heads, motion):
    s = []
    pl, wl = cname(parts, 'plane 1'), cname(parts, 'side line left')
    if pl or wl: s.append(', '.join(x for x in ([f'plane {pl}'] if pl else []) + ([f'walls {wl}'] if wl else [])))
    ra = {cname(parts, k) for k in ('line A', 'line B', 'line C', 'line D') if k in parts}
    if ra: s.append('rays ' + ' and '.join(sorted(ra)))
    up, dn = cname(parts, 'cut up'), cname(parts, 'cut down')
    if up or dn: s.append('truss ' + ', '.join(x for x in ([f'{up} up'] if up else []) + ([f'{dn} down'] if dn else [])))
    if 'dj back' in parts: s.append(f"{cname(parts, 'dj back')} behind the DJ")
    if 'stage key' in parts or 'dj kicker' in parts: s.append(f"{cname(parts, 'stage key') or cname(parts, 'dj kicker')} on the DJ")
    if 'line L' in parts: s.append(f"floor {cname(parts, 'line L')}")
    t = '; '.join(s); t = (t[:1].upper() + t[1:] + '.') if t else ''
    if heads: t += f" Beams: {PAT[heads['pattern']]}, {SPN.get(heads['spatial'], heads['spatial'])}."
    if motion and motion.get('mode') not in (None, 'none'): t += f" Washes {FX[motion['mode']]}."
    return t
out = copy.deepcopy(base)
uses = {}
for s in out['scenes']:
    b5 = v5[s['id']]
    parts = {k: list(v) for k, v in s['parts'].items()}   # the laser part stays: v4 design unchanged (owner 09:4x: "laser cubes in 3d not visible")
    for k in BEAMS:
        if k in parts:
            hx = parts[k][0].lower()
            assert hx in BEAM_MAP, f"{s['id']}: beam colour {hx} has no wheel slot"
            parts[k][0] = BEAM_MAP[hx][0]; name[BEAM_MAP[hx][0]] = BEAM_MAP[hx][1]
            uses[BEAM_MAP[hx][1]] = uses.get(BEAM_MAP[hx][1], 0) + 1
    motion = copy.deepcopy(s['motion']) if s['id'] in OVER else copy.deepcopy(b5['motion'])
    if (motion or {}).get('mode') == 'strobe':          # eye rule: a strobe carries no colour over HSV S 0.25 -> the warm key and kicker hold ash
        for k in ('stage key', 'dj kicker'):
            if k in parts and parts[k][0] == '#ffbe7a': parts[k][0] = '#e8e4dc'
    s['intent_v3'] = s['intent']
    # physics first (heads_check.mjs, 2026-10-17): the 18 beams rest straight UP, so a pan-only move (sweep, cross, fan) turns
    # nothing; those scenes keep their accepted v3 move, which leans the beams (tilt) or holds them still (strobes)
    pan_only = (b5.get('heads') or {}).get('pattern') in ('sweep', 'cross', 'fan')
    heads = copy.deepcopy(s['heads'] if pan_only else b5['heads'])
    s['parts'], s['heads'], s['motion'] = parts, heads, motion
    s['intent'] = story(parts, s['heads'], motion)
    # lasers: the v4 design (laser part, laser, laser_lines, laser_colour, desk_caps) is kept exactly as the laser session left it
out['version'] = 'v6-underground-2026-10-17'
out['what'] = ('MOXIR 2026-10-17 v6 (show day): the 50 scenes re-made for the WASHES and the 18 BEAMS; the lasers are the v4 design unchanged (owner 08:2x: lasers later). Colours = the accepted '
               'v3 palette 3 (owner 09:0x on v5: "now its color full, make back underground"); the beams\' v3 colours mapped to the B380F wheel '
               'slots SEEN (beam_wheel_seen); heads = the v5 moves (fan, sweep, cross, circle, figure8, nod, wave); washes motion = v5, or v3 where '
               'v5 broke the flash limit (scenes_flash.cjs); where the v5 move was pan-only (sweep, cross, fan) it turned nothing on the upright beams (heads_check.mjs), so the v3 move is kept. intent = the scene in plain words from its data; intent_v3 = the v3 story.')
out['source'] = base['source'] + ' · v6 2026-10-17 09:xx by dob-74, scratchpad scenes_v6.py from this file (v3+lasers v4) and moxir-scenes-50-v5-2026-10-17.json'
out['beam_wheel_seen'] = {k: {'slot': v[1], 'hex': v[0]} for k, v in BEAM_MAP.items()}
out['rules']['heads_patterns'] = ['fan', 'sweep', 'cross', 'circle', 'figure8', 'nod', 'wave']
out['rules']['beam_colours'] = 'B380F_SLOTS_SEEN only; v3 colours mapped by beam_wheel_seen'
out['rules']['lasers'] = 'the v4 laser design unchanged (laser part, laser, laser_lines, desk cap 0.16); updated later by the laser work, when ready'
json.dump(out, open(OUT, 'w'), indent=1, ensure_ascii=False)
print('scenes', len(out['scenes']), '| beam slot uses', uses, '| motion from v3 in', sorted(OVER) or 'none')
