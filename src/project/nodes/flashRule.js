// The flash rule, in ONE place: WCAG 2.2 success criterion 2.3.1 "Three
// Flashes or Below Threshold" (https://www.w3.org/TR/WCAG22/#three-flashes-or-below-threshold).
// A flash is a pair of opposing changes of 10 % or more of full; nothing may
// flash more than three times in any one second. A change is found with 0.1
// hysteresis on the level (0..1): a fall of 0.1 from the highest point since
// the last change, or a rise of 0.1 from the lowest. The count of a trace is
// the worst 1 s window, halved (pairs). The Flash Guard node and the offline
// checks (scripts/measure/flashrate.cjs, scripts/place/scenes_flash.cjs) all
// count with this file; it imports nothing so a .cjs script can load it.
// Limit, plainly: WCAG also excuses changes whose darker side is at 0.80 or
// more of full, and red flashes have their own rule; neither is modelled.
export const FLASH_THRESHOLD = 0.1
export const FLASH_WINDOW_MS = 1000
export const FLASH_LIMIT_PER_SECOND = 3
// "10 % or more": 0.6 - 0.5 is 0.0999… in floating point and must still count.
const AT_LEAST = FLASH_THRESHOLD - 1e-9

// One sample through the hysteresis tracker. Returns the next state; never
// mutates. `turned` is -1 (a fall), 1 (a rise) or 0 for this sample.
export const flashStep = (state, value) => {
    const v = Number.isFinite(value) ? value : 0
    if (!state || state.hi === null || state.hi === undefined) return { hi: v, lo: v, dir: 0, turned: 0 }
    let hi = Math.max(state.hi, v)
    let lo = Math.min(state.lo, v)
    let dir = state.dir
    let turned = 0
    if (dir !== -1 && hi - v >= AT_LEAST) { turned = -1; dir = -1; lo = v }
    else if (dir !== 1 && v - lo >= AT_LEAST) { turned = 1; dir = 1; hi = v }
    return { hi, lo, dir, turned }
}

// Times (ms) of every change in a trace of { at, value } samples, in order.
export const changeTimes = (samples) => {
    const times = []
    let state = null
    for (const s of samples) {
        state = flashStep(state, s.value)
        if (state.turned) times.push(s.at)
    }
    return times
}

// Most changes inside any window shorter than windowMs, over sorted times.
export const mostChangesInWindow = (times, windowMs = FLASH_WINDOW_MS) => {
    let most = 0
    let a = 0
    for (let b = 0; b < times.length; b++) {
        while (times[b] - times[a] >= windowMs) a++
        most = Math.max(most, b - a + 1)
    }
    return most
}

// Flashes (pairs of opposing changes) in the worst one-second window.
export const worstFlashesPerSecond = (times, windowMs = FLASH_WINDOW_MS) =>
    Math.floor(mostChangesInWindow(times, windowMs) / 2)

// The limit actually applied: never above WCAG's three, and anything that is
// not a positive number (empty, unwired, 0, NaN) reads as three. Stricter is
// allowed; switching the guard off is not.
export const flashLimitOf = (limit) => {
    const n = Number(limit)
    if (!Number.isFinite(n) || n <= 0) return FLASH_LIMIT_PER_SECOND
    return Math.min(FLASH_LIMIT_PER_SECOND, n)
}
