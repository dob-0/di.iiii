## 2026-11-27 — the light desk's strobe rate cap is lifted, on the owner's word N7618

The owner answered "i dont want any limits so yes" (ledger N7618) to "may your strobe scenes flash faster?". The 3-flashes-a-second cap on the light desk is now a desk setting, **off by default**: `output.strobeLimit` (`POST /api/output {strobeLimit:true}` turns the old behaviour back on; it is saved with the output settings).

- **Off (default):** api/raw takes any value on a `strobe` channel (the page's knob runs DMX 4-103 = 1-20 Hz); no 3-rises-a-second refusal; the software strobe (`fx.js`, also a look's `motion` strobe) floors at two frames (one on, one off = 20 flashes a second at the 40 Hz loop) instead of 334 ms; the APC40 "Strobe rate" knob runs 1-20 Hz.
- **On:** exactly the old caps: raw strobe channel <= DMX 14, 3 rising edges a second spaced >= 334 ms, strobe slice >= 350 ms, knob 1-3 Hz.
- **Not touched:** `src/rigbuild/strobeCap.js` and its users (the 3D room preview) still clamp at 3 Hz; the preview is not the desk output.
- **Tests:** `serverXR/src/lighting/tests/test-strobe-cap.js` (switch off = no cap; switch on = old cap holds), `midiPatch.test.js`.
- **Measured** (standalone desk, loopback, ARTNET_OFFLINE=1): see `~/work/agent-reports-2026-11-27/strobe-free/measure.log`.
- **Undo:** set `strobeLimit` true (one POST), or revert the PR.
