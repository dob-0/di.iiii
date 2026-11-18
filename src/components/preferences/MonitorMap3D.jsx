import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Box3, Vector3 } from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Html, Line, OrbitControls } from '@react-three/drei'
import Canvas from '../GuardedCanvas.jsx'
import WorldLegend from './WorldLegend.jsx'
import { KIND_STYLE } from './monitorMapLayout.js'
import { fitKey, layoutSignature, PULSE_MS, pulseEdgeIndexes, shouldAnimate } from './monitorMap3dPolicy.js'

// The 3D view of the Monitor map: the same layout as the 2D graph, as bodies in
// a room. Kind sets the height (tiers above machines above spaces); each node
// carries its 2D card (drei Html), so 2D cards live in 3D like Raw's world
// windows. frameloop="demand": nothing is drawn while still. A light travels
// along live edges only while `live` and not under reduced motion.

const S = 0.01 // layout units -> room units
const FALLBACK = { success: '#4df9c0', warning: '#ffb84d', muted: '#5a5e66', cyan: '#4df9ff', line: '#2c2f36', live: '#50fa7b', ground: '#000000', text: '#ffffff' }
const TONE_VAR = { success: '--di-success', warning: '--di-warning', muted: '--pref-border', cyan: '--di-cyan', line: '--pref-border', live: '--di-live', text: '--di-text' }
const LIVE_EDGES = new Set(['runs', 'serves'])
const STATE_TONE = { ok: 'success', warn: 'warning', off: 'muted' }
// one colour (token) and one shape per kind, shared with the 2D glyphs and the legend (KIND_STYLE)
const TOKEN_KEY = { '--di-cyan': 'cyan', '--di-text': 'text', '--di-success': 'success', '--di-warning': 'warning' }

const readColors = () => {
    const out = { ...FALLBACK }
    try {
        const cs = window.getComputedStyle(document.documentElement)
        for (const [k, v] of Object.entries(TONE_VAR)) {
            const val = cs.getPropertyValue(v).trim()
            if (/^#[0-9a-f]{3,8}$/i.test(val)) out[k] = val
        }
        const live = cs.getPropertyValue('--di-live-rgb').trim().split(',').map((x) => Number(x))
        if (live.length === 3 && live.every(Number.isFinite)) out.live = `rgb(${live.join(',')})`
    } catch { /* keep the fallbacks */ }
    return out
}

const useReducedMotion = () => {
    const [reduced, setReduced] = useState(() => {
        try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
    })
    useEffect(() => {
        let mq
        try { mq = window.matchMedia('(prefers-reduced-motion: reduce)') } catch { return undefined }
        const on = () => setReduced(mq.matches)
        mq.addEventListener?.('change', on)
        return () => mq.removeEventListener?.('change', on)
    }, [])
    return reduced
}

const at = (p) => [p.x * S, p.h * S, p.y * S]
const floor = (p) => [p.x * S, 0, p.y * S]
const HUB = [0, 0.1, 0]
const pulseIndexes = (edges, pulsing, hoverId) => pulseEdgeIndexes({ edges, pulsing, hoverId })

function KindGeometry({ shape, size }) {
    switch (shape) {
    case 'bar': return <cylinderGeometry args={[size / 2, size / 2, size * 0.7, 4]} />
    case 'triangle': return <coneGeometry args={[size * 0.6, size * 0.9, 3]} />
    case 'circle': return <sphereGeometry args={[size * 0.5, 12, 9]} />
    case 'hex': return <cylinderGeometry args={[size * 0.55, size * 0.55, size * 0.6, 6]} />
    case 'diamond': return <octahedronGeometry args={[size * 0.62]} />
    default: return <boxGeometry args={[size, size * 0.7, size]} />
    }
}

function Body({ node, p, color, pip, dim, sel, near, kinds, onHover, onPick }) {
    const k = node.kind
    const size = k === 'tier' ? 0.55 : k === 'machine' ? 0.46 : 0.36
    const shape = kinds && KIND_STYLE[k] ? KIND_STYLE[k].shape : k === 'tier' ? 'bar' : 'square'
    const off = node.state === 'off'
    return (
        <group position={at(p)}>
            <mesh onPointerOver={(e) => { e.stopPropagation(); onHover(node.id) }} onPointerOut={() => onHover(null)}
                onClick={(e) => { e.stopPropagation(); onPick(node) }}>
                <KindGeometry shape={shape} size={size} />
                <meshBasicMaterial color={color} transparent opacity={dim ? 0.18 : off && kinds ? 0.6 : 1} />
            </mesh>
            {pip ? <mesh position={[0, size * 0.62, 0]}><boxGeometry args={[0.09, 0.09, 0.09]} /><meshBasicMaterial color={pip} transparent opacity={dim ? 0.18 : 1} /></mesh> : null}
            {sel ? <mesh><boxGeometry args={[size * 1.6, size * 1.2, size * 1.6]} /><meshBasicMaterial color="#ffffff" wireframe /></mesh> : null}
            {near && !sel ? <mesh><boxGeometry args={[size * 1.3, size * 1, size * 1.3]} /><meshBasicMaterial color={color} wireframe /></mesh> : null}
        </group>
    )
}

function Pulse({ a, b, offset, color }) {
    const ref = useRef(null)
    useFrame(({ clock }) => {
        if (!ref.current) return
        const t = (clock.elapsedTime * 0.35 + offset) % 1
        ref.current.position.set(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)
    })
    return <mesh ref={ref}><boxGeometry args={[0.1, 0.1, 0.1]} /><meshBasicMaterial color={color} /></mesh>
}

// draws a frame on a timer while something travels; nothing otherwise
function Ticker({ on }) {
    const invalidate = useThree((s) => s.invalidate)
    useEffect(() => {
        if (!on) return undefined
        const id = setInterval(() => { if (!document.hidden) invalidate() }, 40)
        return () => clearInterval(id)
    }, [on, invalidate])
    return null
}

// Frame every node (and its card) in the stage: move the camera back along `dir`
// until the farthest projected point sits at 82 % of the half-screen.
const fitCamera = (camera, points, dir, size) => {
    const vs = points.map((p) => new Vector3(...p))
    const centre = new Box3().setFromPoints(vs).getCenter(new Vector3())
    camera.aspect = size.width && size.height ? size.width / size.height : 1
    const half = Math.tan((camera.fov * Math.PI) / 360)
    const right = new Vector3()
    const up = new Vector3()
    let d = 8
    for (let i = 0; i < 14; i += 1) {
        camera.position.copy(centre).addScaledVector(dir, d)
        camera.lookAt(centre)
        camera.updateProjectionMatrix()
        camera.updateMatrixWorld()
        let x0 = Infinity
        let x1 = -Infinity
        let y0 = Infinity
        let y1 = -Infinity
        for (const v of vs) {
            const q = v.clone().project(camera)
            x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y)
        }
        // centre the projected box on the screen, then scale so it takes 84 % of the tighter side
        camera.matrixWorld.extractBasis(right, up, new Vector3())
        centre.addScaledVector(right, ((x0 + x1) / 2) * d * half * camera.aspect).addScaledVector(up, ((y0 + y1) / 2) * d * half)
        d = Math.max(2, d * (Math.max((x1 - x0) / 2, (y1 - y0) / 2, 0.01) / 0.84))
    }
    return { centre, dist: d }
}

const ELEVATED = new Vector3(0, Math.sin((55 * Math.PI) / 180), Math.cos((55 * Math.PI) / 180)) // 55 degrees above the floor
const FROM_ABOVE = new Vector3(0, 1, 0.02).normalize()

function Rig({ preset, points, fitDist }) {
    const camera = useThree((s) => s.camera)
    const controls = useThree((s) => s.controls)
    const invalidate = useThree((s) => s.invalidate)
    const size = useThree((s) => s.size)
    // `points` changes only when the set of nodes does: a turn or zoom by hand survives every snapshot
    useEffect(() => {
        const { centre, dist } = fitCamera(camera, points, preset.name === 'top' ? FROM_ABOVE : ELEVATED, size)
        fitDist.current = dist
        if (controls) { controls.target.copy(centre); controls.update() }
        invalidate()
    }, [preset, points, size, camera, controls, invalidate, fitDist])
    return null
}

// tells the page whether the camera is close enough for every node to carry its name
function Closeness({ fitDist, onClose }) {
    const controls = useThree((s) => s.controls)
    useEffect(() => {
        if (!controls) return undefined
        const on = () => onClose(controls.object.position.distanceTo(controls.target) < fitDist.current * 0.6)
        controls.addEventListener('change', on)
        return () => controls.removeEventListener('change', on)
    }, [controls, fitDist, onClose])
    return null
}

// Labels never overlap: every candidate is projected to the screen and placed greedily by rank
// (selected, hovered and the selected node's neighbours first, then the rest, near before far);
// one that would cover an already placed label is left out until the camera moves. `onChange`
// gets the set of ids that may carry a name.
const LABEL_H = 24
const LABEL_FULL_H = 58
const labelWidth = (n, full) => (full ? 168 : Math.min(190, 14 + String(n.label || '').length * 7.2))
function LabelCuller({ items, onChange }) {
    const camera = useThree((s) => s.camera)
    const controls = useThree((s) => s.controls)
    const size = useThree((s) => s.size)
    const last = useRef('')
    useEffect(() => {
        let raf = 0
        const run = () => {
            raf = 0
            camera.updateMatrixWorld()
            const v = new Vector3()
            const projected = items.map((it) => {
                v.set(...it.at).project(camera)
                return { it, x: (v.x * 0.5 + 0.5) * size.width, y: (-v.y * 0.5 + 0.5) * size.height, z: v.z }
            }).filter((q) => q.z < 1)
            projected.sort((a, b) => a.it.rank - b.it.rank || a.z - b.z)
            const placed = []
            const ok = new Set()
            for (const q of projected) {
                const w = q.it.w
                const h = q.it.h
                const box = { x0: q.x - w / 2 - 3, x1: q.x + w / 2 + 3, y0: q.y - h - 3, y1: q.y + 3 }
                const clash = placed.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)
                const outside = box.x0 < 0 || box.x1 > size.width || box.y0 < 0 || box.y1 > size.height
                if ((clash || outside) && !q.it.force) continue
                placed.push(box)
                ok.add(q.it.id)
            }
            const key = [...ok].sort().join('|')
            if (key !== last.current) { last.current = key; onChange(ok) }
        }
        const schedule = () => { if (!raf) raf = requestAnimationFrame(run) }
        schedule()
        const late = setTimeout(schedule, 120)
        controls?.addEventListener('change', schedule)
        return () => { controls?.removeEventListener('change', schedule); clearTimeout(late); if (raf) cancelAnimationFrame(raf) }
    }, [items, camera, controls, size, onChange])
    return null
}

// Selecting a node flies the camera to it: the target slides to the body and the camera follows, a little closer.
function FlyTo({ selectedId, pointOf, fitDist, reduced }) {
    const camera = useThree((s) => s.camera)
    const controls = useThree((s) => s.controls)
    const invalidate = useThree((s) => s.invalidate)
    const first = useRef(true)
    useEffect(() => {
        if (first.current) { first.current = false; return undefined }
        const to = selectedId ? pointOf(selectedId) : null
        if (!to || !controls) return undefined
        const t0 = controls.target.clone()
        const c0 = camera.position.clone()
        const dest = new Vector3(...to)
        const off0 = c0.clone().sub(t0)
        const len0 = off0.length()
        const len1 = Math.max(2.5, Math.min(len0, fitDist.current * 0.85))
        const dir = off0.clone().normalize()
        const apply = (e) => {
            controls.target.lerpVectors(t0, dest, e)
            camera.position.copy(controls.target).addScaledVector(dir, len0 + (len1 - len0) * e)
            controls.update()
            invalidate()
        }
        if (reduced) { apply(1); return undefined }
        const start = performance.now()
        let raf = 0
        const step = (now) => {
            const k = Math.min(1, (now - start) / 380)
            apply(1 - (1 - k) ** 3)
            if (k < 1) raf = requestAnimationFrame(step)
        }
        raf = requestAnimationFrame(step)
        return () => cancelAnimationFrame(raf)
    }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps
    return null
}

const useVisible = () => {
    const [visible, setVisible] = useState(() => (typeof document === 'undefined' ? true : !document.hidden))
    useEffect(() => {
        const on = () => setVisible(!document.hidden)
        document.addEventListener('visibilitychange', on)
        return () => document.removeEventListener('visibilitychange', on)
    }, [])
    return visible
}

// Still = zero frames: the canvas draws on a change, a gesture, or a 3 s pulse after a snapshot that changed
// something (and while a node is hovered). The page's 1 s clock never reaches this tree (memo + stable props).
function MonitorMap3D({ layout: incoming, selectedId, onPick, fullscreen = false, world = false, kinds = false }) {
    const showKinds = world || kinds
    const stageRef = useRef(null)
    const fsRef = useRef(fullscreen)
    useEffect(() => { fsRef.current = fullscreen }, [fullscreen])
    // The wheel turns the camera's zoom only in full screen or with Ctrl/Cmd (a trackpad pinch sends Ctrl);
    // otherwise the wheel never reaches the controls (stopped in the capture phase) and the page scrolls. Touch pinch is untouched.
    useEffect(() => {
        const el = stageRef.current
        if (!el) return undefined
        const onWheel = (ev) => { if (!(fsRef.current || ev.ctrlKey || ev.metaKey)) ev.stopPropagation() }
        el.addEventListener('wheel', onWheel, { capture: true, passive: true })
        return () => el.removeEventListener('wheel', onWheel, { capture: true })
    }, [])
    const reduced = useReducedMotion()
    const visible = useVisible()
    const colors = useMemo(() => readColors(), [])
    const [hover, setHover] = useState(null)
    const [preset, setPreset] = useState({ name: 'fit', n: 0 })
    const [close, setClose] = useState(false)
    const [shown, setShown] = useState(null) // ids allowed to carry a name (null until the first cull)
    const [pulsing, setPulsing] = useState(false)
    const fitDist = useRef(10)
    // a snapshot that changed nothing visible keeps the same layout object: no rebuild, no frame
    const sig = layoutSignature(incoming)
    const layout = useMemo(() => incoming, [sig]) // eslint-disable-line react-hooks/exhaustive-deps
    const idsKey = fitKey(layout)
    const points = useMemo(() => {
        const list = [[0, 0.6, 0]]
        for (const n of layout.nodes) { const p = layout.pos.get(n.id); list.push([p.x * S, 0, p.y * S], [p.x * S, p.h * S + 0.7, p.y * S]) }
        return list
    }, [idsKey]) // eslint-disable-line react-hooks/exhaustive-deps

    const firstSig = useRef(true)
    useEffect(() => {
        if (firstSig.current) { firstSig.current = false; return undefined }
        setPulsing(true)
        const id = setTimeout(() => setPulsing(false), PULSE_MS)
        return () => clearTimeout(id)
    }, [sig])

    const rings = useMemo(() => layout.radii.map((rad) => ({
        r: rad,
        pts: Array.from({ length: 97 }, (_, i) => {
            const a = (i / 96) * Math.PI * 2
            return [Math.cos(a) * rad * layout.aspect * S, 0, Math.sin(a) * rad * S]
        })
    })), [layout])
    const hubLines = useMemo(() => layout.tierIds.map((id) => ({ id, pts: [HUB, at(layout.pos.get(id))] })), [layout])
    const edgeLines = useMemo(() => layout.edges.map((e, i) => ({ e, i, a: at(layout.pos.get(e.from)), b: at(layout.pos.get(e.to)), pts: [at(layout.pos.get(e.from)), at(layout.pos.get(e.to))] })), [layout])
    const stems = useMemo(() => layout.nodes.map((n) => ({ id: n.id, pts: [floor(layout.pos.get(n.id)), at(layout.pos.get(n.id))] })), [layout])
    const stemOf = useMemo(() => new Map(stems.map((x) => [x.id, x.pts])), [stems])
    // in the kinds look a light travels only on the picked (or hovered) node's lines, never on every line at once
    const packetFocus = showKinds ? (hover || selectedId || null) : hover
    const packetPulse = showKinds ? false : pulsing
    const animate = shouldAnimate({ edges: layout.edges, pulsing: packetPulse, hoverId: packetFocus, visible, reduced })
    const pulseSet = useMemo(() => new Set(pulseIndexes(layout.edges, packetPulse, packetFocus)), [layout, packetPulse, packetFocus])

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
    const near = useMemo(() => (focus ? neighbours.get(focus) || new Set() : null), [focus, neighbours])
    const hot = (id) => !focus || id === focus || near.has(id)
    const toneColor = (state) => colors[STATE_TONE[state] || 'muted']
    const bodyColor = (n) => (showKinds && KIND_STYLE[n.kind] ? colors[TOKEN_KEY[KIND_STYLE[n.kind].token]] : toneColor(n.state))
    const faint = showKinds && layout.edges.length > 12 // a hairball stays quiet until a node is picked
    const degree = (id) => (neighbours.get(id) || new Set()).size

    const labelItems = useMemo(() => {
        const out = [{ id: '__hub', at: [0, 0.5, 0], w: 64, h: LABEL_H, rank: -1, force: true }]
        for (const n of layout.nodes) {
            const p = layout.pos.get(n.id)
            const sel = selectedId === n.id
            const full = sel || hover === n.id
            const named = showKinds || close || n.named || n.kind === 'tier' || n.kind === 'machine'
            if (!named && !full) continue
            const isNear = !!focus && near && near.has(n.id)
            const rank = sel ? 0 : hover === n.id ? 1 : isNear ? 2 : ['space', 'tier', 'machine', 'repo'].includes(n.kind) ? 3 : 4
            out.push({ id: n.id, at: [p.x * S, p.h * S + 0.45, p.y * S], w: labelWidth(n, full), h: full ? LABEL_FULL_H : LABEL_H, rank, force: full })
        }
        return out
    }, [layout, selectedId, hover, close, focus, near, showKinds])
    const pointOf = useMemo(() => (id) => { const p = layout.pos.get(id); return p ? [p.x * S, p.h * S, p.y * S] : null }, [layout])


    return (
        <div className={`monitor-map-stage monitor-map-stage-3d${showKinds ? ' is-world' : ''}`} ref={stageRef}>
            <Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ fov: 45, near: 0.1, far: 200, position: [0, 6, 9] }}
                gl={{ antialias: true, powerPreference: 'low-power' }} style={{ background: colors.ground }}>
                <Rig preset={preset} points={points} fitDist={fitDist} />
                <Closeness fitDist={fitDist} onClose={setClose} />
                <FlyTo selectedId={selectedId} pointOf={pointOf} fitDist={fitDist} reduced={reduced} />
                <LabelCuller items={labelItems} onChange={setShown} />
                <Ticker on={animate} />
                <OrbitControls makeDefault enableDamping={false} maxPolarAngle={Math.PI / 2 - 0.04} minDistance={2} maxDistance={60} />
                {rings.map((ring) => <Line key={ring.r} color={colors.line} lineWidth={1} points={ring.pts} />)}
                <mesh position={HUB}><boxGeometry args={[0.5, 0.2, 0.5]} /><meshBasicMaterial color={colors.cyan} /></mesh>
                {hubLines.map((h) => <Line key={`hub-${h.id}`} color={colors.line} lineWidth={1} points={h.pts} />)}
                {edgeLines.map(({ e, i, a, b, pts }) => {
                    const lit = !!focus && (e.from === focus || e.to === focus)
                    const isLive = LIVE_EDGES.has(e.kind)
                    return (
                        <group key={`${e.from}>${e.to}>${e.kind}>${i}`}>
                            <Line points={pts} color={lit ? colors.text : focus ? colors.line : isLive && !faint ? colors.live : colors.muted}
                                lineWidth={lit ? 3 : 1} transparent opacity={focus && !lit ? 0.2 : faint ? 0.3 : 1} />
                            {animate && isLive && pulseSet.has(i) ? <Pulse a={a} b={b} offset={(i * 0.37) % 1} color={colors.live} /> : null}
                        </group>
                    )
                })}
                {layout.nodes.map((n) => {
                    const p = layout.pos.get(n.id)
                    const sel = selectedId === n.id
                    const dim = !!focus && !hot(n.id)
                    const full = sel || hover === n.id
                    // at fit zoom only tiers and machines carry a name; the rest show it on hover, when selected, or up close
                    const named = showKinds || close || n.named || n.kind === 'tier' || n.kind === 'machine'
                    return (
                        <group key={n.id}>
                            <Line points={stemOf.get(n.id)} color={colors.line} lineWidth={1} />
                            <Body node={n} p={p} color={bodyColor(n)} pip={showKinds ? toneColor(n.state) : null} dim={dim} sel={sel} near={!!focus && !sel && hot(n.id)} kinds={showKinds} onHover={setHover} onPick={onPick} />
{(named || full) && (shown === null || shown.has(n.id)) ? (
                                <Html position={[p.x * S, p.h * S + 0.45, p.y * S]} center zIndexRange={full ? [1000, 900] : [200, 0]}>
                                    <button type="button" data-map-node={n.id}
                                        className={`monitor-card3d tone-${STATE_TONE[n.state] || 'muted'}${sel ? ' is-selected' : ''}${dim ? ' is-dim' : ''}${full ? ' is-full' : ''}`}
                                        aria-pressed={sel} aria-label={`${n.kind} ${n.label}, ${n.stateLabel || n.state}`}
                                        onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover((h) => (h === n.id ? null : h))}
                                        onFocus={() => setHover(n.id)} onBlur={() => setHover((h) => (h === n.id ? null : h))}
                                        onClick={() => onPick(n)}>
                                        <span className="monitor-card3d-name">{n.label}</span>
                                        <span className="monitor-card3d-state">{n.stateLabel || n.state}</span>
                                        <span className="monitor-card3d-fact">{`${n.kind} · ${degree(n.id)} ${degree(n.id) === 1 ? 'link' : 'links'}`}</span>
                                    </button>
                                </Html>
                            ) : null}
                        </group>
                    )
                })}
                <Html position={[0, 0.5, 0]} center zIndexRange={[20, 0]}>
                    <div className="monitor-card3d is-hub"><span className="monitor-card3d-name">di.iiii</span></div>
                </Html>
            </Canvas>
            {showKinds ? <WorldLegend nodes={layout.nodes} edges={layout.edges} /> : null}
            <div className="monitor-map-tools" role="group" aria-label="Camera">
                <button type="button" className="monitor-map-tool" data-map-tool="fit" onClick={() => setPreset((p) => ({ name: 'fit', n: p.n + 1 }))}>Fit</button>
                <button type="button" className="monitor-map-tool" data-map-tool="top" onClick={() => setPreset((p) => ({ name: 'top', n: p.n + 1 }))}>Top view</button>
            </div>
            <div className="monitor-map-hint">Drag to turn · {fullscreen ? 'scroll' : 'Ctrl + scroll'} or pinch to zoom · tap a card to open it</div>
        </div>
    )
}

export default memo(MonitorMap3D)
