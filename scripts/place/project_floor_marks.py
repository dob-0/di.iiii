#!/usr/bin/env python3
# project_floor_marks.py — the owner's painted marks on a video frame, projected onto the hall floor (y = 0).
# Used 2026-10-07 for his stage line on frame 954 @ 3.6 s: masks per colour (green/teal/blue .npy, pixel [u, v] lists
# segmented from ~/Downloads/moxir/,dob fixed last places bags-from-video-954.jpg) -> marks-954-stage-2026-10-07.json.
#   python3 -I scripts/place/project_floor_marks.py scripts/place/picks/cam-954-3.6.json <dir with green.npy teal.npy blue.npy>
# Method: ray from the fitted camera through the lowest painted pixel of each 16-px column band (the mark's floor
# contact) to the plane y = 0. Accuracy is the camera's: see cam-954-3.6.json and moxir-stage-line-2026-10-07.json.
import json, sys, numpy as np
cam = json.load(open(sys.argv[1])); d = sys.argv[2]
R = np.array(cam['R']); C = np.array(cam['C']); f, cx, cy = cam['f'], cam['cx'], cam['cy']
def floor(u, v):
    r = R.T @ np.array([(u - cx) / f, (v - cy) / f, 1.0])
    if r[1] >= 0: return None
    t = -C[1] / r[1]; p = C + t * r
    return float(p[0]), float(p[2])
out = {}
for k in ['green', 'teal', 'blue']:
    pts = np.load(f'{d}/{k}.npy')
    # floor contact = lowest painted pixel in each 16-px column band
    res = []
    for u0 in range(0, 2048, 16):
        sel = pts[(pts[:, 0] >= u0) & (pts[:, 0] < u0 + 16)]
        if len(sel) == 0: continue
        v = sel[:, 1].max(); q = floor(u0 + 8, v)
        if q: res.append([round(q[0], 2), round(q[1], 2), int(u0 + 8), int(v)])
    out[k] = res
    xs = [r[0] for r in res]; zs = [r[1] for r in res]
    if res: print(k, 'x', min(xs), '…', max(xs), ' z', min(zs), '…', max(zs), len(res), 'bands')
json.dump(out, open(f'{d}/marks-on-floor.json', 'w'), indent=1)
