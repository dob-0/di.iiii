// deviceorientation's beta and gamma, turned into the x and y a work wires.
//
// Device frame (W3C DeviceOrientation): gamma grows as the RIGHT edge dips,
// beta grows as the TOP edge rises toward the person. Screen frame we hand
// out: x grows as the screen's right edge dips, y as the screen's top edge
// dips — the way a marble on the glass would roll. Level is the pose at the
// first reading (however the person happened to hold the phone), so a phone
// held at 50° reads 0,0 and nobody has to lay it flat to start.
//
// When the screen turns (screen.orientation.angle 90 / 180 / 270) the device
// axes no longer point where the screen's do, so the pair is turned with it:
//   x = dγ·cos a + dβ·sin a,   y = −dβ·cos a + dγ·sin a
// Portrait (a = 0) gives x = dγ, y = −dβ; landscape with the top edge on the
// left (a = 90) gives x = dβ, y = dγ.

export const DEFAULT_TILT_RANGE = 30

const clampUnit = (value) => Math.max(-1, Math.min(1, value))

// Two decimals: a resting phone jitters in the third, and every distinct
// value re-renders the editor.
const round = (value) => Math.round(value * 100) / 100

export const screenAngle = (win = globalThis.window) => {
    try {
        const angle = Number(win?.screen?.orientation?.angle ?? win?.orientation ?? 0)
        return Number.isFinite(angle) ? angle : 0
    } catch {
        return 0
    }
}

export const tiltFromOrientation = ({ beta, gamma }, rest, { range = DEFAULT_TILT_RANGE, angle = 0 } = {}) => {
    const span = Number(range) > 0 ? Number(range) : DEFAULT_TILT_RANGE
    const dBeta = Number(beta) - Number(rest?.beta ?? 0)
    const dGamma = Number(gamma) - Number(rest?.gamma ?? 0)
    if (!Number.isFinite(dBeta) || !Number.isFinite(dGamma)) return null
    const a = (Number(angle) || 0) * Math.PI / 180
    const cos = Math.round(Math.cos(a))
    const sin = Math.round(Math.sin(a))
    const x = dGamma * cos + dBeta * sin
    const y = -dBeta * cos + dGamma * sin
    // `+ 0` folds a −0 into 0 so a level phone reads exactly 0.
    return { x: round(clampUnit(x / span)) + 0, y: round(clampUnit(y / span)) + 0 }
}

// iOS 13+ hides orientation behind a prompt that only a tap may open.
export const needsOrientationPermission = (win = globalThis.window) =>
    typeof win?.DeviceOrientationEvent?.requestPermission === 'function'
