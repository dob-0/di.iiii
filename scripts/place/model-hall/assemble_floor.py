"""assemble_floor.py - the rooms of a floor, each built by hand in the shared floor frame, into ONE scene.

Run: blender -b --factory-startup --python assemble_floor.py -- <floor_assembly.json> <out_dir>
Reads (all from the place's data folder, nothing place-specific lives here):
  floor_assembly.json   {"root": ".", "modules": [{"id", "glb", "offset":[x,y,z], "drop":[glob..],
                         "clip":{glob:{"xmin","xmax","ymin","ymax","zmin","zmax"}}, "exempt_below_floor":[glob..]}]}
Writes <out_dir>/floor.glb, floor.blend and assembly_report.json (what was dropped / clipped / moved, per module).
Why drop/clip: two neighbouring modules each build the wall they share (a wall with its opening). Both would draw
the same slab (z-fighting) and the modules' floors would overlap. The manifest names which duplicate is dropped or
trimmed, so the result is reproducible and every decision is on file. Axis-aligned boxes are trimmed by clamping
vertices to the given bound; a trimmed object is never moved.
Objects are renamed <module id>:<name>, so check_floor.py and the viewer can tell the modules apart.
Undo: delete <out_dir>/floor.*"""
import bpy, json, os, re, sys, fnmatch
argv = sys.argv[sys.argv.index('--') + 1:]
man = json.load(open(argv[0])); OUT = argv[1]
base = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(argv[0])), man.get('root', '.')))
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
report = {}


def bare(n):
    return re.sub(r'\.\d+$', '', n)


def match(n, pats):
    return any(fnmatch.fnmatch(bare(n), p) for p in pats)


for m in man['modules']:
    mid = m['id']
    before = set(bpy.data.objects.keys())
    bpy.ops.import_scene.gltf(filepath=os.path.join(base, m['glb']))
    new = [bpy.data.objects[k] for k in bpy.data.objects.keys() if k not in before]
    col = bpy.data.collections.new(mid); scene.collection.children.link(col)
    off = m.get('offset', [0, 0, 0]); rep = {'dropped': [], 'clipped': [], 'offset': off, 'objects': 0}
    # glTF import adds empty parents (a root node); bake the world matrix into the meshes and remove the empties
    meshes = [o for o in new if o.type == 'MESH']
    for o in meshes:
        wm = o.matrix_world.copy()
        o.parent = None; o.matrix_world = wm
        o.data = o.data.copy()          # single-user: a clip must not touch a twin
    for o in new:
        if o.type != 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)
    for o in meshes:
        if match(o.name, m.get('drop', [])):
            rep['dropped'].append(bare(o.name)); bpy.data.objects.remove(o, do_unlink=True); continue
        for pat, b in m.get('clip', {}).items():
            if fnmatch.fnmatch(bare(o.name), pat):
                for v in o.data.vertices:
                    p = o.matrix_world @ v.co
                    for ax, k in enumerate('xyz'):
                        lo, hi = b.get(k + 'min'), b.get(k + 'max')
                        if lo is not None and p[ax] < lo: p[ax] = lo
                        if hi is not None and p[ax] > hi: p[ax] = hi
                    v.co = o.matrix_world.inverted() @ p
                o.data.update(); rep['clipped'].append(bare(o.name))
        o.location = (o.location[0] + off[0], o.location[1] + off[1], o.location[2] + off[2])
        o.name = f'{mid}:{bare(o.name)}' if f'{mid}:{bare(o.name)}' not in bpy.data.objects else f'{mid}:{o.name}'
        for c in list(o.users_collection): c.objects.unlink(o)
        col.objects.link(o); rep['objects'] += 1
    report[mid] = rep
    print('MODULE', mid, rep['objects'], 'objects', len(rep['dropped']), 'dropped', len(rep['clipped']), 'clipped')
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'floor.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'floor.glb'), export_format='GLB', export_lights=False,
                          export_cameras=False, export_apply=True)
json.dump(report, open(os.path.join(OUT, 'assembly_report.json'), 'w'), indent=1)
print('ASSEMBLED', sum(r['objects'] for r in report.values()), 'meshes in', len(report), 'modules')
