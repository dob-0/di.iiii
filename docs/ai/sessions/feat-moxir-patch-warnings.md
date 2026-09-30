# 2026-09-30 — MOXIR patch warnings: what "29 of 36 addressed · ! 7" is made of

Branch `feat/moxir-patch-warnings` (from `preview/rigbuilder-10-2026-09-30`). Code and tests only.
**NOT seen on a real screen.** No browser or rendering was available; everything below is from
reading code and running unit tests (jsdom). The owner has not looked at any of it.

## 1. What the 7 are

Observed by the owner on /moxir, version `moxir-hall-minimal-cut-movers`: `5 PATCH SHEET · 29 of 36 addressed · ! 7`.

How the string is built (base commit):
- `rigProgress.js:37` (base) — `${patched} of ${lamps} addressed` + ` · ! ${conflicts}`.
- `patched` = lamps with a universe (`sheet.js` totals: `rows.filter(r => r.universe != null)`), so
  **36 − 29 = 7 lamps have no address**. It is not the same number as "conflicts".
- `conflicts` = `plotModel(...).conflicts` = lamps carrying any code in `CONFLICT_CODES` or `ORDER_CODES`
  (`plotModel.js:56`, `:96`). In the room the desk's flags are passed in too (`deskFlags`), so desk-side
  refusals (`overlap`, `no-room`, `profile-clash`, ...) count there. The patch sheet page passes no desk
  flags, so the same steps row can show a different number on the sheet page than in the room.

What the shipped version holds (measured by building the version's document from
`scripts/place/rigs/moxir-2026-10-17-minimal-cut-movers.json` + its rental list in a throwaway probe test,
not committed): 36 lamps = 13 UP-B380F, 15 UP-PL5403, 6 EXT-STROBE, 2 EXT-HAZER, exactly the
rental list (`scripts/rigbuild/rentals/moxir-2026-10-17-minimal-cut-movers.json`: 13/15/6/2).

Classification of each cause:

| cause | how many | class | evidence |
|---|---|---|---|
| 4 UP-B380F (booth back) overlap the studio's own fixtures on U1.001-064 | 4 | REAL conflict, owner decides (next free / separate desk) | owner's context; the desk flags it `overlap` and the room shows it in the `!` count; RIG_BUILD §19.2 records the same overlap as retired only for a desk that holds Minimal alone |
| the other 3 | 3 | NOT determinable from the repo. The document generated from the repo carries no address at all until a patch step runs, and the live project/desk state (what the room's auto-patch wrote or refused) is not in git. Whatever they are, they must be a desk refusal or a missing address, both "to decide" or "not addressed" | needs the live document + `GET /light/api/rig`, or the sheet's new grouped Flags list on the owner's screen |
| over-order / not on the equipment list | 0 | ruled out | list matches the placed lamps 13/15/6/2 |
| UP-COB200 assumed 4ch list | 0 in this version | NOT part of the 7. This version has no COB200 (that is `minimal`, RIG_BUILD §15.8). And `channels-assumed` is not in `CONFLICT_CODES`, so an assumed list can never raise the `!` count | `plotModel.js:36`, `fixtureTypes.js:233` |
| UPlight publishes no channel orders | 36 (flags, not conflicts) | ASSUMPTION/owed, correctly not counted in the 7 | `channels-owed` / `channels-assumed` are not conflicts |

Display bugs found (fixed here):
1. `! 7` did not say what it counts, and the sheet did not list them.
2. Desk refusals `no-room`, `profile-clash`, `profile-refused`, `group-split` had no wording in
   `FLAG_WORDS`, so the code itself would be printed.
3. The sheet's Flags section was a flat list of codes with no cause and no "what to do".
4. The assumed mode was only named in a row note; the mode column and the Fixture types table showed a
   bare mode name.

## 2. What changed

- `src/rigbuild/rigProgress.js` — steps text now `29 of 36 addressed · 7 to decide` (no bare `!`);
  new `hints.patch`: `7 to decide (4 overlap, ...) — the patch sheet's Flags list, under "To decide",
  names each one. 7 of the 36 lamps have no address yet.`
- `src/rigbuild/RigSteps.jsx` — the step's `title` (tooltip) appends that hint. Nothing else in the row.
- `src/rigbuild/sheet.js` — `FLAG_GROUPS` / `groupFlags()`: Flags grouped by cause (To decide, Not addressed
  yet, Assumed, Owed by the rental house, Housekeeping), each flag with one line of what to do; words for
  the four desk codes; `modeAssumed` on rows; an assumed mode prints `(assumed)` in the patch table and the
  Fixture types table (once, not twice when the mode name already says "assumed"); one `h3` CSS rule.
- Tests: new `rigProgress.test.js`; additions in `sheet.test.js`, `rigSteps.test.jsx`; one assertion in
  `PatchSheetSurface.test.jsx` updated for the new Flags line. Wiki example text updated.
- Not touched: any address or patch data, plan scripts, CSV columns, `RigVersionSwitch.jsx`,
  `rigVariant.js`, room chrome.

## 3. Tests

Touched suites: `rigProgress.test.js`, `sheet.test.js`, `rigSteps.test.jsx`, `PatchSheetSurface.test.jsx`,
`plotModel.test.js`: 46 tests pass. With the three source files reverted to base, 10 tests fail. eslint
on the touched files: 0 errors. Full suite not run (budget).

## 4. Still the owner's decision / owed

- The 4 UP-B380F on U1 against the studio's fixtures: move to next free, or a separate desk. No address moved.
- The other 3 lamps: identify on the real screen (the Flags list on `/moxir/patch/...` now names causes; the
  room's desk-only flags are still NOT on the sheet page: owed, the sheet page reads no desk flags).
- The sheet page's steps row and the room's row can show different counts (desk flags only in the room): owed.
- UP-COB200's assumed 4ch list and every maker's channel order stay ASSUMED until the rental house answers.
- Look at it: the tooltip, the sheet's Flags section and `(assumed)` labels, on his screen, phone and desktop.
