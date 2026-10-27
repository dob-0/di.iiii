# REPORT B1/B2 — Known · full onto the moxir desk (2026-10-05)

PR (draft, to dev, not merged): https://github.com/dob-0/di.iiii/pull/766
Branch: feat/moxir-known-full-desk-plan-2026-10-05 (worktree /home/dob/work/di.iiii-moxir-deskplan)

## What was built
- scripts/rigbuild/desk-plan.mjs: plans ONE chosen version onto its space desk OFFLINE, on a COPY of the show, using the
  desk's own code (desk.js, offline). It removes other versions' rig fixtures from ALL universes, because the desk runs
  one patch per space and lamps left on U3-U5 would still get their old looks' DMX. Fixtures the operator patched by hand
  are kept, and the plan fails if one of them is in the way. The chosen project is patched EXACTLY or the script exits 1
  (exactProblems before, exactVerdict after, planProblems on the written file). Its 25 looks are loaded with DMX values,
  and the document's 10 cues are loaded with loop OFF and not started. OUTPUT is never touched. --gate runs
  patch-sheet.mjs against a desk serving the planned show. --apply and --undo keep backups in ~/di-backups.
- planPatch now skips off-DMX lamps. Before, the 16 LaserCubes, hazers and smoke machines counted as "in no block", so
  no patch sheet could pass for Known · full.
- scripts/place/rigs/moxir-2026-10-17-known-full.patch.json records the patch AS DOCUMENTED (0 ops). It is NOT the
  data-run plan owed under audit W1.
- Docs: RIG_BUILD §19.5, scripts/rigbuild/README row, 3 known-fixes rows, session note.

## Dry-run numbers
Source: a copy of the show, sha256 1adeeb05…, and document v2. dev == local apart from timestamps.

| U | before fx/ch | removed | patched | after ch/free |
|---|---|---|---|---|
| U1 | 62/512 | 62 | 57 | 512/0 |
| U2 | 49/512 | 49 | 11 | 176/336 |
| U3 | 36/512 | 36 | 0 | 0/512 |
| U4 | 54/512 | 54 | 0 | 0/512 |
| U5 | 40/368 | 40 | 0 | 0/512 |

- 241 fixtures removed, 0 other-version fixtures kept, 68 patched. 25 looks put on, 5 taken off. 10 cues (114 s) with
  loop off, not started.
- Gate (patch-sheet.mjs): PASS. Negative control (the unplanned show): exit 1, with 111 foreign fixtures.
- *-assumed modes: 0 in the planned show. The input show has 36, all on Minimal fixtures that are removed (27 PL5403
  8ch-assumed, 7 COB200 4ch-assumed, 2 hazer 2ch-assumed). All 68 Known · full lamps use channel lists whose basis is
  TESTED on the Sevan units, not a maker chart (B5). They are listed in assumed-modes.csv and not fixed.
- Files: ~/Downloads/moxir-desk-plan-2026-10-05/ (show.planned.json, plan-meta.json, assumed-modes.csv,
  input-assumed-modes.csv, patch-sheet/patch.csv + patch-sheet.html).

## Tests
- `npx vitest run scripts/rigbuild/desk-plan.test.js src/rigbuild/patchPlan.test.js`: 17 passed.
- Seen failing with the rules disabled: 3 tests fail. With every rule off, the second of two lamps sharing U1.001 lands
  at U1.017 as a "copy" with no flag.
- ESLint on the changed files: clean.
- Apply and undo were exercised only on a test data dir. They round-trip byte for byte, and all 3 refusals were
  triggered.

## INCIDENT: I started the live desk (OUTPUT stayed off)
- At 02:01:20, while testing apply's "is the desk stopped?" probe, I sent GET https://local.thedi.studio/light/api/show
  3 times. On the installed di, that route BUILDS the lazy desk.
- The desk loaded moxir's show and resumed the Minimal's 5-cue loop, which was saved as running.
- Evidence: lighting/desk.json was written at 02:01:20. The moxir show.json did not change from 00:34 to 01:54 and has
  been saved at every cue since 02:01:36.
- Machine output.enabled is still false, so no DMX was sent. I left the desk as it is; `di down` stops it.
- Fix: the probe now uses /light/api/clock, which does not build the desk. There is a known-fixes row.
- Consequence: the Downloads plan's source sha is now stale, so apply will refuse it. The owner re-plans after `di down`
  (see below).

## Open / owed
- At rest the planned desk is NOT dark: fixtures rest at dimmer 255 (engine.js makeFixture). The measured at-rest frame
  has 227 non-zero channels on U1 and 44 on U2, so switching OUTPUT on before the first GO lights every lamp. This is the
  owner's call.
- The crew sheet labels the TESTED lists as "maker's" (B5).
- Still owed: W1 data-run plan, B3 clock, B4 lasers.
- Nothing was seen in a browser.
- The last commit (a RIG_BUILD §19.5 wording fix) is not pushed. The push hook runs the full lint, and the coordinator
  paused it for heat. CI runs the full lint; push again when the CPU is at 85 °C or lower.

## Owner commands
```
di down
node scripts/rigbuild/desk-plan.mjs --space moxir --project moxir-hall-known-full --api https://dev.diiii.xyz/serverXR --out ~/Downloads/moxir-desk-plan-2026-10-05 --gate scripts/place/rigs/moxir-2026-10-17-known-full.patch.json
node scripts/rigbuild/desk-plan.mjs --space moxir --apply ~/Downloads/moxir-desk-plan-2026-10-05
di up
# undo
di down && node scripts/rigbuild/desk-plan.mjs --space moxir --undo ~/di-backups/moxir-desk-plan-<stamp> && di up
```
