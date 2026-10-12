## 2026-10-09 — MOXIR v2: the true look with ONE smoke machine, B tuned for thin haze

Branch `feat/moxir-v2-true-look-2026-10-09` = #848 (v2 layouts) + #849 (physics: one-machine haze, no cutoff) +
#850 (measurement mode), merged at dc03510f, then this work on top. Scratch only (tree stack `moxir-v2-true`, seeded
from the `moxir-v2` scratch copy); never dev, live or the owner's own di.

What was found, and fixed or written down:
- **The room opens in Lite** (owner 10-08 default), where only `OUTPUT_POOL_SLOTS` = 4 lamps are real lights: no PAR
  lights any steel there. Every true-look frame is `?quality=full` (68 real lamps, shadows). The 10-09 v2 frames
  did not say which quality they were.
- **The 40-min "tank" state could not be drawn**: the fog's drying (`HAZE_KINDS['smoke-machine'].dryTau_min` 1.5 min)
  was fixed, so the hall settled at ~2.7e-4 /m at any time. `renderSettings.atmosphere.haze.dries: false` now drops
  it for a room (hazeField.js + both schemas).
- **epic-build drew the v2 rooms the old way**: lamps had a cutoff (`distance` = throw); the smoke machine was always
  turned to +Z whatever the rig file said; the air was always v1.0's uniform 0.0169 /m. Now: distance 0 +
  `beam.length`, the rig file's `r` for the machine, the rig file's own `atmosphere` when it has one.
- **B's smoke machine blew toward the stage, not "into the depth"** as its file said (r [0,0,0] is +Z).

The pictures: `~/Downloads/moxir/v2-true/` (index.html, contact-sheet.png, 40 frames, frame-luma.json, tunes.json).
Measurement mode at **EV100 2.84 fixed** (the room's own camera; MEASUREMENT_MODE.md), Full, bounce kept. States: old
0.0169 /m; one machine, closed hall, not drying, at 10 min (~0.0024 /m) and 40 min (~0.0086 /m); the kit's own
assumptions (~0.00027 /m, the floor of the range).

B tuned (`scripts/place/rigs/moxir-v2-planes-tuned-2026-10-09.json`, one commit per tune, `moxir_v2_true.py tune
--upto T#`): T1 pre-haze 40 min, hall closed; T2 the machine under the plane-1 row (1.0 m pitch) blowing through it;
T3 plane-1 aims leaning toward the floor (forward scatter, every v2 safety rule kept); T4 three halo PARs graze the
columns that frame the stage; T5 look levels (dark: columns 0.5, stage columns 0.6; peak: plane 3 0.35 → 0.7 under
the old glare budget); T6 the 15° PAR lens and open B380F beams required.

Owed: lasers (the laser session's `aerial-far-crane.json` did not exist; nothing invented); the haze measured on site
(decay test + transmissometer); guard cages for the two floor PARs at z 6; the venue's OK for the PAR on the machine
line; the rental's PAR lens; the floor model's mirror-like beam streaks; the owner's look at the page.
