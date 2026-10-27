## 2026-10-22 — light-pixel-strip: the pixel-strip lamp in the light desk (Light v3 wave 1, step 1.3)

- New `serverXR/src/lighting/pixelstrip.js`: settings with defaults, colour order (any arrangement of RGB / RGBW), the cut into universes (170 RGB, 128 RGBW per universe, a pixel never split), refusals with plain messages, rendering into the universe buffers.
- Desk and engine: `state.strips` saved with the show; `/api/strips` routes; strips render under master and blackout; a live frame door (`/api/strips/pixels`); an own receiver per strip over Art-Net or sACN through the existing extra sends; lamps and strips refuse each other's channels.
- Page: the stage draws the strip as a line of dots, Touch shows a tile; both read the DMX the page already holds.
- Tested: `tests/test-pixelstrip.js` (24 checks: 170/128 split, start address, order mapping, overflow refusals, engine render, HTTP, reload) plus the desk's existing suites; one look on the agent screen (stage line and Touch tile, colours read back).
- Not tested: a real WLED receiver on the wire (no strip surveyed yet, PLAN 1.1).
- Owed: the strip as a file in the generated type library (needs a parametric kind in `types.mjs`), a form to add one on the page. See `decisions/2026-10-22-light-pixel-strip.md`.
