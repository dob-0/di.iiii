---
name: venue-render
description: Venue step 4 — render the rig in the scene and MEASURE it (frames at one stated EV100, lux on the stage, luma/white-out, fps) on the real GPU, on a scratch copy. Scripts epic-build.mjs, moxir-v2-true-frames.cjs, moxir-v2-probe.cjs, frame_luma.py, look-probe.mjs, rig-look.mjs, moxir_render.py. Use when "is it too dark / blocked / glaring" needs a number.
---

# Step 4 — render (measure)

"Too dark" is a measurement, not an impression (`scripts/rigbuild/luma.mjs`).

## 4a — the rig into a scratch project

```bash
di-dev up <tree> --api scratch
node scripts/rigbuild/epic-build.mjs --api http://127.0.0.1:<port>/serverXR --project <scratch copy> \
    --token-file <dummy env> --rig scripts/place/rigs/<rig>.json [--out <dir>] --apply
```
Refuses any host but localhost / 127.0.0.1. Never dev, prod or the owner's own di.

## 4b — measure (browser's copy only; nothing written to a server)

| measure | command |
|---|---|
| frames per job (layout × haze × look × view), measurement mode, one EV100 | `timeout 600 di-test-browser run scripts/place/moxir-v2-true-frames.cjs --plan <plan.json> --out <dir> [--only …]` (plan from `moxir_v2_true.py plan` / `moxir_v2_spread.py plan`) |
| lux on the stage (the scene's own probe) | `timeout 600 di-test-browser run scripts/place/moxir-v2-probe.cjs --plan <probe-plan.json> --out <probe.json>` |
| mean luminance + white-out share per frame | `python3 -I scripts/place/frame_luma.py <frames dir> > luma.json` |
| luma + fps cue by cue, as a visitor | `node scripts/rigbuild/look-probe.mjs …` (RIG_BUILD §20) |
| named views + fps + draw calls | `node scripts/place/rig-look.mjs --gpu --base <base> --space <s> --project <p> --hall <hall.json> --rig <rig> --out <dir> --tag <t> [--views …]` |
| the still to judge the show by (Cycles, GPU) | `blender -b -P scripts/place/moxir_render.py -- --hall <hall-show.glb> --doc <document.json> --out <png> [--look peak] [--view floor\|entrance\|dj\|outside] [--samples 128] [--haze 0.015]` |

## Rules

- Real GPU only: the probe and rig-look refuse a software renderer (headless Chrome
  gets SwiftShader — README "Things that have already gone wrong").
- Always under `timeout`, and the script uses `close-on-signal.cjs`, or a killed run
  leaves a tab drawing the scene.
- State the exposure (EV100, scene scale) next to every number; numbers from
  different exposures are not compared.
- Open the frames and look at them. A number with no frame looked at is not a result.
- Known open item: the scene squares a look's level (intensity = nominal × level²;
  PROGRESS 2026-10-09) — owed to the viewport, not corrected here.

UNVERIFIED: `moxir_render.py`'s header says `--exposure 0`; its code defaults to 3.0. None of these was run while writing.

Next: `venue-integrate`.

MOXIR is this step's worked case: its production-named scripts are owed a move into di.iiii features (see the index `venue`, "MOXIR is the worked case").
