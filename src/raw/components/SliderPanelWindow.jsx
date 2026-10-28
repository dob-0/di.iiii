import { useRef, useState } from 'react'
import { formatControlNumber, sliderFraction, sliderRange, sliderValueAt } from './touchControls.js'

// A fader as a window, sized for a thumb. The level everyone agrees on
// travels through node.values (an op, written when the finger lifts); the
// finger's own position is this window's, through the live side channel.
export default function SliderPanelWindow({ node, values = null, onLive = null, onCommit = null }) {
    const resolved = values || node?.values || {}
    const label = resolved.title || node?.label || 'Slider'
    const [lo, hi] = sliderRange(resolved.min ?? 0, resolved.max ?? 1)
    const vertical = resolved.direction !== 'horizontal'
    const authored = Math.min(hi, Math.max(lo, Number(resolved.value) || 0))
    const [live, setLive] = useState(null)
    // The finger as a ref too: pointerup and lostpointercapture arrive back
    // to back, and the second must see the first already let go.
    const fingerRef = useRef(null)
    const trackRef = useRef(null)
    const shown = live ?? authored
    const enabled = Boolean(onCommit)

    const valueAt = (event) => {
        const rect = trackRef.current?.getBoundingClientRect?.() || { left: 0, top: 0, width: 0, height: 0 }
        return sliderValueAt(rect, event.clientX, event.clientY, { min: lo, max: hi, vertical })
    }
    const move = (event) => {
        const next = valueAt(event)
        fingerRef.current = next
        setLive(next)
        onLive?.(node.id, next, true)
    }
    const release = () => {
        const finger = fingerRef.current
        if (finger === null) return
        fingerRef.current = null
        onCommit?.(node.id, finger)
        onLive?.(node.id, null, false)
        setLive(null)
    }
    const nudge = (direction) => {
        const step = (hi - lo) / 100 || 0
        onCommit?.(node.id, Math.min(hi, Math.max(lo, authored + direction * step)))
    }
    const fraction = sliderFraction(shown, lo, hi)

    return (
        <div className={`raw-slider-panel${vertical ? '' : ' is-horizontal'}`}>
            <span className="raw-slider-panel-title">{label}</span>
            <div
                ref={trackRef}
                className={`raw-slider-panel-track${live !== null ? ' is-held' : ''}`}
                role="slider"
                aria-label={label}
                aria-orientation={vertical ? 'vertical' : 'horizontal'}
                aria-valuemin={lo}
                aria-valuemax={hi}
                aria-valuenow={shown}
                aria-disabled={!enabled}
                tabIndex={enabled ? 0 : -1}
                onPointerDown={(event) => {
                    if (!enabled) return
                    event.currentTarget.setPointerCapture?.(event.pointerId)
                    move(event)
                }}
                onPointerMove={(event) => { if (fingerRef.current !== null) move(event) }}
                onPointerUp={release}
                onPointerCancel={release}
                onLostPointerCapture={release}
                onKeyDown={(event) => {
                    if (!enabled) return
                    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') { event.preventDefault(); nudge(1) }
                    if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') { event.preventDefault(); nudge(-1) }
                }}
            >
                <span
                    className="raw-slider-panel-fill"
                    style={vertical ? { height: `${fraction * 100}%` } : { width: `${fraction * 100}%` }}
                />
            </div>
            <span className="raw-slider-panel-value">{formatControlNumber(shown)}</span>
        </div>
    )
}
