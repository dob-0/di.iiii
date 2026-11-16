import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ASPECT, KIND_ORDER, KIND_TITLE, layoutMap, sizeOf } from './monitorMapLayout.js'
import { nudgeLabels } from './monitorMap3dPolicy.js'
import { groupMap, visibleEdges } from './monitorMapGroups.js'
import { mergeKnowledge } from './monitorMapKnowledge.js'

// One map, three views of one layout (monitorMapLayout.js):
//   2D   an SVG graph: hover lights a node's neighbours and dims the rest,
//        drag pans, wheel / pinch zooms, Fit, live edges carry a moving dash;
//   3D   the same nodes as bodies in a room, each with its 2D card (lazy chunk);
//   List the grouped list, the default under 600 px.
// All three draw the GROUPED map (monitorMapGroups.js): one node per space name, big families folded.
// The choice is remembered per browser.

const Map3D = lazy(() => import('./MonitorMap3D.jsx'))

const STATE_TONE = { ok: 'success', warn: 'warning', off: 'muted' }
const LIVE_EDGES = new Set(['runs', 'serves'])
const PHONE_QUERY = '(max-width: 600px)'
const VIEW_KEY = 'di.monitor.map.view'
const VIEWS = [['2d', '2D'], ['3d', '3D'], ['list', 'List']]
// the 2D map is a desk view: its 150 px cards shrink to 7 px text on a phone, so a phone gets 3D and List only
const PHONE_VIEWS = VIEWS.filter(([id]) => id !== '2d')
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

// the second line of a card: where a space lives, how to open a group, else kind and state
const subText = (n) => (n.sub ? n.sub : n.kind === 'space' && n.tiers?.length ? n.tiers.join(' · ') : n.kind === 'group' ? `open it · ${n.tiers.join(' ')}` : `${n.kind} · ${n.state}`)
// a card letter is about 10.2 map units wide (getBBox on the preview, 2026-11-16); 10.4 keeps both lines inside
const CARD_CHAR = 9
const clip = (text, n) => (text.length > n ? `${text.slice(0, n - 1)}…` : text)
const toneOf = (state) => STATE_TONE[state] || 'muted'
const edgeKey = (e, i) => `${e.from}>${e.to}>${e.kind}>${i}`

function MapList({ nodes, selectedId, onPick }) {
    return (
        <div className="monitor-map-list" data-monitor-map="list">
            {KIND_ORDER.map((kind) => {
                if (kind === 'group') return null
                const group = nodes.filter((n) => n.kind === kind || (kind === 'space' && n.kind === 'group'))
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
                                    <span className="monitor-meta">{subText(n)}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

// Semantic zoom: node POSITIONS follow the view, the cards keep their size and type in screen px.
// Fit leaves half a card of room round the outermost centres so every node is whole on the stage.
// Cards are drawn in screen px (1 unit = 1 px): two lines of brand type, or one line for the small kinds (helpers, to do, repos).
// `r` is the page's rem in px / 16, so a fluid root size grows the card with its type and two lines never touch.
// The width follows the text (never wider than the kind's room): short names make short cards, so a crowded map fits.
const COMPACT = new Set(['helper', 'knowledge', 'repo'])
const isCompact = (n) => COMPACT.has(n.kind)
const cardPx = (n, r = 1) => {
    const chars = isCompact(n) ? String(n.label || '').length : Math.max(String(n.label || '').length, String(subText(n) || '').length)
    return { w: Math.min(sizeOf(n.kind).w * r, Math.max(84 * r, (28 + CARD_CHAR * chars) * r)), h: (isCompact(n) ? 30 : 48) * r }
}
const useRem = () => {
    const get = () => (typeof window !== 'undefined' && window.getComputedStyle ? (parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16) / 16 : 1)
    const [r, setR] = useState(get)
    useEffect(() => { const on = () => setR(get()); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on) }, [])
    return r
}
// the view buttons, zoom tools and the key sit on the stage: Fit keeps the nodes out of those bands (px)
const INSET_TOP = 40
const INSET_BOTTOM = 40
const fitBox = (layout, size = null, r = 1) => {
    if (!size || !size.w || !size.h) return { ...layout.bounds }
    let x0 = 0, x1 = 0, y0 = 0, y1 = 0
    let mx = 50, my = 24
    for (const n of layout.nodes) {
        const p = layout.pos.get(n.id)
        const c = cardPx(n, r)
        x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y)
        mx = Math.max(mx, c.w / 2 + 8); my = Math.max(my, c.h / 2 + 8)
    }
    const band = Math.max(1, size.h - INSET_TOP - INSET_BOTTOM)
    const s = Math.max((x1 - x0) / Math.max(1, size.w - 2 * mx), (y1 - y0) / Math.max(1, band - 2 * my), 0.05)
    const w = size.w * s
    const h = size.h * s
    return { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - (INSET_TOP + band / 2) * s, w, h }
}

function Map2D({ layout, selectedId, onPick, live, onFold, flow = null }) {
    const svgRef = useRef(null)
    const rem = useRem()
    const [size, setSize] = useState({ w: 0, h: 0 })
    const [vb, setVb] = useState(() => fitBox(layout))
    const [hover, setHover] = useState(null)
    const drag = useRef({ pointers: new Map(), moved: false, last: null, pinch: 0 })
    const vbRef = useRef(vb)
    const fitRef = useRef(vb)
    useEffect(() => { vbRef.current = vb }, [vb])

    useLayoutEffect(() => {
        const el = svgRef.current
        if (!el) return undefined
        const read = () => { const r = el.getBoundingClientRect(); setSize((o) => (Math.round(o.w) === Math.round(r.width) && Math.round(o.h) === Math.round(r.height) ? o : { w: r.width, h: r.height })) }
        read()
        if (typeof ResizeObserver === 'undefined') return undefined
        const ro = new ResizeObserver(read)
        ro.observe(el)
        return () => ro.disconnect()
    }, [])

    // a different set of nodes (not a state change) or a different stage size refits the view
    const shape = layout.nodes.map((n) => n.id).join('|')
    useEffect(() => { const f = fitBox(layout, size, rem); fitRef.current = f; setVb(f) }, [shape, size.w, size.h, rem]) // eslint-disable-line react-hooks/exhaustive-deps

    const scaleOf = useCallback((box) => {
        const r = svgRef.current?.getBoundingClientRect?.()
        if (!r || !r.width || !r.height) return { s: 1, ox: 0, oy: 0, r: { left: 0, top: 0 } }
        const s = Math.max(box.w / r.width, box.h / r.height)
        return { s, ox: (r.width - box.w / s) / 2, oy: (r.height - box.h / s) / 2, r }
    }, [])

    const zoomAt = useCallback((factor, clientX, clientY) => {
        const box = vbRef.current
        const fit = fitRef.current
        const { s, ox, oy, r } = scaleOf(box)
        const px = clientX == null ? box.x + box.w / 2 : box.x + (clientX - r.left - ox) * s
        const py = clientY == null ? box.y + box.h / 2 : box.y + (clientY - r.top - oy) * s
        const w = Math.min(fit.w / MIN_ZOOM, Math.max(fit.w / MAX_ZOOM, box.w * factor))
        const k = w / box.w
        setVb({ x: px - (px - box.x) * k, y: py - (py - box.y) * k, w, h: box.h * k })
    }, [scaleOf])

    useEffect(() => {
        const el = svgRef.current
        if (!el) return undefined
        const onWheel = (ev) => { ev.preventDefault(); zoomAt(ev.deltaY > 0 ? 1.15 : 1 / 1.15, ev.clientX, ev.clientY) }
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
    const pick = (n) => { if (!drag.current.moved) onPick(n) }

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
    const near = focus ? neighbours.get(focus) || new Set() : null
    const hot = (id) => !focus || id === focus || near.has(id)
    const hovered = hover ? layout.nodes.find((n) => n.id === hover) : null
    const edgesShown = visibleEdges(layout.edges, focus, 12)

    // what the last snapshot sent: reports along their edge, changes onto their node (the real stream; empty when paused)
    const pulseOf = useMemo(() => {
        const edges = new Map()
        const nodes = new Map()
        for (const p of flow?.pulses || []) {
            if (p.kind === 'report') edges.set(`${p.from}>${p.to}`, p.tone)
            nodes.set(p.to, p.tone)
        }
        return { edges, nodes }
    }, [flow?.pulses])

    // screen scale (world units per px) and the nudge: cards that would sit on each other are pushed apart in px
    const k = size.w && size.h ? Math.max(vb.w / size.w, vb.h / size.h) : 1
    const eff = useMemo(() => {
        const items = layout.nodes.map((n) => {
            const p = layout.pos.get(n.id)
            const c = cardPx(n, rem)
            return { id: n.id, x: (p.x - vb.x) / k, y: (p.y - vb.y) / k - INSET_TOP, w: c.w, h: c.h }
        })
        const moved = size.w ? nudgeLabels(items, { gap: 4, passes: 200, limit: Math.max(size.w, size.h), bounds: { width: size.w, height: Math.max(1, size.h - INSET_TOP - INSET_BOTTOM) } }) : {}
        const out = new Map()
        for (const n of layout.nodes) {
            const p = layout.pos.get(n.id)
            const d = moved[n.id]
            out.set(n.id, d ? { x: p.x + d.dx * k, y: p.y + d.dy * k } : p)
        }
        return out
    }, [layout, vb, k, size.w, size.h, rem])

    return (
        <div className="monitor-map-stage">
            <svg ref={svgRef} className="monitor-map-svg" viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid meet"
                role="group" aria-label="Map of machines, tiers, spaces and shows"
                onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
                <g className="monitor-map-rings">
                    {layout.radii.map((r) => <ellipse key={r} cx="0" cy="0" rx={r * layout.aspect} ry={r} className="monitor-ring" />)}
                </g>
                <g className="monitor-map-hub-lines">
                    {layout.tierIds.map((id) => {
                        const p = eff.get(id)
                        return <line key={id} x1="0" y1="0" x2={p.x} y2={p.y} className="monitor-hub-line" />
                    })}
                </g>
                <g className="monitor-map-edges">
                    {edgesShown.map((e, i) => {
                        const a = eff.get(e.from)
                        const b = eff.get(e.to)
                        const lit = !!focus && (e.from === focus || e.to === focus)
                        const hit = pulseOf.edges.get(`${e.from}>${e.to}`)
                        const rate = e.kind === 'reports' ? flow?.rates?.[String(e.from).slice(8)] : null
                        const cls = `monitor-edge kind-${e.kind}${lit ? ' is-lit' : focus ? ' is-dim' : ''}${live && LIVE_EDGES.has(e.kind) ? ' is-live' : ''}${hit ? ` is-pulse pulse-${hit}` : ''}${rate?.silent ? ' is-silent' : ''}`
                        return <line key={edgeKey(e, i)} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={cls} data-rate={rate ? rate.perMin : undefined} />
                    })}
                </g>
                <g className="monitor-hub" aria-hidden="true">
                    <rect x="-8" y="-8" width="16" height="16" className="monitor-hub-box" />
                </g>
                {layout.nodes.map((n) => {
                    const p = eff.get(n.id)
                    const { w, h } = cardPx(n, rem)
                    const compact = isCompact(n)
                    const sel = selectedId === n.id
                    const cls = `monitor-node kind-${n.kind} tone-${toneOf(n.state)}${sel ? ' is-selected' : ''}${hover === n.id ? ' is-hover' : ''}${focus && !hot(n.id) ? ' is-dim' : ''}${pulseOf.nodes.has(n.id) ? ` is-pulse pulse-${pulseOf.nodes.get(n.id)}` : ''}`
                    return (
                        <g key={n.id} transform={`translate(${p.x - (w / 2) * k},${p.y - (h / 2) * k}) scale(${k})`} data-map-node={n.id} role="button" tabIndex={0}
                            aria-pressed={sel} aria-label={`${n.kind} ${n.label}, ${n.state}`} className={cls}
                            onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover((h0) => (h0 === n.id ? null : h0))}
                            onFocus={() => setHover(n.id)} onBlur={() => setHover((h0) => (h0 === n.id ? null : h0))}
                            onClick={() => pick(n)}
                            onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onPick(n) } }}>
                            <rect width={w} height={h} className="monitor-node-box" />
                            <rect width={6 * rem} height={h} className="monitor-node-edge" />
                            <text x={16 * rem} y={(compact ? 20 : 21) * rem} className="monitor-node-label">{clip(n.label, Math.floor((w / rem - 28) / CARD_CHAR))}</text>
                            {compact ? null : <text x={16 * rem} y={40 * rem} className="monitor-node-state">{clip(subText(n), Math.floor((w / rem - 24) / CARD_CHAR))}</text>}
                            <title>{`${n.kind}: ${n.label} (${n.state})`}</title>
                        </g>
                    )
                })}
                {hovered && hovered.label.length > Math.floor((cardPx(hovered, rem).w / rem - 28) / CARD_CHAR) ? (() => {
                    const p = eff.get(hovered.id)
                    const { h } = cardPx(hovered, rem)
                    const text = hovered.label
                    const w = Math.max(120, text.length * 9 + 28)
                    return (
                        <g className={`monitor-tip tone-${toneOf(hovered.state)}`} transform={`translate(${p.x - (w / 2) * k},${p.y - (h / 2 + 58) * k}) scale(${k})`} pointerEvents="none">
                            <rect width={w} height="46" className="monitor-tip-box" />
                            <text x="12" y="20" className="monitor-tip-label">{text}</text>
                            <text x="12" y="38" className="monitor-tip-meta">{`${hovered.kind} · ${hovered.state}`}</text>
                        </g>
                    )
                })() : null}
            </svg>
            <div className="monitor-map-tools" role="group" aria-label="Map zoom">
                <button type="button" className="monitor-map-tool" data-map-tool="fit" onClick={() => { const f = fitBox(layout, size, rem); fitRef.current = f; setVb(f) }}>Fit</button>
                <button type="button" className="monitor-map-tool" data-map-tool="in" aria-label="Zoom in" onClick={() => zoomAt(1 / 1.3)}>+</button>
                <button type="button" className="monitor-map-tool" data-map-tool="out" aria-label="Zoom out" onClick={() => zoomAt(1.3)}>−</button>
                {onFold ? <button type="button" className="monitor-map-tool" data-map-tool="fold" onClick={onFold}>Fold spaces</button> : null}
            </div>
            <div className="monitor-map-hint">Drag to move · scroll or pinch to zoom · hover a node for its links</div>
        </div>
    )
}

// `knowledge` + `snap` (optional) add the to do, rules, skills, hooks and helpers; `onKnowledge(part)` opens that list
export default function MonitorMap({ flow = null, map, knowledge = null, snap = null, selectedId, onPick, onKnowledge, narrow, live = false, query = '', aspect = null, allViews = false }) {
    // group ids the person opened; a filter opens every group so a match is never hidden in one
    const [expanded, setExpanded] = useState([])
    const full = useMemo(() => mergeKnowledge(map, knowledge, snap), [map, knowledge, snap])
    const grouped = useMemo(() => groupMap(full, { expanded, open: !!query.trim() }), [full, expanded, query])
    const nodes = grouped.nodes
    const layout = useMemo(() => layoutMap(grouped, aspect || (narrow ? 1 : ASPECT)), [grouped, narrow, aspect])
    // a group opens on click; every other node goes to the page (the drawer)
    const pick = useCallback((n) => {
        if (n.kind === 'group') setExpanded((e) => (e.includes(n.id) ? e : [...e, n.id]))
        else if (n.kind === 'knowledge' && onKnowledge) onKnowledge(n.part)
        else onPick(n)
    }, [onPick, onKnowledge])
    const fold = expanded.length && !query.trim() ? () => setExpanded([]) : null
    const [stored, setStored] = useState(readView)
    const views = narrow && !allViews ? PHONE_VIEWS : VIEWS
    const view = views.some(([id]) => id === stored) ? stored : (narrow ? 'list' : '2d')
    const choose = (v) => { setStored(v); writeView(v) }
    const rootRef = useRef(null)
    useFillHeight(rootRef, view)

    if (!nodes.length) return <div className="monitor-note">Nothing on the map yet. Machines, tiers and spaces appear when the server reports them.</div>

    return (
        <div className="monitor-map" data-monitor-map-view={view} ref={rootRef}>
            <div className="monitor-map-views" role="group" aria-label="Map view">
                {views.map(([id, label]) => (
                    <button key={id} type="button" data-map-view={id} className={`monitor-map-view${view === id ? ' is-active' : ''}`}
                        aria-pressed={view === id} onClick={() => choose(id)}>{label}</button>
                ))}
            </div>
            {view === 'list' ? <MapList nodes={nodes} selectedId={selectedId} onPick={pick} /> : null}
            {view === '2d' ? (
                <div data-monitor-map="graph"><Map2D layout={layout} selectedId={selectedId} onPick={pick} live={live} onFold={fold} flow={flow} /></div>
            ) : null}
            {view === '3d' ? (
                <div data-monitor-map="3d">
                    <Suspense fallback={<div className="monitor-note">Loading the 3D room…</div>}>
                        <Map3D layout={layout} selectedId={selectedId} onPick={pick} live={live} />
                    </Suspense>
                </div>
            ) : null}
            {view === 'list' ? null : <div className="monitor-map-key">
                {[...new Set(KIND_ORDER.filter((k) => nodes.some((n) => n.kind === k)).map((k) => KIND_TITLE[k]))].map((t) => <span key={t}>{t}</span>)}
            </div>}
        </div>
    )
}
