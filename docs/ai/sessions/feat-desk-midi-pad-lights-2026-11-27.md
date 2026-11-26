## 2026-11-27 — Light desk: the APC40 grid plays the desk's looks, 40 a page, with lights

Owner (Reika night): the 5 x 8 grid plays the desk's LOOKS in desk order (the order of `looks` in /api/state), not the cue list; 67 looks = 2 pages.
- Slot k (0 = top-left) of page p fires `looks[40 p + k]` with the call a tap on that look's tile makes (`api/looks/fire {id}`), through the ARM gate; a slot past the last look is empty and does nothing. Targets `lookpad:0..39`; `cue:<i>` pads stay learnable but are off the preset grid.
- Page buttons `lookpage:prev` / `lookpage:next` = APC40 LEFT 0x61 / RIGHT 0x60. Akai v1.2 inbound note table: "RIGHT 0x60 (C_7)", "LEFT 0x61 (C#7)" (UP 0x5E, DOWN 0x5F are the other two arrows, unmapped). The doc does not use the words "bank select"; I took the arrow cluster. The page is per surface, never saved, never sent to the desk, works armed or not; shown on the MIDI page (`#miLookPage`) and in the flash line; count = ceil(looks / 40), clamped when the list changes.
- Lights (same mechanism as before): look on air (layer `cue`) red 5, other looks on the page ember 10, empty slot 0; all 40 pads are re-sent on a page change; transport lights kept.
- Tests: vitest src/lighting 100 passed, 0 FAIL, rc 0 (midiCues.test.js has the paging and light cases); fake APC40 harness 30 of 30 checks, 3 runs in a row (test desk with 67 looks, Art-Net offline, no hardware).
- CI note: the first run of #1386 failed only in localNameContracts.test.js:125 (a door port test, "expected 43903 not to be 43903"), a port-collision flake in a file this branch does not touch.
- Not tested: colours and pages on the real pads. The "bank" arrows are LEFT/RIGHT by the doc's note table; confirm on the hardware.

## 2026-11-27 — Light desk: APC40 pad lights follow the cue list
Owner asked for the pad lights after the cue pads (#1385). The MIDI page sends Akai protocol v1.2 LED messages (note-on, channel 0 = solid primary colour, velocity = RGB table colour) to the APC40 output port with the input name.
- Running cue red (5), next cue orange (9), other cues ember (10), pads without a cue unlit; PLAY on while running; SCENE 2/3 orange when play in order / loop are on; SCENE 5 red on blackout.
- Lights follow the desk armed or not (they never move the rig). Only changes are sent; a released pad is repainted (the APC40 darkens a held pad in Generic Mode).
- Tests: vitest src/lighting 96 passed; fake APC40 (Web MIDI stub with an output) 17 of 17 checks, 3 runs.
- Not checked on hardware: colours as seen on the real pads.
