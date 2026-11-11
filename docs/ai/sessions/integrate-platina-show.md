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
