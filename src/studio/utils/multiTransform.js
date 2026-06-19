import * as THREE from 'three'

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
