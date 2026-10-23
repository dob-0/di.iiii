#!/usr/bin/env python3
"""Synthetic equirectangular test sheet: a known box room, rendered by ray casting.

Licence-clean: made here from numbers, no photograph. The room is an axis-aligned
box (width 8 m x, depth 6 m z, height 3 m y), camera inside at `--at x y z`.
Walls carry a dark grid every 0.5 m (lines 4 cm wide) on a light, per-wall tinted
ground, so a straight line in the world is a straight dark line in a pinhole view
and a curve on the sheet. Axis: x right, y UP, z forward; yaw 0 looks at +z.

  pano_synth.py out.png [--width 3840] [--at 0 0 0] [--shift-x 0]
"""
import argparse
import math

import cv2
import numpy as np

BOX = {'x': (-4.0, 4.0), 'y': (-1.5, 1.5), 'z': (-3.0, 3.0)}   # camera at the origin = room centre
TINT = {'x-': (200, 220, 240), 'x+': (240, 220, 200), 'z-': (210, 240, 210), 'z+': (230, 230, 245),
        'y-': (180, 190, 180), 'y+': (245, 245, 235)}            # BGR
LINE_W, STEP = 0.04, 0.5


def shade(d, at):
    """Colour of the room along each ray d (..., 3), seen from `at`: the ray-cast core."""
    o = np.array(at)
    best = np.full(d.shape[:-1], np.inf)
    face = np.zeros(d.shape[:-1], dtype=np.int32)
    names = []
    for axis, key in enumerate('xyz'):
        for sign, side in ((0, '-'), (1, '+')):
            plane = BOX[key][sign]
            with np.errstate(divide='ignore', invalid='ignore'):
                t = (plane - o[axis]) / d[..., axis]
            ok = (t > 0) & (t < best)
            best = np.where(ok, t, best)
            face = np.where(ok, len(names), face)
            names.append(key + side)
    p = o + d * best[..., None]
    image = np.zeros(d.shape[:-1] + (3,), np.uint8)
    near = lambda g: np.abs(((g + STEP / 2) % STEP) - STEP / 2) < LINE_W / 2
    for i, name in enumerate(names):
        sel = face == i
        a, b = [k for k in range(3) if k != 'xyz'.index(name[0])]
        line = near(p[..., a]) | near(p[..., b])
        pix = np.where(line[..., None], np.uint8(40), np.array(TINT[name], np.uint8))
        image[sel] = pix[sel]
    return image


def render(width, at=(0.0, 0.0, 0.0)):
    """The whole sphere as an equirectangular sheet (width x width/2)."""
    height = width // 2
    v, u = np.mgrid[0:height, 0:width]
    lon = ((u + 0.5) / width - 0.5) * 2 * math.pi
    lat = (0.5 - (v + 0.5) / height) * math.pi
    d = np.stack([np.cos(lat) * np.sin(lon), np.sin(lat), np.cos(lat) * np.cos(lon)], axis=-1)
    return shade(d, at)


def render_pinhole(size, fov_deg, yaw_deg, pitch_deg, at=(0.0, 0.0, 0.0), supersample=3):
    """GROUND TRUTH: the same room seen by a true pinhole camera, ray cast directly
    (no sheet in between), supersampled so thin lines are anti-aliased like the sheet's
    resampling. Camera looks along yaw (right of +z) and pitch (up). Image y is down."""
    n = size * supersample
    focal = (n / 2.0) / math.tan(math.radians(fov_deg) / 2.0)
    c = (n - 1) / 2.0
    xs, ys = np.meshgrid(np.arange(n) - c, np.arange(n) - c)
    # camera ray (x right, y DOWN, z fwd) -> world (x right, y UP, z fwd)
    cam = np.stack([xs, -ys, np.full_like(xs, focal)], axis=-1).astype(np.float64)
    cam /= np.linalg.norm(cam, axis=-1, keepdims=True)
    pitch, yaw = math.radians(pitch_deg), math.radians(yaw_deg)
    cp, sp, cy, sy = math.cos(pitch), math.sin(pitch), math.cos(yaw), math.sin(yaw)
    tilt = np.array([[1, 0, 0], [0, cp, sp], [0, -sp, cp]])   # +pitch looks up (y up)
    turn = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    world = cam @ (turn @ tilt).T
    big = shade(world, at).astype(np.float64)
    small = big.reshape(size, supersample, size, supersample, 3).mean(axis=(1, 3))
    return small.astype(np.uint8)


def speckle(image, seed):
    """Random coloured ellipses on top (sheet space) so successive test pictures are not
    the same picture twice for the sameness filter. Not used for geometry tests."""
    rng = np.random.default_rng(seed)
    h, w = image.shape[:2]
    out = image.copy()
    for _ in range(60):
        centre = (int(rng.integers(0, w)), int(rng.integers(0, h)))
        axes = (int(rng.integers(w // 40, w // 10)), int(rng.integers(h // 40, h // 10)))
        cv2.ellipse(out, centre, axes, 0, 0, 360, tuple(int(c) for c in rng.integers(0, 256, 3)), -1)
    return out


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('--width', type=int, default=3840)
    ap.add_argument('--at', type=float, nargs=3, default=[0.0, 0.0, 0.0])
    ap.add_argument('--shift-x', type=float, default=0.0)
    ap.add_argument('--seed', type=int, default=None)
    ap.add_argument('--pinhole', type=float, nargs=4, metavar=('SIZE', 'FOV', 'YAW', 'PITCH'), default=None)
    a = ap.parse_args()
    at = (a.at[0] + a.shift_x, a.at[1], a.at[2])
    if a.pinhole:
        image = render_pinhole(int(a.pinhole[0]), a.pinhole[1], a.pinhole[2], a.pinhole[3], at)
    else:
        image = render(a.width, at)
    if a.seed is not None:
        image = speckle(image, a.seed)
    cv2.imwrite(a.out, image, [cv2.IMWRITE_JPEG_QUALITY, 97] if a.out.endswith('.jpg') else [])
