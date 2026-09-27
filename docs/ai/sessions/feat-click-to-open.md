## 2026-09-24 — click an object in a room to open its link

- `components.link = { enabled, href, label }` was stored by the schema and read by nothing: a
  visitor clicking a linked object got nothing. Now any drawn entity (primitives, text, image,
  video, audio, model — not portal, lights, group) with an enabled, safe link is clickable in the
  public viewer, in BOTH of its renderers: a visitor lands in VIEW mode, which is
  `StudioViewport` (via `PublicProjectSceneSurface`, `followLinks={!isPreview}`), not
  `LiveProjectScene` — that one is walk mode only. Found by driving it: a first build wired
  only `LiveProjectScene` and the arrival view did nothing. `EntityLinksContext` keeps links
  OFF by default so the same `StudioViewport` in Studio / Open Jam / space-card previews is
  unchanged; `isStudioEditorPath` is a second guard.
- What a click does (`src/project/viewport/entityLink.js`): a `/path` or a same-origin url goes
  through `enterDestination` — the doors' own route change, holding the room's last frame; an
  `http(s)` url elsewhere opens a new tab through a real `<a target=_blank rel="noopener noreferrer">`.
  Anything else (javascript:, data:, `//host`, a bare word, empty, disabled) does nothing.
- The normaliser drops non-http(s) schemes after stripping the control chars/whitespace browsers
  ignore inside a scheme (`java\tscript:`), caps href at 2048 and adds an optional `label` (≤120);
  both mirrors, held equal by a new case in `serverXR/src/schemaSync.test.js`.
- Drag vs click: R3F's `event.delta` plus raw movementX/Y summed while pressed, because desktop
  walk takes pointer lock on press — the cursor freezes, delta stays 0 through a whole look. Slop
  6 px, the figure Studio's selection uses (`SelectableObject.jsx`). Doors do NOT check this
  today (a drag that starts and ends on a door enters it) — left alone, noted for the owner.
- Hover: pointer cursor on body AND canvas (the walker paints crosshair on the canvas, which a body
  cursor never shows through — doors have this gap too), and a door-style nameplate (dark plate,
  white type) with one cyan hairline, over the object's top edge, world-sized whatever the
  entity's scale, drawn over the room (depthTest off, like LiveProjectScene's billboard titles —
  depth-tested, the plate and hairline dipped behind a slide's angled top edge). No glow. Phones
  have no hover and R3F only computes hover from pointer MOVES, so a touch press shows the plate
  until the finger lifts.
- Seen on a local stack (server :4361, vite :5191, own DATA_ROOT; the live install on :4000
  untouched), space `linktest`, two image slides: desktop 1440×900@2 view mode and walk mode,
  phone 390×844@3. Hover → pointer cursor + plate; click internal → `/linktest/second`; click
  external → new tab at example.org with `window.opener === null`, room stays; a drag starting
  and ending on a slide → no navigation, no tab; phone tap → navigates, phone swipe → nothing.
- Studio inspector: a Link section last on every linkable type (Open on click / Address / Label).
  In the editor a click still selects, as for doors (`isStudioEditorPath`).
- Wiki: "Click an object to open its link".
- Not done: links inside a portal's EMBEDDED scene are not clickable (EmbeddedEntity renders
  EntityContent directly); an external link from inside an immersive XR session opens a tab the
  headset may not show.
