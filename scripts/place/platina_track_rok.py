#!/usr/bin/env python3
"""platina_track_rok.py: the LAMP cues of the track scene "Рок-н-роллер" (first 30 s), from the shared marks file
(~/work/platina/scenes/track-rok-n-roller/timeline-30s.json, final marks of 2026-11-12 05:21, owner N3898/N3976 via the deck chat).

    python3 -I scripts/place/platina_track_rok.py [--rig RIG.json] [--base SPEC.json] [--marks timeline-30s.json] [--out SPEC.json]

Same spec schema as platina_scenes_v3.py (scenes_build.py reads it). The desk's runner fires the next cue `hold` seconds after the
last GO (serverXR/src/lighting/cuerun.js), `fade` is the look's own fade-in, so every cue's hold is the gap to the next mark and
the holds sum to the piece length (30.0 s). Ids start `track-rok-`, appended AFTER the show cues, existing ids untouched.
Colours are the preview palette of the track's README (signal green #1d8c39 mean, cyan #19e0da, steel grey #96a1a6) and v3 R;
the XP-16R stays white only (rule kept from the 22-scene spec); no strobe, no full-field white. The optional accent (18 s) is red, not amber.
"""
import argparse, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from platina_scenes_v3 import groups, RIG, BASE, H, R, XP  # noqa: E402

MARKS = os.path.expanduser('~/work/platina/scenes/track-rok-n-roller/timeline-30s.json')
OUT = 'scripts/place/rigs/platina-scenes-spec-track-rok-2026-11-12.json'
GREEN, CYAN, STEEL = '#1d8c39', '#19e0da', '#96a1a6'
LENGTH = 30.0
# id, start s, title, lamp levels (k10, k15, bars, xp hung), colour, fade s; hold = gap to the next start
CUES = [
    ('intro', 0.0, 'INTRO: green wash', (0.15, 0.10, 0.15, 0), GREEN, 1.0),
    ('build', 8.0, 'BUILD: cyan up over 4 s', (0.60, 0.45, 0.70, 0), CYAN, 4.0),
    ('drop', 12.0, 'DROP 1: one step to steel', (0.80, 0.60, 0.80, 0.50), STEEL, 0.05),
    ('accent', 18.0, 'accent: red on the bars only', (0.40, 0.30, 0.60, 0.30), STEEL, 0.5),
    ('break', 24.5, 'BREAK: dim', (0.20, 0.15, 0.20, 0), STEEL, 0.5),
    ('fill-1', 25.5, 'fill 1: one small step', (0.32, 0.24, 0.32, 0), STEEL, 0.2),
    ('fill-2', 26.25, 'fill 2: one small step', (0.32, 0.24, 0.32, 0), STEEL, 0.2),
    ('low', 26.75, 'low before the re-entry', (0.20, 0.15, 0.20, 0), STEEL, 0.4),
    ('reentry', 27.25, 'RE-ENTRY: ramp to 60 % by 27.7', (0.50, 0.38, 0.50, 0), STEEL, 0.45),
    ('out', 29.5, 'OUT: fade by 30.0', None, STEEL, 0.5),
]


def make(rig, base, marks=None):
    g = groups(rig)
    bars = [p for t in sorted(g['bars']) for p in g['bars'][t]]
    S = []
    for n, (id_, t0, title, lv, col, fade) in enumerate(CUES):
        t1 = CUES[n + 1][1] if n + 1 < len(CUES) else LENGTH
        hold = round(t1 - t0, 3)
        parts = {}
        if lv:
            k10, k15, bar, xp = lv
            for p in g['k10']: parts[p] = [col, k10]
            for p in g['k15f'] + g['k15s']: parts[p] = [col, k15]
            for p in bars: parts[p] = [R if id_ == 'accent' else col, bar]
            for p in g['xph']:
                if xp: parts[p] = [H, xp]
        S.append({'id': f'track-rok-{id_}', 'title': title, 'act': 9, 'intent': f'Track scene mark {t0:g} s: {title}.', 'parts': parts,
                  'motion': {'mode': 'none', 'bpm': 79, 'depth': 0, 'spatial': 'patch', 'kinds': [], 'still': 0.0}, 'heads': None,
                  'cue': {'fade_s': min(fade, hold), 'hold_s': hold}, 'fade_s': min(fade, hold), 'hold_s': hold, 't0_s': t0})
    return {'what': 'Platina track scene Рок-н-роллер, first 30 s: the lamp cues on the shared marks', 'source': f'written by scripts/place/platina_track_rok.py from the rig {RIG} and the marks file',
            'licence': 'own work', 'date': '2026-11-12', 'version': 'track-rok-1', 'tempo_bpm': {'value': [79], 'basis': 'marks file tempo_bpm'},
            'rules': {**base['rules'], 'track': 'no strobe, under 3 level changes per second, no full-field white (marks file limits)'},
            'palette': base['palette'], 'config': base['config'], 'scenes': S}


def main(argv=None):
    ap = argparse.ArgumentParser(description='Write the track scene lamp cues spec (see the module doc).')
    ap.add_argument('--rig', default=RIG); ap.add_argument('--base', default=BASE); ap.add_argument('--out', default=OUT)
    a = ap.parse_args(argv)
    spec = make(json.load(open(a.rig, encoding='utf-8')), json.load(open(a.base, encoding='utf-8')))
    json.dump(spec, open(a.out, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print(f'{a.out}: {len(spec["scenes"])} cues, holds sum {sum(s["hold_s"] for s in spec["scenes"]):g} s')
    return 0


if __name__ == '__main__':
    sys.exit(main())
