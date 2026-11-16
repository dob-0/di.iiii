import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box3, Vector3 } from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Html, Line, OrbitControls } from '@react-three/drei'
import Canvas from '../GuardedCanvas.jsx'
import { fitKey, layoutSignature, nudgeLabels, PULSE_MS, pulseEdgeIndexes, shouldAnimate } from './monitorMap3dPolicy.js'
import { visibleEdges } from './monitorMapGroups.js'

// The 3D view of the Monitor map: the same layout as the 2D graph, as bodies in
// a room. Kind sets the height (tiers above machines above spaces); each node
// carries its 2D card (drei Html), so 2D cards live in 3D like Raw's world
// windows. Every node carries its name, and names that would overlap on the screen are nudged apart. frameloop="demand": nothing is drawn while still. A light travels
// along live edges only while `live` and not under reduced motion.

const S = 0.01 // layout units -> room units
const FALLBACK = { success: '#4df9c0', warning: '#ffb84d', muted: '#5a5e66', cyan: '#4df9ff', line: '#2c2f36', live: '#50fa7b', ground: '#000000' }
const TONE_VAR = { success: '--di-success', warning: '--di-warning', muted: '--pref-border', cyan: '--di-cyan', line: '--pref-border', live: '--di-live' }
const LIVE_EDGES = new Set(['runs', 'serves'])
const STATE_TONE = { ok: 'success', warn: 'warning', off: 'muted' }

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

function Body({ node, p, color, dim, sel, onHover, onPick }) {
    const k = node.kind
    const size = k === 'tier' ? 0.55 : k === 'machine' ? 0.46 : k === 'group' ? 0.5 : 0.36
    return (
        <group position={at(p)}>
            <mesh onPointerOver={(e) => { e.stopPropagation(); onHover(node.id) }} onPointerOut={() => onHover(null)}
                onClick={(e) => { e.stopPropagation(); onPick(node) }}>
                {k === 'tier' ? <cylinderGeometry args={[size / 2, size / 2, size * 0.7, 4]} /> : <boxGeometry args={[size, size * 0.7, size]} />}
                <meshBasicMaterial color={color} transparent opacity={dim ? 0.25 : 1} />
            </mesh>
            {sel ? <mesh><boxGeometry args={[size * 1.5, size * 1.1, size * 1.5]} /><meshBasicMaterial color="#4df9ff" wireframe /></mesh> : null}
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

// Projects every label's anchor to the screen and nudges overlapping names apart. Runs when the camera
// moves (a gesture, a fit) or the stage resizes, never on its own: still stays zero frames.
// a one-line card is 44 px tall on the screen (measured on a 390 px phone, 2026-11-16); 30 let cards sit on each other
const LABEL_H = 44
// a long name (an agent's title) is cut so it fits the screen; the full name stays in the title
const short = (t) => (String(t).length > 20 ? `${String(t).slice(0, 19)}…` : String(t))
const labelWidth = (text) => Math.round(String(text).length * 8.4 + 30)
function Nudge({ labels, onNudge }) {
    const camera = useThree((s) => s.camera)
    const controls = useThree((s) => s.controls)
    const size = useThree((s) => s.size)
    const gl = useThree((s) => s.gl)
    useEffect(() => {
        const run = () => {
            camera.updateMatrixWorld()
            const items = labels.map((l) => {
                const v = new Vector3(...l.pos).project(camera)
                return { id: l.id, x: (v.x * 0.5 + 0.5) * size.width, y: (0.5 - v.y * 0.5) * size.height, w: labelWidth(l.text), h: LABEL_H, fixed: l.fixed }
            })
            // the map's own buttons (Fit, Turn) sit on the stage: cards keep off them, measured from the page
            const stage = gl.domElement.getBoundingClientRect()
            const tools = [...(gl.domElement.closest('[data-monitor-map]')?.querySelectorAll('[data-map-tool]') || [])].map((t, i) => {
                const r = t.getBoundingClientRect()
                return { id: `tool:${i}`, x: r.left - stage.left + r.width / 2, y: r.top - stage.top + r.height / 2, w: r.width, h: r.height, fixed: true }
            })
            const moved = nudgeLabels([...items, ...tools])
            for (const t of tools) delete moved[t.id]
            onNudge(moved)
        }
        run()
        if (!controls) return undefined
        controls.addEventListener('change', run)
        return () => controls.removeEventListener('change', run)
    }, [camera, controls, size, gl, labels, onNudge])
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
function MonitorMap3D({ layout: incoming, selectedId, onPick }) {
    const reduced = useReducedMotion()
    const visible = useVisible()
    const colors = useMemo(() => readColors(), [])
    const [hover, setHover] = useState(null)
    const [preset, setPreset] = useState({ name: 'fit', n: 0 })
    const [offsets, setOffsets] = useState({})
    const onNudge = useCallback((next) => setOffsets((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next)), [])
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

    const labels = useMemo(() => [
        { id: 'hub', text: 'di.iiii', pos: [0, 0.5, 0], fixed: true },
        ...layout.nodes.map((n) => { const p = layout.pos.get(n.id); return { id: n.id, text: short(n.label), pos: [p.x * S, p.h * S + 0.45, p.y * S] } })
    ], [idsKey, layout]) // eslint-disable-line react-hooks/exhaustive-deps

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
    const animate = shouldAnimate({ edges: layout.edges, pulsing, hoverId: hover, visible, reduced })
    const pulseSet = useMemo(() => new Set(pulseIndexes(layout.edges, pulsing, hover)), [layout, pulsing, hover])

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
    const shown = new Set(visibleEdges(layout.edges, focus))
    const toneColor = (state) => colors[STATE_TONE[state] || 'muted']
    const degree = (id) => (neighbours.get(id) || new Set()).size

    return (
        <div className="monitor-map-stage monitor-map-stage-3d">
            <Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ fov: 45, near: 0.1, far: 200, position: [0, 6, 9] }}
                gl={{ antialias: true, powerPreference: 'low-power' }} style={{ background: colors.ground }}>
                <Rig preset={preset} points={points} fitDist={fitDist} />
                <Nudge labels={labels} onNudge={onNudge} />
                <Ticker on={animate} />
                <OrbitControls makeDefault enableDamping={false} maxPolarAngle={Math.PI / 2 - 0.04} minDistance={2} maxDistance={60} />
                {rings.map((ring) => <Line key={ring.r} color={colors.line} lineWidth={1} points={ring.pts} />)}
                <mesh position={HUB}><boxGeometry args={[0.5, 0.2, 0.5]} /><meshBasicMaterial color={colors.cyan} /></mesh>
                {hubLines.map((h) => <Line key={`hub-${h.id}`} color={colors.line} lineWidth={1} points={h.pts} />)}
                {edgeLines.filter(({ e }) => shown.has(e)).map(({ e, i, a, b, pts }) => {
                    const lit = !!focus && (e.from === focus || e.to === focus)
                    const isLive = LIVE_EDGES.has(e.kind)
                    return (
                        <group key={`${e.from}>${e.to}>${e.kind}>${i}`}>
                            <Line points={pts} color={lit ? colors.cyan : focus ? colors.line : isLive ? colors.live : colors.muted}
                                lineWidth={lit ? 2 : 1} transparent opacity={focus && !lit ? 0.35 : 1} />
                            {animate && isLive && pulseSet.has(i) ? <Pulse a={a} b={b} offset={(i * 0.37) % 1} color={colors.live} /> : null}
                        </group>
                    )
                })}
                {layout.nodes.map((n) => {
                    const p = layout.pos.get(n.id)
                    const sel = selectedId === n.id
                    const dim = !!focus && !hot(n.id)
                    const full = sel || hover === n.id
                    const off = offsets[n.id]
                    return (
                        <group key={n.id}>
                            <Line points={stemOf.get(n.id)} color={colors.line} lineWidth={1} />
                            <Body node={n} p={p} color={toneColor(n.state)} dim={dim} sel={sel} onHover={setHover} onPick={onPick} />
<Html position={[p.x * S, p.h * S + 0.45, p.y * S]} center zIndexRange={full ? [1000, 900] : [200, 0]}>
                                    <button type="button" data-map-node={n.id}
                                        className={`monitor-card3d tone-${STATE_TONE[n.state] || 'muted'}${sel ? ' is-selected' : ''}${dim ? ' is-dim' : ''}${full ? ' is-full' : ''}`}
                                        aria-pressed={sel} aria-label={`${n.kind} ${n.label}, ${n.state}`}
                                        onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover((h) => (h === n.id ? null : h))}
                                        onFocus={() => setHover(n.id)} onBlur={() => setHover((h) => (h === n.id ? null : h))}
                                        style={off ? { transform: `translate(${off.dx}px, ${off.dy}px)` } : undefined}
                                        onClick={() => onPick(n)}>
                                        <span className="monitor-card3d-name" title={n.label}>{short(n.label)}</span>
                                        <span className="monitor-card3d-state">{n.state}</span>
                                        <span className="monitor-card3d-fact">{n.tiers?.length ? n.tiers.join(' · ') : n.sub ? n.sub : `${n.kind} · ${degree(n.id)} ${degree(n.id) === 1 ? 'link' : 'links'}`}</span>
                                    </button>
                                </Html>
                        </group>
                    )
                })}
                <Html position={[0, 0.5, 0]} center zIndexRange={[20, 0]}>
                    <div className="monitor-card3d is-hub"><span className="monitor-card3d-name">di.iiii</span></div>
                </Html>
            </Canvas>
            <div className="monitor-map-tools" role="group" aria-label="Camera">
                <button type="button" className="monitor-map-tool" data-map-tool="fit" onClick={() => setPreset((p) => ({ name: 'fit', n: p.n + 1 }))}>Fit</button>
                <button type="button" className="monitor-map-tool" data-map-tool="top" onClick={() => setPreset((p) => ({ name: 'top', n: p.n + 1 }))}>Top view</button>
            </div>
            <div className="monitor-map-hint">Drag to turn · scroll or pinch to zoom · tap a card to open it</div>
        </div>
    )
}

export default memo(MonitorMap3D)
