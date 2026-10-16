// THE DESK'S LOOKS WITH THEIR DMX — a room's designed looks as the values each patched
// fixture needs, through its channel list (real, or ASSUMED for testing).
// docs/architecture/RIG_BUILD.md §18.4. Pure.
//
// Until 2026-09-29 the desk's `rig-<look>` looks carried the fixtures and NO values: every
// channel list was owed (looks.js deskLooks). With a list, the look is written as DMX, so
// the desk really plays it — a console, a real rig and the room drawn from DMX (dmxPose.js)
// all see the same thing — and "DMX wins" never blanks a look the room used to show.
// A fixture with no list still gets none (the look's pose then shows by rule, as before).

import { spotAimDirection } from '../project/viewport/spotLightAim.js'
import { deskLooks, lookPoses, posedEntities, rigLooksOf, flashKindOf } from './looks.js'
import { deskHeadsOf } from './headMotion.js'
import { typeById } from './fixtureTypes.js'
import { encodeDmx } from './dmxDecode.js'
import { lookStrobeHz } from './strobeCap.js'
import { panTiltOfBeam, runningMode, fixturePanOf } from './dmxPose.js'


/**
 * @param {object} rigLooks        components.rigLooks (or null: read from entities)
 * @param {object[]} deskFixtures  GET /light/api/rig?project= fixtures: { key, id, profile, … }
 * @param {{ entities: object[], library: object }} room
 * @returns desk looks (serverXR/src/lighting/looks.js shape), values filled where known
 */
export const deskLooksWithValues = (rigLooks, deskFixtures = [], { entities = [], library } = {}) => {
    const looks = rigLooks || rigLooksOf(entities)
    const shells = deskLooks(looks, deskFixtures)
    const byEntity = new Map(entities.map((e) => [e.id, e]))
    // desk fixture id by lamp (the key is `<project>:<entity id>`): the heads' units are named by it
    const deskIdOf = new Map(deskFixtures.map((f) => [String(f.key || '').split(':').slice(1).join(':'), f.id]))
    return shells.map((shell, i) => {
        const look = looks.looks[i]
        const poses = lookPoses({ entities, library, lookId: look.id, rigLooks: looks })
        // A look's strobes fire at its own strobeHz, clamped to MAX_STROBE_HZ (strobeCap.js); none = the cap.
        const values = {}
        for (const f of deskFixtures) {
            const entityId = String(f.key || '').split(':').slice(1).join(':')
            const e = byEntity.get(entityId)
            const fx = e?.components?.fixture
            if (!fx?.type) continue
            const type = typeById(library, fx.type)
            const mode = runningMode(type, fx.mode, f.profile)
            if (!mode) continue
            const pose = poses.get(entityId)
            // A lamp the look does not name is OUT in that look (a designed look lights
            // what it names; the rest of the rig is dark, as the room drew it).
            // A laser is never lit by a look (cap review A2-1/runtime gate, 2026-09-30): "requiresLaserSignOff"
            // in an intent is text, so the level path itself holds the line. It stays dark unless the look
            // carries an explicit `laserSignedOff: true` — a field nothing writes yet (the sign-off is a
            // certified laser safety officer's, owed), so today every laser in every look is OUT.
            const laserHeld = type?.category === 'laser' && look.laserSignedOff !== true
            const level = pose && !laserHeld ? (pose.level ?? 1) : 0
            const want = { level }
            if (pose?.color) want.colour = pose.color
            if (pose && Array.isArray(type?.pan_tilt_deg?.value)) {
                const { pan, tilt } = panTiltOfBeam(spotAimDirection(pose.rotation), fx.hung === true)
                want.pan = fixturePanOf(pan, fx)
                want.tilt = tilt
            }
            if (pose && flashKindOf(library, fx.type) === 'strobe' && level > 0) want.strobeHz = lookStrobeHz(look)
            // A held laser has no dimmer channel to zero (its list is control/aux/shutter/colour), so the level
            // alone would change nothing: write EVERY channel at 0 — DMX 0 on a laser's control channel is OUT.
            const cell = laserHeld ? Object.fromEntries(mode.channels.map((c) => [c.role, 0])) : encodeDmx(mode.channels, want, type)
            if (Object.keys(cell).length) values[f.id] = cell
        }
        // HEAD MOTION (headMotion.js): the heads this look moves, with what the desk needs per head (order, hung, range). The desk
        // plays the offsets onto the rest pan/tilt above, from the moment the look is fired; the room draws the same offsets.
        // A lamp the look leaves dark (level 0) or a laser is no unit: it takes no part in the fan.
        const heads = deskHeadsOf({
            entities: posedEntities(entities, poses), library, look,
            levelOf: (id) => (typeById(library, byEntity.get(id)?.components?.fixture?.type)?.category === 'laser' ? 0 : (poses.get(id)?.level ?? 0)),
            idOf: (e) => deskIdOf.get(e.id) || null
        })
        return { ...shell, ...(heads ? { heads } : {}), steps: [{ values }], valuesFrom: Object.keys(values).length ? 'channel lists (assumed where marked)' : null }
    })
}

export default deskLooksWithValues
