## 2026-10-30 — Laser: output state unknown on fw 1.17; Find sweeps each network at once

- S3: LaserCube 7.5W Ultra Mk2 fw 1.17 answered byte 5 = 2 both dark and lit, so `parseFullInfo` reports `outputEnabled: null` there; raw `statusFlags` kept.
- S8: `findCubes` sweeps each /24 on its own socket concurrently; a silent wifi /24 no longer delays the laser network.
- Not tested on hardware: whether sweep order was the true cause of the empty Find at the stage is unconfirmed (unit test uses a virtual clock).

## 2026-11-04 — PR #1230 review fixes: output state stays unknown, Find survives one bad network

- Laser Out panel shows the cube's outputState ("not reported by this firmware") when outputEnabled is null, never "output off"; UI test added.
- parseFullInfo reads byte-5 bit 0 only for firmware strings in OUTPUT_VALIDATED_FIRMWARE (empty: no firmware besides the measured-wrong 1.17 has been read against a lit beam); every firmware reports null until one is added with a measurement.
- findCubes uses Promise.allSettled, reports a failing /24 as a warning even when other networks found cubes, and sweeps at most MAX_SWEEP_NETWORKS (8) /24s; tests cover both.
