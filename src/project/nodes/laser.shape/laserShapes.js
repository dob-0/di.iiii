// The geometry behind the Laser node, pure: a shape name and a few numbers in,
// a laser frame's points out. A point is [x, y, r, g, b] — x, y in -1..1 (the
// cube's view, y up), r, g, b in 0..1; (0, 0, 0) colour is a blank move, the
// beam travelling with the light off. The frame format lives in
// src/shared/laserFrame.js; this file only has to stay inside it.
import { FRAME_MAX_POINTS } from '../../../shared/laserFrame.js'

// The last four are the owner's TouchDesigner laser scenes (NairoDorian TD_LASER_CUBE_WIFI_LAN_2022.toe, read
// 2026-10-17 with toeexpand): galaxy = Fibonacci_Spiral (golden spirals copied around the centre), sunflower =
// Phyllotaxis (seeds at the golden angle, drawn along their spiral arms), noisy = Noisy_Art (breathing rings bent by noise, four-fold), grid =
// Lines (the whole square with its cross and diagonals — the alignment picture).
export const LASER_SHAPES = ['circle', 'line', 'square', 'triangle', 'star', 'wave', 'fan', 'spiral', 'galaxy', 'sunflower', 'noisy', 'grid']
// A shape name may be a comma list ('galaxy,sunflower,noisy,grid'): with `cycle` seconds each shape plays in turn,
// the way TD's switch1 steps through its four scenes on a slow oscillator.
export const shapeListOf = (shape) => String(shape ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
// The golden angle (phyllotaxis) and the golden spiral's growth (TD: math.log((sqrt(5)+1)/2)*2/pi).
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
const GOLDEN_GROWTH = (Math.log((Math.sqrt(5) + 1) / 2) * 2) / Math.PI
// The arm counts a sunflower may have — consecutive Fibonacci numbers. F arms turn δ = F·137.5° (mod 360) a seed
// (3: 52°, 5: −33°, 8: 20°, 13: −12°, 21: 8°, 34: −5°, 55: 3°, 89: −2°, 144: 1°), and the number before F is
// the step from one arm to its neighbour on the rim.
const FIBONACCI = [2, 3, 5, 8, 13, 21, 34, 55, 89, 144]
const THIRD_TURN = (Math.PI * 2) / 3
const MAX_SEEDS = 300
// A rounded turn-around from the end of one stroke (…, a, p) into the start of the next (q, b, …): a cubic Bézier
// that leaves p along its stroke and enters q along the next, as `count` points between them. It reaches out by
// 0.6 of the gap it bridges (never under 0.04 nor over 0.25 of the radius), so the loop stays round, not a hairpin.
const petalBetween = (a, p, q, b, count) => {
    const dir = (from, to) => {
        const d = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1
        return [(to[0] - from[0]) / d, (to[1] - from[1]) / d]
    }
    const u = dir(a, p)
    const v = dir(q, b)
    const size = clamp(0.6 * Math.hypot(q[0] - p[0], q[1] - p[1]), 0.04, 0.25)
    const c1 = [p[0] + u[0] * size, p[1] + u[1] * size]
    const c2 = [q[0] - v[0] * size, q[1] - v[1] * size]
    return Array.from({ length: count }, (_, i) => {
        const t = (i + 1) / (count + 1)
        const s = 1 - t
        const w = [s * s * s, 3 * s * s * t, 3 * s * t * t, t * t * t]
        return [w[0] * p[0] + w[1] * c1[0] + w[2] * c2[0] + w[3] * q[0], w[0] * p[1] + w[1] * c1[1] + w[2] * c2[1] + w[3] * q[1]]
    })
}
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
    // TD Fibonacci_Spiral: r = e^(k·θ) over two turns, the biggest radius 1, `copies` of it turned evenly
    // around the centre (TD's copy1: 360/n). Each copy is its own stroke, reached by a blank move. The points
    // sit at equal distances ALONG the curve — a log spiral's arc length grows with its radius, so r is spaced
    // evenly; equal angle steps would heap half the points at the centre, a still beam (laser.test.js).
    galaxy: (n, { copies = 0 } = {}) => {
        const count = Math.round(clamp(copies > 0 ? copies : 6, 1, 24))
        const each = Math.max(8, Math.floor(n / count))
        const rMin = Math.exp(-GOLDEN_GROWTH * 2 * TAU)
        return Array.from({ length: count }, (_, c) => {
            const turn = (c / count) * TAU
            return Array.from({ length: each }, (_, i) => {
                const r = rMin + (1 - rMin) * (i / (each - 1))
                const a = Math.log(r / rMin) / GOLDEN_GROWTH
                return [Math.cos(a + turn) * r, Math.sin(a + turn) * r]
            })
        })
    },
    // TD Phyllotaxis: seed k at angle k·137.5° and radius √(k/N) — a sunflower. TD lights each seed as a dot; a
    // dot is a still beam (the engine's guard, laser.test.js), and a lifted pen costs ~45 blanking points a stroke,
    // so the seeds are drawn as ONE line along their parastichies — the spiral arms the eye picks out of a head:
    // arm j holds seeds j, j+F, j+2F, … (F a Fibonacci number: as many arms as make an arm turn about a third of a
    // circle from centre to rim — 13 at 120 points, 55 at 2000; `copies` picks the nearest Fibonacci number
    // instead). The line runs out along one arm, steps to the neighbouring arm on the rim (the Fibonacci number
    // before F), back in along it, turns at the centre, out again — never lifted, never parked. Each turn-around is
    // a small petal drawn with its own few points (a sharp reversal costs the galvo ~20 hold points at 35 kpps,
    // measured; a curve of ≤ 30° steps costs none); the rest of the n points sit evenly along the arms, so at 1992
    // points the frame stays inside the cube's budget (laserGuards.test.js, the real-cube fixture).
    sunflower: (n, { copies = 0 } = {}) => {
        // A line through N seeds is about 2·√N radii long (the seeds sit √(π/N) apart); a cube draws ~50 field
        // widths a frame at 35 kpps (laserGuards.js: budget × litStep), so the head keeps at most MAX_SEEDS seeds —
        // at the full size 1 that is ~35 widths plus the petals — and more points only draw the same line more smoothly.
        const budget = Math.min(n, MAX_SEEDS)
        const turn = (f) => Math.abs(((((f * GOLDEN_ANGLE) % TAU) + TAU + Math.PI) % TAU) - Math.PI)
        const cost = copies > 0 ? (f) => Math.abs(f - copies) : (f) => Math.abs(Math.floor(budget / f) * turn(f) - THIRD_TURN)
        const arms = FIBONACCI.slice(1).reduce((best, f) => (cost(f) < cost(best) ? f : best))
        const step = FIBONACCI[FIBONACCI.indexOf(arms) - 1]
        const each = Math.max(4, Math.floor(budget / arms))
        const seeds = arms * each
        const seed = (k) => {
            const a = k * GOLDEN_ANGLE
            const r = Math.sqrt((k + 0.5) / seeds)
            return [Math.cos(a) * r, Math.sin(a) * r]
        }
        const perPetal = clamp(Math.floor(n / (3 * arms)), 2, 10)
        const onArms = Math.max(3 * arms, n - perPetal * (arms - 1))
        const line = []
        for (let i = 0; i < arms; i += 1) {
            const j = (i * step) % arms
            const vertices = Array.from({ length: each }, (_, m) => seed(j + (i % 2 === 0 ? m : each - 1 - m) * arms))
            const arm = along(vertices, Math.floor(onArms / arms) + (i < onArms % arms ? 1 : 0))
            if (line.length) line.push(...petalBetween(line[line.length - 2], line[line.length - 1], arm[0], arm[1], perPetal))
            line.push(...arm)
        }
        const reach = Math.max(...line.map((p) => Math.hypot(p[0], p[1])))
        return [line.map((p) => [p[0] / reach, p[1] / reach])]
    },
    // TD Noisy_Art: a circle bent by noise that repeats four times around (TD copies a quarter 4×), `copies`
    // rings nested inside each other (TD's copy2: 3), the whole breathing on a 0.1 Hz swell. The noise drifts
    // with time (TD's noise1 tz = absTime.frame/10); three harmonics stand in for its value noise.
    noisy: (n, { copies = 0, time = 0 } = {}) => {
        const rings = Math.round(clamp(copies > 0 ? copies : 3, 1, 8))
        const each = Math.max(12, Math.floor(n / rings))
        const t = finite(time, 0)
        const bend = (a) => (Math.sin(4 * a + t * 0.7) + 0.6 * Math.sin(8 * a - t * 1.3) + 0.35 * Math.sin(12 * a + t * 2.1)) / 1.95
        const swell = 0.85 + 0.15 * Math.sin(TAU * 0.1 * t)
        return Array.from({ length: rings }, (_, k) => {
            const scale = swell * (1 - (0.6 * k) / rings)
            return Array.from({ length: each }, (_, i) => {
                const a = (i / (each - 1)) * TAU
                const r = clamp((1 + 0.12 * bend(a)) * scale / 1.12, 0, 1)
                return [Math.cos(a) * r, Math.sin(a) * r]
            })
        })
    },
    // TD Lines: the whole square, its horizontal and vertical, and both diagonals — the alignment picture the
    // owner judged "full" in TD. Five strokes: the square takes 40 % of the points, each line 15 %.
    grid: (n) => {
        const line = Math.max(4, Math.floor(n * 0.15))
        return [
            along(polygon([[-1, -1], [1, -1], [1, 1], [-1, 1]]), Math.max(8, n - 4 * line)),
            along([[-1, 0], [1, 0]], line),
            along([[0, 1], [0, -1]], line),
            along([[-1, -1], [1, 1]], line),
            along([[1, -1], [-1, 1]], line),
        ]
    },
}

/** Hue 0..1 (saturated, full value) to [r, g, b] in 0..1. */
const hueToRgb = (h) => {
    const k = (n) => (n + h * 6) % 6
    const f = (n) => 1 - Math.max(0, Math.min(k(n), 4 - k(n), 1))
    return [f(5), f(3), f(1)]
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
    // The TD scenes' knobs: copies (galaxy's spirals, noisy's rings; 0 = the shape's own number), rainbow
    // (TD's COLORS: the hue runs along the path and drifts a turn every 16 s), cycle (seconds each shape of a
    // comma list plays; 0 = the first shape only).
    copies = 0,
    rainbow = false,
    cycle = 0,
} = {}) => {
    const names = shapeListOf(shape)
    const t = finite(time, 0)
    const every = finite(cycle, 0)
    const pick = names.length > 1 && every > 0 ? names[Math.floor(Math.max(0, t) / every) % names.length] : names[0]
    const build = STROKES[pick] ?? STROKES.circle
    const n = Math.round(clamp(finite(points, 120), MIN_POINTS, FRAME_MAX_POINTS - 8))
    const scale = clamp(finite(size, 0.5), 0, 1)
    const turn = (finite(rotation, 0) + finite(spin, 0) * t) * TAU
    const cos = Math.cos(turn)
    const sin = Math.sin(turn)
    const gain = clamp(finite(level, 1), 0, 1)
    const lit = parseLaserColour(colour).map((c) => c * gain)
    // `height` lifts the shape up the field after it is turned and sized (the node's default is
    // 0.5: wholly above the cube's aim, where the server's keep-in zone lets it draw).
    const lift = clamp(finite(height, 0), -1, 1)
    const place = ([x, y]) => [
        clamp((x * cos - y * sin) * scale, -1, 1),
        clamp((x * sin + y * cos) * scale + lift, -1, 1),
    ]
    const strokes = build(n, { copies: finite(copies, 0), time: t })
    const total = strokes.reduce((sum, s) => sum + s.length, 0)
    const out = []
    let k = 0
    for (const stroke of strokes) {
        const placed = stroke.map(place)
        // The blank move: arrive at the stroke's start with the light off.
        if (out.length) out.push([placed[0][0], placed[0][1], 0, 0, 0])
        for (const p of placed) {
            const rgb = rainbow === true ? hueToRgb(((k / Math.max(1, total)) + t / 16) % 1).map((c) => c * gain) : lit
            out.push([p[0], p[1], rgb[0], rgb[1], rgb[2]])
            k += 1
        }
    }
    return out
}
