# Fixture library, part 1 of the PR #914 split (2026-10-20)

## What this is
The foundation of the one fixture library: provenance on every type, one generated file per type
plus `index.json` under `src/rigbuild/types/library/`, the node reader `loadLibrary()` over it, the
rule for adding a type (`library/README.md`), and the tests. No caller changed: the app and the tests
still read `src/rigbuild/types/moxir.json` (kept, same types, now carrying `provenance`).
Plan for the other parts: `~/work/agent-reports-2026-10-20/pr914-split-plan.md`.

## Provenance (Professional method, rule 7)
Per type: `identified` (exact | equivalent), `date` (newest date anything in it was read), `sources`,
`values` (count by how each value was got: measured, tested, datasheet, equivalent, assumed, unknown),
all taken from the manifest's own `basis` fields. Nothing is measured by us today; a test pins that.

## Tests
`npx vitest run src/rigbuild scripts/rigbuild scripts/place`, eslint, `check-agent-docs`,
`check:fallback-patterns`: results in the PR body.
