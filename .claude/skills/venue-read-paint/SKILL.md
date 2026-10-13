---
name: venue-read-paint
description: Venue step 2 — read the owner's painted plan back into areas in hall metres (zones json). Script scripts/place/read_paint.py. Use when the owner returns a painted plan from paint_plan.py.
---

# Step 2 — read_paint (`scripts/place/read_paint.py`)

His strokes = pixels that differ from the clean plan; per colour, a closed loop's
inside is an area; written in hall metres as 1 m cells using the plan's own
`di-plan-map` chunk.

```bash
python3 -I scripts/place/read_paint.py --plan clean.png --painted his.png \
    --colour 'hot=224,64,0=hot zone' --colour 'use=0,224,64=we can use this area' \
    --out zones.json --picture my-reading.png
#   [--min-m2 15] [--work-ppm 5] [--close-px 3]
```

- `--colour id=R,G,B=name` — the names are HIS words; words painted on the plan are not read.
- Limits (the script's own): an open loop is not an area (the `--picture` shows it);
  colours closer than ~70 RGB merge; it stops if the painted picture is not the plan's size.
- **Show the owner `--picture`** before anything uses the zones: it is the reading, he confirms it.
- Commit the result as `scripts/place/rigs/<venue>-zones-<date>.json`
  (MOXIR: `moxir-v2-zones-2026-10-09.json`).

Older reader, 2026-10-08: `scripts/place/paint_zones.py --painted … --clean … --out zones.json [--overlay zones.png]`
(threshold diff; `--regenerate` when the clean plan was lost). `read_paint.py` is the one step 3 consumes.

Next: `venue-layout`.
