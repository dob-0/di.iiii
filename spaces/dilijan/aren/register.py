#!/usr/bin/env python3
"""Where do the wall page's three scan fragments stand in Aren's yard?  (di.iiii, spaces/dilijan/aren)

Reproduces the IN_YARD poses in yard.html. Inputs, both assets of the project the-yard (sha256 = asset id):
  the yard's cloud  a20d6688...63e9 (89 999 points, deflate-raw, from the yard page)
  the yard's mesh   8bf0c55f...f4a0 (parts main / wall_mid / wall_right, deflate-raw, from the yard page)
  the wall's pack   e30e2644...e5e8 ('DILJ': fragments wall / cabin / courtyard, from the elevation page)
Method (no invented step): 1) exhaustive yaw search, 1 degree steps, with the shift found by cross-correlating plan-view
occupancy images (template matching by FFT); 2) point-to-point ICP (Besl & McKay 1992), yaw-only rotation + translation,
trimmed to the closest 80 % of pairs (Chetverikov et al. 2002), against the measured cloud. Residuals are nearest-point
distances from 5 000 sampled fragment vertices to the cloud. numpy only; about 5 minutes on one core.
  python3 -I spaces/dilijan/aren/register.py --api http://dilijan-test.diiii.localhost/serverXR
"""
import argparse, json, struct, urllib.request, zlib
import numpy as np

ap = argparse.ArgumentParser(); ap.add_argument('--api', required=True); a = ap.parse_args()
UA = {'User-Agent': 'di-aren-register/1.0 (+https://diiii.xyz/for-apps)'}
def asset(h): return urllib.request.urlopen(urllib.request.Request(f"{a.api.rstrip('/')}/api/projects/the-yard/assets/{h}", headers=UA)).read()
infl = lambda b: zlib.decompress(b, -15)
CLOUD = 'a20d668825b2a369fc0eb2dbeb8c437c0ecbe38e302805795e7726da145463e9'
MESH = '8bf0c55fa6878b14d42a64de7a4aaaafd2cc0bac928763080422860e94e5f4a0'
PACK = 'e30e26445e9f25c62e5c21aa14d65941d7b1f102adf4ac20ae5b5416d197e5e8'
MM = {"gmin": [-5.02, 0.0, -3.38], "grng": [11.11, 1.75, 6.76], "parts": [{"name": "main", "nv": 48911, "off": 0}, {"name": "wall_mid", "nv": 29189, "off": 987056}, {"name": "wall_right", "nv": 28352, "off": 1578940}]}
mb = infl(asset(MESH))
yall = np.vstack([np.array(MM['gmin']) + np.frombuffer(mb, np.uint16, p['nv']*3, p['off']).reshape(-1, 3)/65535*np.array(MM['grng']) for p in MM['parts']]).astype(np.float32)
pb = infl(asset(CLOUD))
cloud = (np.array([-5.02, 0.0, -3.38]) + np.frombuffer(pb, np.uint16, 89999*3).reshape(-1, 3)/65535*np.array([11.11, 1.75, 6.76])).astype(np.float32)
b = asset(PACK); jl = struct.unpack_from('<I', b, 4)[0]; m = json.loads(b[8:8+jl]); base = 8+jl
rng = np.random.default_rng(3)
def roty(t): c, s = np.cos(t), np.sin(t); return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]], np.float32)
def nn(q, B):
    best = np.full(len(q), np.inf, np.float32); idx = np.zeros(len(q), int)
    for s in range(0, len(B), 5000):
        d = ((q[:, None, :]-B[None, s:s+5000, :])**2).sum(-1); j = d.argmin(1); v = d[np.arange(len(q)), j]
        u = v < best; best[u] = v[u]; idx[u] = j[u]+s
    return np.sqrt(best), idx
R, G = 0.04, 512
o = yall[:, [0, 2]].min(0) - 3.0
def img(P2, org):
    ij = np.floor((P2 - org)/R).astype(int); ok = (ij >= 0).all(1) & (ij < G).all(1)
    I = np.zeros((G, G)); np.add.at(I, (ij[ok, 0], ij[ok, 1]), 1); return np.minimum(I, 1)
FY = np.fft.rfft2(img(yall[:, [0, 2]], o))
out = {}
for x in m['models']:
    qq = np.frombuffer(b, np.uint16, x['nv']*3, base+x['pos']).reshape(-1, 3); lo, hi = np.array(x['qmin']), np.array(x['qmax'])
    L = (lo + qq*(hi-lo)/65535).astype(np.float32)
    cands = []
    for deg in range(360):                                   # 1) yaw search + FFT shift
        W = L @ roty(np.radians(deg)).T; w2 = W[:, [0, 2]] - W[:, [0, 2]].min(0); Wi = img(w2, np.zeros(2))
        cc = np.fft.irfft2(FY * np.conj(np.fft.rfft2(Wi)), s=(G, G)); k = np.unravel_index(np.argmax(cc), cc.shape)
        sh = np.array(k)*R + o - W[:, [0, 2]].min(0)
        cands.append((cc[k]/Wi.sum(), deg, np.array([sh[0], yall[:, 1].min() - W[:, 1].min(), sh[1]], np.float32)))
    cands.sort(key=lambda c: -c[0])
    best = None
    for _, deg, t in cands[:6]:                              # 2) trimmed ICP on the cloud from the 6 best starts
        yaw = np.radians(deg); T = cloud[rng.choice(len(cloud), 30000, replace=False)]
        for it in range(40):
            A = L[rng.choice(len(L), 1500, replace=False)] @ roty(yaw).T + t
            d, j = nn(A, T); keep = d <= np.percentile(d, 80); P, Q = A[keep], T[j[keep]]
            pc, qc = P.mean(0), Q.mean(0); Pc, Qc = P-pc, Q-qc
            dy = np.arctan2((Pc[:, 2]*Qc[:, 0] - Pc[:, 0]*Qc[:, 2]).sum(), (Pc[:, 0]*Qc[:, 0] + Pc[:, 2]*Qc[:, 2]).sum())
            yaw += dy; t = roty(dy) @ (t - pc) + qc
        d, _ = nn(L[rng.choice(len(L), 5000, replace=False)] @ roty(yaw).T + t, cloud)
        r = {'yaw': round(float(np.degrees(yaw)) % 360, 3), 't': [round(float(v), 4) for v in t], 'median_m': round(float(np.median(d)), 4),
             'p90_m': round(float(np.percentile(d, 90)), 4), 'within_5cm': round(float((d < 0.05).mean()), 3)}
        if best is None or r['median_m'] < best['median_m']: best = r
    out[x['name']] = best
    print(x['name'], best, flush=True)
print('IN_YARD=' + json.dumps({k: {'yaw': v['yaw'], 't': v['t']} for k, v in out.items()}, separators=(',', ':')))
