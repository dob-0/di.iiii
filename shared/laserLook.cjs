// A laser desk look drawn at a moment, pure: the look (serverXR/src/laser/laserDesk.js normaliseLook), the desk's clock
// and a cube's place in, wire points out. One source for the desk on the server, which sends these points to the cubes,
// and the desk's page, whose bank tiles play every look with the same code (2026-10-29, the owner: "cant see
// animations"). The page gets this file, laserShapes.cjs and laserFrame.cjs as one script, lib/laser.js
// (serverXR/src/routes/laserRoutes.js).
'use strict'

const { generateShape } = require('./laserShapes.cjs')

const BLANK = [0, 0, 0, 0, 0]
const TAU = Math.PI * 2
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

/** The whole field as a cube's map: its corners bottom-left, bottom-right, top-right, top-left. */
const FULL_CORNERS = Object.freeze([[-1, -1], [1, -1], [1, 1], [-1, 1]].map((c) => Object.freeze(c)))

/**
 * A cube's place on the desk: whether the desk drives it, mirrored (flipX across, flipY upside down), its picture's size
 * and offset in its field, and its map (2026-10-31, the owner: "i need to mapp laser"): the four corners the whole field
 * is pinned to, as Resolume's corner pin, so the picture lands on the wall or screen it is aimed at.
 */
const CUBE_DEFAULTS = Object.freeze({ on: true, flipX: false, flipY: false, size: 1, x: 0, y: 0, order: 0, corners: FULL_CORNERS })

/** Four corners, each [x, y] in −1…1, or the full field when `raw` is not four pairs of numbers. Pure. */
const normaliseCorners = (raw, base = FULL_CORNERS) => {
    if (!Array.isArray(raw) || raw.length !== 4) return base
    const out = raw.map((c) => (Array.isArray(c) && c.length === 2 && c.every((v) => Number.isFinite(Number(v)))
        ? [clamp(Number(c[0]), -1, 1), clamp(Number(c[1]), -1, 1)]
        : null))
    return out.every(Boolean) ? out : base
}

/**
 * The corner pin: a projective map (the square-to-quad homography, Heckbert 1989) from the field −1…1 onto the four
 * corners, so straight lines stay straight as on a keystoned projector. Returns null for the full field (nothing to do)
 * and for corners that fold or collapse (three in a line), which keep the field unmapped rather than draw garbage. Pure.
 */
const cornerPin = (corners) => {
    const q = normaliseCorners(corners)
    if (q.every((c, i) => c[0] === FULL_CORNERS[i][0] && c[1] === FULL_CORNERS[i][1])) return null
    const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q
    // A quad whose corners do not all turn the same way is folded (a bow tie) or collapsed: no map.
    const turns = q.map((c, i) => {
        const a = q[(i + 3) % 4]
        const b = q[(i + 1) % 4]
        return (c[0] - a[0]) * (b[1] - c[1]) - (c[1] - a[1]) * (b[0] - c[0])
    })
    if (!(turns.every((t) => t > 1e-9) || turns.every((t) => t < -1e-9))) return null
    const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2
    const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3
    const det = dx1 * dy2 - dx2 * dy1
    const g = (sx * dy2 - dx2 * sy) / det
    const h = (dx1 * sy - sx * dy1) / det
    const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, c = x0
    const d = y1 - y0 + g * y1, e = y3 - y0 + h * y3, f = y0
    return (x, y) => {
        const u = (x + 1) / 2
        const v = (y + 1) / 2
        const w = g * u + h * v + 1
        return [clamp((a * u + b * v + c) / w, -1, 1), clamp((d * u + e * v + f) / w, -1, 1)]
    }
}

/** Beats since the clock's zero. */
const beatsAt = (clock, t) => ((t - clock.zero) / 1000) * (clock.bpm / 60)

/**
 * One cube's points for `look` at time t (ms): the Laser node's shape, moved on the beat, then the cube's own setup.
 * `index` is the cube's place among the desk's cubes (mirror, phase). A point the moves push out of the field is
 * blanked where it leaves, never dragged along the edge. Returns wire points (before the flatten), or [BLANK].
 */
const lookPointsAt = (look, { t, clock, index = 0, cube = CUBE_DEFAULTS, master = 1, audio = null }) => {
    const level = look.level * clamp(master, 0, 1)
    if (!(level > 0)) return [BLANK]
    const bpm = clock.bpm
    const b = beatsAt(clock, t) - index * look.phase
    const seconds = (b * 60) / bpm
    const breathe = look.pulse > 0 ? 1 - look.pulse * 0.5 * (1 - Math.cos((TAU * b) / look.pulseBeats)) : 1
    // The music (2026-10-31, the owner: "add audio analyze"): `audio` is the bass and the kicks, 0…1, while the desk hears
    // it (null when it does not). `react` of the size rides on it: quiet draws the picture smaller, a kick full size.
    const swell = look.react > 0 && audio !== null && Number.isFinite(audio) ? 1 - look.react * 0.6 * (1 - clamp(audio, 0, 1)) : 1
    const points = generateShape({
        shape: look.shape,
        size: clamp(look.size * cube.size * breathe * swell, 0, 1),
        height: 0,
        rotation: look.rotation,
        spin: (look.spin * bpm) / 60,
        time: seconds,
        beat: b,
        colour: look.colour,
        level,
        points: look.points,
        copies: look.copies,
        rainbow: look.rainbow,
        cycle: look.cycle > 0 ? (look.cycle * 60) / bpm : 0
    })
    const flip = (look.mirror && index % 2 === 1) !== cube.flipX ? -1 : 1
    const flipY = cube.flipY ? -1 : 1
    const dx = look.x + (look.sweep > 0 ? look.sweep * Math.sin((TAU * b) / look.sweepBeats) : 0)
    // The map last: the picture is placed in the cube's field, then the field is pinned to its corners.
    const pin = cornerPin(cube.corners)
    return points.map((p) => {
        const x = (p[0] + dx) * flip + cube.x
        const y = (p[1] + look.height) * flipY + cube.y
        const inside = x >= -1 && x <= 1 && y >= -1 && y <= 1
        const at = inside ? [x, y] : [clamp(x, -1, 1), clamp(y, -1, 1)]
        const [mx, my] = pin ? pin(at[0], at[1]) : at
        return inside ? [mx, my, p[2], p[3], p[4]] : [mx, my, 0, 0, 0]
    })
}

/**
 * The part of the field a look can reach, [x0, x1, y0, y1]: its size (1.2× for a square's corners as it turns) and its
 * sweep. A picture framed on it holds still while the look moves inside it, so a pulse or a sweep shows.
 */
const lookBox = (look) => {
    const reach = Math.max(0.05, look.size * 1.2)
    const across = look.sweep > 0 ? look.sweep : 0
    return [
        clamp(look.x - reach - across, -1, 1), clamp(look.x + reach + across, -1, 1),
        clamp(look.height - reach, -1, 1), clamp(look.height + reach, -1, 1),
    ]
}

module.exports = { CUBE_DEFAULTS, FULL_CORNERS, normaliseCorners, cornerPin, beatsAt, lookPointsAt, lookBox }
