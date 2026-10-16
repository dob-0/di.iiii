# MOXIR on two machines — aylmo and PONYO (owner, 2026-10-16 18:3x)
**The owner's words:** "ponyo as 2nd rig … the same there … 2 machines also phones" — PONYO is **both** a backup that takes over and a machine that can drive;
"the entec connected to the ponyo so we can fast move the one universe".
**PONYO is Emilya's laptop** (Windows). Agents on aylmo never log into it (memory feedback_heat_stays_on_this_pc). Everything below is run ON PONYO by the
owner, or by PONYO's own Claude session with Emilya's yes: "read docs/moxir/two-machines.md in dob-0/di.iiii and do part 2".

## How it works (sACN, ANSI E1.31 — the standard both ESP nodes and di's desk speak)
- Both desks send the SAME show to the ESP nodes as **sACN**, each with a priority. The node takes the **highest priority** and ignores the other
  (vizzz.di `include/vizzz_core.h` "Source arbitration", in node fw 2c819ed and af5453d).
- **aylmo sends at priority 150, PONYO at 100.** If aylmo stops for **2.5 s** (crash, cable, sleep), the node drops it and PONYO's stream takes over by itself (§6.7.1).
- **PONYO drives on purpose:** set PONYO's priority to 200 — the node switches at once. Back: 100.
- **One universe to PONYO's ENTTEC:** move that universe's DMX cable from its ESP node to the ENTTEC on PONYO, then switch on PONYO's ENTTEC send for that universe.
  A widget is one DMX line; it does not take part in the priority (it is its own cable).

## Part 1 — aylmo (done from aylmo, when the owner says the output goes live)
    curl -X POST http://diiii.localhost/light/api/output -H 'Content-Type: application/json' \
      -d '{"driver":"sacn","priority":150,"mode":"unicast","targets":["<node 1 IP>","<node 2 IP>"],"enabled":true}'
Today (18:3x, read-only) aylmo's desk is `artnet`, broadcast, priority 100, **output OFF** (as decided 10-15) — nothing changed by this file.

## Part 2 — PONYO (run on PONYO)
1. **Network:** join the same Wi-Fi as the nodes (the venue's, or a node's own AP); LAN cable into the same switch as aylmo.
2. **Same di as dev:** `di update` (channel dev), then `di follow moxir --from https://dev.diiii.xyz --into moxir` — the show, its cues and every edit arrive by the follow.
3. **The show onto PONYO's desk:** `node scripts/rigbuild/version-to-desk.mjs --project moxir-v2-11 --api http://diiii.localhost/serverXR --plan <the plan>`
   (the same one command aylmo uses; its step 5 checks U1/U2 and the runner).
4. **Output, backup priority:** the Part 1 call with `"priority":100`.
5. **The ENTTEC, ready but off** (COM port from Device Manager, e.g. COM3; `<U>` = the universe it would take):
       curl -X POST http://diiii.localhost/light/api/output/send -H 'Content-Type: application/json' \
         -d '{"name":"ENTTEC","driver":"enttec","serialPort":"COM3","universes":[<U>],"enabled":false}'
   To move the universe: cable from the node into the ENTTEC, then the same call with its `id` and `"enabled":true`.

## Limits, stated
- **The two desks keep their own clocks.** On a takeover the show continues from PONYO's own cue position, which may differ from aylmo's. Owed: one desk follows the other's cue (engine job).
- **The node on old firmware speaks Art-Net only** — no priority, so it must have ONE sender. Update it to the current vizzz.di build (owed) before both machines send to it.
- **LaserCubes** are driven over the network by one machine only (LaserCube jam 10-14: one sender); they do not take part in the takeover.
- **Phones:** open the show page of either machine's di over the venue address — the desk is the one process that plays; a phone only asks it.
- **Not tested:** nothing in Part 2 has run on PONYO yet; the takeover has not been seen on a lamp.
