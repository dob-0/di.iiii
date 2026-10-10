## 2026-10-10 — errors no longer name a space the caller cannot see

- Re-checked the three claimed leaks on origin/dev. Trash restore 403 with `requiredSpaceId` and the proposal 409 naming the holding space (also inside `summary.collisions[].spaceId` in the response body) were real; both fixed, each with a test that failed on the old code.
- The create-project 409 already says only "that name is taken on this di.iiii" (`projectRoutes.js`), so it names nothing. That project ids are global is a design property (`resolveProjectContext`, `GET /api/projects/:projectId` takes no space): the fact that an id exists somewhere stays learnable. Left as is and written into known-fixes.md.
- Owed: if ids should ever stop being global, that is a data-model change (ids scoped per space), not a fix to an error message.
