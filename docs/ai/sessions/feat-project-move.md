## 2026-09-18 — move a project between spaces

Built `scripts/project-move.mjs`: moves one project's DB row (`space_id`,
clears `collection_id`, position to the end of the target's order) and its
directory from one space to another, in the same database — a project id is
global, so `project_ops` never needs copying (space-bundle.mjs's export/import
does; this doesn't).

- Two asset facts found by reading `projectRoutes.js`/`blobStore.js` closely,
  not assumed: a content-addressed project asset (sha256 id) stores its
  BYTES in the space's blob store, not the project directory — moving the
  directory alone would leave those images 404ing. And a project document can
  reference the source space's own shared assets by URL
  (`/api/spaces/<id>/assets/<id>`). Both are copied into the target space
  (never deleted from the source); the second case also gets its URLs
  rewritten in `document.json`/`project.json`, same string-replace technique
  as `space-bundle.mjs`'s `remapSpaceUrls`.
- Refuses: unknown project, unknown target space, already-in-that-space, and
  moving a space's currently-published project unless `--unpublish` is passed
  (then clears `published_project_id` and says so).
- A project slug is unique only within its space; a collision in the target
  drops the slug rather than refusing the whole move (logged).
- `--dry-run` reports counts and writes nothing — verified by a test that
  checks the DB row and both directories are untouched after it runs.

**Old links** — investigated how a project resolves inside a space. Two of
the three shapes need no change at all: `/api/projects/:id` and the
`/{space}/p/{id}` public form both resolve by the project's global id alone
(`PublicProjectViewer.jsx` calls `getProjectDocument(projectId)`, never
checks the URL's space segment), so they keep working the moment the row
moves — confirmed, not assumed, by reading `resolveProjectContext` in
`serverXR/src/index.js` (sets `req.requiredSpaceId` from the project's real,
current `spaceId`, not from the URL, so privacy enforcement also stays
correct after a move). Only the bare vanity form `/{space}/{slugOrId}` broke:
its resolver, `GET /api/resolve/:spaceSegment/:projectSegment`
(`serverXR/src/index.js`), explicitly 404s once `project.spaceId !== space.id`.

Shipped the fix rather than deferring it — well under the ~60-line budget:

- `serverXR/src/db.js` — new `project_moves` table (`project_id, from_space,
  to_space, old_slug, moved_at`), written once per move by the CLI.
- `serverXR/src/projectStore.js` — `findProjectMove(fromSpaceId, segment)`,
  matching by either the old id or the old slug.
- `serverXR/src/index.js` — in the resolver, a project that doesn't resolve
  in this space now also checks `findProjectMove` before 404ing; on a hit it
  answers `{ movedTo: { spaceId, projectId } }` instead of a plain 404.
- `src/services/serverSpaces.js` — `resolveVanityProjectLink` passes
  `movedTo` through.
- `src/RootApp.jsx` — `SlugProjectRoute` follows `movedTo` with a `replace`
  navigation to the id-based `/p/` form (the slug isn't guaranteed to have
  survived the move, the id always has).

A project moved a second time chains naturally (each hop is its own
`project_moves` row and its own client-side `replace`), the same way an HTTP
redirect chain would — no special multi-hop logic was needed.

Not done: `project-move.mjs` isn't copied into `serverXR/Dockerfile` the way
`space-bundle.mjs` is — nothing server-side spawns it (it's a data-root CLI
tool, like `space-bundle.mjs` run directly), so there was nothing to wire in.
If a server route ever needs to trigger a move, that copy step is the same
one-liner `space-bundle.mjs`'s own Dockerfile entry already is.

Tests: `scripts/project-move.test.js` (8 cases — move, unknown project,
unknown target, publish gate, space-asset copy + rewrite, project-blob copy,
dry-run, slug collision), `scripts/space-bundle.test.js` (unaffected, still
green), `serverXR/src/fallbackContracts.test.js` (covers `/api/resolve`,
still green), `npm run test:server-contracts` (138 passed), `src/RootApp.test.jsx`
+ `src/utils/spaceRouting.test.js` (60 passed). `npx eslint` on every changed
file: clean (two pre-existing unrelated warnings in `index.js`).
