"""prefilter.py - keep frames that face a wall end, a corner or an opening (LSD line statistics from ingest.py; heuristic, UNVALIDATED:
frontal = >=50 % of non-vertical line length within 8 deg of image-horizontal and >=600 px of it; corner = long vertical edge with floor/wall
lines of opposite slope either side; opening = two long verticals 60-700 px apart bridged by a horizontal lintel). Sharpness is recorded,
never used to drop. Room = room of the nearest survey frame (same video) in time. depth set = kept (min gap 3 frames) U chain skeleton
(every 3rd frame = 10 fps, so consecutive frames are <=0.1 s apart for visual odometry). out: kept.json"""
import json, os, bisect
D = '/mnt/data/footage/place-cinema-house-2026-10-30'; M = D + '/modelled'
R = [json.loads(l) for v in ('v1', 'v2') for l in open(f'{M}/dense/index_{v}.jsonl')]
idx = {f['name']: f for f in json.load(open(M + '/survey/index.json'))['frames']}
sv = {}
for r in os.listdir(M + '/survey/rooms'):
    for f in os.listdir(f'{M}/survey/rooms/{r}'):
        if f in idx: sv.setdefault(idx[f]['video'], []).append((idx[f]['t_s'], r))
for k in sv: sv[k].sort()
def room(vid, t):
    L = sv[vid]; ts = [x[0] for x in L]; i = bisect.bisect(ts, t); c = [L[j] for j in (i - 1, i) if 0 <= j < len(L)]
    return min(c, key=lambda x: abs(x[0] - t))[1]
for r in R:
    r['room'] = room(r['video'], r['t_s']); r['frontal'] = bool(r['F'] >= 0.5 and r['Lh'] >= 600)
    r['facing'] = r['frontal'] or r['corner'] or r['opening']
kept = []; last = {}
for r in sorted(R, key=lambda r: (r['video'], r['n'])):
    if r['facing'] and r['n'] - last.get(r['video'], -99) >= 3: kept.append(r['name']); last[r['video']] = r['n']
skel = [r['name'] for r in R if r['n'] % 3 == 0 and r['room'] in ('main_hall', 'marble_hall', 'cafe')]
depth = sorted(set(kept) | set(skel))
by = {}
for r in R:
    d = by.setdefault(r['room'], dict(extracted=0, facing=0, frontal=0, corner=0, opening=0, soft_kept=0, persons=0)); d['extracted'] += 1
    d['facing'] += r['facing']; d['frontal'] += r['frontal']; d['corner'] += r['corner']; d['opening'] += r['opening']; d['persons'] += r['persons'] > 0
    d['soft_kept'] += bool(r['facing'] and r['sharp'] < 5)
json.dump(dict(frames={r['name']: r for r in R}, kept=kept, skeleton=skel, depth=depth), open(M + '/dense/kept.json', 'w'))
print('extracted', len(R), 'facing', sum(r['facing'] for r in R), 'kept(min gap 3)', len(kept), 'skeleton', len(skel), 'depth set', len(depth))
for k, d in sorted(by.items()): print(k, d)
