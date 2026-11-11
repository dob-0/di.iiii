# integrate/deck-round-4

What the branch holds: base 585240f61 + merge of feat/deck-ui-4-panes (e63700a03) + merge of feat/deck-ui-4-perform (3323d0793).
Only conflict: docs/ai/known-fixes.md (both appended an entry at the end); both entries kept, order panes then perform. src/wiki/wikiContent.js merged without conflict.
The two builders' changes touch different files (deck panes in src/raw/components/vjDeck, Perform in src/perform); no code conflict.

Also added: scripts/deck-round-4-walk.mjs (walk for widths, hit zones, fold, reset, lock, Perform arrange). It was written but NEVER RUN.

Install facts (run): base 585240f61 is an ancestor of HEAD; 21 files changed against it; package.json, package-lock.json, serverXR/package.json unchanged (0 matches).

Tested: nothing. The lane gate (scripts at platina/tools/lane_gate.sh) answered "wait" 12 times in 12 minutes (output 26.8 to 42 fps, floor 55-60); the 12-ask limit is spent, so no vitest run and no browser run was made.
Not tested: all new tests of both builders (deckPanes.test.js, VjDeckView.panes.test.jsx, arrangeAll.test.js, arrangementStore.test.js, PerformArrangement.test.jsx), the existing vjDeck, perform and wiki suites, and every look in a browser.
Brand: no visual change made in this branch beyond the builders' own (their notes list their brand lines).
