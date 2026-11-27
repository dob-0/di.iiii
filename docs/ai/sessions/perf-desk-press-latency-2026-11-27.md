# Light desk: press latency audit and one-call pad press (2026-11-27, dob-3f)

Owner N7308: "audit and check that u can fast it more". Goal: an APC40 pad press feels instant, rig light and pad LED.

## Measured (scratch copy of the Reika checkpoint 2026-11-27-034941, base dev b9b667bb, output disabled, host load ~13 on 16 cores)
Tools (in the repo, re-runnable): `serverXR/src/lighting/tools/pressLatency.mjs <desk url>` (server links: send, reply, first pushed DMX frame, event-loop probe, state refresh) and `tools/pressLatencyPage.cjs` (page links, run with `di-test-browser run`, fake APC40 output, the page's own midiSend). n = 20 presses each, 1.5-2.2 s apart.

| link | median ms | p95 ms |
|---|---|---|
| page queue: midiSend to POST leaving (40 ms timer) | 40.2 | 41.9 |
| POST api/looks/fire reply, from the page / from node | 5.3 / 2.4 | 8.3 / 3.7 |
| send to first pushed DMX frame carrying the new look | 2.5 | 3.8 |
| worst answer of a 10 ms probe in the 1.5 s after a press (loop hold by the fire + its async save) | 2.6 | 11.2 (max 12.5) |
| GET api/state?looksRev=<current> after the press | 3.2 | 5.2 |
| pad light: midiSend to first light sent (13 of 20 within 2.2 s; waits for the state poll) | 594 | 2010 |
| 4 pads 30 ms apart: first press to last reply | 188 | 205 |
| pad press while play-in-order is on (old: autoplay-off call + fire): queue to the fire POST leaving | 88.1 | 131.1 |

Size: GET api/state without looksRev = 42,986,484 B, 137-158 ms locally (3 runs); with the current looksRev 51,739 B, 3 ms. looks are 99.9 percent of the bytes (80 looks x 64 steps). show.json 42.97 MB; a 43 MB copyFileSync took 1 ms here (reflink), so the per-fire save is cheap on this disk.
Live desk, 3 small GETs: api/dmx 1.8 ms, api/cues 1.0 ms, api/summary 1.2 ms (loop free at that moment).

## What the numbers say
- The server is not the lag: 2.5 ms to the first frame, loop hold under 13 ms. #1387 and the async save did that.
- The pad's own delay is client side: 40 ms timer + 40 ms gap per queued item, and a second POST when play-in-order is on; the pad light waits for the next state poll (median 0.6 s). Covered elsewhere: the red-pad work (urgent send, onAir) and #1388 (instant light guess). Not duplicated here.
- A full state fetch (no looksRev) is still 43 MB. Any client that does not hold the looks (first load, an older page, a bridge) pays 0.15 s locally and more on a loaded desk.

## Changed
- `POST api/looks/fire` accepts `autoplayOff: true`: turns play-in-order off in the same call (only if it is on, before the quantize wait). The pad sends one request instead of two (app.js look pad handler). Unknown look: 404 and autoplay untouched.
- `pressFire.test.js` (5 tests), the two bench tools.

## After
Pad press with play-in-order on: queue to the fire POST leaving 88.1 to 40.2 ms median (p95 131.1 to 40.3), n = 12 each. Other links unchanged by this PR (no server change in their path).

## Not checked
The real APC40 and real Web MIDI (owner is playing it). Effects of the red-pad work and #1388 on these numbers (not on dev yet).

## Rollback
Revert the PR. An old page that still sends two calls works with the new desk; a new page against an old desk loses only the autoplay-off.
