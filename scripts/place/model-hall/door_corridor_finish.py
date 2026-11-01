#!/usr/bin/env python3
"""door_corridor_finish.py - turn median_stack output (cam3/tex) into the room's textures + plan keys. One command, repeatable.

  ~/tools/photo-analysis/.venv/bin/python -I door_corridor_finish.py <room_dir>

Crops each strip to the part the frames saw sharply and without props (the ladder and easels are modelled, so not baked in),
paints out the framed prints on the left wall (artworks/people: never used as texture, owner N1781, copyright), mirrors each strip
in x so it repeats seamlessly beyond the frames (the only tiling, said in provenance), writes textures/{wall_right,wall_left,floor}.png
and plan.json keys `textures_world` (world x start, one-tile width, height in metres: UV = world metres) and the solved height and view.
"""
import json, os, sys, shutil
import numpy as np, cv2

room = sys.argv[1]; T = os.path.join(room, 'textures'); S = os.path.join(room, 'cam3', 'tex')
cam = json.load(open(os.path.join(room, 'cam3', 'camera.json'))); PPM = 200; CX = cam['cam_world_x_assumed']; H = cam['ceiling_height_solved_m']
plan = json.load(open(os.path.join(room, 'plan.json')))
if not os.path.exists(os.path.join(room, 'plan.json.before-fix3')): shutil.copy(os.path.join(room, 'plan.json'), os.path.join(room, 'plan.json.before-fix3'))
for n in ('wall_stone', 'floor_marble'):  # the old textures stay as a mode/archive (rule: nothing is lost)
    p = os.path.join(T, n + '.png'); b = os.path.join(T, n + '.before-fix3.png')
    if os.path.exists(p) and not os.path.exists(b): shutil.copy(p, b)
# (name, strip, local start m of the strip, crop px range, prints/boxes to paint out (strip px: x0,y0,x1,y1))
JOBS = [('wall_right', 'wall_right', 1.5, (100, 600), [(0, 0, 360, 120)]),
        ('wall_left', 'wall_left', 2.6, (480, 960), [(652, 632, 820, 716)]),
        ('floor', 'floor', 1.5, (350, 800), [])]
ALB = {'wall_right': 0.46, 'wall_left': 0.46, 'floor': 0.40}
world, prov = {}, []
for name, src, local0, (a, b), boxes in JOBS:
    im = cv2.imread(os.path.join(S, src + '.png'))
    im = im[:, a:b].copy()
    for x0, y0, x1, y1 in boxes:  # boxes are in the uncropped strip; shift
        x0, x1 = x0 - a - 14, x1 - a + 14; y0, y1 = y0 - 14, y1 + 14
        if x1 <= 0 or x0 >= im.shape[1]: continue
        m = np.zeros(im.shape[:2], np.uint8); m[max(0, y0):y1, max(0, x0):x1] = 255
        im = cv2.inpaint(im, m, 9, cv2.INPAINT_TELEA)
    mean = im.reshape(-1, 3).mean()  # sRGB mean -> reflectance target (CIBSE-style table values: stone ~0.46, polished floor ~0.40): exposure is not colour
    im = np.clip(im * (ALB[name] * 255.0 / mean), 0, 255).astype(np.uint8)
    mir = np.concatenate([im, im[:, ::-1]], 1)
    out = 'wall_stone_%s.png' % name.split('_')[1] if name.startswith('wall') else 'floor_corridor.png'
    cv2.imwrite(os.path.join(T, out), mir)
    xs = CX + local0 + a / PPM; w = (b - a) / PPM
    world[name] = {'file': out, 'x_start': round(xs, 3), 'tile_w_m': round(w, 3), 'mirrored_x': True, 'height_m': (H if name != 'floor' else 1.8)}
    prov.append({'texture': out, 'source': 'cam3/tex/%s.png (median_stack.py, camera from door_corridor_camera.py)' % src, 'crop_px': [a, b],
                 'painted_out_boxes': boxes, 'world_x_start': world[name]['x_start'], 'tile_w_m': world[name]['tile_w_m']})
plan['textures_world'] = world
plan['render']['exposure'] = -1.6  # calibrated so the wall mean luma of eye_solved matches the frame (measured before: render 200 vs frame 125 at +0.2)
plan['render']['note'] = 'fix3: usable detail only where the frame samples >= ~60 px/m: right wall local x 2..4.5 m, left wall 5..6.6 m, floor 3..5 m; beyond that the strips are stretched, so they are cropped and mirrored'
plan['corridor']['height'] = round(H, 2)
plan['corridor']['marks'] += ' | fix3: height SOLVED from camera 2.39 (was 2.55 depth tool); W 1.8 assumed; length: farthest lamp x=%.1f (cam x ASSUMED 13.6), end not seen' % cam['farthest_lamp_world_x_m']
cl = cam['camera_local']
view = {'name': 'eye_solved', 'frame': '155205_t11025.jpg', 'pos': [CX, plan['corridor']['y0'] + cl['y_from_right_wall'], cl['z']],
        'yaw_deg': round(-90 + cam['yaw_deg'], 2), 'pitch_deg': cam['pitch_down_deg'] * -1}
plan['views'] = [v for v in plan['views'] if v['name'] != 'eye_solved'] + [view]
json.dump(plan, open(os.path.join(room, 'plan.json'), 'w'), indent=1)
pv = json.load(open(os.path.join(T, 'provenance.json'))) if os.path.exists(os.path.join(T, 'provenance.json')) else {}
pv['fix3_textures'] = prov; pv['fix3_people'] = 'OneFormer person mask excluded before the median; prints on the left wall painted out; no face in any texture'
json.dump(pv, open(os.path.join(T, 'provenance.json'), 'w'), indent=1)
print(json.dumps(world, indent=0)[:700])
