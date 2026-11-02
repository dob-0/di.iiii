#!/usr/bin/env python3
"""render_same_pose.py - render a Blender/glTF model from a frame's pose with the same focal length and image size.
  blender -b --factory-startup --python render_same_pose.py -- <model.glb|.blend> <pose.json> <out.png> [--hide wall_x,...] [--cut-ceiling]
Workbench engine (textures, flat light, no AA surprises); camera: OpenCV T_wc -> Blender camera (flip y and z). Blender glTF import converts Y-up to Z-up itself, so floor.glb (floor.json frame, z up) lands in
the world frame with no extra rotation."""
import sys, json, math, bpy
from mathutils import Matrix
a = sys.argv[sys.argv.index('--') + 1:]; model, posef, out = a[0], a[1], a[2]
PL = json.load(open(posef)); PL = PL if isinstance(PL, list) else [dict(PL, out=out)]   # list of poses = batch (model loaded once)
if model.endswith('.blend'): bpy.ops.wm.open_mainfile(filepath=model)
else:
    bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=model)
if '--hide' in a:
    for nm in a[a.index('--hide') + 1].split(','):
        for o in bpy.data.objects:
            if o.name.startswith(nm): o.hide_render = True
if '--cut-ceiling' in a:
    for o in bpy.data.objects:
        if 'ceil' in o.name.lower() or 'roof' in o.name.lower(): o.hide_render = True
sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'
sh = sc.display.shading; sh.light = 'FLAT'; sh.color_type = 'TEXTURE'
sc.render.film_transparent = True
cam = bpy.data.cameras.new('c'); cam.sensor_fit = 'HORIZONTAL'; cam.sensor_width = 36.0
cam.clip_start = 0.05; cam.clip_end = 200
co = bpy.data.objects.new('c', cam); sc.collection.objects.link(co); sc.camera = co
flip = Matrix(((1, 0, 0, 0), (0, -1, 0, 0), (0, 0, -1, 0), (0, 0, 0, 1)))
sc.render.image_settings.file_format = 'PNG'
for P in PL:
    # pose json: T_wc = camera(OpenCV: x right, y down, z fwd) -> world (z up); Blender camera looks down -Z with +Y up = flip y,z. FOV from f (px at width w).
    sc.render.resolution_x, sc.render.resolution_y = P['w'], P['h']; cam.lens = P['f'] / P['w'] * 36.0
    co.matrix_world = Matrix(P['T_wc']) @ flip
    sc.render.filepath = P['out']; bpy.ops.render.render(write_still=True); print('RENDERED', P['out'])
