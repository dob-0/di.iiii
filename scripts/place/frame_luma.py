#!/usr/bin/env python3
# frame_luma.py — how dark, how much glare: per captured frame of the room, the mean relative luminance (Rec. 709 / sRGB
# weights on linearised sRGB, IEC 61966-2-1) and the share of near-white pixels (all channels >= 240: a white-out), the
# view's UI chrome excluded (the top 120 px and the bottom 80 px of a 1440 x 900 frame). A picture measure of the RENDER, not
# a photometric measure of the hall: it compares the three layouts as the room draws them at one exposure.
#   python3 -I scripts/place/frame_luma.py ~/Downloads/moxir/v2-layouts/frames > luma.json
import json, os, sys

import numpy as np
from PIL import Image


def luma(path):
    a = np.asarray(Image.open(path).convert('RGB'), dtype=np.float64)[120:-80]
    c = a / 255.0
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    Y = lin @ np.array([0.2126, 0.7152, 0.0722])
    white = np.all(a >= 240, axis=2)
    return {'mean_Y': round(float(Y.mean()), 4), 'white_pct': round(100.0 * float(white.mean()), 2)}


if __name__ == '__main__':
    d = os.path.expanduser(sys.argv[1])
    out = {f[:-4]: luma(os.path.join(d, f)) for f in sorted(os.listdir(d)) if f.endswith('.png') and not f.startswith('DEBUG')}
    json.dump(out, sys.stdout, indent=1)
