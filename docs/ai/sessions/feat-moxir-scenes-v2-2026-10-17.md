# MOXIR scenes v2.1 — the techno loop: gamut colours, strobes, rides and scans, every device (2026-10-17, show day)

**Asks.** Owner 10:4x on the v6 renders (= v1, live in the hall): *"too much white … keep it underground, look to line-up, posters and the mood"*; *"make the v2 …
use full potential of di.iiii"*; *"use all fixed devices"*. 11:2x: *"hall and real 3d exact same … not many bright, use the contrast of the dark and bright …
keep colors techno, we have color gamut so use that … beams full power, skip the gobos"*. 12:0x: *"strobes is good and cool crazy movements rides scans, yes
lineup right, washes colourful that I can see"*; 40 W: *"what we have from 40w is enough"*. Lead: Fable (owner 10:5x), under the MOXIR lead (session laser from 11:1x).
Rules: `~/work/agent-reports-2026-10-17/lead/LEAD-BRIEF-addendum.md` (section (g) wins). v1 = moxir-v2-11, never written.

**On hand (read first, no research):** the measured mood analysis (handover 10:2x), the v6 generator and guards, the laser session's current scenes (identical laser
data in the v6 file), the lead's audit (devices, coverage, references), the 18 position ops for the copy (`lead/scenes/unposed-ops-for-v2-copy.json`).

## v2.1 = one colour family per scene in the techno gamut, beams at full power, strobes and rides, every wash lit; holds = v1
- **Generator + data:** `docs/moxir/scenes-v2-2026-10-17/scenes_v2.py` (the 50 scenes as data, rules as asserts: beams 0 or ≥ 0.95; washes only `#ff0000`
  `#00ff00` `#ffffff`; one colour family (+ white ≤ 0.1); strobes white only; sparkle ≤ 20 bpm; glitch banned (16 flashes/s measured); head periods whole bars
  at 132 bpm, tilt 15–25°, no pan-only pattern; left ≠ right and beams in `motion.kinds` in acts 2/3/5; each scene differs from both neighbours in ≥ 2 of 6
  carriers; hold_s = v6 scene k, Σ 1116 s) → `scripts/place/rigs/moxir-scenes-50-v2-0-2026-10-17.json` (`v2.1-techno-2026-10-17`) →
  `rig_generate.py build` + hang v2.11 → `scripts/place/rigs/moxir-v2-0-scenes-2026-10-17.json` (2.21, 67 units, 50 looks, 50 cues).
- **Every device:** 40 washes (incl. the 18 floor washes, lit in 48 scenes each) · 18 beams in seen slots (lit in 43 scenes, moving in 38: rides = circle/figure8,
  pan 120–150°, tilt 25°, 2–8 bars; scans = 1 bar) · cubes = the laser session's design per scene, colours theirs · 40 W lines under `laser40`, a layer off unless
  `--laser40 on` · the haze part dropped (it reaches no unit). Line-up as act names: Cloistral · Innersha · Kerrie · Éléktra b2b Kogeno · Mixtinct.
- **Into the copy** `moxir-scenes-v2-0` (installed di, private): the 18 position ops at v104 → v122, then `epic-build.mjs --looks-only --apply` → **v225**
  (51 looks, 50 cues). Through a loopback proxy (epic-build refuses `*.localhost`; owed: a `--host` flag). Not loaded on the hall's desk: the lead's job.
- `scripts/place/copy_project.mjs --assets-from <project>` (one line, build agent): a checkpoint's document points at its parent's assets. Test owed.

| guard | result |
|---|---|
| `scenes_build.py --check` | 50 scenes, loop 1269 s: ok |
| `scenes_flash.cjs` | 50 scenes, 0 over 3 flashes a second |
| `heads_check.mjs` (installed copy, v225) | 38 looks with heads, 0 turn their beams less than 3° |
| `physics_check.py` (scratch copy, same looks) | 97 beams, 0 leaks (3 hall files) |
| `look-roundtrip.mjs` | not proven: the scratch desk carried no rig for the project (planes-37 has no address → no exact patch); run after the lead's load |
| generator numbers | bright time 0.89 (addendum ≤ 0.20 overridden by 12:0x "washes colourful in every scene"), beams full in 43, equal neighbours 0 |

**Not done / owed:** pictures and the review page (18:00 brief: none; `plan.json`, `front.html`, `meta.json` ready); look-roundtrip on the loaded desk;
cue-wire-check in dry run against v2 on the desk; a hang part for the 40 W; the dev-router sends `scenes-v2.diiii.localhost/serverXR` to another stack's API
(di-atlas); `di-dev` has no prune (68 dead registry rows blocked every port; pruned by hand, backup kept). Full record:
`~/work/agent-reports-2026-10-17/scenes-v2/` (CONCEPT.md, RECON.md, BUILD.md, READY.md, REPORT.md).
**Sterile:** scratch stack `scenes-v2` down and wiped, lane 3 down, loopback proxy stopped, the build agent's esbuild stopped; `scenes-v5` is another session's.
