#!/usr/bin/env python3
"""platina_scenes_v3.py: write the Platina v3 light scenes SPEC (owner 2026-11-11, N3745 "clear all scenes look to light also
and make the v.3", N3759: the full set, some dropped, effects, a maximum stress test).

    python3 -I scripts/place/platina_scenes_v3.py [--rig RIG.json] [--base SPEC_22.json] [--out SPEC_V3.json]

The spec is DATA for scenes_build.py (same schema as the 22-scene spec of 11-11, which stays as it is: the v3 set is a new
file, not an edit). What v3 is:
  - one light scene, and one variant with the beam lamps, for each v3 screen look the visuals lane keeps
    (KEEP below: red-verticals, ice-line, magenta-room, cathedral, white-back; their stills are
    ~/work/platina/loops-artist/v3/wall-1024x640/v3-<look>.png). The three looks that lane is still fixing get no scene yet.
  - the drops and effects (every level effect the room has that reads on this rig), each <= 3 flashes a second (rules.flash)
  - a stress block at the END of the cue list: every lamp of the rig lit, the fastest head patterns, hard cuts. It is a load
    test for the machine, never a show cue; its ids start with `stress-`.
Rules kept from the 22-scene spec (tested in platina-scenes-v3.test.js): XP-16R white only, no amber, no laser, hold > 0.
Tempo: 79 / 158 bpm is the 30 s piece's track (measured 11-11), used where a scene pumps on the beat.
"""
import argparse, json, sys

RIG = 'scripts/place/rigs/platina-rig-2026-11-11.json'
BASE = 'scripts/place/rigs/platina-scenes-spec-2026-11-11.json'
OUT = 'scripts/place/rigs/platina-scenes-spec-v3-2026-11-12.json'
KEEP = ['magenta-room', 'red-verticals', 'ice-line', 'cathedral', 'white-back']
WAITING = ['magenta-flood', 'violet-drift', 'ice-back']
M, P, I, D, R, W, G, H, K = '#db01a8', '#a020c8', '#4da6ff', '#0a3ff0', '#e01020', '#ff1a1a', '#808080', '#ffffff', '#000000'
XP, BAR, K10T, K15T = 'acme-xp16r-bsw', 'acme-pixel-line-ip', 'cp-aleda-beye-k10', 'cp-hy-beye-k15'


def groups(rig):
    """The rig's parts by what a designer names: k10, k15 floor row, k15 side, bars[tower][bar], xp hung, xp deck."""
    g = {'k10': [], 'k15f': [], 'k15s': [], 'bars': {}, 'xph': [], 'xpd': []}
    for f in rig['fixtures']:
        part, t = f.get('part'), f['type']
        if t == K10T: g['k10'].append(part)
        elif t == K15T: g['k15s' if 'side' in part else 'k15f'].append(part)
        elif t == BAR: g['bars'].setdefault(int(part.split('tower ')[1].split(' ')[0]), []).append(part)
        elif t == XP: g['xph' if f.get('hung') else 'xpd'].append(part)
    return g


def make(rig, base):
    g = groups(rig)
    towers = sorted(g['bars'])
    all_bars = [p for t in towers for p in g['bars'][t]]

    def parts(k10=None, k15=None, k15s=None, bars=None, bars_alt=None, xph=0, xpd=0):
        out = {}
        for p in g['k10']:
            if k10: out[p] = list(k10)
        for p in g['k15f']:
            if k15: out[p] = list(k15)
        for p in g['k15s']:
            if k15s or k15: out[p] = list(k15s or k15)
        for n, t in enumerate(towers):
            for p in g['bars'][t]:
                v = (bars_alt[n % len(bars_alt)] if bars_alt else bars)
                if v: out[p] = list(v)
        for p in g['xph']:
            if xph: out[p] = [H, xph]
        for p in g['xpd']:
            if xpd: out[p] = [H, xpd]
        return out

    def motion(mode='none', bpm=60, depth=0, spatial='patch', kinds=()):
        return {'mode': mode, 'bpm': bpm, 'depth': depth, 'spatial': spatial, 'kinds': list(kinds), 'still': 0.0}

    def heads(pattern, period, pan, tilt, spatial='all'):
        return {'pattern': pattern, 'period_s': period, 'pan_deg': pan, 'tilt_deg': tilt, 'spatial': spatial, 'kinds': [XP]}

    S = []

    def scene(id_, title, act, intent, p, m=None, h=None, fade=2, hold=240, screen=None):
        S.append({'id': id_, 'title': title, 'act': act, 'intent': intent, 'parts': p, 'motion': m or motion(), 'heads': h,
                  'cue': {'fade_s': fade, 'hold_s': hold}, 'fade_s': fade, 'hold_s': hold,
                  **({'screen_look': f'v3-{screen}'} if screen else {})})

    # act 1: before the show
    scene('work-light', 'Work light', 1, 'Load-in and focus: plain white, nothing moves.', parts(k10=[H, 0.8], k15=[H, 0.6], bars=[H, 0.6]), fade=1, hold=1800)
    scene('doors', 'Doors', 1, 'The room as people come in: a low deep blue from the floor, the screen leads.', parts(k15=[D, 0.12]), fade=8, hold=3600)
    scene('wait', 'Waiting', 1, 'Minutes before: towers breathe magenta, the hung beams stand as a quiet white fan.', parts(bars=[M, 0.15], xph=0.35), motion('breathe', 20, 100, kinds=[BAR]), fade=6, hold=600)
    scene('entry', 'Entry', 2, 'He walks on: only the white fan, full.', parts(xph=1.0), fade=0.5, hold=30)
    # act 2: one scene and one beam variant per kept screen look
    scene('magenta-room', 'Magenta room', 2, 'The room is one magenta volume, breathing. No beams: the screen look carries the lines.', parts(k10=[M, 0.5], k15=[M, 0.4], bars=[M, 0.55]), motion('breathe', 34, 90), fade=4, hold=480, screen='magenta-room')
    scene('magenta-room-beams', 'Magenta room, white fan', 2, 'Same room, the hung beams added as a slow wave through the magenta.', parts(k10=[M, 0.4], k15=[M, 0.3], bars=[M, 0.55], xph=0.7), motion('breathe', 34, 90, kinds=[BAR, K10T, K15T]), heads('wave', 12, 0, 18, 'ripple'), fade=3, hold=360, screen='magenta-room')
    scene('red-verticals', 'Red verticals', 3, 'Wash dark, the towers red and hard, running upward; narrow and vertical, not a flood.', parts(k15=[R, 0.3], bars=[R, 1.0]), motion('chase', 79, 160, 'y-', [BAR]), fade=2, hold=360, screen='red-verticals')
    scene('red-verticals-cross', 'Red verticals, white X', 3, 'The red towers with every beam lamp crossing in white: the rental picture\'s X.', parts(k15=[R, 0.4], bars=[R, 1.0], xph=1.0, xpd=0.8), motion('chase', 79, 160, 'y-', [BAR]), heads('cross', 10, 45, 0), fade=0.3, hold=240, screen='red-verticals')
    scene('ice-line', 'Ice line', 3, 'Cold and thin: ice towers on a slow vertical sine over a deep blue floor.', parts(k15=[D, 0.3], bars=[I, 0.8]), motion('sine', 30, 150, 'y', [BAR]), fade=4, hold=420, screen='ice-line')
    scene('ice-line-beams', 'Ice line, floor beams', 3, 'The ice line with the five deck beams nodding in turn: white needles from the floor.', parts(k15=[D, 0.3], bars=[I, 0.9], k10=[I, 0.3], xpd=0.9), motion('comet', 60, 180, 'y', [BAR]), heads('nod', 8, 0, 22, 'alternate'), fade=2, hold=300, screen='ice-line')
    scene('cathedral', 'Cathedral', 4, 'A room of standing white beams, hung and floor, wide open; towers ice and white, passing side to side.', parts(bars_alt=[[I, 0.9], [H, 0.9]], xph=1.0, xpd=1.0), motion('pingpong', 60, 140, 'x', [BAR]), heads('fan', 14, 25, 0), fade=3, hold=300, screen='cathedral')
    scene('cathedral-turn', 'Cathedral, turning', 4, 'The cathedral turns: every beam on a slow circle, one after another.', parts(bars_alt=[[I, 0.9], [H, 0.9]], xph=1.0, xpd=1.0), motion('pingpong', 60, 140, 'x', [BAR]), heads('circle', 14, 28, 16, 'ripple'), fade=2, hold=240, screen='cathedral')
    scene('white-back', 'White back', 4, 'Silhouette: white from the floor row behind him, towers low, nothing from above.', parts(k15=[H, 0.6], bars=[H, 0.3]), fade=2, hold=360, screen='white-back')
    scene('white-back-beams', 'White back, rising beams', 4, 'The silhouette with the deck beams rising and falling together behind him.', parts(k15=[H, 0.5], bars=[H, 0.3], xpd=1.0), None, heads('wave', 9, 0, 20), fade=1.5, hold=240, screen='white-back')
    # act 5: drops and effects
    scene('freeze-hold', 'Freeze', 5, 'The breath before a drop: the white fan alone, still.', parts(k15=[H, 0.05], xph=0.9), fade=0.5, hold=4)
    scene('drop-hit', 'Drop hit', 5, 'One white hit of the whole rig, a second and a half.', parts(k10=[H, 0.8], k15=[H, 0.8], bars=[H, 0.9], xph=1.0, xpd=1.0), fade=0.05, hold=1.5)
    scene('drop-magenta', 'Drop, magenta', 5, 'Drop one: everything magenta, pumping on the beat outward from the centre, beams in figure eights.', parts(k10=[M, 1.0], k15=[M, 0.8], bars=[M, 0.9], xph=0.6, xpd=0.6), motion('pump', 79, 90, 'radial', [BAR, K10T, K15T]), heads('figure8', 8, 40, 18, 'ripple'), fade=0.3, hold=150, screen='magenta-room')
    scene('drop-red', 'Drop, red', 5, 'Drop two: red towers at double time, a fast white X.', parts(k15=[R, 0.5], bars=[R, 1.0], xph=1.0, xpd=1.0), motion('chase', 158, 160, 'y-', [BAR]), heads('cross', 5, 55, 0), fade=0.3, hold=150, screen='red-verticals')
    scene('drop-cathedral', 'Drop, cathedral', 5, 'Drop three: white beams sweeping wide, ice and white towers.', parts(bars_alt=[[I, 0.9], [H, 0.9]], xph=1.0, xpd=1.0), motion('pingpong', 79, 140, 'x', [BAR]), heads('sweep', 6, 50, 0, 'left-right'), fade=0.3, hold=180, screen='cathedral')
    scene('build-ice', 'Build, ice', 5, 'Twelve seconds of rising ice into a drop.', parts(k10=[I, 0.5], bars=[I, 0.95]), fade=12, hold=20, screen='ice-line')
    scene('fx-strobe', 'Effect: white strobe', 6, 'The towers and the top wash as a white strobe, held to three flashes a second.', parts(k10=[H, 0.8], bars=[H, 1.0]), motion('strobe', 180, 255, kinds=[BAR, K10T]), fade=0, hold=4)
    scene('fx-sparkle', 'Effect: ice sparkle', 6, 'Ice towers as scattered sparks over a dark blue floor.', parts(k15=[D, 0.2], bars=[I, 1.0]), motion('sparkle', 20, 200, kinds=[BAR]), fade=1, hold=120, screen='ice-line')
    scene('fx-radar', 'Effect: red radar', 6, 'One red line turning through the towers, the hung beams sweeping with it.', parts(k15=[R, 0.2], bars=[R, 1.0], xph=0.8), motion('radar', 60, 220, 'x', [BAR]), heads('sweep', 8, 50, 0), fade=1, hold=120, screen='red-verticals')
    scene('fx-blocks', 'Effect: magenta and ice blocks', 6, 'Towers in two colours switching by blocks on the beat, violet from above.', parts(k10=[P, 0.4], bars_alt=[[M, 1.0], [I, 1.0]]), motion('blocks', 79, 220, 'x', [BAR]), fade=0.5, hold=120)
    scene('fx-glitch', 'Effect: glitch words', 6, 'Grey room, towers breaking between grey and the words red; beams nod out of step.', parts(k10=[G, 0.45], k15=[H, 0.3], bars_alt=[[G, 0.5], [W, 0.9]], xph=0.5), motion('glitch', 20, 200, kinds=[BAR]), heads('nod', 8, 0, 25, 'alternate'), fade=1, hold=180)
    scene('fx-bars', 'Effect: bars', 6, 'Each tower as a level bar rising and falling, magenta.', parts(k15=[M, 0.2], bars=[M, 1.0]), motion('bars', 79, 220, 'y', [BAR]), fade=0.5, hold=120, screen='magenta-room')
    # act 7: the end
    scene('encore', 'Encore', 7, 'Everything he had tonight at once: magenta room, ice and magenta towers, the full white fan.', parts(k10=[M, 0.9], k15=[M, 0.6], bars_alt=[[I, 1.0], [M, 1.0]], xph=0.9, xpd=0.9), motion('pump', 79, 100, 'radial', [BAR, K10T, K15T]), heads('fan', 14, 30, 0), fade=2, hold=420)
    scene('bow', 'Bow', 7, 'Plain warm-free white on the stage for the bow.', parts(k10=[H, 0.8], k15=[H, 0.6], bars=[H, 0.7]), fade=2, hold=150)
    scene('blackout', 'Blackout', 7, 'Out.', {g['k10'][0]: [K, 0.0]}, fade=0, hold=6)
    scene('house', 'House', 7, 'People leave: the top wash, white, half.', parts(k10=[H, 0.5]), fade=4, hold=1800)
    # act 9: the machine's stress test, after the show's last cue. Never a show cue.
    full = dict(k10=[H, 1.0], k15=[H, 1.0], bars=[H, 1.0], xph=1.0, xpd=1.0)
    scene('stress-all-white', 'STRESS: every lamp, white, full', 9, 'Load test: all 52 lamps at full white, the beams on the fastest figure eight.', parts(**full), motion('sine', 90, 255, 'x'), heads('figure8', 2, 90, 45, 'ripple'), fade=0, hold=30)
    scene('stress-all-colour', 'STRESS: every lamp, colour, chase', 9, 'Load test: all lamps lit in three colours, a fast chase, the beams on fast circles.', parts(k10=[M, 1.0], k15=[I, 1.0], bars_alt=[[R, 1.0], [I, 1.0], [M, 1.0]], xph=1.0, xpd=1.0), motion('chase', 158, 255, 'x'), heads('circle', 2, 90, 45, 'ripple'), fade=0, hold=30)
    for n, (a, b) in enumerate([(M, I), (I, M), (R, H), (H, R)]):
        scene(f'stress-cut-{n + 1}', f'STRESS: hard cut {n + 1} of 4', 9, 'Load test: a hard cut of the whole rig every second (one change a second, under the flash limit).', parts(k10=[a, 1.0], k15=[b, 1.0], bars_alt=[[a, 1.0], [b, 1.0]], xph=1.0, xpd=1.0), None, heads('sweep', 2, 90, 0, 'alternate'), fade=0, hold=1)

    return {'what': 'Platina | Live in Yerevan, stage LIGHT scenes v3: one scene and one beam variant per kept v3 screen look, the drops and effects, and a stress block at the end',
            'source': f'written by scripts/place/platina_scenes_v3.py from the rig {RIG}; colours and rules from the 22-scene spec {BASE}; the kept screen looks are the visuals lane\'s verdict of 2026-11-11',
            'licence': 'own work', 'date': '2026-11-12', 'version': 'v3-1',
            'screen_looks': {'kept': [f'v3-{k}' for k in KEEP], 'waiting_for_a_fix_no_scene_yet': [f'v3-{k}' for k in WAITING]},
            'tempo_bpm': {'value': [79, 158], 'basis': 'the 30 s piece\'s track, measured 2026-11-11'},
            'rules': {**base['rules'], 'stress': 'ids starting stress- are the machine\'s load test at the end of the cue list, never a show cue'},
            'palette': base['palette'], **({'beam_wheel_seen': base['beam_wheel_seen']} if 'beam_wheel_seen' in base else {}),
            'config': base['config'], 'scenes': S}


def main(argv=None):
    ap = argparse.ArgumentParser(description='Write the Platina v3 light scenes spec (see the module doc).')
    ap.add_argument('--rig', default=RIG); ap.add_argument('--base', default=BASE); ap.add_argument('--out', default=OUT)
    a = ap.parse_args(argv)
    spec = make(json.load(open(a.rig, encoding='utf-8')), json.load(open(a.base, encoding='utf-8')))
    json.dump(spec, open(a.out, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print(f'{a.out}: {len(spec["scenes"])} scenes ({sum(1 for s in spec["scenes"] if s["id"].startswith("stress-"))} stress), {sum(1 for s in spec["scenes"] if s["heads"])} with a head pattern')
    return 0


if __name__ == '__main__':
    sys.exit(main())
