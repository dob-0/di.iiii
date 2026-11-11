## 2026-11-11 — Output: an empty surface draws nothing, not its "Surface 1" card (owner row N3689)

- Seen in the owner's recording `2026-11-11 04-56-28.mp4` (0:10–0:12): the Platina wall went black, then showed the "Surface 1" placeholder card. Owner: "just black or nothing better than the surface 1".
- `MapPlaceholderContext` in `src/map/MapSourceView.jsx`; `MapStage` takes `placeholders` (default true — the desk keeps its cards); `MapOutput` passes `placeholders={false}`.
- Test: `src/map/MapStage.placeholders.test.jsx` (desk shows the card, output draws none); `src/map` suite 275 passed.
- Not done: not yet seen on the real output window.
