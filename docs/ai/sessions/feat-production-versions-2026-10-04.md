## 2026-10-04 — one version list per production, in the space, with a status and one "for the show"

- **Why.** MOXIR has 17 versions, each a project. Each one carried its own copy of the others in
  `rigVariant.siblings`, copied when it was made and never updated. 16 versions showed 6 different rows (measured
  read-only by the main session). The code's versions file names 4 of the 17 as the set. Nothing said which
  version is for the show. The owner approved the design: *"yes and for all future project too"*.
- **What.** The decision, with the method (ShotGrid/Flow PublishedFile + status, the USD resolver practice, git
  refs), the options and the limits: `docs/architecture/decisions/2026-10-04-production-versions.md`.
  - The data: `src/shared/productionVersions.js`. Both schema copies normalise it.
  - The list is the project `<production>-versions`, born private, with one entity per version. `di follow`
    carries it like any project.
  - Status is one of `for-the-show` · `candidate` · `kept-copy` · `archived`. At most one version is for the
    show, and "none chosen" is valid.
  - Each entry records madeFrom, madeBy (machine, install, tool, commit), madeAt and the fingerprint. The
    fingerprint is sha256 over tier-sync's normalisation; `stripVolatile` and `byName` are now exported.
- **Tools.** `scripts/production/versions.mjs` (`list`, `set-status`, `register`, `put`, `remove`, `--dry-run`).
  Every write is re-read, read back and comes with a printed undo.
  - `load-version.mjs` lists a version in the same step that makes it.
  - `copy-version.mjs` lists it in the same run. The list step runs around `main()`, so PR #754's `--from-api`
    lines are untouched. A copy with `from == to` is a candidate.
  - `versions-audit.mjs` compares installs and git and exits 1 on any mismatch. Run it after a follow settles,
    after a land and before the show; CI is owed (it needs the dev token).
  - `build-moxir-versions.mjs` does the one-time MOXIR build. **It was NOT run against any server.**
- **The version row** reads the list when the viewer can read it. The version for the show comes first and is
  marked "for the show". Candidates follow, kept copies fold, and archived versions are not on the row. A
  visitor, or an install with no list, sees exactly what they saw before. `siblings` is now only the last
  fallback. The wiki entry `rig-version-switch` is updated.
- **Tests.** Each new test was run on origin/dev code: the test files alone, and then with only the data module
  added.
  - The row tests and the schema tests fail there and pass here. One of them is "the same row from every
    version where the rows carry no marks": on origin/dev it shows 6 different rows from 16 constructed versions
    (`expected 6 to be 1`).
  - The tool, audit and build tests fail there because the modules are new.
  - The touched suites (src/rigbuild, scripts/rigbuild, serverXR/src/follow, schemaSync, tier-sync, src/shared,
    scripts/production): see the PR for the counts, before and after.
- **Owed.**
  - Run the build on dev (`--dry-run` first), then the audit dev ↔ local after the follow carries it.
  - Measure fingerprint stability on the real pair.
  - The owner looks at the row with "for the show" on his screen.
  - A CI job for the audit.
  - Retire the `siblings` writers once every install runs this code.
