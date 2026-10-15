## 2026-10-15 — Landing the four migrations as one batch (#982 #983 #984 #985)

All four were green but BEHIND dev after #986; merged `--no-ff` in PR order onto origin/dev with no conflicts (batch route, #962 of the same day).
One fix inside the batch: dev's #986 added `kit_makers` to the rig, so the committed hang `moxir-hang-v2-11-2026-10-15.json` was regenerated with `rig_generate.py hang` (the test compares it with the hang taken from the rig).
Measured: `vitest run scripts/place scripts/rigbuild scripts/measure` 88 files, 1481 passed after the fix; `npm run lint` 0 errors.
