// The geometry behind the Laser node, pure: a shape name and a few numbers in,
// a laser frame's points out. A point is [x, y, r, g, b] — x, y in -1..1 (the
// cube's view, y up), r, g, b in 0..1; (0, 0, 0) colour is a blank move, the
// beam travelling with the light off. The frame format lives in
// shared/laserFrame.cjs; this file only has to stay inside it. One source for the Laser node (through its
// generated browser twin src/shared/laserShapes.js) and the laser desk on the server (serverXR/src/laser/laserDesk.js).
'use strict'

const { FRAME_MAX_POINTS } = require('./laserFrame.cjs')

// The last four are the owner's TouchDesigner laser scenes (NairoDorian TD_LASER_CUBE_WIFI_LAN_2022.toe, read
// 2026-10-17 with toeexpand): galaxy = Fibonacci_Spiral (golden spirals copied around the centre), sunflower =
// Phyllotaxis (seeds at the golden angle, drawn along their spiral arms), noisy = Noisy_Art (breathing rings bent by noise, four-fold), grid =
// Lines (the whole square with its cross and diagonals — the alignment picture). After them (2026-10-29, the owner:
// "more minimalistic shapes and sparkle shapes") six minimal figures, arc … chevron, and three sparkles: glint (one ✦),
// sparkle (✦ marks that jump on the half beat) and twinkle (✦ marks that stay put and switch on and off).
const LASER_SHAPES = [
    'circle', 'line', 'square', 'triangle', 'star', 'wave', 'fan', 'spiral', 'galaxy', 'sunflower', 'noisy', 'grid',
    'arc', 'cross', 'bars', 'rings', 'corners', 'chevron', 'glint', 'sparkle', 'twinkle',
    // Moving on their own, on the beat (the owner: "add animations of 5 vertcal lines, and to many spots, wobbling lines").
    'lines', 'spots', 'wobble',
    // Scenes of a few lines, circles and dots that move on the beat (2026-10-30, the owner: "more scenes like complex ones
    // but minimalistic lines circle dots").
    'planets', 'pendulum', 'bounce', 'radar', 'constellation', 'clock', 'horizon', 'morse',
]
// The shapes made of small marks. Below MARK_MIN_SIZE their smallest mark is inside the engine's still-beam window
// (0.6°, about 0.032 of the field: laserEngine.js), and when every lit mark is, the frame is dots only: the engine blanks
// the cube until the picture grows again (laser.test.js). Every other shape stays a stroke down to size 0.05.
const MARK_SHAPES = ['sparkle', 'twinkle', 'spots', 'morse']
const MARK_MIN_SIZE = 0.15
// A shape name may be a comma list ('galaxy,sunflower,noisy,grid'): with `cycle` seconds each shape plays in turn,
// the way TD's switch1 steps through its four scenes on a slow oscillator.
const shapeListOf = (shape) => String(shape ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
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
const DEFAULT_LASER_COLOUR = '#00ff40'
const MIN_POINTS = 8

const TAU = Math.PI * 2
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
const finite = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

/** '#rrggbb' or '#rgb' to [r, g, b] in 0..1; anything else reads as the default green. */
const parseLaserColour = (value) => {
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

// A number in 0..1 from a few integers, the same on every machine and every run. The sparkles' places come from it,
// never from Math.random, so the server, the browser twin and the desk's tiles draw the same frame.
const hash01 = (...ints) => {
    let h = 2166136261
    for (const v of ints) h = Math.imul(h ^ (v | 0), 16777619)
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// A four-point star ✦ centred on (x, y): an astroid, x = r·cos³t, y = r·sin³t, as one closed stroke of 4·q + 1 points,
// q evenly along each quarter so every tip is a point of its own. The galvo turns right round at a tip, so the guards
// hold the beam there a moment (laserGuards.js, corner hold): the tips are the brightest part, as a sparkle's are.
const QUARTER = Array.from({ length: 17 }, (_, i) => (i / 16) * (Math.PI / 2))
const sparkleMark = (x, y, r, q) => {
    const out = []
    for (let k = 0; k < 4; k += 1) {
        const arc = QUARTER.map((t) => [x + r * Math.cos(t + (k * Math.PI) / 2) ** 3, y + r * Math.sin(t + (k * Math.PI) / 2) ** 3])
        out.push(...along(arc, q + 1).slice(k ? 1 : 0))
    }
    return out
}
// Points for each quarter of a mark: a small mark needs few to read as a ✦, and more only cost the frame its speed.
const markQuarter = (n, marks) => clamp(Math.floor(n / (4 * marks)), 3, 12)
// A spot is a small ring, not a dot: a dot is a still beam (the engine's guard). 0.12 is the smallest that is still a
// stroke at MARK_MIN_SIZE (0.24 × 0.15 = 0.036 of the field, over the 0.032 window, at any turn).
const SPOT_R = 0.12
// Morse's dash: still a stroke at MARK_MIN_SIZE turned 45°, where its box is smallest (0.34 × 0.15 / √2 = 0.036 of the field).
const DASH = 0.34
// The places spots rest on: a honeycomb 0.36 apart inside the circle (19 places), so resting spots keep half a spot
// between them. At 0.3 apart they all but touched and the spots read as a clump.
const SPOT_PLACES = (() => {
    const out = []
    const rowGap = 0.36 * (Math.sqrt(3) / 2)
    for (let row = -4; row <= 4; row += 1) {
        for (let col = -4; col <= 4; col += 1) {
            const x = (col + (row % 2 ? 0.5 : 0)) * 0.36
            const y = row * rowGap
            if (Math.hypot(x, y) <= 1 - SPOT_R) out.push([x, y])
        }
    }
    return out
})()

// The scenes' parts. A path's length, and paths as strokes with the n points shared out by length, so every part is
// equally bright (each at least `least`, and never more than n in all once n covers that).
const lengthOf = (path) => path.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - path[i][0], p[1] - path[i][1]), 0)
const byLength = (paths, n, least = 8) => {
    const lengths = paths.map(lengthOf)
    const total = lengths.reduce((sum, l) => sum + l, 0) || 1
    const spare = Math.max(0, n - least * paths.length)
    return paths.map((p, i) => along(p, least + Math.floor((spare * lengths[i]) / total)))
}
// A circle round (x, y) of radius r from angle `from`, `turns` times round (negative: clockwise), as a path.
const arcPath = (x, y, r, from, turns = 1) => {
    const steps = Math.max(8, Math.ceil(48 * Math.abs(turns)))
    return Array.from({ length: steps + 1 }, (_, i) => {
        const a = from + (i / steps) * TAU * turns
        return [x + Math.cos(a) * r, y + Math.sin(a) * r]
    })
}
// A line from `from` that ends at the edge of the dot at `dot` and runs on once round it: a string and its dot in one stroke.
const toDot = (from, dot) => [from, ...arcPath(dot[0], dot[1], SPOT_R, Math.atan2(from[1] - dot[1], from[0] - dot[0]))]
// A dot as a stroke of its own, starting on the side that faces `from` (the end of the stroke before it).
const dotFrom = (dot, from) => arcPath(dot[0], dot[1], SPOT_R, Math.atan2(from[1] - dot[1], from[0] - dot[0]))
// The first half of each beat eased from 0 to 1, as the spots glide, then 1 while the beat rests.
const glideOf = (beat) => {
    const f = clamp((beat - Math.floor(beat)) * 2, 0, 1)
    return f * f * (3 - 2 * f)
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
    // The minimal figures: a few straight strokes or one arc each.
    // The top half of the circle, right over the top to left (rotation turns it to any side, spin sends it round).
    arc: (n) => [Array.from({ length: n }, (_, i) => {
        const a = (i / (n - 1)) * Math.PI
        return [Math.cos(a), Math.sin(a)]
    })],
    // A plus: the level stroke, then a blank move to the top of the upright one.
    cross: (n) => {
        const each = Math.max(2, Math.floor(n / 2))
        return [along([[-1, 0], [1, 0]], each), along([[0, 1], [0, -1]], each)]
    },
    // `copies` level lines (2: an equals sign), 0.4 apart, drawn back and forth so each blank move is a short hop.
    bars: (n, { copies = 0 } = {}) => {
        const count = Math.round(clamp(copies > 0 ? copies : 2, 1, 8))
        const gap = count > 1 ? Math.min(0.4, 1.6 / (count - 1)) : 0
        const each = Math.max(2, Math.floor(n / count))
        return Array.from({ length: count }, (_, i) => {
            const y = ((count - 1) / 2 - i) * gap
            return along(i % 2 === 0 ? [[-1, y], [1, y]] : [[1, y], [-1, y]], each)
        })
    },
    // `copies` circles inside each other (2), the radii evenly down from 1, each with points for its length so the
    // rings are equally bright. Each starts on its right, so the blank move to the next is a short step in.
    rings: (n, { copies = 0 } = {}) => {
        const count = Math.round(clamp(copies > 0 ? copies : 2, 1, 8))
        const radii = Array.from({ length: count }, (_, i) => (count - i) / count)
        const sum = radii.reduce((s, r) => s + r, 0)
        return radii.map((r) => {
            const each = Math.max(12, Math.floor((n * r) / sum))
            return Array.from({ length: each }, (_, i) => {
                const a = (i / (each - 1)) * TAU
                return [Math.cos(a) * r, Math.sin(a) * r]
            })
        })
    },
    // The square's four corners, each an L with arms 0.7 long (the side is 2), clockwise so every blank move runs along
    // a side. Arms of 0.6 would be dots below size 0.05 (the still-beam window); the corner is a point of its own.
    corners: (n) => {
        const a = 0.3
        const half = Math.max(2, Math.floor(n / 8))
        return [
            [[-1, a], [-1, 1], [-a, 1]],
            [[a, 1], [1, 1], [1, a]],
            [[1, -a], [1, -1], [a, -1]],
            [[-a, -1], [-1, -1], [-1, -a]],
        ].map(([p, c, q]) => [...along([p, c], half), ...along([c, q], half).slice(1)])
    },
    // A V, its point at the bottom, as one line.
    chevron: (n) => {
        const half = Math.max(2, Math.floor(n / 2))
        return [[...along([[-1, 0.5], [0, -0.5]], half), ...along([[0, -0.5], [1, 0.5]], half).slice(1)]]
    },
    // The sparkles. A mark appears whole and goes whole: no fade, no growing in.
    // One ✦ filling the picture, the sparkle as a figure of its own (on the desk: spin it, pulse it).
    glint: (n) => [sparkleMark(0, 0, 1, clamp(Math.floor(n / 4), 4, 60))],
    // `copies` ✦ marks (5) of different sizes, each in its own slice of the circle and wholly inside it, so no two ever
    // touch. On every half beat one of them, in turn, jumps to a new place in its slice: each lives copies/2 beats.
    sparkle: (n, { copies = 0, beat = 0 } = {}) => {
        const count = Math.round(clamp(copies > 0 ? copies : 5, 1, 12))
        const q = markQuarter(n, count)
        const now = Math.floor(beat * 2)
        // A mark of radius r at distance d from the centre, turned θ off its slice's middle, clears the slice's sides
        // when d·sin(half − |θ|) ≥ r and the rim when d + r ≤ 1. rMax leaves a mark room to move (12 marks: 0.185).
        const half = Math.PI / count
        const side = Math.sin(Math.min(half, Math.PI / 2))
        const rMax = Math.min(0.28, (0.9 * side) / (1 + side))
        return Array.from({ length: count }, (_, i) => {
            const born = now - ((((now - i) % count) + count) % count)
            const r = 0.16 + (rMax - 0.16) * hash01(i, born, 1)
            if (count === 1) {
                const a = TAU * hash01(i, born, 2)
                const d = (1 - r) * Math.sqrt(hash01(i, born, 3))
                return sparkleMark(Math.cos(a) * d, Math.sin(a) * d, r, q)
            }
            const theta = (2 * hash01(i, born, 2) - 1) * (half - Math.asin(r / (1 - r)))
            const near = r / Math.sin(half - Math.abs(theta))
            const d = near + (1 - r - near) * hash01(i, born, 3)
            const a = ((i + 0.5) / count) * TAU + theta
            return sparkleMark(Math.cos(a) * d, Math.sin(a) * d, r, q)
        })
    },
    // `copies` ✦ marks (9, at most 10: more would touch) that keep their places, spread as a sunflower's seeds so the
    // field stays even. On every half beat a new half of them is lit (at least two).
    twinkle: (n, { copies = 0, beat = 0 } = {}) => {
        const count = Math.round(clamp(copies > 0 ? copies : 9, 1, 10))
        const now = Math.floor(beat * 2)
        const stars = Array.from({ length: count }, (_, i) => {
            const r = 0.16 + 0.06 * hash01(i, 0, 1)
            const a = i * GOLDEN_ANGLE
            const d = count === 1 ? 0 : Math.sqrt((i + 0.5) / count) * (1 - r)
            return { x: Math.cos(a) * d, y: Math.sin(a) * d, r, draw: hash01(i, now, 3) }
        })
        const lit = [...stars].sort((s, t) => s.draw - t.draw).slice(0, Math.max(Math.min(2, count), Math.round(count / 2)))
        const q = markQuarter(n, lit.length)
        return stars.filter((s) => lit.includes(s)).map((s) => sparkleMark(s.x, s.y, s.r, q))
    },
    // The animations: each moves by itself on the beat; the desk's Spin, Pulse and Sweep still add to it.
    // `copies` upright lines (5), one in each lane across the picture. Each swings in its lane, a swing every two beats,
    // each a fifth of a swing behind the one before: a ripple that runs through the curtain. They never cross (a swing
    // is 0.45 of a lane each way). Drawn down and up in turn, so each blank move is a short hop.
    lines: (n, { copies = 0, beat = 0 } = {}) => {
        const count = Math.round(clamp(copies > 0 ? copies : 5, 1, 12))
        const lane = 2 / count
        const each = Math.max(2, Math.floor(n / count))
        return Array.from({ length: count }, (_, i) => {
            const x = -1 + lane * (i + 0.5) + 0.45 * lane * Math.sin(Math.PI * beat - (i * TAU) / count)
            return along(i % 2 === 0 ? [[x, 1], [x, -1]] : [[x, -1], [x, 1]], each)
        })
    },
    // `copies` spots (10, at most 16: each costs the cube a blank move) resting on SPOT_PLACES. On every beat they all
    // glide to new places, eased, in the first half of the beat, and rest in the second.
    spots: (n, { copies = 0, beat = 0 } = {}) => {
        const count = Math.round(clamp(copies > 0 ? copies : 10, 1, 16))
        const k = Math.floor(beat)
        const f = clamp((beat - k) * 2, 0, 1)
        const ease = f * f * (3 - 2 * f)
        const placesAt = (b) => SPOT_PLACES.map((p, s) => ({ p, draw: hash01(s, b, 7) })).sort((a, c) => a.draw - c.draw).map((o) => o.p)
        const from = placesAt(k)
        const to = placesAt(k + 1)
        const each = clamp(Math.floor(n / count), 8, 24)
        return Array.from({ length: count }, (_, i) => {
            const x = from[i][0] + (to[i][0] - from[i][0]) * ease
            const y = from[i][1] + (to[i][1] - from[i][1]) * ease
            return Array.from({ length: each }, (_, j) => {
                const a = (j / (each - 1)) * TAU
                return [x + Math.cos(a) * SPOT_R, y + Math.sin(a) * SPOT_R]
            })
        })
    },
    // `copies` level lines (3), each held at its ends like a string, a wave running along it half a wavelength a beat,
    // each line a little behind the one above. The wave never reaches the next line.
    wobble: (n, { copies = 0, beat = 0 } = {}) => {
        const count = Math.round(clamp(copies > 0 ? copies : 3, 1, 8))
        const gap = count > 1 ? Math.min(0.5, 1.4 / (count - 1)) : 0
        const amp = count > 1 ? Math.min(0.18, 0.45 * gap) : 0.18
        const each = Math.max(16, Math.floor(n / count))
        return Array.from({ length: count }, (_, i) => {
            const y0 = ((count - 1) / 2 - i) * gap
            const line = Array.from({ length: each }, (_, j) => {
                const s = j / (each - 1)
                const x = s * 2 - 1
                return [x, y0 + amp * Math.sin(Math.PI * s) * Math.sin(TAU * (0.75 * x - beat / 2) + i * 0.9)]
            })
            return i % 2 === 0 ? line : line.reverse()
        })
    },
    // The scenes: a few lines, circles and dots each, moving on the beat. A dot is a small ring (SPOT_R), as the spots are,
    // and it only moves: it never squashes, smears or fades.
    // `copies` circles inside each other (3), a dot riding each: the outer one round in 16 beats, each ring in twice as fast
    // and the other way. A ring stops at its dot's edge and runs on once round the dot: one stroke a ring. The rings are
    // 0.29 apart, so two dots (0.24 across) never touch.
    planets: (n, { copies = 0, beat = 0 } = {}) => {
        const count = Math.round(clamp(copies > 0 ? copies : 3, 1, 3))
        return byLength(Array.from({ length: count }, (_, i) => {
            const r = ((1 - SPOT_R) * (count - i)) / count
            const a = Math.PI / 2 + ((i % 2 ? -1 : 1) * TAU * beat * 2 ** i) / 16
            // The ring meets its dot 2·asin(ρ / 2r) either side of the dot's centre.
            const gap = 2 * Math.asin(SPOT_R / (2 * r))
            const ring = arcPath(0, 0, r, a + gap, 1 - (2 * gap) / TAU)
            return [...ring, ...dotFrom([Math.cos(a) * r, Math.sin(a) * r], ring[ring.length - 1]).slice(1)]
        }), n)
    },
    // `copies` pendulums (5) hung from one point under a short bar, each a line down to a dot. The longest is 1.75, each
    // next one shorter by 0.3 (0.26 at six), so two dots never touch. They swing 26° each way, the i-th 8 + i times in 16
    // beats: they set off as one line, fan out into waves and fall back into one line every 16 beats.
    pendulum: (n, { copies = 0, beat = 0 } = {}) => {
        const count = Math.round(clamp(copies > 0 ? copies : 5, 1, 6))
        const pivot = [0, 0.95]
        const step = count > 1 ? Math.min(0.3, 1.3 / (count - 1)) : 0
        const paths = [[[-0.3, pivot[1]], [0.3, pivot[1]]]]
        for (let i = 0; i < count; i += 1) {
            const length = 1.75 - i * step
            const swing = 0.45 * Math.cos((TAU * (8 + i) * beat) / 16)
            paths.push(toDot(pivot, [pivot[0] + Math.sin(swing) * length, pivot[1] - Math.cos(swing) * length]))
        }
        return byLength(paths, n)
    },
    // A floor and `copies` dots (3) bouncing on it, each in its own lane: one bounce a beat, up 1.5 and down again as a
    // thrown ball goes, each dot a share of a beat behind the one before.
    bounce: (n, { copies = 0, beat = 0 } = {}) => {
        const count = Math.round(clamp(copies > 0 ? copies : 3, 1, 6))
        const floor = -0.85
        const lane = 2 / count
        const paths = [[[-1, floor], [1, floor]]]
        for (let i = 0; i < count; i += 1) {
            const f = beat - i / count - Math.floor(beat - i / count)
            const last = paths[paths.length - 1]
            paths.push(dotFrom([-1 + lane * (i + 0.5), floor + SPOT_R + 6 * f * (1 - f)], last[last.length - 1]))
        }
        return byLength(paths, n)
    },
    // A circle and a hand that sweeps round it once a bar (4 beats), clockwise from the top, with `copies` dots (4, at
    // most 4), one in each slice of the sweep. A dot lights as the hand passes it and goes out half a turn later; on the
    // next turn it comes back somewhere new in its slice. Dots sit 0.45 or more from the centre and in the middle 60 % of
    // their slice, so two that are out together never touch. The hand and the circle are one stroke.
    radar: (n, { copies = 0, beat = 0 } = {}) => {
        const count = Math.round(clamp(copies > 0 ? copies : 4, 1, 4))
        const turns = beat / 4
        const hand = Math.PI / 2 - TAU * turns
        const paths = [[[0, 0], ...arcPath(0, 0, 1, hand, -1)]]
        for (const k of [Math.floor(turns) - 1, Math.floor(turns)]) {
            for (let i = 0; i < count; i += 1) {
                const at = k + (i + 0.2 + 0.6 * hash01(i, k, 11)) / count
                if (turns < at || turns >= at + 0.5) continue
                const a = Math.PI / 2 - TAU * at
                const d = 0.45 + 0.4 * hash01(i, k, 12)
                const last = paths[paths.length - 1]
                paths.push(dotFrom([Math.cos(a) * d, Math.sin(a) * d], last[last.length - 1]))
            }
        }
        return byLength(paths, n)
    },
    // `copies` dots (5, 3 to 6), one in each slice of the circle, joined into a ring of lines. On every beat one of them,
    // in turn, glides to a new place in its slice in the first half of the beat, and its lines go with it. Dots sit 0.5 or
    // more from the centre in the middle half of their slice, so two never touch. One stroke: each line runs into a dot's
    // edge, once round the dot and on round it (the short way) to where the next line leaves.
    constellation: (n, { copies = 0, beat = 0 } = {}) => {
        const count = Math.round(clamp(copies > 0 ? copies : 5, 3, 6))
        const k = Math.floor(beat)
        const ease = glideOf(beat)
        const place = (i, born) => {
            const a = Math.PI / 2 + (TAU * (i + 0.25 + 0.5 * hash01(i, born, 21))) / count
            const d = 0.5 + 0.35 * hash01(i, born, 22)
            return [Math.cos(a) * d, Math.sin(a) * d]
        }
        const dots = Array.from({ length: count }, (_, i) => {
            const born = k - ((((k - i) % count) + count) % count)
            const to = place(i, born)
            if (born !== k) return to
            const from = place(i, born - count)
            return [from[0] + (to[0] - from[0]) * ease, from[1] + (to[1] - from[1]) * ease]
        })
        const towards = (i, j) => Math.atan2(dots[j][1] - dots[i][1], dots[j][0] - dots[i][0])
        const path = []
        for (let i = 0; i < count; i += 1) {
            const enter = towards(i, (i + count - 1) % count)
            const on = (((towards(i, (i + 1) % count) - enter) % TAU) + TAU) % TAU
            path.push(...arcPath(dots[i][0], dots[i][1], SPOT_R, enter, on <= Math.PI ? 1 + on / TAU : -(2 - on / TAU)))
        }
        path.push(path[0])
        return [along(path, n)]
    },
    // A clock face: a circle, a long hand with a dot at its end that ticks a twelfth of a turn on every beat, and a short
    // hand that ticks a twelfth on every bar (4 beats). The hands jump on the beat; they never sweep.
    clock: (n, { beat = 0 } = {}) => {
        const long = Math.PI / 2 - (TAU * Math.floor(beat)) / 12
        const short = Math.PI / 2 - (TAU * Math.floor(beat / 4)) / 12
        const hands = [[Math.cos(short) * 0.45, Math.sin(short) * 0.45], ...toDot([0, 0], [Math.cos(long) * 0.72, Math.sin(long) * 0.72])]
        return byLength([hands, arcPath(0, 0, 1, long)], n)
    },
    // A horizon and a sun (a circle, 0.4) that rises over it and sets again every 16 beats, starting down; what is under
    // the line is not drawn. While the sun is more than half down, `copies` stars (3, at most 4) are out: dots in their own
    // lanes of the sky, each night somewhere new.
    horizon: (n, { copies = 0, beat = 0 } = {}) => {
        const count = Math.round(clamp(copies > 0 ? copies : 3, 1, 4))
        const line = -0.3
        const r = 0.4
        const y = -0.15 - 0.65 * Math.cos((TAU * beat) / 16)
        const paths = [[[-1, line], [1, line]]]
        // The sun from where it meets the line on the right, over the top, to where it meets it on the left.
        const s = (line - y) / r
        if (s <= -1) paths.push(arcPath(0, y, r, -Math.PI / 2))
        else if (s < 1) paths.push(arcPath(0, y, r, Math.asin(s), (Math.PI - 2 * Math.asin(s)) / TAU))
        if (y < line) {
            const night = Math.round(beat / 16)
            const lane = 1.6 / count
            for (let i = 0; i < count; i += 1) {
                const last = paths[paths.length - 1]
                const star = [-0.8 + lane * (i + 0.35 + 0.3 * hash01(i, night, 31)), 0.3 + 0.55 * hash01(i, night, 32)]
                paths.push(dotFrom(star, last[last.length - 1]))
            }
        }
        return byLength(paths, n)
    },
    // A row of `copies` places (4, 2 to 5) holding dots and dashes, read like Morse. On every beat the row glides one place
    // to the left in the first half of the beat: the first mark goes as the glide starts, and a new one comes in at the
    // end when the next beat starts. Which marks are dashes comes from the hash, the same on every machine.
    morse: (n, { copies = 0, beat = 0 } = {}) => {
        const count = Math.round(clamp(copies > 0 ? copies : 4, 2, 5))
        const gap = 2 / count
        const k = Math.floor(beat)
        const ease = glideOf(beat)
        const paths = []
        for (let j = ease > 0 ? 1 : 0; j < count; j += 1) {
            const x = -1 + gap * (j + 0.5 - ease)
            paths.push(hash01(k + j, 0, 41) < 0.5 ? arcPath(x, 0, SPOT_R, Math.PI) : [[x - DASH / 2, 0], [x + DASH / 2, 0]])
        }
        return byLength(paths, n)
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
const generateShape = ({
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
    // Beats since the clock's zero: sparkle and twinkle change on its half beats. The laser desk passes its own clock;
    // left out, it is `time` at 120 BPM.
    beat,
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
    const strokes = build(n, { copies: finite(copies, 0), time: t, beat: finite(beat, t * 2) })
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

module.exports = {
    LASER_SHAPES, MARK_SHAPES, MARK_MIN_SIZE, shapeListOf, DEFAULT_LASER_COLOUR, MIN_POINTS, parseLaserColour, generateShape,
}
