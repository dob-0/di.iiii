## 2026-10-15 22:4x — show-loop: the document's own cues are the show; no built-in September default

Owner 22:29, screenshot of his Art-Net Desk (`/light/space/moxir/?project=moxir-v2-11`): "why scenes not here" — the desk ran a 5-look show
("The blade · cue 2 of 5": White cathedral + the X, Red room, The hit, Blackout + one shaft, The blade) while v2.11 has 50 scenes.

**Found:** the desk's show (`~/.di/data/spaces/moxir/lighting/show.json`) is per space and was last loaded by an old version. The tool that loads a
version's looks and cue list onto the desk, `show-loop.mjs`, used a hard-coded `MOXIR_MINIMAL_SHOW` when run without `--show`/`--rig` (a production
default in a platform script — Nothing Left Behind rule 2, ledger N874) and in every mode DELETED the document's cues and re-made them under
`show-NN-…` ids, so the Studio's scene editor's 50 cues (`v2-01-the-road-in` …) would have been renamed.

**Changed:** with no `--show`/`--rig` the DOCUMENT's own cue list (`mappingState.cues`) is the show: `showOfDocument()` (look ids back from the
desk's `rig-…` ids, ids kept), `documentCues()` for the runner; nothing is written into the document in that mode; `--project` is required.
`MOXIR_MINIMAL_SHOW` stays exported for the old explicit path only. Tests: `show-loop.test.js` (3 new) + show-clock: 7 passed.
Dry run on his di: 50 cues, one loop 1116 s, "nothing written (the document's own cues)".
**Not tested:** the live load onto his desk (his one-line apply does it: step 4 of `~/di-backups/moxir-patch-by-kind-2026-10-15/apply.sh`).
