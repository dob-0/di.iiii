import { useEffect, useRef } from 'react'

// The desk's Go button, as a window: one big pressable surface. A press is a
// live event, not a document edit — it travels through the live side channel
// (Presses counts up there), so Ctrl+Z undoes work, never the show's cues.
// Held is the finger on it right now, released if the window goes away.
export default function ButtonPanelWindow({ node, values = null, presses = null, onPress = null, onHeld = null }) {
    const resolved = values || node?.values || {}
    const label = resolved.title || node?.label || 'Button'
    const count = Math.max(0, Number(presses ?? resolved.presses) || 0)
    const heldRef = useRef(false)
    const onHeldRef = useRef(onHeld)
    useEffect(() => { onHeldRef.current = onHeld })
    const hold = (held) => {
        if (heldRef.current === held) return
        heldRef.current = held
        onHeld?.(node.id, held)
    }
    // A window closed while pressed must not leave Pressed stuck on.
    useEffect(() => () => {
        if (heldRef.current) onHeldRef.current?.(node.id, false)
    }, [node.id])

    return (
        <div className="raw-button-panel">
            <button
                type="button"
                className="raw-button-panel-go"
                disabled={!onPress}
                onPointerDown={() => {
                    hold(true)
                    onPress?.(node.id)
                }}
                onPointerUp={() => hold(false)}
                onPointerLeave={() => hold(false)}
            >
                {label}
            </button>
            <span className="raw-button-panel-count">{count} presses</span>
        </div>
    )
}
