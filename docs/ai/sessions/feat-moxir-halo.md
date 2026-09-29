## 2026-09-29 — the halo: option 6 of the ten truss versions, as comparison variants of MOXIR's Minimal

- Asked: build the owner's second candidate hang, "halo" (a flat triangle of 3 × 4 m truss at 6 m over
  the DJ, hung from the crane on 3 hoists, beams closing in a cone round the DJ and opening to the crowd),
  as a SEPARATE project beside Minimal, to compare with option 4 ("the cut", another agent, on Minimal).
  Mid-task the owner's direction came: the first version of each design is SIMPLE — no moving heads, only the
  rental house's fixed lights (UP-PL5403, UP-COB200). And a safety concern: moving heads may swing a
  chain-hung truss → bridles, the shortest drop, speed limits in the looks.
- Built (RIG_BUILD.md §15.8): two comparison VARIANTS in the versions file (`variants`) —
  `minimal-halo` (simple, fixed lights) and `minimal-halo-heads` (moving heads). Same generator, loader and
  safety tests as the set; a variant has its own looks/groups/classes, lists itself in its own switch
  without rewriting the set's projects, copies its room read-only from Minimal (`--hall-from`), and loads
  unpatched (never joined to the desk's DMX).
- rig-lib: `truss.shape: 'triangle'` (`haloGeometry`, the `halo` mount with `halo_at`, `haloEntities`: sides,
  60° corner blocks, a V bridle + hoist + chain + safety steel per corner, the apex's outrigger), rules
  `ring`, `dj-point`, `radial` (ported to src/rigbuild/lookRules.js, held equal). versions.mjs: `haloTruss`
  — barycentric point loads, the outrigger's clamp reactions (uplift), the pendulum period.
- The show plays by the document's clock even beside a desk: `mappingState.showSource: 'clock'` (both
  schema twins), `showDriver`; `show-loop.mjs --rig … --document-only` writes the rig's own show with no
  desk call. The room poses halo lamps by their NAMED position (`namedPositionKey`, "halo <group>").
- New fixture: UP-COB200 (fixtures.json `cob200`, our par-archetype model to the maker's page's 295 × 295 ×
  350 mm, types regenerated, FixtureBodies). No photometry published → a hand-set intensity, labelled.
- Sources opened today: Global Truss F34C20 60° corner (8.80 kg), F34300 (16 kg), F34400 (21 kg) on
  globaltruss.de; ChainMaster D8Plus 500 kg data sheet (20 kg body, 0.59 kg/m chain, dimension sheet); the
  UP-COB200 store page (no lux/lumens).
- Numbers: simple 264 kg on 3 corners (92 / 86 / 86), heads 304 kg (113 / 95 / 95); outrigger back clamps
  pulled up 70 / 82 kg; pendulum T ≈ 2.9 / 3.0 s; the room's aim = the script's to 0.008°.
- Guards seen red without their fix: the named-position grouping (halo.test.js "the room poses the halo"),
  showSource precedence (showClock.test.js + halo.test.js). A 19° room-vs-script mismatch on the bridge PARs
  was found by that test: normalizeRigLooks keeps numeric aim params only, so a string `girder: 'nearest'`
  was dropped → split into two groups with girder −1.1 / +1.1.
- Data on the owner's install (0.4.16-rigbuilder.9): `~/di-backups/preview-rig-builder-2026-09-28/moxir-halo.sh`
  (a `di save` before every write; `undo` deletes the variant's project). Minimal, moxir-hall and the desk
  were not written.
- Owed: see RIG_BUILD.md §15.8 "Owed" — the C20 leg (DWG), a rigging/structural sign-off (the outrigger is a
  cantilever), the rail height, COB photometry and channel order, and a preview build with this branch
  installed before the halo plays by its clock on the owner's machine.
