import * as THREE from 'three'

const MIN_RADIUS = 0.75
const DEFAULT_PADDING = 1.35
const DEFAULT_FALLBACK_DIRECTION = new THREE.Vector3(0.8, 0.45, 1)

const getSafeRadius = (radius, minRadius = MIN_RADIUS) => {
    const numericRadius = Number(radius)
    if (!Number.isFinite(numericRadius)) return minRadius
    return Math.max(minRadius, numericRadius)
}

const getFallbackDirection = () => DEFAULT_FALLBACK_DIRECTION.clone().normalize()

const resolveViewDirection = (camera, target) => {
    const direction = new THREE.Vector3()
        .copy(camera?.position || DEFAULT_FALLBACK_DIRECTION)
        .sub(target || new THREE.Vector3())

    if (direction.lengthSq() <= 1e-8) {
        return getFallbackDirection()
    }

    return direction.normalize()
}

const buildSphereFromBox = (box, { minRadius = MIN_RADIUS } = {}) => {
    if (!box || box.isEmpty()) return null
    const sphere = new THREE.Sphere()
    box.getBoundingSphere(sphere)
    sphere.radius = getSafeRadius(sphere.radius, minRadius)
    return sphere
}

export const getObjectBoundingSphere = (object3D, options = {}) => {
    if (!object3D) return null
    const box = new THREE.Box3().setFromObject(object3D)
    return buildSphereFromBox(box, options)
}

export const getPointsBoundingSphere = (points = [], options = {}) => {
    const validPoints = (Array.isArray(points) ? points : [])
        .map((point) => {
            if (!Array.isArray(point) || point.length < 3) return null
            const vector = new THREE.Vector3(Number(point[0]), Number(point[1]), Number(point[2]))
            return Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z)
                ? vector
                : null
        })
        .filter(Boolean)

    if (!validPoints.length) return null

    const box = new THREE.Box3()
    validPoints.forEach(point => box.expandByPoint(point))

    if (box.isEmpty()) {
        const center = validPoints[0].clone()
        return new THREE.Sphere(center, getSafeRadius(0, options.minRadius))
    }

    return buildSphereFromBox(box, options)
}

export const frameSphereInControls = (controls, sphere, options = {}) => {
    if (!controls?.object || !sphere) return null

    const camera = controls.object
    const padding = Number.isFinite(options.padding) ? options.padding : DEFAULT_PADDING
    const target = sphere.center.clone()
    const radius = getSafeRadius(sphere.radius, options.minRadius) * padding
    const direction = resolveViewDirection(camera, controls.target)

    controls.target.copy(target)

    if (camera.isPerspectiveCamera) {
        const verticalHalfFov = THREE.MathUtils.degToRad((camera.fov || 50) / 2)
        const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * (camera.aspect || 1))
        const limitingHalfFov = Math.max(0.01, Math.min(verticalHalfFov, horizontalHalfFov))
        const distance = radius / Math.sin(limitingHalfFov)

        camera.position.copy(target).add(direction.multiplyScalar(distance))
        camera.near = Math.max(0.05, distance / 100)
        camera.far = Math.max(camera.far || 0, distance * 10)
        camera.updateProjectionMatrix()
    } else if (camera.isOrthographicCamera) {
        const viewHeight = Math.max(0.01, camera.top - camera.bottom)
        const viewWidth = Math.max(0.01, camera.right - camera.left)
        const zoomForHeight = viewHeight / (radius * 2)
        const zoomForWidth = viewWidth / (radius * 2)
        camera.zoom = Math.max(0.05, Math.min(zoomForHeight, zoomForWidth))
        camera.position.copy(target).add(direction.multiplyScalar(radius * 2))
        camera.updateProjectionMatrix()
    } else {
        camera.position.copy(target).add(direction.multiplyScalar(radius * 2))
    }

    controls.update()

    return {
        position: camera.position.toArray(),
        target: controls.target.toArray()
    }
}

