// The geometry behind the Laser node, pure: a shape name and a few numbers in,
// a laser frame's points out. A point is [x, y, r, g, b] — x, y in -1..1 (the
// cube's view, y up), r, g, b in 0..1; (0, 0, 0) colour is a blank move, the
// beam travelling with the light off. The frame format lives in
// src/shared/laserFrame.js; this file only has to stay inside it.
import { FRAME_MAX_POINTS } from '../../../shared/laserFrame.js'

export const LASER_SHAPES = ['circle', 'line', 'square', 'triangle', 'star', 'wave', 'fan', 'spiral']
export const DEFAULT_LASER_COLOUR = '#00ff40'
export const MIN_POINTS = 8

const TAU = Math.PI * 2
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
const finite = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

/** '#rrggbb' or '#rgb' to [r, g, b] in 0..1; anything else reads as the default green. */
export const parseLaserColour = (value) => {
    const text = String(value ?? '').trim().replace(/^#/, '')
    const full = text.length === 3 ? text.split('').map((c) => c + c).join('') : text
    if (!/^[0-9a-f]{6}$/i.test(full)) return parseLaserColour(DEFAULT_LASER_COLOUR)
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
}

// Vertices -> n evenly spaced (by length) positions along the path.
const along = (vertices, n) => {
    const lengths = []
    let total = 0
    for (let i = 1; i < vertices.length; i += 1) {
        const l = Math.hypot(vertices[i][0] - vertices[i - 1][0], vertices[i][1] - vertices[i - 1][1])
        lengths.push(l)
        total += l
    }
    if (total === 0 || n <= 1) return [vertices[0]]
    const out = []
    let seg = 0
    let into = 0
    for (let k = 0; k < n; k += 1) {
        const want = (k / (n - 1)) * total
        while (seg < lengths.length - 1 && want > into + lengths[seg]) { into += lengths[seg]; seg += 1 }
        const t = lengths[seg] === 0 ? 0 : clamp((want - into) / lengths[seg], 0, 1)
        const a = vertices[seg]
        const b = vertices[seg + 1]
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
    return out
}

const polygon = (corners) => [...corners, corners[0]]
const corner = (i, sides, offset = Math.PI / 2) => {
    const a = offset + (i / sides) * TAU
    return [Math.cos(a), Math.sin(a)]
}

// Each builder returns strokes: arrays of [x, y] drawn lit, in a unit circle.
// A stroke after the first is reached by a blank move.
const STROKES = {
    circle: (n) => [Array.from({ length: n }, (_, i) => {
        const a = (i / (n - 1)) * TAU
        return [Math.cos(a), Math.sin(a)]
    })],
    line: (n) => [along([[-1, 0], [1, 0]], n)],
    square: (n) => [along(polygon([[-1, -1], [1, -1], [1, 1], [-1, 1]]), n)],
    triangle: (n) => [along(polygon([0, 1, 2].map((i) => corner(i, 3))), n)],
    // One continuous pentagram: every second corner, so no blank moves.
    star: (n) => [along(polygon([0, 2, 4, 1, 3].map((i) => corner(i, 5))), n)],
    wave: (n) => [Array.from({ length: n }, (_, i) => {
        const x = (i / (n - 1)) * 2 - 1
        return [x, Math.sin(x * TAU) * 0.5]
    })],
    // Five rays from the centre. Between rays the beam goes dark back to the
    // centre, which is why this one has blank moves.
    fan: (n) => {
        const rays = 5
        const each = Math.max(2, Math.floor(n / rays) - 1)
        return Array.from({ length: rays }, (_, r) => {
            const a = Math.PI * (0.1 + 0.8 * (r / (rays - 1)))
            return along([[0, 0], [Math.cos(a), Math.sin(a)]], each)
        })
    },
    spiral: (n) => [Array.from({ length: n }, (_, i) => {
        const t = i / (n - 1)
        const a = t * 3 * TAU
        return [Math.cos(a) * t, Math.sin(a) * t]
    })],
}

/**
 * One frame of a shape. `time` is seconds, and spin (turns per second) adds to
 * rotation (turns) as it passes. Colour is scaled by level; level 0 is a dark
 * frame the cubes still receive. Always inside -1..1 and FRAME_MAX_POINTS.
 */
export const generateShape = ({
    shape = 'circle',
    size = 0.5,
    height = 0,
    rotation = 0,
    spin = 0,
    time = 0,
    colour = DEFAULT_LASER_COLOUR,
    level = 1,
    points = 120,
} = {}) => {
    const build = STROKES[String(shape ?? '').trim().toLowerCase()] ?? STROKES.circle
    const n = Math.round(clamp(finite(points, 120), MIN_POINTS, FRAME_MAX_POINTS - 8))
    const scale = clamp(finite(size, 0.5), 0, 1)
    const turn = (finite(rotation, 0) + finite(spin, 0) * finite(time, 0)) * TAU
    const cos = Math.cos(turn)
    const sin = Math.sin(turn)
    const lit = parseLaserColour(colour).map((c) => c * clamp(finite(level, 1), 0, 1))
    // `height` lifts the shape up the field after it is turned and sized (the node's default is
    // 0.5: wholly above the cube's aim, where the server's keep-in zone lets it draw).
    const lift = clamp(finite(height, 0), -1, 1)
    const place = ([x, y]) => [
        clamp((x * cos - y * sin) * scale, -1, 1),
        clamp((x * sin + y * cos) * scale + lift, -1, 1),
    ]
    const out = []
    for (const stroke of build(n)) {
        const placed = stroke.map(place)
        // The blank move: arrive at the stroke's start with the light off.
        if (out.length) out.push([placed[0][0], placed[0][1], 0, 0, 0])
        for (const p of placed) out.push([p[0], p[1], lit[0], lit[1], lit[2]])
    }
    return out
}
