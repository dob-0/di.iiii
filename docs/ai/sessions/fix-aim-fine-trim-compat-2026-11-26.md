## 2026-11-26 — fix: fine trim byte-compat with the old engine, test-move re-press (review of #1373)

- Meant: a show that uses only whole trims must render the same bytes as before #1373, on every head; the Move button must never snap a head.
- Done: `engine.js` position branch = the old value first (copied from bdf2b70d8), then only a fractional trim or a test swing added on top (fine channel when the head has one, else the coarse, clamped; garbage limits cannot make a garbage byte). `testmove.js` `pressTestMove` / `testMoveSteps` / `testMoveLive`; `desk.js` testmove route keeps `from` on a re-press, keeps the other axis as `prev`, `{off:true, ids}` stops only those. `app.js` localStorage in try/catch. Wiki Move paragraph says what a re-press does.
- Design note: with Swap, the fine byte stays on its own channel (old behaviour), so the desk fine value of the swapped-from axis is not carried; that was the old engine too, by the lead's rule "byte-identical in every case".
- Proof: grid compare against bdf2b70d8 (100352 cases, whole trims, no swing) 0 differing; live show copy "163840 bytes compared, 0 differ"; planted 2.5 trim copy shows 80 differ (compare is live). Test counts are in the PR.
- Rollback: the engine before #1373 truncates a fractional trim toward 0 (`trim | 0`), 2.5 becomes 2; whole trims are unaffected. Also in known-fixes.
- Not run here: test-keymap.js and test-node-section.js need a browser / DESK_URL (no chromium at /opt/pw-browsers on this machine).
- Lesson: a "same bytes as before" claim needs a grid over limits, flags and fine values plus the live show, not one frame (the first proof was one frame).
