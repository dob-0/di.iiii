## 2026-10-13 — laser margin over the dance zone (v2.8 matrix): 38 lines, worst 8.11 m, ≥ 3 m everywhere

- Cloud run (scheduled). `scripts/place/laser_margin.py` casts every laser line of `moxir-v2-8-matrix-2026-10-13.json` over
  `dims.zones.dance` of the v11 hall record: straight-down rays from the line onto the floor, ground massing and rig solids,
  through `occlusion_lib.Obstacles.cast` (the hall GLB is not in git; under the zone the record holds only the floor and the
  barrier, so boxes give the same surfaces). Each line is also tilted down by its tube's `half_fan_deg`.
- Measured: 38/38 lines cross the zone and stay ≥ 3 m. Worst nominal 8.11 m (UP-LA40WF 41/42 over the crowd barrier,
  margin +5.11 m); worst tilted 7.26 m (comb lines, +4.26 m). No pendant-lamp envelope strike (envelopes only: UNVALIDATED).
- Source of 3 m: quoted Ariz. Admin. Code R9-7-1441(L) (a US state rule, fetched). IEC TR 60825-3 / HS(G)95 / ILDA clause
  numbers NOT quoted — UNVERIFIED; the venue's national rule unidentified — UNVERIFIED.
- `scripts/place/laser-margin.test.js` (3 tests: synthetic room with known answers; the rig vs a plain-JS floor-only
  minimum). Seen failing with ground massing disabled, then passing.
- `docs/ai/plans/2026-10-13-laser-margin.md`: the table + a one-page sign-off draft (LSO, operator, venue safety, rigger).
- Not done: no browser check (no surface changed); full GLB strike check; on-site measurements (on the sign-off sheet).
