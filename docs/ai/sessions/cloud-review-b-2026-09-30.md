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
