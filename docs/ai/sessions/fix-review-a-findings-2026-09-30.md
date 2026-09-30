## 2026-09-30 — cloud review A findings fixed: desk strobe cap, DMX rate rounding, laser dark in every look, aisle guard, matte steel

- Source: `docs/ai/sessions/cloud-review-a-2026-09-30.md` on `cloud/review-a-2026-09-30` (areas A1, A2; A3–A5 had not landed). Each finding was re-checked against the code before fixing.
- A1-1: the desk's strobe effect (`serverXR/src/lighting/fx.js`) flashed at 20/s at 120 bpm; its slice is now at least 1000/3 ms. A1-2: `dmxDecode` writes the DMX value that plays at or below the capped rate (it rounded up, 3 Hz asked wrote up to 3.04 Hz). Guard: `src/rigbuild/strobeRoundTrip.test.js` fails on the base.
- A1-4: safety steel, spreader, xflat junction and beam clamps use the matte steel values (`rig-lib.mjs`). The "on the back girder" label on the safety-steel clamp is not addressed.
- A2-1: every ground look writes the laser group at level 0 (`gs-laser-roof` was 0.6); the sign-off remains text in the intent, not a gate. Scene deck tests adjusted to the dark data. A2-2: the ground-mover guard also checks the aisles at the 2.5 m eye height (1.5 m plan radius around the lens ignored); `gs-cross-beams` in_deg 48/40/35 → 34/28/26.
- Not done: A1-3 (union of strobe trains across lamps, needs a room-wide design), A2-3 (effect distance to the crowd rail, needs maker figures), A2-4 (latent guard holes), a runtime laser gate in room/desk playback.
- Owed: the owner's installed ground projects still carry the old laser level and cross-beam angles until `looks.mjs` is run on them after a `di save`. Nothing was seen on a screen.
