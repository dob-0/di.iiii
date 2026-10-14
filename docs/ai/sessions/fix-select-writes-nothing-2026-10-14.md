## fix-select-writes-nothing-2026-10-14

**Found (lead, 2026-10-14, a project's op log):** selecting lamps in Studio, no move, wrote their transforms back with float noise — rotation π as 3.1415853, scale 1 as 0.9999999, seven versions in a row.

**The paths (file:line on the base branch):**
- `src/studio/components/StudioViewport.jsx:323-332` — single gizmo release sent the whole `position/rotation/scale` read off the three.js group, so a one-field move re-wrote the other two.
- `src/studio/utils/multiTransform.js:26-41` (`applyPivotTransform`) — every selected lamp goes through compose → multiply → decompose → `Euler.setFromQuaternion`; near ±π / gimbal that re-spells the angles. Committed from `StudioViewport.jsx:469-528` (`MultiSelectionGizmo`) on `dragging-changed` false.
- `src/studio/components/StudioEditor.jsx` `handleTransformCommit`, `handleTransformCommitMany`, `handleInspectorChange` (transform) — no guard at the commit itself; `ModalTransform.jsx:136` rode `handleTransformCommitMany` unguarded.
- Selection itself (click, `BoxSelect.jsx`, shift-add, attaching the gizmo — `StudioViewport.jsx:296-305`, `tc.attach`) dispatches only `select-entity*`; none writes. The write rode the gizmo release / modal commit. The base branch already had a whole-pose 1e-4 guard in two callers (`sameTransform`); the commit and the modal had none, and a write still carried all three fields.

**Changed:** `transformDelta.js` — tolerance 1e-6 (position, scale, rotation as an orientation angle in rad); new `transformChange(stored, next)` returns only the fields past tolerance (null if none); `movedTransforms` uses it. `StudioEditor.jsx` — the three commit handlers go through it against the stored transform, so a write carries only what moved and stored numbers are never re-spelled.

**Tests:** `StudioEditorSelectWrites.test.jsx` (op-sender spy; 4), `transformDelta.test.js` (+3). Last 3 of the 4 fail on the old editor. The select-only case passes before and after — selection never wrote.

**UNVERIFIED:** the lead selects 18 lamps on the test copy and counts 0 new versions. No browser/phone run here. π→3.1415853 (7.4e-6) is past 1e-6, so it is guarded by "changed fields only" and orientation compare, not by the tolerance.
