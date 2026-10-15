#!/usr/bin/env python3
"""picture-diff.py — how much of a picture changed between two renders of the same view (2026-10-15).

    python3 -I scripts/measure/picture-diff.py before.png after.png [--tol 2]

Prints JSON: the share of pixels (%) whose largest 8-bit channel difference is over --tol levels (default 2: below that is
the GPU's own frame-to-frame noise and dithering), the mean absolute difference per channel (levels), and the largest one.
The lamp-unchanged gate of a laser change is changed_pct < 0.5. Method: a per-pixel absolute difference with a tolerance, the
basis of image-regression tools (e.g. pixelmatch's threshold, ImageMagick `compare -metric AE -fuzz`). Read-only.
"""
import argparse
import json

import numpy as np
from PIL import Image


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('before')
    ap.add_argument('after')
    ap.add_argument('--tol', type=int, default=2)
    a = ap.parse_args()
    x = np.asarray(Image.open(a.before).convert('RGB')).astype(np.int16)
    y = np.asarray(Image.open(a.after).convert('RGB')).astype(np.int16)
    if x.shape != y.shape:
        raise SystemExit(f'sizes differ: {x.shape} vs {y.shape}')
    d = np.abs(x - y)
    changed = d.max(axis=2) > a.tol
    print(json.dumps({'before': a.before, 'after': a.after, 'tol': a.tol, 'pixels': int(changed.size),
                      'changed_pct': round(100.0 * changed.mean(), 4), 'mean_abs': [round(float(v), 3) for v in d.mean(axis=(0, 1))],
                      'max_abs': int(d.max())}))


if __name__ == '__main__':
    main()
