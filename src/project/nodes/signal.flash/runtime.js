import { FLASH_THRESHOLD, FLASH_WINDOW_MS, flashLimitOf, flashStep } from '../flashRule.js'

// Flash Guard: WCAG 2.2 SC 2.3.1 (three flashes or below) between a value and
// a light or a picture. It counts changes with flashRule.js — the same count
// the offline checks use — on what it SENDS. A change that would put the last
// second over the limit is not passed: the output is held just inside the 10 %
// band until an older change leaves the window, so the light follows at no
// more than Limit flashes a second. Rate is the incoming value's flashes in
// the last second; Limited stays true for a second after the guard held.
// Without frame memory (one-off reads) it passes the value: there is no time.
const EDGE = 1e-6

const pruned = (times, now) => times.filter((at) => at > now - FLASH_WINDOW_MS)

export const computeOutput = (node, portId, { input, asNumber, context }) => {
    if (portId !== 'out' && portId !== 'rate' && portId !== 'limited') return undefined
    const value = asNumber(input('value'), 0)
    const memory = context?.frameMemory
    if (!memory) return portId === 'out' ? value : portId === 'rate' ? 0 : false
    const now = asNumber(context?.now, 0)
    const key = `${node.id}:guard`
    let s = memory.get(key)
    if (!s || s.at !== now) {
        const fullIn = asNumber(input('full'), 1)
        const full = Number.isFinite(fullIn) && fullIn > 0 ? fullIn : 1
        const limit = flashLimitOf(input('limit'))
        const level = value / full
        const prev = s || { inState: null, inTimes: [], outState: null, outTimes: [], heldAt: -Infinity }
        const inState = flashStep(prev.inState, level)
        const inTimes = pruned(prev.inTimes, now)
        if (inState.turned) inTimes.push(now)
        let sent = level
        let outState = flashStep(prev.outState, sent)
        const outTimes = pruned(prev.outTimes, now)
        let heldAt = prev.heldAt
        if (outState.turned && Math.floor((outTimes.length + 1) / 2) > limit) {
            // Stay on the near side of the change the tracker would count.
            const band = FLASH_THRESHOLD - EDGE
            sent = outState.turned < 0 ? prev.outState.hi - band : prev.outState.lo + band
            outState = flashStep(prev.outState, sent)
            heldAt = now
        }
        if (outState.turned) outTimes.push(now)
        s = { at: now, inState, inTimes, outState, outTimes, heldAt, out: sent * full, rate: Math.floor(inTimes.length / 2) }
        memory.set(key, s)
    }
    if (portId === 'out') return s.out
    if (portId === 'rate') return s.rate
    return now - s.heldAt < FLASH_WINDOW_MS
}
