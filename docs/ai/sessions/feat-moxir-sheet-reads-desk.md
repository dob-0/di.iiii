## 2026-09-30 — MOXIR patch sheet reads the desk (the sheet and the room tell one truth)

Branch `feat/moxir-sheet-reads-desk` (from `fix/moxir-square-controls`). Code and tests only.
**NOT seen on a real screen.** No browser was used; everything below is from reading code and running
unit tests (vitest, jsdom). The owner has not looked at any of it.

### The bug

Measured on the owner's install (rigbuilder.10), version `moxir-hall-minimal-cut-movers`: the sheet page
said `36 (0 patched)`, universes `—`, while the room's steps row said `29 of 36 addressed`. The sheet was
built from the project document alone; the document holds no address until a patch step writes one back,
and the addresses live on the desk (lighting `show.json`, `GET /light/api/rig?project=`). The sheet page
already fetched that desk list but only used it to flag `desk-differs` / `not-on-desk`.

### What changed

- `src/rigbuild/sheet.js` `sheetModel`: when the desk on this machine holds any of this project's
  fixtures (`source: 'desk'`), each lamp's universe and address are the desk's, so the table, the
  `patched / universes / channels` counts, the overlap check and the Flags all follow the desk. A lamp the
  desk does not hold is unaddressed (flag `not-patched`; `not-on-desk` if the document had an address for
  it); a document address that differs keeps `desk-differs` with a note. Desk present but holding none of
  this project: `source: 'document'`. No desk: `source: 'none'`. The model carries `source` and `deskHeld`.
  The header lists `addresses: from the desk on this machine / from the document (...)`.
- `src/rigbuild/plotModel.js`, `rigProgress.js`: optional `desk` passed through to the same `sheetModel`,
  so there is one reader and one counting path.
- `src/rigbuild/PatchSheetSurface.jsx`: the sheet's own steps row uses `rigProgress({ desk })`; the footer
  names the source, and says `No desk on this tier` where there is none (hosted and visitor tiers keep the
  document-only behaviour).
- Not touched: any address or patch data, plan scripts, CSV column layout, the desk itself (the sheet
  never POSTs a patch).

### Tests

Touched suites: `sheet.test.js`, `rigProgress.test.js`, `PatchSheetSurface.test.jsx`, `plotModel.test.js`,
`rigSteps.test.jsx`: 53 pass with the change; with the four source files reverted to base, 8 fail (fixtures:
36 lamps, 29 patched on the desk). eslint on the touched files: 0 errors. Full suite not run (budget).

### Owed

- Look at it on the owner's screen (desktop and phone): `/moxir/patch/moxir-hall-minimal-cut-movers`.
- The room's `N to decide` also counts the desk's refusal flags (`no-room`, `profile-clash`, ...), which
  exist only in the answer to the room's own auto-patch POST; `GET /api/rig` does not return them. A
  lamp the desk refused is not on the desk, so the sheet shows it as unaddressed, not as a conflict, and the
  two `to decide` counts can still differ by those refusals. Fix needs the desk to keep and serve its last
  flags (serverXR/src/lighting), a change to the desk, not done here.
- The 4 UP-B380F overlapping the studio's own fixtures on U1 are other fixtures on the desk that
  `GET /api/rig?project=` does not return, so the sheet cannot show that overlap either. Owner decides.
- CSV gains no source column (layout untouched); a source column only with a stability test.
