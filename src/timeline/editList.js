// Edit-list maths for the director panel. Pure functions over the SEQUENCES
// shape — no React, no three.js — so the timeline's behaviour is testable
// without mounting a canvas.
//
// The panel edits a draft copy of the edit list and the piece renders from it
// live. sequences/index.js stays the single source of truth (git-tracked,
// reviewable, and what actually deploys), and the draft reaches it two ways:
// "Save to source" patches the file in place through a dev-server endpoint
// (editListSource.js), and formatEditListSource below regenerates the whole
// array for "Copy edit list". Save is the one to reach for — the formatter is
// lossy by design, see its own note.

import { formatTransformSource } from './sequenceTransform.js'

// Smallest editable step. Fine enough to place a cut precisely, coarse enough
// that dragging produces round numbers instead of 7.203041s.
export const SNAP_SEC = 0.05

// A clip shorter than this is almost certainly an accidental drag rather than
// an intended edit, and a zero-width window divides by zero in clipProgress.
export const MIN_CLIP_SEC = 0.2

export const snapSec = (seconds, step = SNAP_SEC) =>
    Math.round(seconds / step) * step

// Rounds away binary-float dust (0.30000000000000004) so both the panel and
// the copied source show the number the author actually chose.
export const roundSec = (seconds) => Math.round(seconds * 1000) / 1000

// Source points are fractions of a clip's own material, not timeline seconds,
// so they need finer resolution than roundSec gives: at three decimal places a
// cut in a long clip would shift by a frame or two on the way through.
export const roundUnit = (value) => Math.round(value * 100000) / 100000

export const clipDuration = (sequence) => sequence.endSec - sequence.startSec

/**
 * Which slice of its own material a clip shows. `[0, 1]` — all of it — unless
 * the clip has been cut.
 *
 * A helper rather than a default on the row so an uncut clip stays exactly the
 * object the author typed in sequences/index.js. Every row silently acquiring
 * `source: [0, 1]` would make a default look like a decision.
 */
export const clipSource = (sequence) =>
    Array.isArray(sequence?.source) ? sequence.source : [0, 1]

export const totalDurationSec = (sequences) =>
    sequences.reduce((longest, sequence) => Math.max(longest, sequence.endSec), 0)

/** mm:ss.t — the form a timeline cursor reads at a glance. */
export const formatTimecode = (seconds) => {
    const safe = Math.max(0, seconds)
    const minutes = Math.floor(safe / 60)
    const rest = safe - minutes * 60
    return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`
}

/** Move a clip to a new start, keeping its length. Never goes negative. */
export const moveClip = (sequences, id, startSec) =>
    sequences.map((sequence) => {
        if (sequence.id !== id) return sequence
        const length = clipDuration(sequence)
        const nextStart = Math.max(0, roundSec(snapSec(startSec)))
        return { ...sequence, startSec: nextStart, endSec: roundSec(nextStart + length) }
    })

/**
 * Drag one edge. The opposite edge stays put, so trimming the head of a clip
 * shortens it rather than sliding the whole thing — the behaviour every NLE
 * has and therefore the one that needs no explanation.
 */
export const trimClip = (sequences, id, edge, seconds) =>
    sequences.map((sequence) => {
        if (sequence.id !== id) return sequence
        const value = roundSec(snapSec(seconds))
        if (edge === 'start') {
            return {
                ...sequence,
                startSec: Math.max(0, Math.min(value, roundSec(sequence.endSec - MIN_CLIP_SEC)))
            }
        }
        return {
            ...sequence,
            endSec: Math.max(value, roundSec(sequence.startSec + MIN_CLIP_SEC))
        }
    })

/**
 * Set a clip's length from its current start, moving NOTHING else.
 *
 * This is the edge-drag behaviour: it changes where this clip ends and leaves
 * its neighbours where they are, which is how you deliberately open or close an
 * overlap with the next beat.
 */
export const setClipDuration = (sequences, id, durationSec) =>
    sequences.map((sequence) => {
        if (sequence.id !== id) return sequence
        const length = Math.max(MIN_CLIP_SEC, roundSec(durationSec))
        return { ...sequence, endSec: roundSec(sequence.startSec + length) }
    })

/**
 * Set a clip's length and slide everything after it — a ripple edit, which is
 * what typing a duration does in every editing program.
 *
 * The piece is a chain: lengthen the tunnel and the field, the assembly and the
 * chamber should all move down by the same amount, arriving in the same order
 * with the same handovers. `setClipDuration` alone leaves them behind, so
 * adding two seconds to the tunnel silently ate two seconds of the field
 * instead of making the piece longer.
 *
 * Later clips move by the DELTA rather than being butted end-to-end, which is
 * the whole point: every overlap in the chain is a deliberate cross-fade (see
 * the note in sequences/index.js), and shifting by a constant preserves all of
 * them exactly. Butting clips together would silently convert every dissolve in
 * the piece into a hard cut — and in a headset a hard white-to-black cut is
 * genuinely unpleasant, which is the reason Backdrop.jsx blends at all.
 */
export const setClipDurationRipple = (sequences, id, durationSec) => {
    const target = sequences.find((sequence) => sequence.id === id)
    if (!target) return sequences

    const nextLength = Math.max(MIN_CLIP_SEC, roundSec(durationSec))
    const delta = roundSec(nextLength - clipDuration(target))
    if (delta === 0) return sequences

    return sequences.map((sequence) => {
        if (sequence.id === id) {
            return { ...sequence, endSec: roundSec(sequence.startSec + nextLength) }
        }
        // Only what comes AFTER this clip moves. Compared on startSec rather
        // than endSec so a long clip already overlapping this one is treated as
        // a neighbour in the chain, not as something to leave behind.
        if (sequence.startSec <= target.startSec) return sequence

        const nextStart = Math.max(0, roundSec(sequence.startSec + delta))
        return {
            ...sequence,
            startSec: nextStart,
            endSec: roundSec(nextStart + clipDuration(sequence))
        }
    })
}

/**
 * Push everything from `id` onwards later (or earlier) by `deltaSec` — a
 * ripple. Inserting five seconds of breathing room into the middle of a cut
 * piece is otherwise a manual retype of every clip after it.
 */
export const rippleFrom = (sequences, id, deltaSec) => {
    const ordered = sortByStart(sequences)
    const pivot = ordered.findIndex((sequence) => sequence.id === id)
    if (pivot === -1) return sequences
    const from = ordered[pivot].startSec
    return sequences.map((sequence) => {
        if (sequence.startSec < from) return sequence
        const nextStart = Math.max(0, roundSec(sequence.startSec + deltaSec))
        return {
            ...sequence,
            startSec: nextStart,
            endSec: roundSec(nextStart + clipDuration(sequence))
        }
    })
}

export const sortByStart = (sequences) =>
    [...sequences].sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec)

// ---- asset clips ------------------------------------------------------
//
// An asset clip is a row whose visual is a file rather than a component: it
// carries an `asset` and renders through AssetClip. Hand-written sequences
// come from the edit list in source and cannot be added or deleted here — the
// panel is a cutting room, not a code editor.

export const DEFAULT_ASSET_CLIP_SEC = 4

export const isAssetClip = (sequence) => Boolean(sequence.asset)

/**
 * Place an asset on the timeline at `atSec`. Called with the playhead, so
 * "add" means "put it where I am looking", which is what a cut-in is.
 */
export const addAssetClip = (sequences, asset, atSec, Component, options = {}) => {
    const durationSec = options.durationSec ?? DEFAULT_ASSET_CLIP_SEC
    const startSec = Math.max(0, roundSec(snapSec(atSec)))

    // Ids must stay unique across repeats of the same file — dropping one
    // image in three times is a normal thing to want, and a duplicate key
    // silently collapses them into one row.
    const used = new Set(sequences.map((sequence) => sequence.id))
    let suffix = 1
    let id = `asset-${asset.id}`
    while (used.has(id)) {
        suffix += 1
        id = `asset-${asset.id}-${suffix}`
    }

    return [
        ...sequences,
        {
            id,
            title: asset.title,
            note: `${asset.kind} · ${asset.fileName}`,
            startSec,
            endSec: roundSec(startSec + durationSec),
            // No `backdrop`: an asset sits in whatever room is already there.
            // Backdrop.jsx skips rows without one so the piece's colour keeps
            // being decided by the written sequences.
            asset: {
                assetId: asset.id,
                kind: asset.kind,
                fileName: asset.fileName,
                src: asset.src,
                ...options.placement
            },
            Component
        }
    ]
}

export const removeClip = (sequences, id) =>
    sequences.filter((sequence) => sequence.id !== id)

/**
 * The razor: cut a clip in two at `atSec`.
 *
 * Both halves keep everything the original had — world, lights, placement,
 * component — and split its SOURCE range between them, so the animation runs
 * once across the pair instead of twice. See sourceProgress in clock.js
 * for why that is the whole difference between a cut and a duplicate.
 *
 * The cut point is mapped through the clip's existing source range rather than
 * assumed to be [0, 1], so cutting an already-cut clip keeps working: halves of
 * halves stay continuous.
 *
 * Returns the array UNCHANGED (same reference) when the cut is impossible, so
 * callers can use identity to decide whether to offer the action at all —
 * see canSplitClip.
 */
export const splitClip = (sequences, id, atSec) => {
    const target = sequences.find((sequence) => sequence.id === id)
    if (!target) return sequences

    const at = roundSec(snapSec(atSec))

    // A cut at either edge is not a cut. Refusing below MIN_CLIP_SEC also keeps
    // a zero-width window out of clipProgress, where it divides by zero and
    // renders a NaN opacity — invisible, and maddening to trace back.
    if (at - target.startSec < MIN_CLIP_SEC) return sequences
    if (target.endSec - at < MIN_CLIP_SEC) return sequences

    const [inPoint, outPoint] = clipSource(target)
    const fraction = (at - target.startSec) / clipDuration(target)
    const atSource = roundUnit(inPoint + fraction * (outPoint - inPoint))

    // The tail needs its own id: two rows sharing one would collapse into a
    // single React key, and the gizmo resolves its target by name.
    const used = new Set(sequences.map((sequence) => sequence.id))
    let tailId = `${target.id}-b`
    let suffix = 1
    while (used.has(tailId)) {
        suffix += 1
        tailId = `${target.id}-b${suffix}`
    }

    // Rebuilt in place rather than appended, so a cut does not reorder the
    // array under a panel that is rendering from it.
    return sequences.flatMap((sequence) => {
        if (sequence.id !== id) return [sequence]
        return [
            { ...sequence, endSec: at, source: [inPoint, atSource] },
            { ...sequence, id: tailId, startSec: at, source: [atSource, outPoint] }
        ]
    })
}

/** Whether the razor would do anything here — drives the button's disabled state. */
export const canSplitClip = (sequences, id, atSec) =>
    splitClip(sequences, id, atSec) !== sequences

// A clip stopped dead is not a speed, and past 4x nothing in the piece reads as
// motion any more — it is a flash with a shape.
export const MIN_CLIP_SPEED = 0.1
export const MAX_CLIP_SPEED = 4

/**
 * How fast a clip runs through its OWN material — a different question from how
 * long it sits on the timeline, which is what `for` sets.
 *
 * 1 means the whole sequence plays across its window, which is what every
 * uncut clip does. It is the width of the source range, so speed and the razor
 * are the same mechanism seen from two angles.
 */
export const clipSpeed = (sequence) => {
    const [inPoint, outPoint] = clipSource(sequence)
    return roundUnit(outPoint - inPoint)
}

/**
 * Retime a clip WITHOUT moving or resizing it.
 *
 * Before source ranges these were one control: the only way to slow a sequence
 * down was to make it longer, which moved everything after it. Now:
 *
 *   0.5  runs at half rate — you see the first half of the animation
 *   1    the whole sequence across its window (the default)
 *   2    completes halfway through the window and holds its last frame
 *
 * The in-point is preserved, so setting a speed on a clip that has already been
 * cut retimes that piece rather than dragging it back to the top of the source.
 */
export const setClipSpeed = (sequences, id, speed) =>
    sequences.map((sequence) => {
        if (sequence.id !== id) return sequence

        const span = Math.min(MAX_CLIP_SPEED, Math.max(MIN_CLIP_SPEED, speed))
        const [inPoint] = clipSource(sequence)
        const outPoint = roundUnit(inPoint + span)

        // Back at the default? Drop the field rather than writing `[0, 1]` —
        // same rule as `ambient` and the razor: a default the author landed on
        // by accident should not become one they now maintain.
        if (inPoint === 0 && outPoint === 1) {
            const rest = { ...sequence }
            delete rest.source
            return rest
        }

        return { ...sequence, source: [inPoint, outPoint] }
    })

/** Change one placement number (distance / size / height / bearing). */
export const setPlacement = (sequences, id, key, value) =>
    sequences.map((sequence) => {
        if (sequence.id !== id || !sequence.asset) return sequence
        return { ...sequence, asset: { ...sequence.asset, [key]: roundSec(value) } }
    })

/**
 * What the piece looks like as an edit, rather than as data.
 *
 * `gaps` are stretches with nothing on screen — the piece playing to an empty
 * room, which is invisible in the numbers and obvious as a red band on the
 * timeline. `cuts` are handovers with no overlap: a hard edit, legitimate but
 * worth seeing, because in a headset a white-to-black hard cut is genuinely
 * unpleasant (this is the whole reason Backdrop.jsx blends).
 */
export const analyseEditList = (sequences) => {
    const ordered = sortByStart(sequences)
    const gaps = []
    const cuts = []

    if (!ordered.length) return { gaps, cuts, totalSec: 0, orderedIds: [] }

    if (ordered[0].startSec > 0) {
        gaps.push({ startSec: 0, endSec: roundSec(ordered[0].startSec) })
    }

    // Coverage sweep rather than pairwise comparison: three overlapping clips
    // can leave a hole that no adjacent pair reveals.
    let covered = ordered[0].endSec
    for (let index = 1; index < ordered.length; index++) {
        const current = ordered[index]
        if (current.startSec > covered) {
            gaps.push({ startSec: roundSec(covered), endSec: roundSec(current.startSec) })
        } else if (current.startSec === covered) {
            cuts.push({ atSec: roundSec(covered) })
        }
        covered = Math.max(covered, current.endSec)
    }

    return {
        gaps,
        cuts,
        totalSec: roundSec(totalDurationSec(ordered)),
        orderedIds: ordered.map((sequence) => sequence.id)
    }
}

/** Which sequence is on screen now, and which one lands next. */
export const timelinePosition = (sequences, playheadSec) => {
    const ordered = sortByStart(sequences)
    const live = ordered.filter(
        (sequence) => playheadSec >= sequence.startSec && playheadSec <= sequence.endSec
    )
    const next = ordered.find((sequence) => sequence.startSec > playheadSec) ?? null
    return {
        live,
        next,
        secondsToNext: next ? roundSec(next.startSec - playheadSec) : null
    }
}

const formatNumber = (value) => {
    const rounded = roundSec(value)
    return Number.isInteger(rounded) ? String(rounded) : String(rounded)
}

// A light's fields, in the order they read best in source: what it is, what it
// looks like, where it is, then the falloff nobody edits twice.
const LIGHT_KEYS = ['kind', 'color', 'intensity', 'position', 'distance', 'decay', 'radius']

const formatLightValue = (value) => {
    if (Array.isArray(value)) return `[${value.map((entry) => formatNumber(entry)).join(', ')}]`
    if (typeof value === 'string') return `'${value}'`
    return formatNumber(value)
}

/**
 * Emit only the keys a light actually carries, the same way the asset line
 * does. A row hand-typed with three fields comes back out with three fields —
 * writing `radius: undefined` into source that is meant to be pasted straight
 * back would be a syntax-valid way of breaking the file.
 */
const formatLight = (light) => {
    const fields = LIGHT_KEYS
        .filter((key) => light[key] !== undefined)
        .map((key) => `${key}: ${formatLightValue(light[key])}`)
    return `            { id: '${light.id}', ${fields.join(', ')} }`
}

/**
 * The draft as source you can paste over sequences/index.js.
 *
 * `Component` is a live function reference and `id` is how a row maps back to
 * its file, so the output reuses the identifier rather than trying to
 * serialize the component: the result is meant to be read and reviewed, not
 * eval'd.
 */
export const formatEditListSource = (sequences, componentNames = {}) => {
    const rows = sortByStart(sequences).map((sequence) => {
        const componentName = componentNames[sequence.id]
            ?? sequence.Component?.name
            ?? 'Component'
        const note = String(sequence.note ?? '').replace(/'/g, "\\'")
        const title = String(sequence.title ?? '').replace(/'/g, "\\'")
        const backdrop = sequence.backdrop
        // `ambient` is optional and only emitted when the row carries one, so a
        // world that has never been touched comes back out exactly as it went
        // in rather than acquiring a number the author did not choose.
        const ambientPart = backdrop && backdrop.ambient !== undefined
            ? `, ambient: ${formatNumber(backdrop.ambient)}`
            : ''
        const backdropLine = backdrop
            ? `        backdrop: { color: '${backdrop.color}', fogNear: ${formatNumber(backdrop.fogNear)}, fogFar: ${formatNumber(backdrop.fogFar)}${ambientPart} },\n`
            : ''

        // Lights are written back BY VALUE — unlike an asset, a lamp is nothing
        // but its numbers, and those numbers are exactly what the author just
        // spent an afternoon dragging. One line each, because a row with four
        // lamps in it is a lighting plot and wants to be read as a list.
        const lights = sequence.lights ?? []
        const lightsLine = lights.length
            ? `        lights: [\n${lights.map(formatLight).join(',\n')}\n        ],\n`
            : ''

        // Only written on a row that has actually been cut. An uncut clip owns
        // all of its material, and stamping `source: [0, 1]` onto every row
        // would turn a default into something the author has to maintain by
        // hand — the same reason `ambient` above is conditional.
        const sourceLine = Array.isArray(sequence.source)
            ? `        source: [${roundUnit(sequence.source[0])}, ${roundUnit(sequence.source[1])}],\n`
            : ''

        // `veil: false` is a choreographed decision, not a default — two rows
        // carry it so their arrival is not buried under the generic dip (see
        // transitions.js). The copy losing it would silently put the grey dip
        // back on top of the portal reveal the next time the output was pasted
        // over the file.
        const veilLine = sequence.veil === false ? '        veil: false,\n' : ''

        // Placement, only for rows that were actually moved — same rule as
        // `source` and `ambient`: an untouched row comes back out untouched.
        const transformLine = formatTransformSource(sequence)

        // `travel` carries the one passive locomotion move a row can make, and
        // a pasted copy that drops it leaves the visitor standing still.
        const travelLine = Array.isArray(sequence.travel)
            ? `        travel: [${sequence.travel.map(formatNumber).join(', ')}],\n`
            : ''

        // Asset clips are written back by REFERENCE, not by value: `src` is a
        // build-time URL that changes with the file's content hash, so pasting
        // it in would break on the next build. Resolving the id against the
        // folder at import time keeps the edit list honest — and an asset that
        // has since been deleted resolves to nothing and renders nothing,
        // rather than pointing at a URL that 404s.
        const assetLine = sequence.asset
            ? `        asset: { ...findAsset('${sequence.asset.assetId}'), ${
                ['distance', 'size', 'height', 'bearing']
                    .filter((key) => sequence.asset[key] !== undefined)
                    .map((key) => `${key}: ${formatNumber(sequence.asset[key])}`)
                    .join(', ')
            } },\n`
            : ''

        return (
            '    {\n'
            + `        id: '${sequence.id}',\n`
            + `        title: '${title}',\n`
            + `        note: '${note}',\n`
            + `        startSec: ${formatNumber(sequence.startSec)},\n`
            + `        endSec: ${formatNumber(sequence.endSec)},\n`
            + sourceLine
            + backdropLine
            + lightsLine
            + transformLine
            + travelLine
            + veilLine
            + assetLine
            + `        Component: ${componentName}\n`
            + '    }'
        )
    })

    return `export const SEQUENCES = [\n${rows.join(',\n')}\n]\n`
}
