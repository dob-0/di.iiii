## Unposed rig lamps draw dark in a playing look (2026-10-17)

Source: `agent-reports-2026-10-17/deep-audit-A-washes.md` (fix B and guard C).

**Problem.** With the desk present the 3D draws a lamp the playing look gives no pose as dark (desk level 0) = the hall. With no desk (dev.diiii.xyz, a phone, the hosted clock) `posedEntities` returned such a lamp unchanged, so it drew its saved light (609.56, #ff3a12) in every look: 3D != hall.

**Change.**
- `src/rigbuild/looks.js` `posedEntities`: a rig lamp (has `components.fixture`) with no pose while a look plays is drawn at level 0 (light, haze, `rigShown {level: 0}`), place and aim kept. A spotLight with no fixture stays as saved. No look playing (no poses): unchanged.
- `lampGroups` is now exported (the group-building part of `lookPoses`, moved as is) so a guard can read the group keys.
- `scripts/rigbuild/lookCoverage.mjs` (pure) + `look-roundtrip.mjs`: summary line "coverage: N of M lamps posed in 0 looks, K look group keys match no lamp", with the lamp ids and orphan keys listed. The motion line now says the desk plays look motion (PR #1018).

**Tests.** `looks.test.js` "a lamp the playing look gives no pose" (fails on origin/dev, passes now); `lookCoverage.test.js`. `npx vitest run src/rigbuild scripts/rigbuild`: 1715 passed, 0 failed.

**Not done.** The data fix (fixture.position of the washes; audit proposal A) stays an owner decision. Not looked at in a browser: renderer-free test only.
