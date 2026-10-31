## 2026-11-01 — the Show desk hears the Xone:K2 on any MIDI channel, and every one of its 58 controls does something

- The owner (ledger N1718): "make all mapped, that maybe they not trigger the right one". Before, the desk matched a MIDI message only when kind,
  channel (14 on the wire) and number all equalled a row, and said nothing otherwise, so a K2 set to another channel (a setup option, 15 by
  default, AP8509 p. 11) or a control the map did not hold looked dead. Now (`serverXR/src/showDesk/ui/midiMap.js`, new; `show.js`, `index.html`,
  `show.css`): the desk hears any channel by default (a row on the message's own channel wins); a Channel picker (any, 1 to 16, kept per
  browser in `diShowDesk.midiChannel.v1`; "15 (K2)" is the old way, nothing lost); an In line under the MIDI line with the last message
  (channel, kind, number, value, then the target, `unmapped`, `not used` or `ignored`), lit for 300 ms; a K2 map button that opens the one table.
- The K2 table (`midiMap.js` K2) holds all 58 controls of `ui/midi/xone-k2.json`, once each. Kept exactly: lamps on faders 1-3, the live pots,
  Laser master on pot 8, Lights master on pot 12, cube 1 size on pot 9, the top encoders, scenes 00-09 on matrix A-J, Blackout all on matrix P.
  New: fader 4 lamp 4 (the owner's fader 4 is dead, so it costs nothing there), pots 10-11 cubes 2-3 size, matrix K-O scenes 10-14, encoders 5-6
  pulse beats and sweep beats, a push on an encoder resets its field to the laser desk's own default (`LOOK_DEFAULTS`; its state serves them),
  the switch under a pot parks that pot (pick-up starts over), LAYER and EXIT SETUP step to the previous and the next scene. A stored (Learn) map
  wins and the default rows it lacks are added when the page loads; stored `spare` rows give way. On, Off, the lifts, Undo, Save and Release are
  still never on MIDI (`isTarget()`; lifts were offered as an example for matrix row 4 and left out on purpose, rule of 2026-10-31).
- Measured 2026-11-01. `npx vitest run serverXR/src/showDesk`: 97 passed in 65.9 s (`midiMap.test.js` new, 9 new cases in `showDesk.test.js`;
  one older assertion changed: the density switch's next sibling is now the MIDI block that holds the MIDI line). The 58 numbers of
  `xone-k2.json` are all on pp. 14-16 of the maker's guide AP8509 (fetched this day; the channel default is on p. 11); 2 of the 116 amber and green
  layer numbers (pot switch 7) were not found by the text check, and the desk does not read layers. On the agent screen at 1278 x 758 with a stub
  MIDI port: 0 page errors, the In line lit at 80 ms and dark at 480 ms, a message on channel 1 took scene:1 and showed "(map: ch 15)", with
  Channel 15 picked it showed "ignored, desk on ch 15", square corners (0 px). First build overflowed the bottom line (scroll width 1386 against
  1278, the MIDI line squeezed to 0 px); fixed by a two-line MIDI block and by moving the sentence "The Light desk has its own MIDI page too." into
  the K2 map sheet (scroll width 1278, nothing clipped).
- Not seen: a real K2 on the real stage Mac (live in a show; install after the show), a touch screen. To confirm on the unit: encoders 5 and 6 as
  relative CCs 20 and 21, the switches under the pots, fader 4. Not done: the K2's amber and green layers (Latching Layers on) are not read; the
  In line shows them as `unmapped`.
- Another session committed a smaller any-channel change on the branch `fix/show-desk-midi-omni-2026-11-01` (the same two ideas: the same kind and
  number on any channel, and a "heard ..." tail on the MIDI line) while this was built; this branch holds all of its behaviour, with the heard
  line as its own In line, so take this branch and drop that one (both edit `onMidi` and `midiLine` in `show.js`, so merging both conflicts).
