# Keyboard Shortcuts

Reference for keyboard shortcuts across the two editor lanes. Keys are ignored
while typing in an input, textarea, or other editable field.

`Ctrl` is shown for Windows/Linux; use `Cmd` on macOS.

## Studio (`/<space>/studio`) — shipped editor

Handled in [`src/studio/components/StudioEditor.jsx`](../src/studio/components/StudioEditor.jsx)
and [`src/studio/components/StudioShell.jsx`](../src/studio/components/StudioShell.jsx).

### Transform — Blender-style modal (in Edit mode, with a selection)

Press the key, then **move the mouse** — the selected object(s) follow. A readout in the
top-left shows the live value, and a colored guide line appears when you constrain an axis.

| Shortcut | Action |
|----------|--------|
| `G` | Grab / move — object follows the mouse immediately |
| `R` | Rotate — **arms** the operator but does not yet track the mouse; press `X`/`Y`/`Z` to pick an axis and start tracking |
| `S` | Scale — object follows the mouse immediately |
| `X` / `Y` / `Z` | Constrain to that axis — **press again** for local, **again** to release. For `R` specifically, pressing one of these is also what starts mouse tracking |
| `Shift` + `X`/`Y`/`Z` | Constrain to the plane perpendicular to that axis |
| type a number | Enter an exact value (e.g. `G` `X` `2` = move 2 m on X); `-` and `.` work; `Backspace` edits |
| hold `Shift` | Precision (slow) mode |
| hold `Ctrl` | Snap to increments (1 m / 5° / 0.1) |
| `G` / `R` / `S` (mid-op) | Switch transform type without leaving the operation |
| Click / `Enter` / `Space` | Confirm the transform |
| `Esc` / right-click | Cancel and restore |

With nothing selected (or not in Edit mode) `G`/`R`/`S` just set the drag-handle gizmo mode.

| Shortcut | Action |
|----------|--------|
| `T` | Toggle the drag-handle gizmo on/off (G/R/S re-show it) |

### Selection

| Shortcut | Action |
|----------|--------|
| Click | Select one object |
| `Ctrl`/`Cmd` + click | Add / remove an object from the selection |
| `A` | Select all |
| `Alt+A` | Deselect all |

### Edit selected entity

| Shortcut | Action |
|----------|--------|
| `Shift+D` or `Ctrl+D` | Duplicate selected |
| `Ctrl+C` | Copy selected |
| `Ctrl+V` | Paste |
| `Ctrl+X` | Cut (copy + delete) |
| `X` / `Delete` / `Backspace` | Delete selected |
| `F` or `.` | Frame selected (focus camera on it) |
| `Escape` | Deselect |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` or `Ctrl+Shift+Z` | Redo |

### View & layout

| Shortcut | Action |
|----------|--------|
| `E` | Toggle edit / navigate mode |
| `H` | Hide / show UI |
| `Shift+A` | Auto-tile open panels |
| `Shift+R` | Reset panel positions |

## Main app editor (`/<space>`)

Handled in [`src/hooks/useEditorShortcuts.js`](../src/hooks/useEditorShortcuts.js).

### Transform gizmo

| Shortcut | Action |
|----------|--------|
| `G` | Move (translate) gizmo |
| `R` | Rotate gizmo |
| `S` | Scale gizmo |
| `X` / `Y` / `Z` | Lock transform to axis (press again to release) |
| `Escape` / `Enter` | Release axis lock |

### Edit objects

| Shortcut | Action |
|----------|--------|
| `Ctrl+D` | Duplicate |
| `Ctrl+C` | Copy |
| `Ctrl+V` | Paste |
| `Ctrl+X` | Cut |
| `Delete` / `Backspace` | Delete |
| `Ctrl+G` | Group selection |
| `Alt+G` | Ungroup selection |
| `Ctrl+A` / `A` | Select all |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `F` | Frame selection |

### View & modes

| Shortcut | Action |
|----------|--------|
| `E` | Toggle interaction mode |
| `L` | Toggle selection lock |
| `P` | Toggle performance overlay |
| `H` | Toggle UI visibility |
| `Shift+D` then `Shift+I` | Toggle admin mode (chord) |
</content>
