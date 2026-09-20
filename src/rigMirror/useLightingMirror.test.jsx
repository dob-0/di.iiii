import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    DMX_POLL_MS,
    PATCH_POLL_MS,
    REPROBE_MS,
    createLightingMirror,
    useLightingDeskPresent,
    useLightingMirror
} from './useLightingMirror.js'

const jsonResponse = (body) => ({
    ok: true,
    status: 200,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json; charset=utf-8' : null) },
    json: async () => body
})
// What a hosted tier answers for an address it does not know: the app's own page, 200.
const htmlResponse = () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'text/html; charset=utf-8' },
    json: async () => { throw new Error('not json') }
})
const notFound = () => ({ ok: false, status: 404, headers: { get: () => 'application/json' }, json: async () => ({}) })

const PATCH = {
    fixtures: [
        { id: 'fx_a', index: 1, name: 'Back left', profile: 'drgb', universe: 0, address: 1, x: 0.2, y: 0.3 },
        { id: 'fx_b', index: 2, name: 'Wash', profile: 'rgbw', universe: 0, address: 5, x: 0.8, y: 0.6 }
    ],
    profiles: {
        drgb: { channels: ['dimmer', 'r', 'g', 'b'] },
        rgbw: { channels: ['r', 'g', 'b', 'w'] }
    },
    roleKinds: { emitter: ['r', 'g', 'b', 'w', 'a', 'y', 'warm', 'cool', 'uv', 'lime'] }
}

const makeDesk = () => {
    const desk = {
        calls: [],
        dmx: [255, 255, 120, 0, 200, 40, 0, 0],
        master: 255,
        blackout: false,
        patch: PATCH,
        up: true
    }
    desk.fetch = vi.fn(async (url, init) => {
        desk.calls.push({ url: String(url), method: init?.method || 'GET' })
        if (!desk.up) throw new TypeError('Failed to fetch')
        if (String(url).endsWith('/light/api/summary')) return jsonResponse({ master: desk.master, output: { enabled: false } })
        if (String(url).endsWith('/light/api/state')) return jsonResponse(desk.patch)
        if (String(url).endsWith('/light/api/dmx')) {
            return jsonResponse({ dmx: { 0: desk.blackout ? desk.dmx.map(() => 0) : desk.dmx }, master: desk.master, blackout: desk.blackout })
        }
        return notFound()
    })
    desk.count = (tail) => desk.calls.filter((c) => c.url.endsWith(tail)).length
    return desk
}

const fakeDocument = () => {
    const listeners = new Set()
    return {
        visibilityState: 'visible',
        addEventListener: (type, fn) => { if (type === 'visibilitychange') listeners.add(fn) },
        removeEventListener: (type, fn) => listeners.delete(fn),
        set(state) { this.visibilityState = state; for (const fn of [...listeners]) fn() }
    }
}

const settle = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }

describe('the lighting mirror', () => {
    let errorSpy
    let warnSpy
    beforeEach(() => {
        vi.useFakeTimers()
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    })
    afterEach(() => {
        vi.useRealTimers()
        errorSpy.mockRestore()
        warnSpy.mockRestore()
    })

    it('no desk: present false, asked once, then silent forever', async () => {
        const fetchImpl = vi.fn(async () => notFound())
        const mirror = createLightingMirror({ fetchImpl, doc: fakeDocument() })
        const { result } = renderHook(() => useLightingMirror({ mirror }))
        await settle()
        expect(result.current).toEqual({ present: false, fixtures: [], master: null, blackout: false })
        await settle(10 * 60 * 1000)
        expect(fetchImpl).toHaveBeenCalledTimes(1)
        expect(String(fetchImpl.mock.calls[0][0])).toMatch(/\/light\/api\/summary$/)
        expect(errorSpy).not.toHaveBeenCalled()
        expect(warnSpy).not.toHaveBeenCalled()
        mirror.dispose()
    })

    it('a refused connection is the same answer: no, and quiet', async () => {
        const fetchImpl = vi.fn(async () => { throw new TypeError('Failed to fetch') })
        const mirror = createLightingMirror({ fetchImpl, doc: fakeDocument() })
        const { result } = renderHook(() => useLightingMirror({ mirror }))
        await settle(5 * 60 * 1000)
        expect(result.current.present).toBe(false)
        expect(fetchImpl).toHaveBeenCalledTimes(1)
        expect(errorSpy).not.toHaveBeenCalled()
        mirror.dispose()
    })

    it('an html 200 is not a desk', async () => {
        const fetchImpl = vi.fn(async () => htmlResponse())
        const mirror = createLightingMirror({ fetchImpl, doc: fakeDocument() })
        const { result } = renderHook(() => useLightingMirror({ mirror }))
        await settle(60 * 1000)
        expect(result.current.present).toBe(false)
        expect(fetchImpl).toHaveBeenCalledTimes(1)
        mirror.dispose()
    })

    it('present: fixtures with the colour each is emitting, and it follows the desk', async () => {
        const desk = makeDesk()
        const mirror = createLightingMirror({ fetchImpl: desk.fetch, doc: fakeDocument() })
        const { result } = renderHook(() => useLightingMirror({ mirror }))
        await settle()
        await settle(DMX_POLL_MS)
        expect(result.current.present).toBe(true)
        expect(result.current.master).toBe(255)
        expect(result.current.blackout).toBe(false)
        expect(result.current.fixtures).toEqual([
            { id: 'fx_a', index: 1, name: 'Back left', x: 0.2, y: 0.3, colour: { r: 255, g: 120, b: 0 }, level: 1 },
            { id: 'fx_b', index: 2, name: 'Wash', x: 0.8, y: 0.6, colour: { r: 200, g: 40, b: 0 }, level: 0.784 }
        ])

        desk.dmx = [128, 255, 0, 0, 200, 40, 0, 0]
        await settle(DMX_POLL_MS * 2)
        expect(result.current.fixtures[0].colour).toEqual({ r: 128, g: 0, b: 0 })
        expect(result.current.fixtures[0].level).toBeCloseTo(0.502, 3)

        desk.blackout = true
        await settle(DMX_POLL_MS * 2)
        expect(result.current.blackout).toBe(true)
        expect(result.current.fixtures.map((f) => f.level)).toEqual([0, 0])
        mirror.dispose()
    })

    it('polls DMX at 10 Hz and the patch slowly, so a re-patch shows up', async () => {
        const desk = makeDesk()
        const mirror = createLightingMirror({ fetchImpl: desk.fetch, doc: fakeDocument() })
        const { result } = renderHook(() => useLightingMirror({ mirror }))
        await settle()
        const dmx0 = desk.count('/api/dmx')
        const state0 = desk.count('/api/state')
        await settle(1000)
        expect(desk.count('/api/dmx') - dmx0).toBe(10)
        expect(desk.count('/api/state') - state0).toBe(0)

        desk.patch = { ...PATCH, fixtures: [...PATCH.fixtures, { id: 'fx_c', index: 3, name: 'Dim', profile: 'gone', universe: 0, address: 20, x: 0.5, y: 0.5 }] }
        await settle(PATCH_POLL_MS)
        expect(result.current.fixtures.map((f) => f.id)).toEqual(['fx_a', 'fx_b', 'fx_c'])
        mirror.dispose()
    })

    it('never writes: every request is a GET', async () => {
        const desk = makeDesk()
        const mirror = createLightingMirror({ fetchImpl: desk.fetch, doc: fakeDocument() })
        renderHook(() => useLightingMirror({ mirror }))
        await settle(PATCH_POLL_MS * 2)
        expect(desk.calls.length).toBeGreaterThan(50)
        expect(desk.calls.every((c) => c.method === 'GET')).toBe(true)
        mirror.dispose()
    })

    it('a hidden tab pauses the polling and a visible one resumes it', async () => {
        const desk = makeDesk()
        const doc = fakeDocument()
        const mirror = createLightingMirror({ fetchImpl: desk.fetch, doc })
        renderHook(() => useLightingMirror({ mirror }))
        await settle(300)
        act(() => doc.set('hidden'))
        await settle()
        const paused = desk.calls.length
        await settle(30 * 1000)
        expect(desk.calls.length).toBe(paused)
        act(() => doc.set('visible'))
        await settle(500)
        expect(desk.calls.length).toBeGreaterThan(paused + 4)
        mirror.dispose()
    })

    it('the mirror switched off asks whether a desk is here and then nothing more', async () => {
        const desk = makeDesk()
        const mirror = createLightingMirror({ fetchImpl: desk.fetch, doc: fakeDocument() })
        const { result, rerender } = renderHook(({ enabled }) => useLightingMirror({ enabled, mirror }), { initialProps: { enabled: false } })
        await settle(20 * 1000)
        expect(result.current.present).toBe(true)
        expect(desk.calls.length).toBe(1)

        rerender({ enabled: true })
        await settle(300)
        expect(desk.count('/api/dmx')).toBeGreaterThan(1)

        rerender({ enabled: false })
        await settle()
        const after = desk.calls.length
        await settle(20 * 1000)
        expect(desk.calls.length).toBe(after)
        mirror.dispose()
    })

    it('several watchers are still one poll', async () => {
        const desk = makeDesk()
        const mirror = createLightingMirror({ fetchImpl: desk.fetch, doc: fakeDocument() })
        renderHook(() => useLightingMirror({ mirror }))
        renderHook(() => useLightingMirror({ mirror }))
        renderHook(() => useLightingMirror({ mirror }))
        await settle()
        const before = desk.count('/api/dmx')
        await settle(1000)
        expect(desk.count('/api/dmx') - before).toBe(10)
        expect(desk.count('/api/summary')).toBe(1)
        mirror.dispose()
    })

    it('a desk that goes away turns absent, and is asked again no faster than every 30 s', async () => {
        const desk = makeDesk()
        const mirror = createLightingMirror({ fetchImpl: desk.fetch, doc: fakeDocument() })
        const { result } = renderHook(() => useLightingMirror({ mirror }))
        await settle(300)
        expect(result.current.present).toBe(true)

        desk.up = false
        await settle(1000)
        expect(result.current).toEqual({ present: false, fixtures: [], master: null, blackout: false })
        const gone = desk.calls.length
        await settle(REPROBE_MS - 1500)
        expect(desk.calls.length).toBe(gone)
        await settle(REPROBE_MS * 3)
        expect(desk.calls.length - gone).toBeLessThanOrEqual(4)
        expect(desk.calls.slice(gone).every((c) => c.url.endsWith('/api/summary'))).toBe(true)

        desk.up = true
        await settle(REPROBE_MS + 500)
        expect(result.current.present).toBe(true)
        expect(result.current.fixtures).toHaveLength(2)
        expect(errorSpy).not.toHaveBeenCalled()
        mirror.dispose()
    })

    it('useLightingDeskPresent answers a boolean and does not start the poll', async () => {
        const desk = makeDesk()
        const mirror = createLightingMirror({ fetchImpl: desk.fetch, doc: fakeDocument() })
        const { result } = renderHook(() => useLightingDeskPresent({ mirror }))
        expect(result.current).toBe(false)
        await settle(5000)
        expect(result.current).toBe(true)
        expect(desk.calls.length).toBe(1)
        mirror.dispose()
    })
})

// Seen in dev, 2026-09-20: this module first lived at src/light/, Vite fetched it as
// /light/useLightingMirror.js, the dev proxy handed that to the lighting backend, and
// the Rig button never drew. No unit test noticed. This one does.
describe('no source folder sits under the /light dev proxy', () => {
    it('src/ has no top-level entry whose name starts with "light"', async () => {
        const { readdirSync } = await import('node:fs')
        const path = await import('node:path')
        const process = globalThis.process
        // vitest's root is src/
        const srcDir = path.resolve(process.cwd(), path.basename(process.cwd()) === 'src' ? '.' : 'src')
        expect(readdirSync(srcDir).filter((name) => name.startsWith('light'))).toEqual([])
    })
})
