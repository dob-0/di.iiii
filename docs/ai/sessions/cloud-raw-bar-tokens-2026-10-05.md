## 2026-10-05 — Nodes: one bar, tokens, opening view, one Help sheet

Branch `cloud/raw-bar-tokens-2026-10-05`, built on `fix/raw-one-open-2026-10-05` (PR #773), from the approved audit (`docs/ai/audits/raw-ui-2026-10-05/audit.md`, build-plan rows 5–8). One commit per row.

- **Row 5, one bar.** The Nodes tools (Scene, count, Chat, `?`, ⋯) are 28 px cells in `SurfaceBar`'s slot; the second header is gone while the bar is up (it stays only on a browser-only canvas and in zen, where there is no bar). The account is the bar's last square cell (`BarAccount`, lazy); `rawShowsFloatingAccount` keeps the float only where no bar exists. ← Projects moved into ⋯. The canvas top is the bar's bottom (40).
- **Row 6, tokens.** `src/raw/styles/rawChrome.css` holds the 4/8/12/16/24/32 spacing, 11/13/15 type, 28/44 cell and 0–2 px radius tokens, the bar cells, the zoom strip (`− 100% + Fit`) and the Help sheet. Every `999px`/`50%` radius in `src/raw` is now 0; `rawChrome.test.js` fails on any radius over 2 px in `src/raw`.
- **Row 7, opening view.** `openingView` (pure): top-left, 24 px pad, ceiling 100 %; runs after fonts. Card body 13 (width stays 200); tiers are keyed to on-screen size (full ≥ 11/13 zoom, summary ≥ 0.5, then title); no "showing N of M".
- **Row 8, Help.** One sheet, first line counted from the open project; keys read from the keymap.

Not done: only the new chrome sheet is on the token scale — the rest of `raw.css` (5.4k lines) still has its old font sizes and paddings, so the census test covers `rawChrome.css`, not the whole lane. Help is still a centred dialog, not in the right region (that is row 3's column). The ⋯ menu and the window headers were not restyled. Nothing was seen in a browser (no desktop/phone screenshots, no `check:toolbar-overlap`).
