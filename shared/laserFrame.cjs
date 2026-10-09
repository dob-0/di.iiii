// THE LASER FRAME — what di's laser nodes send and the server and the room read (MOXIR, 2026-10-05).
//
// A frame is one drawing for one LaserCube, or for all of them: a list of points the scanner traces in
// order, again and again. A point is [x, y, r, g, b]:
//   x, y  -1 … 1, as the cube sees it: x to its right, y up, 0 the centre of its field
//   r, g, b  0 … 1, the beam's colour at that point; 0, 0, 0 is a blank move (the beam off)
// One shared definition, so the Nodes editor, serverXR and the room agree on it.
'use strict'

const FRAME_MAX_POINTS = 2000
const ALL_CUBES = 'all'

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : Number.NaN)

/**
 * A frame as the wire carries it, cleaned: at most FRAME_MAX_POINTS points, every number finite and
 * in range (a bad point is dropped, never guessed). Pure.
 * @returns {{ points: number[][], dropped: number }}
 */
const normaliseFramePoints = (points) => {
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

module.exports = { FRAME_MAX_POINTS, ALL_CUBES, normaliseFramePoints }
