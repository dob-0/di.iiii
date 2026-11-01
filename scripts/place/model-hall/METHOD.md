# model-hall: a place modelled from its video frames (image-based modelling)

Use when the automatic reconstruction of a place fails (see `.claude/skills/video-to-3d/SKILL.md`, honest state)
and a clean, believable copy is still needed. Written before the first build (2026-11-01). Results are
**unvalidated against a survey**: every size is MEASURED from frames or ASSUMED, and the place's
`DIMENSIONS.md` says which.

## Method (established, cited)
1. **Read the frames, sketch the plan.** Contact sheets of the frame set; one floor plan per room. This is
   image-based modelling as in Debevec, Taylor & Malik, *Modeling and Rendering Architecture from Photographs*
   (SIGGRAPH 1996, "Façade"): a person fixes the topology (walls, openings), the photos fix sizes and textures.
2. **Scale from standard objects** visible in frame: door leaves (~0.9 m wide; pull-handle centre 0.9-1.1 m),
   chairs (seat 0.45 m, back 0.81 m), and ratios measured in fronto-parallel views. Distances along a view
   use the pinhole model (z = f·W / w) with the phone's focal length. Single-view metrology: Criminisi,
   Reid & Zisserman, *Single View Metrology*, IJCV 40(2), 2000.
3. **Textures are rectified crops of the frames.** A plane's four image corners -> fronto-parallel image by a
   homography solved with the normalised DLT (Hartley & Zisserman, *Multiple View Geometry*, 2nd ed., alg. 4.1).
   Floors without a visible rectangle use the camera model (f, pitch from the horizon row, eye height).
   Light is divided out (flat field) and the mean set to a published reflectance (paint ~0.8, concrete
   ~0.35-0.4, pine ~0.55; CIBSE/SLL Lighting Handbook reflectance tables), so a texture holds the surface,
   not one moment's exposure. A surface seen only in part is EXTENDED by its row profile and says so.
4. **No person in any texture.** Crops are chosen free of people; where a person is behind glass or in a
   crop, the box is filled from the clean columns either side (listed in `textures/provenance.json`).
   Prints of people (photo friezes, posters) are never cut: they are drawn as plain tone bands.
5. **Check against the frames.** Each eye-level render uses the phone's camera model and is laid beside its
   source frame (`compare.sh`); a top-down plan shows the layout is closed. The person who builds it looks
   at every picture before anyone else sees it.

## Files
| file | does |
|---|---|
| `model_hall.sh <work_dir> [samples]` | the one command: textures -> build -> GLB check -> renders -> side-by-sides |
| `rectify.py` | frame crops -> textures (`quad` 4-point homography, `floor` camera model, fill, flatten, albedo, pad) |
| `props_textures.py` | textures that must not come from frames (photo frieze drawn; wood slats drawn in the frame's colour) |
| `build_hall.py` | Blender (headless): plan.json -> `hall.blend` (packed) + `hall.glb` |
| `check_glb.py` | re-imports the GLB: shell parts present, nothing below the floor, height equals the plan |
| `render_views.py` | Cycles: `plan_top.png` + one eye-level render per plan view (camera = the phone's) |
| `compare.sh` | render beside its frame, one sheet `compare_all.png` |

## Plan JSON (the only place-specific input; lives with the place data, not here)
`hall` (width, length, height, wall thickness, beams), `front` (glass height, door centre and leaf, AC),
`far_end` (opening and the next room's outline), `trays`, `cassettes`, `frieze`, `plinths`, `gantry[]`,
`desk`, `nook`, `easel`, `textures[]`, `wood_sample`, `views[]` (frame, position, yaw, pitch),
`camera_model` (f in px on the long side), `render` (lights, exposure). x across, y along from the front, z up, metres.

## Limits (stated)
- One room per plan. Several rooms need their own plans and a measured link between them (owed).
- Equipment is proxies (boxes, reels, tripods) placed where the frames show them, not scanned objects.
- Light in the renders is for checking only; the GLB carries no lights.
- Requires Blender 4.2+ (tested 5.2.3 LTS), python3 with numpy and Pillow, ImageMagick 7. No OpenCV.

## The whole floor by hand (2026-11-01, Cinema House; ledger N1756)
Several rooms are one place: the same method, run once per room in a shared frame, then assembled and checked as one.
Workflow shape (what worked, ~1 h wall clock):
1. **Survey.** Cut the walk into rooms by time and write `floor.json`: each room's footprint, ceiling, every opening (centre, axis, width,
   height) in ONE frame, each number marked MEASURED / ESTIMATED / ASSUMED. It is the contract the modellers build to.
2. **Rooms in parallel.** One agent per room, same METHOD as above, output `rooms/<id>/<id>.glb` in the floor frame + DIMENSIONS.md +
   `floor_corrections.json` (a proposal never edits `floor.json`). A room builds the walls it shares with its neighbours, with the opening.
3. **Assemble.** `model_floor.sh <modelled_dir> [samples]` (REBUILD=1 runs each module's own `build` command first):
   `assemble_floor.py` imports every module named in `floor_assembly.json`, moves/drops/clips (the manifest says why, per module: a shared
   wall built twice is dropped from one side, a floor that runs into a neighbour's is clipped), writes `floor.glb/.blend`;
   `check_floor.py` is the gate (below); `write_place.py` writes `place.json` (spawn and look from `place_meta.json`); `render_floor.py` writes
   `renders/floor_top.png` and `eye_<opening>.png` through every connection (lights for checking only). Decide each proposed correction in
   `floor_corrections.json` with its reason (ADOPTED / KEPT (OPEN)); an adopted one moves the module in the manifest.
4. **Judge.** Look at `floor_top.png` and every `eye_*.png`; then the viewer on the test copy (agent screen). A check that cannot fail is not a check.
`check_floor.py` (headless Blender, ray casts on the re-imported GLB): modules present; nothing below the floor (a stair going down is
exempted by name in the manifest); no two floors of different modules overlap in plan; no wall/wall overlap between modules; per opening
9 horizontal rays (3 lateral x 3 heights) through the plane must be free and 25 downward rays along the walk line must hit a floor at
z -0.02..0.12 (no hole, no step); from 5 points per room, 36 rays + up must hit something (sealed). First run found the real defects below.
Lessons (each was a real failure on the Cinema House floor):
- **`bmesh` boxes with mixed face winding make Blender's EXACT boolean leave the cut closed** in the exported GLB, while the Cycles
  render looked fine: the main hall's 3.6 m opening to gallery A and the sills of two arches were filled. Call
  `bmesh.ops.recalc_face_normals` before `to_mesh` in every box/primitive helper that is later used in a boolean; test openings by ray, not by eye.
- Two modules that both build the shared wall double the slab (z-fighting) and overlap their floors: one side drops it, the other is clipped.
- A module's own closed "stub" behind an arch (a pocket to look into) must be dropped once the real neighbour exists.
- A prop 2 m in front of an arch hides the connection from the straight-on eye view: `floor_corrections.json` may give an `eye` position.
Limits (stated): rooms beyond the main hall sit in a walking-time layout, +-30 %; only gallery A's width and glass height are MEASURED (ratio to a
door); `place.json` has no walkable-floor / collision data, so the viewer lets you walk through walls (owed: write the floor plan from the floor slabs).
