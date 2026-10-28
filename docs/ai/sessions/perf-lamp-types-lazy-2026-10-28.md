# perf/lamp-types-lazy-2026-10-28 (ledger N1382)
- lampType.js loads each fixture type file on demand (import.meta.glob, not eager), cached per type, announced once.
- Lamp body (RawViewport LampBody) loads its type and re-renders on arrival; the Lamp's patch says "loading type" until then.
- Measured: the Raw entry chunk pulled in 13 type chunks at open before; after, 0 (see the PR body).
- Tests: lampType.test.js adds loaded-once-and-cached; callers that read types synchronously preload in their tests.
- Not tested: the lamp in a browser.
