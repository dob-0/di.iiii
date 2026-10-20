## 2026-10-07 — Agent door: read-only rig tools

- Owner 2026-10-07: "create agents and MCPs for this work … what we create, it learns, so in future we
  don't spend credits doing the same". The door (PR #567, `sdk/mcp.mjs`) gets four read-only rig tools,
  `sdk/rig.js`: `di_rig_versions`, `di_rig_check`, `di_rig_truss`, `di_production_archive_plan`.
  Spec: `docs/architecture/SPEC_agent_door.md` §5.1; `sdk/README.md`; kit card (`src/kit/kitCatalogue.js`).
- Built on the rig build's own functions (versions.mjs, rig-lib pickGeometry/stageFrame/buildRig,
  ground-movers groundPolicyViolations/isLaser, archive-versions planArchive). No geometry re-derived.
  No tool writes; `sdk/rig.test.js` proves only GET reaches the connection and no fs write runs.
- Merged `origin/feat/moxir-truss-flip-2026-10-07` (for archive-versions.mjs and the flipped Known · full).
- Measured (bytes; no token counter here): di_rig_versions 7,152 B vs the 203,109 B versions file (28×);
  di_rig_truss known-full 2,124 B vs the 101,496 B rig file; di_rig_check 12 versions in 2.6 s;
  tools/list 3,685 → 6,722 B.
- Found: `versions.test.js`'s laser ≥ 3 m test filters `fixture === 'laser'`, so it checks none of Known ·
  full's six LaserCubes (fixture "lasercube"); groundPolicyViolations (isLaser) does cover them. The tool
  uses isLaser: 150 beams checked on Known · full, pass. Fixing the test is owed.
- Owed: tie-off/cab clash, inside-the-walls, laser-vs-lantern are test-local in PR #772 — export them to a
  module when #772 lands, then wire into di_rig_check (listed `unavailable` until then). Not registered in
  anyone's Claude config; the owner decides.
- Env note: the main checkout's node_modules lacks `@modelcontextprotocol/server` 2.1.0 (stale install);
  this worktree ran `npm ci`. Its symlinked serverXR/node_modules has multer 2.2.0 vs 2.4.0 pinned, so
  kitCatalogue's "installed version" test fails here (not from this change).
