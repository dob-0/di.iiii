# MIDI of the show desk

The show desk listens to a MIDI controller through the browser (Web MIDI; `../show.js`, `../midiMap.js`). The default map is the
Allen & Heath Xone:K2's, and **every one of its 58 controls does something** (the owner, 2026-11-01, ledger N1718: "make all
mapped, that maybe they not trigger the right one"). The same table is the **K2 map** button in the desk's bottom line.

## Files

- `xone-k2.json`: the K2's controls and their MIDI numbers (58 controls), copied unchanged on 2026-10-31 from the job's research
  file. Source: the maker's own documents (per row, `src`). Channel 15 by default (14 on the wire, the low nibble of 0xBE / 0x9E).
  Rows marked `[inferred]` in the research (the two bottom encoders' CCs) are to be confirmed by Learn on the unit.
- `../midiMap.js`: the one table the page maps by (the K2 rows and what each does), the rule for which row a message takes, what a
  stored map may hold, and the words of the In line. `../midiMap.test.js` keeps it equal to `xone-k2.json` and to this file.
- Checked 2026-11-01 against the maker's Xone:K2 user guide AP8509,
  <https://www.allen-heath.com/content/uploads/2023/06/XoneK2_UG_AP8509_3.pdf> (HTTP 200, 5 252 338 bytes, 30 pages): all 58
  numbers of `xone-k2.json` (Latching Layers off, the red layer) are on its pp. 14-16; the default "MIDI Channel number is set to
  15" is on p. 11; turning an encoder sends two's-complement CC (p. 9). Not found by that check: the amber and green layer numbers
  of pot switch 7 (82, 118), which the desk does not read.

## What the page does with a message

- **Channel.** Default **Any channel**: a message takes the row of its kind (CC or note) and number whatever channel it came on;
  a row on the message's own channel wins over the same number on another. **Channel 1 to 16** (picker in the bottom line, kept in
  this browser, `diShowDesk.midiChannel.v1`) hears that channel only. **Channel 15** is how the page listened before 2026-11-01
  (the K2's own channel); with it picked, a message on another channel does nothing and the In line says so.
- **In line** (bottom line, "In: ..."). The last message: channel, kind, number, value, then where it went (the target, `unmapped`,
  `not used`, or `ignored` on a picked channel). It is lit for 300 ms after each message. With no port it says
  `In: no MIDI port`; with one and nothing heard it names the port. A key release (note off) says nothing new and is not shown.
  So a K2 on the wrong channel or a wrong number is seen at once.
- **Pick-up.** Faders and pots move nothing until they pass the value on the screen; encoders step from the screen's value.
- **Learn** changes the map in this browser only (`diShowDesk.midiMap.v1`). A stored map wins; the default rows it does not hold are
  added when the page loads, so a K2 control new to the defaults works in a browser that stored its map before. Stored `spare` rows
  (old defaults) give way to the new action.
- **Never on MIDI:** On, Off, the lifts, Undo, Save and Release (`isTarget()` names every target there is; a stored map is read
  through it). The new presses can only step a scene, set a knob back to its start, or park a knob.

## The map (default, Xone:K2, Latching Layers off, channel 15)

Pots are numbered by rows of four, left to right, top to bottom (pot 1 to 4 the first row); each pot has a switch under it with the
same number. Encoders 1 to 4 are the top row; encoders 5 and 6 are in the bottom row, between LAYER and EXIT SETUP. Matrix A to P
are as printed on the unit.

<!-- k2-map:start -->
| Control | MIDI | Does |
|---|---|---|
| encoder 1 | CC 0 (relative) | Live look: rotation |
| encoder 2 | CC 1 (relative) | Live look: x |
| encoder 3 | CC 2 (relative) | Live look: cycle |
| encoder 4 | CC 3 (relative) | Live look: phase |
| encoder 1 push | note 52 | Reset rotation |
| encoder 2 push | note 53 | Reset x |
| encoder 3 push | note 54 | Reset cycle |
| encoder 4 push | note 55 | Reset phase |
| pot 1 | CC 4 | Live look: level |
| pot 2 | CC 5 | Live look: size |
| pot 3 | CC 6 | Live look: height |
| pot 4 | CC 7 | Live look: copies |
| pot switch 1 | note 48 | Park level |
| pot switch 2 | note 49 | Park size |
| pot switch 3 | note 50 | Park height |
| pot switch 4 | note 51 | Park copies |
| pot 5 | CC 8 | Live look: spin |
| pot 6 | CC 9 | Live look: pulse |
| pot 7 | CC 10 | Live look: sweep |
| pot 8 | CC 11 | Laser master |
| pot switch 5 | note 44 | Park spin |
| pot switch 6 | note 45 | Park pulse |
| pot switch 7 | note 46 | Park sweep |
| pot switch 8 | note 47 | Park laser master |
| pot 9 | CC 12 | Cube 1 size |
| pot 10 | CC 13 | Cube 2 size |
| pot 11 | CC 14 | Cube 3 size |
| pot 12 | CC 15 | Lights master |
| pot switch 9 | note 40 | Park cube 1 size |
| pot switch 10 | note 41 | Park cube 2 size |
| pot switch 11 | note 42 | Park cube 3 size |
| pot switch 12 | note 43 | Park lights master |
| fader 1 | CC 16 | Lamp 1 level |
| fader 2 | CC 17 | Lamp 2 level |
| fader 3 | CC 18 | Lamp 3 level |
| fader 4 | CC 19 | Lamp 4 level |
| matrix A | note 36 | Scene 00 |
| matrix B | note 37 | Scene 01 |
| matrix C | note 38 | Scene 02 |
| matrix D | note 39 | Scene 03 |
| matrix E | note 32 | Scene 04 |
| matrix F | note 33 | Scene 05 |
| matrix G | note 34 | Scene 06 |
| matrix H | note 35 | Scene 07 |
| matrix I | note 28 | Scene 08 |
| matrix J | note 29 | Scene 09 |
| matrix K | note 30 | Scene 10 |
| matrix L | note 31 | Scene 11 |
| matrix M | note 24 | Scene 12 |
| matrix N | note 25 | Scene 13 |
| matrix O | note 26 | Scene 14 |
| matrix P | note 27 | Blackout all (dark only) |
| layer button | note 12 | Previous scene |
| encoder 5 | CC 20 (relative) | Live look: pulse beats |
| encoder 5 push | note 13 | Reset pulse beats |
| encoder 6 | CC 21 (relative) | Live look: sweep beats |
| encoder 6 push | note 14 | Reset sweep beats |
| exit setup button | note 15 | Next scene |
<!-- k2-map:end -->

- **Live look: x** is the live look on the laser desk; **Cube n size** is the n-th cube's Size fader; **Lamp n level** the n-th lamp
  of the lighting desk; **Scene nn** the n-th scene in the lighting desk's order (a scene the rig does not have does nothing).
- **Park** the knob: it moves nothing until it passes the value on the screen again (pick-up starts over). It can only make the
  controller quieter.
- **Reset** the field: it goes back to the laser desk's own default (`LOOK_DEFAULTS`; its state serves them, this page keeps a copy).
  Only fields of place and timing can be reset (rotation, x, cycle, phase, pulse beats, sweep beats), never a level, a size or a master.
- **Next scene / Previous scene** (EXIT SETUP / LAYER) press the scene after or before the lit one, like its scene key; they stop at
  the ends.

## Decisions, and what is not done

- Kept exactly as the crew knew them (2026-10-31): lamps on faders 1-3, the live pots, Laser master on pot 8, Lights master on pot
  12, cube 1 size on pot 9, the top encoders, scenes 00-09 on matrix A-J, Blackout all on matrix P. Only the three `spare` rows
  (CC 13, 14, 19) and the unmapped controls got actions.
- Fader 4 now drives lamp 4. The owner's unit has a dead fader 4 (2026-10-31); it sends nothing, so this costs nothing there, and it
  works on a unit whose fader 4 is alive. If one ever jitters, one Learn row (or a `spare` row) takes it out.
- Lifts are not mapped on purpose (rule since 2026-10-31); the matrix row 4 carries scenes 12-14 and Blackout all.
- Not read: the K2's amber and green layers (Latching Layers on), which send the same controls on other numbers (CC +22 / +44,
  notes +36 / +72); the In line shows them as `unmapped`. Keep Latching Layers off (the K2's default).
- Not tested with the real unit: the new rows on a K2 (this was built while the stage Mac was live). Encoders 5 and 6 are taken
  as relative like the top four (guide p. 9); their CCs 20 and 21 are on guide p. 16. Confirm on the unit.
- The lighting desk has its own MIDI page and map; this file is the show desk's.
