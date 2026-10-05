## 2026-10-04 — a follow starts from now, and never erases work only the follower has (audit F4)

- **Why.** The owner's install (aylmo) is to follow space `moxir` from https://dev.diiii.xyz, whose projects hold
  long local histories (876 / 2378 ops) already on dev. A first follow start had null cursors, so
  `readOps(local, …, null)` replayed this install's whole history onto the host, and `planConverge` then let the
  host win over any difference, silently erasing work only the follower had.
- **Fix.**
  1. `follower.js`: a follow with no saved state sets each stream's cursors to the latest version on both sides
     (stream = the room, and every project on BOTH sides at the first tick), then compares the documents once.
     `start: 'replay'` / `di follow --replay` keeps the old start (history the other side never saw).
  2. `followConverge.js`: a difference where this copy holds entities / nodes / assets / scene objects the host
     lacks is refused (no write). `lastError` and a `warn` log say the project and the counts; the refusal is
     remembered until the stream agrees (also fixes the one-tick refusal of audit F7 for these cases).
  3. `di follow --take-host | --take-mine`: saved as `direction` in follows.json, applied to each stream's first
     comparison, then cleared (`clearDirection`). `index.js` restarts a running follower when a new direction
     appears. `take-mine` writes this copy to the host through the host's write route.
  4. Restore point: the two POST ops routes now take a restore point (reason `before-whole-replace-op`) for any
     batch carrying `replaceScene` / `replaceDocument`, burst or not — before, a whole-work op sent as an op got one
     only at the start of a burst. The follower logs the newest restore point id (readable only with a key that
     may list snapshots; otherwise it says the write route took it).
- **Guards.** `followIntegration.test.js` "a follow starts from now …" (5 tests, two real servers; 4 red on
  origin/dev), `followConverge.test.js` (6), `scripts/di/follows.test.js` (2).
- **Limits.** The first tick decides from-now; an existing follow with saved state is unchanged. A one-sided
  project still replays. Restore point id may be unreadable with a per-space sync key. #750 / #751 / #752 touch
  `follower.js` / `followStore.js`; rebase conflicts are expected and mechanical. Not run against a real install.
