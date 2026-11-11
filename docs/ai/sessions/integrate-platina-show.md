# Session note: integrate/platina-show (2026-11-12)

Owner ask (N3805): the deck and the lights are one show, in one place.

## What the branch holds
- Branch `integrate/platina-show`, cut from the deck line (`integrate/deck-round-3`, 585240f61), with the light stage line
  (`feat/platina-lights`, 6fcfbdf6e) merged in (merge base c517d8804). Merge commit 8d2a57bd6.
- Result: the VJ deck code (deck windows, MIDI map) and the light stage code (rig build scripts, lamp types, LED bar emitter,
  quality governor) in one tree.

## The conflict and its resolution
- One file conflicted: `docs/ai/known-fixes.md`. Both sides appended entries at the end.
- Resolution: keep every entry of both sides. Entry headings (`## `): base 117, deck side 134 (+17), lights side 122 (+5),
  result 139 = 117 + 17 + 5.
- `shared/projectSchema.cjs` and `src/shared/projectSchema.js` were changed by both sides and merged with no textual conflict.

## What was run on the scratch stack
- `di-dev up platina-show --api scratch`; a space and a project holding the saved VJ deck node (type `vj.deck`) were made through
  the scratch API; `stage-base.mjs` then `epic-build.mjs --hall none --apply` laid the 2026-11-12 Platina rig (v3) into that copy.
- Read back: the deck node is still the only graph node and its values equal the saved copy; 129 entities, 36 cues, 37 looks.
- The 16 asset clips of the deck have no media file in the scratch database (camera clips: 24).

## Not tested
- The unit tests were not run in this job: the show laptop's output-speed gate stayed under its floor (59.7 of 60 fps) for the whole job.
- No browser picture was taken; the Scene button and the Studio lane were not looked at.
- `physics_check.py` was not run: it needs a hall record with a shell and none exists for this rig.

## Check run, 2026-11-12 (check job: tests and browser look)
- NOT RUN: the three vitest runs and all six lane runs. The owner's output gate (scripts: platina/tools/lane_gate.sh) answered exit 1
  ("output 30.9 to 44.4 fps is under the floor 55") on 13 asks over about 11 minutes (03:06 to 03:17); it never opened. No test, no browser, no picture.
- Found by reading only: the project page address /platina-show/p/platina-show is the one-page viewer (SpaceSurfaceApp.jsx:141), not the Nodes
  editor; the Nodes editor with the Scene button is /<space>/raw/projects/<project> (scripts/deck-comfort-walk.mjs:99 uses that shape).
  The Scene button text is `Scene · N` (N objects) or `Scene` (RawEditor.jsx:3128); Studio is a bar link (SurfaceBar.jsx:40); Open VJ Deck is
  a bar button (RawEditor.jsx:3465). Tech is the address switch `?render=tech` (renderPlan.js, test renderPlan.test.js:50).
- Anonymous API read of the scratch stack answered (isOwner true, 129 objects, 52 lamps, 1 node, 36 cues), so the walk needs no login.
- physics_check.py needs a hall record (--hall) that has dims.shell (written by scripts/place/hall_shell.py --write); none exists for this rig.
- Brand: no visible change was made, so no brand line applies (no file under src/ touched).
- Walk script ready, never run: scripts/platina-show-walk.mjs (aborts /light/api/, no MIDI, clicks only Nodes/Scene/Studio/Open VJ Deck).
