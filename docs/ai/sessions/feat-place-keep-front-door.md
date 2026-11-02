## 2026-11-02 — place tools: camera track per frame, round archive and gate, stills crop, entrance-view check

- `scripts/place/video-to-3d.sh` gains `--tool colmap-track`: every frame, matched in order, the matchmove step (`scripts/place/colmap/sfm_seq_track.py`).
  Every Colab call now has a hard timeout, uploaded parts are checked by name and size before unpacking, and old frames are moved aside on a re-run.
- `scripts/place/model-hall/round_gate.py` archives each round, scores the floor at a fixed pose set (edge F1), and rolls back rooms that got worse.
- `stills_crop.py` cuts sharp, people-free stills.
- `find_frames.py` ranks frames by a text query with CLIP.
- `entrance_view.py` checks what you see from the entrance.
- `assemble_floor.py` takes `rot_z_deg`.
- `dense/ingest.py` takes `--seg` and `--out`.
- `.claude/workflows/place-floor-fix-pass.js` declares PASS and PILOT, runs a one-room pilot, imports into one space and one project,
  and states the owner's order: photos, a wall plan, his approval, then build.
- Cinema House test (owner's place): a 30 fps pilot on one corridor held 90–97 % of its frames in one camera path. 10 fps on the whole walk broke into 50 pieces. The 30 fps whole walk is the next result.
