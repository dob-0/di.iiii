## 2026-10-05 — Raw cards can be resized from a square corner handle

- A square handle (no rounding) in a card's bottom-right corner resizes width and height. The size lives in the node's own values as `values.cardSize = { w, h }` (graph units); `shared/projectSchema.cjs` keeps all node values, so nothing was added there, and `cardSize.test.js` proves it through an `updateNode` op.
- Same rule as the drag fix: the card changes in local state while held, ONE `updateNode` on release, none for a click. Double-click on the handle writes `cardSize: null` (the auto size); the value is null rather than deleted because node values merge shallowly.
- Minimum: width 140, height = header + ports + picture + foot (`cardGeometry.js`); the title and every port row stay readable.
- A taller text or list card draws as many lines as its box holds at its width and says "+ N more" only for the rest (`cardContentLayout`). Measured at the real pointer: 6 lines auto, 14 when dragged 260 px taller.
- Zoom-correct: the pointer's travel is divided by the zoom; at 79, 99 and 149 % a 60 x 40 px drag grew the card by exactly 60 x 40 on screen (`scripts/verify-raw-resize.mjs`, Playwright page.mouse, DPR 1.25). The zoom buttons step by 10 %, so 82/100/153 % were reached as 79/99/149 %.
- Wires, the fit and the on-screen count use the card's own width. Placement of NEW cards (`cardPlacement.js`, `objectCards.js`) still assumes the default width: a resized card can overlap a neighbour placed later. Owed.
- Resize is wired for the main canvas only (`RawEditor` node surface); the world-panel surface does not pass `onResizeNode`, so it shows no handle.
