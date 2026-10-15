## 2026-10-13 — cloud: views as data, per project and per production

Brief: cloud routine #17, the owner's decisions 1–3 of `docs/ai/decisions/2026-10-13-views-library-words-workflow.md`
(rows A1–A3 of the MOXIR inventory plan, which lives on `cloud/moxir-tools-inventory-2026-10-13`, not on the base).
Branch `cloud/views-as-data-2026-10-13` from `fix/moxir-selection-box-and-scenes-2026-10-13` (e4bbf501).

### What changed
- **Views are data** — `src/project/viewport/smartView/viewData.js` (pure). `presentationState.viewPresets` entries
  `{ id, label?, position?, target?, fov?, live, hidden? }`. A built-in id may carry no camera (computed from the room as
  before); any other id needs one. The list counts as data once an entry carries a boolean `live`.
- **The viewer shows ONLY the live views** (decision 1): `StudioViewport` passes `resolveViews(…, 'visitor')` through
  `useSmartViewState`'s new `select`, so a key (1–6) or `#view-<id>` to a work view does nothing for a visitor. The Studio
  bar gets every non-hidden view; a work view has a dashed edge and says so in its title.
- **Default** (decision 2): no data → the six built-ins with `floor` (eye height) and `top` (the plan) live, the rest
  work. An older list keeps its cameras and labels; its extra cameras are work views.
- **The Studio chooses**: Scene panel → **Views** (`ViewsSection` in `StudioShellPanels.jsx`, hook
  `src/studio/hooks/useProjectViews.js`): live/work switch per view, Hide/Show a built-in, Remove an added view, "Add this
  camera" (the Studio camera, rounded to mm; starts as a work view).
- **Per production** (decision 3): the choice lives on the list's `production` entity as component
  `productionViews { viewPresets }` (`productionViewsOf`, `productionViewsOps`, `versionProjectIds` in
  `src/shared/productionVersions.js`). The list is private, so a visitor never reads it: an edit in any version is written
  to the list AND to every version's own document (`productionViewsSync.js`, one retry on a conflict, failures named in
  the Studio's activity, never thrown). No schema change: unknown components and `viewPresets` already pass through both
  schemas (checked through `shared/projectSchema.cjs` in `productionViews.test.js`).
- **Migration** — `scripts/views/migrate-views.mjs`, generic: `--file` (a document on disk, `--out` a copy), `--project`,
  or `--production` (the list keeps it, every version gets it). Default keeps every button visitors see today live;
  `--live a,b` narrows. Dry run unless `--apply`; refuses any host but localhost/127.0.0.1 unless `--allow-host <host>`.
  Idempotent.
- Wiki `smart-view` entry rewritten (updated 2026-10-13; the production name taken out of its summary and tags);
  vocabulary row **view** (live / work).

### Verified (measured)
- Local scratch stack (`DATA_ROOT` in /tmp, serverXR :4360), a box hall with `viewRole: architecture`, desktop 1440×900
  and phone 390×844, screenshots opened: Studio bar Floor·DJ·Top·Side·Rig·Crane with the four work views dashed; after
  DJ → live, Hide Crane, Add "Balcony": stored list as expected; the visitor page showed **Floor · DJ · Top · X-ray**,
  desktop and phone; 0 page errors.
- Production: list `show-2030-versions` + versions a, b. `migrate-views.mjs --production show-2030`: dry run wrote
  nothing; `--apply` wrote list + 2 versions; a second `--apply` → all `unchanged`. Then in version a's Studio the panel
  said "Shared by every version of Show 2030 (2)"; one switch (Side → work) read back `live: false` in a, b and the list.
- Guards seen red: removing the visitor filter fails 5 tests (viewData + the migration's fixture test); making every
  default view live fails 4.

### UNVERIFIED
- Not run against any live tier. **Existing published rooms change on deploy**: a room with a building and no view data
  goes from six buttons to two (Floor, Top) until `migrate-views.mjs` is run on it — that run on dev/prod is the owner's
  call (`--allow-host`), never done here.
- Only on a box "hall" with one lamp; not on a real scanned hall or a real rig. No full project document of a real
  production exists in the repo: the migration test uses the `views` block of
  `scripts/place/rigs/moxir-v2-7-2026-10-12.json` (what its scripts wrote into presentationState).
- The Views section was looked at on desktop only (phone: the bars, not the panel).
- The Studio bar reads the project's own list; when a production's list differs from a version's own copy (written
  before this change), the bar shows the version's until the first edit or the migration. Not seen in practice.
- `views-v2.mjs` / `aim-views.mjs` still write lists without `live`; they keep working (older lists are read), but a
  run of either after the migration replaces the data with an older list. Not changed here (scripts with a production's
  name: the plan's D-row work).

### Tests
- Before (base e4bbf501, full `vitest run`): 920 files passed, 1 failed, 7 skipped; 10429 passed, 4 failed
  (`scripts/di/oneAddressPrinted.test.js`, an install's ports — not this area), 2 expected fail, 58 skipped.
- After (this branch, same command): 925 files passed, 2 failed, 7 skipped; 10460 passed, 5 failed, 2 expected fail,
  57 skipped. The 5th failure was mine — `scripts/noPathnameMainGuard.test.js` caught a `file://${argv[1]}` main guard
  in `migrate-views.mjs`; now `isMainModule`, that file and the guard rerun green → 10461 passed, the same 4
  `oneAddressPrinted` failures as the base. Skipped 58 → 57 not explained (not investigated).
- `npm run lint` 0 errors (103 warnings); `npm run build` passed; `test:schema-sync` 64 passed; `docs:ai:check` passed.
  `test:server-contracts` NOT run (no server file touched).
- New: `viewData.test.js` 12, `productionViews.test.js` 4, `productionViewsSync.test.js` 3, `migrate-views.test.js` 5,
  `useSmartViewState.test.jsx` 2, `ViewsSection.test.jsx` 3, `SmartViewBar.test.jsx` +2 = 31. Smart-view geometry tests
  unchanged and green.

Next: the owner says whether to run `migrate-views.mjs` on dev (then prod) before this lands, and for which rooms; then
A3 ("what visitors get" switches) on top of this list.
