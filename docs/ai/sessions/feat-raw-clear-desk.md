# feat/raw-clear-desk — the room earns its place

Owner, after the desk audit (2026-08-20): "yes its clear till you add geo".
The always-on backdrop posed a clear desk as an empty stage whose floor
rejected every click; prod's flat-paper desk was the honest look.

## What changed

- `src/raw/utils/roomContent.js` — `scopeHasRoomContent(nodes, scopeId)`:
  something spatial stands at this level. An unparented Light does not count
  (it draws nothing — it is the scope's light rig); a Scene card does not
  count (the backdrop deliberately does not see through it, so it would pose
  an empty room as the scene).
- `RawEditor.jsx` — the world overlay mounts, and the shell wears
  `is-world-overlay`, only when the current scope's room has content. Without
  the class the graph surface's own 36px grid returns (the CSS was already
  there, permanently shadowed until now).
- Tests: `roomContent.test.js` (the predicate, per scope) and a
  "room backdrop gating" describe in `RawEditor.test.jsx`; the old
  "room in EVERY scope" test rewritten to the new contract (spatial doc →
  room at root and inside; pure-code doc → flat everywhere).
- Wiki raw-lane bullet + USER_MANUAL: replaced the retired "three surfaces"
  section with the desk-and-room model.

## Verify

Fresh /open/raw → flat grid, no canvas. Add a Geo → room appears behind the
cards. Enter the empty Geo → flat again until the first child. Screenshots
read at DPR 2.
