import * as THREE from 'three'

const MIN_RADIUS = 0.75
const DEFAULT_PADDING = 1.35
const DEFAULT_FOV = 50
const MIN_HALF_FOV = 0.01
const DEFAULT_FALLBACK_DIRECTION = new THREE.Vector3(0.8, 0.45, 1)

const getSafeAspect = (aspect) => {
    const numericAspect = Number(aspect)
    return Number.isFinite(numericAspect) && numericAspect > 0 ? numericAspect : 1
}

// A perspective camera only fits a sphere on BOTH axes if it fits the narrower
// one. On a landscape viewport that is the vertical fov; on a portrait phone
// (390x844 -> aspect ~0.46) the horizontal fov is roughly half as wide, so
// fitting to vertical alone crops the sides of the work. Every framing path
// must go through this, or the two copies drift apart again — which is exactly
// how published pages ended up cropping on phones.
export const getLimitingHalfFov = (fov = DEFAULT_FOV, aspect = 1) => {
    const numericFov = Number.isFinite(Number(fov)) ? Number(fov) : DEFAULT_FOV
    const verticalHalfFov = Math.max(MIN_HALF_FOV, THREE.MathUtils.degToRad(numericFov / 2))
    const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * getSafeAspect(aspect))
    return Math.max(MIN_HALF_FOV, Math.min(verticalHalfFov, horizontalHalfFov))
}

export const computeFitDistance = (radius, { fov = DEFAULT_FOV, aspect = 1 } = {}) =>
    radius / Math.sin(getLimitingHalfFov(fov, aspect))

// How much further back a viewport of this shape has to sit, relative to the
// vertical-only fit, to show the same sphere. 1 for anything square or wider,
// ~2 for a portrait phone.
export const getAspectFitScale = (fov = DEFAULT_FOV, aspect = 1) =>
    Math.sin(getLimitingHalfFov(fov, 1)) / Math.sin(getLimitingHalfFov(fov, aspect))

// Best available guess at the aspect of the surface a scene is about to be
// drawn into, for callers computing a camera before any canvas exists. Chrome
// above the canvas only makes the real canvas shorter (a WIDER aspect), so
// erring on the window's aspect errs toward framing slightly wider — never
// toward cropping.
export const getViewportAspect = (fallback = 1) => {
    if (typeof window === 'undefined') return fallback
    const width = Number(window.innerWidth)
    const height = Number(window.innerHeight)
    if (!(width > 0) || !(height > 0)) return fallback
    return width / height
}

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

// Same framing math as frameSphereInControls but for callers with no live
// CameraControls instance yet (e.g. computing an initial camera before mount).
// Pass `aspect` (width / height of the surface it will be drawn into) or the
// shot is fitted to the vertical fov only and crops on a portrait phone.
export const computeFramingCamera = (sphere, options = {}) => {
    if (!sphere) return null

    const fov = Number.isFinite(options.fov) ? options.fov : DEFAULT_FOV
    const aspect = getSafeAspect(options.aspect)
    const padding = Number.isFinite(options.padding) ? options.padding : DEFAULT_PADDING
    const target = sphere.center.clone()
    const radius = getSafeRadius(sphere.radius, options.minRadius) * padding
    const direction = options.direction
        ? new THREE.Vector3(...options.direction).normalize()
        : getFallbackDirection()

    const fitDistance = computeFitDistance(radius, { fov, aspect })
    // `maxDistance` caps how much of a sprawling scene the entry shot swallows,
    // not a raw metric distance — so it has to carry the same aspect correction
    // the fit just got. Left unscaled it clamps a portrait phone straight back
    // to the vertical-only distance and silently re-crops the work.
    const maxDistance = Number.isFinite(options.maxDistance)
        ? options.maxDistance * getAspectFitScale(fov, aspect)
        : null
    const distance = maxDistance === null ? fitDistance : Math.min(fitDistance, maxDistance)
    const position = target.clone().add(direction.multiplyScalar(distance))

    return {
        position: position.toArray(),
        target: target.toArray(),
        fov
    }
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
        const distance = computeFitDistance(radius, {
            fov: camera.fov || DEFAULT_FOV,
            aspect: camera.aspect
        })

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

