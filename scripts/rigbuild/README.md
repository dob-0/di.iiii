# scripts/rigbuild — the rig-build base, from the terminal

Method and data model: `docs/architecture/RIG_BUILD.md`. Code the views use: `src/rigbuild/`.

| command | what it does |
|---|---|
| `node scripts/rigbuild/types.mjs [--check]` | regenerate `src/rigbuild/types/moxir.json` from `scripts/place/fixtures/fixtures.json` (never edit the JSON by hand) |
| `node scripts/rigbuild/pieces-glb.mjs [--check]` | regenerate the truss / tower / deck bodies in `scripts/rigbuild/pieces/` from `src/rigbuild/pieces.js` |
| `node scripts/rigbuild/patch.mjs --project <id> [--group] [--repatch] [--dry-run]` | auto-patch a whole project on the desk at `<api origin>/light/` and write the answer back as ops |
| `node scripts/rigbuild/patch.mjs --project <id> --exact` · `--unpatch` | the document's addresses ARE the patch: off the desk, back exactly there (refused + exit 1 on any clash, never "next free") · take a room's fixtures off the desk, document unchanged |
| `node scripts/rigbuild/patch-plan.mjs --plan scripts/place/rigs/<show>.patch.json [--dry-run]` | a show's PLANNED patch (blocks select lamps from the document by type / position / height / side — survives a re-hang; universe per data run, round starts, fixture numbers, mode per type, unit, side) written into the document as one batch of ops, circuits re-proposed per position (RIG_BUILD §19) |
| `node scripts/rigbuild/desk-plan.mjs --space <id> --project <id> --out <dir> [--gate <plan>]` · `--apply <dir>` · `--undo <backup>` | ONE chosen version onto its space's desk, planned OFFLINE on a copy of the show by the desk's own code: every other version's rig fixtures off (all universes), the chosen one at EXACTLY the document's addresses (fails, never "next free"), its looks on, the document's cue list loaded with loop OFF and not started, OUTPUT never touched. Dry run by default; `--apply` (desk stopped: `di down`) backs up to `~/di-backups/` and swaps the show file; `--undo` restores it (RIG_BUILD §19.5) |
| `node scripts/rigbuild/patch-sheet.mjs --plan <plan> --out <dir> [--pdf]` | the crew's sheet from the document: node ports, patch by universe (set-mode, set-on-unit, Art-Net/sACN), schedule by position, power, channel lists; `patch.csv`, `power.csv`, `node-plan.csv`, PDF; exit 1 if the document drifts from its plan or the desk |
| `node scripts/rigbuild/moxir.mjs --hall <hall.json> --out <dir>` | MOXIR end to end OFFLINE: rig hung, lamps typed, patched on a throwaway desk, circuits, `patch-sheet.html`, `patch.csv`, `power.csv`, `moxir-rig.document.json` |
| `node scripts/rigbuild/ground-movers.mjs [--check]` | the "movers on the ground" policy (RIG_BUILD §15.12): the candidate ground places measured from the hall model, and every mover's cone against the dance zone, written to `scripts/place/rigs/moxir-ground-movers-2026-09-30.json` (generated; `--check` exits 1 when stale). `ground-movers.test.js` holds every rig file that opts in with `policy.movingFixtures.ground_only` |
| `node scripts/rigbuild/export-mvr.mjs --document <doc.json> \| --project <id> --out <file.mvr> [--gdtf-dir <dir>]` | the rig as MVR 1.6 with one authored GDTF 1.2 per type |
| `node scripts/rigbuild/footprints.mjs [--version minimal-ground,full-ground] [--look <id>] [--rig <file>] [--out <dir>] [--words]` | what every lamp of a rig version really lights, per look: where its aim lands (floor / wall / roof / column / truss / crane / machine / DJ riser / open air), the throw, the beam angle and its photometry basis, the spot and its ellipse, the lux at the spot's centre (E = I cos(incidence) / d^2, I from the type's optics; "no figure" when the optics carry none), the flags (wide, tight, dim, borrowed). Direct light only, pure math, not seen on a screen. Writes `footprints-<id>.md` / `.csv` to `~/Downloads/moxir-devices` (`footprints.test.js` holds the formulas and the ray). |
| `node scripts/rigbuild/validate-mvr.mjs <file.mvr>` | XSD validation (pinned, sha256-checked download of mvrdevelopment/tools@e199c6ed; needs `xmllint`) plus the rules the XSD cannot express |

The MOXIR run of 2026-09-28, in order:

```bash
node scripts/rigbuild/moxir.mjs --hall /mnt/data/footage/place-moxir-hall-v2/hall.json --out /tmp/moxir-rig
node scripts/rigbuild/export-mvr.mjs --document /tmp/moxir-rig/moxir-rig.document.json --out /tmp/moxir-rig/moxir.mvr --gdtf-dir /tmp/moxir-rig/gdtf
node scripts/rigbuild/validate-mvr.mjs /tmp/moxir-rig/moxir.mvr
```

Nothing here writes to a di.iiii unless given `--project` (patch.mjs writes ops;
export-mvr only reads). `hall.json` is written by `scripts/place/hall.py` and is not
in the repository.

MOXIR Minimal's show patch (2026-09-29, RIG_BUILD §19), in order:

```bash
node scripts/rigbuild/patch-plan.mjs --plan scripts/place/rigs/moxir-2026-10-17-minimal.patch.json
for p in moxir-hall moxir-hall-middle moxir-hall-full; do node scripts/rigbuild/patch.mjs --project $p --unpatch; done
node scripts/rigbuild/patch.mjs --project moxir-hall-minimal --exact
node scripts/rigbuild/show-loop.mjs --project moxir-hall-minimal          # the looks back on the desk, with their DMX
node scripts/rigbuild/patch-sheet.mjs --plan scripts/place/rigs/moxir-2026-10-17-minimal.patch.json --out ~/Downloads/moxir-patch --pdf
node scripts/rigbuild/export-mvr.mjs --project moxir-hall-minimal --out ~/Downloads/moxir-patch/moxir-minimal.mvr
```
