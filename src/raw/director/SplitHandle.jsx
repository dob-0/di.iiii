/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex --
 * A FOCUSABLE separator is a widget, not a non-interactive element: ARIA
 * defines exactly this as the window-splitter pattern, where role="separator"
 * plus tabindex and aria-valuenow makes the divider operable by keyboard. The
 * two rules below only know the static separator (a decorative rule between
 * sections), which genuinely should take neither focus nor handlers.
 *
 * Scoped to this file because this file is one element and that element IS the
 * pattern. The alternative — a <button> — would be a lie about what this does
 * and would lose the value semantics a screen reader reads out while resizing.
 */
import { useCallback } from 'react'
import { MAX_SPLIT, MIN_SPLIT, clampSplit, splitFromPointer } from './splitLayout.js'

// The bar between the piece and the editor.
//
// It is a sibling of both halves rather than a child of the editor: the editor
// clips its own overflow (so a long clip list scrolls instead of escaping), and
// a handle living inside it would be clipped away at exactly the seam it needs
// to straddle.

/** Keyboard nudge. Two percent is about one row of the panel. */
const STEP = 0.02

export default function SplitHandle({ split, onSplit }) {
    const onPointerDown = useCallback((event) => {
        // Capture on the bar itself, so a fast drag that outruns the pointer
        // keeps resizing instead of dropping the moment the cursor leaves a
        // 9px strip.
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
    }, [])

    const onPointerMove = useCallback((event) => {
        // Capture is the drag state — no ref needed, and no way for a stale
        // flag to leave the layout following the mouse after a lost pointerup.
        if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) return
        // Measured against the handle's OWN offsetParent, not the window. The
        // two are the same thing while the piece owns the viewport, and are not
        // when it is embedded in Studio's director page — there the root starts
        // below a header, and using window.innerHeight would leave the seam
        // tracking the cursor with a constant offset equal to that header.
        const host = event.currentTarget.offsetParent
        const box = host?.getBoundingClientRect()
        onSplit(box
            ? splitFromPointer(event.clientY - box.top, box.height)
            : splitFromPointer(event.clientY, window.innerHeight))
    }, [onSplit])

    const onPointerUp = useCallback((event) => {
        event.currentTarget.releasePointerCapture?.(event.pointerId)
    }, [])

    const onKeyDown = useCallback((event) => {
        // Up moves the divider up, which grows the editor — the same thing the
        // drag does, so the two cannot disagree about which way is which.
        if (event.key === 'ArrowUp') {
            event.preventDefault()
            onSplit(clampSplit(split + STEP))
        } else if (event.key === 'ArrowDown') {
            event.preventDefault()
            onSplit(clampSplit(split - STEP))
        }
    }, [onSplit, split])

    return (
        <div
            className="algo-vrithm-split-handle"
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize the editor"
            aria-valuenow={Math.round(clampSplit(split) * 100)}
            aria-valuemin={Math.round(MIN_SPLIT * 100)}
            aria-valuemax={Math.round(MAX_SPLIT * 100)}
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
        />
    )
}
