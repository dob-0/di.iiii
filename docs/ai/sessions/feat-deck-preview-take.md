## 2026-11-10 — VJ deck: deselect, Preview only + TAKE, monitor size, adaptive

Owner (VJ, show Saturday), asked three times: "how to deselect", "when i click to source it just preview how to
preview how to output", "and preview and deselect fix that", "mb i want to small prew not as much", windows
"zoom ... adaptive to screen". Branch `feat/deck-preview-take`. Files: `src/raw/components/vjDeck/VjDeckView.jsx`,
`vjDeck.css`; data functions unchanged (`trigger`, `clearLayer`).

### Behaviour

1. DESELECT. A click on the tile that is ALREADY playing on its layer stops that layer (`clearLayer`, the same as
   the x). Esc clears the selection (Preview and Clip back to "Select a clip"); a click on the empty grid
   background (scroll area, grid, a row) does too. Esc is handled only when the deck has a selection, focus is on
   the deck or on nothing (body), not in input / select / textarea, no `[role=menu]` / open `aria-haspopup`
   is on the page and MIDI Learn is off; the deck calls `preventDefault`, and `windowKeyAction`
   (src/perform/windowKeys.js) returns null for a defaultPrevented key, so the Perform "Esc hides the window you
   added" does not also run. With no selection the key passes through unchanged. The deck's listener is on
   `document`, which runs before PerformDesk's `window` listener.
2. PREVIEW ONLY. Switch in the top bar (`aria-pressed`, text "Preview only" + on/off, ring when on). OFF (default)
   = as before. ON = a click only selects; nothing is written. TAKE (in the Preview caption; in the monitor tools
   when Preview is hidden) and Enter (same focus rule; Enter on another button stays that button's) send the
   previewed clip with `trigger`. Component state only, never in the show document. MIDI/K2 never goes through it.
   In Preview only a playing tile is stopped by its x (a tap there selects).
3. MONITOR SIZE. S / M / L (`data-monitor-size`; column 140 / 210 / 300 px; in the stacked layout 128 / 200 px /
   share the row) and Hide / Show preview. Kept per device in localStorage `di.vjDeck.monitors` (try/catch);
   the deck node has no view state of its own, and the show document is not touched. Default L = as today.
4. ADAPTIVE. No zoom variable exists for the deck (the only one, `--raw-zoom`, is the Nodes canvas). Reused the
   deck's own `@container vjdeck` queries (900 / 560 px). Controls `min-height: max(var(--vj-control), 28px)`;
   buttons `white-space: nowrap`; the grid area keeps a minimum of two layer rows + column row at any width
   (the deck scrolls on a 360 px frame); at <= 560 px the Preview is no longer dropped (Preview only needs it):
   both monitors become a small strip, and Hide preview is the way to drop it.

### Brand (di-brand SYSTEM.md)
Square corners (`--di-radius`), 1px lines, the existing inset 1px ink ring for "on" (as the playing tile), no new
colour, no motion. State is also text (on/off, aria-pressed), not colour.

### Changed tests
`VjDeckView.test.jsx` "again restarts it" is now "again stops the layer" (the new rule); `camera.test` selects the
playing camera tile through Preview only (a tap on it would stop it). New: `VjDeckView.preview.test.jsx`.

### Not judged (no browser)
Real look at 560 / 900 / 2000 px and 360 px tall; whether the strip at <= 560 px feels right; Esc/Enter order against
the Perform window keys in a real page (tested by the defaultPrevented contract only).
