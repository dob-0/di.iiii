import { beforeEach, describe, expect, it, vi } from 'vitest'

// The engine's Body path against a fake WebGL context and a fake model service: which read-back it uses,
// when a mask is submitted, and what a pending read does when the source changes or the service goes away.
const service = vi.hoisted(() => ({
    state: 'ready', submits: [], budget: 1, acquired: new Set(), released: [],
    api: null
}))
vi.mock('./bodyMatte.js', () => {
    service.api = {
        acquire: (id) => service.acquired.add(id), release: (id) => service.released.push(id),
        status: () => service.state, budget: () => service.budget, poll: () => [],
        submit: (key, image) => { service.submits.push({ key, image }); return true }
    }
    return { bodyMatte: () => service.api, MATTE_W: 4, MATTE_H: 2, BODY_STATUS_TEXT: {} }
})
const { createTopEngine } = await import('./topEngine.js')

const makeGl = (version) => {
    const calls = []
    const log = { calls, signal: 37147, pixel: 10 }
    const named = {
        TIMEOUT_EXPIRED: 37147, ALREADY_SIGNALED: 37146, CONDITION_SATISFIED: 37148, FRAMEBUFFER_COMPLETE: 36053,
        COMPILE_STATUS: 35713, LINK_STATUS: 35714
    }
    const gl = new Proxy(log, {
        get(target, key) {
            if (key in target) return target[key]
            if (key in named) return named[key]
            if (typeof key !== 'string') return undefined
            if (/^[A-Z0-9_]+$/.test(key)) return 1000 + key.length
            if ((key === 'fenceSync' || key === 'clientWaitSync' || key === 'deleteSync' || key === 'getBufferSubData') && version === 1) return undefined
            return (...a) => {
                calls.push(key)
                if (key === 'readPixels' && a[6] && typeof a[6].fill === 'function') a[6].fill(target.pixel)
                if (key === 'fenceSync') return { sync: 1 }
                if (key === 'clientWaitSync') return target.signal
                if (key === 'getBufferSubData') { a[2].fill(target.pixel); return undefined }
                if (key === 'isContextLost') return false
                if (key === 'getError') return 0
                if (key === 'getExtension') return null
                if (key === 'checkFramebufferStatus') return named.FRAMEBUFFER_COMPLETE
                if (key === 'getShaderParameter' || key === 'getProgramParameter') return true
                if (key === 'getUniformLocation') return {}
                if (key === 'getAttribLocation') return 0
                if (key === 'getShaderInfoLog' || key === 'getProgramInfoLog') return ''
                return {}
            }
        }
    })
    return gl
}
const makeCanvas = (gl2, gl1) => {
    const asked = []
    return { asked, width: 4, height: 2, getContext: (type) => { asked.push(type); return type === 'webgl2' ? gl2 : gl1 } }
}
const video = () => ({ readyState: 4, videoWidth: 4, videoHeight: 2, currentTime: 0, paused: false })
const network = { nodes: [{ id: 's', type: 'top.clip', values: {} }, { id: 'm', type: 'top.matte', values: { soft: 0.3 } }], wires: [{ from: 's', to: 'm', port: 'a' }, { from: 's', to: 'm', port: 'b' }] }
const build = (opts, versions = [2, 2]) => {
    const gl2 = makeGl(2), gl1 = makeGl(1)
    const canvas = makeCanvas(gl2, gl1)
    const engine = createTopEngine({ canvas, width: 4, height: 2, ...opts })
    const v = video()
    engine.setVideo('s', v)
    engine.setNetwork(network)
    return { engine, gl2, gl1, canvas, v }
}
let now
const step = (engine, v) => { now += 4; v.currentTime += 0.033; return engine.frame(now) }

beforeEach(() => { service.state = 'ready'; service.submits.length = 0; service.released.length = 0; service.budget = 1; now = 1000 })

describe('Body read-back in the engine', () => {
    it('default: a WebGL1 context and the blocking read, one mask submitted per picture', () => {
        const { engine, canvas, gl1, v } = build({})
        expect(canvas.asked).toEqual(['webgl'])
        step(engine, v)
        expect(gl1.calls).toContain('readPixels')
        expect(service.submits).toHaveLength(1)
    })

    it('asyncReadback: asks for WebGL2, starts a read on one frame (nothing submitted), submits only when the fence is signalled', () => {
        const { engine, canvas, gl2, v } = build({ asyncReadback: true })
        expect(canvas.asked[0]).toBe('webgl2')
        step(engine, v)
        expect(gl2.calls).toContain('fenceSync')
        expect(service.submits).toHaveLength(0)
        step(engine, v)
        expect(gl2.calls).toContain('clientWaitSync')
        expect(service.submits).toHaveLength(0) // not signalled: the frame did not wait
        gl2.signal = 37146
        step(engine, v)
        expect(gl2.calls).toContain('getBufferSubData')
        expect(service.submits).toHaveLength(1)
        expect(service.submits[0].image.width).toBe(4)
    })

    it('asyncReadback on a WebGL1-only machine falls back to the blocking read', () => {
        const gl1 = makeGl(1)
        const canvas = makeCanvas(null, gl1)
        const engine = createTopEngine({ canvas, width: 4, height: 2, asyncReadback: true })
        const v = video(); engine.setVideo('s', v); engine.setNetwork(network)
        step(engine, v)
        expect(canvas.asked).toEqual(['webgl2', 'webgl'])
        expect(gl1.calls).toContain('readPixels')
        expect(service.submits).toHaveLength(1)
    })

    it('a pending read is dropped when the source video changes: no mask is made from the old picture', () => {
        const { engine, gl2, v } = build({ asyncReadback: true })
        step(engine, v)
        engine.setVideo('s', video())
        expect(gl2.calls).toContain('deleteSync')
        gl2.signal = 37146
        step(engine, v)
        expect(service.submits).toHaveLength(0)
    })

    it('a pending read is dropped when the service is released (status leaves ready)', () => {
        const { engine, gl2, v } = build({ asyncReadback: true })
        step(engine, v)
        service.state = 'idle'
        step(engine, v)
        expect(gl2.calls).toContain('deleteSync')
        service.state = 'ready'
        gl2.signal = 37146
        step(engine, v)
        expect(service.submits).toHaveLength(0)
    })

    it('a failed wait falls back to the blocking read in the same engine', () => {
        const { engine, gl2, v } = build({ asyncReadback: true })
        step(engine, v)
        gl2.signal = 37149
        step(engine, v)
        v.currentTime += 1; gl2.pixel = 11
        step(engine, v)
        expect(gl2.calls).toContain('readPixels')
        expect(service.submits.length).toBeGreaterThanOrEqual(1)
    })
})

describe('the draw and run caps', () => {
    it('maxFps 30 on a 240 Hz clock: frame() returns false on skipped frames and draws 30 a second', () => {
        const { engine, v } = build({ maxFps: 30 })
        let drawn = 0
        for (let i = 0; i < 240; i += 1) if (step(engine, v) !== false) drawn += 1
        expect(drawn).toBeGreaterThanOrEqual(28)
        expect(drawn).toBeLessThanOrEqual(31)
    })

    it('default: every frame draws', () => {
        const { engine, v } = build({})
        let drawn = 0
        for (let i = 0; i < 60; i += 1) if (step(engine, v) !== false) drawn += 1
        expect(drawn).toBe(60)
    })

    it('matteRunsPerSecond 15: at most 15 model runs started in a second of new pictures', () => {
        const { engine, gl1, v } = build({ matteRunsPerSecond: 15 })
        for (let i = 0; i < 250; i += 1) { gl1.pixel = i + 1; v.currentTime += 1; now += 4; engine.frame(now); /* every frame a different picture */ }
        expect(service.submits.length).toBeLessThanOrEqual(16)
        expect(service.submits.length).toBeGreaterThanOrEqual(13)
    })
})
