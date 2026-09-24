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
- Port 4: ENTTEC. On Windows a missing or lost widget is reopened asynchronously (`mode` and the
  open off the event loop, still at most once a second) — each retry used to block the frame
  path ~70ms. Lost/reconnected bookkeeping and `status().state`. POSIX keeps its fast sync open.
- Port 5: UI for the two pieces that fit di.iiii's desk cleanly — the colour-effect pads (Control
  under FX + Touch) and follow times (right-click Follow… editor, "→ 3s" badges on scene rows,
  "Step 1 of 2 · next in …" beside the transport, a pill). Relative `api/…` URLs. Checked in
  headless Chrome on an offline desk: pads drive the desk, badge, running step, no page errors.
- Not ported (need di.iiii's UI to grow first — see the report): the objects and labels drawing
  (studio's per-page `views`/`viewOf`, `snapv`, `.stage-tools` toolbar, poll guards), the Stage
  page, video pixel-mapping, the Network panel (OSC / sACN-Art-Net in / Art-Net alongside).
  The server halves of objects and labels ARE in (routes, engine, show file).
