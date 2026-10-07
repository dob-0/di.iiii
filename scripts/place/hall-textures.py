#!/usr/bin/env python3
"""Fetch the pinned CC0 texture sets (hall-textures.json) and bake them for hall.py --textures.

    python3 scripts/place/hall-textures.py --out <dir>      # then: blender -b -P hall.py -- --textures <dir> ...

For every hall material that has a set, writes <dir>/<material>_color.jpg and <dir>/<material>_normal.jpg
and <dir>/textures.json (tile size per material). The colour map is TINTED so its mean (in linear light)
equals the material's colour in hall.py's MATERIALS table, which was sampled from the owner's photographs:
the texture adds variation, the photograph keeps the average. Roughness stays the table's scalar.
Method: per-channel gain in linear light (sRGB decode, scale by target/mean, clip, encode). Needs Pillow + numpy.
"""
import argparse, ast, hashlib, io, json, os, re, sys, urllib.request, zipfile
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))


def table_colours():
    src = open(os.path.join(HERE, 'hall.py')).read()
    m = re.search(r'^MATERIALS = (\{.*?^\})', src, re.S | re.M)
    return {k: v[0] for k, v in ast.literal_eval(m.group(1)).items()}


def to_linear(a):
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)


def to_srgb(a):
    return np.where(a <= 0.0031308, a * 12.92, 1.055 * np.power(np.clip(a, 0, None), 1 / 2.4) - 0.055)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--cache', default=os.path.expanduser('~/.cache/di-hall-textures'))
    args = ap.parse_args()
    manifest = json.load(open(os.path.join(HERE, 'hall-textures.json')))
    colours = table_colours()
    os.makedirs(args.out, exist_ok=True)
    os.makedirs(args.cache, exist_ok=True)
    tiles = {}
    for sid, spec in manifest['sets'].items():
        zpath = os.path.join(args.cache, sid + '.zip')
        if not os.path.exists(zpath):
            req = urllib.request.Request(spec['url'], headers={'User-Agent': 'di.iiii-hall-textures/1 (curl-compatible)'})  # ambientCG answers 403 to urllib's default agent
            with urllib.request.urlopen(req) as r, open(zpath, 'wb') as f:
                f.write(r.read())
        digest = hashlib.sha256(open(zpath, 'rb').read()).hexdigest()
        if digest != spec['sha256']:
            sys.exit(f'{sid}: sha256 {digest} is not the pinned {spec["sha256"]} — refusing to use it')
        z = zipfile.ZipFile(zpath)
        colour = np.asarray(Image.open(io.BytesIO(z.read(f'{sid}_1K-JPG_Color.jpg'))).convert('RGB'), dtype=np.float64) / 255
        normal = Image.open(io.BytesIO(z.read(f'{sid}_1K-JPG_NormalGL.jpg'))).convert('RGB')
        lin = to_linear(colour)
        mean = lin.reshape(-1, 3).mean(axis=0)
        for mat in spec['for']:
            gain = np.array(colours[mat]) / np.maximum(mean, 1e-6)
            Image.fromarray((np.clip(to_srgb(np.clip(lin * gain, 0, 1)), 0, 1) * 255 + 0.5).astype(np.uint8)).save(
                os.path.join(args.out, f'{mat}_color.jpg'), quality=88)
            normal.save(os.path.join(args.out, f'{mat}_normal.jpg'), quality=88)
            tiles[mat] = spec['tile_m']
            print(f'{mat}: {sid} tinted to {colours[mat]} (texture mean {np.round(mean, 3).tolist()}, gain {np.round(gain, 2).tolist()})')
    json.dump({'tile_m': tiles, 'from': 'hall-textures.json'}, open(os.path.join(args.out, 'textures.json'), 'w'), indent=1)


main()
