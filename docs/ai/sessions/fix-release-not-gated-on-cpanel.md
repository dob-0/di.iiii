## 2026-08-08 — a tag published nothing, because a legacy path could veto the release

`v0.3.0` was tagged so the `di` one-liner would have an artifact to download. The release
workflow ran lint and tests green and then died at `Stage cPanel release` with
`Missing VITE_API_TOKEN for cPanel release build`, publishing no release at all. `v0.2.1`
had died at the same step earlier, which is why this repo has never had a GitHub Release
and why `gh release list` comes back empty.

Two separate faults, one on top of the other:

- The step was **never passed `VITE_API_TOKEN`** — `release.yml` sets `VITE_API_BASE_URL`
  and nothing else, so it could only ever throw.
- **Ordering.** `Pack the di runtime` came after it, so a legacy fallback the repo moved off
  on 2026-07-15 was able to stop the only artifact anyone actually installs.

Fixed by inverting the priority rather than by chasing the secret: the runtime is packed
first, the three cPanel steps are conditional on a probe for the secret (and are handed it
when it exists), and `fail_on_unmatched_files: false` keeps skipped legacy zips from failing
the upload. The cPanel bundles still build for anyone who sets the secret.

Guard: `scripts/di/releaseWorkflow.test.js` — pack-before-cPanel, the tag-derived artifact
name (`--version=${GITHUB_REF_NAME#v}`, so the filename always matches what the installer
resolves from the feed), the conditionals, and the upload patterns. Watched failing against
the old workflow on all four counts.

**Still open:** `v0.3.0` is a tag with no release behind it. The next tag is the real test —
this cannot be verified by re-running anything, only by tagging again.
