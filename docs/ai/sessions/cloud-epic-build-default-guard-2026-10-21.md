## 2026-10-21 — epic-build refuses its destructive default mode on a built project (N767 guard)

- `scripts/rigbuild/epic-build.mjs`: `NARROW_MODES` (9 modes) is the one list `main()` dispatches on. With none given, `defaultModeRefusal(doc, rig)` runs right after the read, before the first write (the version-list title write used to run first): a project holding rig units gets exit 1 naming the units it would delete and create, how many carry `beam.laser.frames`, and the narrow modes. A first build (no rig unit) runs as before; `--looks-only` is never refused.
- `--rebuild-all` lets the default mode through on purpose; with `--apply` it also needs `--out <dir>`, and `epic-build-<project>-before.json` is written there before the first op. The read-back after writing is unchanged.
- `--lasers-only` is now a dry run unless `--apply` (it posted ops without it).
- Tests: `scripts/rigbuild/epic-build.test.js` 18 → 25; the 7 new ones are red on dev 55a5d963 (dev POSTs on a default `--apply` and on `--lasers-only` without `--apply`). CLI tests run the tool against a stub serverXR on 127.0.0.1.
- Docs: `venue-to-show.md` traps and the owed lists (N767 closed), `show-scenes-job.md` item 8, a `known-fixes.md` entry.
- Not tested: a real scratch stack (di-dev `--api scratch`) with a real built project; the default path past the stage frame with `--rebuild-all --apply --out` against a real document.
