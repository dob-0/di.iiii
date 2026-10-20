"""palette_sample — pixel-sampled palette of reference clips (reference only, never published). Venue-to-show skill: the palette step.
Moved from the MOXIR scenes-50 job (2026-10-15, ledger N811.2); its result is scripts/place/rigs/palette-teasers-moxir-2026-10-15.json.
Method: decode every clip at 4 fps (ffmpeg, 160 px wide), split pixels into three strata by HSV value V = max(R,G,B):
  glow   V > 0.60  (light sources, beams, the wordmark)
  lit    0.15 < V <= 0.60  (lit surfaces, haze)
  shadow 0.03 < V <= 0.15  (steel and concrete in the dark)
then k-means (Lloyd 1982, k-means++ seeding, Arthur & Vassilvitskii 2007, seed 0) in CIE L*a*b* (D65) per stratum, k = 5.
Each cluster is reported as the median sRGB hex of its members + its share of the stratum. Also: hue-sector shares of the
saturated (S >= 0.25) glow pixels, the same sectors as palette_stats.py plus violet and amber split out.
Usage: python3 -I scripts/place/palette_sample.py CLIPS.tsv OUT.json    (CLIPS.tsv: id<TAB>video path<TAB>seconds per line; needs ffmpeg, ffprobe, numpy)
       python3 -I scripts/place/palette_sample.py --help"""
import subprocess, sys, json
if len(sys.argv) != 3 or sys.argv[1] in ('-h', '--help'):
    print(__doc__); sys.exit(0 if len(sys.argv) == 2 else 2)
import numpy as np
rows = [l.rstrip('\n').split('\t') for l in open(sys.argv[1])]
def frames(path, fps=4, w=160):
    probe = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path],
                           capture_output=True, text=True, stdin=subprocess.DEVNULL).stdout.split(',')
    W, H = int(probe[0]), int(probe[1]); h = int(round(H * w / W / 2) * 2)
    pr = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vf', f'fps={fps},scale={w}:{h}', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
                        capture_output=True, stdin=subprocess.DEVNULL)
    return np.frombuffer(pr.stdout, np.uint8).reshape(-1, 3).astype(np.float64) / 255
def lab(rgb):                                     # sRGB (IEC 61966-2-1) -> CIE L*a*b*, D65
    lin = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = lin @ M.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 216 / 24389, np.cbrt(xyz), (24389 / 27 * xyz + 16) / 116)
    return np.stack([116 * f[:, 1] - 16, 500 * (f[:, 0] - f[:, 1]), 200 * (f[:, 1] - f[:, 2])], 1)
def kmeans(X, k, it=40, seed=0):
    rng = np.random.default_rng(seed); C = [X[rng.integers(len(X))]]
    for _ in range(k - 1):
        d = np.min(((X[:, None] - np.array(C)[None]) ** 2).sum(-1), 1); C.append(X[rng.choice(len(X), p=d / d.sum() if d.sum() > 0 else None)])   # all points equal: uniform pick, no NaN
    C = np.array(C)
    for _ in range(it):
        lab_ = np.argmin(((X[:, None] - C[None]) ** 2).sum(-1), 1)
        C = np.array([X[lab_ == j].mean(0) if (lab_ == j).any() else C[j] for j in range(k)])
    return lab_
hexs = lambda c: '#%02x%02x%02x' % tuple(int(round(v * 255)) for v in c)
out = {}
for t, path, _ in rows:
    px = frames(path); V = px.max(1); mn = px.min(1); S = np.where(V > 0, (V - mn) / np.maximum(V, 1e-6), 0)
    r, g, b = px.T; hue = (np.degrees(np.arctan2(np.sqrt(3) * (g - b), 2 * r - g - b)) + 360) % 360
    res = {'pixels': int(len(px))}
    rng = np.random.default_rng(1)
    for name, sel in (('glow', V > .6), ('lit', (V > .15) & (V <= .6)), ('shadow', (V > .03) & (V <= .15))):
        idx = np.flatnonzero(sel); res[name + '_pct'] = round(100 * len(idx) / len(px), 2)
        if len(idx) < 50: res[name] = []; continue
        idx = rng.choice(idx, min(len(idx), 20000), replace=False)
        L = kmeans(lab(px[idx]), 5)
        cl = [(hexs(np.median(px[idx][L == j], 0)), round(100 * (L == j).mean(), 1)) for j in range(5) if (L == j).any()]
        res[name] = sorted(cl, key=lambda c: -c[1])
    sat = (V > .6) & (S >= .25); n = max(1, sat.sum())
    sect = {'red': (hue < 20) | (hue >= 340), 'amber': (hue >= 20) & (hue < 50), 'yellow': (hue >= 50) & (hue < 75), 'green': (hue >= 75) & (hue < 165),
            'cyan': (hue >= 165) & (hue < 195), 'blue': (hue >= 195) & (hue < 250), 'violet': (hue >= 250) & (hue < 300), 'magenta': (hue >= 300) & (hue < 340)}
    res['glow_saturated_pct_of_glow'] = round(100 * sat.sum() / max(1, (V > .6).sum()), 1)
    res['sat_glow_hue_pct'] = {k: round(100 * (sat & m).sum() / n, 1) for k, m in sect.items() if (sat & m).sum() / n >= .005}
    res['sat_glow_median'] = {k: hexs(np.median(px[sat & m], 0)) for k, m in sect.items() if (sat & m).sum() / n >= .02}
    out[t] = res
    print(t, 'glow', res['glow_pct'], '%', ' '.join(f'{h}:{p}' for h, p in res['glow'][:4]), '| lit', ' '.join(f'{h}:{p}' for h, p in res['lit'][:3]),
          '| shadow', ' '.join(f'{h}:{p}' for h, p in res['shadow'][:3]), '| hue', res['sat_glow_hue_pct'], res['sat_glow_median'])
json.dump(out, open(sys.argv[2], 'w'), indent=1)
