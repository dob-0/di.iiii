## 2026-09-03 — a slug is an address: /<slug> resolves to the space, server-side

- `spaceStore.js` has carried `slug`/`findSpaceBySlug` and PATCH-time slug
  validation for a while, and `/api/resolve/:spaceSegment/:projectSegment` +
  the OG-card route already resolved slug-or-id — but every other `:spaceId`
  route (spaceRoutes, projectRoutes, syncRoutes, inscriptionRoutes, plus the
  inline sync-key/invite/github-link routes in `index.js`) read
  `req.params.spaceId` as if it were always the real id. `GET /cascade-club`
  (id `cascade`) 404d before the client got a chance to render the space.
- Fix: one `router.param('spaceId', ...)` in `index.js`, registered once on
  the shared top-level router, resolves the segment to the real id for every
  route matching that param name. An id always wins — it short-circuits
  before any slug lookup runs, so a slug can never shadow another space's id.
  New file `serverXR/src/routes/spaceIdParam.js` holds the resolver so it's
  testable in isolation.
- Guards: `serverXR/src/routes/spaceIdParam.test.js` — unit cases on the
  resolver, plus a real Express router + real HTTP requests proving
  id-wins-over-slug, slug-resolves-to-the-space (response carries the real
  id), unknown-segment-404s, and one project-scoped route
  (`GET /api/spaces/:spaceId/projects`) resolving through a slug.
- Full suite green: `npx vitest run serverXR/src` — 51 files, 470 tests,
  including `httpContracts.test.js` (real subprocess, exercises the actual
  `index.js` wiring, not just the isolated test's own router).
- **Left open on purpose**: the client still compares the raw URL segment to
  a space's real `.id` in several places — `src/components/AuthGate.jsx`'s
  session-scope check (drives the exact "Nothing lives at" message the bug
  was reported against), `src/SpaceSurfaceApp.jsx`, `src/hooks/useAppState.js`
  (`isReadOnly` lookup — the one with teeth: a locked space could read as
  editable when reached by slug), `src/hooks/useSpaceSocket.js` (socket room
  name), `src/storage/scenePersistence.js` (local cache key). That's a
  multi-file client propagation, not a one-line adoption of the returned id,
  and it needs browser verification before it ships — not bundled into this
  server-side PR. Recorded in `docs/ai/known-fixes.md` alongside the fix.
