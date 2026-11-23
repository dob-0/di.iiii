## 2026-10-31 — the Show desk's fader bank as rows, Upright kept as a mode (the owner: "the faders area is not used right")

- The Show desk (`serverXR/src/showDesk/ui`) lays its bank out as Rows by default: one lamp = one row (colour tab, name and patch line, a lying
  level fader, the level, 11 colour pads); the two masters are two short lying faders at the right; the cubes are one line under them, one
  card each (name and state, picture, On and Off, a lying Size fader). No element moved (grid placement; `show.js` render code, ids and
  `data-midi` untouched). Upright, the console posture the desk had, is `body[data-bank="upright"]`: a Rows | Upright switch in the bottom
  line, kept per browser in `diShowDesk.bank.v1`; its rules stay untouched in `show.css` and a test asserts it. Undo of the default: the
  Upright button, or `data-bank="upright"` on the body in `index.html`.
- Also in this branch: the Live strip's colours row and the bottom line's right end are filled; the top line is 8 to 20 px slimmer with bigger
  stops; the lamp swatch is a tab as high as its row (graft from the Tiles design); the wiki's show-desk entry, `vocabulary.md` (Rows · Upright)
  and `known-fixes.md` (a grid track that holds an `overflow: hidden` item starts at 0) are updated.
- Fixed on the way, in states the audit never shows: "Release all holds" shown cut the Lights label to 34.7 px; with 3 or more cubes the picture
  ignored the cube line's 15 px scrollbar and was cut (the card is now the size container); a card taller than its box scrolls inside itself.
- Measured with the audit's own script, base against this branch, Compact and Touch at 1280x700 and 1278x758: empty share of the whole screen
  58.3 / 42.6 / 61.5 / 45.1 % to 40.8 / 35.6 / 43.8 / 37.7 %; dead band under the bottom line 80 / 0 / 138 / 0 to 0; cube strip overflow
  30 / 98 / 32 / 100 to 0; 136 controls against 134, none missing, none under 22 px in both directions, 0 overlaps, no page scroll, 0 console
  errors. `npx vitest run serverXR/src/showDesk serverXR/src/httpContracts.test.js`: Tests 159 passed (159); eslint exit 0. Details and the
  states probed: the Rows · Upright section of `feat-show-desk-2026-10-31.md`.
- Costs of Rows: Compact needs 636 px (was 620); the Size fader is 181 px long in Compact (was 214.6); the Touch cube picture is 133 x 100 (was
  166 x 124.5); lamps beyond three scroll inside their list. Rows is the default because the owner's ask is the word.
- Not seen: the stage Mac's browser, a touch screen, a MIDI controller on a lying fader, real cubes, the owner. Owed: the layout gate
  (`measure-show-desk.cjs`, the gate and harness scripts) lives only under `agent-reports-2026-10-31/projector-room/show-gaps/` and moves into
  `scripts/` as a repo tool.
