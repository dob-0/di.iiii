## 2026-09-28 — the Kit at /tools: every tool seen, tried and read

- `/tools` becomes the Kit (`src/kit/`): 29 cards — the 22 tools the 2026-09-28 audit saw working with
  no account and the 7 that exist only on a person's own install — grouped walk · build · nodes ·
  light & projection · carry & share · together · for agents. Each card shows the real route at
  `?preview=1` (one live frame at a time: hover or focus at a desk, the live button or scrolling into
  view on a phone, a real screenshot until it paints), a Try button at the audit's path, the public
  works made with it, the libraries at their own sites, the source files on GitHub and the wiki
  article. Install-only tools show what they print (`di` help, quoted and test-checked) and say
  where they run. "What we use" lists the stack: version, use, licence, link — checked against the
  installed packages by `src/kit/kitCatalogue.test.js`.
- The sandbox got its door: the card reads the session's own sandbox id and opens
  `/{sandbox}/studio`, where "+ New project" is; walked as a guest on desk and phone.
- Found and fixed on the way (known-fixes row): rolldown seated `@babel/runtime/helpers/esm/extends.js`
  inside `three-vendor`, so the generic `vendor` chunk imported three.js and EVERY route fetched it.
  `/tools` was 872 KB on the wire (Firefox, gzip), desk and phone alike; with `@babel/runtime` in its
  own chunk it is 516 KB desk / 448 KB phone with three.js not loaded (posters and MUI are the rest).
  `scripts/kit-first-load.mjs` measures any route; `scripts/kit-weights.mjs` writes the numbers the
  page prints.
- Studio, Nodes, Perform, Projection (desk and output) and Make honour `?preview=1`: no toolbar, no
  presence or machine link announced, and they post `dii:preview-ready` where nothing draws to WebGL.
- Verified on a local stack (ports 4382/5382, throwaway data) in Playwright Firefox at 1440×900 DPR 1
  and 390×844 DPR 3 (`scripts/kit-walk.mjs`): 0 frames on arrival, 1 after hover/tap, 1 after a second
  card; Try on Nodes, Projection, Perform, Studio opens each; keyboard reaches Try with a 2px cyan
  outline; no horizontal overflow at 390; 0 page errors. On the local stack the walk card's frame shows
  "Nothing lives at wcc" because the throwaway database holds no `wcc` space — the route is the one
  the audit saw render on the rehearsal tier.
- Still owed: the four bar links (Nodes/Tools/Light/Wiki) are 30–38px wide under a finger — the bar's
  own rule (known-fixes 2026-09-27) sets height only; the Kit's own controls are 44×44. The Projection
  desk still prints the server machine's name in Machines (audit gap, not touched here).
