## 2026-10-15 — `npm run desk:bundle`: one command writes what a node build consumes

- Step D4 of vizzz.di `docs/DI_DESK_UI_PLAN.md`. Branch is `dev` plus PR #941 (D2/D1) merged in; the merge conflicted only in `known-fixes.md` (both sides' rows kept).
- `serverXR/src/lighting/tools/desk-bundle.js` writes `ui/*` (all 7 files, no new ones), `manifest.json` and `profiles-node.json` to `build/desk-bundle/` (gitignored). PROFILES is `require`d from `engine.js`; the 13 names are the only list in the script.
- **Measured, not as the plan assumed:** node's bundled zlib (Chromium fork 1.3.1) does not produce Python's gzip bytes (qr.js 3106 vs 3101). So `--gz python` shells to `python3 -I` with the same gzip call as `fetch_desk_ui.py`; the manifest says which producer made the gz numbers (`gz_producer`). Raw sha256 is producer-independent.
- Not run: no comparison against vizzz.di's `desk_ui.lock` (a different repo, `int/2026-10-15` was not fetchable here); `fetch_desk_ui.py` itself was not executed, its gzip call was reproduced in `--gz python`. `--manifest` in vizzz.di is a later step and untouched.
- Guard: `tests/test-bundle.js`, 5 checks (identical bytes over two runs, manifest shape/numbers, gzip header, profiles equal PROFILES, output layout), wired into `lighting.test.js`.
