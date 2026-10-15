## 2026-10-15 — The show's sheets and outside views migrated into scripts/place ("nothing is left behind")

Rule: "Nothing is left behind". Brief: agent-reports-2026-10-15/moxir-50/briefs/migrate-sheets.md. Venue-to-show skill: step 11 (sheets) and step 10 (views).

| Was (agent-reports-2026-10-15/moxir-50/…) | Now | Notes |
|---|---|---|
| scenes-tools/sheet.py (+ sheet_render2.py: see below) | `scripts/place/scenes_sheet.py` | generic: scene rows from the scenes file; title, act names, essays from `--meta` / `--front` |
| scenes-tools/laser_sheet.py | `scripts/place/laser_sheet.py` | window, bay, lantern bands, cranes from `--site`; defaults from the plan's own bounds |
| whole-building/views.json | `scripts/place/rigs/moxir-views-2026-10-15.json` (+ `.source.json`) | input of `look_shots.cjs` (`LOOK_VIEWS`) |
| the production text in those scripts | `rigs/moxir-scenes-50-sheet-{meta,front}-2026-10-15.*`, `moxir-laser-sheet-meta-…`, `moxir-hall-top-plan-…` | data beside the scenes file |

Measured: on the dev fixture `moxir-scenes-50-2026-10-15.json` the 50 scene rows (scenes_sheet) and the 21 laser cards (laser_sheet, with the job's laser-plan.json) are byte-identical to the originals' output. Tests: `scripts/place/scenes-sheet-py.test.js`, 6 passed.
Not migrated: `sheet_render2.py` (the re-render luma sheet) reads `~/Downloads` renders by fixed paths and is not in these rows (N811.5 names sheet.py and sheet_render2.py; it stays a row, owner of its folder layout = the render job). Not tested: a look at the HTML in a browser (brief: no browser); the brief's `scripts/measure` does not exist on dev, so the tools sit in `scripts/place` as the ledger row says.
