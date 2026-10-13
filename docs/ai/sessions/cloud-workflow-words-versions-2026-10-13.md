## 2026-10-13 — the connected workflow drawn: a Nodes wire now fires a project's look; words and versions planned

Cloud routine, base `fix/moxir-selection-box-and-scenes-2026-10-13`. Plan:
`docs/ai/plans/2026-10-13-connected-workflow-words-versions.md`.

- **Drawn**: the real chain Studio → looks → Light → lamps and room, Nodes → Light, Nodes → Laser Out → LaserCubes
  and room, with eight gaps sized S/M/L (G1–G8) and five version steps (V1–V5).
- **G1 built (S)**: the DMX Out node's Scene port reached only the desk's scenes, while the Cards page puts a project's
  looks on the desk as looks (`rig-<id>`). On a miss it now reads `GET /light/api/fireable` and fires the look
  (`POST /looks/fire`) by desk id, project look id or title; a scene still wins, an unknown word fires nothing.
  Wiki `dmx-out-node` updated, known-fixes row added.
- **G2 built (S)**: the Studio's scene picker found the show by the id `rig-show`; now by the entity carrying the
  looks, like the other four readers. Latent (every document today uses `rig-show`).
- **Words proposed, nothing renamed**: `docs/ai/vocabulary.md` "Proposed 2026-10-13" — **look** / **cue** / **show**
  for the lighting words (the Studio says *scene*, Cards and Light say *look*, and *scene* already means the 3D
  place); two readings of "the Dilijan things" with a word each. Owner's pick.
- **Versions**: measured that the Studio has no version control at all (every status change is a script) and the row
  has three sources; V1 (row in the Studio) → V2 (status from inside) → V4 (migrate, retire `siblings`) → V3 (copy).
- **Tests**: the touched area at base 26 files / 221 tests → 27 / 226 here (+5: 2 `dmxRigClient`, 1
  `DmxOutPanelWindow`, 2 `scenesOf`; both guards seen red without their fix). Full suite after: 928 files, 10487 tests — 10423 passed, 4 failed, 2 expected fail, 58 skipped. The before run raced this branch's edits (started before them, picked some up), so its 10485 is not a clean base; base = 10487 − 5 new = 10482.
  `scripts/di/oneAddressPrinted.test.js` fails 4 in this container (`diiii.localhost` does not resolve here) —
  untouched by this branch.
- **UNVERIFIED**: nothing ran against a real Light desk, lamp or LaserCube; no browser look (the DMX Out panel's
  look-firing is proven at the fetch boundary only). The inventory plan this one reads (§B, C3) is on PR #901's
  branch, not on this base.
- **Next**: G6 (scope the look match to the desk's loaded project) after one real desk run, then G3 (a Show source
  node so the lasers can follow the looks), and V1 (the version row in the Studio) with a desktop + phone look.
