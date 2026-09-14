// What a wire hands over when the two ends speak different types.
//
// A TouchDesigner hand expects a number to switch a boolean and a beat to
// fire a Counter. arePortsCompatible (nodeRegistry.js) lets those wires be
// drawn; this is what makes them carry something honest.
//
//   number -> boolean   on above one half (0.5), the CHOP-to-switch convention
//   signal -> boolean   true for the ONE pass in which the count changed —
//                       a signal is a rising count (time.beat, MIDI trigger),
//                       and an event is the number moving, never its size
//   any    -> boolean   typed words read as people mean them: "0", "false",
//                       "off", "no" and the empty string are off
//   typed text in an `any` field that is a number or true/false becomes that
//   value, so Mix lerps "0".."1" instead of hard-switching at the half

const OFF_WORDS = new Set(['', '0', 'false', 'off', 'no', 'null', 'undefined'])
const NUMERIC = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i

export const BOOLEAN_THRESHOLD = 0.5

/** A value as a boolean consumer should read it. */
export const toBoolean = (value) => {
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return Number.isFinite(value) && value > BOOLEAN_THRESHOLD
    if (value === null || value === undefined) return false
    if (typeof value === 'string') {
        const word = value.trim().toLowerCase()
        if (OFF_WORDS.has(word)) return false
        if (NUMERIC.test(word)) return Number(word) > BOOLEAN_THRESHOLD
        return true
    }
    return Boolean(value)
}

/** Text typed into a free field, read as the number or switch it spells. */
export const parseTypedValue = (value) => {
    if (typeof value !== 'string') return value
    const word = value.trim()
    if (!word) return value
    if (NUMERIC.test(word)) return Number(word)
    const lower = word.toLowerCase()
    if (lower === 'true') return true
    if (lower === 'false') return false
    return value
}

/**
 * Coerce a value that came down a wire from a `fromType` port into a `toType`
 * port. Signals are not handled here — they need memory (see readSignalPulse).
 */
export const coerceWireValue = (value, fromType, toType) => {
    if (value === undefined || !toType || fromType === toType) return value
    if (toType === 'boolean') {
        if (fromType === 'number' || fromType === 'any' || fromType === 'string') return toBoolean(value)
        return value
    }
    if (toType === 'number' && typeof value === 'string') {
        const parsed = parseTypedValue(value)
        return typeof parsed === 'number' ? parsed : value
    }
    return value
}

/**
 * A signal read as a boolean: true in the pass where its count moved.
 * `memory` is the window's frameMemory (null means no memory: never fires),
 * `passCache` keeps one answer per pass however many times it is asked.
 * @returns {{ value: boolean, pulsed: boolean }}
 */
export const readSignalPulse = ({ memory, passCache, key, count }) => {
    if (passCache?.has(key)) return passCache.get(key)
    let answer = { value: false, pulsed: false }
    if (memory) {
        const before = memory.get(key)
        memory.set(key, count)
        const moved = before !== undefined && count !== undefined && count !== null && count !== before
        answer = { value: moved, pulsed: moved }
    }
    passCache?.set(key, answer)
    return answer
}
