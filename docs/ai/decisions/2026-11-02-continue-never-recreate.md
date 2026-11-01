# Continue, never recreate (2026-11-02, ledger N1880)

**House rule, in the owner's words (2026-11-02):** *"I told to keep projects and not every time create versions and duplicate the jobs; when I say let's work on something, it starts, finishes, and when we come back to that job it creates a new place or thing and starts as new — the projects are a mess."*

A **place** is ONE space with its **projects** inside. A **job** is ONE project, continued; older states are versions or archived — never a new sibling space or project per session, round or version. (Words: `docs/ai/vocabulary.md`.)

## What the audit found
Source: `~/work/agent-reports-2026-11-02/AUDIT-DUPLICATES.md` (read 2026-11-02; project contents not read, "same job" judged from titles and slugs).
- 34 spaces and 324 projects on the installed di; two spaces for one place (`cinema-house`, then `cinema-house-3d`, made to route around a taken name).
- 14 moxir projects that are versions of one (v1.0…v2.11, scenes v2…v7), 3 with identical titles.
- 77 / 58 / 12 worktrees in the three repos' families, mostly dated restarts (`stage/copyN`, `land/batch-<date>`).
- Cause: nothing at creation time asked "does this exist?".

## The guards (this change — product side only)
One rule, `shared/continueStem.cjs`: lower-case; strip a trailing `-3d`, `-test`, `-copy`, `-vN`, `-N` and any `YYYY-MM-DD`; equal stems match, and long stems (≥ 8) one typo apart match.
1. `POST /api/spaces` and `POST /api/spaces/bundle` (`serverXR/src/routes/spaceRoutes.js`): a similar space the caller can see → 409 `space_exists_similar` with `existing` and a `hint`. Exact-id refusal is unchanged. A caller that names the id (`slug`) is compared by id; a person who typed a label, by id and label. The bundle door sees `as` and `label` only (the id inside the file is known after the tool has run).
2. `POST /api/spaces/:id/projects` (`projectRoutes.js`): a typed project name whose stem matches a live project of that space → 409 `project_exists_similar` with `existing` and "new version of <id>". Callers that name their id (follows, imports, copy scripts) are untouched. The in-product Versions feature is plan V3 (`docs/ai/plans/2026-10-13-connected-workflow-words-versions.md`), not built; today versions are `scripts/production/versions.mjs` and `scripts/rigbuild/copy-version.mjs`.
3. `di new NAME` (`scripts/di/cli.mjs`, `continueGuard.mjs`): prints `continue: <space> (<label>) — use it; to add this work as a project: …`, exit 2.
4. `scripts/place/import.mjs --name`: when a sibling space exists, refuses (exit 2) with the command that imports INTO it (`--name <existing> --project <id> [--replace]`).
Only `newAnyway: "<reason>"` (`--new-anyway "<reason>"` on the CLIs) creates a second one; the reason is logged. A bare flag is not a reason.

## Not covered (owed, other repos)
`git worktree add` wrapper `di-wt`, branch families, report dirs and footage `-vN` dirs — in di-atlas (audit table, rows 3–7). `di open FILE` (local bundle import) does not go through the server door.
