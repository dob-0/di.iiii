# Nodes (Raw) UI audit: MOCT club night, 2026-10-05

**Scope.** The Nodes canvas (`src/raw/`, route `/{space}/raw/projects/{project}`), project
`hayfilm-moct-2026-10-09` (5 nodes: 1 Text "The night", 4 Lists "Bar", "Studio", "Across the night", "To do").
**Code read:** `origin/dev` at `b3d7f76b`, which is also the installed di on aylmo (`di status`: 0.4.16-dev.b3d7f76b).
**Branch read (not touched):** `feat/raw-settings-column-2026-10-05` @ `15c3d0b8` (PR #769).
**Status.** This is an audit and a design spec. No code was changed and no PR was opened.

## 0. How this was measured

| What | How |
|---|---|
| Surface | `di-dev up rawaudit` (frontend against the installed di, same commit as dev), then `di-dev down rawaudit`. dev.diiii.xyz asks for a sign-in, so it was only probed for the bottom-right button. |
| Browser | Playwright 1.62.1, headless Chromium, under `flock ~/.local/state/di/locks/browser.lock`. The CPU temperature was ≤ 80 °C before every run (it read 82–100 °C between runs and the script waited). |
| No writes | Every non-GET `/api/` request was held (never sent), and the presence socket was refused. Held: 2× `POST /api/track` per run. No op reached the database. |
| Viewports | 1440×900 @1, 1920×1080 @1, 390×844 @3 (mobile, touch), and the owner's window, estimated as **1140×940 @1.5** from his screenshots (his 54 px surface bar ÷ the measured 38 CSS px gives 1.42, and his 72 px top bar ÷ 49 gives 1.47). |
| Numbers | `getBoundingClientRect` and `getComputedStyle` on every visible element, plus a census of every distinct font-size, padding, gap and radius > 2 px, and every control's hit box. Raw data and the scripts that took it are in `method/` (`measure/*.json`, `capture.cjs`, `drag2.cjs`, `twopanel.cjs`, `make_sketch.py`). They re-run against any `di-dev up` tree. |
| Drags | Real pointer events (down on the card title, 16 move steps, up) at 74 / 100 / 113 / 150 %. The zoom was set with wheel events anchored on the dragged card. |
| Methods | Nielsen's 10 usability heuristics (tags H1–H10). Fitts's law (Shannon form, ID = log2(D/W + 1), in bits). Gestalt proximity, alignment and common region. WCAG 2.2 SC 2.5.8 Target Size (Minimum, 24×24 CSS px). Tufte's data-ink ratio (for repeated labels). The owner's rules: rectangles only (0–2 px radius), core visible with chrome small, one dictionary (`docs/ai/vocabulary.md`). |
| Limits | Owner-surface numbers are estimates from his PNGs (DPR ≈ 1.45). The phone "inside a node" state was not captured, because the › door is tucked below 44 % zoom (`RawGraphSurface.jsx:1790`). The ops wire path was read in code but not observed on the network. |

Screenshots: `shots/` (mine) and `owner-screenshots/` (his, dev.diiii.xyz). The sketch is in `sketch.html`.

---

## 1. BUGS: behaviour (fix first)

| # | Bug | Evidence (measured) | Root cause (file:line) | Fix | Test |
|---|---|---|---|---|---|
| B1 | **A card cannot be dragged left, or up, past an invisible line.** It stops dead, and cards pile up at that line and overlap. | 1440×900, Studio dragged −700 px. At 74 % it stopped at x = 132, at 100 % x = 158, at 113 % x = 171, at 150 % x = 208. The predicted stop is `24 + 100·zoom + 34`: 132 / 158 / 171 / 208, **exact at all four**. Dragged up −500 px, it stopped at y = 152 / 163 / 169 / 185, predicted `95 + 24 + 44·zoom`, also exact. In the owner's 022206.png "The night" sits at CSS x ≈ 175 at 113 % (predicted 171), and Studio overlaps it. | `RawGraphSurface.jsx:1249-1265`. The drag clamp is a copy of the *placement* clamp (`:1351-1371`), where the point is the card's **centre**. During a drag, `nextX/nextY` is the card's **top-left** (`style.left = node.graphX`, `:1731`). So the left band is short by half a card (100 units) plus the door (34/zoom) plus 24 px, and the top band by 44 units. On the right the card can leave by half its width (at 74 % its left edge reaches 1342, so 106 px of it is off-screen). The clamp is also measured against the **visible** viewport, so a card can never be moved to a spot off-screen, and nothing auto-pans. | Clamp only so that the card's **title stays grabbable** (≥ 24 px of the header on screen). Measure the clamp in top-left terms. Add edge auto-pan while dragging (as Figma, Blender's node editor and TouchDesigner do). Keep the placement clamp as it is. | Unit test: a pure `dragClamp(cardTopLeft, viewport)` lets a card reach `x = 24` at any zoom. E2E test: drag the leftmost card −700 px at 74/100/113/150 % and expect its left edge at 24 ± 1. |
| B2 | **One gesture, two results.** The › door and a double-click open the List's window the first time and go "inside" (into an empty canvas) the second time. | 1440 shots `04-dblclick-first.png` (window opens, and settings open as well) and `05-inside.png` (an empty canvas). The owner's 021139 (window) and 021323 (inside). | `RawEditor.jsx:740-768` `handleEnterNode`: if `panel-2d && frame.visible === false`, open the window, else `scopeEnterNode`. The result depends on hidden state (H4, H1). | One meaning for all three. Double-click, Enter and "Open" all **open the node's inside** (§3.6). Remove the door (§3.4). | Test: double-click twice in a row and expect the same view both times. |
| B3 | **"Inside" a List or Text is a dead end:** an empty canvas, "Inside Across the night — code, no room of its own." and a round button you must press to reach the real thing. | `05-inside.png`: the canvas is 1440×805 with **0** content. The sentence is 12.16 px. The button is 166×44 with a 999 px radius. | `RawEditor.jsx:1186-1192` (the sentence), `:3045-3090` (the pill marker and the "?" button), `NodeAnatomyPanel.jsx:121-150` (the code sits behind "Show the lines"). `isNodeMadeOfCode` (`nodeRegistry.js:3028`) treats every non-container the same way. "room" breaks the vocabulary (scene = the 3D place). | The inside view per kind (§3.6). The substance opens at once: rows as a table, text as text, code as code with its ports named, a sub-graph for containers. | Test per kind: entering shows a non-empty editor and never `.raw-empty-state`. |
| B4 | **Two panels open at once, stacked on each other.** | The owner's 023048: the settings for "The night" are drawn over its window, the window body runs at about 28 px on his screen, and Delete and the D button sit on top of both. Reproduced at 1140×940 (`owner1140-08-two-panels.png`): settings `x794 y95 322×390 z1350` over window `x748 y107 382×760 z7`, which is **97 % of the settings’ area overlapped (322×378 of 322×390)**. Delete sits at `x1045 y875 z1300`. | Five independent fixed layers, each placed by its own arithmetic: the settings `position:fixed; right:24px` (`raw.css` `.raw-selection-scaffold`, z 1350), the docked List/Text window (`windowLayout.js:510-525`, `x = vw − width − 8`, z 7), the Delete FAB (`raw.css:1172`, z 1300), the account button (`AccountButton.jsx:113-123`, z 9999) and the mode mark (z 10001). Selecting does not close the window, and opening the window does not clear the selection. `windowLayout.js:290-298` lists the z-stack by hand ("MEASURED … ran 15px under it"), which shows the layers were patched one against another instead of laid out. | **One right region, one occupant** (§3.5). The settings, a tool window and Help share it, and opening one replaces the other. It is a layout column in the flow, so it needs no z-index and nothing floats over content. | Test: across select, ›, double-click, Help and Escape, at most one of `[settings, docked window, help]` is mounted, and no fixed element's rectangle intersects the column or a card. |
| B5 | **Delete is drawn over content, and on #769 it disappears.** | dev: the FAB at `1345,835 71×41` over the window body (owner 023048). #769 (code read, which matches the coordinator’s look): the column (z 1350, full height, right) covers the FAB (z 1300, right 24 / bottom 24), which is why Delete is "no longer visible" there. | `raw.css:1172-1186`, and #769 `raw.css` `.raw-selection-scaffold` z 1350. | Delete goes in the **column footer** (desktop) and the sheet footer (phone). Remove the FAB at ≥ 700 px. The Delete/Backspace key stays. | Test: with a node selected, `Delete` is visible and inside the column, and `.raw-delete-fab` is absent at ≥ 700 px. |
| B6 | **The "D" button floats over the canvas and the panels.** It is the account avatar (initial "D"), round-cornered. | Owner's shots: about 32 CSS px, bottom-right, over the window (021139) and over the code (023048). Code: `bottom: var(--di-account-btn-bottom)=86px; right:14px; z 9999; borderRadius:'6px'`. It is not shown on the local install (no sign-in). | `AccountButton.jsx:113-123,154-166`, mounted for Nodes by `RootApp.jsx:155` (`showAccountButton` is true). | Pass `showAccountButton={false}` for Nodes. The account becomes the last 28×28 square cell of the one bar (§3.3). | Test: no `.account-btn-wrapper` on `/raw/projects/*`, and the bar has an account cell. |
| B7 | **The opening view is not deterministic, and is sometimes cropped.** | Same URL and viewport (1440×900), four loads: 141 %, 115 %, 105 %, 105 %. At 141 % "The night" sat under the top bar and Bar ran off the bottom (`probe-1440.png`). At 1140 with a panel open, "showing 3 of 5 — fit all". | Hypothesis, not proven: the fit runs before the web font and text-wrap measurement settle (`cardGeometry.js:66` uses canvas text metrics with `Inter`). The data also changed between loads (hayfilm follows dev), which accounts for some of the spread. | Fit after `document.fonts.ready` and after the first layout. Align to the top-left (§3.7). Write a test before any fix. | Test: load 5× at 1440×900 and expect the same zoom ± 1 % and no card above the bar. |
| B8 | One drag jumped. At 74 %, after a drag that ended clamped, the next +200 px drag moved the card +525 px. | `method/measure/drag2.json`, row 74 %. Seen once and not reproduced at the other zooms. | Unknown. Candidates: the pointer released off-window (x < 0) while `draggingNodeId` was still set (`RawGraphSurface.jsx:1269-1272` listens for `pointerup` on window), or the door halo at a zoom ≥ 0.44 border. | Repro owed. With B1 fixed the pointer no longer leaves the band while dragging. | E2E test: drag to x < 0, release, then drag +200 and expect +200. |
| B9 | **Selecting is a document write.** | Code: every click sends `setWorkspaceState {selectedNodeId}` (`RawEditor.jsx:700-711`, `:732-738`). It was not observed on the wire in this run (the socket was refused). | Selection lives in the shared `workspaceState`. | Decide: is selection per person (local state plus presence) or shared? Shared selection means one person's click changes what the other sees selected. It is listed so it is decided, not fixed blind. | n/a |

Other interactions measured and found correct: **pan** (drag on empty canvas −150, −50 → −150, −50 at all zooms) and **wheel zoom anchor** (drift ≤ 4 px over 0.78→1.5, which is rounding of the displayed %).

---

## 2. DESIGN findings

### 2.1 What the screen spends its area on (1440×900, measured)

| Region | Size | Share | Note |
|---|---|---|---|
| Surface bar (global nav) | 1440×38 | 4.2 % | "di.iiii · Hayfilm · MOCT club night · 9 Oct", and SPACES … PERFORM |
| Nodes top bar | 1440×49 (+8 gap) | 6.3 % | "← Projects · MOCT club night · 9 Oct", Scene, Help, 5 nodes, Chat, ⋯. **The project name appears twice** (both bars). |
| Canvas | 1440×805 | 89.4 % | It starts at y = 95. |
| Zoom block | 229×60 (280×60 with ◎) | 1.1–1.3 % | Four 44×44 buttons and a 10 px value, for an action the wheel and pinch already do. |
| Settings (List) | 322×121 floating | n/a | It covers the canvas and is not subtracted from it. Its content: "Nothing to set here. Double-click the card to open it." (10 px). |
| List window (›) | 434×720 floating | 24 % of the viewport | It covers the canvas and the fit re-runs (115 % → 98 %). It shows the same rows as the card. |
| Phone 390×844 | bars 102 px = 12 % | n/a | The fit opens at **38 %**, so card body text renders at 3.8 px and the first card starts 240 px below the bar. |

Owner's window (1140×940 est.): the bars take 95 px (10.1 %), and **199 CSS px of empty canvas** sit above "The night" (020935.png, 93 %). The fit centres the content vertically and does not top-align it.

### 2.2 Type, spacing and radius actually used (census of every visible text node, all states)

- **Font sizes: 9 distinct.** 10 · 12.16 · 13.33 (the browser's default button size: the zoom buttons are unstyled) · 14.4 · 16 · 17 · 20 · 23 · 30 px. The tokens are `--di-text-1…7` = 8/10/12.16/14.4/17/20/23 (`styles/base.css:182-188`). The same List row renders at **10 px × zoom** on the card (8 px at 80 %), **17 px** in the List window (`raw.css:5597` `.raw-list-text`) and **20 px** in the Text window (`raw.css:2018,2043` `--di-text-6`). That is a ratio of up to 2.5× for one piece of data.
- **Paddings: 7 distinct.** 1 · 3 · 6 · 7 · 12 · 16 · 22 px. **Gaps: 5 distinct.** 3 · 7 · 12 · 16 · 22 px. The token scale is 3/7/12/16/22/30/40/48 (`base.css:142-149`), which sits on no grid.
- **Control heights:** 13 (5 nodes, Chat) · 18 (the column title) · 21 (List group names) · 22 (door) · 29 (back) · 31 (⋯) · 41 (Help, Delete) · 44 (zoom buttons, window buttons, list buttons) · 48 (Scene). **Nine heights in one bar-and-panel set.**
- **Radius > 2 px (owner's rule broken):** `raw.css:2305` `.raw-empty-state button` (What it's made of, 999 px), `:4779` `.raw-scope-marker` (the "inside" pill, 999 px), its children `-out` and `-what` (999 px computed), `:4811` `-root`, `:4944/4959` `.raw-promoted-notice` (+button), `:4733` `.raw-drop-veil span`, `:3650` `.raw-mic-panel-meter`, `:618` `.raw-outliner-dot` (50 %), `:1611` `.raw-cursor-marker` (50 %), `:3311` the help diagram sphere (an illustration, acceptable), and outside `src/raw`: `AccountButton.jsx:136,160` (6 px) plus its MUI popover (`borderRadius: 1.5`). `--di-radius-pill: 999px` (`base.css:80`) exists as a token, so the bug will keep coming back until it goes.
- **Targets < 24×24 (WCAG 2.5.8 AA):** "5 nodes" 51×13, "Chat" 32×13, the phone count "5" 12×13, the surface-bar links ×10 (13 px tall), List group-name inputs 324×21, the column title button 116×18, and the inside crumbs 29×18 and 128×20. The › door is 13×22 visible. Its hit box with the halo is 35×44 (`raw.css:2816`), which passes on hover devices at a zoom ≥ 44 % and is tucked (hidden) below that.

### 2.3 Findings table

| # | Problem | Evidence | Heuristic / method | Fix (spec §) |
|---|---|---|---|---|
| D1 | **Help is the heaviest object in the bar** while the core counts are the lightest. | Help is 52×41, bordered and filled (`raw.css:2470-2483`). "5 nodes" and "Chat" are 10 px, 13 px tall, with no box (`raw.css:1041-1053`). | Fitts: Chat at D ≈ 750, W = 13 gives ID = 5.9 bits; Help at D ≈ 660, W = 41 gives 4.1 bits. The rare action is the easy one. H8. Gestalt similarity is broken (one bar, three visual languages). | §3.3 |
| D2 | **Two bars, and the project named twice.** | 38 + 49 + 8 = 95 px (10.6 % of 900). "MOCT club night · 9 Oct" at y 18 and y 62. | H8. Tufte data-ink (a duplicated label). | §3.3 |
| D3 | **The › door between cards duplicates the card and is misplaced.** | 13×22 in the ~20 px gutter between cards (115 %). By Gestalt proximity it belongs to the card on its LEFT, not the one it opens. It opens a 434×720 window that repeats every row the card already shows, at 17 px instead of 10 px × zoom. | Gestalt proximity, H4, H8, information duplication. | §3.4 |
| D4 | **The window header uses cryptic glyphs:** "Enter ›", ⌖, □, –, ×, and the word "pinned". | 5 buttons at 44×44 plus a 10 px status word. Enter goes to the dead end (B3). ⌖ pin and – minimise have no visible meaning. | H6 (recognition over recall), H2, H8. | §3.5: windows for List/Text are removed. Tool windows get title, ⤢ and ×. |
| D5 | **The same data appears 2–3 times on one screen.** | The List rows on the card and in the window. The Text content on the card, in the window and in the settings "Content" field (owner 023048). The scope name in the breadcrumb, the pill and the sentence (3×). The family word "make" on all 5 cards and in the window kicker. The □ icon on all 5 cards. | Information duplication, Tufte data-ink, H8. | §3.4–3.6. The family is shown as the card's edge colour only. The type word appears once, in the column. |
| D6 | **The type scale is incoherent** (9 sizes, odd fractions, 2.5× between copies of the same row). | §2.2 | Typographic scale practice (Bringhurst's modular scale; Material 3 and Carbon type tokens use 4–6 roles). | §3.2 |
| D7 | **There is no spacing grid.** | §2.2 (3/7/22 are off any grid). | 4/8-pt grid (IBM Carbon spacing, Material 3 layout). | §3.1 |
| D8 | **The opening view wastes the top** (199 px empty above the first card in the owner's view) and shrinks text to illegible sizes. | Fit = centre. Phone opens at 38 % (3.8 px body). 74 % gives 7.4 px body. | Gestalt alignment, F-pattern reading (NN/g eye-tracking). H1. | §3.7 |
| D9 | **The zoom block is oversized** for a rare action. | 229×60 with 44 px cells and a 10 px value. The wheel and pinch already zoom (anchor drift ≤ 4 px). | Fitts plus frequency: rare actions do not earn large targets. H8. | §3.8 |
| D10 | **Round shapes:** the "inside" pill and "What it's made of". | 999 px radius (§2.2). | Owner's rule (0–2 px). | §3.6 and the token removal |
| D11 | **Words:** "code, no room of its own", "Enter", "make" as a tag. | "room" is not a Nodes word (vocabulary: scene = the 3D place). The settings say "Nothing to set here. Double-click the card to open it.", but double-click does two things. | `docs/ai/vocabulary.md` §core, H2. | §3.6 |
| D12 | **Help says false things.** | "The canvas starts empty." (`rawGuide.js:36`) shown over a 5-node project, plus two rows of tabs (2 + 5) in a modal 882×618 (`RawHelpDialog.jsx:64-87`). | H10, H8. | §3.9 |
| D13 | **The selected List's settings are empty, and #769's selected Text is empty too.** | dev: "Nothing to set here…" (10 px). #769 (coordinator's look): only "The night · Text" and 320 px of black, because Content moved into the card. | H1, H8. Never show an empty panel. | §3.5 |

---

## 3. SPEC

Every number below comes from a measurement above or a cited rule. Words follow the vocabulary: canvas, node, card, port, wire, project, space, scene.

### 3.1 One spacing scale: **4 · 8 · 12 · 16 · 24 · 32** px
It is a 4-pt grid (IBM Carbon spacing tokens 01–07 = 2/4/8/12/16/24/32, Material 3 4-dp grid). Today's tokens map as 3→4, 7→8, 12→12, 16→16, 22→24, 30→32, and 40/48 are kept for page layout only. Inside Nodes chrome only these six values are used.

### 3.2 One type scale: **3 sizes**, all Inter, with the mono face for values and ports

| Role | Size / line | Used for |
|---|---|---|
| meta | **11 / 16** | port names, type word, counts, kicker, zoom value, keyboard hints |
| body | **13 / 18** | card rows, field values, buttons, menu items, table cells, code |
| title | **15 / 20** (600) | card title, column title, bar project name |

- There is no fourth, larger heading. The bar's breadcrumb names where you are, including inside a node, so a second, bigger copy of the name would be duplication (D5).
- 11 px is the floor (Apple HIG minimum 11 pt; Material 3's smallest label is 11 sp).
- One piece of data has **one size everywhere**. A List row is 13 px on the card at 100 %, in the table and in the column, never 17 or 20. This retires `raw.css:5597` 17 px and `:2018/2043` 20 px.
- The card body moves from 10 to 13 graph units (`cardGeometry.js:66` `CONTENT_FONT_SIZE`). **`CARD_WIDTH` stays 200**, because existing projects are laid out on its pitch. MOCT's cards stand 211–229 units apart (document `graphX` 120 / 349 / 560 / 780), so widening them would overlap every row. The cost is about 26 characters per line (176 px ÷ about 6.8 px per character for 13 px Inter, an estimate to measure in PR 7) and taller cards. The Text card's 6-line cap (`CARD_CONTENT_MAX_LINES`) keeps that bounded. `graphGeometry.test.jsx` pins the geometry, so update it deliberately.

### 3.3 Controls and the one bar
- **Control height 28 px** on fine pointers (WCAG 2.5.8 needs ≥ 24, and 28 leaves 4 px of tolerance; the dense pro-tool norm is Figma UI3 24–32 and Blender 20–24). **44 px** on `(pointer: coarse)` (Apple HIG 44 pt). There is no other control height.
- **One bar, 40 px, the surface bar itself** (the Nodes tools go into `SurfaceBar`'s children slot, where `DeskPerformSwitch` already lives, `RawEditor.jsx:2499-2510`). This removes the 49 + 8 px second bar and gives the canvas **+55 px (6.1 % of 900)**.
  - Left: `di.iiii · Hayfilm · MOCT club night · 9 Oct` (the existing crumb; the second copy goes). When inside, it continues with ` › Across the night` and a `← Back  Esc` cell.
  - Right, as 28 px cells in one style (1 px line, no fill, 11–13 px text): `Scene` · `5 nodes` (opens the outliner, which goes into the right region) · `Chat` · `?` (Help) · `⋯` · the account square (`D`, 28×28, radius 0).
  - Global nav (SPACES … PERFORM) stays where SurfaceBar puts it. At < 900 px it collapses into ⋯ (it already shows MORE at 390).
- **Help** is no longer a boxed button. It is the `?` cell (28×28) and the `?` key.

### 3.4 The › door goes
- It is removed (`RawGraphSurface.jsx:1782-1814`, `raw.css:2751-2833`). The door makes four gestures for one action and sits in the wrong Gestalt group.
- Opening is **double-click on the card, Enter on a focused card, or "Open" in the column**. A container's card shows its child count as plain meta text in the header's right slot (`▸ 3`, 11 px), not as a control between cards.
- Phone: a double-tap is unreliable for a finger, so the selection sheet's first row is a 44 px `Open` button. That replaces the door's role on touch (`raw.css:2827-2833`).

### 3.5 One right region: the settings column (agrees with #769, and finishes it)
**Rule: ONE panel at a time, in the layout, never over content.** The right region is a column in the page's flow (#769's `.raw-workbench.has-column`). Its occupants are, at most one at a time: **settings** of the selected node · **outliner** · **chat** · **help** · a **tool window** (webcam, monitor, director, timeline: the panel-2d kinds that are live tools). Opening one replaces the current one. The canvas gives up the width and re-fits (#769 `canvasWidthFor`). Nothing in Nodes uses `position: fixed` over the canvas except transient menus (context menu, palette). That retires the Delete FAB and the account float at ≥ 700 px, and the hand-kept z-stack (`windowLayout.js:290-298`).

- **Width:** 320 px default (16 + 288 + 16). 288 holds a 13 px field of about 40 characters. Resizable 260–560, never more than 45 % of the window (#769 `settingsColumn.js`, kept). At 1440 the canvas keeps 1120 px (78 %). At the owner's 1140 it keeps 820 px.
- **Shown when** a node is selected and the view is the canvas. It is never empty, because every node has a name, ports and Delete.
- **Content, top to bottom:**
  1. Header, 48 px: name (15/600, edits in place, `F2`), type word (11, muted), `×` (28×28, Esc).
  2. **Main field.** Where the type has one (`CARD_MAIN_FIELD`, #769: a Text's Content) it is edited **in the card**, and the column shows no second copy (#769 `skipField`, kept).
  3. **Settings.** The type's other parameters (`getInspectorSections`), 13 px values, 28 px rows. They are omitted when there are none.
  4. **Ports.** Inputs and outputs: name, type, wired from/to, and the live value (the anatomy panel's "What it takes and gives", promoted here). List: `Rows → string, 6 lines`, `Count → 6`. Text: `Content ↔`.
  5. `Open` (28 px, full width, ↵). It goes to the inside view (§3.6).
  6. **Footer, pinned to the column bottom:** `Delete` (28 px, danger outline, `Del`).
- **Per kind:** Text = 1, 4, 5, 6 (Content is in the card). List = 1, 4, 5, 6. Code nodes (Math, Mix, Compare, Noise…) = 1, 3 (the operation menu and unwired input values), 4, 5, 6. Spatial (Cube…) = 1, 3 (position, rotation, scale, material), 4, 5, 6. Containers = 1, 3, 4 (doorway ports), 5 ("Open: 3 nodes inside"), 6. Tool panels = 1, 3, 4, 5 ("Open" puts the tool in the region), 6.
- **Phone (< 700 px):** a bottom sheet of at most 38 dvh (#769, kept) with the same sections. Delete sits in the sheet's footer row, not as a FAB.
- **List/Text windows no longer exist on desktop.** The inside view (§3.6) is their editor, and the card is their read view. That ends D3, D5 and B4 at the source. Tool windows keep a header of **title · ⤢ (fill the canvas) · ×**. Pin, minimise and the "pinned" word go (H8; docking makes pin moot).

### 3.6 Inside a node: the substance at once
Owner, 2026-10-05: "going inside must open the node's substance directly." The view fills the canvas. The bar crumb reads `… › <node name>` and is the only place the name appears (no second heading). One 11 px meta line under the bar says the kind and the counts. `← Back` / `Esc` returns, and the round pill marker and the empty-state button are removed (`RawEditor.jsx:3045-3090`, `:1186-1192`).

| Kind (what decides it) | Types (from `nodeRegistry.js`) | Today | Inside opens |
|---|---|---|---|
| Container (`CONTAINER_TYPE_IDS`, `nodeRegistry.js:3028`) | Scene `universe.world`, Kiosk `universe.space`, 3D Desk, Geo, Node 0, Studio, Null, Constructor | the sub-graph ✔ | **the sub-graph** (unchanged). Doorway ports are drawn as the edge rails. |
| Picture operator (`isPictureType`, `tops/vjDeck.js:340`) | TOPs, VJ deck | `TopInsidePanel` beside an empty canvas (`RawEditor.jsx:2871-2880`) | **TopInsidePanel as the whole view**: the live picture left, its source/shader/script editable right. This is the precedent the others follow. |
| Data | List `view.list` | window, or a dead end (B2/B3) | **an editable table**: each group a section (name editable), rows as 13 px single-line cells (they grow to wrap), drag to reorder, `+ row` at the end of each group, `+ group`. Outputs on a right rail: `Rows` (preview) and `Count` (live). |
| Data | Text `view.text` | window (20 px), or a dead end | **a text editor**: 13/20 body, 72-character measure (Bringhurst 45–75), with Content in/out on the rails. |
| Code: values, maths, logic, signal, vector, colour (`render: 'hidden'`) | Number, Colour, Vector, Boolean, String, Math, Mix, Clamp, Compare, Route, Lag, Noise, Random, Range, Oscillator, Logic, Extremes, Round, Ease, Counter, Hold, Delay, Timer, Trigger, Speed, Toggle, Split, Combine, Distance, Dot, Cross, Direction, Rotation, Aim, Ramp, Channels, Compose | "code, no room of its own" plus the "What it's made of" button | **the code view**: left rail = **inputs** (name, type, live value, wired-from), centre = **the runtime's real lines** (`virtual:node-anatomy` place plus `loadSourceSlice`, today behind "Show the lines", `NodeAnatomyPanel.jsx:121-150`), right rail = **outputs** (name, type, live value). The node's settings (e.g. Math's operation) are edited at the top of the centre. |
| Spatial code (`render: 'spatial-3d'`, not a container) | Cube, Sphere, Plane, Cylinder, Cone, Torus, Line, Circle, Model, Video, Audio | an empty canvas and "What you place here becomes part of it." | **a split**: the sub-graph of children (they render with it, `RawEditor.jsx:1186-1190`) above, and its code view (as above) below, with a 1 px divider. |
| Tool panels (`render: 'panel-2d'`, not List/Text) | Webcam, Mic, Status, Agent, MIDI in, DMX out, Monitor, Controller, Browser, Director, Timeline, Image, Button, Outliner, Library, Publish… | their window, else a dead end | **the tool, filling the canvas** (the same component as its window, maximised). |
| Devices and streams with no panel (`render: 'hidden'`) | OSC in/out, MIDI out, PTZ, compositor, switcher, recorder, keyboard | dead end | **the code view** (as for code nodes) plus its connection settings at the top. |

**Editing code, stated plainly.** Built-in node code is the platform's (one `runtime.js` shared by every project). It is shown read-only, labelled `platform code · read-only`, with its file and lines. "Editable code" exists today only for picture operators (script and shader) and for a node's own settings. A per-project editable code node (fork a built-in into a script node) is a **new feature, owed as a decision**. It is not designed down here, and not faked.

### 3.7 The canvas: start position and fit
- **Open with fit-to-width, top-left aligned:** a 24 px pad from the bar and the left edge. The slack goes at the bottom, never above the first card (D8). The fit runs after `document.fonts.ready` (B7).
- **The fit zoom ceiling is 100 %**, so a 5-card project is never blown up to 141 %.
- **Legibility floor by semantic zoom (level of detail), not by refusing to fit.** The existing tiers are in `RawGraphSurface.jsx:78-98`. Re-key them to **on-screen size**: *full* while the body is ≥ 11 px on screen (13 × zoom ≥ 11, so zoom ≥ 0.85) · *summary* (title, group names, row counts) for 0.5 ≤ zoom < 0.85 · *header* (title only, counter-scaled so it stays ≥ 11 px) below 0.5. A fit therefore always shows every card, and "showing 3 of 5 — fit all" goes.
- **Phone:** open at the larger of fit-to-width and the summary tier, starting at the first card top-left.
- **Drag:** see B1, with auto-pan at the edges (a 24 px edge band, speed ∝ depth).

### 3.8 Zoom strip
- One 28 px strip, bottom-left, 12 px inset: `[−] [100 %] [+] [Fit]` = 28 + 44 + 28 + 36 = **136×28** (today 229×60, which is **−72 % area**). Pressing the value resets to 100 %. `◎` (frame the selection) becomes the `F` key and goes in the column's ⋯. On a coarse pointer the cells are 44 px, and the − and + cells are dropped (pinch is the zoom), leaving `[Fit]` 44×44.
- It is styled with the same cell rule as the bar. Today's buttons are unstyled browser buttons (13.33 px, padding 1×6, `raw.css:2604-2612`).

### 3.9 Help
- `?` opens Help **in the right region**, not as a modal. It is one reference sheet with no tabs: *Make* (double-click the canvas and type), *Wire* (drag port to port), *Open* (double-click, Enter), *Back* (Esc), *Move* (drag the title), *Zoom* (wheel or pinch, Fit = `1`), *Delete* (Del). Each line is 13 px with the key in 11 px mono.
- Its first line speaks about **this** canvas ("5 nodes · nothing wired yet"), never "The canvas starts empty." (`rawGuide.js:36`) over a full project.

### 3.10 Rectangles
- Remove `--di-radius-pill` (`base.css:80`) and every use in §2.2. Dots become 6×6 squares. The outliner dot and the presence cursor marker become squares too.
- The account square is radius 0 and the MUI popover is `borderRadius: 0`. A lint check is owed: `rg "border-radius: (?!0|1px|2px|var\(--di-radius\))"` in `src/raw` and `src/components` fails CI.

---

## 4. Build plan: small PRs, in order (bugs first)

| # | PR | Contents | Done when (measured) |
|---|---|---|---|
| 1 | **fix(raw): drag clamp measures the card's top-left; edge auto-pan** | B1 (`RawGraphSurface.jsx:1244-1281`), plus B8's repro test | Drag-left reaches x = 24 ± 1 at 74/100/113/150 %. Drag-up reaches bar + 24. A card dragged past the edge auto-pans. Test counts > 0. |
| 2 | **fix(raw): one meaning for Open; the › door goes** | B2. Remove the door. Double-click, Enter and the column's Open all go to the inside view. The window header loses `Enter ›`. Phone: an Open row in the sheet. | Double-click twice gives the same view. No `.raw-graph-node-door` in the DOM. |
| 3 | **feat(raw): one right region (finishes #769)** | B4, B5, D13: column sections per kind (§3.5), Delete in the footer, FAB gone at ≥ 700 px, outliner/chat/help/tool windows share the region, List/Text windows retired on desktop, `--raw-column-w` re-fit kept | Across 8 scripted sequences at most one occupant, 0 intersections between fixed elements and the column or cards, Delete visible when selected, column never empty |
| 4 | **feat(raw): inside a node opens its substance** | B3, D10, D11: List table, Text editor, code view (inputs, lines, outputs), spatial split, tool fill. Remove the pill marker, the empty-state button and the "room" sentence. | Per-kind test: enter shows a non-empty editor, no `.raw-empty-state`, no radius > 2 |
| 5 | **feat(raw): one bar** | D1, D2, B6: Nodes tools into SurfaceBar's slot, `?` Help cell, account square in the bar (`showAccountButton={false}` for Nodes), project named once | Canvas top = 40 at 1440, all bar cells 28 px, no fixed account button |
| 6 | **style(raw): spacing 4–32, type 11/13/15, control 28/44, zoom strip** | D6, D7, D9, §3.10 radius tokens and the lint check | The census script (this audit's) reports ≤ 3 font sizes and ≤ 6 spacing values in Nodes chrome, and 0 radius > 2 |
| 7 | **fix(raw): opening view: top-left fit after fonts; semantic zoom by on-screen size** | B7, D8: card body 13 (width stays 200), tiers re-keyed, no "showing N of M" | 5 loads give the same zoom ± 1 %, the first card is 24 px under the bar, body ≥ 11 px or the summary tier |
| 8 | **docs(raw): Help as one true sheet** | D12 | No sentence contradicts the project shown. One page, no tabs. |

**8 PRs.** Each goes through a branch, tests, review and the owner's look on dev.diiii.xyz (his screen, his 1140×940 window). PR 3 builds on #769: the same branch is finished to §3.5 rather than replaced. B9 (whether selection is shared) is a decision for the owner, not a PR.

**Owed and not done here:** the phone inside-view capture. The B7 cause (a hypothesis). The B8 repro. The ops wire observation for B9. The characters-per-line estimate at 13 px, to measure in PR 7. A per-project editable code node (§3.6), which is a feature decision.
