# scripts/rigbuild — the rig-build base, from the terminal

Method and data model: `docs/architecture/RIG_BUILD.md`. Code the views use: `src/rigbuild/`.

| command | what it does |
|---|---|
| `node scripts/rigbuild/types.mjs [--check]` | regenerate `src/rigbuild/types/moxir.json` from `scripts/place/fixtures/fixtures.json` (never edit the JSON by hand) |
| `node scripts/rigbuild/pieces-glb.mjs [--check]` | regenerate the truss / tower / deck bodies in `scripts/rigbuild/pieces/` from `src/rigbuild/pieces.js` |
| `node scripts/rigbuild/patch.mjs --project <id> [--group] [--repatch] [--dry-run]` | auto-patch a whole project on the desk at `<api origin>/light/` and write the answer back as ops |
| `node scripts/rigbuild/patch.mjs --project <id> --exact` · `--unpatch` | the document's addresses ARE the patch: off the desk, back exactly there (refused + exit 1 on any clash, never "next free") · take a room's fixtures off the desk, document unchanged |
| `node scripts/rigbuild/patch-plan.mjs --plan scripts/place/rigs/<show>.patch.json [--dry-run]` | a show's PLANNED patch (universe per data run, round starts, fixture numbers, mode per type, unit, side) written into the document as one batch of ops, circuits re-proposed per position (RIG_BUILD §19) |
| `node scripts/rigbuild/patch-sheet.mjs --plan <plan> --out <dir> [--pdf]` | the crew's sheet from the document: node ports, patch by universe (set-mode, set-on-unit, Art-Net/sACN), schedule by position, power, channel lists; `patch.csv`, `power.csv`, `node-plan.csv`, PDF; exit 1 if the document drifts from its plan or the desk |
| `node scripts/rigbuild/moxir.mjs --hall <hall.json> --out <dir>` | MOXIR end to end OFFLINE: rig hung, lamps typed, patched on a throwaway desk, circuits, `patch-sheet.html`, `patch.csv`, `power.csv`, `moxir-rig.document.json` |
| `node scripts/rigbuild/export-mvr.mjs --document <doc.json> \| --project <id> --out <file.mvr> [--gdtf-dir <dir>]` | the rig as MVR 1.6 with one authored GDTF 1.2 per type |
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
