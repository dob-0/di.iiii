## 2026-10-21 — jsx-a11y 17 → 0 and the four rules are errors; a bundle-size baseline for dev

- Pro sweep agent #29, browser-free part (cloud session). `npx eslint src`: 17 jsx-a11y warnings before, 0 after; the four
  relaxed rules (`label-has-associated-control`, `media-has-caption`, `click-events-have-key-events`,
  `no-static-element-interactions`) are `error` in `eslint.config.js`, so CI blocks a new one.
- Studio scene editor: 12 labelled fields were read by their `aria-label`, not the words beside them ("fade s" read as
  "Cue fade", "pan°" as "pan"). Now `label htmlFor` + `Field id`; the visible words are the name.
- Nodes: window title bar `role="toolbar"`; drop section named "Canvas"; port dots `aria-hidden` (the row label names the
  port); the webcam test's video `muted`.
- Tests: 6 new cases (`src/a11y.lint.test.js` ×2, SceneEditor, DesktopWindow, RawEditor, RawGraphSurface), all 6 red
  against the unfixed source and green after. `scripts/audit/bundle-sizes.test.mjs` (3) for the new script.
- `scripts/audit/bundle-sizes.mjs`: raw + gzip per chunk from `npx vite build --manifest`, entry and lazy route chunks
  named, first load computed. Dev today: first load 20 files, 1117.5 KB raw / 330.9 KB gzip; 298 files, 2308.0 KB gzip in all.
  Audit: `docs/ai/audits/2026-10-21-a11y-perf.md`.
- OPEN: `vendor` (231.9 KB gzip, 69 % of first-load raw bytes) is a static import of the entry yet kept out of modulepreload,
  so it is fetched late, not deferred; ports and file-drop have no keyboard path; arrow keys on a title-bar button move the
  window. OWED: axe-core + device matrix under Playwright, first-load timings, a screen reader on a real device — none seen here.
