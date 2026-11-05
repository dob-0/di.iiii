// GENERATED from shared/laserShapes.cjs by scripts/laser/laser-frame-twin.mjs — edit the .cjs, then run it.
// The geometry behind the Laser node, pure: a shape name and a few numbers in,
// a laser frame's points out. A point is [x, y, r, g, b] — x, y in -1..1 (the
// cube's view, y up), r, g, b in 0..1; (0, 0, 0) colour is a blank move, the
// beam travelling with the light off. The frame format lives in
// shared/laserFrame.cjs; this file only has to stay inside it. One source for the Laser node (through its
// generated browser twin src/shared/laserShapes.js) and the laser desk on the server (serverXR/src/laser/laserDesk.js).

import { FRAME_MAX_POINTS } from './laserFrame.js'

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
    // One line that changes what it is on the beat (2026-10-31, the owner: "circle is pulsing and then becoming spiral and
    // then the spiral is going out of it and becomg line around all sqaure").
    'unfold',
    // Patterns of lines and circles that move on the beat (2026-10-31, the owner: "more patterns for laser"): two one-line
    // figures, two that go out from the centre, two that count the beats, falling dashes and a turning cube.
    'lissajous', 'helix', 'tunnel', 'echo', 'sides', 'count', 'rain', 'cube',
    // The same night: "how laser dot can be small that much, too many dots" — many dots, as small as the laser may draw one.
    'dust',
    // 2026-11-01: "pattern like heart cardiograma lines" — a heart monitor's trace, its spike written on the beat.
    'heartbeat',
    // "one pattern smallest one point in middle": one dot alone, as small as the engine lets a lone dot stay lit.
    'point',
    // "more lasers animation patterns like line line and grid becoming, also circle one then two three and mixing":
    // one line that splits into a grid and folds back, one circle that splits into three that mix and merge again.
    'weave', 'venn',
]
// The shapes made of small marks. Below MARK_MIN_SIZE their smallest mark is inside the engine's still-beam window
// (0.6°, about 0.032 of the field: laserEngine.js), and when every lit mark is, the frame is dots only: the engine blanks
// the cube until the picture grows again (laser.test.js). Every other shape stays a stroke down to size 0.05.
const MARK_SHAPES = ['sparkle', 'twinkle', 'spots', 'morse', 'rain', 'dust']
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
// The beats so far with the glide: a pattern that moves by a step on every beat moves it in the first half and holds.
const stepOf = (beat) => Math.floor(beat) + glideOf(beat)
// A count of things from `copies`: its own number when copies is 0, else copies held between lo and hi.
const countOf = (copies, own, lo, hi) => Math.round(clamp(copies > 0 ? copies : own, lo, hi))
// The patterns' parts. The tunnel's smallest square: 0.15 of the picture, so at size 0.05 it is still a stroke's
// worth of the frame and never a dot on its own (the rest of the tunnel is around it).
const TUNNEL_MIN = 0.15
// A falling dash of rain, and the least of one that is drawn as it comes in at the top or goes out at the bottom: at
// MARK_MIN_SIZE the piece is 0.25 × 0.15 = 0.0375 of the field, over the still-beam window.
const RAIN_DASH = 0.5
const RAIN_LEAST = 0.25
// The cube: its corners, and its twelve edges as four strokes with three short blank moves between them (a cube's
// eight corners each have three edges, so no fewer than four strokes draw it without lighting an edge twice): the bottom
// square, up one corner and round the top, then the other three uprights, each hop one edge long.
const CUBE_CORNERS = [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1], [-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]]
const CUBE_STROKES = [[0, 1, 2, 3, 0, 4, 5, 6, 7, 4], [5, 1], [2, 6], [7, 3]]
// It leans 0.42 rad (24°) towards you so its top shows, seen from 5 half-edges away (a little perspective).
const CUBE_TILT = 0.42
const CUBE_EYE = 5
const cubeView = (turn) => {
    const c = Math.cos(turn)
    const s = Math.sin(turn)
    return CUBE_CORNERS.map(([x0, y0, z0]) => {
        const x = x0 * c + z0 * s
        const z1 = z0 * c - x0 * s
        const y = y0 * Math.cos(CUBE_TILT) - z1 * Math.sin(CUBE_TILT)
        const z = y0 * Math.sin(CUBE_TILT) + z1 * Math.cos(CUBE_TILT)
        const k = CUBE_EYE / (CUBE_EYE - z)
        return [x * k, y * k]
    })
}
// Dust's dot: a ring 0.046 of the field across once the look is sized (its radius in the shape is DUST_R / size, up to
// SPOT_R), whatever the size. The still-beam window is 0.032 (0.6°): a frame of dots that small only is a still beam and
// the engine blanks the cube, so this is as small as a dot may be, with room for a corner pin that keeps a side at 75 % or
// more (the owner's mapping, 79 % wide, draws it 0.65° across: 2026-11-01, "must be point the smallest point laser can show").
const DUST_R = 0.023
// The places dust rests on: a 9 × 9 grid 0.22 apart over the whole picture, split as a checkerboard's two colours, one
// for each half of the dots, so a dot that jumps never lands on one that stays.
const DUST_PLACES = [0, 1].map((colour) => {
    const out = []
    for (let row = -4; row <= 4; row += 1) for (let col = -4; col <= 4; col += 1) if (((row + col) & 1) === colour) out.push([col * 0.22, row * 0.22])
    return out
})
// One heartbeat of a cardiogram, u beats from its R spike (−0.5…0.5): the P wave, the Q dip, the R spike, the S dip and
// the T wave, each a bump [where, how wide, how high]. The spike is 1; the trace sits on 0 between beats.
const ECG_WAVES = [[-0.2, 0.035, 0.12], [-0.025, 0.008, -0.12], [0, 0.01, 1], [0.025, 0.01, -0.3], [0.25, 0.05, 0.25]]
const ecgAt = (u) => ECG_WAVES.reduce((sum, [at, w, a]) => sum + a * Math.exp(-(((u - at) / w) ** 2) / 2), 0)
// The heartbeat trace in the picture: the spike 1.2 tall, the whole trace centred top to bottom (it spans −0.78…0.78),
// and the gap a monitor wipes ahead of what it writes.
const ECG_HEIGHT = 1.2
const ECG_BASE = -0.42
const ECG_GAP = 0.25
// Point's dot: a ring 0.1 of the field across at any size from 0.05 up. Alone, all the beam's time is in it, so it must
// be wider than a dust dot (0.046): through a corner pin like the owner's (79 % wide, 33 % tall) a ring 0.06 across puts
// 44 % of the frame in one 0.6° window, near the engine's 50 % stop; 0.046 is stopped; 0.1 puts 34 % (1.5° × 0.6° on her wall).
const POINT_R = 0.05
// Weave's 16 beats, [lines before, lines after] on each beat, for the level lines and the upright ones. A count that
// doubles splits each line in two, gliding apart in the first half of the beat; one that halves glides pairs together.
// The first upright line appears whole on beat 3 and the last goes on beat 11 (0 → 1, 1 → 0 are on the beat).
const WEAVE_LEVEL = [[1, 1], [1, 2], [2, 4], [4, 4], [4, 4], [4, 4], [4, 4], [4, 4], [4, 4], [4, 4], [4, 4], [4, 4], [4, 2], [2, 1], [1, 1], [1, 1]]
const WEAVE_UPRIGHT = [[0, 0], [0, 0], [0, 0], [1, 1], [1, 2], [2, 4], [4, 4], [4, 4], [4, 4], [4, 2], [2, 1], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]]
// Where line i of c sits across the picture: the middles of c equal bands, so a line splits into the two of its band.
const bandOf = (i, c) => -1 + (2 * (i + 0.5)) / c
const weaveLines = ([from, to], f) => {
    if (to === from || from === 0 || to === 0) return Array.from({ length: to }, (_, i) => bandOf(i, to))
    if (to > from) return Array.from({ length: to }, (_, j) => bandOf(Math.floor(j / 2), from) + (bandOf(j, to) - bandOf(Math.floor(j / 2), from)) * f)
    if (f >= 1) return Array.from({ length: to }, (_, i) => bandOf(i, to))
    return Array.from({ length: from }, (_, j) => bandOf(j, from) + (bandOf(Math.floor(j / 2), to) - bandOf(j, from)) * f)
}
// Venn's circles: all the same size (0.5), two 0.8 apart, three on a ring of 0.45 (each overlaps the others), and while
// they mix the ring closes to 0.12 on every other beat. Places on the three-ring, from the top, a third of a turn apart.
const VENN_R = 0.5
const VENN_TWO = 0.4
const VENN_THREE = 0.45
const VENN_TIGHT = 0.12
const vennRing = (d, turn) => [0, 1, 2].map((i) => [Math.cos(Math.PI / 2 + turn + (i * TAU) / 3) * d, Math.sin(Math.PI / 2 + turn + (i * TAU) / 3) * d])
// The scale that keeps the cube inside the picture at every turn (it looks the same each quarter turn).
const CUBE_FIT = 1 / Math.max(...Array.from({ length: 91 }, (_, i) => Math.max(...cubeView((i / 90) * (Math.PI / 2)).flat().map(Math.abs))))

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
    // One line on a 16-beat loop: a circle (0.5) that swells on every beat (beats 0–4), winds into a spiral of three turns
    // (4–8), runs out from its eye as it unwinds into the line round the whole square (8–11), holds the square (11–14) and
    // draws back into the circle (14–16). Each moment is the same line with its points evenly along it, so it is equally
    // bright everywhere and the spiral's eye (0.12 across) never heaps them; the spiral turns a quarter a beat as it goes.
    unfold: (n, { beat = 0 } = {}) => {
        const b = ((beat % 16) + 16) % 16
        const ease = (f) => { const c = clamp(f, 0, 1); return c * c * (3 - 2 * c) }
        const f = b - Math.floor(b)
        // The swell: up in the first eighth of the beat, back down over the rest.
        const kick = f < 0.125 ? f / 0.125 : (1 - (f - 0.125) / 0.875) ** 2
        const r0 = b < 4 ? 0.5 * (1 + 0.14 * kick) : 0.5
        const wind = b < 4 ? 0 : b < 8 ? ease((b - 4) / 3) : b < 14 ? 1 : 0
        const open = b < 8 ? 0 : b < 11 ? ease((b - 8) / 3) : b < 14 ? 1 : 1 - ease((b - 14) / 2)
        const phase = Math.PI / 2 - (TAU * clamp(b - 4, 0, 7)) / 4
        if (open >= 1) {
            // The square itself, from the corner the line's start has come round to.
            const k = Math.round(((((phase - Math.PI / 4) % TAU) + TAU) % TAU) / (Math.PI / 2))
            const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]]
            return [along(polygon(Array.from({ length: 4 }, (_, i) => corners[(k + i) % 4])), n)]
        }
        const turns = 1 + 2 * wind * (1 - open)
        const steps = Math.ceil(240 * turns)
        const path = Array.from({ length: steps + 1 }, (_, i) => {
            const t = i / steps
            const a = phase + TAU * turns * t
            const spiral = 0.06 + 0.56 * t
            const r = (r0 + (spiral - r0) * wind) * (1 - open) + open
            const c = Math.cos(a)
            const s = Math.sin(a)
            const square = 1 + (1 / Math.max(Math.abs(c), Math.abs(s)) - 1) * open
            return [c * r * square, s * r * square]
        })
        return [along(path, n)]
    },
    // The patterns (2026-10-31). Each moves by itself on the beat; the desk's Spin, Pulse and Sweep still add to it.
    // One line, the Lissajous figure x = sin(a·t + φ), y = sin(b·t), a = `copies` (3, 2 to 6) and b = a − 1, its phase φ
    // stepping a sixteenth of a turn on every beat (eased in the first half): the figure turns like a ribbon in space.
    lissajous: (n, { copies = 0, beat = 0 } = {}) => {
        const a = countOf(copies, 3, 2, 6)
        const phase = Math.PI / 4 + (TAU * stepOf(beat)) / 16
        const steps = 120 * a
        return [along(Array.from({ length: steps + 1 }, (_, i) => {
            const t = (i / steps) * TAU
            return [Math.sin(a * t + phase), Math.sin((a - 1) * t)]
        }), n)]
    },
    // Two strands held together at both ends, crossing between them (`copies` half waves, 3, 1 to 8), the crossings
    // running on half a wave every beat: a rope twisting. One closed line, out along one strand and back along the other.
    helix: (n, { copies = 0, beat = 0 } = {}) => {
        const halves = countOf(copies, 3, 1, 8)
        const steps = 80 * halves
        const strand = (sign) => Array.from({ length: steps + 1 }, (_, i) => {
            const s = i / steps
            return [s * 2 - 1, sign * 0.6 * Math.sqrt(Math.sin(Math.PI * s)) * Math.sin(Math.PI * (halves * s - beat))]
        })
        return [along([...strand(1), ...strand(-1).reverse().slice(1)], n)]
    },
    // `copies` squares (4, 2 to 8) one inside another, each the next one's size × the same step, so they read as depth.
    // On every beat they all move out one place, eased in the first half: as the beat starts the outermost goes from the
    // edge and a new one is there at the centre. Every square is as bright as its length.
    tunnel: (n, { copies = 0, beat = 0 } = {}) => {
        const count = countOf(copies, 4, 2, 8)
        const f = glideOf(beat)
        return byLength(Array.from({ length: count }, (_, i) => {
            const s = TUNNEL_MIN ** (1 - (count - i - 1 + f) / count)
            return polygon([[-s, s], [s, s], [s, -s], [-s, -s]])
        }), n)
    },
    // `copies` circles (4, 2 to 8) sent out from the centre, one on every beat, at an even pace: each grows from 0.15 to
    // the edge in `copies` beats and is gone as it gets there. They stay 0.85 / copies apart, so they never touch.
    echo: (n, { copies = 0, beat = 0 } = {}) => {
        const count = countOf(copies, 4, 2, 8)
        const f = beat - Math.floor(beat)
        return byLength(Array.from({ length: count }, (_, i) => arcPath(0, 0, 0.15 + (0.85 * (count - i - 1 + f)) / count, Math.PI / 2)), n)
    },
    // One figure that gains a side on every beat: a triangle on the first beat, then a square, a pentagon, a hexagon, and
    // a triangle again (`copies` is the most sides, 6, 4 to 12). It jumps from one to the next; it never morphs. Each sits
    // on a flat side and is centred top to bottom.
    sides: (n, { copies = 0, beat = 0 } = {}) => {
        const most = countOf(copies, 6, 4, 12)
        const loop = most - 2
        const sides = 3 + (((Math.floor(beat) % loop) + loop) % loop)
        const corners = Array.from({ length: sides }, (_, i) => corner(i, sides, Math.PI / sides - Math.PI / 2))
        const ys = corners.map((p) => p[1])
        const mid = (Math.max(...ys) + Math.min(...ys)) / 2
        return [along(polygon(corners.map(([x, y]) => [x, y - mid])), n)]
    },
    // `copies` upright bars (4, 2 to 8) that count the bar: one on the first beat, two on the second, all of them on the
    // last, then one again. Each lights whole in its own lane; drawn down and up in turn, so each hop is short.
    count: (n, { copies = 0, beat = 0 } = {}) => {
        const most = countOf(copies, 4, 2, 8)
        const lit = 1 + (((Math.floor(beat) % most) + most) % most)
        const lane = 2 / most
        const each = Math.max(2, Math.floor(n / lit))
        return Array.from({ length: lit }, (_, i) => {
            const x = -1 + lane * (i + 0.5)
            return along(i % 2 === 0 ? [[x, 0.9], [x, -0.9]] : [[x, -0.9], [x, 0.9]], each)
        })
    },
    // `copies` dashes of rain (6, 2 to 10), one in each lane, each falling from above the picture to below it in two beats,
    // the lanes a golden share of a fall apart, so they never fall in a row and the picture is never empty. Each time a dash comes
    // round again it falls somewhere new in the middle of its lane. Cut at the picture's edge; a piece under RAIN_LEAST is not drawn.
    rain: (n, { copies = 0, beat = 0 } = {}) => {
        const count = countOf(copies, 6, 2, 10)
        const lane = 2 / count
        const paths = []
        for (let i = 0; i < count; i += 1) {
            const fall = beat / 2 + ((i * (Math.sqrt(5) - 1)) / 2) % 1
            const k = Math.floor(fall)
            const top = 1 + RAIN_DASH - (2 + RAIN_DASH) * (fall - k)
            const hi = Math.min(1, top)
            const lo = Math.max(-1, top - RAIN_DASH)
            if (hi - lo < RAIN_LEAST) continue
            const x = -1 + lane * (i + 0.2 + 0.6 * hash01(i, k, 51))
            // Drawn from whichever end is nearer the last dash's end, so the hop between them is short.
            const end = paths.length ? paths[paths.length - 1][1] : [x, 1]
            paths.push(Math.abs(end[1] - hi) <= Math.abs(end[1] - lo) ? [[x, hi], [x, lo]] : [[x, lo], [x, hi]])
        }
        return byLength(paths, n)
    },
    // A wire cube, every edge drawn, turning an eighth of a turn on every beat (eased in the first half) round its upright,
    // leaning towards you so its top shows. Sized to stay inside the picture at every turn.
    cube: (n, { beat = 0 } = {}) => {
        const at = cubeView((Math.PI / 4) * stepOf(beat)).map(([x, y]) => [x * CUBE_FIT, y * CUBE_FIT])
        return byLength(CUBE_STROKES.map((stroke) => stroke.map((i) => at[i])), n)
    },
    // `copies` tiny dots (20, 2 to 28: each costs the cube a blank move, ~77 points; 28 is the most inside its budget) over the whole picture, each DUST_R in the field
    // whatever the look's size. Half of them jump to new places on every beat, the other half on the next, so each dot
    // lives two beats; a dot appears whole and goes whole. Each half rests on its own colour of DUST_PLACES, a little off
    // the grid point (less as the dots grow, so from size 0.3 up no two ever touch). Drawn nearest first: short hops.
    dust: (n, { copies = 0, beat = 0, size = 1 } = {}) => {
        const count = countOf(copies, 20, 2, 28)
        const r = size > 0 ? Math.min(SPOT_R, DUST_R / size) : SPOT_R
        const nudge = clamp((0.22 - 2 * r) / (2 * Math.SQRT2) - 0.005, 0, 0.05)
        const dots = []
        for (const half of [0, 1]) {
            const k = Math.floor((beat + half) / 2)
            const order = DUST_PLACES[half].map((p, s) => ({ p, s, draw: hash01(s, k, 61 + half) })).sort((a, b) => a.draw - b.draw)
            for (const { p, s } of order.slice(0, half ? Math.floor(count / 2) : Math.ceil(count / 2))) {
                dots.push([p[0] + nudge * (2 * hash01(s, k, 63 + half) - 1), p[1] + nudge * (2 * hash01(s, k, 65 + half) - 1)])
            }
        }
        const each = clamp(Math.floor(n / count), 8, 16)
        const out = []
        let last = dots.shift()
        out.push(along(arcPath(last[0], last[1], r, Math.PI / 2), each))
        while (dots.length) {
            let best = 0
            for (let i = 1; i < dots.length; i += 1) if (Math.hypot(dots[i][0] - last[0], dots[i][1] - last[1]) < Math.hypot(dots[best][0] - last[0], dots[best][1] - last[1])) best = i
            const next = dots.splice(best, 1)[0]
            out.push(along(arcPath(next[0], next[1], r, Math.atan2(last[1] - next[1], last[0] - next[0])), each))
            last = next
        }
        return out
    },
    // A heart monitor: the cardiogram written left to right across the picture, `copies` beats across (3, 1 to 8), one
    // heartbeat in the middle of each beat's width. The pen is at the spike exactly on the beat, so the spike is drawn on
    // the beat; just ahead of the pen ECG_GAP of the old trace is wiped, the rest of it stays. Two strokes: the trace up to
    // the pen, and the old trace from the gap to the right edge (a piece under 0.02 is left out; one of them is always long).
    heartbeat: (n, { copies = 0, beat = 0 } = {}) => {
        const across = countOf(copies, 3, 1, 8)
        const pen = -1 + (2 * ((((beat + 0.5) % across) + across) % across)) / across
        const trace = (x0, x1) => {
            const steps = Math.max(2, Math.ceil(((x1 - x0) / 2) * across * 600))
            return Array.from({ length: steps + 1 }, (_, i) => {
                const x = x0 + ((x1 - x0) * i) / steps
                const p = ((x + 1) / 2) * across - 0.5
                return [x, ECG_BASE + ECG_HEIGHT * ecgAt(p - Math.round(p))]
            })
        }
        const paths = []
        if (pen + 1 >= 0.02) paths.push(trace(-1, pen))
        if (1 - pen - ECG_GAP >= 0.02) paths.push(trace(pen + ECG_GAP, 1))
        return byLength(paths, n)
    },
    // One dot in the middle, held still: a ring POINT_R round, the same on the wall at any size (below 0.05 it shrinks with
    // the picture, and at 0 it is a still beam the engine stops, as every shape is).
    point: (n, { size = 1 } = {}) => {
        const r = size > 0 ? Math.min(1, POINT_R / size) : 1
        // At most 300 points: more only slow the loop, and at 1992 through the owner's pin one window held 40 %.
        const m = Math.min(n, 300)
        return [Array.from({ length: m }, (_, i) => {
            const a = Math.PI / 2 + (i / (m - 1)) * TAU
            return [Math.cos(a) * r, Math.sin(a) * r]
        })]
    },
    // One level line that splits into two, then four (beats 1, 2); an upright line appears (3) and splits the same way (4, 5)
    // into a grid of four by four, held three beats; then the upright lines fold back together and go (9–11), the level
    // ones fold back into one (12, 13), held to beat 16. Every line runs the whole picture; drawn back and forth.
    weave: (n, { beat = 0 } = {}) => {
        const b = ((beat % 16) + 16) % 16
        const k = Math.floor(b)
        const f = glideOf(b)
        const level = weaveLines(WEAVE_LEVEL[k], f)
        const upright = weaveLines(WEAVE_UPRIGHT[k], f)
        const paths = [
            ...level.map((y, i) => (i % 2 === 0 ? [[-1, y], [1, y]] : [[1, y], [-1, y]])),
            ...upright.map((x, i) => (i % 2 === 0 ? [[x, 1], [x, -1]] : [[x, -1], [x, 1]])),
        ]
        return byLength(paths, n)
    },
    // One circle that splits into two (beat 2), then into three, overlapping like a Venn picture (beat 4); the three mix
    // (beats 6–12): a sixth of a turn round the middle on every beat, closing in tight on the odd beats and opening on the
    // even ones, so they pass through each other; then they merge back into two (12) and one (14). They only move: every
    // circle stays the same size. Each is a stroke of its own.
    venn: (n, { beat = 0 } = {}) => {
        const b = ((beat % 16) + 16) % 16
        const k = Math.floor(b)
        const f = glideOf(b)
        const lerp = (p, q) => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]
        const two = [[-VENN_TWO, 0], [VENN_TWO, 0]]
        const three = vennRing(VENN_THREE, 0)
        let centres
        if (k < 2 || k === 15) centres = [[0, 0]]
        else if (k === 2) centres = two.map((q) => lerp([0, 0], q))
        else if (k === 3 || k === 13) centres = two
        // The left circle goes to the lower left place; the right one splits to the lower right and the top.
        else if (k === 4) centres = [lerp(two[0], three[1]), lerp(two[1], three[2]), lerp(two[1], three[0])]
        else if (k === 5) centres = three
        else if (k < 12) {
            const s = b - 6
            const step = Math.floor(s) + f
            const d = (i) => (i % 2 === 0 ? VENN_THREE : VENN_TIGHT)
            centres = vennRing(d(Math.floor(s)) + (d(Math.floor(s) + 1) - d(Math.floor(s))) * f, (TAU / 6) * step)
        } else if (k === 12) centres = f >= 1 ? two : [lerp(three[1], two[0]), lerp(three[2], two[1]), lerp(three[0], two[1])]
        else centres = f >= 1 ? [[0, 0]] : two.map((p) => lerp(p, [0, 0]))
        return byLength(centres.map(([x, y]) => arcPath(x, y, VENN_R, Math.PI / 2)), n)
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
    // `size` too, for a shape whose marks keep one size on the wall however big the picture is (dust).
    const strokes = build(n, { copies: finite(copies, 0), time: t, beat: finite(beat, t * 2), size: scale })
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

export {
    LASER_SHAPES, MARK_SHAPES, MARK_MIN_SIZE, shapeListOf, DEFAULT_LASER_COLOUR, MIN_POINTS, parseLaserColour, generateShape,
}
