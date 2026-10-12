/**
 * WHICH LOOKS ARE LASER MOMENTS — one rule, read by the server before anything
 * outside the operator's own tools may fire a cue.
 *
 * The show page (/{space}/show/{project}, serverXR/src/routes/showRoutes.js) lets
 * the people in a space choose the cue. It must never arm or fire a laser: a Class 4
 * laser needs a certified laser safety officer's sign-off first, and that sign-off
 * lives with the operator (docs/architecture/RIG_BUILD.md §24). So the server asks
 * this file, per cue, "would this look light a laser?" and refuses the cue when the
 * answer is anything but a clear no.
 *
 * A look is a laser moment when ANY of these holds:
 *   1. its intent carries the sign-off marker `requiresLaserSignOff` (the plain text
 *      scripts/rigbuild/ground-scenes.mjs writes into a laser look — the same whole
 *      token src/rigbuild/sceneDeck/model.js reads);
 *   2. a group of a LASER TYPE is lit in it (effective level > 0: a group the look
 *      names with no level is at full, as RIG_BUILD.md §15 reads it);
 *   3. a lit group's own name says laser (`laser-cut`, `named-v1-laser-6a/…`) —
 *      looser than 2 on purpose: refusing a cue that only looks like a laser costs
 *      one tap, firing one that is costs an eye.
 *
 * LASER_TYPE_IDS is the fixture library's `category: "laser"` set
 * (src/rigbuild/types/moxir.json). The server cannot read that file (an installed
 * di.iiii ships no src/), so the ids are listed here and laserMoments.test.js fails
 * the build the moment the library gains a laser this list does not name.
 *
 * Pure, CommonJS (serverXR is CJS); no clock, no I/O.
 */

const LASER_TYPE_IDS = Object.freeze(['up-la40wf', 'ext-lc-ultra-mk2'])

const SIGN_OFF_MARKER = 'requiresLaserSignOff'
const MARKER_TOKEN = new RegExp(`(?<![A-Za-z0-9_])${SIGN_OFF_MARKER}(?![A-Za-z0-9_])`)

const hasSignOffMarker = (text) => MARKER_TOKEN.test(String(text || ''))

// A look's group key is `<group>/<type>` (looks.js groupKey); a bare `<group>` has no type.
const typeOfKey = (key) => String(key || '').split('/')[1] || ''
const nameOfKey = (key) => String(key || '').split('/')[0] || ''

const isLaserGroupKey = (key) => LASER_TYPE_IDS.includes(typeOfKey(key).toLowerCase()) || /laser/i.test(nameOfKey(key))

/** Every group the look names, at its effective level (absent level = full). */
const effectiveLevels = (look) => {
    const keys = new Set([
        ...Object.keys(look?.aims || {}),
        ...Object.keys(look?.colours || {}),
        ...Object.keys(look?.levels || {})
    ])
    const out = {}
    for (const key of keys) {
        const level = look?.levels?.[key]
        out[key] = Number.isFinite(level) ? level : 1
    }
    return out
}

/**
 * @returns {null | { reason: 'marker' | 'lit', groups: string[] }} null = no laser in this look
 */
const laserMomentOf = (look) => {
    if (!look || typeof look !== 'object') return null
    if (hasSignOffMarker(look.intent)) return { reason: 'marker', groups: [] }
    const groups = Object.entries(effectiveLevels(look))
        .filter(([key, level]) => level > 0 && isLaserGroupKey(key))
        .map(([key]) => key)
    return groups.length ? { reason: 'lit', groups } : null
}

module.exports = {
    LASER_TYPE_IDS,
    SIGN_OFF_MARKER,
    hasSignOffMarker,
    isLaserGroupKey,
    effectiveLevels,
    laserMomentOf
}
