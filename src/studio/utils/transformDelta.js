import * as THREE from 'three'

// Did a gizmo release actually move anything? (2026-10-13, moxir-v2-9 v1264–v1303: a Studio tab
// wrote 40 `updateComponent transform` ops on five lamps nobody had moved — the multi-selection
// gizmo commits on every release, and a grab with no motion still decomposes each lamp through
// matrices: scale 0.9999…, rotation re-spelled, e.g. x −π ↔ +π, the same orientation.)
// A write happens only when a value moved past these tolerances; rotation is compared as an
// orientation (quaternion angle), so two Euler spellings of one pose are equal.
export const TRANSFORM_TOLERANCE = Object.freeze({ position: 1e-4, rotation: 1e-4, scale: 1e-4 })

const DEFAULTS = { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }

const vectorOf = (transform, key) => {
    const value = transform?.[key]
    return Array.isArray(value) && value.length === 3 ? value.map(Number) : DEFAULTS[key]
}

const closeVector = (a, b, tolerance) => a.every((value, index) => Math.abs(value - b[index]) <= tolerance)

const quaternionOf = (rotation) => new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation, 'XYZ'))

export const rotationAngleBetween = (a, b) => quaternionOf(a).angleTo(quaternionOf(b))

export const sameTransform = (a, b, tolerance = TRANSFORM_TOLERANCE) => (
    closeVector(vectorOf(a, 'position'), vectorOf(b, 'position'), tolerance.position)
    && closeVector(vectorOf(a, 'scale'), vectorOf(b, 'scale'), tolerance.scale)
    && rotationAngleBetween(vectorOf(a, 'rotation'), vectorOf(b, 'rotation')) <= tolerance.rotation
)

// Keep only the updates whose transform differs from the entity's stored one.
export const movedTransforms = (entities = [], updates = [], tolerance = TRANSFORM_TOLERANCE) => {
    const stored = new Map(entities.map((entity) => [entity.id, entity.components?.transform || {}]))
    return updates.filter((entry) => entry?.id && entry.transform
        && !sameTransform(stored.get(entry.id), entry.transform, tolerance))
}
