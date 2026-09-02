import { useEffect, useRef, useState } from 'react'
import { clampWindowFrame } from '../utils/windowLayout.js'

// A window lives in one of two spaces.
//
// `screen` — the old behaviour: the frame is viewport pixels, the window is
// position:fixed, and clampWindowFrame keeps it reachable on any viewport.
// `world` — the frame is graph units, exactly like a node card's graphX/Y:
// the window is placed through the canvas viewport (pan + zoom), travels when
// the canvas pans, shrinks when it zooms, and is never clamped to the screen —
// a scene parked at world x=5000 is supposed to be off-screen until you pan
// there. That is what lets a person spread many scenes across one canvas.
const MIN_WIDTH = 260
const MIN_HEIGHT = 180

const worldSettle = (frame) => ({
    ...frame,
    width: Math.max(MIN_WIDTH, Number(frame.width) || MIN_WIDTH),
    height: Math.max(MIN_HEIGHT, Number(frame.height) || MIN_HEIGHT)
})

export default function DesktopWindow({
    windowState,
    title,
    kicker = '',
    // The family colour of the node this window belongs to, if it belongs to
    // one. Drives the stripe along the top edge and the kicker's colour, which
    // is what makes a window and its graph card legible as ONE node rather
    // than two identical rectangles. Windows that are tools rather than nodes
    // (Outliner, Chat) pass nothing and keep the neutral furniture edge.
    accent = null,
    children,
    onFocus,
    onPatch,
    onClose,
    onToggleMinimize,
    onTogglePin,
    onEnter,
    minTop = undefined,
    allowOverflowLeft = false,
    allowOverflowTop = false,
    canvasZoom = 1,
    // 'screen' | 'world' — see the note at the top of the file.
    space = 'screen',
    // The canvas viewport a world window is placed through:
    // { panX, panY, zoom, originLeft, originTop }. originLeft/Top is where the
    // graph surface's own box starts in the page, so a world point lands at
    // origin + pan + point * zoom. Ignored for screen windows.
    viewport = null
}) {
    const inWorld = space === 'world' && viewport != null
    // Pointer deltas are screen pixels; a world window moves in graph units.
    const dragZoom = inWorld ? Math.max(viewport.zoom || 1, 0.01) : canvasZoom

    // Where a frame is allowed to settle. Screen windows go through the clamp
    // that keeps them on the viewport; world windows keep only their minimum
    // size, because "on the viewport" means nothing in canvas coordinates.
    const settle = (frame) => inWorld
        ? worldSettle(frame)
        : clampWindowFrame(frame, {
            minTop,
            allowOverflowLeft,
            allowOverflowTop,
            viewportWidth: typeof window !== 'undefined' ? window.innerWidth : undefined,
            viewportHeight: typeof window !== 'undefined' ? window.innerHeight : undefined
        })

    // `minimized` rides along in the draft on purpose. The clamp places a
    // collapsed window by its bar rather than by the panel it would open to,
    // and it reads that from the frame it is handed — so a draft built from
    // x/y/width/height alone silently told the clamp every window was open,
    // and the fix in windowLayout.js could never fire from here. It is never
    // written back: onPatch below sends the four geometry fields only.
    const [draft, setDraft] = useState(() => ({
        x: windowState.x,
        y: windowState.y,
        width: windowState.width,
        height: windowState.height,
        minimized: windowState.minimized === true
    }))
    const interactionRef = useRef(null)
    const [dragMode, setDragMode] = useState(null)
    const draftRef = useRef(draft)
    useEffect(() => { draftRef.current = draft }, [draft])

    useEffect(() => {
        if (interactionRef.current) return
        setDraft(settle({
            x: windowState.x,
            y: windowState.y,
            width: windowState.width,
            height: windowState.height,
            minimized: windowState.minimized === true
        }))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allowOverflowLeft, allowOverflowTop, minTop, inWorld, windowState.height, windowState.minimized, windowState.width, windowState.x, windowState.y])

    // Re-clamp when the viewport itself changes — rotation, window resize, the
    // virtual keyboard shrinking the layout viewport. Without this a window
    // placed in landscape is stranded fully off-screen in portrait. A world
    // window has nothing to re-clamp against: it moves with the canvas.
    useEffect(() => {
        if (typeof window === 'undefined' || inWorld) return undefined
        const reclamp = () => {
            if (interactionRef.current) return
            setDraft((current) => clampWindowFrame(current, {
                minTop,
                allowOverflowLeft,
                allowOverflowTop,
                viewportWidth: window.innerWidth,
                viewportHeight: window.innerHeight
            }))
        }
        window.addEventListener('resize', reclamp)
        window.addEventListener('orientationchange', reclamp)
        return () => {
            window.removeEventListener('resize', reclamp)
            window.removeEventListener('orientationchange', reclamp)
        }
    }, [allowOverflowLeft, allowOverflowTop, minTop, inWorld])

    useEffect(() => {
        if (!dragMode) return undefined
        const handlePointerMove = (event) => {
            const state = interactionRef.current
            if (!state) return
            if (state.mode === 'drag') {
                setDraft((current) => settle({
                    ...current,
                    x: state.origin.x + (event.clientX - state.startX) / dragZoom,
                    y: state.origin.y + (event.clientY - state.startY) / dragZoom
                }))
            }
            if (state.mode === 'resize') {
                setDraft((current) => settle({
                    ...current,
                    width: Math.max(MIN_WIDTH, state.origin.width + (event.clientX - state.startX) / dragZoom),
                    height: Math.max(MIN_HEIGHT, state.origin.height + (event.clientY - state.startY) / dragZoom)
                }))
            }
        }
        const handlePointerUp = () => {
            const state = interactionRef.current
            interactionRef.current = null
            setDragMode(null)
            if (!state) return
            const nextFrame = settle(draftRef.current)
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dragMode, allowOverflowLeft, allowOverflowTop, minTop, onPatch, dragZoom, inWorld])

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

    // Screen windows keep the exact `translate(Xpx, Ypx)` string: tests parse
    // it positionally, and nothing else changes for them. A world window is
    // placed through the canvas viewport and scaled with it — the whole
    // window, body included, so a scene reads smaller as you zoom out, the
    // same way its card does.
    const transform = inWorld
        ? `translate(${(viewport.originLeft || 0) + viewport.panX + draft.x * viewport.zoom}px, ${(viewport.originTop || 0) + viewport.panY + draft.y * viewport.zoom}px) scale(${viewport.zoom})`
        : `translate(${draft.x}px, ${draft.y}px)`

    return (
        <section
            className={`raw-window ${windowState.minimized ? 'is-minimized' : ''} ${windowState.pinned ? 'is-pinned' : ''} ${inWorld ? 'is-world' : ''}`}
            role="dialog"
            aria-label={title}
            tabIndex={-1}
            style={{
                transform,
                width: draft.width,
                height: windowState.minimized ? 'auto' : draft.height,
                zIndex: windowState.zIndex,
                cursor: sectionCursor,
                // A custom property, not a direct border/colour: raw.css owns
                // the treatment (stripe width, fallback edge, kicker colour)
                // and this only says which hue. Undefined leaves every
                // fallback in the stylesheet intact.
                ...(accent ? { '--window-accent': accent } : {})
            }}
        >
            <header
                className="raw-window-header"
                onPointerDown={startDrag}
                style={{ cursor: dragMode === 'drag' ? 'grabbing' : undefined }}
            >
                <div>
                    {kicker ? <span className="raw-window-kicker">{kicker}</span> : null}
                    <h3>{title}</h3>
                </div>
                <div className="raw-window-actions">
                    {onEnter && (
                        <button
                            type="button"
                            title="Go inside this node to put things in it"
                            onClick={(event) => { event.stopPropagation(); onEnter() }}
                        >
                            Enter ›
                        </button>
                    )}
                    {/* Glyphs, not words. Four words per title bar — and a
                        full extra 390px row per window on a phone — for three
                        actions every windowing system on earth spells with
                        symbols. Enter › above keeps its word: it is the one
                        action a first-timer must find. Accessible names carry
                        the words the glyphs dropped. */}
                    <button
                        type="button"
                        className={windowState.pinned ? 'is-active' : ''}
                        aria-label={windowState.pinned ? 'Unpin' : 'Pin'}
                        title={windowState.pinned ? 'Unpin: let it travel with the canvas' : 'Pin to the screen'}
                        onClick={(event) => { event.stopPropagation(); onTogglePin?.() }}
                    >
                        ⌖
                    </button>
                    <button
                        type="button"
                        aria-label={windowState.minimized ? 'Expand' : 'Minimize'}
                        title={windowState.minimized ? 'Expand' : 'Minimize'}
                        onClick={(event) => { event.stopPropagation(); onToggleMinimize?.() }}
                    >
                        {windowState.minimized ? '▣' : '–'}
                    </button>
                    <button
                        type="button"
                        aria-label="Close"
                        title="Close"
                        onClick={(event) => { event.stopPropagation(); onClose?.() }}
                    >
                        ×
                    </button>
                </div>
            </header>
            {!windowState.minimized && <div className="raw-window-body">{children}</div>}
            {!windowState.minimized && <div className="raw-window-resizer" onPointerDown={startResize} />}
        </section>
    )
}
