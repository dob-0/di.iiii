import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DesktopWindow from '../raw/components/DesktopWindow.jsx'
import { DESK_KINDS, arrangeGrid, fitAll, kindSpec, nextWindowId, placeWindow } from './deskLayout.js'
import './desk.css'

// The room, drawn live inside a window. Lazy for the same reason the landing
// loads it lazily: three.js is 1.6MB and a desk that holds no room must not
// pay for one.
const GridFloorBackground = lazy(() => import('../components/GridFloorBackground.jsx'))

// Named arrangements, in the desk's own voice: what you get, not what it does.
const LAYOUTS = [
    { id: 'workbench', label: 'workbench', what: 'the room, with a place to write', kinds: ['room', 'note'] },
    { id: 'reading', label: 'reading', what: 'notes side by side', kinds: ['note', 'note', 'note'] }
]

const startingWindows = () => []

export default function DeskSurface({ spaceId = null }) {
    const [windows, setWindows] = useState(startingWindows)
    const [arrangement, setArrangement] = useState('canvas')
    const [openMenu, setOpenMenu] = useState(null)
    const [offset, setOffset] = useState({ x: 0, y: 0 })
    const viewportRef = useRef(null)
    const panRef = useRef(null)
    const [panning, setPanning] = useState(false)
    // The grid arrangement is derived from the width, so the width has to be
    // state rather than a ref read during render — otherwise the desk lays
    // itself out against whatever the surface measured last time.
    const [viewportWidth, setViewportWidth] = useState(1200)

    useEffect(() => {
        const node = viewportRef.current
        if (!node || typeof ResizeObserver === 'undefined') return undefined
        const observer = new ResizeObserver(() => setViewportWidth(node.clientWidth || 1200))
        observer.observe(node)
        setViewportWidth(node.clientWidth || 1200)
        return () => observer.disconnect()
    }, [])

    const viewportSize = () => {
        const node = viewportRef.current
        return { width: node?.clientWidth || 1200, height: node?.clientHeight || 700 }
    }

    const addWindow = useCallback((kind) => {
        const spec = kindSpec(kind)
        setWindows((current) => {
            const size = viewportSize()
            const at = placeWindow(current, spec, { x: -offset.x, y: -offset.y, ...size })
            return [...current, {
                id: nextWindowId(kind),
                kind,
                title: spec.label,
                x: at.x,
                y: at.y,
                width: spec.width,
                height: spec.height,
                minimized: false,
                text: ''
            }]
        })
        setOpenMenu(null)
    }, [offset.x, offset.y])

    const patchWindow = useCallback((id, patch) => {
        setWindows((current) => current.map((w) => (w.id === id ? { ...w, ...patch } : w)))
    }, [])

    const closeWindow = useCallback((id) => {
        setWindows((current) => current.filter((w) => w.id !== id))
    }, [])

    const applyLayout = useCallback((layout) => {
        setWindows(() => {
            const size = viewportSize()
            const made = []
            layout.kinds.forEach((kind) => {
                const spec = kindSpec(kind)
                const at = placeWindow(made, spec, { x: 0, y: 0, ...size })
                made.push({
                    id: nextWindowId(kind),
                    kind,
                    title: spec.label,
                    x: at.x,
                    y: at.y,
                    width: spec.width,
                    height: spec.height,
                    minimized: false,
                    text: ''
                })
            })
            return made
        })
        setOffset({ x: 0, y: 0 })
        setOpenMenu(null)
    }, [])

    const seeItAll = useCallback(() => {
        setOffset(fitAll(windows, viewportSize()))
        setOpenMenu(null)
    }, [windows])

    // Panning the surface itself. Only from the surface — a drag that starts on
    // a window belongs to that window, and DesktopWindow stops it there.
    const onPointerDown = (event) => {
        if (event.target.closest('.raw-window, .desk-menu')) return
        if (event.button !== 0) return
        panRef.current = { startX: event.clientX, startY: event.clientY, from: { ...offset } }
        setPanning(true)
        setOpenMenu(null)
    }

    useEffect(() => {
        if (!panning) return undefined
        const move = (event) => {
            const pan = panRef.current
            if (!pan) return
            setOffset({
                x: pan.from.x + (event.clientX - pan.startX),
                y: pan.from.y + (event.clientY - pan.startY)
            })
        }
        const up = () => { panRef.current = null; setPanning(false) }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
        return () => {
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', up)
        }
    }, [panning])

    useEffect(() => {
        const onKey = (event) => { if (event.key === 'Escape') setOpenMenu(null) }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [])

    // `grid` never writes back to the windows' own positions: it is a way of
    // looking at the desk, not a rearrangement of it, so `canvas` finds
    // everything exactly where it was left.
    const shown = useMemo(() => (
        arrangement === 'grid' ? arrangeGrid(windows, viewportWidth) : windows
    ), [arrangement, windows, viewportWidth])

    const worldOffset = arrangement === 'grid' ? { x: 0, y: 0 } : offset

    return (
        <div className="desk-root" data-page="desk">
            <div className="desk-top">
                <a className="desk-mark" href="/">di<span>.</span>desk</a>
                {spaceId ? <span className="desk-where">{spaceId}</span> : null}

                <div className="desk-tools">
                    <button
                        type="button"
                        className={`desk-btn${openMenu === 'add' ? ' is-on' : ''}`}
                        aria-expanded={openMenu === 'add'}
                        onClick={() => setOpenMenu((m) => (m === 'add' ? null : 'add'))}
                    >
                        + add
                    </button>
                    <button
                        type="button"
                        className={`desk-btn${openMenu === 'layouts' ? ' is-on' : ''}`}
                        aria-expanded={openMenu === 'layouts'}
                        onClick={() => setOpenMenu((m) => (m === 'layouts' ? null : 'layouts'))}
                    >
                        layouts
                    </button>
                    <div className="desk-seg" role="group" aria-label="Arrangement">
                        <button
                            type="button"
                            className="desk-btn"
                            aria-pressed={arrangement === 'canvas'}
                            onClick={() => setArrangement('canvas')}
                        >
                            canvas
                        </button>
                        <button
                            type="button"
                            className="desk-btn"
                            aria-pressed={arrangement === 'grid'}
                            onClick={() => setArrangement('grid')}
                        >
                            grid
                        </button>
                    </div>
                </div>
            </div>

            {openMenu === 'add' ? (
                <div className="desk-menu" style={{ right: 232 }} role="menu">
                    {DESK_KINDS.map((entry) => (
                        <button key={entry.kind} type="button" role="menuitem" onClick={() => addWindow(entry.kind)}>
                            {entry.label} <span className="desk-menu-what">— {entry.what}</span>
                        </button>
                    ))}
                </div>
            ) : null}

            {openMenu === 'layouts' ? (
                <div className="desk-menu" style={{ right: 150 }} role="menu">
                    {LAYOUTS.map((layout) => (
                        <button key={layout.id} type="button" role="menuitem" onClick={() => applyLayout(layout)}>
                            {layout.label} <span className="desk-menu-what">— {layout.what}</span>
                        </button>
                    ))}
                    <hr />
                    <button type="button" role="menuitem" onClick={seeItAll}>
                        see it all <span className="desk-menu-what">— bring everything into view</span>
                    </button>
                    <button type="button" role="menuitem" onClick={() => { setOffset({ x: 0, y: 0 }); setOpenMenu(null) }}>
                        recenter <span className="desk-menu-what">— back to the top-left</span>
                    </button>
                </div>
            ) : null}

            <div
                className={`desk-viewport${panning ? ' is-panning' : ''}`}
                ref={viewportRef}
                onPointerDown={onPointerDown}
            >
                <div className="desk-weave" style={{ transform: `translate(${worldOffset.x % 48}px, ${worldOffset.y % 48}px)` }} />
                <div className="desk-world" style={{ transform: `translate(${worldOffset.x}px, ${worldOffset.y}px)` }}>
                    {shown.map((w) => (
                        <DesktopWindow
                            key={w.id}
                            windowState={w}
                            title={w.title}
                            kicker={kindSpec(w.kind).what}
                            onPatch={(patch) => patchWindow(w.id, patch)}
                            onClose={() => closeWindow(w.id)}
                            onToggleMinimize={() => patchWindow(w.id, { minimized: !w.minimized })}
                        >
                            <DeskWindowBody
                                window={w}
                                spaceId={spaceId}
                                onText={(text) => patchWindow(w.id, { text })}
                            />
                        </DesktopWindow>
                    ))}
                </div>

                {shown.length === 0 ? (
                    <p className="desk-empty">
                        <b>an empty desk</b>
                        + add puts something on it · layouts sets one out for you
                    </p>
                ) : null}
            </div>
        </div>
    )
}

function DeskWindowBody({ window: w, spaceId, onText }) {
    if (w.kind === 'note') {
        return (
            <textarea
                className="desk-note"
                value={w.text || ''}
                placeholder="…"
                spellCheck="false"
                onChange={(event) => onText(event.target.value)}
            />
        )
    }

    if (w.kind === 'room') {
        return (
            <div className="desk-hosted">
                <Suspense fallback={null}>
                    <GridFloorBackground contained />
                </Suspense>
                <p className="desk-hosted-note">{spaceId || 'main'} — the room, live</p>
            </div>
        )
    }

    // The graph is the next thing to move onto the desk; until it does, this
    // window says so rather than pretending to be empty.
    return (
        <div className="desk-hosted">
            <p className="desk-hosted-note">the nodes move in here next</p>
        </div>
    )
}
