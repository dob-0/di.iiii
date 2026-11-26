## 2026-11-27 — Light desk: APC40 pad lights follow the cue list
Owner asked for the pad lights after the cue pads (#1385). The MIDI page sends Akai protocol v1.2 LED messages (note-on, channel 0 = solid primary colour, velocity = RGB table colour) to the APC40 output port with the input name.
- Running cue red (5), next cue orange (9), other cues ember (10), pads without a cue unlit; PLAY on while running; SCENE 2/3 orange when play in order / loop are on; SCENE 5 red on blackout.
- Lights follow the desk armed or not (they never move the rig). Only changes are sent; a released pad is repainted (the APC40 darkens a held pad in Generic Mode).
- Tests: vitest src/lighting 96 passed; fake APC40 (Web MIDI stub with an output) 17 of 17 checks, 3 runs.
- Not checked on hardware: colours as seen on the real pads.
