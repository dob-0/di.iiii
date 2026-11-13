## 2026-11-13 — Show desk: scene keys wrap into rows, Touch fits the 766 px stage window

- The owner's screenshot showed the Show desk cut off on the stage screen (1278 x 766 logical px). Rendered it read-only with
  `scripts/show/desk-shot.cjs` (files from the tree, GETs from the live desk, every other method blocked): all 26 scene keys sat in one
  sideways-scrolling row (11 visible), the look text ran under the colour dots, and the page ended well short of the window.
- `show.css` tail block only (no JS): the scene keys wrap into as many rows as the scenes need up to a cap (Compact 168 px, Touch 150 px,
  114 px with 52 px keys on a screen under 800 px high; more scroll down, never sideways); the look line stops short of the dots; in a short Touch
  window the cube preview stops growing so On / Off stay on screen. showDesk.test.js passes.
- Not done: the top bar still truncates the scene names ("MUTH 03 ...") and has an unlabeled empty field next to "Laser On". Not installed on the stage Mac:
  an install reloads the owner's pages, and the laser was armed.

## 2026-11-13 (later) — K2 map v1, big scene tiles, bigger laser side; base = the installed Show desk

- The installed Show desk UI (0.4.4-look.e3ca4567) equals branch `feat/show-desk-midi-omni-2026-11-01` (not in dev); this branch sits on it and differs from the installed
  `serverXR/src` only in showDesk/ui/{midi/README.md, midiMap.js, show.css, show.js} (`diff -rq` of the unpacked artifact). A base of e3ca4567 would have downgraded the laser UI.
- K2 map v1 (owner via the show lead): 3 faders (A1, A10+A20, rhythm layer), pots/encoders = lights, layers, fx, laser; pads A-O = scenes 0-14, pad P and EXIT SETUP = Blackout, LAYER = previous scene, pot switches park, four encoder pushes reset. New targets: `lamp:1+2`, `layer:<id>:level`, `fx:depth|bpm|mode|spatial`.
- Safety: no default target arms/Go/resumes/On/Off/lifts (vocabulary test); laser targets are ignored while every cube is `engineDark: "stopped"` and clamped to LASER_LIMITS. The limits are PROVISIONAL soft caps inside the engine's hard ranges (field-safe ranges are unmeasured). No test yet for the stopped-cube ignore (page code only).
- UI: the first 15 scenes are big tiles (5 acts x 3 rows), later scenes behind "More scenes (N)"; laser chips, sliders, cube On/Off at touch size; the page scrolls down (895 px at 766) instead of cutting.
- `midiMap.test.js` + `showDesk.test.js`: 100 passed. Not done: K2 LEDs (no code table), a page-level sweep test, the lit-tile / More-toggle click, Touch density at 766, the r-di rehearsal (ssh publickey denied).
