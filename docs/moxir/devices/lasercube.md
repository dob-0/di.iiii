# LaserCube Ultra Mk2 — 7.5 W RGB (6 units, ours), network driver, not DMX
Manual v1.0 (NOHD numbers in docs/moxir/MOXIR.md §NOHD); driven live by di on 2026-10-14 (agent-reports-2026-10-14/jam-lasers-di-route-AAR.md: the route, the Wi-Fi lesson, single-shot UDP, one sender per cube). Patterns per scene: briefs/laser-content-cubes.md (queued).

**Not U-Plus** (Wicked Lasers, the owner's own cubes). Network, no DMX at MOXIR: `fixtures.json` kind `lasercube` carries `control` and `maker_note`; the 16-ch DMX profile is the maker's reference only.

## Field and picture size — TESTED 2026-10-17 (session laser, ledger N940)

- The field is 12-bit: x, y 0…4095 (0x800 the centre) on BOTH senders we have — di
  (`serverXR/src/laser/lasercubeProtocol.js` `toDeviceCoord`) and the owner's TouchDesigner script
  (NairoDorian `TD_LASER_CUBE_WIFI_LAN_2022.toe`: math CHOP pre-offset 1, gain 4095·0.5, round; read with
  toeexpand). There is nothing bigger to send: a picture that fills ±1 fills the scanners.
- Why di's pictures looked small (owner, 2026-10-17 04:0x–04:4x): di's keep-in zone (upper half, y 0…1) and the
  show's fit at 0.9 of it. TD has no zone and drew ±0.79 (its knob). Details:
  `docs/ai/sessions/feat-laser-show-player-2026-10-17.md` §04:5x.
- Owed: path smoothing on the host like TD's Laser CHOP (step, corner hold, blanking delays) — ledger N641.
