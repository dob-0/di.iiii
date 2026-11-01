---
name: video-to-3d
description: Turn a walk-through video of a real place into camera poses and a point cloud on a rented Colab GPU, with one command (scripts/place/video-to-3d.sh). Use when the owner or a client gives video of a place and wants a 3D twin, or asks which tool to use and how to film it.
---

# video-to-3d

One command, one report. Method, sources and licences: `docs/ai/decisions/2026-11-01-video-to-3d-recipe.md`. Never re-derive them.

## Honest state (2026-11-01, Cinema House trial)
No tool gave a usable place from that footage (white low-texture walls, forward walking, blur). `--tool winner` therefore refuses. A frame count is not success: a 342/400 model was a collapsed fan of camera jumps. Look at the camera path before you call anything a result.

## Steps
1. Check the footage against "Filming" below. Bad footage cannot be fixed by a better tool.
2. Consent first: frames show people. Know who agreed, or that nobody is in frame. Frames go only to our own Colab session and the work folder, never a third-party app.
3. Dry run, read the plan: `scripts/place/video-to-3d.sh --dry-run --tool colmap-global walk1.mp4 walk2.mp4`
4. Run: `scripts/place/video-to-3d.sh --tool colmap-global --consent "who agreed" --out ~/work/<job>/v2d walk1.mp4 walk2.mp4`
5. Read `<out>/report.json` (tool, frames, registered, models, share, seconds, licence, consent). `camera_path_checked` is always false: make the top-view of the camera path (`scripts/place/recon-mast3r/preview_cloud.py`) and look at it. A walk is a continuous line, not a fan or a tangle.
6. Session stop is built in (also on error). Check `colab sessions` shows nothing of yours.

## Tools (every one that ran stays a mode)
| `--tool` | Method | Licence | Accel | Tonight's result |
|---|---|---|---|---|
| `colmap` | COLMAP incremental, sequential + exhaustive | BSD | cpu | 1137 frames: best 168 in 20 models. 400 frames: sequential 41, exhaustive 105 |
| `colmap-global` | COLMAP global mapper (ex-GLOMAP) | BSD | cpu | 342/400, 6 models, collapsed fan: not a hall |
| `mast3r` | MASt3R-SfM | non-commercial, research only | A100 | 285/285 by construction, tangled path: not a hall |
| `vggt` | VGGT windowed + Sim3 merge | VGGT-1B CC BY-NC; Commercial is gated | A100 | never ran: needs `HF_TOKEN` and approved access |
| `winner` | none | - | - | refuses until a tool beats the baseline |

Dense mesh after a good `colmap` model: `scripts/place/colmap/dense_mesh.py` (needs CUDA pycolmap). Default accel per tool is in the script; `--accel` overrides.

## Filming (from the trial's REPORT.md, "Refilming advice"; hypotheses, not yet shown to fix it)
- One slow continuous walk per pass, 0.3-0.5 m/s, phone braced or on a gimbal, no pan faster than about 20 deg/s, shutter 1/250 or faster.
- Every point in 3+ views, 60-80 % overlap between neighbouring frames. Walk a loop that returns to the start; cross the place twice in opposite directions.
- One pass per wall at 1-2 m facing the wall, then one pass looking along the place; corners from two heights.
- Blank white walls: add temporary texture (tape marks, printed noise sheets) or raking light. Even light, no flicker, nobody moving.
- Do not blur-filter by a batch-relative floor: it kept 99 of 758 frames on white walls. Film sharp instead.

## Costs measured 2026-11-01
- Colab CPU high-RAM about 0.26 units/h; 3.3 h = under 1 unit. Exhaustive matching of 400 frames at 1080 px: 78 min.
- A100 MASt3R-SfM, 285 frames: 12.97 units, 48 min; all 1137 frames would be about 3.4 h and 30 units (estimate).
- Upload runs at about 90 KB/s: send 1080 px frames, 5 MB parts, five at a time. A 1 h token expiry broke the old CLI; the pinned 0.7.5 wrapper is used.
- Lesson: poll rarely; the script runs the tool detached and checks every 120 s.

## Owed
A window-only control run of `mast3r` with a geometric check on each pair; HF token and approved access for `vggt`; a reshoot per "Filming"; a scripted gate that tests the camera path looks like a walk; `colmap` loop detection needs a vocab tree that COLMAP 4.x can read (the 2023 one crashes).

## When no tool gives a place: model it (2026-11-01)
`scripts/place/model-hall/model_hall.sh <work_dir>` builds a clean, closed room from a hand-made plan JSON,
sizes measured from the frames, textures = rectified frame crops with no person in them. Method and limits:
`scripts/place/model-hall/METHOD.md`. First use: Cinema House gallery A (plan, DIMENSIONS.md and renders in
the place's `modelled/` folder). Look at `renders/compare_all.png` before showing anyone.

## A whole floor of rooms by hand (2026-11-01) - the recipe when reconstruction fails
Workflow: **survey -> rooms in parallel -> assemble -> judge.** One command for the last two steps:
`scripts/place/model-hall/model_floor.sh <modelled_dir> [samples]` (REBUILD=1 to rebuild modules first). `<modelled_dir>` holds `floor.json`
(rooms + openings in one frame), `floor_assembly.json` (modules, drops, clips, offsets, why), `floor_corrections.json` (decisions),
`place_meta.json`, and `rooms/<id>/<id>.glb`. Output: `floor.glb/.blend`, `check_floor.log` (must end FLOOR_OK), `place.json`,
`renders/floor_top.png` + `eye_<opening>.png`. Then on a test copy:
`node scripts/place/import.mjs --work <folder with place.json + place.glb> --name <space> --project <space>-floor --no-sources --keep-front-door --api <scratch api>/serverXR`.
Method, lessons (boolean + face winding, shared walls, stubs) and limits: `scripts/place/model-hall/METHOD.md`, section "The whole floor by hand".
Never use the reconstruction meshes for this place. No person in any texture; nothing leaves the machine.

## Objects (hero props): gen3d
For one object at a time (old film camera, projector, reel, chair) from a crop, use `scripts/place/gen3d/gen3d.sh <crop|dir> --no-people-confirmed --height <metres>` (README next to it). It picks the model by the kit's ranking, refuses research-only models for product (Hunyuan: territory excludes EU/UK/KR), scales to the measured size and writes provenance. Pilot evidence is n=1; texture on dark crops is unsolved. Never use reconstruction meshes for the place itself (above).
