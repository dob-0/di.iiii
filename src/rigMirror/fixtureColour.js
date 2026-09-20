// WHAT A FIXTURE IS EMITTING RIGHT NOW, read back out of the live DMX buffers.
//
// A faithful port of `liveColor(f)` in serverXR/src/lighting/ui/app.js. That file is the
// lighting interface's own plain script — served as-is, nothing exported — so the app
// cannot import it, and the same maths lives here a second time. The pair is held
// together by `fixtureColour.contract.test.js`, which lifts the original out of the
// file text and feeds both the same fixtures and buffers. Change one, the test says so.
//
// Pure: no fetch, no globals. Everything it reads is handed in.
//   fixture   { universe, address, profile }        — address is 1-based, as patched
//   profile   { channels: [role, ...] }             — or pass `roles` directly
//   dmx       { [universe]: number[] }              — what GET /light/api/dmx answers
//   emitters  roleKinds.emitter from /light/api/state (the engine's own list); optional
// Returns { r, g, b, level } — r/g/b 0..255 AFTER the dimmer, level 0..1.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

// r/g/b/warm/cool set the base colour; every other emitter adds on top of it.
const BASE_ROLES = new Set(['r', 'g', 'b', 'warm', 'cool'])

// What each secondary emitter adds to the colour the eye sees.
export const EMITTER_MIX = {
    w: [0.92, 0.92, 0.92], a: [0.95, 0.62, 0.10], y: [0.85, 0.85, 0.00],
    uv: [0.42, 0.00, 0.86], lime: [0.72, 1.00, 0.24]
}

// The interface falls back to a role's swatch colour for an emitter with no mix entry.
// Only emitter roles can ever reach that fallback, so only their swatches are carried.
const ROLE_SWATCH = {
    r: '#e2564a', g: '#4ec95f', b: '#4a7ce2', w: '#ffffff', a: '#f0a94f', y: '#e3d34a',
    uv: '#8a4ae2', lime: '#b6e34a', warm: '#ffd0a0', cool: '#cfe4ff'
}

const emitterMix = (role) => {
    if (EMITTER_MIX[role]) return EMITTER_MIX[role]
    const hex = ROLE_SWATCH[role]
    if (hex) {
        return [
            parseInt(hex.slice(1, 3), 16) / 255,
            parseInt(hex.slice(3, 5), 16) / 255,
            parseInt(hex.slice(5, 7), 16) / 255
        ]
    }
    return [0.8, 0.8, 0.8] // unknown emitter: dim white, so it still shows
}

export function fixtureColour({ fixture, profile, roles, dmx, emitters } = {}) {
    const chans = Array.isArray(roles) ? roles : (Array.isArray(profile?.channels) ? profile.channels : [])
    const buf = (dmx && fixture && dmx[fixture.universe]) || []
    const start = (Number(fixture?.address) || 0) - 1
    const v = {}
    chans.forEach((role, i) => { v[role] = buf[start + i] || 0 })

    let r = 0
    let g = 0
    let b = 0
    if (chans.includes('r')) {
        r = v.r; g = v.g; b = v.b
    } else if (chans.includes('warm')) {
        const w = v.warm / 255
        const c = v.cool / 255
        r = 255 * (w + c * 0.78); g = 255 * (w * 0.80 + c * 0.90); b = 255 * (w * 0.52 + c)
    } else {
        // No colour channels at all (a plain dimmer, a bare pan/tilt): white, so the
        // dimmer alone decides what is seen.
        r = g = b = 255
    }

    const emitterRoles = Array.isArray(emitters) && emitters.length ? emitters : Object.keys(EMITTER_MIX)
    for (const role of emitterRoles) {
        if (BASE_ROLES.has(role)) continue // already in the base colour above
        const lvl = v[role] || 0
        if (!lvl) continue
        const mix = emitterMix(role)
        r += lvl * mix[0]; g += lvl * mix[1]; b += lvl * mix[2]
    }
    r = clamp(r, 0, 255); g = clamp(g, 0, 255); b = clamp(b, 0, 255)

    // The dimmer-less case: a fixture with no dimmer channel is as bright as its emitters.
    const dim = chans.includes('dimmer') ? (v.dimmer || 0) / 255 : 1
    const level = Math.max(r, g, b) / 255 * dim
    return { r: r * dim, g: g * dim, b: b * dim, level }
}

export default fixtureColour
