import * as THREE from 'three'
import { movedTransforms } from './transformDelta.js'

const transformOf = (entity) => entity.components?.transform || {}

const matrixFromTransform = (transform = {}) => {
    const position = new THREE.Vector3(...(transform.position || [0, 0, 0]))
    const rotation = new THREE.Euler(...(transform.rotation || [0, 0, 0]), 'XYZ')
    const scale = new THREE.Vector3(...(transform.scale || [1, 1, 1]))
    return new THREE.Matrix4().compose(position, new THREE.Quaternion().setFromEuler(rotation), scale)
}

export const getSelectionCentroid = (entities = []) => {
    if (!entities.length) return [0, 0, 0]
    const sum = entities.reduce((result, entity) => {
        const position = transformOf(entity).position || [0, 0, 0]
        return result.map((value, index) => value + (position[index] || 0))
    }, [0, 0, 0])
    return sum.map((value) => value / entities.length)
}

export const applyPivotTransform = (entities, initialPivot, currentPivot) => {
    const initialMatrix = matrixFromTransform(initialPivot)
    const delta = matrixFromTransform(currentPivot).multiply(initialMatrix.clone().invert())

    return entities.map((entity) => {
        const result = delta.clone().multiply(matrixFromTransform(transformOf(entity)))
        const position = new THREE.Vector3()
        const quaternion = new THREE.Quaternion()
        const scale = new THREE.Vector3()
        result.decompose(position, quaternion, scale)
        const rotation = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ')
        return {
            id: entity.id,
            transform: {
                position: [position.x, position.y, position.z],
                rotation: [rotation.x, rotation.y, rotation.z],
                scale: [scale.x, scale.y, scale.z]
            }
        }
    })
}

// The multi-selection gizmo's drag, without three.js events: the gizmo calls `draggingChanged`
// from TransformControls' 'dragging-changed' (fired only by a pointer press/release on a handle)
// and `objectChange` while it moves. The selection is read at the grab and the delta is applied
// to THAT snapshot; a release commits only the entities that actually moved (transformDelta.js).
// A document change is never a gesture: it reaches no handler here, so it writes nothing.
export const createPivotDrag = ({ readPivot, getEntities, onPreview, onCommit }) => {
    let grab = null
    const updatesNow = () => (grab ? applyPivotTransform(grab.entities, grab.pivot, readPivot()) : [])
    return {
        draggingChanged(dragging) {
            if (dragging) {
                grab = { pivot: readPivot(), entities: getEntities() }
                return
            }
            if (!grab) return
            const changed = movedTransforms(grab.entities, updatesNow())
            grab = null
            onPreview({})
            if (changed.length) onCommit(changed)
        },
        objectChange() {
            if (!grab) return
            onPreview(Object.fromEntries(updatesNow().map((entry) => [entry.id, entry.transform])))
        },
        get dragging() { return Boolean(grab) }
    }
}
