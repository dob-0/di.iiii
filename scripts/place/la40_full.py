"""la40_full.py — use the UP-LA40WF 32-ch mode in full (2026-10-18, owner: "lasers are 32 ch, use the full potential"): to each cue's
`anim` (first graphic: x zoom rot paint xwave) add X/Y rotation and the SECOND graphic (g2 = the cue's own graphics, played half a cycle
apart, same colour) with its own motion, by the cue's motion kind. Y move / Y wave and the built-in strobe are never set (la40-player.mjs).
  python3 -I scripts/place/la40_full.py <plan.json> [--out <plan.json>]
"""
import json, sys
p = sys.argv[1]; out = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else p
d = json.load(open(p))
def kind(a):
    if a.get('rot', 0) >= 129 and a.get('x', 64) == 64 and a.get('xwave', 0) == 0: return 'spin'
    if a.get('x', 64) >= 176: return 'jump'
    if a.get('paint', 0) >= 185: return 'draw'
    if a.get('zoom', 0) >= 201: return 'zoom'
    if a.get('xwave', 0) > 0: return 'turn'
    return 'sweep'
EXTRA = {'jump':  dict(xrot=200, x2=210, zoom2=240, rot2=160),
         'turn':  dict(yrot=140, rot2=210, xwave2=40),
         'draw':  dict(paint2=200, x2=145, rot2=200),
         'zoom':  dict(zoom2=205, x2=160, rot2=200, xrot=150),
         'spin':  dict(rot2=230, xrot=140, yrot=140),
         'sweep': dict(x2=160, rot2=200, xrot=150)}
from collections import Counter; n = Counter()
for c in d['cues'].values():
    a = c.setdefault('anim', {}); k = kind(a); n[k] += 1
    for key, v in EXTRA[k].items(): a.setdefault(key, v)
    a.setdefault('g2', c.get('graphics'))
d['full_why'] = 'all 32 channels: X/Y rotation and a second graphic with its own motion (la40_full.py, 2026-10-18)'
json.dump(d, open(out, 'w'), indent=1); print(dict(n))
