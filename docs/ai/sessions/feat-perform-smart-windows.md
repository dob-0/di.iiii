# feat/perform-smart-windows (2026-11-10)

Owner: "make windows smart how its in our system i mean also add the right click and the window arrange thing and also the hotkeys and the drag things there".

## Found in the system (grep of src/raw, src/studio, 2026-11-10)

| Piece | Where it is | Used here |
|---|---|---|
| Right-click menu component | `src/raw/components/ContextMenu.jsx` (items `{id,label,kb,run,disabled,danger,items}`, portal, keyboard, submenu) | reused as is |
| Window menu on a title bar | specified in `docs/raw/2026-10-02-keys-and-mouse.md` ("Window: Pin, Minimise, Maximise M, Dock, Close"); NOT built: DesktopWindow had no context-menu hook | added prop `onTitleContextMenu` to `DesktopWindow.jsx` (one line, Nodes passes nothing) |
| Drag by title bar, resize by 8 edges/corners, arrow-key move/resize, grid snap | `src/raw/components/DesktopWindow.jsx` (`startDrag`, `startResize`, `grid` prop) | already in use by Perform: nothing built |
| Maximise / restore | `src/raw/utils/workspaceLayout.js` `maximiseFrame/restoreFrame` (Nodes); Perform's own percent version `toggleMaximize` in `PerformDesk.jsx` | Perform's existing one |
| Next window | `RawEditor.jsx:2690-2699` Ctrl+` and `cycleFocus` (`workspaceLayout.js`) | `cycleFocus` reused, same key |
| Esc closes the front window | `src/raw/utils/windowCascade.js` `pickEscapeWindow`, `RawEditor.jsx:~2640` | `pickEscapeWindow` reused; limited to windows added by hand |
| Cascade of coincident windows | `windowCascade.js` `cascadeCoincidentWindows` | not applicable (Perform tiles) |
| Arrange / tile all | none in Raw or Studio (`studio/utils/spaceArrange.js` sorts spaces, not windows; "Shift+A align/distribute" is phase 2 of the keys doc, unbuilt) | built: `tileRects` in `src/perform/presets.js` |
| Layout storage | Perform: percent rectangles in the arrangement, kept by "Save as mine" (layout hook) or "Save to the show" (`upsertPerformPreset` op in the document) | unchanged; menu rows open that same save form. No new browser storage |

## Keys (table in `src/perform/windowKeys.js`)

| Key | Does | Source |
|---|---|---|
| Ctrl+` / Ctrl+Shift+` | next / previous window (stack order, minimised skipped) | Nodes, RawEditor |
| M | maximize / restore the front window | keys doc, Window menu |
| / | add-window list | keys doc, "add a node" family (Tab left to focus) |
| Esc | hide a window added by hand this session | Nodes Esc (narrowed: a stray Esc must not close the deck mid-show) |
| Shift+A | arrange all | keys doc Shift+A family (unbound in Nodes) |

Never fire: focus in input/select/textarea/contenteditable; Ctrl/Alt/Meta (except Ctrl+`); a menu open; default prevented; key repeat. Not used: 1-9 (cues), Space/Enter (deck MIDI learn), B (Blackout has no key; MIDI is not the keyboard).

## Arrange
`tileRects(ids, widthClass, area)`: choose rows x cols whose cell is nearest 16:9, split the 12x8 (4x8 phone) unit grid into whole-unit rows and columns, remainder to the first. Fills the grid exactly, no overlap, order kept (reading order of the current layout). Clears maximised and minimised state.

## Not done / not verified
No browser look (desktop or phone). Touch long-press = right-click (keys doc rule 5, `useLongPress`) not wired on title bars (it would fight the drag). Menu styling is raw.css `raw-ctx-*`, no new CSS beyond the transparent `.perform-desk-bg`.
