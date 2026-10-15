## 2026-10-13 — cloud: the Studio walked as the owner does (brief item 3), two defects fixed

Brief: `docs/ai/cloud-briefs/2026-10-13-studio-workflow-sweep.md`, item 3 only (items 1, 2, 4 belong to another agent:
transform write-back, the view bar, the Help table — not touched). Base `fix/moxir-selection-box-and-scenes-2026-10-13`
@ 71592a0c.

How it was walked: a local stack in the cloud container (`npm run dev`, scratch `DATA_ROOT`), an account from the
run-di-iiii driver, a space `walk` with project `walk-rig` = a LOCKED box place (8 × 4 × 0.5 m at z −3) + three spot
lights with visible beams (A at (0,3,2), B at (0,1.5,−1) behind A's beam from the camera, C at (2.5,3,0)) + a `rig-show`
group with two rig looks and two cues. Headless Chromium 1194, SwiftShader GL, 1440×900 at DPR 2, and a 390×844 phone.
Screen points are the entities' own world points projected with the live r3f camera (`_roots` from the page's own
`@react-three/fiber` module); "selected" = the Box3Helpers in the scene + the name pill + the Objects rows' `aria-pressed`;
document state = GET `/document` after 1.5 s. Panels hide with H first (at 1440×900 lamp C sits under the right panel).

### Defects found, measured

| # | Repro | Before | After | File |
|---|---|---|---|---|
| 1 | click lamp B's body through lamp A's beam | Lamp A selected | Lamp B | `StudioViewport.jsx` (SelectableEntity) |
| 2 | select A, click the locked place where nothing else is | A stays selected | nothing selected | same |
| 3 | select C, Shift+click B's body through A's beam | A added | B added | same |
| 4 | Navigate, Alt+A, drag 26 px starting and ending on A's beam | A selected | nothing | same |
| 5 | Objects: select Lamp B, Hide, G, move 80 px, click | B moved x 0 → 0.54 m, hidden | stays at x 0 | `StudioViewport.jsx` → ModalTransform |

1–4 are one cause: `pickPriority.js` ran only in a GROUP entity's click; a lone object's group picked itself on the
nearest hit, returned on a locked entity (so `onPointerMissed` never fired: nothing counted as empty), had no delta guard,
and carried no `svPick`/`svLocked` flags (so even the group rule read nested lamps as non-bodies). Commit 1:
`handlePickClick` + `pickUserData` used by both. Commit 2: `movableEntities()` (shown and not locked) is what G/R/S move.
Each has a known-fixes row and a test whose source contract fails on the old file (measured).

### Walked and right (no change)

Click a beam → its lamp; Esc and Alt+A deselect; G/R/S then Esc → transform unchanged, selection kept; G then click →
moved (0.306 m), selection kept; L locks the selection, Alt+L unlocks everything (the place too — as designed); a locked
lamp behind a beam gives the beam's lamp; E → Edit, the Select tool lights beside Edit; B + drag box-selects exactly A and
B (place locked); Scenes picker: Work light / a scene / Follow the show each `aria-pressed` alone; Preview opens
`/walk/p/walk-rig` with no slug and `/walk/rig` with slug `rig`; Objects window row click selects, Hide/Show and Lock
write `runtime.visible` / `runtime.locked`; phone tap on B selects B. Zero console or page errors in every walk.

### Not fixed — for the PR body

- At 1440×900 the default panels (Create, Objects+Inspector, project) cover about two thirds of the viewport; lamp C
  could only be clicked with the UI hidden. Layout, not a bug; no redesign here. Size: owner's call.
- A selected-but-hidden object stays selected (only G/R/S now skip it). Blender deselects on hide. Size: S (one
  dispatch in the hide handler), not done because it changes selection behaviour the owner has not asked for.
- PUT `/document` without `projectMeta` reset the project's title to "Untitled Project" (seen while seeding). Cause
  UNVERIFIED; serverXR, outside this brief.

### Tests

- Before (base 71592a0c, clean worktree, no `.env.local`): 918 files, 10284 passed, 1 failed
  (`followIntegration.test.js` "agrees on the host's value…", a serverXR timing test this change does not touch).
- After (this branch, same conditions): 918 files, 10293 passed, 0 failed — +8 tests (6 in `pickPriority.test.js`,
  2 in `selectionTools.test.js`); the follow test passed this time, so its earlier red reads as timing (UNVERIFIED).
- `npm run lint` 0 errors (103 warnings, none new in the touched files); `docs:wiki:check`, `docs:ai:check` pass.
- No wiki entry: these make the lead's documented picking rule true; the Help table is item 4, another agent's.

### UNVERIFIED

- Real GPU, real MOXIR project (rig bodies are instanced, `FixtureBodies.jsx`; their click path `pickLampBody` was not
  walked); the dev tier; a touch drag on the phone; lamps nested inside a group entity (unit-tested, not walked).
- G with only a locked object selected and no Esc afterwards (walked with Esc; G worked after).

Next: owner or lead decides the hide-deselects question and the panel coverage; the other agent's items 1, 2, 4 land
on the same base.
