"""entrance_view.py - the view from the spawn (eye 1.6 m, looking +y, 70 deg hfov) and where things land in it.
Run: blender -b <out>/floor.blend --python entrance_view.py -- <floor.json> <floor_assembly.json> <place_meta.json> <out.png> <banner_object_glob> [left_room right_room] [samples]
Prints VIEW banner_x (normalised -1..1 from the image centre, share of the image WIDTH = x/2), and for each named room the
normalised x of its plan centre at eye height (ndc 0..1: <0.5 left half, >0.5 right half; outside 0..1 = beyond the frame edge).
Method: bpy_extras world_to_camera_view (pinhole projection of the model's own camera). Gate: banner within +-10 % of the width of
the centre; left room left, right room right. Lights are for the picture only, as in render_floor.py."""
import bpy, json, math, os, sys, fnmatch
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
floor = json.load(open(a[0])); man = json.load(open(a[1])); meta = json.load(open(a[2])); out = a[3]; pat = a[4]
left, right = (a[5], a[6]) if len(a) > 6 else (None, None); samples = int(a[7]) if len(a) > 7 else 24
def module_xy(m, p):
    x, y = p; o = m.get('offset', [0, 0, 0]); rot = m.get('rot_z_deg', 0)
    if rot:
        px, py = m.get('pivot', [0, 0]); t = math.radians(rot); dx, dy = x - px, y - py
        x, y = px + dx * math.cos(t) - dy * math.sin(t), py + dx * math.sin(t) + dy * math.cos(t)
    return [x + o[0], y + o[1]]
rooms = {r['id']: r for r in floor['rooms']}
for m in man['modules']:
    if m['id'] in rooms: rooms[m['id']] = dict(rooms[m['id']], footprint=[module_xy(m, p) for p in rooms[m['id']]['footprint']])
def centre(r):
    xs = [p[0] for p in r['footprint']]; ys = [p[1] for p in r['footprint']]; return ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2)
sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = samples; sc.cycles.use_denoising = True; sc.cycles.device = 'CPU'
sc.view_settings.view_transform = 'AgX'
w = bpy.data.worlds.new('w'); w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.4; sc.world = w
for r in rooms.values():
    xs = [p[0] for p in r['footprint']]; ys = [p[1] for p in r['footprint']]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    nx, ny = max(1, round((x1 - x0) / 4)), max(1, round((y1 - y0) / 4))
    for i in range(nx):
        for j in range(ny):
            L = bpy.data.lights.new('l', 'AREA'); L.size = 2.5; L.energy = 260
            o = bpy.data.objects.new('l', L); o.location = (x0 + (i + .5) * (x1 - x0) / nx, y0 + (j + .5) * (y1 - y0) / ny, r.get('ceiling_h', 3.0) - 0.2)
            o.visible_camera = False; sc.collection.objects.link(o)
cd = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam); sc.camera = cam
cd.sensor_fit = 'HORIZONTAL'; cd.sensor_width = 36.0; cd.angle_x = math.radians(70); cd.clip_start = 0.05
sx, sy = meta['spawn_xy']; cam.location = (sx, sy, 1.6); cam.rotation_euler = (math.radians(90), 0, 0)   # yaw 0 = +y
sc.render.resolution_x, sc.render.resolution_y = 1400, 900
bpy.context.view_layer.update()
for o in bpy.data.objects:
    if o.type == 'MESH' and any(k in o.name for k in (':beam', ':tray', ':hanger', ':spot', ':ac_', ':soffit', ':cable', ':track')): o.hide_render = True
ban = [o for o in bpy.data.objects if o.type == 'MESH' and fnmatch.fnmatch(o.name.split('.')[0] if ':' in o.name else o.name, pat)]
pts = [o.matrix_world @ v.co for o in ban for v in o.data.vertices]
if pts:
    c = Vector((sum(p.x for p in pts) / len(pts), sum(p.y for p in pts) / len(pts), sum(p.z for p in pts) / len(pts)))
    ndc = world_to_camera_view(sc, cam, c); print('VIEW banner', [o.name for o in ban][:3], 'centre_xy=(%.2f,%.2f)' % (c.x, c.y), 'ndc_x=%.3f' % ndc.x, 'offset_of_width=%+.1f%%' % ((ndc.x - 0.5) * 100))
for k, rid in (('left', left), ('right', right)):
    if rid:
        cx, cy = centre(rooms[rid]); ndc = world_to_camera_view(sc, cam, Vector((cx, cy, 1.6)))
        print('VIEW', k, rid, 'centre=(%.1f,%.1f)' % (cx, cy), 'ndc_x=%.3f' % ndc.x, 'half=' + ('LEFT' if ndc.x < 0.5 else 'RIGHT'))
sc.render.image_settings.file_format = 'PNG'; sc.render.filepath = out; bpy.ops.render.render(write_still=True); print('VIEW_RENDERED', out)
