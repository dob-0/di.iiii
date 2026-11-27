## 2026-11-27 — the 3D preview's strobe 3 Hz clamp follows the desk's strobe-limit setting (waits for the owner's yes)

Split out of PR #1403 (the desk part) on review S2: this part changes what every space's 3D screen flashes, not only the desk mirror, so it waits for the owner's yes. Not queued.

- `src/rigbuild/strobeCap.js`: `setStrobeLimit` / `strobeLimited`; off (default) = `capStrobeHz` passes any rate; on = the 3 Hz clamp as before. The desk's `output.strobeLimit` feeds it from `src/rigMirror/useLightingMirror.js` (`pullPatch`).
- `rigFlash.js`: off = every lamp flashes at its own rate, no shared 3 Hz grid. `lookMotion.js`: strobe slice floors at 2 frames when off.
- Tests that pin the old cap set the switch on; new cases in `strobeCap.test.js` cover off. Same switch as the desk (words of the owner, N7618: "i dont want any limits so yes").
