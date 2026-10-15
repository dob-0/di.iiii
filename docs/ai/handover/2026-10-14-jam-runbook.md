# Jam Discipline #4 — runbook for every case (2026-10-14, ledger N647.4 / N644)

Rig: 2 × LaserCube Ultra Mk2 7.5W fw 1.17 (di_openL 10.42.0.184 serial 8cbfea06ab30 · di_openL_2 10.42.0.44 serial
8cbfea06aa5c) on the D-Link DGS-1016D · aylmo = 10.42.0.1, gives the addresses (keep it ON) · PONYO = 10.42.0.41 (cable)
· 5 screens 640×1440 seen as ONE display 3200×1440.

## Rule for every case
- ONE machine drives the cubes. The other is disarmed and in sim (`laser.json` moved aside, di restarted).
- Key switches in reach. Disarm = the Disarm button in Laser Out (after #932) or the command below. The key is the stop that always works.
- Lowest power that shows the beam, nobody in the beam path, no beam below the cubes' height toward people.

## Lasers — who drives
| Case | Steps |
|---|---|
| **A. PONYO drives (plan)** | aylmo to sim (main session does it) → PONYO di updated to the dev build with #932 → Laser Out → Find cubes → Use these → type the phrase → Arm |
| **B. aylmo drives (fallback)** | nothing to change: aylmo's `laser.json` already holds both cubes. Open `http://diiii.localhost/di-laser/raw/projects/di-openl-test`, arm with the button (after #932 is installed on aylmo) or the command |
| **C. Wi-Fi instead of cable** | in LaserOS set both cubes to Wi-Fi **Client** on the same router as the driving laptop → Find cubes → Use these. Measure 5 min before arming (owed: no Wi-Fi numbers yet) |

Commands (on the driving machine only):
```
curl -s localhost/laser/api/state | head -c 400                                  # what di sees
curl -s -X POST localhost/laser/api/arm -H 'content-type: application/json' -d '{"armed":false}'   # disarm
```
(On aylmo the host is `diiii.localhost`; after #932 a request must come from di's own page or plain curl on the machine.)

## Screens — who drives, what shows
| Case | Steps |
|---|---|
| **1. di visuals from aylmo** | the "Jam 5 screens" project (see jam-5-screens.md) → its output full screen on the 3200×1440 display |
| **2. di visuals from PONYO** | follow `di-laser` from dev on PONYO, then the same project, full screen on that display |
| **3. di visuals from a venue PC** | a browser on the venue PC opens the project through dev.diiii.xyz, full screen (no install) |
| **4. Other software makes the picture** (Resolume, TD, video) | di only drives the lasers; sync by tempo (tap the same BPM) until the master clock (Phase 2) exists |

Check first in every case: the 5-screen TEST PATTERN — numbers 1–5 in order, borders on every edge, no scaling.

## Still owed (said, not hidden)
- Master clock shared by screens and lasers: Phase 2 of the laser workflow (not built yet). Tonight: same BPM by hand.
- Wi-Fi link numbers for the cubes.
- Real-cube camera check of #931's stop order (clear → park → off).
