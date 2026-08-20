# The operator's hands (TD audit, wave 5 of 5)

## What changed

- **Button** — the desk's Go: a window with one big pressable surface.
  Presses is the authored count, written through an op so every window and
  a Counter downstream agree how many times the show was told to go;
  Pressed is this window's live finger through the side channel.
- **Keyboard** — a chosen key (default Space) read by an invisible
  editor-level KeyboardFeed: repeat events don't recount (a held key is
  one event, the Counter convention), and keys typed into fields are
  ignored — the spacebar that fires the show must not fire while naming a
  node. Window-local by nature; /out has no fingers.

Both wired into the example: Go's presses drive the Counter's step, the
chosen key samples the sine through Hold.

## Verified

Runtime reads (authored count vs live hold, feed-quiet defaults), the
feed's repeat/field/case rules, the window's press-and-hold contract and
its disabled-without-a-writer state — all unit-proven. Full suite
2553/2553 (one known local-dev-server fetch flake, clean on rerun); lint
at baseline; build/wiki/docs green.
