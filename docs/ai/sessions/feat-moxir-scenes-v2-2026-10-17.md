# MOXIR scenes v2.0 — the underground loop, every device, measured against the brand (2026-10-17, show day)

**Asks.** Owner 10:4x on the v6 renders: *"it too much white so yes white is good but keep it underground look to lineup and posters and the
mood do the deep analyze"*; *"this white we can take as v1, it good than this colorfull one and make the v2 … use full potential of di.iiii to
write coolest scenes ever"*; *"use all fixed devices now we have all all"*; *"make everything in 3d and in hall exact the same"*.
Lead: Fable (owner 10:5x "give the fabel to lead"); Sonnet builders under it. v1 = project moxir-v2-11 (the v6 data), live in the hall,
never written; checkpoint `moxir-v2-11-checkpoint-2026-10-17` (document v694).

**On hand (read first, no research):** the measured mood analysis (handover 10:2x: posters 99.5 % white share, monochrome; teaser 100 % green
word, 52 % dark; the place red 60 / amber 40, 39 % dark; v6 renders 80 % white share), the v6 generator, the guards, the laser session's
current scenes (v3-palette3+lasers-v5 = identical laser data to the v6 file, RECON.md §3).

## v2.0 = darkness first, white as a strike, the room's rust and the teaser's green; every device plays
- **Concept** (the arc, the palette rules with their numbers, every device's role, the motion vocabulary per act, six signature moments):
  `~/work/agent-reports-2026-10-17/scenes-v2/CONCEPT.md`. Five acts: cold furnace · ignition · the instrument · ash · last furnace; 50 scenes, loop 1254 s.
- **Generator + data:** `docs/moxir/scenes-v2-2026-10-17/scenes_v2.py` (the 50 scenes as data; modelled on scenes_v6.py) →
  `scripts/place/rigs/moxir-scenes-50-v2-0-2026-10-17.json` → `rig_generate.py build` with the v2.11 hang → `scripts/place/rigs/moxir-v2-0-scenes-2026-10-17.json`
  (version 2.20, 67 units, 50 looks, 50 cues). The outside parts (road, entrance) and the lasers (pattern, cubes, level, tempo, phase, pitch,
  lines) are copied scene by scene from the v6 file = the laser session's design; only four laser colours v2 has no place for become green or
  cold white (`LASER_MAP`). The hazer is a part of every scene.
- **Palette:** ash, cold white, ice (≤ 0.3), warm white, amber, dark amber, ember, deep ember, poster green, toxic green (outside), laser green.
  No blue, violet, mint, lavender. Beams only in seen slots: open white 33, warm white 20, green 10, amber 7, red 6, red-orange 5, orange 4 (scene uses).
- **Built into** the NEW private project `moxir-scenes-v2-0` ("MOXIR scenes v2.0 (draft)") on the installed di: a copy of the checkpoint with v2's
  looks + cues (`copy_project.mjs` → `epic-build.mjs --looks-only --apply`). Not loaded on the hall's desk: the owner looks first.

| guard | result | where |
|---|---|---|
| scenes_build.py --check (palette) | 50 scenes, loop 1254 s: ok | this note |
| scenes_flash.cjs | 50 scenes, 0 over 3 flashes a second | this note |
| heads_check.mjs | BUILD.md | agent-reports-2026-10-17/scenes-v2/BUILD.md |
| physics_check.py (no --fix) | BUILD.md | same |
| look-roundtrip.mjs (desk == 3D) | BUILD.md | same |
| cue-wire-check --dry-run (PR #1020's tool) | BUILD.md | same |
| picture_palette.py on the 50 renders vs targets | PICTURES.md | agent-reports-2026-10-17/scenes-v2/PICTURES.md, index.html |

**Not done / owed:** see REPORT.md (the line-up is unknown; the six green "word" moments are where a name goes).
**Sterile:** scratch stack `scenes-v2` down and wiped, lane 3 down, no process of this job left (REPORT.md has the check output).
