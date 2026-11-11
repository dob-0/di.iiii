/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex --
 * A FOCUSABLE separator is the WAI-ARIA window splitter (role="separator" + tabindex + aria-valuenow):
 * a widget, not a decorative rule. Same reasoning and same scope as src/raw/director/SplitHandle.jsx.
 */
import { useEffect, useRef } from 'react'
import { keyValue } from './deckLayout.js'

// One draggable border of the deck (the lead's decision D7 to D10).
//
// - Pointer: capture on the seam itself; the live size goes out through onPreview on
//   requestAnimationFrame (the parent writes a CSS variable: NO React state per move, no document op).
//   The value is committed once, on pointerup.
// - Keys: the WAI-ARIA window splitter (https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/).
//   The handlers sit here and stop the event, so the deck's own key listener never sees them.
// - Double-click: back to today's size (onReset).
//
// `read()` returns the seam's sizes in px NOW ({ value, min, max, dim }), measured by the parent: a
// fresh read at the start of each drag and key, so a stale prop can never move the wrong amount.
// `sign` is +1 when moving the seam right (or up) grows the value, -1 when it shrinks it.
// While a drag is open the deck root carries data-seam-dragging (CSS: no text selection).
const MARK = 'data-seam-dragging'
const ARROWS = { vertical: ['ArrowLeft', 'ArrowRight'], horizontal: ['ArrowUp', 'ArrowDown'] }

export default function DeckSeam({ id, orientation, label, controls, now, sign = 1, read, onPreview, onCommit, onCancel, onReset }) {
    const drag = useRef(null)
    const frame = useRef(0)
    const restore = useRef(null)
    const vertical = orientation === 'vertical'
    const dim = now.dim || 1
    const percent = (px) => Math.round((px / dim) * 100)

    useEffect(() => () => {
        if (frame.current) cancelAnimationFrame(frame.current)
        drag.current?.deck?.removeAttribute(MARK)
    }, [])

    const onPointerDown = (event) => {
        if (event.button !== undefined && event.button !== 0) return
        event.preventDefault()
        event.stopPropagation()
        // A second finger or pointer while a drag is open must not take the drag over.
        if (drag.current) return
        const state = read()
        const deck = event.currentTarget.closest('.vj-deck')
        drag.current = { ...state, pointerId: event.pointerId, deck, start: vertical ? event.clientX : event.clientY, next: state.value }
        event.currentTarget.setPointerCapture?.(event.pointerId)
        event.currentTarget.classList.add('is-dragging')
        deck?.setAttribute(MARK, id)
    }

    const onPointerMove = (event) => {
        const current = drag.current
        if (!current || event.pointerId !== current.pointerId) return
        const delta = (vertical ? event.clientX : event.clientY) - current.start
        // Down grows a horizontal seam's value the other way round: the seam sits ABOVE the bottom row.
        const raw = current.value + sign * (vertical ? delta : -delta)
        current.next = Math.min(current.max, Math.max(current.min, raw))
        if (!frame.current) {
            frame.current = requestAnimationFrame(() => {
                frame.current = 0
                if (drag.current) onPreview(id, drag.current.next)
            })
        }
    }

    const finish = (event, commit) => {
        const current = drag.current
        if (current && event.pointerId !== current.pointerId) return
        drag.current = null
        if (frame.current) { cancelAnimationFrame(frame.current); frame.current = 0 }
        event.currentTarget.classList.remove('is-dragging')
        current?.deck?.removeAttribute(MARK)
        event.currentTarget.releasePointerCapture?.(event.pointerId)
        if (!current) return
        // Only a real move of one pixel or more stores a size: a click with jitter, or a drag out
        // and back, leaves the layout unset.
        if (commit && Math.abs(current.next - current.value) >= 1) onCommit(id, current.next, { immediate: true })
        else onCancel(id)
    }

    const onKeyDown = (event) => {
        if (event.ctrlKey || event.metaKey || event.altKey) return
        if (event.key === 'Escape') {
            event.stopPropagation()
            event.currentTarget.blur()
            return
        }
        const state = read()
        const target = keyValue(event.key, event.shiftKey, { ...state, sign, restore: restore.current })
        if (!ARROWS[orientation].concat(['Home', 'End', 'Enter']).includes(event.key)) return
        event.preventDefault()
        event.stopPropagation()
        if (target == null || target === state.value) return
        if (event.key === 'Enter' && target === state.min) restore.current = state.value
        onCommit(id, target, { immediate: false })
    }

    return (
        <div
            className="vj-deck-seam"
            data-seam={id}
            role="separator"
            tabIndex={0}
            aria-orientation={orientation}
            aria-label={label}
            aria-controls={controls}
            aria-valuenow={percent(now.value)}
            aria-valuemin={percent(now.min)}
            aria-valuemax={percent(now.max)}
            title="Drag to resize. Double-click to reset."
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(event) => finish(event, true)}
            onPointerCancel={(event) => finish(event, false)}
            onLostPointerCapture={(event) => finish(event, false)}
            onDoubleClick={(event) => { event.stopPropagation(); onReset(id) }}
            onKeyDown={onKeyDown}
        />
    )
}
