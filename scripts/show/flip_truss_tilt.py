#!/usr/bin/env python3
"""flip_truss_tilt.py: mirror the tilt of the moving bars about straight down (16-bit 32768) in every step of every look.

Why (a show night, 2026-11-26):
- 21:18, the owner (N7020): "the right side truss ones need to swaped they looks no stage they look to the wall".
- 21:27, fix_right_truss.py flipped the right bars only. The camera frame at 21:31:45 (cue "R6 Unison", read by dob-3f
  and by the lead) then showed the right bars facing the room and the LEFT bars lighting the left wall behind them.
- 21:29, RDM GET by dob-3f: R1 and L1 report pan invert 0 and tilt invert 0.
Later record (camera, 2026-11-26 22:4x, dob-3f's controlled hold, all 18 bars at pan 128; tilt 156 put both sides inward,
tilt 100 put both on their own walls; viewed by the lead dob-39): the right bars hang turned 180 degrees, DMX tilt above
centre lands INWARD on both sides. So "both trusses hang the same way" (the first reading above) was wrong for this hall.
The true mirror there is pan R = 65536 - pan L, tilt R = tilt L (see mirror_sync.py, whose rule is read from the presets).
This tool stays for a side whose tilt sign is wrong: it mirrors one side's tilt about straight down.

What it does: tilt16 -> 65536 - tilt16 (clamped to 65535) for the chosen sides; 32768 (straight down) stays exactly
32768, and a mirrored pair (R = 65536 - L) stays exactly mirrored. On a yoke this turns the beam 180 degrees about the
vertical. On the camera-measured Reika rig the rule is tilt same with FACE_SIGN +1 (mirror_sync.py), so this tool is not
the fix there; it is for a side whose tilt sign is wrong. Pan, colour, dimmer, cells, timing and the desk trims are untouched;
the tool proves that by comparing every value of the input and the output.

Usage: flip_truss_tilt.py <presets.json> <in.json> <out.json> [--sides L,R] [--left L] [--right R]   (in/out: a file with .looks[])
"""
import json, sys
from collections import Counter

def opt(name, default):
    if name in sys.argv:
        i = sys.argv.index(name)
        v = sys.argv[i + 1]
        del sys.argv[i:i + 2]
        return v
    return default


sides, LEFT, RIGHT = opt('--sides', 'L,R'), opt('--left', 'L'), opt('--right', 'R')
args = sys.argv[1:]
presets_f, in_f, out_f = args[:3]
units = json.load(open(presets_f))['units']
bars = {k: u['id'] for k, u in units.items() if (k[:len(LEFT)] == LEFT and k[len(LEFT):].isdigit()) or (k[:len(RIGHT)] == RIGHT and k[len(RIGHT):].isdigit())}
want = sides.split(',')   # 'L' = the --left side, 'R' = the --right side
chosen = {fid for k, fid in bars.items() if ('L' if k[:len(LEFT)] == LEFT else 'R') in want}
PAIRS = sorted(int(k[len(LEFT):]) for k in bars if k[:len(LEFT)] == LEFT and f'{RIGHT}{k[len(LEFT):]}' in bars)
if not PAIRS or not chosen:
    sys.exit(f'no {LEFT}<n>/{RIGHT}<n> bar pair, or no bar on sides {sides!r}')

doc = json.load(open(in_f))
before = json.loads(json.dumps(doc))
flipped = clamped = 0
for look in doc['looks']:
    for step in look.get('steps', []):
        for fid, vals in (step.get('values') or {}).items():
            if fid not in chosen or 'tilt' not in vals:
                continue
            c, f = vals['tilt'], vals.get('tilt_fine', 0)
            if not all(isinstance(x, int) and 0 <= x <= 255 for x in (c, f)):
                sys.exit(f'{look["id"]}: {fid} tilt {c!r}/{f!r} is not a byte')
            v = 65536 - (c * 256 + f)
            if v > 65535:
                v, clamped = 65535, clamped + 1
            if 'tilt_fine' in vals:
                vals['tilt'], vals['tilt_fine'] = v >> 8, v & 255
            else:
                vals['tilt'] = min(255, (v + 128) >> 8)
            flipped += 1
    look['aim_fix'] = f'tilt of the {sides} moving bars mirrored about straight down (both trusses hang the same way; camera 21:31:45, RDM 21:29, owner N7020), 2026-11-26'

other = 0
def walk(a, b, path):
    global other
    if isinstance(a, dict) or isinstance(b, dict):
        if not (isinstance(a, dict) and isinstance(b, dict)):
            other += 1; return
        for k in set(a) | set(b):
            if not (k == 'aim_fix' and len(path) == 2):
                walk(a.get(k), b.get(k), path + [k])
    elif isinstance(a, list) or isinstance(b, list):
        if not (isinstance(a, list) and isinstance(b, list)) or len(a) != len(b):
            other += 1; return
        for i, (x, y) in enumerate(zip(a, b)):
            walk(x, y, path + [i])
    elif a != b and not (len(path) >= 2 and path[-1] in ('tilt', 'tilt_fine') and path[-2] in chosen):
        other += 1
walk(before, doc, [])

def rel(a, r):
    if abs(a - 32768) <= 1 and abs(r - 32768) <= 1: return 'down'
    if abs(a - r) <= 1: return 'same'
    if abs(a + r - 65536) <= 1: return 'mirrored'
    return 'other'
pairs = Counter()
for look in doc['looks']:
    for step in look.get('steps', []):
        v = step.get('values') or {}
        for n in PAIRS:
            a, r = v.get(bars[f'{LEFT}{n}']), v.get(bars[f'{RIGHT}{n}'])
            if a and r and 'tilt' in a and 'tilt' in r:
                pairs[rel(a['tilt'] * 256 + a.get('tilt_fine', 0), r['tilt'] * 256 + r.get('tilt_fine', 0))] += 1
json.dump(doc, open(out_f, 'w'), indent=1)
print(f'{len(doc["looks"])} looks: {flipped} tilt values of the {sides} bars mirrored ({clamped} clamped at 65535), '
      f'{other} other values changed; left/right tilt pairs after: {dict(pairs)}; wrote {out_f}')
sys.exit(1 if other else 0)
