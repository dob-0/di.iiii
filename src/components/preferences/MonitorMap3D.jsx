import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AdditiveBlending, Fog } from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Html, Line, OrbitControls } from '@react-three/drei'
import Canvas from '../GuardedCanvas.jsx'
import WorldLegend from './WorldLegend.jsx'
import { useWideScreen } from './useWideScreen.js'
import { KIND_STYLE } from './monitorMapLayout.js'
import { fitKey, layoutSignature, PULSE_MS, pulseEdgeIndexes, shouldAnimate } from './monitorMap3dPolicy.js'
import { keyStep, mapPoints, poseForNode, presetPose, PRESET_LABEL, PRESET_NAMES, S } from './monitorMapCamera.js'
import { buildEdgeLayers, bundleWidth } from './monitorMapEdges.js'
import { LABEL_LIFT, planLabels, screenItems, stageBlockers } from './monitorMapOverlap.js'

// The 3D view of the Monitor map: the same layout as the 2D graph, as bodies in
// a room. Kind sets the height (tiers above machines above spaces); each node
// carries its 2D card (drei Html), so 2D cards live in 3D like Raw's world
// windows. frameloop="demand": nothing is drawn while still. A light travels
// along live edges only while `live` and not under reduced motion.

const FALLBACK = { success: '#4df9c0', warning: '#ffb84d', muted: '#5a5e66', cyan: '#4df9ff', line: '#2c2f36', live: '#50fa7b', ground: '#000000', text: '#e6e8ec' }
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

function Body({ node, p, color, glow, ring, pip, dim, sel, near, kinds, onHover, onPick, onFly }) {
    const k = node.kind
    const size = k === 'tier' ? 0.55 : k === 'machine' ? 0.46 : 0.36
    const shape = kinds && KIND_STYLE[k] ? KIND_STYLE[k].shape : k === 'tier' ? 'bar' : 'square'
    const off = node.state === 'off'
    const hl = kinds ? ring : glow // the kinds look rings the pick in the text token, never a literal white
    return (
        <group position={at(p)}>
            <mesh onPointerOver={(e) => { e.stopPropagation(); onHover(node.id) }} onPointerOut={() => onHover(null, node.id)}
                onClick={(e) => { e.stopPropagation(); onPick(node) }} onDoubleClick={(e) => { e.stopPropagation(); onFly(node) }}>
                <KindGeometry shape={shape} size={size} />
                <meshBasicMaterial color={color} transparent opacity={dim ? (kinds ? 0.18 : 0.25) : off && kinds ? 0.6 : 1} />
            </mesh>
            {pip ? <mesh position={[0, size * 0.62, 0]}><boxGeometry args={[0.09, 0.09, 0.09]} /><meshBasicMaterial color={pip} transparent opacity={dim ? 0.18 : 1} /></mesh> : null}
            {sel ? (<>
                <mesh><boxGeometry args={[size * 1.5, size * 1.1, size * 1.5]} /><meshBasicMaterial color={hl} wireframe /></mesh>
                {/* soft glow: two additive shells, no shadows */}
                <mesh><boxGeometry args={[size * 2.1, size * 1.6, size * 2.1]} /><meshBasicMaterial color={hl} transparent opacity={0.1} blending={AdditiveBlending} depthWrite={false} /></mesh>
                <mesh><boxGeometry args={[size * 3, size * 2.3, size * 3]} /><meshBasicMaterial color={hl} transparent opacity={0.05} blending={AdditiveBlending} depthWrite={false} /></mesh>
            </>) : null}
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

// Camera rig: presets, fly-to, keys, auto-rotate. Lives inside the Canvas; the page talks to it through `api`.
const FLY_MS = 520
const START = { name: 'fit', n: 0 }
function Rig({ ground, layout, preset, points, fitDist, api, autoRotate, reduced, onTouch }) {
    const camera = useThree((s) => s.camera)
    const controls = useThree((s) => s.controls)
    const invalidate = useThree((s) => s.invalidate)
    const size = useThree((s) => s.size)
    const scene = useThree((s) => s.scene)
    const fly = useRef(null)
    const lastPose = useRef(null)
    const layoutRef = useRef(layout)
    useEffect(() => { layoutRef.current = layout }, [layout])
    const flyTo = (pose, instant = false) => {
        if (!controls || !pose) return
        if (instant || reduced) { camera.position.copy(pose.position); controls.target.copy(pose.target); controls.update(); invalidate(); return }
        fly.current = { t0: performance.now(), p0: camera.position.clone(), t0v: controls.target.clone(), p1: pose.position.clone(), t1v: pose.target.clone() }
        invalidate()
    }
    // `points` changes only when the set of nodes does: a turn or zoom by hand survives every snapshot
    useEffect(() => {
        const pose = presetPose(layoutRef.current, preset.name, size)
        fitDist.current = pose.dist
        // depth fog: far bodies sink into the ground colour (tokens only)
        scene.fog = new Fog(ground, pose.dist * 0.9, pose.dist * 2.6)
        lastPose.current = pose
        flyTo(pose, preset.n === 0 || preset.name === 'fit')
    }, [preset, points, size, controls]) // eslint-disable-line react-hooks/exhaustive-deps
    useFrame(() => {
        const f = fly.current
        if (!f || !controls) return
        const t = Math.min(1, (performance.now() - f.t0) / FLY_MS)
        const e = t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2
        camera.position.lerpVectors(f.p0, f.p1, e)
        controls.target.lerpVectors(f.t0v, f.t1v, e)
        controls.update()
        if (t >= 1) fly.current = null
        else invalidate()
    })
    useEffect(() => {
        if (!controls) return undefined
        const follow = () => {
            if (!scene.fog) return
            const d = camera.position.distanceTo(controls.target)
            scene.fog.near = d * 0.9
            scene.fog.far = d * 2.6
        }
        controls.addEventListener('change', follow)
        follow()
        return () => controls.removeEventListener('change', follow)
    }, [controls, camera, scene])
    useEffect(() => {
        if (!controls) return undefined
        controls.autoRotate = Boolean(autoRotate) && !reduced
        controls.autoRotateSpeed = 0.7
        const stop = () => { controls.autoRotate = false; fly.current = null; onTouch?.() }
        controls.addEventListener('start', stop)
        return () => controls.removeEventListener('start', stop)
    }, [controls, autoRotate, reduced, onTouch])
    useEffect(() => {
        api.current = {
            controlsElement: () => controls?.domElement || null,
            fly: (name) => flyTo(presetPose(layoutRef.current, name, size)),
            flyToNode: (id) => {
                if (!controls) return
                flyTo(poseForNode(layoutRef.current, id, camera.position, controls.target, fitDist.current))
            },
            reset: () => flyTo(presetPose(layoutRef.current, 'fit', size)),
            nudge: (key) => {
                if (!controls) return false
                const d = keyStep(key, camera, Math.max(0.25, fitDist.current * 0.06))
                if (!d) return false
                camera.position.add(d); controls.target.add(d); controls.autoRotate = false; controls.update(); invalidate()
                return true
            }
        }
    })
    return null
}

// Which labels fit: projects every card to the stage and keeps a label only where it covers nothing else
// (see monitorMapOverlap.js). Runs on a camera change, at most once a frame; labels fade with distance.
function Planner({ layout, fitDist, focusIds, onPlan }) {
    const camera = useThree((s) => s.camera)
    const controls = useThree((s) => s.controls)
    const size = useThree((s) => s.size)
    const last = useRef('')
    const raf = useRef(0)
    const focusKey = focusIds.join('|')
    useEffect(() => {
        const run = () => {
            raf.current = 0
            camera.updateMatrixWorld()
            const items = screenItems(layout, camera, size, fitDist.current).map((it) => (focusIds.includes(it.id) ? { ...it, full: true, opacity: 1 } : it))
            const plan = planLabels(items.filter((it) => it.kind !== 'hub'), size, [...stageBlockers(size), ...items.filter((it) => it.kind === 'hub').map((h) => ({ id: h.id, kind: 'hub', x: h.sx - 30, y: h.sy - 13, w: 60, h: 26 }))])
            const key = [...plan.shown.entries()].map(([id, o]) => `${id}:${o}`).sort().join('|')
            if (key !== last.current) { last.current = key; onPlan(plan.shown) }
        }
        const kick = () => { if (!raf.current) raf.current = requestAnimationFrame(run) }
        kick()
        controls?.addEventListener('change', kick)
        return () => { controls?.removeEventListener('change', kick); if (raf.current) cancelAnimationFrame(raf.current); raf.current = 0 }
    }, [layout, camera, controls, size, fitDist, focusKey, onPlan]) // eslint-disable-line react-hooks/exhaustive-deps
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

const HOVER_LEAVE_MS = 140
const DRAG_PX = 4
const CARD_ANCHOR = { transform: 'translate3d(-50%, -100%, 0)' }
const Z_FULL = [1000, 900]
const Z_LABEL = [200, 0]

// Still = zero frames: the canvas draws on a change, a gesture, or a 3 s pulse after a snapshot that changed
// something (and while a node is hovered). The page's 1 s clock never reaches this tree (memo + stable props).
function MonitorMap3D({ layout: incoming, selectedId, onPick, fullscreen = false, autoRotate = true, world = false, kinds = false, pointerOnly = false }) {
    const showKinds = world || kinds
    const stageRef = useRef(null)
    const api = useRef(null)
    // The wheel turns the camera's zoom in full screen, on a map that fills its screen (the Monitor map) or with Ctrl/Cmd (a pinch);
    // otherwise it never reaches the controls (stopped in the capture phase) and the page scrolls.
    const wide = useWideScreen()
    const wheelFree = fullscreen || (showKinds && wide)
    const freeRef = useRef(wheelFree)
    useEffect(() => { freeRef.current = wheelFree }, [wheelFree])
    useEffect(() => {
        const el = stageRef.current
        if (!el) return undefined
        const onWheel = (ev) => { if (!(freeRef.current || ev.ctrlKey || ev.metaKey)) ev.stopPropagation() }
        el.addEventListener('wheel', onWheel, { capture: true, passive: true })
        return () => el.removeEventListener('wheel', onWheel, { capture: true })
    }, [])
    // keyboard camera: the stage takes focus (tab or click on empty map); arrows or WASD move it
    useEffect(() => {
        const el = stageRef.current
        if (!el) return undefined
        if (!pointerOnly) {
            el.tabIndex = 0
            el.setAttribute('aria-label', '3D map: arrow keys or WASD move the camera')
        }
        const onKeys = (ev) => {
            if (ev.target !== el || ev.ctrlKey || ev.metaKey || ev.altKey) return
            if (api.current?.nudge(ev.key)) ev.preventDefault()
        }
        el.addEventListener('keydown', onKeys)
        return () => el.removeEventListener('keydown', onKeys)
    }, [pointerOnly])
    const reduced = useReducedMotion()
    const visible = useVisible()
    const colors = useMemo(() => readColors(), [])
    // Hover: entering is instant; leaving waits HOVER_LEAVE_MS and is cancelled by any re-enter, so a card that
    // grows under the pointer or a 1 px jitter between the body and its card never toggles the look (it flickered ~20 times a second).
    const [hover, setHoverNow] = useState(null)
    const leaveTimer = useRef(0)
    const setHover = useCallback((id, leaving) => {
        if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = 0 }
        if (id) { setHoverNow(id); return }
        leaveTimer.current = setTimeout(() => {
            leaveTimer.current = 0
            setHoverNow((h) => (leaving == null || h === leaving ? null : h))
        }, HOVER_LEAVE_MS)
    }, [])
    useEffect(() => () => clearTimeout(leaveTimer.current), [])
    // A drag that starts on a card turns the camera like a drag on empty map: past DRAG_PX the press is handed to the
    // camera control and the card's click is dropped. A press that does not move stays a click on the card.
    const dragged = useRef(false)
    const pressEnd = useRef(null) // removes a card press's window listeners; also run on unmount
    useEffect(() => () => pressEnd.current?.(), [])
    const onCardDown = useCallback((ev) => {
        if (ev.button !== 0 && ev.button !== 2) return
        pressEnd.current?.()
        dragged.current = false
        const start = { x: ev.clientX, y: ev.clientY, id: ev.pointerId, button: ev.button, type: ev.pointerType }
        const move = (m) => {
            if (dragged.current || Math.hypot(m.clientX - start.x, m.clientY - start.y) < DRAG_PX) return
            dragged.current = true
            const target = api.current?.controlsElement?.()
            target?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: start.x, clientY: start.y, pointerId: start.id, button: start.button, buttons: m.buttons, pointerType: start.type, isPrimary: true }))
        }
        const end = () => {
            window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', end)
            pressEnd.current = null
        }
        // the click that follows a drag reads dragged first; then the flag clears, wherever the press ended
        const up = () => { end(); setTimeout(() => { dragged.current = false }, 0) }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
        window.addEventListener('pointercancel', end)
        pressEnd.current = end
    }, [])
    const preset = START
    const [plan, setPlan] = useState(() => new Map())
    const [rotating, setRotating] = useState(Boolean(autoRotate))
    const onTouch = useCallback(() => setRotating(false), [])
    const [pulsing, setPulsing] = useState(false)
    const fitDist = useRef(10)
    // a snapshot that changed nothing visible keeps the same layout object: no rebuild, no frame
    const sig = layoutSignature(incoming)
    const layout = useMemo(() => incoming, [sig]) // eslint-disable-line react-hooks/exhaustive-deps
    const idsKey = fitKey(layout)
    const points = useMemo(() => mapPoints(layout), [idsKey]) // eslint-disable-line react-hooks/exhaustive-deps

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
    const layers = useMemo(() => buildEdgeLayers(layout), [layout])
    const edgeLines = layers.edges
    const stems = useMemo(() => layout.nodes.map((n) => ({ id: n.id, pts: [floor(layout.pos.get(n.id)), at(layout.pos.get(n.id))] })), [layout])
    const stemOf = useMemo(() => new Map(stems.map((x) => [x.id, x.pts])), [stems])
    // in the kinds look a light travels only on the picked (or hovered) node's lines, never on every line at once
    const packetFocus = showKinds ? (hover || selectedId || null) : hover
    const packetPulse = showKinds ? false : pulsing
    const animate = shouldAnimate({ edges: layout.edges, pulsing: packetPulse, hoverId: packetFocus, visible, reduced, rotating })
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
    const flyToNode = useCallback((n) => { setRotating(false); api.current?.flyToNode(n.id) }, [])
    const focus = hover || selectedId || null
    const near = useMemo(() => (focus ? neighbours.get(focus) || new Set() : null), [focus, neighbours])
    const hot = (id) => !focus || id === focus || near.has(id)
    const toneColor = (state) => colors[STATE_TONE[state] || 'muted']
    const bodyColor = (n) => (showKinds && KIND_STYLE[n.kind] ? colors[TOKEN_KEY[KIND_STYLE[n.kind].token]] : toneColor(n.state))
    const degree = (id) => (neighbours.get(id) || new Set()).size

    return (
        <div className={`monitor-map-stage monitor-map-stage-3d${showKinds ? ' is-world' : ''}`} ref={stageRef}>
            <Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ fov: 45, near: 0.1, far: 600, position: [0, 6, 9] }}
                gl={{ antialias: true, powerPreference: 'low-power' }} style={{ background: colors.ground }}>
                <Rig ground={colors.ground} layout={layout} preset={preset} points={points} fitDist={fitDist} api={api} autoRotate={rotating} reduced={reduced} onTouch={onTouch} />
                <Planner layout={layout} fitDist={fitDist} focusIds={[selectedId, hover].filter(Boolean)} onPlan={setPlan} />
                <Ticker on={animate} />
                <OrbitControls makeDefault enableDamping={false} enablePan screenSpacePanning maxPolarAngle={Math.PI / 2 - 0.04} minDistance={1.5} maxDistance={120} rotateSpeed={0.9} />
                {rings.map((ring) => (
                    <group key={ring.r}>
                        <Line color={colors.cyan} lineWidth={5} transparent opacity={0.12} points={ring.pts} />
                        <Line color={colors.line} lineWidth={1} points={ring.pts} />
                    </group>
                ))}
                <mesh position={HUB}><boxGeometry args={[0.5, 0.2, 0.5]} /><meshBasicMaterial color={colors.cyan} /></mesh>
                {hubLines.map((h) => <Line key={`hub-${h.id}`} color={colors.line} lineWidth={1} points={h.pts} />)}
                {/* one faint thick bundle per lane pair; a line of its own only for the picked or hovered node */}
                {layers.bundles.map((bn) => (
                    <Line key={`lane-${bn.key}`} points={bn.pts} color={bn.live ? colors.live : colors.muted} lineWidth={bundleWidth(bn.count)} transparent opacity={focus ? 0.1 : 0.22} />
                ))}
                {edgeLines.map(({ e, i, a, b, pts }) => {
                    const lit = !!focus && (e.from === focus || e.to === focus)
                    const isLive = LIVE_EDGES.has(e.kind)
                    if (!lit) return null
                    return (
                        <group key={`${e.from}>${e.to}>${e.kind}>${i}`}>
                            <Line points={pts} color={showKinds ? colors.text : colors.cyan} lineWidth={showKinds ? 3 : 2} />
                            {animate && isLive && pulseSet.has(i) ? <Pulse a={a} b={b} offset={(i * 0.37) % 1} color={colors.live} /> : null}
                        </group>
                    )
                })}
                {layout.nodes.map((n) => {
                    const p = layout.pos.get(n.id)
                    const sel = selectedId === n.id
                    const dim = !!focus && !hot(n.id)
                    const full = sel || hover === n.id
                    // a label shows where the planner found room for it (nothing under it), fading with distance;
                    // the hovered or selected node always shows its full card
                    const shownOpacity = plan.get(n.id)
                    const named = shownOpacity != null
                    return (
                        <group key={n.id}>
                            <Line points={stemOf.get(n.id)} color={colors.line} lineWidth={1} />
                            <Body node={n} p={p} color={bodyColor(n)} glow={colors.cyan} ring={colors.text} pip={showKinds ? toneColor(n.state) : null} dim={dim} sel={sel} near={!!focus && !sel && hot(n.id)} kinds={showKinds} onHover={setHover} onPick={onPick} onFly={flyToNode} />
                            {named || full ? (
                                <Html position={[p.x * S, p.h * S + LABEL_LIFT, p.y * S]} style={CARD_ANCHOR} zIndexRange={full ? Z_FULL : Z_LABEL}>
                                    <button type="button" {...{ [pointerOnly ? 'data-pointer-node' : 'data-map-node']: n.id }} tabIndex={pointerOnly ? -1 : undefined}
                                        className={`monitor-card3d tone-${STATE_TONE[n.state] || 'muted'}${sel ? ' is-selected' : ''}${dim ? ' is-dim' : ''}${full ? ' is-full' : ''}`}
                                        style={!dim && !full && shownOpacity != null && shownOpacity < 1 ? { opacity: shownOpacity } : undefined}
                                        aria-pressed={sel} aria-label={`${n.kind} ${n.label}, ${n.stateLabel || n.state}`}
                                        onPointerEnter={() => setHover(n.id)} onPointerLeave={() => setHover(null, n.id)}
                                        onFocus={() => setHover(n.id)} onBlur={() => setHover(null, n.id)}
                                        onPointerDown={onCardDown} onContextMenu={(ev) => ev.preventDefault()}
                                        onDoubleClick={() => { if (!dragged.current) flyToNode(n) }}
                                        onClick={() => { if (dragged.current) { dragged.current = false; return } onPick(n) }}>
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
            <div className="monitor-map-tools" role="group" aria-label="Camera">
                {PRESET_NAMES.map((name) => (
                    <button key={name} type="button" tabIndex={pointerOnly ? -1 : undefined} className="monitor-map-tool" data-map-tool={name} onClick={() => { setRotating(false); api.current?.fly(name) }}>{PRESET_LABEL[name]}</button>
                ))}
                <button type="button" tabIndex={pointerOnly ? -1 : undefined} className="monitor-map-tool" data-map-tool="fit" onClick={() => { setRotating(false); api.current?.reset() }}>Reset view</button>
            </div>
            {/* hint and legend stack in one foot: they never sit on each other, however the legend wraps */}
            <div className="monitor-map-foot">
                <div className="monitor-map-hint">Drag to turn · right-drag or two fingers to move · {wheelFree ? 'scroll' : 'Ctrl + scroll'} or pinch to zoom · arrows or WASD · double-click a card to fly to it</div>
                {showKinds ? <WorldLegend nodes={layout.nodes} edges={layout.edges} /> : null}
            </div>
        </div>
    )
}

export default memo(MonitorMap3D)
