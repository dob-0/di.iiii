#!/usr/bin/env python3
"""door_corridor_camera.py - solve the camera of one door-corridor frame from picked corridor edges, check it on lamps that were NOT
used in the solve, measure the visible length, and write median_stack entries (kind 'H') for the wall / floor planes.

Method: camera first (the artist's order; ARTIST-METHOD.md steps 2-3). Vanishing point of the corridor axis = intersection of the two
ceiling edges (picked as pixel pairs from the frame, 1/3-scale grid sheet); with f (assumed S24 main 2457 px at 2160 px width;
the VP-orthogonality estimate is too noisy here, see vp_camera.py) and zero skew, the direction of the axis in the camera is
K^-1 v (Hartley & Zisserman ch. 8.6) and gives yaw and pitch; roll is taken 0 (door-jamb verticals are vertical in the frame).
Position from three edges that run along the axis: each image line l gives a plane through the camera centre with normal K^T l
(H&Z ch. 8.1); with the right wall at y=0, the left wall at y=W, ceiling z=H, floor z=0 the three planes are linear in (Cy, Cz, H).
ONE metric assumption: width W (1.8 m, from the earlier depth-model measurement). Everything else is solved; H is then compared
with the earlier depth measurement (2.55 m, other tool) as the check. Lamps (every 3.5 m in plan.json) are projected and compared with
the lamp centres picked in the frame: second, independent check. World frame: x along the corridor, y to the LEFT, z up.

  python3 door_corridor_camera.py <room_dir> <frames_dir> <out_dir>     (needs numpy, opencv: the photo-analysis venv)
"""
import json, os, sys
import numpy as np, cv2

room, frames, out = sys.argv[1:4]
os.makedirs(out, exist_ok=True)
FRAME = '155205_t11025.jpg'
F, CX, CY = 2457.0, 1080.0, 1920.0
K = np.array([[F, 0, CX], [0, F, CY], [0, 0, 1.0]])
W_ASSUMED = 1.8
CAM_X_WORLD = 13.6  # ASSUMED: camera just inside the entrance (wall x 13.0..13.3); not measured
# picks, full-res pixels of FRAME (read from the grid sheet, +-30 px)
PICK = {'ceil_R': [(1875, 525), (1350, 1710)], 'ceil_L': [(201, 1035), (990, 1770)], 'floor_R': [(1410, 2490), (1710, 3180)]}
LAMPS_PX = [(1116, 1476), (1155, 1656), (1185, 1749), (1200, 1809)]  # lamp centres, nearest first


def hl(p):
    l = np.cross([*p[0], 1.0], [*p[1], 1.0]); return l / np.linalg.norm(l[:2])


L = {k: hl(v) for k, v in PICK.items()}
vp = np.cross(L['ceil_R'], L['ceil_L']); vp = vp[:2] / vp[2]
d_floorR_to_vp = abs(L['floor_R'] @ [*vp, 1.0])  # px: does the independent floor edge pass through the VP?
d = np.linalg.solve(K, [*vp, 1.0]); xw = d / np.linalg.norm(d)         # world x (corridor axis) in camera coords
zw = np.array([0, -1.0, 0]); zw = zw - (zw @ xw) * xw; zw /= np.linalg.norm(zw)  # up
yw = np.cross(zw, xw)                                                  # left
R = np.stack([xw, yw, zw])                                             # world_vec = R @ cam_vec
nw = {k: R @ (K.T @ l) for k, l in L.items()}
A = np.array([[-nw['ceil_R'][1], nw['ceil_R'][2], -nw['ceil_R'][2]],
              [-nw['floor_R'][1], 0, -nw['floor_R'][2]],
              [-nw['ceil_L'][1], nw['ceil_L'][2], -nw['ceil_L'][2]]])
b = np.array([0, 0, -nw['ceil_L'][1] * W_ASSUMED])
# unknown order (Cy, H, Cz)
A = np.array([[-nw['ceil_R'][1], nw['ceil_R'][2], -nw['ceil_R'][2]],
              [-nw['floor_R'][1], 0.0, -nw['floor_R'][2]],
              [-nw['ceil_L'][1], nw['ceil_L'][2], -nw['ceil_L'][2]]])
b = np.array([0.0, 0.0, -nw['ceil_L'][1] * W_ASSUMED])
Cy, H, Cz = np.linalg.solve(A, b)
C = np.array([0.0, Cy, Cz])  # local x origin at the camera


def to_px(P):
    Pc = R.T @ (np.asarray(P, float) - C); u = K @ Pc; return u[:2] / u[2]


# checks ------------------------------------------------------------------------------------------------------
plan = json.load(open(os.path.join(room, 'plan.json')))
lamp_x = []; x = plan['lamps']['x0']
while x < plan['corridor']['x1'] - 0.5:
    lamp_x.append(x); x += plan['lamps']['every']
proj = [(round(float(to_px([lx - CAM_X_WORLD, W_ASSUMED / 2, H])[0]), 0), round(float(to_px([lx - CAM_X_WORLD, W_ASSUMED / 2, H])[1]), 0)) for lx in lamp_x]


def lamp_depth(px):  # x of a ceiling point seen at pixel px, camera-local
    ray = R @ np.linalg.solve(K, [*px, 1.0]); t = (H - Cz) / ray[2]; return float(t * ray[0])


meas = [lamp_depth(p) for p in LAMPS_PX]
res = {
    'frame': FRAME, 'f_px_assumed': F, 'W_assumed_m': W_ASSUMED, 'cam_world_x_assumed': CAM_X_WORLD,
    'vp1_px': [round(float(v), 1) for v in vp], 'floor_edge_miss_px_at_vp': round(float(d_floorR_to_vp), 1),
    'yaw_deg': round(float(np.degrees(np.arctan2(xw[0], xw[2]))), 2), 'pitch_down_deg': round(float(np.degrees(np.arcsin(xw[1]))), 2),
    'camera_local': {'x': 0.0, 'y_from_right_wall': round(float(Cy), 3), 'z': round(float(Cz), 3)},
    'ceiling_height_solved_m': round(float(H), 3), 'ceiling_height_depth_tool_m': 2.55,
    'H_over_W_solved': round(float(H / W_ASSUMED), 3), 'H_over_W_depth_tool': round(2.55 / 1.8, 3),
    'lamp_projected_px_world_x_' + str(lamp_x[:4]): proj[:4], 'lamp_picked_px': LAMPS_PX,
    'lamp_depth_from_camera_m': [round(m, 2) for m in meas], 'lamp_spacing_m': [round(meas[i + 1] - meas[i], 2) for i in range(3)],
    'farthest_lamp_world_x_m': round(CAM_X_WORLD + meas[-1], 1),
}
json.dump(res, open(os.path.join(out, 'camera.json'), 'w'), indent=1)
print(json.dumps(res, indent=0))

# overlay: projected corridor edges + lamps on the frame (look at it) -----------------------------------------------
img = cv2.imread(os.path.join(frames, FRAME))
for (y, z, col) in [(0, H, (0, 255, 255)), (0, 0, (0, 255, 0)), (W_ASSUMED, H, (255, 0, 255)), (W_ASSUMED, 0, (255, 128, 0))]:
    a, c = to_px([1.0, y, z]), to_px([40.0, y, z])
    cv2.line(img, tuple(int(v) for v in a), tuple(int(v) for v in c), col, 5)
for lx in lamp_x:
    p = to_px([lx - CAM_X_WORLD, W_ASSUMED / 2, H]); cv2.circle(img, tuple(int(v) for v in p), 14, (0, 0, 255), 4)
for p in LAMPS_PX: cv2.circle(img, p, 22, (255, 255, 255), 3)
cv2.imwrite(os.path.join(out, 'overlay_11025.jpg'), cv2.resize(img, (720, 1280)))

# median_stack entries (kind H): rect pixel (i, j) -> world point -> reference pixel ------------------------------------
def H_rect(origin, ex, ey, ppm):
    o = np.asarray(origin, float) - C
    M = K @ R.T @ np.stack([np.asarray(ex, float) / ppm, np.asarray(ey, float) / ppm, o], axis=1)
    return (M / M[2, 2]).tolist()


PPM = 200
ents = []
def add(name, xa, xb, y, plane, note, **kw):
    if plane == 'wall':
        w, h = xb - xa, H; ent = dict(origin=[xa, y, H], ex=[1, 0, 0], ey=[0, 0, -1])
    else:
        w, h = xb - xa, W_ASSUMED; ent = dict(origin=[xa, 0, 0], ex=[1, 0, 0], ey=[0, 1, 0])
    e = dict(name=name, kind='H', frame=FRAME, w_m=round(w, 3), h_m=round(h, 3), px_per_m=PPM, H_rect_to_ref=H_rect(ent['origin'], ent['ex'], ent['ey'], PPM),
             world_x_start=round(CAM_X_WORLD + xa, 3), note=note); e.update(kw); ents.append(e)

add('wall_right', 1.5, 9.5, 0.0, 'wall', 'right wall (y = y0), local x 1.5..9.5 from the solved camera', flatten=60, albedo=None)
add('wall_left', 2.6, 9.6, W_ASSUMED, 'wall', 'left wall (y = y1) beyond the ladder (ladder x 15.3..15.75 is a prop, not texture)', flatten=60, albedo=None)
add('floor', 1.5, 9.5, 0.0, 'floor', 'floor, local x 1.5..9.5', flatten=80, albedo=None)
json.dump({'textures': ents, 'camera': res}, open(os.path.join(out, 'plan_H.json'), 'w'), indent=1)
