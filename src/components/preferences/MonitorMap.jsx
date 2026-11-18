import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import WorldLegend, { shapePoints } from './WorldLegend.jsx'
import { ASPECT, KIND_ORDER, KIND_STYLE, KIND_TITLE, layoutMap, sizeOf } from './monitorMapLayout.js'

// One map, three views of one layout (monitorMapLayout.js):
//   2D   an SVG graph: hover lights a node's neighbours and dims the rest,
//        drag pans, wheel / pinch zooms, Fit, live edges carry a moving dash;
//   3D   the same nodes as bodies in a room, each with its 2D card (lazy chunk);
//   List the grouped list, the default under 600 px.
// The choice is remembered per browser.

const Map3D = lazy(() => import('./MonitorMap3D.jsx'))

const STATE_TONE = { ok: 'success', warn: 'warning', off: 'muted' }
const LIVE_EDGES = new Set(['runs', 'serves'])
const PHONE_QUERY = '(max-width: 600px)'
const VIEW_KEY = 'di.monitor.map.view'
const VIEWS = [['2d', '2D'], ['3d', '3D'], ['list', 'List']]
const MIN_ZOOM = 0.25
const MAX_ZOOM = 6

export const useNarrow = () => {
    const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(PHONE_QUERY).matches : false)
    const [narrow, setNarrow] = useState(get)
    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return undefined
        const mq = window.matchMedia(PHONE_QUERY)
        const on = () => setNarrow(mq.matches)
        on()
        mq.addEventListener?.('change', on)
        return () => mq.removeEventListener?.('change', on)
    }, [])
    return narrow
}

const readView = () => {
    try {
        const v = window.localStorage.getItem(VIEW_KEY)
        return VIEWS.some(([id]) => id === v) ? v : null
    } catch { return null }
}
const writeView = (v) => { try { window.localStorage.setItem(VIEW_KEY, v) } catch { /* private window: the choice just is not kept */ } }

// The stage takes the screen that is left below it: measured from where it starts
// (as if the page were scrolled to the top), never guessed. Min 420 px.
const MIN_STAGE = 420
const useFillHeight = (rootRef, view) => {
    useLayoutEffect(() => {
        const root = rootRef.current
        if (!root || view === 'list') return undefined
        const measure = () => {
            const stage = root.querySelector('.monitor-map-stage')
            if (!stage) return
            const scroller = root.closest('.monitor-page.is-full')
            const scrolled = scroller ? scroller.scrollTop : window.scrollY || 0
            const top = stage.getBoundingClientRect().top + scrolled
            const key = root.querySelector('.monitor-map-key')
            const below = (key ? key.offsetHeight : 0) + 16
            root.style.setProperty('--monitor-map-h', `${Math.max(MIN_STAGE, Math.round(window.innerHeight - top - below))}px`)
        }
        measure()
        window.addEventListener('resize', measure)
        const page = root.closest('.monitor-page')
        const ro = typeof ResizeObserver === 'function' && page ? new ResizeObserver(measure) : null
        ro?.observe(page)
        return () => { window.removeEventListener('resize', measure); ro?.disconnect() }
    }, [rootRef, view])
}

const clip = (text, n) => (text.length > n ? `${text.slice(0, n - 1)}…` : text)
const toneOf = (state) => STATE_TONE[state] || 'muted'
const edgeKey = (e, i) => `${e.from}>${e.to}>${e.kind}>${i}`

export function MapList({ nodes, selectedId, onPick }) {
    return (
        <div className="monitor-map-list" data-monitor-map="list">
            {KIND_ORDER.map((kind) => {
                const group = nodes.filter((n) => n.kind === kind)
                if (!group.length) return null
                return (
                    <div key={kind} className="monitor-group">
                        <div className="monitor-group-title">{KIND_TITLE[kind]} <span className="preferences-tree-tag">{group.length}</span></div>
                        <div className="monitor-grid">
                            {group.map((n) => (
                                <button key={n.id} type="button" data-map-node={n.id}
                                    className={`monitor-row tone-${toneOf(n.state)}${selectedId === n.id ? ' is-selected' : ''}`}
                                    aria-pressed={selectedId === n.id} onClick={() => onPick(n)}>
                                    <span className="monitor-name">{n.label}</span>
                                    <span className="monitor-meta">{n.stateLabel || n.state}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

// the Spaces world keeps a strip under the map for its legend
const fitBox = (layout, world = false) => (world ? { ...layout.bounds, h: layout.bounds.h + 64 } : { ...layout.bounds })

const POS_KEY = 'di.monitor.map.pos'
const readPos = () => {
    try {
        const o = JSON.parse(window.localStorage.getItem(POS_KEY) || '{}')
        return o && typeof o === 'object' ? o : {}
    } catch { return {} }
}
const writePos = (o) => { try { window.localStorage.setItem(POS_KEY, JSON.stringify(o)) } catch { /* the arrangement just is not kept */ } }

/** The wheel zooms the map only when you asked for it: full screen, or Ctrl/Cmd (a trackpad pinch sends Ctrl). Otherwise the page scrolls. */
export const wheelZooms = (ev, fullscreen) => Boolean(fullscreen || ev.ctrlKey || ev.metaKey)

export function Map2D({ layout, selectedId, onPick, live, fullscreen = false, world = false, kinds = false }) {
    const showKinds = world || kinds
    const svgRef = useRef(null)
    const [vb, setVb] = useState(() => fitBox(layout, world))
    const [hover, setHover] = useState(null)
    const drag = useRef({ pointers: new Map(), moved: false, last: null, pinch: 0 })
    const vbRef = useRef(vb)
    const fsRef = useRef(fullscreen)
    useEffect(() => { fsRef.current = fullscreen }, [fullscreen])
    // nodes you moved, in layout units, kept per browser; a node that is gone is simply ignored
    const [moved, setMoved] = useState(readPos)
    const movedRef = useRef(moved)
    const nodeDrag = useRef(null)
    const posOf = useCallback((id) => moved[id] || layout.pos.get(id), [moved, layout.pos])
    useEffect(() => { vbRef.current = vb }, [vb])
    // pixels per layout unit: in the kinds look a name never draws under 11 px, however small the pane
    const [ppu, setPpu] = useState(1)
    useLayoutEffect(() => {
        const el = svgRef.current
        if (!el || !showKinds) return undefined
        const measure = () => { const r = el.getBoundingClientRect(); if (r.width && r.height) setPpu(Math.min(r.width / vb.w, r.height / vb.h)) }
        measure()
        const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
        ro?.observe(el)
        return () => ro?.disconnect()
    }, [vb, showKinds])
    const labelFs = showKinds ? Math.min(30, Math.max(20, 11 / ppu)) : 20
    const stateFs = showKinds ? Math.max(14.4, 11 / ppu) : 14.4
    const showState = !showKinds || stateFs <= 18

    // a different set of nodes (not a state change) refits the view
    const shape = layout.nodes.map((n) => n.id).join('|')
    useEffect(() => { setVb(fitBox(layout, world)) }, [shape]) // eslint-disable-line react-hooks/exhaustive-deps

    const scaleOf = useCallback((box) => {
        const r = svgRef.current?.getBoundingClientRect?.()
        if (!r || !r.width || !r.height) return { s: 1, ox: 0, oy: 0, r: { left: 0, top: 0 } }
        const s = Math.max(box.w / r.width, box.h / r.height)
        return { s, ox: (r.width - box.w / s) / 2, oy: (r.height - box.h / s) / 2, r }
    }, [])

    const zoomAt = useCallback((factor, clientX, clientY) => {
        const box = vbRef.current
        const fit = layout.bounds
        const { s, ox, oy, r } = scaleOf(box)
        const px = clientX == null ? box.x + box.w / 2 : box.x + (clientX - r.left - ox) * s
        const py = clientY == null ? box.y + box.h / 2 : box.y + (clientY - r.top - oy) * s
        const w = Math.min(fit.w / MIN_ZOOM, Math.max(fit.w / MAX_ZOOM, box.w * factor))
        const k = w / box.w
        setVb({ x: px - (px - box.x) * k, y: py - (py - box.y) * k, w, h: box.h * k })
    }, [layout.bounds, scaleOf])

    useEffect(() => {
        const el = svgRef.current
        if (!el) return undefined
        const onWheel = (ev) => { if (!wheelZooms(ev, fsRef.current)) return; ev.preventDefault(); zoomAt(ev.deltaY > 0 ? 1.15 : 1 / 1.15, ev.clientX, ev.clientY) }
        el.addEventListener('wheel', onWheel, { passive: false })
        return () => el.removeEventListener('wheel', onWheel)
    }, [zoomAt])

    const onPointerDown = (ev) => {
        const d = drag.current
        d.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
        d.last = { x: ev.clientX, y: ev.clientY }
        d.moved = false
        d.pinch = 0
    }
    const onPointerMove = (ev) => {
        const d = drag.current
        if (!d.pointers.has(ev.pointerId)) return
        const prev = d.pointers.get(ev.pointerId)
        d.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
        if (d.pointers.size === 2) {
            const [a, b] = [...d.pointers.values()]
            const dist = Math.hypot(a.x - b.x, a.y - b.y)
            if (d.pinch) zoomAt(d.pinch / dist, (a.x + b.x) / 2, (a.y + b.y) / 2)
            d.pinch = dist
            d.moved = true
            return
        }
        if (!d.moved && Math.hypot(ev.clientX - d.last.x, ev.clientY - d.last.y) < 5) return
        if (!d.moved) { d.moved = true; try { svgRef.current?.setPointerCapture?.(ev.pointerId) } catch { /* no capture: pan still works inside the svg */ } }
        const { s } = scaleOf(vbRef.current)
        const dx = (ev.clientX - prev.x) * s
        const dy = (ev.clientY - prev.y) * s
        setVb((b) => ({ ...b, x: b.x - dx, y: b.y - dy }))
    }
    const onPointerUp = (ev) => {
        const d = drag.current
        d.pointers.delete(ev.pointerId)
        d.pinch = 0
        if (!d.pointers.size) setTimeout(() => { d.moved = false }, 0)
    }
    const pick = (n) => { if (!drag.current.moved && !(nodeDrag.current && nodeDrag.current.moved)) onPick(n) }
    const onNodeDown = (ev, n) => {
        if (ev.button !== 0 || drag.current.pointers.size) return
        ev.stopPropagation()
        const p = posOf(n.id)
        nodeDrag.current = { id: n.id, sx: ev.clientX, sy: ev.clientY, px: p.x, py: p.y, moved: false }
        try { ev.currentTarget.setPointerCapture?.(ev.pointerId) } catch { /* the move still reaches the svg */ }
    }
    const onNodeMove = (ev) => {
        const d = nodeDrag.current
        if (!d) return
        if (!d.moved && Math.hypot(ev.clientX - d.sx, ev.clientY - d.sy) < 4) return
        d.moved = true
        ev.stopPropagation()
        const { s } = scaleOf(vbRef.current)
        const next = { ...movedRef.current, [d.id]: { x: d.px + (ev.clientX - d.sx) * s, y: d.py + (ev.clientY - d.sy) * s } }
        movedRef.current = next
        setMoved(next)
    }
    const onNodeUp = (ev) => {
        const d = nodeDrag.current
        if (!d) return
        ev.stopPropagation()
        if (d.moved) {
            // keep only nodes that are still on the map, so a device that left does not leave its position behind
            const kept = Object.fromEntries(Object.entries(movedRef.current).filter(([id]) => layout.pos.has(id)))
            movedRef.current = kept
            setMoved(kept)
            writePos(kept)
        }
        setTimeout(() => { nodeDrag.current = null }, 0)
    }
    const resetNodes = () => { movedRef.current = {}; setMoved({}); writePos({}) }
    const anyMoved = Object.keys(moved).some((id) => layout.pos.has(id))

    const neighbours = useMemo(() => {
        const m = new Map()
        for (const e of layout.edges) {
            if (!m.has(e.from)) m.set(e.from, new Set())
            if (!m.has(e.to)) m.set(e.to, new Set())
            m.get(e.from).add(e.to)
            m.get(e.to).add(e.from)
        }
        return m
    }, [layout.edges])

    const focus = hover || selectedId || null
    const faint = showKinds && layout.edges.length > 12 // a hairball: the lines are quiet until a node is picked
    const near = focus ? neighbours.get(focus) || new Set() : null
    const hot = (id) => !focus || id === focus || near.has(id)
    const hovered = hover ? layout.nodes.find((n) => n.id === hover) : null

    return (
        <div className={`monitor-map-stage${world ? ' is-world' : ''}${showKinds ? ' is-kinds' : ''}`}>
            <svg ref={svgRef} className="monitor-map-svg" viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid meet"
                role="group" aria-label="Map of machines, tiers, spaces and shows"
                onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
                <g className="monitor-map-rings">
                    {layout.radii.map((r) => <ellipse key={r} cx="0" cy="0" rx={r * layout.aspect} ry={r} className="monitor-ring" />)}
                </g>
                <g className="monitor-map-hub-lines">
                    {layout.tierIds.map((id) => {
                        const p = layout.pos.get(id)
                        return <line key={id} x1="0" y1="0" x2={p.x} y2={p.y} className="monitor-hub-line" />
                    })}
                </g>
                <g className="monitor-map-edges">
                    {layout.edges.map((e, i) => {
                        const a = posOf(e.from)
                        const b = posOf(e.to)
                        const lit = !!focus && (e.from === focus || e.to === focus)
                        const cls = `monitor-edge kind-${e.kind}${lit ? ' is-lit' : focus ? ' is-dim' : faint ? ' is-faint' : ''}${live && LIVE_EDGES.has(e.kind) && (!showKinds || lit) ? ' is-live' : ''}`
                        return <line key={edgeKey(e, i)} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={cls} />
                    })}
                </g>
                <g className="monitor-hub" aria-hidden="true">
                    <rect x="-46" y="-20" width="92" height="40" className="monitor-hub-box" />
                    <text x="0" y="5" textAnchor="middle" className="monitor-hub-label">di.iiii</text>
                </g>
                {layout.nodes.map((n) => {
                    const p = posOf(n.id)
                    const { w, h } = sizeOf(n.kind)
                    const sel = selectedId === n.id
                    const cls = `monitor-node kind-${n.kind} tone-${toneOf(n.state)}${sel ? ' is-selected' : ''}${hover === n.id ? ' is-hover' : ''}${focus && !hot(n.id) ? ' is-dim' : ''}`
                    return (
                        <g key={n.id} transform={`translate(${p.x - w / 2},${p.y - h / 2})`} data-map-node={n.id} role="button" tabIndex={0}
                            aria-pressed={sel} aria-label={`${n.kind} ${n.label}, ${n.stateLabel || n.state}`} className={cls}
                            onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover((h0) => (h0 === n.id ? null : h0))}
                            onFocus={() => setHover(n.id)} onBlur={() => setHover((h0) => (h0 === n.id ? null : h0))}
                            onClick={() => pick(n)}
                            onPointerDown={(ev) => onNodeDown(ev, n)} onPointerMove={onNodeMove} onPointerUp={onNodeUp} onPointerCancel={onNodeUp}
                            onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onPick(n) } }}>
                            {showKinds && sel ? <rect x="-6" y="-6" width={w + 12} height={h + 12} className="monitor-node-ring" /> : null}
                            <rect width={w} height={h} className="monitor-node-box" />
                            <rect width="6" height={h} className="monitor-node-edge" />
                            {showKinds && KIND_STYLE[n.kind] ? <polygon points={shapePoints(KIND_STYLE[n.kind].shape, w - 16, h - 16, 12)} className="monitor-node-glyph" style={{ fill: `var(${KIND_STYLE[n.kind].token})` }} /> : null}
                            <text x="16" y={showState ? h / 2 - 3 : h / 2 + labelFs * 0.35} className="monitor-node-label" style={showKinds ? { fontSize: labelFs } : undefined}>{clip(n.label, Math.floor((w - 28) / (labelFs * 0.48)))}</text>
                            {showState ? <text x="16" y={h / 2 + 15 + (showKinds ? (stateFs - 14.4) * 0.8 : 0)} className="monitor-node-state" style={showKinds ? { fontSize: stateFs } : undefined}>{world ? (n.stateLabel || n.state) : `${n.stateLabel || n.state} · ${n.kind}`}</text> : null}
                            <title>{`${n.kind}: ${n.label} (${n.stateLabel || n.state})`}</title>
                        </g>
                    )
                })}
                {hovered && ((showKinds && !showState) || hovered.label.length > Math.floor((sizeOf(hovered.kind).w - 28) / (labelFs * 0.48))) ? (() => {
                    const p = posOf(hovered.id)
                    const { h } = sizeOf(hovered.kind)
                    const text = hovered.label
                    const w = Math.max(120, text.length * 9 + 28)
                    return (
                        <g className={`monitor-tip tone-${toneOf(hovered.state)}`} transform={`translate(${p.x - w / 2},${p.y - h / 2 - 58})`} pointerEvents="none">
                            <rect width={w} height="46" className="monitor-tip-box" />
                            <text x="12" y="20" className="monitor-tip-label">{text}</text>
                            <text x="12" y="38" className="monitor-tip-meta">{`${hovered.kind} · ${hovered.stateLabel || hovered.state}`}</text>
                        </g>
                    )
                })() : null}
            </svg>
            <div className="monitor-map-tools" role="group" aria-label="Map zoom">
                <button type="button" className="monitor-map-tool" data-map-tool="fit" onClick={() => setVb(fitBox(layout, world))}>Fit</button>
                {anyMoved ? <button type="button" className="monitor-map-tool" data-map-tool="reset" onClick={resetNodes}>Reset nodes</button> : null}
                <button type="button" className="monitor-map-tool" data-map-tool="in" aria-label="Zoom in" onClick={() => zoomAt(1 / 1.3)}>+</button>
                <button type="button" className="monitor-map-tool" data-map-tool="out" aria-label="Zoom out" onClick={() => zoomAt(1.3)}>−</button>
            </div>
            {showKinds ? <WorldLegend nodes={layout.nodes} edges={layout.edges} /> : null}
            <div className="monitor-map-hint">Drag a node to move it · drag the map to pan · {fullscreen ? 'scroll' : 'Ctrl + scroll'} or pinch to zoom</div>
        </div>
    )
}

// `view` pins the view ('2d' | '3d') when the page owns the List | 2D | 3D switch (the Spaces world);
// `onOpen(node)` adds an "Open" button on the selected node's card in full screen, where the detail is hidden.
export default function MonitorMap({ map, selectedId, onPick, narrow, live = false, view: pinned = null, onOpen = null, empty = null, world = false, kinds = false, layoutFn = layoutMap }) {
    const nodes = useMemo(() => map?.nodes || [], [map])
    const layout = useMemo(() => layoutFn(map, narrow ? 1 : ASPECT), [map, narrow, layoutFn])
    const [stored, setStored] = useState(readView)
    const view = pinned || stored || (narrow ? 'list' : '2d')
    const rootRef = useRef(null)
    const [fullscreen, setFullscreen] = useState(false)
    const selectedNode = selectedId ? nodes.find((n) => n.id === selectedId) || null : null
    const choose = (v) => { if (v === 'list') setFullscreen(false); setStored(v); writeView(v) }
    useFillHeight(rootRef, view)
    // the List view has no Exit button: a view that resolves to List (narrow screen) leaves full screen too
    useEffect(() => { if (view === 'list') setFullscreen(false) }, [view])
    // Esc leaves; the page behind does not scroll while the map covers it
    useEffect(() => {
        if (!fullscreen) return undefined
        const onKey = (ev) => { if (ev.key === 'Escape') setFullscreen(false) }
        window.addEventListener('keydown', onKey)
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
    }, [fullscreen])

    if (!nodes.length) return <div className="monitor-note">{empty || 'Nothing on the map yet. Machines, tiers and spaces appear when the server reports them.'}</div>

    return (
        <div className={`monitor-map${fullscreen ? ' is-fullscreen' : ''}`} data-monitor-map-view={view} ref={rootRef}>
            <div className={`monitor-map-views${pinned ? ' is-solo' : ''}`} role="group" aria-label="Map view">
                {pinned ? null : VIEWS.map(([id, label]) => (
                    <button key={id} type="button" data-map-view={id} className={`monitor-map-view${view === id ? ' is-active' : ''}`}
                        aria-pressed={view === id} onClick={() => choose(id)}>{label}</button>
                ))}
                {view !== 'list' ? (
                    <button type="button" className="monitor-map-view monitor-map-fs" data-map-fullscreen={fullscreen ? 'on' : 'off'}
                        aria-pressed={fullscreen} onClick={() => setFullscreen((f) => !f)}>{fullscreen ? 'Exit full screen' : 'Full screen'}</button>
                ) : null}
            </div>
            {view === 'list' ? <MapList nodes={nodes} selectedId={selectedId} onPick={onPick} /> : null}
            {view === '2d' ? (
                <div data-monitor-map="graph"><Map2D layout={layout} selectedId={selectedId} onPick={onPick} live={live} fullscreen={fullscreen} world={world} kinds={kinds} /></div>
            ) : null}
            {view === '3d' ? (
                <div data-monitor-map="3d">
                    <Suspense fallback={<div className="monitor-note">Loading the 3D room…</div>}>
                        <Map3D layout={layout} selectedId={selectedId} onPick={onPick} live={live} fullscreen={fullscreen} world={world} kinds={kinds} />
                    </Suspense>
                </div>
            ) : null}
            {fullscreen && onOpen && selectedNode ? (
                <div className="monitor-map-card" data-map-card={selectedNode.id}>
                    <div className="monitor-map-card-name">{selectedNode.label}</div>
                    <div className="monitor-map-card-meta">{`${selectedNode.kind} · ${selectedNode.stateLabel || selectedNode.state}`}</div>
                    <button type="button" className="monitor-map-tool" onClick={() => { setFullscreen(false); onOpen(selectedNode) }}>Open details</button>
                </div>
            ) : null}
            <div className="monitor-map-key">
                {KIND_ORDER.filter((k) => nodes.some((n) => n.kind === k)).map((k) => <span key={k}>{KIND_TITLE[k]}</span>)}
            </div>
        </div>
    )
}
