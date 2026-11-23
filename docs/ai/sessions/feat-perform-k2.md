## 2026-11-10 — VJ deck: MIDI binding with a default map for the Xone:K2

Branch `feat/perform-k2`, on top of `feat/vj-resolume-layout`. New files only, plus small hooks in
`src/raw/components/vjDeck/VjDeckView.jsx` (a hook call, the MIDI control in the top row, `data-midi-target`
attributes, one capture click handler). No CSS touched; the control uses `vj-deck-button`, `vj-deck-dim`.

### What was built (`src/perform/midi/`)

- `deckBinding.js` — pure. A map is a list of `{match:{kind:'cc'|'note',number,channel}, action, args, relative?}`.
  `applyMidi(deck, message, map, ctx)` returns the next deck, or the SAME object when nothing matches or nothing changes.
  Actions call the deck model's own functions: `opacity`, `blend`, `clipSpeed` (playing clip), `bypass`, `solo`,
  `side` (cycle off, A, B), `clip` (layer, column), `column`, `clearLayer`, `crossfade`, `master`, `bpm`, `tap`.
  Absolute = value/127; relative encoders are 7-bit two's complement (1..63 up, 65..127 down, 0 and 64 nothing),
  step 0.02 (crossfade, master, opacity), 0.5 bpm, 0.05 speed. `tap` calls the view's own tap (show clock or deck taps).
  Also: `effectiveMap` (overrides, then defaults not taken over), `withOverride`, `learnEntry`, `targetFromKey`,
  `ledsFor`, `ledChanges`, `ledBytes`.
- `xoneK2.js` + `xone-k2-default.json` — the default map. Every number is looked up by control name in the sheet
  (copy of `agent-reports-2026-10-31/projector-room/underground/midi/xone-k2-default.json`, 58 controls, channel 15).
- `useDeckMidi.js` — `useMidiInput` (the input whose name contains XONE:K2, else the first), `useMidiOutput`
  (the K2's output only), Learn state, and the LED sender (only changes are sent).
- `DeckMidiControl.jsx` — one "MIDI" button (toggles Learn), the state text (no controller / listening / K2 / learn),
  and "Reset" while there are learned bindings or Learn is on.
- Learned bindings are stored in the deck node as `values.midiMap = {bindings:[...]}` beside `values.deck`
  (travels with the project). Reset writes `midiMap: null`.

No light and no laser action exists in the binding. The model has no blackout, so there is none; `clearLayer` exists but is unbound.

### Layout (K2 layer 1, channel 15; layer and column numbers as printed on the device)

| K2 control | Does | LED |
|---|---|---|
| faders 1-4 | opacity of layers 1-4 | - |
| matrix 4x4 (A-P), row = layer 1-4 from the top, column 1-4 | play that clip | green playing, amber loaded, off empty |
| pot row 1 (pots 1-4) | blend mode of layers 1-4 | - |
| pot row 2 (pots 5-8) | speed of the playing clip of layers 1-4 | - |
| pot row 3 (pots 9-12) | FREE | - |
| pot switches row 1 (1-4) | bypass layers 1-4 | red when bypassed |
| pot switches row 2 (5-8) | solo layers 1-4 | green when solo |
| pot switches row 3 (9-12) | crossfader side: off, A, B per press, layers 1-4 | amber A, green B |
| top encoders 1-4, push | play column 1-4 | amber some layers have a clip, green all are on it |
| top encoder 1, turn | tempo nudge (0.5 bpm per tick) | - |
| top encoders 2-4, turn | FREE | - |
| bottom encoder 5, turn / push | crossfade nudge / tap tempo | - |
| bottom encoder 6, turn | master nudge | - |
| bottom encoder 6 push, LAYER, EXIT SETUP | FREE (LAYER and EXIT SETUP are the K2's own keys) | - |

Free list: `XONE_K2_FREE` in `xoneK2.js` (computed, 58 controls minus the bound ones).

### Learn

Click MIDI, click a control on the deck (clip tile, opacity, blend, B, S, side, column, crossfader, master, Tap), then move
or press a control on the controller. A learned control replaces the default for the same action and takes the control
number from any default. An encoder known as relative in the sheet is learned as relative. While Learn is on, messages
do not play the deck.

### Tested (vitest)

`deckBinding.test.js` (22 tests: every action, relative encoders, default map at most once and only sheet numbers, LEDs,
override beats default, unknown message returns the same deck) and `VjDeckView.midi.test.jsx` (a faked Web MIDI access:
a K2 note plays a clip, the LED message goes out, a fader sets opacity, Learn rebinds Master).

### Not tested

No real K2 was used. Untested: the K2's real relative encoder values (two's complement per the sheet's `mode: relative`
is assumed), LED velocities and note-on-with-velocity-0 as "off" on the hardware, the K2's LAYER key (it shifts the
note numbers on the device; this map is its first layer), several MIDI inputs at once, a browser permission prompt, and
the look on screen (no browser was opened).

### Model gaps

No deck blackout or clear-all in the model (only `clearLayer`, `master`). Tap goes through the view because the show clock
may own the tempo.
