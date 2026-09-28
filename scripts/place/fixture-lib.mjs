/**
 * fixture-lib.mjs — a lighting fixture as a small machine: where its parts
 * sit for a given pan and tilt, where its lens is, and which way its beam
 * leaves.
 *
 * Pure: no network, no file system. The geometry it needs (the pan axis, the
 * tilt axis, the lens) is what `fixtures/build_fixtures.py` measured on the
 * model it built and wrote beside the GLB (`fixtures/glb/<kind>.json`), so the
 * numbers that pose a head are the numbers of the head that is drawn.
 *
 * THE FIXTURE'S OWN FRAME (the one every model in fixtures/glb is built in,
 * metres, glTF Y up), the way a moving head stands on the floor:
 *   - the base sits on y = 0, its front (display, the side a technician faces)
 *     toward +Z;
 *   - PAN turns the yoke about the vertical axis through the base centre;
 *   - TILT turns the head about the yoke's horizontal axis (along X), at
 *     height `tiltY`;
 *   - at pan 0, tilt 0 the beam leaves the lens straight UP (+Y) — the
 *     "home" of most moving heads — and at tilt 90 it points toward +Z.
 * So the beam direction in the fixture frame is
 *     (sin t sin p, cos t, sin t cos p).
 * A fixture HUNG from a truss is the same machine turned upside down
 * (rotated half a turn about X), exactly as it is clamped in real life.
 *
 * These pan and tilt are the FIXTURE's, measured from its home — what a
 * lighting desk would send. They are not the pan/tilt the Studio's inspector
 * shows for the spot light entity (src/project/viewport/spotLightAim.js,
 * measured from straight DOWN in the room); rig-lib writes both.
 */
import { Matrix4, Quaternion, Vector3 } from 'three'

const DEG = Math.PI / 180
const round = (n, places = 4) => Math.round(n * 10 ** places) / 10 ** places + 0

/**
 * The fixture's base in the room.
 *
 * @param {object} mount
 * @param {[number, number, number]} mount.pos where the base's mounting face is (floor: its bottom; hung: its top, the clamp side)
 * @param {'floor'|'hung'} [mount.orient]
 * @param {[number, number, number]} [mount.face] the room direction the base's front should face (projected flat)
 * @returns {Matrix4}
 */
export const mountMatrix = ({ pos, orient = 'floor', face = [0, 0, 1] }) => {
    const hung = orient === 'hung'
    // The front of the base, in the room, before yaw: +Z standing, -Z hung
    // (half a turn about X flips it). Yaw turns it to face `face`.
    const fx = face[0]
    const fz = face[2]
    const flat = Math.hypot(fx, fz) > 1e-9 ? [fx, fz] : [0, 1]
    // Standing: front = (sin yaw, 0, cos yaw). Hung: front = (sin yaw, 0, -cos yaw).
    const yaw = hung ? Math.atan2(flat[0], -flat[1]) : Math.atan2(flat[0], flat[1])
    const m = new Matrix4().makeTranslation(pos[0], pos[1], pos[2])
    if (hung) m.multiply(new Matrix4().makeRotationX(Math.PI))
    m.multiply(new Matrix4().makeRotationY(yaw))
    return m
}

/** The unit beam direction in the fixture's own frame for a fixture pan/tilt (degrees). */
export const beamLocal = (pan, tilt) => {
    const p = pan * DEG
    const t = tilt * DEG
    return [Math.sin(t) * Math.sin(p), Math.cos(t), Math.sin(t) * Math.cos(p)]
}

/**
 * The fixture pan/tilt (degrees) that sends the beam along a room direction.
 * Tilt is 0..180 from home; pan -180..180. A real head has 540 deg of pan and
 * about 270 of tilt (±135 from home), so a tilt past `tiltMax` is flagged —
 * that aim is out of the machine's reach from this mounting.
 */
export const solvePanTilt = (mount, dirWorld, { tiltMax = 135 } = {}) => {
    const inv = new Quaternion().setFromRotationMatrix(mount).invert()
    const d = new Vector3(...dirWorld).normalize().applyQuaternion(inv)
    const tilt = Math.acos(Math.min(1, Math.max(-1, d.y))) / DEG
    const flat = Math.hypot(d.x, d.z)
    const pan = flat < 1e-9 ? 0 : Math.atan2(d.x, d.z) / DEG
    return { pan: round(pan), tilt: round(tilt), reachable: tilt <= tiltMax + 1e-6 }
}

/**
 * Every part of a fixture posed in the room.
 *
 * @param {object} geo  the built model's sidecar: { kind, panY, tiltY, lensY, parts: [...] }
 * @param {Matrix4} mount mountMatrix(...)
 * @param {{ pan: number, tilt: number }} aim fixture pan/tilt, degrees
 * @returns {{ parts: Record<string, Matrix4>, lens: number[], dir: number[], pivot: number[] }}
 */
export const poseFixture = (geo, mount, { pan = 0, tilt = 0 } = {}) => {
    const parts = {}
    const moving = geo.motion === 'pan-tilt' || geo.motion === 'tilt'
    if (!moving) {
        for (const part of geo.parts) parts[part] = mount.clone()
        const lensLocal = new Vector3(0, geo.lensY ?? 0, 0).applyMatrix4(mount)
        const dir = new Vector3(0, 1, 0).applyQuaternion(new Quaternion().setFromRotationMatrix(mount))
        return { parts, lens: lensLocal.toArray().map((v) => round(v)), dir: dir.toArray().map((v) => round(v, 6)), pivot: lensLocal.toArray() }
    }
    // A PAR or a laser has no pan motor: its bracket (the "yoke") is turned
    // by hand on its clamp, which is the same rotation.
    const yoke = mount.clone()
        .multiply(new Matrix4().makeTranslation(0, geo.panY ?? 0, 0))
        .multiply(new Matrix4().makeRotationY(pan * DEG))
    const head = yoke.clone()
        .multiply(new Matrix4().makeTranslation(0, (geo.tiltY ?? 0) - (geo.panY ?? 0), 0))
        .multiply(new Matrix4().makeRotationX(tilt * DEG))
    for (const part of geo.parts) {
        if (part === 'Base') parts[part] = mount.clone()
        else if (part === 'Yoke') parts[part] = yoke
        else parts[part] = head // Head, Lens: both ride the tilt
    }
    // The lens sits on the head's beam axis — except a laser's window, which
    // is in a hood at the top edge of its front face: that offset (toward the
    // fixture's front, `lensOffsetFront_m`) moves the beam's start, not its
    // direction; aiming from the pivot then misses by that much (~0.1 m).
    const lens = new Vector3(0, geo.lensY - geo.tiltY, geo.lensOffsetFront_m ?? 0).applyMatrix4(head)
    const pivot = new Vector3(0, 0, 0).applyMatrix4(head)
    const dir = new Vector3(0, 1, 0).applyQuaternion(new Quaternion().setFromRotationMatrix(head)).normalize()
    return { parts, lens: lens.toArray().map((v) => round(v)), dir: dir.toArray().map((v) => round(v, 6)), pivot: pivot.toArray() }
}

/** The tilt axis's position in the room: fixed for a mounting, whatever the pan (it sits on the pan axis). */
export const tiltPivot = (geo, mount) => new Vector3(0, geo.tiltY ?? geo.lensY ?? 0, 0).applyMatrix4(mount).toArray()

/**
 * Aim a fixture at a room point (or along a room direction) and pose it.
 * The beam axis passes through the tilt pivot, so aiming from the pivot is
 * exact — no iteration, whatever the lens offset.
 */
export const aimFixture = (geo, mountSpec, { target = null, dir = null }) => {
    const mount = mountMatrix(mountSpec)
    const moving = geo.motion === 'pan-tilt' || geo.motion === 'tilt'
    if (!moving) return { ...poseFixture(geo, mount), pan: 0, tilt: 0, reachable: true }
    const pivot = tiltPivot(geo, mount)
    const d = dir || [target[0] - pivot[0], target[1] - pivot[1], target[2] - pivot[2]]
    const { pan, tilt, reachable } = solvePanTilt(mount, d, { tiltMax: geo.tiltMaxDeg ?? 135 })
    return { ...poseFixture(geo, mount, { pan, tilt }), pan, tilt, reachable }
}

/** A matrix as glTF TRS (translation, rotation quaternion xyzw, scale). */
export const toTRS = (m) => {
    const t = new Vector3()
    const q = new Quaternion()
    const s = new Vector3()
    m.decompose(t, q, s)
    return { t: t.toArray(), r: [q.x, q.y, q.z, q.w], s: s.toArray() }
}

