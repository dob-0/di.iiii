import { useCallback, useEffect, useRef, useState } from 'react'
import '../styles/scrubNumber.css'

// TouchDesigner/Blender-style numeric field: press-drag horizontally to
// change the value continuously, click (no drag) to type. Built for the
// "I can't click and drag and change the value" ask (2026-09-14) — every
// numeric field in PropertyInspector (single numbers and each vector
// component) uses this instead of a plain <input type="number">.

const DRAG_THRESHOLD_PX = 3

// Pure helpers, exported for unit testing independent of pointer/DOM wiring.

export function getModifierMultiplier(event) {
    if (!event) return 1
    if (event.shiftKey) return 10
    if (event.altKey || event.ctrlKey) return 0.1
    return 1
}

// Registry ports carry min/max/step; when a port has no step, fall back to a
// magnitude-based default (small values move in small increments) rather
// than one fixed number that is either too coarse or too fine everywhere.
export function getEffectiveStep(step, referenceValue) {
    if (Number.isFinite(step) && step > 0) return step
    const magnitude = Math.abs(Number(referenceValue) || 0)
    return magnitude < 10 ? 0.01 : 0.1
}

// Decimal places implied by a step, e.g. 0.01 -> 2, 0.1 -> 1, 1 -> 0.
export function getStepDecimals(step) {
    if (!Number.isFinite(step) || step <= 0) return 2
    const text = step.toString()
    if (text.includes('e-')) {
        const [, exponent] = text.split('e-')
        return parseInt(exponent, 10)
    }
    const dotIndex = text.indexOf('.')
    return dotIndex === -1 ? 0 : text.length - dotIndex - 1
}

// Derived from the BASE step's decimals + the modifier, never by multiplying
// floats (0.1 * 0.1 === 0.010000000000000002) — Shift is one fewer decimal
// (coarser), Alt/Ctrl is one more (finer).
function decimalsForMultiplier(baseDecimals, multiplier) {
    if (multiplier === 10) return Math.max(0, baseDecimals - 1)
    if (multiplier === 0.1) return baseDecimals + 1
    return baseDecimals
}

export function roundTo(value, decimals) {
    const factor = 10 ** decimals
    return Math.round(value * factor) / factor
}

export function clampValue(value, min, max) {
    let next = value
    if (Number.isFinite(min)) next = Math.max(min, next)
    if (Number.isFinite(max)) next = Math.min(max, next)
    return next
}

// Recomputed fresh from the drag's start value + total pixel delta each
// move (never accumulated frame-to-frame), so it can never drift.
export function computeDragValue({ startValue, deltaX, step, min, max, shiftKey, altKey, ctrlKey }) {
    const baseStep = getEffectiveStep(step, startValue)
    const multiplier = getModifierMultiplier({ shiftKey, altKey, ctrlKey })
    const decimals = decimalsForMultiplier(getStepDecimals(baseStep), multiplier)
    const raw = startValue + deltaX * baseStep * multiplier
    return clampValue(roundTo(raw, decimals), min, max)
}

export function computeStepValue({ currentValue, direction, step, min, max, shiftKey, altKey, ctrlKey }) {
    const baseStep = getEffectiveStep(step, currentValue)
    const multiplier = getModifierMultiplier({ shiftKey, altKey, ctrlKey })
    const decimals = decimalsForMultiplier(getStepDecimals(baseStep), multiplier)
    const raw = currentValue + direction * baseStep * multiplier
    return clampValue(roundTo(raw, decimals), min, max)
}

export default function ScrubNumberInput({ value, fallback = 0, min, max, step, onChange, disabled = false }) {
    const canonical = Number.isFinite(Number(value)) ? Number(value) : fallback
    const [draft, setDraft] = useState(null)
    const [isDragging, setIsDragging] = useState(false)
    const inputRef = useRef(null)
    const editStartRef = useRef(canonical)
    const frameRef = useRef(null)
    const pendingRef = useRef(null)

    useEffect(() => () => {
        if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    }, [])

    const commit = useCallback((next) => {
        if (typeof onChange === 'function') onChange(next)
    }, [onChange])

    // Mouse wheel over a FOCUSED field only. React's synthetic onWheel is
    // registered passive at the root, so preventDefault() there is silently
    // ignored — a native listener is the only way to actually stop the page
    // from scrolling under a step change.
    useEffect(() => {
        const el = inputRef.current
        if (!el || disabled) return undefined
        const wheelHandler = (event) => {
            if (document.activeElement !== el) return
            event.preventDefault()
            const base = draft !== null && Number.isFinite(Number(draft)) ? Number(draft) : canonical
            const direction = event.deltaY < 0 ? 1 : -1
            const next = computeStepValue({ currentValue: base, direction, step, min, max, shiftKey: event.shiftKey, altKey: event.altKey, ctrlKey: event.ctrlKey })
            setDraft(String(next))
            commit(next)
        }
        el.addEventListener('wheel', wheelHandler, { passive: false })
        return () => el.removeEventListener('wheel', wheelHandler)
    }, [disabled, draft, canonical, step, min, max, commit])

    const focusForEditing = useCallback(() => {
        inputRef.current?.focus()
    }, [])

    const handlePointerDown = useCallback((event) => {
        if (disabled) return
        if (event.button !== 0 && event.button !== 1) return // left (drag or click) or middle (drag) only
        event.preventDefault()
        const targetEl = event.currentTarget
        const startValue = draft !== null && Number.isFinite(Number(draft)) ? Number(draft) : canonical
        const state = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startValue, dragging: false, axis: null }
        const startButton = event.button

        const flushPending = () => {
            if (frameRef.current !== null) {
                cancelAnimationFrame(frameRef.current)
                frameRef.current = null
            }
            if (pendingRef.current !== null) {
                commit(pendingRef.current)
                pendingRef.current = null
            }
        }

        const scheduleCommit = (nextValue) => {
            pendingRef.current = nextValue
            if (frameRef.current === null) {
                frameRef.current = requestAnimationFrame(() => {
                    frameRef.current = null
                    if (pendingRef.current !== null) {
                        commit(pendingRef.current)
                        pendingRef.current = null
                    }
                })
            }
        }

        function teardown() {
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', up)
            window.removeEventListener('pointercancel', cancelGesture)
        }

        const move = (moveEvent) => {
            // No pointerId filtering: only one drag's listeners are ever
            // attached at a time (matches RawGraphSurface's convention),
            // so anything arriving while they're up belongs to this drag.
            const dx = moveEvent.clientX - state.startX
            const dy = moveEvent.clientY - state.startY
            if (!state.dragging) {
                if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return
                state.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y'
                if (state.axis !== 'x') {
                    // Vertical-first: this is a scroll gesture, not a scrub.
                    // Hand it back — stop tracking, never call preventDefault.
                    teardown()
                    return
                }
                state.dragging = true
                setIsDragging(true)
                try { targetEl?.setPointerCapture?.(state.pointerId) } catch { /* unsupported / jsdom */ }
            }
            moveEvent.preventDefault()
            const next = computeDragValue({
                startValue: state.startValue,
                deltaX: dx,
                step,
                min,
                max,
                shiftKey: moveEvent.shiftKey,
                altKey: moveEvent.altKey,
                ctrlKey: moveEvent.ctrlKey
            })
            setDraft(String(next))
            scheduleCommit(next)
        }

        const up = () => {
            flushPending()
            const wasDragging = state.dragging
            teardown()
            setIsDragging(false)
            if (!wasDragging && startButton === 0) focusForEditing()
        }

        const cancelGesture = () => {
            pendingRef.current = null
            if (frameRef.current !== null) {
                cancelAnimationFrame(frameRef.current)
                frameRef.current = null
            }
            teardown()
            setIsDragging(false)
        }

        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
        window.addEventListener('pointercancel', cancelGesture)
    }, [disabled, draft, canonical, step, min, max, commit, focusForEditing])

    const handleDoubleClick = useCallback((event) => {
        if (disabled) return
        event.preventDefault()
        focusForEditing()
    }, [disabled, focusForEditing])

    const handleFocus = useCallback((event) => {
        if (disabled) return
        editStartRef.current = canonical
        setDraft(String(canonical))
        event.target.select()
    }, [disabled, canonical])

    const handleBlur = useCallback(() => {
        setDraft(null)
    }, [])

    const handleChange = useCallback((event) => {
        const text = event.target.value
        setDraft(text)
        const parsed = Number(text)
        if (text.trim() !== '' && Number.isFinite(parsed)) commit(parsed)
    }, [commit])

    const handleKeyDown = useCallback((event) => {
        if (disabled) return
        if (event.key === 'Enter') {
            event.currentTarget.blur()
            return
        }
        if (event.key === 'Escape') {
            commit(editStartRef.current)
            setDraft(null)
            event.currentTarget.blur()
            return
        }
        const direction = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[event.key]
        if (direction === undefined) return
        event.preventDefault()
        const base = draft !== null && Number.isFinite(Number(draft)) ? Number(draft) : canonical
        const next = computeStepValue({ currentValue: base, direction, step, min, max, shiftKey: event.shiftKey, altKey: event.altKey, ctrlKey: event.ctrlKey })
        setDraft(String(next))
        commit(next)
    }, [disabled, draft, canonical, step, min, max, commit])

    const displayValue = draft !== null ? draft : String(canonical)
    const hasRange = Number.isFinite(min) && Number.isFinite(max) && max > min
    const fraction = hasRange ? clampValue((canonical - min) / (max - min), 0, 1) : null

    return (
        <span className={`scrub-number-field${isDragging ? ' is-dragging' : ''}${disabled ? ' is-disabled' : ''}`}>
            {hasRange ? <span className="scrub-number-fill" style={{ width: `${fraction * 100}%` }} aria-hidden="true" /> : null}
            <input
                ref={inputRef}
                type="text"
                inputMode="decimal"
                role="spinbutton"
                aria-valuenow={canonical}
                aria-valuemin={Number.isFinite(min) ? min : undefined}
                aria-valuemax={Number.isFinite(max) ? max : undefined}
                className="scrub-number-input"
                value={displayValue}
                disabled={disabled}
                onPointerDown={handlePointerDown}
                onDoubleClick={handleDoubleClick}
                onFocus={handleFocus}
                onBlur={handleBlur}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
            />
        </span>
    )
}
