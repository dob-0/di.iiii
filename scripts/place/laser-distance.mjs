// The laser audience-distance rules, in ONE place (2026-10-13): the build (rig-lib buildRig refuses a
// laser that breaks them) and the tests (versions.test.js, laserDistance.test.js) read this module, so
// the rule and its check cannot drift apart. Pure arithmetic: no three, no hall, no file reads.
import { spotAimDirection } from '../../src/project/viewport/spotLightAim.js'

// A lamp whose laser path dips under this, anywhere over the floor, is refused.
// 3 m is the vertical separation commonly required between an audience and a
// show laser's beams (e.g. the US FDA laser-light-show variance conditions);
// it is a floor for the picture, NOT a safety assessment.
export const LASER_MIN_HEIGHT_M = 3

// The owner's stricter "hand rule" (2026-10-12, moxir_v2_7_lines.py): the 3 m is counted from a raised hand, so the
// lowest beam point over any standing area is LASER_MIN_HEIGHT_M + a hand raised to LASER_HAND_REACH_M. Derived, never retyped.
export const LASER_HAND_REACH_M = 2.4
export const LASER_HAND_RULE_M = LASER_MIN_HEIGHT_M + LASER_HAND_REACH_M

// Every laser model, not only the rental `laser`: the LaserCube (2026-10-04) got its own model kind,
// and the laser rules — no beam downward, none under the minimum height, none into crane steel —
// silently stopped applying to it (audit follow-up, 2026-10-05).
export const LASER_FIXTURES = new Set(['laser', 'lasercube'])

/** Is this group (with its class) a laser? The one test the build and the checks share. */
export const isLaserGroup = (group, cls) => group.class === 'laser' || LASER_FIXTURES.has(cls?.fixture)

/**
 * Refuse a laser aim that could cross the audience plane: it must rise (or
 * stay level) from where it is hung, and be hung at least LASER_MIN_HEIGHT_M
 * up — so every point of its path over the floor is at least that high.
 */
export const checkLaser = (from, to) => {
    if (from[1] < LASER_MIN_HEIGHT_M) return `hung at ${from[1].toFixed(2)} m, under ${LASER_MIN_HEIGHT_M} m`
    if (to[1] < from[1]) return `aimed downward (${from[1].toFixed(2)} m -> ${to[1].toFixed(2)} m)`
    return null
}

/**
 * The laser lamps of a built rig: entities `${prefix}${group.id}-NN` whose group is a laser.
 * Matched on the whole id (group id + two-digit rank), so a group named `laser` never claims
 * the lamps of `laser-cut`.
 */
export const laserLampsOf = (entities, rig, prefix) => {
    const lasers = (rig.groups || []).filter((g) => isLaserGroup(g, rig.classes?.[g.class]))
    return entities.filter((e) => e.type === 'spotLight' && lasers.some((g) => e.id.startsWith(`${prefix}${g.id}-`) && /^\d{2,}$/.test(e.id.slice(`${prefix}${g.id}-`.length))))
}

/** What is wrong with a built laser lamp, by the same rule the build refuses with; null when nothing. */
export const laserLampFailure = (e) => {
    const from = e.components.transform.position
    const dir = spotAimDirection(e.components.transform.rotation)
    // the height by checkLaser itself; the rise read off the aim (dir y), not a sum that could round to level
    const why = from[1] < LASER_MIN_HEIGHT_M ? checkLaser(from, from) : dir[1] < 0 ? `aimed downward (dir y ${dir[1].toFixed(4)})` : null
    return why ? `${e.id}: ${why}` : null
}

/** Every failure among a built rig's laser lamps (empty when every one is ≥ 3 m up and rising). */
export const laserDistanceFailures = (lamps) => lamps.map(laserLampFailure).filter(Boolean)
