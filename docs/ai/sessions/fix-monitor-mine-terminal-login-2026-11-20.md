## 2026-11-20 — fix: /api/monitor/mine for the real terminal login (ledger N5850)
- Found on the live dev tier after #1324 deployed: a real `di login` got 404 "Cannot GET /serverXR/api/monitor/mine".
- Cause: round 4 of the review of #1324 made the route require `authState.type === 'cli-token'`; the server builds a terminal login as `type: 'session'` with `actor: 'di.cli'` (index.js resolveCliTokenState). The unit test used the invented shape, so it passed.
- Fix: the route requires `actor === 'di.cli'`; the test uses the shape the server builds.
- Lesson: a route test for a login type uses the state the server really builds (read resolveCliTokenState), and the first live call after a deploy is part of the job.
