## 2026-10-13 — one place for a space, phase P1: the project card says what the project holds

- The line on a Studio project card now counts everything the document holds: the files in
  `document.assets` (with their size), the page (with its size), cues and light cues, images and
  videos, templates, lamps and lights. "empty" is said only when none of them is held, so the
  documents project of a space no longer reads "empty" over its files. The count lives in both
  twins, `shared/layers.cjs` (server) and `src/project/layers.js` (browser), and the lockstep
  test in `src/project/layers.test.js` runs the new fixtures through both. The list route needed
  no change: it already sends every non-zero count.
- Words follow the dictionary: "object" replaces "thing" on the line, a placed light that
  carries a fixture (typed by the rig builder, or joined to the lighting desk) is a "lamp" (a
  stage fixture), any other is a "light" (a 3D scene light). Measured on 13 real MOXIR documents
  (backups, read only): 1374 of 1374 spots carry a typed fixture and 96 an index, so MOXIR reads
  "106 lamps", not "106 lights". `docs/ai/vocabulary.md` gets both rows with the owner's words of 2026-10-13.
- A space card says "a work in di.iiii's code" for a space that holds a work compiled into the
  source (`src/works/works.js`), instead of "No projects yet" (`src/studio/utils/spaceHolds.js`).
  The Studio hub already hid its own "No projects yet" for such a space.
- The `[archived]` title prefix is moved to `state` on EVERY start of the server (it ran once,
  in September), idempotently (`backfillArchivedTitles` in `serverXR/src/db.js`); `index.js` logs the count when it
  moved any. `updated_at` is not touched. `db.js` takes no sibling module: a first version required
  the logger and `scripts/space-bundle.test.js` (db.js alone, in the image layout) caught it.
- Still undone (owed to later phases): the read-side fallbacks for the prefix
  (`StudioHub.jsx` `isArchivedTitle`, `projectRoutes.js` `isLegacyArchivedTitle`,
  `projectStore.js` `countBySpace`, `scripts/production/versionList.mjs` `isArchived`) stay until
  every install has run the migration; a project followed in with the prefix between two starts
  shows as archived through them. The editor's own `empty` flag (`readProjectLayers`) still
  ignores files. The admin console tree (`AdminManageSection.jsx`) still says "No projects yet"
  for a space that holds a compiled work.
