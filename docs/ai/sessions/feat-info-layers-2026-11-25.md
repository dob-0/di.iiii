## 2026-11-25 — info layers: every Monitor panel says its layer, and a guard keeps private data out of the public repo

- One source of layers: `shared/infoLayers.cjs` (server) with the browser's copy `src/utils/infoLayers.js`, and a test that fails if the two drift. Three layers: personal, private, di.iiii. A panel with no layer is personal.
- The Monitor scan tags every panel, and every machines row, with its layer; the report to dev carries the tags and the server re-tags by its own map (a sender cannot pick its layer). The shared picture picks panels by layer and leaves out personal panels and personal machines (phones).
- Monitor board: each panel header shows its layer, and an All / Private / Personal filter hides panels and rows outside the pick (remembered per browser).
- `scripts/check-layers.mjs` reads the lines a branch adds and fails on a tailnet-range address outside test files and on any pattern from a private list kept outside the repo (env `DI_LAYER_DENYLIST` file, or the `LAYER_DENYLIST` CI secret). It runs in the pre-push checks and in CI, and never prints the matched text.
- Not done here: moving text already in the repo, and the old history (separate decisions).
