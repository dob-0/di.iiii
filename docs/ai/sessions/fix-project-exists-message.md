## 2026-09-20 — name the collision, not just the 409, on project create

Project ids are global by design across every space (`resolveProjectContext` /
`GET /api/projects/:projectId` take no `spaceId`), so `POST
/api/spaces/:spaceId/projects` can 409 against a project living in a space the
caller cannot even see — a newcomer who picks an ordinary title twice, weeks
apart, in two different spaces, hit a bare `Project already exists.` with
nothing to act on.

- `serverXR/src/routes/projectRoutes.js`'s 409 body now reads `that name is
  taken on this di.iiii — try another`.
- Both create forms (`StudioHub.jsx`, `StudioProjectsPanel.jsx`) already
  surface the server's message verbatim through `apiClient.js`'s
  `createHttpError()` — traced, not assumed — so no client change was needed.
- Regression guard: `serverXR/src/projectContracts.test.js` "names the
  collision when a project title/slug collides with one in a different
  space" — creates a project in `main`, creates a second space, POSTs the
  same title/slug there, asserts 409 and the new sentence. Watched it fail
  against the old message (reverted the one-line fix, ran it, restored),
  then watched the full file pass (28/28).
- `docs/ai/known-fixes.md` row added.
