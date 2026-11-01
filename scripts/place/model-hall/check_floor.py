"""check_floor.py - sense check of an assembled floor (floor.glb). Exit 1 on any FAIL.
Run: blender -b --factory-startup --python check_floor.py -- <floor.glb> <floor.json> <floor_assembly.json> [floor_corrections.json]
Tests (each can fail; numbers printed):
 1 modules      every module of the manifest is present with meshes
 2 below floor  nothing under z=-0.31 (slab thickness) except names the manifest exempts (e.g. a stair going down)
 3 floors       no two floors of different modules overlap in plan (area > 0.01 m2); WARN for other shell overlaps
 4 openings     per opening (floor.json + corrections): horizontal rays at 3 lateral offsets x 3 heights through the
                opening plane +-0.6 m must not hit a shell part (wall, head, lintel, ceiling...); a prop is a WARN
 5 walk surface per opening: downward rays every 0.25 m, 3 m either side on the centre line, must hit a floor within
                z -0.02..0.12 (no hole, no step); a prop on the line is a WARN
 6 sealed       from 5 points in each room at 1.5 m: 36 horizontal rays + up must hit something (no leak to the void)
Frame: glTF import returns Z-up; x,y as in floor.json."""
import bpy, json, math, sys, fnmatch, re
from mathutils import Vector
glb, floorp, manp = sys.argv[sys.argv.index('--') + 1:][:3]
corrp = sys.argv[sys.argv.index('--') + 4] if len(sys.argv) > sys.argv.index('--') + 4 else None
floor = json.load(open(floorp)); man = json.load(open(manp))
openings = {o['id']: dict(o) for o in floor['openings'] if o.get('to_room') in {r['id'] for r in floor['rooms']}}
if corrp:
    for c in json.load(open(corrp)).get('corrections', []):
        if c.get('set') and c['opening'] in openings: openings[c['opening']].update(c['set'])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
sc = bpy.context.scene; dg = bpy.context.evaluated_depsgraph_get()
ms = [o for o in sc.objects if o.type == 'MESH']
fails, warns = [], []


def bb(o):
    p = [o.matrix_world @ v.co for v in o.data.vertices]
    return [min(q[i] for q in p) for i in range(3)], [max(q[i] for q in p) for i in range(3)]


def parts(o):
    mod, _, nm = o.name.partition(':'); return mod, re.sub(r'\.\d+$', '', nm)


B = {o.name: bb(o) for o in ms}
mods = {m['id']: m for m in man['modules']}
# 1
for mid in mods:
    n = sum(1 for o in ms if parts(o)[0] == mid)
    if n == 0: fails.append(f'module {mid} has no meshes')
    print('MODULE', mid, n)
# 2
for o in ms:
    mid, nm = parts(o); mn = B[o.name][0]
    ex = any(fnmatch.fnmatch(nm, p) for p in mods.get(mid, {}).get('exempt_below_floor', []))
    if mn[2] < -0.31 and not ex: fails.append(f'{o.name} below the floor: z {mn[2]:.2f}')
below_ex = [o.name for o in ms if B[o.name][0][2] < -0.31]
print('BELOW', len(below_ex), 'objects under -0.31, all exempt' if not [f for f in fails if 'below' in f] else 'NOT all exempt')


def is_floor(nm): return nm == 'floor' or nm.endswith('_floor') or nm.startswith('floor')


def is_shell(nm): return bool(re.search(r'wall|^w_|_wall|head|lintel|ceiling|^floor|_floor|soffit|bulkhead|post_|frame_', nm))


# 3
fl = [o for o in ms if is_floor(parts(o)[1]) and 'carpet' not in o.name]
for i, a in enumerate(fl):
    for b in fl[i + 1:]:
        if parts(a)[0] == parts(b)[0]: continue
        (a0, a1), (b0, b1) = B[a.name], B[b.name]
        dx = min(a1[0], b1[0]) - max(a0[0], b0[0]); dy = min(a1[1], b1[1]) - max(a0[1], b0[1])
        if dx > 0.01 and dy > 0.01 and abs(a1[2] - b1[2]) < 0.2 and dx * dy > 0.01:
            fails.append(f'floors overlap {a.name} / {b.name}: {dx:.2f} x {dy:.2f} m')
sh = [o for o in ms if is_shell(parts(o)[1])]
ov = 0
for i, a in enumerate(sh):
    for b in sh[i + 1:]:
        if parts(a)[0] == parts(b)[0]: continue
        (a0, a1), (b0, b1) = B[a.name], B[b.name]
        d = [min(a1[k], b1[k]) - max(a0[k], b0[k]) for k in range(3)]
        if min(d) > 0.01 and d[0] * d[1] * d[2] > 0.2 and not (is_floor(parts(a)[1]) or is_floor(parts(b)[1]) or 'ceiling' in a.name or 'ceiling' in b.name):
            ov += 1
            if ov <= 12: warns.append(f'shell overlap {a.name} / {b.name}: {d[0]:.2f} x {d[1]:.2f} x {d[2]:.2f} m')
print('FLOORS', len(fl), 'floor slabs;', ov, 'shell overlaps between modules')
room_of = {r['id']: r for r in floor['rooms']}
for m_ in man['modules']:      # a module moved by the assembly moves its room too
    o_ = m_.get('offset', [0, 0, 0])
    if m_['id'] in room_of and (o_[0] or o_[1]):
        room_of[m_['id']] = dict(room_of[m_['id']], footprint=[[p[0] + o_[0], p[1] + o_[1]] for p in room_of[m_['id']]['footprint']])
floor['rooms'] = [room_of[r['id']] for r in floor['rooms']]


def centre(r):
    xs = [p[0] for p in r['footprint']]; ys = [p[1] for p in r['footprint']]
    return ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2)


def cast(o, d, dist):
    ok, loc, nor, idx, ob, mat = sc.ray_cast(dg, Vector(o), Vector(d).normalized(), distance=dist)
    return (loc, ob) if ok else (None, None)


# 4, 5
for oid, op in openings.items():
    cx, cy = op['centre']; w = op['width']; h = op['height']
    a, b = centre(room_of[op['from_room']]), centre(room_of[op['to_room']])
    if op['axis'] == 'x': d = (0, 1 if b[1] > a[1] else -1, 0); lat = (1, 0, 0)
    else: d = (1 if b[0] > a[0] else -1, 0, 0); lat = (0, 1, 0)
    blocked_shell, blocked_prop, tot = [], set(), 0
    for lo in (-0.3 * w, 0, 0.3 * w):
        for z in (0.3, 1.0, min(1.7, h - 0.3)):
            org = (cx + lat[0] * lo - d[0] * 0.6, cy + lat[1] * lo - d[1] * 0.6, z); tot += 1
            loc, ob = cast(org, d, 1.2)
            if ob:
                if is_shell(parts(ob)[1]): blocked_shell.append(ob.name)
                else: blocked_prop.add(ob.name)
    holes, props, n = [], set(), 0
    for k in range(-12, 13):
        t = k * 0.25; n += 1
        px, py = cx + d[0] * t, cy + d[1] * t
        loc, ob = cast((px, py, 0.6), (0, 0, -1), 3.0)
        if not ob or loc.z < -0.02 or (loc.z > 0.12 and is_floor(parts(ob)[1])):
            holes.append(f'{t:+.2f}:{ob.name if ob else "VOID"}@{loc.z if loc else None}')
        elif loc.z > 0.12: props.add(ob.name)
    msg = f'{oid} ({op["from_room"]}->{op["to_room"]}) rays {tot - len(blocked_shell)}/{tot} free, floor {n - len(holes)}/{n}'
    print('OPENING', msg)
    if blocked_shell: fails.append(f'{oid}: opening blocked by shell {sorted(set(blocked_shell))}')
    if holes: fails.append(f'{oid}: walk surface broken at {holes[:4]}')
    if blocked_prop: warns.append(f'{oid}: prop in the doorway {sorted(blocked_prop)}')
    if props: warns.append(f'{oid}: prop on the walk line {sorted(props)}')
# 6
leaks = 0
for r in floor['rooms']:
    xs = [p[0] for p in r['footprint']]; ys = [p[1] for p in r['footprint']]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    pts = [((x0 + x1) / 2, (y0 + y1) / 2)] + [(x0 + (x1 - x0) * fx, y0 + (y1 - y0) * fy) for fx in (.25, .75) for fy in (.25, .75)]
    for (px, py) in pts:
        for k in range(36):
            a = k * math.pi / 18
            loc, ob = cast((px, py, 1.5), (math.cos(a), math.sin(a), 0), 300)
            if not ob: leaks += 1; fails.append(f'{r["id"]} leaks toward {math.degrees(a):.0f} deg from ({px:.1f},{py:.1f})') if leaks < 6 else None
        loc, ob = cast((px, py, 1.5), (0, 0, 1), 300)
        if not ob: leaks += 1; fails.append(f'{r["id"]} open to the sky above ({px:.1f},{py:.1f})') if leaks < 6 else None
print('SEALED', leaks, 'leaking rays of', len(floor['rooms']) * 5 * 37)
for w_ in warns: print('WARN', w_)
if fails:
    for f_ in fails: print('FAIL', f_)
    sys.exit(1)
print('FLOOR_OK', len(ms), 'meshes,', len(openings), 'openings walkable,', len(warns), 'warnings')
