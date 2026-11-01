#!/usr/bin/env python3
"""Run 4 prep (local, light): shrink frames to 1080x1920 and pack them for our own Colab session only.

Faces are in these frames (consent unchecked): the tars stay on aylmo and in the private Colab session.
Names are flattened as <clip>__<file> so a tool can tell the two walks apart.
Usage: prep_frames.py <work> <out>   -> <out>/dense3.tar, <out>/images400.tar, pieces of 12 MB in <out>/parts-*
"""
import os, sys, tarfile, io
from PIL import Image
W = 1080
work, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)

def add(tf, src, name):
    im = Image.open(src).convert('RGB')
    if im.width > im.height: im = im.rotate(-90, expand=True) if False else im  # frames are already portrait
    h = round(im.height * W / im.width)
    im = im.resize((W, h), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, 'JPEG', quality=92); b.seek(0)
    ti = tarfile.TarInfo(name); ti.size = len(b.getvalue()); tf.addfile(ti, b)

with tarfile.open(os.path.join(out, 'dense3.tar'), 'w') as tf:
    n = 0
    for clip in sorted(os.listdir(os.path.join(work, 'dense3'))):
        d = os.path.join(work, 'dense3', clip)
        if not os.path.isdir(d): continue
        for f in sorted(os.listdir(d)):
            if f.endswith('.jpg'): add(tf, os.path.join(d, f), f'{clip}__{f}'); n += 1
    print('dense3', n)
with tarfile.open(os.path.join(out, 'images400.tar'), 'w') as tf:
    fs = sorted(f for f in os.listdir(os.path.join(work, 'images')) if f.endswith('.jpg'))
    for f in fs: add(tf, os.path.join(work, 'images', f), f'img__{f}')
    print('images400', len(fs))
