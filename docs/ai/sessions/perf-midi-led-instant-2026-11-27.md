# perf: APC40 pad lights follow the press at once (2026-11-27)

Owner N7269: "when i change the scene it change but light on the midi with the delay ... make everything smooth".

## What
- `serverXR/src/lighting/ui/midiCues.js`: new `createLedPainter` (optimistic look LED, 4 s guess, desk answer corrects, poll confirms).
- `ui/app.js`: `midiPaintLights` runs through it; a look pad press and a look tile click paint the pad red in the same tick, before the `api/looks/fire` round trip; a refused or failed fire takes the guess back; page change already repainted at once (`midiRepaintLookPads`), unchanged.
- ARM rule kept: only the armed tab paints; in Safe the pads stay dark and nothing is sent.
- Not touched: the state cache (PR #1387, the 0.8-1.1 s GET /api/state).

## Measured (fake APC40 port, fake clock, `midiCues.test.js`)
- Before: first LED message after a press = next poll, modelled 1500 ms gap + 900 ms state = 2400 ms.
- After: 0 ms on the fake clock; the real send call is under 30 ms (asserted).
- Not measured on the real APC40 (the owner is using it).

## Rollback
Revert the PR; nothing else changes.
