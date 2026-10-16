## 2026-10-16 — land the MOXIR show branch on dev (third landing, replaces #997)

- What landed: `feat/moxir-v2-10-forty-2026-10-15` (head c336a602) merged `--no-ff` onto `origin/dev` (dcf4c3e7): #981 40 W lasers, #993 scene strip clicks, #994 v2.11 patch by kind, #995 show-loop cues, #996 version-to-desk, #999 printed B380F/LA40WF charts, #1001 truss beams.
- Conflicts: `scripts/place/fixtures.test.js` (show side: the printed manual is EXACT, #999) and `scripts/place/rigs/moxir-scenes-50-2026-10-15.json` (add/add; show side: the laser and truss parts and the 40 W lines in the scenes — dev's copy was the earlier one).
- Fix 1: `moxirV2Patch.test.js` expected the smoke off DMX; since #981 epic-build's `dmxOf` gives it the rig's own dmx block, so the test warns only when the rig gives none. It was red on the show branch itself (since 94dfe77d).
- Fix 2: `rig-generate-py.test.js` (from dev, #982) proved the hang + scenes = the energy rig; after the merge both were behind the show. `moxir-hang-v2-11` taken again by `rig_generate.py hang` (the 40 W dmx), `moxir-v2-11-energy` fixtures + looks rewritten by `rig_generate.py build`; `check`: same on all 10 keys; each scene's energy unchanged.
- Checks: src/rigbuild + scripts/place + scripts/rigbuild 2264 passed, 0 failed (local). Full suite: CI on the PR.
- Earlier landings: #971, #986; #997 and #992 closed in favour of this one.
