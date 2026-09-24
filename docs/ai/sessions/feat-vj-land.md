## 2026-09-24 — the VJ deck lands on dev: Clip In, the deck, its picture on the card, cards land where you click

- Owner: "i can't see the vj part where is that". The deck (09-14) lived only on `feat/vj`,
  which the 09-14 install (`0.4.14-vj.3`) was packed from; every build since is packed from
  dev, so it vanished.
- Why not merge `feat/vj`: it carries the whole Raw fix wave (unified inside view, scripts in
  a worker, live feeds, inspector, examples — ~20 commits) that never landed on dev and has no
  PR. Landing that is its own decision. This branch takes only the VJ lanes: #450 (Clip In)
  and #451 (the deck) cherry-picked with authorship, 81f6b36a (map Pictures surface loads
  clips from the project) cherry-picked, and the hookup REWRITTEN against dev's
  `useTopNetwork` (the old one was woven into the wave's LiveFeeds / InsideView).
- Hookup: `toTopNetwork` keeps `vj.deck` + in1..in4 wires and expands decks
  (`expandDecks`, deck-into-deck via alias); `useTopNetwork` takes `assets` + `projectId`
  and runs `useClipVideos`; `topThumbnails` holds several canvases per id (card + window);
  cards ask `isPictureType` / `pictureIdOf` — the deck card shows its master (was OPEN).
  `a2e7262d`'s VjDeckView phone layout + input-tile pictures ported; its InsideView part is
  wave-only and not here.
- Cards land where you click: `placeNewCard` (`src/raw/utils/cardPlacement.js`). Measured on
  the dev stack, desktop: before, tap (1000,400) → card middle (1021,432); after (1001,401).
  The first card on an EMPTY canvas still re-fits the view (it shows in the middle) — owed.
- "IN rail says nothing on live texture inputs" is the wave's InsideView — not on dev, so not
  fixable here; dev's inside of a picture operator is `TopInsidePanel`.
- Walk: `scripts/verify-vj-deck.mjs` (SwiftShader, H.264 plays in Playwright's Chromium).
  Clip In → deck (made from the palette) → Picture Out, two ffmpeg-generated mp4s; the Picture
  Out card reads mean 125 / spread 32 on Mix and 102 / 24 on Difference — the blend reaches Out.
- Still missing vs the 09-14 concept: BPM → clip sync (tempo is kept, nothing follows it), MIDI
  on the grid, the perform split and the "inside" placement, map handoff beyond Pictures.
  The deck window opens over its own card and the Picture Out card on desktop (panel-window
  placement for a 760-wide window) — owed.
