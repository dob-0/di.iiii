// Timing for a typewriter reveal: characters appear at a steady rate, with a
// pause at the end of each line before the next one starts. Pure so the timing
// can be tested without a renderer -- the component only feeds it a clock.

export const TEXT_REVEAL_DEFAULTS = {
    mode: 'none',
    speed: 28,      // characters per second
    delay: 0.4,     // seconds before the first character appears
    lineDelay: 0.35, // extra pause at the end of each line
    hold: 3,        // seconds the finished text holds before a loop restarts
    loop: false,
}

const lineCost = (length, speed, lineDelay) => length / speed + lineDelay

// Total seconds from the first character to the last one landing.
export const typewriterDuration = (lineLengths = [], config = {}) => {
    const speed = Math.max(1, config.speed ?? TEXT_REVEAL_DEFAULTS.speed)
    const lineDelay = Math.max(0, config.lineDelay ?? TEXT_REVEAL_DEFAULTS.lineDelay)
    return lineLengths.reduce((total, length) => total + lineCost(length, speed, lineDelay), 0)
}

/**
 * Where the typewriter has got to at `elapsed` seconds.
 *
 * Returns `{ line, chars, done }` — every line before `line` is fully drawn,
 * `line` itself shows its first `chars` characters, and every line after it is
 * still hidden. Before the reveal starts, `line` is -1 so a caller can hide
 * everything rather than flashing the first line.
 */
export function typewriterState(elapsed, lineLengths = [], config = {}) {
    const lines = Array.isArray(lineLengths) ? lineLengths : []
    if (!lines.length) return { line: -1, chars: 0, done: true }

    const speed = Math.max(1, config.speed ?? TEXT_REVEAL_DEFAULTS.speed)
    const delay = Math.max(0, config.delay ?? TEXT_REVEAL_DEFAULTS.delay)
    const lineDelay = Math.max(0, config.lineDelay ?? TEXT_REVEAL_DEFAULTS.lineDelay)
    const loop = config.loop === true
    const hold = Math.max(0, config.hold ?? TEXT_REVEAL_DEFAULTS.hold)

    const typing = typewriterDuration(lines, { speed, lineDelay })

    let t = Number(elapsed) - delay
    if (!(t >= 0)) return { line: -1, chars: 0, done: false }

    if (loop) {
        // One full cycle is the typing plus the hold on the finished text; the
        // delay is deliberately not repeated, so a loop doesn't stall on blank.
        const cycle = typing + hold
        if (cycle > 0) t %= cycle
    } else if (t >= typing) {
        return { line: lines.length - 1, chars: lines[lines.length - 1], done: true }
    }

    for (let i = 0; i < lines.length; i++) {
        const cost = lineCost(lines[i], speed, lineDelay)
        if (t < cost) {
            // Clamp to the line's own length so the trailing lineDelay reads as
            // a pause on the completed line rather than an overrun.
            const chars = Math.min(lines[i], Math.floor(t * speed))
            return { line: i, chars, done: false }
        }
        t -= cost
    }

    return { line: lines.length - 1, chars: lines[lines.length - 1], done: true }
}
