## 2026-10-09 — MOXIR: the two Poligraf UP-LA40WF up at the entry, house left, pass the cubes' rule at +0.165 m

- **Asked.** The owner (~20:30, N460.2 / N462): *"2 lasers from poli goes to the up to the entrance, where audience will enter, so 2 from one side 6 from other"*. Then N464 (21:1x): the cubes sit ON the free crane, so there is no hang under it.
- **The tool.** `scripts/place/moxir_entry_lasers.py` places the two units under the cubes' rule set (MOXIR.md §4.0a) and writes `scripts/place/rigs/moxir-v2-entry-lasers-2026-10-09.json`. Each run produces the mount options, both beams with every margin, the 61-ray casts, the setup sheet, the NOHD and the keep-out envelope for the cubes' new ends. The source text is MOXIR.md §4.0b.
- **The guard.** `scripts/place/moxir-entry-lasers.test.js`, 9 tests. Seen failing on a tampered rig (3 failed), then 9 passed.
- **Result: passes these checks, not "safe".** A truss tower + T-bar at z 48, house left; worst margin +0.165 m (the near crane at its safe 7.2 underside). House left is the only side with a line. The NOHD is 1 097 m, so separation and a hard stop (an aperture mask, owed) are the control.
- **Rerun** (about 40 s; heat rule: one BLAS thread, `cool.py` first). The v2 spread lamps are read from git at the pinned `--spread-commit`, so fetch that branch first:

  ```
  git fetch origin feat/moxir-v2-spread-2026-10-09
  python3 -I scripts/place/moxir_entry_lasers.py --repo . --out ~/Downloads/moxir/v2-entry-lasers
  npx vitest run scripts/place/moxir-entry-lasers.test.js --maxWorkers 1
  ```

- **Trap 1:** the hall GLB still draws the free crane at z −41. The script moves it to z −12, as `moxir_v2_spread.night_world` does.
- **Trap 2:** a sight line's eye stands inside the people volume. Skip it (`skip_cls=('audience',)`), or every sample reads "seen".
- **Trap 3:** the v1.1 crane check widens each girder's z band by the tube radius. A second implementation must do the same, or it differs by about 1.5 cm.
- **Trap 4:** never name a numeric key `total` in a rig json: the public-repo price guard reads it as a price.
- **Still undone:** MOXIR.md §4.0b "Owed before any emission" and §6 row 15. The first item is the aperture masks, the hard stop. There is no build into the scene or a scratch stack yet.
