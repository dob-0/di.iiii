---
name: venue
description: The venue workflow for a production in a real hall (MOXIR is the worked case) — paint_plan → read_paint → layout → render(measure) → integrate → review. Use when a hall needs its areas painted by the owner, a rig laid out against them, measured on the GPU, put into the hall's project and shown back. Index only; each step is its own skill.
---

# venue

Thin entry point. The one source is `docs/ai/skills/venue-to-show.md` (14 steps, traps, standing choices, step check `scripts/place/venue_to_show_check.py`); its section 6 holds the per-script usage for the place steps. Step skills: `venue-paint-plan`, `venue-read-paint`, `venue-layout`, `venue-render`, `venue-integrate`, `venue-review`, each a pointer to one part of that file. A production (MOXIR, Charentsavan) is an example, never a default; production-named scripts are owed a move into di.iiii features (`docs/ai/plans/2026-10-13-moxir-tools-into-di-iiii.md` once PR #901 lands).
