## 2026-10-13 — Studio selection box fits the lamp; the show's scenes selectable by default; six more MOXIR scenes

- Owner 01:33 (screenshot): a selected B380F wore a yellow box from the floor to the roof. Cause: `THREE.BoxHelper.setFromObject`
  took the entity's whole subtree, and a spot light's subtree holds its beam cone, as long as the throw. Fix: the beam meshes
  (`SpotLightObject.jsx`, three of them) carry `userData.noBounds`; the Studio draws a `Box3Helper` over `bodyBounds()`
  (`src/studio/utils/selectionBounds.js`: skips `noBounds` subtrees and helpers, unions the rest). A test pins the old fault
  (the subtree bounds span > 13 m) and the new box (0.2 m head). Limit: a rig lamp's body is an instanced mesh outside the
  entity (FixtureBodies.jsx), so the box is the lamp head, not the housing.
- Owner 01:3x "by default make the scenes selectable": `ShowChip` opens with its PREVIEW row where a look can be picked
  (`useState(Boolean(onPreview))`); it still folds. Two chip tests follow the new default.
- Owner 01:3x "write some more scenes": six looks on the v2.9 parts in the show's two colours — the tent, the DJ, the columns,
  the cut, the matrix, white out — written in `scripts/place/moxir_v2_8_floor.py` (step 3, idempotent) so the rig regenerates;
  measured against the committed rig only `looks` and `cues` changed (5 → 11). Applied to the scratch project moxir-v2-9 on the
  moxir-one stack with `epic-build.mjs --apply` (112 units re-created from the same rig, 12 looks, 11 cues); the document before
  the apply is in `~/di-backups/moxir-scratch/2026-10-13-v2-9-before-scenes/document.json`.
- Owner 15:0x "in Edit I want to move but it gets stuck, not like Blender": the modal transform's pointer handler did nothing
  without an axis (`if (!session.axis) return`), and with one it added `(movementX + movementY) × 0.02` to one coordinate.
  Now Blender's mechanics, as pure maths in `src/studio/utils/modalMotion.js` (8 tests): grab = the pointer unprojected onto
  the plane through the pivot facing the camera (the object stays under the cursor), an axis = that delta projected on the
  axis; rotate = the angle the pointer turns around the pivot's screen point (free: the view axis; X/Y/Z: that axis, flipped
  when it points away); scale = the ratio of the pointer's distance to the pivot. Incremental, so Shift (×0.1) and Ctrl (snap
  0.5 m / 15° / 0.1) work mid-drag; the first move only takes the start; numeric typing with an axis stays. ModalTransform
  tests mock the Canvas with a known camera; 45 tests pass across modal, shell and maths.
- Owner 15:3x "in Select mode Shift+move does not work": `BoxSelect.jsx` forced `middle: ROTATE` on every middle press, after
  `useCameraNavigation` had chosen the gesture's action from the modifiers (Shift = pan, Ctrl = zoom, plain = orbit, Blender).
  The override is gone; the middle button is the navigation's own in Select too. Test added (4 pass).
- Owner 15:5x "more light-show scenes I can understand; by default I can select in edit mode": the Studio followed the show
  clock with no way to pick a scene. Now `ScenePicker.jsx` (bottom-left, open by default, folds) lists the cue list with each
  look's one-line `intent` under its name; a click shows that light in the viewport (`rigLook` state in
  StudioPresentationSurface → StudioViewport → useRigLookEntities explicit); "Follow the show" = the clock, "Work light" = no look.
  `scenesOf.js` is the pure join of cues and rig looks (tests). The rig script gives every scene an intent and four more scenes
  (the frame, red floor, breath, the storm): 15 scenes. `epic-build.mjs --looks-only` writes looks + cues only, so the lamps the
  owner and Emily moved by hand stayed (applied to v2-9: 16 looks, 15 cues, 149 entities, the moved tent lamp unchanged;
  backup ~/di-backups/moxir-scratch/2026-10-13-v2-9-before-15-scenes).
- Owner 16:5x/18:2x "the moving heads are almost in the middle of the stage … the left/right lasers look only at the walls": measured
  (ledger N558.1) and arranged: the two B380F side lines on the column rows x ±11.5 (hall symmetry; seen from 100 % of a floor
  grid at eye height, pan 88 % free of columns), plane 1 behind the stage pen at z -9.0, and the six cubes' 36 lines as ONE comb
  over the dance bay (x -11.5..+11.5 on the entry wall, 0.66 m apart, 9.65 m at the wall, ≥ 9.2 m over the DJ crane; no diagonals
  to the far side walls). In the script (`moxir_v2_8_floor.py` step 2b + matrix defaults) so the rig regenerates; applied to
  v2-9 (v928 → v1017) as 89 updateComponent ops on exactly the 18 heads + 36 cube lines, derived from epic-build's own dry run
  against the live document (no unit re-created; the two 40 W at the door and every hand-moved wash untouched). Backup
  `~/di-backups/moxir-scratch/2026-10-13-v2-9-before-arrangement/document.json`.
- Owner 16:2x (screenshot after the first comb): "they light almost nothing and nowhere — the left 2 and the right ones": a comb
  over the whole bay sends the outer lines to the bay's edges, past the crowd. The comb now spans the crowd in front of the DJ,
  x -10..0 on the entry wall (the barrier's width around the DJ axis), 36 lines 0.29 m apart at 9.65 m, ≥ 9.2 m over the crane
  (`--comb-x` default). Applied to v2-9 (v1017 → v1088, 71 ops on the 36 cube lines only). Backup
  `~/di-backups/moxir-scratch/2026-10-13-v2-9-before-comb-crowd`. The real-laser look over heads is scanned FANS (sheets of
  light, laserLine.js §4 frames); the rig and epic-build carry static lines only — engine work, owed (N562).
- Owner 16:40 (screenshot): "there are objects and they will block the light path" — the right head line on the east column row
  stood under the hall's inclined gallery (massing: x 10-11.6, z 6-40, 3.2-7.4 m), beside the long pipe, the tank and the
  canopy; my blocking check had columns, deck and PA only. The hall record's `dims.zones.dance` says the used floor is
  x -11..3.5 (the roller conveyor at 3.6), so the right line stands at x +3.0, the floor's east edge, where v2.7 had it; the
  left line stays on the west row. Six head moves (v1155 → v1209 with the scenes rebuilt); every right-line beam tested
  against the massing boxes: stands inside nothing, hits nothing within 60 m. The hall's massing is now in the script's
  reasoning (step 2b); the full triangle cast (occlusion_lib.py, the laser-margin run) stays owed.

## 10-13 17:5x — right line per head on the open floor (N564)
Owner: the right beams still in the middle; check the photos and the open spaces; put them in the right place. New `scripts/place/right_line_clear.py` (every hall box grown by its stated error, the beam cast along the head's rotation, the largest clear x per head, else the floor's edge); step 2b of the rig script uses it: z 13 → x 7.0, z 19 → 3.0 (machine block: conveyor, hopper, blower, tank), z 25 → 6.0, z 31 → 6.0, z 37 → 9.0, z 43 → 8.5. Applied to v2-9 (5 head ops + looks rebuilt). Photos read: 004, 009, 023, the 09-17 walk video.

## 10-13 18:2x — beams take clicks, the place is a click on empty (N570, N571)
Owner: 'I can't move the beams', 'you can't deselect'. Cause: beam meshes refused the ray since the laser-line work, so a click on a beam fell through to the hall or the forecourt box, which got selected; nothing ever counted as empty. Now `src/studio/utils/pickPriority.js` decides from every hit: a lamp body beats a beam in front of it, a beam beats what is behind it, a locked entity is never picked, only-locked-under-the-pointer clears the selection. v2-9: place-hall and the three rig-out boxes locked (v1307). Cloud brief for the rest: docs/ai/cloud-briefs/2026-10-13-studio-workflow-sweep.md.

## 10-13 19:0x — the building switches in the Studio bar; lock no longer blocks picking (N570, N573)
Owner: 'the floor is hidden but I can't see the place where I turn the walls on/off'. The viewer page had Roof · Walls · Machines · Outside next to its SceneBar; the Studio bar never got them. Now `SmartViewBar` draws the four switches when `onLayer` is given (Studio variant; state in StudioViewport, null = all shown; `false` hides). Also: a locked object stays selectable (lock stops moves only), a plain click on the one selected object deselects it; hall + outside boxes unlocked again on v2-9.

## 10-13 19:3x — beams straight up; world axes by default, a Local button (N574, N575)
Owner: 'make the beams straight up so they are easy to edit now' → the 12 side-line heads vertical in the rig (step 2b r = [-π, 0, 0]) and on v2-9 (12 ops, v1382), looks rebuilt from the document (v1430: the scenes aim them vertical). 'Objects move around their anchor point, no way to move in the world frame' → the gizmo ran in local space: now world by default, `Local` button in the cluster (StudioShell state → StudioViewport → SelectableEntity tc.setSpace). Tests: cluster +2.

## 10-13 19:5x — the owner's decisions written down (nothing left behind)
Decision record `docs/ai/decisions/2026-10-13-views-library-words-workflow.md` (views per project, default walk+plan, per production, one fixture library with provenance, viewer loads only the project's types, words owed, connected workflow, versions in one place). Hard rule 'Nothing is left behind' in the owner's CLAUDE.md, memory, brief template, board.
