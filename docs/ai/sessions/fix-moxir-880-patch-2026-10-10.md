## 2026-10-10 — the cranes rig lays the owner's DMX patch (U1 353, U2 400), not the v2 spread's ok:false block

- #880's cranes rig carried the v2 spread's `patch` block (U1-stage 53 devices, 512 slots, `ok:false`), not the owner's patch (N460.2). `moxir_v2_cranes.py` now lays it with `moxir_v2_ground.plan_addresses` in `build()` and `rig_doc()`, as ground and compose do. Red test first: 4 failed, 18 passed; after: cranes tests 22 of 22.
- Lead decision (2026-10-10): the plan follows the rig, cut 11 and planes 39 (N463, the pit PAR became `rig-par-cut-11`); addresses and the universe totals are unchanged.
- Owed: `moxir-v2-ground.test.js` A1 PATCH now fails because ground's rig (cut 10, planes 40) is refused by the shared plan; ground must copy the plan with its own counts as compose does.
- Owed: `moxir_v2_cranes.py build` also rewrites `moxir-lasers-on-crane-2026-10-09.json` and drops the `forty_watt_route_r3` owner_decision and precondition keys (40 W safety text) that no script produces; not committed.
