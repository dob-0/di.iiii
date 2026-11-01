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

/** A cube's place on the desk: whether the desk drives it, mirrored, its picture's size and offset in its field. */
const CUBE_DEFAULTS = Object.freeze({ on: true, flipX: false, size: 1, x: 0, y: 0, order: 0 })

/** Beats since the clock's zero. */
const beatsAt = (clock, t) => ((t - clock.zero) / 1000) * (clock.bpm / 60)

/**
 * One cube's points for `look` at time t (ms): the Laser node's shape, moved on the beat, then the cube's own setup.
 * `index` is the cube's place among the desk's cubes (mirror, phase). A point the moves push out of the field is
 * blanked where it leaves, never dragged along the edge. Returns wire points (before the flatten), or [BLANK].
 * `stats`, when given, is filled with `lit` (lit points the look drew) and `off` (of those, the ones pushed off the field
 * and blanked), so a cut picture can be counted and shown (stage audit 2026-10-30, rows 19, 23).
 */
const lookPointsAt = (look, { t, clock, index = 0, cube = CUBE_DEFAULTS, master = 1, stats = null }) => {
    const level = look.level * clamp(master, 0, 1)
    if (!(level > 0)) return [BLANK]
    const bpm = clock.bpm
    const b = beatsAt(clock, t) - index * look.phase
    const seconds = (b * 60) / bpm
    const breathe = look.pulse > 0 ? 1 - look.pulse * 0.5 * (1 - Math.cos((TAU * b) / look.pulseBeats)) : 1
    const points = generateShape({
        shape: look.shape,
        size: clamp(look.size * cube.size * breathe, 0, 1),
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
    const dx = look.x + (look.sweep > 0 ? look.sweep * Math.sin((TAU * b) / look.sweepBeats) : 0)
    const dy = look.height + cube.y
    return points.map((p) => {
        const x = (p[0] + dx) * flip + cube.x
        const y = p[1] + dy
        const inside = x >= -1 && x <= 1 && y >= -1 && y <= 1
        if (stats && (p[2] > 0 || p[3] > 0 || p[4] > 0)) { stats.lit = (stats.lit || 0) + 1; if (!inside) stats.off = (stats.off || 0) + 1 }
        return inside ? [x, y, p[2], p[3], p[4]] : [clamp(x, -1, 1), clamp(y, -1, 1), 0, 0, 0]
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

module.exports = { CUBE_DEFAULTS, beatsAt, lookPointsAt, lookBox }
