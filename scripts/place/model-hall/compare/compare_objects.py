#!/usr/bin/env python3
"""compare_objects.py - frame | render from the same pose | edge diff, plus per-object reprojection numbers.
  compare_objects.py <frame.jpg> <render.png> <pose.json> <out.png> [--objects objs.json]
Edge diff: Canny edges of the frame (blue) and of the render (red) on the grey frame; where the model is right they coincide (purple).
objs.json: [{"name":"corner_NE","xyz":[x,y,z],"px":[u,v]}] -> model point projected with the pose vs the pixel read from the frame; writes
<out>.json {name: err_px}. Object table rows (position, orientation, size) are kept by the caller in the room's table (see WALLS.md)."""
import sys, json, numpy as np, cv2, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import lib
fr, rn, pf, out = sys.argv[1:5]; P = json.load(open(pf))
A = cv2.imread(fr); A = cv2.resize(A, (P['w'], P['h']))
R = cv2.imread(rn, cv2.IMREAD_UNCHANGED); R = cv2.resize(R, (P['w'], P['h']))
alpha = R[:, :, 3] if R.shape[2] == 4 else np.full(R.shape[:2], 255, np.uint8); Rb = R[:, :, :3].copy(); Rb[alpha == 0] = (30, 30, 30)
ea = cv2.Canny(cv2.GaussianBlur(cv2.cvtColor(A, cv2.COLOR_BGR2GRAY), (5, 5), 0), 40, 110)
er = cv2.Canny(cv2.GaussianBlur(cv2.cvtColor(Rb, cv2.COLOR_BGR2GRAY), (5, 5), 0), 30, 90)
er = cv2.dilate(er, np.ones((3, 3), np.uint8)); ea2 = cv2.dilate(ea, np.ones((3, 3), np.uint8))
D = cv2.cvtColor(cv2.cvtColor(A, cv2.COLOR_BGR2GRAY), cv2.COLOR_GRAY2BGR) // 2
D[ea2 > 0] = (255, 120, 0); D[er > 0] = (0, 0, 255); D[(ea2 > 0) & (er > 0)] = (255, 0, 255)
res = {}
if '--objects' in sys.argv:
    T = np.array(P['T_wc']); Tinv = np.linalg.inv(T); K = lib.K
    for o in json.load(open(sys.argv[sys.argv.index('--objects') + 1])):
        c = Tinv @ np.array([*o['xyz'], 1.0]); 
        if c[2] <= 0.05: res[o['name']] = None; continue
        u = K @ c[:3]; u = u[:2] / u[2]
        if 'px' in o: res[o['name']] = float(np.linalg.norm(u - np.array(o['px'])))
        for im, col in ((D, (0, 255, 0)),): cv2.circle(im, tuple(int(v) for v in u), 8, col, 2)
        if 'px' in o: cv2.circle(D, tuple(int(v) for v in o['px']), 5, (0, 255, 255), -1)
        cv2.putText(D, o['name'], (int(u[0]) + 6, int(u[1]) - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
    json.dump(res, open(out + '.json', 'w'), indent=1)
cv2.imwrite(out, np.hstack([A, Rb, D])); print('COMPARE', out, res)
