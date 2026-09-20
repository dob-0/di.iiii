## 2026-09-20 — the real lighting rig, mirrored read-only into the Studio room

Step 2 of "one project is one stage" (`di-atlas/decisions/2026-09-20-one-project-one-stage.md`).

- `src/rigMirror/fixtureColour.js` — a pure port of the lighting interface's `liveColor(f)`
  (that file is a plain browser script, nothing exported). Held to it by
  `fixtureColour.contract.test.js`, which lifts the ORIGINAL function out of
  `serverXR/src/lighting/ui/app.js` by text and compares both on every built-in profile.
  Seen failing on a one-digit change to the warm/cool mix.
- `src/rigMirror/useLightingMirror.js` — one reference-counted store per page: probe
  `/light/api/summary` once (real JSON only), then `/light/api/state` every 5 s and
  `/light/api/dmx` at 10 Hz, only while someone is looking and the tab is visible. A desk that
  was never there is asked once and never again; one that went away is re-asked every 30 s.
  GET only — nothing here can move a lamp.
- `src/studio/components/RigMirror.jsx` — one small emissive sphere + `<index>.<name>` label per
  fixture. PROVISIONAL mapping, constants in `RIG_FLOOR`: plan x,y 0..1 → world X,Z −5..+5 m,
  y = 0.1 (a fixture has no height yet). Not objects, no raycast, not in the document, drawn
  only when Studio passes `rigMirror` and never when `playTimelines` (the published viewer).
- One button, "Rig", in the control cluster's Display row, drawn only when a desk answered;
  off by default; remembered under its own localStorage key `dii.studio.rigMirror.v1`.
- The brief said `src/light/`. That folder cannot exist: Vite's dev proxy sends every address
  starting with `/light` to the backend, so the module 404'd and the button never drew. Found
  by driving the page, not by a test; now in known-fixes with a guard.
- Looked at, headless Chromium + SwiftShader, 1440x900 @2x, against a throwaway desk (output
  off, scratch data dir): warm markers, colours following a desk change, blackout as dim grey,
  off. NOT verified: a real rig, a phone, split viewports, a desk with hundreds of fixtures.
- Still open: opening Studio on a local install now makes one request to `/light/api/summary`,
  which builds the (output-off) desk the way the Spaces hub's own probe already does.
