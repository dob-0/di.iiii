// Yaw for a guided turn around a ring of objects: hold on one stop long enough
// to watch it, ease round to the next, repeat. Pure so the timing can be tested
// without a renderer -- the component only feeds it a clock.

const smoothstep = (x) => x * x * (3 - 2 * x)

export const RING_TOUR_DEFAULTS = { stops: 8, dwell: 7, turn: 1.8, delay: 0, startAngle: 0, direction: 1, loop: true }

// `elapsed` is seconds since the tour mounted. Returns null while the tour has
// not started yet (the `delay` lets an intro title be read first), so a caller
// can leave the visitor's own facing untouched until then.
export function ringTourYaw(elapsed, config = {}) {
    const stops = Math.max(1, Math.round(config.stops ?? RING_TOUR_DEFAULTS.stops))
    const dwell = Math.max(0.1, config.dwell ?? RING_TOUR_DEFAULTS.dwell)
    const turn = Math.max(0.1, config.turn ?? RING_TOUR_DEFAULTS.turn)
    const startAngle = config.startAngle ?? RING_TOUR_DEFAULTS.startAngle
    const direction = config.direction === -1 ? -1 : 1
    const loop = config.loop !== false

    const t = elapsed - (config.delay ?? RING_TOUR_DEFAULTS.delay)
    if (!(t >= 0)) return null

    const step = ((2 * Math.PI) / stops) * direction
    const leg = dwell + turn
    const index = Math.floor(t / leg)
    // Stops accumulate instead of wrapping into [0, 2pi): the visitor keeps
    // turning the same way round the ring rather than unwinding the long way
    // back to the first object on the closing step.
    const held = loop ? index : Math.min(index, stops - 1)
    const base = startAngle + held * step
    const phase = t - index * leg
    const finished = !loop && held >= stops - 1
    if (phase <= dwell || finished) return base
    return base + step * smoothstep(Math.min(1, (phase - dwell) / turn))
}
