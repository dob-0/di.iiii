## MOXIR version switch lists the space's live versions (branch feat/moxir-versions-switch)

Base: `origin/preview/rigbuilder-10-2026-09-30` (3dec7e71). Not merged, no PR, dev/main untouched.

### The problem (owner's screen, /moxir, 2026-09-30)
The switch showed two entries although the space holds eight live versions. Cause: `versionLinks`
built the row from `components.rigVariant.siblings` stored in each version's own document at build
time, filtered by which projects exist. Measured on the local install (documents read from
`~/.local/share/di.iiii/data/spaces/moxir/projects/*/document.json`): Minimal and Cut-movers list
hall/minimal/cut-movers/middle/full (hall, middle, full are archived, so 2 show); Halo lists
hall/minimal/middle/full/halo (2 show); X lists ... xflat, xflat-heads (3 show); the older versions
never list the newer ones, so no live version reaches all the others.

### What changed
- `src/rigbuild/rigVariant.js`: `versionLinks` accepts the rows of `/api/spaces/:id/contents`. Members
  = rows whose own mark has the same `set`. Same list from every version, sorted by project id, live
  first, then labelled copies (`copyOf`) marked `copy: true`. The current version is always there.
  No other row with a mark -> old path (stored siblings filtered by ids), so old servers and
  unmarked documents behave as before. Ids-only input (Set/array) unchanged. `rigVariantOf` also
  accepts a mark with an id and no siblings. A version with no title is called by its id.
- `src/rigbuild/RigVersionSwitch.jsx`: keeps the rows, draws a 1px divider before the copies. No
  other restyle. Links stay >=44px, `aria-current` on the current one.
- `serverXR/src/routes/projectRoutes.js`: the contents rows carry `rigVariant` {set,id,title,summary,
  copyOf?}, from the same cached document read as `mode` (no extra parse). Rows without a mark are
  byte-identical to before. Visibility filtering (live, not archived, not private) is the route's own.
- `src/shared/projectSchema.js` + `shared/projectSchema.cjs`: `normalizeRigVariant` DROPPED `copyOf`
  on every write (found by the contract test). Now kept, so a normalisation pass no longer turns a
  labelled copy into a peer.
- Docs: `docs/architecture/RIG_BUILD.md` §15.1, `docs/ai/known-fixes.md` row.

### Measured
- Fixtures = the measured lists above. Without the fix 14 of 22 tests in
  `rigVariant.test.js` + `RigVersionSwitch.test.jsx` fail; with it 22/22 pass.
- `npx vitest run src/rigbuild serverXR/src/schemaSync.test.js scripts/rigbuild`: 56 files, 691 tests pass.
- `httpContracts.test.js` + `projectVisibilityContracts.test.js`: 106 pass (includes the new
  "carries a rig version mark" test).
- `npx eslint` on the touched dirs: 0 errors. Full push-checks run by the pre-push hook at push.

### NOT verified
Not seen on a real screen. The owner must open /moxir on his machine (desktop and a 390px phone).
The local server must run this branch (the contents rows need the server change; against an older
server the row falls back to the stored lists, i.e. today's behaviour). No screenshot was taken;
no DPR 1 vs phone check.

### OWED
- Two copies, `moxir-hall-minimal-xflat-oldhall-0929` and `...-xflat-heads-oldhall-0929`, carry NO
  `rigVariant` mark in their documents (measured), so they are not in any row. Data fix: re-run
  `copy-version.mjs` marking, or add the mark; not code.
- Row length: 6 live + up to 6 copies is >1200px of horizontal scroll at 390px inside the pill
  (`RigVersionSwitch.jsx` rowStyle, overflowX:auto), with no visible hint that it scrolls. Proposal:
  fold the copies behind one "Old (n)" entry. Needs a look on the phone first.
- `RigSteps.jsx` (`role="menu"` on the steps menu, ~line 150): its links are not `role="menuitem"`,
  focus does not move into the menu on open and does not return on Esc. Keyboard users can still Tab
  to the links (real anchors). Not test-proven here, so not changed.
- `PublicProjectViewer.jsx:228`: the version row shows only in orbit; in walk mode there is no way to
  switch version without leaving walk (Esc). By design so far; owner to say.
- First view of a space with several versions (which project `/moxir` opens) was not audited.
- Order is by project id (stable, not by story). An explicit `order` on the mark would be the real fix.
- Titles are capped at 60 chars by the schema; copy titles lose their tail
  (e.g. "...fixed lights onl"). Only the short word before " — " shows in the row; the hover title is cut.
