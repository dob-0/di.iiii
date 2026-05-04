import { useEffect, useRef, useState } from 'react'

const VIEW_MIN_ZOOM = 0.05
const VIEW_MAX_ZOOM = 8
const VIEW_ZOOM_STEP = 0.1

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

export default function BetaViewSurface({
    topInset = 0,
    zoom,
    panX,
    panY,
    onZoomChange,
    onPanChange,
    onDoubleClick,
    children
}) {
    const containerRef = useRef(null)
    const [isPanning, setIsPanning] = useState(false)
    const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 })
    // viewportRef mirrors zoom/pan synchronously so wheel handler reads fresh values
    const viewportRef = useRef({ panX, panY, zoom })

    useEffect(() => {
        viewportRef.current = { panX, panY, zoom }
    }, [panX, panY, zoom])

    const applyViewport = (nextPanX, nextPanY, nextZoom) => {
        const clamped = clamp(nextZoom, VIEW_MIN_ZOOM, VIEW_MAX_ZOOM)
        viewportRef.current = { panX: nextPanX, panY: nextPanY, zoom: clamped }
        onZoomChange?.(clamped)
        onPanChange?.(nextPanX, nextPanY)
    }

    const updateZoom = (nextZoom) => {
        const vp = viewportRef.current
        const rect = containerRef.current?.getBoundingClientRect() || { width: 800, height: 600 }
        const cx = rect.width / 2
        const cy = rect.height / 2
        const clamped = clamp(nextZoom, VIEW_MIN_ZOOM, VIEW_MAX_ZOOM)
        const scale = clamped / vp.zoom
        applyViewport(cx - (cx - vp.panX) * scale, cy - (cy - vp.panY) * scale, clamped)
    }

    // Non-passive wheel for cursor-anchored zoom
    useEffect(() => {
        const container = containerRef.current
        if (!container) return undefined
        const handleWheel = (event) => {
            event.preventDefault()
            const factor = event.deltaY < 0 ? 1.1 : 0.9
            const vp = viewportRef.current
            const rect = container.getBoundingClientRect()
            const mx = event.clientX - rect.left
            const my = event.clientY - rect.top
            const nextZoom = clamp(vp.zoom * factor, VIEW_MIN_ZOOM, VIEW_MAX_ZOOM)
            const scale = nextZoom / vp.zoom
            applyViewport(mx - (mx - vp.panX) * scale, my - (my - vp.panY) * scale, nextZoom)
        }
        container.addEventListener('wheel', handleWheel, { passive: false })
        return () => container.removeEventListener('wheel', handleWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const shouldStartPan = (event) => {
        if (event.button === 1) return true
        if (event.button !== 0) return false
        const target = event.target
        if (target?.closest?.('.beta-view-zoom-controls')) return false
        if (target?.closest?.('.beta-window')) return false
        return true
    }

    const handlePointerDown = (event) => {
        if (!shouldStartPan(event)) return
        event.preventDefault()
        const vp = viewportRef.current
        panStartRef.current = { x: event.clientX, y: event.clientY, panX: vp.panX, panY: vp.panY }
        setIsPanning(true)
    }

    useEffect(() => {
        if (!isPanning) return undefined
        const move = (event) => {
            const dx = event.clientX - panStartRef.current.x
            const dy = event.clientY - panStartRef.current.y
            const nx = panStartRef.current.panX + dx
            const ny = panStartRef.current.panY + dy
            viewportRef.current.panX = nx
            viewportRef.current.panY = ny
            onPanChange?.(nx, ny)
        }
        const up = () => setIsPanning(false)
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
        return () => {
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', up)
        }
    }, [isPanning, onPanChange])

    const handleDoubleClick = (event) => {
        if (!onDoubleClick) return
        const rect = containerRef.current?.getBoundingClientRect() || { left: 0, top: 0 }
        const vp = viewportRef.current
        const graphX = (event.clientX - rect.left - vp.panX) / vp.zoom
        const graphY = (event.clientY - rect.top - vp.panY) / vp.zoom
        onDoubleClick({ clientX: event.clientX, clientY: event.clientY, graphX, graphY })
    }

    return (
        <div
            ref={containerRef}
            className="beta-view-surface"
            style={{ top: `${topInset}px`, overflow: 'hidden', cursor: isPanning ? 'grabbing' : undefined }}
            role="button"
            tabIndex={0}
            aria-label="Create a view node"
            onPointerDown={handlePointerDown}
            onDoubleClick={handleDoubleClick}
        >
            <div className="beta-view-zoom-controls">
                <button type="button" aria-label="Zoom out" onClick={() => updateZoom(zoom - VIEW_ZOOM_STEP)}>-</button>
                <span>{Math.round(zoom * 100)}%</span>
                <button type="button" aria-label="Zoom in" onClick={() => updateZoom(zoom + VIEW_ZOOM_STEP)}>+</button>
            </div>
            {children ? null : (
                <div className="beta-empty-view-state" style={{ pointerEvents: 'none' }}>
                    <h2>Blank view.</h2>
                    <p>Double-click to add a node.</p>
                </div>
            )}
            <div
                className="beta-view-canvas-stage"
                style={{ transform: `translate(${panX}px,${panY}px) scale(${zoom})`, transformOrigin: '0 0' }}
            >
                {children}
            </div>
        </div>
    )
}
