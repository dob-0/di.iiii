// OSC 1.0 encoder. Hand-rolled on purpose: the whole format is 60 lines, and
// `di up` ships a prebuilt serverXR version directory, so every npm dependency
// added here has to survive the release bundle. A dependency is a bigger
// commitment than the spec it would implement.
//
// Reference: opensoundcontrol.org/spec-1_0. Everything is big-endian and
// padded to a 4-byte boundary — including the padding rule people get wrong,
// which is that a string ALWAYS gets at least one null and is then padded up,
// so a 4-character address occupies 8 bytes, not 4.

const pad4 = (length) => (length + 3) & ~3

const encodeString = (value) => {
    const raw = Buffer.from(String(value), 'utf8')
    const out = Buffer.alloc(pad4(raw.length + 1))
    raw.copy(out)
    return out
}

const encodeBlob = (value) => {
    const data = Buffer.isBuffer(value) ? value : Buffer.from(value)
    const out = Buffer.alloc(4 + pad4(data.length))
    out.writeInt32BE(data.length, 0)
    data.copy(out, 4)
    return out
}

// An OSC address must start with '/' and, per the spec, may not contain space
// or the pattern characters. We refuse rather than sanitise: a silently
// rewritten address is a control message delivered to the wrong place, which
// on a lighting desk is worse than an error.
const INVALID_ADDRESS = /[ #*,?[\]{}]/

const assertAddress = (address) => {
    const value = String(address == null ? '' : address)
    if (!value.startsWith('/')) throw new Error(`OSC address must start with "/" — got ${JSON.stringify(value)}`)
    if (INVALID_ADDRESS.test(value)) throw new Error(`OSC address may not contain space or # * , ? [ ] { } — got ${JSON.stringify(value)}`)
    return value
}

// One JS value → one OSC argument. The tag set is deliberately small: i, f, s,
// b, plus the type-only tags T/F/N.
//
// NUMBERS DEFAULT TO FLOAT, and that default is load-bearing. JavaScript cannot
// tell 440.0 from 440, so an encoder that infers "whole number → int" sends `i`
// for every fader that happens to be sitting at 1.0 or 0.0 — and a desk
// expecting a float fader ignores an int, which reads as a light that does not
// come on. Continuous control is the overwhelming majority of OSC traffic, so
// the guess that costs least when wrong is float.
//
// `numberAs: 'int'` is how an author asks for an index or a channel number; a
// fractional value still goes out as a float, because rounding someone's number
// silently is worse than sending a type they did not ask for.
const encodeArgument = (value, numberAs = 'float') => {
    if (value === true) return { tag: 'T', bytes: null }
    if (value === false) return { tag: 'F', bytes: null }
    if (value === null || value === undefined) return { tag: 'N', bytes: null }
    if (Buffer.isBuffer(value)) return { tag: 'b', bytes: encodeBlob(value) }
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new Error(`OSC cannot carry ${value}`)
        const asInt = numberAs === 'int' && Number.isInteger(value) && Math.abs(value) <= 0x7fffffff
        const bytes = Buffer.alloc(4)
        if (asInt) bytes.writeInt32BE(value, 0)
        else bytes.writeFloatBE(value, 0)
        return { tag: asInt ? 'i' : 'f', bytes }
    }
    return { tag: 's', bytes: encodeString(value) }
}

const encodeMessage = (address, args = [], { numberAs = 'float' } = {}) => {
    const list = Array.isArray(args) ? args : [args]
    const encoded = list.map((value) => encodeArgument(value, numberAs))
    const tags = encodeString(`,${encoded.map((a) => a.tag).join('')}`)
    return Buffer.concat([
        encodeString(assertAddress(address)),
        tags,
        ...encoded.filter((a) => a.bytes).map((a) => a.bytes)
    ])
}

module.exports = { encodeMessage, encodeString, encodeArgument, assertAddress }
