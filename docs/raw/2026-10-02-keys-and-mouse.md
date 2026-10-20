# Nodes: the keyboard and mouse system (2026-10-02)

Owner, 2026-10-02: *"use the right click, middle click and other buttons to easily manage things … write the full
hotkey system, and the right-click functions like in the desk — you can use things from the desk too."*

**Method (rule 1).** The bindings follow TouchDesigner first, because the house reference for Nodes is
TouchDesigner (Derivative, *Network Editor* and *Application Shortcuts*, docs.derivative.ca, read 2026-10-02).
Houdini fills what TouchDesigner does not name (SideFX, *Network editor* and *Network shortcuts*, sidefx.com/docs/
houdini 21, read 2026-10-02). Blender is cited from memory only, because its manual pages did not render for the
reader, so its entries are marked *unverified*. The Desk apps give the menu builder and the selection gestures
(`~/work/di-desk/desk/public/desk.html:1370-1476`, `~/work/artnet-desk/desk/ui/app.js:898-1096, 2195-2260,
4646-4682`). What Nodes does today, with file:line for all 69 bindings, is in `2026-10-02-keys-mouse-inventory.md`.

## Rules the whole system keeps

1. **One table.** Every binding is a row in one keymap: id, keys, mouse, where it acts, what it does, words. The
   handlers, the help dialog, the hint beside each menu item and the `?` sheet are all read from that row. Today
   they are three separate sources and they already disagree (inventory §1e).
2. **One dispatcher, in this order** (the Art-Net desk's order): an open menu or dialog → a text field being typed
   in (keys go to the field) → a key the person bound on a Keyboard node → the built-in keys. Ctrl/Alt/Meta chords
   that the table doesn't name stay with the browser.
3. **One Escape ladder** (di.desk's): close the open menu → close the dialog → let go of a marked wire → clear the
   selection → leave one level. Today three listeners each take the same Escape (inventory §1f.1).
4. **A window's keys work only while that window has focus.** The Director's Space, arrows, Home and B are global
   today and fight everything else (§1f.3). Its Ctrl+Z will stop double-firing with the graph's (§1f.2).
5. **On touch, a long press is a right-click.** It uses one shared hook and one timing (550 ms), as on ports today.
6. **Every menu item shows its key**, as di.desk's menus do. Menus teach the keys.

## Mouse

| Input | Where | Does | Source |
|---|---|---|---|
| Left-drag | empty canvas | pan (unchanged) | TouchDesigner |
| **Shift+left-drag** or **right-drag** | empty canvas | box-select | TouchDesigner |
| Click / **Ctrl+click** / Shift+click | card | select / add or remove from selection / add | TouchDesigner, Art-Net desk |
| Drag | selected card(s) | move all selected, one undo step | Art-Net desk |
| **Alt+drag** | card | duplicate and drag the copy | Houdini |
| Double-click | card / empty canvas | enter / add a node here (unchanged) | TouchDesigner |
| **Right-click** (no drag) | empty canvas | **canvas menu** | TouchDesigner, di.desk |
| **Right-click** | card | **node menu** | TouchDesigner, di.desk |
| **Right-click** | wire | **wire menu** | TouchDesigner, Houdini |
| Right-click | port | port menu (exists; gains Disconnect) | — |
| Right-click | window title | **window menu** | di.desk |
| Middle-drag | anywhere on the canvas | pan (unchanged) | all four |
| **Middle-click** | card | **what it reads and gives** (the node reading sheet) | TouchDesigner (middle-click = info) |
| Wheel / Ctrl+wheel / pinch | canvas | zoom at the cursor (unchanged) | all |
| **Mouse Back / Forward** (buttons 4 and 5) | canvas | leave one level / go back into the last one left | browser convention |

## Menus (one builder, built per target, each item with its key)

- **Canvas:** Add a node ▸ (by family, with search, at the click point) · Paste `Ctrl+V` · Select all `Ctrl+A` ·
  Fit all `H` · Frame selection `F` · Zoom 100% `1` · Keys `?`
- **Node:** Enter `I` / `Enter` · Open its window · Rename `N` / `F2` · Duplicate `Ctrl+D` · Copy `Ctrl+C` · Cut
  `Ctrl+X` · Make live ● (Scene, Camera …) · Bypass `B` *(phase 3)* · Wrap in a Geo `Ctrl+G` *(phase 3)* · Align ▸
  *(2+ selected)* · Delete `Del`
- **Wire:** Remove wire `Del` · Insert a node ▸ *(phase 3)* · Show where it comes from / goes to
- **Port:** Expose on the container · Disconnect all
- **Window:** Pin / unpin · Minimise · Maximise `M` · Dock right · Close

## Keyboard

| Keys | Does | Source |
|---|---|---|
| `Tab`, `Ctrl+K`, `/` | add a node (palette at the cursor) | TouchDesigner (Tab) |
| `I` or `Enter` | enter the selected node | TouchDesigner, Houdini |
| `U` | leave one level | TouchDesigner, Houdini |
| `Esc` | the ladder above | di.desk |
| `H` | fit all | TouchDesigner, Houdini |
| `F` | frame the selection | TouchDesigner (Shift+F), Houdini (G) — `F` is the more common |
| `1` | zoom 100% | di.desk |
| `N`, `F2` | rename the selected node, on its card | TouchDesigner (N), Blender (F2, unverified) |
| `Ctrl+A` | select all | TouchDesigner |
| `Ctrl+C` / `Ctrl+X` / `Ctrl+V` | copy / cut / paste the selection with the wires between them | TouchDesigner |
| `Ctrl+D` | duplicate (unchanged) | — |
| `Del`, `Backspace` | delete (asks when more than one is selected) | TouchDesigner, Art-Net desk |
| Arrows / Shift+arrows | nudge the selected cards 1 / 10 grid steps; with nothing selected, pan | di.desk |
| `Ctrl+F` | find a node by name: select it and frame it | TouchDesigner |
| `Ctrl+Z`, `Ctrl+Shift+Z`, `Ctrl+Y` | undo / redo (unchanged) | all |
| `Shift+A` / `Alt+A` | align / distribute the selection | Houdini |
| `B` | bypass the selected node *(phase 3)* | TouchDesigner, Houdini |
| `Y`+drag | cut the wires crossed *(phase 3)* | Houdini |
| `Ctrl+G` | wrap the selection in a Geo *(phase 3)* | Blender (unverified), Houdini (collapse) |
| `?` | the keys sheet, made from the table | di.desk |
| `` Ctrl+` `` | next window (unchanged) | — |

A single letter never fires while a text field has focus, and never when a Keyboard node has bound that key
(the person's own binding wins, as on the Art-Net desk).

## Phases

1. **Foundation and menus.** The table, the dispatcher, the Escape ladder, focus-scoped Director keys, the menu
   builder, the five right-click menus, middle-click info, mouse Back/Forward, Tab, I, U, H, F, 1, N/F2, Ctrl+F, `?`,
   and the help dialog generated from the table. No new data model.
2. **Many at once.** Multi-selection: Ctrl/Shift-click, Shift-drag and right-drag box, Ctrl+A, moving several in one
   undo step, delete with a count, arrow nudge, Ctrl+C/X/V with internal wires, Alt-drag copy, Shift+A / Alt+A
   (the Art-Net desk's `arrangePositions`).
3. **New abilities.** Bypass (the runtime passes a node's first input through), Y-cut, wrap in a Geo, insert a node
   on a wire, and "Bind key…" for a person's own hotkeys (the Art-Net desk's capture flow).

**Proof per phase:** a unit test per binding, read from the table, so a binding with no test fails the build; the help
dialog and the table compared by a test; a look on the RTX 3080 at 2560×1340 and 390×844; and the inventory
re-run, showing 0 conflicts.
