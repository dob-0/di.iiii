## 2026-10-01 — Studio viewport: a Blender mouse-navigation preference

Branch `feat/studio-navigation-blender-2026-10-01` (from origin/dev e5d95ac9). Not pushed.

### What it is

A per-device preference `di.studio.navigation` = `studio` (default) | `blender`, chosen in the
help dialog (Shift+? → Shortcuts → "Mouse navigation"), right above the mouse rows it changes.
That place was picked because it is where Studio already lists the viewport's mouse and keys,
so the table and the choice are read together; Studio has no other viewport preferences
panel (the account PreferencesPage is not about the editor).

- `studio` is the old bindings, unchanged: the same values are passed to `<CameraControls>` as
  before (left ROTATE, middle DOLLY, right TRUCK, wheel DOLLY, `dollyToCursor`, touch one ROTATE /
  two TOUCH_DOLLY_TRUCK, ortho left TRUCK). `mappings.test.js` pins them to the old literal.
  No listener is installed for this preset.
- `blender`: middle orbit, Shift+middle pan, Ctrl+middle zoom, wheel zoom to the pointer, left
  and right do not navigate; Alt+left / Shift+Alt+left / Ctrl+Alt+left for a mouse with no
  middle button; Auto Depth on; "Orbit around selection" checkbox (default off). Touch keeps the
  Studio gestures (the manual names no touch navigation).

### Source (behaviour only, GPL-3.0 code not used)

Blender 5.2 LTS manual, fetched 2026-10-01 from docs.blender.org/manual/en/latest/:
`editors/3dview/navigate/navigation.html` (Orbit: MMB; Pan: Shift-MMB; Zoom: Ctrl-MMB, Wheel),
`editors/preferences/navigation.html` (Auto Depth: "Use the depth under the mouse to improve
view pan, rotate, zoom functionality"; Zoom to Mouse Position; Orbit Around Selection),
`editors/preferences/input.html` (Emulate 3 Button Mouse: "MMB drag becomes Alt-LMB drag").
The Shift+Alt / Ctrl+Alt emulate rows are derived from that sentence plus the MMB rows (the
manual's table did not come through in text form). Recalled, not verified: Blender ships Auto
Depth and Zoom to Mouse Position OFF (here they are ON by design); Blender's fallback "last
selection" for Orbit Around Selection is not reproduced (no selection → Auto Depth).

### How

- `src/studio/navigation/mappings.js` — presets as data, `actionFor(preset, button, mods, {ortho})`.
- `src/studio/navigation/autoDepth.js` — `pickPivot({camera, ndc, objects, maxMeshes})`, a pure
  raycast over visible meshes, skipping `userData.noPick`, `*Helper`, `TransformControls*`.
  The adapter passes only entity groups (`userData.svEntityId`), so grid and gizmo are never
  candidates. Cost: 2000 boxes, median 0.21 ms, p95 0.28 ms, max 1.19 ms (n=50, node/vitest on
  aylmo). Boxes are 12 triangles; heavy GLTF meshes without a BVH will cost more — not measured.
- `src/studio/navigation/useCameraNavigation.js` — camera-controls 2.10.1 has no modifier
  bindings, so a capture-phase document `pointerdown` sets `mouseButtons[button]` per gesture
  (camera-controls reads them on every pointermove), then picks the pivot once and calls
  `setOrbitPoint` only when `cc.active` is false (its d.ts: "SHOULD NOT RUN DURING ANIMATIONS").
  Wheel: one pick per burst (200 ms quiet).
- `src/studio/navigation/preference.js` — get/set in try/catch, junk → studio, page-lifetime copy
  when storage throws.
- Fixed: the help said "Middle drag: Orbit"; the middle button dollies. Mouse rows now come from
  the preset (known-fixes row).

### Verified

Only unit tests: `npx vitest run src/studio` 55 files / 371 tests pass; new tests failed before
(guide test 2/2 failed on the old copy). eslint clean on changed files.
**Nothing was verified in a real browser.** No build was run (machine heat rule).

### Owed

- A look in a real browser on the owner's screen: the Shortcuts tab layout (desktop + phone),
  a real middle-button mouse in the Blender preset (orbit, Shift/Ctrl+middle, wheel toward the
  surface), a trackpad with Alt+click-drag, and the studio preset feeling exactly as before.
- KDE (aylmo) moves windows on Alt+drag by default, and macOS turns Ctrl+click into a right
  click; Alt-emulation may be taken by the desktop there. Not tested.
- Keyboard access (WCAG 2.2): no keyboard orbit/pan/zoom of the viewport exists (2.1.1); orbit
  and pan are drag-only with no single-pointer alternative beyond the smart-view preset buttons
  (2.5.7), and touch zoom is pinch-only (2.5.1). Numpad views / Home are being added on
  `feat/studio-view-keys-2026-10-01`; continuous keyboard orbit/pan/zoom is still owed.
