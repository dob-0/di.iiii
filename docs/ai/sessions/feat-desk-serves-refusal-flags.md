## 2026-09-30 — The desk keeps its refusals and serves them, so the sheet and the room count the same

Branch `feat/desk-serves-refusal-flags` (from `preview/rigbuilder-11-2026-09-30`). Code and tests only.
**NOT seen on a real screen.** No browser, no rendering, no running install touched; everything below is
from reading code and running tests (vitest/jsdom; the desk's plain-node suite over HTTP on a throwaway
desk). The owner has not looked at any of it.

### The gap (from feat-moxir-sheet-reads-desk)

The room's steps row counts the desk's refusal flags (`no-room`, `profile-clash`, `profile-refused`,
`group-split`) in "N to decide", but they existed only in the answer to the room's auto-patch POST.
`GET /light/api/rig?project=` returned only fixtures, so the patch sheet could not show them. It also
could not see overlap with fixtures that are not the project's (the studio's own, another room's).

### What changed

- Desk (`serverXR/src/lighting/rigpatch.js`, `desk.js`): after every `POST /api/rig/patch` the desk keeps
  the refusal flags of that run in `state.rigFlags[project] = [{key, code, message}]`. Lamps named in the
  run are re-decided (old flags dropped, new refusals added); flags of lamps not in the run stay; a pruned
  lamp's flag goes; an empty list deletes the project's entry. `GET /api/rig?project=` now also returns
  `flags` and `conflictsWith: [{universe, from, to, fixtures:[{id, name}]}]` (universes 1-based), per
  universe the overlapping channel span with every fixture that is NOT this project's. Ids and names of
  those fixtures only; no keys, no other project's content. Read-only: no address or patch is changed.
- Sheet (`src/rigbuild/sheet.js`, `plotModel.js`, `rigProgress.js`, `PatchSheetSurface.jsx`): `sheetModel`
  takes `deskFlags` and `conflictsWith`; each refusal lands on its lamp (so the Flags "To decide" group
  and the steps row are built from the same flags the room has), and the sheet body prints
  "overlaps 12 other fixtures on U1 1-64" with the names. `conflictsWith` is shown, not counted in "to
  decide" (the room does not count it either, so the two counts stay equal). The page's loader may return
  the old bare list or `{fixtures, flags, conflictsWith}`.

### File format change and migration

`show.json` gains an optional top-level field `rigFlags` (object keyed by project id). No version bump.
Loading a show without it gives `{}`; a malformed value is replaced by `{}`. An older desk simply never
sends `flags`/`conflictsWith`, and the sheet then behaves as before (no refusals, no overlap line). A
newer show opened by an older desk keeps the field untouched in the file it does not read (the older desk
rewrites the show from its own state and drops it: the flags then reappear after the next auto-patch run).
Space shows carry it too (it is not part of the rig-only `output`). Until a room re-runs its patch on this
desk, a desk that already refused lamps has NO kept flags: the room shows them from its last POST, the
sheet only after the next run. That is the migration gap; the fix is one auto-patch run.

### Tests

Touched suites: `sheet.test.js`, `rigProgress.test.js`, `PatchSheetSurface.test.jsx`, `plotModel.test.js`,
`rigSteps.test.jsx` (59 tests) and the desk's `tests/test-rigpatch.js` (13). With the six source files
reverted to base: 4 vitest and 1 desk test fail; with the change: 59/59 and 13/13. eslint on the touched
files: 0 errors, 0 warnings (desk.js has 3 pre-existing unused-variable warnings, not from this change).
Full suites not run (budget).

### Owed

- Look at it on the owner's screen: `/moxir/patch/moxir-hall-minimal-cut-movers`, desktop and phone.
- Run the room's auto-patch once on the owner's desk so the kept flags exist (nothing was written here).
- The 4 UP-B380F on U1 against the studio's fixtures stay the owner's decision; no address moved.
- Counting `conflictsWith` in "to decide" would need the room to read it too; not done.
