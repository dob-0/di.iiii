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
import bpy, json, os, re, sys, fnmatch, tempfile
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

def grain_flat_faces(min_area=1.0):
    """Round 5: a painted wall, ceiling or slab larger than 1 m2 with ONE flat colour reads as a grey slab on screen.
    Give its material a fine plaster grain (a tileable 256 px noise, +-4 % brightness, 1 tile = 1 m, box-projected UVs).
    The colour stays the modeller's; the grain is a stand-in for real paint/plaster texture (ESTIMATED, not photographed)."""
    import numpy as np, bmesh
    rng = np.random.default_rng(7); N = 256
    g = rng.normal(0, 1, (N, N))
    for _ in range(2):                                   # light blur, wrap-around so it tiles
        g = (g + np.roll(g, 1, 0) + np.roll(g, -1, 0) + np.roll(g, 1, 1) + np.roll(g, -1, 1)) / 5
    g = g / g.std()
    cache = {}; done = 0
    for o in [o for o in bpy.data.objects if o.type == 'MESH']:
        need = set()
        for p in o.data.polygons:
            if p.area > min_area and p.material_index < len(o.material_slots):
                mt = o.material_slots[p.material_index].material
                if mt and 'glass' not in mt.name.lower() and not (mt.use_nodes and any(n.type == 'TEX_IMAGE' and n.image for n in mt.node_tree.nodes)):
                    need.add(p.material_index)
        if not need: continue
        bm = bmesh.new(); bm.from_mesh(o.data)
        uvl = bm.loops.layers.uv.active or bm.loops.layers.uv.new('UVMap')
        for f in bm.faces:
            if f.material_index in need:
                ax = max(range(3), key=lambda k: abs(f.normal[k])); a, b_ = [k for k in range(3) if k != ax]
                for lp in f.loops:
                    w = o.matrix_world @ lp.vert.co
                    lp[uvl].uv = (w[a], w[b_])
        bm.to_mesh(o.data); bm.free()
        for i in need:
            mt = o.material_slots[i].material
            if mt.name not in cache:
                nm = mt.copy(); nm.name = mt.name + '+grain'
                bsdf = next(n for n in nm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
                col = list(bsdf.inputs['Base Color'].default_value)[:3]
                srgb = np.clip(np.array(col), 0, 1) ** (1 / 2.2)
                px = np.ones((N, N, 4), dtype=np.float32)
                for c in range(3): px[:, :, c] = np.clip(srgb[c] * (1 + 0.04 * g), 0, 1)
                img = bpy.data.images.new(mt.name + '_grain', N, N); img.pixels.foreach_set(px.ravel())
                img.pack(); img.file_format = 'JPEG'
                tx = nm.node_tree.nodes.new('ShaderNodeTexImage'); tx.image = img
                nm.node_tree.links.new(tx.outputs['Color'], bsdf.inputs['Base Color'])
                cache[mt.name] = nm
            o.material_slots[i].material = cache[mt.name]; done += 1
    print('GRAIN', done, 'object slots,', len(cache), 'materials')


def compress_images(max_side=2048):
    """Cap texture size and store opaque textures as JPEG (the exporter keeps each image's own format)."""
    import numpy as np
    n = 0
    for im in bpy.data.images:
        if im.size[0] == 0 or im.type != 'IMAGE': continue
        if max(im.size) > max_side:
            k = max_side / max(im.size); im.scale(int(im.size[0] * k), int(im.size[1] * k))
        a = np.empty(im.size[0] * im.size[1] * 4, dtype=np.float32); im.pixels.foreach_get(a)
        if a[3::4].min() > 0.999 and im.users:
            # re-encode as a real JPEG file and swap it in (the exporter keeps a file's own format under 'AUTO')
            tmp = os.path.join(tempfile.mkdtemp(), re.sub(r'\W', '_', im.name) + '.jpg')
            st = scene.render.image_settings; st.file_format = 'JPEG'; st.quality = 85; st.color_mode = 'RGB'
            im.save_render(tmp, scene=scene)
            new = bpy.data.images.load(tmp); new.pack(); new.colorspace_settings.name = im.colorspace_settings.name
            old = im.name; im.user_remap(new); im.name = old + '.old'; new.name = old; n += 1
    print('IMAGES', n, 'stored as JPEG, max side', max_side)


grain_flat_faces()
compress_images()

bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'floor.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'floor.glb'), export_format='GLB', export_lights=False,
                          export_cameras=False, export_apply=True, export_image_format='AUTO', export_jpeg_quality=85)
json.dump(report, open(os.path.join(OUT, 'assembly_report.json'), 'w'), indent=1)
print('ASSEMBLED', sum(r['objects'] for r in report.values()), 'meshes in', len(report), 'modules')
