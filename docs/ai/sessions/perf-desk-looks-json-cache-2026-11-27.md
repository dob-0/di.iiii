## Light desk: the looks JSON is cached and pages skip unchanged looks

**Problem (measured by a peer, 2026-11-27 01:36, live desk):** GET /api/state took 0.80 s and 1.11 s; the DMX loop froze ~0.5 s every 1-2 s. 80 looks x 64 steps (median 673 kB each) are 42.6 MB of the state, stringified on every poll on the loop's thread, and every open page pulled and parsed all of it about once a second.

**Change:** `serverXR/src/lighting/desk.js` `looksJson()` caches the looks as text (valid while `state.looks` is the same array, same length, every element `===`, and `looksEdits` unchanged); `GET /api/state` carries `looksRev`; `?looksRev=N` equal to current leaves `looks` out. Page: `ui/app.js` `pullState()` and `ui/aimpanel.js` `readBack()` send the rev they hold and keep `S.looks` when the reply leaves it out. No parameter = the reply is exactly as before.

**In-place mutations of a look object:** none exist today (audited desk.js, looks.js, lookMotion.js, headMotion.js, cues.js, cuerun.js, showfile.js, standalone.js, rig/sinks.js; fireLook only writes the layer). Every change puts a new object in the list. Anyone who later edits one in place must call `looksEdited()` (also exported on the desk object).

**Numbers** (20 GETs after the first, 80 looks, Art-Net off, client and server in one process): 80 synthetic ~670 kB looks and the real 42.6 MB state, before/after in the PR body. Bench: `node serverXR/src/lighting/tests/bench-state.js [lighting dir]`; generator `tests/bigLooks.js`.

**Tests:** `serverXR/src/lighting/looksCache.test.js`. Run: `cd serverXR && ../node_modules/.bin/vitest run src/lighting`.

**Not tested:** the live desk and a real browser.
