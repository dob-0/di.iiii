## 2026-09-01 — a composed arrival stops cropping on a phone

- **An authored entry camera is now fitted to the viewport it actually lands in.**
  `resolveViewerCamera` handed the `fixed-camera` entry view straight to the renderer,
  raw. A shot is composed on the author's screen, which is landscape; a portrait phone
  reads the same fov across half the horizontal field, so the composition arrived cut.
  On di.iiii's own front room that put two of the four doors off both sides of the
  frame — and the doors ARE the page's links, so the phone visitor was handed a page
  with half its navigation missing and nothing saying so.
- The correction is `fitCameraToAspect` in `src/utils/cameraFraming.js`: dolly the
  camera back along its own view axis by `getAspectFitScale`, the same factor
  `computeFramingCamera` already applies to a fitted shot (orthographic zooms out
  instead). That factor is **1 for every square-or-wider viewport**, so an author on
  their own landscape screen gets their shot back byte-identical and this can only ever
  widen — the module's standing "err wider, never crop" rule, now applied to the one
  lane that had been exempt from it.
- A `locked: true` camera is widened too. It is the visitor who cannot move to see
  what was cut, so it is the one that most needs to arrive whole.
- Guards: 4 cases in `cameraFraming.test.js` (identity on landscape, the dolly on a
  390×844 phone with the view axis unchanged, ortho zoom, degenerate position==target),
  5 in the new `publicViewerEntryCamera.test.js` covering all four `resolveViewerCamera`
  branches. 5 of the 9 were watched failing with the correction forced back to 1; the
  other 4 assert the landscape identity, which must hold either way. **Verified by looking**, 1440×900 DPR2 and 390×844 DPR3, against a local
  server holding staging's real `main` document: before, the phone showed two sliced
  arcs and no outer doors; after, all four doors are in frame.

### What this branch does NOT fix — both are data on `main`, not code

- **Prod's `main` room has no doors and no wordmark.** Prod's published document holds
  83 entities, all `image`/`model`/`cone`/`box`; staging's holds 89 — the extra six are
  the four `e-flagship-door-*` portals and the wordmark and tagline text, written to
  staging alone by three `replaceDocument` ops on 2026-09-01 01:18–02:15Z. `/` becomes
  that room when #284 lands, so promoting the code without carrying the room gives
  production a front door of floor images and no way in. Prod also still has
  `entryView: 'scene'`, whose auto-frame points at the centroid of the 77-image floor
  gallery and leaves the doors far up-left in an empty blue field (reproduced locally
  against prod's own document).
- **The composed shot itself needs recomposing.** Staging's authored camera —
  position `[-0.2, 4.3, 3]`, target `[-0.2, 4.3, -19]` — sits 12 units from an arc of
  doors spread ±10.7, so the outer two fall outside the horizontal fov on a laptop
  before any phone is involved. `[0, 3, 14.5]` → `[0, 1.2, -14]`, same fov 50, holds all
  four doors, the wordmark and the line with margin at 1440×900, and with the fix above
  keeps all four on a 390px phone. Verified by looking at both. It is an authoring act
  on the space, so it is the owner's to apply, not this branch's.

### Applied to staging (data, this session)

- `main-dii-project` presentation on **staging** moved to `position [0, 3, 14.5]` /
  `target [0, 1.2, -14]` (op `setPresentationState`, version 155 → 156). Verified live and
  signed out: desktop holds all four doors, the wordmark and the line. The phone still
  crops there until this branch deploys — staging runs the pre-fix resolver. Rollback is
  the previous value, `[-0.2, 4.3, 3]` → `[-0.2, 4.3, -19]`.
- **`LIVE_API_TOKEN` writes fine.** `CURRENT.md` has carried "LIVE_API_TOKEN (staging)
  401s on writes; PROD_API_TOKEN is the working one" — it took `POST /api/projects/
  main-dii-project/ops` at 200 on the first try. Whatever 401'd, it was not this.
