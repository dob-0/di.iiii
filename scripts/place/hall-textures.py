#!/usr/bin/env python3
"""Fetch the pinned CC0 texture sets (hall-textures.json) and bake them for hall.py --textures.

    python3 scripts/place/hall-textures.py --out <dir>      # then: blender -b -P hall.py -- --textures <dir> ...

Writes each SET's maps ONCE: <dir>/<set>_color.jpg, <set>_normal.jpg, <set>_rough.jpg, plus <dir>/textures.json
(per material: its set, tile size, linear colour tint, roughness factor). Materials that share a set share the files,
so the GLB embeds one copy of each map per set, not per material.
Colour: the set's map is gained (per channel, in linear light, bisected so the CLIPPED mean equals the brightest
target among the set's materials); each material then multiplies it by the glTF baseColorFactor
target/target_max (<= 1, linear light, which is what glTF multiplies in), so every material's mean equals its
colour in hall.py's MATERIALS table (sampled from the owner's photographs): the texture adds variation, the photograph
keeps the average.
Roughness: the set's Roughness map (G channel; B = 0 so metalness 0) is scaled so its mean equals the largest table
roughness in the set, and each material's roughnessFactor = its table roughness / that. Needs Pillow + numpy.
"""
import argparse, ast, hashlib, io, json, os, re, sys, urllib.request, zipfile
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))


def table_colours():
    src = open(os.path.join(HERE, 'hall.py')).read()
    m = re.search(r'^MATERIALS = (\{.*?^\})', src, re.S | re.M)
    return {k: v[0] for k, v in ast.literal_eval(m.group(1)).items()}


def table_roughness():
    src = open(os.path.join(HERE, 'hall.py')).read()
    m = re.search(r'^MATERIALS = (\{.*?^\})', src, re.S | re.M)
    return {k: v[1] for k, v in ast.literal_eval(m.group(1)).items()}


def to_linear(a):
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)


def to_srgb(a):
    return np.where(a <= 0.0031308, a * 12.92, 1.055 * np.power(np.clip(a, 0, None), 1 / 2.4) - 0.055)


def gain_to_mean(lin, target):
    """Per-channel gain g with mean(clip(lin*g, 0, 1)) == target (bisection; clipping makes a plain ratio undershoot)."""
    out = []
    for c in range(3):
        v = lin[..., c].ravel()
        lo, hi = 0.0, 1e4
        for _ in range(60):
            mid = (lo + hi) / 2
            if np.clip(v * mid, 0, 1).mean() < target[c]:
                lo = mid
            else:
                hi = mid
        out.append((lo + hi) / 2)
    return np.array(out)


def jpg(arr01, path):
    Image.fromarray((np.clip(arr01, 0, 1) * 255 + 0.5).astype(np.uint8)).save(path, quality=88)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--cache', default=os.path.expanduser('~/.cache/di-hall-textures'))
    args = ap.parse_args()
    manifest = json.load(open(os.path.join(HERE, 'hall-textures.json')))
    colours = table_colours()
    roughs = table_roughness()
    os.makedirs(args.out, exist_ok=True)
    os.makedirs(args.cache, exist_ok=True)
    materials, sets = {}, {}
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
        rough = np.asarray(Image.open(io.BytesIO(z.read(f'{sid}_1K-JPG_Roughness.jpg'))).convert('L'), dtype=np.float64) / 255
        mats = spec['for']
        lin = to_linear(colour)
        top = np.max([colours[m] for m in mats], axis=0)
        gain = gain_to_mean(lin, top)
        jpg(to_srgb(np.clip(lin * gain, 0, 1)), os.path.join(args.out, f'{sid}_color.jpg'))
        normal.save(os.path.join(args.out, f'{sid}_normal.jpg'), quality=88)
        # roughness is stored as-is (not colour): the mean of the 8-bit values is what the shader reads
        rtop = max(roughs[m] for m in mats)
        lo, hi = 0.0, 100.0
        for _ in range(60):
            mid = (lo + hi) / 2
            lo, hi = (mid, hi) if np.clip(rough * mid, 0, 1).mean() < rtop else (lo, mid)
        rg = (lo + hi) / 2
        g8 = (np.clip(rough * rg, 0, 1) * 255 + 0.5).astype(np.uint8)
        Image.fromarray(np.stack([np.zeros_like(g8), g8, np.zeros_like(g8)], axis=-1)).save(
            os.path.join(args.out, f'{sid}_rough.jpg'), quality=85, subsampling=0)  # R unused, G roughness, B metalness 0
        sets[sid] = {'tile_m': spec['tile_m']}
        for mat in mats:
            tint = np.array(colours[mat]) / top
            materials[mat] = {'set': sid, 'tile_m': spec['tile_m'], 'tint': [round(float(t), 6) for t in tint],
                              'roughness_factor': round(roughs[mat] / rtop, 6)}
            print(f'{mat}: {sid} tint {np.round(tint, 3).tolist()} -> {colours[mat]}, roughness x{roughs[mat] / rtop:.3f} -> {roughs[mat]}')
        print(f'{sid}: map gain {np.round(gain, 2).tolist()}, roughness map gain {rg:.2f}')
    json.dump({'materials': materials, 'sets': sets, 'from': 'hall-textures.json'},
              open(os.path.join(args.out, 'textures.json'), 'w'), indent=1)


main()
