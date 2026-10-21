#!/usr/bin/env python3
"""Where do the wall page's three scan fragments stand in Aren's yard?  (di.iiii, spaces/dilijan/aren)

Reproduces IN_YARD in yard.html. Inputs, all assets of the project the-yard (sha256 = asset id): the yard's mesh
8bf0c55f...f4a0 with its three photos (from the yard page) and the wall's pack e30e2644...e5e8 ('DILJ', from the elevation
page). Method (texfit.py): a fragment that shares a photo atlas with one of the yard's parts is the same surface,
decimated; the same UV is the same surface point on both, so the pose is a trimmed rigid fit (Kabsch 1976) of the
fragment's vertices onto the points of the part that carry their UVs. No search; any rotation, tilt included.
Shared atlas = at least 40 % of the fragment's vertex UVs land inside the part's charts (vertices on a chart's rim can
fall just outside its raster) and the two photos agree there (r >= 0.8; another surface's photo gives r about 0).
2026-10-21 (N1131): replaces the yaw-only ICP of N1123, which put the wall 4.3 degrees off upright (p90 8.2 cm).
  python3 -I spaces/dilijan/aren/register.py --api http://dilijan-test.diiii.localhost/serverXR [--json out.json]
"""
import argparse, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import texfit as tf


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--api'); ap.add_argument('--blobs', help='a folder of assets named by id (offline)')
    ap.add_argument('--json'); a = ap.parse_args()
    if not (a.api or a.blobs): ap.error('--api or --blobs')
    _, yard, pack = tf.load(tf.fetcher(a.api, a.blobs)); poses, rows = {}, []
    for fn, frag in pack.items():
        best = None
        for pn, part in yard.items():
            r = tf.pose_by_uv(frag, part)
            if r['matched'] >= 0.4 and r.get('photo_r', 0) >= 0.8 and (best is None or r['median'] < best[1]['median']): best = (pn, r)
        if not best:
            # 2026-10-21 (N1145): the cabin shares no atlas because it was scanned apart, at 1.19x: it IS wall_mid (the yard's
            # back wall); elevation.py registers it by its facade (scale 0.84). It still stays out of Բակը (wall_mid is there).
            rows.append(f'{fn:10s} shares no atlas with the yard (scanned apart: elevation.py registers it by its facade); shown only in the wall'); continue
        pn, r = best
        poses[fn] = {'q': [round(float(x), 6) for x in r['q']], 't': [round(float(x), 4) for x in r['t']]}
        rows.append(f"{fn:10s} = yard {pn:10s} matched {r['matched']*100:.0f}% photo r {r['photo_r']:.2f}; residual median {r['median']*100:.2f} cm, "
                    f"p90 {r['p90']*100:.2f} cm, {r['within_1cm']*100:.0f}% within 1 cm; tilt {r['tilt_deg']:.2f} deg")
    print('\n'.join(rows)); print('const IN_YARD=' + json.dumps(poses, separators=(',', ':')) + ';')
    if a.json: json.dump({'poses': poses, 'rows': rows}, open(a.json, 'w'), indent=1)


if __name__ == '__main__':
    main()
