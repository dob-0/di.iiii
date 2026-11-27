## APC40 mkII: all 147 controls mapped on the light desk (owner "yes map all keys")
- Every mkII note and CC has a preset row (147 of 147, 0 free), behind ARM, hits released on note-off; design note and control table in the PR.
- Track select and master select send no MIDI in Mode 0, so they are the 9 hardware knob pages (Akai APC40 mkII Communication Protocol v1.2, p.10).
- Strobe on the BAR1240PIX57 stays capped at DMX 14 (tested for every knob value).
- Tests: src/lighting 330 of 330. Simulation on a scratch desk: 78 to 79 of 80 per run; the failures moved between runs (queue timing), see the PR.
- Not tested: the real unit; the preset must be re-applied after install for the new rows to reach the show.
