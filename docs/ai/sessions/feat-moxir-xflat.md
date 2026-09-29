## 2026-09-29 — MOXIR candidate "the X lying down": simple (fixed lights) and with heads

- Asked: option 2 of the owner's "ten truss versions" sketch, built as a separate comparison
  version beside Minimal on his install (0.4.16-rigbuilder.9); the cut and the halo were built
  by other sessions at the same time, in other projects. Mid-task the owner added: every
  design's FIRST version is simple (only the rental house's fixed lights, UP-PL5403 and
  UP-COB200, no moving heads), and hung truss must not sway (bridles, tie-offs, shortest drop,
  head-speed limits).
- Built (RIG_BUILD.md §15.8): versions-file `candidates` (a variant of one version, its own
  project, the set's safety tests, not the set's own tests); truss kind `crane-x` in rig-lib
  (two 5 m arms, 4-way junction, `x-top`/`x-under` mounts, drawn bridles, climbing hoists,
  safety steels, 8 restraint steels); aim rule `along-arm` in both copies; aim parameters
  `solo_mask` and `rest_up` (numbers — the schema drops anything else); the UP-COB200 as a
  fixture kind with a Blender body; `load-version --no-mark-from`; `show-loop --doc-only`;
  `rig-look --cameras --no-desk`; `versions-render.sh` rests at nominal; the data script
  `scripts/rigbuild/moxir-xflat.sh` (a `di save` before every write, `undo` deletes only the
  candidate's project).
- On the install: `moxir-hall-minimal-xflat` (simple) and `moxir-hall-minimal-xflat-heads`,
  the hall copied from moxir-hall; moxir-hall, moxir-hall-minimal and the desk untouched.
  Backups `~/di-backups/preview-rig-builder-2026-09-28/steps/*-xflat*`.
- Found on the way: a group id that prefixes another (`par-x` / `par-x-blades`) made rig-lib's
  summary count one group's lamps twice (ids are matched by prefix) — renamed `par-x-bridge`;
  the prefix match itself is left as it is (owed: match `-NN` exactly).
- Tests: `scripts/rigbuild/versions-xflat.test.js` (22), versions.test.js runs the safety tests
  on the candidates, `lookRules.test.js` (along-arm parity), `looks.test.js` (solo_mask parity,
  seen red). Rig suites 593 + new, lint clean on the changed files.
- Owed: the rigging engineer's sign-off (crane rated load, lock-out, hoists + safety steels;
  the cantilevers are outside the maker's span tables); the crane girder's real height (the
  trim is set from it); the junction's leg length from the house; the COB's photometry; the
  installed client learns `along-arm`/`solo_mask`/the COB body only with the next preview build.
