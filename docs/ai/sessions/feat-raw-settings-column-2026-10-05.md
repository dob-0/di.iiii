## Raw: the selected node's settings are a side column (2026-10-05)

Owner, with a screenshot of a Raw project: the settings panel "comes from the right" and covered the 4th and 5th cards. Chosen: a fixed column on the right; the canvas shrinks and re-fits beside it. Refinement: a node's one main field is edited IN its card; the column keeps everything else.

**What changed**
- `RawEditor.jsx`: `.raw-workbench` holds the canvas section and the settings column as siblings (flex row, `has-column`). Width 260-560 px (default 320, 45 % of the window at most), remembered in `localStorage` (`di.raw.settingsColumnWidth`, try/catch), drag handle or arrow keys on its left edge. Close button and Escape; focus moves into the column on select and back to the card on close. Under 700 px it stays the existing bottom sheet. Pure helpers: `src/raw/utils/settingsColumn.js`.
- The canvas re-fits through the existing `ResizeObserver` in `RawGraphSurface.jsx` (known-fixes "The Nodes canvas opened tiny"). Found in the real browser: the column touches the bottom edge and was read as a bottom sheet (bottom inset 900 px, zoom 34 %); `graphBottomInset` now counts only a full-width element.
- In-card edit: `getCardMainField` in `nodeRegistry.js` (today only Text, `content`). Enter or double-click on the card opens a box in the card; the card grows to fit, never past the next card below; Escape leaves. It writes `node.values.content`, the same value the Text window writes; the column no longer lists that field (no double state).
- `PropertyInspector.jsx`: `onClose`, `skipField`. Same fields, same order otherwise. Delete stays (the button on desktop, above the sheet on phone).

**Measured** (headless Chromium, local canvas, 6 cards): 1440x900 canvas width 1440 -> 1120 on select, no card behind the column, no horizontal overflow; back to 1440 on Escape. 390x844 DPR 3: bottom sheet, no overflow, selected card visible. Shots: `~/Downloads/raw-settings-column-2026-10-05/` (before-, after-).

**Tests**: `RawSettingsColumn.test.jsx`, `RawGraphSurface.mainField.test.jsx` (8 fail on origin/dev, the rest guard behaviour that must not change).

**Owed / limits**
- Only Text has an in-card field. Number and other nodes show no value on their card; adding one is a `CARD_MAIN_FIELD` entry plus a card body.
- Double-click on a Text card now edits instead of entering; the door (›) still enters.
- A phone cannot scroll the view to the node beyond what the existing fit does (34 % floor).
- Not touched on purpose: top bar, Help, › arrows, zoom block (a separate audit).
