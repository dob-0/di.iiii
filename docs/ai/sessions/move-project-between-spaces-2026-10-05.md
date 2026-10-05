# feat/move-project-between-spaces-2026-10-05

Owner (2026-10-05): the decisions -> what-we-have and drum-rhythms -> lab merges need a product way to move a
project between spaces. Before: only `scripts/project-move.mjs`, offline, on the data root.

## What was built
- `serverXR/src/projectMove.js`: the one move (row, folder, blobs, space-asset links, `project_moves` line).
  Atomic by order: additive copies, folder rename, one database transaction; a failure restores the folder and the
  document text. Slug clash is refused (409) by default; the script passes `onSlugClash: 'drop'` to keep its old choice.
- `POST /api/projects/:projectId/move` in `routes/projectRoutes.js`, catalogue entry (not offered to agents).
  Allowed: admin, or the owner of both spaces (`isSpaceOwnerOrAdminState` on each). Under no-auth (a local install) anyone.
- `di move PROJECT --to SPACE [--from URL] [--token -] [--dry-run] [--unpublish]`.
- `scripts/project-move.mjs` now calls the shared module (its 8 tests are unchanged and pass).

## Measured (aylmo, 2026-10-05, only the touched files)
projectMove.test.js 9, projectMoveContracts.test.js 6 (one real server), scripts/di/move.test.js 4,
scripts/project-move.test.js 8, plus catalogueContracts, projectVisibilityContracts, cliRouting, copyVocabulary: all pass.
Red first: with `projectMove.js` removed the new tests fail (module not found, server exits at start).

## Limits, owed
- **Follow does not carry a move.** A follow carries op logs; a move is not an op, and a move/delete out of a followed
  space is not carried. After moving on dev, each install that follows either space (aylmo, Emilya's, Kiara's) must run
  the same `di move`, or the follow shows a project in the old space on one side. Owed: a carried move (a `moved` line
  in the follow stream, read from `project_moves`).
- Not tried against the owner's real dev data (told not to): the contract test ran on a throwaway server.
- The owner-of-both-spaces path (a signed-in session) is covered by the shared `isSpaceOwnerOrAdminState`, not by its own
  test; the contract test covers admin allowed, editor refused, no-token and viewer refused.
- Live editors with the project open keep their old URL until reload; the stable link `/{space}/p/{id}` does not change.
