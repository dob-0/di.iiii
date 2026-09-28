## 2026-09-28 — the Kit at /tools: every tool seen, tried and read

- `/tools` becomes the Kit (`src/kit/`): 29 cards from the 2026-09-28 audit (22 live, 7 install-only),
  grouped walk · build · nodes · light & projection · carry & share · together · for agents; each card
  shows the real route at `?preview=1` (one live at a time, on hover/tap/scroll), a Try button at the
  audit's path, the public works, the libraries at their own sites, the source files on GitHub and
  the wiki article. "What we use" lists the stack with version, use, link and licence.
- Found and fixed on the way: rolldown seated `@babel/runtime/helpers/esm/extends.js` inside
  `three-vendor`, so the generic `vendor` chunk imported three.js and EVERY route fetched it —
  `/tools` was 872 KB on the wire (Firefox, gzip); its own chunk in `vite.config.js` takes /tools to
  420 KB with three.js not loaded. Measured with the new `scripts/kit-first-load.mjs`.
- Previews of Studio, Nodes, Perform, Projection (desk and output) and Make honour `?preview=1`:
  no toolbar, no presence announced, and they post `dii:preview-ready` themselves where nothing
  draws to a WebGL canvas.

### Where this stopped (usage limit, WIP)

- Written, NOT yet run: `src/kit/{KitPage.jsx,KitPreview.jsx,kit.css,kitCatalogue.js,kitStack.js,kitRoutes.js,kitReady.json,kitWeights.json}`; posters in `public/kit/*.webp` (from today's real dev screenshots; Light still has none — take it from a local install at /light/).
- Next: `kitCatalogue.test.js` (ids vs kitReady.json, routes via kitRoutes.js, sources exist, wiki ids, di help lines, npm versions/licences), `KitPage.test.jsx`; `scripts/kit-weights.mjs` to fill kitWeights.json; lint/build/test/docs:ai:check; fix `--di-text-1` (8px) uses in kit.css to text-2; wiki `tools-room` article + known-fixes row (vendor→three-vendor); local stack on 4382/5382, Playwright Firefox walk 1440×900 DPR1 + 390×844 DPR3, screenshots to the scratchpad `kit-build/`; PR to dev.
