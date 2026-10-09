// The browser's twin of shared/laserFrame.cjs (the laser frame: what the laser nodes send, the server
// and the room read). Kept equal by src/shared/laserFrame.test.js — change both or neither.
export const FRAME_MAX_POINTS = 2000
export const ALL_CUBES = 'all'

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : Number.NaN)

/** A frame's points cleaned: at most FRAME_MAX_POINTS, every number finite and in range, a bad point dropped. Pure. */
export const normaliseFramePoints = (points) => {
    const out = []
    let dropped = 0
    for (const p of Array.isArray(points) ? points : []) {
        if (out.length >= FRAME_MAX_POINTS) { dropped += 1; continue }
        const v = Array.isArray(p) ? p.slice(0, 5).map(num) : [num(p?.x), num(p?.y), num(p?.r), num(p?.g), num(p?.b)]
        if (v.length < 5 || v.some(Number.isNaN)) { dropped += 1; continue }
        out.push([clamp(v[0], -1, 1), clamp(v[1], -1, 1), clamp(v[2], 0, 1), clamp(v[3], 0, 1), clamp(v[4], 0, 1)])
    }
    return { points: out, dropped }
}
