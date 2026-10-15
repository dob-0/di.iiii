# fix/laser-frames-as-rays-2026-10-15 — laser lines as straight rays (2026-10-15, headless Opus)

Brief: `agent-reports-2026-10-15/moxir-50/briefs/laser-frames-as-rays.md`. Report: `moxir-50/laser-rays-report.md`.

## What was done

- **Cause (measured):** the zig-zag is the line shader, not the frames. Lane-2 shots of the Studio, The storm, on a scratch copy of
  moxir-one: as written (zig-zag), each line cut to its first point (zig-zag), every `frames` removed (zig-zag), lasers removed (gone).
  The frame maths was checked in node over all 256 frames x 36 lines: `scanLines` gives straight rays from the cube, none downward.
- **Fix:** `laserLineMaterial.js` — the distance from the axis as one varying (`vX`), exact across both triangles of a quad.
- **Frames:** `laser_frames.py` blanks the move into each pose of a sheet (`sky`); regenerated; written to moxir-v2-11 on the moxir-one
  api with `epic-build.mjs --laser-frames --apply` (v1371 → v1409, 36 lines x 256 frames, 38/38 beams read back).
- **Tool:** `scripts/measure/laser-scene-shots.cjs` — Studio + room page of a project, one scene and its laser frame held in the
  browser's copy; `--frame-mode as-is|first-point|no-frames|no-lasers` for the diagnosis.

## Owed

- Owed: the halo radius cap lets a 40 W grid line's halo reach ~0.065·s (metres); physically checked? not in this job.
