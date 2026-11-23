# MIDI maps of the show desk

`xone-k2.json`: the Allen & Heath Xone:K2's controls and their MIDI numbers (58 controls), copied unchanged on 2026-10-31
from the job's research file `xone-k2-default.json`. Source: the maker's own documents, as that research cites per row
(`src`): the Xone:K2 user guide AP8509 (pages 9-20), the maker's Traktor Pro 3 guide for the K2 and the maker's Ableton Live
set; channel 15 by default (14 on the wire, the low nibble of 0xBE / 0x9E). Rows marked `[inferred]` in the research
(the two bottom encoders' CCs) are to be confirmed by Learn on the unit.

The page (`../show.js`, `MIDI_DEFAULT`) maps: faders 1-3 (CC 16-18) the first three lamps, fader 4 (CC 19) the Lights
master; pots CC 4-7 live level, size, height, copies; CC 8-11 spin, pulse, sweep, Laser master; CC 12 the first cube's
Size, CC 13-15 spare; top encoders CC 0-3 (relative) rotation, x, cycle, phase; matrix A-J (notes 36-39, 32-35, 28, 29)
scenes 00-09; matrix P (note 27) Blackout all, dark only. On, Off, the lifts, Undo, Save and Release are never MIDI targets.
Learn keeps a changed map in that browser only (localStorage `diShowDesk.midiMap.v1`); the lighting desk has its own MIDI page.
