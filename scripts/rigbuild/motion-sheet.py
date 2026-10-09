#!/usr/bin/env python3
"""motion-sheet.py - the contact sheet and the luminance maths for the moving scenes (brief R8 / A7).

Input: a folder of PNG frames `<look id>-<k>.png` (k = 0..3, 250 ms apart: motion-probe.cjs PROBE=scenes) and frames.json,
plus scripts/rigbuild/motion-crops.json (per scene: the named surface it must read on, and crops as fractions of the frame).
Output: sheet.png (a row per scene, the four frames side by side, the named crop outlined) and a csv:
  scene, surface, crop, luma_0, luma_1, luma_2, luma_3, mad_01, mad_12, mad_23, pairs_ge_3, pass
mad = mean absolute difference of Rec. 709 luma (0.2126 R + 0.7152 G + 0.0722 B of the sRGB values, 0..255) between two frames over
the crop. pass = at least 2 of the 3 consecutive pairs >= THRESH (3/255, the brief's TBR number).
Usage: motion-sheet.py <frames dir> <sheet.png> <csv>
"""
import csv, json, os, sys
import numpy as np
from PIL import Image, ImageDraw

THRESH = 3.0
here = os.path.dirname(os.path.abspath(__file__))
frames_dir, sheet_path, csv_path = sys.argv[1:4]
cfg = json.load(open(os.path.join(here, 'motion-crops.json')))
crops, scenes = cfg['crops'], cfg['scenes']

def luma(img):
    a = np.asarray(img.convert('RGB'), dtype=np.float64)
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]

def crop_box(img, frac):
    w, h = img.size
    x0, y0, x1, y1 = frac
    return (int(x0 * w), int(y0 * h), int(x1 * w), int(y1 * h))

rows, out = [], []
TW = 480
for sid, surface in scenes.items():
    frames = [Image.open(os.path.join(frames_dir, f'rig-{sid}-{k}.png')).convert('RGB') for k in range(4)]
    box = crop_box(frames[0], crops[surface])
    L = [luma(f.crop(box)) for f in frames]
    mad = [float(np.abs(L[i + 1] - L[i]).mean()) for i in range(3)]
    ge = sum(1 for m in mad if m >= THRESH)
    out.append([sid, surface, ','.join(f'{v:.3f}' for v in crops[surface]), *[f'{float(l.mean()):.2f}' for l in L], *[f'{m:.2f}' for m in mad], ge, 'PASS' if ge >= 2 else 'FAIL'])
    tiles = []
    for f in frames:
        t = f.copy(); d = ImageDraw.Draw(t); d.rectangle(box, outline=(0, 255, 255), width=4)
        tiles.append(t.resize((TW, int(TW * f.size[1] / f.size[0]))))
    rows.append((sid, surface, mad, tiles))
th = rows[0][3][0].size[1]
sheet = Image.new('RGB', (4 * TW + 220, len(rows) * th), (16, 16, 16))
d = ImageDraw.Draw(sheet)
for r, (sid, surface, mad, tiles) in enumerate(rows):
    for k, t in enumerate(tiles): sheet.paste(t, (220 + k * TW, r * th))
    d.text((8, r * th + 8), f'{r + 1:02d} {sid}', fill=(255, 255, 255))
    d.text((8, r * th + 24), f'crop: {surface}', fill=(0, 255, 255))
    d.text((8, r * th + 40), 'diff ' + ' '.join(f'{m:.1f}' for m in mad), fill=(255, 200, 80))
    d.text((8, r * th + 56), 'frames 250 ms apart', fill=(160, 160, 160))
sheet.save(sheet_path)
with open(csv_path, 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['scene', 'surface', 'crop_frac_x0,y0,x1,y1', 'luma_f0', 'luma_f1', 'luma_f2', 'luma_f3', 'mad_01', 'mad_12', 'mad_23', 'pairs_ge_3', 'result'])
    w.writerows(out)
print(open(csv_path).read())
