## 2026-11-27 — the desk's drawn APC40 looks exactly like the di music page

- Owner N7319/N7320: the MIDI pane's APC40 must be the one on the di music page, not a flat copy. The #1389 port had removed glow, bevel and shadows; he rejected a flat device drawing before (studio-music e3fa285, N6204).
- `serverXR/src/lighting/ui/apc40draw.js`: the CSS is now the music page's `.apcp` rules verbatim (studio-music HEAD 123d2b9: native 1108 px panel, uniform scale to the card, gradients, bevel, shadows, glow, hit glow, knob rings). Only the desk's wiring differs: pad names, LED colours (on air = red with glow, ready = dim LED, empty = the music page's light pad), clicks, legend. Track and device knobs rest at 0 like the music page.
- Header keeps the source, licence and "ported" notes. Same branch base as #1397 (stacks on it).
- Checked headless (private Chromium, no window): panel at native size, rest state (empty slots, labels hidden) differs from the music page in 0.52 % of pixels (3 lit scene buttons, 4 arrow glyphs replaced by labels); vitest `src/lighting` 17 files, 210 tests green; fit report at 1534x830 and 1536:864: labels cut 0, controls outside the panel 0.
- Not checked: the real desk page on the owner's screen (no live desk used).
- Rollback: revert the PR (the flat drawing returns).
