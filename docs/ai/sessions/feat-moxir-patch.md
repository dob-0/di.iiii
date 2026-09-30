## 2026-09-29 — MOXIR Minimal's show patch, planned: four universes on four node ports, and the channel lists searched again

Owner: the rig "maximum close" to reality — real channel lists and a real, final patch the crew
sets from our sheet. Method and numbers: `docs/architecture/RIG_BUILD.md` §19.

- The show patch as data: `scripts/place/rigs/moxir-2026-10-17-minimal.patch.json` (one universe per
  data run — crane line, each side wall, the booth — blocks on 001/101/201/301, fixture # = universe
  hundreds, half of every universe spare, mode per type with reasons). `src/rigbuild/patchPlan.js`
  (pure, tested) lays it out; `scripts/rigbuild/patch-plan.mjs` writes it into the document in one batch
  or refuses it whole; `patch.mjs --exact` puts the desk at exactly the document's addresses (never
  "next free"), `--unpatch` takes another version off the desk; `patch-sheet.mjs` prints the crew's
  sheet (HTML/PDF/CSV, node plan, set-mode vs desk-list, channel lists with sources) and exits 1 on drift.
- Research (three lanes): the maker's Chinese site uplight.com.cn gives every type's mode list, no
  channel order anywhere. UP-B380F 16ch and UP-PL5403 8ch are single-mode units (the PARs moved from a
  4ch plan to 8ch; addresses unchanged — spaced 8 on purpose). UP-HK1915 = EQUIVALENT (Aolait AL1019WR,
  same OEM body); UP-LA40WF identified as UPlight's own; the rest STILL ASSUMED. Recorded in
  `fixtures.json` (sources A-CN … LA-CN) and `assumedProfiles.js` (`grade`, `gradeWhy`).
- Fixed on the way (known-fixes + guards seen failing): a colour-only mode could not be put OUT by a
  look (`encodeDmx`); the MVR dropped addresses of lamps whose maker's mode is owed (`mvr.js`); a re-run
  of the plan re-wrote `hung: false` the schema drops (`patchPlan.js`).
- Applied on the owner's install (backups + UNDO in `~/di-backups/preview-rig-builder-2026-09-28/steps/`,
  `*showpatch*`): Minimal U1–U4, 36/36 on the desk, the other three versions off the desk, show loop
  rebuilt with DMX (OUTPUT off). Outputs `~/Downloads/moxir-patch/`.
- Owed: every channel ORDER (questions in `~/Downloads/moxir-patch/questions-for-rental.md`); the press
  PARs sit on no look position (dark in every look — looks lane); inventory cards for the codes now found
  on uplight.com.cn; GDTF Share with the owner's login; the B380F OEM photo-match (search budget ran out).
