---
name: venue-paint-plan
description: Venue step 1 — draw a clean top plan of the hall for the owner to paint areas on (where lasers can be, what we light, hot zone, wings, bar). Script scripts/place/paint_plan.py. Use when the owner asks for "the plan from above to paint on".
---

# Step 1 — paint_plan (`scripts/place/paint_plan.py`)

Draws only what is fixed (columns, permanent objects with heights, glazed lanterns),
the stage as built and a 6 m grid; no fixtures, no beams. Oriented as the dance floor
sees it: stage at the top, entry at the bottom, house left on the LEFT.

```bash
python3 -I scripts/place/paint_plan.py --hall <hall.json> --stage <stage-line.json> --out plan.png [--ppm 40]
#   --full          the whole building, wall to wall (default: the nave only)
#   --lasers <aerial json>   draw the free crane where the show parks it, the cubes and their lines
#   --views <rig json>       mark the rig's eye-height views as audience view points
#   --quiet-lamps   pendant lamps as small marks
#   --title / --key  the line(s) that say what to paint
```

MOXIR inputs: `scripts/place/rigs/moxir-hall-*.hall.json`, `scripts/place/rigs/moxir-stage-line-2026-10-07.json`.

## Hand-off

- The pixel ↔ hall mapping is written into the PNG's text chunk (`di-plan-map`); step 2 reads it.
- **Keep the exact file the owner opens.** Step 2 diffs his painted copy against it;
  a regenerated plan is only a fallback (`paint_zones.py` notes the drawing changed by
  1038 px once).
- The owner paints closed loops, one colour per meaning, in GIMP, and writes what each
  colour is. Ask for the colour → meaning list with the painted file.

Next: `venue-read-paint`.
