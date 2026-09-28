## 2026-09-28 — view A, the room in first person: `/{space}/build/{project}` and `/{space}/crew/{project}`

- The owner asked for A first ("like in minecraft … easy connect to our light system") and
  chose all three views; B and C were built first. Sketch A at
  `~/Downloads/moxir-build-sketches/sketches.html`. Method and checks: `RIG_BUILD.md` §12.
- Stacked on #616 as draft PRs: `feat/rig-build-3d` (base: aim, hotbar, tags, walk seams,
  the float fix) → `feat/rig-build-3d-room` (the surface, desktop) → `feat/rig-build-3d-phone`
  → `feat/rig-build-3d-crew` (crew view, docs).
- Reused, not rebuilt: `LiveProjectScene` (three optional seams), `snap()`, `plotEdits`,
  `rental.js`, `plotModel`/`CONFLICT_CODES`, `useRigAutoPatch`, `useRigLookEntities`, the
  plot's `Inspector` (now exported), `fixture-lib.mjs aimFixture` for the bodies. The piece
  upload moved into `usePieceAssets` and the plot uses it too.
- Own stack: server :4391, vite :5391 (never 4000/443/80/4371/5371/4383/5383), data a copy
  exported from the local tier into the session scratchpad (`rigbuild3d/`), baseline bundle
  `rigbuild3d-baseline.tar.gz` there. Scripts: `rigbuild3d-gpu.mjs` + `steps-*.mjs`.
- Thermal: GPU browser only (PRIME env + ANGLE/Vulkan, renderer string refused unless NVIDIA),
  one at a time, each run started below 80 °C; the package peaked at 91 °C after the crew run.
  2D checks headless with `--disable-3d-apis`.
- Trap: the first GPU page got NO WebGL2 — ANGLE/Vulkan under PRIME refuses
  `powerPreference: 'high-performance'`, which is what LiveProjectScene's Canvas asks (the
  Studio asks `'default'`). The harness rewrites the hint; the product question is owed.
- Owed: see §12.7.
