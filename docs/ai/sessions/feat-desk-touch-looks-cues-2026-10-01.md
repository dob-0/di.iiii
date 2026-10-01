## 2026-10-01 — the desk's Touch page plays looks and the cue list

Found for the MOXIR show: 0 desk scenes, a set of looks and a cue list. The Touch page rendered only
`visibleScenes()`, so a performer on a tablet saw "Save some scenes on the Control page." and could pick
nothing.

**What changed** (`serverXR/src/lighting/ui/`): a cue bar (`#tCueBar`: "Cue 2/5 · name", "next 3 name · waits
for GO", GO / back / stop / loop, 44px high) and a Looks grid (`#touchLooks`, same `.tbtn` tiles). A tap posts
`api/looks/fire` (cue layer, same as a cue) and the tile shows `on now`. The scene grid, its filter and
long-press bindings are untouched. Each section shows only with content; the hint appears only with no scenes,
looks or cues; the scene filter hides on a looks-and-cues show.

**Traps met**
- `pullState()` keeps its own `S.layers` for 700 ms after any POST (fader guard), so "re-pull after GO" left
  the previous look marked. The tile is now marked from the fire reply, and for a cue from `CUES.list[index]`,
  then a poll confirms 750 ms later.
- `CUES` was a `let` at the foot of app.js; `showPage()` runs before it, so a `#touch` first load would hit the
  TDZ. Declared beside `buildTouch`; the wiring test asserts the order.
- `.search { display: flex }` beats `[hidden]`; `.touchsearch[hidden]` added.

**Verified** against a throwaway desk (port 8765, scratch DATA_DIR, ARTNET_OFFLINE=1): desktop, iPad Pro 11,
iPhone 13: tap a look, GO twice, screenshots opened. Guard: `tests/test-wiring.js`.

**Open**: on a phone the cue bar is sticky only inside the Touch body, which is not its own scroller below
1100px, so it scrolls with the page; the phone viewport also leaves little room above the live strip.
