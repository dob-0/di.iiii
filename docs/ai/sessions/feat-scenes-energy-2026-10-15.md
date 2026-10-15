# feat/scenes-energy-2026-10-15 — scenes energy pass (Opus headless, 2026-10-15 06:2x–07:0x)


## What landed
- **What:** `scripts/place/look_energy.py` measures each cue's light in the room and in the air from a project document. It keys lamps as looks.js `namedPositionKey`; a group the look does not name is at full. `scripts/place/scenes_energy.py` sets a scenes file's levels from a designed energy 0..1 (full / mid / low tiers) and never changes a colour. Test: `scripts/place/scenes-energy-py.test.js`, 3/3.
- **MOXIR v2.11:** the rig `scripts/place/rigs/moxir-v2-11-energy-2026-10-15.json` was written to moxir-v2-11 on moxir-one with `epic-build --looks-only`. Laser frames: 36 × 256 before and after. Cues at ≥ 90 % of the v2-7 peak's air term went from 12 to 25 of 50.
- **Open:** the room still looks dark (mean luma 7.4/255 on Blinders against the example's 45.3). Every v2.11 look aims the 18 UP-B380F beams `vertical`; the example fans them 7–37°. Aims are the owner's decision, not built here.
- Report: `~/work/agent-reports-2026-10-15/moxir-50/scenes-energy-report.md`.
- Pitfall: epic-build joins `--rig` onto the repo root, so an absolute path fails (ENOENT); pass it relative.
