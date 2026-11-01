"""write_place.py - place.json for scripts/place/import.mjs, written from the GLB itself (no hand-made state).
Run: blender -b --factory-startup --python write_place.py -- <hall.glb> <plan.json> <place.json>
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
    'scaleNote': f"modelled from frames ({plan.get('place', 'place')}); glass front and hall width are ESTIMATED from the frames, see DIMENSIONS.md",
    'bakedIn': False,
    'transform': {'position': [0, 0, 0], 'rotation': [0, 0, 0], 'scale': [1, 1, 1]},
    'bounds': {'min': [r(mn[0]), r(mn[2]), r(-mx[1])], 'max': [r(mx[0]), r(mx[2]), r(-mn[1])]},
}
json.dump(rec, open(outp, 'w'), indent=1)
print('PLACE', rec['size'], src)
