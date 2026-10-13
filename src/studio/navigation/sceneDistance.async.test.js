import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene } from 'three'
import { SAMPLE_HEIGHT, SAMPLE_WIDTH, createAsker, createSceneDistance, samePose } from './sceneDistance.js'

// The depth picture read in the background (sceneDistance.js request / peek): a fake renderer whose readRenderTargetPixelsAsync
// returns a promise the test resolves by hand, so the order of events is the test's, not the GPU's.
const PIXELS = SAMPLE_WIDTH * SAMPLE_HEIGHT
const paint = (rgba, distance) => { for (let i = 0; i < PIXELS; i += 1) { rgba[i * 4] = distance; rgba[i * 4 + 3] = distance > 0 ? 1 : 0 } } // R = distance, A = 1 where something was hit
const settle = async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve() }

function world() {
    const scene = new Scene()
    const content = new Group(); content.userData.svEntityId = 'a'
    content.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()))
    const helper = new Mesh(new BoxGeometry(), new MeshBasicMaterial()) // a grid or a gizmo: not content, hidden while the picture is drawn
    scene.add(content, helper)
    const view = new PerspectiveCamera(60, 16 / 9, 0.1, 500); view.position.set(0, 1.6, 8); view.updateMatrixWorld()
    return { scene, content, helper, view, args: (gl) => ({ gl, scene, camera: view, roots: [content], near: 0.35 }) }
}

// What three and the browser do with the pixel-pack buffer: the async read binds one and leaves it bound while it waits; with one bound,
// readPixels into client memory is an INVALID_OPERATION and writes nothing.
function fakeGl() {
    const ctx = { PIXEL_PACK_BUFFER: 35051, packBound: false, bindBuffer(target, buffer) { if (target === this.PIXEL_PACK_BUFFER) this.packBound = buffer != null } }
    return {
        ctx, getContext() { return ctx },
        extensions: { has: (name) => name === 'EXT_color_buffer_float' }, shadowMap: { autoUpdate: true, needsUpdate: true }, xr: { enabled: true }, autoClear: false,
        current: 'the main target', renders: [], reads: [], waiting: 0, mostWaiting: 0, syncDistance: 7,
        getRenderTarget() { return this.current }, setRenderTarget(t) { this.current = t },
        getClearColor(c) { return c.set(0x123456) }, getClearAlpha() { return 0.25 }, setClearColor() {},
        render(scene, camera) { this.renders.push({ from: camera.position.toArray(), override: Boolean(scene.overrideMaterial), visible: scene.children.map((c) => c.visible) }) },
        readRenderTargetPixels(_t, _x, _y, _w, _h, rgba) { if (!ctx.packBound) paint(rgba, this.syncDistance) },
        readRenderTargetPixelsAsync(_t, _x, _y, _w, _h, rgba) {
            return new Promise((resolve, reject) => {
                this.waiting += 1; this.mostWaiting = Math.max(this.mostWaiting, this.waiting); ctx.packBound = true
                this.reads.push({ resolve: (distance) => { paint(rgba, distance); this.waiting -= 1; ctx.packBound = false; resolve(rgba) }, reject: (error) => { this.waiting -= 1; ctx.packBound = false; reject(error) } })
            })
        },
    }
}

beforeEach(() => { delete window.__diSceneDistanceOff; delete window.__diSceneDistance })
afterEach(() => { vi.restoreAllMocks() })

describe('samePose: a camera that has not moved', () => {
    it('agrees within 1e-6 element by element; a real move, a different length, a NaN or nothing never match', () => {
        const a = new Float64Array(16).fill(1)
        expect(samePose(a, Float64Array.from(a))).toBe(true)
        expect(samePose(a, a.map((v) => v + 9e-7))).toBe(true)
        expect(samePose(a, a.map((v, i) => (i === 15 ? v + 2e-6 : v)))).toBe(false) // one element is enough
        expect(samePose(a, new Float64Array(15))).toBe(false)
        expect(samePose(a, a.map((v, i) => (i === 3 ? NaN : v)))).toBe(false)
        expect(samePose(a, null)).toBe(false)
    })
})

describe('request: draws exactly as measure does, reads without waiting', () => {
    it('hides the helpers, sets the depth material for the draw, and puts everything back while the read is still in flight', () => {
        const w = world(), gl = fakeGl(), sd = createSceneDistance()
        sd.measure(w.args(gl))
        sd.request(w.args(gl))
        expect(gl.renders).toHaveLength(2)
        expect(gl.renders[1]).toEqual(gl.renders[0]) // the same camera, the same override, the same hidden objects
        expect(gl.renders[1].override).toBe(true)
        expect(gl.renders[1].visible).toEqual([true, false]) // content drawn, the helper hidden
        expect(gl.reads).toHaveLength(1) // in flight
        expect(w.scene.overrideMaterial).toBeNull(); expect(w.helper.visible).toBe(true) // put back
        expect(gl.current).toBe('the main target'); expect(gl.autoClear).toBe(false); expect(gl.xr.enabled).toBe(true)
        expect(gl.shadowMap).toEqual({ autoUpdate: true, needsUpdate: true })
        sd.dispose()
    })
    it('lets go of three\'s pixel-pack buffer, so a synchronous measure during the read still reads', async () => {
        const w = world(), gl = fakeGl(), sd = createSceneDistance()
        sd.request(w.args(gl)) // three: buffer bound, read issued, waiting
        expect(gl.ctx.packBound).toBe(false)
        expect(sd.measure(w.args(gl))).toBe(7) // a notch whose peek missed, while the read is in flight
        gl.reads[0].resolve(3); await settle(); expect(gl.ctx.packBound).toBe(false)
        sd.dispose()
    })
    it('does nothing where measure would return null (no float targets, no content), and leaves no read in flight', () => {
        const w = world(), gl = fakeGl(), sd = createSceneDistance()
        gl.extensions.has = () => false
        sd.request(w.args(gl)); expect(gl.renders).toHaveLength(0)
        gl.extensions.has = (n) => n === 'EXT_color_buffer_float'
        sd.request({ ...w.args(gl), roots: [] }); expect(gl.renders).toHaveLength(0)
        sd.request(w.args(gl)); expect(gl.renders).toHaveLength(1) // nothing was left waiting
        sd.dispose()
    })
})

describe('peek: the picture, only for the pose it was drawn from', () => {
    it('is undefined before any picture; then the median once the read lands; null is "measured, nothing in view"', async () => {
        const w = world(), gl = fakeGl(), sd = createSceneDistance()
        expect(sd.peek(w.view)).toBeUndefined()
        sd.request(w.args(gl)); expect(sd.peek(w.view)).toBeUndefined() // in flight: not there yet
        gl.reads[0].resolve(12.5); await settle()
        expect(sd.peek(w.view)).toBe(12.5)
        sd.request(w.args(gl)); gl.reads[1].resolve(0); await settle() // every sample empty
        expect(sd.peek(w.view)).toBeNull()
        sd.dispose()
    })
    it('matches within 1e-6 and not a hair further; a turn, a different lens or another camera do not match; coming back does', async () => {
        const w = world(), gl = fakeGl(), sd = createSceneDistance()
        sd.request(w.args(gl)); gl.reads[0].resolve(9); await settle()
        w.view.position.x += 5e-7; expect(sd.peek(w.view)).toBe(9)
        w.view.position.x += 5e-6; expect(sd.peek(w.view)).toBeUndefined()
        w.view.position.x = 0; w.view.rotation.y = 0.001; expect(sd.peek(w.view)).toBeUndefined()
        w.view.rotation.y = 0; expect(sd.peek(w.view)).toBe(9)
        w.view.aspect = 1; w.view.updateProjectionMatrix(); expect(sd.peek(w.view)).toBeUndefined() // a resized view shows other things
        w.view.aspect = 16 / 9; w.view.updateProjectionMatrix(); expect(sd.peek(w.view)).toBe(9)
        expect(sd.peek(null)).toBeUndefined()
        sd.dispose()
    })
    it('keeps the pose the picture was DRAWN from, not the one the camera has when the read lands', async () => {
        const w = world(), gl = fakeGl(), sd = createSceneDistance()
        sd.request(w.args(gl))
        w.view.position.z = 3 // the camera moves while the read is in flight
        gl.reads[0].resolve(4); await settle()
        expect(sd.peek(w.view)).toBeUndefined() // the picture shows z = 8, the camera stands at z = 3
        w.view.position.z = 8; expect(sd.peek(w.view)).toBe(4)
        sd.dispose()
    })
    it('dev readout: a peek says source "peek" and carries no ms; measure says "sync" with its ms; __diSceneDistanceOff turns the background path off', async () => {
        const w = world(), gl = fakeGl(), sd = createSceneDistance()
        expect(sd.measure(w.args(gl))).toBe(7)
        expect(window.__diSceneDistance.source).toBe('sync'); expect(typeof window.__diSceneDistance.ms).toBe('number')
        sd.request(w.args(gl)); gl.reads[0].resolve(6); await settle()
        expect(sd.peek(w.view)).toBe(6)
        expect(window.__diSceneDistance).toEqual({ source: 'peek', result: 6 })
        window.__diSceneDistanceOff = true
        expect(sd.peek(w.view)).toBeUndefined(); sd.request(w.args(gl)); expect(gl.reads).toHaveLength(1)
        sd.dispose()
    })
})

describe('request: at most one read in flight, the newest request waits, nothing queues', () => {
    it('coalesces: three requests during one read cost one more draw, from the newest args', async () => {
        const w = world(), gl = fakeGl(), sd = createSceneDistance()
        sd.request(w.args(gl)) // A: drawn from z = 8
        w.view.position.z = 6; sd.request(w.args(gl)) // B
        w.view.position.z = 4; sd.request(w.args(gl)) // C
        expect(gl.renders).toHaveLength(1); expect(gl.reads).toHaveLength(1); expect(window.__diSceneDistanceReads.coalesced).toBe(2)
        gl.reads[0].resolve(10); await settle() // A lands: only C is drawn, from where the camera stands now
        expect(gl.renders).toHaveLength(2); expect(gl.renders[1].from[2]).toBeCloseTo(4, 6); expect(gl.reads).toHaveLength(2)
        expect(sd.peek(w.view)).toBeUndefined() // A's picture is for z = 8
        w.view.position.z = 8; expect(sd.peek(w.view)).toBe(10)
        gl.reads[1].resolve(3); await settle() // C lands; nothing else was waiting
        expect(gl.renders).toHaveLength(2); expect(gl.reads).toHaveLength(2)
        w.view.position.z = 4; expect(sd.peek(w.view)).toBe(3)
        expect(gl.mostWaiting).toBe(1) // never two reads at once
        sd.dispose()
    })
    it('a request with nothing in flight draws at once; one more after the read lands draws again', async () => {
        const w = world(), gl = fakeGl(), sd = createSceneDistance()
        sd.request(w.args(gl)); gl.reads[0].resolve(5); await settle()
        w.view.position.z = 2; sd.request(w.args(gl)); expect(gl.renders).toHaveLength(2)
        gl.reads[1].resolve(1); await settle(); expect(sd.peek(w.view)).toBe(1)
        sd.dispose()
    })
})

describe('dispose: a read in flight is abandoned', () => {
    it('a read that lands after dispose writes nothing and draws nothing; a request after dispose does nothing', async () => {
        const w = world(), gl = fakeGl(), sd = createSceneDistance()
        sd.request(w.args(gl)); sd.request(w.args(gl)) // one in flight, one waiting
        sd.dispose()
        gl.reads[0].resolve(8); await settle()
        expect(gl.renders).toHaveLength(1) // the waiting request was never drawn
        expect(sd.peek(w.view)).toBeUndefined() // nothing was stored
        expect(window.__diSceneDistanceReads.resolved).toBe(0); expect(window.__diSceneDistanceReads.latencyMs).toEqual([]) // and nothing counted
        sd.request(w.args(gl)); expect(gl.renders).toHaveLength(1)
    })
    it('a read that fails after dispose is not counted and does not warn', async () => {
        const w = world(), gl = fakeGl(), sd = createSceneDistance(), warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        sd.request(w.args(gl)); sd.dispose(); gl.reads[0].reject(new Error('lost')); await settle()
        expect(warn).not.toHaveBeenCalled(); expect(window.__diSceneDistanceReads.failed).toBe(0)
    })
})

describe('a failing background read falls back to reading on the spot, and says so once', () => {
    it('handles the fence\'s bare reject(), warns once, stops after three in a row, and measure still works', async () => {
        const w = world(), gl = fakeGl(), sd = createSceneDistance(), warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        for (let i = 0; i < 3; i += 1) { sd.request(w.args(gl)); gl.reads[i].reject(i === 0 ? undefined : new Error('x')); await settle() }
        expect(warn).toHaveBeenCalledTimes(1); expect(sd.peek(w.view)).toBeUndefined()
        sd.request(w.args(gl)); expect(gl.renders).toHaveLength(3) // given up: no fourth draw
        expect(sd.measure(w.args(gl))).toBe(7) // the notch still gets its number
        expect(window.__diSceneDistanceReads.failed).toBe(3)
        sd.dispose()
    })
    it('a draw that throws puts the renderer back and counts as a failure', () => {
        const w = world(), gl = fakeGl(), sd = createSceneDistance(); vi.spyOn(console, 'warn').mockImplementation(() => {})
        gl.render = () => { throw new Error('context lost') }
        expect(() => sd.request(w.args(gl))).not.toThrow()
        expect(w.scene.overrideMaterial).toBeNull(); expect(w.helper.visible).toBe(true); expect(gl.current).toBe('the main target')
        sd.dispose()
    })
    it('a success clears the count: failures must be in a row', async () => {
        const w = world(), gl = fakeGl(), sd = createSceneDistance(); vi.spyOn(console, 'warn').mockImplementation(() => {})
        const outcomes = [new Error('x'), new Error('x'), 4, new Error('x'), new Error('x'), 4]
        for (const o of outcomes) { sd.request(w.args(gl)); const r = gl.reads[gl.reads.length - 1]; if (o instanceof Error) r.reject(o); else r.resolve(o); await settle() }
        expect(gl.reads).toHaveLength(6) // never gave up
        sd.dispose()
    })
})

describe('measure: the synchronous path, as it was', () => {
    it('returns the median, or null with no float targets, no content or no scene', () => {
        const w = world(), gl = fakeGl(), sd = createSceneDistance()
        expect(sd.measure(w.args(gl))).toBe(7)
        expect(sd.measure({ ...w.args(gl), roots: [] })).toBeNull()
        expect(sd.measure({ ...w.args(gl), scene: null })).toBeNull()
        expect(sd.measure(undefined)).toBeNull()
        gl.extensions.has = () => false; expect(sd.measure(w.args(gl))).toBeNull()
        sd.dispose()
    })
})

describe('createAsker: when the next picture is asked for', () => {
    const rig = () => { const camera = new PerspectiveCamera(); camera.position.set(0, 0, 5); camera.updateMatrixWorld(); const ask = vi.fn(); return { camera, ask, asker: createAsker({ getCamera: () => camera, ask }) } }
    it('a wheel move asks at the first update that shows the NEW pose, never before, and once', () => {
        const { camera, ask, asker } = rig()
        asker.moved(); asker.updated() // the wheel handler\'s own announcement: the controls have not written the camera yet
        expect(ask).not.toHaveBeenCalled()
        camera.position.z = 4; asker.updated(); expect(ask).toHaveBeenCalledTimes(1); expect(ask).toHaveBeenCalledWith('update')
        camera.position.z = 3.5; asker.updated(); expect(ask).toHaveBeenCalledTimes(1) // a drag-like later update is not asked per frame
    })
    it('the stop that follows asks nothing new for a pose already asked for; a stop somewhere else asks', () => {
        const { camera, ask, asker } = rig()
        asker.moved(); camera.position.z = 4; asker.updated(); asker.settled('sleep'); asker.settled('rest')
        expect(ask).toHaveBeenCalledTimes(1)
        camera.position.x = 1; asker.settled('rest'); expect(ask).toHaveBeenCalledTimes(2); expect(ask).toHaveBeenLastCalledWith('rest')
        camera.position.x = 0; camera.position.z = 4; asker.settled('sleep'); expect(ask).toHaveBeenCalledTimes(3) // back to an older pose, not the last asked
    })
    it('a drag (updates with no announced move) asks only when it stops', () => {
        const { camera, ask, asker } = rig()
        for (let i = 1; i <= 30; i += 1) { camera.rotation.y = i * 0.01; asker.updated() }
        expect(ask).not.toHaveBeenCalled()
        asker.settled('sleep'); expect(ask).toHaveBeenCalledTimes(1)
    })
    it('two notches before one update ask once, for the pose after both', () => {
        const { camera, ask, asker } = rig()
        asker.moved(); asker.moved(); camera.position.z = 3; asker.updated(); expect(ask).toHaveBeenCalledTimes(1)
    })
    it('a failing ask never reaches the controls and is warned about once', () => {
        const { camera, ask, asker } = rig(); const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        ask.mockImplementation(() => { throw new Error('no renderer') })
        asker.moved(); camera.position.z = 4
        expect(() => asker.updated()).not.toThrow()
        camera.position.z = 3; expect(() => asker.settled('sleep')).not.toThrow()
        expect(warn).toHaveBeenCalledTimes(1)
    })
})
