## 2026-10-04 — land the Nodes stack (#740 #730 #731 #736 #742 #729 #727) in one batch

Owner, 2026-10-04: "lets work on di.iiii and moxir" after the order was named (Raw screen fixes build on Nodes).
`land/nodes-2026-10-04` is cut from dev 08882a60. It takes `--no-ff` merges in stack order:
#740 → #730 → #731 → #736 → #742 → #729 → #727. Each PR's own session note stays in place for the fold on dev.

**Conflicts resolved (both sides kept):**
- #731 vs dev's #738. Both fixed "a selection with no fields".
  - The sheet header now shows when there are sections, `showHeaderWhenEmpty` (dev), or `onRename` (#731).
  - The Raw selection sheet shows its caller's message once. Other callers show #731's "› on its card opens it" note.
  - Wiki: dev's fit/resize/selection lines, plus #731's mark-then-Remove wire line.
- #736 vs dev's #738. The keys branch read `workspaceState.selectedNodeId`; dev made the selection local (`selectedNodeId`). The keys code now reads the local one, keeping its Escape ladder and `handleDuplicateNode`.
- #729 vs dev and #731.
  - `countCardsOnScreen()` (dev) now counts only the free band, so a card under a docked window is not "shown". This is #729's rule, applied to all three callers.
  - The palette hint keeps dev's "window" and opens in front.
  - known-fixes and the List wiki article are unions.
- #727. RawGraphSurface takes both prop sets. RawViewport uses #727's shared `buildSpatialChildMap` (it already holds the Constructor rule) plus dev's `sceneObjects`.

**One fix on the land branch.** The rhythm guard (`styles/spine.test.js`) caught two literals.
- #729's card-row `padding-bottom: 3px` → `var(--di-space-1)` (also 3px).
- #736's context-menu `gap: 1px` → named as a raw.css hairline exception, like the `-1px` already there.

**Verified on aylmo** (node_modules linked from the nodes-ui worktree: same lockfiles):
- eslint on the 76 changed JS files: 0 errors.
- vitest on `src/raw src/project/graph src/studio src/wiki src/styles src/input`: 153 files, 1862 tests passed (after the fix).
- `rawTestScope` 2/2.
- CPU 79 → 89 °C under the run (an rclone backup pull was also running).
- Not run here: the full suite and the server suites (CI runs them). Not seen on screen yet: the owner's look at Nodes on dev after landing.
