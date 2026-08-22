// Keeping the sound ON, which is a different problem from turning it on.
//
// A gesture unlock -- armAudioUnlock() in algoVrithm/reelPlayers.js, the wait
// inside utils/videoPlayback.js -- answers "has there been a gesture yet?".
// That is a ONE-SHOT question: it fires once, hands the waiters their callback,
// removes its listeners and is done for the life of the page. Correct for what
// it is for — autoplay permission is granted once and never revoked.
//
// This answers a different question, and it is one that comes back:
//
//     is the AudioContext still RUNNING?
//
// ---- WHY THAT IS NOT THE SAME QUESTION -------------------------------------
//
// A context can be suspended long after it was resumed, by things no gesture
// caused and no code here asked for:
//
//   - ENTERING AN IMMERSIVE SESSION on a standalone headset. The device
//     switches audio output as the session starts, and the context does not
//     always survive the switch. This is the piece's worst case because it
//     happens at exactly the moment the visitor puts themselves inside the
//     work: scored on the flat page, silent from the instant it matters.
//   - The tab being backgrounded, or the headset sleeping and waking.
//
// Before this file, none of those had a way back. `audioUnlocked` was already
// true, so armAudioUnlock() early-returned for any later caller; its window
// listeners were registered `once` and had long since been removed; and the
// only resume() calls in the piece were inside those one-shot waiters. So a
// context suspended AFTER the first gesture stayed suspended for the rest of
// the session, and no amount of clicking brought it back. The symptom is the
// whole piece going quiet at once — score and reels together, because both
// listeners share ONE context (three's AudioContext.getContext() is a module
// singleton), which is what tells you it is the context and not the wiring.
//
// It lives under utils/ rather than in the piece it was written for because the
// question is not algovrithm's: any surface that puts a sound in a room —
// spatial video in a published space, an audio object, the piece — is a headset
// audio-device switch away from the same silence.
//
// ---- THE SHAPE OF THE FIX --------------------------------------------------
//
// Every registered context is resumed on any gesture, on the tab becoming
// visible again, on XR session start (wired in SpatialScore), and — the one
// that catches the cases nobody predicted — whenever the context itself reports
// that it has gone `suspended`.
//
// The listeners are deliberately NOT `once`. They are the cheapest possible
// handlers (a string compare against context.state) and they have to survive,
// because the whole point is that this can happen more than once.
//
// A resume() that the browser refuses is not an error here: it means there has
// been no user activation yet, the piece is correctly silent, and the next
// gesture will call this again. Rejections are swallowed for that reason.

const contexts = new Set()
let armed = false

const resumeContext = (context) => {
    if (!context || context.state !== 'suspended') return
    // resume() returns undefined rather than a promise in some environments
    // (jsdom among them), so the result is not assumed to be thenable.
    const attempt = context.resume?.()
    if (attempt && typeof attempt.catch === 'function') attempt.catch(() => {})
}

/** Resume every registered context that has fallen asleep. */
export const resumeAudio = () => { contexts.forEach(resumeContext) }

const WAKE_EVENTS = ['pointerdown', 'pointerup', 'keydown', 'touchstart', 'click']

const armWakeListeners = () => {
    if (armed || typeof window === 'undefined') return
    armed = true

    WAKE_EVENTS.forEach((name) => {
        window.addEventListener(name, resumeAudio, { passive: true })
    })

    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) resumeAudio()
        })
    }
}

/**
 * Register a context to be kept awake, and try to wake it now.
 *
 * Returns the matching unregister, so a component can hand this straight back
 * from an effect.
 *
 * The `statechange` watch is marked on the context rather than tracked here
 * because the context outlives every component in the piece — three builds it
 * once for the page — so a remount must not stack a second listener on it.
 */
export const keepAudioAwake = (context) => {
    if (!context) return () => {}

    contexts.add(context)
    armWakeListeners()

    if (!context.__diiAudioWakeWatched && typeof context.addEventListener === 'function') {
        context.__diiAudioWakeWatched = true
        // Only a real transition fires this, so a resume() the browser refuses
        // cannot spin: the state never changed, so there is nothing to report.
        context.addEventListener('statechange', () => {
            if (context.state === 'suspended') resumeContext(context)
        })
    }

    resumeContext(context)

    return () => { contexts.delete(context) }
}

/** Test seam — the module-level registry is per-page state in the real app. */
export const __resetAudioWake = () => {
    contexts.clear()
    armed = false
}
