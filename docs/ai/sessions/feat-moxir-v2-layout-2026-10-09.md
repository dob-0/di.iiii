## 2026-10-09 — MOXIR v2 layouts: occlusion analysis, the cut's PAR count, three industrial-depth layouts

- `scripts/place/occlusion_sky.py`: a B380F's whole pan/tilt sky (1200 equal-solid-angle directions) cast against hall
  v9-show-park's 55 728 named triangles + the v1.1 rig boxes + the audience volume (1.9 m + 0.5 m arms over the dance
  floor), for 195 candidate places in the owner's zones; PAR uplights' lit column length and lux on steel (15 and 25 deg).
  Heat rule: at most 2 processes, 1 BLAS thread, waits while the CPU package is above 85 C.
- `scripts/place/cut-count.mjs`: the PARs on the cut by the repo's own rigging maths (stageLineRig + threePointReactions):
  17 lands at 134 kg on the middle pick, 20 exceeds the 146 kg cap; 10 recommended (98.6 kg, every shaft its own piece
  with a 15 or a 25 deg lens, 1 circuit, 1 DMX branch).
- `scripts/place/moxir_v2.py`: three layouts of the fixed kit (18 B380F all on the ground, 50 PL5403 = 10 cut + 40
  ground, 1 smoke): A the nave corridors, B three planes of depth, C long lines from the depth. Each beam aimed by
  search in its sector, its whole beam checked: no ray into the crowd or glass, >= 3 m over every standing level.
  Rig files `scripts/place/rigs/moxir-v2-{corridors,planes,lines}-2026-10-09.json`.
- `epic-build.mjs` now takes a rig file's own cues / title / loop (`cuesOf`).
- Built only into a scratch stack (tree moxir-v2). Never dev, live or the owner's own di.
- Owed: the lasers (6 cubes on the free crane) come from the laser session's table; the haze output of the ONE smoke
  machine is unmeasured; every pen and guard is to the Purple Guide, which nobody here has read (login).
- Seen on the real GPU (24 frames, `~/Downloads/moxir/v2-layouts/`), and fixed because of it: the room drew beams through the
  roof (epic-build `reachOf` now draws a beam to its cast throw); layout C's beams toward the crowd white out the floor view
  (capped at 35 % in every look; still 9.8 % white-out at the peak, measured by `frame_luma.py`); an empty scratch desk drove
  the room (rig files play by their own clock, `showSource: 'clock'`).
- Advice to the owner: layout B (three planes of depth), 10 PARs on the cut. The free crane's laser corridor is feasible
  (53 of 108 straight lines keep >= 3 m everywhere); the cube aims stay the laser session's table, not written yet.
