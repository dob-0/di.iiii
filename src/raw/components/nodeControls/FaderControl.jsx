import { useEffect, useMemo, useRef } from 'react'
import { asFiniteNumber, clamp01, createRafCommitter } from './controlDragBase.js'

export default function FaderControl({ node, onChangeValues }) {
    const trackRef = useRef(null)
    const onChangeValuesRef = useRef(onChangeValues)
    useEffect(() => {
        onChangeValuesRef.current = onChangeValues
    }, [onChangeValues])
    const committerRef = useRef(null)
    useEffect(() => {
        const committer = createRafCommitter((patch) => onChangeValuesRef.current?.(patch))
        committerRef.current = committer
        return () => {
            committer.cancel()
            committerRef.current = null
        }
    }, [])

    const min = asFiniteNumber(node.values?.min, 0)
    const max = asFiniteNumber(node.values?.max, 1)
    const lo = Math.min(min, max)
    const hi = Math.max(min, max)
    const value = asFiniteNumber(node.values?.value, lo)
    const t = hi === lo ? 0 : clamp01((value - lo) / (hi - lo))

    const valueFromEvent = (event) => {
        const rect = trackRef.current?.getBoundingClientRect()
        if (!rect || rect.width === 0) return value
        const nextT = clamp01((event.clientX - rect.left) / rect.width)
        return lo + nextT * (hi - lo)
    }

    const handlePointerDown = (event) => {
        if (event.button !== 0) return
        event.stopPropagation()
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        committerRef.current?.queue({ value: valueFromEvent(event) })
    }

    const handlePointerMove = (event) => {
        if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) return
        committerRef.current?.queue({ value: valueFromEvent(event) })
    }

    const handlePointerUp = (event) => {
        if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) return
        event.currentTarget.releasePointerCapture(event.pointerId)
        committerRef.current?.finish({ value: valueFromEvent(event) })
    }

    const handleKeyDown = (event) => {
        const step = (hi - lo) / 100 || 0.01
        let next = null
        if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = Math.min(hi, value + step)
        if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = Math.max(lo, value - step)
        if (event.key === 'Home') next = lo
        if (event.key === 'End') next = hi
        if (next === null) return
        event.preventDefault()
        event.stopPropagation()
        committerRef.current?.finish({ value: next })
    }

    const display = useMemo(() => {
        const rounded = Math.round(value * 1000) / 1000
        return `${rounded}`
    }, [value])

    return (
        <div
            ref={trackRef}
            className="raw-control-fader"
            role="slider"
            tabIndex={0}
            aria-label={`${node.label} fader`}
            aria-valuemin={lo}
            aria-valuemax={hi}
            aria-valuenow={value}
            onKeyDown={handleKeyDown}
            style={{
                position: 'relative',
                height: 24,
                margin: '4px 10px',
                borderRadius: 4,
                background: 'rgba(255,255,255,0.08)',
                cursor: 'ew-resize',
                touchAction: 'none',
                overflow: 'hidden'
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
        >
            <div
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    bottom: 0,
                    width: `${t * 100}%`,
                    background: '#ffd166',
                    opacity: 0.85,
                    pointerEvents: 'none'
                }}
            />
            <span
                style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    color: '#fff',
                    mixBlendMode: 'difference',
                    pointerEvents: 'none'
                }}
            >
                {display}
            </span>
        </div>
    )
}
