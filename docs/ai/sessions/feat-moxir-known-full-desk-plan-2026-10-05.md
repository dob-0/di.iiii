## 2026-10-05 — desk-plan.mjs: MOXIR Known · full onto the moxir desk, planned offline, exact or fail (audit B1/B2)

- New `scripts/rigbuild/desk-plan.mjs` (RIG_BUILD §19.6): plans ONE chosen version onto its space's desk on a
  COPY of the show, with the desk's own code offline; every other version's rig fixtures off (all universes),
  the chosen project at exactly the document's addresses or exit 1, looks on, the document's cue list loaded
  with loop OFF and not started, OUTPUT never touched. `--gate` runs patch-sheet.mjs against the planned show;
  `--apply` (desk stopped) backs up to `~/di-backups/` and swaps the file; `--undo` restores.
- Dry run on a copy of aylmo's moxir desk (sha256 1adeeb05…): 241 off (U1 62, U2 49, U3 36, U4 54, U5 40),
  68 on (U1 57 / 512 ch, U2 11 / 176 ch); 25 looks; 10 cues, 114 s, loop off; gate PASS; negative control exit 1.
  Output in `~/Downloads/moxir-desk-plan-2026-10-05/`. The live desk was NOT changed: applying is the owner's.
- Fixed: `planPatch` counted off-DMX lamps as "in no block" (Known · full has 16), so no sheet could pass.
- `moxir-2026-10-17-known-full.patch.json` = the patch AS DOCUMENTED (0 ops), not the data-run plan (audit W1, owed).
- Open: at rest the planned desk is NOT dark (desk fixtures rest at dimmer 255: 227 non-zero ch on U1, 44 on U2) —
  OUTPUT on before the first GO lights every lamp; the owner's call. The crew sheet says "maker's" for the
  TESTED (Sevan) channel lists (audit B5). Not seen in a browser.
- INCIDENT 02:01:20: testing apply's "is the desk stopped?" probe, `GET https://local.thedi.studio/light/api/show`
  BUILT the lazy installed desk, which resumed the Minimal's saved running loop (OUTPUT stayed off: no DMX).
  Probe fixed to `/light/api/clock` (never builds the desk); known-fixes row. The desk was left as it is; `di down` stops it.
- Apply flow corrected: `di down` FIRST, plan from the stopped show (document from dev), apply, `di up` — a running
  desk saves at every cue, so a plan made while it runs is stale (apply's sha check refuses it).

## 2026-10-14 — refreshed onto dev

- Merged `origin/dev` (84fc193c). Conflicts: `known-fixes.md` (both kept) and `RIG_BUILD.md` (both §19.5 headings: dev's "MOXIR v2" keeps §19.5, this PR's section is now §19.6, and its references in `desk-plan.mjs`, `desk-plan.test.js`, `scripts/rigbuild/README.md` and this note were renumbered).
- Dropped the part that failed tests: this PR's `planPatch` change in `src/rigbuild/patchPlan.js` (+ its test "lamps off DMX"). It skipped every `fixture.dmx === false` lamp; dev's MOXIR v2 `planPatch` already leaves them alone unless a block names them, and the blanket skip broke 7 of dev's tests (`moxirV2Patch.test.js`, `patchPlan.test.js`). `desk-plan.mjs` and its test are untouched by the drop.
- Tests (`src/rigbuild`, `scripts/rigbuild`): before 1243/1243 (89 files). After the merge with the change kept: 1602 passed / 7 failed. After dropping it (and its test): 1608/1608 (121 files; the larger count is dev's added tests).
- UNVERIFIED: the dry-run numbers in the PR body (57 on U1 etc.) were measured on Known · full v2 of 10-05; dev has since redesigned the MOXIR patch (two universes, `moxir-v2-patch-2026-10-09.json`), so they were not re-measured and `moxir-2026-10-17-known-full.patch.json` ("the patch as documented") was not re-checked against the current document. `desk-plan.test.js` passes, which does not prove that.
