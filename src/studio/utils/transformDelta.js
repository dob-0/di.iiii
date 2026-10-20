import * as THREE from 'three'

// Did a gizmo release actually move anything? (2026-10-13, moxir-v2-9 v1264–v1303: a Studio tab
// wrote 40 `updateComponent transform` ops on five lamps nobody had moved — the multi-selection
// gizmo commits on every release, and a grab with no motion still decomposes each lamp through
// matrices: scale 0.9999…, rotation re-spelled, e.g. x −π ↔ +π, the same orientation.)
// A write happens only when a value moved past these tolerances; rotation is compared as an
// orientation (quaternion angle, radians), so two Euler spellings of one pose are equal.
// 2026-10-14 (the lead, a project's op log): selecting lamps — no move — wrote rotation π as 3.1415853
// and scale 1 as 0.9999999, seven versions running. A selection never writes, and a write carries only
// the fields the user changed: `transformChange` below is the one choke point every commit goes through.
// The tolerance stays 1e-4 (0.1 mm, 0.006°, 0.01 % scale): the measured re-spelling of π is 7.4e-6 rad (π → 3.1415853),
// so 1e-6 would still write it as a rotation; 1e-4 is far below any move a person makes (the lead, 2026-10-14).
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

// The patch a commit may send: only the fields (position / rotation / scale) that moved past the
// tolerance, each as the new value; a field within it keeps its stored numbers (never re-spelled).
// null when nothing moved — the caller writes nothing.
export const transformChange = (storedTransform, nextTransform, tolerance = TRANSFORM_TOLERANCE) => {
    if (!nextTransform) return null
    const patch = {}
    if (nextTransform.position !== undefined
        && !closeVector(vectorOf(storedTransform, 'position'), vectorOf(nextTransform, 'position'), tolerance.position)) {
        patch.position = nextTransform.position
    }
    if (nextTransform.scale !== undefined
        && !closeVector(vectorOf(storedTransform, 'scale'), vectorOf(nextTransform, 'scale'), tolerance.scale)) {
        patch.scale = nextTransform.scale
    }
    if (nextTransform.rotation !== undefined
        && rotationAngleBetween(vectorOf(storedTransform, 'rotation'), vectorOf(nextTransform, 'rotation')) > tolerance.rotation) {
        patch.rotation = nextTransform.rotation
    }
    return Object.keys(patch).length ? patch : null
}

// Keep only the updates that moved, each reduced to the fields that moved.
export const movedTransforms = (entities = [], updates = [], tolerance = TRANSFORM_TOLERANCE) => {
    const stored = new Map(entities.map((entity) => [entity.id, entity.components?.transform || {}]))
    return updates.flatMap((entry) => {
        if (!entry?.id || !entry.transform) return []
        const patch = transformChange(stored.get(entry.id), entry.transform, tolerance)
        return patch ? [{ ...entry, transform: patch }] : []
    })
}
