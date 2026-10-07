# Session note: feat/moxir-photo-analysis-2026-10-07 (2026-10-07)

## Asked

 The owner said the MOXIR dance floor may be in the wrong place (*"speakers will be there, by the static things"*) and the columns are wrong.
He then said *"there are more columns than you count"* and *"analyse more photos, not the duplicate parts"*.

## Done


- `scripts/place/photo_select.py` picks the distinct views. Of 191 candidates, 152 were kept and 39 dropped as near-duplicates (pHash, then ORB + RANSAC).
- `scripts/place/photo_analyse.py` and `photo_project.py` do the work:
  - segmentation: OneFormer ADE20K, Grounding DINO + SAM 2.1, and automatic SAM masks
  - depth: Depth Anything V2 **Small**, Apache-2.0
  - all models are pinned
  - output: a floor occupancy grid from the fitted camera of photo 032, a column scan along each row, overlays and a plan
- 66 distinct hall views were segmented.
- `docs/moxir/PHOTO_ANALYSIS_2026-10-07.md` has the answers, the column table, the coverage and gaps table, and the recommended floor and speakers.
- `scripts/place/rigs/moxir-hall-features-2026-10-07-photos.json` is the new layer. Its keys are new and hall.py does not read them, so the rig and hall code are unchanged.
- The owner's images are in `~/Downloads/moxir/photo-analysis/`. The data is in `/mnt/data/footage/place-moxir-photo-analysis-2026-10-07/`.

## Findings


- No extra main-row column is confirmed. The scan's off-grid peaks are column edge pairs (each column gives two peaks about 3 m apart at 20–35 m).
- One SUSPECTED extra vertical sits on the right row at z ≈ 32 (box 39).
- The neighbour rows x ±36 were missing from the first overlays and are drawn now.
- The model dance floor is 0 m² on fixed objects. 92 m² of it is unseen.

## Environment


- venv `~/tools/photo-analysis/.venv`, torch 2.6.0+cu124, pinned in `requirements.lock`.
- GPU runs were under the browser lock. Peak memory was 3.9 GB. The CPU stayed at 54–64 °C.

## Owed


- The 7 site shots in the doc §2.
- A refit of photo 024.
- A fitted camera at the DJ end.
- hall.py support for the new keys.
- Keep the VGGT predictions next time.
