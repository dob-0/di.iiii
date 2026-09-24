## 2026-09-24 — lighting desk: converge with the studio desk (viz.di.formal `studio`)

- Built on `fix/lighting-full-dmx-frames` (PR #570, still open): its one commit — full 512-slot
  DMX frames — is the base of this branch, so merging this also merges that.
- Port 1: `fx.js` is the studio's file (rig-extent Follow, even column/row slots, one lane per
  slot, short tail for few lanes, radar round the rig centre, the `fade` mode) with di.iiii's
  downbeat grid (`epoch`, `beatGrid`, `BEATS_PER_BAR`) kept. `engine.js` gains per-fixture
  effects (a fixture's own `fx.mode` beats the rig-wide one; `none` holds it still), rig bounds
  per effect group, and the LFO-capture fix; `desk.js` `/api/fx` takes `{ids, mode}` / `{all}`
  and scenes keep per-fixture fx. Two known-fixes rows (LFO capture, compact-rig Follow).
