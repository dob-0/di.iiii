# fix/ux-s10-space-cards (UX round 3, slice S10, 2026-10-29)

Replaces → kept as: card click → Studio ⇒ the **Edit** button on the card (a named tool). Whole-card click ⇒ now opens the space; the card's title is the link. Hover-only ✕ ⇒ the word **Delete** (same action). Trash hidden when empty ⇒ always shown. Sandbox cards unchanged (open their Studio).
Built on S05's type ladder (--di-text-3/4, 12 px floor, normal letters on card links/buttons and the contents list; greys 0.38→0.64 alpha).
Not done: axe run on the live page (not measured here), filter bar (Grid/List/Map) sizes, before/after pictures.
Tests: SpaceHub, StudioHub, StudioProjectsPanel, pages, hubTopRow, hubTouch, move1.golden — 298 passed.
Review (2026-10-29): project card no longer a button holding buttons (title is the button); Rename clear of Delete. Tests: the six above + pages — 307 passed; the 6 new/changed tests fail on origin/dev code.
Picture fix (2026-10-29): gap before "(opens in a new tab)" in the inline-flex Light link (margin, not a space); guard fails without it. Related tests 132 passed.
