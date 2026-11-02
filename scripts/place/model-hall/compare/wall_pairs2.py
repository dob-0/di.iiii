"""wall_pairs.py - per-frame wall measurements from walls_single2.json (single-view metrology, MoGe-2 metric).
Antiparallel line pair (normals 180+-8 deg) -> separation d1+d2 = distance between two opposite walls; far wall + facing pair gives corner-to-corner length.
Prints per room the separations sorted with frames, ceiling heights, and camera heights. out: wall_pairs2.json"""
import json, math, numpy as np, collections
S = json.load(open('walls_single2.json')); out = collections.defaultdict(list)
for fn, v in S.items():
    L = v['lines']
    for i in range(len(L)):
        for j in range(i+1, len(L)):
            dphi = abs((L[i]['phi']-L[j]['phi']+180) % 360 - 180)
            if abs(dphi-180) < 12:
                ov = min(L[i]['s1'],L[j]['s1'])-max(L[i]['s0'],L[j]['s0'])
                # overlap check not possible (different s frames) -> use support
                out[v['room']].append(dict(f=fn, sep=L[i]['d']+L[j]['d'], n=min(L[i]['n'],L[j]['n']), len=[L[i]['s1']-L[i]['s0'],L[j]['s1']-L[j]['s0']], h=v['h'], ceil=v['ceil'], phi=L[i]['phi']))
json.dump(out, open('wall_pairs2.json','w'))
for r, P in out.items():
    s = np.array([p['sep'] for p in P]); print(r, len(P), 'hist', np.histogram(s, bins=np.arange(1,12,0.5))[0].tolist())
    print(' h med', np.median([v['h'] for v in S.values() if v['room']==r]), 'ceil', np.round(np.percentile([v['ceil'] for v in S.values() if v['room']==r and v['ceil']],[25,50,75]),2))
