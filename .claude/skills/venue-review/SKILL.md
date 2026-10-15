---
name: venue-review
description: Venue step 6 — put the layouts, their measured numbers and their frames on one page the owner decides on (comparison page, contact sheet, render-over-photo, site sheet PDF), and record what is still owed. Scripts moxir_v2_page.py, moxir_v2_spread.py page, rigbuild/look-compare.mjs, compose.py, moxir_site_sheet.py.
---

# Step 6 — review

The owner decides; this step makes the decision readable. Every number on the
page comes from steps 3–4's JSON — the page itself is layout only.

| page | command |
|---|---|
| layouts side by side + contact sheet | `python3 -I scripts/place/moxir_v2_page.py --dir <dir>` (reads `v2-layouts.json`, `occlusion/occlusion-sky.json`, `frames/<layout>-<look>-<view>.png`) |
| the spread / true-look pages | `python3 -I scripts/place/moxir_v2_spread.py page --repo . --out <dir>` · `moxir_v2_true.py page --repo . --out <dir>` |
| look-probe runs side by side (before / after) | `node scripts/rigbuild/look-compare.mjs --out <dir>/compare.html --run "before=…/probe.json" --run "after=…/probe.json" [--refs …]` |
| render beside and over the photograph | `python3 -I scripts/place/compose.py --photo <photo.jpg> --render <shot.png> --out <composite.png> [--side-only]` |
| one-page site sheet (plan from rig + hall json) | `python3 -I -B scripts/place/moxir_site_sheet.py [--pdf PATH]` |

## What the review hands back

- The advice, with the numbers that carry it (e.g. "layout B, 10 PARs on the cut", PROGRESS 2026-10-09).
- **Owed**: every value still ASSUMED, every sign-off not given (rigger, laser safety
  officer, the venue's OK), every open owner's call — listed, not buried.
- The owner's answer goes back in as input: a repaint → step 1/2, a re-place → step 3.
- Record it in the branch's session note (`docs/ai/sessions/<branch>.md`), not CURRENT.md.

UNVERIFIED: none of these commands was run while writing this skill.

MOXIR is this step's worked case: its production-named scripts are owed a move into di.iiii features (see the index `venue`, "MOXIR is the worked case").
