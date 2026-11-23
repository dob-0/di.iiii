// Camera maths for the 3D Monitor map, free of React so the overlap script and the tests use the very same
// framing the page does. Units: room units (layout units x 0.01). `dir` points from the centre to the camera.
import { Box3, PerspectiveCamera, Vector3 } from 'three'

export const S = 0.01 // layout units -> room units
export const FOV = 45

const deg = (d) => (d * Math.PI) / 180
const unit = (x, y, z) => new Vector3(x, y, z).normalize()

// Camera presets: where the camera stands, seen from the centre of the map.
export const PRESET_DIRS = {
    fit: unit(0, Math.sin(deg(55)), Math.cos(deg(55))), // the default 3/4 view (55 degrees above the floor)
    front: unit(0, 0.22, 1),
    side: unit(1, 0.22, 0),
    top: unit(0, 1, 0.02),
    iso: unit(1, 0.85, 1)
}
export const PRESET_NAMES = ['front', 'side', 'top', 'iso']
export const PRESET_LABEL = { front: 'Front', side: 'Side', top: 'Top', iso: 'Iso', fit: 'Fit' }

/** Room-space points that bound the map (floor + card height of every node, and the hub). */
export const mapPoints = (layout) => {
    const list = [[0, 0.6, 0]]
    for (const n of layout.nodes) {
        const p = layout.pos.get(n.id)
        list.push([p.x * S, 0, p.y * S], [p.x * S, p.h * S + 0.7, p.y * S])
    }
    return list
}

/** Move the camera back along `dir` until the farthest projected point sits at 84 % of the half-screen. */
export const fitCamera = (camera, points, dir, size) => {
    const vs = points.map((p) => new Vector3(...p))
    const centre = new Box3().setFromPoints(vs).getCenter(new Vector3())
    camera.aspect = size.width && size.height ? size.width / size.height : 1
    const extent = (dist) => {
        camera.position.copy(centre).addScaledVector(dir, dist)
        camera.lookAt(centre)
        camera.updateProjectionMatrix()
        camera.updateMatrixWorld()
        let m = 0
        for (const v of vs) {
            const q = v.clone().project(camera)
            if (q.z >= 1) return Infinity // behind the camera
            m = Math.max(m, Math.abs(q.x), Math.abs(q.y))
        }
        return m
    }
    // Bisection on the distance (a farther camera always shows less of the map, so this is monotone and cannot
    // diverge the way a step-by-step fit did for the side view): the smallest distance where every point sits
    // inside 84 % of the half-screen. Re-centre the projected box a few times first so the map is centred.
    const reach = vs.reduce((m, v) => Math.max(m, v.distanceTo(centre)), 0)
    const half = Math.tan((camera.fov * Math.PI) / 360)
    const right = new Vector3()
    const up = new Vector3()
    let d = reach * 3
    for (let round = 0; round < 4; round += 1) {
        let lo = reach * 0.5 + 0.5
        let hi = reach * 12 + 20
        for (let i = 0; i < 40; i += 1) {
            const mid = (lo + hi) / 2
            if (extent(mid) <= 0.84) hi = mid
            else lo = mid
        }
        d = hi
        extent(d)
        let x0 = Infinity
        let x1 = -Infinity
        let y0 = Infinity
        let y1 = -Infinity
        for (const v of vs) {
            const q = v.clone().project(camera)
            x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y)
        }
        camera.matrixWorld.extractBasis(right, up, new Vector3())
        centre.addScaledVector(right, ((x0 + x1) / 2) * d * half * camera.aspect).addScaledVector(up, ((y0 + y1) / 2) * d * half)
    }
    extent(d)
    return { centre, dist: d }
}

/** The pose of a preset for a layout and stage size: where the camera sits and what it looks at. */
export const presetPose = (layout, name, size) => {
    const camera = new PerspectiveCamera(FOV, 1, 0.1, 200)
    const { centre, dist } = fitCamera(camera, mapPoints(layout), PRESET_DIRS[name] || PRESET_DIRS.fit, size)
    return { target: centre.clone(), position: camera.position.clone(), dist, aspect: camera.aspect }
}

/** A real camera standing at a pose, for projecting points. */
export const cameraAt = ({ position, target }, size) => {
    const cam = new PerspectiveCamera(FOV, size.width / size.height, 0.1, 200)
    cam.position.copy(position)
    cam.lookAt(target)
    cam.updateProjectionMatrix()
    cam.updateMatrixWorld()
    return cam
}

/** Room point -> stage pixels (and depth in 0..1, > 1 = behind the camera). */
export const toScreen = (camera, point, size) => {
    const q = new Vector3(...point).project(camera)
    return { x: (q.x * 0.5 + 0.5) * size.width, y: (-q.y * 0.5 + 0.5) * size.height, z: q.z }
}

/** Pose that looks at one node from the current viewing direction, close enough to read it. */
export const poseForNode = (layout, id, fromPosition, fromTarget, fitDist) => {
    const p = layout.pos.get(id)
    if (!p) return null
    const target = new Vector3(p.x * S, p.h * S * 0.6, p.y * S)
    const dir = new Vector3().subVectors(fromPosition, fromTarget).normalize()
    return { target, position: target.clone().addScaledVector(dir, Math.max(2.4, fitDist * 0.3)) }
}

/** One arrow-key / WASD step along the floor, relative to where the camera looks. Returns the room-space delta. */
export const keyStep = (key, camera, amount) => {
    const fwd = new Vector3()
    camera.getWorldDirection(fwd)
    fwd.y = 0
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1)
    fwd.normalize()
    const right = new Vector3().crossVectors(fwd, new Vector3(0, 1, 0)).normalize()
    const k = String(key).toLowerCase()
    const d = new Vector3()
    if (k === 'arrowup' || k === 'w') d.addScaledVector(fwd, amount)
    else if (k === 'arrowdown' || k === 's') d.addScaledVector(fwd, -amount)
    else if (k === 'arrowleft' || k === 'a') d.addScaledVector(right, -amount)
    else if (k === 'arrowright' || k === 'd') d.addScaledVector(right, amount)
    else return null
    return d
}
