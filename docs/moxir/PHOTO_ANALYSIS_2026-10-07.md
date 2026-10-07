# MOXIR: what the photos say about the floor and the columns (2026-10-07)

**Asked.** The owner, 2026-10-07:
- *"I think the dance floor is in the wrong place — speakers will be there, by the static things… analyse the photos for segmentation and depth… and I think the columns are not right too."*
- Then: *"no, there are more columns than you count"*
- Then: *"analyse more photos, not the duplicate parts"*

**Scope.** This is read-only against the model. The hall code and the rig are not changed. The new layer is
`scripts/place/rigs/moxir-hall-features-2026-10-07-photos.json`. hall.py does not read its keys yet.
The model checked is `moxir-hall-2026-10-02-crane-dj.hall.json` on `feat/moxir-truss-flip-2026-10-07`. That file is not on `dev`, so it is read from that branch.

**Tags.** **CONFIRMED** means it was measured or seen, with the photo and the pixel or mask given. **SUSPECTED** means it is inferred, seen only by eye, or the method cannot decide it.
**Hall frame:** metres. x runs across the hall (+x = house right). y is up. z runs along the hall: 0 is the expansion joint and +z is toward the entry door.

**Images for the owner.** These are in `~/Downloads/moxir/photo-analysis/`:
- `columns-032-extra.png`: the numbered column candidates.
- `032-model-on-photo.png`, `024-model-on-photo.png`: the model's columns, zones and massing drawn on the photo. Neighbour rows x ±36 are drawn in green.
- `032-masks.png`, `024-masks.png`, `004-masks.png`, `021-masks.png`, `858-masks.png`: what the segmentation calls floor, fixed, movable, wall and column.
- `847-marks-model-recommended.png`: the owner's own marks with the model's dance floor, the recommended one and the speakers.
- `plan-occupancy.png`: the top view.

## 0. Answers first

1. **Columns: COUNT.** The photos show **no confirmed column that the model lacks** on the two main rows between z 4 and z 36.
   - In photo 032, the vertical-edge scan finds 47 candidates along the four rows: 26 on a model grid line and 21 off it.
   - Most of the off-grid ones are a **property of the scan**, not extra columns. At 20–35 m one column's two vertical edges are 2–3.5 m apart along the row line, because the 0.8 m face is seen nearly edge-on (Δz ≈ 0.8·D/10.3).
   - So each real column gives **two peaks about 3 m apart**. On the left row (x −12) the peaks pair up as
     (4.65, 8.25), (10.8, 14.1), (16.7, 19.95), (23.35, 26.35), (29.7) → pair centres **6.45, 12.45, 18.3, 24.85, 29.7**.
     That is the 6 m grid, offset +0.3…+0.85 m. CONFIRMED (`analysis.json` `column_scan_032`; boxes 13–21 in `columns-032-extra.png`).
   - Three things can still give "more columns than the model" and are owed to the site check:
     - (a) **Box 39, right row, z ≈ 32.1** (photo 032, u ≈ 1040–1060 px, v 260–470): a full-height vertical between the grid lines z 30 and z 36, by the stair to the runway. It is a stair post, a runway support or an intermediate column. **SUSPECTED extra.**
     - (b) **The neighbour rows x ±36 are visible through the main rows.** The model has them (`rows_x_m` −36, 36, 60), but the first overlays I made drew only x ±12. That under-drew what the photos show. Fixed now: the green columns in the overlays.
     - (c) **The outer walls have slender wall posts between the windows** (photos 014, 015, 038). hall.py draws window bands but no wall posts. **SUSPECTED, not modelled.**
   - **Grid the photos support:**
     - Main rows at x ±12, span 24.0 m. Measured 24.06 m from the pair of columns at z 36 in 032: left at x −12.49, right at x +11.57. Both are shifted by −0.45 m, which is a camera-x error and does not change the span. CONFIRMED ±0.3 m.
     - Pitch 6 m on both main rows from z 4 to z 36. Right row green peaks: 7.05, 10.75/12.65, 17.8, 24.55, 28.6, 35.35. CONFIRMED ±0.9 m on the left row. Right row: SUSPECTED ±1.4 m (pipes and the stair add edges).
     - The joint pair at z ±0.5 is **not resolvable**: 032 sees it at 50 m, and the fit of 024 is too coarse (§3). Owed (survey item 14).
2. **The dance floor is not on fixed things.**
   - Of the model's dance floor (x ±5.35, z 7.5–48, 445.5 m²), photo 032 sees:
     - **348.8 m² free floor**
     - **4.8 m² movable** (the white bulk bags, x 0.9–2.2, z 24.2–26.5, SAM height 2.0 m)
     - **0 m² fixed**
     - **92 m² unseen**: z 39.7–48 is under the crane girder that cuts the bottom of 032, and z 7.5–8.2 is beyond the 42 m ray limit.
   - The fixed things are along the rows, not in the nave:
     - house right: the drum tank at **x ≥ 10.4, z 17–24, h 2.0 m** (SAM mask 30)
     - house right: the stair and the pipes at x 10–12
     - house left: the prefab cabin and the cabinets at x −9…−12, z 31–36
     - house left: the low block wall at x −12, z 18–30
     All CONFIRMED in 032 (plan, red and magenta).
   - **But "free" means "no upright object"**, and lying stock is not separated. Bars, pipes and scrap on the floor count as free (§4 limits). The long pipe stack at x ≈ 5–10, z 25–38 is lying on the floor inside or next to the floor's right edge.
3. **The speakers.** Where the owner expects them, the main stacks beside the DJ at z 3–8, is **the part no fitted photo resolves**. That area holds things the model already lists:
   - the press-side cabinets (x 2–5, z 3–8)
   - the pedestal
   - five loose pressure vessels (x −6…0, z −2…8): photos 020, 021 and 024 show them lying on the floor in front of the press. CONFIRMED by eye; position SUSPECTED.

   I give 4 candidates (§5). The two main stacks are **SUSPECTED** until the 10-08 photos. The two delays are on floor seen free in 032.
4. **Recommendation.** Keep the floor on the nave axis, but draw it **x −6.0…+6.0, z 8.5…40.0 (378 m²)** until z 40–48 is seen.
   - 357.8 m² of it is seen free, 5.0 m² is movable (the bags) and 15 m² is unseen.
   - It stays ≥ 2.4 m from every fixed object that 032 sees.
   - Extend it to z 48 when a photo shows that strip clear.

## 1. Method (published tools, pinned)

| Step | Tool, version | Licence | Why |
|---|---|---|---|
| Semantic classes (floor, wall, column, ...) | OneFormer (Jain et al., CVPR 2023), `shi-labs/oneformer_ade20k_swin_large` @ 4a5bac8e | MIT | ADE20K has floor / column / wall / tank / box classes |
| Named objects | Grounding DINO (Liu et al., ECCV 2024), `IDEA-Research/grounding-dino-tiny` @ a2bb814d, 13 prompts (machine, tank, cabinet, pipe, column, wall, sack, scrap, pallet, person, transformer, forklift, workbench) | Apache-2.0 | separates fixed from movable classes |
| Masks for those boxes | SAM 2.1 (Ravi et al. 2024), `facebook/sam2.1-hiera-small` @ ee5bba1d | Apache-2.0 | instance masks |
| Every object (automatic) | SAM (Kirillov et al., ICCV 2023), `facebook/sam-vit-base`, revision in `manifest.json` | Apache-2.0 | catches what the floor class swallows |
| Relative depth | **Depth Anything V2 Small** (Yang et al., NeurIPS 2024), `depth-anything/Depth-Anything-V2-Small-hf` @ 5426e4f0 | **Apache-2.0** (Base/Large are CC BY-NC: **not used**) | uprightness of masks; metric cross-check |
| Metric alignment | least-squares scale + shift of the inverse depth on floor pixels (Ranftl et al., TPAMI 2020) | — | — |
| Heights | single-view metrology, level camera: h = h_cam (v_b − v_t)/(v_b − v_h) (Criminisi, Reid & Zisserman, IJCV 2000) | — | — |
| Floor map | occupancy grid on y = 0, 0.5 m cells (Elfes 1989), ground contact per image column (stixels, Badino et al. 2009) | — | — |
| Distinct views | pHash (DCT, 64 bit, Zauner 2010) ≤ 22 bits proposes a pair; ORB + RANSAC homography (Rublee et al., ICCV 2011) with ≥ 25 % inliers confirms it; keep the sharpest (Laplacian variance) | — | the owner's "not the duplicate parts" |
| Column count | Sobel-x energy along each row's projected line (y 1.5–5.5 m), peaks with scipy `find_peaks` | — | — |

**Environment.**
- venv `~/tools/photo-analysis/.venv`: Python 3.11, torch 2.6.0+cu124 (2.5.1 refused the OneFormer `.bin` over CVE-2025-32434), transformers 4.57.1, opencv-headless 4.10.0.84, numpy 1.26.4. The full pin list is in `requirements.lock` beside it.
- GPU jobs ran under `flock ~/.local/state/di/locks/browser.lock` on the RTX 3080 Laptop. Peak memory was 3.9 GB, and the CPU package stayed at 54–64 °C.
- Nothing was sent to Colab. No WebGL was used.

**Scripts** (header in each):
- `scripts/place/photo_select.py`: picks the distinct views
- `scripts/place/photo_analyse.py infer`: the GPU stage
- `scripts/place/photo_analyse.py project`: the CPU stage, implemented in `photo_project.py`

**Data.** Masks, depth, `analysis.json` and the occupancy grid are in `/mnt/data/footage/place-moxir-photo-analysis-2026-10-07/`.

**Cameras.** Only the two fits already in the hall json (`geometry.cameras`) are used. VGGT poses were not kept: the run's scratch folder is gone, and `photo-meta.json` holds only the 2-D VGGT positions used to register GPS, not orientations. So the other views are analysed per image (masks, column components), not projected onto the floor.
- **032** (crane at the entry end, f 555 px, principal point (624, 262), camera (−1.7, 6.88, 50.2), rms 3 px) is the only camera good enough for the floor. A 3 px row error is ±0.2 m along z at 20 m, ±0.8 m at 35 m and ±1.3 m at 42 m, so floor rays are used from 11 m to 42 m (z 8.2–39.7).
- **024** (solvePnP, camera 1.0 m up, ±1 m / ±2°): at a 1 m eye height, 2° is more than 30 % of the range beyond 5 m. **Overlay only**. With roll −6, 0 and +6° tried, the model's columns still do not sit on the real ones (`roll024` check). A refit of 024 with column-base points is owed.

## 2. Which photos were used, and the duplicates dropped

`photo_select.py` was run over all stills and all videos at 0.5 frames/s.
- **191 candidates: 152 kept, 39 dropped as near-duplicates** (29 video frames, 10 stills, for example 027–031 against 032 and 033 against 034). The list is in `select/select.json`.
- Of the 152 kept, **the video frames of video-875, video-906, the 10-06 videos and AQMEbZ… are not this hall**: concert and laser references and a promo edit. They were set aside by eye from `video-sheet-0/1.jpg`. Of video-873 (a graded promo), 6 hall frames were kept.
- **66 distinct hall views were segmented**: 19 in the first pass plus 47 in `masks2`. The owner's marks (847) are the same view as 032, and 877–886 are poster layouts.

What each part of the hall is seen from. The positions are by eye or by coarse GPS; only 032 and 024 are fitted.

| Photos (kept) | Where from → looking at | Covers | Floor map? |
|---|---|---|---|
| 032 (+ dropped 027–031), 004, 009, 012, 007 | the near crane at the entry end, about 7 m up → down the nave (−z) | both main rows z 4–40; the floor z 10–40; the far gate (007) | **032 only** |
| 000, 001, 003, 005, 006, 033, 034, 035 | the floor at the entry end (GPS z 45–57) → down the hall and to the left | left row, the left neighbour span, the entry-end floor | no |
| 002, 008, 013 | beside the crane cab, entry end | the cab, the near-crane bridge, the bags | no |
| 010, 011 | the right neighbour spans (GPS x 28–31) | the right spans' machines and pipes | no |
| 014, 015 | GPS x 2, z 0–11, long lens across | an outer wall: window bands and slender wall posts | no |
| 017–025, 036–038 (S24, 09-17) | by the press and the joint → up and toward the far end | the press, the transformer, the column heads, the roof, the left row near z 0, the far half (024) | 024 overlay only |
| 856–867 (X-T5, 09-26) | floor level, close | the machines and cylinders near the press, the forklift, coils (positions unknown) | no |
| 016 (08-24) and 026 (09-17) video frames | a walk and pans at ground level | mixed: roof, both rows, the bags | no |

**Gaps: what no photo covers or resolves.** These are the shots for 10-08, each taken level at 1.5 m with a 1 m reference in view:
1. **The DJ end at floor level, z 0–10**: stand at the DJ spot (z 5) and shoot +x and −x, then from z 15 toward the press. These are the speaker spots S1/S2 and the cabinets, pedestal and vessels.
2. **The entry-end floor z 40–54**: from the entry door, level, down the nave. 032 cannot see under its own crane.
3. **The joint, both rows**: from x 0, z 0, shoot −x and +x, to show the paired columns.
4. **Right row z 0–20**: where the pipe rack starts behind the machine line.
5. **Box 39 (right row z ≈ 32)**: what that vertical is.
6. **The far half z < −10 at floor level** (backstage): only long views exist.
7. **One column at z 6 in each row, with a tape held across it**: the width and depth of the shaft and the head.

## 3. Columns: model against photo

Model: shaft 0.8 (across) × 0.5 (along) m to 6.21 m, then a symmetric flare to a 1.9 m head, top 7.06 m, and an upper column 0.45 m to the roof. Rows x ±12, grid z 6 m, a pair at ±0.5 at the joint, and neighbour rows x ±36 (`hall.py` l.536–612).

| Item | Model | Photo | Numbers | Confidence | Tag |
|---|---|---|---|---|---|
| Rows, span | x ±12, 24.0 m | 032: the z 36 pair at x −12.49 / +11.57 (columns read on the 2× zoom; left u 170–220, right u 1130–1175 at y 3 m, D 14.2 m, 39 px/m) | 24.06 m | ±0.3 m | CONFIRMED |
| Pitch, left row | 6 m | 032 scan: pair centres 6.45, 12.45, 18.3, 24.85, 29.7 | Δ 6.0, 5.85, 6.55, 4.85 | ±0.9 m | CONFIRMED (the 032 fit itself assumed 6 m, so this is a consistency check, not an independent measure) |
| Pitch, right row | 6 m | 032 scan: 7.05, 12.65, 17.8, 24.55, 28.6, 35.35 | Δ 5.6, 5.15, 6.75, 4.05, 6.75 | ±1.4 m | SUSPECTED (pipes and the stair add edges) |
| Extra column, right row z ≈ 32 | none | 032 box 39, u ≈ 1040–1060, v 260–470 | — | low | SUSPECTED |
| Neighbour rows x ±36 | in the model | seen through the rows in 032 (boxes 1–10, 41–48) | positions not fitted | low | CONFIRMED present / SUSPECTED positions |
| Shaft width seen | 45.5 px predicted (z 36 left, D 14.2) | mask 46 px; zoom ~50 px | ratio 1.01–1.10 | ±10 % | CONFIRMED |
| Column height to the head top | 7.06 m | SAM masks 24 and 66 (left z 36, z 30): h 7.14 and 7.04 m by metrology | — | ±0.3 m | CONFIRMED |
| Flare start | 6.21 m | 032 zoom, z 36 left: chamfer foot at v ≈ 315 → 5.5 m | −0.7 m | ±0.3 m | SUSPECTED (one column, perspective) |
| Head width | 1.9 m | 032 zoom, z 36 left: ~110 px less ~14 px side face → ~2.4 m | +0.5 m | ±0.4 m | SUSPECTED |
| Head shape | symmetric Y flare, centred upper column | 020, 021, 022: a stepped precast column, a chamfered flare on both sides under the runway girders, a narrower upper column to the roof | — | — | CONFIRMED form (by eye) |
| Paired columns at the joint | z ±0.5 | not resolvable (032 at 50 m; 024 fit too coarse) | — | — | owed |
| Low wall, left row | z 18–30, h 3 | 032 zoom: a block wall between z 30 and z 18 (u 350–450) | top v 335–345 → 3.9–4.2 m | ±0.5 m | CONFIRMED place / SUSPECTED height (higher than 3 m) |
| Wall posts in the outer walls | not modelled | 014, 015, 038 | — | — | SUSPECTED |

Column corrections in the layer: **none applied**. The span and pitch hold. The flare start (−0.7 m) and the head width (+0.5 m) come from one column and wait for the tape (gap 7).

## 4. The occupancy map

Shown in `plan-occupancy.png`, with the grid in `occupancy-grid.npz`.
- **Free** comes from the OneFormer floor pixels.
- **Fixed** comes from the ground contacts of the non-floor masks, plus the SAM automatic masks that are upright: verticality ≥ 0.5 from the DA-V2 relative depth, and a metrology height ≥ 0.4 m.
- **Movable** comes from the sack, person and pallet masks.
- **Wall or mass** comes from the ADE "wall" class, which here also covers the machines along the rows.

Standing objects found in 032. All other masks were flat or out of range.

| SAM mask | What (by eye) | x (m) | z (m) | h (m) | Tag |
|---|---|---|---|---|---|
| 23 | white bulk bags | 0.9…2.2 | 24.2…26.5 | 2.0 | CONFIRMED (movable) |
| 30 | drum tank, house right | 10.4… | 17.3…23.7 | 2.0 | CONFIRMED; model drum-tank x 8–11, z 22–28 is about 3 m too far toward the entry, SUSPECTED |
| 24, 66 | left columns z 36, z 30 | −10.5… | to 37.2 | 7.1, 7.0 | CONFIRMED |
| 31, 79, 93 | right columns and the stair | 11.6… | 15.8…35 | 2.6–4.5 | CONFIRMED (heights cut by the pipes) |
| 55, 57 | the left neighbour span | −38…−28 | 12…23 | 1.5–1.8 | SUSPECTED |

- **The model's blower (x 5–7, z 20–25, h 3)**: 032 sees no 3 m object there. A hopper stands at x ≈ 5–6.5, z ≈ 21.5 (zoom of 032, u ≈ 740–790, v ≈ 340–395), but the floor class swallowed it. Its place is SUSPECTED; it sits 0.35 m inside the model's floor edge and outside the recommended one by ≤ 0.5 m. Check on 10-08.
- **Depth cross-check.** DA-V2 Small aligned on 351 554 floor pixels of 032 has a median range error of **15.7 %** and a p90 of **41.9 %**, so it is not used for footprints. On 024, within 12 m, the median is 1.8 % and the p90 28 %.

**Limits, stated plainly.**
- One fitted photo (032) makes the map, taken on one day (the frame carries no date; the bags and people place it near 09-17).
- Lying stock counts as free.
- z < 8.2 and z > 39.7 are unseen.
- Long thin masks smear their footprints along the rows (masks 24, 31, 66, 79). This is harmless for the nave and wrong for the neighbour spans.

## 5. Dance floor and speakers

| | x (m) | z (m) | Area | Free / movable / fixed / unseen (m²) | Tag |
|---|---|---|---|---|---|
| Model dance floor | −5.35…5.35 | 7.5…48 | 445.5 | 348.8 / 4.8 / 0 / 92 | CONFIRMED (cells) |
| **Recommended** | **−6.0…6.0** | **8.5…40.0** | **378** | 357.8 / 5.0 / 0.2 / 15 | CONFIRMED z 10–35, SUSPECTED at the ends |
| S1 main L | −8.0…−6.5 | 6.0…8.0 | 3 | unseen | SUSPECTED: the vessels and transformer side; check gap 1 |
| S2 main R | 6.5…8.0 | 6.0…8.0 | 3 | unseen | SUSPECTED: next to the press-side cabinets (x 2–5) |
| S3 delay L | −8.0…−6.5 | 26…28 | 3 | 3 free | CONFIRMED free (D 22–24 m, ±0.4 m) |
| S4 delay R | 6.5…8.0 | 26…28 | 3 | 3 free | CONFIRMED free; 2.4 m from the drum (x ≥ 10.4) |

The layout follows the usual practice:
- main left and right stacks flanking the stage front
- subwoofers as an array along the barrier, z 7.5–8.5, x −3…3
- a delay pair about 20 m behind the mains to cover the far half of a 31 m deep floor (Davis & Jones, *Sound Reinforcement Handbook*, Yamaha 1989, ch. 6)

The delay time is owed to the system designer.

## 6. Owed

- The seven shots in §2 "Gaps" (10-08).
- Refit photo 024 from column bases. Fit one more camera at the DJ end (from the 10-08 photos with a 1 m reference), and rerun `photo_analyse.py project` on it. The script takes more fitted cameras through `geometry.cameras`.
- Teach hall.py the keys in the new layer, or fold the agreed values into the 10-08 measured layer.
- Separate lying stock from the floor. One way is a ground-plane height test on a stereo pair or VGGT points; that needs the VGGT run kept this time.
- The VGGT outputs of 09-27/09-30 were not kept. Next time, keep `predictions.npz` beside the footage.
