"""Aren's yard as a Blender scene, for fixing the walls by hand (owner 2026-10-23: "can i manually fix the walls?").

Writes what Բակը · The yard shows, each piece where yard.html puts it: the yard's own parts main and wall_mid (identity)
and the wall fragment at IN_YARD.wall, each as OBJ + MTL + its photo, then builds yard-fix.blend with Blender (Y-up scan ->
Blender Z-up by the OBJ importer's axes). Moving a piece in Blender changes its object transform; reading that back into
IN_YARD is from_blender.py's job (owed).
  python3 spaces/dilijan/aren/to_blender.py --api http://dilijan-front.diiii.localhost/serverXR --out DIR [--blend]
"""
import argparse, os, re, json, subprocess, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import texfit as tf

HERE = os.path.dirname(os.path.abspath(__file__))


def write_obj(out, name, P, UV, I, tex, R=None, t=None):
    if R is not None: P = P @ np.asarray(R).T + t
    Image.fromarray(np.clip(tex, 0, 255).astype(np.uint8)).save(os.path.join(out, f'{name}.png'))
    with open(os.path.join(out, f'{name}.mtl'), 'w') as m:
        m.write(f'newmtl {name}\nKd 1 1 1\nillum 0\nmap_Kd {name}.png\n')
    with open(os.path.join(out, f'{name}.obj'), 'w') as f:
        f.write(f'mtllib {name}.mtl\no {name}\n')
        f.writelines(f'v {x:.5f} {y:.5f} {z:.5f}\n' for x, y, z in P)
        f.writelines(f'vt {u:.6f} {v:.6f}\n' for u, v in UV)
        f.write(f'usemtl {name}\n')
        f.writelines(f'f {a}/{a} {b}/{b} {c}/{c}\n' for a, b, c in (I + 1))
    return len(P), len(I)


BLEND = r'''
import bpy, sys, os
out = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
for n in ('main', 'wall_mid', 'wall'):
    bpy.ops.wm.obj_import(filepath=os.path.join(out, n + '.obj'), forward_axis='NEGATIVE_Z', up_axis='Y')
for o in bpy.context.scene.objects:
    o.name = o.name.split('.')[0]
    bpy.context.view_layer.objects.active = o; o.select_set(True)
    bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS'); o.select_set(False)
    o['before'] = [list(r) for r in o.matrix_world]   # the pose as exported; from_blender.py reads the change against it
bpy.context.scene.unit_settings.system = 'METRIC'
for a in bpy.data.screens['Layout'].areas if 'Layout' in bpy.data.screens else []:
    if a.type == 'VIEW_3D': a.spaces[0].shading.type = 'MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, 'yard-fix.blend'))
print('saved', os.path.join(out, 'yard-fix.blend'))
'''


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--api'); ap.add_argument('--blobs'); ap.add_argument('--out', required=True)
    ap.add_argument('--page', default=os.path.join(HERE, 'yard.html')); ap.add_argument('--blend', action='store_true')
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
    _, yard, pack = tf.load(tf.fetcher(a.api, a.blobs)); poses = tf.page_poses(open(a.page).read())
    for n in ('main', 'wall_mid'):
        y = yard[n]; print(n, write_obj(a.out, n, y['P'], y['UV'], y['I'], y['tex']))
    R, t = poses['wall']; w = pack['wall']
    print('wall', write_obj(a.out, 'wall', w['P'], w['UV'], w['I'], w['tex'], R, t))
    json.dump({'from': 'yard.html IN_YARD', 'wall': {'R': np.asarray(R).tolist(), 't': np.asarray(t).tolist()}},
              open(os.path.join(a.out, 'poses-before.json'), 'w'), indent=1)
    if a.blend:
        s = os.path.join(a.out, '_blend.py'); open(s, 'w').write(BLEND)
        subprocess.run(['blender', '--background', '--factory-startup', '--python', s, '--', a.out], check=True)


if __name__ == '__main__':
    main()
