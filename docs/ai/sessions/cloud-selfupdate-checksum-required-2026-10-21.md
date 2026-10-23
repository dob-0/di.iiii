## 2026-10-21 — self-update refuses an https release that has no checksums.txt

- `stageVersion` now throws before any download when a non-`file:` release has no `checksumsUrl`, naming the missing checksums.txt and the version. Closes only the missing-file gap of the bug-sweep 2026-10-07 §C item "Self-update integrity" (Confirmed, waiting for the owner); signing, attestations and rollback remain the owner's call.
- Checked first: both publish routes still upload checksums.txt (`release.yml` l.123, `deploy-vps-dev.yml` l.199); the dev channel always sets `checksumsUrl`.
- New `scripts/di/stageVersion.test.js`, 4 tests: refusal red on dev (fetch was called), green after. Not tested: a real hub download.
