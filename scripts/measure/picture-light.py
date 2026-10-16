#!/usr/bin/env python3
"""picture-light.py — how much light a picture shows, in numbers (room-vs-studio-shots.cjs, 2026-10-15).

Per PNG, on one crop for all (default: the middle 94 % across, 18-94 % down: the page's bars and chips stay out):
  mean   mean luma 0-255 (Rec. 709 weights on the sRGB values, as the env-pick sheets measured)
  bright share of pixels with luma > 128
  lit    share of pixels with luma > 25
  beam   share of pixels in the AIR (the upper 60 % of the crop) brighter than 3x that band's median and > 40:
         a beam in haze is a bright streak over a dark hall. An approximation, stated, not a segmentation.
Usage: picture-light.py DIR [--json out.json]   (reads DIR/shots.json when it is there, adds the numbers to each shot)
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def light_of(path, crop=(0.03, 0.18, 0.97, 0.94)):
    im = np.asarray(Image.open(path).convert('RGB'), dtype=np.float32)
    h, w, _ = im.shape
    x0, y0, x1, y1 = int(crop[0] * w), int(crop[1] * h), int(crop[2] * w), int(crop[3] * h)
    c = im[y0:y1, x0:x1]
    y = 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]
    air = y[: int(0.6 * y.shape[0])]
    floor = max(float(np.median(air)) * 3, 40.0)
    return {
        'mean': round(float(y.mean()), 1),
        'bright': round(float((y > 128).mean()) * 100, 2),
        'lit': round(float((y > 25).mean()) * 100, 1),
        'beam': round(float((air > floor).mean()) * 100, 2),
    }


def main():
    d = Path(sys.argv[1])
    shots_file = d / 'shots.json'
    data = json.loads(shots_file.read_text()) if shots_file.exists() else {'shots': [{'file': p.name} for p in sorted(d.glob('*.png'))]}
    for s in data['shots']:
        if s.get('file') and (d / s['file']).exists():
            s['light'] = light_of(d / s['file'])
            print(f"{s['file']:<44} mean {s['light']['mean']:>5}  bright {s['light']['bright']:>5} %  lit {s['light']['lit']:>5} %  beam {s['light']['beam']:>5} %")
    out = sys.argv[sys.argv.index('--json') + 1] if '--json' in sys.argv else shots_file
    Path(out).write_text(json.dumps(data, indent=1))


if __name__ == '__main__':
    main()
