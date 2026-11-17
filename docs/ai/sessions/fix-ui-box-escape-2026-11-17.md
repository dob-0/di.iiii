## 2026-11-17 — UI: boxes ran out of their own cell (Agent sessions, This scene, wiki)

- Report: the Agent sessions directory rows ran under "Session detail" (owner screenshot). Measured at 1440/1000/700/390 px: `.preferences-tree-row` was 24 px wider than its cell at every width.
- Causes: (1) `width: 100%` + padding on a content-box element (`.preferences-tree-row` +24 px, `.preferences-input` +26 px); (2) grids with no column definition grow to their widest content (`.preferences-tree`, `.preferences-tree-group`, `.wiki-content`, `.wiki-article-body`, `.wiki-list`, up to +37 px past a phone screen).
- Fix: `box-sizing: border-box` on the two; `grid-template-columns: minmax(0, 1fr)` on the five.
- Guard: new `scripts/check-box-escape.mjs` (`npm run check:box-escape`): any in-flow, non-transformed box more than 2 px outside its parent's content box; prints the box count (0 = failure). Negative control: with the fix removed it printed `right +24px ... preferences-tree-row`. With the fix: every admin section x 4 widths PASS (twice), /wiki x 4 widths PASS, /, /main, /network, /di-iiii, /studio, /raw, /login PASS at 1440 and 390 (routes not individually confirmed distinct).
- Tests: `vitest run src/components/preferences src/wiki` 18 files / 140 tests pass.
- Left on purpose: 81 `display: grid` rules in 20 files have no column definition (raw.css 22, rigbuild 22, preferences.css 8, wccSite 6 = artwork, never touched). Fixed one by one when the script proves it wrong.
- Not swept: server-served desks (/light, /laser, /serverXR/show/), the 3D space, login-gated pages.
