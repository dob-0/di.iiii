## 2026-10-09 — CI tests the Node version production runs; every job has a time limit

- `.nvmrc` is now 24 (what both Dockerfiles run, Active LTS) and is the one source: ci, browser-checks, rig-compat, release, deploy-space-code, deploy-vps-dev and publish-cpanel read it through `node-version-file`. `engines` accepts `22.x || 24.x`; a new `node-22-compat` CI job still builds and runs the tests on 22.
- `scripts/node-version-source.test.js` fails if a Dockerfile's pinned major, `engines` or a workflow literal drifts from `.nvmrc`. Image tag and digest are unchanged.
- Every workflow job has `timeout-minutes` (about 3x the p95 of the last 25 runs). PR runs of ci, rig-compat and install-matrix cancel superseded pushes; runs on dev/main (deploy gates) never cancel.
