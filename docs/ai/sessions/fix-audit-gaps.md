## 2026-08-05 — Audit backlog closed, two real gaps fixed

Re-verified the standing audit backlog: 17/17 previously-reported findings were
already fixed on `dev`; `CURRENT.md` had been carrying it as open. Two gaps were
real and are fixed here.

- **A failing scene write was invisible.** `useLiveSync` set `sceneFlushError`
  correctly, but the value died at `useAppState`'s explicit destructure (it
  listed `sceneStreamState`/`sceneStreamError` and simply omitted the flush
  field) — every hop in between is a spread, so a grep for the identifier found
  almost nothing. The Studio status panel read "Scene stream connected" the
  whole time a write was actually failing. Threaded through `useAppState` →
  `useAppContextValues` → `EditorLayoutContainer` → `useStatusItems`, given its
  own status row rather than folded into the stream row (a healthy stream is
  exactly what was masking it). Two new tests in `useStatusItems.test.js`.
- **A portal in embed mode rendered blank tiles** for older imported projects.
  `EmbeddedScene` called `buildAssetMap(doc)` with no `fallbackProjectId` — the
  fallback that rescues assets written without a `url` by the legacy import
  gap — and an embedded document has no `projectMeta.id` of its own to fall
  back on. Passed the `projectId` the component already had in scope.
- Checked by diffing the test suite's failing-file *set* before/after
  `origin/dev`: identical (raw totals read 68 vs 67 — flake in uncollectable-
  file counting, so the set is the check, not the count).

Left deliberately open (not this branch's to fix): `StudioEditor` has no
`[projectId]` reset on switch — fixing it means deciding which editor state is
per-project vs per-session, and a wrong guess silently discards work.
