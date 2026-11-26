## 2026-11-26 — light desk heads write 16-bit pan/tilt for pan_fine / tilt_fine profiles

- `headsPose` (`serverXR/src/lighting/headMotion.js`) now finds the fine channel with `fineRoleIn` from `roles.js`, the resolver the trim uses, so the Reika bars (MovingBar43, BAR1240PIX57) get both bytes while a look moves their heads. Other profiles give the same bytes as before.
- New `serverXR/src/lighting/tests/test-head-fine.js` (7 cases) and a `known-fixes.md` entry. Not run on the real rig.
