## 2026-10-13 — space-cleanup.mjs: the owner's clean-up list as one command with an undo (one-place program, P5)

- What landed: `scripts/space-cleanup.mjs` and `scripts/space-cleanup.test.js`, nothing else. It carries out the design's §5 table
  (the owner said yes on 10-13: "clear, keep only needed things"). `--dry-run` (the default) reads the install and prints the table live,
  with the used-by checks: followed or not (`GET /api/follows`), "named in N repo files" (`git grep`, whole-token match, the script's own
  files left out), what each space or project holds now. `--apply` does rows 1-6 and 8: archive `artist-walk`, `decisions`,
  `drum-rhythms`, `newcomer-2`; trash `newcomer-test`, `aaa` (30 days, restorable); list the archived project `moxir-hall` in MOXIR 17.10's
  version list as `archived`. Row 7 (`algovrithm`) stays; rows 9-11 are only shown. `--undo <journal>` puts every step back.
- How it behaves: the token comes from `DI_API_TOKEN` (or `--token-env NAME`), is sent as a header and is never printed or written; without
  it `--apply` and `--undo` refuse before any request. A space is archived or trashed only while it holds 0 projects, read again right
  before its own write; a followed space is not trashed; a write that does not read back, or that the server holds for approval (202), is a
  failure; the journal is written before the first write and rewritten after every step; a re-run finds everything done and writes nothing;
  `--undo` checks the live state of each step, so a second undo is a no-op and a version entry someone changed since is left alone.
  Exit 0 = done or nothing to do, 1 = could not start, 2 = something failed, was refused or was left alone.
- Measured: 31 tests in the new file, written first (red: "Cannot find module"), then green; they use an in-memory install, and one block
  starts a throwaway server process in a temp folder (as serverXR's contract tests do) and runs dry-run, apply, apply again, undo
  against the real routes. Seven mutations of the script (wrong archive flag, no re-check before a write, no "started" mark, no read-back,
  followed space trashed, 202 counted as written, undo without a state check) each turned the tests red. The CLI entry was run the same way
  outside vitest: dry-run, apply without token (refused, exit 1), apply (7 steps), apply again (nothing to do), undo, undo again, dry-run.
- Not done, and why: it was never run against dev or the installed di (the brief forbids any di API call), so the real counts, the real
  "followed" answers and dev's reachability from Node `fetch` are unseen. `GET /api/follows` answers on the machine itself only: through the
  `diiii.localhost` router it reads "unknown", the table says so, and trashing goes ahead with a warning (the list says rows 5-6 are not
  followed). `di follow` carries neither a space's archive nor its trash, so dev and the local install are each written by their own run.
- Becomes a feature / one-off: the product features are the archive and trash controls on /spaces and the version-list fold (P3); this
  script is the one-off for the night. It carries its migration row as `CLEANUP_PLAN` (dated 2026-10-13) and its `--undo`; the production
  `moxir-2026-10-17` is named only in that dated table, never in a default of shared code.
- Provenance: the §5 table is DESIGN.md of the one-place program (agent-reports-2026-10-13/moxir-space-organize); the owner's answers are in
  its PROGRAM.md.
