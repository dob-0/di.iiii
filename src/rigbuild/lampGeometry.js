// LENS <-> MOUNT — where a lamp is fixed versus where its light leaves.
// docs/architecture/RIG_BUILD.md §2.3, §6.
//
// A lamp entity's position is its LENS: the room renders the light from there,
// and every rig written so far (scripts/place/rig-lib.mjs) puts it there. A crew,
// a plot and an MVR file want the MOUNT: the clamp on the truss, or the base on
// the floor. The body's own heights (from the type: panY, tiltY, lensY, metres in
// the body's frame, base on y = 0, beam +Y at home) turn one into the other:
//
//   up          = +Y standing, -Y hung (base up)
//   tilt centre = mount + up * tiltY
//   lens        = tilt centre + beam * (lensY - tiltY)
//
// For a body with no tilt axis (a smoke or spark machine) the lens is straight
// above (or below) the mount by lensY. Exact for the modelled bodies; a real unit
// differs by its real dimensions.

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scale = (v, k) => [v[0] * k, v[1] * k, v[2] * k]
const unit = (v) => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1
    return [v[0] / l, v[1] / l, v[2] / l]
}

const heights = (type) => {
    const m = type?.model3d || {}
    const lensY = Number.isFinite(m.lensY) ? m.lensY : 0
    const tiltY = Number.isFinite(m.tiltY) ? m.tiltY : null
    return { lensY, tiltY }
}

export const lensFromMount = ({ mount, hung = false, beam = [0, 1, 0], type }) => {
    const up = [0, hung ? -1 : 1, 0]
    const { lensY, tiltY } = heights(type)
    if (tiltY == null) return add(mount, scale(up, lensY))
    return add(add(mount, scale(up, tiltY)), scale(unit(beam), lensY - tiltY))
}

export const mountFromLens = ({ lens, hung = false, beam = [0, 1, 0], type }) => {
    const up = [0, hung ? -1 : 1, 0]
    const { lensY, tiltY } = heights(type)
    if (tiltY == null) return add(lens, scale(up, -lensY))
    return add(add(lens, scale(unit(beam), -(lensY - tiltY))), scale(up, -tiltY))
}
