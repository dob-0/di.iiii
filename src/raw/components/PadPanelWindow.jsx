import { useRef, useState } from 'react'
import { formatControlNumber, padPointAt } from './touchControls.js'

const unit = (value) => Math.min(1, Math.max(-1, Number(value) || 0))

// A two-axis pad as a window, sized for a thumb. With Spring back on it is
// a stick: letting go returns to the centre. Off, it keeps where the
// finger left it. The point everyone agrees on travels through node.values
// (an op on release); the finger itself is this window's, through the live
// side channel.
export default function PadPanelWindow({ node, values = null, onLive = null, onCommit = null }) {
    const resolved = values || node?.values || {}
    const label = resolved.title || node?.label || 'Pad'
    const spring = resolved.spring !== false && resolved.spring !== 'false'
    const authored = { x: unit(resolved.x), y: unit(resolved.y) }
    const [live, setLive] = useState(null)
    // The finger as a ref too: pointerup and lostpointercapture arrive back
    // to back, and the second must see the first already let go.
    const fingerRef = useRef(null)
    const areaRef = useRef(null)
    const shown = live ?? authored
    const enabled = Boolean(onCommit)

    const move = (event) => {
        const rect = areaRef.current?.getBoundingClientRect?.() || { left: 0, top: 0, width: 0, height: 0 }
        const next = padPointAt(rect, event.clientX, event.clientY)
        fingerRef.current = next
        setLive(next)
        onLive?.(node.id, next, true)
    }
    const release = () => {
        const finger = fingerRef.current
        if (finger === null) return
        fingerRef.current = null
        const rest = spring ? { x: 0, y: 0 } : finger
        if (rest.x !== authored.x || rest.y !== authored.y) onCommit?.(node.id, rest)
        onLive?.(node.id, null, false)
        setLive(null)
    }

    return (
        <div className="raw-pad-panel">
            <span className="raw-pad-panel-title">{label}</span>
            <div
                ref={areaRef}
                className={`raw-pad-panel-area${live !== null ? ' is-held' : ''}`}
                role="application"
                aria-label={label}
                aria-disabled={!enabled}
                onPointerDown={(event) => {
                    if (!enabled) return
                    event.currentTarget.setPointerCapture?.(event.pointerId)
                    move(event)
                }}
                onPointerMove={(event) => { if (fingerRef.current !== null) move(event) }}
                onPointerUp={release}
                onPointerCancel={release}
                onLostPointerCapture={release}
            >
                <span
                    className="raw-pad-panel-dot"
                    style={{ left: `${(shown.x + 1) * 50}%`, top: `${(1 - shown.y) * 50}%` }}
                />
            </div>
            <span className="raw-pad-panel-value">
                X {formatControlNumber(shown.x)} · Y {formatControlNumber(shown.y)}
            </span>
        </div>
    )
}
