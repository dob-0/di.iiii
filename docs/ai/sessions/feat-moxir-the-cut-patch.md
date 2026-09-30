# feat/moxir-the-cut-patch — the cut's show patch (2026-09-29)

Stacked on `feat/moxir-patch` (#659); the rig itself is `feat/moxir-the-cut`
(RIG_BUILD §15.8, session note `feat-moxir-the-cut.md`).

## What landed

- Minimal's patch plan re-made for the cut, simple: U1 = the cut (7 UP-COB200 curtain @001,
  6 PL5403 X @101, 4 PL5403 grazers @201), U2/U3 = pillars + column uplights per side,
  U4 = press + hazers (`scripts/place/rigs/moxir-2026-10-17-minimal.patch.json`).
- UP-COB200: an ASSUMED 4ch list (FOS PAR COB 200W LED TW manual p.5, a4CH) — the maker
  publishes none; the rental house's chart is owed. The desk encodes/decodes a warm/cool
  pair: a look colour is placed between 3200 K and 5600 K by its blue/red balance
  (`dmxDecode.js`, tested).
- `vis-see.mjs` runs `--trials 0 --cues` on a rig with no moving head; the head pick is
  `vis-head.mjs` (tested; known-fixes row).

## Seen

2026-09-29 23:41, the install 0.4.16-rigbuilder.9, RTX 3080 via PRIME, 61 fps): the split
visualiser plays all 5 cues through the new patch — 27 PL5403 driven, levels and colours change
per cue; the 7 UP-COB200 are NOT driven there (the installed build does not know the type), so
the curtain stays at its rest light. Frames `~/Downloads/moxir-the-cut/visualiser/`.
Owed: a preview install carrying both branches.

## Rebase onto #659's rebase (dev 76834691, 2026-09-30)

Rebased with `git rebase --onto feat/moxir-patch ab793391`; no textual conflicts. Decisions:

- Dev's #664 (the cut as one straight 12 m diagonal) changed the rig; this plan's position
  selectors (`truss header`, `truss top`, `column bases`, `column uplight`) and types were
  checked against the current local document: `patch-plan.mjs --dry-run` plans all 36 lamps on
  four universes with no error (U1 17 lamps, U2 7, U3 7, U4 5). No address, universe or height
  was changed; dev's document is the truth and the plan fits it.
- `RIG_BUILD.md` numbering: dev took section 18, so #659's visualiser is 19 and its show patch 20;
  this branch's `§18.x` references (vis-head.mjs, the COB200 note in the plan) are now `§19.x`.
- `types/moxir.json` regenerated (`node scripts/rigbuild/types.mjs`): UP-COB200 now carries the
  assumed 4ch mode this branch's generator gives it; the committed file was stale after the merge.
