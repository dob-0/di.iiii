# fix/follow-integration-flaky-2026-10-05

## What changed and why

- CI failed a different followIntegration test on each of three PRs (#760 ×2, #763). Cause: since #757 a from-now follow took its starting point at its first pass over each stream, a moment after startFollowing() returned; an edit made in between was folded into the history and NEVER carried — a product race, not only a test problem.
- Fix (follower.js): "now" is the moment the follow is started (startedAt). The first pass sets each cursor just before the first op stamped at or after startedAt (startCursorAt reads the latest version and the last 200 ops, never the whole log). No margin on either side: a margin replays history made just before the start. Remaining window: two clocks' skew (NTP).
- The started() waits added to the tests earlier on this branch are removed: they hid the race.
- Guard: 'an edit made the instant a follow starts is carried' — startCursorAt lands exactly between an op before and an op after the start; both sides' first edits are carried. Red on origin/dev (2 failed), green after. serverXR/src/follow: 8 files, 93 tests passed (aylmo, ≤ 81 °C, no load).
