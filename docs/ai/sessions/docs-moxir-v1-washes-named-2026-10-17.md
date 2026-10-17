# docs/moxir-v1-washes-named-2026-10-17

## The seven v1 washes that the looks could not find (MOXIR, 2026-10-17 11:05)

- Deep audit agent A (`~/work/agent-reports-2026-10-17/deep-audit-A-washes.md`, VERIFIED with `lookPoses` on the live document)
  found 19 UP-PL5403 washes that no look poses: their `fixture.position` held note text ("this fix color", "this still not has
  address"), so the looks' named groups (`named-v1-rig-par-planes-29/02`, `named-v1-line-C-in0`, `named-v1-line-D-in0`) found no lamp.
- Applied to the live project moxir-v2-11 at 11:05 (v694 -> v708) with `scripts/place/move_lamps.py --backup … --apply`: planes-29/02,
  10/20 and 18/22/16 got the named positions their looks key on (the moves file in this PR, old text kept in "was"). Desk reloaded
  with show-loop --no-start; look-roundtrip: 51 looks, 3060 lamp-looks, on/off 0, light off 0, aim off 0. Lit now: planes-29/02 in
  50 of 51 looks, line C/D washes in 24.
- Undo: restore `/mnt/data/backups/di-backups/moxir-v2-11-before-v1-washes-named-2026-10-17/` (move_lamps.py's backup).
- Still without a group: planes-21, 14, 11, the road washes 09/30/36/15/03/31, U2 u2a/u2b, planes-37 (no address). The v2 scenes
  must name them. The guard that makes this visible is PR #1021 (look-roundtrip "coverage" line).
- Since 11:01 the MOXIR lead is session laser (ledger N1017); whether this change stays in v1 is its call with the owner.
