## Dev deploy trusts a tree CI already tested (N1463 lever C)
- `scripts/ci/tested-tree.mjs` proves a pushed commit has the same tree as a merged PR head whose `build-and-test` and `browser-checks / browser-checks` runs are green.
- `deploy-vps-dev.yml`: new `proof` job; `test` is skipped when proven; publish, build and deploy still run, and still stop if `test` failed.
- Why: "Run tests" took 10.7 and 8.9 min of a 14-21 min deploy (last 5 runs, 2026-10-29). Fail-safe: any doubt, and every manual dispatch, runs the tests.
- 10 vitest cases in `scripts/ci/tested-tree.test.js`; the proof of the workflow is the first dev deploy after merge. Rollback = revert the PR.
