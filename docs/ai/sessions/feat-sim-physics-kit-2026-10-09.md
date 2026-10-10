## 2026-10-09 — light physics: real laser line, one haze for beams and surfaces, no cutoff, kit-only rig

- Owner 10-09: the show uses only the Sevan kit (50 UP-PL5403, 18 UP-B380F, 6 LaserCube Ultra MK2, ONE UP-YZ31P);
  no measuring kit, so every number is the best published one, labelled EXACT / COMPONENT / EQUIVALENT / TESTED / UNKNOWN.
- Data: fixtures.json filled from agent-reports-2026-10-09/devices/fixtures-exact.json (B380F ch11-16 conflict kept OPEN);
  candidate `known-kit` in the versions file → rigs/moxir-2026-10-17-known-kit.json (a copy beside known-full).
- Physics: rig lamps distance 0 (no cutoff) + beam.length; surfaces dimmed by exp(−σd) at the beams' σ (patched fog chunk,
  far < near); the two-zone haze (Nicas 1996) for one machine, never calibrated; the LaserCube as a line source (Km·V(λ)·P,
  4 mm, 1 mrad, scans by duty share); field/beam ratios from the equivalents' reports (1.62 wash, 2.0 beam) with a
  flux-keeping fit for three's light; per-emitter XYZ mixing hook (no emitter data exists: labelled ASSUMED).
- Haze answer (UNVALIDATED): on the code's assumptions one machine gives the hall 2.7e-4 /m (steady in ~4 min), 0.23 /m within
  3 m of it; best case (0.5 ACH, no drying) 0.005 /m after 22 min, 0.0086 /m at 40 min (tank empty), 0.02 /m after 129 min.
- Scene: scripts/rigbuild/kit-from-full.mjs turns a known-full copy into the kit on a scratch stack (never dev).
- Owed: lamp→surface extinction (per-light term); measurement mode (S2, other branch); transmissometer + decay test on site;
  laser label wattage; field angles measured; emitter chromaticities; load-version for the space's version row.
- Report: ~/work/agent-reports-2026-10-09/devices/sim-physics.md.
