---
name: venue
description: The venue workflow for a production in a real hall (MOXIR is the worked case) — paint_plan → read_paint → layout → render(measure) → integrate → review. Use when a hall needs its areas painted by the owner, a rig laid out against them, measured on the GPU, put into the room and shown back. Index only; each step is its own skill.
---

# The venue workflow — six steps, each one names its script

A map of what already exists in `scripts/place/` and `scripts/rigbuild/`. It adds
no behaviour: every command below is quoted from the named script's own header
(or `scripts/place/README.md`). Words: a **production** is the work for a real
room, the **place** is the hall on di.iiii (`docs/ai/vocabulary.md`, 2026-09-11).

| # | step | skill | script(s) | out |
|---|---|---|---|---|
| 1 | paint_plan | `venue-paint-plan` | `scripts/place/paint_plan.py` | a clean top plan PNG with its pixel↔hall map |
| 2 | read_paint | `venue-read-paint` | `scripts/place/read_paint.py` (older: `paint_zones.py`) | `rigs/<venue>-zones-<date>.json`, hall metres |
| 3 | layout | `venue-layout` | `occlusion_sky.py`, `moxir_v2.py`, `moxir_v2_spread.py` (+ `moxir_v2_eyes.py`), `moxir_v2_compose.py`, `moxir_v2_symmetry.py` | a rig file in `scripts/place/rigs/` |
| 4 | render (measure) | `venue-render` | `scripts/rigbuild/epic-build.mjs` (scratch), `moxir-v2-true-frames.cjs`, `moxir-v2-probe.cjs`, `frame_luma.py`, `rigbuild/look-probe.mjs`, `rig-look.mjs`, `moxir_render.py` | frames, lux, luma, fps — numbers |
| 5 | integrate | `venue-integrate` | `rig.mjs`, `hall-show.mjs`, `rigbuild/swap-hall.mjs`, `rigbuild/patch-table.mjs` | the rig in the venue's project; the crew patch |
| 6 | review | `venue-review` | `moxir_v2_page.py` / `moxir_v2_spread.py page`, `rigbuild/look-compare.mjs`, `compose.py`, `moxir_site_sheet.py` | one page the owner decides on |

## Rules that hold on every step

- **The hall comes first.** Steps 1–6 assume a `hall.json` from `scripts/place/hall.py`
  (or a scan through `place.mjs`). That is `scripts/place/README.md`, not this skill set.
- **Back the space up before anything writes to it** (README, step 0):
  `node scripts/space-bundle.mjs export <space> --data-root <data> --out <dir>/<space>.space-bundle.tar.gz`.
- **Scratch before the owner's room.** Render/measure runs against a scratch stack
  (`epic-build.mjs` refuses any host but localhost / 127.0.0.1). Writing into the venue's
  real project (step 5) is the owner's word, every time.
- **Measured, not claimed.** A value nobody taped is ASSUMED/ESTIMATED in the rig file,
  and stays so on every page. A render is not a photometric measure of the hall
  (`frame_luma.py` says so of itself).
- **GPU frames on the real card only**, under `di-test-browser run`, with `timeout`;
  every page-opening script uses `close-on-signal.cjs` (known-fixes: tabs left drawing).
- Python scripts run with `python3 -I` (they say so); most take `--repo .` and `--check`
  for numbers-only JSON.

## Deeper reference

`docs/architecture/PLACE.md` · `docs/architecture/RIG_BUILD.md` ·
`docs/architecture/MEASUREMENT_MODE.md` · `scripts/place/README.md` · PROGRESS.md
entries "MOXIR v2" (2026-10-09 … 10-11).

UNVERIFIED: this skill set was written from the scripts' headers and PROGRESS.md; no
step was run end to end when it was written (2026-10-13). Most step scripts are
MOXIR-specific (pinned inputs, dated rig files); a second venue would need its own.
