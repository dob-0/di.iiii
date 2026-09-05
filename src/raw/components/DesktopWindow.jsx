import { useEffect, useRef, useState } from 'react'
import { RAW_WINDOW_MIN_HEIGHT, RAW_WINDOW_MIN_WIDTH, clampWindowFrame } from '../utils/windowLayout.js'

// A window lives in one of two spaces.
//
// `screen` — the old behaviour: the frame is viewport pixels, the window is
// position:fixed, and clampWindowFrame keeps it reachable on any viewport.
// `world` — the frame is graph units, exactly like a node card's graphX/Y:
// the window is placed through the canvas viewport (pan + zoom), travels when
// the canvas pans, shrinks when it zooms, and is never clamped to the screen —
// a scene parked at world x=5000 is supposed to be off-screen until you pan
// there. That is what lets a person spread many scenes across one canvas.

// Every edge and every corner. `dir` letters say which sides move.
const RESIZE_DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'sw']
const KEY_STEP = 16
const KEY_STEP_FINE = 1

const resizeFrame = (origin, dir, dx, dy) => {
    let { x, y, width, height } = origin
    if (dir.includes('e')) width = origin.width + dx
    if (dir.includes('w')) { width = origin.width - dx; x = origin.x + dx }
    if (dir.includes('s')) height = origin.height + dy
    if (dir.includes('n')) { height = origin.height - dy; y = origin.y + dy }
    // The floor holds the edge that is NOT being dragged still.
    if (width < RAW_WINDOW_MIN_WIDTH) {
        if (dir.includes('w')) x = origin.x + origin.width - RAW_WINDOW_MIN_WIDTH
        width = RAW_WINDOW_MIN_WIDTH
    }
    if (height < RAW_WINDOW_MIN_HEIGHT) {
        if (dir.includes('n')) y = origin.y + origin.height - RAW_WINDOW_MIN_HEIGHT
        height = RAW_WINDOW_MIN_HEIGHT
    }
    return { x, y, width, height }
}

const worldSettle = (frame) => ({
    ...frame,
    width: Math.max(RAW_WINDOW_MIN_WIDTH, Number(frame.width) || RAW_WINDOW_MIN_WIDTH),
    height: Math.max(RAW_WINDOW_MIN_HEIGHT, Number(frame.height) || RAW_WINDOW_MIN_HEIGHT)
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
    const settle = (frame, extra = {}) => inWorld
        ? worldSettle(frame)
        : clampWindowFrame(frame, {
            minTop,
            allowOverflowLeft,
            allowOverflowTop,
            viewportWidth: typeof window !== 'undefined' ? window.innerWidth : undefined,
            viewportHeight: typeof window !== 'undefined' ? window.innerHeight : undefined,
            ...extra
        })

    // `minimized` rides along in the draft on purpose. The clamp places a
    // collapsed window by its bar rather than by the panel it would open to,
    // and it reads that from the frame it is handed — so a draft built from
    // x/y/width/height alone silently told the clamp every window was open,
    // and the fix in windowLayout.js could never fire from here. It is never
    // written back: onPatch below sends geometry only.
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
    // The latest handlers, read by the one pointer effect below without
    // re-registering it mid-gesture (an inline onPatch changes identity every
    // render; a listener torn down mid-drag drops the pointerup).
    const callbacksRef = useRef({ onPatch })
    useEffect(() => { callbacksRef.current = { onPatch } })

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
            if (!state || event.pointerId !== state.pointerId) return
            const dx = (event.clientX - state.startX) / dragZoom
            const dy = (event.clientY - state.startY) / dragZoom
            if (state.mode === 'drag') {
                setDraft((current) => settle({
                    ...current,
                    x: state.origin.x + dx,
                    y: state.origin.y + dy
                }))
            }
            if (state.mode === 'resize') {
                setDraft((current) => settle({
                    ...current,
                    ...resizeFrame(state.origin, state.dir, dx, dy)
                }, { resizing: true }))
            }
        }
        const handlePointerUp = (event) => {
            const state = interactionRef.current
            if (!state || (event && event.pointerId !== state.pointerId)) return
            interactionRef.current = null
            setDragMode(null)
            const nextFrame = settle(draftRef.current, state.mode === 'resize' ? { resizing: true } : {})
            setDraft(nextFrame)
            // A resize from the east/south edges leaves x/y alone. Any gesture
            // that moved the top-left corner writes a position.
            const movedOrigin = state.mode === 'drag' || /[nw]/.test(state.dir || '')
            callbacksRef.current.onPatch?.(movedOrigin
                ? { x: nextFrame.x, y: nextFrame.y, width: nextFrame.width, height: nextFrame.height }
                : { width: nextFrame.width, height: nextFrame.height })
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
    }, [dragMode, allowOverflowLeft, allowOverflowTop, minTop, dragZoom, inWorld])

    // Capture the pointer on the element that was pressed. Without it the
    // gesture died the moment the pointer left the document — inside an
    // iframe that is the edge of the panel, which is exactly where a person
    // drags to when enlarging a window. Captured events still bubble to the
    // window listeners above. stopPropagation keeps the graph surface's own
    // pan / pinch / double-tap from seeing the press at all.
    const begin = (event, state) => {
        event.preventDefault()
        event.stopPropagation()
        event.currentTarget.setPointerCapture?.(event.pointerId)
        onFocus?.()
        setDragMode(state.mode)
        interactionRef.current = { ...state, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY }
    }

    const startDrag = (event) => {
        if (event.target.closest('button')) return
        if (event.button !== undefined && event.button !== 0) return
        begin(event, { mode: 'drag', origin: { x: draft.x, y: draft.y } })
    }

    const startResize = (dir) => (event) => {
        if (event.button !== undefined && event.button !== 0) return
        begin(event, {
            mode: 'resize',
            dir,
            origin: { x: draft.x, y: draft.y, width: draft.width, height: draft.height }
        })
    }

    // Keyboard: arrows on the title bar move, arrows on the SE grip resize.
    // Shift steps by one pixel. The grip and the header are focusable for it.
    const keyDelta = (event) => {
        const step = event.shiftKey ? KEY_STEP_FINE : KEY_STEP
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
        const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
        if (!dx && !dy) return null
        event.preventDefault()
        event.stopPropagation()
        return { dx, dy }
    }
    const commit = (nextFrame, movedOrigin) => {
        const settled = settle(nextFrame, movedOrigin ? {} : { resizing: true })
        setDraft(settled)
        callbacksRef.current.onPatch?.(movedOrigin
            ? { x: settled.x, y: settled.y, width: settled.width, height: settled.height }
            : { width: settled.width, height: settled.height })
    }
    const handleHeaderKeyDown = (event) => {
        const delta = keyDelta(event)
        if (!delta) return
        commit({ ...draft, x: draft.x + delta.dx, y: draft.y + delta.dy }, true)
    }
    const handleGripKeyDown = (event) => {
        const delta = keyDelta(event)
        if (!delta) return
        commit({ ...draft, ...resizeFrame(draft, 'se', delta.dx, delta.dy) }, false)
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
            {/* The title bar is the drag handle AND the keyboard handle for
                moving; a landmark element carrying focus is what the rule
                objects to, and a div would lose the header semantics the
                dialog reads out. The static-element-interactions warning is
                the same one already accepted on RawEditor's and
                RawGraphSurface's own non-native interactive elements. */}
            {/* eslint-disable jsx-a11y/no-noninteractive-tabindex */}
            <header
                className="raw-window-header"
                onPointerDown={startDrag}
                onKeyDown={handleHeaderKeyDown}
                tabIndex={0}
                aria-label={`${title} — drag or use arrow keys to move`}
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
            {/* eslint-enable jsx-a11y/no-noninteractive-tabindex */}
            {!windowState.minimized && <div className="raw-window-body">{children}</div>}
            {!windowState.minimized && RESIZE_DIRS.map((dir) => (
                <div
                    key={dir}
                    className={`raw-window-handle ${dir}`}
                    data-dir={dir}
                    onPointerDown={startResize(dir)}
                />
            ))}
            {!windowState.minimized && (
                <button
                    type="button"
                    className="raw-window-resizer"
                    data-dir="se"
                    aria-label="Resize — drag or use arrow keys"
                    onPointerDown={startResize('se')}
                    onKeyDown={handleGripKeyDown}
                />
            )}
        </section>
    )
}
