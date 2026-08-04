import { useCallback, useEffect, useRef, useState } from 'react'

// The whole piece is one playhead measured in SECONDS, like a video editor's
// timeline. Each sequence claims an in/out window on it (see SEQUENCES) and
// receives its own local 0..1 progress. Adding, reordering or retiming a
// sequence is then a data change, never a rewrite of the scene.

const clamp01 = (value) => Math.min(1, Math.max(0, value))

// Local progress of a sequence given the playhead. Returns null when the
// sequence is off-screen so callers can skip rendering it entirely.
//
// Unit-agnostic on purpose: playhead, start and end only have to agree with
// each other. The return is always a local 0..1, which is why a sequence's own
// code never learns how long it runs for.
export const clipProgress = (playhead, start, end) => {
    if (playhead < start || playhead > end) return null
    if (end <= start) return 0
    return clamp01((playhead - start) / (end - start))
}

/**
 * Where a clip is in its own MATERIAL, as opposed to where it is in its window.
 *
 * These are the same thing until a clip is cut, and different afterwards — the
 * distinction every video editor draws between a clip's timeline range and its
 * source in/out points.
 *
 * Cutting has to yield two halves of ONE animation. Without this, both halves
 * would map to a fresh 0..1 and each would replay the whole thing at double
 * speed: a duplicate, not a cut. So a cut row carries `source: [in, out]` — the
 * slice of its own material it is responsible for — and this maps the window's
 * local progress into that slice.
 *
 * No `source` means "all of it", so an uncut row behaves exactly as before.
 *
 * The fade envelopes then come out right for free, which is the sign the model
 * is the correct one. The first half of a cut runs 0 -> 0.5: it fades IN at the
 * true start and is still at full strength when it hands over. The second runs
 * 0.5 -> 1: it arrives at full strength and fades OUT at the true end. Neither
 * fades at the cut — which is precisely what a cut is.
 */
export const sourceProgress = (progress, source) => {
    if (progress === null || !Array.isArray(source)) return progress
    const [inPoint, outPoint] = source
    if (!Number.isFinite(inPoint) || !Number.isFinite(outPoint)) return progress
    return clamp01(inPoint + progress * (outPoint - inPoint))
}

// Smoothstep — eases in and out instead of a linear ramp. Use for fades so
// sequences bleed into each other rather than popping.
export const smoothstep = (edge0, edge1, value) => {
    // Zero-width edge means a hard step. Without this the division below is
    // NaN, which silently propagates into an opacity and renders nothing.
    if (edge0 === edge1) return value >= edge1 ? 1 : 0
    const t = clamp01((value - edge0) / (edge1 - edge0))
    return t * t * (3 - 2 * t)
}

// Rises 0->1 over `fadeIn`, holds, then falls to 0 over the last `fadeOut`.
// Standard shape for a sequence's own opacity envelope.
//
// fadeIn = 0 means the sequence is at full strength on its first frame. The
// opening sequence wants this: fading up from nothing spends the first second
// of the piece on an empty room, and a strobe should land immediately.
export const fadeEnvelope = (progress, fadeIn = 0.15, fadeOut = fadeIn) =>
    smoothstep(0, fadeIn, progress) * (1 - smoothstep(1 - fadeOut, 1, progress))

// Playback speeds the director panel offers. 1 is the only one an audience
// ever sees.
export const PLAYBACK_RATES = [0.25, 0.5, 1]

// Longest step the playhead will take in one frame, whatever the frame took.
//
// A headset that drops frames, a tab that was backgrounded, or a session
// handover that stalls the loop for a second must not jump the piece forward
// by the whole gap — the visitor would put the glasses on and find the opening
// already over. Advancing in slow motion for a beat is the far cheaper failure.
export const MAX_STEP_SEC = 0.1

/**
 * The playhead, in seconds, plus a transport.
 *
 * For an audience the piece plays itself — there is nothing to operate, which
 * is the point: they are mostly not VR literate, and a 45-second work cannot
 * afford to teach a control scheme. Reading `playheadSec` and ignoring the
 * rest gives exactly that behaviour.
 *
 * The transport (`pause`, `seek`, `setRate`) exists for the director panel,
 * which only mounts for the author — see directorFlag.js.
 *
 * THE CLOCK DOES NOT TICK ITSELF. It exposes `advance(deltaSec)` and someone
 * inside the Canvas has to call it every frame — see RitualClockDriver.jsx for
 * why a `window.requestAnimationFrame` loop in here was wrong in a headset.
 *
 * With `loop` the piece runs 0 -> durationSec -> 0 forever, which is what an
 * installation does: nobody starts it, and a visitor arriving halfway through
 * only has to wait to see the beginning. Without it the playhead holds on the
 * final frame.
 *
 * `restartKey` rewinds to 0 whenever it changes. Entering VR uses this:
 * without it, someone who spends thirty seconds finding the headset would put
 * it on to a piece that had already finished playing to an empty room.
 */
export const useRitualClock = ({
    durationSec = 45,
    restartKey = null,
    loop = false
} = {}) => {
    const [playheadSec, setPlayheadSec] = useState(0)
    const [isPlaying, setIsPlaying] = useState(true)
    const [rate, setRateState] = useState(1)

    // The loop reads these instead of closing over state, so pausing or
    // scrubbing never restarts the rAF effect — and therefore never rewinds
    // the piece as a side effect of touching the transport.
    const playheadRef = useRef(0)
    const isPlayingRef = useRef(true)
    const rateRef = useRef(1)
    const durationRef = useRef(durationSec)
    const loopRef = useRef(loop)

    const apply = useCallback((seconds) => {
        const next = Math.min(durationRef.current, Math.max(0, seconds))
        playheadRef.current = next
        setPlayheadSec(next)
        return next
    }, [])

    // Trimming the last clip shortens the piece. Pull the cursor back with it
    // rather than leaving it stranded past the end, where play would look
    // broken and the backdrop would sit on its end-of-piece fallback.
    useEffect(() => {
        durationRef.current = durationSec
        if (playheadRef.current > durationSec) apply(durationSec)
    }, [durationSec, apply])

    // Mirrored into a ref for the same reason as the rest: `advance` must stay
    // stable, so it cannot close over this. In an effect rather than assigned
    // during render — a ref write during render is the lint rule this repo
    // already trips in three other files, and there is no reason to add a
    // fourth for an option that only ever changes if someone rewires the route.
    useEffect(() => {
        loopRef.current = loop
    }, [loop])

    // Only rewinds on an explicit restart or an XR handover. `durationSec` is
    // deliberately NOT a dependency: trimming the last clip in the director
    // panel changes the total, and restarting the piece under the author every
    // time they drag an edge would make the panel unusable.
    //
    // Also runs on mount, which is what starts the piece: the audience path
    // never touches the transport, so autoplay-from-zero has to be the state
    // the clock arrives in.
    useEffect(() => {
        playheadRef.current = 0
        setPlayheadSec(0)
        isPlayingRef.current = true
        setIsPlaying(true)
    }, [restartKey])

    /**
     * Move the playhead on by one frame. Call from the render loop.
     *
     * Stable for the hook's life — it reads refs rather than closing over
     * state, so the driver's `useFrame` subscription never has to be torn down
     * and rebuilt, and pausing or scrubbing cannot restart the piece as a side
     * effect of touching the transport.
     */
    const advance = useCallback((deltaSec) => {
        if (!isPlayingRef.current) return playheadRef.current

        const duration = durationRef.current
        // An empty or not-yet-measured edit list. Dividing into it below would
        // put NaN in the playhead, which silently propagates into every
        // sequence's progress and renders an empty room.
        if (!(duration > 0)) return playheadRef.current

        // Guard the delta itself, not just the result: a negative or NaN frame
        // time from a stalled loop would otherwise run the piece backwards.
        const frameSec = Number.isFinite(deltaSec) ? Math.min(MAX_STEP_SEC, Math.max(0, deltaSec)) : 0
        const next = playheadRef.current + frameSec * rateRef.current

        if (next < duration) {
            playheadRef.current = next
            setPlayheadSec(next)
            return next
        }

        // Past the end. Carry the overshoot into the new pass rather than
        // snapping to 0 — dropping it would stall the seam for a frame every
        // time round, and on a loop that runs all day a visitor eventually
        // watches it happen.
        //
        // The seam needs no transition of its own, though the reason changed on
        // 2026-08-04 when the veil left the render tree. It used to wrap behind
        // bookendAmount, which held the veil up across both t=0 and
        // t=durationSec. Now it survives on the sequences' own envelopes: the
        // last row fades to nothing over the tail of its window (the sphere,
        // `1 - smoothstep(0.9, 1, progress)`) and the tunnel fades up from
        // nothing at t=0, so the piece is dark on both sides of the seam and
        // there is nothing to cut between. That is a property of the FIRST and
        // LAST rows, not of the clock — reorder the edit list and check it
        // still holds. bookendAmount itself is still in transitions.js.
        const wrapped = loopRef.current ? next % duration : duration
        playheadRef.current = wrapped
        setPlayheadSec(wrapped)
        return wrapped
    }, [])

    const play = useCallback(() => {
        // Pressing play on the final frame replays rather than doing nothing —
        // otherwise the button looks broken at the end of every run.
        if (playheadRef.current >= durationRef.current) apply(0)
        isPlayingRef.current = true
        setIsPlaying(true)
    }, [apply])

    const pause = useCallback(() => {
        isPlayingRef.current = false
        setIsPlaying(false)
    }, [])

    const toggle = useCallback(() => {
        if (isPlayingRef.current) pause()
        else play()
    }, [play, pause])

    // Scrubbing pauses. Dragging the cursor and then watching it run away from
    // under the pointer is the single most disorienting thing a timeline can do.
    const seek = useCallback((seconds, { pausePlayback = true } = {}) => {
        if (pausePlayback) {
            isPlayingRef.current = false
            setIsPlaying(false)
        }
        return apply(seconds)
    }, [apply])

    const restart = useCallback(() => {
        apply(0)
        isPlayingRef.current = true
        setIsPlaying(true)
    }, [apply])

    const setRate = useCallback((next) => {
        rateRef.current = next
        setRateState(next)
    }, [])

    return {
        playheadSec,
        durationSec,
        isPlaying,
        rate,
        advance,
        play,
        pause,
        toggle,
        seek,
        restart,
        setRate
    }
}
