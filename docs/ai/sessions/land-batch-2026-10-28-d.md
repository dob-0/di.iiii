## 2026-10-28 — land/batch-2026-10-28-d: 1047 1104 1081

- A batch of reviewed PRs merged on top of origin/dev (ledger N1353); each PR keeps its own note. Reviews: ~/work/agent-reports-2026-10-27/reviews/VERDICTS.md.
- #1086 (claude/osc-dmx-nodes-yhfjxv) merged into the batch (ba6bd7589); index.js import/registry lines kept both sides.
- #1081 (cloud/raw-lamp-2026-10-21) left OUT (merged then reverted, 9cbdcaa77): src/project/nodes/light.lamp/lampType.js imports rigbuild/types/index.js, which src/rigbuild/types/projectTypes.test.js ("who may import the whole library") forbids; owed to the PR author.
