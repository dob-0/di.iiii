"""palette_stats — colour + darkness + flash-proxy statistics of reference clips (reference only). Frames are decoded by ffmpeg to raw RGB.
Venue-to-show skill: the palette step. Moved from the MOXIR scenes-50 job (teaser_stats.py, 2026-10-15, ledger N811.2).
Usage: python3 -I scripts/place/palette_stats.py CLIPS.tsv OUT.json    (CLIPS.tsv: id<TAB>video path<TAB>seconds per line; needs ffmpeg, ffprobe, numpy)"""
import subprocess, sys, json, os
if len(sys.argv) != 3 or sys.argv[1] in ('-h', '--help'):
    print(__doc__); sys.exit(0 if len(sys.argv) == 2 else 2)
import numpy as np
rows = [l.rstrip('\n').split('\t') for l in open(sys.argv[1])]
out = {}
def frames(path, fps, w):
    cmd = ['ffmpeg', '-v', 'error', '-i', path, '-vf', f'fps={fps},scale={w}:-2', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
    pr = subprocess.run(cmd, capture_output=True, stdin=subprocess.DEVNULL)
    probe = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path], capture_output=True, text=True, stdin=subprocess.DEVNULL).stdout.split(',')
    W, H = int(probe[0]), int(probe[1]); h = int(round(H * w / W / 2) * 2)
    a = np.frombuffer(pr.stdout, np.uint8)
    return a.reshape(-1, h, w, 3).astype(np.float32) / 255
for t, path, dur in rows:
    f = frames(path, 4, 96)
    lin = np.where(f <= 0.04045, f / 12.92, ((f + 0.055) / 1.055) ** 2.4)        # sRGB -> linear (IEC 61966-2-1)
    Y = 0.2126 * lin[..., 0] + 0.7152 * lin[..., 1] + 0.0722 * lin[..., 2]      # relative luminance (WCAG 2.x / Rec. 709)
    mx, mn = f.max(-1), f.min(-1); sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    hue = (np.degrees(np.arctan2(np.sqrt(3) * (g - b), 2 * r - g - b)) + 360) % 360
    bright = mx > 0.45
    nb = max(1, bright.sum())
    neutral = (bright & (sat < 0.25)).sum() / nb
    col = bright & (sat >= 0.25)
    red = (col & ((hue < 25) | (hue >= 335))).sum() / nb
    green = (col & (hue >= 75) & (hue < 165)).sum() / nb
    blue = (col & (hue >= 195) & (hue < 300)).sum() / nb
    # flash proxy at the native rate on tiny frames: pairs of opposing frame-mean luminance changes >= 0.1 (WCAG 'flash' threshold, whole frame)
    g2 = frames(path, 25, 32)
    l2 = np.where(g2 <= 0.04045, g2 / 12.92, ((g2 + 0.055) / 1.055) ** 2.4)
    y2 = (0.2126 * l2[..., 0] + 0.7152 * l2[..., 1] + 0.0722 * l2[..., 2]).mean((1, 2))
    d = np.diff(y2); big = np.abs(d) >= 0.1
    sec = len(y2) / 25
    flashes = int(big.sum() // 2)
    # worst one-second window
    win = max((int(big[i:i + 25].sum()) // 2 for i in range(max(1, len(big) - 24))), default=0)
    out[t] = dict(file=os.path.basename(path), seconds=round(float(dur), 1), mean_luminance=round(float(Y.mean()), 3),
                  dark_px_pct=round(float((Y < 0.01).mean() * 100), 1), bright_px_pct=round(float(bright.mean() * 100), 1),
                  bright_neutral_pct=round(neutral * 100), bright_red_pct=round(red * 100), bright_green_pct=round(green * 100),
                  bright_blue_violet_pct=round(blue * 100), flash_pairs_total=flashes, flash_pairs_per_s=round(flashes / sec, 2), worst_1s=win)
    o = out[t]
    print(f"{t} {o['seconds']:>5}s Ymean={o['mean_luminance']} dark<0.01={o['dark_px_pct']}% bright={o['bright_px_pct']}% | of bright: neutral {o['bright_neutral_pct']}% red {o['bright_red_pct']}% green {o['bright_green_pct']}% blue/violet {o['bright_blue_violet_pct']}% | flash pairs {o['flash_pairs_per_s']}/s worst1s={o['worst_1s']}")
json.dump(out, open(sys.argv[2], 'w'), indent=1)
