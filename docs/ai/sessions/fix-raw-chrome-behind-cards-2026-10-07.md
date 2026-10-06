## 2026-10-07 — Raw: the wordmark and the zoom strip sit behind the cards

Branch `fix/raw-chrome-behind-cards-2026-10-07`, stacked on `cloud/raw-bar-tokens-2026-10-05` (PR #778, which moved the zoom strip into `rawChrome.css`). Owner row N164: on a Raw project in the `hayfilm` space the di mark and the zoom box drew over the cards.

- **Cause.** `.raw-surface-wordmark` was `position: fixed; z-index: 1200`, `.raw-graph-zoom-controls` was `z-index: 2`, and `.raw-graph-stage` (the cards) had no z-index, so both painted over any card under them.
- **Fix.** `.raw-graph-stage` z 1; the wordmark and the zoom strip z 0 (above the canvas ground, below the cards). CSS only.
- **Test.** `src/raw/styles/chromeBehindCards.test.js` — 3 fail before, pass after. Seen at 1920×1080 and 1280×800 (NVIDIA): the topmost element at the mark and strip centre was the chrome before, the card after.

Not done: a card dragged fully over the strip hides it until moved (the owner's rule: cards are the core). Retarget the PR to `dev` once #778 lands.
