## 2026-11-12 - lights follow the deck (feat/deck-column-cue)

Launching a column of the VJ deck (the column's play button, or a K2 top-encoder push) can also fire the cue set for that column.

What changed
- `src/project/tops/vjDeck.js`: `deck.columnCues` (one cue id or '' per column), kept in step by createDeck, normalizeDeck, addColumn; `setColumnCue(deck, column, cueId)`. Old decks load all empty; a wrong value reads as ''; a shorter column count cuts the list. There is no remove-column or move-column function in the code, so nothing else needed to keep in step (grep for removeColumn / moveColumn: no match).
- `src/project/tops/vjDeckCues.js`: `cueForColumn(deck, column, cues)`, by stored id only.
- `VjDeckView.jsx`: one reporter `reportColumnLaunch(column)`. The header button calls `launchColumn` (write, then report). The K2 push is computed by the pure binding and written by useDeckMidi as before; useDeckMidi then calls its new `onColumn(column)` once (press only), which is the same reporter. The reporter calls the optional prop `onColumnLaunch(column)`, then, only when Lights follow is on, fires the cue by the props `cues` and `onFireCue`. The launch never waits for the light call.
- Lights follow: a toggle button (aria-pressed) in the deck's top bar, stored per viewer and per project in localStorage (`di.vjDeck.lightsFollow.<project>`, only the exact word `on` reads as on; try/catch on every read and write). Status line beside it: `Fired <cue name>`, `Column N has no cue`, `the light desk did not answer`.
- Choosing the cue: a row of small menus (select, "No cue" first, then the cues by name) under the Columns row, shown when Lights follow is on or any column already has a cue. Chosen because the deck already uses selects for per-layer choices (side, blend), a select is reachable by mouse and keyboard, and a row on the column grid does not crowd the column header buttons.
- `RawEditor.jsx` (the one host: the node window, the inside placement and the Perform desk all go through its vj.deck render): passes `cues` and `onFireCue`. `onFireCue` is `useMapApi(...).fireCue`, the same fireCue path the Perform cue list uses, so the wall and the 3D room follow.
- `src/map/cueFiring.js`: `fireCue` now returns the light call's promise (it returned nothing before); existing callers ignore it.
- `scripts/deck-column-cues.mjs`: dry run by default, `--apply` writes one updateNode op through `/api/projects/ID/ops`, scratch hosts on localhost only, never calls the light desk.
- `src/wiki/wikiContent.js`: Lights follow text in the VJ deck article.

Reader findings (line numbers are the joined tree before my change, 986bbb889)
- triggerColumn at vjDeck.js:365, two production callers: HOLDS (VjDeckView.jsx:735 and deckBinding.js:231-232; grep of src without tests shows no other).
- trigger(deck, layer, column) is the clip launch, bound to the matrix: HOLDS (deckBinding.js 'clip' case); it does not report.
- Both K2 maps bind encoder 1 to 4 push to Play column: HOLDS (xoneK2.js:57; the K2 (1.9) map is that map filtered and mapped, xoneK2.js:74-82, and keeps those entries).
- deck columns 1 to 16, no names, normalizeDeck drops unknown fields: HOLDS (vjDeck.js:169).
- fireCue(cue, applyOps) calls recallCueLighting first: HOLDS (cueFiring.js:54). It returned nothing, so a "did not answer" could not be known: I made it return the promise.
- Callers to copy: PerformWindows.jsx CuesWindow (~552), useMapDocument.js:122 fireCue, MapSurface.jsx:155: HOLDS (line numbers moved a little).
- Hosts of VjDeckView: only RawEditor.jsx:2367. PerformWindows.jsx does not import it; it calls ctx.renderNode, which is RawEditor's renderViewNodeContent (RawEditor.jsx PerformDesk renderNode prop). So one wiring covers both. The brief's "about line 2367 and also PerformWindows" HOLDS in effect, not as two render sites.

Brand lines followed (di-brand SYSTEM.md, rules 2 and 3 and 5; the tokens file was not opened, only variables already in vjDeck.css are used)
- Square corners: the select reuses `.vj-deck-chip` (border-radius var(--di-radius)); no new radius.
- Colour only through existing variables: `--di-ink` for the on state; no new colour value.
- State by text and a mark, not colour alone: the button says on / off and uses the same 1px inset ink ring as Preview only.
- 1px lines only; no shadow other than the existing inset ring; no motion added.

Tested (fetch is always a spy; the light call goes through recallCueLighting with a spy fetchImpl; a stubbed global fetch asserts no looks/fire or scenes/recall)
- `src/project/tops/vjDeckCues.test.js` (data and cueForColumn) and `src/raw/components/vjDeck/VjDeckView.cues.test.jsx`: off fires 0; on with cue fires 1 with that cue; on with no cue fires 0 and shows the status; K2 push (default console) fires 1, off fires 0, release fires 0; clip click fires 0; two quick columns fire 2 in order; false answer shows the status and the deck launched; a throwing fire call leaves the launch; the switch survives a remount; corrupt stored value reads off; blocked storage reads off; cue menu by name.
- Run 3: src/project/tops src/raw/components/vjDeck src/perform src/wiki: 76 files, 822 tests, 0 failed.

Not tested
- No browser, no real light desk, no real K2 (all by design of the brief).
- The K2 (1.9) console push path (same code path, not run separately).
- src/map tests (fireCue now returns a value), not in the allowed test folders.
- The tests were not run against the code before the change (no stash allowed); they import functions that did not exist, so the data and cueForColumn tests cannot have passed before. The view tests are unchecked before.
- The wall's "live cue" highlight in Perform (wall.setLiveCueId) is not set by a column launch.
