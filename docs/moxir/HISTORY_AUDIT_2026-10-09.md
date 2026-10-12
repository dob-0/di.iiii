# MOXIR — the history audit: from day 1 to 2026-10-09

Asked by the owner, 2026-10-09: *"look from the 1st day we started to work on moxir, collect all info — how we started, what we used — the deepest audit, to show everything we have."*
Status: **read-only collection.** Nothing was changed in dev, the installed di or the model. Numbers are counted from git, the ledger, the PR list and the disk on 2026-10-09; anything taken from a note and not re-counted is marked *(note)*. No supplier prices are in this file (the repo is public).
Words follow `docs/ai/vocabulary.md`: **place** = the real hall, **space** `moxir` = its twin in di.iiii, **project** = one thing made in the space, **scene** = the 3D hall, **object** = one lamp or item.

---

## 0 · Answers first

1. **Day 1 is 2026-09-21.** The first MOXIR commit is `1e7e56ea` ("the room arrives on di.iiii") and PR #531 (*The place copy: footage of a hall becomes a room you can walk*) opened the same day. The show is Friday **17 Oct 2026**. So the work is **19 days old** today, **8 days** from the show.
2. **It started as a tool, not a design.** The first ask was a pipeline: photos/video of a venue → a 3D copy inside a space → hang lights in it before the get-in. MOXIR was the first job that pipeline ran on.
3. **The pipeline did not give a hall.** The first mesh (Colab + Meshroom, then the same on the local RTX 3080) was *a smeared roof-and-truss fragment, no floor, scale a guess*. The owner (09-22): *"it's not what I want, but for now ok."* The real hall came from **a different method**: a hand-built parametric model (`hall.py`, Blender) fitted to photos, VGGT depth, perspective fits, and later two satellite captures.
4. **What exists today** (counted): 254 commits that mention MOXIR (189 by the owner's account, 64 by Emilya's fork, 1 by the agent account); 174 commits touch `scripts/place/`; 85 files in `scripts/place/`; 67 rig/hall/stage records in `scripts/place/rigs/`; **73 PRs** that mention MOXIR (40 merged, 16 closed, 17 open); 19 hall build folders on disk; 23 labelled backups in `~/di-backups/`; 133 documents + 49 sources + 13 brief files inside the space.
5. **Where the model stands:** dev and the installed di hold **v1.0** (PR #839 merged 10-08 18:42Z) and the place part of **v1.1** (PR #840 merged 10-08 20:51Z). **Not done:** the stage is not yet moved to the owner's new marks (part 2 of v1.1), and **nothing is MEASURED** — the 10-08 visit gave photos and video only, no tape or laser reading.
6. **Biggest honest gap:** the design is far ahead of the facts. The near crane was found at **z ≈ 42.5**, not the z 4.8 or z 21 the design assumes; the show's laser stop, truss and cut all depend on that crane. Plan B (a goal-post truss) exists on paper only.

---

## 1 · How it started (09-21 → 09-22)

| When | What | Evidence |
|---|---|---|
| 09-21 | Two XR tools wanted: (1) venue photos/video → a 3D copy in a space → hang and simulate lights; (2) a projector "Test mode" (camera + structured light + segmentation). Plan approved the same day. The projector was not on hand, so tool 2 **waited**; the day was simulation + 3D spaces. | memory `project_dii_moxir_place`; `~/.claude/plans/look-what-i-want-unified-fern.md` |
| 09-21 | *"We have no Polycam this time"* → the mesh must come from footage via **Colab** (Pro+, Meshroom 2025.1.0 CUDA build), not a phone scan. | same |
| 09-21 | Three lanes cut from dev #523: **P** place pipeline (`scripts/place/`: frames → colab-job → crush → fit → import), **L** lights on a place (spot pan/tilt, `components.beam`, shadows), **S** phone scan (added 09-22). | PRs #530, #531, #533; landed together as **#534** on 09-22 |
| 09-21 | Footage arrives through **di.bo** (the Telegram bot) from the owner and Emilya; Bot API caps downloads at 20 MB, so photos by bot, videos by Google Drive (`drivemount`). Later opened a large-file door (`fetch-large.py`). Drop folder `/mnt/data/footage/moxir-2026-10-17/`. | memory |
| 09-22 | First real import walked into two traps; the pipeline learned to give up when Colab loses the session, to send frames a reconstruction can hold, and to survive one bad JPEG. | commits 145c70d5 … beafae06 |
| 09-22 | **Platform scanning started** ("we need to all"): the capture page `/<space>/scan`, a guided walk, a ring of *directions covered*. Seen on a Playwright phone only; **never on a real phone**. A pre-land review found 4 defects, 3 survived verification and were fixed before landing. | PR #533/#534 |
| 09-22 | Local Meshroom proven: the same 67 frames, the same roof fragment, 10 min on the 3080 (25 on the Colab L4) → **the footage is the limit, not the tool.** | `~/tools/meshroom/current` |

Scale anchor then: one measured distance, otherwise a 2.1 m door **guess**, labelled. The first pin (Instagram bio) **hit no building**; the owner gave the real pin 09-28 (40.406524, 44.636560; OSM way 289841504).

---

## 2 · Day by day (commits mentioning MOXIR, from git)

| Day | Commits | What happened |
|---|---|---|
| 09-21 | 1 | place pipeline lands as PR; one command `place.mjs --from <dir> --name <space> --scale-edge <m>` |
| 09-22 | 5 | Colab hardening; phone scan; batch land #534; install `0.4.15-place.1` |
| 09-23 → 09-27 | – | gap in MOXIR commits (other work: Hayfilm/NOPA, desk) |
| **09-28** | **32** | **The big build day.** Hall rebuilt as a parametric model (VGGT dims: span 24 × pitch 6) → hall v2 (flat space frame, the owner's zones: red backstage / green stage / blue dance floor) → DJ place, centred. Fixtures identified and modelled (UPlight codes), 5 looks, the **rig-builder line**: patch sheet, power sheet, MVR 1.6 + GDTF 1.2 export validated against the XSDs, plot at true scale, "cards" (rental list as data), equipment as a game inventory, versions Minimal / Middle / Full. Preview `0.4.16-rigbuilder.2` installed. |
| 09-29 | 26 | The crane: the lights hang from the overhead crane, "the cut" (one straight 12 m diagonal), the halo, the X lying down; beams in haze as light (#660); smart view; show patch planned on 4 universes; crane heights measured by single-view metrology |
| 09-30 | 25 | Real scenes (9 Minimal / 11 Full), movers on the ground, statics on the truss, light footprints per device, square-controls rule, "make MOXIR work in the cloud" (= Claude cloud routines), install `.10`–`.13` |
| 10-01 | 55 | Work light (the room read too dark), handover to Emilya's PC (PONYO), dev `/moxir` found **black** → 3 fixes (#713 camera-controls frozen preset, #714 WebGL retry with `default`, #715), merged on the owner's word |
| 10-02 | 11 | Emilya's area-realism line (#739, 105 commits); haze/beam fall-off (#716); hall photos requested for heights |
| 10-03 | 4 | #743 lands PONYO's line; dev = newest; dev `/moxir` black again on the studio → install `.15` |
| 10-04 | 7 | Split decided (aylmo = code + dev data, PONYO = Known rooms); **"all MOXIR things in the moxir space"** (inventory); 12 original X-T5 photos added to `moxir-sources`; version control problem named; **edit MOXIR on dev only** (stopgap, di-atlas #36); lasercube branch (#754); "keep the others as concept, concentrate on the new setup" → **Known · full** |
| 10-05 | 13 | Deep audit A–D (22 findings, B1–B8 control, W1–W2, C1–C7, D1–D6); Emilya's safety fixes (#772: measured crane 7.95 / rail 8.1); fixtures from the vendor without lasers + 6 cubes; gear and rental list page; public-repo price leak found and closed (#775) |
| 10-06 | 0 | Claude account switch day; no MOXIR commits |
| **10-07** | **39** | **ONE version** ("too many versions, not synced"): 20 projects archived + private on dev and local. Photo analysis, aerial survey (OSM, Microsoft ML footprints, two Maxar captures), the space fixed (hall v5 → v8), the stage on his green line (z 24.5), the cut kept low house-left and **hung behind the DJ** (crane z 21, 1 m left) = **MOXIR beta v0.9**. Venue protocol + process audit (di-atlas #56). The flip misread undone. |
| **10-08** | **30** | Site visit day; blocking audit, the owner's painted plan, **lasers v2**, the **epic placement** (7 advices accepted), Fable's independent review (5 blockers, 10 majors), `MOXIR.md` as THE source, **v1.0** built and room-fixed, #839 merged; photos from the visit → hall v9 → #840 merged; short names carried by the follow (#835) |
| 10-09 | 6 | Overview page rebuilt for v1.0 (#842, open), pushed to the space as private project `moxir-overview`; the follow's overwrite bug found |

Not in the table (no commit that day but work happened): the 10-05 → 10-06 sync-key rotation, the dev-router (`diiii.localhost`, di-atlas #57, 10-08).

---

## 3 · What we used

### 3.1 Method and measurement (name the source)

| Job | Method / tool | Source / licence | Result and limit |
|---|---|---|---|
| Frames from video | `frames.mjs` (sharpness-selected), `frame-stats.py` | own, AGPL | 67 frames → first scan |
| Photo → 3D (first try) | **Meshroom 2025.1.0** (AliceVision), Colab L4 and local RTX 3080 | MPL-2.0 | roof fragment, no floor, no scale — rejected as the hall |
| Depth / layout from photos | **VGGT-1B** (`~/tools/vggt`), bf16 in 8 GB | Meta; **weights CC BY-NC** — commercial checkpoint gated | span 24 × pitch 6 (span/pitch 3.96 → GOST 23838-89), heights ±; 55 frames |
| Perspective fits | own `photo_project.py`, `fit_plane.py`, `crane_height.py` (single-view metrology) | own | rms 3 px on photo 032; photo 953 fit **rejected** (3.0 mrad) |
| Segmentation | SAM2, GroundingDINO (`~/tools/photo-analysis`) | Apache-2.0 | floor/fixed/movable masks OK; **column instances on 024 FAILED**, labelled |
| Ultra-wide undistort | own | – | used for the 10-07 frames |
| EXIF / sun check | `photo_meta.py` (EXIF, GPS, NOAA solar position) | NOAA algorithm | sun check confirms NE/SW, axis 144° ±6°; GPS indoors 13–25 m off, altitude inverted; 027–035 Telegram-stripped |
| Hall size from above | OSM way 289841504; **Microsoft ML building footprints**; **Maxar 2020 + 2024** captures (`aerial_measure.py`) | ODbL; MS ML footprints ODbL; Maxar imagery **rights unchecked for publishing** | 108.2 m × 97.3 m roof, 4 × 24.0 ±0.3 spans, 18 × 6.0 ±0.4 bays; two captures agree to 0.1 m |
| Hall model | `hall.py` (Blender, from dims JSON chain), `hall-show.mjs`, `obj-to-glb.py` | own, AGPL | flat double-layer space frame, 3 m module, Y-headed columns; 19 build folders on disk |
| Fixtures | own Blender models (`scripts/place/fixtures/`), `fixtures-glb.mjs` | own. **GDTF Share forbids derivative/commercial use (§9) → not used for bodies** | UP-B380F / 250BSW / HK1915 / PL5403 confirmed (pro-uplight.com); UP-LA40WF / Q108S / YH600F / YZ31P are rental-house labels modelled on named equivalents |
| Show data | **MVR 1.6** + **GDTF 1.2** authored per type, validated against the published XSDs | DIN SPEC 15800 / VDE | exports work; real DMX channel orders still unknown for PL5403 / B380F |
| Photometry | candela from datasheet lux/lumens; one exposure; footprints per lamp (`footprints.mjs`) | datasheets | not measured on site |
| Sightlines, occlusion | `occlusion.py` — every beam cast against the hall's ~55 000 triangles | own | lasers v2: 12/12 lines pass, ≥ 0.59° margin |
| Laser safety | IEC 60825-1:2014, IEC TR 60825-3, HSE HS(G)95, ANSI Z136.10, ILDA, the maker's guide | published standards | NOHD 724 m (10 W), 544 m (6 W); separation is the control; **permission per the owner; issuer, copy and named operator owed** |
| Rigging | ANSI E1.21 method, bridles ≤ 120°, safety steels, tie-offs | published | crane SWL, inspection record, venue consent **owed** |
| Crowd | Green/Purple Guide method (2 persons/m², 82 persons/min/m exit) | published | capacity and exits **not in any file**; the promoter's safety lead owes them |
| Review | independent model review (Fable) + adversarial verification of code findings | – | 5 blockers, 10 majors; blockers carried into v1.0 |

### 3.2 Software built in the platform for it

- **Place pipeline** (`scripts/place/`, 85 files): frames, Colab job, local Meshroom, fit, import, `--from-space`.
- **Rig builder** (`scripts/rigbuild/`, `/{space}/…` views): *build* (first-person), *plot* (printed at scale), *cards* (rental list as data), *patch* and *power* sheets, *equipment*, *versions*, the *cue loop*, MVR/GDTF export.
- **Viewer / light:** lamps as real spots (`components.beam`, `beam.only` for the hundreds), haze field, beam fall-off, bloom, smart view (occlusion fade, cutaways, six presets, x-ray), visualiser (desk beside the room, driven by DMX), show clock, work light, LTP cue layer.
- **Space tooling:** `copy-version`, `archive-versions.mjs`, `add-sources.mjs`, `tier-sync`, `page-push`, the **follow** (`di follow`) with short names carried since #835.
- **Pages:** the overview (3D, react-three-fiber), the survey for the phone (28 shots), the one-page `MOXIR-v1.html`, the gear page, 12 social cards (cleared).

### 3.3 Machines and services

| Thing | Role |
|---|---|
| **aylmo** (owner's PC, RTX 3080) | main work, local Meshroom, VGGT, real-GPU renders (60 fps on the 3080; **14–18 fps on the Intel iGPU in the Flatpak browser**) |
| **PONYO** (Emilya's PC) | the "Known" rooms, real-GPU looks, her fork PRs (#704–#712, #739, #772) |
| **dev.diiii.xyz** | the team hub; since 10-04 MOXIR is **edited on dev only** (stopgap) |
| Google Colab Pro+ (`colab` CLI, `colab-mcp`) | first scans; the $250 Claude-cloud credit was for routines, not Colab |
| di.bo (Telegram) | media from the owner and Emilya; sha256-checked pull every 15 min to `/mnt/data/footage/inbox/` |
| Rental house quote (xlsx), vendor lists, source list CSV | the real inventory; **prices must stay out of anything public** (#775) |
| Claude sessions | many: place, rigbuild, light, render, landing, overview; cloud routines for reviews |

---

## 4 · What we hold (counted 10-09)

### 4.1 In the space `moxir` (installed di; dev follows)

| Group | Count |
|---|---|
| Live projects | 5 + the new overview page (private) |
| Archived projects | 20 (nothing deleted; undo `~/di-backups/moxir-one-version-2026-10-07/`) |
| Documents (maker PDFs, order, patch, sketches, scans, hall history) | 133 files, 117 MB |
| Sources (what the model was made from) | 49 (48 images + 1 video), 127 MB |
| Label's brief (story slides + videos, 30 Sep) | 13 files, 15 MB |

### 4.2 On disk

| What | Where | Size |
|---|---|---|
| Venue photos + video (09-26 shoot, Emilya's, owner's) | `/mnt/data/footage/moxir-2026-10-17/` | 52 files, 481 MB |
| 10-08 site visit (photos, 4K video keyframes) | `/mnt/data/footage/moxir-site-2026-10-08/`, report `~/Downloads/moxir/site-2026-10-08/REPORT.md` | 26 exported frames + sheets (people blurred) |
| Photo analysis (masks, undistort, VGGT) | `/mnt/data/footage/place-moxir-photo-analysis-2026-10-07/` | 3.0 GB |
| Scan fragments | `place-moxir-colab-2026-09-30`, `place-moxir-local` | 550 MB + 169 MB |
| Hall builds | `/mnt/data/footage/place-moxir-hall*` | 19 folders, v1 → v9-show |
| Rig / hall / stage records | `scripts/place/rigs/` (git) | 67 files |
| Working pictures and pages | `~/Downloads/moxir/` and 28 sibling `moxir-*` folders | 387 MB in the main folder |
| Backups | `~/di-backups/moxir-*` | 23 folders (before-hall, before-arch, before-dj, before-centre, beta, one-version, slugs, v1-0, v1-1 …) |
| Worktrees | `~/work/di.iiii-moxir-*`, `di-atlas-moxir-*` | 25 siblings, several with uncommitted edits (other sessions') |

### 4.3 In git (dob-0/di.iiii, public)

**PRs that mention MOXIR: 73 → 40 merged, 16 closed (mostly superseded stacks like #594–#624, folded into #637), 17 open.** Landmarks:

| PR | Date | What |
|---|---|---|
| #531 / #533 / #534 | 09-21/22 | place pipeline, phone scan, batch land |
| #637 | 09-28 | the rig-builder line on dev |
| #660–#667 | 09-29 | beams in haze, halo, X lying down, the cut, smart view, LTP |
| #679 | 09-30 | MOXIR rig-builder line onto dev |
| #699, #712, #716 | 10-01 | work light, Known · full, haze/bloom |
| #713–#715 | 10-01 | dev's black 3D rooms fixed |
| #739 → #743 | 10-02/03 | Emilya's area-realism line lands |
| #754, #756, #761, #772, #775 | 10-04 | lasercube, one version list, picture settings, safety fixes, no prices in a public repo |
| #816, #822 | 10-07 | one show version; the space fixed (aerial + photos) |
| #829/#830 | 10-07 | batches of waiting fix and feature PRs |
| #835 | 10-08 | follow carries short names |
| **#839** | 10-08 | **MOXIR v1.0** — hall v8, stage line, lights + lasers |
| **#840** | 10-08 | **v1.1 part 1** — the place from the 10-08 photos |
| Open | – | #644 visualiser, #659/#665 patch plans, #755, #766–#767 desk plan and git-built Known · full, #776 laser raw, #808/#810/#812 agent runbook/door/XR cycle, #825 local address, #837 (still OPEN, CONFLICTING; its content landed as #839 — close it), #838 phone UI, #841 show page, **#842 overview page** |

Open PRs older than a week with no recorded owner decision: #644, #659, #665, #755, #766, #767, #776 — listed in OPEN_THREADS; **each needs the owner's keep/close**.

### 4.4 In di-atlas (private notes, process)

Venue protocol (12 stages, #56) and `AUDIT_MOXIR_2026-10-07.md` (9 failure classes; ~11 of 17 days avoidable, **suspected**), the gear and source-list pages, `production/source-list-moxir-2026-10-17.csv`, the edit-on-dev decision (#36).

---

## 5 · Version lineage

| Version | Date | What | Where now |
|---|---|---|---|
| Minimal / Middle / Full families | 09-28 → 10-04 | three rigs; the 09-29 cut/halo/X variants; ground variants | archived (20 projects) |
| **v0.5 Known · full** | 10-04/05 | the show version of that week: 10-02 hall, crane z 4.8 | superseded; archived copy |
| v0.6 | 10-07 | the space fixed (hall v5) | archived |
| v0.7 | 10-07 | metal around the bags (hall v6 → v8) | archived |
| v0.8 / v0.8-x | 10-07 | stage on his line, crane z 24; flipped cut **rejected** | archived |
| **v0.9 MOXIR beta** | 10-07 | cut not flipped, behind the DJ, crane z 21, 1 m left | scratch + `beta-v0-9` |
| **v1.0** | 10-08 | beta + epic lights (elite + minimal), lasers v2 onto one ash wall, PA by class, smoke-only haze, ≤ 30 kW cap | dev + installed (`v1-0`) |
| **v1.1 (part 1)** | 10-08 | v1.0 + hall v9 from the visit's photos (near crane z 42.5, pendants, side gallery) | dev (#840) |
| v1.1 (part 2) | owed | the stage on the new marks; crane vs plan B | **not started** |
| v1.2 | 10-18 | as built | owed |

---

## 6 · What went wrong (so it is not repeated)

| # | What | Cause | Fixed? |
|---|---|---|---|
| 1 | First scan useless as a hall | footage (fast pan, people), not the tool | worked around by the parametric model; **a slow walk was never redone** |
| 2 | Hall architecture wrong (pitched trusses assumed) | photos misread; corrected 09-28 → flat space frame | yes, v2+ |
| 3 | Lamp light too dark; room "porthole" | ambient 0, 82 of 90 lamps beam-only; fog far 32 m | work light #699; fog fixed |
| 4 | Dev `/moxir` **black** (10-01, again 10-03) | camera-controls frozen preset; `high-performance` WebGL refused | #713/#714; the same trap cost the overview page again on 10-09 |
| 5 | Too many versions, not synced | 20+ copies across aylmo, PONYO, dev | one version rule 10-07; follow; edit-on-dev stopgap |
| 6 | The truss "flip" misread | a text menu, not his drawing; undone | his pink line settled it (cut NOT flipped) |
| 7 | Supplier prices in a public repo | rental JSON committed | #775; history not rewritten (**check**) |
| 8 | Desk on aylmo does not hold Known · full | the desk is the owner's live rig; never loaded | **open** (B1/B2/B3) |
| 9 | Follow overwrote new local pages | converge replaced a fresh page with dev's empty copy | found 10-09, **fix owed** |
| 10 | Many freezes / crashes on aylmo (10-07: 4 frozen boots) | heat, wifi/GPU hypotheses — not closed | diagnose-wide thread, **open** |
| 11 | Headless SwiftShader render froze aylmo (09-28) | software GL | `rig-look.mjs` refuses software GL |
| 12 | Photo analysis claims overreached | column count and 953 fit | gates added; failures labelled |

---

## 7 · Provenance, rights and consent (not yet cleared)

| Item | State |
|---|---|
| Venue photos and video (owner, Emilya, 09-26, 10-08) | made by the team; **people in 10-08 frames blurred**; **venue consent to publish: not asked** |
| Instagram / bio pin | used only to find the place; **not a source of record** |
| OSM, Microsoft ML footprints | ODbL — attribution owed on any published page |
| Maxar captures | **licence for derived measurements/publication unchecked** |
| VGGT weights | CC BY-NC — commercial use gated; measurements only, never shipped |
| GDTF Share fixture files | not used (licence forbids); our own models |
| Maker documents / datasheets | many are **stand-ins**; 12 of 30 items have none *(10-05 audit)* |
| Laser permission | per the owner; issuer, copy, named operator **owed** |
| Overview page | private; photos and analysis images **left out** until the rights check |
| Case cards (12) | cleared for social; Armenian captions owed to a native speaker |

---

## 8 · Owed — ranked

1. **The near crane:** seen at z ≈ 42.5 on 10-08 — the design assumes z 21 (or 4.8). Decide crane vs Plan B1 with the rental house and the venue (rating plate, inspection record, who operates it). **Blocks the truss, the laser stop and the stage.**
2. **Tape numbers.** Everything is ESTIMATED from photos; v1.1 part 2 needs the stage moved to the owner's new marks.
3. **Power:** no 380 V board seen; the ≤ 30 kW cap rests on an unseen supply.
4. **Lasers:** cube labels (6 W or 10 W), the named operator and a kill switch, the permit copy; no driver on dev (parked branch #754/#776).
5. **Control:** desk holds the wrong show (B1/B2), show clock off (B3), DMX channel orders of PL5403 / B380F unknown (needs a fixture test day).
6. **Crowd and site safety:** capacity, exits, stewards, first aid, the bags' contents.
7. **Hazers:** the owner chose smoke only; the haze density estimate is 40× apart between two models (0.017 vs 0.0004 /m) — measure on the night.
8. **Housekeeping:** 7 old open PRs need keep/close; 25 worktrees with unpushed edits belong to other sessions; the follow overwrite bug; dev-router unit edit into the install step; the aylmo freezes.
9. **Rights check** (section 7) before partners see media.

---

## 9 · Where to read more

| What | Where |
|---|---|
| The one source for the design | `docs/moxir/MOXIR.md` |
| Photo analysis · aerial · light audit · build rehearsal | `docs/moxir/{PHOTO_ANALYSIS,AERIAL,LIGHT_AUDIT,BUILD_REHEARSAL}_2026-10-07.md` |
| 10-08 site visit | `~/Downloads/moxir/site-2026-10-08/REPORT.md` |
| Version scheme | `docs/moxir/VERSIONS.md` |
| Everything the owner said | `~/work/OWNER_REQUESTS_2026-09-30.md` (MOXIR rows N205 → N334 and the earlier ones) |
| History notes | memory `project_dii_moxir_place.md`, `project_venue_to_rig_workflow.md` |
| Process audit | di-atlas `production/venue-protocol/AUDIT_MOXIR_2026-10-07.md` (PR #56) |
| The 10-05 audit | `docs/moxir-audit-2026-10-05` (branch) |

**Method note.** Counts come from `git log --all --grep=moxir`, `gh pr list --search moxir`, `ls`, and the ledger on 2026-10-09. The grep misses commits that do not say "moxir" in the message, so the real commit count is **at least** 254. Dates before 09-21 were searched (git, ledger, memory) and none were found.
