import { useEffect, useRef } from 'react'
import { asFiniteNumber, clamp01, createRafCommitter } from './controlDragBase.js'

export default function XYPadControl({ node, onChangeValues }) {
    const padRef = useRef(null)
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

    const minX = asFiniteNumber(node.values?.minX, 0)
    const maxX = asFiniteNumber(node.values?.maxX, 1)
    const minY = asFiniteNumber(node.values?.minY, 0)
    const maxY = asFiniteNumber(node.values?.maxY, 1)
    const x = asFiniteNumber(node.values?.x, minX)
    const y = asFiniteNumber(node.values?.y, minY)
    const tx = maxX === minX ? 0 : clamp01((x - minX) / (maxX - minX))
    // Screen-y grows downward; value-y grows upward (bottom = minY), the
    // convention every XY controller (incl. TouchOSC) uses.
    const ty = maxY === minY ? 0 : clamp01((y - minY) / (maxY - minY))

    const valuesFromEvent = (event) => {
        const rect = padRef.current?.getBoundingClientRect()
        if (!rect || rect.width === 0 || rect.height === 0) return { x, y }
        const nextTx = clamp01((event.clientX - rect.left) / rect.width)
        const nextTy = clamp01(1 - (event.clientY - rect.top) / rect.height)
        return {
            x: minX + nextTx * (maxX - minX),
            y: minY + nextTy * (maxY - minY)
        }
    }

    const handlePointerDown = (event) => {
        if (event.button !== 0) return
        event.stopPropagation()
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        committerRef.current?.queue(valuesFromEvent(event))
    }

    const handlePointerMove = (event) => {
        if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) return
        committerRef.current?.queue(valuesFromEvent(event))
    }

    const handlePointerUp = (event) => {
        if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) return
        event.currentTarget.releasePointerCapture(event.pointerId)
        committerRef.current?.finish(valuesFromEvent(event))
    }

    const handleKeyDown = (event) => {
        const stepX = (maxX - minX) / 100 || 0.01
        const stepY = (maxY - minY) / 100 || 0.01
        let next = null
        if (event.key === 'ArrowRight') next = { x: Math.min(Math.max(minX, maxX), x + stepX), y }
        if (event.key === 'ArrowLeft') next = { x: Math.max(Math.min(minX, maxX), x - stepX), y }
        if (event.key === 'ArrowUp') next = { x, y: Math.min(Math.max(minY, maxY), y + stepY) }
        if (event.key === 'ArrowDown') next = { x, y: Math.max(Math.min(minY, maxY), y - stepY) }
        if (next === null) return
        event.preventDefault()
        event.stopPropagation()
        committerRef.current?.finish(next)
    }

    return (
        <div
            ref={padRef}
            className="seed-control-xypad"
            role="slider"
            tabIndex={0}
            aria-label={`${node.label} XY pad`}
            aria-valuemin={Math.min(minX, maxX)}
            aria-valuemax={Math.max(minX, maxX)}
            aria-valuenow={x}
            aria-valuetext={`x ${Math.round(x * 1000) / 1000}, y ${Math.round(y * 1000) / 1000}`}
            onKeyDown={handleKeyDown}
            style={{
                position: 'relative',
                height: 100,
                margin: '4px 10px',
                borderRadius: 4,
                background: 'rgba(255,255,255,0.08)',
                cursor: 'crosshair',
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
                    left: `calc(${tx * 100}% - 6px)`,
                    top: `calc(${(1 - ty) * 100}% - 6px)`,
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: '#ffd166',
                    boxShadow: '0 0 6px rgba(255,209,102,0.8)',
                    pointerEvents: 'none'
                }}
            />
        </div>
    )
}
