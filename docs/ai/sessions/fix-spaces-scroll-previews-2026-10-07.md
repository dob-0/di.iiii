## 2026-10-07 — space cards show a still picture; the live frame only under the pointer

- Bug P5 (real-mouse walk): the spaces page scrolled janky. Cause measured on dev.diiii.xyz /spaces: every card with no cover image mounted a full app iframe (12 at once, 5 WebGL canvases among them) and kept it while on screen.
- Fix: the `?preview=1` frame posts a JPEG still of its canvas once painted (`dii:preview-poster`, `src/utils/previewMode.js`); the card (`SpaceCardPreview` in `SpaceHub.jsx`) shows it and drops the frame, so its WebGL context is freed. The live frame returns only under a hovering pointer after 350 ms. Boot ceiling 12 -> 4. Stills are cached for the tab (sessionStorage). Cards with a stored cover image are unchanged.
- Measured on a vite dev server (unbundled modules), same machine, base vs after; a production-build run and the 1920x1080 / 390x844 matrix are in the report fix-g4-spaces-perf.md. Owed: a hover-live look by the owner; a production-build measurement.
