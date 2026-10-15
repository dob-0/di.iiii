## 2026-10-15 — Walk / Fly on the room page no longer snaps back to the entrance gate

- Owner: "walk fly is stucked" on the MOXIR room page. Traced the walker pose with W held: it was put back at the gate (z 0.4 → 55.5 → 61.8) every few seconds, so W looked dead.
- Cause: the gate-arrival effect in `LiveProjectScene` depended on the `gateEntity` object; a show scene change rewrites `entities`, so it re-ran. Now keyed on gate id + position, once per entry, re-armed when walk is left.
- Guard `src/components/liveProjectSceneGateArrival.test.js`; trace `scripts/audit/room-walk-fly-trace.cjs`; check `scripts/audit/room-walk-fly-check.cjs`; known-fixes row added. Move 1 untouched.
