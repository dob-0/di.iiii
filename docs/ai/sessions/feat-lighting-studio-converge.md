## 2026-09-24 — lighting desk: converge with the studio desk (viz.di.formal `studio`)

- Built on `fix/lighting-full-dmx-frames` (PR #570, still open): its one commit — full 512-slot
  DMX frames — is the base of this branch, so merging this also merges that.
- Port 1: `fx.js` is the studio's file (rig-extent Follow, even column/row slots, one lane per
  slot, short tail for few lanes, radar round the rig centre, the `fade` mode) with di.iiii's
  downbeat grid (`epoch`, `beatGrid`, `BEATS_PER_BAR`) kept. `engine.js` gains per-fixture
  effects (a fixture's own `fx.mode` beats the rig-wide one; `none` holds it still), rig bounds
  per effect group, and the LFO-capture fix; `desk.js` `/api/fx` takes `{ids, mode}` / `{all}`
  and scenes keep per-fixture fx. Two known-fixes rows (LFO capture, compact-rig Follow).
- Port 2: save safety. `writeShow` from the timer is now `saveSoon`, which never throws — a
  locked/read-only show file used to throw out of the timer (fatal inside serverXR) and lose the
  edit. Retry with backoff, in-place write after 3 failed renames, `status.save` for the page.
- Port 3: the studio desk's self-contained modules, server/engine half — follow times
  (`cues.js`; on a desk with no containers a follow goes on to the next scene in the library),
  colour effects (`colorfx.js`, never green), stage objects (`ui/objcore.js`, shared by engine
  and page) and stage labels (`markers.js`). Routes are inline in `desk.js` and read the live
  `state` binding (a space's show replaces `state`; the studio's route factories would have
  kept editing the old one). Identify beats objects. The studio's own 22 tests came with them.
