import * as THREE from 'three'

// entityId -> the live scene group SelectableEntity renders for it. The editor
// reads real extents from these for View Selected / View All. Hidden entities
// render nothing, so they are absent.
const objects = new Map()

export const registerEntityObject = (entityId, object3D) => {
    if (!entityId || !object3D) return () => {}
    objects.set(entityId, object3D)
    return () => { if (objects.get(entityId) === object3D) objects.delete(entityId) }
}

export const getEntityWorldBox = (entity) => {
    const object3D = objects.get(entity?.id)
    if (!object3D) return null
    object3D.updateWorldMatrix(true, true)
    const box = new THREE.Box3().setFromObject(object3D)
    return box.isEmpty() ? null : box
}
