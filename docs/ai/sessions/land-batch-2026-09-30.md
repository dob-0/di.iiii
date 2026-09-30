## land/batch-2026-09-30

Batch landing into `dev`: #654 (fold notes after 651), #649 (inbox first run), #667 (cue-list LTP),
#663 (MOXIR hall 09-29), #664 (MOXIR the cut), #660 (MOXIR realism), #666 (smart view). #650 (backup branch) skipped.

- One textual conflict: `docs/ai/known-fixes.md` (#660 vs #664/#667 rows) — both rows kept, additive.
- `wikiContent.js`, `StudioViewport.jsx`, `RIG_BUILD.md` auto-merged with no conflict.
- Full suite runs in GitHub CI only (aylmo fan fault: no local full test/build).
- Semantic interaction fixed after CI: #663's `scripts/place/hall-crane.test.js` ("minimal rig under the measured crane")
  assumed the flat 8 m line (truss y 6 m, spreaders); #664 replaced that rig with the 15-degree "cut" (trim 5.06 m, bridled hoists
  with no spreader). Test now asserts the rig's own `trim_m`, bridle/chain parts. Intent (truss keeps its trim, room under the bridge) kept.
