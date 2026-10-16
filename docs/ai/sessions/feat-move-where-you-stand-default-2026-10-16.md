# "Where you stand" is the default turn everywhere (2026-10-16 17:3x)
**Asked (owner, with a screenshot of the room page's Display ▸ Move):** "make everywhere move everywhere in di where you stand mode by def".
**Changed:** `src/studio/navigation/freeMove.js` `DEFAULT_TURN = 'place'` (junk falls back to it); `preference.js` reads it when nothing is stored or storage is blocked.
One route covers every page: the Studio viewport (the room page draws through it since #972) and the public viewer's Move control read this one preference.
A choice a person already stored on a device stays theirs. Move 1's golden test changes only these two defaults, with the owner's words; every number of the move is unchanged.
**Tests:** `vitest run --dir src studio/ project/` — 197 files, 1932 passed. (A plain `vitest run src/project` also picks up serverXR/src/project*.test.js, which need serverXR's own node_modules.)
**Seen:** agent screen, fresh browser memory: dev (old) — "Around a point ahead" pressed; test copy http://stand-default.diiii.localhost/moxir/p/moxir-v2-11 — "Where you stand" pressed, nothing stored.
Picture: ~/di-health/merge-proof/stand-default-before-after.png. **Not tested:** the drag itself on a phone (touch); the Studio's own Scene window by eye (its test passes).
