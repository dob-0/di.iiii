## 2026-08-18 — a free-disk floor for every write: 507 with headroom, never ENOSPC mid-file

- Closes CURRENT.md's "no byte quota / ENOSPC pre-check anywhere". One app-level guard
  (`serverXR/src/diskGuard.js`) mounted before the body parsers: POST/PUT/PATCH are refused
  with `507 { code: 'insufficient_storage' }` when the data volume's free space is under a
  floor — checked before multer spools a temp file or a body is parsed, so a full disk can
  no longer be hit halfway through an asset, an op-log append, or a SQLite write. GET/HEAD
  and DELETE always pass (DELETE is how a full disk empties).
- `Content-Length` counts against the headroom, so a 300 MB upload is refused while small
  writes still clear; statfs is cached ~5s, the cache drops on refusal so freeing space
  recovers immediately; statfs failure fails OPEN with one loud warn, never takes writes down.
- `MIN_FREE_DISK_MB` (default 512, `0` disables) — documented in serverXR/README.md's env
  table. Verified live on a real boot: impossible floor → 507 with the message; normal floor
  → requests reach routing/auth untouched. 7 unit tests; serverXR suite 405 + contracts 96 green.
- Deliberately NOT a per-space byte quota — that needs a policy number the owner hasn't set.
  The chokepoint is in place for it; a quota can ride the same refusal shape later.
