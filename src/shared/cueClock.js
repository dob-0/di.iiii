// GENERATED from shared/cueClock.cjs by scripts/rigbuild/cue-clock-twin.mjs — edit the .cjs, then run it.
// THE CUE CLOCK — where a cue list is at a moment, as one pure function (2026-10-21).
//
// A project's cue list (mappingState.cues: { id, name, fade, hold, lightLook, … }) is played in three
// places, and they must agree on what "now" is:
//   - the desk's cue runner (serverXR/src/lighting/cuerun.js) where a desk runs: the one driver there;
//   - the show's clock (src/rigbuild/showClock.js) on a hosted tier: every viewer computes the cue from
//     mappingState.showEpoch, with no desk;
//   - the Cue node (src/project/nodes/signal.cue) in a graph: the same list, as wires.
// The rules are the desk's: a cue fades in over `fade` seconds from the moment it fires, and its `hold`
// counts from the SAME moment; when the hold is served the next cue fires. A hold of 0 waits for GO.
// `loop` takes the list from its last cue back to the first. GO fires the next cue (past the last with
// no loop: the list has ended), BACK the one before (never before the first), JUMP a named cue.
//
// cueClockAt answers from (list, epoch, loop, now, events) alone — no timers, no Date.now(), no state —
// so two windows given the same inputs give the same answer, and the server and the browser run the
// same lines (src/shared/cueClock.js is GENERATED from this file: scripts/rigbuild/cue-clock-twin.mjs).

// The desk's own bounds on a cue (serverXR/src/lighting/cuerun.js sanitizeCue), in seconds.
const MAX_HOLD_S = 3600
const MAX_FADE_S = 60

const clampSeconds = (v, hi) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.max(0, Math.min(hi, n)) : 0
}
const text = (v) => (typeof v === 'string' ? v : '')

/**
 * A document's cues (or the desk's list) as the clock reads them: times in ms, the look as `lookId`
 * (a document cue's `lightLook`, a desk cue's `lookId`). Every cue is kept, with or without a look. Pure.
 */
const cueListOf = (cues) => (Array.isArray(cues) ? cues : [])
    .filter((c) => c && typeof c === 'object')
    .map((c, i) => ({
        id: text(c.id) || `cue-${i + 1}`,
        name: text(c.name) || text(c.lightLook) || text(c.lookId),
        lookId: text(c.lightLook) || text(c.lookId),
        fadeMs: clampSeconds(c.fade, MAX_FADE_S) * 1000,
        holdMs: clampSeconds(c.hold, MAX_HOLD_S) * 1000
    }))

/** The cue GO fires after `current`: past the last, the first while looping, else none (-1). */
const nextCueIndex = (current, n, loop) => {
    if (!n) return -1
    const next = current + 1
    if (next < n) return next
    return loop ? 0 : -1
}

/**
 * How far into one cue `now` is. `progress` runs 0 … 1 over the cue's length in time, which is its hold
 * (the hold counts from the fire, so the fade sits inside it) or its fade when the fade is the longer
 * of the two; a cue with neither is at 1 the moment it fires. `fading` is true while the fade runs.
 */
const cueProgressAt = (cue, firedAt, now) => {
    if (!cue || !Number.isFinite(firedAt) || !Number.isFinite(now)) return { progress: 0, fading: false, elapsedMs: 0 }
    const elapsedMs = now - firedAt
    if (elapsedMs < 0) return { progress: 0, fading: false, elapsedMs: 0 }
    const fadeMs = Math.max(0, Number(cue.fadeMs) || 0)
    const span = Math.max(fadeMs, Math.max(0, Number(cue.holdMs) || 0))
    return { progress: span > 0 ? Math.min(1, elapsedMs / span) : 1, fading: elapsedMs < fadeMs, elapsedMs }
}

// One pass of a list that moves on by itself and loops: every hold > 0. Else 0 (it never wraps unaided).
const loopLengthOf = (list, loop) => {
    if (!loop) return 0
    let total = 0
    for (const cue of list) {
        if (!(cue.holdMs > 0)) return 0
        total += cue.holdMs
    }
    return total
}

// The clock alone, from a fired cue to `until`: each served hold fires the next cue at the moment the
// hold ends. A loop's whole passes are skipped by arithmetic, so a show a week old costs one pass.
const run = (list, loop, length, state, until) => {
    const n = list.length
    let { index, firedAt, from, cycle } = state
    let ended = false
    for (let guard = 0; guard <= 2 * n + 1; guard += 1) {
        const hold = list[index].holdMs
        if (!(hold > 0) || firedAt + hold > until) break
        const next = nextCueIndex(index, n, loop)
        if (next < 0) { ended = true; break }
        if (next === 0) {
            cycle += 1
            if (length > 0) {
                const whole = Math.floor((until - (firedAt + hold)) / length)
                if (whole > 0) { cycle += whole; firedAt += whole * length }
            }
        }
        from = index
        firedAt += hold
        index = next
    }
    return { index, firedAt, from, cycle, ended }
}

const fire = (state, index, at) => ({ index, firedAt: at, from: state.index, cycle: state.cycle, ended: false })

/**
 * Where a cue list is at `now`.
 *   list    cueListOf(cues)
 *   epoch   when cue 1 fired by the clock (ms on the same clock as `now`), or null: no clock start —
 *           the list waits for its first GO
 *   loop    last cue → first
 *   events  [{ at, kind: 'go' | 'back' | 'jump', index? }], a person's presses, in time order; one at or
 *           before `now` counts, a later one does not yet
 * Returns null for an empty list, else
 *   { index, n, id, name, lookId, fadeMs, holdMs, firedAt, from, cycle, progress, fading, nextInMs,
 *     waiting, ended, started }
 * `index` is -1 until something fires the first cue. `from` is the index the current cue came after
 * (-1: none). `waiting`: a hold of 0, the list holds until GO. `ended`: past the last cue with no loop.
 * `nextInMs`: until the clock fires the next cue by itself, null when it never will.
 */
const cueClockAt = ({ list, epoch = null, loop = false, now, events = [] } = {}) => {
    const cues = Array.isArray(list) ? list : []
    const n = cues.length
    if (!n || !Number.isFinite(now)) return null
    const length = loopLengthOf(cues, loop)
    let state = { index: -1, firedAt: null, from: -1, cycle: 0, ended: false }
    if (Number.isFinite(epoch)) {
        state = { index: 0, firedAt: epoch, from: length > 0 ? n - 1 : -1, cycle: 0, ended: false }
        // A looping list read before its start counts backwards on the same grid.
        if (now < epoch && length > 0) {
            const back = Math.floor((now - epoch) / length)
            state = { ...state, firedAt: epoch + back * length, cycle: back }
        }
    }
    for (const event of Array.isArray(events) ? events : []) {
        const at = Number(event?.at)
        if (!Number.isFinite(at) || at > now) continue
        if (state.index >= 0 && state.firedAt <= at) state = run(cues, loop, length, state, at)
        const kind = event.kind
        if (kind === 'go') {
            const next = state.index < 0 ? 0 : nextCueIndex(state.index, n, loop)
            state = next < 0 ? { ...state, ended: true } : fire(state, next, at)
        } else if (kind === 'back') {
            state = fire(state, Math.max(0, state.index - 1), at)
        } else if (kind === 'jump') {
            const k = Number(event.index)
            if (Number.isInteger(k) && k >= 0 && k < n) state = fire(state, k, at)
        }
    }
    if (state.index < 0) {
        return { index: -1, n, id: '', name: '', lookId: '', fadeMs: 0, holdMs: 0, firedAt: null, from: -1, cycle: 0, progress: 0, fading: false, nextInMs: null, waiting: true, ended: false, started: false }
    }
    if (!state.ended && state.firedAt <= now) state = run(cues, loop, length, state, now)
    const cue = cues[state.index]
    const waiting = !(cue.holdMs > 0)
    const { progress, fading } = state.ended ? { progress: 1, fading: false } : cueProgressAt(cue, state.firedAt, now)
    return {
        index: state.index,
        n,
        id: cue.id,
        name: cue.name,
        lookId: cue.lookId,
        fadeMs: cue.fadeMs,
        holdMs: cue.holdMs,
        firedAt: state.firedAt,
        from: state.from,
        cycle: state.cycle,
        progress,
        fading,
        nextInMs: state.ended || waiting ? null : Math.max(0, state.firedAt + cue.holdMs - now),
        waiting,
        ended: state.ended,
        started: now >= state.firedAt
    }
}

export { MAX_HOLD_S, MAX_FADE_S, cueListOf, nextCueIndex, cueProgressAt, cueClockAt }
