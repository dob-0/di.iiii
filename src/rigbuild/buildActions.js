// WHAT A CLICK DOES WHILE BUILDING — the rig Build surface (/build) and the Studio's Walk
// both place the hotbar's object where you aim and remove what you aim at. Pure: the
// document and the aim in, ops and the words for them out. Each caller applies the ops
// through its own op log (the Studio: applyLocalOps of useOpHistory, so Ctrl+Z undoes it).
// docs/architecture/RIG_BUILD.md §10, §12.

import { typeById } from './fixtureTypes.js'
import { pieceOf } from './pieces.js'
import { nextUnit } from './plotGeometry.js'
import { createOps, deleteOps, lampEntity, pieceEntity, ridersOfIds } from './plotEdits.js'
import { fullWords } from './hotbar.js'
import { snapWords } from './buildAim.js'

/**
 * A slot in hand and the snap the aim gives it, as ops.
 * @returns {{ops: object[], id: string|null, message: string}} no ops: `message` says why
 */
export const placeOpsFor = ({ slot, place, library, entities, newId, pieces = [], assetId = null }) => {
    if (!slot) return { ops: [], id: null, message: 'nothing in hand' }
    if (!place?.ok) return { ops: [], id: null, message: place?.reason || 'aim at the floor, a truss, a tower or a deck' }
    if (slot.full) return { ops: [], id: null, message: fullWords(slot) }
    const target = place.to?.id ? entities.find((e) => e.id === place.to.id) : null
    if (slot.kind === 'lamp') {
        const type = typeById(library, slot.type)
        if (!type) return { ops: [], id: null, message: 'that type is not in the library' }
        const position = target?.name || (place.hung ? 'truss' : 'floor')
        const lamp = lampEntity({ id: newId(), type, mount: place.position, hung: place.hung, position, unit: nextUnit(entities, position), entities })
        return {
            ops: createOps([lamp]), id: lamp.id,
            message: `${type.code} placed · ${snapWords(place, pieces)}${type.modesOwed ? ' · mode owed, not patched' : ' · auto-patch follows'}`
        }
    }
    // A truss that continues another takes its name — the same run, the same position.
    const name = pieceOf(slot.kind).category === 'truss' && target && pieceOf(target.components?.piece?.kind)?.category === 'truss' ? target.name : ''
    const piece = pieceEntity({ id: newId(), kind: place.kind, position: place.position, yaw: place.yaw, height: place.height, assetId, name })
    return { ops: createOps([piece]), id: piece.id, message: `${pieceOf(place.kind).label} placed · ${snapWords(place, pieces)}` }
}

/**
 * The lamp or piece under the crosshair, as delete ops (a piece takes the lamps hung on it).
 * @returns {{ops: object[], id: string|null, message: string}}
 */
export const removeOpsFor = ({ aim, model, entities, library }) => {
    const { lampId, pieceId } = aim || {}
    if (lampId) {
        const lamp = model.lampById?.get(lampId) || model.lamps?.find((l) => l.id === lampId)
        return { ops: deleteOps([lampId]), id: lampId, message: `removed ${lamp?.code || 'a lamp'}${lamp?.index ? ` #${lamp.index}` : ''}` }
    }
    if (pieceId) {
        const riders = ridersOfIds(entities, [pieceId], library)
        const piece = model.pieces.find((x) => x.id === pieceId)
        return {
            ops: deleteOps([pieceId, ...riders]), id: pieceId,
            message: `removed ${piece ? pieceOf(piece.kind).label : 'a piece'}${riders.length ? ` and the ${riders.length} lamps on it` : ''}`
        }
    }
    return { ops: [], id: null, message: 'aim at a piece or a lamp to remove it' }
}
