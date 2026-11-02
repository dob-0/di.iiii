#!/usr/bin/env python3
"""wall_compare.py - pose of a survey frame IN A ROOM BOX straight from its measured walls (no frame chain), then frame | render same pose | edge diff.
  wall_compare.py spec.json out_dir          spec: {"glb":..., "items":[{"id","room","frame","facing_deg","box":[x0,y0,x1,y1,H]}]}
Method (single-view metrology, Criminisi/Reid/Zisserman 2000, on MoGe-2 metric points; walls_single2.json lines = vertical wall planes, normal towards camera, distance d):
 yaw: the known facing direction (world angle, +x=0, +y=90) gives yaw0; every wall normal is snapped to the nearest box axis and the median residual corrects yaw
 (residuals also reported: rectilinearity). Position: a wall line facing +x/-x/+y/-y at distance d puts the camera at wall +/- d on that axis (west x0 / east x1 / south y0 / north y1);
 an axis with no wall line is FREE (centre used, flagged). Height = MoGe floor plane. R_wc = rz(yaw) @ lib.level_rot (camera -> leveled -> world).
 If both walls of an axis are seen, separation d1+d2 is the MEASURED width at that frame and the model-vs-measured gap is reported in m and in px (f*gap/depth).
Writes <out>/<id>.pose.json (+ .json numbers), renders all items in ONE Blender run, then compare_objects.py -> <out>/<id>.png (frame | render | diff)."""
import sys, json, math, os, subprocess, numpy as np, cv2
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import lib
spec = json.load(open(sys.argv[1])); out = sys.argv[2]; os.makedirs(out, exist_ok=True)
S = json.load(open(lib.CMP + '/walls_single2.json')); poses = []; info = {}
AX = {(1, 0): 'W', (-1, 0): 'E', (0, 1): 'S', (0, -1): 'N'}
for it in spec['items']:
    fn = it['frame'] + '.jpg'; v = S[fn]; P, Mk = lib.load_points(fn); up = lib.floor_up(P, Mk); L = lib.level_rot(up[0]); h = up[1]
    x0, y0, x1, y1, H = it['box']; yaw0 = math.radians(it['facing_deg'] - 90)
    lines = [l for l in v['lines'] if l['n'] >= it.get('min_n', 900)]
    res = []; asg = []
    for l in lines:
        a = math.radians(l['phi']) + yaw0; k = round(a / (math.pi / 2)); r = (a - k * math.pi / 2); asg.append((l, k % 4, r)); res.append(r)
    ok = [r for (_, _, r) in asg if abs(r) < math.radians(12)]
    yaw = yaw0 - (np.median(ok) if ok else 0.0)
    m4 = {0: (1, 0), 1: (0, 1), 2: (-1, 0), 3: (0, -1)}   # snapped angle k*90 deg = normal direction in world = inward normal
    cam = {}; seen = {}
    fa = (it['facing_deg'] % 360); end_walls = ('S', 'N') if fa in (90, 270) else ('E', 'W')
    for (l, k, r) in asg:
        if abs(r) > math.radians(12): continue
        w = AX[m4[k]]; seen.setdefault(w, []).append(l)
    d = {w: max(ls, key=lambda q: q['n'])['d'] for w, ls in seen.items() if w not in it.get('ignore_walls', []) and max(q['n'] for q in ls) >= (it.get('min_n_end', 3000) if w in end_walls else it.get('min_n', 900))}
    cx = cy = None; flags = []
    if 'W' in d and x0 + 0.1 < x0 + d['W'] < x1 - 0.1: cx = x0 + d['W']
    elif 'E' in d and x0 + 0.1 < x1 - d['E'] < x1 - 0.1: cx = x1 - d['E']
    if 'S' in d and y0 + 0.1 < y0 + d['S'] < y1 - 0.1: cy = y0 + d['S']
    elif 'N' in d and y0 + 0.1 < y1 - d['N'] < y1 - 0.1: cy = y1 - d['N']
    if cx is None: cx = it.get('free_x', (x0 + x1) / 2); flags.append('x FREE (no wall line across), set %.2f' % cx)
    if cy is None: cy = it.get('free_y', (y0 + y1) / 2); flags.append('y FREE (no end-wall line), set %.2f' % cy)
    T = np.eye(4); T[:3, :3] = lib.rz(yaw) @ L; T[:3, 3] = [cx, cy, h]
    meas = {}
    if 'W' in d and 'E' in d: meas['sep_x'] = d['W'] + d['E']; gap = (x1 - x0) - meas['sep_x']; meas['gap_x_m'] = gap
    if 'S' in d and 'N' in d: meas['sep_y'] = d['S'] + d['N']; meas['gap_y_m'] = (y1 - y0) - meas['sep_y']
    depth = np.median([abs(l['c'][1]) for l in lines]) if lines else 3.0
    for key in ('gap_x_m', 'gap_y_m'):
        if key in meas: meas[key.replace('_m', '_px')] = lib.F * meas[key] / max(depth, 1.0)
    info[it['id']] = dict(frame=fn, room=it['room'], yaw_deg=math.degrees(yaw) % 360, yaw_corr_deg=math.degrees(yaw0 - yaw), residuals_deg=[round(math.degrees(r), 1) for r in res], walls_d=d, cam=[cx, cy, h], ceil=v['ceil'], flags=flags, **meas)

    # floor-wall base lines of the seen walls: model line projected with the pose vs nearest Canny edge of the frame (px)
    Kp = lib.K; Ti = np.linalg.inv(T); g_ = cv2.imread(lib.CMP + '/_work/small/' + fn, 0); E_ = cv2.Canny(cv2.GaussianBlur(g_, (5, 5), 0), 40, 110)
    DT_ = cv2.distanceTransform(255 - E_, cv2.DIST_L2, 3); basel = {'W': ((x0, y0), (x0, y1)), 'E': ((x1, y0), (x1, y1)), 'S': ((x0, y0), (x1, y0)), 'N': ((x0, y1), (x1, y1))}
    rp = {}
    for w in d:
        a_, b_ = [np.array(q + (0.02,)) for q in basel[w]]; pts = a_ + (b_ - a_) * np.linspace(0, 1, 400)[:, None]
        c = (Ti @ np.c_[pts, np.ones(400)].T).T[:, :3]; c = c[c[:, 2] > 0.3]
        if len(c) < 10: continue
        u = Kp @ c.T; u = (u[:2] / u[2]).T; ok = (u[:, 0] >= 0) & (u[:, 0] < lib.W) & (u[:, 1] >= 0) & (u[:, 1] < lib.H)
        if ok.sum() < 10: continue
        dd = DT_[u[ok, 1].astype(int), u[ok, 0].astype(int)]; rp[w] = dict(median_px=float(np.median(dd)), p75_px=float(np.percentile(dd, 75)), n=int(ok.sum()))
    info[it['id']]['base_line_reproj'] = rp
    pj = f"{out}/{it['id']}.pose.json"; po = dict(name=fn, T_wc=T.tolist(), f=lib.F, w=lib.W, h=lib.H, out=f"{out}/{it['id']}.render.png"); json.dump(po, open(pj, 'w')); poses.append(po)
json.dump(poses, open(out + '/_batch.json', 'w'))
r = subprocess.run(['blender', '-b', '--factory-startup', '--python', lib.CMP + '/render_same_pose.py', '--', spec['glb'], out + '/_batch.json', out + '/x.png'], capture_output=True, text=True)
print(r.stdout.count('RENDERED'), 'rendered', r.stderr[-300:] if r.returncode else '')
for it, po in zip(spec['items'], poses):
    fr = lib.FR + '/' + it['frame'] + '.jpg'; o = f"{out}/{it['id']}.png"
    subprocess.run([sys.executable, lib.CMP + '/compare_objects.py', fr, po['out'], f"{out}/{it['id']}.pose.json", o], capture_output=True)
    A = cv2.imread(lib.CMP + '/_work/small/' + it['frame'] + '.jpg'); R_ = cv2.imread(po['out'], cv2.IMREAD_UNCHANGED)
    a = cv2.dilate(cv2.Canny(cv2.GaussianBlur(cv2.cvtColor(A, cv2.COLOR_BGR2GRAY), (5, 5), 0), 40, 110), np.ones((5, 5), np.uint8))
    g = cv2.cvtColor(R_[:, :, :3], cv2.COLOR_BGR2GRAY); g[R_[:, :, 3] == 0] = 30; rr = cv2.Canny(cv2.GaussianBlur(g, (5, 5), 0), 30, 90)
    rp_ = info[it['id']]['base_line_reproj']; txt = ' '.join(f"{w}:{v['median_px']:.1f}px" for w, v in rp_.items()); I = cv2.imread(o); cv2.putText(I, f"{it['id']} overlap {float(((a > 0) & (rr > 0)).sum() / max(1, (rr > 0).sum())):.2f}  base-line reproj median {txt}  gap {info[it['id']].get('gap_x_px', info[it['id']].get('gap_y_px', 0)):.0f}px", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2); cv2.imwrite(o, I)
    info[it['id']]['edge_overlap'] = float(((a > 0) & (rr > 0)).sum() / max(1, (rr > 0).sum()))
json.dump(info, open(out + '/numbers.json', 'w'), indent=1)
for k, v in info.items(): print(k, 'overlap %.2f' % v['edge_overlap'], 'cam', [round(c, 2) for c in v['cam']], 'walls', {a: round(b, 2) for a, b in v['walls_d'].items()}, {a: round(b, 2) for a, b in v.items() if a.startswith(('sep', 'gap'))}, v['flags'])
