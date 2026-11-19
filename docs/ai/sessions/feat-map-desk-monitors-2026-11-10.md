## 2026-11-19 — the mapping desk as it ran at the bar: screens + clips, Output/Preview monitors, 61 effects, an LFO on every setting

The owner's ask (2026-11-10, from a screenshot of the bar desk): "i dont need this big here i want like output and
preview monitor also effect panels", "all like in resolume". Built 10-25 … 11-12 for the bar stage on 2026-11-13
(a window of 2 × 8 panes, one projector), where it ran. Pushed on her word (2026-11-19) so the team can see it; the
branch sits on the dev of 2026-10-25 and is not rebased yet.

- **Screens and a visuals bank** (10-25): a screen is a surface whose source is `wall`, showing its `input`
  [x, y, w, h] piece of one output-sized wall picture. `mapping.visuals` is the bank, `mapping.playing` is what is on
  the wall; ops create/set/delete/reorderMappingVisual(s) in both schema twins (`src/shared/projectSchema.js`,
  `shared/projectSchema.cjs`). `MapCrossfade` lays the new visual over the old and waits for it to be ready (4 s at most).
- **HTML visuals**: serverXR takes `.html` uploads and serves them with `CSP: sandbox allow-scripts allow-pointer-lock`
  (the desk frames them without allow-same-origin). `serverXR/src/frameRelay.js` adds a relay script to every HTML asset
  as it is served (the stored bytes are untouched), so a page's canvas reaches the desk as ImageBitmaps and can be bent.
- **One copy of each source per stage** (`mediaRack.js`) and **one WebGL context per page** (`meshRenderer.js`) that
  draws every slice and copies it onto the slice's own 2D canvas. Bending a screen never restarts its source. The relay
  pump asks for the next frame on every desk frame (+8 ms), not on arrival: one-frame-in-flight had halved 61 fps pages.
- **The Mapping window, our own** (`MapAdvancedOutput.jsx`, `MapSliceCanvas.jsx`, `sliceGeometry.js`): one wall view, no
  modes. What is under the pointer decides the drag (inside = move, corner = pin, edge = stretch, knob = turn,
  double-click = bend). Warp grid, flip, cut-out (`isKey`), black behind, colour, blend edges (`softEdge`), input
  rotation. Revert restores the snapshot taken at open.
- **The desk = Resolume's composition window** (`MapDeskDock.jsx`, `mapDesk.css`, `MapSplit.jsx`): Output over Preview on
  the left, clips over effects on the right, three draggable dividers (kept per browser). A clip's picture plays it,
  its name opens it; Preview has a red outline, LIVE stays cyan. Tile size slider, Delete with undo, drag to reorder.
  Floating windows were tried and rejected by the owner ("all be in one ecosystem"): don't bring them back.
- **Effects**: 61 types (`visualEffects.js`), per clip (`visual.effects`, `visual.opacity`) and for the whole wall
  (`mapping.effects`). GL path in `meshRenderer.js` (one shader per effect, two FBOs); `MapFxDom.jsx` is the CSS path for
  iframes (colour, blur, transform, flip, strobe). No trails or glow, on purpose.
- **Each clip's own settings** (`visualParams.js`, ISF-like): a page posts `di-visual-params`, the desk answers with
  `di-visual-set`; the spec is kept in `visual.paramSpec`, the values in `visual.params` (undoable), a picture in
  `visual.thumb`.
- **An LFO on every setting** (`paramLfo.js`, the laser desk's shape `{ on, wave, beats, depth }`), on `effect.lfo` and
  `visual.lfo`; rates take none. The beat (`deskBeat.js`, `useDeskClock.js`) is the desk tempo (`mapping.tempo`, typed or
  tapped), or, while it is up, the bar's audio engine at `http://127.0.0.1:4780` (its SSE, read only). That engine is
  not in this repo.
- **Known open**: the effect-card grip reorder is unverified in a real browser (Playwright's HTML5 drag never fired);
  the engine address is fixed; Firefox untested; no Resolume XML / NDI out / OSC.

## 2026-11-19 — the desk audit's fixes (made 11-12, never on the bar's wall)

A desk-tester pass on a copy of the bar project (11-12), fixed in a separate tree so nothing reloaded under the
projector; they arrive here as their own commit, so they can be read or dropped apart from what ran.

- Mapping window: slider keys, the wall size read lazily, bounds, Ctrl+X, cascading paste, rename.
- Desk: FillBar no longer passes its clicks through; deleting the live clip asks twice; notices time out; Autopilot
  (the engine's, `POST /api/set {patch:{auto}}`, on click only) in the top bar and in the Mapping window head.
- `mediaRack`: at most 2 idle pages kept; `MapScreenParts`: the file check and short file names.
- Both schema twins: the inverse of `deleteMappingVisual` keeps `playing`.
- serverXR `assetScrub` reads a buffer, so GIF/WebP uploads work on Windows (a server restart takes it in).
- Guards: deckDelete, deskAutopilot, visualUploadCheck tests; known-fixes entries; wiki.
