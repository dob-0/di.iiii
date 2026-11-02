#!/usr/bin/env python3
"""pose_from_frame.py - camera pose of a survey frame, in the floor.json world frame.
  pose_from_frame.py <frame.jpg> --corners marks.json [--out pose.json]   PnP (Lepetit 2009 EPnP -> LM refine) on known model corners.
       marks.json: [{"name":"A_floor_left","xyz":[x,y,z],"px":[u,v]}, ...]  px in the 720x1280 frame; >= 4 marks, not coplanar-degenerate.
  pose_from_frame.py <frame.jpg> --chain poses.json                         the pose chained by chain.py/graph.py (see WALLS.md).
Prints/writes {"name","T_wc"(4x4, camera OpenCV -> world),"f","w","h","rms_px","n"}; exit 2 if rms > --max-rms (default 6 px) so a bad pose FAILS.
Focal: 2457 px at 2160 wide ASSUMED (no EXIF); use --f to override at 720 wide."""
import sys, json, argparse, numpy as np, cv2, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib

def from_corners(marks, f=lib.F):
    K = np.array([[f, 0, lib.W / 2], [0, f, lib.H / 2], [0, 0, 1.0]])
    X = np.array([m['xyz'] for m in marks], float); x = np.array([m['px'] for m in marks], float)
    ok, rv, tv = cv2.solvePnP(X, x, K, None, flags=cv2.SOLVEPNP_EPNP if len(X) >= 6 else cv2.SOLVEPNP_ITERATIVE)
    ok, rv, tv = cv2.solvePnP(X, x, K, None, rv, tv, True, cv2.SOLVEPNP_ITERATIVE)
    pr = cv2.projectPoints(X, rv, tv, K, None)[0].reshape(-1, 2); err = np.linalg.norm(pr - x, axis=1)
    R = cv2.Rodrigues(rv)[0]; T = np.eye(4); T[:3, :3] = R.T; T[:3, 3] = -R.T @ tv.ravel()
    return T, float(np.sqrt((err ** 2).mean())), err.tolist()

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('frame'); ap.add_argument('--corners'); ap.add_argument('--chain'); ap.add_argument('--out')
    ap.add_argument('--f', type=float, default=lib.F); ap.add_argument('--max-rms', type=float, default=6.0); a = ap.parse_args()
    name = os.path.basename(a.frame)
    if a.corners:
        T, rms, err = from_corners(json.load(open(a.corners)), a.f); n = len(err)
    else:
        T = np.array(json.load(open(a.chain))[name]['T_wc']); rms, n = 0.0, 0
    out = dict(name=name, T_wc=T.tolist(), f=a.f, w=lib.W, h=lib.H, rms_px=rms, n=n)
    s = json.dumps(out); print(s[:400]); a.out and open(a.out, 'w').write(s)
    sys.exit(2 if rms > a.max_rms else 0)
