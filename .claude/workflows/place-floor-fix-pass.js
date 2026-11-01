export const meta = {
  name: 'place-floor-fix-pass',
  description: 'Cinema House round 5: audit every defect vs frames, fix per room in parallel, assemble with clip/float checks, adversarial judge with before/after',
  phases: [
    { title: 'Walls', detail: 'wall plan from the footage, per-wall same-pose compare' },
    { title: 'Dense', detail: 'dense frames, estimated walls to measured' },
    { title: 'Audit', detail: 'every defect per room vs its frames' },
    { title: 'Baseline', detail: 'archive the previous round, score it at the fixed pose set' },
    { title: 'Fix', detail: 'one fixer per room + the stills crop' },
    { title: 'Assemble', detail: 'one floor, checks, load speed, live shots' },
    { title: 'Gate', detail: 'archive this round, score, roll back rooms that got worse' },
    { title: 'Judge', detail: 'adversarial, before/after per room' },
  ],
}
// PASS: per room, same-pose F1 (round_gate.py score) >= the previous round - 0.01, and the judge finds 0 defects in >= 1 more room than last round
// PILOT: run the Baseline + Fix + Gate for ONE room first (args.rooms = [id]); fan out to all rooms only if that room gains >= 0.02 F1
const D = '/mnt/data/footage/place-cinema-house-2026-10-30'
const R = '/home/dob/work/agent-reports-2026-11-01/floor-by-hand/fix5'
const URL = 'http://cinema-house-test.diiii.localhost/cinema-house/p/cinema-house-floor'
const SHOTS = '/tmp/claude-1000/-home-dob/cc13c255-90c3-4afc-a092-ed2b6a63c4f9/scratchpad/cinema'
const ROOMS = ['gallery_a', 'main_hall', 'coat_corridor', 'cafe', 'marble_hall', 'door_corridor']
const BASE = `Context: Cinema House floor, modelled by hand from 2 phone videos (image-based modelling: Facade / single-view metrology / DLT homography; method in ~/work/di.iiii-ch3d scripts/place/model-hall/METHOD.md and ~/work/agent-reports-2026-11-01/smart-3d-tool/ARTIST-METHOD.md). Round 4 = near pass (read ~/work/agent-reports-2026-11-01/floor-by-hand/fix4/judge4/VERDICT-4.md and fix4/REBUILD.md first). The owner looked at it 19:5x and said "not bad but there are too many mistakes — look what the problem is and go fix". His bar now: NO mistakes — no cloned placeholders, no untextured/flat grey slabs, nothing clipping or floating, no semi-transparent stray slabs, real stills in the film strips, every room compared side by side with its video frame.
Data D=${D} (frames D/images, D/modelled/survey/, rooms D/modelled/rooms/<id>/ with build_<id>.py, floor.json, floor.glb). Code: worktree ~/work/di.iiii-ch3d branch feat/place-keep-front-door (scripts/place/model-hall/, scripts/place/gen3d/ — TripoSG default for object shapes, see ~/work/agent-reports-2026-11-01/gen3d-kit/TOOL.md; MOXIR tools photo_project.py, multiview_columns.py, undistort_plumb.py are reusable). Heavy GPU work may use our Colab Pro+ (scripts/place/colab-pinned.sh with HOME=/home/dob/.local/state/colab/gevorg), never other services. Test copy ${URL}?at=<room> (stack ch3d, name cinema-house-test; re-import with --no-sources). Owner-visible shots of round 4 from the lead chat: ${SHOTS}/ (floor-default.png, hall-default.png, at-<room>.png).
Heat (aylmo locks up at 90-100 C, N1853): cap threads (OMP_NUM_THREADS=6, torch.set_num_threads(6), ffmpeg -threads 4, blender -t 6), run heavy steps under nice 10, and before each heavy step wait while 'sensors | grep "Package id 0"' reads above 85 C; say the thread count in your report. Hard rules: no person or face in any texture or crop (blur/paint out, check by eye); physics first: nothing through a wall, nothing floating, nothing intersecting; every dimension MEASURED or ESTIMATED with why; tests only headless (blender -b) or on the agent screen (di-test-browser), never the owner's screen, open nothing for him; never pkill (kill only your own pids); no push, no merge; sterile at the end (no blender left, test browser down). Keep tool calls <= ~75; write your report file and return a short summary.
OWNER'S METHOD (20:4x, ledger N1812) — the core loop of this round: "you can have the screenshots from video and with object orientation you can compare and build the space". The frames are ground truth. For each key frame: (1) solve its camera pose against the model (vanishing points + PnP on known model corners/edges; ARTIST-METHOD.md; COLMAP failed on these videos, use it only on a short chunk if it helps); (2) list the objects in the frame and their orientation (which way a case, counter, projector, door, banner faces; where it stands, its size); (3) render the model from THAT SAME pose (Blender headless, same focal length, 1.6 m is not assumed) and compare OBJECT BY OBJECT: position, orientation, size, texture — plus an overlay/diff image (frame | render same pose | edge or alpha diff); (4) correct and repeat until the per-object compare is clean. Keep a table per room: object, frame ids, pose (xy, rot, z), size, status MEASURED/ESTIMATED, compare result. Write the shared pose solver/compare as ONE helper script in D/modelled/compare/ (pose_from_frame.py, render_same_pose.py, compare_objects.py) — the WALLS agent creates it, everyone after reuses it, never re-invent it.`

phase('Walls')
const WS = { type: 'object', properties: { measured: { type: 'string' }, estimated: { type: 'string' }, report: { type: 'string' } }, required: ['measured', 'estimated', 'report'] }
const walls = await agent(`${BASE}

Your job: the WALL PLAN, the first deliverable of this round. Owner 20:5x (ledger N1815): "walls are not right, but I did the video like that — every possible place is mapped". He filmed so that every wall and corner is covered; the walls must come FROM the footage, not from estimates. (1) Build the pose/compare helper D/modelled/compare/ (pose_from_frame.py, render_same_pose.py, compare_objects.py — see OWNER'S METHOD; test it on 2 frames so it can fail). (2) Walk the FULL coverage of BOTH videos (D/PROVENANCE.md; dense frames in D/modelled/survey/frames/ with the index), in time order; chain the camera poses frame to frame (vanishing points + PnP on shared corners; MoGe-2/DA3 metric depth in D/modelled/depth/ for scale; Colab Pro+ allowed for depth). (3) Derive the floor plan from the frames: every wall line, corner, angle, length, door and arch opening (position, width, height), ceiling height per room, floor levels and steps — in the shared frame of floor.json. Keep round 4 as D/modelled/floor.round4.json, write the new D/modelled/floor.json with a MEASURED (frames + method) / ESTIMATED (why: not seen) mark per wall. (4) Rebuild every room SHELL from it (walls, openings, ceilings only — touch only the shell part of each rooms/<id>/build_<id>.py, keep a copy rooms/<id>/_round4/ first) and check: for each wall, frame | render from the same pose | diff, in ${R}/walls/<room>_<wall>.png; iterate until each measured wall lines up (corner reprojection error in px written per wall). (5) Top view new vs round 4: ${R}/walls/plan_new_vs_round4.png. Report ${R}/WALLS.md: per wall measured or estimated, its numbers, reprojection error. If you near ~75 tool calls before done, write ${R}/WALLS_HANDOVER.md with exactly what is left and return that.`,
  { label: 'walls', phase: 'Walls', schema: WS })
if (!walls) return { error: 'walls failed' }
let wallsDone = walls
if (/HANDOVER/i.test(walls.report)) {
  wallsDone = await agent(`${BASE}

Your job: FINISH the wall plan. Read ${R}/WALLS_HANDOVER.md (including its LEAD section) and ${R}/WALLS.md. Lead plan (replaces handover items 2 and 4): no pose chain, no fragment anchoring, no VGGT. (a) Fix the render helper first: camera convention (Blender camera looks down -Z, Y up; z-up world vs glTF y-up; FOV from focal length; check pose json fields, e.g. h was written as 1.816) until the 2-frame gallery test overlaps > 0.3; the partial anchor try is in D/modelled/compare/_work/anchor/ and gallery_anchor.py — reuse or drop it, your call, say why. (b) Measure each wall from its own 2-3 FACING frames (MoGe-2 depth in D/modelled/depth, camera height 1.65-1.84 m; hand-marked corners with pose_from_frame.py --corners where lines are missing; frame 154922_t00025 is good for the glass front): length between corners, openings w/h, ceiling height; MEASURED if frames agree within 5 %, else ESTIMATED. (c) Copy rooms/<id>/_round4 first, apply every measured width (coat corridor 2.3 m included) and move that room's objects with its shell (nothing through a wall). (d) One frame|render|diff per wall in ${R}/walls/<room>_<wall>.png with reprojection px. (e) WALLS.md first line '# WALLS (round 5) FINAL' + table wall | MEASURED/ESTIMATED | numbers | frames. Background jobs: wait for them yourself, never leave one running.`, { label: 'walls-2', phase: 'Walls', schema: WS }) || walls
}
log('walls measured: ' + wallsDone.measured.slice(0, 200))
log('walls estimated: ' + wallsDone.estimated.slice(0, 200))

phase('Dense')
const dense = await agent(`${BASE}

Your job: DENSE FRAMES for the walls. Owner 21:2x (ledger N1834): "your photos are not enough, you are not right, take more screenshots". The two videos (D/PROVENANCE.md: 20261030_154922.mp4 87.3 s and 20261030_155205.mp4 291.7 s, 4K HEVC portrait 30 fps, about 11,370 frames in all; sources in the paths named there, never re-encode or move them) were sampled to only 759 survey frames (~2 fps). Read ${R}/WALLS.md (FINAL, 21:05) first: walls still ESTIMATED are main hall, marble hall and cafe lengths, coat end walls, all door/arch openings.
(1) Extract frames densely: EVERY frame (30 fps) over the time ranges of the main hall, marble hall, cafe and around every corner and door; 10 fps elsewhere (sources per the lead chat: /mnt/data/footage/cinema-house-2026-10-30/20261030_154922.mp4 and 20261030_155205.mp4, 11,340 frames total; the old extraction frames.json ran at 2 fps with a blur floor); keep the sharpness score but do NOT drop a soft frame when a wall needs it (a soft frame still gives a wall line), to D/modelled/dense/frames/ with an index (video, timestamp); downscale to 1920 long side, hardware decode (NVDEC) if available. (2) Quick pre-filter: line-based (LSD/Hough vanishing-point check + sharpness) keep only frames that face a wall end, a corner or an opening; say the counts. Blur people (faces) at ingest per the rule. (3) Metric depth (MoGe-2, the helper's venv in D/modelled/compare/; Colab Pro+ via scripts/place/colab-pinned.sh with HOME=/home/dob/.local/state/colab/gevorg if the local GPU is too slow — stop the session after) on the kept frames only. (4) Run the single-frame wall detection (D/modelled/compare/walls_single.py) and the fuse on them; for every ESTIMATED wall find bracketing pairs (frames showing both ends or both corners), measure; MEASURED when 2-3 independent frames agree within 5 %, else stays ESTIMATED with the reason. Openings: width and height per door/arch. (5) Apply each newly MEASURED value to floor.json and the room shell (copy rooms/<id>/_round5walls first; move objects with the shell; nothing through a wall), rebuild with model_floor.sh, re-import the test copy (import.mjs --no-sources --replace --keep-front-door, token file ~/.config/di-dev/env/ch3d.env), one frame|render|diff per changed wall in ${R}/walls/. (6) Update ${R}/WALLS.md (keep first line FINAL) with a section 'Dense pass' giving: video lengths and fps, frames before (759) and after (extracted / kept by the pre-filter / depth run), wall pairs found per room, how many walls moved ESTIMATED -> MEASURED, which stay ESTIMATED and why. Return those numbers.`,
  { label: 'dense-walls', phase: 'Dense' })
log('dense: ' + String(dense || 'failed').slice(0, 300))

phase('Audit')
const AUD = { type: 'object', properties: { rooms: { type: 'array', items: { type: 'object', properties: {
  id: { type: 'string' }, defects: { type: 'string' }, best_frames: { type: 'string' } }, required: ['id', 'defects', 'best_frames'] } },
  shared: { type: 'string' } }, required: ['rooms', 'shared'] }
const audit = await agent(`${BASE}

Your job: AUDIT, adversarially. For each room ${ROOMS.join(', ')}: look at the live test copy at ?at=<room> on the agent screen (wait for the first frame — the lead saw "Loading..." past 10 s; measure the time to first frame per room), the lead's shots, and the room's best video frames side by side. Read ${R}/WALLS.md first: the walls are now taken from the footage (do not re-audit walls except where WALLS.md marks them ESTIMATED). Reuse the pose/compare helper in D/modelled/compare/; use the dense frames in D/modelled/dense/ (index there) for the per-object compare. For 3-5 key frames per room solve the pose, render the same pose, and list EVERY defect object by object (object, where, orientation/position/size/texture wrong, what the frame shows instead) with the frame|render|diff picture. Known from the lead: gallery_a — ~30 exhibits are ONE cloned placeholder (black box with two reels) on identical pedestals while the real gallery shows different cameras/projectors; film-strip bands carry grey gradient squares not the real stills; two hanging black boxes and a tripod clip into the pedestal and walkway at the left; beige column+beam stand in the walkway; ceiling light panels float; a hanging cube at the far end; walls flat white. Hall page default view: a big semi-transparent slab over the left wall. main_hall: right half is a flat grey partition slab, colour-chart square on the left wall is a placeholder, ceiling light strips float at odd angles (one slanted), black block at the left untextured. Round-4 verdict: cafe walls/ceiling flat grey, streaks on marble back wall and door corridor floor/walls, marble walls brown stone where frames show white plaster, plan small on black, fly unbounded. Confirm or correct each and find the ones not listed. Also list SHARED problems (viewer load time, lighting, plan view framing, fly bounds). Write ${R}/AUDIT.md with a picture per room (${R}/audit/<room>_frame_vs_live.png). Return per room: defects (numbered list as one string, object by object) and best_frames (paths, with their solved pose file).`,
  { label: 'audit', phase: 'Audit', schema: AUD })
if (!audit) return { error: 'audit failed' }

// Round numbers and the gate (owner's lead 2026-11-02, after rounds 5-6 shipped changes that made rooms worse):
// a fixer's change is kept only if the room's same-pose score does not fall below the previous round's.
const ROUND = (args && args.round) || 7
const PREV = ROUND - 1
const GATE = `python3 scripts/place/model-hall/round_gate.py` // archive | restore | score | check, docs in its header
const STILLS = 'scripts/place/model-hall/stills_crop.py'

phase('Baseline')
await agent(`${BASE}

Your job: the BASELINE for the gate, no modelling. In D/modelled: (1) if D/modelled/gate_poses.json is missing, write it: per room 2-4 frames that face that room's walls and objects, each with a pose json from pose_from_frame.py (rms_px < 5; reuse the rooms' stored poses), COPIED into D/modelled/gate_poses/ so the set never moves; the same set is used for every round from now on, never edited during a round. (2) If D/modelled/rounds/r${PREV}/ is missing, run \`${GATE} archive D/modelled ${PREV}\` (the current floor IS round ${PREV}). (3) Run \`${GATE} score D/modelled ${PREV}\` (blender -t 6, nice 10). A room whose score is < 0.01 has no baseline: fix its poses first. Write the table to ${R}/GATE-baseline.md. Return the table.`,
  { label: 'baseline', phase: 'Baseline' })

phase('Fix')
const stillsJob = agent(`${BASE}

Your job: the STILLS, nothing else. Every film-strip still, print and poster the rooms show: list it in D/modelled/stills_spec.json with its 3D corners (from the room builds) and 3-8 candidate frames that face it from the dense set (D/modelled/dense/frames, 4K source), each with its solved pose; run \`${STILLS} D/modelled/stills_spec.json <frames dir> D/modelled/stills\` (frcnn detector, the same model as ingest). It writes the sharpest people-free rectified crop per still and refuses blurred, off-frame or people crops; a refused still stays blank paper in its frame, never blurred and used. Report written/refused per room to ${R}/STILLS.md; the room fixers take their stills from D/modelled/stills/.`,
  { label: 'stills', phase: 'Fix' })
const fixes = await parallel(audit.rooms.filter(r => ROOMS.includes(r.id) && (!(args && args.rooms) || args.rooms.includes(r.id))).map(r => () => agent(`${BASE}

Your job: FIX ONE room, "${r.id}", until every defect is gone. Defects from the audit (${R}/AUDIT.md):
${r.defects}
Best frames: ${r.best_frames}
Rules for this job: work ONLY in D/modelled/rooms/${r.id}/ (build_${r.id}.py, textures/, provenance.json, renders/); do not edit shared code in scripts/place/model-hall/ (another agent assembles; if a shared change is needed, write it to D/modelled/rooms/${r.id}/SHARED_NEEDS.md). Keep a copy of the round-4 room folder as rooms/${r.id}/_round4/ before changing (nothing is lost). Real objects: model the real variety the frames show (distinct shapes per exhibit/fixture, placed where the frames show them; use TripoSG via scripts/place/gen3d/ for complex equipment from clean people-free crops if it helps, scaled to measured size); never one cloned placeholder. Textures: projected from the frames (median across several frames to kill streaks and people), de-lit; real stills cropped into film strips, people-free; colours as the frames show (white plaster is white). Every object rests on the floor, a wall or a ceiling mount; nothing intersects walls, walkways or other objects; nothing semi-transparent unless it is real glass the frames show. Self-check headless: a script listing every object's bbox overlaps and support (gap to floor/ceiling/wall < 2 cm), zero problems; then the OWNER'S METHOD compare with D/modelled/compare/ on the key frames: for each, frame | round-4 render from the same pose | new render from the same pose | diff, as ${R}/rooms/${r.id}_before_after.png (and _<frame>.png per key frame); iterate until the per-object table is clean. Report: ${R}/rooms/${r.id}.md (each defect: fixed how / left why).`,
  { label: `fix:${r.id}`, phase: 'Fix' })))

phase('Assemble')
const asm = await agent(`${BASE}

Your job: ASSEMBLE round 5. Read ${R}/LEAD_NOTES.md (4 ?at= rooms black 35-40 s: read console+network) and ${R}/AUDIT.md (shared problems), ${R}/rooms/*.md and every D/modelled/rooms/*/SHARED_NEEDS.md. Rebuild the whole floor with the existing one command (scripts/place/model-hall/) into D/modelled/floor.glb; extend check_glb.py so it FAILS on: object/object and object/wall intersections, unsupported (floating) objects, semi-transparent materials not tagged as glass, untextured large faces (> 1 m2 with a flat colour); run it to 0 problems. Fix the shared problems: time to first frame on ?at= pages (measure before/after; texture sizes/compression, GLB size), plan view framed to fill the screen, fly bounded to the floor. Physics-first check (scripts/place/physics_check.py if lights exist: 0 leaks). Re-import on the test copy (--no-sources), screenshot every room live on the agent screen at ?at=<room>. Commit in ~/work/di.iiii-ch3d (exact files, never git add -A). Report ${R}/ASSEMBLE.md with numbers.`,
  { label: 'assemble', phase: 'Assemble' })

phase('Gate')
await stillsJob
const gate = await agent(`${BASE}

Your job: the GATE for round ${ROUND}, no modelling. In D/modelled: (1) \`${GATE} archive D/modelled ${ROUND}\` (the assembled floor). (2) \`${GATE} score D/modelled ${ROUND}\`. (3) \`${GATE} check D/modelled ${ROUND} --prev ${PREV} --apply\`. (4) If any room rolled back: rebuild the floor with model_floor.sh, then \`${GATE} finalize D/modelled ${ROUND}\` (keeps the pre-gate archive, archives and scores the rebuilt floor), and re-import on the test copy (--no-sources). Write ${R}/GATE.md: per room the previous score, this round's score, keep/rollback. Return that table.`,
  { label: 'gate', phase: 'Gate' })

phase('Judge')
const J = { type: 'object', properties: { pass: { type: 'boolean' }, per_room: { type: 'array', items: { type: 'object', properties: {
  id: { type: 'string' }, no_mistakes: { type: 'boolean' }, left: { type: 'string' } }, required: ['id', 'no_mistakes', 'left'] } },
  first_frame_seconds: { type: 'string' }, faces_in_textures: { type: 'boolean' }, proof: { type: 'string' }, summary: { type: 'string' } },
  required: ['pass', 'per_room', 'first_frame_seconds', 'faces_in_textures', 'proof', 'summary'] }
const verdict = await agent(`${BASE}

Your job: JUDGE round 5 adversarially, against the owner's "no mistakes" bar. Trust only what you see: open ${URL}?at=<room> for each of ${ROOMS.join(', ')} on the agent screen, wait for first frame (time it), screenshot, look around 4 directions; compare with ${R}/audit/ and the frames. Run the OWNER'S METHOD compare yourself on key frames per room (render from the solved pose, per-object table: position, orientation, size, texture) — not only 'looks similar'. Read ${R}/GATE.md (the measured keep/rollback per room) and say where your eye disagrees with it. Check every defect in ${R}/AUDIT.md is gone; look for new ones (clipping, floating, clones, flat slabs, transparency, streaks, wrong colours). Open every texture: no person or face. Make ${R}/judge/before_after_<room>.png (frame | round-4 render same pose | round-5 render same pose | diff; plus the live ?at= shot) and ${R}/judge/all_rooms.png. Write ${R}/VERDICT-5.md. pass=true only if every room has no_mistakes. Close your test browser.`,
  { label: 'judge', phase: 'Judge', schema: J })
return { verdict, fixed: fixes.filter(Boolean).length, asm: asm ? asm.slice(0, 600) : null }