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
 *   2. a group of a LASER TYPE (the list below, plus the project's own) is lit in it (effective level > 0: a group the look
 *      names with no level is at full, as RIG_BUILD.md §15 reads it);
 *   3. a lit group's own name says laser (`laser-cut`, `named-v1-laser-6a/…`) —
 *      looser than 2 on purpose: refusing a cue that only looks like a laser costs
 *      one tap, firing one that is costs an eye.
 *
 * LASER_TYPES is THE laser list of di.iiii — the one the show page, the scene deck
 * (src/rigbuild/sceneDeck/model.js) and the room's laser view (src/rigbuild/laserView.js)
 * all read, through the browser twin src/shared/laserTypes.js (kept equal by
 * src/shared/laserTypes.test.js). It is the fixture library's `category: "laser"` set
 * (src/rigbuild/types/library.json); the server cannot read that file (an installed
 * di.iiii ships no src/), so the ids are listed here and laserMoments.test.js fails
 * the build the moment the library gains a laser this list does not name. `drive`
 * says how the type takes its picture: `dmx` from the desk, `frames` from the Nodes
 * editor's Laser Out (shared/laserFrame.cjs) — the laser view draws the `frames` ones.
 *
 * A PROJECT may carry its own types (`components.rentalList.types`, rental.js
 * libraryWithShow). Each of those with `category: "laser"` is a laser type for that
 * project's looks too (laserTypeIdsOf): refusal is by TYPE, so a laser hung in a group
 * called "roof" is refused like one called "laser-6a" (the safety gap found 2026-10-13,
 * docs/ai/known-fixes.md).
 *
 * Pure, CommonJS (serverXR is CJS); no clock, no I/O.
 */

const LASER_TYPES = Object.freeze([
    Object.freeze({ id: 'up-la40wf', drive: 'dmx' }),
    Object.freeze({ id: 'ext-lc-ultra-mk2', drive: 'frames' })
])
const LASER_TYPE_IDS = Object.freeze(LASER_TYPES.map((t) => t.id))

/** The project-carried types (rentalList.types) of a document, or of its entities. */
const projectTypesOf = (documentOrEntities) => {
    const entities = Array.isArray(documentOrEntities) ? documentOrEntities : documentOrEntities?.entities
    const out = []
    for (const e of Array.isArray(entities) ? entities : []) {
        const types = e?.components?.rentalList?.types
        if (Array.isArray(types)) out.push(...types)
    }
    return out
}

/** The laser type ids for one project: the library's, plus every type it carries with `category: "laser"`. */
const laserTypeIdsOf = (documentOrEntities) => {
    const ids = new Set(LASER_TYPE_IDS)
    for (const t of projectTypesOf(documentOrEntities)) {
        if (t && typeof t.id === 'string' && String(t.category || '').toLowerCase() === 'laser') ids.add(t.id.toLowerCase())
    }
    return ids
}

const SIGN_OFF_MARKER = 'requiresLaserSignOff'
const MARKER_TOKEN = new RegExp(`(?<![A-Za-z0-9_])${SIGN_OFF_MARKER}(?![A-Za-z0-9_])`)

const hasSignOffMarker = (text) => MARKER_TOKEN.test(String(text || ''))

// A look's group key is `<group>/<type>` (looks.js groupKey); a bare `<group>` has no type.
const typeOfKey = (key) => String(key || '').split('/')[1] || ''
const nameOfKey = (key) => String(key || '').split('/')[0] || ''

/** @param {Iterable<string>} [laserIds]  a project's laser ids (laserTypeIdsOf); the library's when absent */
//  (anything else — the index `.filter(isLaserGroupKey)` passes — reads as absent)
const isLaserGroupKey = (key, laserIds) => {
    const type = typeOfKey(key).toLowerCase()
    const hit = laserIds instanceof Set ? laserIds.has(type) : (Array.isArray(laserIds) ? laserIds : LASER_TYPE_IDS).includes(type)
    return hit || /laser/i.test(nameOfKey(key))
}

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
const laserMomentOf = (look, { laserIds } = {}) => {
    if (!look || typeof look !== 'object') return null
    if (hasSignOffMarker(look.intent)) return { reason: 'marker', groups: [] }
    const ids = laserIds instanceof Set || Array.isArray(laserIds) ? laserIds : LASER_TYPE_IDS
    const groups = Object.entries(effectiveLevels(look))
        .filter(([key, level]) => level > 0 && isLaserGroupKey(key, ids))
        .map(([key]) => key)
    return groups.length ? { reason: 'lit', groups } : null
}

module.exports = {
    LASER_TYPES,
    LASER_TYPE_IDS,
    projectTypesOf,
    laserTypeIdsOf,
    SIGN_OFF_MARKER,
    hasSignOffMarker,
    isLaserGroupKey,
    effectiveLevels,
    laserMomentOf
}
