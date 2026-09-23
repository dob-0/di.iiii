"""Build a fake hall so the pipeline can be tested with no footage at all.

Meshroom hands us a textured OBJ in arbitrary units, tilted however the camera
happened to be held, sitting nowhere near the origin, and far heavier than any
browser wants. This makes exactly that, out of nothing:

  * a room 8 x 6 m and 3 m high, with a doorway 2.1 m tall
  * a column, a table and a low stage, so the room reads as a place
  * a colour-grid texture and real UVs, so the crush step has a texture to chew
  * subdivided and displaced to ~400k triangles, so the crush step has to work
  * then tilted 11 deg, spun 23 deg, scaled to 0.37 of life size and pushed off
    the origin — the exact mess `fit.mjs` exists to undo

Usage:
    blender -b -P scripts/place/testroom.py -- /path/to/out/testroom.obj

Written for Blender 4.x / 5.x (bpy.ops.wm.obj_export).
"""
import math
import os
import sys

import bpy

DOOR_WIDTH = 1.1
DOOR_HEIGHT = 2.1          # the real measurement fit.mjs --door-guess assumes
ROOM_W = 8.0               # along x
ROOM_D = 6.0               # along z
ROOM_H = 3.0
WALL = 0.15

# The mess applied at the end, so a test can check fit.mjs undoes it.
TILT_X = math.radians(11.0)
SPIN_Y = math.radians(23.0)
TILT_Z = math.radians(-4.0)
UNIT_SCALE = 0.37
OFFSET = (3.4, -1.9, 2.2)


def out_path():
    argv = sys.argv
    if '--' in argv:
        rest = argv[argv.index('--') + 1:]
        if rest:
            return os.path.abspath(rest[0])
    return os.path.abspath('testroom.obj')


def box(name, size, location):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (size[0], size[1], size[2])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj


def build_room():
    # Blender is z-up while glTF is y-up; the exporter converts, so build in
    # Blender's own frame: x across, y depth, z height.
    parts = [
        box('floor', (ROOM_W, ROOM_D, WALL), (0, 0, -WALL / 2)),
        box('ceiling', (ROOM_W, ROOM_D, WALL), (0, 0, ROOM_H + WALL / 2)),
        box('wall-left', (WALL, ROOM_D, ROOM_H), (-ROOM_W / 2, 0, ROOM_H / 2)),
        box('wall-right', (WALL, ROOM_D, ROOM_H), (ROOM_W / 2, 0, ROOM_H / 2)),
        box('wall-back', (ROOM_W, WALL, ROOM_H), (0, -ROOM_D / 2, ROOM_H / 2)),
    ]
    # Front wall, in three pieces, so there is a real doorway to measure.
    side = (ROOM_W - DOOR_WIDTH) / 2
    parts += [
        box('wall-front-a', (side, WALL, ROOM_H),
            (-(DOOR_WIDTH / 2 + side / 2), ROOM_D / 2, ROOM_H / 2)),
        box('wall-front-b', (side, WALL, ROOM_H),
            ((DOOR_WIDTH / 2 + side / 2), ROOM_D / 2, ROOM_H / 2)),
        box('lintel', (DOOR_WIDTH, WALL, ROOM_H - DOOR_HEIGHT),
            (0, ROOM_D / 2, DOOR_HEIGHT + (ROOM_H - DOOR_HEIGHT) / 2)),
    ]
    # Things in the room, so it is a place and not a shoebox.
    parts.append(box('stage', (3.0, 1.6, 0.4), (-2.0, -2.0, 0.2)))
    parts.append(box('table', (1.2, 0.8, 0.75), (2.2, 1.0, 0.375)))
    bpy.ops.mesh.primitive_cylinder_add(radius=0.28, depth=ROOM_H,
                                        location=(1.0, -1.2, ROOM_H / 2))
    column = bpy.context.active_object
    column.name = 'column'
    parts.append(column)
    return parts


def join(parts):
    bpy.ops.object.select_all(action='DESELECT')
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    room = bpy.context.active_object
    room.name = 'hall'
    return room


def texture(room):
    image = bpy.data.images.new('hall_texture', 1024, 1024)
    image.generated_type = 'COLOR_GRID'
    material = bpy.data.materials.new('hall')
    material.use_nodes = True
    nodes = material.node_tree.nodes
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = image
    bsdf = nodes.get('Principled BSDF')
    material.node_tree.links.new(bsdf.inputs['Base Color'], tex.outputs['Color'])
    room.data.materials.append(material)
    return image


def thicken(room, cuts=40):
    """Subdivide and rough up the surface until it weighs like a scan."""
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.15)
    bpy.ops.mesh.subdivide(number_cuts=cuts)
    bpy.ops.object.mode_set(mode='OBJECT')
    noise = bpy.data.textures.new('scan_noise', type='CLOUDS')
    noise.noise_scale = 0.35
    displace = room.modifiers.new('rough', type='DISPLACE')
    displace.texture = noise
    displace.strength = 0.035
    bpy.ops.object.modifier_apply(modifier=displace.name)


def misplace(room):
    """Put the room where a reconstruction would have left it."""
    room.rotation_euler = (TILT_X, SPIN_Y, TILT_Z)
    room.scale = (UNIT_SCALE, UNIT_SCALE, UNIT_SCALE)
    room.location = OFFSET
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def main():
    target = out_path()
    os.makedirs(os.path.dirname(target), exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    room = join(build_room())
    image = texture(room)
    thicken(room)
    misplace(room)

    image.filepath_raw = os.path.join(os.path.dirname(target), 'hall_texture.png')
    image.file_format = 'PNG'
    image.save()

    bpy.ops.object.select_all(action='DESELECT')
    room.select_set(True)
    bpy.ops.wm.obj_export(filepath=target, export_selected_objects=True,
                          export_materials=True, export_uv=True,
                          export_normals=True, path_mode='COPY')
    tris = sum(len(polygon.vertices) - 2 for polygon in room.data.polygons)
    print(f'[testroom] wrote {target} — {len(room.data.polygons)} faces, ~{tris} triangles')


if __name__ == '__main__':
    main()
