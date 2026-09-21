#!/usr/bin/env python3
"""Sharpness + perceptual hash for a list of image files.

Reads a JSON array of absolute paths on stdin, writes a JSON array of
{path, sharpness, hash, width, height} on stdout. A file that cannot be read
comes back with sharpness -1 so the caller rejects it rather than guessing.

sharpness = variance of the Laplacian (the standard blur detector): crisp
edges give a wide spread of second derivatives, a smeared frame gives almost
none.

hash = 64-bit dHash, hex encoded: resize to 9x8 grey, compare each pixel with
its right-hand neighbour. Two frames of the same wall from the same spot land
within a few bits of each other.

Run with the venv python that already has opencv + numpy:
  /home/dob/tools/ComfyUI/.venv/bin/python frame-stats.py
"""
import json
import sys

import cv2
import numpy as np


def dhash(grey, size=8):
    small = cv2.resize(grey, (size + 1, size), interpolation=cv2.INTER_AREA)
    bits = small[:, 1:] > small[:, :-1]
    value = 0
    for bit in bits.flatten():
        value = (value << 1) | int(bit)
    return format(value, '016x')


def stats_for(path):
    image = cv2.imread(path, cv2.IMREAD_COLOR)
    if image is None:
        return {'path': path, 'sharpness': -1.0, 'hash': '', 'width': 0, 'height': 0,
                'error': 'unreadable'}
    grey = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    # Score at a fixed working width so a 48MP still and a 1080p video frame
    # are judged on the same scale — Laplacian variance climbs with resolution.
    height, width = grey.shape[:2]
    if width > 1280:
        scale = 1280.0 / width
        scored = cv2.resize(grey, (1280, max(1, int(round(height * scale)))),
                            interpolation=cv2.INTER_AREA)
    else:
        scored = grey
    sharpness = float(cv2.Laplacian(scored, cv2.CV_64F).var())
    return {
        'path': path,
        'sharpness': sharpness,
        'hash': dhash(grey),
        'width': int(width),
        'height': int(height),
    }


def main():
    paths = json.load(sys.stdin)
    out = []
    for path in paths:
        try:
            out.append(stats_for(path))
        except Exception as error:  # a bad file must not stop the batch
            out.append({'path': path, 'sharpness': -1.0, 'hash': '', 'width': 0,
                        'height': 0, 'error': str(error)})
    json.dump(out, sys.stdout)


if __name__ == '__main__':
    main()
