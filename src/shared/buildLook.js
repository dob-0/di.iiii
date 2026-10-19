// THE ONE FUNCTION that turns a scene's source (what a person edits) into the look's built per-unit colours and levels.
// scripts/rigbuild/epic-build.mjs (rig file -> project) and the Studio's scene editor (a change -> new look) both call it, so a scene
// edited in the Studio is built by exactly the rule the build script uses (owner 2026-10-15: "what we have needs to be in di.iiii").
// Pure, no imports. RIG_BUILD.md "Editing a scene in the Studio".
//
//   source   { parts: { <part>: [hex|null, level 0..1] }, laser_colour?, motion?, heads?, desk_caps? } — a part left out is OFF
//   rigParts { <part>: [unitId…] } — which units belong to which part (rigParts on the show entity)
//   units    [{ id, key, colour, aim? }] — key = the unit's group key in the look (`${position}/${type}`), colour = its own base
//            colour, aim = the aim the look already gives that unit (kept as it is: each unit its own aim)
// → { colours: {key: hex}, levels: {key: 0..1}, aims: {key: aim} }
//
// A unit that no part lists is its own part, named by its id (the editor then edits per unit).
const FALLBACK_COLOUR = '#e8e4dc'
const LASER_ID = /^rig-laser-(.+)$/

// a laser's level is the part's (a desk cap, MOXIR v2 spread 2026-10-09); a missing or odd number holds 1.0
const levelOf = (pair) => (Number.isFinite(Number(pair?.[1])) ? Math.min(1, Math.max(0, Number(pair[1]))) : 1)

export const partOfUnit = (rigParts) => {
    const map = new Map()
    for (const [part, ids] of Object.entries(rigParts || {})) for (const id of ids || []) map.set(id, part)
    return map
}

export function buildLook(source, rigParts, units) {
    const parts = source?.parts || {}
    const partOf = partOfUnit(rigParts)
    const colours = {}
    const levels = {}
    const aims = {}
    for (const u of units) {
        const part = partOf.get(u.id) || u.id
        const laser = LASER_ID.exec(u.id)
        let on = null
        if (part === 'laser' && laser) {
            // a laser keeps its cube's own colour; a look that names the lasers' colour (`laser_colour`, ledger N559) gives it to every line
            on = parts.laser ? [source.laser_colour || null, levelOf(parts.laser)] : (parts.cube6a && laser[1] === '6a' ? [null, levelOf(parts.cube6a)] : null)
        } else on = parts[part] || null
        colours[u.key] = ((on && on[0]) || u.colour || FALLBACK_COLOUR).toLowerCase()
        levels[u.key] = on ? on[1] : 0
        if (u.aim) aims[u.key] = u.aim
    }
    return { colours, levels, aims }
}

// The source of a look as the look keeps it (schema: normalizeRigLooks) — only what a person set.
export const SOURCE_FIELDS = ['parts', 'motion', 'heads', 'laser_colour', 'desk_caps']
export const sourceOf = (look) => Object.fromEntries(SOURCE_FIELDS.filter((k) => look?.[k] != null).map((k) => [k, look[k]]))
