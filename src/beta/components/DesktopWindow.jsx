import { useEffect, useRef, useState } from 'react'
import { clampWindowFrame } from '../utils/windowLayout.js'

export default function DesktopWindow({
    windowState,
    title,
    kicker = '',
    children,
    onFocus,
    onPatch,
    onClose,
    onToggleMinimize,
    onTogglePin,
    minTop = undefined,
    allowOverflowLeft = false,
    allowOverflowTop = false,
    canvasZoom = 1
}) {
    const [draft, setDraft] = useState(() => ({
        x: windowState.x,
        y: windowState.y,
        width: windowState.width,
        height: windowState.height
    }))
    const interactionRef = useRef(null)
    const [dragMode, setDragMode] = useState(null)

    useEffect(() => {
        if (interactionRef.current) return
        setDraft(clampWindowFrame({
            x: windowState.x,
            y: windowState.y,
            width: windowState.width,
            height: windowState.height
        }, {
            minTop,
            allowOverflowLeft,
            allowOverflowTop,
            viewportWidth: typeof window !== 'undefined' ? window.innerWidth : undefined,
            viewportHeight: typeof window !== 'undefined' ? window.innerHeight : undefined
        }))
    }, [allowOverflowLeft, allowOverflowTop, minTop, windowState.height, windowState.width, windowState.x, windowState.y])

    useEffect(() => {
        if (!interactionRef.current) return undefined
        const handlePointerMove = (event) => {
            const state = interactionRef.current
            if (!state) return
            if (state.mode === 'drag') {
                setDraft((current) => clampWindowFrame({
                    ...current,
                    x: state.origin.x + (event.clientX - state.startX) / canvasZoom,
                    y: state.origin.y + (event.clientY - state.startY) / canvasZoom
                }, {
                    minTop,
                    allowOverflowLeft,
                    allowOverflowTop,
                    viewportWidth: window.innerWidth,
                    viewportHeight: window.innerHeight
                }))
            }
            if (state.mode === 'resize') {
                setDraft((current) => clampWindowFrame({
                    ...current,
                    width: Math.max(260, state.origin.width + (event.clientX - state.startX) / canvasZoom),
                    height: Math.max(180, state.origin.height + (event.clientY - state.startY) / canvasZoom)
                }, {
                    minTop,
                    allowOverflowLeft,
                    allowOverflowTop,
                    viewportWidth: window.innerWidth,
                    viewportHeight: window.innerHeight
                }))
            }
        }
        const handlePointerUp = () => {
            const state = interactionRef.current
            interactionRef.current = null
            setDragMode(null)
            if (!state) return
            const nextFrame = clampWindowFrame(draft, {
                minTop,
                allowOverflowLeft,
                allowOverflowTop,
                viewportWidth: window.innerWidth,
                viewportHeight: window.innerHeight
            })
            setDraft(nextFrame)
            onPatch?.({
                x: nextFrame.x,
                y: nextFrame.y,
                width: nextFrame.width,
                height: nextFrame.height
            })
        }

        window.addEventListener('pointermove', handlePointerMove)
        window.addEventListener('pointerup', handlePointerUp)
        window.addEventListener('pointercancel', handlePointerUp)
        return () => {
            window.removeEventListener('pointermove', handlePointerMove)
            window.removeEventListener('pointerup', handlePointerUp)
            window.removeEventListener('pointercancel', handlePointerUp)
        }
    }, [allowOverflowLeft, allowOverflowTop, draft, minTop, onPatch, canvasZoom])

    const startDrag = (event) => {
        if (event.target.closest('button')) return
        event.preventDefault()
        onFocus?.()
        setDragMode('drag')
        interactionRef.current = {
            mode: 'drag',
            startX: event.clientX,
            startY: event.clientY,
            origin: { x: draft.x, y: draft.y }
        }
    }

    const startResize = (event) => {
        event.preventDefault()
        onFocus?.()
        setDragMode('resize')
        interactionRef.current = {
            mode: 'resize',
            startX: event.clientX,
            startY: event.clientY,
            origin: { width: draft.width, height: draft.height }
        }
    }

    const sectionCursor = dragMode === 'drag' ? 'grabbing' : dragMode === 'resize' ? 'nwse-resize' : undefined

    return (
        <section
            className={`beta-window ${windowState.minimized ? 'is-minimized' : ''} ${windowState.pinned ? 'is-pinned' : ''}`}
            role="dialog"
            aria-label={title}
            tabIndex={-1}
            style={{
                transform: `translate(${draft.x}px, ${draft.y}px)`,
                width: draft.width,
                height: windowState.minimized ? 'auto' : draft.height,
                zIndex: windowState.zIndex,
                cursor: sectionCursor
            }}
        >
            <header
                className="beta-window-header"
                onPointerDown={startDrag}
                style={{ cursor: dragMode === 'drag' ? 'grabbing' : undefined }}
            >
                <div>
                    {kicker ? <span className="beta-window-kicker">{kicker}</span> : null}
                    <h3>{title}</h3>
                </div>
                <div className="beta-window-actions">
                    <button type="button" onClick={(event) => { event.stopPropagation(); onTogglePin?.() }}>
                        {windowState.pinned ? 'Unpin' : 'Pin'}
                    </button>
                    <button type="button" onClick={(event) => { event.stopPropagation(); onToggleMinimize?.() }}>
                        {windowState.minimized ? 'Expand' : 'Minimize'}
                    </button>
                    <button type="button" onClick={(event) => { event.stopPropagation(); onClose?.() }}>
                        Close
                    </button>
                </div>
            </header>
            {!windowState.minimized && <div className="beta-window-body">{children}</div>}
            {!windowState.minimized && <div className="beta-window-resizer" onPointerDown={startResize} />}
        </section>
    )
}
