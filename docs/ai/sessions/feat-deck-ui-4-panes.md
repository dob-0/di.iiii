# feat/deck-ui-4-panes: the panes of the VJ deck (round 4, batch 4)

Branch made from 585240f61 (the version on the deck at 02:28 on 2026-11-12). Pane part of the audit
`deck-ui-audit/code-audit.md` (gaps G2, G3, G6, G8, G10 and section E). No browser was started; a later
job merges and looks at it.

## What changed
- G2: the bottom row stacks at 683 px or less (`NARROW.bottomStacked` in deckLayout.js and the container
  query in vjDeck.css, one number, a test reads both). s4, s5 and s6 begin at 684 px together.
- G3: fold buttons in the Sources, Clip and Effects heads (`FoldButton.jsx`); `folded` and `locked` in the
  'di.vjDeck.layout' object (`sanitizeLayout`); `foldColumns`; CSS rail.
- G6: rest line `--di-faint`, grip `--di-ink`, hover wash `--di-cyan-wash`, drag wash `--di-cyan-dim`;
  zones S1 and S4 grown to 12 px; S2, S5, S6 were already 12 px.
- One-border reset: `resetOneSeam` (s5 and s6 no longer reset each other); Delete or Backspace on a focused
  border does the same as a double-click (the window splitter pattern uses neither).
- Lock: a "Lock layout" / "Unlock layout" button in the monitor tools, `aria-pressed`, stored in the layout
  object. Reset layout works while locked and keeps the lock.
- G8: while the K2 panel is open the borders are above it (`data-k2='open'`).
- G10: one plain note in the monitor column when s1 and s2 are hidden.
- Wiki text of the VJ deck; one entry at the end of known-fixes.md.

## Audit findings, checked in the code of this worktree
- G2 confirmed: `seamsShown` s56 needs width >= 3 x 220 + 2 x 12 = 684 (deckLayout.js, before the change line
  ~146) while the stacking query was `max-width: 560px`; 561 to 683 px had three side by side panels and no
  s5/s6. Fix chosen: stack wider (the audit's first fix). Why: the other fix (borders down to 560 px) means
  panels of 178 px, under the 220 px minimum (LIMITS.panelMin) the effects rows need; the stack is one
  query and one constant.
- G3 confirmed: nothing in deckLayout.js or VjDeckView.jsx folded a bottom panel.
- G6 partly confirmed: S4 zone was `--vj-gap` = 7 px (audit says 8: not confirmed, 7 by --di-space-2); S1 was
  7 + 3 = 10 px; S2, S5, S6 12 px. Rest line was `rgba(255, 255, 255, 0.14)` (confirmed).
- G8 confirmed from the CSS: `.k2-panel` z-index 20 (k2LayoutPanel.css), seams z-index 3 (vjDeck.css).
  It is position: absolute at right/bottom inside the deck: it lies over Effects and, at a narrow deck, s6/s4.
- G10 confirmed: no message when borders hide (VjDeckView.jsx had none).
- Audit width numbers were computed; the 683/684 limit is the same arithmetic and is walked by a test for
  every width 1 to 2400. Not measured in a browser.

## Brand lines followed (di-brand SYSTEM.md, base.css tokens)
- "Square corners": no radius added; every control is a rectangle (`--di-radius` 0).
- "The 1px line carries structure": the border line stays 1 px; the zone is invisible except on hover.
- "One accent, and it only marks meaning": cyan only for hover, focus and drag (`--di-cyan`,
  `--di-cyan-wash`, `--di-cyan-dim`); the rest line is a neutral (`--di-faint`).
- "No shadow, no glow": the fold focus ring is the sanctioned `inset 0 0 0 1px` cyan ring; nothing else.
- Colours only through existing variables: `--di-faint`, `--di-ink`, `--di-cyan*`, `--di-space-*`.

## Decisions to read
- While one panel is folded, the two open ones share the rest equally and have no border between them (the
  brief: "the others share its width" and "no border next to a folded panel"; the stored column widths are
  thirds-based and have no meaning with a rail). Unfolding brings the borders back.
- Fold at a stacked width (683 px or less) shrinks a panel to its title row.
- Delete / Backspace on a focused border resets it: free there (Enter, Home, End and arrows are the
  splitter's; the deck's own key listener only handles Escape and Enter).
- The K2 panel's 12 px strips under a border are covered by the border while K2 is open: border and K2 panel
  overlap only where they cross at narrow widths.

## Tested
See the report's test list. Files: deckPanes.test.js, VjDeckView.panes.test.jsx, deckLayout.test.js,
vjDeck.css.test.js (changed, below), the other vjDeck tests, src/wiki.
Changed existing tests (the behaviour changed): deckLayout.test.js "which seams exist" (the 561 to 683 px
rows: s4 and s56 now hidden below 684); vjDeck.css.test.js "F7" (S1 and S4 zones now 12 px).

## Not tested
- Nothing was looked at in a browser: the rail look (vertical name), the wash on hover, the 12 px zones with a
  real mouse, the K2 overlap, and the S1 padding change (5 px less room in the layer strip) are unchecked.
- A touch screen, the Perform window placement, a stored layout from a phone.
