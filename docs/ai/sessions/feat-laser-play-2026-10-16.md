# feat/laser-play-2026-10-16 — MOXIR venue night (owner, 2026-10-16 22:3x–23:3x)

- **Beam colours:** UP-B380F ch 9 wheel slots named at the venue (owner's eye 1-4, his photos via di.bo 5, 7-13) →
  `B380F_WHEEL_SEEN` in `src/rigbuild/fixtureTypes.js` (cap.wheel), `types/moxir.json` regenerated. Unsure slots 6, 8 carry no
  colour. Log `docs/moxir/devices/up-b380f-wheel-walk-2026-10-16.txt`, photos `docs/moxir/devices/photos/b380f-wheel-slot*`.
  Before: all 53 looks sent ch 9 = 0 (white) while the room drew the scene colour. After: 48 looks light the beams with a slot.
- **`scripts/rigbuild/wheel-walk.mjs`:** hold/step a profile's colour wheel through the desk's manual channels; `--release`.
- **`scripts/rigbuild/laser-play.mjs`:** a project's LaserCube lines → the cubes (POST /laser/api/frame), the room page's frame pick.
  Never arms. Ran disarmed against 6 cubes on Ethernet (all took frames). Owed: tests, `--map` by hang position, a service.
- Tests: `npx vitest run src/rigbuild/` 1690 passed. Owed: tests for the two new scripts' pure helpers.
