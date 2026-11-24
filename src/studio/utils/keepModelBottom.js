import { getEntityObject, getEntityWorldBox } from './entityObjectRegistry.js'

// A model's origin is its centre, so scaling it up in the editor pushed its bottom below the floor
// (and scaling down left it floating). When the scale of a model changes, keep its bottom where it
// was: move Y by the change in the distance from the origin down to the bottom.
// Editor only, and only for a scale the person changes — a stored space is never moved on load.
//
// The bottom is measured on the live object (its world box), per unit of the object's own Y scale, so
// it does not matter whether the live object already shows the new scale (gizmo drag) or not (inspector).
// Exact for a uniform scale change, and for any change when the model is only turned about Y; a scale
// that stretches one axis on a model tipped over X/Z has no single bottom, so it is left alone.
const NEAR = 1e-4

export const keepBottomOnScale = (entity, storedTransform, patch, probe = {}) => {
    if (!patch?.scale || patch.position || entity?.type !== 'model' || entity.parentId) return patch
    const stored = storedTransform || {}
    const oldScale = stored.scale || [1, 1, 1]
    const nextScale = patch.scale
    const rotation = patch.rotation || stored.rotation || [0, 0, 0]
    const uniform = nextScale.every((v, i) => Math.abs(v / (oldScale[i] || 1) - nextScale[0] / (oldScale[0] || 1)) < 1e-3)
    const turnedOverOnlyY = Math.abs(rotation[0]) < NEAR && Math.abs(rotation[2]) < NEAR
    if (!uniform && !turnedOverOnlyY) return patch

    const object = (probe.getObject || getEntityObject)(entity.id)
    const box = (probe.getBox || getEntityWorldBox)(entity)
    if (!object || !box || !(Math.abs(object.scale.y) > NEAR)) return patch

    const unitDrop = (object.position.y - box.min.y) / Math.abs(object.scale.y) // origin → bottom at scale 1
    if (!Number.isFinite(unitDrop)) return patch
    const position = stored.position || [0, 0, 0]
    const oldBottom = position[1] - unitDrop * Math.abs(oldScale[1])
    const nextY = oldBottom + unitDrop * Math.abs(nextScale[1])
    if (Math.abs(nextY - position[1]) < NEAR) return patch
    return { ...patch, position: [position[0], nextY, position[2]] }
}

// "Drop to floor": the Y that puts the model's bottom at 0.
export const floorY = (entity, probe = {}) => {
    const box = (probe.getBox || getEntityWorldBox)(entity)
    const object = (probe.getObject || getEntityObject)(entity?.id)
    if (!box || !object) return null
    return object.position.y - box.min.y
}
