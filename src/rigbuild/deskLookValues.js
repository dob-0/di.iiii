// THE DESK'S LOOKS WITH THEIR DMX — a room's designed looks as the values each patched
// fixture needs, through its channel list (real, or ASSUMED for testing).
// docs/architecture/RIG_BUILD.md §19.4. Pure.
//
// Until 2026-09-29 the desk's `rig-<look>` looks carried the fixtures and NO values: every
// channel list was owed (looks.js deskLooks). With a list, the look is written as DMX, so
// the desk really plays it — a console, a real rig and the room drawn from DMX (dmxPose.js)
// all see the same thing — and "DMX wins" never blanks a look the room used to show.
// A fixture with no list still gets none (the look's pose then shows by rule, as before).

import { spotAimDirection } from '../project/viewport/spotLightAim.js'
import { deskLooks, lookPoses, rigLooksOf, flashKindOf } from './looks.js'
import { typeById } from './fixtureTypes.js'
import { encodeDmx } from './dmxDecode.js'
import { panTiltOfBeam, runningMode } from './dmxPose.js'

// A look's strobes fire at the room's own flash rate (rigFlash.js STROBE_HZ).
const LOOK_STROBE_HZ = 10

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
    return shells.map((shell, i) => {
        const look = looks.looks[i]
        const poses = lookPoses({ entities, library, lookId: look.id, rigLooks: looks })
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
            const level = pose ? (pose.level ?? 1) : 0
            const want = { level }
            if (pose?.color) want.colour = pose.color
            if (pose && Array.isArray(type?.pan_tilt_deg?.value)) {
                const { pan, tilt } = panTiltOfBeam(spotAimDirection(pose.rotation), fx.hung === true)
                want.pan = pan
                want.tilt = tilt
            }
            if (pose && flashKindOf(library, fx.type) === 'strobe' && level > 0) want.strobeHz = LOOK_STROBE_HZ
            const cell = encodeDmx(mode.channels, want, type)
            if (Object.keys(cell).length) values[f.id] = cell
        }
        return { ...shell, steps: [{ values }], valuesFrom: Object.keys(values).length ? 'channel lists (assumed where marked)' : null }
    })
}

export default deskLooksWithValues
