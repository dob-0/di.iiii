## 2026-10-01 — a followed space stays one space: no lost edits, copies agree, restarts resume

Owner: "we have di.iiii and we can't sync the works so lets fix that gap" → "ok it works, now fix the gaps".
First real two-machine run (aylmo follows ponyo, `sync-test-1001`, before these fixes): aylmo→ponyo 202/877/109 ms,
ponyo→aylmo 135/128/119 ms, both at v8 with the same 8 entities. Then the gaps found by reading `serverXR/src/follow/`:

- **Lost edit on a 409** — `carry()` marked the target's own new ops (the refusal's `pendingOps`) as seen; the next
  tick skipped them and moved the cursor past them. Fixed; guard `follower.test.js` (fails on the old code).
- **Copies that disagree for good** — concurrent edits to the same field land in different orders on each side.
  New `followConverge.js`: the host's order is the order (Figma's server-ordered rule); once a stream is quiet after
  both sides moved, and once at start, the follower writes the host's copy over its own as one
  `replaceDocument`/`replaceScene` through its own route. Never overwrites a full copy with an empty host. Guard:
  `followIntegration.test.js` "agrees on the host's value…" — fails without it (the rooms never agree).
- **Old edit applied twice after a restart** — cursors + carried opIds were in memory only and the receiver dedupes
  only inside its retained 500 ops. Now saved to `DATA_ROOT/follow-state/<space>.json` (temp + rename), resumed on
  start, reset when a log restarted. Guard: "resumes from where it was…" — fails without the saved state (the old op
  is in the follower's log again).
- Docs: new `docs/architecture/SPEC_follow.md` (the follow was in no spec); pointers from `THREE_DISTANCES.md` and
  `SPEC_di_sync.md`; three known-fixes rows; wiki line "WHEN BOTH CHANGE THE SAME THING".

Tests: `serverXR/src/follow/` 8 files, 65 tests pass (2 new files, 2 new integration cases).
Not done: a run of THESE fixes between two real machines (needs ponyo's di to host again, Emily's yes); intent-
preserving merge (CRDT); one remote per space; deletes/renames/visibility not carried; no sync UI or discovery.
