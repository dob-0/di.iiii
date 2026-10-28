// THE SHOW'S CLOCK — a rig's cue list played with no desk (RIG_BUILD.md §16).
//
// On a hosted tier there is no light desk (/light runs on a local install only), so
// nothing fires the cues. Instead every viewer computes the cue that is on right now
// from the document alone:
//
//     t = (now − showEpoch) mod loopLength
//
// `showEpoch` (mappingState.showEpoch, ms since 1970 UTC) is the moment the list
// started; the list is mappingState.cues with the same meaning the desk's cue runner
// gives it (serverXR/src/lighting/cuerun.js): a cue fires its look, fades in over
// `fade` seconds from the moment it fires, and after `hold` seconds (counted from the
// same moment) the next cue fires. A cue whose hold is 0 waits for GO — with no one to
// press GO, the clock stops there and that look stays up. `loop` takes the list from
// its last cue back to cue 1. So the viewer's timeline is exactly the desk's, and two
// viewers anywhere compute the same cue at the same instant (to the accuracy of their
// clocks: `serverClock.js` corrects each to the server's).
//
// Precedence (who drives the room), highest first — `showDriver` below:
//   1. explicit  — a page's own GO (the cards page with no desk: a per-tab preview)
//   2. desk      — a light desk answers here (a local install): the desk is the driver,
//                  even when it is dark; this clock never runs beside it — UNLESS the
//                  document says `mappingState.showSource: 'clock'` (§15.8): then its
//                  own clock plays it, desk or no desk
//   3. clock     — no desk, and the document carries a show (cues with rig looks and a
//                  showEpoch): this file
//   4. document  — none of those: the room as saved
// While the desk probe has not answered, the room waits (`pending`) rather than
// starting the clock and snapping to the desk a moment later.
//
// Pure: no React, no timers, no fetch. `now` is always passed in.

import { cueClockAt } from '../shared/cueClock.js'
import { deskLookId, lookIdOfDesk } from './looks.js'

/** The show a document carries, or null. Only cues that fire a RIG look count. */
export const showOf = (document) => {
    const ms = document?.mappingState
    if (!ms || typeof ms !== 'object') return null
    const epoch = ms.showEpoch
    if (typeof epoch !== 'number' || !Number.isFinite(epoch) || epoch <= 0) return null
    const cues = (Array.isArray(ms.cues) ? ms.cues : [])
        .filter((c) => c && lookIdOfDesk(c.lightLook))
        .map((c, i) => ({
            id: typeof c.id === 'string' && c.id ? c.id : `cue-${i + 1}`,
            name: typeof c.name === 'string' && c.name ? c.name : lookIdOfDesk(c.lightLook),
            lookId: lookIdOfDesk(c.lightLook),
            holdMs: Math.max(0, Math.min(3600, Number(c.hold) || 0)) * 1000,
            fadeMs: Math.max(0, Math.min(60, Number(c.fade) || 0)) * 1000
        }))
    if (!cues.length) return null
    return { epoch, loop: ms.loop === true, cues, ...(ms.showSource === 'clock' ? { source: 'clock' } : {}) }
}

/**
 * The show laid out in time: each cue's start (ms after the epoch), and the length of
 * one pass. The list ends at the first cue that waits for GO (hold 0) — nobody presses
 * GO on a hosted page — or at its last cue. It loops only when `loop` is on AND every
 * cue moves on by itself.
 */
export const showTimeline = (show) => {
    if (!show?.cues?.length) return null
    const steps = []
    let at = 0
    let stopsAt = -1
    for (let i = 0; i < show.cues.length; i += 1) {
        const cue = show.cues[i]
        steps.push({ ...cue, index: i, startMs: at })
        if (cue.holdMs <= 0) { stopsAt = i; break }
        at += cue.holdMs
    }
    const loops = show.loop && stopsAt < 0 && at > 0
    return { steps, lengthMs: at, loops, n: show.cues.length }
}

/**
 * Where the show is at `now` (ms since 1970 UTC, already corrected to the server).
 * Returns { index, n, lookId, name, firedAt, fadeMs, fromLookId, nextInMs, cycle, ended }
 * — `firedAt` on the same clock as `now`; `fromLookId` is the look the fade comes from
 * (null for the very first cue of a list that does not loop). The arithmetic is the
 * shared cue clock's (shared/cueClock.cjs), the one the desk's runner and the Cue node
 * read too; `ended` here also covers a cue that waits for GO: no one presses it here.
 */
export const showStateAt = (show, now) => {
    if (!show?.cues?.length) return null
    const state = cueClockAt({ list: show.cues, epoch: show.epoch, loop: show.loop === true, now })
    if (!state) return null
    const from = state.from >= 0 ? show.cues[state.from].lookId : null
    return {
        index: state.index,
        n: state.n,
        lookId: state.lookId,
        name: state.name,
        firedAt: state.firedAt,
        fadeMs: state.fadeMs,
        fromLookId: from && from !== state.lookId ? from : null,
        nextInMs: state.nextInMs,
        cycle: state.cycle,
        ended: state.ended || state.waiting
    }
}

/**
 * The clock's state in the shape the desk's fade record has (useLightingMirror's
 * `lookFadeOf`: desk look ids), so the room draws a clock cue's fade through the same
 * code as a desk cue's.
 */
export const clockFadeOf = (state) => (state
    ? { lookId: deskLookId(state.lookId), from: state.fromLookId ? deskLookId(state.fromLookId) : null, fadeMs: state.fadeMs, firedAt: state.firedAt }
    : null)

/** Who drives the room — see the precedence at the top of this file. */
export const showDriver = ({ explicit, deskChecked, deskPresent, show }) => {
    if (explicit !== undefined) return 'explicit'
    // a document that says its show plays by its own clock (mappingState.showSource
    // 'clock') is not driven by a desk that happens to answer here: the desk holds
    // another project's show (RIG_BUILD.md §15.8)
    if (show?.source === 'clock') return 'clock'
    if (deskPresent) return 'desk'
    if (!show) return 'document'
    if (!deskChecked) return 'pending'
    return 'clock'
}

/** "2 / 5 · Red room · next in 12 s · loop" — the show chip's line. */
export const showWords = (state, show) => {
    if (!state) return ''
    const parts = [`${state.index + 1} / ${state.n}`, state.name]
    if (state.nextInMs != null) parts.push(`next in ${Math.max(1, Math.ceil(state.nextInMs / 1000))} s`)
    else if (state.ended) parts.push('holds')
    if (show?.loop && !state.ended) parts.push('loop')
    return parts.join(' · ')
}
