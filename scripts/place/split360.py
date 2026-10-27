#!/usr/bin/env python3
"""Cut equirectangular 360 pictures into ordinary pinhole pictures.

JSON on stdin:
  {"frames": [{"path": ".../a.jpg", "base": "pano-00001"}, ...],
   "out": "<dir>", "views": [{"index":0,"yaw":0,"pitch":0,"fov":90}, ...],
   "size": 1920, "maskBelow": 60, "maskSector": null | {"yaw":180,"half":50},
   "dropMasked": 0.5, "quality": 95}
JSON on stdout: [{"base","index","name","yaw","pitch","fov","size","maskedFraction","dropped"}, ...]

Geometry (the standard one, same as ffmpeg's v360 and Meshroom's Split360Images):
a pinhole camera of square side S and field of view F has focal f = (S/2)/tan(F/2).
Pixel (x, y) gives the ray (x-c, y-c, f) (x right, y down, z forward); the ray is
turned by pitch (about x) then yaw (about the vertical); longitude/latitude of the
ray index the equirectangular sheet: u = (lon/2pi + .5) W, v = (.5 - lat/pi) H.
Yaw turns to the right (clockwise from above), pitch up is positive.

Masking: the bottom of the sphere is the photographer and the pole. Every pixel
whose ray points more than `maskBelow` degrees under the horizon is painted black
(a black patch has no features, so the matcher ignores it). `maskSector` paints a
sector of yaw (the person standing behind a hand-held camera) the same way.
A view that is more than `dropMasked` black is not written at all.

The EXIF carries FocalLengthIn35mmFilm so the reconstruction starts from the true
focal, not a guess (PIL; skipped if PIL is missing).
"""
import json
import math
import os
import sys

import cv2
import numpy as np


def rotation(yaw_deg, pitch_deg):
    yaw, pitch = math.radians(yaw_deg), math.radians(pitch_deg)
    cp, sp = math.cos(pitch), math.sin(pitch)
    cy, sy = math.cos(yaw), math.sin(yaw)
    pitch_up = np.array([[1, 0, 0], [0, cp, -sp], [0, sp, cp]])  # +pitch lifts the view (y is down)
    yaw_right = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])  # +yaw turns right
    return yaw_right @ pitch_up


def rays(size, fov_deg):
    focal = (size / 2.0) / math.tan(math.radians(fov_deg) / 2.0)
    centre = (size - 1) / 2.0
    xs, ys = np.meshgrid(np.arange(size, dtype=np.float64) - centre,
                         np.arange(size, dtype=np.float64) - centre)
    d = np.stack([xs, ys, np.full_like(xs, focal)], axis=-1)
    return d / np.linalg.norm(d, axis=-1, keepdims=True)


def view_maps(width, height, size, view):
    d = rays(size, view['fov']) @ rotation(view['yaw'], view['pitch']).T
    lon = np.arctan2(d[..., 0], d[..., 2])
    lat = np.arcsin(np.clip(-d[..., 1], -1, 1))          # up is +lat
    map_x = ((lon / (2 * math.pi) + 0.5) * width - 0.5).astype(np.float32)
    map_y = ((0.5 - lat / math.pi) * height - 0.5).astype(np.float32)
    return map_x, map_y, np.degrees(lat), np.degrees(lon)


def mask_for(lat, lon, mask_below, sector):
    mask = lat < -float(mask_below)
    if sector:
        diff = (lon - float(sector['yaw']) + 180.0) % 360.0 - 180.0
        mask |= np.abs(diff) <= float(sector['half'])
    return mask


def save(path, image_bgr, focal35):
    try:
        from PIL import Image
        exif = Image.Exif()
        exif[0xA405] = int(round(focal35))                 # FocalLengthIn35mmFilm
        Image.fromarray(cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)).save(path, quality=95, exif=exif)
    except ImportError:
        cv2.imwrite(path, image_bgr, [cv2.IMWRITE_JPEG_QUALITY, 95])


def main():
    job = json.load(sys.stdin)
    os.makedirs(job['out'], exist_ok=True)
    size = int(job['size'])
    drop = float(job.get('dropMasked', 0.5))
    cache = {}
    report = []
    for frame in job['frames']:
        sheet = cv2.imread(frame['path'], cv2.IMREAD_COLOR)
        if sheet is None:
            report.append({'base': frame['base'], 'error': 'unreadable'})
            continue
        height, width = sheet.shape[:2]
        for view in job['views']:
            key = (width, height, view['index'])
            if key not in cache:
                map_x, map_y, lat, lon = view_maps(width, height, size, view)
                cache[key] = (map_x, map_y, mask_for(lat, lon, job.get('maskBelow', 60), job.get('maskSector')))
            map_x, map_y, mask = cache[key]
            masked = float(mask.mean())
            entry = {'base': frame['base'], 'index': view['index'], 'yaw': view['yaw'], 'pitch': view['pitch'],
                     'fov': view['fov'], 'size': size, 'maskedFraction': round(masked, 4), 'dropped': masked > drop}
            if not entry['dropped']:
                image = cv2.remap(sheet, map_x, map_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_WRAP)
                image[mask] = 0
                name = '%s-v%d.jpg' % (frame['base'], view['index'])
                focal35 = 18.0 / math.tan(math.radians(view['fov']) / 2.0)   # 36 mm frame width
                save(os.path.join(job['out'], name), image, focal35)
                entry['name'] = name
            report.append(entry)
    print(json.dumps(report))


if __name__ == '__main__':
    main()
