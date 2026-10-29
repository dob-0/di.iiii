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

## How much line one frame holds — TESTED 2026-10-17 11:0x (in-process, the guards at 35 kpps, ledger N962)

- The budget is 2333 points a frame at 35 kpps with the 6000-point buffer (`serverXR/src/laser/laserGuards.js`
  `frameBudget`); the lit step at that rate is 0.0214 of the field, so one frame holds about 50 field widths of lit
  line (≈ 16 frames/s), less what blanking, dwell and corner holds take.
- A sharp reversal costs ~20 hold points at 35 kpps (a 170° turn: ceil(2.97 rad / 0.6) × 1.17); a curve whose steps
  stay under 30° costs none; a lifted pen (a blank stroke) costs ~45 points.
- A line through N phyllotaxis seeds is ≈ 2·√N radii long (the seeds sit √(π/N) apart). TD's sunflower of dots is
  therefore a line through at most 300 seeds in 21 arms with round petals at the turn-arounds (`laserShapes.js`):
  2244 points at size 1 (16 fps), 661 points at size 0.5 from 120 (53 fps); 2000 seeds would be ~90 radii — two frames.

## The cubes' cable connection — TESTED 2026-10-17 (journal, ledger N963)

- The six cubes hang on NetworkManager's shared connection on `enp46s0` (10.42.0.1, dnsmasq). Twice on 2026-10-17
  (07:02:36 and 10:05:47) that connection was disconnected from the desktop's network menu (journal: plasmashell,
  `op="device-disconnect" interface="enp46s0"`, uid 1000); dnsmasq exited, the cubes fell silent, and 26 s later the
  engine stopped all six with `link-lost`. The connection came back at 10:09:50; the cubes stayed dark until a hand
  re-armed them at 10:19.
- A lost link stays stopped until someone arms again — by design (the engine's rule 6; laser safety practice: no
  automatic restart after a fault). A cube that re-armed itself once the link returned was built and withdrawn the
  same hour: the re-arm after a lost link is a human step. During a show: nobody touches "Wired connection" in the
  network menu; if the lasers stop, a person re-arms (handover-laser.md §2, or the Raw page's Arm).
- Open (N954): 06:49:19 all six `link-lost` at one instant with no cable, menu or DHCP event — not explained.

## Empty buffer (asked 2026-10-30, ledger N1501.18)

What a LaserCube Ultra does when its buffer runs empty (blank, or the last point held lit): **unknown, needs a real cube.** Not in this file, the 10-14 jam notes, or the protocol code. The engine counts nothing on a real cube; only the fake cube counts underruns (`scripts/laser/fake-cube-buffer.mjs`). Test with the output ARMED ONLY by the owner, at a safe aim, stopping the stream mid-figure and watching the beam.
