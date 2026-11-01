"""render_views.py - the quality gate pictures for a modelled hall.

Run:  blender -b <out>/hall.blend --python render_views.py -- <plan.json> <renders_dir> [samples]
Writes plan_top.png (orthographic, ceiling hidden) and one eye-level render per
plan `views` entry, with the camera model of the source phone (f in px on the long
side), so each can be laid next to its frame (compare.sh).
"""
import bpy, json, math, os, sys
argv = sys.argv[sys.argv.index('--') + 1:]
plan = json.load(open(argv[0])); OUT = argv[1]; samples = int(argv[2]) if len(argv) > 2 else 96
os.makedirs(OUT, exist_ok=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.samples = samples; sc.cycles.use_denoising = True
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for kind in ('OPTIX', 'CUDA'):
        try:
            prefs.compute_device_type = kind; prefs.get_devices()
            if any(d.type == kind for d in prefs.devices):
                for d in prefs.devices: d.use = d.type == kind
                sc.cycles.device = 'GPU'; print('device', kind); break
        except TypeError:
            pass
except Exception as e:
    print('cpu render', e)
sc.view_settings.view_transform = 'AgX'; sc.view_settings.exposure = plan.get('render', {}).get('exposure', 0.0)
cm = plan['camera_model']
cd = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam); sc.camera = cam


def shoot(name, w, h):
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.filepath = os.path.join(OUT, name + '.png'); bpy.ops.render.render(write_still=True)


h = plan['hall']
for v in plan['views']:
    cd.type = 'PERSP'; cd.sensor_fit = 'VERTICAL'; cd.sensor_height = 36.0
    cd.lens = cm['f_px'] / cm['h'] * 36.0
    cam.location = v['pos']
    cam.rotation_euler = (math.radians(90 + v['pitch_deg']), 0, math.radians(v['yaw_deg']))
    shoot(v['name'], 540, 960)
# top-down plan: ceiling collection off
for c in bpy.data.collections:
    if c.name == 'ceiling': c.hide_render = True
for o in bpy.data.objects:
    if o.name.startswith('beam_') or o.name.startswith('front_head'): o.hide_render = True
cd.type = 'ORTHO'; r = plan['far_end']['room']
span_y = h['length'] + r['depth'] + 1.5; cx = (r['x0'] + r['x1']) / 2
cd.ortho_scale = span_y + 1.0; cd.sensor_fit = 'AUTO'
cam.location = (cx, span_y / 2 - 0.5, 20); cam.rotation_euler = (0, 0, 0)
sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
shoot('plan_top', 600, 1500)
print('RENDERED', OUT)
