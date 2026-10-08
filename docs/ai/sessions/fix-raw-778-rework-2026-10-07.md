## 2026-10-07 — Nodes: #778 reworked onto dev (one bar, tokens, opening view, Help) with #777's right region kept

Branch `fix/raw-778-rework-2026-10-07`, from `cloud/raw-bar-tokens-2026-10-05` (PR #778) merged with `origin/dev` (which holds #777, the side column and the inside view). Supersedes #778.

- Merge: Help is #778's one sheet, shown inside #777's right region (no modal). Inside a node the bar holds `← Back` and the crumb; the strip under it keeps the meta line only, and the whole strip only where there is no bar (zen). Summary tier and in-card edit both kept. Bar cells say scene / object.
- First load (finding seen 10-05: To do + Contacts windows stacked over the canvas): List/Text have no windows since #777, so nothing covers the canvas; guarded by `RawRegionAndInside.test.jsx` "first load", red with List/Text windows allowed, green now. Tool windows (Monitor, Webcam…) a project remembers as open still open on load — 21 tests encode that as the project's arrangement; left as a question for the owner, not changed.
- Opening view is fit-to-width (§3.7 says so; #778 fitted width and height, which opened MOCT at 66 % in the summary tier at 1920x1080). Seen: 100 %, full tier, first card 24 px under the bar. Fit (H) is still the overview.
- The right region started at y 0 under the bar (z 1350 over z 60) and covered the bar's Chat, ?, ⋯ and account; it now starts below the bar.
- Inside a node: the bar's place line continues `› To do` then `← Back Esc` (SurfaceBar `trail` slot); the strip keeps the meta line. On a phone the trail does not fit, so Back and the name stand in the strip.
- Phone bar (390x844 measured, scrollWidth 529 in 390): bar is cell+1 px on a finger; only `?` and `⋯` on the right, Scene / outliner count / Chat / Perform / account are rows of ⋯.
- One size per datum: inside-view List rows and Text body are 13 px (were 17 / 20). Help counts "objects".
- Not done: the summary tier keeps a card's full box, so a phone opening (50 %) shows tall, mostly empty cards — spec-conformant, owner to judge. The family word ("make") still sits on every card (audit D5) — not one of #778's rows, left. The rest of `raw.css` is still off the token scale (census covers `rawChrome.css` only).

### Carried from #778 (2026-10-05) — Nodes: one bar, tokens, opening view, one Help sheet

Branch `cloud/raw-bar-tokens-2026-10-05`, built on `fix/raw-one-open-2026-10-05` (PR #773), from the approved audit (`docs/ai/audits/raw-ui-2026-10-05/audit.md`, build-plan rows 5–8). One commit per row.

- **Row 5, one bar.** The Nodes tools (Scene, count, Chat, `?`, ⋯) are 28 px cells in `SurfaceBar`'s slot; the second header is gone while the bar is up (it stays only on a browser-only canvas and in zen, where there is no bar). The account is the bar's last square cell (`BarAccount`, lazy); `rawShowsFloatingAccount` keeps the float only where no bar exists. ← Projects moved into ⋯. The canvas top is the bar's bottom (40).
- **Row 6, tokens.** `src/raw/styles/rawChrome.css` holds the 4/8/12/16/24/32 spacing, 11/13/15 type, 28/44 cell and 0–2 px radius tokens, the bar cells, the zoom strip (`− 100% + Fit`) and the Help sheet. Every `999px`/`50%` radius in `src/raw` is now 0; `rawChrome.test.js` fails on any radius over 2 px in `src/raw`.
- **Row 7, opening view.** `openingView` (pure): top-left, 24 px pad, ceiling 100 %; runs after fonts. Card body 13 (width stays 200); tiers are keyed to on-screen size (full ≥ 11/13 zoom, summary ≥ 0.5, then title); no "showing N of M".
- **Row 8, Help.** One sheet, first line counted from the open project; keys read from the keymap.

Not done: only the new chrome sheet is on the token scale — the rest of `raw.css` (5.4k lines) still has its old font sizes and paddings, so the census test covers `rawChrome.css`, not the whole lane. Help is still a centred dialog, not in the right region (that is row 3's column). The ⋯ menu and the window headers were not restyled. Nothing was seen in a browser (no desktop/phone screenshots, no `check:toolbar-overlap`).
