# Lamp audit loop — the four commands (owner 2026-10-17: "why you so slow … learn this so we work fast")

The owner says which lamps differ between the hall and the 3D. Use these four commands without reading their code again.
P=moxir-v2-11, S=<session scratchpad>. Their usage was measured on 2026-10-17.

1. Light a group, one colour per lamp (the hall and the 3D at once). The owner's own 3D view is the check, not a test-browser shot:
   `PROJECT=$P node scripts/rigbuild/group-identify.mjs --universe 1 --from 17 --to 96 --held-file $S/g.held.json` (branch feat/group-identify-2026-10-17)
   To release: `... --release --held-file $S/g.held.json`
2. Move a lamp and/or change its address in one batch, with a backup first. The moves file is {what, source, moves:[{id, position, rotation?, fixture?}]};
   `fixture:{address:null}` removes an address:
   `python3 scripts/place/move_lamps.py --api http://diiii.localhost/serverXR --project $P --moves <file> --backup <dir> --apply`
3. Physics, which must report 0 leaks: `python3 scripts/place/physics_check.py --api http://diiii.localhost/serverXR --project $P --hall scripts/place/rigs/moxir-hall-2026-10-12-v13-skin.hall.json`
4. After any address change, re-patch the desk. This is still a workaround (owed: patch.mjs --exact skipping unaddressed lamps):
   `node $S/exact60.mjs`, then read back node 1 (192.168.4.1/api/dmx) and node 2 (192.168.4.3, U2.137-200 must all be 0).

## The desk's held layer is SHARED (learned 2026-10-17, laser outage)
`POST /light/api/raw` holds live in ONE layer for every chat and for the owner's own faders. Releasing channels (`value: -1`)
releases them for everyone: on 2026-10-17 the beam chat released U2.137-200 "to hand the lasers over" and blanked both 40 W
in the middle of the owner's shape check with the laser chat (their fader had been working all along).
Before a release: `ledger-open` + `ListAgents` for any chat on that fixture, read the channels back, and release only channels
whose value is still the one you set. Owed: per-owner holds on the desk (or a compare-and-release in the tools).
