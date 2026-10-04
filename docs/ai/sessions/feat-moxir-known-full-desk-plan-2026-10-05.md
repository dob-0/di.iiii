## 2026-10-05 — desk-plan.mjs: MOXIR Known · full onto the moxir desk, planned offline, exact or fail (audit B1/B2)

- New `scripts/rigbuild/desk-plan.mjs` (RIG_BUILD §19.5): plans ONE chosen version onto its space's desk on a
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
