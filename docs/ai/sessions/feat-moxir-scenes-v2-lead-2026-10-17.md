# feat/moxir-scenes-v2-lead-2026-10-17 — the hall reference, the compare check, a copy project's looks over the show's patch

Session laser (MOXIR lead), 2026-10-17 evening, the show at 22:00.

## What is on the branch
- `scripts/rigbuild/hall-compare.mjs`: before any lamp check, the 3D (a project's document) and the desk's patch are held
  against the hall reference, lamp by lamp (type, universe, address, place within 0.15 m; on the desk: once per address,
  same type, nothing extra). Writes nothing. Exit 0 = EQUAL.
- `scripts/place/rigs/moxir-hall-reference-2026-10-17.json`: the owner's final hall (19:23, set in the Plot of moxir-scenes-v2-0 v272):
  44 DMX lamps, his chart of 18:5x (U1: 13 beams, 16 washes; U2: 5 beams, 7 washes, 2 lasers) + the smoke machine.
- `scripts/rigbuild/show-loop.mjs --rig-project <id>`: a copy project with no patch of its own is valued over another project's
  desk patch (used at 18:2x for the v2 scenes before the owner's own patch existed).
- `docs/moxir/devices/audit-loop.md`: step 0 = the compare, then the re-patch route (unpatch the old project, `--exact` the new).

## Measured
hall-compare on moxir-scenes-v2-0 after the re-patch: 44 = 44 = 44, EQUAL (19:3x).
