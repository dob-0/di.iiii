## 2026-08-05 — Shared frame-exact timeline core + Raw Timeline node

`src/project/timeline/timelineCore.js`: frame-exact clip maths (move, trim,
razor, ripple, retime 0.1x–4x, gap detection) shared between a new Raw
`view.timeline` node (`TimelinePanelWindow.jsx`) and algovrithm's director.
Gaps draw as red hatching, cross-fades in amber, so an accidental hole in a
cut is visible rather than silent.

## 2026-08-05 — algovrithm's director: moved into Raw, then generalised

Two commits, reconciled here against ~94 commits of independent `dev` drift
(see below):

- **The director physically moved** out of `src/algoVrithm/` into
  `src/raw/algovrithm-director/` (later renamed `src/raw/director/`), and a
  new `view.director` Raw node (`DirectorPanelWindow.jsx`) hosts it.
- **Generalised the same day**: the panel no longer imports algovrithm
  directly — everything piece-specific (baseline edit list, asset library,
  `AssetClip` renderer, palette) arrives through a descriptor in the new
  `pieces.js`. Adding a second piece is a registration, not a fork. The save
  endpoint now takes a piece id from the browser and resolves it against a
  server-side allow-list (`hasOwnProperty`-guarded against `__proto__`)
  instead of trusting a path from the request.

### Reconciled against dev, not just rebased

`dev` had independently built **`StudioCodeSpaceDirector.jsx`** — a real,
shipped Studio page that mounts `AlgoVrithmExperience` with
`embedded`/`director` props to render the *full* original in-piece director
(panel, gizmo, orbit camera, split layout) inside Studio's own chrome. This
branch's own refactor commit deletes exactly that machinery from
`AlgoVrithmExperience.jsx`, on the premise that the director's only home is
now Raw. Applying it as-written would have silently broken a real, currently
working feature this branch's author never saw.

Both are kept: `AlgoVrithmExperience.jsx` still hosts the embedded director
when `director`/`embedded` are set (what Studio's page needs), and Raw's
`view.director` node is a second, independent way to reach the *same*
`DirectorPanel` component — both now take a `piece` prop. `docs/ai/roles/
xr-creator.md` and the wiki's `algovrithm`/`raw-lane` articles were corrected
to describe both paths rather than the refactor's original "no editor left in
the piece" framing.

`dev` had also independently shipped `useSavedTiming.js` (space-settings-
backed timing, so the piece can be retimed from di-studio.xyz without a dev
server) — this postdates the branch's own commits, so neither of its
`DirectorPanelWindow.jsx` versions used it, starting every session from the
raw file and (once `onSaveTiming` is wired) silently discarding the current
space's saved timing on the first save. Wired `useSavedTiming` into
`DirectorPanelWindow.jsx` too, gated on `piece.id === 'algovrithm'` since the
space-settings fallback isn't generalized to other pieces yet — a future
piece gets its own raw baseline, not silently algovrithm's timing.

One real merge bug, self-caught: a context-based auto-merge silently dropped
`createEdge` from an import line in an earlier commit of this same branch —
caught by `npm run lint`, not by the merge itself. Fixed in a follow-up commit
on `feat/raw-studio-node` (PR #99), same root cause.

Left open, per the branch's own commit message: 3D placement in
`DirectorPanelWindow` — the gizmo/orbit/standpoint components moved into Raw
but need the piece's own Canvas mounted inside the window before they can
attach to anything; `onPlace` currently only selects the row.
