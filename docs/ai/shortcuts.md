# Studio Keyboard Shortcuts

Canonical reference. Keep in sync with `SHORTCUT_SECTIONS` in `src/studio/components/StudioViewport.jsx` (the Shift+? overlay).

**Rule:** Add every new shortcut to both this file AND the overlay. See `golden_rules.md` → "Shortcuts: every new shortcut goes in two places."

---

## Selection

| Key | Action |
|---|---|
| Click | Select entity |
| Ctrl / Shift + Click | Multi-select (additive toggle) |
| A | Select all unlocked, visible entities |
| Alt+A | Deselect all |
| Esc | Deselect |

## Transform (modal — Blender style)

| Key | Action |
|---|---|
| G | Move (grab) mode |
| R | Rotate mode |
| S | Scale mode |
| → X / Y / Z | Constrain to axis, then start drag |
| → A | All axes (uniform scale) |
| Shift + drag | Fine / slow adjustment |
| Click · Enter · Space | Confirm transform |
| Esc | Cancel transform |

## Edit

| Key | Action |
|---|---|
| Ctrl+C | Copy selected entity |
| Ctrl+X | Cut selected entity |
| Ctrl+V | Paste |
| Shift+D / Ctrl+D | Duplicate selected |
| Del / Backspace | Delete selected (cascades into group children) |
| Ctrl+G | Group selection (≥2 entities → new group at centroid) |
| Ctrl+Shift+G | Ungroup (selected group → children return to root) |
| F | Frame / focus selection |
| Ctrl+Z | Undo |
| Ctrl+Shift+Z / Ctrl+Y | Redo |

## View

| Key | Action |
|---|---|
| Tab / E | Toggle Navigate ↔ Edit mode |
| T | Toggle gizmo visibility |
| H | Hide / show UI |
| Scroll | Zoom |
| Middle drag | Orbit |
| Right drag | Pan |

## UI

| Key | Action |
|---|---|
| Double-click viewport | Quick insert |
| Shift+A | Tile open panels |
| Shift+R | Reset panel layout |
| Shift+? | Show / close this help overlay |
