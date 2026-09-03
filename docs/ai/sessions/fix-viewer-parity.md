## 2026-09-03 — the arrival frame and walk mode stop disagreeing (fog, motion, grid, render settings)

- A visitor meets TWO renderers a click apart, and they answered the same
  document differently. On arrival (`navMode: 'orbit'`)
  `PublicProjectSceneSurface` mounts `StudioViewport`; Walk / Fly swaps in
  `LiveProjectScene`. Four world-level fields were read by exactly one of them:
  `worldState.fog` and `components.animation`/`proximity` by walk only,
  `worldState.grid*` and `renderSettings` by orbit only.
- **Fog on arrival.** `StudioViewport` now renders `<fog>` with walk's exact
  semantics (colour falls back to `backgroundColor`, `enabled: false` switches it
  off). Deliberately narrower than walk in one respect: only an AUTHORED
  `worldState.fog` is honoured. Walk's implicit 8..50m default is composed for a
  camera standing inside the room at eye height; an orbit camera framing a large
  scene from 40m outside would wash the whole arrival to the fog colour, so
  rooms that never authored a fog are untouched.
- **Motion on arrival — AUTHORED motion only.** `useTimelinePreviewPose` became
  `useEntityPose` and now also applies `components.animation` and
  `components.proximity`, in walk's order (dimming first, authored keyframes
  beating idle motion). Two gates:
  - the existing `LiveTimelineContext` (`playTimelines`), which only
    `PublicProjectSceneSurface` sets — the Studio editor and the low-power space
    card previews stay still, because objects that drift under the gizmo cannot
    be placed;
  - a new `authoredAnimation()` resolver instead of `resolveAnimation()`. The
    latter's fallback (models float, flat media sways, anything named "fly"
    orbits) has run in walk forever and is untouched there, but reaching it from
    the arrival frame would set WCC's sculpture, the Dilijan camp room and every
    other already-published room drifting on the first frame a stranger sees,
    with no author having asked. Arrival shows motion someone chose, or none.
  The phase seed moved to `animationSeed()` in `entityAnimation.js` and is
  shared, so an authored spin does not jump when the visitor clicks Walk.
- **The floor survives the click.** Walk mode's `<Grid>` read nothing from the
  document — `args=[80,80] cellColor="#2a3038" sectionColor="#3c4654"
  fadeDistance={40}` — so every walkable room had the same slate lattice.
  It now reads the nine `worldState.grid*` fields, keeping `infiniteGrid`:
  copying StudioViewport's `args` would end the walker's floor at gridSize/2
  metres and every existing room would lose its ground.
- **`gridCellColor` never worked anywhere.** StudioViewport passed it to drei's
  `Grid` as `color`, which is not a prop — it was dropped and every grid drew
  drei's default BLACK cells, so the Studio's "Grid cell colour" picker
  (`StudioShellPanels.jsx:870`) wrote a field nothing read. Found while making
  the two sides agree; fixing walk alone would have left them disagreeing the
  other way. Now `cellColor` on both.
- **`renderSettings` in walk.** `RenderSettingsEffect` moved out of
  `StudioViewport` to `src/project/viewport/RenderSettingsEffect.jsx` and both
  surfaces mount it (toneMapping, exposure, shadowMap). Walk's `<Canvas>` also
  takes `shadows` and `antialias` from the document, and `dpr` from
  `dprMin`/`dprMax` — clamped by a new `WALK_DPR_CEILING = 1.8`, walk's existing
  ceiling: a still arrival frame can afford 2x on a retina phone, a
  continuously-moving first-person camera cannot.
- Guards: 7 new source-level tripwires in `rendererParity.test.js` (the file that
  already guards this exact class of drift) + 3 behavioural ones for
  `animationSeed`. 42 files / 273 tests green across the touched trees.
- Verified by looking, not by asserting. Local stack on spare ports (vite 5197,
  serverXR 4097, throwaway DATA_ROOT), one project authored through the API
  carrying a fog (`#e2611c`, 4..30), a magenta/yellow grid, a `spin` entity and
  `toneMappingExposure: 3`. Headless Playwright at 1440x900, anonymous, before
  (origin/dev) and after:
  - orbit before: posts white to the horizon, black grid cells, and **0 pixels
    changed** between two frames a second apart. After: posts fading orange,
    magenta cells, 13,684 pixels changed — bounded to the spinning bar while the
    static posts held still.
  - the asymmetry, on a second room holding one box with NO animation component:
    orbit **0 changed pixels** across the whole frame, walk **3,799** on the bar
    itself (cropped, so the ambient particles are not doing the arguing). The
    fallback still drifts it in walk and never touches the arrival frame.
  - walk before: dim slate floor at exposure 1. After: the authored magenta and
    yellow floor, visibly brighter. Re-authoring the document to
    `toneMappingExposure: 0.25` and re-shooting walk darkened the whole frame —
    walk is reading the field, not inheriting a default.
- Left open: `worldState.fog` has no Studio UI at all (authored via API/ops
  only), which is why so few rooms will notice the arrival-fog change. Worth a
  field in the World panel next to the grid controls.
