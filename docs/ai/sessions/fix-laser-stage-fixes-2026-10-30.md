## 2026-10-30 — Laser: output state unknown on fw 1.17; Find sweeps each network at once

- S3: LaserCube 7.5W Ultra Mk2 fw 1.17 answered byte 5 = 2 both dark and lit, so `parseFullInfo` reports `outputEnabled: null` there; raw `statusFlags` kept.
- S8: `findCubes` sweeps each /24 on its own socket concurrently; a silent wifi /24 no longer delays the laser network.
- Not tested on hardware: whether sweep order was the true cause of the empty Find at the stage is unconfirmed (unit test uses a virtual clock).
