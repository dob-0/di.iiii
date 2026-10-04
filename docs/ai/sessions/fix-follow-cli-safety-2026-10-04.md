## 2026-10-04 — fix/follow-cli-safety-2026-10-04: di follow refuses unsafe merges, keeps a corrupt follows.json, writes keys 0600

Source: `docs/ai/audits/follow-audit-2026-10-04.md` (branch `docs/follow-audit-2026-10-04`), findings F5, F6, F15, F19, F20.
Files: `scripts/di/{follow,follows,cli,ui,stage}.mjs`, `serverXR/src/follow/followStore.js`; test `scripts/di/followSafety.test.js`.

- F5: stopped install now checks `<data>/di.db` (`spaces` table, read-only `node:sqlite`). The audit's "`<data>/spaces/<id>`" is not where spaces live; they are rows. Unreadable db = refuse.
- F6/F15: both follows.json writers are temp + fsync + rename, 0600 every write; a file that does not parse is kept, copied to `.corrupt-<time>`, and the write refused (`corrupt`). `di follows` still reads it as empty (unchanged, not warned yet: owed).
- F19: CLI removes the state file; `writeFollowState` skips when the space is not in follows.json, so a late save cannot revive it. Owed: follower.js should stop before state removal (not edited, another agent's file).
- F20 decision: refuse `http://` unless host is loopback, `.local`, private LAN, link-local or Tailscale 100.64/10 (or pinned by `--at` to one of those); else `--insecure`. Applies to `di follow` and `di stage join`.
- Not done: `.part` sweep (F20 first half), `di follows` warning for loose mode / corrupt file.
- Measured: new test file 12 tests, 9 failed on origin/dev code, 12 pass now; `vitest run scripts/di serverXR/src/follow` 35 files, 408 passed.
