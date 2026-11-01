export const meta = {
  name: 'place-floor-by-hand',
  description: 'Model a whole place floor by hand from its videos: survey, per-room build, assemble, judge',
  whenToUse: 'A place filmed on a phone where automatic reconstruction failed. args: {data, reports, testUrl, place, stack, testName}; one room must already be built by scripts/place/model-hall (the reference room).',
  phases: [
    { title: 'Survey', detail: 'more frames, room map, shared coordinates' },
    { title: 'Rooms', detail: 'one modeller per room + viewer fix' },
    { title: 'Assemble', detail: 'join rooms into one walkable floor' },
    { title: 'Judge', detail: 'renders vs frames, honest verdict' },
  ],
}

const BASE = `Source of this recipe: first run 2026-11-01 (Cinema House, ledger N1756/N1757); every source video listed in D/PROVENANCE.md is used — never only one. Heavy GPU steps (metric depth per frame, inpainting people out) run on our own Colab Pro+ session (scripts/place/colab-pinned.sh, gevorg login), never only on this PC; if D/modelled/depth/DEPTH_SIZES.md exists, use its MEASURED-depth sizes and say which.
Context: the owner asked (ledger N1756) to model the WHOLE ${args.place} floor by hand ("image-based modelling" — the method that worked; automatic reconstruction FAILED, see ~/work/agent-reports-2026-11-01/video-to-3d/VERDICT.md; never use the lane2/lane3 meshes or MASt3R data). Gallery A is already built and judged good: read ~/work/agent-reports-2026-11-01/modelled-hall/REPORT.md, modelled/DIMENSIONS.md, modelled/plan.json and the code in the di.iiii worktree ~/work/di.iiii-ch3d (branch feat/place-keep-front-door, scripts/place/model-hall/: METHOD.md, rectify.py, build_hall.py, render_views.py, compare.sh, check_glb.py). Follow the same method (Façade / single-view metrology / DLT homography, written in METHOD.md).
Data root D=${args.data} (source videos listed in D/PROVENANCE.md; frames in D/images; output D/modelled/).
Hard rules: no person may appear in any texture (faces, unchecked consent) — choose clean crops, paint people out, check each texture by eye; nothing is uploaded off this machine; every dimension in a table marked MEASURED (how) or ESTIMATED/ASSUMED (why); tests only headless (blender -b) or on the agent screen (di-test-browser), never the owner's screen; open nothing for him; never pkill; no push, no merge; sterile at the end (no blender left running, test browsers down). Keep tool calls <= ~70; write your report to the file named below and return a short summary.`

const SURVEY_SCHEMA = { type: 'object', properties: {
  rooms: { type: 'array', items: { type: 'object', properties: {
    id: { type: 'string' }, name: { type: 'string' }, frames_dir: { type: 'string' }, notes: { type: 'string' } },
    required: ['id', 'name', 'frames_dir', 'notes'] } },
  floor_json: { type: 'string' }, report: { type: 'string' } }, required: ['rooms', 'floor_json', 'report'] }

phase('Survey')
const survey = await agent(`${BASE}

Your job: SURVEY. (1) Extract MORE frames from the source videos (the owner asked for more screenshots): denser sampling (e.g. 2-4 fps with ffmpeg, sharpness filter by Laplacian variance, keep the best per 0.5 s), into D/modelled/survey/frames/ with an index (video, timestamp) — never re-encode or move the sources. (2) Walk ALL the source videos listed in D/PROVENANCE.md (there may be several, e.g. 2), in time order, and make the ROOM MAP: every room/corridor of the floor (expected from the gallery report: the reference room (done), main hall, coat corridor with easels, marble stair hall, corridor with wooden doors, café/lounge — confirm or correct), which frames show each room (copy/symlink the best 40-80 per room into D/modelled/survey/rooms/<id>/), how rooms connect (which opening of which wall), and the order of the walk. (3) Write D/modelled/floor.json: ONE shared coordinate frame (origin and axes = the reference room's plan.json frame, metres), each room's rough footprint polygon, floor level, and each connection opening (position, width, height) with MEASURED/ESTIMATED marks. This file is the contract the room modellers build against. (4) Draw D/modelled/survey/floor_sketch.png (top view of the footprints + openings) and look at it. Report: ${args.reports}/SURVEY.md. Return rooms EXCLUDING the reference room (max 6), floor_json path, report path.`,
  { label: 'survey', phase: 'Survey', schema: SURVEY_SCHEMA })

if (!survey || !survey.rooms.length) { return { error: 'survey failed', survey } }
const rooms = survey.rooms.slice(0, 6)
if (survey.rooms.length > 6) log(`survey found ${survey.rooms.length} rooms; only first 6 modelled this run`)
log(`rooms: ${rooms.map(r => r.id).join(', ')}`)

phase('Rooms')
const viewerFix = agent(`${BASE}

Your job: the VIEWER BUG. On the test copy ${args.testUrl} (stack ${args.stack}, already up; check with di-dev ls) the walls and ceiling show large lighter rectangles with sharp edges that the Cycles renders do not have. Diagnose wide (state >=3 hypotheses: shadow-map/cascade bounds, lightmap or baked AO in the GLB, z-fighting of overlapping faces, environment/light probes, material emissive/normal issues, viewer exposure) and test each so it can fail, on the agent screen. Fix by the proper route: if it is the GLB, fix the generator in scripts/place/model-hall/ (build_hall.py export) — touch ONLY the export/material part and say exactly which lines, because a later assembler will edit the same scripts; if it is di.iiii viewer code, fix it in the worktree with a test. Also make model_hall.sh write place.json itself (the hand-written one is in the report's scratchpad note). Commit in ~/work/di.iiii-ch3d. Before/after screenshots in ${args.reports}/viewer/. Report: ${args.reports}/VIEWER.md.`,
  { label: 'viewer-fix', phase: 'Rooms' })

const roomResults = await parallel(rooms.map(r => () => agent(`${BASE}

Your job: model ONE room by hand: "${r.name}" (id ${r.id}). Survey notes: ${r.notes}. Its frames: ${r.frames_dir}; all extra frames and the index: D/modelled/survey/. The shared contract is ${survey.floor_json} (read it; build your room in THAT coordinate frame so it joins the others; your openings must match the connection openings listed there exactly — if the frames prove an opening wrong, write the correction into D/modelled/rooms/${r.id}/floor_corrections.json, never edit floor.json yourself). Other modellers build the other rooms in parallel: do NOT edit shared code in scripts/place/model-hall/ and do not touch other rooms' folders. Put everything in D/modelled/rooms/${r.id}/: plan.json (same schema style as the reference room's plan.json), DIMENSIONS.md, textures/ + provenance.json, build_${r.id}.py (a Blender python module with a function build(collection) that adds this room's shell + its objects — real equipment shapes where the frames show cameras, projectors, costumes, cases, chairs; simple but recognisable, not boxes where a shape is clear), and renders/: a top view and 2-3 eye-level views at 1.6 m each beside the source frame from about the same spot (compare_*.png). Iterate until YOU would say the owner recognises this room; be honest where frames do not show a wall (mark it ESTIMATED, keep it plain). Report: ${args.reports}/rooms/${r.id}.md (what was looked at, dimensions, what is guessed, self-judgement yes/no).`,
  { label: `room:${r.id}`, phase: 'Rooms' })))

const viewerRes = await viewerFix
phase('Assemble')
const assembled = await agent(`${BASE}

Your job: ASSEMBLE the floor. Inputs: the reference room (existing build), the rooms in D/modelled/rooms/*/ (reports in ${args.reports}/rooms/), ${survey.floor_json} plus any floor_corrections.json (decide each, write why), and the viewer fix (${args.reports}/VIEWER.md; its commits are in the worktree — build on them). Integrate the room modules into the generator in ~/work/di.iiii-ch3d scripts/place/model-hall/ so ONE command builds the whole floor into D/modelled/floor.glb (+ .blend) — no production names in defaults, room modules loaded from the data folder. Physics/sense check: no gaps between rooms, no wall through an opening, no overlapping floors, walkable path through every opening, nothing below the floor (extend check_glb.py). Renders: D/modelled/renders/floor_top.png and one eye-level view through each connection. Update the place on the test copy (stack ${args.stack}, name ${args.testName}; import with --no-sources) so the whole floor is walkable at ${args.testUrl} (or a new project slug, say which), and screenshot it on the agent screen. Update METHOD.md and the skill .claude/skills/video-to-3d/SKILL.md so this whole-floor-by-hand route is the recipe (with the workflow shape: survey -> rooms in parallel -> assemble -> judge). Commit. Report: ${args.reports}/ASSEMBLE.md.`,
  { label: 'assemble', phase: 'Assemble' })

phase('Judge')
const JUDGE = { type: 'object', properties: {
  pass: { type: 'boolean' }, per_room: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, recognisable: { type: 'boolean' }, problems: { type: 'string' } }, required: ['id', 'recognisable', 'problems'] } },
  viewer_ok: { type: 'boolean' }, faces_in_textures: { type: 'boolean' }, summary: { type: 'string' } },
  required: ['pass', 'per_room', 'viewer_ok', 'faces_in_textures', 'summary'] }
const verdict = await agent(`${BASE}

Your job: JUDGE, adversarially — the owner laughed at the last broken result; assume it is wrong until you see otherwise. Read ${args.reports}/*.md and rooms/*.md but trust only what you look at: every compare_*.png, floor_top.png, the through-opening renders, and the live test copy ${args.testUrl} on the agent screen (walk through each opening, screenshot each room; check the lighter-rectangle bug is gone). Open every texture and check no person/face is in any. Check the floor plan against the walk order in the videos (D/modelled/survey/). Write ${args.reports}/VERDICT.md with per-room recognisable yes/no and concrete problems, plus a 3-picture proof set (paths) the owner should look at first. Close your test browser after.`,
  { label: 'judge', phase: 'Judge', schema: JUDGE })

return { rooms: rooms.map(r => r.id), verdict }