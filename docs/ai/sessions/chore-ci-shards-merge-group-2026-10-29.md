## CI: the PR test run in 3 shards, ready for the merge queue

- `ci.yml`: vitest runs as 3 parallel `test (shard n/3)` jobs; lint, build, contracts and docs checks run beside them as `checks`.
- Summary job `build-and-test` needs both and fails unless both succeeded, so branch protection keeps its required name.
- `merge_group` trigger added to `ci.yml` (`browser-checks.yml` is workflow_call only; the queue reaches it through ci.yml).
- Why: "Run tests" was 10.6 of 13.5 min in the PR job (median of the last 8 PR runs, 2026-10-29). After-number: read from this PR's own run.
