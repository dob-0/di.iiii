import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRoot, extend, events } from '@react-three/fiber'
import * as THREE from 'three'
import { RenderDemandProvider, createRenderDemand, useFrameloopMode, useHoldFrames } from './renderDemand.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
extend(THREE)

// ---- the controller, on a fake clock ------------------------------------------------
describe('createRenderDemand', () => {
    it('is idle until something is declared, bursts on kick, then returns to idle', () => {
        vi.useFakeTimers()
        let t = 0
        const demand = createRenderDemand({ now: () => t, setTimer: setTimeout, clearTimer: clearTimeout })
        expect(demand.isActive()).toBe(false)
        demand.kick(1000)
        expect(demand.isActive()).toBe(true)
        t = 900; vi.advanceTimersByTime(900)
        expect(demand.isActive()).toBe(true)
        t = 1100; vi.advanceTimersByTime(200)
        expect(demand.isActive()).toBe(false)
        vi.useRealTimers()
    })

    it('holds keep it active until released; release asks for a last frame', () => {
        const demand = createRenderDemand()
        const invalidate = vi.fn()
        demand.setInvalidate(invalidate)
        const release = demand.hold('video')
        expect(demand.isActive()).toBe(true)
        expect(demand.holdReasons()).toEqual(['video'])
        release()
        expect(demand.isActive()).toBe(false)
        expect(invalidate).toHaveBeenCalledTimes(2) // on hold and on release
        release() // idempotent
        expect(invalidate).toHaveBeenCalledTimes(2)
    })
})

// ---- a real react-three-fiber root with a stub renderer ----------------------------
function stubRenderer() {
    const gl = {
        render: vi.fn(), setPixelRatio: vi.fn(), setSize: vi.fn(), setClearColor: vi.fn(), dispose: vi.fn(),
        getPixelRatio: () => 1, domElement: document.createElement('canvas'),
        shadowMap: { enabled: false, type: 0 }, xr: { enabled: false, addEventListener() {}, removeEventListener() {}, setAnimationLoop() {} },
        outputColorSpace: 'srgb', toneMapping: 0, info: { autoReset: true, reset() {} },
        setAnimationLoop() {}, forceContextLoss() {}, getContext: () => ({})
    }
    return gl
}

const flush = (ms) => act(async () => { await new Promise((r) => setTimeout(r, ms)) })

function Harness({ demand, holdVideo = false }) {
    // what StudioViewport does: the mode comes from the controller
    const mode = useFrameloopMode(demand, true)
    return (
        <RenderDemandProvider demand={demand}>
            <Mode mode={mode} />
            <Holder active={holdVideo} />
        </RenderDemandProvider>
    )
}
let setMode = null
function Mode({ mode }) {
    // R3F applies the Canvas `frameloop` prop through the store; mirror that here.
    return <ModeApply mode={mode} />
}
import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
function ModeApply({ mode }) {
    const set = useThree((s) => s.setFrameloop)
    useEffect(() => { set(mode); setMode = mode }, [mode, set])
    return null
}
function Holder({ active }) {
    useHoldFrames(active, 'video')
    return null
}

describe('an on-demand viewport', () => {
    let root
    afterEach(() => { act(() => root?.unmount()); root = null })

    const open = async (demand, props = {}) => {
        const canvas = document.createElement('canvas')
        root = createRoot(canvas)
        await act(async () => {
            root.configure({ gl: stubRenderer(), frameloop: 'demand', events, size: { width: 100, height: 100, top: 0, left: 0 }, dpr: 1 })
            root.render(<Harness demand={demand} {...props} />)
        })
    }

    it('draws no frames when idle, one burst after an edit/orbit kick, none again after', async () => {
        const demand = createRenderDemand()
        await open(demand)
        await flush(400) // settle: the first frames after mount
        const idle0 = demand.renderCount()
        await flush(600)
        expect(demand.renderCount() - idle0).toBe(0) // idle: zero frames in 600 ms

        const before = demand.renderCount()
        await act(async () => { demand.kick(250) }) // an orbit / an edit
        await flush(150)
        expect(demand.renderCount()).toBeGreaterThan(before) // it rendered

        await flush(500) // burst over
        const after0 = demand.renderCount()
        await flush(500)
        expect(demand.renderCount() - after0).toBe(0) // idle again
    })

    it('keeps drawing while a source holds the loop (video, strobe, clip), stops when it lets go', async () => {
        const demand = createRenderDemand()
        await open(demand, { holdVideo: true })
        await flush(200)
        const a = demand.renderCount()
        await flush(300)
        expect(demand.renderCount() - a).toBeGreaterThan(5)
        await act(async () => { root.render(<Harness demand={demand} holdVideo={false} />) })
        await flush(300)
        const b = demand.renderCount()
        await flush(400)
        expect(demand.renderCount() - b).toBe(0)
    })
})
