#!/usr/bin/env python3
"""platina_piece.py: the 30 s light piece to the track's opening (owner 2026-11-11, N3752), as a scenes file: v3 scenes cut
to the track's own times.

    python3 -I scripts/place/platina_piece.py [--scenes V3_SCENES.json] [--out PIECE.json]

The times are MEASURED on the track (the artist's own upload, YouTube id pnZ0k2q_LBE, 2:02; the file is not in the repo):
low-band level in 10 ms steps, 2026-11-12. The kick enters at 12.24 s (the drop), leaves at 24.38 s (the break) and is back at
27.40 s; the level first rises at 9 s. Tempo 79 / 158 bpm. A cue's hold is the time to the next cue, so the piece is 30.0 s
when played from its first cue (show-clock.mjs --epoch now, started with the track).
"""
import argparse, json, sys

SCENES = 'scripts/place/rigs/platina-scenes-v3-2026-11-12.json'
OUT = 'scripts/place/rigs/platina-piece-rok-n-roller-2026-11-12.json'
END_S = 30.0
# (start second, v3 scene id, fade seconds, why here)
CUES = [(0.00, 'white-back', 2.0, 'the quiet opening: a silhouette, nothing from above'),
        (9.00, 'freeze-hold', 0.5, 'the level rises: the white fan alone, still, the breath before the drop'),
        (12.24, 'drop-hit', 0.05, 'the kick enters: one white hit of the whole rig'),
        (13.00, 'drop-red', 0.1, 'the drop: red towers at double time, the fast white X'),
        (24.38, 'white-back-beams', 0.3, 'the kick leaves: the silhouette, deck beams rising behind him'),
        (27.40, 'drop-magenta', 0.1, 'the kick is back: everything magenta, pumping'),
        (END_S, 'blackout', 0.0, 'out')]


def make(v3):
    by = {s['id']: s for s in v3['scenes']}
    scenes = []
    for n, (t, sid, fade, why) in enumerate(CUES):
        nxt = CUES[n + 1][0] if n + 1 < len(CUES) else t + 2.0
        s = dict(by[sid])
        s.update(cue={'fade_s': fade, 'hold_s': round(nxt - t, 2)}, notes=f'{t:.2f} s: {why}', piece_start_s=t)
        scenes.append(s)
    out = {k: v for k, v in v3.items() if k not in ('scenes', 'loop_s', 'what', 'version', 'date', 'source')}
    out.update(what='Platina: the 30 s light piece to the opening of the track (N3752), v3 scenes cut to the measured times',
               source=f'{SCENES} + the times measured on the track (see scripts/place/platina_piece.py)', date='2026-11-12', version='piece-1',
               track={'id': 'pnZ0k2q_LBE', 'where': 'the artist\'s own upload', 'in_repo': False, 'seconds_used': [0, END_S],
                      'measured': {'rise_s': 9.0, 'drop_s': 12.24, 'break_s': 24.38, 'back_s': 27.40, 'tempo_bpm': [79, 158]}},
               loop=True, loop_s=sum(s['cue']['fade_s'] + s['cue']['hold_s'] for s in scenes), scenes=scenes)   # loop_s: the file's own sum (scenes_build.py check)
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description='Write the 30 s light piece as a scenes file (see the module doc).')
    ap.add_argument('--scenes', default=SCENES); ap.add_argument('--out', default=OUT)
    a = ap.parse_args(argv)
    out = make(json.load(open(a.scenes, encoding='utf-8')))
    json.dump(out, open(a.out, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print(f'{a.out}: {len(out["scenes"])} cues, {END_S} s to the blackout, loop {out["loop_s"]} s')
    return 0


if __name__ == '__main__':
    sys.exit(main())
