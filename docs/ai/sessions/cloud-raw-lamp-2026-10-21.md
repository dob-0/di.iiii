## 2026-10-21 — Lamp: one stage lamp in Nodes, the same DMX bytes as the desk

- `shared/lampDmx.cjs` (+ its generated browser twin `src/shared/lampDmx.js`, written by
  `scripts/rigbuild/lamp-dmx-twin.mjs`): a lamp's mode (the fixture library's channel list) and what it
  is told (Dimmer, Colour, Pan, Tilt, Strobe, Zoom, 0 … 1) → its DMX bytes, by the desk's own rules
  (rigpatch.js channelsFor for the profile, engine.js render for the bytes). 16-bit pan/tilt/dimmer where
  the mode has the fine channel; an unwired Strobe/Zoom leaves the chart's resting value.
- `src/shared/lampDmx.test.js` holds it against the REAL desk: every mode of the fixture library (36 modes
  of 13 types) is patched on a throwaway desk through `/api/rig/patch`, told 5 things at 2 masters, and the
  desk's rendered bytes must equal ours — 360 lamp comparisons; plus 2 fixtures imported by library.js
  toProfile (20 more). Breaking one rule (emitters not scaled by a missing dimmer) fails 3 of its tests.
- The node `light.lamp` (**Lamp**, family the scene, spatial-3d): config Type/Mode/Universe/Address, outputs
  `dmx` ({ universe, address, values } or null) and `patch` (where it sits, or why it sends nothing). In
  `RawViewport.renderNodeBody` it is a box of the type's published size turned by Pan/Tilt over the
  type's range, with Studio's `SpotLightObject` beam (the same beam, the same reach probe) — no second beam.
- Raw's solid shapes (cube, sphere, plane, cylinder, cone, torus, circle, model, constructor) now carry
  `userData.svBuilding` (`src/raw/utils/beamStops.js`), the tag beamReach.js casts against — without it a
  beam in Nodes never stopped on anything.
- `STANDING_NODE_KINDS` 17 → 18; the Lamp is kept out of card previews (a metres-long beam framed on a card).
- Palette: typing "lamp" + Enter now places the Lamp node (a stage fixture, per vocabulary.md), not a point
  light thing; "point light" still finds that.
- NOT done: DMX Out does not take a Lamp's `dmx` wire yet, so the bytes do not leave the graph; Type and
  Mode are free text (no option list — the registry cannot import the library's JSON under plain node);
  the body is a box, not the type's GLB model; Strobe does not flash the drawn beam; a colour wheel is not
  driven by Colour. Not looked at in a browser, desktop or phone.
