"""cube_cycles.py — one motion CYCLE per laser scene for a scene-picked show (2026-10-18, MOXIR v5).
The room plays at most 256 frames per loop (laserLine.js MAX_FRAMES): over a 100-scene loop that is one pose per ~6 s, so the
cubes barely move. A scene-picked show (cube-scene-player.mjs: the clock is the scene that is on) only needs each scene's own
cycle, looped while it is on. This writes a cycles scenes file — a dark block first, then every laser scene once, its hold =
one cycle of its tempo (beats x 60 / bpm, clamped to --min/--max seconds), fade 0 — for laser_frames.py (--timing clock), and
the block map (scene id -> start, length) the player wraps in. Patterns: --try lists candidates per scene, most motion first;
the first that passes every hall rule of laser_frames.py (no waiver) is kept.
  python3 -I scripts/place/cube_cycles.py <scenes.json> <cycles-out.json> <blocks-out.json> [--min 4] [--max 8]
"""
import json, sys
src, out, blocks_out = sys.argv[1:4]
arg = lambda k, d: float(sys.argv[sys.argv.index(k) + 1]) if k in sys.argv else d
lo, hi = arg('--min', 4.0), arg('--max', 8.0)
d = json.load(open(src)); scenes = []; blocks = {}; t = 0.0
scenes.append({'id': 'dark', 'title': 'dark', 'cue': {'fade_s': 0, 'hold_s': 2}, 'laser': None, 'laser_lines': None, 'parts': {}})
blocks['dark'] = {'start': 0.0, 'len': 2.0}; t = 2.0
for s in d['scenes']:
    L = s.get('laser')
    if not L: continue
    tp = L.get('tempo') or {'clock': 'master', 'bpm': 120, 'beats': 8}
    cyc = tp['beats'] * 60.0 / tp['bpm']
    if cyc > hi: tp = {**tp, 'beats': max(1, round(hi * tp['bpm'] / 60.0))}
    if cyc < lo: tp = {**tp, 'beats': max(1, round(lo * tp['bpm'] / 60.0))}
    cyc = round(tp['beats'] * 60.0 / tp['bpm'], 3)
    c = json.loads(json.dumps(s)); c['laser'] = {**L, 'tempo': tp}; c['cue'] = {'fade_s': 0, 'hold_s': cyc}
    scenes.append(c); blocks[s['id']] = {'start': round(t, 3), 'len': cyc}; t += cyc
d2 = {**d, 'scenes': scenes, 'loop_s': round(t, 3), 'what': 'cube cycles of ' + str(d.get('what', ''))[:80]}
json.dump(d2, open(out, 'w'), indent=1); json.dump({'loop_s': round(t, 3), 'blocks': blocks}, open(blocks_out, 'w'), indent=1)
print(f'{len(scenes) - 1} laser scenes, loop {t:.1f} s, {t / 256:.2f} s per frame')
