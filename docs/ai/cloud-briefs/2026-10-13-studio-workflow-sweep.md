# Cloud brief — the Studio workflow sweep (2026-10-13)

Owner's words (10-13 18:0x): *"I want to arrange manually … there are little bugs, e.g. you select a model, finish with it,
and you can't deselect … check all kinds of such bugs everywhere … go fix that."* Lead: dob-b7 (MOXIR lead). Ledger N571.

## Where the code stands
Base branch: `fix/moxir-selection-box-and-scenes-2026-10-13` (PR #891 into dev; dev + today's Studio work). Today the lead
landed on it: selection box on the lamp body (`src/studio/utils/selectionBounds.js`), G/R/S Blender modals
(`src/studio/utils/modalMotion.js`, `ModalTransform.jsx`), the SCENES picker (`ScenePicker.jsx`), a Preview button, and —
last — priority picking (`src/studio/utils/pickPriority.js`: a lamp body beats a beam in front of it, a beam beats what is
behind it, a locked entity is never picked and only-locked-under-the-pointer clears the selection; beam meshes in
`src/objectComponents/SpotLightObject.jsx` carry `userData.beamPick`). Esc and Alt+A deselect (`StudioEditor.jsx`).

## Bugs with evidence (fix these; one commit each, a unit test each, no visual redesign)
1. **Transform write-back storm.** After the lead moved five lamps by api ops (project moxir-v2-9, v1210 → v1263: 5
   position patches + 48 look ops), the owner's open Studio tab wrote 40 ops of its own (v1264–v1303): `updateComponent
   transform` on exactly those five entities, 8 rounds each, position unchanged, rotation alternating between
   `[-3.14159265, ~0, -0.5236]` and `[+3.14159265, ~0, -0.5236]` (the same orientation, two Euler spellings), scale
   `0.9999999…`. The sixth moved lamp (rig-beam-planes-16, stored rotation `[-3.1416, 0, -0.5236]`, scale `[1,1,1]`) was
   not written. So: something in the Studio writes a decomposed three.js transform back into the document when the
   document changes under it and the float32 decomposition differs from the stored numbers; it does not converge because
   ±π flips. Find it (`grep -n "updateComponent" src/studio` for writes with rotation+scale; the gizmo / ModalTransform /
   any effect on `[entity.components.transform]`), make it write only after a user gesture, compare with a tolerance
   (1e-4 m, 1e-4 rad, Euler wrap-aware), never on a remote change. Test: a document change with no gesture → zero ops.
2. **The Front/Back view bar is dead on the Studio surface.** `StudioPresentationSurface.jsx` passes `setEditMode`
   undefined (ScenePicker's guard is `onRigLook` only, by the lead, 10-13). Wire the view bar on that surface or hide it
   there with a stated reason; test the prop contract.
3. **Walk the Studio as the owner does** (Playwright, headless Chromium, software GL is fine for DOM and picking; `npm ci`
   first; `di-dev` does not exist in the cloud — `npm run dev`-style local server is fine THERE only, never on aylmo):
   open a project with a place model (box) + 3 spot lights; click a beam → its lamp selected; click the lamp body
   through another lamp's beam → that lamp; click the place when it is locked (Studio L key) → nothing selected; Esc and
   Alt+A; box-select; G/R/S then Esc cancels, click confirms; Edit/Select modes; the SCENES picker (Follow the show /
   Work light) when `rigLooks` exists; Preview opens `/<space>/<slug>`; the OBJECTS window select/hide/lock. Every
   defect: a repro line + the file; fix the small ones (each its own commit + test); the rest in the PR body as a list
   with sizes.
4. **Help table** (`src/studio/components/StudioHelpDialog.jsx`, test exists): add rows for click-a-beam, click the
   locked place to deselect, L / Alt+L lock, Esc / Alt+A deselect, if they are missing.

## Rules
Read `CLAUDE.md`, `docs/ai/vocabulary.md`, `docs/ai/known-fixes.md` first. Measured, never claimed: counts of tests
before/after; every claim you did not run is UNVERIFIED. No new UI shapes (rectangles, 0–2 px). Branch
`cloud/studio-workflow-sweep-2026-10-13` (or `claude/…` if forced) from `origin/fix/moxir-selection-box-and-scenes-2026-10-13`;
push ONLY that branch; the pre-push gate (`scripts/push-checks.sh`, needs `npm ci` in root and `serverXR/`) wants a session
note `docs/ai/sessions/cloud-studio-workflow-sweep-2026-10-13.md` with a real `## ` heading. DRAFT PR into the base branch
titled `[cloud] Studio workflow sweep`. End: tests before/after, what changed, UNVERIFIED list, a `Next` line.
