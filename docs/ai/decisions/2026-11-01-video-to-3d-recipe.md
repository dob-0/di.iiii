# Video to 3D: one recipe, every tried tool kept as a mode (2026-11-01)

Status: accepted. Owner rule: "Done once, easy forever" (2026-10-21). Code: `scripts/place/video-to-3d.sh`, test `scripts/place/video-to-3d.test.js`, skill `.claude/skills/video-to-3d/SKILL.md`.

## Decision
A walk-through video of a place becomes poses and a point cloud by one command. It extracts frames, uploads them to the pinned Colab CLI (`colab-pinned.sh`, 0.7.5), runs one tool detached, downloads the result, stops the session (also on error) and writes `report.json`. The tools are modes (`--tool`). Nothing that ran was removed. `--tool winner` refuses, because no tool won.

## Evidence (trial of 2026-10-30 to 2026-11-01, Cinema House, two 4K portrait walks, 1137 frames at 3 fps)
Verdict: `~/work/agent-reports-2026-11-01/video-to-3d/VERDICT.md`; tools table: `TOOLS.md` in the same folder; earlier runs: `~/work/agent-reports-2026-10-31/cinema-house-3d/REPORT.md`.
- Baseline COLMAP incremental: 168/1137 in 20 models; 400-frame set 41 (sequential), 105 (exhaustive).
- COLMAP global mapper: 342/400 in 6 models, reprojection 0.84 px, but the camera path was a fan of long jumps meeting at one point: a collapsed solution. The fair baseline is 105/400, and resolution changed too, so the gain is not attributed.
- MASt3R-SfM: 285/285 because it places every frame by design; path tangled; 12.97 Colab units.
- VGGT: not run (gated weights, no HF token on the lane).
- Result: none gave a usable place. Known capture faults: white low-texture walls, forward walking with little parallax, blur.

## Methods and sources (as cited in the scripts and the tools table)
- COLMAP: Schonberger and Frahm, "Structure-from-Motion Revisited", CVPR 2016; global mapper from GLOMAP, Pan et al., ECCV 2024 (arXiv 2407.20219), merged into COLMAP; pycolmap 4.2.1.
- MASt3R-SfM: Duisterhof et al. 2024 (arXiv 2409.19152); MASt3R, Leroy, Cabon, Revaud, ECCV 2024 (arXiv 2406.09756); naver/mast3r.
- VGGT: Wang et al., CVPR 2025 (arXiv 2503.11651); facebookresearch/vggt; windows merged by a Sim3 fit (Umeyama 1991) with RANSAC.
- Screened Poisson meshing: Kazhdan and Hoppe 2013 (Open3D).
Not cited as a method: any claim of blur robustness; no README states it.

## Licences (checked 2026-11-01 from the repos and model cards; see TOOLS.md)
| Tool | Code | Weights | Use |
|---|---|---|---|
| COLMAP / pycolmap, global mapper | BSD-3-Clause | none | any |
| MASt3R-SfM | CC BY-NC-SA 4.0 | non-commercial (CHECKPOINTS_NOTICE) | research and private only |
| VGGT-1B | VGGT License v1 (AUP) | CC BY-NC 4.0 | non-commercial |
| VGGT-1B-Commercial | same | commercial except military; gated; its LICENSE file returned 401: unchecked | needs approval |
The script prints the licence in its plan and writes it to `report.json`.

## Rules built into the script
- Consent: a real run refuses without `--consent`. Frames show people; they stay on this machine and in our own Colab session. Third-party apps (Polycam, KIRI, Luma) are out for that reason.
- The `registered` count is never called success. `report.json` carries `camera_path_checked: false` and a warning; MASt3R's count is flagged as forced.
- No production name in any default. Defaults are environment-neutral; the trial's place is an example only.

## Limits
Only the dry run, the argument checks and a run against a stub Colab were tested (vitest, 8 tests). The real Colab path of this script has not run end to end; each tool's own scripts did run on Colab in the trial. The poll interval, upload batching and `--env` passing are unverified on a live session.

## Owed
1. Window-only control run of `mast3r` with per-pair geometric verification. 2. HF token and approved access for `vggt`. 3. Reshoot per the skill's filming advice, then rerun all modes on it. 4. A scripted camera-path gate (walk or fan). 5. A vocab tree COLMAP 4.x can load, for loop detection. 6. First live run of `video-to-3d.sh` on a small clip (about 30 frames, CPU) to prove the Colab plumbing.
