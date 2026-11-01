"""write_place.py - place.json for scripts/place/import.mjs, written from the GLB itself (no hand-made state).
Run: blender -b --factory-startup --python write_place.py -- <hall.glb> <plan.json> <place.json>
spawn_xy / look_xy in the plan meta (plan frame x,y) give where the walker stands and faces.
size = [x, up, depth] in metres in the glTF frame the viewer loads (x across, up, depth along the hall), from the
bounding box of the exported meshes; the floor slab below 0 is not counted in 'up'. scaleSource comes from plan.json
(plan['scale_source'] when present, else 'text': sizes taken from the frames and the venue text, not a tape measure).
Provenance: the numbers are the GLB's own bounds; whether they are MEASURED is plan.json's claim, never made here."""
import bpy, json, sys
args = sys.argv[sys.argv.index('--') + 1:]
glb, planp, outp = args[:3]
floorp = args[3] if len(args) > 3 else None   # optional floor.json: one walk-in viewpoint per room (rooms + walk_order)
plan = json.load(open(planp))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
pts = [o.matrix_world @ v.co for o in bpy.context.scene.objects if o.type == 'MESH' for v in o.data.vertices]
mn = [min(p[i] for p in pts) for i in range(3)]; mx = [max(p[i] for p in pts) for i in range(3)]
r = lambda v: round(v, 2)
src = plan.get('scale_source', 'text')
rec = {
    'version': 1,
    'size': [r(mx[0] - mn[0]), r(mx[2]), r(mx[1] - mn[1])],
    'scaleSource': src,
    'scaleNote': plan.get('scale_note', f"modelled from frames ({plan.get('place', 'place')}); sizes are ESTIMATED from the frames unless DIMENSIONS.md marks a row MEASURED"),
    'bakedIn': False,
    'transform': {'position': [0, 0, 0], 'rotation': [0, 0, 0], 'scale': [1, 1, 1]},
    'bounds': {'min': [r(mn[0]), r(mn[2]), r(-mx[1])], 'max': [r(mx[0]), r(mx[2]), r(-mn[1])]},
}
# The walkable floor: one rectangle per floor slab of the exported model (a mesh named *floor, thin, wider than 2 m),
# glTF frame (x, z), overlapped 0.15 m so two rooms that meet at a door are one floor; the walls themselves are
# stopped by worldState.solidWalls. A stair, a plinth or a stub below the floor is not a slab and adds nothing.
areas = []
room_slab = {}   # room id (the '<room>:' name prefix) -> its floor slab box
for o in bpy.context.scene.objects:
    if o.type != 'MESH' or not o.name.lower().endswith('floor') or 'stair' in o.name.lower(): continue
    ps = [o.matrix_world @ v.co for v in o.data.vertices]
    if not ps: continue
    lo = [min(p[i] for p in ps) for i in range(3)]; hi = [max(p[i] for p in ps) for i in range(3)]
    if hi[2] - lo[2] > 0.5 or (hi[0] - lo[0]) < 2 or (hi[1] - lo[1]) < 2: continue
    rid_ = o.name.split(':')[0]; old_ = room_slab.get(rid_)
    if not old_ or (hi[0] - lo[0]) * (hi[1] - lo[1]) > (old_[1][0] - old_[0][0]) * (old_[1][1] - old_[0][1]): room_slab[rid_] = (lo, hi)   # the room's biggest slab
    areas.append({'minX': r(lo[0] - 0.15), 'maxX': r(hi[0] + 0.15), 'minZ': r(-hi[1] - 0.15), 'maxZ': r(-lo[1] + 0.15)})
if areas: rec['walkableAreas'] = areas
if plan.get('spawn_xy'):      # plan frame (x across, y along) -> glTF frame (z = -y)
    rec['spawn'] = {'x': plan['spawn_xy'][0], 'z': -plan['spawn_xy'][1], 'altY': 1.6}
    if plan.get('look_xy'): rec['spawn']['look'] = {'x': plan['look_xy'][0], 'z': -plan['look_xy'][1]}
    if rec['spawn'].get('look'):   # worldState.spawn has no look: the viewer faces (sin yaw, cos yaw), yaw 0 = +Z
        import math
        rec['spawn']['yaw'] = round(math.atan2(rec['spawn']['look']['x'] - rec['spawn']['x'], rec['spawn']['look']['z'] - rec['spawn']['z']), 3)
# Named views (views-as-data, src/project/viewport/smartView/viewData.js): 'high' = a high view INSIDE the biggest room, from its
# corner nearest the spawn (0.8 m in), 2.9 m up (over the ceiling cut, so the ceilings are hidden), at the far floor corner.
# Floor (whole plan from above) and Top (straight down) are computed by the viewer from the model's own box.
if areas:
    big = max(areas, key=lambda a: (a['maxX'] - a['minX']) * (a['maxZ'] - a['minZ']))
    sp = rec.get('spawn') or {'x': (big['minX'] + big['maxX']) / 2, 'z': big['maxZ']}
    cx = big['maxX'] - 0.8 if abs(big['maxX'] - sp['x']) < abs(big['minX'] - sp['x']) else big['minX'] + 0.8
    cz = big['maxZ'] - 0.8 if abs(big['maxZ'] - sp['z']) < abs(big['minZ'] - sp['z']) else big['minZ'] + 0.8
    fx = big['minX'] + 0.8 if cx > (big['minX'] + big['maxX']) / 2 else big['maxX'] - 0.8
    fz = big['minZ'] + 0.8 if cz > (big['minZ'] + big['maxZ']) / 2 else big['maxZ'] - 0.8
    rec['views'] = [{'id': 'high', 'label': 'High in', 'position': [r(cx), 2.9, r(cz)], 'target': [r(fx), 0.0, r(fz)], 'fov': 70}]
# One viewpoint per room (ledger N1756, the pose hook ?at=<room>, src/components/walkAt.js). Method, written down because no
# published rule exists for it (marked ESTIMATED): the walker's first look on entering the room as the survey video walks it
# (floor.json walk_order; entered through its opening, floor.json openings): eye 1.6 m, standing 0.8 m inside the room's slab at the point nearest the room it came from, looking
# through the slab's centre at the far side, 1.4 m high. The first room uses the spawn. Stored as work views with link: true, so
# they are off the visitor's bar but a link opens them.
if floorp and room_slab:
    import math
    fl = json.load(open(floorp))
    order = []
    for w in fl.get('walk_order', []):
        if w.get('room') and w['room'] not in order: order.append(w['room'])
    order += [x['id'] for x in fl.get('rooms', []) if x['id'] not in order]
    known = {x['id'] for x in fl.get('rooms', [])}
    order = [x for x in order if x in known]
    # the room it is entered from: the opening into it (floor.json openings), else the one before it in the walk
    came_from = {o['to_room']: o['from_room'] for o in fl.get('openings', []) if o.get('to_room') in known and o.get('from_room') in room_slab}
    rect = lambda rid: (room_slab[rid][0][0], room_slab[rid][1][0], -room_slab[rid][1][1], -room_slab[rid][0][1])  # x0 x1 z0 z1 (glTF)
    clampv = lambda v, a, b: max(a, min(b, v))
    views = rec.get('views', [])
    prev = None
    for rid in order:
        if rid not in room_slab: print('VIEWPOINT none (no floor slab):', rid); continue
        x0, x1, z0, z1 = rect(rid); cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
        if prev is None and rec.get('spawn'):
            ex, ez = rec['spawn']['x'], rec['spawn']['z']
        else:
            src_ = came_from.get(rid, prev)
            px0, px1, pz0, pz1 = rect(src_) if src_ else (cx, cx, z1 + 1, z1 + 1)
            pcx, pcz = clampv(cx, px0, px1), clampv(cz, pz0, pz1)        # the came-from room's point nearest this one
            ex, ez = clampv(pcx, x0 + 0.8, x1 - 0.8), clampv(pcz, z0 + 0.8, z1 - 0.8)
        dx, dz = cx - ex, cz - ez; d = math.hypot(dx, dz) or 1.0
        # the far side: from the entry through the centre to the slab's edge
        t = min([((x1 - 0.3) - ex) / dx if dx > 1e-6 else 1e9, ((x0 + 0.3) - ex) / dx if dx < -1e-6 else 1e9,
                 ((z1 - 0.3) - ez) / dz if dz > 1e-6 else 1e9, ((z0 + 0.3) - ez) / dz if dz < -1e-6 else 1e9])
        tx, tz = (ex + dx * t, ez + dz * t) if t < 1e8 else (cx, cz - 1)
        name = next((x.get('name') for x in fl.get('rooms', []) if x['id'] == rid), rid)
        views.append({'id': 'room-' + rid.replace('_', '-'), 'label': str(name).split(' (')[0][:16], 'position': [r(ex), 1.6, r(ez)],
                      'target': [r(tx), 1.4, r(tz)], 'fov': 70, 'live': False, 'link': True})
        print('VIEWPOINT', rid, views[-1]['position'], '->', views[-1]['target'])
        prev = rid
    rec['views'] = views
# Room views (fix4, ledger N1756): plan 'room_views' [{id,label,pos:[x,y,z],look:[x,y,z]}] in the plan frame become named views, so a tester or the owner
# reaches a room by a button, at a pose that was checked against the room's frames (compare_*.png). Plan frame (x, y, z up) -> glTF (x, z, -y).
for rv in plan.get('room_views', []):
    rec.setdefault('views', []).append({'id': rv['id'], 'label': rv['label'], 'position': [r(rv['pos'][0]), r(rv['pos'][2]), r(-rv['pos'][1])],
                                        'target': [r(rv['look'][0]), r(rv['look'][2]), r(-rv['look'][1])], 'fov': rv.get('fov', 65)})
json.dump(rec, open(outp, 'w'), indent=1)
print('PLACE', rec['size'], src)
