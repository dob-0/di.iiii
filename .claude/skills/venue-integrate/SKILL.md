---
name: venue-integrate
description: Venue step 5 — put the chosen rig into the venue's own room (its project on di.iiii) and make the crew's patch. Scripts rig.mjs, hall-show.mjs, rigbuild/swap-hall.mjs, rigbuild/patch-table.mjs. Use only after the owner picked the layout at review (step 6); it writes to a real room.
---

# Step 5 — integrate

This is the first step that writes outside a scratch stack. **The owner's word
first**, and the space backed up first:

```bash
node scripts/space-bundle.mjs export <space> --data-root <data> --out <backup dir>/<space>.space-bundle.tar.gz
```

| what | command |
|---|---|
| hang the rig in the hall's project, as ops | `node scripts/place/rig.mjs --rig scripts/place/rigs/<rig>.json --hall <work>/hall.json --project <hall project> [--api …] [--real budget\|all\|none]` |
| take it down again | `node scripts/place/rig.mjs --project <hall project> --remove` |
| the show copy of the hall (no planning floor tape) | `node scripts/place/hall-show.mjs --in hall.glb --out hall-show.glb --api <base>/serverXR --project <show project> --token-file ~/.di/di.env` |
| a corrected hall into rooms already built | `scripts/rigbuild/swap-hall.mjs`, then `realism.mjs` and `work-light.mjs` (README "Putting a corrected hall into the rooms") |
| two rigs into one before hanging | `scripts/place/moxir_v2_compose.py` (see `venue-layout`) |
| the crew's patch table (md/html/csv) | `node scripts/rigbuild/patch-table.mjs …` from the rig's patch file (`rigs/*-patch-*.json`) |

## Rules

- `rig.mjs` only touches entities whose id starts `rig-` (plus the night and the
  shadow switch); a re-run deletes those first. Undo the whole hall: import the backup
  bundle (`space-bundle.mjs import … --force`).
- Its default `--api` is `https://local.thedi.studio/serverXR` — the owner's own di.
  Say which tier you write to, every time.
- Patch checks are tests: `npx vitest run src/rigbuild scripts/rigbuild`
  (MOXIR: `src/rigbuild/moxirV2Patch.test.js`).
- After writing, step 4's `rig-look.mjs` against the real room, frames looked at.

UNVERIFIED: none of these commands was run while writing this skill; flags quoted from headers.

Next: `venue-review`.
