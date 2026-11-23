## 2026-11-23 — the Monitor's open-PR count stopped at 30

- The Monitor said 30 open PRs while GitHub had 57 (28 drafts). The machine report asked `gh pr list` for 30 rows and counted the rows; the shared picture cut the list again at 40 and recounted.
- Now the report asks for up to 300 and sends its real totals (`open`, `drafts`); the shared picture and the account feed carry those totals and up to 300 rows, so a machine that lends the list shows the same count as GitHub.
- Guards: monitorStore test (gh limit ≥ 300), monitorHub test (57 rows and totals through getShared and the lent snapshot), monitorAccount test (totals kept).
