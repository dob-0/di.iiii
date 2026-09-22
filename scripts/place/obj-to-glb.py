"""OBJ (+ .mtl + textures) → GLB, with Blender doing the reading.

Meshroom hands back an OBJ; the browser wants a GLB. gltf-transform, which
does the crushing, only speaks glTF — so something has to make the crossing,
and Blender already reads OBJ, its material file and its textures correctly,
including the texture paths that trip up every lighter converter.

The axis round-trip is a no-op on purpose: Blender's OBJ import treats the
file as Y-up and converts to its own Z-up, and the glTF export converts back.
Nothing is straightened here — that is fit.mjs's job, and it needs the mesh
exactly as the reconstruction left it.

Usage:
    blender -b -P scripts/place/obj-to-glb.py -- in.obj out.glb
"""
import os
import sys

import bpy


def paths():
    argv = sys.argv
    rest = argv[argv.index('--') + 1:] if '--' in argv else []
    if len(rest) < 2:
        raise SystemExit('usage: blender -b -P obj-to-glb.py -- in.obj out.glb')
    return os.path.abspath(rest[0]), os.path.abspath(rest[1])


def main():
    source, target = paths()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    lower = source.lower()
    if lower.endswith('.obj'):
        bpy.ops.wm.obj_import(filepath=source)
    elif lower.endswith('.ply'):
        bpy.ops.wm.ply_import(filepath=source)
    elif lower.endswith('.stl'):
        bpy.ops.wm.stl_import(filepath=source)
    else:
        raise SystemExit(f'obj-to-glb.py does not read {os.path.splitext(source)[1]}')

    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    if not meshes:
        raise SystemExit('nothing came in — the file holds no mesh')
    faces = sum(len(obj.data.polygons) for obj in meshes)
    tris = sum(sum(len(p.vertices) - 2 for p in obj.data.polygons) for obj in meshes)

    os.makedirs(os.path.dirname(target), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=target,
        export_format='GLB',
        export_materials='EXPORT',
        export_texcoords=True,
        export_normals=True,
        export_yup=True,
        export_apply=True,
    )
    print(f'[obj-to-glb] {len(meshes)} objects · {faces} faces · ~{tris} triangles → {target}')


if __name__ == '__main__':
    main()
