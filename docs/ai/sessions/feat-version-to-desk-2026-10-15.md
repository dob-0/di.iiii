# feat: version-to-desk — one command (2026-10-15, ledger N877)

**Meant:** the lead's shell chain (`apply.sh`: plan → other versions off → exact → show-loop → check) becomes a di.iiii command, no production name in any default.
**Built:** `scripts/rigbuild/version-to-desk.mjs` (spawns the existing tools; stops at the first failed step; exit 1 on failure or another project left on the desk) and `version-to-desk.test.js` (pure helpers `deskBaseOf`, `otherProjectsOnDesk`, `summaryOf`). Doc: `docs/architecture/RIG_BUILD.md` §19.
**Tested:** vitest 3 passed; eslint clean; `--dry-run` against the owner's di (read-only): plan agrees (61 lamps, 0 to change), no other project on the desk, v2-11 U1 18 / U2 43, runner 50 cues at 1 "The road in".
**Not tested:** a real (non-dry) run — it was the owner's, already applied tonight; the failure path with a failing child tool; the unpatch loop with several other projects (only the pure list is tested).
**Seen in the dry run:** show-loop reads 52 cues in the document, the desk's runner holds 50 — not explained here.
**Where it lives:** the command is the feature; `~/di-backups/.../apply.sh` is now only history. Not built: a Studio button.
