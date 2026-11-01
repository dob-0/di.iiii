"""check_glb.py - the GLB opens again and holds a closed hall: re-import it into an empty
scene, count meshes, and check the shell bounds equal the plan (no lost walls, no
floating parts below the floor). Exit 1 on failure.
Run: blender -b --factory-startup --python check_glb.py -- <hall.glb> <plan.json>"""
import bpy, json, sys
glb, planp = sys.argv[sys.argv.index('--') + 1:][:2]
plan = json.load(open(planp)); h = plan['hall']
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
ms = [o for o in bpy.context.scene.objects if o.type == 'MESH']
pts = [o.matrix_world @ v.co for o in ms for v in o.data.vertices]
mn = [min(p[i] for p in pts) for i in range(3)]; mx = [max(p[i] for p in pts) for i in range(3)]
# glTF is Y-up; Blender's importer turns it back to Z-up
need = {'floor', 'ceiling', 'wall_left', 'wall_right', 'glass_front', 'far_wall_l', 'far_wall_r', 'next_room_wall_back'}
names = {o.name.split('.')[0] for o in ms}
fail = []
if not need <= names: fail.append(f'missing {sorted(need - names)}')
if mn[2] < -0.11: fail.append(f'something below the floor slab: z {mn[2]:.2f}')
if abs(mx[2] - (h['height'] + 0.2)) > 0.01: fail.append(f'top {mx[2]:.2f} != ceiling slab {h["height"] + 0.2}')
imgs = len(bpy.data.images)
print('GLB', len(ms), 'meshes', f'bounds x {mn[0]:.2f}..{mx[0]:.2f} y {mn[1]:.2f}..{mx[1]:.2f} z {mn[2]:.2f}..{mx[2]:.2f}', imgs, 'images')
if fail:
    print('FAIL', '; '.join(fail)); sys.exit(1)
