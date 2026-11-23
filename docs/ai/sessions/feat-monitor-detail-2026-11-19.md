# Monitor shows full data (2026-11-19, branch feat/monitor-detail-2026-11-19, stacked on #1312)

Owner (N5631): "i mean full data in monitoring". Every thing the Monitor knows, every field.
Sources read this turn: `serverXR/src/monitorStore.js`, `monitorHub.js`, `monitorChats.js`, `monitorPrs.js`,
`src/components/preferences/Monitor*.jsx`. Before = what the page showed in a card/row plus the old inspector; After = this branch (one shared detail drawer lists ALL fields of the item, plus a raw fold).

| Thing | Fields the server HAS | Shown before (row / old inspector) | Gap closed here |
|---|---|---|---|
| Machine (tailnet) | id (address), name, os, ip, online, lastSeen, tx, rx, self | name, online, os; inspector: all but id/self | every field, exact bytes, last seen with age |
| Tier (dev, prod, local, report-only) | id, url, source, status, ms, commit, builtAt, behindDev, state (reports), probe, note, misses, lastGoodAt, rawStatus, error (new) | commit, status, ms, behind; inspector skipped source, state, misses | all, plus "slow (N ms)" and last good answer |
| Probe (network) | id, name, url, status, ms, ok, error, probe, note, misses, lastGoodAt (new) | name, ok, status, ms | all |
| Agent session | machine, account, sessionId, title, status, kind, branch, cwd, model, lastActivity (+ remotes) | title, status, age; inspector skipped machine | all; branch links to its pull request |
| Chat (#1312) | id, title, group, status, says, asks[], idleMinutes, failed, host | title, says, asks, idle | id, host (links to its machine), status, failed, ask list in full |
| Connected thing | id, title, state, detail | title, state, detail | already complete; now copyable |
| Presence (place) | id, kind, target, people[name, since] | kind, target, 3 names | every person with since |
| Service | unit, active, sub, description | unit, active, sub | all |
| Pull request | number, title, branch, draft, updatedAt, url | number, title, draft, age | all; branch links to agents on it |
| Space (tiers) | tier, slug, visibility; counts | counts only in the tier tile | spaces of the tier in the tier drawer |
| Show / task feeds | id, title, ok, lines[], updatedAt, error, status | lines | unchanged (text feeds) |
| Map node / edge | id, kind, label, state; edges from, to, kind | label, state, edges | id, kind, state, every edge with the other end opened on click |
| Reports (machines that report) | host, reportedAt, stale, panels | Work lane | all in the drawer |
| Asks | id, state, touched, text, source | Work lane | all in the drawer |
| Parts | id, name, state, detail, commit, date; version, packedAt | state, version | all in the drawer |
| Rules / hooks / skills / to-do / helpers | NOT in this branch: held by open PR #1294 (data side) and #1299 (map nodes) | nothing | see below |

## Open PRs, not rebuilt
- #1294 adds `rules`, `hooks` panels and `agents.helpers` to the data. Gap after it merges: the page has no list for them; the drawer here opens any row of any panel generically, so they get full data without new code once the rows carry `id`.
- #1295 calm layout (needs-you rows, Now/Map/Lists tabs). Touches the same page file; this branch keeps the current tabs (Board, Map, Work, Parts). A merge conflict in `MonitorSection.jsx` is expected and is resolved by keeping the drawer call.
- #1299 draws to do, rules, skills, hooks and helpers on the map. Its nodes open in the same drawer through the map node pick.

## Panel freshness (step 2)
Server panels carry `at` (read time); every stream tick that has no change sends a heartbeat with each panel's read time. The page shows "live · heard N s ago" per panel, amber at 2x the panel's interval, "old" past 4x.
