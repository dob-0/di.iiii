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
