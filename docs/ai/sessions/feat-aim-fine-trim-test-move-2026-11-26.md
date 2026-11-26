## 2026-11-26 — light desk: fine pan/tilt trim and a test-move button (owner N6857)

- The owner's words (N6857): "can we have more steps ... i want tune best best" and "some button where can click and there are some movement for test", to see which lights want Invert or Swap.
- Trim takes two decimals. On a head whose pan or tilt has a fine partner (`roles.js` `FINE_NAMES`: panFine or pan_fine, tiltFine or tilt_fine) the engine renders one 16-bit position: coarse + fine/256 + the test swing, mirrored as a whole when inverted, limited by the whole-step min/max, plus the trim, then split back into coarse and fine. A head without a fine partner keeps whole steps (`desk.js` `limitsFor` rounds the stored trim).
- Same bytes for the show as it stands: whole trims with fine 0 render exactly as before; a frame of the live Reika desk through the dev engine and this one: "2048 bytes compared, 0 differ" (33 lights, 18 with pan).
- Step 1 / 0.1 / 0.01 on the Limits panel and on the Aim toolbar (kept in the browser, localStorage `trimStep`, default 0.1); the number boxes and the faders take that step, whole steps on a head without fine channels.
- Test move: `POST /api/fixtures/testmove {ids, axis: pan|tilt, seconds}` or `{off: true}`. Live only and never saved, like identify (`state.testMove`, not enumerable). A raised-cosine swing of 20 steps out and back every 2 s, 4 s a press (whole swings, at most 10 s), applied on the desk side before Swap and Invert: a light that turns the other way from the rest wants Invert, one that moves on the other axis wants Swap. `/api/state` gains `fineNames` and `status.testMoving`; the contract has the route (class a).
- UI: Move pan / Move tilt on the Limits panel (the selected lights) and in each universe's header on the Aim page; a swinging Aim card wears an outline; a hint line under the buttons says what to tick.
- Tests: `tests/test.js` 213 ok, `tests/test-http.js` 161 ok, all 12 desk test files pass, `lint-api-contract` "77 routes in the contract".
- Pictures: see the PR.
- Not done: `headMotion.js` `headsPose` still knows only panFine / tiltFine, so a look's motion on a pan_fine head writes its coarse byte only, as before.
