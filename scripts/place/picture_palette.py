#!/usr/bin/env python3
"""picture_palette.py — the light and colour of pictures and videos, measured the same way for references and renders (2026-10-17).
Moved into di.iiii from the MOXIR scenes job of 2026-10-15 (agent-reports …/scenes-tools/palette_sample.py, the "palette audit" the
venue-to-show skill names in step 4), and made generic: images, videos or folders, in named groups, so a show's posters, its place, its
reference clips and its own renders are compared on one table.
Method (as 10-15): pixels at 160 px wide (videos at 4 fps, ffmpeg) split by HSV value V = max(R,G,B) into
  glow V > 0.60 (light sources, beams, white type) · lit 0.15 < V <= 0.60 · shadow 0.03 < V <= 0.15;
k-means (Lloyd 1982; k-means++ seeding, Arthur & Vassilvitskii 2007; seed 0) in CIE L*a*b* (D65) per stratum, k = 5, each cluster as
the median sRGB hex of its members and its share. Added 2026-10-17 for "too much white": the share of ALL pixels that is dark (V <= 0.15),
white glow (V > 0.6 and S < 0.25), coloured glow (V > 0.6 and S >= 0.25), and the hue sectors of the coloured glow.
    python3 -I picture_palette.py OUT.json --group NAME PATH [PATH …] [--crop TOP,BOTTOM] [--group NAME PATH … ]
PATH = an image (.jpg .jpeg .png .webp), a video (.mp4 .mov .webm .mkv) or a folder of them. --crop drops a share of each picture's height
at the top and bottom (UI bars of a page render), for the group it follows. Writes OUT.json and one line per group."""
import json, os, subprocess, sys
import numpy as np
from PIL import Image

IMG = ('.jpg', '.jpeg', '.png', '.webp'); VID = ('.mp4', '.mov', '.webm', '.mkv')


def video_px(path, fps=4, w=160):
    pr = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path],
                        capture_output=True, text=True, stdin=subprocess.DEVNULL).stdout.strip().split(',')
    W, H = int(pr[0]), int(pr[1]); h = int(round(H * w / W / 2) * 2)
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vf', f'fps={fps},scale={w}:{h}', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
                         capture_output=True, stdin=subprocess.DEVNULL).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, 3).astype(np.float64) / 255


def image_px(path, crop=(0.0, 0.0), w=160):
    im = Image.open(path).convert('RGB')
    if crop != (0.0, 0.0):
        W, H = im.size; im = im.crop((0, int(H * crop[0]), W, int(H * (1 - crop[1]))))
    W, H = im.size; im = im.resize((w, max(1, int(round(H * w / W)))), Image.BILINEAR)
    return np.asarray(im, np.float64).reshape(-1, 3) / 255


def files_of(p):
    if os.path.isdir(p):
        return sorted(os.path.join(p, f) for f in os.listdir(p) if f.lower().endswith(IMG + VID))
    return [p]


def lab(rgb):                                     # sRGB (IEC 61966-2-1) -> CIE L*a*b*, D65
    lin = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = lin @ M.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 216 / 24389, np.cbrt(xyz), (24389 / 27 * xyz + 16) / 116)
    return np.stack([116 * f[:, 1] - 16, 500 * (f[:, 0] - f[:, 1]), 200 * (f[:, 1] - f[:, 2])], 1)


def kmeans(X, k, it=40, seed=0):
    rng = np.random.default_rng(seed); C = [X[rng.integers(len(X))]]
    for _ in range(k - 1):
        d = np.min(((X[:, None] - np.array(C)[None]) ** 2).sum(-1), 1)
        C.append(X[rng.choice(len(X), p=d / d.sum())] if d.sum() > 0 else X[rng.integers(len(X))])
    C = np.array(C)
    for _ in range(it):
        L = np.argmin(((X[:, None] - C[None]) ** 2).sum(-1), 1)
        C = np.array([X[L == j].mean(0) if (L == j).any() else C[j] for j in range(k)])
    return L


hexs = lambda c: '#%02x%02x%02x' % tuple(int(round(v * 255)) for v in c)
SECT = {'red': (340, 20), 'amber': (20, 50), 'yellow': (50, 75), 'green': (75, 165), 'cyan': (165, 195), 'blue': (195, 250), 'violet': (250, 300), 'magenta': (300, 340)}


def measure(px):
    V = px.max(1); mn = px.min(1); S = np.where(V > 0, (V - mn) / np.maximum(V, 1e-6), 0)
    r, g, b = px.T; hue = (np.degrees(np.arctan2(np.sqrt(3) * (g - b), 2 * r - g - b)) + 360) % 360
    n = len(px); glow = V > .6; white = glow & (S < .25); colour = glow & (S >= .25)
    res = {'pixels': int(n), 'dark_pct': round(100 * (V <= .15).sum() / n, 1), 'white_glow_pct': round(100 * white.sum() / n, 2),
           'colour_glow_pct': round(100 * colour.sum() / n, 2), 'white_share_of_glow_pct': round(100 * white.sum() / max(1, glow.sum()), 1)}
    rng = np.random.default_rng(1)
    for name, sel in (('glow', glow), ('lit', (V > .15) & (V <= .6)), ('shadow', (V > .03) & (V <= .15))):
        idx = np.flatnonzero(sel); res[name + '_pct'] = round(100 * len(idx) / n, 2)
        if len(idx) < 50: res[name] = []; continue
        idx = rng.choice(idx, min(len(idx), 20000), replace=False)
        L = kmeans(lab(px[idx]), 5)
        res[name] = sorted([(hexs(np.median(px[idx][L == j], 0)), round(100 * (L == j).mean(), 1)) for j in range(5) if (L == j).any()], key=lambda c: -c[1])
    m = max(1, colour.sum())
    def inside(lo, hi): return (hue >= lo) & (hue < hi) if lo < hi else (hue >= lo) | (hue < hi)
    res['colour_glow_hue_pct'] = {k: round(100 * (colour & inside(*v)).sum() / m, 1) for k, v in SECT.items() if (colour & inside(*v)).sum() / m >= .005}
    return res


def main(argv):
    if len(argv) < 3 or argv[1] != '--group':
        print(__doc__); return 2
    out_path, groups, cur = argv[0], [], None
    i = 1
    while i < len(argv):
        a = argv[i]
        if a == '--group': cur = {'name': argv[i + 1], 'paths': [], 'crop': (0.0, 0.0)}; groups.append(cur); i += 2; continue
        if a == '--crop': t, b = (float(x) for x in argv[i + 1].split(',')); cur['crop'] = (t, b); i += 2; continue
        cur['paths'] += files_of(a); i += 1
    out = {}
    for g in groups:
        parts = []
        for f in g['paths']:
            if f.lower().endswith(VID): parts.append(video_px(f))
            elif f.lower().endswith(IMG): parts.append(image_px(f, g['crop']))
        if not parts: print(g['name'], ': no pictures'); continue
        res = measure(np.concatenate(parts)); res['files'] = len(parts); out[g['name']] = res
        print(f"{g['name']:<14} {res['files']:>3} files | dark {res['dark_pct']:>5}% | white glow {res['white_glow_pct']:>5}% | colour glow {res['colour_glow_pct']:>5}%"
              f" | white of glow {res['white_share_of_glow_pct']:>5}% | hue {res['colour_glow_hue_pct']} | lit {' '.join(f'{h}:{p}' for h, p in res['lit'][:3])}")
    json.dump(out, open(out_path, 'w'), indent=1)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
