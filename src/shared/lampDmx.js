// GENERATED from shared/lampDmx.cjs by scripts/rigbuild/lamp-dmx-twin.mjs — edit the .cjs, then run it.
// THE LAMP'S CHANNELS — one stage lamp's DMX bytes, from its mode's channel list and what it is told.
//
// A lamp (docs/ai/vocabulary.md: a stage fixture) is patched by its TYPE and MODE: the mode's channel list
// (src/rigbuild/types/library/<type>.json, generated from the sourced charts in scripts/place/fixtures/) says
// which role sits on which channel and where each one rests. The lighting desk turns that list into a profile
// (serverXR/src/lighting/rigpatch.js channelsFor) and renders it to bytes (engine.js Engine.render). The Nodes
// Lamp computes the same bytes in the browser with this file, so Raw and the desk send identical DMX for the same
// lamp told the same thing. src/shared/lampDmx.test.js holds that against the real desk, mode by mode.
//
// Inputs are the wire convention of the node graph, 0 … 1 (the LFO/Range convention), and a colour:
//   dimmer   the level; a 16-bit dimmer when the mode carries dimmerFine
//   colour   '#rrggbb' (or [r, g, b] 0 … 1) onto the r, g, b emitters the mode has; a colour WHEEL is not driven
//   pan/tilt 0.5 is home (byte 128, the desk's own rest); 16-bit when the mode carries the fine channel
//   strobe   the chart's own byte, 0 … 255 — what a value means (open, closed, a rate) is the lamp's chart
//   zoom     the zoom channel's byte
// An input left out leaves its channel at the chart's resting value: an unwired Strobe keeps a shutter that is
// closed at 0 open, which is the line that stops a lamp coming up dark with a correct patch.

// The desk's resting values (serverXR/src/lighting/roles.js ROLE_DEFAULTS). Copied, not required: this file
// travels to the browser. src/shared/lampDmx.test.js fails if the two differ.
const ROLE_DEFAULTS = {
    dimmer: 255, r: 255, g: 255, b: 255, w: 0, a: 0, y: 0,
    warm: 255, cool: 0, strobe: 0, pan: 128, tilt: 128,
    uv: 0, lime: 0,
    panFine: 0, tiltFine: 0, dimmerFine: 0,
    macro: 0, speed: 0, auto: 0, sound: 0, gobo: 0, gobo2: 0,
    rotation: 0, prism: 0, zoom: 0, focus: 0, iris: 0, frost: 0, control: 0,
    color: 0,
    aux1: 0, aux2: 0, aux3: 0, aux4: 0, aux5: 0, aux6: 0, aux7: 0, aux8: 0,
    aux9: 0, aux10: 0, aux11: 0, aux12: 0, aux13: 0, aux14: 0, aux15: 0, aux16: 0,
}
const LIGHT_ROLES = new Set(['r', 'g', 'b', 'w', 'a', 'y', 'warm', 'cool', 'uv', 'lime'])
const ROLE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,23}$/
const MAX_FOOTPRINT = 512

const roleKind = (role) => {
    if (role === 'dimmer') return 'level'
    if (role === 'pan' || role === 'tilt') return 'position'
    if (LIGHT_ROLES.has(role)) return 'emitter'
    if (role === 'panFine' || role === 'tiltFine' || role === 'dimmerFine') return 'fine'
    return 'control'
}

const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key)
const clamp8 = (v) => Math.max(0, Math.min(255, Math.round(v)))
const unit = (v) => {
    const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v)
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : null
}

// A mode → the desk's profile: roles in wire order and each one's resting value. The rule of rigpatch.js
// channelsFor: a listed channel rests at its own `default`, else at the desk's default for its role (never
// the dimmer, which rests at 0), else 0; a mode with no list is ch1 … chN at 0. A role used twice is refused,
// as the desk's addProfile refuses it — one value would drive two channels.
function lampProfile(mode) {
    const footprint = Number(mode && mode.footprint)
    if (!Number.isInteger(footprint) || footprint < 1 || footprint > MAX_FOOTPRINT) {
        return { error: 'the mode has no footprint, so the lamp has no channels' }
    }
    const listed = Array.isArray(mode.channels) && mode.channels.length === footprint ? mode.channels : null
    const roles = []
    const defaults = {}
    const seen = new Set()
    for (let i = 0; i < footprint; i++) {
        const c = listed ? listed[i] : null
        const role = c && typeof c.role === 'string' && ROLE_RE.test(c.role) ? c.role : `ch${i + 1}`
        if (seen.has(role.toLowerCase())) return { error: `the mode uses "${role}" twice` }
        seen.add(role.toLowerCase())
        roles.push(role)
        const own = c && c.default !== null && c.default !== undefined && Number.isFinite(+c.default)
            ? Math.max(0, Math.min(255, +c.default | 0)) : null
        defaults[role] = own !== null ? own : (c && has(ROLE_DEFAULTS, role) && role !== 'dimmer' ? ROLE_DEFAULTS[role] : 0)
    }
    return { roles, defaults, footprint, listed: Boolean(listed) }
}

// A desk profile ({ channels: roles, defaults }, what library.js toProfile makes from an Open Fixture Library
// chart) → a mode this file reads. Every channel gets the value the desk's makeFixture rests it at, so the
// dimmer of an imported profile rests full (255) there and here alike.
function modeFromProfile(profile) {
    const roles = Array.isArray(profile && profile.channels) ? profile.channels : []
    const own = (profile && profile.defaults) || {}
    return {
        footprint: roles.length,
        channels: roles.map((role) => ({
            role,
            default: own[role] != null ? own[role] : (role === 'dimmer' ? 255 : (has(ROLE_DEFAULTS, role) ? ROLE_DEFAULTS[role] : 0)),
        })),
    }
}

const parseColour = (value) => {
    if (Array.isArray(value) && value.length >= 3) {
        const parts = value.slice(0, 3).map(unit)
        return parts.every((p) => p !== null) ? parts : null
    }
    if (typeof value !== 'string') return null
    let hex = value.trim().replace(/^#/, '')
    if (/^[0-9a-f]{3}$/i.test(hex)) hex = hex.split('').map((c) => c + c).join('')
    if (!/^[0-9a-f]{6}$/i.test(hex)) return null
    return [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255)
}

// 0 … 1 onto a coarse role, and onto its fine role too when the mode has one (16-bit, high byte first).
const setLevel = (out, roleSet, coarse, fine, value) => {
    if (fine && roleSet.has(fine)) {
        const wide = Math.round(value * 65535)
        out[coarse] = wide >> 8
        out[fine] = wide & 255
    } else {
        out[coarse] = clamp8(value * 255)
    }
}

// What the lamp is told → the desk's role values (0 … 255), for the roles this lamp has. `dimmer` is set even
// when the mode has no dimmer channel: the desk then scales the emitters by it, and so does lampBytes.
function lampRoleValues(roles, inputs) {
    const roleSet = new Set(roles || [])
    const given = inputs || {}
    const out = {}
    const dimmer = unit(given.dimmer)
    if (dimmer !== null) setLevel(out, roleSet, 'dimmer', 'dimmerFine', dimmer)
    const colour = parseColour(given.colour)
    if (colour) {
        ;['r', 'g', 'b'].forEach((role, i) => { if (roleSet.has(role)) out[role] = clamp8(colour[i] * 255) })
    }
    for (const [input, coarse, fine] of [['pan', 'pan', 'panFine'], ['tilt', 'tilt', 'tiltFine']]) {
        const v = unit(given[input])
        if (v !== null && roleSet.has(coarse)) setLevel(out, roleSet, coarse, fine, v)
    }
    for (const role of ['strobe', 'zoom']) {
        const v = unit(given[role])
        if (v !== null && roleSet.has(role)) out[role] = clamp8(v * 255)
    }
    return out
}

// A profile and its role values → the bytes the desk renders for it, in wire order: Engine.render for one
// fixture, no look, no LFO, no effect, the limits at their defaults. `master` is the desk's grand master,
// 0 … 255; it rides the dimmer channel (or the emitters of a lamp without one), never position or control.
function lampBytes(profile, roleValues, { master = 255 } = {}) {
    const roles = profile.roles
    const own = profile.defaults || {}
    const values = {}
    for (const role of roles) values[role] = own[role] != null ? own[role] : ROLE_DEFAULTS[role]
    values.dimmer = own.dimmer != null ? own.dimmer : 255
    Object.assign(values, roleValues || {})
    const lvl = Math.max(0, Math.min(255, Number(master) || 0)) / 255
    const level = values.dimmer != null ? values.dimmer : 255
    const dim = level / 255
    const hasDimmer = roles.includes('dimmer')
    return roles.map((role) => {
        const kind = roleKind(role)
        const val = values[role]
        if (kind === 'level') return clamp8(dim * 255 * lvl)
        if (kind === 'position') return clamp8(val != null ? val : 128)
        const base = val != null ? val : (ROLE_DEFAULTS[role] != null ? ROLE_DEFAULTS[role] : 0)
        if (kind === 'emitter') return clamp8(base * (hasDimmer ? 1 : lvl * dim))
        return clamp8(base)
    })
}

// The whole lamp: its mode and what it is told → { bytes, roles }, or { error } when the mode cannot be sent.
function lampDmx(mode, inputs, options) {
    const profile = lampProfile(mode)
    if (profile.error) return { error: profile.error }
    return { roles: profile.roles, bytes: lampBytes(profile, lampRoleValues(profile.roles, inputs), options) }
}

// Where the bytes go: universe (1-based, as every crew counts) and start address. A lamp whose channels would
// run past 512 is refused, as the desk refuses it ('off-the-end'), rather than cut.
function lampFrame({ mode, universe = 1, address = 1, inputs, master } = {}) {
    const u = Math.round(Number(universe))
    const a = Math.round(Number(address))
    if (!Number.isInteger(u) || u < 1 || u > 32768) return { error: 'the universe is 1 … 32768' }
    if (!Number.isInteger(a) || a < 1 || a > 512) return { error: 'the address is 1 … 512' }
    const out = lampDmx(mode, inputs, { master })
    if (out.error) return out
    if (a + out.bytes.length - 1 > 512) return { error: `${out.bytes.length} channels from ${a} run past 512` }
    return { universe: u, address: a, roles: out.roles, values: out.bytes }
}

export {
    ROLE_DEFAULTS, roleKind, lampProfile, modeFromProfile, lampRoleValues, lampBytes, lampDmx, lampFrame,
}
