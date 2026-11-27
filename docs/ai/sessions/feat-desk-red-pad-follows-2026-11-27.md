## 2026-11-27 — Light desk MIDI: the red pad follows the look on air from every source

- The desk now says which look is on air (looks.js onAirOf: top mix layer that is on, above 0, with an existing look) in state.onAir and GET api/onair (85 bytes).
- The armed MIDI tab polls api/onair every 150 ms; other source to red pad measured p50 131 ms, max 236 ms (before p50 2072 ms), on a scratch desk with a copy of the 42 MB reika show.
- #1388 I1, L1, L2: the pad guess ends by request time; a disarm resets it; LED code is guarded before the tile's POST.
- Press to POST: the page waited 186 ms (queue timer, 74 ms log layout, send gap), now 0 ms; the desk part is about 5 ms.
- MIDI enable, input and preset are kept per browser (localStorage); ARM per tab (sessionStorage) through the one takeover; a duplicated tab stays Safe.
- Not tested: real APC40, the live desk, SSE. Full numbers: agent-reports-2026-11-27/apc40-midi-test/REPORT-red-pad.md.
