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
