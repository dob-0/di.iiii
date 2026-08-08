// Timeline maths, shared. Pure functions over a clip list — no React, no
// three.js, no fs — so timeline behaviour is testable without mounting a
// canvas or a server.
//
// This merges two models that were built independently and disagreed:
//
//   src/algoVrithm/editList.js  — rich operations (ripple, razor, retime),
//       positions in float SECONDS, clips overlap on purpose.
//   cutlab/src/editdoc.mjs      — frames not seconds, validated integers,
//       but positions DERIVED from a contiguous chain.
//
// Both were right about the thing they cared about and wrong about the other.
//
// Frames win over seconds: float seconds accumulate rounding drift across
// every trim, invisible until a cut lands one frame late on a beat. cutlab
// measured this — a hand-rolled seconds pipeline produced 999 frames where the
// frame-exact one produced 966.
//
// Explicit `at` wins over derived: a contiguous chain cannot express an
// overlap, and an overlap is a cross-fade. Deriving position from a chain
// silently converts every dissolve in a piece into a hard cut. algoVrithm's
// ripple exists precisely to preserve those overlaps.
//
// So: integer frames, absolutely positioned, overlap legal. Gaps and overlaps
// are both real states the tools below report rather than prevent.

// Smallest editable step, in frames. Fine enough to place a cut precisely,
// coarse enough that dragging lands on round numbers.
export const SNAP_FRAMES = 1

// A clip shorter than this is an accidental drag, not an edit — and a
// zero-length window divides by zero in every progress calculation.
export const MIN_CLIP_FRAMES = 2

export const MIN_CLIP_SPEED = 0.1
export const MAX_CLIP_SPEED = 4

/**
 * A clip is `{ id, source, at, dur, in, srcDur }`, every time value an integer
 * frame count:
 *
 *   at      where it sits on the timeline
 *   dur     how long it occupies the timeline
 *   in      frames into its own material where it starts
 *   srcDur  frames of material it consumes
 *
 * Speed is `srcDur / dur` — derived, never stored. That is algoVrithm's
 * insight kept intact: retiming and the razor are the same mechanism seen
 * from two angles, because both only ever move the source window. Storing a
 * separate `speed` field alongside these would invite the two to disagree,
 * which is the mistake cutlab correctly refused to make with `at`.
 */

export const snapFrames = (frames, step = SNAP_FRAMES) =>
    Math.round(frames / step) * step

export const clipEnd = (clip) => clip.at + clip.dur

/** Frames of material a clip consumes; defaults to 1:1 with its window. */
export const clipSrcDur = (clip) =>
    Number.isInteger(clip?.srcDur) ? clip.srcDur : clip.dur

export const clipSpeed = (clip) => clipSrcDur(clip) / clip.dur

export const totalDuration = (clips) =>
    clips.reduce((longest, clip) => Math.max(longest, clipEnd(clip)), 0)

export const sortByStart = (clips) =>
    [...clips].sort((a, b) => a.at - b.at || clipEnd(a) - clipEnd(b))

/** mm:ss.t — the form a timeline cursor reads at a glance. */
export const formatTimecode = (frames, fps) => {
    const safe = Math.max(0, frames) / fps
    const minutes = Math.floor(safe / 60)
    const rest = safe - minutes * 60
    return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`
}

/** mm:ss:ff — the form you read when you care which frame it is. */
export const formatFrames = (frames, fps) => {
    const safe = Math.max(0, Math.round(frames))
    const totalSec = Math.floor(safe / fps)
    const minutes = Math.floor(totalSec / 60)
    const seconds = totalSec - minutes * 60
    const rest = safe - totalSec * fps
    return `${minutes}:${String(seconds).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

/** Move a clip to a new position, keeping its length. Never goes negative. */
export const moveClip = (clips, id, at) =>
    clips.map((clip) => {
        if (clip.id !== id) return clip
        return { ...clip, at: Math.max(0, snapFrames(at)) }
    })

/**
 * Drag one edge. The opposite edge stays put, so trimming the head shortens
 * the clip rather than sliding it — the behaviour every NLE has and therefore
 * the one that needs no explanation.
 *
 * `retime` is the fork between the two source models, and both are legitimate:
 *
 *   false (default) — the material keeps its speed and the window shows less
 *       of it. Trimming the head walks the in-point forward. This is what
 *       trimming footage means, and what cutlab needs.
 *   true — the material re-stretches to fill whatever window is left, so the
 *       whole sequence still plays across it. This is what algoVrithm's
 *       generative sequences do, where there is no "footage" to walk into.
 */
export const trimClip = (clips, id, edge, at, { retime = false } = {}) =>
    clips.map((clip) => {
        if (clip.id !== id) return clip

        const value = snapFrames(at)
        const srcDur = clipSrcDur(clip)
        const end = clipEnd(clip)

        if (edge === 'start') {
            const nextAt = Math.max(0, Math.min(value, end - MIN_CLIP_FRAMES))
            const nextDur = end - nextAt
            if (retime) return { ...clip, at: nextAt, dur: nextDur, srcDur }
            // Walk the in-point by the material the trimmed frames consumed,
            // at the clip's current speed, so what remains stays aligned to
            // the same moment of the source it was aligned to before.
            const consumed = Math.round((nextAt - clip.at) * (srcDur / clip.dur))
            return {
                ...clip,
                at: nextAt,
                dur: nextDur,
                in: Math.max(0, clip.in + consumed),
                srcDur: Math.max(1, srcDur - consumed)
            }
        }

        const nextDur = Math.max(MIN_CLIP_FRAMES, value - clip.at)
        if (retime) return { ...clip, dur: nextDur, srcDur }
        return {
            ...clip,
            dur: nextDur,
            srcDur: Math.max(1, Math.round(nextDur * (srcDur / clip.dur)))
        }
    })

/**
 * Set a clip's length from its current position, moving NOTHING else.
 *
 * This is the edge-drag behaviour: it changes where this clip ends and leaves
 * its neighbours alone, which is how you deliberately open or close an overlap
 * with the next beat.
 */
export const setClipDuration = (clips, id, dur, { retime = false } = {}) =>
    clips.map((clip) => {
        if (clip.id !== id) return clip
        const nextDur = Math.max(MIN_CLIP_FRAMES, Math.round(dur))
        if (retime) return { ...clip, dur: nextDur, srcDur: clipSrcDur(clip) }
        return {
            ...clip,
            dur: nextDur,
            srcDur: Math.max(1, Math.round(nextDur * clipSpeed(clip)))
        }
    })

/**
 * Set a clip's length and slide everything after it — a ripple edit, which is
 * what typing a duration does in every editing program.
 *
 * A timeline is a chain: lengthen one clip and everything downstream should
 * move by the same amount, arriving in the same order with the same handovers.
 * `setClipDuration` alone leaves them behind, so adding two seconds to a clip
 * silently eats two seconds of its neighbour instead of making the cut longer.
 *
 * Later clips move by the DELTA rather than being butted end-to-end, and that
 * is the whole point: every overlap in the chain is a deliberate cross-fade,
 * and shifting by a constant preserves all of them exactly.
 */
export const setClipDurationRipple = (clips, id, dur, options = {}) => {
    const target = clips.find((clip) => clip.id === id)
    if (!target) return clips

    const nextDur = Math.max(MIN_CLIP_FRAMES, Math.round(dur))
    const delta = nextDur - target.dur
    if (delta === 0) return clips

    const resized = setClipDuration(clips, id, nextDur, options)
    return resized.map((clip) => {
        if (clip.id === id) return clip
        // Compared on `at` rather than end, so a long clip already overlapping
        // this one is treated as a neighbour in the chain rather than as
        // something to leave behind.
        if (clip.at <= target.at) return clip
        return { ...clip, at: Math.max(0, clip.at + delta) }
    })
}

/**
 * Push everything from `id` onwards later (or earlier) — a ripple. Inserting
 * breathing room into the middle of a cut piece is otherwise a manual retype
 * of every clip after it.
 */
export const rippleFrom = (clips, id, deltaFrames) => {
    const pivot = clips.find((clip) => clip.id === id)
    if (!pivot) return clips
    return clips.map((clip) => {
        if (clip.at < pivot.at) return clip
        return { ...clip, at: Math.max(0, clip.at + Math.round(deltaFrames)) }
    })
}

export const removeClip = (clips, id) => clips.filter((clip) => clip.id !== id)

/**
 * The razor: cut a clip in two at frame `at`.
 *
 * Both halves keep everything the original had and split its SOURCE window
 * between them, so the material runs once across the pair instead of twice.
 * That is the whole difference between a cut and a duplicate.
 *
 * The cut point is mapped through the clip's existing source window rather
 * than assumed to start at zero, so cutting an already-cut clip keeps working:
 * halves of halves stay continuous, at the same speed.
 *
 * Returns the array UNCHANGED (same reference) when the cut is impossible, so
 * callers can use identity to decide whether to offer the action — see
 * canSplitClip.
 */
export const splitClip = (clips, id, at) => {
    const target = clips.find((clip) => clip.id === id)
    if (!target) return clips

    const cut = snapFrames(at)
    // A cut at either edge is not a cut. Refusing below MIN_CLIP_FRAMES also
    // keeps a zero-length window out of every progress calculation, where it
    // divides by zero and produces a NaN that is invisible and maddening to
    // trace back.
    if (cut - target.at < MIN_CLIP_FRAMES) return clips
    if (clipEnd(target) - cut < MIN_CLIP_FRAMES) return clips

    const srcDur = clipSrcDur(target)
    const headDur = cut - target.at
    const tailDur = clipEnd(target) - cut
    // Split the material at the same proportion as the window, so both halves
    // keep the original speed rather than one of them silently retiming.
    const headSrc = Math.max(1, Math.round(srcDur * (headDur / target.dur)))
    const tailSrc = Math.max(1, srcDur - headSrc)

    // The tail needs its own id: two rows sharing one collapse into a single
    // React key.
    const used = new Set(clips.map((clip) => clip.id))
    let tailId = `${target.id}-b`
    let suffix = 1
    while (used.has(tailId)) {
        suffix += 1
        tailId = `${target.id}-b${suffix}`
    }

    // Rebuilt in place rather than appended, so a cut does not reorder the
    // array under a panel that is rendering from it.
    return clips.flatMap((clip) => {
        if (clip.id !== id) return [clip]
        return [
            { ...clip, dur: headDur, srcDur: headSrc },
            { ...clip, id: tailId, at: cut, dur: tailDur, in: clip.in + headSrc, srcDur: tailSrc }
        ]
    })
}

/** Whether the razor would do anything here — drives the button's disabled state. */
export const canSplitClip = (clips, id, at) => splitClip(clips, id, at) !== clips

/**
 * Retime a clip WITHOUT moving or resizing it.
 *
 *   0.5  runs at half rate — you see the first half of the material
 *   1    the material plays exactly across its window (the default)
 *   2    completes halfway through the window and holds
 *
 * The in-point is preserved, so setting a speed on a clip that has already
 * been cut retimes that piece rather than dragging it back to the top of the
 * source.
 */
export const setClipSpeed = (clips, id, speed) =>
    clips.map((clip) => {
        if (clip.id !== id) return clip
        const rate = Math.min(MAX_CLIP_SPEED, Math.max(MIN_CLIP_SPEED, speed))
        return { ...clip, srcDur: Math.max(1, Math.round(clip.dur * rate)) }
    })

/**
 * What the timeline looks like as an edit, rather than as data.
 *
 * `gaps` are stretches with nothing on screen — the piece playing to an empty
 * room, invisible in the numbers and obvious as a red band on a timeline.
 * `cuts` are handovers with no overlap: a hard edit, legitimate but worth
 * seeing. `overlaps` are the cross-fades, reported so a UI can draw them
 * rather than treat them as an error.
 */
export const analyseTimeline = (clips) => {
    const ordered = sortByStart(clips)
    const gaps = []
    const cuts = []
    const overlaps = []

    if (!ordered.length) return { gaps, cuts, overlaps, total: 0, orderedIds: [] }

    if (ordered[0].at > 0) gaps.push({ at: 0, until: ordered[0].at })

    // A coverage sweep rather than a pairwise comparison: three overlapping
    // clips can leave a hole that no adjacent pair reveals.
    let covered = clipEnd(ordered[0])
    for (let index = 1; index < ordered.length; index++) {
        const current = ordered[index]
        if (current.at > covered) {
            gaps.push({ at: covered, until: current.at })
        } else if (current.at === covered) {
            cuts.push({ at: covered })
        } else {
            overlaps.push({ at: current.at, until: Math.min(covered, clipEnd(current)) })
        }
        covered = Math.max(covered, clipEnd(current))
    }

    return { gaps, cuts, overlaps, total: totalDuration(ordered), orderedIds: ordered.map((clip) => clip.id) }
}

/** Which clips are on screen now, and which one lands next. */
export const timelinePosition = (clips, playhead) => {
    const ordered = sortByStart(clips)
    const live = ordered.filter((clip) => playhead >= clip.at && playhead <= clipEnd(clip))
    const next = ordered.find((clip) => clip.at > playhead) ?? null
    return { live, next, framesToNext: next ? next.at - playhead : null }
}

/**
 * Where a clip is in its own material at a given playhead, as a 0..1
 * fraction, clamped. Past the end of a fast clip it holds its last frame
 * rather than looping or going blank.
 */
export const clipProgress = (clip, playhead) => {
    const through = (playhead - clip.at) / clip.dur
    return Math.min(1, Math.max(0, through)) * clipSpeed(clip)
}

/** The source frame a clip is showing at a given playhead. */
export const sourceFrameAt = (clip, playhead) => {
    const through = Math.min(1, Math.max(0, (playhead - clip.at) / clip.dur))
    return clip.in + Math.min(clipSrcDur(clip) - 1, Math.round(through * clipSrcDur(clip)))
}

/**
 * Every invariant the operations above assume. Worth running at the edges —
 * on load, on import, after a patch from anything that is not these functions
 * — because a non-integer frame count fails silently and only shows up as a
 * cut landing one frame late.
 */
export const validateClips = (clips) => {
    const errs = []
    const seen = new Set()

    for (const clip of clips ?? []) {
        const where = clip?.id ?? '<no id>'
        if (!clip?.id) errs.push('clip has no id')
        else if (seen.has(clip.id)) errs.push(`duplicate clip id ${clip.id}`)
        else seen.add(clip.id)

        if (!Number.isInteger(clip?.at) || clip.at < 0) {
            errs.push(`clip ${where} has non-integer or negative at`)
        }
        if (!Number.isInteger(clip?.dur) || clip.dur < MIN_CLIP_FRAMES) {
            errs.push(`clip ${where} is shorter than ${MIN_CLIP_FRAMES} frames`)
        }
        if (!Number.isInteger(clip?.in) || clip.in < 0) {
            errs.push(`clip ${where} has non-integer or negative in`)
        }
        if (clip?.srcDur !== undefined && (!Number.isInteger(clip.srcDur) || clip.srcDur < 1)) {
            errs.push(`clip ${where} has non-integer or empty srcDur`)
        }
    }
    return errs
}
