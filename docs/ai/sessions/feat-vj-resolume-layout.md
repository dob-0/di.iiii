## 2026-11-10 — VJ deck: Resolume layout in di style

Owner: "yes like resolume in di style". A layout and controls build on the EXISTING deck
(`src/raw/components/vjDeck/VjDeckView.jsx`, `src/project/tops/vjDeck.js`), not a new deck or engine.
Branch `feat/vj-resolume-layout`, on top of 64eaadab7 (bypass / solo / side / crossfade in the model).
Earlier design: di-atlas-perform `decisions/2026-09-24-vj-pure.md` (layout A).

### Layout (placement `perform` or `inside`; the node-panel `window` placement uses the same markup, compact)

1. TOP BAR, one row (`.vj-deck-top`): BPM readout, TAP, reset, "follows Light" tag | CROSSFADER
   (`.vj-deck-crossfader`: label A, range 0..1 = `deck.crossfade` via `setCrossfade`, label B) | MASTER
   slider + number | + Layer, - Layer, + Column.
2. MAIN (`.vj-deck-main`), two columns.
   - LEFT, flexible: the clip grid. First row = column triggers. One row per layer.
     Each layer's strip head (`.vj-deck-layer`): `[B]` bypass, `[S]` solo, name, clear `x`; second line:
     side select (- / A / B) and blend select; third line: opacity fader + number.
   - RIGHT, default 300px when wide, draggable 140 to 480px (the line between the grid and the monitors; kept in `di.vjDeck.layout`, see known-fixes 2026-11-11): `.vj-deck-monitors`, two 16:9 monitors stacked, each with a mono uppercase
     caption: PREVIEW (`.vj-deck-monitor--preview`: the selected clip, its live picture if playing, else its
     still, else "Select a clip") and OUTPUT (`.vj-deck-monitor--output`: the master picture that was the small
     "Out" canvas in the header, now here and bigger).
3. BOTTOM ROW (`.vj-deck-bottom`), two panels: SOURCES (`.vj-deck-sources`: Wired in 1-4, Footage, upload) and
   CLIP (`.vj-deck-clip`: speed, in, out, mode, remove; always visible when a clip is selected, no "Settings"
   click; "Select a clip" when none).

Layer drawing order: the model keeps index 0 = bottom of the stack; the grid already drew it reversed (top layer
first, as Resolume draws it). Kept as is, only the drawing order, the model order is untouched.

No effect rack is drawn: effects are not built, nothing fake goes on screen. OWED: effects rack (per layer and
master) when effects exist.

### Brand rule -> how this surface follows it (di-brand SYSTEM.md)

| rule | how |
|---|---|
| 1 one accent, meaning only | this deck's "marker" is `--di-ink` (as before): only the playing clip and an active solo use it; no new colour |
| 2 square corners | every new box uses `var(--di-radius)` (0); monitors and panels are plain rectangles; slider thumbs stay native |
| 3 1px lines | all borders 1px; the playing clip keeps its existing `inset 1px` ring, no heavier stroke is added |
| 4 no shadow / glow | none added; monitors are black rectangles with a hairline |
| 5 mono leads | captions, B/S, A/B, numbers are mono, uppercase, tracked; clip and layer names stay as they were |
| 6 motion | none added; no transition at all |
| 7 semantic triple | Bypass active uses `--di-warning` (the existing triple), not a second accent |
| tokens only | `--di-space-*`, `--di-text-*`, `--di-ink/-dim/-bg/-black/-surface-*`, `--di-warning`; only white/black rgba as before (spine.test) |

### What yields when space runs out (container query `vjdeck`)

- below 900px: monitors leave the right column and sit under the grid, side by side.
- below 560px: PREVIEW is dropped (OUTPUT stays); SOURCES and CLIP stack.
- `pointer: coarse` (and narrow viewport): the existing 44px touch targets are kept, B/S included.
- no horizontal page scroll; the grid scrolls sideways inside `.vj-deck-scroll` when columns exceed the room.

### Perform preset

`vj` gives the deck the room (wide: deck fills the area; `out`, `clock`, `master` stay in the window catalogue and
can be opened from "+ window"). Today's four-window arrangement is kept as built-in `vj-windows`, "VJ windows".

### Tested / not done

Ran: `npx vitest run src/raw/components/vjDeck src/perform src/project/tops src/styles` = 35 files, 671 tests pass
(spine.test included); `npx eslint` on the three dirs rc=0; `npm run docs:ai:check` passes.
New tests: B/S toggles (right layer, aria-pressed, titles, dimmed row), B/S reflect the deck, side select,
crossfader, PREVIEW/OUTPUT monitors, CLIP settings without a click; presets: `vj` is the deck alone,
`vj-windows` keeps the four. Adapted (not deleted): the "settings behind one button" test became "settings show
without a click"; the blend-alone-on-its-line test now allows the side select beside it; PerformDesk and presets
tests that needed the four windows now open `vj-windows`.

NOT done / not tested: nothing was looked at in a browser (no desktop, no phone, no `verify:surfaces`); sizes,
breakpoints (900 / 560) and the 44px targets are by CSS only, never measured; the 190-210px strip head with
three toggle-size buttons is untested at 390px (grid may scroll sideways there); the Wiki entry
(`src/wiki/wikiContent.js`) is not updated; the effect rack is owed (effects do not exist); the PREVIEW still for
a non-playing wired input clip shows the node picture (live), not a still.

### Round 2 (2026-11-10): the owner saw "now its black" and "there are bugs"

- Camera clip: `{ kind: 'camera', camera: '<device label>', device: '<id hint>', label }`. `expandDeck` emits the existing
  `top.camera` (values `device`, `deviceLabel`, `mirror:false`); the runner (useTopNetwork `resolveCamera`) matches the id
  first, then the label, so the label carries it to another machine. One operator per camera label per deck
  (`cameraNodeId`), shared by every layer using it: one getUserMedia. Speed/in/out/mode do not apply; CLIP shows the name and Remove.
- SOURCES gets "Cameras" (`.vj-deck-cameras`, buttons `.vj-deck-camera` aria "Camera <label>", `.vj-deck-allow-cameras`
  "Allow cameras", `.vj-deck-camera-none`): `enumerateDevices()` videoinputs, re-read on `devicechange`.
- Image footage NOT added: `top.clip` plays a `<video>` (clipVideos.js) and its picker is `pickAsset: 'video'`; it cannot draw an image.
- Side picker: options `A/B –`, `A`, `B`, wider chip, aria "Crossfader side for Layer N".
- perform/inside: layer rows share the free height (`minmax(96px, 1fr)`, row max 200px); window placement unchanged.
- PREVIEW, selected clip not playing: input shows its wired node's canvas; camera shows a private `<video>` (a second
  reader of the device, OUTPUT untouched), else name + "not playing".
- "follows Light" after reload: not a layout loss. It is `clock.leader === 'light'`, which needs the first poll of the Light
  desk (useShowClock, 0.5 to 15 s by state; none while the tab is hidden); same code as before the new layout.
