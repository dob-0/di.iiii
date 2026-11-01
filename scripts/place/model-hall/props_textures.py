#!/usr/bin/env python3
"""props_textures.py - textures that must NOT be cut from the frames.

frieze.png  the film-strip photo band: frame and sprocket holes drawn, the photo cells
            filled with plain tones only. The real cells are film stills with people's
            faces (consent and copyright unchecked), so no pixel of them is used.
wood.png    slatted pine plinth: slat pattern drawn, colour = mean of a frame crop
            (plan `wood_sample`: frame + box) so the tone is the real one.
Usage: python3 props_textures.py <plan.json> <images_dir> <out_dir>
"""
import json, os, sys
import numpy as np
from PIL import Image

plan, imgs, out = sys.argv[1:4]
p = json.load(open(plan))
rng = np.random.default_rng(7)
# frieze: 0.7 m tall band, 200 px/m, one 3 m repeat
H, W = 140, 600
a = np.zeros((H, W, 3)) + 105
a[:16] = a[-16:] = 95
for x in range(6, W, 14):            # sprocket holes, 35 mm look
    a[5:11, x:x + 7] = 200
    a[-11:-5, x:x + 7] = 200
cell_w = 96
for i, x0 in enumerate(range(6, W - cell_w, cell_w + 6)):
    tone = rng.uniform(95, 185)
    g = np.linspace(-1, 1, cell_w)[None, :, None] * rng.uniform(-35, 35)
    v = np.linspace(-1, 1, H - 40)[:, None, None] * rng.uniform(-14, 14)
    a[20:H - 20, x0:x0 + cell_w] = tone + g + v + np.array([4, 2, -4])  # warm grey print
Image.fromarray(a.clip(0, 255).astype(np.uint8)).save(os.path.join(out, 'frieze.png'))
# wood
ws = p['wood_sample']
crop = np.asarray(Image.open(os.path.join(imgs, ws['frame'])).convert('RGB').crop(tuple(ws['box'])), float)
mean = crop.reshape(-1, 3).mean(0)
scale = 0.55 / (mean.mean() / 255)        # light pine reflectance ~0.55 (DIMENSIONS.md)
base = mean * scale
w = np.zeros((256, 256, 3)) + base
for y in range(0, 256, 32):              # 9 cm slats with 1 cm dark gaps at 256 px per 0.32 m
    w[y:y + 4] = base * 0.45
w += rng.normal(0, 4, w.shape) + np.sin(np.linspace(0, 40, 256))[None, :, None] * 5
Image.fromarray(w.clip(0, 255).astype(np.uint8)).save(os.path.join(out, 'wood.png'))
json.dump({'frieze.png': 'drawn, no frame pixels (people in the real stills)',
           'wood.png': {'drawn_slats': True, 'colour_from': ws, 'mean_rgb_raw': mean.round(1).tolist(), 'albedo_target': 0.55}},
          open(os.path.join(out, 'props_provenance.json'), 'w'), indent=1)
print('frieze, wood', base.round(1))
