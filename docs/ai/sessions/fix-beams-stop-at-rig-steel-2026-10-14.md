## 2026-10-14 — Beams stop at the rig's steel too

Branch `fix/beams-stop-at-rig-steel-2026-10-14`, from `fix/moxir-selection-box-and-scenes-2026-10-13`.

- **Rule (owner, physics first):** light stops at the first surface it meets — wall, roof, floor, or steel.
- **What counts as steel (by what it is, no production name in code):** a build piece whose catalogue category is `truss` or `tower`
  (`components.piece`), or any entity with `components.occluder = { kind: 'steel' }`. A lamp (light/fixture) is never steel. Decks,
  speakers and barriers are not counted (not asked). Why a component: crane bridges, girders and hoist steel are plain boxes with no
  catalogue kind; a flag on the entity is the only thing that says what they are, and it survives the schema untouched.
- **Run time:** `beamReach.buildingOf` also collects meshes under a group tagged `userData.svSteel` (LiveProjectScene and Studio's
  `pickUserData` tag it). They join the cast list but not the haze box. `castFromLamp` skips a steel mesh whose world box grown by
  `MOUNT_CLEARANCE` (0.25 m) holds the lamp's lens — its own mount.
- **Build:** `epic-build.mjs` sets the flag on new builds (`isSteelSolid`: kind tower/truss*, `steel: true`, or a structural word in
  the solid's id). `--tag-steel-only` (dry run; `--apply` writes) sends `updateComponent occluder` on existing entities only.
- **Hand-over for the lead:** run `--tag-steel-only` dry on the MOXIR project, read the entity list, then `--apply` (back up first).
  The hall model's own crane (mesh `hall-crane`) is part of the hall model and already the building.
- **Tests:** see the PR body for counts. UNVERIFIED: `scripts/place/physics_check.py`; looking from the floor and from outside in a
  real browser, desktop and phone.
