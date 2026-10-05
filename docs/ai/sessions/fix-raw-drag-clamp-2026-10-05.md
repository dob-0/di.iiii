## fix/raw-drag-clamp-2026-10-05: the drag clamp measures the card's top-left; edge auto-pan

Source: `~/Downloads/raw-ui-audit-2026-10-05/audit.md` section 1 B1 and B8, section 4 PR 1 (owner approved the plan 2026-10-05).

**What was wrong.** `RawGraphSurface.jsx` dragged a card with the placement clamp, which assumes the point is the card's centre. A drag moves the card's top-left, so the card stopped half a card (100 units), the door (34 px) and 24 px short of the left edge (x = 132 / 158 / 171 / 208 at 74 / 100 / 113 / 150 %), and 44 units short of the top.

**What changed.**
- `src/raw/utils/dragClamp.js`: `dragClamp` keeps the top-left 24 px inside every edge of the canvas (stated in screen px, so it is zoom-independent); `edgePanVelocity` gives the auto-pan speed (24 px band, up to 900 px/s, proportional to depth, full speed past the edge).
- `RawGraphSurface.jsx`: the drag effect uses both. Auto-pan runs on animation frames while the pointer rests in the band; the pointer and clock live in a ref (`dragPanRef`) because each committed move re-runs the effect. `pointercancel` now ends a drag like `pointerup`. The placement clamp (double-click to create) is unchanged.
- Tests: `utils/dragClamp.test.js` (pure), `components/RawGraphSurface.dragClamp.test.jsx` (pointerdown, 16 pointermoves, pointerup against a laid-out canvas).

**Measured** (headless Chromium via `di-dev up rawpr1`, audit's `method/drag2.cjs`, Studio dragged -700 and -500): left edge x = 24 at all four zooms; top y = 119 (bar 95 + 24). Held at the left edge for 500 ms the canvas panned 370 px and stopped on release. Evidence: `~/Downloads/raw-ui-audit-2026-10-05/build/pr1/`.

**Limits / owed.**
- B8 (the +525 px jump) did NOT reproduce in jsdom on origin/dev: the repro test passes both before and after. It stays a guard. The suspected cause (a drag left running after a release outside the window) is covered by `pointercancel` and by pointer capture, not proven.
- Auto-pan speed (900 px/s) and band (24 px) are the audit's "speed proportional to depth" with a chosen ceiling; the owner's look on dev may retune the ceiling.
- The right and bottom limits keep 24 px of the card on screen (title grabbable), not the whole card.
