// The light vocabulary — kinds, intensity stops, and the defaults a new lamp is
// seeded from. It lived in algovrithm's palette.js, which made the platform's
// light model depend on one artwork's colours; the values are unchanged.
//
/**
 * Two kinds of light, not eight.
 *
 * three.js offers point, spot, directional, hemisphere, area. Most of them are
 * meaningless in a fogged room with no objects in it — a directional light has
 * no position to place and nothing to cast onto, and a spot needs geometry to
 * land on before its cone is visible at all. What this piece actually does with
 * light is two things, so those are the two on offer:
 *
 * - `lamp`  — lights the surfaces near it. You see what it hits, not the light.
 * - `glow`  — the same lamp with a visible haze volume around the source, so
 *             the light itself is a thing in the room. This is the Turrell
 *             move, and it is the one that needs fog to work.
 *
 * Anything more specific (the tunnel's travelling strobe) stays a sequence's
 * own code. The panel is for placing light in a room, not for animating it.
 */
export const LIGHT_KINDS = ['lamp', 'glow']

/**
 * Named intensity stops, in three.js candela.
 *
 * Since r155 lighting is physically based, so intensity and `decay` are coupled
 * and the numbers are not intuitive by eye — 1 is not "half of 2" at three
 * metres. These stops are lifted from what the piece already uses (the tunnel
 * strobe runs 3 → 14) so they land in a range known to work at this scale,
 * rather than from the docs.
 *
 * `decay` is 1.4 rather than the physical 2 for the same reason it is in
 * WhiteTunnel: true inverse-square falls off so fast in a room this size that a
 * lamp lights a two-metre bubble and nothing else, which reads as a bug.
 */
export const LIGHT_INTENSITIES = { glow: 2, soft: 5, lit: 9, strobe: 14 }

export const LIGHT_DEFAULTS = {
    kind: 'lamp',
    // A neutral cool white-blue. Was PALETTE.skyBlue when this vocabulary
    // lived inside algovrithm — same value, kept so no existing row moves,
    // but the platform owns a default rather than borrowing one artwork's.
    color: '#9CC2DE',
    intensity: LIGHT_INTENSITIES.soft,
    // Metres. Beyond this the lamp contributes nothing, which keeps one light
    // in one sequence from washing the whole installation in the outside view.
    distance: 40,
    decay: 1.4,
    // Head height, slightly forward. A light at the origin sits inside the
    // viewer and lights nothing they can see.
    position: [0, 1.6, -3],
    // Only read for `glow`: the radius of the visible volume. Independent of
    // `distance` — how far the light REACHES and how big it LOOKS are different
    // questions, and tying them makes a big soft light impossible.
    radius: 1.2
}

import { clipProgress, fadeEnvelope } from './clock.js'

// The ROOM as row data: what colour the air is, how much of it you can see
// without a lamp, and which lamps are in it.
//
// Colour and fog were already authorable (`backdrop` on the edit-list row);
// this file adds the other two. `ambient` is the fill level — the thing every
// sequence used to hardcode for itself — and `lights` is a list of placeable
// lamps. Both are data on the row for the same reason timing is: a lighting
// decision should be a number in the edit list that the director panel can
// drag, not a JSX literal buried three files deep that only a rebuild reveals.
//
// Pure on purpose — no React, no three.js. The blend is the part that is easy
// to get subtly wrong (see the fallbacks below), so it has to be testable
// without mounting a canvas.

// Weighting fade width. MOVED HERE FROM Backdrop.jsx, which used to own it.
//
// The room's colour, its fog and its ambient level are three properties of one
// thing, and they must hand over on the SAME curve — a room whose colour has
// finished crossing to the next scene while its fill light is still on the
// previous one is two rooms at once. Keeping one constant and one weighting
// function is how that stays true; two copies of this drift the first time
// somebody tunes one of them.
export const BLEND_FADE = 0.34

/**
 * What a row's fill level is when it does not say.
 *
 * 0.16 is the assembly room's level — the middle of the range the piece
 * already used (0.1 in the field, 0.55 in the chamber), so an unauthored row
 * lands somewhere plausible rather than at 0. Zero would be the "safer"
 * default and is the wrong one: an unlit row with no lamps in it renders pure
 * black, which reads as a broken scene rather than as a dark one.
 */
export const DEFAULT_AMBIENT = 0.16

/** Rows without a `lights` array simply have none. Absent is the normal case. */
export const rowLights = (sequence) => (
    Array.isArray(sequence?.lights) ? sequence.lights : []
)

const finite = (value, fallback) => (Number.isFinite(value) ? value : fallback)

/**
 * Fill a row's light in from LIGHT_DEFAULTS.
 *
 * Rows are hand-typed source as often as they are panel output, and a light
 * missing `decay` should be a lamp with the house decay, not a `NaN` that
 * three.js turns into an unlit scene with no error anywhere.
 */
export const resolveLight = (light) => {
    const source = light ?? {}
    const position = Array.isArray(source.position) ? source.position : LIGHT_DEFAULTS.position
    return {
        id: source.id,
        kind: LIGHT_KINDS.includes(source.kind) ? source.kind : LIGHT_DEFAULTS.kind,
        color: source.color ?? LIGHT_DEFAULTS.color,
        intensity: finite(source.intensity, LIGHT_DEFAULTS.intensity),
        // Copied, never shared. Two lights holding the same array is invisible
        // until a drag writes through one of them and moves both.
        position: [
            finite(position[0], LIGHT_DEFAULTS.position[0]),
            finite(position[1], LIGHT_DEFAULTS.position[1]),
            finite(position[2], LIGHT_DEFAULTS.position[2])
        ],
        distance: finite(source.distance, LIGHT_DEFAULTS.distance),
        decay: finite(source.decay, LIGHT_DEFAULTS.decay),
        radius: finite(source.radius, LIGHT_DEFAULTS.radius)
    }
}

// Unique WITHIN the row, not across the piece: a light's identity is only ever
// read alongside the row that owns it (see lightObjectName), and per-row
// numbering keeps the emitted source readable — `light-1` in every row rather
// than `light-17` in the last one.
const nextLightId = (lights) => {
    const used = new Set(lights.map((light) => light.id))
    let index = 1
    while (used.has(`light-${index}`)) index += 1
    return `light-${index}`
}

/**
 * Add a lamp to a row, seeded from LIGHT_DEFAULTS.
 *
 * Seeded rather than blank because the useful default is a light you can
 * already see: an author who adds a lamp and gets nothing has no way to tell a
 * placement mistake from a broken feature. LIGHT_DEFAULTS puts it at head
 * height, slightly in front, at the "soft" stop.
 */
export const addLight = (sequences, rowId, seed = {}) =>
    sequences.map((sequence) => {
        if (sequence.id !== rowId) return sequence
        const lights = rowLights(sequence)
        return {
            ...sequence,
            lights: [
                ...lights,
                { ...resolveLight({ ...LIGHT_DEFAULTS, ...seed }), id: nextLightId(lights) }
            ]
        }
    })

export const removeLight = (sequences, rowId, lightId) =>
    sequences.map((sequence) => {
        if (sequence.id !== rowId) return sequence
        const lights = rowLights(sequence)
        if (!lights.some((light) => light.id === lightId)) return sequence
        return { ...sequence, lights: lights.filter((light) => light.id !== lightId) }
    })

/** Patch one field of one light. Every panel control and the gizmo go through this. */
export const setLightValue = (sequences, rowId, lightId, key, value) =>
    sequences.map((sequence) => {
        if (sequence.id !== rowId) return sequence
        const lights = rowLights(sequence)
        if (!lights.some((light) => light.id === lightId)) return sequence
        return {
            ...sequence,
            lights: lights.map((light) => (
                light.id === lightId ? { ...light, [key]: value } : light
            ))
        }
    })

/**
 * Patch one field of the row's world (`color`, `fogNear`, `fogFar`, `ambient`).
 *
 * A row with no `backdrop` is left alone rather than given one. Asset clips
 * deliberately have no opinion about the room — see addAssetClip — and quietly
 * inventing a world for one would give it a vote in the blend and dim the room
 * for as long as the clip is on screen.
 */
export const setWorldValue = (sequences, rowId, key, value) =>
    sequences.map((sequence) => {
        if (sequence.id !== rowId || !sequence.backdrop) return sequence
        return { ...sequence, backdrop: { ...sequence.backdrop, [key]: value } }
    })

// With no row active, hold the world of the nearest one — the first while the
// playhead is still before the piece, the last once it is past the end.
// Falling back to sequences[0] unconditionally snapped the room back to the
// opening the instant the playhead cleared the final window.
//
// Single pass rather than sorting: this runs inside useFrame, and the director
// panel hands over a draft edit list in whatever order the author's last drag
// left it — so "first" and "last" have to be found by time, not by position.
const nearestWorldRow = (playheadSec, sequences) => {
    const rows = sequences.filter((sequence) => sequence.backdrop)
    if (!rows.length) return null

    let earliest = rows[0]
    let latestStarted = null
    for (const sequence of rows) {
        if (sequence.startSec < earliest.startSec) earliest = sequence
        if (
            sequence.startSec <= playheadSec
            && (latestStarted === null || sequence.startSec > latestStarted.startSec)
        ) {
            latestStarted = sequence
        }
    }

    return latestStarted ?? earliest
}

/**
 * Who gets a say in the room right now, and how much.
 *
 * THE one weighting for every world property. Backdrop.jsx used to own this
 * inline; it now imports it, so colour, fog and ambient are guaranteed to be
 * mid-handover by the same amount at the same moment.
 *
 * Only rows that declare a `backdrop` get a vote. An asset clip placed in
 * front of an existing scene has no opinion about the room, and counting it in
 * the total would divide the real worlds' share down — the room would dim for
 * as long as the asset was on screen.
 *
 * Returns `{ sequence, weight, share }[]`, empty only when nothing in the list
 * declares a world at all.
 */
export const worldWeights = (playheadSec, sequences = []) => {
    const active = []
    for (const sequence of sequences) {
        if (!sequence.backdrop) continue
        const progress = clipProgress(playheadSec, sequence.startSec, sequence.endSec)
        if (progress === null) continue
        active.push({ sequence, weight: fadeEnvelope(progress, BLEND_FADE) })
    }

    if (!active.length) {
        const nearest = nearestWorldRow(playheadSec, sequences)
        return nearest ? [{ sequence: nearest, weight: 1, share: 1 }] : []
    }

    let total = active.reduce((sum, entry) => sum + entry.weight, 0)
    // At the very start and very end every envelope is ~0 (they are all
    // mid-fade), which would divide by zero. Fall back to the first active
    // sequence — at t=0 that is correctly the opening sequence.
    if (total < 1e-3) {
        active[0].weight = 1
        total = 1
    }

    return active.map((entry) => ({ ...entry, share: entry.weight / total }))
}

/**
 * How much fill light the room has right now — the blend of every active row's
 * `ambient`, on the same curve as its colour and fog.
 *
 * Rendered ONCE, at the experience level, never per row: ambient lights sum,
 * so four overlapping rows each adding their own is four times the fill and a
 * flat white-out at every handover.
 */
export const resolveAmbient = (playheadSec, sequences = []) => {
    const weights = worldWeights(playheadSec, sequences)
    if (!weights.length) return DEFAULT_AMBIENT

    return weights.reduce(
        (sum, { sequence, share }) => sum + finite(sequence.backdrop?.ambient, DEFAULT_AMBIENT) * share,
        0
    )
}

// ---- finding a light in the scene -------------------------------------
//
// The gizmo resolves its target with scene.getObjectByName, the same way it
// finds a sequence group: lights mount and unmount as the playhead crosses
// their row's window, so a name lookup survives what a threaded ref would not.
// Row and light id are both in the name because a light id is only unique
// within its row.

const LIGHT_NAME_PREFIX = 'light'

export const lightObjectName = (rowId, lightId) => `${LIGHT_NAME_PREFIX}:${rowId}:${lightId}`

/**
 * The inverse — `{ rowId, lightId }`, or null for anything that is not a light.
 *
 * Splitting on ':' is safe because neither id can contain one: sequence ids are
 * authored as slugs (`s01-white-tunnel`, `asset-<id>-2`) and light ids are
 * generated (`light-1`).
 */
export const parseLightName = (name) => {
    if (typeof name !== 'string') return null
    const parts = name.split(':')
    if (parts.length !== 3 || parts[0] !== LIGHT_NAME_PREFIX) return null
    return { rowId: parts[1], lightId: parts[2] }
}

export const isLightName = (name) => parseLightName(name) !== null
