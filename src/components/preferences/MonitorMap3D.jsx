import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html, Line, OrbitControls } from '@react-three/drei'
import Canvas from '../GuardedCanvas.jsx'

// The 3D view of the Monitor map: the same layout as the 2D graph, as bodies in
// a room. Kind sets the height (tiers above machines above spaces); each node
// carries its 2D card (drei Html), so 2D cards live in 3D like Raw's world
// windows. frameloop="demand": nothing is drawn while still. A light travels
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

function Body({ node, p, color, dim, sel }) {
    const k = node.kind
    const size = k === 'tier' ? 0.5 : k === 'machine' ? 0.42 : 0.3
    return (
        <group position={at(p)}>
            <mesh>
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

function Rig({ preset, outer, aspect }) {
    const camera = useThree((s) => s.camera)
    const controls = useThree((s) => s.controls)
    const invalidate = useThree((s) => s.invalidate)
    const size = useThree((s) => s.size)
    useEffect(() => {
        const stage = size.height ? Math.min(1.15, size.width / size.height) : 1
        const d = (outer * S * aspect * 3.0) / stage
        if (preset.name === 'top') camera.position.set(0, d * 1.15, 0.001)
        else camera.position.set(0, d * 0.82, d * 0.57) // 55 degrees above the floor
        camera.lookAt(0, 0, 0)
        if (controls) { controls.target.set(0, 0, 0); controls.update() }
        invalidate()
    }, [preset, outer, aspect, size, camera, controls, invalidate])
    return null
}

export default function MonitorMap3D({ layout, selectedId, onPick, live }) {
    const reduced = useReducedMotion()
    const colors = useMemo(() => readColors(), [])
    const [hover, setHover] = useState(null)
    const [preset, setPreset] = useState({ name: 'fit', n: 0 })
    const animate = !!live && !reduced

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
    const toneColor = (state) => colors[STATE_TONE[state] || 'muted']
    const degree = (id) => (neighbours.get(id) || new Set()).size
    const hubPoint = [0, 0.1, 0]

    return (
        <div className="monitor-map-stage monitor-map-stage-3d">
            <Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ fov: 45, near: 0.1, far: 200, position: [0, 6, 9] }}
                gl={{ antialias: true, powerPreference: 'low-power' }} style={{ background: colors.ground }}>
                <Rig preset={preset} outer={layout.outer} aspect={layout.aspect} />
                <Ticker on={animate} />
                <OrbitControls makeDefault enableDamping={false} maxPolarAngle={Math.PI / 2 - 0.04} minDistance={2} maxDistance={60} />
                {layout.radii.map((r) => (
                    <Line key={r} color={colors.line} lineWidth={1}
                        points={Array.from({ length: 97 }, (_, i) => {
                            const a = (i / 96) * Math.PI * 2
                            return [Math.cos(a) * r * layout.aspect * S, 0, Math.sin(a) * r * S]
                        })} />
                ))}
                <mesh position={hubPoint}><boxGeometry args={[0.5, 0.2, 0.5]} /><meshBasicMaterial color={colors.cyan} /></mesh>
                {layout.tierIds.map((id) => (
                    <Line key={`hub-${id}`} color={colors.line} lineWidth={1} points={[hubPoint, at(layout.pos.get(id))]} />
                ))}
                {layout.edges.map((e, i) => {
                    const a = at(layout.pos.get(e.from))
                    const b = at(layout.pos.get(e.to))
                    const lit = !!focus && (e.from === focus || e.to === focus)
                    const isLive = LIVE_EDGES.has(e.kind)
                    return (
                        <group key={`${e.from}>${e.to}>${e.kind}>${i}`}>
                            <Line points={[a, b]} color={lit ? colors.cyan : focus ? colors.line : isLive ? colors.live : colors.muted}
                                lineWidth={lit ? 2 : 1} transparent opacity={focus && !lit ? 0.35 : 1} />
                            {animate && isLive ? <Pulse a={a} b={b} offset={(i * 0.37) % 1} color={colors.live} /> : null}
                        </group>
                    )
                })}
                {layout.nodes.map((n) => {
                    const p = layout.pos.get(n.id)
                    const sel = selectedId === n.id
                    const dim = !!focus && !hot(n.id)
                    return (
                        <group key={n.id}>
                            <Line points={[floor(p), at(p)]} color={colors.line} lineWidth={1} />
                            <Body node={n} p={p} color={toneColor(n.state)} dim={dim} sel={sel} />
                            <Html position={[p.x * S, p.h * S + 0.4, p.y * S]} center distanceFactor={5.5} zIndexRange={sel || hover === n.id ? [1000, 900] : [200, 0]}>
                                <button type="button" data-map-node={n.id}
                                    className={`monitor-card3d tone-${STATE_TONE[n.state] || 'muted'}${sel ? ' is-selected' : ''}${dim ? ' is-dim' : ''}${sel || hover === n.id ? ' is-full' : ''}`}
                                    aria-pressed={sel} aria-label={`${n.kind} ${n.label}, ${n.state}`}
                                    onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover((h) => (h === n.id ? null : h))}
                                    onFocus={() => setHover(n.id)} onBlur={() => setHover((h) => (h === n.id ? null : h))}
                                    onClick={() => onPick(n)}>
                                    <span className="monitor-card3d-name">{n.label}</span>
                                    <span className="monitor-card3d-state">{n.state}</span>
                                    <span className="monitor-card3d-fact">{`${n.kind} · ${degree(n.id)} ${degree(n.id) === 1 ? 'link' : 'links'}`}</span>
                                </button>
                            </Html>
                        </group>
                    )
                })}
                <Html position={[0, 0.5, 0]} center distanceFactor={5.5} zIndexRange={[20, 0]}>
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
