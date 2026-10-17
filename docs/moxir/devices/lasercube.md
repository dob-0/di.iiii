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

## What TouchDesigner really sends — TESTED 2026-10-17 06:40 (relay on aylmo, cube 1, ledger N946)

Measured with a transparent UDP relay (`agent-reports-2026-10-17/td_tap.mjs`: TD's copy for cube 1 addressed to
10.42.0.1, every packet logged and forwarded to 10.42.0.44 unchanged; log `td-to-cube-tap-2026-10-17.log`), 25 s of
the owner's TD scenes on one Ultra Mk2:

| | TouchDesigner (measured) | di (measured in-process, same day) |
|---|---|---|
| x on the wire | 0 … 4095 | 0 … 4095 |
| y on the wire | 0 … 4095 | 2048 … 4095 (the keep-in zone: upper half) |
| colour max | 4095 | 4095 |
| rate | 30 100 points/s (228 msgs/s) | 30 000 points/s |
| message | up to 146 points (1464 B), header `a9 00 <msg> <frame>` | up to 140 points, same header |
| commands seen | 0x77 info, 0x82 set rate once, 0x8a buffer-free ≈ 22/s | 0x77, 0x78, 0x80, 0x8a |
| lit share | 74 % of points | — |

So both senders use the same 12-bit field; the only coordinate difference on the wire is y below 2048. The cube's
0x77 answer reported `outputEnabled: false` throughout TD's run while the cube was visibly lit: the flag (or our
reading of byte 4) does not mean "light on" — do not trust it as a light indicator.
