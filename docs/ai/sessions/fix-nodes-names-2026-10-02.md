## 2026-10-03 — Nodes: an operator card wears both names, headers keep the name whole, neighbours name each other

- Tests and docs were written first (nodecheck 2026-10-02, ranked item 5); the source followed on 2026-10-03.
- `getNodeCardTitle()` in `src/project/nodeRegistry.js`: Math and Route cards read "Math · Add", "Route · Gate" while the name is the automatic one; a typed name reads alone. Drawn in `RawGraphSurface.jsx`; nothing stored changes.
- `raw.css`: the card's name sizes from its content (`flex: 1 1 auto; min-width: 0`); the family tag shrinks first with an ellipsis. Rectangles only.
- `NodePalette.jsx`: Webcam / Camera In and Video / Clip In carry a one-line note naming each other; Webcam gained keywords so "camera" finds it.
- `sceneExample.js` builds `world.environment` instead of the retired `world.light`.
- Measured: `npx vitest run src/raw src/project` 162 files, 2002 tests, all green. Not seen in a browser yet: the header widths (jsdom cannot lay a card out) need a look on the real surface.
- Owed, for the owner: the family tag "the scene" on Kiosk, Studio, In and Out is unchanged (an open question in `docs/ai/vocabulary.md`).
