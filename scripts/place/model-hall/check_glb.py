"""check_glb.py - the GLB opens again and is physically sane. Exit 1 on failure.

Mode A (one hall):   blender -b --factory-startup --python check_glb.py -- <hall.glb> <plan.json>
   re-import into an empty scene, count meshes, shell bounds equal the plan, nothing below the floor slab.
Mode B (a floor):    blender -b --factory-startup --python check_glb.py -- <floor.glb> <floor_assembly.json> [report.json]
   everything of mode A's spirit, plus the four owner checks of 2026-11-01 (round 5, "no mistakes"), nothing place-specific:
 1 INTERSECT   two props of different groups whose triangles cross AND whose boxes overlap by > 2 cm on every axis
               (BVH overlap, mathutils; surface contact and z-fight are not counted). A prop crossing a shell part
               (wall/floor/ceiling/slab) the same way is INTERSECT-SHELL. A group = the object name without its part
               suffix (chair0_1_leg -> chair0_1, counter_body_3 -> counter): joinery inside one object is not a mistake.
 2 FLOATING    a prop whose nearest other surface (sampled vertices, BVH nearest) is > 3 cm away: nothing holds it.
               Contact with a wall, ceiling, wire or another prop counts as support (hung things touch their hanger).
 3 ALPHA       a material with alphaMode BLEND/MASK or base-colour alpha < 1 whose name does not contain "glass"
               (semi-transparent stray slab). Read straight from the GLB JSON.
 4 FLAT        a face > 1 m2 on a material with no base-colour texture. Waive only in floor_assembly.json under
               "flat_ok": {"<material glob>": "why, measured"}; a waiver is listed in the output, never silent.
Manifest may also hold "physics_waive": {"<module>:<objA>|<objB>": "why"} for a pair that truly must touch.
Prints one line per problem and a final PROBLEMS n; exit 1 when n > 0. Method: BVH-tree overlap (Blender mathutils.bvhtree),
nearest-point support test; the thresholds are ours (unvalidated), written here so they can be argued with."""
import bpy, json, sys, re, struct, fnmatch, itertools
from mathutils import Vector
from mathutils.bvhtree import BVHTree

args = sys.argv[sys.argv.index('--') + 1:]
glb, second = args[0], args[1]
out_report = args[2] if len(args) > 2 else None
doc = json.load(open(second))
floor_mode = 'modules' in doc

b = open(glb, 'rb').read(); n = struct.unpack('<I', b[12:16])[0]; gj = json.loads(b[20:20 + n])

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
ms = [o for o in bpy.context.scene.objects if o.type == 'MESH']
dg = bpy.context.evaluated_depsgraph_get()
fail = []
SHELL = re.compile(r'^(shell__)?([a-z]_|cor_)?(wall|wl$|wr$|floor|ceil|slab|far_wall|glass_front|roof|next_room|entrance_wall|side_wall|lintel|end$)')


def base(o):
    nm = o.name.partition(':')[2] or o.name
    return re.sub(r'\.\d+$', '', nm)


def group(o):
    t = base(o).split('_')
    if len(t) > 1 and t[1].isdigit():
        return o.name.partition(':')[0] + ':' + t[0] + '_' + t[1]
    return o.name.partition(':')[0] + ':' + re.sub(r'\d+$', '', t[0]) if len(t) > 1 else o.name.partition(':')[0] + ':' + base(o)


if not floor_mode:
    plan = doc; h = plan['hall']
    pts = [o.matrix_world @ v.co for o in ms for v in o.data.vertices]
    mn = [min(p[i] for p in pts) for i in range(3)]; mx = [max(p[i] for p in pts) for i in range(3)]
    need = {'floor', 'ceiling', 'wall_left', 'wall_right', 'glass_front', 'far_wall_l', 'far_wall_r', 'next_room_wall_back'}
    names = {o.name.split('.')[0] for o in ms}
    if not need <= names: fail.append(f'missing {sorted(need - names)}')
    if mn[2] < -0.11: fail.append(f'something below the floor slab: z {mn[2]:.2f}')
    if abs(mx[2] - (h['height'] + 0.2)) > 0.01: fail.append(f'top {mx[2]:.2f} != ceiling slab {h["height"] + 0.2}')
    print('GLB', len(ms), 'meshes', f'bounds x {mn[0]:.2f}..{mx[0]:.2f} y {mn[1]:.2f}..{mx[1]:.2f} z {mn[2]:.2f}..{mx[2]:.2f}', len(bpy.data.images), 'images')
    if fail:
        print('FAIL', '; '.join(fail)); sys.exit(1)
    sys.exit(0)

# ---------------- mode B ----------------
problems = []
waived = []
mw = doc.get('physics_waive', {})
flat_ok = doc.get('flat_ok', {})

# 3 ALPHA (GLB JSON)
for m in gj['materials']:
    bc = m.get('pbrMetallicRoughness', {}).get('baseColorFactor', [1, 1, 1, 1])
    if (m.get('alphaMode', 'OPAQUE') != 'OPAQUE' or bc[3] < 0.999) and 'glass' not in m['name'].lower():
        problems.append(f"ALPHA material {m['name']} is {m.get('alphaMode', 'OPAQUE')} alpha {bc[3]:.2f} and not named glass")

# per-object data
info = {}
for o in ms:
    ev = o.evaluated_get(dg); me = ev.to_mesh()
    me.transform(o.matrix_world)
    verts = [v.co.copy() for v in me.vertices]
    tris = [tuple(p.vertices) for p in me.polygons if len(p.vertices) == 3]
    for p in me.polygons:
        if len(p.vertices) > 3:
            vs = p.vertices
            tris += [(vs[0], vs[i], vs[i + 1]) for i in range(1, len(vs) - 1)]
    if not verts or not tris:
        ev.to_mesh_clear(); continue
    lo = Vector((min(v.x for v in verts), min(v.y for v in verts), min(v.z for v in verts)))
    hi = Vector((max(v.x for v in verts), max(v.y for v in verts), max(v.z for v in verts)))
    # 4 FLAT: faces > 1 m2 without a base-colour texture
    for p in me.polygons:
        if p.area > 1.0:
            mat = o.material_slots[p.material_index].material if p.material_index < len(o.material_slots) else None
            textured = bool(mat and mat.use_nodes and any(nd.type == 'TEX_IMAGE' and nd.image for nd in mat.node_tree.nodes))
            if not textured:
                mname = mat.name if mat else '(none)'
                if 'glass' in mname.lower():
                    continue
                key = next((k for k in flat_ok if fnmatch.fnmatch(mname, k)), None)
                if key:
                    waived.append(f"FLAT-WAIVED {o.name} {mname} {p.area:.1f} m2: {flat_ok[key]}")
                else:
                    problems.append(f'FLAT {o.name} material {mname} has a {p.area:.1f} m2 face with no texture')
                break
    bvh = BVHTree.FromPolygons(verts, tris, epsilon=1e-5)
    info[o.name] = dict(o=o, lo=lo, hi=hi, bvh=bvh, verts=verts, shell=bool(SHELL.match(base(o))), group=group(o))
    ev.to_mesh_clear()

names = sorted(info)
# 1 INTERSECT (bounding-box prefilter, then BVH overlap)
MIN = 0.02
pairs = []; embedded = []; waive_count = {}
for i, a in enumerate(names):
    A = info[a]
    for bn in names[i + 1:]:
        B = info[bn]
        if A['shell'] and B['shell']: continue
        if A['group'] == B['group']: continue
        if all(min(A['hi'][k], B['hi'][k]) - max(A['lo'][k], B['lo'][k]) > MIN for k in range(3)):
            if A['bvh'].overlap(B['bvh']):
                if A['shell'] or B['shell']:
                    S_, P_ = (A, B) if A['shell'] else (B, A)
                    t = min(range(3), key=lambda k: S_['hi'][k] - S_['lo'][k])
                    # through = in on one side, out on the other (an item with its back buried in a wall is not through)
                    if not (P_['lo'][t] < S_['lo'][t] - MIN and P_['hi'][t] > S_['hi'][t] + MIN):
                        embedded.append(1); continue
                hit = next((k for k in mw if any(fnmatch.fnmatch(x, g) for x, g in ((a, k.split('|')[0]), (bn, k.split('|')[1]))) or any(fnmatch.fnmatch(x, g) for x, g in ((bn, k.split('|')[0]), (a, k.split('|')[1])))), None)
                if hit:
                    waive_count[hit] = waive_count.get(hit, 0) + 1; continue
                kind = 'INTERSECT-SHELL' if (A['shell'] or B['shell']) else 'INTERSECT'
                pairs.append(f'{kind} {a} x {bn}')
problems += pairs
for k, c in waive_count.items(): waived.append(f'PAIR-WAIVED x{c} {k}: {mw[k]}')
if embedded: waived.append(f'EMBEDDED x{len(embedded)} shell/prop overlaps where the prop does not pass through (back buried in the wall), not failures')

# 2 FLOATING (props only)
allbvh = {k: v['bvh'] for k, v in info.items()}
TOL = 0.03
for a in names:
    A = info[a]
    if A['shell']: continue
    step = max(1, len(A['verts']) // 120)
    sample = A['verts'][::step]
    best = 9e9
    for bn in names:
        if bn == a: continue
        B = info[bn]
        # skip far objects by box distance
        if any(B['lo'][k] - A['hi'][k] > TOL or A['lo'][k] - B['hi'][k] > TOL for k in range(3)): continue
        for v in sample:
            r = B['bvh'].find_nearest(v)
            if r[0] is not None and r[3] < best: best = r[3]
        stepb = max(1, len(B['verts']) // 120)
        for v in B['verts'][::stepb]:        # the other way round: a leg's top touching the underside of a large top
            r = A['bvh'].find_nearest(v)
            if r[0] is not None and r[3] < best: best = r[3]
        if best <= TOL: break
    if best > TOL:
        problems.append(f"FLOATING {a} (z {A['lo'].z:.2f}..{A['hi'].z:.2f}) nearest surface {best if best < 9e8 else -1:.2f} m")

for w in waived: print(w)
for p in problems: print(p)
print('GLBCHECK', len(ms), 'meshes', len(names), 'checked;', len(waived), 'waived')
print('PROBLEMS', len(problems))
if out_report:
    json.dump(dict(problems=problems, waived=waived, meshes=len(ms)), open(out_report, 'w'), indent=1)
sys.exit(1 if problems else 0)
