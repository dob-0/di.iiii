// THE ROOM DRAWN FROM THE DESK'S DMX — every lamp joined to a patched desk fixture whose
// channel list is known (real, or ASSUMED for testing) is drawn from what the desk is
// sending: its head turned by pan/tilt, its colour, its level, its zoom, its shutter.
// docs/architecture/RIG_BUILD.md §18.3. Pure.
//
// PRECEDENCE (§18.4). While the desk is live and a lamp has a patched, decodable profile,
// DMX WINS — attribute by attribute, for what the channel list controls. A look's pose
// (useRigLook.js) is still computed underneath, and whatever the profile does NOT
// control (a PAR's aim, set by hand on its clamp) keeps the look's value. A lamp with no
// decodable profile (a list owed, a type unknown, not patched) is drawn exactly as
// before: the look, else the document. The show's clock never drives a lamp the desk
// drives: the clock only runs where no desk answers.
//
// The fixture's own frame is fixture-lib.mjs's: base on y = 0, beam +Y at home, pan
// about +Y, tilt about the yoke's X, beam = (sin t sin p, cos t, sin t cos p); a hung
// fixture is the same machine turned half a turn about X, its base's front (+Z) toward
// the room's +Z — the default face mountMatrix gives when none is recorded (the rig
// records none; §18.3 says so).

import { capStrobeHz } from './strobeCap.js'
import { spotAimDirection, rotationFromPanTilt } from '../project/viewport/spotLightAim.js'
import { panTiltOfDirection } from './lookRules.js'
import { lensFromMount, mountFromLens } from './lampGeometry.js'
import { modeOf, typeById } from './fixtureTypes.js'
import { decodeDmx } from './dmxDecode.js'
import { flashKindOf } from './looks.js'

const DEG = Math.PI / 180
const HAZE_DEFAULT = 0.4 // spotBeam.js DEFAULT_HAZE

/** The desk's profile name for a (code, mode) — the same rule as serverXR/src/lighting/rigpatch.js profileNameFor. */
export const deskProfileName = (code, mode) => `${code} ${mode}`.replace(/[^A-Za-z0-9 _-]/g, '-').replace(/^[^A-Za-z0-9]+/, '').trim().slice(0, 24)

/**
 * The mode the DESK is running for a lamp: the type's mode whose profile name is the
 * desk fixture's profile (what actually goes out), else the lamp's own mode when its
 * footprint matches. Only a mode with a channel list decodes.
 */
export const runningMode = (type, lampMode, deskProfile) => {
    if (!type) return null
    const byDesk = (type.modes || []).find((m) => deskProfileName(type.code, m.name).toLowerCase() === String(deskProfile || '').toLowerCase())
    const mode = byDesk || modeOf(type, lampMode)
    return mode && Array.isArray(mode.channels) && mode.channels.length ? mode : null
}

/** The beam in the room for a fixture pan/tilt (degrees from home), standing or hung. */
export const beamOfPanTilt = (pan, tilt, hung = false) => {
    const p = (Number(pan) || 0) * DEG
    const t = (Number(tilt) || 0) * DEG
    const x = Math.sin(t) * Math.sin(p)
    const y = Math.cos(t)
    const z = Math.sin(t) * Math.cos(p)
    // Hung: Rx(π)·Ry(π) (fixture-lib mountMatrix with the default face) maps (x, y, z) → (−x, −y, z).
    return hung ? [-x, -y, z] : [x, y, z]
}

const round3 = (v) => Math.round(v * 1000) / 1000

/**
 * The entities with every desk-driven lamp drawn from its DMX.
 * @param {object[]} shown     the entities as the room would draw them (look-posed)
 * @param {object[]} document  the document's own entities (the lamps' true mounts)
 * @param {object[]} fixtures  the mirror's fixtures: { index, profile, values, … }
 * @param {object} library     type library
 * @returns {{ entities: object[], driven: Map<string, object> }}  driven: id → decoded
 */
export const dmxEntities = ({ shown, document, fixtures, library }) => {
    const driven = new Map()
    if (!Array.isArray(fixtures) || !fixtures.length || !Array.isArray(shown)) return { entities: shown, driven }
    const byIndex = new Map()
    for (const f of fixtures) if (Number.isInteger(Number(f?.index)) && !byIndex.has(Number(f.index))) byIndex.set(Number(f.index), f)
    const own = new Map((document || []).map((e) => [e.id, e]))
    let changed = false
    const out = shown.map((e) => {
        const fx = e?.components?.fixture
        if (e?.type !== 'spotLight' || !fx?.type) return e
        const desk = byIndex.get(Number(fx.index))
        if (!desk || !Array.isArray(desk.values)) return e
        const type = typeById(library, fx.type)
        const mode = runningMode(type, fx.mode, desk.profile)
        if (!mode) return e
        const d = decodeDmx(mode.channels, desk.values, type)
        driven.set(e.id, { ...d, mode: mode.name, assumed: mode.assumed || null })
        changed = true
        const base = own.get(e.id) || e
        const baseLight = base.components?.light || {}
        // A view-only note of what the desk says, for the visualiser's readout and its
        // latency probe (never written to the document).
        const components = { ...e.components, rigDmx: { level: d.level, colour: d.colour, shutter: d.shutter, strobeHz: d.strobeHz, pan: d.pan, tilt: d.tilt, zoomDeg: d.zoomDeg, mode: mode.name, assumed: Boolean(mode.assumed) } }

        // Aim: a head the channels move.
        const moving = d.pan != null || d.tilt != null
        if (moving && type) {
            const hung = fx.hung === true
            const docLens = base.components?.transform?.position || [0, 0, 0]
            const docBeam = spotAimDirection(base.components?.transform?.rotation || [0, 0, 0])
            const mount = mountFromLens({ lens: docLens, hung, beam: docBeam, type })
            const dir = beamOfPanTilt(d.pan ?? 0, d.tilt ?? 0, hung)
            const { pan, tilt } = panTiltOfDirection(dir)
            components.transform = {
                ...(e.components.transform || {}),
                position: lensFromMount({ mount, hung, beam: dir, type }).map(round3),
                rotation: rotationFromPanTilt({ pan, tilt })
            }
        }

        const kind = flashKindOf(library, fx.type)
        if (kind) {
            // A strobe or blinder draws as a flash (RigFlashes.jsx), never a cone: its
            // level and rate come from the desk.
            components.rigFlash = { kind, level: d.level, hz: d.shutter === 'strobe' ? capStrobeHz(d.strobeHz) : 0, steady: d.shutter !== 'strobe' }
            return { ...e, components }
        }

        // Light: colour at full, level scaling the authored reach, zoom.
        const light = { ...(e.components.light || baseLight) }
        if (d.colour) light.color = d.colour
        const reach = Number.isFinite(Number(baseLight.intensity)) ? Number(baseLight.intensity) : 1
        let intensity = reach * d.level
        if (d.zoomDeg != null) {
            const zoomed = Math.round((d.zoomDeg / 2) * DEG * 10000) / 10000
            // Zoom spreads the SAME flux over a wider cone: the candela falls by the ratio of
            // the cones' solid angles, Ω = 2π(1 − cos θ) (scripts/place/rig-lib.mjs candelaAt).
            // Keeping it made a Bee Eye zoomed 4° → 60° emit ~220× its light (render audit C).
            const base = Number(baseLight.angle)
            if (base > 0 && zoomed > 0) intensity *= (1 - Math.cos(base)) / (1 - Math.cos(zoomed))
            light.angle = zoomed
        }
        light.intensity = Math.round(intensity * 100) / 100
        components.light = light
        if (e.components.beam || base.components?.beam) {
            const beam = { ...(e.components.beam || base.components.beam) }
            const haze = Number.isFinite(base.components?.beam?.haze) ? base.components.beam.haze : HAZE_DEFAULT
            beam.haze = Math.round(haze * d.level * 1000) / 1000
            if (d.shutter === 'strobe' && d.strobeHz > 0 && d.level > 0) beam.strobeHz = capStrobeHz(d.strobeHz)
            else delete beam.strobeHz
            // prism, honeycomb, frost, gobo — what the desk put in the beam's path
            // (dmxDecode.js opticsAt → src/objectComponents/beamOptics.js)
            if (d.optics) beam.optics = { prism: d.optics.prism, honeycomb: d.optics.honeycomb, frost: d.optics.frost, gobo: d.optics.gobo }
            else delete beam.optics
            components.beam = beam
        }
        components.rigShown = { level: d.level }
        return { ...e, components }
    })
    return { entities: changed ? out : shown, driven }
}

export default dmxEntities

/** The fixture pan/tilt (degrees from home) that sends a lamp's beam along a room direction. */
export const panTiltOfBeam = (dir, hung = false) => {
    const [x, y, z] = hung ? [-dir[0], -dir[1], dir[2]] : dir
    const len = Math.hypot(x, y, z) || 1
    const tilt = Math.acos(Math.max(-1, Math.min(1, y / len))) / DEG
    const flat = Math.hypot(x, z)
    const pan = flat < 1e-9 ? 0 : Math.atan2(x, z) / DEG
    return { pan: Math.round(pan * 100) / 100, tilt: Math.round(tilt * 100) / 100 }
}
