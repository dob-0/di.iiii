## fix/raw-one-open-2026-10-05: one meaning for Open; the › door goes (stacked on fix/raw-drag-clamp-2026-10-05)

Source: `~/Downloads/raw-ui-audit-2026-10-05/audit.md` B2, sections 3.4 and 3.5, PR 2 of section 4.

**What was wrong.** `handleEnterNode` opened a closed List/Text window the first time and the empty inside the second.

**What changed.**
- `handleEnterNode` always goes inside. The › door (element, CSS, fit gutter, placement-clamp term) is removed. A container's card shows `▸ N` as plain meta text.
- Double-click, Enter on a focused card, `I`, the card menu (`Open`, one word for every kind) and a new `Open` row in the selection settings (`PropertyInspector` `onOpen`; 28 px, 44 px on coarse pointers, first row under the header, so it is the phone sheet's first row) all call it.
- `DesktopWindow` loses `Enter ›` (and the `onEnter` prop). Help text and the keymap say Open.
- A closed window still comes back through the palette (`hiddenPanelNodes`), which test `Escape closes the window the person just opened` now uses.

**Double-click on a Text card, with PR #769 (feat/raw-settings-column-2026-10-05).** #769 runs `startEditing` first on double-click and on Enter for a card that has a main field (today only Text), so Text edits its Content in the card. Resolution: on Text, double-click and Enter edit in place; Open (the settings row or column, the card menu, `I`) goes inside. Every other kind: double-click, Enter and Open all go inside. This is the one exception to audit 3.4 and follows 3.5 (Content edited in the card, no second copy). The two PRs touch the same lines in `RawGraphSurface.jsx` (`onDoubleClick`, `handleNodeKeyDown`): whichever lands second merges by keeping #769's `startEditing` guard before `onEnterNode`.

**Measured** (headless Chromium, `di-dev up rawpr2`, real project): `.raw-graph-node-door` count 0; double-click Bar three times (Escape between) gives the same inside view each time, 0 windows opened; Enter on a focused Studio card and the Open button (320x28 on desktop, 390x44 at 390x844 touch) go inside. Evidence: `build/pr2/`.

**Owed / limits.**
- Inside a List or Text is still the empty canvas plus "What it's made of" (B3, PR 4). Until PR 3/4, a List's rows are read on its card, and its closed window is reachable only via the palette.
- The window kind-specific `Open its window` verb is gone; the windows themselves are retired in PR 3.
- Phone: the Open row sits in the existing sheet; no double-tap added.
