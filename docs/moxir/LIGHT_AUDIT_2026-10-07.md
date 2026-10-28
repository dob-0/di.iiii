# MOXIR — recap of the place work, and the light audit (2026-10-07, evening)

Owner's ask, 10-07: "for now the place thing is ok — recap what we did; open the moxir space so I can see every material in one place; do the deep audit; then the light part."
Status of this file: **read-only audit, nothing written to dev or to the installed di.** Numbers are from files on aylmo read today; anything carried from the 10-05 audit and not re-run is marked *(10-05)*.

## 1. What the place work did today (10-07, from the commits)

| Time | Step | Result | Where |
|---|---|---|---|
| 14:50–16:09 | Photo analysis: distinct views, floor occupancy, column count, VGGT multi-view, ultra-wide undistort | column count and right row fixed from photos 953/954; photo 953 fit **not accepted** (3.0 mrad); GD+SAM2 column instances on 024 **failed**, labelled | PR branch `feat/moxir-photo-analysis-2026-10-07`, `docs/moxir/PHOTO_ANALYSIS_2026-10-07.md` |
| 16:06 | The hall from above: OSM, Microsoft ML footprints, two Maxar captures | grid holds; lanterns and end walls corrected (108.2 m long) | `feat/moxir-aerial-2026-10-07`, `docs/moxir/AERIAL_2026-10-07.md` |
| 17:02–18:00 | The space fixed: hall v5 → v8, blower/ducts/hopper behind the bags, prefab cabin out of the show hall, the roller conveyor he marked | hall v8 and v8-show; crane girder 7.95 m **assumed** | PR #822 |
| 18:01–21:09 | The stage on his line (z 24.5 on video 954): DJ on one 0.4 m step, PA ±5.4 m, crane z 21, cut as today, 1.0 m house-left | **MOXIR beta v0.9** (his choice b) | PR #823 |
| 20:52 | Archive of the other copies (his run) | only the beta and the versions list are live on scratch | `archive-versions.mjs` |

**Where each state lives (the honest picture):** dev and the installed di still hold **v0.5** (Known · full, hall of 10-02). v0.6–v0.9 exist **only in the aylmo scratch stack** (`moxir-flip`, data under `~/.cache/di-dev/moxir-flip/data`). PRs #772, #816, #822, #823 are all **OPEN**, none merged. #772 is Emilya's safety fixes.

## 2. Every material, one list

### 2.1 Projects in the space

| Where | Live | Archived | Notes |
|---|---|---|---|
| Installed di (`~/.di/data/spaces/moxir`, 323 MB) | 5: Known · full (public, v0.5), versions, documents, brief, "what it was made of" | 20: the Minimal/Middle/Full families, old-hall copies, the hall | 25 projects |
| Scratch `moxir-flip` (31 MB) | **MOXIR beta v0.9** (127→125 entities), versions list, Open Jam (other space) | 6 copies (flip, stage24, stage-back-flip, hall copies) | the newest model |

### 2.2 Files

| Material | Count / size | Path |
|---|---|---|
| Maker docs, order, patch, sketches, scans, hall history, research | 133 files, 117 MB | project `moxir-documents` |
| Sources — what the model was made from | 49 (48 images + 1 video), 127 MB | project `moxir-sources` |
| The label's brief (story slides + videos, 30 Sep) | 13 (10 images, 3 videos), 15 MB | project `moxir-brief` |
| Venue photos and video | 50 jpg, 1 mov, 1 mp4 — 481 MB | `/mnt/data/footage/moxir-2026-10-17/` |
| Photo analysis (masks, undistort, VGGT runs) | 3.0 GB | `/mnt/data/footage/place-moxir-photo-analysis-2026-10-07/` |
| Meshroom/Colab scan (roof fragment) | 550 MB + 169 MB local | `place-moxir-colab-2026-09-30`, `place-moxir-local` |
| Hall builds | 15 GLB folders, ~3.2 MB each | `/mnt/data/footage/place-moxir-hall-*` |
| Rig / hall / stage records | 58 JSON files | `scripts/place/rigs/` (git) |
| Source list for the 17 Oct show (prices, vendor, status) | 1 CSV | di-atlas `production/source-list-moxir-2026-10-17.csv` |
| Audits | 4 areas, 527 lines | `docs/ai/audits/moxir-2026-10-05/` |
| Versions scheme v0.5 → v1.0 | 1 doc | `docs/moxir/VERSIONS.md` |

## 3. Light audit

### 3.1 What the beta v0.9 holds, counted from its document

| Fixture | In the model | On the source list / order | Match |
|---|---|---|---|
| UP-PL5403 54×3 W PAR | **50** (16 columns, 8 vista, 7 cut curtain, 6 cut X, 4 bridge, 4 neighbour, 3 press cut, 2 press sides) | 50 (Poligraf) | yes |
| UP-B380F 380 W beam | **18** (10 columns, 7 backstage, 1 lighthouse) | 18 | yes |
| LaserCube Ultra MK2 | **6** (cut) | 6 from hosq, price for 6 not quoted | yes, price open |
| UP-YZ31P smoke | **4** | 4 | yes |
| Hazers (EXT-HAZER) | **4** | **6** in the source list; the house list has **no hazer** (low-fog SW3000B and mist 236 exist) | **no — gap** |

Power: 50 × 162 W + 18 × 500 W = **17.1 kW** at datasheet maximum; circuit C6 3200 W > 2944 W *(10-05)*.

### 3.2 What changed for light since the 10-05 audit

- The beta moved the truss: lights on it moved with it; floor lights stayed (stage-line note). **The lights were not redesigned** — that is this step.
- **Backdrop rule bug** (stage-line note): in the stage copies `lookFrame` finds the blower/canopy/duct group (face z 22) as the backdrop, not the press, so the press PARs aim at z 22. Pin the backdrop to the press.
- **0.2 m:** the PONYO copy hangs the cut 0.2 m higher than git derives (clamps 8.0 m inside a 7.95 m girder). The live Known · full probably carries it. Check before the show.
- **Look problems** (his screenshot 21:13, ledger N296): white column beams read as solid white pillars from floor to ceiling, streaks on the floor, columns lit one-sided, pale ceiling slab. Research note and fix branch are **owed — not started** (no commit in `di.iiii-moxirlook` today).

### 3.3 Findings still open from 10-05 (not re-run today) — light and control

| # | Finding | Status today |
|---|---|---|
| B1 | The desk on aylmo does not hold Known · full | **Confirmed again today:** `~/.di/data/lighting/show.json` has 54 fixtures — 14 B380F, 12 250BSW, 8 HK1915, 12 studio, 4 YH600F, 4 YZ31P — and **0 PL5403**; looks are "Roof cathedral, Fan out, Crossfire, All to centre, Curtain" |
| B2 | Desk universes full of other versions' lamps (14 on U2, 40 on U1) | open |
| B3 | Show clock not running (`mappingState.showEpoch` unset) | open *(10-05)* |
| B4 | Nothing on dev drives the six LaserCubes; driver branch parked; Class 4 sign-off a named person | open |
| B5 | DMX channel order of PARs and B380Fs is not from the maker — only the Sevan desk map | open, needs the units or the house's chart |
| B6–B8 | Mover travel while lit at 0 s fade; no scripted laser stop; no manual stop cue | open (safety) |
| W1/W2 | 57 fixtures on one DMX line, 0 spare; order vs rig PAR count stale | open; the plan: U1 512 + U2 176 ch, node not on the house list |
| C1–C7 | 74 real SpotLights; 12 with shadow maps; beam cones ≤ 50 m; Lite and Full draw different pictures; exposure 3.5 with one lamp at 1,004,000 | open; Lite default landed #759 |
| D1–D6 | Known · full had no rebuild path from git (fixed by the rebuild branch, unlanded), maker documents mostly stand-ins, 12 of 30 items have none | partly |

### 3.4 Measured and not measured

- **Measured today:** fixture counts per type in the beta; desk contents; file counts and sizes; PR states.
- **Not measured:** frame time of the beta on the Intel iGPU and on the 3080; real light levels (lux) at the audience; the tape facts for 10-08.
- **Assumed, labelled:** crane girder 7.95 m (near crane), cab bottom 5.85 m, pipe-rack heights at z 24, the house-right anchor window 4.60–4.8 m.

## 4. The light step — proposed order (his order: stage → crane → truss → lights)

1. **Fix the look** (N296): research the established look for haze-lit beams (volumetric light, additive cones with a fall-off, tone mapping), then the renderer causes. Seen on his screen before it counts.
2. **Pin the backdrop rule to the press**, rebuild the looks on beta v0.9, and compare per look (`look-compare.mjs`, `look-probe.mjs`).
3. **Aim the truss lights for the new truss position** (z 21, 1 m house left): footprints per lamp on the floor (`footprints.mjs`), no PAR or beam hitting the DJ's eyes line or the audience unintentionally.
4. **Control:** clear the desk, load Known · full by script with an undo (B1/B2), clock (B3). Desk work waits for the owner's word on the desk, because it is the owner's live rig.
5. **Close the numbers the audit asked for:** hazer count 4 vs 6, power plan (17.1 kW), laser driver and sign-off, DMX maps from the units.
6. **10-08 site tape** feeds the numbers that are assumed above.

## 5. Owed, and by whom

- Merge decisions (his): #772, #816, #822, #823. After that, build v0.9 into dev in place with a backup first (v1.0).
- Tape on 10-08 (listed in the stage-line note).
- Rental house: hazer, node, rated load of the crane, PA prediction.
- Him: confirm the booth moved 0.445 m and the 3 × 2 m level; hazers 4 or 6; which "reflections" (D10); the PAR's real numbers (D4).
