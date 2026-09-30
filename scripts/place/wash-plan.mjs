/**
 * wash-plan.mjs — the plan for one baked wash PER LOOK (rig.mjs --wash-per-look), pure.
 * docs/architecture/RIG_BUILD.md §15.13.
 *
 * The single `rig-wash` (rig.mjs --wash-only --look <id>) is baked for one look and the
 * room can only fade it; every other scene shows that look's lamps in that look's colour,
 * or nothing. Per look, the writer bakes each look's own washes (rig-lib.mjs buildRig with
 * that look: its aims, colours and levels — a lamp at level 0 bakes none) into one mesh,
 * entity `rig-wash:<lookId>`, written HIDDEN (runtime.visible false): the room shows the
 * playing look's and cross-fades between two (src/rigbuild/looks.js withLookWash).
 *
 * Content-addressed: a project asset's id is the sha256 of its bytes (serverXR assetHash.js),
 * so a bake whose bytes the project already holds is not uploaded again, and two looks that
 * bake the same bytes share one asset. The single `rig-wash` is left alone: it is the
 * fallback for a look with no wash of its own.
 */
import { createHash } from 'node:crypto'

import { WASH_BYTES_CAP, WASH_ENTITY_ID, lookIdOfWash, washEntityId } from '../../src/rigbuild/looks.js'

export { WASH_BYTES_CAP }

export const sha256Hex = (bytes) => createHash('sha256').update(bytes).digest('hex')

const kb = (n) => `${(n / 1024).toFixed(0)} KB`

/**
 * Every wash byte the project would hold after the write: the new per-look bakes (one count
 * per distinct content) plus the single `rig-wash`'s asset, if any. Refused above the cap.
 *   bakes: [{ lookId, bytes }]   have: the project's entities   assets: the project's assets
 */
export const washBudget = ({ bakes = [], have = [], assets = [], cap = WASH_BYTES_CAP } = {}) => {
    const sizes = new Map()
    for (const b of bakes) sizes.set(sha256Hex(b.bytes), b.bytes.length)
    const assetSize = new Map((assets || []).map((a) => [a?.id, Number(a?.size) || 0]))
    const single = (have || []).find((e) => e?.id === WASH_ENTITY_ID)
    const singleId = single?.components?.media?.assetId
    // The single wash's asset is the same file as a bake's when the bytes match: one count.
    const singleBytes = single && !sizes.has(singleId) ? assetSize.get(singleId) || 0 : 0
    const perLook = [...sizes.values()].reduce((a, b) => a + b, 0)
    const total = perLook + singleBytes
    const ok = total <= cap
    const line = `wash bytes: ${bakes.length} looks, ${sizes.size} distinct meshes, ${kb(perLook)} per look together` +
        (singleBytes ? ` + ${kb(singleBytes)} the single rig-wash` : '') + ` = ${kb(total)} of the ${kb(cap)} cap`
    return {
        ok, total, perLook, singleBytes, cap, line,
        message: ok ? null : `REFUSED: ${kb(total)} of baked wash for one project is over the ${kb(cap)} cap (${line}). ` +
            'Fewer looks with PARs on, fewer sampled patches (wash-glb.mjs rows/cols), or a bigger cap with a reason — nothing was written.'
    }
}

/** The entity for one look's wash. */
export const perLookWashEntity = ({ lookId, assetId, count }) => ({
    id: washEntityId(lookId),
    type: 'model',
    name: `${count} PAR washes for the look ${lookId}, baked (no light) — re-run rig.mjs --wash-per-look to change`,
    components: {
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        media: { assetId, playAnimations: false },
        animation: { mode: 'static', speed: 1, amplitude: 1 },
        // Hidden until a look plays: the room shows the playing look's (withLookWash).
        appearance: { opacity: 0 },
        runtime: { visible: false }
    }
})

/**
 * The ops for a set of bakes against the project as it is:
 *   - every old `rig-wash:<look>` goes (the look was re-baked, bakes none now, or is gone), and
 *     its asset with it unless a new entity (or the single wash) still points at it;
 *   - each bake's asset is upserted once per distinct content, and its entity created;
 *   - the single `rig-wash` is not touched.
 * `assetFor(lookId)` is the uploaded asset record for that look (id = its content hash).
 */
export const perLookWashOps = ({ have = [], bakes = [], assetFor }) => {
    const ops = []
    // Every entity that is NOT a per-look wash stays, so its asset does (the single wash, a
    // duplicate of a wash, a model with the same bytes).
    const keptAssets = new Set(have.filter((e) => e && !lookIdOfWash(e.id)).map((e) => e.components?.media?.assetId).filter(Boolean))
    const news = bakes.map((b) => ({ lookId: b.lookId, count: b.count, asset: assetFor(b.lookId) }))
    for (const n of news) keptAssets.add(n.asset.id)
    const old = have.filter((e) => lookIdOfWash(e?.id))
    for (const e of old) ops.push({ type: 'deleteEntity', payload: { entityId: e.id } })
    const oldAssets = new Set(old.map((e) => e.components?.media?.assetId).filter((id) => id && !keptAssets.has(id)))
    for (const assetId of oldAssets) ops.push({ type: 'deleteAsset', payload: { assetId } })
    const upserted = new Set()
    for (const n of news) {
        if (!upserted.has(n.asset.id)) { upserted.add(n.asset.id); ops.push({ type: 'upsertAsset', payload: { asset: n.asset } }) }
        ops.push({ type: 'createEntity', payload: { entity: perLookWashEntity({ lookId: n.lookId, assetId: n.asset.id, count: n.count }) } })
    }
    return ops
}

/** Which bakes need an upload: those whose content the project does not already hold. */
export const uploadsNeeded = ({ bakes = [], assets = [] } = {}) => {
    const held = new Set((assets || []).map((a) => a?.id).filter(Boolean))
    const seen = new Set()
    const out = []
    for (const b of bakes) {
        const hash = sha256Hex(b.bytes)
        if (held.has(hash) || seen.has(hash)) continue
        seen.add(hash)
        out.push({ hash, bytes: b.bytes, lookId: b.lookId })
    }
    return out
}

/**
 * The `deleteAsset` ops for the assets of the entities being removed: only those no entity that
 * STAYS still points at. Assets are content-addressed, so a wash baked for one look and the
 * per-look bake of the same look are one asset — dropping it would leave the other without a
 * file. `removed`: the entities going; `have`: the project's entities before the write;
 * `keep`: asset ids the write itself puts (a new wash's asset).
 */
export const freedAssetOps = ({ removed = [], have = [], keep = [] } = {}) => {
    const gone = new Set(removed.map((e) => e?.id))
    const used = new Set(keep)
    for (const e of have) if (e && !gone.has(e.id) && e.components?.media?.assetId) used.add(e.components.media.assetId)
    const ids = new Set(removed.map((e) => e?.components?.media?.assetId).filter((id) => id && !used.has(id)))
    return [...ids].map((assetId) => ({ type: 'deleteAsset', payload: { assetId } }))
}

/** The line a full rig.mjs run says about the per-look washes it takes down with every `rig-` entity. */
export const washRemovalLine = (old = []) => {
    const n = old.filter((e) => lookIdOfWash(e?.id)).length
    return n ? `  ${n} per-look wash${n === 1 ? '' : 'es'} (rig-wash:*) taken down with the rig: re-bake them with rig.mjs --wash-per-look` : null
}
