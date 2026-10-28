import { createContext, useContext, useEffect, useRef, useSyncExternalStore } from 'react'
import { useFrame, useThree } from '@react-three/fiber'

// Render on demand for the Studio viewport.
//
// react-three-fiber's documented method for a scene that mostly stands still is
// `frameloop="demand"` plus `invalidate()` when something changes
// (https://docs.pmnd.rs/react-three-fiber/advanced/scaling-performance#on-demand-rendering).
// Props changes, drei's CameraControls and TransformControls already invalidate.
// What demand mode cannot know is what moves BY ITSELF, so each of those declares
// itself here and the loop runs while any one is declared:
//   - hold(reason)        a sustained source (playing clip, video, strobe, bloom room…)
//   - kick(ms)            a burst: input, a document edit, a model that just arrived —
//                         covers damped hovers, scene walks that poll a few frames, etc.
// With nothing declared the viewport draws no frames at all.

export const KICK_AFTER_INPUT_MS = 1500

export function createRenderDemand({ now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
    const holds = new Map()
    const listeners = new Set()
    let graceUntil = 0
    let timer = null
    let active = false
    let invalidate = null
    let stats = { renders: 0 }

    const compute = () => holds.size > 0 || now() < graceUntil
    const refresh = () => {
        const next = compute()
        if (timer) { clearTimer(timer); timer = null }
        if (!holds.size && next) timer = setTimer(refresh, Math.max(1, graceUntil - now()) + 5)
        if (next !== active) {
            active = next
            listeners.forEach((l) => l())
        }
    }
    const api = {
        // → release()
        hold(reason = 'hold') {
            const key = Symbol(reason)
            holds.set(key, reason)
            refresh()
            invalidate?.()
            let released = false
            return () => {
                if (released) return
                released = true
                holds.delete(key)
                refresh()
                invalidate?.() // one last frame at the resting pose
            }
        },
        kick(ms = KICK_AFTER_INPUT_MS) {
            graceUntil = Math.max(graceUntil, now() + ms)
            refresh()
            invalidate?.()
        },
        isActive: () => active,
        holdReasons: () => [...new Set(holds.values())],
        subscribe(l) { listeners.add(l); return () => listeners.delete(l) },
        setInvalidate(fn) { invalidate = fn },
        // test/measurement counter, fed from the renderer's onAfterRender
        countRender() { stats.renders += 1 },
        renderCount: () => stats.renders,
        dispose() { if (timer) clearTimer(timer); timer = null; holds.clear(); listeners.clear() }
    }
    return api
}

const RenderDemandContext = createContext(null)

// Inside the Canvas: gives scene components the controller and wires its invalidate.
export function RenderDemandProvider({ demand, children }) {
    const invalidate = useThree((s) => s.invalidate)
    useEffect(() => {
        demand.setInvalidate(invalidate)
        return () => demand.setInvalidate(null)
    }, [demand, invalidate])
    // Frames actually drawn: a frame callback runs once per drawn frame in either
    // loop mode. Read as window.__diStudioFrames() by the measurement probe.
    useFrame(() => demand.countRender(), -1000)
    useEffect(() => {
        window.__diStudioFrames = () => demand.renderCount()
        return () => { delete window.__diStudioFrames }
    }, [demand])
    return <RenderDemandContext.Provider value={demand}>{children}</RenderDemandContext.Provider>
}

export const useRenderDemand = () => useContext(RenderDemandContext)

// A source that moves on its own declares itself while `active`.
export function useHoldFrames(active, reason = 'hold') {
    const demand = useRenderDemand()
    useEffect(() => {
        if (!demand || !active) return undefined
        return demand.hold(reason)
    }, [demand, active, reason])
}

// A one-off burst (e.g. a model that just arrived: the scene walks that dress it
// poll for a few frames).
export function useKickFrames(key, ms = 2000) {
    const demand = useRenderDemand()
    useEffect(() => { demand?.kick(ms) }, [demand, key, ms])
}

// Outside the Canvas: the frameloop mode to hand to <Canvas frameloop>.
export function useFrameloopMode(demand, enabled) {
    const active = useSyncExternalStore(demand.subscribe, demand.isActive, () => true)
    return enabled && !active ? 'demand' : 'always'
}

export function useStableDemand() {
    const ref = useRef(null)
    if (!ref.current) ref.current = createRenderDemand()
    useEffect(() => () => ref.current?.dispose(), [])
    return ref.current
}
