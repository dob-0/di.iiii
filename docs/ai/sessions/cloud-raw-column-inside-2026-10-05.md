## 2026-10-05 — Nodes: one right region (row 3) and inside a node opens its substance (row 4)

Cloud routine (no owner live). Spec: `docs/ai/audits/raw-ui-2026-10-05/audit.md` §3.5, §3.6, §3.10, build plan rows 3 and 4 (branch `docs/raw-ui-audit-2026-10-05`).

**Branch.** `cloud/raw-column-inside-2026-10-05`, cut from `fix/raw-one-open-2026-10-05` (#773, on #771), then `--no-ff` merge of `feat/raw-settings-column-2026-10-05` (#769). One conflict, `RawGraphSurface.jsx`: imports (both kept) and the card's Enter. Resolved: Enter and double-click keep #773's single meaning (Open); #769's in-card typing stays, reached by a click on the text of an already-selected card (`pressedSelectedRef`). The `mainField` tests follow that.

**Row 3 — one right region (§3.5).**
- `RawEditor.jsx`: `regionPanel` state; the region holds one occupant — settings (when something is selected), outliner, chat or help. Opening one replaces the other; a card picked on the canvas takes it back for settings; Escape in the column closes the occupant. Outliner and chat are no longer floating windows; Help renders inline (`RawHelpDialog inline`).
- The column: name, settings (main field still typed in the card), **Ports** with live values and wired from/to (`NodePorts.jsx`, from `readNode`), Open (a container's reads "Open: N nodes inside"), and **Delete pinned in the footer**. The Delete FAB and its CSS are gone. The column is never empty.
- List and Text windows are retired on desktop (`WINDOWLESS_ON_DESKTOP`); a phone keeps them.
- `PropertyInspector.jsx`: `children` (ports) after the settings, Open after them, `footer`.

**Row 4 — inside a node (§3.6).** `utils/insideView.js` decides the kind; `NodeInsideView.jsx` draws it: List = its table (`ListPanelWindow`) with In/Out rails, Text = its editor, code = inputs · its settings + the platform's lines labelled `platform code · read-only` (fetched at once, no "Show the lines") · outputs, spatial = sub-graph above and code below, tool = its own body filling the canvas, picture = `TopInsidePanel`, container = sub-graph. The round "inside" pill, its "?" button, the empty-state "explain" button and the "code, no room of its own" sentence are gone; a rectangular strip `← Back · › name · kind · counts` replaces the pill.

**Rectangles.** Every new rule is radius 0; a test reads `raw.css` and fails on any radius > 2 px or `--di-radius-pill` in the region/inside/ports rules, and on any `.raw-scope-marker` / `.raw-delete-fab` rule. Also fixed three style-spine failures #769 had brought in (a `--raw-column-w` fallback, an 18 px font-size, a 4 px padding).

**Tests.** New: `RawRegionAndInside.test.jsx` (13) and `utils/insideView.test.js` (3). On the base (the merge commit, before this work): 13 fail, and the util file fails to load (3); after: 16 pass. Updated to the new behaviour: outliner is a `complementary` region, not a dialog; window-arrangement and window-pile tests use tool panels (List/Text have no desktop window); the anatomy tests reach the sheet through the card's reading; PropertyInspector's Open order. `src/raw` + `src/styles` + copyVocabulary: 1286 pass. `npm run build` passes.

**Not seen.** No browser was run: nothing here was looked at on desktop or phone. Owed: `npm run verify:surfaces` on dev, and the owner's 1140×940 look; the "0 intersections" criterion is measured structurally (column in the flow, no FAB, no List/Text window), not by rectangles.

**Not done.**
- Tool windows (webcam, monitor, director, timeline) do not move into the region; they stay canvas windows with pin/minimise. The hand-kept z-stack (`windowLayout.js:290-298`) stays.
- The anatomy sheet (a card's middle-click reading) is still a floating window, so it can stand beside the region.
- The node name is in the inside strip, not in the bar's crumb (row 5, one bar).
- Text inside: 72-character measure is CSS only; List rows drag-to-reorder is whatever `ListPanelWindow` already does.
- B9 (shared selection) untouched.
