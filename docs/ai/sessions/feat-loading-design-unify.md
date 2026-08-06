# Session notes — feat/loading-design-unify

## 2026-08-07 — every loading state unified onto the one loading design

- The canon was already written (`src/components/LoadingScreen.jsx` — black, one 34px
  spinner, no drawn words, sr-only label, reduced-motion pulse) but a full inventory
  found 4 competing loading vocabularies still shipping: six `fallback={null}` blank
  waits on the public `/{space}` route, a red-ring near-clone in `LiveProjectScene`
  (36px/750ms/#d90000, no reduced-motion), drei's stock `<Loader/>` with drawn "NN%"
  text permanently mounted in V1 (able to double-render over the canonical screen),
  MUI `CircularProgress`/`LinearProgress` in AuthGate/AccountButton/AssetOptimizationDialog,
  and ~25 bare "Loading..." texts / silently-disabled busy buttons across Studio, Raw,
  admin, and the project switcher. In 3D, models/images/videos/embedded portals were
  simply absent until loaded, and load errors rendered nothing.
- Added `LoadingInline` (named export beside `LoadingScreen`): 13px currentColor
  arc-on-ring, drawn label inheriting host typography, `announce` for spinner-only,
  same 820ms rhythm and reduced-motion pulse. House pending vocabulary: busy controls
  keep their words + typographic ellipsis ("creating…"), never a bare disable.
- Added `LoadingBounds` (`src/objectComponents/`): shared faint breathing wireframe box
  for in-scene loading, danger-tinted on error, `raycast={() => null}`, module-scope
  shared geometry/materials, static under reduced motion. Wired into ModelObject,
  ImageObject, VideoObject, PortalObject's EmbeddedScene — gated on "an asset is
  actually assigned" so empty slots stay empty.
- `src/index.html` now carries a pre-hydration copy of the canonical frame (inline
  CSS) — the cold-load first frame was browser-white before.
- Every `RouteSurfaceFallback` call site got a specific label; `ProtectedSurface` grew
  `fallbackLabel`. WCC's scene fallback deliberately stays visually inert (stacking
  context would trap the fixed screen under the warp overlay) but now announces.
  AlgoVrithm's opening void kept byte-identical, only made announceable.
- `.status-bar` (V1) mapped off Tailwind hexes onto `--di-cyan`/`--di-success`;
  AssetOptimizationDialog got a local system indeterminate bar (`.sao-progress-bar`).
- Guards: `LoadingInline` contract tests in `LoadingScreen.test.jsx`; source contract
  in `SpaceSurfaceApp.test.jsx` rejecting `fallback={null}`. Known-fixes row added.
  Wiki article `one-loading-language` added.
- Verified: full suite green (1783 unit + 77 server contracts — the first run's 76
  "failures" were just missing `serverXR/node_modules` in the fresh worktree), and
  SEEN in a real Chromium (repo playwright) on desktop + 390px phone viewports:
  gallery of inline states, canonical full screen, pre-JS boot frame, stalled-chunk
  route wait, stalled-backend AuthGate error card, and the restyled LiveProjectScene
  overlay (computed: 34px / rgba(255,255,255,.85) arc / 820ms / #000).
- Still owed a human look: the in-3D `LoadingBounds` placeholders (need a scene with
  a slow-loading model — no authenticated space was reachable from the throwaway
  browser), and the WCC dive-transition fallback under a real slow network.
- Six parallel agents did the fix fan-out; one ran a bare `git stash` mid-flight in
  the shared worktree and briefly reverted others' edits — recovered fully (all
  reports re-verified on disk afterward). Reminder that the no-bare-stash rule exists.
