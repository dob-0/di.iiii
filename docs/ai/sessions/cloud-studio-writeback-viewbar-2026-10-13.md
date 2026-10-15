## 2026-10-13 — cloud: Studio transform write-back storm, view bar, Help rows

Brief: `docs/ai/cloud-briefs/2026-10-13-studio-workflow-sweep.md`, items 1, 2 and 4 (item 3, the Playwright walk, is
another agent's). Branch `cloud/studio-writeback-viewbar-2026-10-13` from `fix/moxir-selection-box-and-scenes-2026-10-13`
(71592a0c). One commit per item.

### 1. Transform write-back storm — `fix(studio): a gizmo release writes only what moved`
- Found: the only Studio path that writes a *decomposed* transform is `MultiSelectionGizmo` (2+ selected) →
  `applyPivotTransform`. It committed on every `dragging-changed: false`. Read in three's TransformControls: that event
  comes only from a pointer press/release on a handle — not from a document change. So the five-lamp storm is most likely
  eight press/release clicks on the multi-selection gizmo with no motion (5 × 8 = 40, the recorded count); the old path
  writes exactly 40 ops for that in the new test. The sixth lamp unwritten fits it not being in the selection.
- Measured: with a rotated pivot, an identity grab left scale ≠ 1 in 1368/2000 random cases (the pivot kept its rotation
  between grabs, so every next delta was R·R⁻¹). The ±π re-spelling was NOT reproduced (0/2000).
- Fix: `src/studio/utils/transformDelta.js` (`sameTransform`, `movedTransforms`: 1e-4 m, 1e-4 rad as a quaternion angle
  so two Euler spellings are equal, 1e-4 scale); `createPivotDrag` in `multiTransform.js` reads the selection at the grab
  and commits only what moved; the single-entity gizmo skips an unmoved release; the pivot rests at identity; the gizmo
  no longer re-attaches on every document change (entities via a ref).
- Tests: `multiTransform.test.js` +4 (document change with no gesture → 0 ops; 8 press/release without motion → 0 ops,
  seen red on the old path; release with no grab; commit against the grab's snapshot), `transformDelta.test.js` +4.

### 2. View bar — `fix(studio): the view bar mounts on its own prop`
- Found: `ViewCommandBar` and `ViewportToolbar` were gated on `setEditMode`, which StudioShell's `viewportShared` never
  carries — dead on every surface, while `studioKeyboardContract.test.js` said the bar was offered.
- Decision: hidden on the Studio surface, with the reason in code: each pane has the axis widget (six views) and the keys
  run the same `runViewCommand`; mounting it would add a row of 44 px buttons over every pane (no visual redesign). The
  bar now mounts on an explicit `viewBar` prop (default false).
- Tests: `StudioPresentationSurface.test.jsx` +1 (viewBar false, onRigLook a function), `studioKeyboardContract.test.js`
  +1 (gate is `viewBar`); both red on the old code.

### 4. Help rows — `docs(studio): Help lists click-a-beam and the locked click`
- Esc, Alt+A, L, Alt+L were already on the table; added "Click a beam" and "Click a locked object" (wording from
  `pickPriority.js`), and the same sentences in the wiki's Studio basics. Test: `StudioHelpDialog.test.jsx` +1, red
  without the rows.

### Tests
- Before (base 71592a0c, full `vitest run`): 911 files passed, 7 skipped; 10285 passed, 2 expected fail, 58 skipped.
- After (this branch, same command): 912 files passed, 7 skipped; 10296 passed (+11 new, 0 failed), 2 expected fail, 58 skipped.
- `npm run build` passed; `test:schema-sync` 64 passed; `docs:ai:check` passed.
- `npm run lint`: 0 errors (103 warnings, pre-existing count not compared). `docs:wiki:check` passed.

### UNVERIFIED
- That the owner's tab clicked the gizmo eight times — the cause is inferred from the code (the only decomposing writer,
  pointer-only trigger) and the 5 × 8 = 40 match; the session's own events were not available.
- Which float path produced the −π ↔ +π re-spelling (not reproduced; the fix's comparison is wrap-aware either way).
- Nothing was looked at in a browser (no desktop or phone screenshots); the view bar decision changes no pixels by design.

Next: item 3's walk should press the multi-selection gizmo without moving and confirm 0 ops in the op log (moxir-v2-9
or a scratch copy); then decide whether `ViewportToolbar`/`ViewCommandBar` are deleted outright (no surface mounts them).
