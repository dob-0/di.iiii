# One rig generator: a hang file + a scenes file, instead of a builder script per version (2026-10-15)

Ledger N811.10 (owner 2026-10-15 14:52: "one generator from the scenes file + a layout file instead of a builder script per
version"); rule "Nothing is left behind" (every show tool is a di.iiii feature, no production name in its defaults).
Venue-to-show skill steps 3 (rig) and 5 (scenes → rig looks).

## Context (measured on dev 5dbb881b)

- 20 builder scripts `scripts/place/moxir_v*.py`, 12,525 lines, one or more per MOXIR version (v1 … v2.10). Each mixes four
  jobs: placing units (lines, arcs, mirrors about the DJ axis, crane cuts), patching them, writing the looks, and checking.
  A new version = a new script that loads the last rig file and edits it in code. Seven of them have their own test.
- Since v2.11 the looks no longer come from a builder: they come from the scenes file (`scenes_to_rig.py`, step 5), and the
  energy pass (`scenes_energy.py`). Only the units still need a script.
- What the project build reads from a rig file (`grep "rig\." scripts/rigbuild/epic-build.mjs`): `fixtures`, `solids`, `stage`,
  `atmosphere`, `views`, `showSource`, `loop`, `not_hung`, `looks`, `cues` (+ the header `version`, `title`, `what`).

## Method (established, cited)

The lighting trade keeps the plot (which unit, where, aimed how, on which address) apart from the cue list (what the units do,
in order): USITT ASCII Show File (1991; patch and cues are separate sections), and MVR, DIN SPEC 15801 (the scene of fixtures,
positions and patch, exchanged between consoles and previs with no cues in it), beside GDTF, DIN SPEC 15800 (the fixture
type). Code that makes data is replaced by data plus one generator, so each version is a diff of two files, not a program.

## Decision

1. **Two input files per version, both in git beside the rig files** (`scripts/place/rigs/`):
   - the **hang file** `<venue>-hang-v<X>-<Y>-<date>.json`: every unit (`fixtures[]`: id, type, part, p, r, colour,
     angle_rad, dmx, power, …), the room's `solids`, `stage`, `atmosphere`, `views`, `showSource`, `not_hung`, and the
     version's record keys (checks, review, owner quotes, power, patch notes) kept verbatim; optional `groups` that generate
     units by rule (v1: `line`, `mirror`); `hang.from` says which rig file it came from;
   - the **scenes file** `<venue>-scenes-<n>-<date>.json` (step 4, unchanged).
2. **One generator** `scripts/place/rig_generate.py`:
   `hang` (take the hang out of any existing rig file, once per venue), `build` (hang + scenes → rig file, with the unit
   checks: unique ids, p/r present, no shared DMX channel; and the scenes checks of `scenes_to_rig.py`, the same function),
   `check` (compare what epic-build reads between two rig files: the proof a generated version equals a builder's).
3. **A new version is an edit of the hang file** (by the existing tools — `move_lamps.py`, `delete_entities.py`,
   `aim_lasers.py --spec`, `rehang.mjs` — or by hand in a reviewed diff) and/or the scenes file, then `rig_generate.py build`.
   No new `<venue>_v*.py`.
4. **Word.** The owner said "layout file". `docs/ai/vocabulary.md` already gives *layout* one job (the Studio's panels), so the
   file is called the **hang file** (where each unit hangs or stands). Proposed, not settled: the owner may pick another word.

## Proof on MOXIR v2.11 (2026-10-15)

`rig_generate.py hang --rig moxir-v2-11-2026-10-15.json` → `moxir-hang-v2-11-2026-10-15.json` (67 units, 6 solids, 40 keys,
479 KB). `build` with `moxir-scenes-50-2026-10-15.json` → 67 units, 50 looks, 50 cues. `check` against
`moxir-v2-11-energy-2026-10-15.json` (made by a builder + `scenes_to_rig.py` + the energy pass): **same** on all ten keys
epic-build reads. Against `moxir-v2-11-2026-10-15.json` only `looks` differ, as they should (that file is before the energy
pass). The looks equal `scenes_to_rig.py`'s for the same scenes (same function). Test: `scripts/place/rig-generate-py.test.js`.

## Not done here (each an open row)

- The 20 builders stay in the tree, frozen, as the record of how v1 … v2.10 were made; seven tests and
  `src/rigbuild/plotModel.js` still name them. Removing them is a later row, once their tests run on hang files.
- `groups` v1 has `line` and `mirror` only. The arcs, crane cuts and the "forty routes" of the builders are not rules yet;
  their units are listed one by one in the hang file (taken from the rig), which is exact but not parametric.
- The existing edit tools take a rig file; that they accept a hang file (same `fixtures` key) is ASSUMED, not tested.
- The record keys (checks, review, owner quotes) ride inside the hang file; a separate record file is an option, not decided.
- No MVR export; the hang file is this repo's JSON, not DIN SPEC 15801.
