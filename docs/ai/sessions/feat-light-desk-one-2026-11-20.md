## 2026-11-20 — light desk, one version: dev + PR #1252 + the scene self-test

- Owner: "all now will work in one version everywhere". Branch off origin/dev (d54952ed0) holds dev's desk,
  Emily's PR #1252 (studio follow times, colour effects, stage objects, video/NDI; merged clean, 0 conflicts)
  and `feat/light-desk-scene-selftest-2026-10-31` (scripts/light-desk-selftest, additive).
- Checked on di-work (Node 24): test.js, test-wiring, test-http, test-holds, test-outputs, test-rigpatch,
  test-touch-colours, test-pixelstrip, test-bundle, test-dmxin all pass; api-contract lint ok; lint passed at push.
  test-cues.js is timing-flaky on dev itself (3-4 failing on plain dev, 1-2 on this branch; no DMX output in tests).
- Emily's six missing features, on dev: show file yes (show.json, /api/show, showBackup); PIN, network/OSC panel, undo,
  two-screen guard: no; Stage page: no page of that name (stage pane exists). PR #1252 states these as out of scope.
- Full report: ~/work/agent-reports-2026-11-20/light-one.md
