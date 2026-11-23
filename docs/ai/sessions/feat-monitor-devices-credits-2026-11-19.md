## 2026-11-19 — Monitor: real devices only, and a Credits box (ledger N5822)
- Machines panel leaves out Tailscale Funnel placeholder peers (tag:ingress): the tile counted 6 online of 34 rows, 23 of them placeholders; it now counts real devices.
- New `credits` panel in the monitor feed: a `{ panel: 'credits', kind: 'command' }` feed in the machine's monitor config runs `di-credits status --json`; the server keeps route, ready, meter, have, why, and shows an e-mail address as "login". No feed = "not configured", not an error.
- Page: a "Credits ready" tile and a Credits section (Claude plans, API keys, Ollama, Colab) in the Monitor board tab.
- Tests: monitorStore.test.js (3 new), the monitor page tests (29 files, 274 passed), lint, on di-work.
- Not done: the credits feed is not yet in any machine's monitor config, so no live machine shows the box; the picture check at each screen size is separate.
