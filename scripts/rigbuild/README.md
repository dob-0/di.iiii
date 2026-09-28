# scripts/rigbuild — the rig-build base, from the terminal

Method and data model: `docs/architecture/RIG_BUILD.md`. Code the views use: `src/rigbuild/`.

| command | what it does |
|---|---|
| `node scripts/rigbuild/types.mjs [--check]` | regenerate `src/rigbuild/types/moxir.json` from `scripts/place/fixtures/fixtures.json` (never edit the JSON by hand) |
| `node scripts/rigbuild/pieces-glb.mjs [--check]` | regenerate the truss / tower / deck bodies in `scripts/rigbuild/pieces/` from `src/rigbuild/pieces.js` |
| `node scripts/rigbuild/patch.mjs --project <id> [--group] [--repatch] [--dry-run]` | auto-patch a whole project on the desk at `<api origin>/light/` and write the answer back as ops |
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
