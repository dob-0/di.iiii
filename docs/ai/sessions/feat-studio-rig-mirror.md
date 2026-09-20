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

## 2026-09-20 — the button was named the same thing as an unrelated feature, and did nothing visible on an empty rig

A newcomer walk found two problems with the button above, both from the same screenshot:

- **Name collision.** Studio's Display row has "Projection" and "Rig" side by side. The
  wiki's own "The rig: machines in one room find each other" (multi-machine discovery,
  cues, blackout — a totally different feature) uses the same word for something else, and
  now sits one click away from the button a newcomer just used successfully. Renamed the
  button `Rig` → `Lights` (`src/studio/components/StudioControlCluster.jsx`) — the `title`
  ("Show the real lighting rig in the room") is unchanged, only the visible label moved.
  Updated `StudioControlCluster.rig.test.jsx` and the "lighting-desk" wiki article's own
  sentence naming the button (`src/wiki/wikiContent.js`).
- **No feedback on an empty rig.** Pressing the switch with a desk present but zero fixtures
  patched draws nothing — `RigMirrorMarkers` returns `null` for an empty fixture list, same
  as it should once the rig genuinely has nothing lit. From outside that reads as "the switch
  does nothing." Added `src/studio/components/RigMirrorHint.jsx`: on, desk present, zero
  fixtures → one line, "no lights patched yet — add them in Light", reusing
  `StudioCoachMarks`' own pill (`.studio-coach`) rather than inventing a new hint style. Not a
  dismiss-once tutorial step — no close button, it shows for as long as the state that
  explains it holds and disappears the moment a fixture is patched.
- Not solved: `RigMirrorHint` and `StudioCoachMarks` both render at
  `position: fixed; bottom` center, so if a guest's first-run coach were ever active at the
  same moment as an empty-rig Lights session, they would stack visually. Judged unlikely
  enough in practice (a guest turning on Lights during their very first session) not to be
  worth a coordination mechanism neither component has today — flagged here rather than
  guessed away.
- Tests: `RigMirrorHint.test.jsx` (4 cases, using the same `mirror` prop override
  `RigMirror.test.jsx` already established for testing without the real singleton/network).
