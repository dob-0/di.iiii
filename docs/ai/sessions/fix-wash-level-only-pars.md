## 2026-09-30 — the baked wash follows the PARs, not the movers that stand beside them

- The room-light audit (docs/room-light-and-reflections-audit) found that `washLevelOf` (src/rigbuild/looks.js) took the level of ANY lamp group at a washing position — column-faces, outer-columns, backdrop, dance-columns. In the ground versions the moving heads stand at those positions too, so their level kept the baked column/press glow lit in scenes whose PARs were out (one shaft, roof reveal, slow fan, cross beams, laser roof).
- Now only PAR groups (`up-pl5403`, the lamps wash-glb.mjs bakes) steer the wash level; a key with no type keeps the old rule; a look with no PAR at a washing position leaves the wash at 1 as before.
- Tests: `rigFlash.test.jsx` gains three ground-case assertions; 17 pass with the change, and the wash test fails with only `looks.js` reverted.
- Effect to expect: in scenes whose PARs are out the columns are now dark instead of glowing — closer to the design, and darker than what the owner saw. The brightness fix is the light pool (feat/room-light-pool) and a wash per look (owed).
- Not seen on a real screen.
