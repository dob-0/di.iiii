## 2026-09-30 — cloud review B (data and tooling), MOXIR light-rig work

Read-only review routine B, scope `docs/ai/sessions/docs-moxir-review-scope-2026-09-30.md`.
Nothing here was seen on a screen; no visual result is claimed. Line numbers are at the named ref.

## B1 — One baked wash per look (ref `origin/preview/rigbuilder-13-2026-09-30`)

### Findings
1. **medium — `rig.mjs --wash-only` drops an asset a per-look wash still uses.** `scripts/place/rig.mjs:259` and `:283` push `deleteAsset` for the single `rig-wash`'s asset with no check that another entity points at the same id: `...(was?.components?.media?.assetId ? [{ type: 'deleteAsset', payload: { assetId: was.components.media.assetId } }] : [])`. Assets are content-addressed, and `--wash-per-look` bakes each look "the way --wash-only --look <id> bakes one" (`rig.mjs:165`); `wash-glb.mjs` has no Date/random, so the per-look bake of the look the single wash was baked for has the SAME id (and `perLookWashOps` deliberately keeps it shared, `wash-plan.mjs:74`). Scenario: `--wash-only --look red` → `--wash-per-look` (`rig-wash:red` shares asset H) → `--wash-only --look other`: H leaves `document.assets`, `washHeld` fails for `rig-wash:red`, and the room silently shows the single wash (the other look's colours) during `red`. The fallback was proven with a node script against `withLookWash` (asset dropped → `rig-wash:1:true`, `rig-wash:red:0:false`); the shared-hash step is by reading. Fix: in both `--wash-only` branches, emit `deleteAsset` only when no other entity in `current.document.entities` has that `media.assetId`.
2. **low — the cross-fade into a look with its own wash from one without snaps the single wash out.** `src/rigbuild/looks.js:375`: `if (e.id === WASH_ENTITY_ID) return toHas ? washAt(e, 0) : e`. Proven: from `a` (no own wash) to `b` (own wash) at t=0 gives `rig-wash:0` and `rig-wash:b:0`, so for the first frame of the fade the columns have no wash at all, then `b` ramps up from 0. The reverse (`b` → `a`) puts the single wash up at full on frame one while `b` fades out. Fix: while `fading`, draw the single wash at `1 − tt` when only `to` has its own, and at `tt` when only `from` has its own.
3. **low — `perLookWashOps` only guards the single wash and the new bakes.** `wash-plan.mjs:74-80`: `keptAssets` is seeded only from `rig-wash`. Any other entity (a user's duplicate of a wash, a model with the same bytes) that points at an old per-look asset loses its asset record. Unlikely with baked bytes, but it is the same gap as finding 1. Fix: seed `keptAssets` from every non-`rig-wash:*` entity's `media.assetId`.
4. **low — a full `rig.mjs` run removes the per-look washes, and the help text doesn't say so.** `rig.mjs:366` takes down every `rig-` entity (so every `rig-wash:<look>` too) and deletes their assets, while `load-plot.mjs:52` and `rehang.mjs:50` KEEP them. After a full re-hang the room falls back to the single wash with no line saying the per-look ones are gone. Arguably correct (the aims changed), but not stated. Fix: one `say` line counting the removed `rig-wash:*` and naming `--wash-per-look` as the re-bake.
5. **low — `washBudget` counts a shared asset twice.** `wash-plan.mjs:31-40` adds `singleBytes` to the distinct per-look sizes even when a bake's hash IS the single wash's asset (the case in finding 1), so near the 2 MB cap it can refuse a write that would fit. The refusal message itself is clear and says nothing was written. Fix: skip `singleBytes` when its asset id is among the bake hashes.

### Refuted
- Old project, no per-look wash → `withLookWash` returns the same array (`perLook.size` 0, `looks.js:359`); `lookId` undefined/'' → same array; `from === to` → `fading` false.
- 30 Hz memo churn: `blended` (`useRigLook.js:133`) recomputes only when `t` ticks during a fade, the same cadence as the lamps' blend; `assets` is the document's array, stable between writes.
- `deleteAsset` deletes bytes: it drops the document's record only (`shared/projectSchema.cjs:2173`; no unlink of asset files in `serverXR/src`).
- `--wash-only` re-run with identical bytes: `deleteAsset H` precedes `upsertAsset H` in the same batch, so the record comes back.
- `--wash-per-look` twice: delete + create of the same ids in one batch at `baseVersion`; idempotent. It touches only `rig-wash:*` and their assets.
- `--dry-run` writes: every dry-run branch returns before a client is made (`rig.mjs:179-190`).

### Not read
`src/rigbuild/lookWash.test.js` and `scripts/place/wash-plan.test.js` (not run); `wash-glb.mjs` beyond a grep for time/random; the model renderer, so whether a `runtime.visible:false` model still downloads its GLB at room open (11 hidden washes loaded up front on an iGPU) is NOT established.

## B2 — copy-version --adopt (ref `origin/preview/rigbuilder-13-2026-09-30`)

### Findings
1. **medium — `looksLikeCopyOf` can adopt a copy of the WRONG version of the same set.** `scripts/rigbuild/copy-version.mjs:113-127`: the three tests are the set name (skipped when the copy has no mark: `if (copySet && sourceSet && …)`), the entity count (`max(10, ceil(0.15·n))` apart), and the HALL (non-`rig-` entities). Every version of one set shares the same hall, so the only part that tells two versions apart — the `rig-` entities — is compared by count alone. Proven with a node script: a mark-less copy of version A (40 hall + 30 `rig-a-*`) against source `full` (40 hall + 35 `rig-b-*`) → `ok: true`, `hallMatched 40/40`, `allowed 12`, and `planAdoption(…)` → `status: 'write'`. A mark-less copy is exactly the case --adopt exists for (`copy-version.mjs:31-36`), so a wrong `--from` stamps the copy `copyOf: full` with id `full-<suffix>`. Fix: when the copy has no mark, also require the `rig-` entity ids to match (e.g. ≥ 90 % of the copy's `rig-*` ids present in the source), and print that ratio in the facts line.
2. **medium — a fresh copy made without `--siblings` loses its mark silently (the cause --adopt repairs).** `copiedEntities` (`:79-90`) sets `id: \`${v.id}-${suffix}\`` but keeps the source's `siblings` when none are given; `normalizeRigVariant` (`src/shared/projectSchema.js:870`) returns null when the own id is not among the siblings. Proven: the fresh copy's mark → `normalizeRigVariant(...) === null`. The copy path's read-back (`:344-346`) compares only entity and asset COUNTS, so the PUT succeeds, the mark is gone, and the script prints "written". `--adopt` checks this (`kept`/`dropReason`, read-back); the copy path does not. Fix: in the copy path, run `normalizeRigVariant` on the new mark before the PUT and die with `dropReason` when it is null; after the read-back, check the show entity still has `rigVariant.copyOf`.
3. **low — a mistyped `--dry-run` writes.** `parseArgs` (`scripts/place/common.mjs:11-29`) accepts any `--key`, and `runAdopt` writes unless `args['dry-run']` (`:302`). `--dryrun`, `--dry_run` or `—dry-run` (an em dash pasted from a doc) all go to the write. The write is guarded (looksLikeCopyOf, one op, read-back) and logs the old mark first, so the damage is bounded to one mark. Fix: in `main`, die on any key not in a known list for the chosen mode.

### Refuted
- Writes beyond the mark: `planAdoption` returns exactly one `updateComponent` on `rig-show`, component `rigVariant`; the read-back runs `changedBesideMark` and throws on drift.
- Title/summary overwrite: `{ ...(have || wanted), id, copyOf }` keeps the copy's own title and summary when it has a mark.
- A mark the server drops: `normalizeRigVariant(mark)` is run before writing, and a null → refusal with `dropReason`, which names RIG_VERSIONS_CAP (32) when the own id is cut off; `copyOf` normalised differently → refused.
- Concurrent edit between re-read and write: the op carries `baseVersion: fresh.version`; the route answers 409 on a stale base (`serverXR/src/catalogue/entries/projects.js`, POST /ops note) and the script throws "nothing was written". Re-run after success → `status: 'nothing'` (idempotent).
- `--dry-run` spelled right writes nothing: it returns before the re-read and the POST on the adopt path, and before creating the project on the copy path.

### Not read
`copy-version.test.js` (not run); `asset-remap-lib.mjs`; `makeClient`; the server's POST /ops handler body (the 409 is taken from the route catalogue, not traced in `projectRoutes.js:715`); `--undo` beyond a glance.

## B3 — Patch sheet reads the desk; desk serves refusal flags and overlap names (ref `origin/feat/desk-serves-refusal-flags`, commit 9db5f099)

### Findings
1. **medium — `conflictsWith` reports one merged span per universe, so the sheet prints channels that are NOT shared.** `serverXR/src/lighting/rigpatch.js:345-347` folds every overlap in a universe into one `{from, to}`: `u.from = Math.min(u.from, from); u.to = Math.max(u.to, to);`, and `src/rigbuild/sheet.js` prints it as `overlaps N other fixtures on U1 <from>-<to>`. Proven with a node script: room lamps at U1.10, U1.400, U1.510 (3 ch) against studio fixtures at 11, 401 and 505 (16 ch) → `{"universe":1,"from":11,"to":512,...}` — the real shared channels are 11–12, 401–402 and 510–512, and the sheet says 11–512. A number read as measured that is a hull. Fix: keep a list of spans per universe (merge only touching/overlapping ones) and print them as `rangeText` does, or one entry per other fixture.
2. **low — an older desk that rewrites show.json drops `rigFlags`.** The field is read only by the new loader (`desk.js:308`); a desk from before this commit loads explicit fields and saves without it, so after a downgrade-and-save the sheet's "to decide" count falls back to zero until the next patch run. Self-healing and not a data loss of the rig itself; say so in the note. No fix needed beyond a line in the session note / RIG_BUILD.

### Refuted
- Leak of another project's or the studio's data: `/light/*` is behind `requireLocalRuntime` (`serverXR/src/routes/lightingRoutes.js:90`, loopback unless `DI_ALLOW_LAN_DEVICES`), and the same callers already get the whole desk state; `conflictsWith` adds only `{id, name}`. Hosted tiers without a local runtime answer 404.
- Project query injection: `rigConflicts` uses it only as a `startsWith(project + ':')` prefix and returns `[]` for empty; `rigFlagsOf` is a keyed read. `rigPatch` refuses `:` and > 128 chars before storing.
- Text from the desk reaching the DOM: every flag message, fixture name and span passes `esc` (`sheet.js:401`, `:458`, overlapLines) before the sheet's `dangerouslySetInnerHTML` (`PatchSheetSurface.jsx:136`).
- Atomic save: `rigFlags` rides the existing `writeWhole` (tmp + rename, `desk.js:546-548`); `save()` is called only on a 200 from the patch route.
- Footprints: `rigConflicts` uses the same `(PROFILES[profile] || PROFILES.rgb).channels.length` as `rigList`, so the sheet and the conflict list agree. Overlap scan is O(room × others): trivial at hundreds.
- Malformed kept entries are filtered to the four refusal codes on the way out (`rigFlagsOf`).

### Not read
`serverXR/src/lighting/tests/test-rigpatch.js`, `sheet.test.js`, `rigProgress.test.js` (not run); `rigPatch` allocation above line 297 (universe/512 wrap, multi-mode footprints) beyond grep; whether `isLoopbackRequest` sees the real client behind the reverse proxy at local.thedi.studio (pre-existing, not today's change).

## B4 — Light footprint calculator (ref `origin/feat/light-footprints`)

### Findings
1. **medium — near-field rows print a far-field spot and lux: the lens has no size.** `scripts/rigbuild/footprints.mjs:61` `spotDiameter = 2 * throwM * tan(beam/2)` and `:77` `E = I cos / d²` treat the lamp as a point source. For the 1.8° B380F that holds far away, but not at 1.5 m: the beam leaves a front lens that is centimetres to tens of centimetres wide, and I = lux × at_m² (measured at 20 m) is only valid beyond the photometric distance. Proven by running `analyse` on full-ground: 12 lit rows with throw < 3 m and beam < 5°, e.g. `beam380-columns-6-01` throw 1.54 m → spot 0.048 m at 7,926,443 lux. The session note repeats "0.04 m spot at 7.9 million lux" as a finding. The spot can't be smaller than the lens, and the lux is not what the formula gives there; the row is flagged only `tight` and `borrowed`, nothing says the formula does not apply. `types/moxir.json` carries no lens/aperture field for any lamp (grep). Fix: add a `near-field` flag (and print no lux) when throw < k·at_m, or a `lens_m` per type and `D = lens + 2 d tan(beam/2)`; say which in the Read-this-first list.
2. **medium — `--words` prints borrowed lux figures with no word that they are borrowed.** `wordsFor` (`:399`) lists only `['wide', 'tight', 'dim', 'grazing', 'no-figure']` as flags, and with `--words` `main` prints only those paragraphs (`:470-473`), without the Markdown's "Read this first" block. The note's "The scenes in words" section is exactly that output ("a 0.4 m spot at about 302,000 lux"), and every lit row in both versions is `borrowed` (273/273, 290/290 per the note). House rule: a borrowed number must never read as measured. Fix: add `borrowed` to the words' flag list, or end each words paragraph with "(figures borrowed: <basis sources>)" whenever any lit row has it.
3. **low — the ellipse's long axis is far off near grazing, and nothing flags it as approximate.** `ellipseMajor` (`:66`) = `D / cos(incidence)`. The 2-D cone section's long axis is `d·cos θ·(tan(θ+α) − tan(θ−α))`. For d = 10 m, beam 25° (α 12.5°): at θ = 60° the formula gives 8.9 m vs 10.4 m (−15 %); at θ = 70° 13.0 m vs 20.6 m (−37 %), still printed as a number until θ + α hits 90°. The approximation is named in the method, but the rows don't say where it no longer holds. Fix: use the exact expression (it is one line), or flag `approx` when θ + α > 60°.

### Refuted
- Units and conventions: `tan` takes `beamDeg * DEG` (radians); I = lux·at_m² (candela from illuminance at a distance, right); `cosIncidence` uses |dir·normal|; the beam is stated as FWHM with the caveat that the sources don't say.
- Silent zero/NaN on 'open air': open air returns throw/spot/lux null and prints "open air", not 0; a missing figure prints "no figure".
- Level fallback to 1: every class of both ground versions has room photometry in every look (checked by script), so `level` is never the `intensity > 0 ? 1` fallback.
- Borrowed flagging: every row with basis ≠ `EXACT` (a missing one included, `'NONE'`) gets `borrowed`; out rows carry only `out` and don't reach the Markdown tables.
- CSV vs Markdown: same fields; the CSV keeps out rows and `I_room_cd`, the tables show lit rows only, as the header says.
- Columns: `surfaceHit` ignores them, footprints adds them, and the note says so (the column B380F "the room draws these beams through the column").

### Not read
`footprints.test.js` (not run); rig-lib `candelaAt`, `surfaceHit`, `craneSolids`; `spotAimDirection`. The −15/−37 % numbers are from the formula above, not a run.

## B5 — Version row width, walk-mode versions control, view bar (ref `origin/preview/rigbuilder-13-2026-09-30`)

Code reading only; no layout was rendered or measured, so every width below is arithmetic, not a screenshot.

### Findings
1. **low (plausible, not established) — in walk mode the show chip and the walk "Versions" button may share the top-left corner.** `PublicProjectViewer.jsx:600-608` renders `RoomLookFollower` with `top={rigChipTop}` whatever `navMode` is; `rigChromeTops` puts the chip at `topClear + 56px` (phone with right controls: `+ 112px`), `left: 1rem` (`RoomLookFollower.jsx:28-31`). In walk mode `rigVersionPlacement` puts the Versions button at `topClear + 4.5rem` (72 px), `left: 1rem`, 44 px tall (`rigVersionLayout.js:38-42`). On a desktop in walk mode with a hosted show playing, 56 px + the chip's height overlaps 72–116 px. Not traced: whether LiveProjectScene's fixed root covers the chip (z 20) while the button (fixed, z 30) stays above it. Fix: pass `showChip={... && navMode === 'orbit'}` (the comment at `:266` already says "the show chip is an orbit thing").
2. **low — the walk "Versions" button clips a long title without an ellipsis.** `RigVersionSwitch.jsx:139`: `Versions · ${shortTitle(current.title)}` in `linkStyle` (`whiteSpace: nowrap`) inside a nav with `overflow: hidden` and `maxWidth: calc(100vw - 2rem)`. A 60-character title (the normaliser's cap) with no " — " is ~480 px at 0.9rem, so at 390 px it is cut mid-word at the right edge, with no fade cue in walk mode. Fix: `overflow: hidden; textOverflow: ellipsis; maxWidth: 100%` on that button, or show only "Versions".
3. **low — the studio variant of the view bar breaks the rectangle and touch rules.** `SmartViewBar.jsx:60-76`: `studioButton` has `borderRadius: '6px'` and `padding: '5px 9px'` at 12 px (≈ 26 px tall). Commit 29ec1c77 ("controls are rectangles — … view bar …") fixed only the visitor variant. It matches `StudioViewport` TOOLBAR_BTN on purpose, so the fix belongs with that toolbar: 2 px corners, and 44 px at phone width.

### Refuted
- Row under Walk / Fly / Sound: the reserves line up with the placements in code — Walk / Fly at `right: 1rem`, Sound at `right: 9.5rem` beside it or at `1rem` alone (`PublicProjectViewer.jsx:566`); reserve 18.5 / 10.5 / 10 rem = 1 rem margin + control(s) + ≥ 1.5 rem gap, if the ~7.7 rem / ~6.5 rem widths hold (the comment calls them "about"; unmeasured here). At 390 px (`max-width: 560px` = compact) the row takes its own line.
- 30 versions: the row scrolls horizontally with edge-fade cues from `measure` (scroll, resize, links change); the walk column scrolls (`maxHeight`, `overflowY: auto`, `minHeight: 0`).
- aria: links carry `aria-current="page"`; the fold and the walk button carry `aria-expanded` + `aria-controls`; the nav has `aria-label`; all are native `<a>`/`<button>`, so keyboard order is DOM order.
- Row controls: every row link/button is `minHeight: 44px`, `borderRadius: 2px`; the visitor view bar is 44 × 44 min, 2 px.
- Titles reach the DOM only as React text (no innerHTML); hrefs come from `buildPublicProjectPath(spaceId, projectId)`.

### Not read
`LiveProjectScene` stacking in walk mode (finding 1); `publicViewerStyles.js` heights of Walk / Fly and Sound (padding 0.7 rem ×2 + line height — whether that is ≥ 44 px depends on the inherited line-height, not checked); `useViewportMode` beyond the query; tests of these components.
