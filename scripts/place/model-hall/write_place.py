"""write_place.py - place.json for scripts/place/import.mjs, written from the GLB itself (no hand-made state).
Run: blender -b --factory-startup --python write_place.py -- <hall.glb> <plan.json> <place.json>
spawn_xy / look_xy in the plan meta (plan frame x,y) give where the walker stands and faces.
size = [x, up, depth] in metres in the glTF frame the viewer loads (x across, up, depth along the hall), from the
bounding box of the exported meshes; the floor slab below 0 is not counted in 'up'. scaleSource comes from plan.json
(plan['scale_source'] when present, else 'text': sizes taken from the frames and the venue text, not a tape measure).
Provenance: the numbers are the GLB's own bounds; whether they are MEASURED is plan.json's claim, never made here."""
import bpy, json, sys
glb, planp, outp = sys.argv[sys.argv.index('--') + 1:][:3]
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
for o in bpy.context.scene.objects:
    if o.type != 'MESH' or not o.name.lower().endswith('floor') or 'stair' in o.name.lower(): continue
    ps = [o.matrix_world @ v.co for v in o.data.vertices]
    if not ps: continue
    lo = [min(p[i] for p in ps) for i in range(3)]; hi = [max(p[i] for p in ps) for i in range(3)]
    if hi[2] - lo[2] > 0.5 or (hi[0] - lo[0]) < 2 or (hi[1] - lo[1]) < 2: continue
    areas.append({'minX': r(lo[0] - 0.15), 'maxX': r(hi[0] + 0.15), 'minZ': r(-hi[1] - 0.15), 'maxZ': r(-lo[1] + 0.15)})
if areas: rec['walkableAreas'] = areas
if plan.get('spawn_xy'):      # plan frame (x across, y along) -> glTF frame (z = -y)
    rec['spawn'] = {'x': plan['spawn_xy'][0], 'z': -plan['spawn_xy'][1], 'altY': 1.6}
    if plan.get('look_xy'): rec['spawn']['look'] = {'x': plan['look_xy'][0], 'z': -plan['look_xy'][1]}
    if rec['spawn'].get('look'):   # worldState.spawn has no look: the viewer faces (sin yaw, cos yaw), yaw 0 = +Z
        import math
        rec['spawn']['yaw'] = round(math.atan2(rec['spawn']['look']['x'] - rec['spawn']['x'], rec['spawn']['look']['z'] - rec['spawn']['z']), 3)
json.dump(rec, open(outp, 'w'), indent=1)
print('PLACE', rec['size'], src)
