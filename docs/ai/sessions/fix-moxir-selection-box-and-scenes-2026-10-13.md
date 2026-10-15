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

## 10-13 20:4x — the professional sweep brief
Owner: one best walk, every device (touchpad!), everything professional. Brief `docs/ai/cloud-briefs/2026-10-13-pro-sweep.md`: his standing decisions, one method (Nielsen heuristics + WCAG 2.2 AA + a device matrix with touchpad wheel/pinch), file ownership for six cloud agents #24–#29.

## 10-13 21:0x — physics check: beams that leave the building (hard rule 'Physics first')
Owner's screenshot from outside: beams through the roof into the sky. New `scripts/place/physics_check.py` (rest axis against the hall record's walls, floor, roof deck, lantern): 34 leaks (PL5403 at epic-build's 120 m default reach, the 12 upright side lines at their old 18 m). `--fix` set each beam.length to its first hit: v1544 → v1578, 0 leaks. Runtime clipping along a scene's current aim → cloud #31.

## 10-14 01:5x — wave A merged (#920 #921 #922 #923) + G then X
Four cloud PRs merged into the lead: #922 beams stop at the first surface at run time (beamReach.js ray cast against the building, haze only inside its box, no 120 m default in epic-build; 92 → 0 lamps past their first surface on the epic rig), #923 the Laser test (each laser unit's whole scan field drawn as a square on the surfaces with its metres; Alt+click / Shift+G selects a whole unit), #920 the view page starts clear and the Studio's 'What visitors see' manages it, #921 the select-then-move walk (not reproduced: arrows, G, R move with Select on). Conflicts kept both sides (pickPriority svBuilding + svUnit; ScenePicker laser button + remembered fold). One change of the lead's: the Studio SCENES window stays OPEN at first visit (owner 10-13 15:5x asked it open; his 20:21 'clear by default' was the view page), rememberedOpen takes the first-visit state. Fixed the walk's finding: G then X kept the Y of the free move (axis key re-based); now the constraint takes the whole move, as Blender does (ModalTransform.test.jsx). Scan angle: the LaserCube's '>37 degrees' is the maker's (ULTRA_MK2 Full Manual v1.0 p. 11, owner's SD card); the UP-LA40WF publishes none (searched 10-14, ASSUMED ±18.5° stays).

## 10-14 02:3x–03:1x — zoom back, the standard move, moving heads (click, the U), zones
Owner: "when I zoom back it is impossible to move" — measured on v2-9 (scripts/nav/measure-pan-after-zoom.cjs NAV_WHEEL=out): 12 notches back 2.8 m (last 0.07 m), then 240 px pan 0.28 m; the cause is the scene-dependent speed; #919 (the standard move, his 10-13 decision) merged into the lead (c8b7c022): 69 m / 21 m, in = out. He likes it: keep it as the baseline. "the moving heads unselectable, or when I select it shows in another place": a click on a UP-B380F selected the UP-PL5403 stage key 22 m away (its beam crosses the DJ) because RigBodies' instanced bodies carried no lamp id; fixed (1361a1d5). The U he sketched: scripts/place/move_lamps.py (new, generic: a moves file -> transform ops, backup, read-back) + scripts/place/rigs/moxir-v2-9-heads-u-2026-10-14.json; applied v1594 -> v1606, physics_check --fix 8 stored lengths -> 0 leaks (v1614). Looks NOT rebuilt (their aims are target points; a looks-only apply from the rig file would overwrite looks edited in the document). His zones: scripts/place/rigs/moxir-v2-9-zones-2026-10-14.json. Found: selecting in the Studio writes the selected lamps' transforms back with float noise (v1587-1593: rotation pi -> 3.1415853, scale 0.9999999) — the write-back storm of 10-13 is not fully gone; OWED.
- 10-14 02:5x — owner (screenshot): the U's beams "with the line of the arc … will block". Measured with the new `scripts/place/beam_clearance.mjs` (the project's hall GLB, axis + 8 rim rays): the top row at z −11.97 stopped at 10.68 m on the space-frame bottom chord line z −12; any shift of 0.5–1.25 m clears to 13.2–13.33 m. Moved 1.0 m toward the dance floor (rigs/moxir-v2-9-heads-u-clear-2026-10-14.json, v1614 → v1620, backup kept); all 18: axis at the deck (13.33) or the lantern deck (16.4), lowest rim ≥ 12.37 m; physics_check 0 leaks. Owed: the room's run-time cast should also stop beams at rig steel (crane bridges, trusses) — today only `svBuilding` meshes count.

## 10-14 12:1x — #924 view page walk merged; the standard move's newest commits
- #924 after the cloud fix (17c8c180): LiveProjectScene takes `walkLook`: 'lock' (default) keeps the pointer lock, crosshair and Esc for /build and Jam; the view page passes 'drag'. Read: the lock path is unchanged except its guard; touch stays the final else. Merged 701ea6ea. The free-move branch's f673fd93 + 27da4683 merged ebbcb176.
- Checks: vitest 24 files / 255 passed (walkInput, seams, studio/navigation, keyboard contract, walkBuild, project/components; nice, 2 workers, CPU 86–91 °C). eslint on the 11 changed files: 0 errors, 8 warnings, the same 8 as before the merge (react-hooks/refs in LiveProjectScene).
- Owed: a browser pass on the agent screen (view page drag walk, /build pointer lock); input-check.mjs and scripts/audit/viewer-navigation.cjs have not run in a browser yet.

## 10-14 12:4x–13:0x — the U's sides to the entrance; Move 1
- Owner: "yes run the U sides to the entrance". 6 + 6 side heads now 12 m apart from z −8.17 to 51.83 (1.97 m inside the entry wall z 53.8); x (−22.011 / 22.0), height 0.7 m and rotation kept; the side lines' aims are 'vertical' part rules, so no look changed. `scripts/place/rigs/moxir-v2-9-heads-u-to-entrance-2026-10-14.json` via `move_lamps.py`: v1620 → v1632, read back < 1 mm, 149 entities. Before writing, `beam_clearance.mjs` on a planned copy; after: 18/18 axes reach the deck (13.33 m) or the lantern deck (16.4 m), lowest rim 12.36 m (frame top layer, as before); `physics_check.py` 106 beams, 0 leaks. Three left heads now stand in the drawn chill zone (x −36.4…−14, z 27…53.8): asked.
- Owner: the camera movement as it is now = "Move 1", named, default, frozen; other agents' variants become Move 2… Cloud PR #927 (moves.js, Move 1 heading where Speed/Turn live, preference `di.studio.navigation.move`, golden test, decision doc). Lead review: camera values unchanged. Merged into the lead 3689f70b (15 files / 164 tests). Merge into dev refused to me by the classifier (self-approval): the owner's click.
- The look (physics first, item 3) now has a tool: `scripts/place/look_shots.cjs` (agent screen, `di-test-browser run`; finds the Studio's camera-controls through the React tree, sets each viewpoint, saves a picture; read-only, ends on about:blank). v1632, 4 views (outside left high, outside entrance high, floor entrance → DJ, floor → the left line in the chill zone): no light above or outside the hall; the side beams stop at the roof frame; the project stayed at v1632 (nothing written).
- Wave C merged into the lead: #928 a version's number from its slug (vX-Y), #929 selecting writes nothing (every transform commit goes through `transformChange`), #930 beams stop at the rig's steel (`svSteel`, `--tag-steel-only`). known-fixes rows: both sides kept. Lead fix on #929: the tolerance back to 1e-4 (the brief's 1e-6 was the lead's mistake: the measured π re-spelling is 7.4e-6 rad, so 1e-6 still wrote it); its tests now assert that noise writes nothing and the edge sits at 1e-4. vitest 195 files / 2235 tests (one test fixed: the Many call kept each lamp's own position).

## Hand-over 2026-10-14 15:45 (aylmo powers off 15:50)

- Code: lead branch `fix/moxir-selection-box-and-scenes-2026-10-13` (PR #891 into dev, the owner merges) and the served tree `~/work/di.iiii-moxir-one` (`feat/moxir-scene-bar-2026-10-12`) both at 614f95ef, pushed. dev and the owner's own di run 4a10bc1c (Move 1, #927).
- Show data: project moxir-v2-9 v1632, 149 entities, on the scratch stack moxir-one; backed up to di-spaces `scratch/moxir-v2-9-2026-10-13` @e366047 (timer every 30 min; last run 15:30, unchanged at v1632). Stack stopped cleanly with `di-dev down moxir-one` before the power-off.
- Bring it back after boot: `DI_DEV_NODE=$HOME/.local/opt/node-v24.21.0-linux-x64/bin/node di-dev up moxir-one --api scratch` then `di-dev name moxir-test moxir-one` -> http://moxir-test.diiii.localhost/moxir/studio/projects/moxir-v2-9
- Owner questions still open: (1) the 3 left heads inside the chill zone: keep or move to its edge; (2) warm washes for the chill zone and the bar; (3) should dragging a selected object move it (#921); who merged #919.
- Owed: per-beam steel report for #930 (N640); flaky dev contract input-check "first locked move (spike)" (N636.3, re-check when #891 reaches dev); #914 only without the new LaserCube refusal in `src/rigbuild/sceneDeck/model.js`; #908 and #901 still open into the lead; Studio CREATE window covers the SCENES window; stored version name "2.8"; for the 17th: walk + stress test in the hall, outdoor washes, patch + cues on the desk, versions in one place, copy v2-9 to dev (needs dev admin token).
- Old worktrees with 1-2 uncommitted files, not touched today: di.iiii-moxir-880patch, -audit-names, -bugs, -cranes-lasers, -deskplan (1 commit not pushed), -ground, -space, -stage.
