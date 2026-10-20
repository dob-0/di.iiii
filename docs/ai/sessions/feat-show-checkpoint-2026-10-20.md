## 2026-10-20 — show-checkpoint: a show's state snapshot and one-command restore, as a di.iiii command

- Migrated the one-off `checkpoint.mjs` (MOXIR, 2026-10-17, ledger N1013.1) into `scripts/rigbuild/show-checkpoint.mjs`. No production name in code or defaults: project, space, side files are flags.
- Snapshot: project document, desk looks/cues/rig/state/layers, `--include` side files, versions.txt, manifest.json, RESTORE.md, and a private copy project (`--no-copy` skips). Desk failures are recorded in the manifest; a failed document fetch exits non-zero.
- `--restore <dir> --yes` PUTs the saved document back to the manifest's project; without `--yes` it prints the plan.
- Tested: vitest with a fake client (`show-checkpoint.test.js`), plus one read-only `--dry-run` against the local serverXR. Not tested: a real snapshot, copy and restore (would write).
