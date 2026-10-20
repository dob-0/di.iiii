// THE STUDIO'S WALK BUILDS — the keys and clicks the walk hands to its builder
// (useWalkNavigation.setWalkBuilder). Pure but for the deps it is given, so it is tested
// without a canvas. The hand is the rig Build surface's own (hotbar.js, buildAim.js,
// buildActions.js — imported, never copied); every place / remove is ONE call of
// `apply(ops, message)`, which the Studio points at applyLocalOps of useOpHistory, the path
// every other add / delete takes — so Ctrl+Z undoes it and there is no second writer.

import { HEIGHT_STEPS, castAim, placement, turn } from '../../rigbuild/buildAim.js'
import { slotOfKey } from '../../rigbuild/hotbar.js'
import { pieceOf } from '../../rigbuild/pieces.js'
import { placeOpsFor, removeOpsFor } from '../../rigbuild/buildActions.js'

/** What the crosshair meets, and where the slot in hand would snap. Pure. */
export const aimFrom = ({ origin, direction, model, slot, yaw = 0 }) => {
    const hit = castAim({ origin, direction, pieces: model.pieces, lamps: model.lamps.map((l) => ({ id: l.id, lens: l.lens })) })
    const category = slot && slot.kind !== 'lamp' ? pieceOf(slot.kind)?.category : null
    const height = category ? HEIGHT_STEPS[category]?.start ?? null : null
    const place = slot ? placement({ slot, hit, yaw, height, pieces: model.pieces }) : null
    return { hit, place, lampId: hit?.what === 'lamp' ? hit.id : null, pieceId: hit?.what === 'piece' ? hit.id : null }
}

/**
 * @param {object} d  getters read at the moment of the key (fresh state, no stale closure):
 *   slots(), slotIndex(), model(), entities(), library(), inventoryOpen(), yaw()
 *   and the doers: apply(ops, message), say(text), pick(i), setInventory(bool), setYaw(n), undo(), redo(),
 *   newId(), ensureAsset(kind) -> Promise<assetId>
 */
export function createWalkBuilder(d) {
    const slotInHand = () => d.slots()[Math.min(d.slotIndex(), d.slots().length - 1)] || null
    const place = async (ray) => {
        const slot = slotInHand()
        const aim = aimFrom({ ...ray, model: d.model(), slot, yaw: d.yaw() })
        try {
            const assetId = slot && slot.kind !== 'lamp' && aim.place?.ok && !slot.full ? await d.ensureAsset(aim.place.kind) : null
            const done = placeOpsFor({ slot, place: aim.place, library: d.library(), entities: d.entities(), newId: d.newId, pieces: d.model().pieces, assetId })
            if (done.ops.length) d.apply(done.ops, done.message)
            d.say(done.message)
        } catch (err) {
            d.say(`could not place: ${err?.message || err}`)
        }
    }
    const remove = (ray) => {
        const aim = aimFrom({ ...ray, model: d.model(), slot: null })
        const done = removeOpsFor({ aim, model: d.model(), entities: d.entities(), library: d.library() })
        if (done.ops.length) d.apply(done.ops, done.message)
        d.say(done.message)
    }
    return {
        holds: () => d.inventoryOpen(),
        key(e, ray) {
            const k = String(e.key || '').toLowerCase()
            if (d.inventoryOpen()) {
                // The room holds still while the inventory has the mouse: E and Esc close it, nothing else moves the walker.
                if (k === 'e' || k === 'escape') { d.setInventory(false); ray?.relock?.() }
                return true
            }
            if ((e.ctrlKey || e.metaKey) && k === 'z') { if (e.shiftKey) d.redo(); else d.undo(); return true }
            if ((e.ctrlKey || e.metaKey) && k === 'y') { d.redo(); return true }
            if (e.ctrlKey || e.metaKey || e.altKey) return false
            const i = slotOfKey(k, d.slots().length)
            if (i >= 0) { d.pick(i); return true }
            if (k === 'e') { d.setInventory(true); return true }
            if (k === 'r') { d.setYaw(turn(d.yaw(), { fine: e.shiftKey })); return true }
            return false
        },
        pointer(e, ray) {
            if (e.button === 0) { place(ray); return true }
            if (e.button === 2) { remove(ray); return true }
            return false
        }
    }
}
