## 2026-10-15 — batch landing of the node-desk steps D1–D4
- One branch off dev merges, in order, PR #939 (D0 inventory + D1 honest render and caps), #941 (D2 API contract), #976 (D3 stream transport) and #975 (D4 bundle export); known-fixes.md kept both sides' rows at each step.
- Verified on the batch branch before the PR: test.js, test-dmxfeed.js, test-bundle.js, test-stream.js, test-http.js (default and `--class a`), lint-api-contract, docs:ai:check (counts in the PR body).
- Why a batch: branch protection wants each PR up to date with dev, so landing them one by one invalidates the rest (known route since 2026-09-05).
