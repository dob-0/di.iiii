## 2026-09-30 — Ground scenes: the column beams no longer aim into their own columns

- Branch `cloud/scenes-reaim-2026-09-30`, cut from `preview/rigbuilder-12-2026-09-30` with `feat/light-footprints` merged in (clean, no conflict). No PR opened.
- The defect (measured by `footprints.mjs`): in `slow-sweep` and `gs-slow-fan` of minimal-ground and full-ground the six column UP-B380F (`beam380-columns-6`) leaned OUT 22-24 degrees toward the side walls. The lamp stands at its column's foot, so each beam ran into its own column at 1.4-1.5 m (a 0.04 m spot at 7.4-7.9 million lux); the room drew it through the column because rig-lib `surfaceHit` knows no columns.
- The fix: the lean is mirrored to IN, the same size. `gs-slow-fan`: `in_deg` -24 to 24 in `scripts/rigbuild/ground-scenes.mjs` (the look's intent line now says the column beams lean in across the nave and the wall beams out). `slow-sweep`: the two ground versions' own `slow-sweep` override in the versions file gets `beam380-columns-6` `vertical, in_deg 22` (the shared base look, which the other versions use, is untouched, as is every non-ground version). Fixture data, counts, positions and the PAR photometry are unchanged; the loops (`gs` cues, 60-90 s), the strobe and the laser rules are untouched.
- Regenerated with the generators: `ground-scenes.mjs` and `versions.mjs`; both `--check` pass, as does `ground-movers.mjs --check`. The generator writes the versions file in its own layout, so that file's diff also shows a few one-line objects opened up (data identical).
- New guard `scripts/rigbuild/ground-aims.test.js`: every lit moving head of every look of both ground versions, first hit within 3 m of a column or any solid fails; it uses footprints' `analyse` (hence its `castRay`), no second ray. It also holds the column B380F of the two looks to the roof at more than 10 m.

### The scenes in words (after)

- slow-sweep (minimal-ground and full-ground): the six column B380F lean in across the nave and throw 17.5 m onto the roof, a 0.55 m spot at about 152,000 lux; the backstage B380F fan as before; the 250BSW (35 %) still meet the columns at 5.5 m (1.5 m spot, 540 lux).
- gs-slow-fan (both): the six column B380F (70 %) lean in and throw 17.8 m onto the roof, a 0.56 m spot at 101,708 lux; the 250BSW (40 %) still lean out and meet the columns at 3.9 m (1.0 m spot, 1,723 lux) — beyond the 3 m guard, so allowed, but they light the column face and not the wall; a design choice for the owner.
- every other gs look: unchanged (no mover beam within 3 m of anything).

### Validation

- `npx vitest run scripts/rigbuild`: 16 files, 444 of 444 pass with the change. With the source files reverted (`ground-scenes.mjs` and the rig/versions json) the new guard fails 3 of 3 (12 rows in each version's slow-sweep and gs-slow-fan: 1.54 m and 1.39 m column hits), the other 441 pass.
- `npx vitest run scripts`: 1369 pass, 15 skipped, 1 file fails to load (`scripts/di/openFile.test.js`, `Cannot find module 'dotenv'`, an environment fault, not this change).
- `npx eslint scripts/rigbuild scripts/place`: 0 errors, 1 warning that was already there (`lampsOf` unused in `versions-page.mjs`).

### Not seen

- Nothing here was seen on a screen: no browser was available. The new throws are numbers from the footprints ray, not a render and not a light meter. Whether the inward fan still reads as the "slow sweep" the owner wants is a look to take.
- The columns are boxes from the hall grid; the heads' flare, hoists and struts are not modelled.
- PAR photometry disagreement (type file 11,000 cd vs the room's 30,478 cd) is untouched and still owes a decision.
