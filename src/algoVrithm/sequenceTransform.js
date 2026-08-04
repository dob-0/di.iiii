// Where a sequence sits in the room, and how big it is.
//
// Until now every sequence hard-coded its own placement — PixelField's disc is
// centred on the origin because its geometry says so, and Assembly's panel is
// 1.4m away because a constant at the top of the file says so. That is fine
// while a sequence is the only thing on screen and fatal the moment two have to
// be composed against each other, because "move it a bit left" means editing
// geometry.
//
// A transform on the edit list row lifts placement out of the sequence's code
// and into data: the same move as timing in seconds rather than frame counts.
// The sequence keeps owning what it LOOKS like; the edit list owns where it is.
//
// Deliberately NOT in editList.js — that file is being changed elsewhere for
// asset clips, and placement is a separate concern with its own tests.
//
// Asset clips keep their own polar placement (see assetPlacement.js); this
// file owns the cartesian transform for hand-written sequences and the
// translation between the two, so the drag handles can drive either.

import {
    placementPosition,
    placementRotation,
    positionToPlacement,
    resolvePlacement,
    scalePlacementSize
} from './assetPlacement.js'

// Identity. A sequence with no transform renders exactly where its own code
// puts it, so adding this file changes nothing about the existing piece.
export const IDENTITY_TRANSFORM = Object.freeze({
    position: Object.freeze([0, 0, 0]),
    rotation: Object.freeze([0, 0, 0]),
    scale: 1
})

// Below this a sequence is a dot and can never be found again by dragging; a
// scale of 0 also collapses the matrix and makes normals undefined.
export const MIN_SCALE = 0.01
export const MAX_SCALE = 100

export const clampScale = (scale) =>
    Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number.isFinite(scale) ? scale : 1))

// Always a fresh array, never the frozen identity itself: three.js writes
// through prop arrays in places, and handing back the module constant would
// throw in strict mode — from inside a render, where it is painful to trace.
const asTriple = (value, fallback) => {
    const copy = () => [fallback[0], fallback[1], fallback[2]]
    if (!Array.isArray(value) || value.length !== 3) return copy()
    // A single NaN from a dragged input would silently remove the whole group
    // from the scene — three.js propagates it through the matrix and the object
    // stops being rendered with no error anywhere.
    return value.every((n) => Number.isFinite(n)) ? [value[0], value[1], value[2]] : copy()
}

/**
 * A sequence's transform, filled in from the identity.
 *
 * Always returns a complete, safe transform: callers render `<group>` props
 * straight from this rather than each guarding for a missing field.
 */
export const resolveTransform = (sequence = {}) => {
    const transform = sequence.transform ?? {}
    return {
        position: asTriple(transform.position, IDENTITY_TRANSFORM.position),
        rotation: asTriple(transform.rotation, IDENTITY_TRANSFORM.rotation),
        scale: clampScale(transform.scale ?? IDENTITY_TRANSFORM.scale)
    }
}

/** True when a sequence would render identically without its transform. */
export const isIdentityTransform = (transform) => {
    const { position, rotation, scale } = resolveTransform({ transform })
    return scale === 1
        && position.every((n) => n === 0)
        && rotation.every((n) => n === 0)
}

/** Immutable update of one sequence's transform, by id. */
export const setTransform = (sequences, id, patch) =>
    sequences.map((sequence) => {
        if (sequence.id !== id) return sequence
        const current = resolveTransform(sequence)
        const next = resolveTransform({ transform: { ...current, ...patch } })
        // Dropping an identity transform back to undefined keeps the copied-out
        // source clean — a row that was never moved should not gain three lines
        // of zeroes just because the panel was opened.
        if (isIdentityTransform(next)) {
            const { transform, ...rest } = sequence
            return rest
        }
        return { ...sequence, transform: next }
    })

/** Nudge a sequence along one axis — the arrow-key move. */
export const moveTransform = (sequences, id, axis, delta) => {
    const index = { x: 0, y: 1, z: 2 }[axis]
    if (index === undefined) return sequences
    return sequences.map((sequence) => {
        if (sequence.id !== id) return sequence
        const position = [...resolveTransform(sequence).position]
        position[index] = roundPlacement(position[index] + delta)
        return setTransform([sequence], id, { position })[0]
    })
}

/** Multiplicative, so a step feels the same at any size. */
export const scaleTransformBy = (sequences, id, factor) =>
    sequences.map((sequence) => {
        if (sequence.id !== id) return sequence
        const { scale } = resolveTransform(sequence)
        return setTransform([sequence], id, { scale: roundPlacement(scale * factor) })[0]
    })

// Placement is judged by eye, not by measurement — three decimals is well past
// what anyone can see at 1.6m and stops the panel showing 0.7000000000000001.
export const roundPlacement = (value) => Math.round(value * 1000) / 1000

/**
 * The group props for a row, whichever placement system it uses.
 *
 * Asset clips are placed polar (distance / size / height / bearing) because
 * those are the four numbers the director panel offers and the ones an author
 * can reason about without a transform matrix. Hand-written sequences are
 * placed cartesian, because their geometry is authored in world space to begin
 * with.
 *
 * One row never uses both. Two systems editing one object is how you get a
 * gizmo and a number field disagreeing about where something is.
 */
export const resolveGroupTransform = (sequence = {}) => {
    if (!sequence.asset) return resolveTransform(sequence)

    const placement = resolvePlacement(sequence.asset)
    return {
        position: placementPosition(placement),
        rotation: placementRotation(placement),
        // Size is baked into the asset's own geometry, so the group stays at 1
        // — otherwise scaling would apply twice.
        scale: 1
    }
}

/** True when the drag handles should write polar numbers rather than a transform. */
export const usesPlacement = (sequence) => Boolean(sequence?.asset)

/**
 * Turn a dragged group back into an edit-list patch.
 *
 * Returns the shape the caller should merge: `{ kind: 'placement', asset }` for
 * an asset clip, `{ kind: 'transform', transform }` for a written sequence.
 * Keeping the branch here rather than in the component means the rule that a
 * row uses exactly one placement system is stated once.
 */
export const patchFromGizmo = (sequence, { position, rotation, scale }, baseline = sequence) => {
    if (!usesPlacement(sequence)) {
        // A written sequence's scale IS the group's scale, so the gizmo's value
        // is already absolute and can be written straight through.
        return { kind: 'transform', transform: { position, rotation, scale } }
    }

    const placement = resolvePlacement(sequence.asset)
    // `size` is metres, but the gizmo reports a factor against the scale the
    // group had when the drag started — always 1 for an asset. Multiplying the
    // LIVE size by that factor compounds every frame of the drag and the asset
    // runs away to the size clamp; the size at drag start is the fixed point
    // the factor is actually relative to.
    const baseSize = resolvePlacement(baseline?.asset ?? sequence.asset).size
    const next = positionToPlacement(position, placement)
    // Bearing already rotates the group, so a rotate drag reports the same
    // angle back. Folding Y rotation into bearing keeps the two from fighting;
    // X and Z are dropped because an asset that is not upright and facing the
    // viewer is a mistake, not a choice.
    const turned = next.bearing + (rotation?.[1] ?? 0) * (180 / Math.PI)

    return {
        kind: 'placement',
        asset: {
            ...sequence.asset,
            ...next,
            size: scalePlacementSize(baseSize, scale),
            bearing: roundPlacement(((turned + 540) % 360) - 180)
        }
    }
}

/**
 * Transform rows for the copied-out edit list source.
 *
 * Returns '' for an untransformed sequence so the emitted source stays exactly
 * as it is today for every row nobody has moved.
 */
export const formatTransformSource = (sequence) => {
    if (isIdentityTransform(sequence.transform)) return ''
    const { position, rotation, scale } = resolveTransform(sequence)
    const triple = (values) => `[${values.map(roundPlacement).join(', ')}]`
    return `        transform: { position: ${triple(position)}, `
        + `rotation: ${triple(rotation)}, scale: ${roundPlacement(scale)} },\n`
}
