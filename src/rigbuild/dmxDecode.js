// WHAT A LAMP'S DMX MEANS — a fixture's live channel values read through its channel
// list into what the room draws. docs/architecture/RIG_BUILD.md §18.2. Pure.
//
// In: a mode's `channels` (fixtureTypes.js / assumedProfiles.js: { role, label, cap }),
// the fixture's values in that order (0..255, as the desk puts them on the wire), and
// the type (for its pan/tilt range and zoom). Out: what the room needs, and nothing it
// cannot know:
//   level      0..1, the light out (dimmer, 16-bit with its fine channel; a fixture with
//              no dimmer is as bright as its brightest emitter)
//   colour     '#rrggbb' at full, or null when the channels say nothing about colour
//   shutter    'open' | 'closed' | 'strobe'  (and `strobeHz` when strobing)
//   pan, tilt  degrees FROM HOME (the fixture's own frame, fixture-lib.mjs), or null
//   zoomDeg    the full beam angle, or null
//   gobo, prism, wheelSpin   noted, not drawn yet (the owner's brief: note them)
//
// Conventions, each stated once:
//   - 16-bit: coarse × 256 + fine, over 65535 (ANSI E1.11 slots are 8-bit; a fine
//     channel is the low byte — the convention every chart with "fine" uses);
//   - pan/tilt: DMX centre (32768/65535) is HOME, the range is the type's published
//     pan/tilt (e.g. 540°/270°), symmetric about home — so 0 is −270° and 65535 +270°;
//   - a colour wheel's half position is the two colours mixed half and half; a spinning
//     wheel is drawn at its open slot and noted (a spin is not a colour);
//   - CTO warms toward 3200 K (#ffb46b, the blackbody at 3200 K as CIE 1931 → sRGB).

const clamp01 = (v) => Math.max(0, Math.min(1, v))
const hex2 = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')
const rgbHex = ([r, g, b]) => `#${hex2(r)}${hex2(g)}${hex2(b)}`
const hexRgb = (hex) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''))
    if (!m) return null
    const n = parseInt(m[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)
const WARM_3200K = [255, 180, 107]
// What a white emitter adds, the desk's own mix (src/rigMirror/fixtureColour.js EMITTER_MIX.w).
const WHITE_MIX = [0.92, 0.92, 0.92]
// Tunable white (a COB with a warm and a cold emitter, UP-COB200): the two ends of its mix.
// Warm = WARM_3200K above; cold = the blackbody at 5600 K, CIE 1931 → sRGB (≈ #ffeee3). A look
// colour is placed on that line by its blue/red balance; anything bluer is all cold, anything
// redder all warm (the unit makes nothing else). Method stated here, not a maker's figure.
const COOL_5600K = [255, 238, 227]
const bOverR = (rgb) => (rgb[0] > 0 ? rgb[2] / rgb[0] : 1)
export const coolShareOf = (rgb) => Math.max(0, Math.min(1, (bOverR(rgb) - bOverR(WARM_3200K)) / (bOverR(COOL_5600K) - bOverR(WARM_3200K))))

const inRange = (list, v) => (Array.isArray(list) ? list.find((r) => v >= r.from && v <= r.to) || null : null)
const lerp = (a, b, t) => a + (b - a) * t
const along = (r, v) => (r.to > r.from ? (v - r.from) / (r.to - r.from) : 0)

/** 16-bit value 0..1 from a coarse and an optional fine byte. */
export const sixteen = (coarse, fine) => {
    const c = Math.max(0, Math.min(255, Number(coarse) || 0))
    // No fine channel: an 8-bit value, 255 = full (not 255·256/65535).
    if (fine == null) return c / 255
    const f = Math.max(0, Math.min(255, Number(fine) || 0))
    return (c * 256 + f) / 65535
}

/** Degrees from home for a 0..1 position over a symmetric range. */
export const degFromHome = (unit, range) => (clamp01(unit) - 0.5) * (Number(range) || 0)

/** A wheel's colour at a value: { colour, name?, half?, spin? } or null (no slot). */
export const wheelAt = (ranges, v) => {
    const r = inRange(ranges, v)
    if (!r) return null
    if (r.spin) return { spin: r.spin }
    if (r.half) {
        const slots = ranges.filter((x) => x.colour)
        const a = slots[r.half[0]]
        const b = slots[r.half[1]]
        if (!a || !b) return null
        return { colour: rgbHex(mix(hexRgb(a.colour), hexRgb(b.colour), 0.5)), half: [a.name, b.name] }
    }
    return { colour: r.colour, name: r.name }
}

/** The shutter at a value: { shutter, strobeHz }. */
export const shutterAt = (ranges, v) => {
    const r = inRange(ranges, v)
    if (!r) return { shutter: 'open', strobeHz: 0 }
    if (r.strobe) return { shutter: 'strobe', strobeHz: Math.round(lerp(r.strobe[0], r.strobe[1], along(r, v)) * 100) / 100 }
    return { shutter: r.open === false ? 'closed' : 'open', strobeHz: 0 }
}

/** A strobe's flash rate at a value (a dedicated rate channel): Hz, 0 = single/none. */
export const rateAt = (ranges, v) => {
    const r = inRange(ranges, v)
    if (!r || r.single || !r.hz) return 0
    return Math.round(lerp(r.hz[0], r.hz[1], along(r, v)) * 100) / 100
}

/**
 * Decode one fixture's values through its channel list.
 * @param {{role: string, cap?: object}[]} channels
 * @param {number[]} values   the fixture's slots, in channel order
 * @param {object} [type]     the fixture type (pan_tilt_deg, optics.zoom_deg)
 */
export const decodeDmx = (channels, values, type = null) => {
    const list = Array.isArray(channels) ? channels : []
    const at = {}
    const spec = {}
    list.forEach((c, i) => {
        if (!c || typeof c.role !== 'string') return
        at[c.role] = Math.max(0, Math.min(255, Number(values?.[i]) || 0))
        spec[c.role] = c
    })
    const has = (role) => role in at
    const out = { level: 1, colour: null, shutter: 'open', strobeHz: 0, pan: null, tilt: null, zoomDeg: null, gobo: null, prism: null, wheelSpin: null, notes: [] }

    // Colour: RGB(W) emitters, else a wheel, else nothing to say.
    let rgb = null
    if (has('r') || has('g') || has('b')) {
        rgb = [at.r || 0, at.g || 0, at.b || 0]
        if (has('w')) rgb = rgb.map((v, i) => v + (at.w || 0) * WHITE_MIX[i])
    } else if (has('w')) {
        rgb = [at.w, at.w, at.w].map((v, i) => v * WHITE_MIX[i] / 0.92)
    } else if (has('warm') || has('cool')) {
        const w = at.warm || 0
        const c = at.cool || 0
        const top = Math.max(w, c)
        rgb = top > 0 ? mix(WARM_3200K, COOL_5600K, c / (w + c)).map((v) => (v * top) / 255) : [0, 0, 0]
    }
    const wheel = Object.values(spec).find((c) => c.cap?.wheel)
    if (!rgb && wheel) {
        const w = wheelAt(wheel.cap.wheel, at[wheel.role])
        if (w?.spin) { out.wheelSpin = w.spin; out.notes.push(`colour wheel spinning (${w.spin}) — drawn open`) }
        rgb = hexRgb(w?.colour) || [255, 255, 255]
        rgb = rgb.slice()
    }
    const cto = Object.values(spec).find((c) => c.cap?.cto)
    if (rgb && cto && at[cto.role] > 0) {
        const peak = Math.max(...rgb) || 1
        rgb = mix(rgb, WARM_3200K.map((v) => v * peak / 255), at[cto.role] / 255)
    }
    const peak = rgb ? Math.max(...rgb) : 0
    if (rgb) out.colour = peak > 0 ? rgbHex(rgb.map((v) => (v / peak) * 255)) : null

    // Level: the dimmer (16-bit with its fine), times the emitters where there is no wheel.
    const dim = has('dimmer') ? sixteen(at.dimmer, has('dimmerFine') ? at.dimmerFine : null) : 1
    const emitted = (has('r') || has('g') || has('b') || has('w') || has('warm') || has('cool')) ? Math.min(1, peak / 255) : 1
    out.level = Math.round(dim * emitted * 10000) / 10000

    // Shutter / strobe, or a dedicated flash-rate channel (a strobe fixture).
    const shutter = Object.values(spec).find((c) => c.cap?.shutter)
    if (shutter) Object.assign(out, shutterAt(shutter.cap.shutter, at[shutter.role]))
    const rate = Object.values(spec).find((c) => c.cap?.rate)
    if (rate) {
        const hz = rateAt(rate.cap.rate, at[rate.role])
        if (hz > 0) { out.shutter = 'strobe'; out.strobeHz = hz } else if (!shutter) { out.shutter = 'closed'; out.notes.push('single flash — drawn dark between') }
    }
    if (out.shutter === 'closed') out.level = 0

    // Position.
    const [panRange, tiltRange] = Array.isArray(type?.pan_tilt_deg?.value) ? type.pan_tilt_deg.value : [540, 270]
    if (has('pan')) out.pan = Math.round(degFromHome(sixteen(at.pan, has('panFine') ? at.panFine : null), panRange) * 100) / 100
    if (has('tilt')) out.tilt = Math.round(degFromHome(sixteen(at.tilt, has('tiltFine') ? at.tiltFine : null), tiltRange) * 100) / 100

    // Beam.
    const zoom = Object.values(spec).find((c) => c.cap?.zoom)
    if (zoom) {
        const z = zoom.cap.zoom
        const t = clamp01((at[zoom.role] - z.from) / Math.max(1, z.to - z.from))
        out.zoomDeg = Math.round(lerp(z.deg[0], z.deg[1], t) * 100) / 100
    }
    const gobo = Object.values(spec).find((c) => c.cap?.gobo)
    if (gobo && at[gobo.role] > 0) { out.gobo = at[gobo.role]; out.notes.push(`gobo at ${at[gobo.role]} — not drawn yet`) }
    const prism = Object.values(spec).find((c) => c.cap?.prism)
    if (prism && at[prism.role] > 0) { out.prism = at[prism.role]; out.notes.push(`prism at ${at[prism.role]} — not drawn yet`) }
    return out
}

export default decodeDmx

// ---- the other way: what a look WANTS, as a fixture's DMX (RIG_BUILD.md §18.4) --------
// A designed look (looks.js lookPoses) says, per lamp: aim, colour, level. The desk plays
// looks as DMX, so for a lamp with a channel list the look is written as the values that
// channel list needs — the same list the room decodes, so the room drawn from DMX is the
// room the look designed. Pure. Values the look does not speak about are left out (the
// fixture's own resting values stand).

const nearestSlot = (ranges, rgb) => {
    let best = null
    for (const r of ranges || []) {
        if (!r.colour) continue
        const c = hexRgb(r.colour)
        const d = (c[0] - rgb[0]) ** 2 + (c[1] - rgb[1]) ** 2 + (c[2] - rgb[2]) ** 2
        if (!best || d < best.d) best = { d, r }
    }
    return best ? Math.round((best.r.from + best.r.to) / 2) : null
}

const toSixteen = (unit) => {
    const v = Math.round(clamp01(unit) * 65535)
    return [v >> 8, v & 255]
}

const rateValue = (ranges, hz) => {
    const r = (ranges || []).find((x) => x.hz && hz >= Math.min(...x.hz) && hz <= Math.max(...x.hz))
    if (!r) return null
    return Math.round(r.from + ((hz - r.hz[0]) / (r.hz[1] - r.hz[0] || 1)) * (r.to - r.from))
}
const strobeValue = (ranges, hz) => {
    const r = (ranges || []).find((x) => x.strobe && x.strobe[1] > x.strobe[0] && hz >= x.strobe[0] && hz <= x.strobe[1])
    if (!r) return null
    return Math.round(r.from + ((hz - r.strobe[0]) / (r.strobe[1] - r.strobe[0])) * (r.to - r.from))
}
const openValue = (ranges) => {
    const r = (ranges || []).filter((x) => x.open === true).sort((a, b) => b.to - a.to)[0]
    return r ? r.to : null
}

/**
 * @param {{role: string, cap?: object}[]} channels
 * @param {{level?: number, colour?: string, pan?: number, tilt?: number, strobeHz?: number}} want
 *        pan/tilt in degrees FROM HOME (the fixture's frame)
 * @returns {Record<string, number>}  role → 0..255
 */
export const encodeDmx = (channels, want = {}, type = null) => {
    const out = {}
    const spec = {}
    for (const c of channels || []) if (c && typeof c.role === 'string') spec[c.role] = c
    const has = (role) => role in spec
    const level = want.level == null ? null : clamp01(Number(want.level))
    const rgb = hexRgb(want.colour)
    const wheel = Object.values(spec).find((c) => c.cap?.wheel)
    const emitters = has('r') || has('g') || has('b')
    if (rgb && emitters) {
        const peak = Math.max(...rgb) || 1
        const scale = has('dimmer') || level == null ? 1 : level
        if (has('r')) out.r = Math.round((rgb[0] / peak) * 255 * scale)
        if (has('g')) out.g = Math.round((rgb[1] / peak) * 255 * scale)
        if (has('b')) out.b = Math.round((rgb[2] / peak) * 255 * scale)
        if (has('w')) out.w = 0
    } else if (emitters && !has('dimmer') && level === 0) {
        // A colour-only mode (RGBW, no dimmer) has no other way to say OUT.
        for (const role of ['r', 'g', 'b', 'w']) if (has(role)) out[role] = 0
    } else if (rgb && wheel) {
        const v = nearestSlot(wheel.cap.wheel, rgb)
        if (v != null) out[wheel.role] = v
    } else if (rgb && (has('warm') || has('cool'))) {
        const f = coolShareOf(rgb)
        const top = Math.max(f, 1 - f)
        const scale = has('dimmer') || level == null ? 1 : level
        if (has('warm')) out.warm = Math.round(((1 - f) / top) * 255 * scale)
        if (has('cool')) out.cool = Math.round((f / top) * 255 * scale)
    }
    const cto = Object.values(spec).find((c) => c.cap?.cto)
    if (cto && rgb) out[cto.role] = 0
    if (level != null && has('dimmer')) {
        if (has('dimmerFine')) { const [c, f] = toSixteen(level); out.dimmer = c; out.dimmerFine = f } else out.dimmer = Math.round(level * 255)
    }
    const shutter = Object.values(spec).find((c) => c.cap?.shutter)
    const rate = Object.values(spec).find((c) => c.cap?.rate)
    const hz = Number(want.strobeHz) || 0
    if (shutter) {
        const v = hz > 0 ? strobeValue(shutter.cap.shutter, hz) : openValue(shutter.cap.shutter)
        if (v != null) out[shutter.role] = v
    }
    if (rate && hz > 0) {
        const v = rateValue(rate.cap.rate, hz)
        if (v != null) out[rate.role] = v
    }
    const [panRange, tiltRange] = Array.isArray(type?.pan_tilt_deg?.value) ? type.pan_tilt_deg.value : [540, 270]
    if (want.pan != null && has('pan')) {
        const [c, f] = toSixteen(Number(want.pan) / panRange + 0.5)
        out.pan = c
        if (has('panFine')) out.panFine = f
    }
    if (want.tilt != null && has('tilt')) {
        const [c, f] = toSixteen(Number(want.tilt) / tiltRange + 0.5)
        out.tilt = c
        if (has('tiltFine')) out.tiltFine = f
    }
    return out
}
