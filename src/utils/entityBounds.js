import * as THREE from 'three'

// Real-extent framing for "View Selected" / "View All" (Blender frames the
// object's bounding box, not its origin). Pure: the caller supplies `getBox`,
// which returns the entity's WORLD-space THREE.Box3 (from its scene object) or
// null when it has none. Fallback when there is no object: a unit box at the
// entity's position, scaled by transform.scale and rotated by transform.rotation.

const isVisible = (entity) => entity?.components?.runtime?.visible !== false

const finiteVec = (value, fallback) => {
    if (!Array.isArray(value) || value.length < 3) return fallback
    const v = value.slice(0, 3).map(Number)
    return v.every(Number.isFinite) ? v : fallback
}

export const fallbackEntityBox = (entity) => {
    const t = entity?.components?.transform || {}
    const [px, py, pz] = finiteVec(t.position, [0, 0, 0])
    const [sx, sy, sz] = finiteVec(t.scale, [1, 1, 1])
    const [rx, ry, rz] = finiteVec(t.rotation, [0, 0, 0])
    const matrix = new THREE.Matrix4().compose(
        new THREE.Vector3(px, py, pz),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
        new THREE.Vector3(sx, sy, sz)
    )
    return new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5)).applyMatrix4(matrix)
}

// The entities a frame command acts on: the visible selected ones, or, with
// nothing selected, every visible entity (the whole room).
export const pickFrameTargets = (entities = [], selectedEntities = []) => {
    const visible = (entities || []).filter(isVisible)
    const selected = (selectedEntities || []).filter(isVisible)
    return selected.length ? selected : visible
}

export const entitiesBoundingBox = (entities = [], getBox = null) => {
    const total = new THREE.Box3()
    for (const entity of entities || []) {
        if (!isVisible(entity)) continue
        let box = null
        try { box = typeof getBox === 'function' ? getBox(entity) : null } catch { box = null }
        if (!box || box.isEmpty?.()) box = fallbackEntityBox(entity)
        total.union(box)
    }
    return total
}

export const entitiesBoundingSphere = (entities = [], getBox = null, { minRadius = 0.75 } = {}) => {
    const box = entitiesBoundingBox(entities, getBox)
    if (box.isEmpty()) return null
    const sphere = new THREE.Sphere()
    box.getBoundingSphere(sphere)
    sphere.radius = Math.max(minRadius, sphere.radius)
    return sphere
}
