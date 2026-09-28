## 2026-09-28 — the rig-builder line lands on dev, with hosted show playback

- Owner, 2026-09-28: "yes, merge to dev and make MOXIR public on dev". One integration PR carries
  the whole preview line (#587, #594–#630, #599, #603, feat/rig-nav, feat/moxir-versions, the
  desk's cue loop) squashed onto current dev, minus the preview-only session note.
- NEW — hosted playback (RIG_BUILD.md §16): with no desk, a room plays its cue list by the wall
  clock, `t = (now − mappingState.showEpoch) mod passLength`, the server's time measured per tab
  by Cristian's method. Precedence: page GO > desk > clock > the saved room. A SHOW chip names
  the look and, opened, the loop. `scripts/rigbuild/show-clock.mjs` starts it as one op.
- Tests: showClock.test.js (timing, wrap, before-epoch, hold 0, skewed viewers agree),
  useRigLook.clock.test.jsx (precedence via the real hook, the chip), schema round-trips,
  show-clock.test.js. Guards seen red: precedence swapped, loop disabled.
- Owed: see the PR body and OPEN_THREADS (prod only on the owner's word).
