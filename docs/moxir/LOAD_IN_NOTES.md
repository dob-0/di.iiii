# MOXIR load-in notes — the text the load-in pack prints beside the document's data (2026-10-15)

Read by `scripts/place/load_in_pack.mjs --notes docs/moxir/LOAD_IN_NOTES.md`. A section titled `equipment: …` lands under "Equipment",
one titled `cubes: …` under "The cubes and the lasers". Facts carry their source and date; TESTED = seen on a real unit.

## equipment: Key numbers per kind
| kind | DMX footprint | draw | weight | source |
|---|---|---|---|---|
| UP-PL5403 (IP PAR-54X3) | 8 ch (4 ch mode exists) | 180 W (rig plans 200 W) | not in our files | manual 2024-01, devices/up-pl5403.md |
| UP-B380F (IP65 380W Beam) | 16 ch | 400 W max (rig plans 500 W) | 27 kg (maker page, 23 kg on a reseller page) | devices/up-b380f.md |
| UP-LA40WF (IP-LL40) | 32 ch | 40 W optical (R 10 + G 15 + B 16 W) | not in our files | devices/up-la40wf.md |
| UP-YZ31P (hazer) | 1 ch, ASSUMED | 1500 W planned | not in our files | no manual found |
| LaserCube Ultra Mk2 | none, network | 7.5 W optical | not in our files | devices/lasercube.md |

## equipment: What is still ASSUMED on the equipment (setup-day walk)
- B380F pan on ch 10 (the manual's order). If it does not move and ch 1 moves it, switch the 18 to mode `walk-2026-10-09`.
- PL5403 set to 8-ch mode on the unit (display A001). Lens 15 or 25 deg is unknown: a photo of the label from the rental.
- LA40WF set to 32-ch in its menu; laser lock and ILDA lock checked; key and E-stop in place; then walk ch 3 to find the dot graphic.
- Hazer channel (1 ch) is assumed. Sevan's own DMX lists are not in our inbox; when they arrive they replace every ASSUMED row.

## cubes: Light a cube from the installed di (steps)
Source: jam runbook (docs/ai/handover/2026-10-14-jam-runbook.md) and the jam AAR (agent-reports-2026-10-14). TESTED once, on 2026-10-14: ONE cube lit from di; never yet seen in this hall.
1. **One machine drives the cubes.** Any other machine (TouchDesigner, a second laptop) is off or disarmed. Two senders saturated the link on 10-14.
2. **Network:** every cube is a LAN client (cable to one switch or router) or a Wi-Fi client of ONE real router. Never the cube's own access point: on 10-14 relaying three cubes through one cube's AP gave 67–80 % loss.
3. **Open the page at `https://diiii.localhost/moxir`** (https, not http): the laser guard answers 403 on the http name.
4. **Laser Out → Find cubes → Use these → type the safety phrase → Arm.** Key switches in reach.
5. **Measure before arming** (5 minutes): ping the cube, loss under 1 %, RTT under 20 ms (the rule written on 10-14, proposal not standard).
6. **Disarm:** the Disarm button in Laser Out, or `curl -s -X POST localhost/laser/api/arm -H 'content-type: application/json' -d '{"armed":false}'`. The key is the stop that always works.
7. **Lowest power that shows the beam; nobody in the beam path; nothing aimed below the cubes' height toward people.**

## cubes: Cube network modes (LaserCube Ultra Mk2, fw 1.17 on ours)
| Mode | Set on the cube | Use for MOXIR |
|---|---|---|
| LAN client | Settings → Connection → LAN Client, IP mode Auto | YES: cable to the switch, router gives addresses (the 10-14 jam did this) |
| Wi-Fi client | Settings → Connection → Wi-Fi Client, router SSID | fallback: one real router, measure first |
| Wi-Fi server (own AP) | Settings → Connection → Wi-Fi Server | NO for several cubes (10-14 measurement) |
| LAN server | Settings → Connection → LAN Server | one cube, one laptop only |
Discovery is the maker's ALIVE ping 0x27 on UDP 45456 to each interface's directed broadcast; add-by-IP is the fallback. Firmware defaults differ between sources (fw 1.17 is not 2.x): verify on the cube's display. Source: docs/ai/handover/2026-10-14-lasercube-network-modes.md (research, INFERRED parts not tested).

## cubes: Which cubes, how many
The document holds **6 LaserCube units and 36 lines** (6 lines each), all marked LAN (not DMX). They sit on the far crane's girder top, aimed along +z over the floor. The 2 × 40 W are DMX (U1.401, U1.433, 32 ch each), the smoke machine is U1.501.

## cubes: LaserCube safety aims (laser-content-report.md, 2026-10-15)
Design passes its checks; **not yet seen on a cube, not yet seen in the room.** The desk still writes 0 to every laser channel until the IEC 60825-1 sign-off (`signed_off: false`).
- Hits (flashes) at most 3 per second (worst scene 2.2/s).
- Nothing goes down: every lit ray rises from the cubes at 8.81 m; lowest point of any line 8.81 m, over the 5.4 m hand rule and the 3 m audience line.
- Closest deck landing is 0.84 m from the lantern glass (edge at 6 m); widest ray at the truss bottom 1.29 m inside the columns (12 m).
- Comb and net end on the entry wall at 9.65 m (rule 9.0 m) and cross the near crane at 9.2 m or more.
- Still beams must be in the officer's still-beam list or the engine blanks them. Field ±18.5° is ASSUMED.

## cubes: The 40 W aims (laser-40w-report.md, 2026-10-15)
- Both 40 W start 0.6° higher and 3° toward the centre line than the hand aims of 02:18, because those failed two rules: crossing the near crane at 8.84 m (rule: 9.2 m) and line 42 over the column line.
- With the base aim the crane crossing is 9.38 and 9.40 m. Sweeps wider than 8° hit the column line; lift of 2° or more hits the lantern glazing.
- Every ray rises from the unit (6.4 m): never below the horizontal, never at the DJ.
- OPEN: line 42 is drawn 69.72 m but meets the roof deck at 60.02 m (static length not recomputed). Not seen on a real unit.
