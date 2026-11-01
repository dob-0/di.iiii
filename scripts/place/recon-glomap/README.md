# recon-glomap (Lane 2): COLMAP global mapper
`sfm_global.py IMAGE_DIR TAG seq|exh [OVERLAP]` runs on a Colab CPU high-mem session with pycolmap 4.2.1 (pip): SIFT, match, `pycolmap.global_mapping` (ex-GLOMAP, BSD-3-Clause, no weights).
Frames go up downscaled to 1080x1920 (the Colab upload runs at ~90 KB/s; full 4K is not practical). Frames show faces: only our own Colab session; nothing public. Results: `/mnt/data/footage/place-cinema-house-2026-10-30/recon-lane2-glomap/LANE.md`.
