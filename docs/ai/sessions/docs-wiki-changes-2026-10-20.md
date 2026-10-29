# Wiki catch-up, 2026-10-20

## What
Nine merged PRs checked against src/wiki/wikiContent.js. Added: #990 (loading-ring), #779 (rig-versions), #1036 (raw windows), #981 (laser-test).
Already described: #957, #724, #934, #811, #800.

## Review
Meant: every user-facing PR has its wiki text. Happened: 4 of 9 missing. Why: PRs merged without the wiki step. Change: this PR; the check-wiki-sync gate does not detect a missing article, so it stays a manual step.
