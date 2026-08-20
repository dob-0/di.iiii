## 2026-08-21 — test:raw, and what the gate's minutes are actually spent on

- `npm run test:raw` — the fast loop for Raw work. 1080 tests, 108 files, ~25s against
  ~97s for the full run. Scope is Raw, the node graph, Studio's graph surfaces and the
  node-vocabulary guards: `src/project` and `src/studio` are in because a node change
  reaches them, and leaving them out would have made the subset feel fast by not looking.
- **It guards its own scope.** `src/raw/rawTestScope.test.js` reads the filters out of
  package.json rather than restating them, walks every test under `src/`, and goes red
  naming the file if one imports from `src/raw` or `src/project` while sitting outside
  what `test:raw` collects. A subset that silently stops covering something is worse than
  no subset — it reads as "the Raw tests passed" while the failing file was never
  collected. Watched red with a probe test, then watched green again with it removed.
- One deliberate exclusion, stated in the open and asserted rather than assumed:
  `AdminManageSection.test.jsx` imports `project/services/projectsApi.js`, the REST
  client, not the graph. The test also fails if an excluded file stops existing.
- **This does NOT shorten the PR gate, and it was never going to.** Measured: the full
  suite is ~97s wall, and `serverXR/src/httpContracts.test.js` alone is 30–51s of it —
  a third to a half, in one file. Slicing Raw out of CI would trade real coverage for
  seconds that are not where the time is. test:raw is a local loop; CI keeps the full run.
- **Found while measuring: `httpContracts.test.js` is flaky on dev.** "throttles repeated
  sync status requests with 429 + Retry-After" — same file, same command, one run red and
  the next fully green, duration swinging 30→42→51s. It is load-sensitive, not
  order-dependent (an early read that it failed 3/3 in isolation was an artifact of `-t`
  skipping the other 53 tests and their setup — discarded). Not touched here: it is a
  serverXR concern and wants its own fix, but a gate with a coin-flip in it is the next
  real velocity problem, ahead of any further slicing.
- Still open in the workshop map's lane 2: widening the `authoringOnly` staleness guard,
  which remains blind to viewport/window-only implementations.
