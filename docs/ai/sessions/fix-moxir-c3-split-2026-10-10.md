## MOXIR C3: B380F beams no longer "hit people" by a wrong cone and a wrong judge

- Cause of skeptic finding C3 (one B380F ray into the audience in the composed v2.1 check): two
  faults. `moxir_v2_ground.py` used the B380F `angle_rad` (0.0157) as the full cone, but it is a
  half angle (epic_plot.py and three.js SpotLight.angle both mean half); the ground cone is now
  `B380F_HALF_DEG = degrees(0.0157)`. And `moxir_v2_cranes.py check` judged floor-standing heads
  (y < 2.4 m) against the people layer that the ground layer already judges with its own model
  (ISO 13857 1.5 m), so one floor head was counted twice; floor heads now skip that extra cast.
- Red test first (`R/c3-split-2026-10-10/red_test.py`): red on the old numbers, green after.
- Ground, layer and v2.1 rigs rebuilt by the scripts (build → measured → compose, compose built
  twice to the same sha). Composed check: 0 rays into people (was 1 of 108). Cranes check: 0.
  Ground check still fails its own two checks (person clearance under the rule; a beam into
  people or the cubes) — unchanged by this branch, open row N501.2.1.
- vitest `scripts/place/moxir-v2`: 85 tests in 6 files, 0 failed.
- Only cube-clearance numbers changed in the rigs (18 B380F window/aim clearances and one
  beam_aim_min), because the narrower cone is now the true one.
