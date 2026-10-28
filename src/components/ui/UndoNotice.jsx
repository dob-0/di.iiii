import { useEffect, useState } from 'react'
import './ui.css'

// The other half of "never lose work": act now, say what happened, keep Undo
// in reach for 10 seconds. Hover or focus holds the clock so a slow hand still
// gets there. role=status: read out politely, takes no focus.

export const UNDO_MS = 10000

export default function UndoNotice({ message, undoLabel = 'Undo', onUndo, onDismiss, duration = UNDO_MS }) {
    const [held, setHeld] = useState(false)

    useEffect(() => {
        if (held) return undefined
        const timer = setTimeout(() => onDismiss?.(), duration)
        return () => clearTimeout(timer)
    }, [held, duration, message, onDismiss])

    return (
        <div
            className="di-undo-notice"
            role="status"
            onMouseEnter={() => setHeld(true)}
            onMouseLeave={() => setHeld(false)}
            onFocus={() => setHeld(true)}
            onBlur={() => setHeld(false)}
        >
            <span>{message}</span>
            <button type="button" className="di-undo-button" onClick={() => { onUndo?.(); onDismiss?.() }}>
                {undoLabel}
            </button>
        </div>
    )
}
