/** showState.mjs — the show hub's roles, scenes, claims and control rules. Pure. */
import { clamp, timedLoop } from './safety.mjs'

export const ROLES = ['tablet-game', 'surface', 'laser-desk', 'lights-desk', 'operator', 'viewer']
export const MODES = ['live', 'loop', 'kill']
export const MASTER_MAX = 0.8
export const CLAIM_OUTPUTS = ['laser', 'dmx']
export const normRole = (r) => (r === 'game' ? 'tablet-game' : ROLES.includes(r) ? r : 'viewer')

export const SCENES = {
    game: 'follow the tablet game',
    calm: 'calm lava',
    rising: 'rising',
    eruption: 'eruption',
    safe: 'blackout-safe (dim embers, never dark)'
}

/** A scene's view at `tSec` since it was chosen, or null for "follow the game". */
export const sceneView = (scene, tSec) => {
    switch (scene) {
        case 'calm': return { lava: 0.25 + 0.05 * Math.sin(tSec / 6), burn: 0, mode: 'play' }
        case 'rising': return { lava: 0.15 + 0.8 * clamp(tSec / 60), burn: 0, mode: 'play' }
        case 'eruption': return { lava: 0.95, burn: clamp(1 - (tSec % 2.5) / 0.6), mode: 'play' } // one pulse per 2.5 s (0.4 Hz)
        case 'safe': return { lava: 0.06, burn: 0, mode: 'play' }
        default: return null
    }
}

/** The view every output renders, from the show mode, scene and game. `mixGame(now)` is the silence-faded game view. */
export const effectiveView = ({ mode, scene, sceneT0 }, now, mixGame) => {
    if (mode === 'loop') return { ...timedLoop(now / 1000), source: 'loop' }
    const sv = sceneView(scene, (now - sceneT0) / 1000)
    if (sv) return { ...sv, source: `scene:${scene}` }
    const g = mixGame(now)
    return { ...g, source: g.mode === 'loop' ? 'timed-loop' : g.mode === 'fading' ? 'fading' : 'live' }
}

const HOLDER = /^[\w .-]{1,24}$/
/**
 * Validates an operator control body and returns the changes to apply, or {error}.
 * body: {mode?, master?, scene?, outputs?:{laser|dmx|surface:{on}}, claim?:{output, holder}}
 */
export const parseControl = (body) => {
    if (!body || typeof body !== 'object') return { error: 'body must be an object' }
    const c = {}
    if (body.mode !== undefined) { if (!MODES.includes(body.mode)) return { error: `mode: ${MODES.join('|')}` }; c.mode = body.mode }
    if (body.master !== undefined) { if (!Number.isFinite(Number(body.master))) return { error: 'master: number' }; c.master = clamp(Number(body.master), 0, MASTER_MAX) }
    if (body.scene !== undefined) { if (!(body.scene in SCENES)) return { error: `scene: ${Object.keys(SCENES).join('|')}` }; c.scene = body.scene }
    if (body.outputs !== undefined) {
        c.outputs = {}
        for (const [k, v] of Object.entries(body.outputs || {})) {
            if (!['laser', 'dmx', 'surface'].includes(k)) return { error: `output ${k}` }
            if (typeof v?.on !== 'boolean') return { error: `outputs.${k}.on: boolean` }
            c.outputs[k] = v.on
        }
    }
    if (body.claim !== undefined) {
        const { output, holder } = body.claim || {}
        if (!CLAIM_OUTPUTS.includes(output)) return { error: `claim.output: ${CLAIM_OUTPUTS.join('|')}` }
        if (typeof holder !== 'string' || !HOLDER.test(holder)) return { error: 'claim.holder: 1-24 chars' }
        c.claim = { output, holder: holder === 'none' ? null : holder }
    }
    return c
}
