---
name: venue-layout
description: Venue step 3 — lay the fixed kit out as a rig file against the hall and the owner's painted zones (where every unit stands, what it aims at, nothing blocked). Scripts occlusion_sky.py, moxir_v2.py, moxir_v2_spread.py/moxir_v2_eyes.py, moxir_v2_compose.py, moxir_v2_symmetry.py. Use when a rig file must be written or re-placed.
---

# Step 3 — layout (a rig file in `scripts/place/rigs/`)

The output of this step is always a **rig file** — the format `rig.mjs` and
`epic-build.mjs --rig` read. Pictures and numbers only; nothing is written to a project here.

| need | script (usage from its header) |
|---|---|
| where can a beam head stand and run clear | `python3 -I scripts/place/occlusion_sky.py --repo . --out <dir>/occlusion` · `--check [--quick]` |
| layouts of the fixed kit, placed and aimed by the occlusion numbers | `python3 -I scripts/place/moxir_v2.py --repo . [--out <dir>]` · `--check` |
| spread over the painted hot zone, placed from audience eyes | `python3 -I scripts/place/moxir_v2_spread.py build --repo . [--out <dir>] [--placement <dir>/placement.json]` (placement in `moxir_v2_eyes.py`; search ~25 min on one core, `--placement` reuses it) |
| one rig from two (owned by mount) | `python3 -I scripts/place/moxir_v2_compose.py --repo . <ground rig> <cranes rig>` — also writes the patch, prints the sha256 of the rig built twice |
| re-place symmetric about the DJ axis | `python3 -I -B scripts/place/moxir_v2_symmetry.py --repo . [--src …] [--out …] [--check-only]` |

Earlier passes (beta v0.9, 2026-10-08) kept for history: `design_paint.py`,
`epic_placement.py`, `lasers_v2.py`, `occlusion.py`.

## Rules

- The zones are input, not decoration: every unit's place is checked against them
  (MOXIR: units outside the hot zone 27 → 0, PROGRESS 2026-10-09).
- Lasers are the laser session's table, used as given; a laser aim is never invented here.
- A new layout is a new dated rig file; the old one stays as the labelled old version.
- Safety geometry is shared (`scripts/rigbuild/safety.mjs`): geometry only — a rigger
  signs the rigging, a laser safety officer signs the lasers.
- Run the step's tests: `npx vitest run scripts/place scripts/rigbuild`.

UNVERIFIED: these scripts pin MOXIR inputs (GLB sha256, dated rigs, the laser commit);
none was re-run while writing this skill.

Next: `venue-render`.

MOXIR is this step's worked case: its production-named scripts are owed a move into di.iiii features (see the index `venue`, "MOXIR is the worked case").
