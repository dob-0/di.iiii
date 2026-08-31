import { useCallback, useEffect, useMemo, useState } from 'react'
import { isTypingInto } from '../../hooks/useAutoHideChrome.js'

// Undo for the edit list.
//
// WHY COALESCING IS THE WHOLE PROBLEM.
//
// A naive history pushes an entry every time the state changes, which is fine
// for "delete a clip" and useless for everything else in this panel. Dragging a
// gizmo handle calls setEditList on every pointer move — a two-second drag is
// a hundred and twenty state changes, so Ctrl+Z would rewind the drag one
// imperceptible frame at a time and the author would have to hold it down for
// two seconds to get back to where they started. Same for dragging a clip edge
// on the timeline, or scrubbing a light's intensity.
//
// So an entry is recorded only when a change arrives after a QUIET GAP. The
// first change of a drag lands after such a gap and records the state as it was
// BEFORE the drag; every change after it is inside the gap and merges into that
// same entry. One drag, one undo — which is what a person means by "undo that".
//
// The alternative is asking every call site to declare its own transaction
// boundaries, which the gizmo could do (it already has onDragStart) but a
// slider, a text field and a future control would each have to remember to. A
// rule that works without cooperation cannot be forgotten by the next control
// someone adds.

/**
 * Quiet gap that separates one undoable action from the next.
 *
 * Long enough to swallow the gap between pointer-move events on a slow frame,
 * short enough that two deliberate edits are never welded together — nudge a
 * clip, pause, nudge it again, and that is two undos because it was two acts.
 */
export const COALESCE_MS = 450

/**
 * Depth of the stack. Bounded because entries are whole edit lists: the piece
 * is small, but an unbounded stack in a session left open all day at an
 * exhibition is a leak with no upper limit.
 */
export const MAX_HISTORY = 80

/** Ctrl/Cmd+Z. Shift makes it a redo, matching every editor on both platforms. */
export const readHistoryIntent = (event) => {
    if (!event) return null
    // Typing into a field must reach the browser's own text undo. Stealing
    // Ctrl+Z there would rewind the timeline while someone was fixing a typo in
    // a sequence title — a much bigger surprise than the one it would fix.
    if (isTypingInto(event.target)) return null

    const accel = event.metaKey || event.ctrlKey
    if (!accel || event.altKey) return null

    const key = typeof event.key === 'string' ? event.key.toLowerCase() : ''
    if (key === 'z') return event.shiftKey ? 'redo' : 'undo'
    // Ctrl+Y is the Windows redo. Harmless to honour on mac, where nobody
    // presses it.
    if (key === 'y' && !event.shiftKey) return 'redo'
    return null
}

const EMPTY = Object.freeze([])

/**
 * @param initial   first present value
 * @param enabled   false for the audience build — no listener, no stack
 */
export const useEditHistory = (initial, { enabled = true } = {}) => {
    const [state, setState] = useState(() => ({
        past: EMPTY,
        present: initial,
        future: EMPTY,
        // Timestamp of the last recorded change, carried in state rather than a
        // ref so the coalescing decision is made against the same snapshot the
        // updater is working from. A ref would be read outside the updater and
        // could be stale under React 18 batching.
        lastAt: 0
    }))

    const set = useCallback((updater) => {
        const at = Date.now()
        setState((current) => {
            const next = typeof updater === 'function' ? updater(current.present) : updater
            // Identity check, not a deep compare: every writer here returns a
            // fresh array when it changes anything, so an identical reference
            // means nothing happened and does not deserve an undo step.
            if (next === current.present) return current

            const continues = at - current.lastAt < COALESCE_MS
            return {
                past: continues ? current.past : [...current.past, current.present].slice(-MAX_HISTORY),
                present: next,
                // Any new edit abandons the redo branch. Keeping it would let
                // Ctrl+Y jump to a state that never followed from this one.
                future: EMPTY,
                lastAt: at
            }
        })
    }, [])

    const undo = useCallback(() => {
        setState((current) => {
            if (!current.past.length) return current
            return {
                past: current.past.slice(0, -1),
                present: current.past[current.past.length - 1],
                future: [current.present, ...current.future].slice(0, MAX_HISTORY),
                // Reset the clock so the next edit always opens a new entry.
                // Without this, an edit made within the gap after an undo would
                // merge into the step just undone and quietly eat it.
                lastAt: 0
            }
        })
    }, [])

    const redo = useCallback(() => {
        setState((current) => {
            if (!current.future.length) return current
            return {
                past: [...current.past, current.present].slice(-MAX_HISTORY),
                present: current.future[0],
                future: current.future.slice(1),
                lastAt: 0
            }
        })
    }, [])

    useEffect(() => {
        if (!enabled || typeof window === 'undefined') return undefined

        const onKey = (event) => {
            const intent = readHistoryIntent(event)
            if (!intent) return
            event.preventDefault()
            if (intent === 'undo') undo()
            else redo()
        }

        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [enabled, undo, redo])

    return useMemo(() => ({
        present: state.present,
        set,
        undo,
        redo,
        canUndo: state.past.length > 0,
        canRedo: state.future.length > 0
    }), [state.present, state.past.length, state.future.length, set, undo, redo])
}

export default useEditHistory
