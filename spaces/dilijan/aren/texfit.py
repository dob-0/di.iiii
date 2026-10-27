"""Photo-textured scan surfaces: does a photo sit right on its surface, and where does a copy of a surface stand?
(di.iiii, spaces/dilijan/aren; numpy + Pillow only.)  Used by register.py (the poses in yard.html) and texcheck.py
(the per-fragment numbers in README.md); tested by texfit_test.py.

How the data maps photos to geometry (read from the yard page and the wall page, 2026-10-21): every surface carries
per-vertex UVs into its own photo atlas (a photogrammetry bake: hundreds of charts with padded gaps). No camera poses,
no projective texturing, no per-fragment quads. So two checks can fail independently:
  seams       - internal: a 3D edge shared by two charts must show the same colour from both sides. Needs no other data.
  cloud fit   - external: the photo's colour at a surface point against the yard's measured cloud (its own colours) within
                3 cm, as points (r_pt) and as 10 cm patches (r_patch; robust to photo resolution), with a per-channel
                linear fit for exposure; 'good' = share of patches whose residual is under 18 of 255.
A photo is sampled the way WebGL does it: flipY=true reads image row (1 - v) * H, flipY=false reads row v * H.
Copies of one surface (a decimated fragment on the same atlas) are registered by their UVs: the same UV is the same point
of the surface, so a rigid fit (Kabsch 1976 / Umeyama 1991, trimmed to the closest 80 %, Chetverikov et al. 2002) needs
no search and finds any rotation, tilt included.
"""
import json, struct, urllib.request, zlib
from io import BytesIO
import numpy as np

UA = {'User-Agent': 'di-aren-texfit/1.0 (+https://diiii.xyz/for-apps)'}
CLOUD = 'a20d668825b2a369fc0eb2dbeb8c437c0ecbe38e302805795e7726da145463e9'
MESH = '8bf0c55fa6878b14d42a64de7a4aaaafd2cc0bac928763080422860e94e5f4a0'
PACK = 'e30e26445e9f25c62e5c21aa14d65941d7b1f102adf4ac20ae5b5416d197e5e8'
# the yard page's mesh parts and their photos (its TEX list, in part order)
GMIN, GRNG = [-5.02, 0.0, -3.38], [11.11, 1.75, 6.76]
PARTS = [{'name': 'main', 'nv': 48911, 'nf': 82991, 'off': 0, 'photo': '61c29ae555ac889e1c8c52cf58e498af7cc79519652a027aecd0dd6d2ecba128'},
         {'name': 'wall_mid', 'nv': 29189, 'nf': 49999, 'off': 987056, 'photo': '5f72ae52da1f59fcf0d39f2f4afe7f6a684420b18ae916f0a2b8f34fc23f83d9'},
         {'name': 'wall_right', 'nv': 28352, 'nf': 47893, 'off': 1578940, 'photo': 'c607f388c7d61df7d2c908ab99b2cad221b473e1cf732562a65ab8750f888d38'}]


def fetcher(api=None, blobs=None, project='the-yard'):
    if blobs: return lambda h: open(f'{blobs.rstrip("/")}/{h}', 'rb').read()
    return lambda h: urllib.request.urlopen(urllib.request.Request(f"{api.rstrip('/')}/api/projects/{project}/assets/{h}", headers=UA)).read()


def image(b):
    from PIL import Image
    return np.asarray(Image.open(BytesIO(b)).convert('RGB')).astype(np.float64)


def load(get):
    """-> cloud (P, C), yard parts and pack fragments: dicts with q (quantised positions), P, UV, I, tex."""
    infl = lambda b: zlib.decompress(b, -15)
    pb = infl(get(CLOUD)); n = 89999
    cloud = {'P': np.array(GMIN) + np.frombuffer(pb, np.uint16, n*3).reshape(-1, 3)/65535*np.array(GRNG),
             'C': np.frombuffer(pb, np.uint8, n*3, n*6).reshape(-1, 3).astype(np.float64)}
    mb = infl(get(MESH)); yard = {}
    for p in PARTS:
        nv, nf, off = p['nv'], p['nf'], p['off']; q = np.frombuffer(mb, np.uint16, nv*3, off).reshape(-1, 3)
        yard[p['name']] = {'q': q, 'P': np.array(GMIN) + q/65535*np.array(GRNG), 'UV': np.frombuffer(mb, np.uint16, nv*2, off + nv*6).reshape(-1, 2)/65535,
                           'I': np.frombuffer(mb, np.uint16, nf*3, off + nv*10).reshape(-1, 3).astype(np.int64), 'tex': image(get(p['photo']))}
    b = get(PACK); jl = struct.unpack_from('<I', b, 4)[0]; man = json.loads(b[8:8+jl]); base = 8 + jl; pack = {}
    for x in man['models']:
        q = np.frombuffer(b, np.uint16, x['nv']*3, base + x['pos']).reshape(-1, 3); lo, hi = np.array(x['qmin']), np.array(x['qmax'])
        pack[x['name']] = {'q': q, 'P': lo + q*(hi - lo)/65535, 'UV': np.frombuffer(b, np.uint16, x['nv']*2, base + x['uv']).reshape(-1, 2)/65535,
                           'I': np.frombuffer(b, np.uint16, x['nf']*3, base + x['idx']).reshape(-1, 3).astype(np.int64),
                           'tex': image(b[base + x['tex']:base + x['tex'] + x['texLen']]), 'center': x['center']}
    return cloud, yard, pack


class Grid:
    """Nearest neighbour within r by a hashed voxel grid (cell = r)."""
    def __init__(s, P, h):
        s.h = h; s.lo = P.min(0) - h; k = np.floor((P - s.lo)/h).astype(np.int64); s.n = k.max(0) + 3
        key = (k[:, 0]*s.n[1] + k[:, 1])*s.n[2] + k[:, 2]; s.ord = np.argsort(key, kind='stable'); s.key = key[s.ord]; s.P = P
        s.maxc = int(np.unique(s.key, return_counts=True)[1].max())

    def query(s, Q, r):
        k = np.floor((Q - s.lo)/s.h).astype(np.int64); best = np.full(len(Q), np.inf); idx = np.full(len(Q), -1)
        for d in np.stack(np.meshgrid([-1, 0, 1], [-1, 0, 1], [-1, 0, 1]), -1).reshape(-1, 3):
            kk = k + d; ok = ((kk >= 0) & (kk < s.n)).all(1); key = (kk[:, 0]*s.n[1] + kk[:, 1])*s.n[2] + kk[:, 2]
            a = np.searchsorted(s.key, key, 'left'); b = np.searchsorted(s.key, key, 'right')
            for j in range(s.maxc):
                v = ok & (a + j < b)
                if not v.any(): break
                ii = s.ord[np.minimum(a + j, len(s.ord) - 1)]; dd = ((s.P[ii] - Q)**2).sum(1); u = v & (dd < best); best[u] = dd[u]; idx[u] = ii[u]
        best = np.sqrt(best); idx[best > r] = -1
        return best, idx


def sample_tex(T, uv, flip=True):
    """Bilinear sample of image T (H x W x 3) at UVs, as WebGL reads it with UNPACK_FLIP_Y = flip."""
    h, w, _ = T.shape; x = uv[:, 0]*w - 0.5; y = ((1 - uv[:, 1]) if flip else uv[:, 1])*h - 0.5
    x0 = np.floor(x).astype(int); y0 = np.floor(y).astype(int); fx = (x - x0)[:, None]; fy = (y - y0)[:, None]
    g = lambda yy, xx: T[np.clip(yy, 0, h - 1), np.clip(xx, 0, w - 1)]
    return (g(y0, x0)*(1 - fx) + g(y0, x0 + 1)*fx)*(1 - fy) + (g(y0 + 1, x0)*(1 - fx) + g(y0 + 1, x0 + 1)*fx)*fy


lum = lambda c: c @ np.array([0.299, 0.587, 0.114])


def surface_samples(P, I, UV, n, rng):
    e1 = P[I[:, 1]] - P[I[:, 0]]; e2 = P[I[:, 2]] - P[I[:, 0]]; A = 0.5*np.linalg.norm(np.cross(e1, e2), axis=1)
    f = rng.choice(len(I), n, p=A/A.sum()); u = rng.random(n); v = rng.random(n); m = u + v > 1; u[m] = 1 - u[m]; v[m] = 1 - v[m]
    bc = np.stack([1 - u - v, u, v], 1)[:, :, None]
    return f, (P[I[f]]*bc).sum(1), (UV[I[f]]*bc).sum(1)


def _resid(t, c):
    out = np.empty_like(t)
    for k in range(3):
        X = np.stack([c[:, k], np.ones(len(c))], 1); out[:, k] = t[:, k] - X @ np.linalg.lstsq(X, t[:, k], rcond=None)[0]
    return np.abs(out).mean(1)


def cloud_fit(P, I, UV, tex, cloud, grid=None, flip=True, n=60000, seed=7, uv_map=None, other_tex=None):
    """Photo at surface points vs the cloud's colour within 3 cm. P in the cloud's frame."""
    rng = np.random.default_rng(seed); grid = grid or Grid(cloud['P'], 0.03)
    f, Pm, uv = surface_samples(P, I, UV, n, rng); d, j = grid.query(Pm, 0.03); ok = j >= 0
    uvk = uv_map(uv[ok]) if uv_map else uv[ok]; c = sample_tex(other_tex if other_tex is not None else tex, uvk, flip); t = cloud['C'][j[ok]]
    k = np.floor(Pm[ok]/0.10).astype(np.int64); _, inv, cnt = np.unique(k, axis=0, return_inverse=True, return_counts=True); inv = inv.ravel()
    tm = np.stack([np.bincount(inv, t[:, q], minlength=len(cnt)) for q in range(3)], 1)/cnt[:, None]
    cm = np.stack([np.bincount(inv, c[:, q], minlength=len(cnt)) for q in range(3)], 1)/cnt[:, None]; big = cnt >= 3
    res = _resid(tm[big], cm[big])
    return {'cover': float(ok.mean()), 'r_pt': float(np.corrcoef(lum(t), lum(c))[0, 1]), 'r_patch': float(np.corrcoef(lum(tm[big]), lum(cm[big]))[0, 1]),
            'resid': float(res.mean()), 'good': float((res < 18).mean()), 'patches': int(big.sum())}


def seam_edges(q, I, UV):
    """Edges whose two faces meet in 3D (same quantised positions) but not in UV: (edge a, edge b, a's third vertex, b's)."""
    _, pid = np.unique(q, axis=0, return_inverse=True); pid = pid.ravel()
    E = np.concatenate([I[:, [0, 1]], I[:, [1, 2]], I[:, [2, 0]]]); O = np.concatenate([I[:, 2], I[:, 0], I[:, 1]])
    pk = np.sort(pid[E], 1); key = pk[:, 0]*(pid.max() + 1) + pk[:, 1]; o = np.argsort(key, kind='stable'); ks = key[o]
    same = np.nonzero(ks[1:] == ks[:-1])[0]; a, b = o[same], o[same + 1]
    Ea, Eb = E[a].copy(), E[b].copy(); fl = pid[Ea[:, 0]] != pid[Eb[:, 0]]; Eb[fl] = Eb[fl][:, ::-1]
    seam = np.abs(UV[Ea] - UV[Eb]).max((1, 2)) > 1e-3
    return Ea[seam], Eb[seam], O[a][seam], O[b][seam]


def seam_score(q, I, UV, tex, flip=True, seed=7):
    """Colour across seams (2 texels inside each face, at 1/4, 1/2, 3/4 of the edge): r of luma, median |dRGB|, and the
    same for shuffled pairs (what 'no relation' looks like)."""
    ea, eb, oa, ob = seam_edges(q, I, UV); h = tex.shape[0]; A, B = [], []
    if not len(ea): return {'edges': 0}
    for t in (0.25, 0.5, 0.75):
        for e, o, acc in ((ea, oa, A), (eb, ob, B)):
            p = UV[e[:, 0]]*(1 - t) + UV[e[:, 1]]*t; d = UV[o] - p; d = d/np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-9)*(2.0/h)
            acc.append(sample_tex(tex, p + d, flip))
    A = np.concatenate(A); B = np.concatenate(B); sh = np.random.default_rng(seed).permutation(len(B))
    r = lambda a, b: float(np.nan_to_num(np.corrcoef(lum(a), lum(b))[0, 1]))  # a constant side carries no relation: 0
    return {'edges': int(len(ea)), 'r': r(A, B), 'med': float(np.median(np.abs(A - B).mean(1))),
            'r_shuffled': r(A, B[sh]), 'med_shuffled': float(np.median(np.abs(A - B[sh]).mean(1)))}


def uv_raster(UV, I, R=2048):
    """Texel -> face id (-1 where no chart)."""
    T = UV[I]*R; idmap = np.full((R, R), -1, np.int64)
    x0 = np.floor(T[:, :, 0].min(1)).astype(int); x1 = np.ceil(T[:, :, 0].max(1)).astype(int)
    y0 = np.floor(T[:, :, 1].min(1)).astype(int); y1 = np.ceil(T[:, :, 1].max(1)).astype(int)
    for f in range(len(I)):
        xs = np.arange(max(x0[f], 0), min(x1[f], R - 1) + 1) + 0.5; ys = np.arange(max(y0[f], 0), min(y1[f], R - 1) + 1) + 0.5
        if not len(xs) or not len(ys): continue
        X, Y = np.meshgrid(xs, ys); a, b, c = T[f]; d = (b[1] - c[1])*(a[0] - c[0]) + (c[0] - b[0])*(a[1] - c[1])
        if abs(d) < 1e-12: continue
        l1 = ((b[1] - c[1])*(X - c[0]) + (c[0] - b[0])*(Y - c[1]))/d; l2 = ((c[1] - a[1])*(X - c[0]) + (a[0] - c[0])*(Y - c[1]))/d
        m = (l1 >= -1e-6) & (l2 >= -1e-6) & (1 - l1 - l2 >= -1e-6); idmap[(Y[m] - 0.5).astype(int), (X[m] - 0.5).astype(int)] = f
    return idmap


def uv_to_3d(P, I, UV, idmap, uv):
    """The surface point (P's frame) that carries each UV; NaN where the UV is in no chart."""
    R = idmap.shape[0]; px = np.clip((uv*R).astype(int), 0, R - 1); f = idmap[px[:, 1], px[:, 0]]; ok = f >= 0
    out = np.full((len(uv), 3), np.nan); a, b, c = UV[I[f[ok], 0]], UV[I[f[ok], 1]], UV[I[f[ok], 2]]; q = uv[ok]
    d = (b[:, 1] - c[:, 1])*(a[:, 0] - c[:, 0]) + (c[:, 0] - b[:, 0])*(a[:, 1] - c[:, 1])
    l1 = ((b[:, 1] - c[:, 1])*(q[:, 0] - c[:, 0]) + (c[:, 0] - b[:, 0])*(q[:, 1] - c[:, 1]))/d
    l2 = ((c[:, 1] - a[:, 1])*(q[:, 0] - c[:, 0]) + (a[:, 0] - c[:, 0])*(q[:, 1] - c[:, 1]))/d
    out[ok] = P[I[f[ok], 0]]*l1[:, None] + P[I[f[ok], 1]]*l2[:, None] + P[I[f[ok], 2]]*(1 - l1 - l2)[:, None]
    return out


def kabsch(X, Y, yaw_only=False):
    """Rotation R and shift t with Y ~ R X + t (no reflection). yaw_only: rotation about +y only (what a yaw search finds)."""
    mx, my = X.mean(0), Y.mean(0); Xc, Yc = X - mx, Y - my
    if yaw_only:
        a = np.arctan2((Xc[:, 2]*Yc[:, 0] - Xc[:, 0]*Yc[:, 2]).sum(), (Xc[:, 0]*Yc[:, 0] + Xc[:, 2]*Yc[:, 2]).sum())
        c, s = np.cos(a), np.sin(a); R = np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
    else:
        U, _, Vt = np.linalg.svd(Yc.T @ Xc); S = np.eye(3); S[2, 2] = np.sign(np.linalg.det(U @ Vt)) or 1; R = U @ S @ Vt
    return R, my - R @ mx


def trimmed_fit(X, Y, keep_share=0.8, rounds=8, yaw_only=False):
    keep = np.ones(len(X), bool)
    for _ in range(rounds):
        R, t = kabsch(X[keep], Y[keep], yaw_only); r = np.linalg.norm(X @ R.T + t - Y, axis=1); keep = r <= max(np.percentile(r, keep_share*100), 0.005)
    return R, t, r


def pose_by_uv(frag, part, R=2048):
    """frag's local P onto part's P through their shared atlas. -> dict with R, t, q (x,y,z,w), residuals, matched share."""
    idm = uv_raster(part['UV'], part['I'], R); Y = uv_to_3d(part['P'], part['I'], part['UV'], idm, frag['UV']); ok = ~np.isnan(Y).any(1)
    if ok.sum() < 50: return {'matched': float(ok.mean())}
    Rm, t, r = trimmed_fit(frag['P'][ok], Y[ok])
    return {'R': Rm, 't': t, 'q': quat_from_R(Rm), 'matched': float(ok.mean()), 'median': float(np.median(r)), 'p90': float(np.percentile(r, 90)),
            'within_1cm': float((r < 0.01).mean()), 'tilt_deg': float(np.degrees(np.arccos(np.clip(Rm[1, 1], -1, 1)))),
            'photo_r': float(np.corrcoef(lum(sample_tex(frag['tex'], frag['UV'][ok])), lum(sample_tex(part['tex'], frag['UV'][ok])))[0, 1])}


def quat_from_R(R):
    """Rotation matrix -> unit quaternion [x, y, z, w] (three.js order), w >= 0."""
    m = R; tr = m[0, 0] + m[1, 1] + m[2, 2]
    if tr > 0:
        s = 2*np.sqrt(tr + 1); w, x, y, z = 0.25*s, (m[2, 1] - m[1, 2])/s, (m[0, 2] - m[2, 0])/s, (m[1, 0] - m[0, 1])/s
    elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
        s = 2*np.sqrt(1 + m[0, 0] - m[1, 1] - m[2, 2]); w, x, y, z = (m[2, 1] - m[1, 2])/s, 0.25*s, (m[0, 1] + m[1, 0])/s, (m[0, 2] + m[2, 0])/s
    elif m[1, 1] > m[2, 2]:
        s = 2*np.sqrt(1 + m[1, 1] - m[0, 0] - m[2, 2]); w, x, y, z = (m[0, 2] - m[2, 0])/s, (m[0, 1] + m[1, 0])/s, 0.25*s, (m[1, 2] + m[2, 1])/s
    else:
        s = 2*np.sqrt(1 + m[2, 2] - m[0, 0] - m[1, 1]); w, x, y, z = (m[1, 0] - m[0, 1])/s, (m[0, 2] + m[2, 0])/s, (m[1, 2] + m[2, 1])/s, 0.25*s
    q = np.array([x, y, z, w]); q /= np.linalg.norm(q)
    return q if q[3] >= 0 else -q


def R_from_quat(q):
    x, y, z, w = q
    return np.array([[1 - 2*(y*y + z*z), 2*(x*y - z*w), 2*(x*z + y*w)], [2*(x*y + z*w), 1 - 2*(x*x + z*z), 2*(y*z - x*w)], [2*(x*z - y*w), 2*(y*z + x*w), 1 - 2*(x*x + y*y)]])


def page_poses(html):
    """IN_YARD of yard.html -> {name: (R, t)}; accepts {q, t} and the older {yaw, t}."""
    import re
    out = {}
    for k, v in json.loads(re.search(r'const IN_YARD=(\{.*?\});', html).group(1)).items():
        if 'q' in v: R = R_from_quat(v['q'])
        else: a = np.radians(v['yaw']); c, s = np.cos(a), np.sin(a); R = np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
        out[k] = (R, np.array(v['t']))
    return out
