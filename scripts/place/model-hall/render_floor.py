"""render_floor.py - the gate pictures for an assembled floor: floor_top.png (ortho, ceilings hidden) and one
eye-level view through every connection (eye_<opening id>.png, camera 1.55 m high, 2.6 m before the opening
plane, looking through it). Lights are for checking only (area lights under each room's ceiling), never exported.
Run: blender -b <out>/floor.blend --python render_floor.py -- <floor.json> <floor_assembly.json> <floor_corrections.json|-> <renders_dir> [samples]
Env FLOOR_GPU=1 renders on the GPU (default CPU: the GPU is often busy with other jobs)."""
import bpy, json, math, os, sys


def module_xy(m, p):
    """a module's own plan point -> floor frame: turn about the pivot (rot_z_deg, unset = none), then the offset."""
    x, y = p; o = m.get('offset', [0, 0, 0]); rot = m.get('rot_z_deg', 0)
    if rot:
        px, py = m.get('pivot', [0, 0]); a = math.radians(rot); dx, dy = x - px, y - py
        x, y = px + dx * math.cos(a) - dy * math.sin(a), py + dx * math.sin(a) + dy * math.cos(a)
    return [x + o[0], y + o[1]]
argv = sys.argv[sys.argv.index('--') + 1:]
floor = json.load(open(argv[0])); man = json.load(open(argv[1]))
corr = json.load(open(argv[2])) if argv[2] != '-' else {'corrections': []}
OUT = argv[3]; samples = int(argv[4]) if len(argv) > 4 else 32
os.makedirs(OUT, exist_ok=True)
rooms = {r['id']: dict(r) for r in floor['rooms']}
for m in man['modules']:
    o = m.get('offset', [0, 0, 0])
    if m['id'] in rooms and (o[0] or o[1] or m.get('rot_z_deg')):
        rooms[m['id']]['footprint'] = [module_xy(m, p) for p in rooms[m['id']]['footprint']]
ops = {o['id']: dict(o) for o in floor['openings'] if o.get('to_room') in rooms}
eyes = {}
for c in corr['corrections']:
    if c.get('set') and c['opening'] in ops: ops[c['opening']].update(c['set'])
    if c.get('eye'): eyes[c['opening']] = c['eye']      # a prop stands in front of the opening: look from the side
sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.samples = samples; sc.cycles.use_denoising = True
sc.cycles.device = 'CPU'
if os.environ.get('FLOOR_GPU'):
    try:
        pr = bpy.context.preferences.addons['cycles'].preferences; pr.compute_device_type = 'OPTIX'; pr.get_devices()
        for d in pr.devices: d.use = d.type == 'OPTIX'
        sc.cycles.device = 'GPU'
    except Exception as e: print('cpu', e)
sc.view_settings.view_transform = 'AgX'
w = bpy.data.worlds.new('w'); w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.4; sc.world = w
lights = bpy.data.collections.new('check_lights'); sc.collection.children.link(lights)
for r in rooms.values():
    xs = [p[0] for p in r['footprint']]; ys = [p[1] for p in r['footprint']]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys); zc = r.get('ceiling_h', 3.0) - 0.2
    nx, ny = max(1, round((x1 - x0) / 4)), max(1, round((y1 - y0) / 4))
    for i in range(nx):
        for j in range(ny):
            L = bpy.data.lights.new('l', 'AREA'); L.size = 2.5; L.energy = 260
            o = bpy.data.objects.new('l', L); o.location = (x0 + (i + .5) * (x1 - x0) / nx, y0 + (j + .5) * (y1 - y0) / ny, zc)
            o.visible_camera = False; lights.objects.link(o)
cd = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam); sc.camera = cam


def shoot(name, wpx, hpx):
    sc.render.resolution_x, sc.render.resolution_y = wpx, hpx
    sc.render.filepath = os.path.join(OUT, name + '.png'); bpy.ops.render.render(write_still=True)


def centre(r):
    xs = [p[0] for p in r['footprint']]; ys = [p[1] for p in r['footprint']]
    return ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2)


cd.type = 'PERSP'; cd.sensor_fit = 'HORIZONTAL'; cd.sensor_width = 36.0; cd.lens = 22.0; cd.clip_start = 0.05
for oid, op in ([] if os.environ.get('TOP_ONLY') else ops.items()):
    cx, cy = op['centre']; a, b = centre(rooms[op['from_room']]), centre(rooms[op['to_room']])
    if op['axis'] == 'x': d = (0, 1 if b[1] > a[1] else -1)
    else: d = (1 if b[0] > a[0] else -1, 0)
    cam.location = (cx - d[0] * 2.6, cy - d[1] * 2.6, 1.55)
    lx, ly = cx + d[0], cy + d[1]
    if oid in eyes: cam.location = (*eyes[oid]['pos'], 1.55); lx, ly = eyes[oid]['look']
    yaw = math.atan2(ly - cam.location[1], lx - cam.location[0]) - math.pi / 2   # X-rotation 90 deg looks along +Y; yaw 0 = +Y
    cam.rotation_euler = (math.radians(90), 0, yaw)
    shoot('eye_' + oid, 960, 600)
for o in bpy.data.objects:
    if o.type == 'MESH' and any(k in o.name for k in (':ceiling', ':beam', ':tray', ':hanger', ':spot', ':ac_', ':soffit', ':cable', ':track')):
        o.hide_render = True
for o in lights.objects: o.location.z = 2.6
cd.type = 'ORTHO'; cd.sensor_fit = 'VERTICAL'
_xs = [p[0] for r in rooms.values() for p in r['footprint']]; _ys = [p[1] for r in rooms.values() for p in r['footprint']]
cd.ortho_scale = max(max(_ys) - min(_ys), (max(_xs) - min(_xs)) * 1.333) * 1.08         # r7: frame the whole floor, whatever the layout
cam.location = ((min(_xs) + max(_xs)) / 2, (min(_ys) + max(_ys)) / 2, 30); cam.rotation_euler = (0, 0, 0)
shoot('floor_top', 900, 1200)
print('RENDERED', OUT)
