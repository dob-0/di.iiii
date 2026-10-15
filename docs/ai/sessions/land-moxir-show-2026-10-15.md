## 2026-10-15 — land the MOXIR show branch on dev

Branch `land/moxir-show-2026-10-15`: origin/dev (4f3bec9b) with `feat/moxir-v2-10-forty-2026-10-15` merged (`--no-ff`), so dev.diiii.xyz serves the
show fixes of the night: PR #993 (every scene card clickable and previewed in the room page, 50/50), PR #994 (patch plan by fixture kind),
PR #995 (show-loop uses the document's own cues), plus the 40 W laser lines and the v2-11 build files already on the show branch.

**Conflict:** one add/add, `scripts/place/rigs/moxir-scenes-50-2026-10-15.json` (dev 15 keys from the migration, show 16 keys with the laser scenes).
Resolved to the show side (the newer data, same choice as the earlier landing 10-15 19:10). Known-fixes and RIG_BUILD merged automatically.
**Tested:** see the PR body for gate numbers. **Not tested:** the dev deploy and the page on dev (after merge).
