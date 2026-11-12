# feat/deck-ui-4-perform — Perform windows: Arrange all button, remembered arrangement

Base: 585240f61 (the version on the deck on 2026-11-12 02:28). Branch not pushed. No browser was started; nothing was looked at on a screen (a later agent merges and looks).

## What changed
- `src/perform/PerformDesk.jsx`: button "Arrange all" in the strip after WINDOWS: same `arrangeAll`, disabled when `!arrangement?.windows.length` (as the menu item), title carries `keysOf('arrange')` (Shift+A). The arrangement is written to the store on every change (`arrangement.changed`) and restored on mount; pick / Reset layout / Save clear the store and skip one restore.
- `src/perform/arrangementStore.js` (new, the ONE place): key `di.perform.arrangement.v1:<space>:<project>`, value `{ v, presetId, widthClass, windows, rects, order, minimized, restore }` (the shape the desk holds in state, percent rects). `sanitizeArrangement` clamps every rect into the desk (min one grid unit), drops stale ids, rejects corrupt, other-version or other-width values. Every storage access is in try/catch.
- `src/perform/perform.css`: disabled look for `.perform-strip-button`.
- `src/wiki/wikiContent.js`: Perform text gets the button and the remembered arrangement. `docs/ai/known-fixes.md`: one entry at the end.
- Tests: `arrangeAll.test.js`, `arrangementStore.test.js`, `PerformArrangement.test.jsx`.

## Audit findings (docs: agent-reports-2026-11-12/deck-ui-audit/code-audit.md)
- G1 "windows overlap, covered one is cut": CONFIRMED in part. Free frames, no collision test in `DesktopWindow.jsx` drag/resize (settle/onGrid only snap to the grid, ~l.181-197); click raises (`focusWindow`). `.raw-window-body{overflow:hidden}` (`raw.css` ~1321) clips a window's body to its OWN frame only: a window brought to the front shows whole. The cut part of the lower window is hidden under the upper one, which is normal for free windows: nothing changed in raw.css. The way out is Arrange all, now visible.
- "Arrange all only in the menu (PerformDesk.jsx:249)": CONFIRMED (the line moved; the item is in `deskItems`).
- "tileRects tiles with no overlap": CONFIRMED by test; no function fix was needed (whole unit rows and columns, edges from one rounding function).
- G4 "arrangement is useState, only activePreset stored": CONFIRMED (`useState` arrangement; `layout.setActivePreset`, `layout.setPresets` in `workspaceLayoutStorage.js`/`useWorkspaceLayout.js`). The 'mine' slot is `presets` in the layout envelope; the new store is a separate key so a saved preset stays what it was.

## Brand lines followed (di-brand/SYSTEM.md, read)
- Rule "border-radius: 0 is the only value" (l.28/37): the button uses the existing `.perform-strip-button` (`var(--di-radius)`).
- One accent, colour only with meaning: no new colour; disabled uses the existing `var(--di-faint)`, as `.perform-menu-item:disabled`.
- No new tokens, no new radius, no colour by taste.

## Not tested / limits
- No browser look; drag, resize and the real reload on his deck are unchecked.
- The persisted value is per device and per project, not per screen size: a place stored on another width class is ignored (preset opens), same class is clamped.
- A restored arrangement can still contain overlaps (a person's own); Arrange all is the way back.
- Two tabs of the same project overwrite each other (last write wins).
