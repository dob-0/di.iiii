## 2026-10-21 — follow audit F10, F13, F14 settled by controlled interleavings; F13 is real

- F10 FIXED by ccd00a91: `assets.test.js` guard on a fake clock (1 s period) — a file named only by a converged document is not fetched at 999 ms, fetched at 1000 ms; red on `ccd00a91^`.
- F13 CONFIRMED, not fixed: `followRaces.test.js` "F13" (asserts the loss exactly) — host restored v3 → v1, three edits to v4, the follower resumes from cursor 3 and never reads v2 and v3. Fix sketch (a log epoch beside each cursor, a protocol change) in the audit; known-fixes OPEN row.
- F14 FIXED by 0934fe96 for a default follow: state dropped, restart, each side's version moves by exactly 1 (the next real edit), nothing reverted. A `--replay` follow still re-lands old ops (4 in the same run, once); no reverted value was built for it — still owed.
- F9 and F12 rows corrected to FIXED (544510e, #905) from what C2 and C1 show.
- The fake install in `followRaces.test.js` gained `retain` (the retained/dedupe window), `stamp` (op clock), `backup()`/`restore()`, and `pair()` a `restart()`.
- Each new test stable 5 of 5 while the whole serverXR suite ran beside it (2078 passed). Not run: the full root suite, a real two-machine follow.
