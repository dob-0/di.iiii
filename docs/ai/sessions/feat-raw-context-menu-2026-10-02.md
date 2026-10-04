## 2026-10-02 — Nodes right-click menu component

- Added `src/raw/components/ContextMenu.jsx`: one portal menu (`{ open, x, y, items, onClose, title?, fromKeyboard? }`), items as rows, `{ sep }`, `{ heading }` or one-level submenus; every row can show its key (`kb`). Modelled on di.desk's `buildCtx`/`openCtx`; styled from `.raw-ctx*` at the end of `raw.css`.
- Added `src/raw/utils/useLongPress.js`: touch/pen long press (550 ms, 10 px tolerance, click after the lift swallowed for 700 ms) as the finger's right-click, from the Art-Net desk's bank-list press.
- Not wired into `RawEditor.jsx` / `RawGraphSurface.jsx` yet — another session integrates the five menus from `docs/raw/2026-10-02-keys-and-mouse.md`. Seen in a real browser: owed.
