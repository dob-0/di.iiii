## 2026-10-13 — Walk and Fly buttons in the Studio

Cloud routine, base `fix/moxir-selection-box-and-scenes-2026-10-13`. Owner (20:2x): "can the Studio too have the buttons Walk / Fly?"

- **Built**: two buttons in the control cluster's Tools row, after Select (`scc-btn`, `aria-pressed`, `data-walk-mode`).
  **Fly** = the existing Blender walk (gravity off, the owner's prefs; Shift+` still starts it). **Walk** = the same
  controller with gravity on: the camera falls (g 9.80665, exact step) to `EYE_HEIGHT` (1.6 m, `walkModeConfig.js`)
  above y 0 — the visitor walk's floor, since its Walker holds the eye at 1.6 m absolute — W/S move on the level along
  the heading, E/Q do nothing. **Tab** switches Walk ↔ Fly (Blender 5.2 manual, Fly/Walk Navigation,
  docs.blender.org/manual/en/latest/editors/3dview/navigate/walk_fly.html: Tab toggles gravity). Esc / left click keep
  the place, right click returns, as before. The other button switches mode; the same button leaves.
- **Bridge**: `requestWalk(mode)` dispatches a document event the in-canvas hook handles synchronously, so the click is
  the pointer-lock user gesture; `useWalkMode()` reads the running mode back for `aria-pressed` (StudioShell wires both).
- **Bug fixed on the way** (found by reading): mid-walk, E (fly up) and Tab also toggled Navigate/Edit and H hid the
  panels — the walk only `preventDefault`ed in its document capture listener and StudioShell's window listener ignores
  that. The walk now `stopPropagation`s every key while it runs (Blender's walk is modal). known-fixes row added.
- **Help**: View rows "Walk / Fly buttons" and "Tab (walking)"; the Shift+` rows in both mouse presets now say Fly and
  "Tab walks". Wiki `studio-mouse-navigation` gained the paragraph (updated 2026-10-13).
- **Tests**: touched area at base 9 files / 103 tests → 10 / 116 here (+13: 6 pure — gravity fall/landing at 30 and
  144 fps, Tab toggle, E/Q inert in Walk, level heading; 4 cluster — both buttons, order, calls, aria-pressed; 1
  keyboard contract; 2 hook bridge — button → mode, Tab, same button leaves, Shift+` → Fly, no key leaks). Both leak
  guards seen red with the `stopPropagation` line removed. Full suite after: 941 files, 10586 tests — 10523 passed,
  4 failed, 2 expected fail, 57 skipped (base ≈ 10573 = after − 13 new; no clean full base run). The 4 failures are
  `scripts/di/oneAddressPrinted.test.js` (`diiii.localhost` does not resolve in this container), untouched here.
  `test:server-contracts` 15 files / 231 passed. Lint 0 errors; build ok.
- **UNVERIFIED** (no browser run): the pointer lock taken from the button click, the fall's feel, the buttons' fit in
  the cluster on desktop; on a phone there is no keyboard, so Walk/Fly there only looks (and the cluster's phone
  layout was not checked). Whether Blender's walk uses exactly 9.80665 is unchecked. No floor raycast: a room on a
  raised stage puts the eye 1.6 m above y 0, not above the stage.
- **Next**: a desktop + phone look (`npm run verify:surfaces`) clicking Walk, Tab, Esc; then decide whether Walk should
  stand on the surface under it (Blender raycasts the floor) and whether a phone gets a joystick like the visitor page.
