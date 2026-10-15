## 2026-10-15 — The room page: one-row scene bar, Display menu on one grid, the scene strip paged through ALL scenes

Branch `feat/room-page-scenes-2026-10-15` (from `feat/moxir-v2-10-forty-2026-10-15`). Owner, 05:3x, from a screenshot of
`/moxir/p/moxir-v2-11` at ~1700 px: "why is the UI messed and why are the scenes not selectable; make the dev version multi-page for
now; in the future maybe we connect it in main and let the audience play."

**What was meant / what was wrong (read from the code, then seen on the real GPU):**
- the bar's two groups were `flex-wrap: wrap` with chips that never shrink, so a long version name pushed the right group to a second row;
- the Display menu's items sat in wrappers of different widths (the Move control brings its own);
- the bottom strip was the ten FAVOURITE bricks (`control.favourites`), and its "playing" card came from the server's runner while the SHOW chip of a
  show with `showSource: 'clock'` reads the page's own clock: two sources, so the card and the chip disagreed (strip on "The last run", chip on 34 / 50).

**Changed**
- `SceneBar.jsx`: layout moved to CSS (`BAR_RULE`): one row, never wrapped, from 900 px; left group shrinks (chips ellipsis, min width = the touch target);
  under 900 px two rows by design. `DisplayChip.jsx`: items one width, aligned to the chip's left edge.
- `RoomFavourites.jsx` (now the scene strip): ALL scenes, 10 per page, ‹ › and "n / N" (PAGE chosen over a scroll: ten cards never move under the
  hand, and "page 4 of 5" says where you are in 50), opens on the page of the playing scene, follows it when it changes. Playing scene = desk runner
  (`deskCues.read`, the chip's own read) where a desk drives, the chip's clock index where the clock drives (`playingIndex`), else the server answer.
  A click = the same `POST …/choose` as the list (the server decides who may). A viewer the server blocks gets a card that does nothing and says
  "the show runs on its own clock". ROOT CAUSE of "not selectable": the show's `showSource: 'clock'` makes `lightBlocked` true, so EVERY card was
  disabled ('no-light'). On a clock show there is no runner to GO, so a click is now the chip's per-viewer PREVIEW (`onPreview`, outlined in cyan;
  nothing is posted); the clock keeps running for everyone else.
  FUTURE HOOK (owner: audience playing, NOT built): the prop `audiencePlays` (false) - true hands every click to the server, which still decides.
- Wiki: the show page article (strip) and the rig versions article (scene bar), `updated` bumped.

**Left as it was / owed**
- The stars in the SHOW list still write `control.favourites`; the strip no longer reads them (it lists everything). Owed: remove the stars or give
  them a use (e.g. a "starred" first page) - the owner's call.
- A clock-driven show cannot be driven for everyone from the page (the clock is the show); only the viewer's preview changes. Making the audience's
  choice change the clock is the future plan above.
