#!/usr/bin/env python3
"""Does every photo sit right on its surface in Aren's one view?  (di.iiii, spaces/dilijan/aren; method: texfit.py)

Per surface: seams with flipY true/false (internal, also for the cabin, which is not in the yard scan), and the cloud fit
at the poses of a yard.html (IN_YARD) for the mapping the page uses and for the alternatives that would explain a wrong
look: flipY=false, u/v swapped, u mirrored, every other photo of the set. Prints one table; --json writes it.
  python3 -I spaces/dilijan/aren/texcheck.py --api http://dilijan-test.diiii.localhost/serverXR [--page yard.html] [--json out]
"""
import argparse, json, os, sys
here = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, here)
import numpy as np
import texfit as tf


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--api'); ap.add_argument('--blobs'); ap.add_argument('--json')
    ap.add_argument('--page', default=os.path.join(here, 'yard.html')); ap.add_argument('--fast', action='store_true', help='seams + the page mapping only')
    a = ap.parse_args()
    if not (a.api or a.blobs): ap.error('--api or --blobs')
    cloud, yard, pack = tf.load(tf.fetcher(a.api, a.blobs)); grid = tf.Grid(cloud['P'], 0.03); poses = tf.page_poses(open(a.page).read())
    out = {}; fmt = lambda m: f"cover {m['cover']*100:3.0f}%  r_pt {m['r_pt']:.2f}  r_patch {m['r_patch']:.2f}  good {m['good']*100:3.0f}%"
    surfaces = [('yard ' + k, v, v['P'], yard) for k, v in yard.items()]
    for k, v in pack.items():
        if k in poses: R, t = poses[k]; surfaces.append(('pack ' + k, v, v['P'] @ R.T + t, pack))
        else: surfaces.append(('pack ' + k, v, None, pack))
    for name, s, P, group in surfaces:
        row = {}
        for flip in (True, False):
            row[f'seams flipY={flip}'] = tf.seam_score(s['q'], s['I'], s['UV'], s['tex'], flip)
        line = f"{name:16s} seams r {row['seams flipY=True']['r']:.2f} (flipY=false {row['seams flipY=False']['r']:.2f})"
        if P is not None:
            row['page'] = tf.cloud_fit(P, s['I'], s['UV'], s['tex'], cloud, grid); line += '  page: ' + fmt(row['page'])
            if not a.fast:
                alts = {'flipY=false': dict(flip=False), 'swap u/v': dict(uv_map=lambda u: u[:, ::-1]), 'mirror u': dict(uv_map=lambda u: np.stack([1 - u[:, 0], u[:, 1]], 1))}
                alts.update({'photo of ' + o: dict(other_tex=group[o]['tex']) for o in group if group[o] is not s})
                row['alternatives'] = {k: tf.cloud_fit(P, s['I'], s['UV'], s['tex'], cloud, grid, **kw)['r_patch'] for k, kw in alts.items()}
                line += f"  best alternative r_patch {max(row['alternatives'].values()):.2f}"
        else: line += '  (not in the yard scan: no cloud to compare)'
        out[name] = row; print(line); sys.stdout.flush()
    if a.json: json.dump(out, open(a.json, 'w'), indent=1, default=float)


if __name__ == '__main__':
    main()
