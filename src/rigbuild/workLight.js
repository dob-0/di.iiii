// WORK LIGHT in the Studio (owner 2026-10-16 18:2x: "I want to turn on work light and half of devices not turn on").
// The Scenes panel's "Work light" promises "plain light to work by". Until now it drew NO look, so every lamp showed
// the light last saved on it — for a room rested on a red look, 28 of 40 washes and 12 of 18 beams in a dim red that
// reads as off in a dark hall. Now every lamp (an entity with a fixture type and a light) is drawn WHITE at its own
// saved strength, every laser line steady (its frames do not play), and no scene's baked floor glow is drawn. A view only: the document, the desk and the show are untouched. Pure.
import { isWashEntityId } from './looks.js'

export const WORK_LIGHT_COLOUR = '#ffffff'

export function workLightEntities(entities) {
    if (!Array.isArray(entities)) return entities
    return entities.map((e) => {
        const c = e?.components
        // A baked floor glow belongs to a scene (looks.js washes): under work light there is no scene, so it is not drawn.
        if (isWashEntityId(e?.id)) return { ...e, components: { ...c, appearance: { ...(c?.appearance || {}), opacity: 0 }, runtime: { ...(c?.runtime || {}), visible: false } } }
        if (!c?.fixture?.type || !c.light) return e
        // A laser line that plays frames in time (LaserCube lines, laserLine.js) shines as one steady line: no frame plays.
        const laser = c.beam?.laser
        const beam = laser && typeof laser === 'object' && laser.frames ? { ...c.beam, laser: { ...laser, frames: null } } : c.beam
        if (c.light.color === WORK_LIGHT_COLOUR && beam === c.beam) return e
        return { ...e, components: { ...c, light: { ...c.light, color: WORK_LIGHT_COLOUR }, ...(beam ? { beam } : {}) } }
    })
}
