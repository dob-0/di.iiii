## 2026-10-05 — five gaps in follow (live sync), stacked on #764

Owner, 2026-10-05: five gaps found on the real install, "go one by one". Branch `fix/follow-gaps-2026-10-05`, based on
`origin/fix/follow-integration-flaky-2026-10-05` (#764, the from-now timestamp fix, not merged). One commit per gap.

| Gap | Cause found | Fix | Guard (red on base, green after) |
|---|---|---|---|
| 1 new key ignored while di runs | `startFollows` restarted a follower only for a new `direction`; follows.json was read correctly (watched every 2 s) but the follower kept its old `side` token | restart on any change of remote / key / address / start; resumes from saved cursors | `index.test.js` |
| 2 remote without `/serverXR` | dev.diiii.xyz answers `/api/health` 200 text/html; any 200 passed, so one dropped `/serverXR` answer fell through to the bare address. Not about di being down: the CLI path is the same up or down | health must be JSON ok:true; mount asked twice; op-log check must see an op log; else `unreachable`, nothing stored | `scripts/di/followRemote.test.js` (4) |
| 3 transfer not resumed | chase started AFTER the room's 20 s park; documents compared once per run; settled files never re-asked. A plain two-server restart already resumed on the base, so no single cause was reproduced | chase kicked before the park, comparison every 10 min incl. settled files, stale `.part` cleared, `listed`/`missing` in state and `di follows` | `assets.test.js` (2), integration "interrupted file transfer" |
| 4 settings not carried | never designed | `followSettings.js`: host to follower, `isPublic:false` wins, front door only onto a non-private project that is here; space PATCH ends held reads (also on the approval-gated path) | `followSettings.test.js`, integration "space's own settings" |
| 5 follower-only project refused | the host's new copy is made empty from the listing; content that came as a whole-work op is never carried | `seeded` streams (saved in follow-state) fill the host copy once via `replaceDocument` | `followConverge.test.js`, integration "only the follower holds" |

Decisions and limits:
- Gap 1 design: the file is the contract between CLI and server (works while di is down, no new route). The race of the
  server's own `clearDirection` (read-modify-write) with a concurrent CLI write is a tiny window, not closed here.
- Gap 4: follower to host is NOT done (host PATCH is owner/admin only; a sync key is neither). A public host does not
  make a private copy public; it says so. Settings changes made on the host while the follower is parked cross in about a
  second (the PATCH ends the held read). A PATCH that waits for approval is said once.
- Gap 3 owed: whether the owner's 101/79/29 case had a different cause (a final failure, a size limit) is not known; no
  log from that install was read. `di follows` now shows "N still coming, of M listed" and failures, so the next time it
  can be told.
- No real install was touched; tests spawn their own servers.
