## 2026-09-28 — walk-mode mouse look in game units: sens + DPI ↔ cm/360, raw input, 89° pitch, a Look panel

- **What changed.** Mouse look was one bare number, 0.0117 rad per movementX unit (≈ 2.6 cm/360
  at 800 DPI on the owner's DPR 1.5 screen). It is now the model every PC game and sensitivity
  converter uses: degrees per count = sens × the game's yaw (CS2/Apex/Source 0.022, Valorant 0.07,
  Overwatch 2 0.0066, Fortnite config 0.5555), cm/360 = 360 / (sens·yaw·DPI) · 2.54 —
  `src/components/lookSensitivity.js` (pure, sources in its header). Default CS2 1.25 @ 800 DPI =
  41.6 cm/360, for looking round a hall rather than flick aim (CS2 pro median ≈ 830 eDPI ≈ 50 cm).
- **Per viewer.** `lookSettings.js` (localStorage `di.iiii.look.v1`, every access in try/catch),
  `LookSettingsPanel.jsx` — a LOOK button bottom-left in walk mode (desktop, only while the pointer
  is free): game, sens, DPI → live cm/360 · eDPI · °/count; FOV; invert Y; head bob; Reset.
  Chrome is the Sound switch's (mono, white on glass, no colour).
- **Raw input.** `rawPointerLock.js` asks `{ unadjustedMovement: true }` (W3C Pointer Lock 2.0),
  retries plain only on NotSupportedError, remembers that per UA. Measured: Chromium 153.0.8010.52
  (flatpak, X11) and headless 151 both REJECT it on Linux; the plain retry inside the same click
  is granted (≈ 7 ms extra, headless).
- **movementX → counts, measured.** Chromium X11 at DPR 1.5: 200 px of X relative motion arrived as
  ΣmovementX 133 (CSS px, fraction carried). So counts = movementX × DPR without raw, × 1 with raw.
- **In the app (MOXIR hall, Vite on :5391 proxying the local install, real XTest input on a private
  rootful Xwayland :7, DPR 1.5):** 1000 counts → 26.94° turned vs 27.50° expected (0.02694 °/count
  vs 0.0275); 3000 counts → 81.9° (step 10) / 81.1° (step 50) vs 82.5°. The app's math is exact
  against the movementX it received (653 units × 1.5 × 0.0275° = 26.936°); the 1–2 % shortfall is
  movementX lost between X and Chromium around its lock warps, larger with bigger steps. Not seen
  on the owner's own Xorg. Before, the same 653 units turned 653 × 0.67° = 438°.
- **Bug found and fixed: slow looking dropped the lock.** Same rig: 60 counts one per frame → the
  lock was "broken" and released after 27 units. `brokenLockDetector.js` now flags only windows
  that go nowhere or repeat one delta; known-fixes row + `brokenLockDetector.test.js`.
- **Pitch** 89° walk (Source cl_pitchup/down), 89.5° fly. **Drag/trackpad/touch** keep their old
  numbers at the default and scale with `lookFeelScale()`. **No smoothing added**: events are
  applied on arrival; an optional easing was considered and not built — nothing measured says it
  helps, and any easing is added latency.
- **FOV** is applied by `LookFov.jsx` (mounted beside the Walker while walking, restores the camera's
  own fov after). **Head bob** (default OFF, as the movement lane chose) is read by the movement
  lane's loop through its stub `src/components/walkLookSettings.js` (feat/elite-move); at
  integration its body becomes
  `import { getHeadBob } from './lookSettings.js'` +
  `const ON = Object.freeze({ bob: 1 }), OFF = Object.freeze({ bob: 0 })` +
  `export function getLookSettings() { return getHeadBob() ? ON : OFF }` — no per-frame allocation;
  keep its name (lookSettings.js has its own `getLookSettings()` returning the full panel state).
- **Audit, not changed:** `src/algoVrithm/LookAround.jsx` (drag-a-photo panorama, damped, a work —
  outside the platform boundary) and `src/raw/director/OrbitView.jsx` (orbiting an object) are
  grab controls in CSS px, not first-person mouse aim; a counts model does not apply to them.
- **Owed / unverified:** raw-input branch on Windows/ChromeOS (spec + Chromium docs, not measured
  here); the owner's own Xorg + real mouse (his OS acceleration profile decides whether cm/360
  holds — the panel says so); the owner's look on his screen. The in-app runs above were made before
  the heat rule and did not log their WebGL renderer (the probe now refuses a software one). NOT run
  after the heat rule: the headed re-check of the slow-pan fix and `npm run check:input` (its
  headless 3D is barred on aylmo at 98–100 °C); run both on a cool machine before landing.
- Probe: `scripts/look-probe.mjs` (header has the private-display recipe).
