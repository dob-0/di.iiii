# Nodes editor (Raw) input inventory — keyboard, mouse, touch
Date 2026-10-02. Read-only research. Worktree `~/work/di.iiii-nodes-ports` (fix/nodes-audit-2026-10-02), paths below relative to `src/raw/`.
Method: grep + read of every handler (no running app). Everything here is READ FROM CODE, NOT SEEN RUNNING (rule 3 owed).
Note: CPU Package was 89-91 C during the session (> 85 C); only grep/sed reads were run, no heavy work.
Vocabulary per docs/ai/vocabulary.md: "node card", "scene", "object", "project"; the code calls objects "things" and windows "panels".

## 1. Nodes editor TODAY

### 1a. Keyboard
| # | Input | Where | What it does | file:line |
|---|---|---|---|---|
| K1 | Cmd/Ctrl+K | anywhere (not needed to be outside fields) | open palette (centred) | components/RawEditor.jsx:1084-1096, utils/zenMode.js:152 |
| K2 | `/` bare | anywhere except text fields | open palette | utils/zenMode.js:155, RawEditor.jsx:1084 |
| K3 | Delete / Backspace | canvas, node selected | delete node (asks a confirm via useDeleteConfirm); only nodes on this surface | components/RawGraphSurface.jsx:706-734 |
| K4 | Delete / Backspace | canvas, a wire is "armed" | delete that wire (wins over node delete) | RawGraphSurface.jsx:715-718 |
| K5 | Delete / Backspace | object (thing) selected | delete object (second, separate listener) | RawEditor.jsx:2078-2088 |
| K6 | Escape | canvas, wire armed | disarm wire | RawGraphSurface.jsx:709 |
| K7 | Escape | inside a container (navStack>1) | leave one level | RawEditor.jsx:2095-2099 |
| K8 | Escape | top level, scene fullscreen | close fullscreen | RawEditor.jsx:2104-2108 |
| K9 | Escape | help dialog open | close help | components/RawHelpDialog.jsx:36-43 |
| K10 | Escape | palette | close palette | components/NodePalette.jsx:225 |
| K11 | Ctrl+` / Ctrl+Shift+` | anywhere | cycle focus through open windows (z-order) | RawEditor.jsx:2113-2123 |
| K12 | Cmd/Ctrl+D | anywhere (not in inputs) | duplicate selected node (node only, not subtree) | RawEditor.jsx:2125-2130, 1660 |
| K13 | Cmd/Ctrl+Z | anywhere (not in inputs) | undo (op-log inverse) | RawEditor.jsx:2132,2142 |
| K14 | Cmd/Ctrl+Y or Cmd/Ctrl+Shift+Z | same | redo | RawEditor.jsx:2133 |
| K15 | Cmd/Ctrl + `+`/`=` | canvas focused (onKeyDown on the surface div) | zoom in 0.1 | RawGraphSurface.jsx:1188 |
| K16 | Cmd/Ctrl + `-` | canvas focused | zoom out 0.1 | RawGraphSurface.jsx:1193 |
| K17 | Enter | canvas surface itself focused (tabIndex 0) | open palette at centre (= keyboard double-click) | RawGraphSurface.jsx:1198-1203 |
| K18 | Enter / Space | node card focused | select the card | RawGraphSurface.jsx:1187 (handleNodeKeyDown), 1420 |
| K19 | Enter / Space | object card focused | select the object | RawGraphSurface.jsx:1653-1657 |
| K20 | Enter | 3D scene viewport focused | open palette at world origin | components/RawViewport.jsx:1370, 1414 |
| K21 | Arrow keys / Shift+arrows | window title bar focused | move window / by 1 px (Shift) | components/DesktopWindow.jsx:231-240, 299 |
| K22 | Arrow keys / Shift+arrows | window SE grip focused | resize window | DesktopWindow.jsx:241-246, 385 |
| K23 | Up / Down / Enter / Esc | palette search | move highlight, confirm, close | NodePalette.jsx:225-257 |
| K24 | Enter / Esc | inspector number field (ScrubNumberInput) | commit / cancel | components/ScrubNumberInput.jsx:244-248 |
| K25 | Arrow Up/Down (+Shift x10, +Alt/Ctrl x0.1) | focused number field | step value | ScrubNumberInput.jsx:258, 16-17 |
| K26 | Enter / Esc | inspector text field | commit / cancel | components/PropertyInspector.jsx:246-248 |
| K27 | Ctrl/Cmd+Enter | Top-Inside code panels | apply | components/topInside/TopInsidePanel.jsx:269, 318 |
| K28 | any key bound on a Keyboard node (default Space) | window-wide, not in fields | feeds the graph (device.keyboard) | components/KeyboardFeed.jsx:20-42 |
| K29 | Space / Left / Right (+Shift 1 s) / Home | window-wide while the Director panel window is mounted | transport play/seek/restart | director/DirectorPanel.jsx:355-372 |
| K30 | B | same (Director) | blade cut at playhead | DirectorPanel.jsx:508-521 |
| K31 | Cmd/Ctrl+Z / Y | same (Director window, `enabled:true`) | undo/redo the DIRECTOR sequence | director/useEditHistory.js:51-58,139; DirectorPanelWindow.jsx:107 |
| K32 | Up/Down arrows | Director split handle | resize split | director/SplitHandle.jsx:54-61 |

### 1b. Mouse
| # | Input | Where | What it does | file:line |
|---|---|---|---|---|
| M1 | Wheel | canvas / window frame | cursor-anchored zoom, 0.05-8x, proportional | RawGraphSurface.jsx:584-606 |
| M2 | Wheel inside window BODY | window body | belongs to the panel (scroll/orbit); Ctrl+wheel (pinch) still zooms graph | RawGraphSurface.jsx:589 |
| M3 | Left-drag on empty canvas | canvas | pan; a no-travel click (<8 px) clears selection | RawGraphSurface.jsx:891-927 (shouldStartPan, handleSurfacePointerDown) |
| M4 | **Middle-drag** | canvas | pan (same path as M3) | RawGraphSurface.jsx:897 |
| M5 | Left-drag on card | card | move node (rAF-gated; clamped to visible band); also selects | RawGraphSurface.jsx:1396-1418, 1010-1055 |
| M6 | Left-press on/near an output port (28 px grab, also from card body) | port / card | start a wire; snap-drop to nearest compatible input in 36 px (72 touch) | RawGraphSurface.jsx:754-778, 1396-1409, 1609-1612 |
| M7 | Release wire on nothing | canvas | notice "Wire dropped"/"X can't feed Y" | RawGraphSurface.jsx:821-831 |
| M8 | Click on card | card | select | RawGraphSurface.jsx:1395 |
| M9 | Double-click card | card | enter the node (scope) | RawGraphSurface.jsx:1421 |
| M10 | Click the door "›" | card left edge | enter node | RawGraphSurface.jsx:1456 |
| M11 | Click "●" | card header | make this the active one (Camera/Scene...) | RawGraphSurface.jsx:~1472 |
| M12 | Double-click empty canvas | canvas | open palette at that point (collision-avoiding placement) | RawGraphSurface.jsx:1110-1180, 1228 ; RawEditor.jsx:2720 |
| M13 | Click a wire (24 px hit stroke) | wire | "arm" it: red + "Remove wire" button at cursor | RawGraphSurface.jsx:1335-1339, 1244-1258 |
| M14 | Hover wire | wire | highlight red 4 px | RawGraphSurface.jsx:1333 |
| M15 | Click any non-button area | canvas | disarm wire | RawGraphSurface.jsx:1235 |
| M16 | **Right-click on a port dot** (in and out) | port | open port menu | RawGraphSurface.jsx:1577-1582, 1613-1618 |
| M17 | Right-click anywhere else | canvas / card / wire / window / 3D | NOTHING handled: browser's native menu shows | grep: only these two onContextMenu in src/raw |
| M18 | Left-drag object in 3D scene (Shift = lift) | 3D view | move object/node on floor plane; Shift lifts in height | RawViewport.jsx:1009, 1129-1160, 1189-1200, 934 |
| M19 | Double-click floor in 3D | 3D view | open palette at world point | RawViewport.jsx:1119, 1413 |
| M20 | Click floor | 3D view | clear selection (if moved <= 4 px) | RawViewport.jsx:1115 |
| M21 | Drag / wheel in 3D | 3D view | drei OrbitControls (default: left orbit, RIGHT pan, wheel zoom) unless a Camera is marked | RawViewport.jsx:1458 (`OrbitControls makeDefault`) |
| M22 | Drag title bar | window | move window | DesktopWindow.jsx:215-219, 298 |
| M23 | Drag edges / SE grip | window | resize | DesktopWindow.jsx:221-225, 375-384 |
| M24 | Pin / minimize / maximize buttons | window title | window state | DesktopWindow.jsx:330-345 |
| M25 | Drag on number field (left or MIDDLE drag) | inspector | scrub value; Shift x10, Alt/Ctrl x0.1; wheel steps only when focused | ScrubNumberInput.jsx:124, 98-115 |
| M26 | Double-click number field | inspector | edit text | ScrubNumberInput.jsx:282 |
| M27 | Click palette row / hover | palette | confirm (click; pointerdown only highlights) / highlight on mouse | NodePalette.jsx:263-330 |
| M28 | Zoom bar: -, %, +, ⤢ fit, ◎ frame selection | canvas corner | zoom 0.1 step / fit all / frame selected node | RawGraphSurface.jsx:1264-1272, 448-515 |
| M29 | List window buttons: add, group, up/down, delete | list window | row edit; NO keyboard, NO drag-reorder | components/ListPanelWindow.jsx:104-160 |
| M30 | Timeline clip drag / handles | timeline window | move/trim clip | components/TimelinePanelWindow.jsx:173-208 |
| M31 | Drag desk files onto canvas | canvas | import (drop) | RawEditor.jsx:1407 (dragover/drop) |

### 1c. Touch
| # | Input | What | file:line |
|---|---|---|---|
| T1 | Two-finger pinch | zoom + pan, cancels any wire/node drag started by finger 1 | RawGraphSurface.jsx:610-700 |
| T2 | Double-tap empty canvas | palette (own tap tracker, dblclick not trusted on touch) | RawGraphSurface.jsx:1183, 1240; utils/useDoubleTap.js |
| T3 | Double-tap floor in 3D | palette | RawViewport.jsx:906 |
| T4 | Tap empty canvas | deselect | RawGraphSurface.jsx:915-927 |
| T5 | **Long-press (550 ms) a port** | port menu (the finger's right-click); cancels at >10 px move | RawGraphSurface.jsx:844-889 |
| T6 | Door only on selected card when zoom is low | tucked door | RawGraphSurface.jsx:1431 |

### 1d. Context menus that exist
Exactly ONE: the port menu (`openPortMenu` RawGraphSurface.jsx:~866; rendered 1670-1700, class `raw-graph-port-menu`, role=menu). Opened by right-click (M16) or 550 ms long-press (T5) on an input or output dot. Items: title (port name), "Expose on the container" (calls `onPromotePort`, creates an In/Out doorway node + wire), "Cancel". It only exists when `onPromotePort` is passed. Escape does not close it (only item click / outside pointerdown elsewhere, check owed). No menu for canvas, card, wire, window, palette, 3D view. The command palette (K1) is the only "add node" menu; the topbar "⋯" menu holds the rest (RawEditor.jsx ~2490+; help command at 2194).

### 1e. Help dialog vs reality (utils/rawGuide.js:24-127 feeds components/RawHelpDialog.jsx)
Documented AND true: double-click/tap adds (25), Cmd/Ctrl+K and `/` (26), Delete/Backspace (27), Cmd/Ctrl+D (29), Cmd/Ctrl+Z / Y (30), Esc closes help (31), drag port to port (56), click wire then Delete (58), double-click card/› enters (84), Esc/‹ leaves (85), drag Scene window corner (113).
Documented but WRONG or MISLEADING:
- "Rename: Select, then click its name in the inspector" (28): the only rename path; no F2, no double-click on card (double-click ENTERS). Not a defect, but a gap.
- "Look around: Drag orbits — until a Camera is marked" (114): true for OrbitControls; right-drag pan / wheel zoom there are undocumented.
- Redo documented as Cmd/Ctrl+Y only; Cmd/Ctrl+Shift+Z also works (undocumented).
- "Leave: ... hardware Back on a phone" (85): not checked in this pass (no key handler found in src/raw; probably popstate in RawEditor, owed).
Exist but NOT in help: middle-drag pan (M4), wheel zoom (M1), pinch (T1), Cmd/Ctrl +/- (K15/K16), Ctrl+` window cycling (K11), Enter on focused canvas (K17), zoom bar fit / frame selection (M28), right-click/long-press port menu (M16/T5), Shift-lift in 3D (M18), window arrow-key move/resize (K21/K22), Shift+Ctrl modifiers on number scrub (K25/M25), Ctrl+Shift+Z.
No dead handlers found in src/raw EXCEPT: `director/usePanelToggle.js` (H key toggle) is imported by nothing in src/raw (only its test; algoVrithm hits are text matches of a different helper) = dead in Nodes.

### 1f. Conflicts and traps
1. **Escape fires several listeners at once** (all on `window`): help dialog K9 + scope-pop K7 (RawEditor.jsx:2092 only skips input/textarea) + armed-wire K6. Closing help inside a container ALSO leaves the container; disarming a wire also leaves a level.
2. **Ctrl+Z double-fires while a Director window exists**: RawEditor undo (K13) AND Director history (K31, `enabled: true`, DirectorPanelWindow.jsx:107) both on window; RawEditor.jsx:2132 does not check `defaultPrevented`.
3. **Director transport keys are global** while its window is mounted: Space, arrows, Home, B (K29/K30) are preventDefault'ed anywhere on the page, even with the node canvas focused and without Director focused. Any future Space-drag pan, `B`, or arrow nudge would collide.
4. **Delete runs in two listeners** (K3/K5): node via RawGraphSurface, object via RawEditor; selection is single so no double-delete today, but multi-select must unify them.
5. **Backspace deletes** (K3): the Art-Net desk removed Backspace on purpose ("what people press to go back", artnet-desk app.js:4665). Here Backspace is documented as delete; a confirm dialog is the only guard.
6. **KeyboardFeed (K28)** binds any single key window-wide, default Space. Any new single-letter hotkey (F, A, H, Tab) fires the game/show key too; hotkey system must skip while a keyboard node is armed or namespace them.
7. **Double-click = add node on canvas, enter on card** (M9/M12): a mouse user cannot rename by double-click (the usual convention). F2 and double-click-on-label are free to use.
8. Left-drag on empty canvas pans (M3). Box-select by left-drag would collide with this; Blender/TD/Houdini all use left-drag = box-select with pan on middle/space. Needs a decision (e.g. Shift-drag or Ctrl-drag = box, or tool-mode).
9. **Right-click is hijacked only on ports.** Elsewhere the native browser menu appears, so adding a canvas menu is free but must `preventDefault` in capture, and must not break the desk Embed (Nodes is framed in di.desk "nodes" panel; the desk's own `contextmenu` listener at di-desk desk.html:1384 is on the parent document, iframe contexts are separate).
10. Selection is single (`workspaceState.selectedNodeId`, RawEditor.jsx:2132 etc.); there is no multi-select, no clipboard, no group/frame, no bypass/mute, no align, no search-in-graph, no reroute, no wire-cut. Duplicate copies node only, not subtree (RawEditor.jsx:1655-1660).
11. Port-menu long-press and wire-start share pointerdown on output dots (armLongPress + handleOutputPointerDown, RawGraphSurface.jsx:1609): a held press that doesn't move starts a pending wire and opens the menu, which then cancels it (comment 866-875); fine but fragile.

Count: 32 keyboard + 31 mouse + 6 touch = 69 distinct bindings found; of those, 18 are the graph canvas / card / port / wire core, the rest windows, palette, inspector, 3D, director.

## 2. The Desk apps (what to reuse)

### 2a. di-desk (`~/work/di-desk/desk/public/desk.html`, engine `~/work/di-desk-engine/engine/desk-engine.js`, identical vendored copy in di-desk/desk/public/engine/)
| Input | What | file:line | For a node canvas |
|---|---|---|---|
| **Right-click empty canvas** | big sectioned menu: add here (chat, sessions, ledger, room, studio, nodes...), layout presets, hand, full screen, see it all (z), recenter, zoom 100%, arrange mode, bring back hidden | desk.html:1384-1476 | YES: same shape = "Add node here" (grouped by family) + View section (Fit all, Frame, Zoom 100%) + Layout + "bring back hidden" |
| **Right-click a panel** | name header; fit (f / dbl-click), full screen (m), highlight/unhighlight, focus-centre, size square/wide/tall, bring to front, send to back, duplicate, delete/hide, arrange mode | desk.html:1393-1427 | YES for a node card: Enter, Duplicate, Delete, Bypass(new), Frame, Rename, Highlight(mark), Bring to front/back (for windows) |
| ctx menu infra: `buildCtx(items)` items `{label}`, `{sep}`, `{text,kb,do}`, shows key hints (`kb:`), viewport-clamped, scrolls if tall, closes on mousedown outside + Esc; leaves native menu on input/textarea | desk.html:1370-1382, 1478-1479 | YES, copy as the single menu component; showing key hints in the menu is how users learn hotkeys |
| Right-click file tab (code panel) | "forget this file" | desk.html:2167 | no |
| **Middle-drag** | pan (mousedown button 1, capture), `auxclick` prevented | desk.html:646-694 | YES |
| **Space + left-drag / Hand tool (h)** | pan; Space held class; hand mode drags anywhere, click on panel puts hand down | desk.html:636-652, 2677 | YES (Space-drag = the standard) |
| Left-drag empty canvas | pan with inertia glide (0.9955/ms decay) | desk.html:646-690 | OPTIONAL; inertia is a nice touch, but conflicts with box-select |
| Wheel | plain = pan up/down, Shift = left/right, Ctrl/Cmd or pinch = zoom at cursor; wheel inside a scrollable panel scrolls the panel, only when it really can scroll | desk.html:696-735 | PARTIAL: Nodes uses wheel = zoom (matches Blender/TD/UE). Reuse the "scrollsInside" test (panel scrolls only if it can) |
| Dblclick panel header | fit panel to window | desk.html:1519 | maybe: dblclick on a window title = maximize |
| `z` / `f` / `F` / `0` / `1` / `+ -` | see all / fit selected else all / browser fullscreen / recenter / zoom 100% / zoom in-out | desk.html:2686-2692 | YES: F or Home = frame all/selected, 1 = 100% |
| Arrow keys / Shift+arrows | nudge selected panel one grid step / resize; with nothing selected pan the camera (80 px, Shift = a page) | desk.html:2668-2680 | YES: nudge selected nodes |
| Tab / Shift+Tab | cycle selection through panels | desk.html:2684 | YES (cycle nodes; careful, Tab is Houdini/Blender "add node") |
| Delete/Backspace | hide selected panel (recoverable via "bring back hidden") | desk.html:2686 | YES pattern: soft-delete with undo hint toast rather than modal |
| Esc | ladder: un-maximise > clear text selection > exit fullscreen > put hand down > deselect | desk.html:2685-2689 | YES: one Escape ladder instead of 3 independent listeners (fixes conflict 1) |
| `m`, `g`, `l`, `b`, `h`, `?` | maximise panel, grid/canvas mode, links on/off, arrange by connection, hand, show keys panel | desk.html:2686-2698 | `m` maximise window, `?` keys cheat-sheet (YES: a "keys" panel generated from the same table), `b` auto-arrange (the layout algorithm is useful for Nodes auto-layout) |
| **Snap + guides**: moving edge snaps ~12 screen px to neighbours' edges, 12 px gutter, softly to grid (112x60); guide lines drawn; **Shift = move freely** | desk.html:~789-830; engine GX/GY/GAP | YES for card drag (align to neighbours, guide lines, Shift = free) |
| Multi-select, box-select | NONE in di-desk (single `.sel`) | | |
| Layout presets / arrange by connection / minimap (click-jump, drag) | desk.html:1440-1460, 2630 | minimap YES (later), presets no |
| Layout persistence `saveLayout()`, `place/stash/restore`, camera `cam{x,y,z}` ZMIN .15 ZMAX 2 | engine | engine camera math reusable but Nodes has its own viewport (0.05-8) |

### 2b. artnet-desk (`~/work/artnet-desk/desk/ui/app.js`) — the better source for editing gestures
| Input | What | file:line | For a node canvas |
|---|---|---|---|
| **Left-drag on empty stage = marquee box-select** (centre-in-box test); Shift keeps existing selection | app.js:915-946 | YES (core) |
| Click item: if not selected, select (Shift adds); drag moves ALL selected together; one POST on release | app.js:906-913, 950-955 | YES (multi-move, one undo step) |
| **Middle button or Space + drag = pan** ("replaces the old Hand tool") | app.js:898-905, 26, 4662 | YES |
| Wheel = zoom at cursor x1.15 | app.js:968-972 | YES |
| Shift-click grid cell toggles selection; Ctrl/Cmd-click library row multi-gathers; Ctrl-click row adds to selection | app.js:436, 770, 1135 | YES: Ctrl/Shift-click = add/toggle on node cards |
| **Right-click a scene tile** -> popover menu: Bind key..., Remove key, Bind MIDI pad..., Remove MIDI pad, Rename..., Fade..., Overwrite with current look, Delete scene (danger style). Modes: menu / bind (capture-next-key) / rename / fade. Esc closes; focus first item | index.html:754-771, app.js:1874-1896, 2187-2193 | YES the MECHANISM: a **per-item "Bind key..." capture mode** = user-defined hotkeys (stored localStorage) |
| **Long-press 600 ms = finger's right-click**, excluded for mouse, cancels at >8 px move or scroll, swallows the lift-click for 700 ms | app.js:2195-2260 | YES: already similar in Nodes (550 ms); unify the hook |
| Arrange selection: row / column / grid / circle in the selection's own bounding box (pure fn `arrangePositions`, tested) | app.js:1036-1091, 4320-4323 | YES for align/distribute: row/column/grid are exactly "align + distribute" |
| Snap toggle on drag (40 x 24 grid) | app.js:957 | YES |
| Delete (ONLY Delete, NOT Backspace; Setup page only; confirm if >1) ; "with everything selected by default a stray Delete would take the whole rig" | app.js:4665-4666, 1096 | YES: Delete only + count confirm when >1 |
| Esc = clear selection / close builder | app.js:4663 | YES |
| B = panic blackout fires before every guard; digits 1-9 recall visible scene; user keys outrank 1-9 but never panic keys; Ctrl/Alt/Meta chords left to browser; `isTypingTarget` guard | app.js:4646-4682 | YES: key priority order = panic > popover capture > typing guard > user binds > built-ins. Copy this ordering rule |
| Rename: inline input, Enter commits, Esc cancels (look names) | app.js:3170, 1129 | YES (F2) |
| Pane splitter dblclick resets | app.js:4828 | no |
| Groups: "+" new group from selection, tabs | index.html:98-101 | maps to "Group/Frame selection" |
| Drag library profile onto stage = add at drop point | app.js:975-995 | YES: drag from palette onto canvas (Nodes has palette click only) |

### 2c. Desk-wide lessons (from memory notes and code comments)
- One desk codebase pattern: single global listener per concern with an Escape ladder (di-desk) or key-priority order (artnet) beats many independent window listeners.
- Menus show the key (`kb:` field) next to each item. Cheap, teaches hotkeys.
- Soft delete with a visible "how to bring back" beats modal confirm (di-desk), but artnet confirms bulk. Nodes today: modal confirm per node (K3).
- Context-menu items must be built per target (panel vs empty canvas) from ONE builder function.

## 3. Established practice (from my knowledge; sources are the official docs, NOT re-checked online this pass; mark as unvalidated until verified against the version di.iiii targets)
Sources: Derivative TouchDesigner docs "Network Editor" and "Keyboard Shortcuts" (docs.derivative.ca); Blender Manual "Node Editor" and "Keymap Reference" (docs.blender.org, 4.x default keymap); SideFX Houdini docs "Network editor" and "Network Editor hotkeys" (sidefx.com/docs/houdini); Unreal Engine docs "Blueprint Editor Cheat Sheet / Graph Editor" (dev.epicgames.com). Bindings as I recall; verify before shipping any doc copy.

| Action | TouchDesigner | Blender | Houdini | Unreal Blueprint | Desk apps (today) | Nodes (today) | Suggested for Nodes |
|---|---|---|---|---|---|---|---|
| Pan | middle-drag, Space... (left-drag on empty = box select) | middle-drag; Ctrl+wheel = horizontal | middle-drag, Space+drag | right-drag, middle-drag | middle, Space+drag | left-drag + middle-drag | keep both; add Space+drag; add right-drag only if no canvas menu on drag |
| Zoom | wheel | wheel, Ctrl+middle-drag, +/- numpad | wheel | wheel, Ctrl+right... | wheel | wheel, pinch, Ctrl+/- | keep; add `1` = 100%, numpad +/- |
| Frame all | `H` (home) | `Home` | `H` (home) | Home (frame all) / `F` is Focus on selected in newer | z / F | zoom-bar button only | `Home` and `A`-less: **Home = frame all, F = frame selected**, buttons exist |
| Frame selected | `F` | numpad `.` (View Selected) | `G` (frame selected in some builds) / `Home` is all | `F` | f | button ◎ | `F` |
| Box select | left-drag on empty | left-drag (Select Box tool); `B` | left-drag on empty | left-drag on empty | marquee (artnet) | none | **Shift+left-drag (or tool mode)** while left-drag stays pan; owner decision |
| Add node | Tab (opens OP Create dialog), right-click > Add Operator | **Shift+A**, search in menu | **Tab** | **right-click** empty (context menu with search) | right-click menu | double-click, Ctrl+K, `/` | add **right-click empty** = categorised menu with search; keep Ctrl+K and `/`; add **Tab** and **Shift+A** at cursor |
| Delete | Delete / Backspace | X / Delete | Delete / Backspace | Delete | Delete (artnet only Delete) | Delete+Backspace | Delete (keep Backspace) |
| Duplicate | Ctrl+C then Ctrl+V; Alt-drag clones | **Shift+D** | Ctrl+C/V; Alt-drag copy | Ctrl+W | context menu | Ctrl+D | keep Ctrl+D; add Alt-drag |
| Copy / Paste / Cut | Ctrl+C / V / X | Ctrl+C / V (X is delete) | Ctrl+C / V / X | Ctrl+C / V / X | none | none | Ctrl+C/X/V incl. wires between copied nodes (clipboard JSON) |
| Cut wire | click wire + Delete; or drag over wire with Alt? (verify) | **Ctrl+right-drag** (Cut Links), also X on link | **Y + drag** (cut), Shift... | Alt+click on pin breaks links; right-click pin > Break | click wire | click wire then Delete (button) | **Ctrl+right-drag line** to cut, wire right-click menu (Delete / Add reroute), keep click-arm |
| Reroute | Null/Select op (no true reroute) | **Shift+RMB drag** / right-click reroute; Frame `Ctrl+J` | dot (double-click wire, or Alt+click) | double-click wire = reroute (knot) | none | none | double-click wire = reroute dot (but conflicts with canvas dblclick - wire hit area differs) |
| Group / frame | Annotate (Alt+A) | **Ctrl+G** group; frame **Ctrl+J**; Tab enters | network box (Shift+O), subnet (Ctrl+G? Collapse = Shift+C) | Comment box **C** | none | container = enter node | **Ctrl+G** wrap selection in Geo/container; **C** or Ctrl+J = frame/comment |
| Mute / bypass | Bypass flag click, **Alt+B**? (verify) | **M** mute | Bypass flag **B** | Disable node (right-click) | hide | none | **B** bypass (flag in node), **M** mute; DO NOT use B in Director overlay |
| Enter / exit container | Enter = `I`; exit `U` | **Tab** toggle group edit / Ctrl+Tab exit | **I** dive in, **U** up | double-click collapsed graph | double-click | double-click, ›, Esc | add **Enter / I**-style: keep dblclick+Esc; add **Tab/Ctrl+Tab? no**: use `Enter` on selected card = enter, `Shift+Enter`/`U`/Esc = up |
| Rename | double-click name / F2? | **F2** | **F2** / right-click Rename | F2 | click name | inspector only | **F2** and double-click on the label (move "enter" to Enter + ›) |
| Align | Align tool (Alt+... ) | none native (add-on) | align network (Shift+L layout) | Q / W / E / A / S / D etc. align straight line (Q top, W... ) | arrange row/col/grid | none | Align/distribute menu using artnet `arrangePositions`; **Shift+L** layout-all style |
| Search / jump | Alt+F? / Ctrl+F in network | Ctrl+F find node (Select > Find Node) | Ctrl+F? / `/` | Ctrl+F | search box | Ctrl+K palette adds only | Ctrl+F find node in graph (select + frame), Ctrl+K adds |
| Undo / Redo | Ctrl+Z / Ctrl+Shift+Z | Ctrl+Z / Ctrl+Shift+Z | Ctrl+Z / Ctrl+Shift+Z | Ctrl+Z / Ctrl+Y | n/a | Ctrl+Z / Y / Shift+Z | keep |
| Select all / invert | Ctrl+A | A / Alt+A / Ctrl+I | Ctrl+A | Ctrl+A | n/a | none | Ctrl+A, Ctrl+I |
| Toggle display/view flag | Viewer flag click | n/a | D / flags | n/a | n/a | active "●" | keep |
| Context menu (right-click) | on node, on empty, on wire | on node, empty (Shift+A menu) | on node / empty (Tab menu) | on empty = add; on node; on pin | empty + panel | port only | empty / node / wire / window / port, all from one builder |

Honest gaps in this table: I recalled these from training; entries with "(verify)" are uncertain. Cells for Unreal Align keys are approximate. Treat as "unvalidated" per rule 1 until the owner's chosen anchors are checked against the live docs.

## 4. Design implications (short)
1. Build ONE input layer: a key table (id, default binding, scope, handler, help text) that drives the handlers, the help dialog "All Controls", the menu `kb:` hints and a `?` cheat-sheet. Today these are three separate truths and they already disagree (1e).
2. One window-level dispatcher with a priority ladder (artnet order: panic > modal/popover capture > typing guard > user binds > built-ins) and one Escape ladder (desk): fixes conflicts 1-3, 6.
3. Mouse map to decide with the owner: left-drag empty (pan vs box-select), right-click empty (menu), right-drag (pan vs cut-wire), middle-drag (pan, add: middle-click on node = enter or preview?), Alt-drag (clone), wheel (zoom), Shift/Ctrl modifiers (add to selection / free move / x10).
4. Prereqs the code does not have: multi-selection state, clipboard, bypass flag, group/frame, reroute node, find-in-graph. Each key in section 3 depending on these is blocked until they exist.
5. Menu component: reuse di-desk `buildCtx/openCtx` shape (items, sep, kb) in React, plus the artnet capture-key "Bind key..." mode for user hotkeys.
6. Guard rails to keep: text-field guard (isTypingInto), Ctrl/Alt/Meta chords left to the browser, touch long-press as right-click (shared hook, one constant), Delete-count confirm for >1.
7. Seen-on-real-surface check is OWED for everything above (code-read only).
