## Continue, never recreate: a space or project that already exists is continued, not duplicated (N1880)
- `shared/continueStem.cjs`: one stem rule (-3d, -test, -copy, -vN, -N, dates stripped; one typo in long stems).
- Server: POST /api/spaces and /api/spaces/bundle answer 409 `space_exists_similar`; POST /api/spaces/:id/projects answers 409 `project_exists_similar`; `newAnyway: "<reason>"` goes through and is logged.
- CLI: `di new` and `scripts/place/import.mjs` print "continue: <space> …" and exit 2; `--new-anyway "<reason>"` overrides.
- Decision with the owner's words and the audit numbers: docs/ai/decisions/2026-11-02-continue-never-recreate.md.
- Not tested: a real browser; `di new` against a live install (fake fetch only).
